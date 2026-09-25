import type { CausalEdge } from "../../domain/CausalChain";

/** Port for `hazardous_event_causality`. No whole-table load (design.md Decision 2). */
export interface ICausalChainRepository {
	/**
	 * MUST resolve the complete set or reject: a partial set lets the caller's
	 * BFS misreport "no cycle". Not tenant-scoped: `hazardous_event_causality`
	 * has no tenant column of its own (`DEF-012`) — callers must not assume pre-filtering.
	 */
	findReachableEdgesFrom(nodeId: string): Promise<readonly CausalEdge[]>;

	/** `hazardous_event_causality`'s own FK/CHECK constraints are the authoritative guard against
	 * a dangling or self-referencing edge; this method does not re-validate. */
	saveEdge(
		edge: CausalEdge,
		causalityExplanation: string | null,
	): Promise<void>;
}
