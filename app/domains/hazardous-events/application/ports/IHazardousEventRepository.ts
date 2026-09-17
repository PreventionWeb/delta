import type { HazardousEvent } from "../../domain/HazardousEvent";
import type { Pagination } from "~/shared/types";

/** Minimal, provisional shape for one spatial-footprint reading — Phase 3d's own `SpatialObservation` entity supersedes this (design.md Decision 5). */
export interface SpatialObservationRecord {
	readonly id: string;
	readonly hazardousEventId: string;
	readonly observationTime: Date;
	readonly note: string | null;
	/** From `hazardous_event_spatial_observation_geom` — untyped, matching that table's own `geometryType` customType's `$type<unknown>()` (no PostGIS geometry TS shape without a library). */
	readonly geometries: readonly unknown[];
	/** From `hazardous_event_spatial_observation_division` — one observation can span multiple divisions. */
	readonly divisionIds: readonly string[];
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

/**
 * Repository port for the `HazardousEvent` aggregate and its child spatial observations.
 * Tenancy: explicit `tenantId` on every read/delete/spatial method (addressing DEF-005 at
 * the port boundary), implicit via the entity on `save` (design.md Context/Decision 6).
 */
export interface IHazardousEventRepository {
	/** @throws {NotFoundError} when no HazardousEvent exists for `id` within `tenantId`. */
	findById(id: string, tenantId: string): Promise<HazardousEvent>;

	/** Tenant-scoped, paginated list. */
	findAll(tenantId: string, pagination: Pagination): Promise<HazardousEvent[]>;

	/** Insert-or-update; the entity's own `tenantId` property carries tenancy — no separate parameter. */
	save(entity: HazardousEvent): Promise<HazardousEvent>;

	/** Tenant-scoped delete. */
	delete(id: string, tenantId: string): Promise<void>;

	/** Latest-by-`observationTime` reading, or `null` if none recorded yet — resolves `null`, never throws. */
	findCurrentSpatialObservation(
		hazardousEventId: string,
		tenantId: string,
	): Promise<SpatialObservationRecord | null>;

	/** Exact-`observationTime` lookup, needed by Phase 3d's duplicate-time conflict check before insert. */
	findSpatialObservationByTime(
		hazardousEventId: string,
		observationTime: Date,
		tenantId: string,
	): Promise<SpatialObservationRecord | null>;

	/** Insert-or-update for one observation. The real `UNIQUE(hazardous_event_id, observation_time)` constraint is the authoritative conflict guard; the losing caller's contract is deferred to Phase 3d (design.md Decision 7). */
	saveSpatialObservation(
		hazardousEventId: string,
		observation: SpatialObservationRecord,
		tenantId: string,
	): Promise<SpatialObservationRecord>;
}
