import { Injectable, Inject } from "@nestjs/common";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Dr, Tx } from "~/db.server";
import { DRIZZLE_CLIENT } from "~/infrastructure/DrizzleProvider.server";
import { getPinoLogger } from "~/infrastructure/logging/PinoLogger.server";
import {
	pgErrorCode,
	pgErrorConstraint,
} from "~/infrastructure/pgErrorCode.server";
import {
	ConcurrentModificationError,
	ConflictError,
	NotFoundError,
	ValidationError,
} from "~/shared/errors";
import {
	HazardousEvent,
	type HazardousEventAttachmentProps,
	type HazardousEventFieldValueProps,
	type HazardousEventCustomFieldValueProps,
	type HazardousEventProps,
} from "../domain/HazardousEvent";
import type {
	IHazardousEventRepository,
	SpatialObservationRecord,
} from "../application/ports/IHazardousEventRepository";
import type { Pagination } from "~/shared/types";
import { eventTable } from "~/drizzle/schema/eventTable";
import { eventRelationshipTable } from "~/drizzle/schema/eventRelationshipTable";
import { disasterEventTable } from "~/drizzle/schema/disasterEventTable";
import { divisionTable } from "~/drizzle/schema/divisionTable";
import {
	hazardousEventTable,
	type InsertHazardousEvent,
	type SelectHazardousEvent,
} from "~/drizzle/schema/hazardousEventTable";
import { hazardousEventHazardDriverTable } from "./hazardousEventHazardDriverTable";
import { hazardousEventAttachmentTable } from "./hazardousEventAttachmentTable";
import { hazardousEventFieldValueTable } from "./hazardousEventFieldValueTable";
import { hazardousEventCustomFieldValueTable } from "./hazardousEventCustomFieldValueTable";
import {
	hazardousEventSpatialObservationTable,
	type SelectHazardousEventSpatialObservation,
} from "./hazardousEventSpatialObservationTable";
import { hazardousEventSpatialObservationGeomTable } from "./hazardousEventSpatialObservationGeomTable";
import { hazardousEventSpatialObservationDivisionTable } from "./hazardousEventSpatialObservationDivisionTable";

/** Parent-table columns only -- avoids an id collision with the joined hazardous_event table. */
const SPATIAL_OBSERVATION_COLUMNS = {
	id: hazardousEventSpatialObservationTable.id,
	hazardousEventId: hazardousEventSpatialObservationTable.hazardousEventId,
	observationTime: hazardousEventSpatialObservationTable.observationTime,
	note: hazardousEventSpatialObservationTable.note,
	createdAt: hazardousEventSpatialObservationTable.createdAt,
	updatedAt: hazardousEventSpatialObservationTable.updatedAt,
};

interface ChildCollections {
	hazardDriverIds: readonly string[];
	attachments: readonly HazardousEventAttachmentProps[];
	fieldValues: readonly HazardousEventFieldValueProps[];
	customFieldValues: readonly HazardousEventCustomFieldValueProps[];
}

const EMPTY_CHILD_COLLECTIONS: ChildCollections = {
	hazardDriverIds: [],
	attachments: [],
	fieldValues: [],
	customFieldValues: [],
};

@Injectable()
export class DrizzleHazardousEventRepository implements IHazardousEventRepository {
	constructor(@Inject(DRIZZLE_CLIENT) private readonly db: Dr) {}

	/** Strict subset of the table's columns -- excludes legacy approval/HIP/attachments-JSONB (Decision 4). */
	private toProps(
		row: SelectHazardousEvent,
		children: ChildCollections,
	): HazardousEventProps {
		return {
			id: row.id,
			// `?? ""` turns a legacy NULL into ValidationError on rehydration (Decision 5).
			tenantId: row.countryAccountsId ?? "",
			specificHazardId: row.specificHazardId ?? "",
			startDate: row.startDate,
			endDate: row.endDate,
			nationalSpecification: row.nationalSpecification,
			description: row.description,
			chainsExplanation: row.chainsExplanation,
			magnitude: row.magnitude,
			recordOriginator: row.recordOriginator,
			dataSource: row.dataSource,
			hazardousEventStatus: row.hazardousEventStatus,
			specificHazardLocalName: row.specificHazardLocalName,
			specificHazardNationalName: row.specificHazardNationalName,
			apiImportId: row.apiImportId,
			createdByUserId: row.createdByUserId,
			updatedByUserId: row.updatedByUserId,
			submittedByUserId: row.submittedByUserId,
			submittedAt: row.submittedAt,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
			hazardDriverIds: children.hazardDriverIds,
			attachments: children.attachments,
			fieldValues: children.fieldValues,
			customFieldValues: children.customFieldValues,
		};
	}

