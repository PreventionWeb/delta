import type {
	EntityType,
	Status,
	TransitionParams,
	WorkflowInstance,
} from "../../domain/WorkflowInstance";
import type { IWorkflowRepository } from "../ports/IWorkflowRepository";
import type {
	INotificationPort,
	WorkflowActionNotification,
} from "../ports/INotificationPort";
import type { WorkflowInstanceDto } from "../dto/WorkflowInstanceDto";
import { toWorkflowInstanceDto } from "../dto/WorkflowInstanceDto";
import { WorkflowInstanceNotFoundError } from "../errors/WorkflowInstanceErrors";
import { isWorkflowActionAuthorized } from "../isWorkflowActionAuthorized";
import type { ILogger } from "~/shared/logging/ILogger";
import type { IAuditLogPort } from "~/domains/shared/audit-log/application/ports/IAuditLogPort";
import { AuthorizationError, ValidationError } from "~/shared/errors";

interface ProcessWorkflowActionCommandBase {
	entityId: string;
	entityType: EntityType;
	/** Added for the audit-write hook's own countryAccountsId (design.md Decision 8) -- not read anywhere else in execute(). */
	tenantId: string;
	actingUserId: string;
}

/** Local, domain-agnostic lookup (design.md Decision 7) -- an unmapped entityType skips the
 * audit write (WARN-logged) instead of throwing. */
const ENTITY_TYPE_TABLE_NAME: Partial<Record<EntityType, string>> = {
	HE: "hazardous_event",
};

export type ProcessWorkflowActionCommand =
	| (ProcessWorkflowActionCommandBase & {
			action: "submit-validation";
			/** Caller-resolved (e.g. form data), not looked up here — keeps this domain free of
			 * HIP/HE/DE/DR-specific data access (design.md Decision 3). */
			validatorUserIds: readonly string[];
			recordDisplayName: string;
			recordDate: string;
	  })
	| (ProcessWorkflowActionCommandBase & {
			action: "validate";
			/** true composes validate()+approve() in one call; false validates only, status
			 * stays SUBMITTED (design.md Decision 2). */
			alsoApprove: boolean;
	  })
	| (ProcessWorkflowActionCommandBase & { action: "publish" })
	| (ProcessWorkflowActionCommandBase & {
			action: "return";
			rejectionComments: string;
			/** Non-empty: notify these assignees instead of the submitter (design.md Decision 2). */
			assigneeUserIds?: readonly string[];
	  })
	| (ProcessWorkflowActionCommandBase & {
			action: "submit-draft";
			/** Decision 26: a minimal generic backstop (reject undefined/"data-viewer"), not a
			 * replica of HE's own richer status-aware edit-permission rule. */
			actingUserRole: string | undefined;
	  })
	| (ProcessWorkflowActionCommandBase & {
			action: "direct-validate";
			/** Checked here, not only at the route layer (code review finding, same precedent as
			 * the submit-validation empty-validator check) -- a future caller (e.g. a REST
			 * controller) gets the invariant for free instead of having to reimplement it. */
			actingUserRole: string | undefined;
	  })
	| (ProcessWorkflowActionCommandBase & {
			action: "direct-publish";
			actingUserRole: string | undefined;
	  });

/** Excludes the three no-notify actions (Decision 5/6) so buildNotification()'s exhaustiveness check stays scoped to the four that notify. */
type NotifiableCommand = Exclude<
	ProcessWorkflowActionCommand,
	| { action: "submit-draft" }
	| { action: "direct-validate" }
	| { action: "direct-publish" }
>;

function isNotifiable(
	command: ProcessWorkflowActionCommand,
): command is NotifiableCommand {
	return (
		command.action !== "submit-draft" &&
		command.action !== "direct-validate" &&
		command.action !== "direct-publish"
	);
}

/** Entity-type-agnostic: processes a validation-workflow action for a WorkflowInstance. */
export class ProcessWorkflowActionUseCase {
	constructor(
		private readonly logger: ILogger,
		private readonly workflowRepository: IWorkflowRepository,
		private readonly notificationPort: INotificationPort,
		private readonly auditLogPort: Pick<IAuditLogPort, "record">,
	) {}

