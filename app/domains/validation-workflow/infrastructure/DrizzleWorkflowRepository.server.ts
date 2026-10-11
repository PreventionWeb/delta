import { Injectable, Inject } from "@nestjs/common";
import { and, eq, inArray } from "drizzle-orm";

import type { Dr } from "~/db.server";
import { DRIZZLE_CLIENT } from "~/infrastructure/DrizzleProvider.server";
import { getPinoLogger } from "~/infrastructure/logging/PinoLogger.server";
import { ConflictError, ValidationError } from "~/shared/errors";
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

	private toRow(instance: WorkflowInstance): InsertWorkflowInstance {
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

	async save(instance: WorkflowInstance): Promise<WorkflowInstance> {
		const row = this.toRow(instance);
		// entityId/entityType/createdAt are immutable after insert, so excluded from SET (Decision 2).
		const { id, entityId, entityType, createdAt, ...setFields } = row;

		let rows: SelectWorkflowInstance[];
		try {
			rows = await this.db
				.insert(workflowInstanceTable)
				.values(row)
				.onConflictDoUpdate({
					target: workflowInstanceTable.id,
					set: setFields,
					// Guards against an id collision silently reassigning a different entity's row
					// (Decision 3) — empty RETURNING below is how a guard failure surfaces.
					setWhere: and(
						eq(workflowInstanceTable.entityId, entityId),
						eq(workflowInstanceTable.entityType, entityType),
					),
				})
				.returning();
		} catch (err) {
			const code = pgErrorCode(err);
			if (code === "23505") {
				throw new ConflictError(
					"WorkflowInstance already exists for this entityId/entityType",
					{ entityId, entityType },
				);
			}
			if (code === "23503") {
				throw new ValidationError(
					"WorkflowInstance references a nonexistent user id",
					{ entityId, entityType },
				);
			}
			if (code === "22P02") {
				throw new ValidationError("WorkflowInstance has malformed input data", {
					entityId,
					entityType,
				});
			}
			throw err;
		}

		if (rows.length === 0) {
			throw new ConflictError(
				"WorkflowInstance id already belongs to a different entity",
				{ id },
			);
		}

		return WorkflowInstance.create(this.toProps(rows[0]));
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
