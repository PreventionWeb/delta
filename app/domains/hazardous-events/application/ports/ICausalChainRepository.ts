import type { CausalEdge } from "../../domain/CausalChain";
import type { Tx } from "~/db.server";

/** Port for `hazardous_event_causality`. No whole-table load (design.md Decision 2). */
export interface ICausalChainRepository {
	/** MUST resolve the complete set or reject (a partial set misreports "no cycle"). Not
	 * tenant-scoped — the table has no tenant column of its own (`DEF-012`). */
	findReachableEdgesFrom(nodeId: string): Promise<readonly CausalEdge[]>;

	/** FK/CHECK constraints guard a dangling/self-referencing edge; this also re-verifies,
	 * lock-guarded and in-transaction, that the edge won't close a cycle — rejects with
	 * `ConflictError` on conflict (closes `DEF-030` Race 1). */
	saveEdge(
		edge: CausalEdge,
		causalityExplanation: string | null,
		tx?: Tx,
	): Promise<void>;

	/** Atomically replaces every cause edge for `effectId` with `newCause` (`null` clears it),
	 * cycle-rechecked, as one transaction. Authoritative guard against `DEF-030`; a caller's own
	 * prior cycle check is advisory only. */
	replaceCauseEdge(
		effectId: string,
		newCause: { causeId: string; causalityExplanation: string | null } | null,
		tx?: Tx,
	): Promise<void>;

	/** Counts every edge touching nodeId as cause or effect. Not tenant-scoped (matches this
	 * port's other methods). */
	countEdgesTouching(nodeId: string, tx?: Tx): Promise<number>;
}
