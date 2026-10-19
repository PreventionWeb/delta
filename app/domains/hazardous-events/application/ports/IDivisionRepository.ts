/**
 * Tenant-scoped membership lookup against the shared `division` reference table,
 * feeding `SpatialObservation.create()`'s mandatory `validDivisionIds` parameter.
 */
export interface IDivisionRepository {
	/** Subset of `ids` present in `division` under `tenantId`*/
	findValidDivisionIds(
		ids: readonly string[],
		tenantId: string,
	): Promise<ReadonlySet<string>>;
}
