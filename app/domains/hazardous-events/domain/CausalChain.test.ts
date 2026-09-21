import { describe, expect, it } from "vitest";
import { ConflictError, ValidationError } from "~/shared/errors";
import {
	assertCausalLinkDoesNotCreateCycle,
	CAUSAL_CHAIN_TRAVERSAL_CAP,
	type CausalEdge,
} from "./CausalChain";

/**
 * Builds a linear chain of `nodeCount` nodes (`nodeCount - 1` edges): n0 -> n1 -> ... -> n(nodeCount - 1).
 * Avoids hand-written large fixtures so the exact node count stays provable (design.md Decision 4 / tasks.md 1.1).
 */
function buildLinearChain(nodeCount: number): CausalEdge[] {
	const edges: CausalEdge[] = [];
	for (let i = 0; i < nodeCount - 1; i++) {
		edges.push({ causeId: `n${i}`, effectId: `n${i + 1}` });
	}
	return edges;
}

/** Deep-freezes an edge array and its edge objects, to assert the function never mutates its input. */
function deepFreezeEdges(edges: CausalEdge[]): readonly CausalEdge[] {
	for (const edge of edges) Object.freeze(edge);
	return Object.freeze(edges);
}

describe("Reject a causal link that would close a cycle of any length", () => {
	it("returns normally for a long acyclic chain of 50 nodes extended by one more node", () => {
		const existingEdges = buildLinearChain(50); // n0 -> n1 -> ... -> n49

		expect(() =>
			assertCausalLinkDoesNotCreateCycle(existingEdges, "n49", "n50"),
		).not.toThrow();
	});

	it("throws ConflictError for a 20-node chain closed into a cycle (mirrors the legacy depth-10-cap failure shape)", () => {
		const existingEdges = buildLinearChain(20); // n0 -> n1 -> ... -> n19

		let caught: unknown;
		try {
			assertCausalLinkDoesNotCreateCycle(existingEdges, "n19", "n0");
		} catch (error) {
			caught = error;
		}

		expect(caught).toBeInstanceOf(ConflictError);
		expect((caught as ConflictError).message).toMatch(/close a cycle/);
		expect((caught as ConflictError).context).toMatchObject({
			causeId: "n19",
			effectId: "n0",
		});
	});

	it("throws ConflictError when a cycle is only reachable through a branching graph, not a single linear chain", () => {
		// p branches to q and r, converging on s -> t; effectId "p" reaches causeId "t" only via that branch-and-converge shape.
		const existingEdges: CausalEdge[] = [
			{ causeId: "p", effectId: "q" },
			{ causeId: "p", effectId: "r" },
			{ causeId: "q", effectId: "s" },
			{ causeId: "r", effectId: "s" },
			{ causeId: "s", effectId: "t" },
		];

		expect(() =>
			assertCausalLinkDoesNotCreateCycle(existingEdges, "t", "p"),
		).toThrow(ConflictError);
	});

	it("returns normally when existingEdges are entirely disconnected from the proposed causeId and effectId", () => {
		const existingEdges: CausalEdge[] = [
			{ causeId: "x", effectId: "y" },
			{ causeId: "y", effectId: "z" },
		];

		expect(() =>
			assertCausalLinkDoesNotCreateCycle(existingEdges, "m1", "m2"),
		).not.toThrow();
	});

	it("throws ConflictError when a cycle is only reachable through a causeId node's second registered outgoing edge", () => {
		// "a" has two outgoing edges (a->b, a->c); the cycle only closes via the second one
		// (a->c->target). Pins that buildForwardAdjacency keeps every edge per causeId, not just
		// the first (Gate 3.11 finding: a dropped second edge silently missed this cycle).
		const existingEdges: CausalEdge[] = [
			{ causeId: "a", effectId: "b" },
			{ causeId: "a", effectId: "c" },
			{ causeId: "c", effectId: "target" },
		];

		expect(() =>
			assertCausalLinkDoesNotCreateCycle(existingEdges, "target", "a"),
		).toThrow(ConflictError);
	});
});

describe("Reject the trivial 1-length self-cause case at the domain layer", () => {
	it("throws ConflictError when causeId and effectId are the same value, even with existingEdges empty", () => {
		let caught: unknown;
		try {
			assertCausalLinkDoesNotCreateCycle([], "event-1", "event-1");
		} catch (error) {
			caught = error;
		}

		expect(caught).toBeInstanceOf(ConflictError);
		expect((caught as ConflictError).message).toMatch(/own cause and effect/);
		expect((caught as ConflictError).context).toMatchObject({
			causeId: "event-1",
			effectId: "event-1",
		});
	});
});