	/** Inverse of toProps (Decision 4); updatedAt set explicitly even when null, or Drizzle would apply the column's own default instead. */
	private toRow(entity: HazardousEvent): InsertHazardousEvent & { id: string } {
		return {
			id: entity.id,
			countryAccountsId: entity.tenantId,
			specificHazardId: entity.specificHazardId,
			startDate: entity.startDate,
			endDate: entity.endDate,
			nationalSpecification: entity.nationalSpecification,
			description: entity.description,
			chainsExplanation: entity.chainsExplanation,
			magnitude: entity.magnitude,
			recordOriginator: entity.recordOriginator,
			dataSource: entity.dataSource,
			hazardousEventStatus: entity.hazardousEventStatus,
			specificHazardLocalName: entity.specificHazardLocalName,
			specificHazardNationalName: entity.specificHazardNationalName,
			apiImportId: entity.apiImportId,
			createdByUserId: entity.createdByUserId,
			updatedByUserId: entity.updatedByUserId,
			submittedByUserId: entity.submittedByUserId,
			submittedAt: entity.submittedAt,
			createdAt: entity.createdAt,
			updatedAt: entity.updatedAt,
		};
	}

	/** Shared by insert()/update() -- skips empty collections: `.values([])` is malformed here. */
	private async insertChildCollections(
		tx: Tx,
		hazardousEventId: string,
		entity: HazardousEvent,
	): Promise<void> {
		if (entity.hazardDriverIds.length > 0) {
			await tx.insert(hazardousEventHazardDriverTable).values(
				entity.hazardDriverIds.map((hazardDriverId) => ({
					hazardousEventId,
					hazardDriverId,
				})),
			);
		}
		if (entity.attachments.length > 0) {
			await tx.insert(hazardousEventAttachmentTable).values(
				entity.attachments.map((attachment) => ({
					id: attachment.id,
					hazardousEventId,
					title: attachment.title,
					fileKey: attachment.fileKey,
					fileName: attachment.fileName,
					fileType: attachment.fileType,
					fileSize: attachment.fileSize,
				})),
			);
		}
		if (entity.fieldValues.length > 0) {
			await tx.insert(hazardousEventFieldValueTable).values(
				entity.fieldValues.map((fieldValue) => ({
					hazardousEventId,
					hazardTypeFieldDefinitionId: fieldValue.hazardTypeFieldDefinitionId,
					value: fieldValue.value,
				})),
			);
		}
		if (entity.customFieldValues.length > 0) {
			await tx.insert(hazardousEventCustomFieldValueTable).values(
				entity.customFieldValues.map((customFieldValue) => ({
					hazardousEventId,
					hazardTypeCustomFieldDefinitionId:
						customFieldValue.hazardTypeCustomFieldDefinitionId,
					value: customFieldValue.value,
				})),
			);
		}
	}

