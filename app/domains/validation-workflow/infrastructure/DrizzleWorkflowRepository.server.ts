import { Injectable, Inject } from "@nestjs/common";
import { and, eq, inArray, sql } from "drizzle-orm";

import type { Dr } from "~/db.server";
import { DRIZZLE_CLIENT } from "~/infrastructure/DrizzleProvider.server";
import { getPinoLogger } from "~/infrastructure/logging/PinoLogger.server";
import {
	ConcurrentModificationError,
	ConflictError,
	ValidationError,
} from "~/shared/errors";
import type { IWorkflowRepository } from "~/domains/validation-workflow/application/ports/IWorkflowRepository";
import {
	WorkflowInstance,
	type EntityType,
	type WorkflowInstanceProps,
} from "~/domains/validation-workflow/domain/WorkflowInstance";
import {
	workflowInstanceTable,
	type InsertWorkflowInstance,
	type SelectWorkflowInstance,
} from "./workflowInstanceTable";

/** drizzle-orm wraps driver errors in `DrizzleQueryError` (PGlite and node-postgres alike), so
 * the PG code lands on `.cause.code`; `err.code` is also checked as defense-in-depth, matching
 * `common.ts:148`'s own both-fields pattern (Decision 4). */
function pgErrorCode(err: unknown): string | undefined {
	if (typeof err !== "object" || err === null) {
		return undefined;
	}
	const code = "code" in err ? err.code : undefined;
	if (typeof code === "string") {
		return code;
	}
	const cause = "cause" in err ? err.cause : undefined;
	const causeCode =
		typeof cause === "object" && cause !== null && "code" in cause
			? cause.code
			: undefined;
	return typeof causeCode === "string" ? causeCode : undefined;
}

@Injectable()
export class DrizzleWorkflowRepository implements IWorkflowRepository {
	constructor(@Inject(DRIZZLE_CLIENT) private readonly db: Dr) {}

	private toProps(row: SelectWorkflowInstance): WorkflowInstanceProps {
		return {
			id: row.id,
			entityId: row.entityId,
			entityType: row.entityType,
			status: row.status,
			submittedByUserId: row.submittedByUserId,
			submittedAt: row.submittedAt,
			validatedByUserId: row.validatedByUserId,
			validatedAt: row.validatedAt,
			approvedByUserId: row.approvedByUserId,
			approvedAt: row.approvedAt,
			publishedByUserId: row.publishedByUserId,
			publishedAt: row.publishedAt,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
		};
	}

	/** `& { id: string }`: the inferred insert type makes `id` optional (it has a DB default),
	 * but this always supplies it from the domain entity — narrowing here lets update()'s WHERE
	 * clause use it directly instead of every call site re-guarding against `undefined`. */
	private toRow(
		instance: WorkflowInstance,
	): InsertWorkflowInstance & { id: string } {
		return {
			id: instance.id,
			entityId: instance.entityId,
			entityType: instance.entityType,
			status: instance.status,
			submittedByUserId: instance.submittedByUserId,
			submittedAt: instance.submittedAt,
			validatedByUserId: instance.validatedByUserId,
			validatedAt: instance.validatedAt,
			approvedByUserId: instance.approvedByUserId,
			approvedAt: instance.approvedAt,
			publishedByUserId: instance.publishedByUserId,
			publishedAt: instance.publishedAt,
			createdAt: instance.createdAt,
			updatedAt: instance.updatedAt,
		};
	}

	async findByEntity(
		entityId: string,
		entityType: EntityType,
	): Promise<WorkflowInstance | null> {
		const rows = await this.db
			.select()
			.from(workflowInstanceTable)
			.where(
				and(
					eq(workflowInstanceTable.entityId, entityId),
					eq(workflowInstanceTable.entityType, entityType),
				),
			);

		if (rows.length === 0) {
			return null;
		}

		return WorkflowInstance.create(this.toProps(rows[0]));
	}

	async findByEntityIds(
		entityIds: string[],
		entityType: EntityType,
	): Promise<WorkflowInstance[]> {
		if (entityIds.length === 0) {
			return [];
		}

		const rows = await this.db
			.select()
			.from(workflowInstanceTable)
			.where(
				and(
					inArray(workflowInstanceTable.entityId, entityIds),
					eq(workflowInstanceTable.entityType, entityType),
				),
			);

		const instances: WorkflowInstance[] = [];
		for (const row of rows) {
			try {
				instances.push(WorkflowInstance.create(this.toProps(row)));
			} catch (err) {
				// Skip only invariant violations (Decision 7); anything else propagates (ADR-003).
				if (!(err instanceof ValidationError)) {
					throw err;
				}
				getPinoLogger().warn({
					msg: "workflow_instance.invariant_violation_skipped",
					entityId: row.entityId,
					entityType: row.entityType,
					err,
				});
			}
		}

		return instances;
	}