	async execute(
		command: ProcessWorkflowActionCommand,
	): Promise<WorkflowInstanceDto> {
		// Fail fast, not swallowed later as a silent WARN by Decision 6's own tolerated-failure
		// catch; inlined to avoid importing HE's assertNonEmptyString (Decision 3).
		if (
			typeof command.tenantId !== "string" ||
			command.tenantId.trim().length === 0
		) {
			throw new ValidationError("tenantId must not be empty");
		}

		// Authoritative here, not just at the route layer (SOLID review, DIP finding) -- every
		// caller gets the invariant; composeWorkflowAction.server.ts's own check just skips a lookup.
		if (
			command.action === "submit-validation" &&
			command.validatorUserIds.length === 0
		) {
			throw new ValidationError(
				"At least one validator must be selected for submit-validation",
			);
		}

		// Authorization is a business rule, not a presentation concern (code review finding,
		// researched) -- same reasoning as above, moved here so every caller enforces it.
		// isWorkflowActionAuthorized is the single predicate shared with HE's own
		// presentation-layer fail-fast guard (drift risk closed -- see its own docstring).
		if (
			(command.action === "direct-validate" ||
				command.action === "direct-publish") &&
			!isWorkflowActionAuthorized(command.action, command.actingUserRole)
		) {
			throw new AuthorizationError(`${command.action} requires the admin role`);
		}

		// Decision 26: resetToDraft's own allowedFrom is every status, so the entity
		// provides no backstop against who calls it, unlike direct-validate/direct-publish.
		if (
			command.action === "submit-draft" &&
			!isWorkflowActionAuthorized("submit-draft", command.actingUserRole)
		) {
			throw new AuthorizationError(
				"submit-draft requires an edit-capable role",
			);
		}

		// Single internally-computed clock reading, not accepted from the command (design.md Decision 10).
		const now = new Date();

		const existing = await this.workflowRepository.findByEntity(
			command.entityId,
			command.entityType,
		);
		if (existing === null) {
			throw new WorkflowInstanceNotFoundError(
				command.entityId,
				command.entityType,
			);
		}

		const fromStatus = existing.status;
		const transitionParams: TransitionParams = {
			userId: command.actingUserId,
			now,
		};
		const transitioned = this.applyTransition(
			existing,
			command,
			transitionParams,
		);

		// `saved` (not `transitioned`) is used below — the repository may enrich on write.
		// ConflictError from applyTransition() above propagates uncaught, before this line.
		// expectedUpdatedAt is existing's pre-transition value, used by update() to detect
		// concurrent writes; ConcurrentModificationError propagates unmodified.
		const saved = await this.workflowRepository.update(
			transitioned,
			existing.updatedAt,
		);

		// Notify fires once per notifiable action (Decision 7); the three no-notify actions skip
		// it entirely (Decision 5/6). A notify() failure is logged, not propagated (Decision 8).
		if (isNotifiable(command)) {
			const notification = this.buildNotification(
				command,
				saved,
				fromStatus,
				now,
			);
			try {
				await this.notificationPort.notify(notification);
			} catch (err) {
				this.logToleratedFailure(
					"workflow_action.notify_failed",
					err,
					notification,
				);
			}
		}

		// Independent of the notify() block above (Decision 6) -- one failing must not suppress or skip the other.
		await this.recordAuditEntry(command, fromStatus, saved);

		this.logger.info({
			msg: "workflow_action.processed",
			instanceId: saved.id,
			entityId: saved.entityId,
			entityType: saved.entityType,
			action: command.action,
			fromStatus,
			toStatus: saved.status,
			actingUserId: command.actingUserId,
		});

		return toWorkflowInstanceDto(saved);
	}