	/** Batches each child table with one `inArray` query across all ids, not per-row. `executor` must be the caller's own resolved `tx ?? this.db`, never a hard-coded `this.db` (design.md Decision 2). */
	private async loadChildCollections(
		executor: Tx,
		ids: readonly string[],
	): Promise<ReadonlyMap<string, ChildCollections>> {
		const byId = new Map<string, ChildCollections>();
		if (ids.length === 0) {
			return byId;
		}

		const [driverRows, attachmentRows, fieldValueRows, customFieldValueRows] =
			await Promise.all([
				executor
					.select({
						hazardousEventId: hazardousEventHazardDriverTable.hazardousEventId,
						hazardDriverId: hazardousEventHazardDriverTable.hazardDriverId,
					})
					.from(hazardousEventHazardDriverTable)
					.where(
						inArray(hazardousEventHazardDriverTable.hazardousEventId, [...ids]),
					),
				executor
					.select()
					.from(hazardousEventAttachmentTable)
					.where(
						inArray(hazardousEventAttachmentTable.hazardousEventId, [...ids]),
					),
				executor
					.select({
						hazardousEventId: hazardousEventFieldValueTable.hazardousEventId,
						hazardTypeFieldDefinitionId:
							hazardousEventFieldValueTable.hazardTypeFieldDefinitionId,
						value: hazardousEventFieldValueTable.value,
					})
					.from(hazardousEventFieldValueTable)
					.where(
						inArray(hazardousEventFieldValueTable.hazardousEventId, [...ids]),
					),
				executor
					.select({
						hazardousEventId:
							hazardousEventCustomFieldValueTable.hazardousEventId,
						hazardTypeCustomFieldDefinitionId:
							hazardousEventCustomFieldValueTable.hazardTypeCustomFieldDefinitionId,
						value: hazardousEventCustomFieldValueTable.value,
					})
					.from(hazardousEventCustomFieldValueTable)
					.where(
						inArray(hazardousEventCustomFieldValueTable.hazardousEventId, [
							...ids,
						]),
					),
			]);

		const forId = (id: string): ChildCollections => {
			let entry = byId.get(id);
			if (!entry) {
				entry = {
					hazardDriverIds: [],
					attachments: [],
					fieldValues: [],
					customFieldValues: [],
				};
				byId.set(id, entry);
			}
			return entry;
		};

		for (const row of driverRows) {
			const entry = forId(row.hazardousEventId);
			(entry.hazardDriverIds as string[]).push(row.hazardDriverId);
		}
		for (const row of attachmentRows) {
			const entry = forId(row.hazardousEventId);
			(entry.attachments as HazardousEventAttachmentProps[]).push({
				id: row.id,
				title: row.title,
				fileKey: row.fileKey,
				fileName: row.fileName,
				fileType: row.fileType,
				fileSize: row.fileSize,
			});
		}
		for (const row of fieldValueRows) {
			const entry = forId(row.hazardousEventId);
			(entry.fieldValues as HazardousEventFieldValueProps[]).push({
				hazardTypeFieldDefinitionId: row.hazardTypeFieldDefinitionId,
				value: row.value,
			});
		}
		for (const row of customFieldValueRows) {
			const entry = forId(row.hazardousEventId);
			(entry.customFieldValues as HazardousEventCustomFieldValueProps[]).push({
				hazardTypeCustomFieldDefinitionId:
					row.hazardTypeCustomFieldDefinitionId,
				value: row.value,
			});
		}

		return byId;
	}

	/** Membership built from the row's own child ids, not a fresh taxonomy lookup (Decision 5). */
	private rehydrate(
		row: SelectHazardousEvent,
		children: ChildCollections,
	): HazardousEvent {
		const validHazardDriverIds = new Set(children.hazardDriverIds);
		const validCustomFieldDefinitionIds = new Set(
			children.customFieldValues.map(
				(cfv) => cfv.hazardTypeCustomFieldDefinitionId,
			),
		);
		return HazardousEvent.create(
			this.toProps(row, children),
			validHazardDriverIds,
			validCustomFieldDefinitionIds,
		);
	}

	async findById(
		id: string,
		tenantId: string,
		tx?: Tx,
	): Promise<HazardousEvent> {
		const executor = tx ?? this.db;
		const rows = await executor
			.select()
			.from(hazardousEventTable)
			.where(
				and(
					eq(hazardousEventTable.id, id),
					eq(hazardousEventTable.countryAccountsId, tenantId),
				),
			);

		if (rows.length === 0) {
			throw new NotFoundError("HazardousEvent", id);
		}

		const children = await this.loadChildCollections(executor, [id]);
		// Unlike findAll's skip-and-log, a requested id should error, not disappear (Decision 5).
		return this.rehydrate(rows[0], children.get(id) ?? EMPTY_CHILD_COLLECTIONS);
	}

