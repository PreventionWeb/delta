import { describe, expect, it } from "vitest";
import type { CausalEdge } from "../../domain/CausalChain";
import type { ICausalChainRepository } from "./ICausalChainRepository";

/**
 * Fake conformance implementation (matches IHazardousEventRepository.test.ts's pattern).
 * findReachableEdgesFrom does a real forward BFS over the stored edges so the
 * reachable-vs-excluded scenarios are genuinely exercised.
 */
class FakeCausalChainRepository implements ICausalChainRepository {
	private edges: {
		edge: CausalEdge;
		causalityExplanation: string | null;
	}[] = [];

	async findReachableEdgesFrom(nodeId: string): Promise<readonly CausalEdge[]> {
		const adjacency = new Map<string, CausalEdge[]>();
		for (const { edge } of this.edges) {
			const existing = adjacency.get(edge.causeId);
			if (existing) {
				existing.push(edge);
			} else {
				adjacency.set(edge.causeId, [edge]);
			}
		}

		const visitedNodes = new Set<string>([nodeId]);
		const queue: string[] = [nodeId];
		const reachableEdges: CausalEdge[] = [];
		let head = 0;
		while (head < queue.length) {
			const current = queue[head++];
			for (const edge of adjacency.get(current) ?? []) {
				reachableEdges.push(edge);
				if (!visitedNodes.has(edge.effectId)) {
					visitedNodes.add(edge.effectId);
					queue.push(edge.effectId);
				}
			}
		}
		return reachableEdges;
	}

	async saveEdge(
		edge: CausalEdge,
		causalityExplanation: string | null,
	): Promise<void> {
		this.edges.push({ edge, causalityExplanation });
	}

	async replaceCauseEdge(
		effectId: string,
		newCause: { causeId: string; causalityExplanation: string | null } | null,
	): Promise<void> {
		this.edges = this.edges.filter(({ edge }) => edge.effectId !== effectId);
		if (newCause !== null) {
			this.edges.push({
				edge: { causeId: newCause.causeId, effectId },
				causalityExplanation: newCause.causalityExplanation,
			});
		}
	}

	async countEdgesTouching(nodeId: string): Promise<number> {
		return this.edges.filter(
			({ edge }) => edge.causeId === nodeId || edge.effectId === nodeId,
		).length;
	}

	all(): readonly { edge: CausalEdge; causalityExplanation: string | null }[] {
		return this.edges;
	}
}

