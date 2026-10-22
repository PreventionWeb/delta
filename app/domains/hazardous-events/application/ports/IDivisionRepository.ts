import type { Tx } from "~/db.server";

/**
 * Tenant-scoped membership lookup against the shared `division` reference table,
 * feeding `SpatialObservation.create()`'s mandatory `validDivisionIds` parameter.
 */
export interface IDivisionRepository {
	/** Subset of `ids` present in `division` under `tenantId`; `tx` avoids mixing connections when nested in a caller's own open transaction. */
	findValidDivisionIds(
		ids: readonly string[],
		tenantId: string,
		tx?: Tx,
	): Promise<ReadonlySet<string>>;
}