	/** `created_at, id` ordering -- needed for pagination to behave deterministically. */
	async findAll(
		tenantId: string,
		pagination: Pagination,
	): Promise<HazardousEvent[]> {
		const rows = await this.db
			.select()
			.from(hazardousEventTable)
			.where(eq(hazardousEventTable.countryAccountsId, tenantId))
			.orderBy(asc(hazardousEventTable.createdAt), asc(hazardousEventTable.id))
			.limit(pagination.pageSize)
			.offset((pagination.page - 1) * pagination.pageSize);

		const children = await this.loadChildCollections(
			this.db,
			rows.map((row) => row.id),
		);

		const entities: HazardousEvent[] = [];
		for (const row of rows) {
			try {
				entities.push(
					this.rehydrate(row, children.get(row.id) ?? EMPTY_CHILD_COLLECTIONS),
				);
			} catch (err) {
				// Skip only invariant violations (Decision 5); anything else propagates (ADR-003).
				if (!(err instanceof ValidationError)) {
					throw err;
				}
				getPinoLogger().warn({
					msg: "hazardous_event.invariant_violation_skipped",
					id: row.id,
					err,
				});
			}
		}
		return entities;
	}

	/** One transaction spans the `event` row, `hazardous_event` row, and all child collections (Decision 4). `(tx ?? this.db).transaction()` nests as a SAVEPOINT when `tx` is already inside an open outer transaction (design.md Decision 2). */
	async insert(entity: HazardousEvent, tx?: Tx): Promise<HazardousEvent> {
		const row = this.toRow(entity);
		const executor = tx ?? this.db;

		let inserted: SelectHazardousEvent;
		try {
			inserted = await executor.transaction(async (innerTx) => {
				// name/description left unset -- fall back to their zeroText DB default ("").
				await innerTx.insert(eventTable).values({ id: entity.id });
				const [hazardousEventRow] = await innerTx
					.insert(hazardousEventTable)
					.values(row)
					.returning();
				await this.insertChildCollections(innerTx, entity.id, entity);
				return hazardousEventRow;
			});
		} catch (err) {
			this.mapWriteError(err, { id: entity.id });
		}

		const children = await this.loadChildCollections(executor, [entity.id]);
		return this.rehydrate(
			inserted,
			children.get(entity.id) ?? EMPTY_CHILD_COLLECTIONS,
		);
	}

	/** Conditional UPDATE, never an upsert; child collections replace only on a matched row (Decisions 2-3). */
	async update(
		entity: HazardousEvent,
		expectedUpdatedAt: Date | null,
		tx?: Tx,
	): Promise<HazardousEvent> {
		const row = this.toRow(entity);
		const id = entity.id;
		const tenantId = entity.tenantId;
		const executor = tx ?? this.db;
		// id/tenantId/createdAt excluded from SET (immutable); id/tenantId below use entity directly, not row, since row's insert type allows null there.
		const {
			id: _id,
			countryAccountsId: _countryAccountsId,
			createdAt: _createdAt,
			...setFields
		} = row;
		// isNull, not eq(updatedAt, null) -- "= NULL" never matches in SQL (Decision 2).
		// No ::timestamptz cast like 5j's -- this column has no time zone (Decision 3).
		const updatedAtCondition =
			expectedUpdatedAt === null
				? isNull(hazardousEventTable.updatedAt)
				: sql`date_trunc('milliseconds', ${hazardousEventTable.updatedAt}) = date_trunc('milliseconds', ${expectedUpdatedAt.toISOString()}::timestamp)`;

		let result: SelectHazardousEvent | null;
		try {
			result = await executor.transaction(async (innerTx) => {
				const rows = await innerTx
					.update(hazardousEventTable)
					.set(setFields)
					.where(
						and(
							eq(hazardousEventTable.id, id),
							eq(hazardousEventTable.countryAccountsId, tenantId),
							updatedAtCondition,
						),
					)
					.returning();

				if (rows.length === 0) {
					return null;
				}
				await innerTx
					.delete(hazardousEventHazardDriverTable)
					.where(eq(hazardousEventHazardDriverTable.hazardousEventId, id));
				await innerTx
					.delete(hazardousEventAttachmentTable)
					.where(eq(hazardousEventAttachmentTable.hazardousEventId, id));
				await innerTx
					.delete(hazardousEventFieldValueTable)
					.where(eq(hazardousEventFieldValueTable.hazardousEventId, id));
				await innerTx
					.delete(hazardousEventCustomFieldValueTable)
					.where(eq(hazardousEventCustomFieldValueTable.hazardousEventId, id));
				await this.insertChildCollections(innerTx, id, entity);
				return rows[0];
			});
		} catch (err) {
			this.mapWriteError(err, { id });
		}

		if (result === null) {
			return this.diagnoseUpdateConflict(id, tenantId, executor);
		}

		const children = await this.loadChildCollections(executor, [id]);
		return this.rehydrate(result, children.get(id) ?? EMPTY_CHILD_COLLECTIONS);
	}