	/** Unmapped entityType skips (Decision 7); record() failures are tolerated like notify()'s (Decision 6). */
	private async recordAuditEntry(
		command: ProcessWorkflowActionCommand,
		fromStatus: Status,
		saved: WorkflowInstance,
	): Promise<void> {
		const tableName = ENTITY_TYPE_TABLE_NAME[command.entityType];
		if (tableName === undefined) {
			this.logger.warn({
				msg: "workflow_action.audit_write_skipped_unmapped_entity_type",
				entityType: command.entityType,
				entityId: command.entityId,
				action: command.action,
			});
			return;
		}
		const auditEntry = {
			tableName,
			recordId: command.entityId,
			userId: command.actingUserId,
			action: command.action,
			oldValues: { status: fromStatus },
			newValues: { status: saved.status },
			countryAccountsId: command.tenantId,
		};
		try {
			await this.auditLogPort.record(auditEntry);
		} catch (err) {
			this.logToleratedFailure(
				"workflow_action.audit_write_failed",
				err,
				auditEntry,
			);
		}
	}

	/** Shared by the notify()/audit-write tolerated-degradation blocks (ADR-004/DEF-023):
	 * WARN-log, falling back to console.error only if the injected ILogger itself throws. */
	private logToleratedFailure(
		msg: string,
		err: unknown,
		context: object,
	): void {
		try {
			this.logger.warn({ msg, err, ...context });
		} catch {
			// eslint-disable-next-line no-console -- last resort once ILogger itself has failed
			console.error(`${msg} (logger also failed)`, err, context);
		}
	}

	/** design.md Decision 1's action → entity-method mapping table. */
	private applyTransition(
		existing: WorkflowInstance,
		command: ProcessWorkflowActionCommand,
		transitionParams: TransitionParams,
	): WorkflowInstance {
		switch (command.action) {
			case "submit-validation":
				return existing.submit(transitionParams);
			case "validate": {
				const validated = existing.validate(transitionParams);
				return command.alsoApprove
					? validated.approve(transitionParams)
					: validated;
			}
			case "publish":
				return existing.publish(transitionParams);
			case "return":
				return existing.requestRevision(transitionParams);
			case "submit-draft":
				return existing.resetToDraft(transitionParams);
			case "direct-validate":
				return existing.directValidate(transitionParams);
			case "direct-publish":
				return existing.directPublish(transitionParams);
			default: {
				// Exhaustiveness guard — a new action added to the union without a matching case fails to compile.
				const exhaustiveCheck: never = command;
				throw new Error(
					`Unhandled ProcessWorkflowActionCommand action: ${JSON.stringify(exhaustiveCheck)}`,
				);
			}
		}
	}

	/** Builds the discriminated-union variant matching `command.action` (gate 5 SOLID review,
	 * ISP finding) — each branch literal is checked against its own union member. The
	 * conditional spread for `assigneeUserIds` keeps it absent (not present-but-undefined)
	 * when omitted. */
	private buildNotification(
		command: NotifiableCommand,
		saved: WorkflowInstance,
		fromStatus: Status,
		now: Date,
	): WorkflowActionNotification {
		const base = {
			instanceId: saved.id,
			entityId: saved.entityId,
			entityType: saved.entityType,
			fromStatus,
			toStatus: saved.status,
			actingUserId: command.actingUserId,
			occurredAt: now,
			submittedByUserId: saved.submittedByUserId,
		};

		switch (command.action) {
			case "submit-validation":
				return {
					...base,
					action: "submit-validation",
					validatorUserIds: command.validatorUserIds,
					recordDisplayName: command.recordDisplayName,
					recordDate: command.recordDate,
				};
			case "validate":
				return { ...base, action: "validate" };
			case "publish":
				return { ...base, action: "publish" };
			case "return":
				return {
					...base,
					action: "return",
					rejectionComments: command.rejectionComments,
					...(command.assigneeUserIds !== undefined
						? { assigneeUserIds: command.assigneeUserIds }
						: {}),
				};
			default: {
				const exhaustiveCheck: never = command;
				throw new Error(
					`Unhandled ProcessWorkflowActionCommand action: ${JSON.stringify(exhaustiveCheck)}`,
				);
			}
		}
	}
}
