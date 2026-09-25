import { describe, expect, it } from "vitest";
import type { CausalEdge } from "../../domain/CausalChain";
import type { ICausalChainRepository } from "./ICausalChainRepository";

/**
 * Fake conformance implementation (matches IHazardousEventRepository.test.ts's pattern).
 * findReachableEdgesFrom does a real forward BFS over the stored edges so the
 * reachable-vs-excluded scenarios are genuinely exercised.
 */
class FakeCausalChainRepository implements ICausalChainRepository {
	private readonly edges: {
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

void _findReachableEdgesFromArity;
void _saveEdgeArity;