	/** Shared insert()/update() write-error mapping; always throws. */
	private mapWriteError(err: unknown, context: { id: string }): never {
		const code = pgErrorCode(err);
		if (code === "23505") {
			const constraint = pgErrorConstraint(err);
			if (constraint === "hazardous_event_api_import_id_tenant_unique") {
				throw new ConflictError(
					"HazardousEvent apiImportId already exists for this tenant",
					context,
				);
			}
			// Attachments have no domain-level dedupe (HazardousEvent.ts validateAttachments), so a duplicate attachment id reaches this PK unmapped otherwise.
			if (constraint === "hazardous_event_attachment_pkey") {
				throw new ConflictError(
					"HazardousEvent has a duplicate attachment id",
					context,
				);
			}
			throw new ConflictError(
				"HazardousEvent already exists for this id",
				context,
			);
		}
		if (code === "23503") {
			throw new ValidationError(
				"HazardousEvent references a nonexistent id",
				context,
			);
		}
		if (code === "22P02") {
			throw new ValidationError(
				"HazardousEvent has malformed input data",
				context,
			);
		}
		throw err;
	}

	/** Zero-row diagnostic re-read: classifies the cause, always throws, never retries. Reads via the caller's own resolved executor, not a separate connection (design.md Decision 2). */
	private async diagnoseUpdateConflict(
		id: string,
		tenantId: string,
		executor: Tx,
	): Promise<never> {
		const rows = await executor
			.select()
			.from(hazardousEventTable)
			.where(eq(hazardousEventTable.id, id));

		if (rows.length === 0) {
			throw new ConcurrentModificationError(
				"HazardousEvent no longer exists for this id",
				{ id },
			);
		}
		if (rows[0].countryAccountsId !== tenantId) {
			throw new ConflictError(
				"HazardousEvent id already belongs to a different tenant",
				{ id },
			);
		}
		throw new ConcurrentModificationError(
			"HazardousEvent has been modified since it was read",
			{ id },
		);
	}

	/** Replicates the legacy cleanup order (event.ts:1728), tenant-gated delete first (Decision 6); outgoing event_relationship gap is inherited, mapped to ConflictError (Decision 8). */
	async delete(id: string, tenantId: string, tx?: Tx): Promise<void> {
		try {
			await (tx ?? this.db).transaction(async (innerTx) => {
				const deleted = await innerTx
					.delete(hazardousEventTable)
					.where(
						and(
							eq(hazardousEventTable.id, id),
							eq(hazardousEventTable.countryAccountsId, tenantId),
						),
					)
					.returning({ id: hazardousEventTable.id });
				if (deleted.length === 0) {
					return;
				}
				await innerTx
					.delete(eventRelationshipTable)
					.where(eq(eventRelationshipTable.childId, id));
				await innerTx.delete(eventTable).where(eq(eventTable.id, id));
			});
		} catch (err) {
			if (
				pgErrorCode(err) === "23503" &&
				pgErrorConstraint(err) === "event_relationship_parent_id_event_id_fk"
			) {
				throw new ConflictError(
					"Delete events that are caused by this event first",
					{ id, tenantId },
				);
			}
			// Other 23503 targets are pre-checked upstream; the residual race is DEF-033, not this.
			throw err;
		}
	}

	async countReferencingDisasterEvents(
		hazardousEventId: string,
		// Intentionally unused: scopes the HE side only, never filters the counted disaster_event rows.
		_tenantId: string,
		tx?: Tx,
	): Promise<number> {
		// ::int required: bare count(*) is Postgres bigint, returned as a string by
		// node-postgres at runtime -- PGlite doesn't reproduce this, so don't rely on
		// these tests to catch its removal.
		const [row] = await (tx ?? this.db)
			.select({ count: sql<number>`count(*)::int` })
			.from(disasterEventTable)
			.where(eq(disasterEventTable.hazardousEventId, hazardousEventId));
		// Safe: an unqualified aggregate with no GROUP BY always returns exactly one row.
		return row.count;
	}