describe("A safety cap bounds traversal without being usable as the detection mechanism", () => {
	it("throws ConflictError, not a cap-exceeded error, when a cycle is confirmed well under the cap", () => {
		// 100-node cycle resolves at n99, far below CAUSAL_CHAIN_TRAVERSAL_CAP -- must report as a confirmed cycle, not cap-exceeded.
		const existingEdges = buildLinearChain(100); // n0 -> n1 -> ... -> n99

		expect(() =>
			assertCausalLinkDoesNotCreateCycle(existingEdges, "n99", "n0"),
		).toThrow(ConflictError);

		// Explicit negative check: the two error types must be structurally distinguishable, not just differently worded.
		let caught: unknown;
		try {
			assertCausalLinkDoesNotCreateCycle(existingEdges, "n99", "n0");
		} catch (error) {
			caught = error;
		}
		expect(caught).not.toBeInstanceOf(ValidationError);
	});

	it("throws ValidationError, distinct from ConflictError, when traversal would need to visit more nodes than the cap before resolving", () => {
		// nodeCount = cap + 1 nodes reachable from effectId, causeId never among them, so traversal must fail closed on the cap rather than exhaust or find a cycle.
		const existingEdges = buildLinearChain(CAUSAL_CHAIN_TRAVERSAL_CAP + 1);

		// toThrow(ValidationError) already implies not-ConflictError; kept explicit since that distinction is the entire point of Decision 5.
		expect(() =>
			assertCausalLinkDoesNotCreateCycle(
				existingEdges,
				"node-not-in-chain",
				"n0",
			),
		).toThrow(ValidationError);

		let caught: unknown;
		try {
			assertCausalLinkDoesNotCreateCycle(
				existingEdges,
				"node-not-in-chain",
				"n0",
			);
		} catch (error) {
			caught = error;
		}
		expect(caught).not.toBeInstanceOf(ConflictError);
		expect(caught).toBeInstanceOf(ValidationError);
		expect((caught as ValidationError).message).toMatch(/safety cap/);
		expect((caught as ValidationError).context).toMatchObject({
			causeId: "node-not-in-chain",
			effectId: "n0",
			cap: CAUSAL_CHAIN_TRAVERSAL_CAP,
		});
	});

	it("throws ConflictError, not ValidationError, when the cycle-closing node is exactly the one the cap would otherwise block", () => {
		// causeId "n500" is the node that would be the (cap + 1)th visited -- pins that the cycle
		// check runs before the cap check, not after (Gate 8 finding: no prior test discriminated this).
		const existingEdges = buildLinearChain(CAUSAL_CHAIN_TRAVERSAL_CAP + 1);

		expect(() =>
			assertCausalLinkDoesNotCreateCycle(existingEdges, "n500", "n0"),
		).toThrow(ConflictError);
	});

	it("returns normally when traversal from effectId visits exactly CAUSAL_CHAIN_TRAVERSAL_CAP distinct nodes and exhausts", () => {
		// nodeCount = cap nodes reachable from effectId ("n0"), causeId never among them, so traversal exhausts exactly at the cap boundary without exceeding it.
		const existingEdges = buildLinearChain(CAUSAL_CHAIN_TRAVERSAL_CAP);

		expect(() =>
			assertCausalLinkDoesNotCreateCycle(
				existingEdges,
				"node-not-in-chain",
				"n0",
			),
		).not.toThrow();
	});
});

describe("Traversal never re-processes an already-visited node", () => {
	it("terminates without hanging when existingEdges contains a cycle unrelated to causeId", () => {
		// "a" and "b" cycle back to each other, unrelated to the proposed causeId. Without the
		// already-visited skip, traversal would re-enqueue a/b forever -- visited.size stops growing
		// once both are counted, so the cap alone can't bound this loop (Gate 3.11 finding).
		const existingEdges: CausalEdge[] = [
			{ causeId: "e", effectId: "a" },
			{ causeId: "a", effectId: "b" },
			{ causeId: "b", effectId: "a" },
		];

		expect(() =>
			assertCausalLinkDoesNotCreateCycle(
				existingEdges,
				"unrelated-target",
				"e",
			),
		).not.toThrow();
	});
});

describe("Concurrent invocation has no shared-state hazard", () => {
	it("resolves two concurrent calls with independent arguments according to each call's own outcome, without mutating either existingEdges array", async () => {
		const acyclicEdges = deepFreezeEdges(buildLinearChain(10)); // n0 -> n1 -> ... -> n9
		const cyclicEdges = deepFreezeEdges(buildLinearChain(10)); // n0 -> n1 -> ... -> n9

		const acyclicSnapshotBefore = JSON.stringify(acyclicEdges);
		const cyclicSnapshotBefore = JSON.stringify(cyclicEdges);

		const [acyclicResult, cyclicResult] = await Promise.allSettled([
			Promise.resolve().then(() =>
				assertCausalLinkDoesNotCreateCycle(acyclicEdges, "n9", "n10"),
			),
			Promise.resolve().then(() =>
				assertCausalLinkDoesNotCreateCycle(cyclicEdges, "n9", "n0"),
			),
		]);

		expect(acyclicResult.status).toBe("fulfilled");
		expect(cyclicResult.status).toBe("rejected");
		if (cyclicResult.status === "rejected") {
			expect(cyclicResult.reason).toBeInstanceOf(ConflictError);
		}

		// Decision 6 / concurrency note: a pure function must never mutate the caller's existingEdges, regardless of outcome.
		expect(JSON.stringify(acyclicEdges)).toBe(acyclicSnapshotBefore);
		expect(JSON.stringify(cyclicEdges)).toBe(cyclicSnapshotBefore);
	});
});
