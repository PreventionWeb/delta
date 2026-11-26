import type { Tx } from "~/db.server";

/**
 * `tx` lets a caller holding an open transaction read on it (NOD-12).
 * Tenant-scoped membership lookups against `hazard_driver`/`hazard_type_custom_field_definition`,
 * feeding `HazardousEvent.create()`'s mandatory valid-id-set parameters.
 */
export interface IHazardTaxonomyRepository {
	/** Subset of `ids` present in `hazard_driver` under `tenantId` — feeds
	 * `HazardousEvent.create()`'s `validHazardDriverIds` parameter (DEF-021). */
	findValidHazardDriverIds(
		ids: readonly string[],
		tenantId: string,
		tx?: Tx,
	): Promise<ReadonlySet<string>>;

	/** Same contract as `findValidHazardDriverIds`, against `hazard_type_custom_field_definition`. */
	findValidCustomFieldDefinitionIds(
		ids: readonly string[],
		tenantId: string,
		tx?: Tx,
	): Promise<ReadonlySet<string>>;
}