	/** `SELECT ... FOR UPDATE`, scoped like findById; tx is required — a lock outside the caller's
	 * own open transaction releases the instant this statement finishes (design.md Decision 4). */
	async findByIdForUpdate(
		id: string,
		tenantId: string,
		tx: Tx,
	): Promise<HazardousEvent> {
		const rows = await tx
			.select()
			.from(hazardousEventTable)
			.where(
				and(
					eq(hazardousEventTable.id, id),
					eq(hazardousEventTable.countryAccountsId, tenantId),
				),
			)
			.for("update");

		if (rows.length === 0) {
			throw new NotFoundError("HazardousEvent", id);
		}

		const children = await this.loadChildCollections(tx, [id]);
		return this.rehydrate(rows[0], children.get(id) ?? EMPTY_CHILD_COLLECTIONS);
	}

	/** Loads geom/division rows for one observation id, geom parsed back from GeoJSON -- shared by every read path, including the post-write re-read. */
	private async loadSpatialChildren(
		executor: Tx,
		observationId: string,
	): Promise<{
		geometries: readonly unknown[];
		divisionIds: readonly string[];
	}> {
		const [geomRows, divisionRows] = await Promise.all([
			executor
				.select({
					geom: sql<string>`ST_AsGeoJSON(${hazardousEventSpatialObservationGeomTable.geom})`,
				})
				.from(hazardousEventSpatialObservationGeomTable)
				.where(
					eq(
						hazardousEventSpatialObservationGeomTable.hazardousEventSpatialObservationId,
						observationId,
					),
				),
			executor
				.select({
					divisionId: hazardousEventSpatialObservationDivisionTable.divisionId,
				})
				.from(hazardousEventSpatialObservationDivisionTable)
				.where(
					eq(
						hazardousEventSpatialObservationDivisionTable.hazardousEventSpatialObservationId,
						observationId,
					),
				),
		]);
		return {
			geometries: geomRows.map((row) => JSON.parse(row.geom) as unknown),
			divisionIds: divisionRows.map((row) => row.divisionId),
		};
	}

	private async toSpatialObservationRecord(
		executor: Tx,
		row: SelectHazardousEventSpatialObservation,
	): Promise<SpatialObservationRecord> {
		const { geometries, divisionIds } = await this.loadSpatialChildren(
			executor,
			row.id,
		);
		return {
			id: row.id,
			hazardousEventId: row.hazardousEventId,
			observationTime: row.observationTime,
			note: row.note,
			geometries,
			divisionIds,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
		};
	}

	/** Re-reads by id alone, no tenant filter -- safe because ownership was already verified earlier in the same transaction. */
	private async loadSpatialObservationById(
		executor: Tx,
		observationId: string,
	): Promise<SpatialObservationRecord> {
		const [row] = await executor
			.select(SPATIAL_OBSERVATION_COLUMNS)
			.from(hazardousEventSpatialObservationTable)
			.where(eq(hazardousEventSpatialObservationTable.id, observationId));
		return this.toSpatialObservationRecord(executor, row);
	}

	/** Neither spatial table carries its own tenant column, so filter via a join to hazardous_event. */
	async findCurrentSpatialObservation(
		hazardousEventId: string,
		tenantId: string,
		tx?: Tx,
	): Promise<SpatialObservationRecord | null> {
		const executor = tx ?? this.db;
		const rows = await executor
			.select(SPATIAL_OBSERVATION_COLUMNS)
			.from(hazardousEventSpatialObservationTable)
			.innerJoin(
				hazardousEventTable,
				eq(
					hazardousEventSpatialObservationTable.hazardousEventId,
					hazardousEventTable.id,
				),
			)
			.where(
				and(
					eq(
						hazardousEventSpatialObservationTable.hazardousEventId,
						hazardousEventId,
					),
					eq(hazardousEventTable.countryAccountsId, tenantId),
				),
			)
			.orderBy(desc(hazardousEventSpatialObservationTable.observationTime))
			.limit(1);

		if (rows.length === 0) {
			return null;
		}
		return this.toSpatialObservationRecord(executor, rows[0]);
	}

