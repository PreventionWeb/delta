import type {
	EntityType,
	Status,
	WorkflowInstance,
} from "../../domain/WorkflowInstance";
import type { IWorkflowRepository } from "../ports/IWorkflowRepository";
import {
	STATUS_CHANGE_NOT_SUPPORTED,
	WorkflowInstanceNotFoundError,
} from "../errors/WorkflowInstanceErrors";
import { isWorkflowActionAuthorized } from "../isWorkflowActionAuthorized";
import { ENTITY_TYPE_AUDIT_TABLE_NAME } from "../entityTypeAuditTableName";
import type { IAuditLogPort } from "~/domains/shared/audit-log/application/ports/IAuditLogPort";
import type { Tx } from "~/db.server";
import {
	AuthorizationError,
	ConflictError,
	ValidationError,
} from "~/shared/errors";

/** No legacy value maps to REJECTED (DEF-022). */
export type ImportedWorkflowStatus = Exclude<Status, "REJECTED">;

export interface ApplyImportedWorkflowStatusCommand {
	entityId: string;
	entityType: EntityType;
	tenantId: string;
	targetStatus: ImportedWorkflowStatus;
	actingUserId: string;
	actingUserRole: string | null;
	/** Required: the status change commits or rolls back with the caller's import. */
	tx: Tx;
}

const IMPORTABLE_FROM: ReadonlySet<Status> = new Set([
	"DRAFT",
	"REVISION_REQUESTED",
]);

/** D12 paths, using only WorkflowInstance's own transitions so REQUIRED_SET/NULL hold. */
function walkToTarget(
	instance: WorkflowInstance,
	target: ImportedWorkflowStatus,
	params: { userId: string; now: Date },
): WorkflowInstance {
	switch (target) {
		case "SUBMITTED":
			return instance.submit(params);
		case "REVISION_REQUESTED":
			return instance.submit(params).requestRevision(params);
		case "APPROVED":
			return instance.directValidate(params);
		case "PUBLISHED":
			return instance.directPublish(params);
		case "DRAFT":
			throw unsupported(instance, target);
	}
}

function unsupported(
	instance: WorkflowInstance,
	target: ImportedWorkflowStatus,
): ConflictError {
	return new ConflictError(
		`Cannot import status ${target} onto a WorkflowInstance in status ${instance.status}`,
		{
			reason: STATUS_CHANGE_NOT_SUPPORTED,
			entityId: instance.entityId,
			from: instance.status,
			to: target,
		},
	);
}

/** Moves an entity's WorkflowInstance to an imported status inside the caller's transaction (D12).
 * Never notifies (NOD-3) and never logs; the caller logs once after its commit (ADR-004). */
export class ApplyImportedWorkflowStatusUseCase {
	constructor(
		private readonly workflowRepository: IWorkflowRepository,
		private readonly auditLogPort: Pick<IAuditLogPort, "record">,
	) {}

	async execute(
		command: ApplyImportedWorkflowStatusCommand,
	): Promise<WorkflowInstance> {
		if ((command.targetStatus as Status) === "REJECTED") {
			throw new ValidationError("REJECTED cannot be imported");
		}
		// Same admin-only rule as direct-validate/direct-publish (NOD-2), checked before any read.
		if (
			command.targetStatus !== "DRAFT" &&
			!isWorkflowActionAuthorized(
				"direct-publish",
				command.actingUserRole ?? undefined,
			)
		) {
			throw new AuthorizationError(
				"Importing a non-draft workflow status requires the admin role",
			);
		}
		const tableName = ENTITY_TYPE_AUDIT_TABLE_NAME[command.entityType];
		if (tableName === undefined) {
			throw new ValidationError(
				`No audit table is mapped for entity type ${command.entityType}`,
			);
		}

		const instance = await this.workflowRepository.findByEntity(
			command.entityId,
			command.entityType,
			command.tx,
		);
		if (instance === null) {
			throw new WorkflowInstanceNotFoundError(
				command.entityId,
				command.entityType,
			);
		}
		if (instance.status === command.targetStatus) {
			return instance;
		}
		if (!IMPORTABLE_FROM.has(instance.status)) {
			throw unsupported(instance, command.targetStatus);
		}

		const next = walkToTarget(instance, command.targetStatus, {
			userId: command.actingUserId,
			now: new Date(),
		});
		const saved = await this.workflowRepository.update(
			next,
			instance.updatedAt,
			command.tx,
		);
		// Unlike ProcessWorkflowAction, a failed audit write rejects: no status change without a trail.
		await this.auditLogPort.record(
			{
				tableName,
				recordId: command.entityId,
				userId: command.actingUserId,
				action: "Workflow status imported",
				oldValues: { status: instance.status },
				newValues: { status: saved.status },
				countryAccountsId: command.tenantId,
			},
			command.tx,
		);
		return saved;
	}
}
