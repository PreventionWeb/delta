import "../setup";
import { describe, it, expect } from "vitest";
import { dr } from "~/db.server";
import { hazardousEventCausalityTable } from "~/domains/hazardous-events/infrastructure/hazardousEventCausalityTable";
import { DrizzleCausalChainRepository } from "~/domains/hazardous-events/infrastructure/DrizzleCausalChainRepository.server";
import { eq } from "drizzle-orm";
import { ConflictError, ValidationError } from "~/shared/errors";
import { seedHazardousEvent } from "../models/hazardousEventTestHelpers";

/** A real hazardous_event row id — hazardous_event_causality's FK requires one to exist. */
async function seedNode(): Promise<string> {
	const { id } = await seedHazardousEvent();
	return id;
}

async function insertEdge(
	causeId: string,
	effectId: string,
	causalityExplanation: string | null = null,
): Promise<void> {
	await dr.insert(hazardousEventCausalityTable).values({
		causeHazardousEventId: causeId,
		effectHazardousEventId: effectId,
		causalityExplanation,
	});
}

describe("DrizzleCausalChainRepository", () => {
	describe("findReachableEdgesFrom", () => {
		it("resolves an empty array for a node with no existing edges", async () => {
			const node = await seedNode();
			const repo = new DrizzleCausalChainRepository(dr);

			await expect(repo.findReachableEdgesFrom(node)).resolves.toEqual([]);
		});

		it("resolves the edges reachable forward from a node", async () => {
			const [a, b, c] = await Promise.all([seedNode(), seedNode(), seedNode()]);
			await insertEdge(a, b);
			await insertEdge(b, c);
			const repo = new DrizzleCausalChainRepository(dr);

			const reachable = await repo.findReachableEdgesFrom(a);

			expect(reachable).toEqual(
				expect.arrayContaining([
					{ causeId: a, effectId: b },
					{ causeId: b, effectId: c },
				]),
			);
			expect(reachable).toHaveLength(2);
		});

		it("excludes an edge that is not reachable from the given node", async () => {
			const [a, b, x, y] = await Promise.all([
				seedNode(),
				seedNode(),
				seedNode(),
				seedNode(),
			]);
			await insertEdge(a, b);
			await insertEdge(x, y);
			const repo = new DrizzleCausalChainRepository(dr);

			const reachable = await repo.findReachableEdgesFrom(a);

			expect(reachable).toEqual([{ causeId: a, effectId: b }]);
		});

		it("terminates against pre-existing cyclic stored data instead of looping forever", async () => {
			// Cyclic data seeded via direct insert, bypassing the port — the DB's own CHECK
			// constraint only blocks the trivial 1-length self-reference (design.md Decision 2).
			const [a, b] = await Promise.all([seedNode(), seedNode()]);
			await insertEdge(a, b);
			await insertEdge(b, a);
			const repo = new DrizzleCausalChainRepository(dr);

			const reachable = await repo.findReachableEdgesFrom(a);

			expect(reachable).toEqual(
				expect.arrayContaining([
					{ causeId: a, effectId: b },
					{ causeId: b, effectId: a },
				]),
			);
			expect(reachable).toHaveLength(2);
		});

		it("rejects with ValidationError rather than truncating when the adapter's row bound would be exceeded", async () => {
			// Chain of 3 raw edges against a bound of 2: LIMIT (bound + 1) = 3 fetches all 3,
			// so rawRows.length (3) > bound (2) — the fail-closed path, not a silent truncation.
			const [a, b, c, d] = await Promise.all([
				seedNode(),
				seedNode(),
				seedNode(),
				seedNode(),
			]);
			await insertEdge(a, b);
			await insertEdge(b, c);
			await insertEdge(c, d);
			const repo = new DrizzleCausalChainRepository(dr, 2);

			await expect(repo.findReachableEdgesFrom(a)).rejects.toThrow(
				ValidationError,
			);
		});

		// Confirms the off-by-one boundary (`LIMIT adapterRowBound + 1`, design.md Decision 2): a
		// raw-row count exactly at the bound must resolve, not be mistaken for the truncated case
		// above.
		it("resolves the full result, without throwing, when raw traversal rows land exactly at the adapter's row bound", async () => {
			const [a, b, c] = await Promise.all([seedNode(), seedNode(), seedNode()]);
			await insertEdge(a, b);
			await insertEdge(b, c);
			const repo = new DrizzleCausalChainRepository(dr, 2);

			await expect(repo.findReachableEdgesFrom(a)).resolves.toEqual(
				expect.arrayContaining([
					{ causeId: a, effectId: b },
					{ causeId: b, effectId: c },
				]),
			);
		});
	});

	describe("saveEdge", () => {
		it("rejects with ValidationError, not a raw driver error, when causeId does not reference an existing hazardous_event row", async () => {
			const effect = await seedNode();
			const repo = new DrizzleCausalChainRepository(dr);

			await expect(
				repo.saveEdge({ causeId: crypto.randomUUID(), effectId: effect }, null),
			).rejects.toThrow(ValidationError);
		});

		it("persists two concurrent saveEdge calls for different, non-conflicting edges independently", async () => {
			const [a, b, c, d] = await Promise.all([
				seedNode(),
				seedNode(),
				seedNode(),
				seedNode(),
			]);
			const repo = new DrizzleCausalChainRepository(dr);

			await Promise.all([
				repo.saveEdge({ causeId: a, effectId: b }, null),
				repo.saveEdge({ causeId: c, effectId: d }, null),
			]);

			const rows = await dr
				.select()
				.from(hazardousEventCausalityTable)
				.where(eq(hazardousEventCausalityTable.causeHazardousEventId, a));
			expect(rows).toHaveLength(1);
			const otherRows = await dr
				.select()
				.from(hazardousEventCausalityTable)
				.where(eq(hazardousEventCausalityTable.causeHazardousEventId, c));
			expect(otherRows).toHaveLength(1);
		});

		// Mandatory concurrent-callers test (DEF-030 Race 1): must be confirmed red — both calls
		// succeeding, leaving a 2-node cycle — before the lock-guarded implementation is written.
		it("does not let two concurrent calls jointly close a two-node cycle", async () => {
			const [a, b] = await Promise.all([seedNode(), seedNode()]);
			const repo = new DrizzleCausalChainRepository(dr);

			const outcomes = await Promise.allSettled([
				repo.saveEdge({ causeId: a, effectId: b }, null),
				repo.saveEdge({ causeId: b, effectId: a }, null),
			]);

			const fulfilled = outcomes.filter((o) => o.status === "fulfilled");
			const rejected = outcomes.filter((o) => o.status === "rejected");
			expect(fulfilled).toHaveLength(1);
			expect(rejected).toHaveLength(1);
			expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
				ConflictError,
			);
		});
	});

	describe("replaceCauseEdge", () => {
		it("atomically swaps an existing cause edge for a new one", async () => {
			const [cause1, cause2, effect] = await Promise.all([
				seedNode(),
				seedNode(),
				seedNode(),
			]);
			await insertEdge(cause1, effect);
			const repo = new DrizzleCausalChainRepository(dr);

			await repo.replaceCauseEdge(effect, {
				causeId: cause2,
				causalityExplanation: null,
			});

			const rows = await dr
				.select()
				.from(hazardousEventCausalityTable)
				.where(eq(hazardousEventCausalityTable.effectHazardousEventId, effect));
			expect(rows).toHaveLength(1);
			expect(rows[0].causeHazardousEventId).toBe(cause2);
		});

		it("clears the existing cause edge with no replacement when newCause is null", async () => {
			const [cause1, effect] = await Promise.all([seedNode(), seedNode()]);
			await insertEdge(cause1, effect);
			const repo = new DrizzleCausalChainRepository(dr);

			await repo.replaceCauseEdge(effect, null);

			const rows = await dr
				.select()
				.from(hazardousEventCausalityTable)
				.where(eq(hazardousEventCausalityTable.effectHazardousEventId, effect));
			expect(rows).toHaveLength(0);
		});

		it("is a clean no-op for null, or a plain insert for a given cause, when no prior edge exists", async () => {
			const [cause1, effect] = await Promise.all([seedNode(), seedNode()]);
			const repo = new DrizzleCausalChainRepository(dr);

			await expect(
				repo.replaceCauseEdge(effect, null),
			).resolves.toBeUndefined();
			let rows = await dr
				.select()
				.from(hazardousEventCausalityTable)
				.where(eq(hazardousEventCausalityTable.effectHazardousEventId, effect));
			expect(rows).toHaveLength(0);

			await repo.replaceCauseEdge(effect, {
				causeId: cause1,
				causalityExplanation: null,
			});
			rows = await dr
				.select()
				.from(hazardousEventCausalityTable)
				.where(eq(hazardousEventCausalityTable.effectHazardousEventId, effect));
			expect(rows).toHaveLength(1);
			expect(rows[0].causeHazardousEventId).toBe(cause1);
		});

		// Mandatory concurrent-callers test (DEF-030 Race 2) — must be confirmed red (two
		// surviving rows) before the lock-guarded implementation is written.
		it("leaves exactly one cause edge, never two, for two concurrent calls on the same effect", async () => {
			const [causeX, causeY, effect] = await Promise.all([
				seedNode(),
				seedNode(),
				seedNode(),
			]);
			const repo = new DrizzleCausalChainRepository(dr);

			await Promise.all([
				repo.replaceCauseEdge(effect, {
					causeId: causeX,
					causalityExplanation: null,
				}),
				repo.replaceCauseEdge(effect, {
					causeId: causeY,
					causalityExplanation: null,
				}),
			]);

			const rows = await dr
				.select()
				.from(hazardousEventCausalityTable)
				.where(eq(hazardousEventCausalityTable.effectHazardousEventId, effect));
			expect(rows).toHaveLength(1);
		});
	});

	describe("countEdgesTouching", () => {
		it("resolves zero for an untouched node", async () => {
			const node = await seedNode();
			const repo = new DrizzleCausalChainRepository(dr);

			await expect(repo.countEdgesTouching(node)).resolves.toBe(0);
		});

		it("counts a node that is only ever a cause", async () => {
			const [a, b] = await Promise.all([seedNode(), seedNode()]);
			await insertEdge(a, b);
			const repo = new DrizzleCausalChainRepository(dr);

			await expect(repo.countEdgesTouching(a)).resolves.toBe(1);
		});

		it("counts a node that is only ever an effect, unlike findReachableEdgesFrom's forward-only result for the same node", async () => {
			const [a, b] = await Promise.all([seedNode(), seedNode()]);
			await insertEdge(a, b);
			const repo = new DrizzleCausalChainRepository(dr);

			await expect(repo.countEdgesTouching(b)).resolves.toBe(1);
			await expect(repo.findReachableEdgesFrom(b)).resolves.toEqual([]);
		});

		it("resolves the total count for a node touched as both cause and effect", async () => {
			const [a, b, c] = await Promise.all([seedNode(), seedNode(), seedNode()]);
			await insertEdge(a, b);
			await insertEdge(b, c);
			const repo = new DrizzleCausalChainRepository(dr);

			await expect(repo.countEdgesTouching(b)).resolves.toBe(2);
		});

		it("excludes an edge that does not touch the given node", async () => {
			const [a, b, x, y] = await Promise.all([
				seedNode(),
				seedNode(),
				seedNode(),
				seedNode(),
			]);
			await insertEdge(a, b);
			await insertEdge(x, y);
			const repo = new DrizzleCausalChainRepository(dr);

			await expect(repo.countEdgesTouching(a)).resolves.toBe(1);
		});
	});
});