	async findSpatialObservationByTime(
		hazardousEventId: string,
		observationTime: Date,
		tenantId: string,
		tx?: Tx,
	): Promise<SpatialObservationRecord | null> {
		const executor = tx ?? this.db;
		const rows = await executor
			.select(SPATIAL_OBSERVATION_COLUMNS)
			.from(hazardousEventSpatialObservationTable)
			.innerJoin(
				hazardousEventTable,
				eq(
					hazardousEventSpatialObservationTable.hazardousEventId,
					hazardousEventTable.id,
				),
			)
			.where(
				and(
					eq(
						hazardousEventSpatialObservationTable.hazardousEventId,
						hazardousEventId,
					),
					eq(
						hazardousEventSpatialObservationTable.observationTime,
						observationTime,
					),
					eq(hazardousEventTable.countryAccountsId, tenantId),
				),
			);

		if (rows.length === 0) {
			return null;
		}
		return this.toSpatialObservationRecord(executor, rows[0]);
	}

	/** Shared error mapping for saveSpatialObservation; a domain error thrown earlier in the same transaction has no matching PG code, so it falls through to the terminal rethrow unchanged -- one mapping call site, like insert()/update()'s own mapWriteError. */
	private mapSpatialWriteError(
		err: unknown,
		context: { hazardousEventId: string; observationTime: Date },
	): never {
		const code = pgErrorCode(err);
		if (code === "23505") {
			const constraint = pgErrorConstraint(err);
			if (
				constraint ===
				"hazardous_event_spatial_observation_event_id_time_unique"
			) {
				throw new ConflictError(
					"An observation already exists for this hazardousEventId at this observationTime",
					context,
				);
			}
			if (
				constraint ===
				"hazardous_event_spatial_observation_division_obs_div_unique"
			) {
				throw new ValidationError(
					"divisionIds must not contain duplicate values",
					context,
				);
			}
		}
		if (code === "23503") {
			// Parent-row FK: the hazardous_event row vanished between assertEventOwnedByTenant's
			// check and this insert (concurrent delete) -- same error as the ownership gate itself.
			if (
				pgErrorConstraint(err) ===
				"hazardous_event_spatial_observation_hazardous_event_id_fk"
			) {
				throw new NotFoundError("HazardousEvent", context.hazardousEventId);
			}
			throw new ValidationError(
				"SpatialObservation references a nonexistent division id",
				context,
			);
		}
		if (code === "22P02") {
			throw new ValidationError(
				"SpatialObservation has malformed input data",
				context,
			);
		}
		throw err;
	}

	/** Decision 6 step 2. @throws {NotFoundError} when hazardousEventId doesn't belong to tenantId. */
	private async assertEventOwnedByTenant(
		executor: Tx,
		hazardousEventId: string,
		tenantId: string,
	): Promise<void> {
		const ownerRows = await executor
			.select({ id: hazardousEventTable.id })
			.from(hazardousEventTable)
			.where(
				and(
					eq(hazardousEventTable.id, hazardousEventId),
					eq(hazardousEventTable.countryAccountsId, tenantId),
				),
			);
		if (ownerRows.length === 0) {
			throw new NotFoundError("HazardousEvent", hazardousEventId);
		}
	}

	/** DB-layer defense-in-depth, deliberately independent of DrizzleDivisionRepository's own
	 * read-path check (two separate gates, not one shared). @throws {ValidationError} naming any invalid id. */
	private async assertDivisionIdsInTenant(
		executor: Tx,
		divisionIds: readonly string[],
		tenantId: string,
		context: { hazardousEventId: string },
	): Promise<void> {
		// Distinct count, not raw length -- a duplicate divisionId is caught by the DB's own unique constraint on insert, not this tenant gate.
		const distinctDivisionIds = [...new Set(divisionIds)];
		if (distinctDivisionIds.length === 0) {
			return;
		}
		const validDivisionRows = await executor
			.select({ id: divisionTable.id })
			.from(divisionTable)
			.where(
				and(
					eq(divisionTable.countryAccountsId, tenantId),
					inArray(divisionTable.id, distinctDivisionIds),
				),
			);
		if (validDivisionRows.length < distinctDivisionIds.length) {
			const validIds = new Set(validDivisionRows.map((row) => row.id));
			const invalid = distinctDivisionIds.filter((id) => !validIds.has(id));
			throw new ValidationError(
				`divisionIds not valid for tenant: ${invalid.join(", ")}`,
				{ ...context, tenantId, invalidDivisionIds: invalid },
			);
		}
	}

