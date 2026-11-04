import type { Tx } from "~/db.server";

export interface HipCrosswalkIds {
	readonly hipHazardId: string | null;
	readonly hipClusterId: string | null;
	readonly hipTypeId: string | null;
}

/** TEMPORARY migration-era scaffolding (DEF-055) -- bypasses IHazardousEventRepository/
 * HazardousEvent entirely by design (design.md Decision 17, ca-he-route-adapter-write). Delete
 * this file, its adapter, its token, its module wiring, and its two call sites in
 * CreateHazardousEventUseCase/UpdateHazardousEventUseCase in one shot once every dependent
 * domain (Disaster Events, analytics) no longer reads hip_hazard_id/hip_cluster_id/hip_type_id
 * off hazardous_event. */
export interface IHipCrosswalkPort {
	/** Pure read, no tx -- taxonomy rows are immutable at request time, same precedent as
	 * IHazardTaxonomyRepository's own pre-transaction lookups in both use cases. Null for any
	 * level whose sourceRefId is itself null, OR whose resolved value has no matching row in the
	 * live hip_hazard/hip_cluster/hip_class table (dangling sourceRefId -- defensive, so a stale
	 * sourceRefId can never fail the HIP columns' own FK constraint). */
	resolve(specificHazardId: string): Promise<HipCrosswalkIds>;

	/** Direct UPDATE of hazardous_event's three HIP columns only, tenant-scoped, by id. MUST run
	 * inside the same tx as the event write it follows -- never called standalone. */
	stamp(
		eventId: string,
		tenantId: string,
		ids: HipCrosswalkIds,
		tx: Tx,
	): Promise<void>;
}
