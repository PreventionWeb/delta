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
	/** Pure read; `tx` lets a caller in an open transaction read on it (NOD-12). Null per level
	 * whose sourceRefId is null or dangling, so a stale ref never fails the HIP FK. */
	resolve(specificHazardId: string, tx?: Tx): Promise<HipCrosswalkIds>;

	/** Direct UPDATE of hazardous_event's three HIP columns only, tenant-scoped, by id. MUST run
	 * inside the same tx as the event write it follows -- never called standalone. */
	stamp(
		eventId: string,
		tenantId: string,
		ids: HipCrosswalkIds,
		tx: Tx,
	): Promise<void>;
}