describe("ICausalChainRepository conformance", () => {
	describe("findReachableEdgesFrom", () => {
		it("resolves an empty array for a node with no existing edges", async () => {
			const repo = new FakeCausalChainRepository();

			await expect(repo.findReachableEdgesFrom("solo-node")).resolves.toEqual(
				[],
			);
		});

		it("resolves the edges reachable forward from the given node", async () => {
			const repo = new FakeCausalChainRepository();
			await repo.saveEdge({ causeId: "A", effectId: "B" }, null);
			await repo.saveEdge({ causeId: "B", effectId: "C" }, null);

			const reachable = await repo.findReachableEdgesFrom("A");

			expect(reachable).toEqual([
				{ causeId: "A", effectId: "B" },
				{ causeId: "B", effectId: "C" },
			]);
		});

		it("terminates against pre-existing cyclic stored data, instead of looping forever", async () => {
			// Legacy cyclic data is a real precedent this port must not regress against (3c
			// design.md Context names the depth-10 event.ts bug this design exists to avoid).
			const repo = new FakeCausalChainRepository();
			await repo.saveEdge({ causeId: "A", effectId: "B" }, null);
			await repo.saveEdge({ causeId: "B", effectId: "A" }, null);

			const reachable = await repo.findReachableEdgesFrom("A");

			expect(reachable).toEqual([
				{ causeId: "A", effectId: "B" },
				{ causeId: "B", effectId: "A" },
			]);
		});

		it("excludes an edge that is not reachable from the given node", async () => {
			const repo = new FakeCausalChainRepository();
			await repo.saveEdge({ causeId: "A", effectId: "B" }, null);
			await repo.saveEdge({ causeId: "X", effectId: "Y" }, null);

			const reachable = await repo.findReachableEdgesFrom("A");

			expect(reachable).toEqual([{ causeId: "A", effectId: "B" }]);
			expect(reachable).not.toContainEqual({ causeId: "X", effectId: "Y" });
		});
	});

	describe("saveEdge", () => {
		it("persists a single edge with its explanation", async () => {
			const repo = new FakeCausalChainRepository();

			await repo.saveEdge({ causeId: "A", effectId: "B" }, "upstream flooding");

			expect(repo.all()).toEqual([
				{
					edge: { causeId: "A", effectId: "B" },
					causalityExplanation: "upstream flooding",
				},
			]);
		});

		it("persists a null explanation as null, not an empty string", async () => {
			const repo = new FakeCausalChainRepository();

			await repo.saveEdge({ causeId: "A", effectId: "B" }, null);

			expect(repo.all()[0].causalityExplanation).toBeNull();
		});

		it("persists two concurrent saveEdge calls for different edges independently", async () => {
			const repo = new FakeCausalChainRepository();

			await Promise.all([
				repo.saveEdge({ causeId: "A", effectId: "B" }, null),
				repo.saveEdge({ causeId: "C", effectId: "D" }, null),
			]);

			expect(repo.all().map((row) => row.edge)).toEqual(
				expect.arrayContaining([
					{ causeId: "A", effectId: "B" },
					{ causeId: "C", effectId: "D" },
				]),
			);
			expect(repo.all()).toHaveLength(2);
		});
	});

	describe("countEdgesTouching", () => {
		it("resolves zero for a node with no existing edges", async () => {
			const repo = new FakeCausalChainRepository();

			await expect(repo.countEdgesTouching("solo-node")).resolves.toBe(0);
		});

		it("counts a node that is only ever a cause", async () => {
			const repo = new FakeCausalChainRepository();
			await repo.saveEdge({ causeId: "A", effectId: "B" }, null);

			await expect(repo.countEdgesTouching("A")).resolves.toBe(1);
		});

		it("counts a node that is only ever an effect, unlike findReachableEdgesFrom's forward-only result for the same node", async () => {
			const repo = new FakeCausalChainRepository();
			await repo.saveEdge({ causeId: "A", effectId: "B" }, null);

			await expect(repo.countEdgesTouching("B")).resolves.toBe(1);
			await expect(repo.findReachableEdgesFrom("B")).resolves.toEqual([]);
		});

		it("resolves the total count for a node touched as both cause and effect", async () => {
			const repo = new FakeCausalChainRepository();
			await repo.saveEdge({ causeId: "A", effectId: "B" }, null);
			await repo.saveEdge({ causeId: "B", effectId: "C" }, null);

			await expect(repo.countEdgesTouching("B")).resolves.toBe(2);
		});

		it("excludes an edge that does not touch the given node", async () => {
			const repo = new FakeCausalChainRepository();
			await repo.saveEdge({ causeId: "A", effectId: "B" }, null);
			await repo.saveEdge({ causeId: "X", effectId: "Y" }, null);

			await expect(repo.countEdgesTouching("A")).resolves.toBe(1);
		});
	});

	describe("replaceCauseEdge", () => {
		it("atomically swaps an existing cause edge for a new one", async () => {
			const repo = new FakeCausalChainRepository();
			await repo.saveEdge({ causeId: "cause-1", effectId: "event-A" }, null);

			await repo.replaceCauseEdge("event-A", {
				causeId: "cause-2",
				causalityExplanation: null,
			});

			expect(repo.all()).toEqual([
				{
					edge: { causeId: "cause-2", effectId: "event-A" },
					causalityExplanation: null,
				},
			]);
		});

		it("clears the existing cause edge with no replacement when newCause is null", async () => {
			const repo = new FakeCausalChainRepository();
			await repo.saveEdge({ causeId: "cause-1", effectId: "event-A" }, null);

			await repo.replaceCauseEdge("event-A", null);

			expect(repo.all()).toEqual([]);
		});

		it("is a clean no-op for null, or a plain insert for a given cause, when no prior edge exists", async () => {
			const repo = new FakeCausalChainRepository();

			await expect(
				repo.replaceCauseEdge("event-A", null),
			).resolves.toBeUndefined();
			expect(repo.all()).toEqual([]);

			await repo.replaceCauseEdge("event-A", {
				causeId: "cause-1",
				causalityExplanation: null,
			});

			expect(repo.all()).toEqual([
				{
					edge: { causeId: "cause-1", effectId: "event-A" },
					causalityExplanation: null,
				},
			]);
		});

		it("leaves an edge unaffected when the given node appears only as its causeId", async () => {
			const repo = new FakeCausalChainRepository();
			await repo.saveEdge({ causeId: "B", effectId: "C" }, null);

			await repo.replaceCauseEdge("B", null);

			expect(repo.all()).toEqual([
				{ edge: { causeId: "B", effectId: "C" }, causalityExplanation: null },
			]);
		});
	});
});

// Tuple equality (not plain assignability), so a dropped/added param fails to compile (matches IHazardousEventRepository.test.ts).
type AssertEqual<A, B> = A extends B ? (B extends A ? true : never) : never;

const _findReachableEdgesFromArity: AssertEqual<
	Parameters<ICausalChainRepository["findReachableEdgesFrom"]>,
	[string]
> = true;
const _saveEdgeArity: AssertEqual<
	Parameters<ICausalChainRepository["saveEdge"]>,
	[CausalEdge, string | null]
> = true;
const _replaceCauseEdgeArity: AssertEqual<
	Parameters<ICausalChainRepository["replaceCauseEdge"]>,
	[string, { causeId: string; causalityExplanation: string | null } | null]
> = true;
const _countEdgesTouchingArity: AssertEqual<
	Parameters<ICausalChainRepository["countEdgesTouching"]>,
	[string]
> = true;

void _findReachableEdgesFromArity;
void _saveEdgeArity;
void _replaceCauseEdgeArity;
void _countEdgesTouchingArity;