	/** Shared pg-error -> domain-error mapping for insert()/update() (one source of truth for
	 * this table, avoiding two near-identical if-chains). Always throws. */
	private mapWriteError(
		err: unknown,
		context: { entityId: string; entityType: EntityType },
	): never {
		const code = pgErrorCode(err);
		if (code === "23505") {
			throw new ConflictError(
				"WorkflowInstance already exists for this entityId/entityType",
				context,
			);
		}
		if (code === "23503") {
			throw new ValidationError(
				"WorkflowInstance references a nonexistent user id",
				context,
			);
		}
		if (code === "22P02") {
			throw new ValidationError(
				"WorkflowInstance has malformed input data",
				context,
			);
		}
		throw err;
	}

	/** First-time persistence only (DEF-024, 5j design.md Decision 1) — a plain INSERT relying on
	 * UNIQUE(entityId, entityType) for the first-insert race, unchanged from the old save(). */
	async insert(instance: WorkflowInstance): Promise<WorkflowInstance> {
		const row = this.toRow(instance);

		let rows: SelectWorkflowInstance[];
		try {
			rows = await this.db
				.insert(workflowInstanceTable)
				.values(row)
				.returning();
		} catch (err) {
			throw this.mapWriteError(err, {
				entityId: row.entityId,
				entityType: row.entityType,
			});
		}

		return WorkflowInstance.create(this.toProps(rows[0]));
	}

	/** Conditional UPDATE guarded on expectedUpdatedAt — never an upsert, so a deleteByEntity()
	 * racing ahead simply leaves this matching zero rows instead of resurrecting the row (5j
	 * design.md Decisions 2-4). */
	async update(
		instance: WorkflowInstance,
		expectedUpdatedAt: Date,
	): Promise<WorkflowInstance> {
		const row = this.toRow(instance);
		// entityId/entityType/createdAt are immutable after insert, so excluded from SET (5a design.md Decision 2).
		const { id, entityId, entityType, createdAt, ...setFields } = row;

		let rows: SelectWorkflowInstance[];
		try {
			rows = await this.db
				.update(workflowInstanceTable)
				.set(setFields)
				.where(
					and(
						eq(workflowInstanceTable.id, id),
						eq(workflowInstanceTable.entityId, entityId),
						eq(workflowInstanceTable.entityType, entityType),
						// Millisecond-truncated: tolerates a sub-millisecond component already stored,
						// without that alone causing a false conflict (design.md Decision 3).
						sql`date_trunc('milliseconds', ${workflowInstanceTable.updatedAt}) = date_trunc('milliseconds', ${expectedUpdatedAt.toISOString()}::timestamptz)`,
					),
				)
				.returning();
		} catch (err) {
			throw this.mapWriteError(err, { entityId, entityType });
		}

		if (rows.length > 0) {
			return WorkflowInstance.create(this.toProps(rows[0]));
		}

		return this.diagnoseUpdateConflict(id, entityId, entityType);
	}

	/** Zero-row UPDATE diagnostic re-read (design.md Decision 4) — classifies the cause, never
	 * retries the write. Always throws. Split out of update() for SRP. */
	private async diagnoseUpdateConflict(
		id: string,
		entityId: string,
		entityType: EntityType,
	): Promise<never> {
		const diagnosticRows = await this.db
			.select()
			.from(workflowInstanceTable)
			.where(eq(workflowInstanceTable.id, id));

		if (diagnosticRows.length === 0) {
			throw new ConcurrentModificationError(
				"WorkflowInstance no longer exists for this entityId/entityType",
				{ entityId, entityType },
			);
		}

		const found = diagnosticRows[0];
		if (found.entityId !== entityId || found.entityType !== entityType) {
			throw new ConflictError(
				"WorkflowInstance id already belongs to a different entity",
				{ id },
			);
		}

		throw new ConcurrentModificationError(
			"WorkflowInstance has been modified since it was read",
			{ entityId, entityType },
		);
	}

	async deleteByEntity(
		entityId: string,
		entityType: EntityType,
	): Promise<void> {
		await this.db
			.delete(workflowInstanceTable)
			.where(
				and(
					eq(workflowInstanceTable.entityId, entityId),
					eq(workflowInstanceTable.entityType, entityType),
				),
			);
	}
}
