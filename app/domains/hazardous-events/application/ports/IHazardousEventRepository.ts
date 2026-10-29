import type { HazardousEvent } from "../../domain/HazardousEvent";
import type { SpatialObservationProps } from "../../domain/SpatialObservation";
import type { Tx } from "~/db.server";
import type { Pagination } from "~/shared/types";
import type { Status } from "~/domains/validation-workflow/domain/WorkflowInstance";

/** Type alias, not a separate interface — a field change is one edit, not two (closes DEF-027). */
export type SpatialObservationRecord = SpatialObservationProps;

/** Repository-facing filter shape, distinct from the use-case-facing one -- every
 * `HazardousEventListFilterInput` field plus `userId` (resolves viewMyRecords/pendingMyAction) and
 * `allowedStatuses` (data-viewer restriction, AND-composed with `recordStatus` -- Decisions 3-4). */
export interface HazardousEventRepositoryFilters {
	hazardTypeId?: string;
	hazardClusterId?: string;
	specificHazardId?: string;
	fromDate?: string;
	toDate?: string;
	recordingOrganization?: string;
	hazardousEventStatus?: "forecasted" | "ongoing" | "passed";
	recordStatus?: Status;
	viewMyRecords?: boolean;
	pendingMyAction?: boolean;
	userId?: string;
	allowedStatuses?: readonly Status[];
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

	/** Tenant-scoped, paginated list. `filters` defaults to unfiltered when omitted. */
	findAll(
		tenantId: string,
		pagination: Pagination,
		filters?: HazardousEventRepositoryFilters,
	): Promise<HazardousEvent[]>;

	/** Tenant-scoped total count, ignoring pagination -- feeds the list page's own total-count
	 * summary and numbered pagination (human decision). Shares its filter-to-SQL
	 * translation with `findAll`, not a separately-maintained condition tree (design.md Decision 2). */
	countAll(
		tenantId: string,
		filters?: HazardousEventRepositoryFilters,
		tx?: Tx,
	): Promise<number>;

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

	/** Latest-by-`observationTime` reading, or `null` if none recorded yet — resolves `null`, never throws. `tx` per Decision 9. */
	findCurrentSpatialObservation(
		hazardousEventId: string,
		tenantId: string,
		tx?: Tx,
	): Promise<SpatialObservationRecord | null>;

	/** Exact-`observationTime` lookup, needed by Phase 3d's duplicate-time conflict check before insert. `tx` per Decision 9. */
	findSpatialObservationByTime(
		hazardousEventId: string,
		observationTime: Date,
		tenantId: string,
		tx?: Tx,
	): Promise<SpatialObservationRecord | null>;

	/** Insert-or-update for one observation. The real `UNIQUE(hazardous_event_id, observation_time)` constraint is the authoritative conflict guard; the losing caller gets the same `ConflictError` shape as a synchronously-detected duplicate (design.md Decision 7). `tx` per Decision 9 — load-bearing here so a caller's bundled write rolls back with the rest of its own transaction. */
	saveSpatialObservation(
		hazardousEventId: string,
		observation: SpatialObservationRecord,
		tenantId: string,
		tx?: Tx,
	): Promise<SpatialObservationRecord>;
}
