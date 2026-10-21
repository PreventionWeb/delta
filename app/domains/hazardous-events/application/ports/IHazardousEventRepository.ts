import type { HazardousEvent } from "../../domain/HazardousEvent";
import type { Tx } from "~/db.server";
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
 * Repository port for the `HazardousEvent` aggregate and its child spatial observations;
 * `tenantId` is explicit on every read/delete/spatial method (DEF-005), implicit via the entity
 * itself on `insert`/`update`. The only Drizzle/NestJS/Remix import this file may carry is the
 * type-only `Tx` import above — never a `$inferSelect`/`$inferInsert` row type (design.md
 * Decision 3).
 */
export interface IHazardousEventRepository {
	/** @throws {NotFoundError} when no HazardousEvent exists for `id` within `tenantId`. `tx` lets a caller nesting this inside its own open transaction avoid mixing connections (design.md Decision 9). */
	findById(id: string, tenantId: string, tx?: Tx): Promise<HazardousEvent>;

	/** Tenant-scoped, paginated list. */
	findAll(tenantId: string, pagination: Pagination): Promise<HazardousEvent[]>;

	/** First-time persistence of all four child collections as one atomic unit; no separate `tenantId` param -- the entity's own property carries tenancy (Decision 1). */
	insert(entity: HazardousEvent, tx?: Tx): Promise<HazardousEvent>;

	/** Conditional update guarded by optimistic locking, replacing all four child collections wholesale; `expectedUpdatedAt` is `Date | null` (Decision 2).
	 * @throws {ConcurrentModificationError} when no row matches — never falls back to an upsert. */
	update(
		entity: HazardousEvent,
		expectedUpdatedAt: Date | null,
		tx?: Tx,
	): Promise<HazardousEvent>;

	/** Tenant-scoped delete. Resolves normally, not throwing, when no row matches. */
	delete(id: string, tenantId: string, tx?: Tx): Promise<void>;

	/** Counts disaster_event rows referencing hazardousEventId; tenantId scopes the HazardousEvent side only -- a cross-tenant disaster_event row is still counted, not excluded. */
	countReferencingDisasterEvents(
		hazardousEventId: string,
		tenantId: string,
		tx?: Tx,
	): Promise<number>;

	/** Row-locking read (`SELECT ... FOR UPDATE`) — `tx` is required, not optional, since the lock
	 * is released immediately otherwise (design.md Decision 4). Same NotFoundError contract as
	 * `findById`. */
	findByIdForUpdate(
		id: string,
		tenantId: string,
		tx: Tx,
	): Promise<HazardousEvent>;

	/** Latest-by-`observationTime` reading, or `null` if none recorded yet — resolves `null`, never throws. */
	findCurrentSpatialObservation(
		hazardousEventId: string,
		tenantId: string,
	): Promise<SpatialObservationRecord | null>;

	/** Exact-`observationTime` lookup, needed by Phase 3d's duplicate-time conflict check before insert. `tx` per Decision 9. */
	findSpatialObservationByTime(
		hazardousEventId: string,
		observationTime: Date,
		tenantId: string,
		tx?: Tx,
	): Promise<SpatialObservationRecord | null>;

	/** Insert-or-update for one observation. The real `UNIQUE(hazardous_event_id, observation_time)` constraint is the authoritative conflict guard; the losing caller's contract is deferred to Phase 3d (design.md Decision 7). `tx` per Decision 9 — load-bearing here so a caller's bundled write rolls back with the rest of its own transaction. */
	saveSpatialObservation(
		hazardousEventId: string,
		observation: SpatialObservationRecord,
		tenantId: string,
		tx?: Tx,
	): Promise<SpatialObservationRecord>;
}