	/** Upsert-by-id, mirroring DrizzleNoticeRepository.server.ts's save(). @throws {ConflictError} on an empty RETURNING (id used by a different hazardousEventId). */
	private async upsertSpatialObservationRow(
		executor: Tx,
		hazardousEventId: string,
		observation: SpatialObservationRecord,
	): Promise<string> {
		const upserted = await executor
			.insert(hazardousEventSpatialObservationTable)
			.values({
				id: observation.id,
				hazardousEventId,
				observationTime: observation.observationTime,
				note: observation.note,
				createdAt: observation.createdAt,
				updatedAt: observation.updatedAt,
			})
			.onConflictDoUpdate({
				target: hazardousEventSpatialObservationTable.id,
				set: {
					observationTime: observation.observationTime,
					note: observation.note,
					updatedAt: observation.updatedAt,
				},
				where: eq(
					hazardousEventSpatialObservationTable.hazardousEventId,
					hazardousEventId,
				),
			})
			.returning();

		if (upserted.length === 0) {
			throw new ConflictError(
				"SpatialObservation id already used by a different hazardousEventId",
				{ id: observation.id, hazardousEventId },
			);
		}
		return upserted[0].id;
	}

	/** Delete-then-reinsert, skipping insert for an empty collection (matches insertChildCollections' own convention). */
	private async replaceSpatialChildren(
		executor: Tx,
		observationId: string,
		observation: SpatialObservationRecord,
		context: { hazardousEventId: string; observationTime: Date },
	): Promise<void> {
		await executor
			.delete(hazardousEventSpatialObservationGeomTable)
			.where(
				eq(
					hazardousEventSpatialObservationGeomTable.hazardousEventSpatialObservationId,
					observationId,
				),
			);
		await executor
			.delete(hazardousEventSpatialObservationDivisionTable)
			.where(
				eq(
					hazardousEventSpatialObservationDivisionTable.hazardousEventSpatialObservationId,
					observationId,
				),
			);

		if (observation.geometries.length > 0) {
			// Scoped here, not in mapSpatialWriteError: malformed GeoJSON raises XX000, Postgres's
			// generic internal_error -- too broad to map globally, but this insert has no other failure mode of its own.
			try {
				await executor.insert(hazardousEventSpatialObservationGeomTable).values(
					observation.geometries.map((geometry) => ({
						hazardousEventSpatialObservationId: observationId,
						geom: sql`ST_GeomFromGeoJSON(${JSON.stringify(geometry)})`,
					})),
				);
			} catch (err) {
				throw new ValidationError(
					"SpatialObservation has a malformed geometries element",
					context,
				);
			}
		}
		// Full array, not deduped -- a duplicate divisionId must reach the DB's unique constraint and be rejected, not silently collapsed.
		if (observation.divisionIds.length > 0) {
			await executor
				.insert(hazardousEventSpatialObservationDivisionTable)
				.values(
					observation.divisionIds.map((divisionId) => ({
						hazardousEventSpatialObservationId: observationId,
						divisionId,
					})),
				);
		}
	}

	/** Orchestrates the ownership check, division tenant re-check, upsert-by-id, and child-collection replacement -- one resolved executor throughout (Decision 6). */
	async saveSpatialObservation(
		hazardousEventId: string,
		observation: SpatialObservationRecord,
		tenantId: string,
		tx?: Tx,
	): Promise<SpatialObservationRecord> {
		if (observation.hazardousEventId !== hazardousEventId) {
			throw new ValidationError(
				"observation.hazardousEventId must match the hazardousEventId parameter",
				{
					hazardousEventId,
					observationHazardousEventId: observation.hazardousEventId,
				},
			);
		}

		try {
			return await (tx ?? this.db).transaction(async (innerTx) => {
				await this.assertEventOwnedByTenant(
					innerTx,
					hazardousEventId,
					tenantId,
				);
				await this.assertDivisionIdsInTenant(
					innerTx,
					observation.divisionIds,
					tenantId,
					{ hazardousEventId },
				);
				const observationId = await this.upsertSpatialObservationRow(
					innerTx,
					hazardousEventId,
					observation,
				);
				await this.replaceSpatialChildren(innerTx, observationId, observation, {
					hazardousEventId,
					observationTime: observation.observationTime,
				});
				return this.loadSpatialObservationById(innerTx, observationId);
			});
		} catch (err) {
			this.mapSpatialWriteError(err, {
				hazardousEventId,
				observationTime: observation.observationTime,
			});
		}
	}
}
