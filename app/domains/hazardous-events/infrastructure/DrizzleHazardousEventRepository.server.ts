import { Injectable, Inject } from "@nestjs/common";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
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
import {
	hazardousEventTable,
	type InsertHazardousEvent,
	type SelectHazardousEvent,
} from "~/drizzle/schema/hazardousEventTable";
import { hazardousEventHazardDriverTable } from "./hazardousEventHazardDriverTable";
import { hazardousEventAttachmentTable } from "./hazardousEventAttachmentTable";
import { hazardousEventFieldValueTable } from "./hazardousEventFieldValueTable";
import { hazardousEventCustomFieldValueTable } from "./hazardousEventCustomFieldValueTable";

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

	/** Batches each child table with one `inArray` query across all ids, not per-row. */
	private async loadChildCollections(
		ids: readonly string[],
	): Promise<ReadonlyMap<string, ChildCollections>> {
		const byId = new Map<string, ChildCollections>();
		if (ids.length === 0) {
			return byId;
		}

		const [driverRows, attachmentRows, fieldValueRows, customFieldValueRows] =
			await Promise.all([
				this.db
					.select({
						hazardousEventId: hazardousEventHazardDriverTable.hazardousEventId,
						hazardDriverId: hazardousEventHazardDriverTable.hazardDriverId,
					})
					.from(hazardousEventHazardDriverTable)
					.where(
						inArray(hazardousEventHazardDriverTable.hazardousEventId, [...ids]),
					),
				this.db
					.select()
					.from(hazardousEventAttachmentTable)
					.where(
						inArray(hazardousEventAttachmentTable.hazardousEventId, [...ids]),
					),
				this.db
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
				this.db
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

	async findById(id: string, tenantId: string): Promise<HazardousEvent> {
		const rows = await this.db
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

		const children = await this.loadChildCollections([id]);
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

		const children = await this.loadChildCollections(rows.map((row) => row.id));

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

	/** One transaction spans the `event` row, `hazardous_event` row, and all child collections (Decision 4). */
	async insert(entity: HazardousEvent): Promise<HazardousEvent> {
		const row = this.toRow(entity);

		let inserted: SelectHazardousEvent;
		try {
			inserted = await this.db.transaction(async (tx) => {
				// name/description left unset -- fall back to their zeroText DB default ("").
				await tx.insert(eventTable).values({ id: entity.id });
				const [hazardousEventRow] = await tx
					.insert(hazardousEventTable)
					.values(row)
					.returning();
				await this.insertChildCollections(tx, entity.id, entity);
				return hazardousEventRow;
			});
		} catch (err) {
			this.mapWriteError(err, { id: entity.id });
		}

		const children = await this.loadChildCollections([entity.id]);
		return this.rehydrate(
			inserted,
			children.get(entity.id) ?? EMPTY_CHILD_COLLECTIONS,
		);
	}

	/** Conditional UPDATE, never an upsert; child collections replace only on a matched row (Decisions 2-3). */
	async update(
		entity: HazardousEvent,
		expectedUpdatedAt: Date | null,
	): Promise<HazardousEvent> {
		const row = this.toRow(entity);
		const id = entity.id;
		const tenantId = entity.tenantId;
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
			result = await this.db.transaction(async (tx) => {
				const rows = await tx
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
				await tx
					.delete(hazardousEventHazardDriverTable)
					.where(eq(hazardousEventHazardDriverTable.hazardousEventId, id));
				await tx
					.delete(hazardousEventAttachmentTable)
					.where(eq(hazardousEventAttachmentTable.hazardousEventId, id));
				await tx
					.delete(hazardousEventFieldValueTable)
					.where(eq(hazardousEventFieldValueTable.hazardousEventId, id));
				await tx
					.delete(hazardousEventCustomFieldValueTable)
					.where(eq(hazardousEventCustomFieldValueTable.hazardousEventId, id));
				await this.insertChildCollections(tx, id, entity);
				return rows[0];
			});
		} catch (err) {
			this.mapWriteError(err, { id });
		}

		if (result === null) {
			return this.diagnoseUpdateConflict(id, tenantId);
		}

		const children = await this.loadChildCollections([id]);
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

	/** Zero-row diagnostic re-read: classifies the cause, always throws, never retries. */
	private async diagnoseUpdateConflict(
		id: string,
		tenantId: string,
	): Promise<never> {
		const rows = await this.db
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
	async delete(id: string, tenantId: string): Promise<void> {
		try {
			await this.db.transaction(async (tx) => {
				const deleted = await tx
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
				await tx
					.delete(eventRelationshipTable)
					.where(eq(eventRelationshipTable.childId, id));
				await tx.delete(eventTable).where(eq(eventTable.id, id));
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

	// Spatial-observation (5e) and countReferencingDisasterEvents (5f) are separate later intents.
	async countReferencingDisasterEvents(): Promise<number> {
		throw new Error(
			"DrizzleHazardousEventRepository.countReferencingDisasterEvents is not implemented yet (5f)",
		);
	}

	async findCurrentSpatialObservation(): Promise<SpatialObservationRecord | null> {
		throw new Error(
			"DrizzleHazardousEventRepository.findCurrentSpatialObservation is not implemented yet (5e)",
		);
	}

	async findSpatialObservationByTime(): Promise<SpatialObservationRecord | null> {
		throw new Error(
			"DrizzleHazardousEventRepository.findSpatialObservationByTime is not implemented yet (5e)",
		);
	}

	async saveSpatialObservation(): Promise<SpatialObservationRecord> {
		throw new Error(
			"DrizzleHazardousEventRepository.saveSpatialObservation is not implemented yet (5e)",
		);
	}
}
