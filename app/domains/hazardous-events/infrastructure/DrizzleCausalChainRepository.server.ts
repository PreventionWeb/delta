import { Injectable, Inject } from "@nestjs/common";
import { eq, sql } from "drizzle-orm";
import type { Dr, Tx } from "~/db.server";
import { DRIZZLE_CLIENT } from "~/infrastructure/DrizzleProvider.server";
import { pgErrorCode } from "~/infrastructure/pgErrorCode.server";
import { ValidationError } from "~/shared/errors";
import {
	assertCausalLinkDoesNotCreateCycle,
	type CausalEdge,
} from "../domain/CausalChain";
import type { ICausalChainRepository } from "../application/ports/ICausalChainRepository";
import { hazardousEventCausalityTable } from "./hazardousEventCausalityTable";

/** Matches CausalChain.ts's own exported-for-testability precedent (design.md Decision 1). */
export const DEFAULT_ADAPTER_ROW_BOUND = 5000;

interface RawCausalEdgeRow {
	cause_id: string;
	effect_id: string;
}

function dedupeByCauseEffectPair(
	rows: readonly RawCausalEdgeRow[],
): readonly CausalEdge[] {
	const byPair = new Map<string, CausalEdge>();
	for (const row of rows) {
		byPair.set(`${row.cause_id}:${row.effect_id}`, {
			causeId: row.cause_id,
			effectId: row.effect_id,
		});
	}
	return [...byPair.values()];
}

@Injectable()
export class DrizzleCausalChainRepository implements ICausalChainRepository {
	constructor(
		@Inject(DRIZZLE_CLIENT) private readonly db: Dr,
		private readonly adapterRowBound: number = DEFAULT_ADAPTER_ROW_BOUND,
	) {}

	/** Path-array `WITH RECURSIVE` (design.md Decision 2): `is_revisit` marks a row whose
	 * `effect_id` already appeared in its own path, so it's still emitted (both edges of a cycle
	 * survive) but excluded from further recursion. `executor` is parameterized so
	 * saveEdge/replaceCauseEdge can recheck inside their own transaction. */
	private async queryReachableEdges(
		executor: Tx,
		nodeId: string,
	): Promise<readonly CausalEdge[]> {
		const result = await executor.execute(sql`
			WITH RECURSIVE reachable(cause_id, effect_id, path, is_revisit) AS (
				SELECT cause_hazardous_event_id, effect_hazardous_event_id,
				       ARRAY[${nodeId}::uuid, effect_hazardous_event_id], false
				FROM hazardous_event_causality
				WHERE cause_hazardous_event_id = ${nodeId}::uuid

				UNION ALL

				SELECT c.cause_hazardous_event_id, c.effect_hazardous_event_id,
				       r.path || c.effect_hazardous_event_id,
				       c.effect_hazardous_event_id = ANY(r.path)
				FROM hazardous_event_causality c
				JOIN reachable r ON c.cause_hazardous_event_id = r.effect_id
				WHERE r.is_revisit = false
			)
			SELECT cause_id, effect_id FROM reachable
			LIMIT ${this.adapterRowBound + 1}
		`);

		// db.execute() returns untyped raw rows; narrowed here to this query's own known projection.
		const rawRows = result.rows as unknown as RawCausalEdgeRow[];
		// Raw (pre-dedupe) count — fails closed on cost, never truncates silently. LIMIT is
		// bound + 1 so exactly-at-bound is distinguishable from truncated.
		if (rawRows.length > this.adapterRowBound) {
			throw new ValidationError(
				"Causal chain traversal exceeded the adapter's row bound before it could be resolved",
				{ nodeId, adapterRowBound: this.adapterRowBound },
			);
		}
		return dedupeByCauseEffectPair(rawRows);
	}

	async findReachableEdgesFrom(nodeId: string): Promise<readonly CausalEdge[]> {
		return this.queryReachableEdges(this.db, nodeId);
	}

	/** Sorted lock order prevents deadlock between two calls on the same node pair (design.md
	 * Decision 4); acquired before the recheck so it never misses a just-committed conflict. */
	private async acquireSortedLocks(
		tx: Tx,
		ids: readonly string[],
	): Promise<void> {
		for (const id of [...new Set(ids)].sort()) {
			await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${id})::int)`);
		}
	}

	/** Shared saveEdge/replaceCauseEdge recheck: re-queries within `tx`, then defers to the
	 * domain's own `assertCausalLinkDoesNotCreateCycle` — not a duplicate check. */
	private async assertNoCycleInTx(
		tx: Tx,
		causeId: string,
		effectId: string,
	): Promise<void> {
		const reachableFromEffect = await this.queryReachableEdges(tx, effectId);
		assertCausalLinkDoesNotCreateCycle(reachableFromEffect, causeId, effectId);
	}

	/** Maps an FK violation to a typed error (same pattern as `DrizzleWorkflowRepository.server.ts`)
	 * — covers the race window between a use case's findById check and this insert. */
	private mapInsertError(
		err: unknown,
		context: { causeId: string; effectId: string },
	): never {
		if (pgErrorCode(err) === "23503") {
			throw new ValidationError(
				"CausalEdge references a nonexistent cause or effect hazardous event id",
				context,
			);
		}
		throw err;
	}

	private async insertEdge(
		tx: Tx,
		causeId: string,
		effectId: string,
		causalityExplanation: string | null,
	): Promise<void> {
		try {
			await tx.insert(hazardousEventCausalityTable).values({
				causeHazardousEventId: causeId,
				effectHazardousEventId: effectId,
				causalityExplanation,
			});
		} catch (err) {
			this.mapInsertError(err, { causeId, effectId });
		}
	}

	async saveEdge(
		edge: CausalEdge,
		causalityExplanation: string | null,
	): Promise<void> {
		await this.db.transaction(async (tx) => {
			await this.acquireSortedLocks(tx, [edge.causeId, edge.effectId]);
			await this.assertNoCycleInTx(tx, edge.causeId, edge.effectId);
			await this.insertEdge(
				tx,
				edge.causeId,
				edge.effectId,
				causalityExplanation,
			);
		});
	}

	async replaceCauseEdge(
		effectId: string,
		newCause: { causeId: string; causalityExplanation: string | null } | null,
	): Promise<void> {
		await this.db.transaction(async (tx) => {
			// Only effectId when clearing — there's no second node to pair with a null cause.
			const lockIds =
				newCause !== null ? [effectId, newCause.causeId] : [effectId];
			await this.acquireSortedLocks(tx, lockIds);

			await tx
				.delete(hazardousEventCausalityTable)
				.where(
					eq(hazardousEventCausalityTable.effectHazardousEventId, effectId),
				);

			if (newCause === null) {
				return;
			}
			// Skipped entirely when clearing — nothing to check a clear against.
			await this.assertNoCycleInTx(tx, newCause.causeId, effectId);
			await this.insertEdge(
				tx,
				newCause.causeId,
				effectId,
				newCause.causalityExplanation,
			);
		});
	}

	async countEdgesTouching(nodeId: string): Promise<number> {
		const result = await this.db.execute(sql`
			SELECT COUNT(*)::int AS count
			FROM hazardous_event_causality
			WHERE cause_hazardous_event_id = ${nodeId}::uuid
			   OR effect_hazardous_event_id = ${nodeId}::uuid
		`);
		// Same untyped-raw-row narrowing as queryReachableEdges — this query's own known projection.
		return (result.rows[0] as unknown as { count: number }).count;
	}
}
