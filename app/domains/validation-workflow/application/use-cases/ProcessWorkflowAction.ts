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
import type { ILogger } from "~/shared/logging/ILogger";

interface ProcessWorkflowActionCommandBase {
	entityId: string;
	entityType: EntityType;
	actingUserId: string;
}

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
	  });

/** Entity-type-agnostic: processes a validation-workflow action for a WorkflowInstance. */
export class ProcessWorkflowActionUseCase {
	constructor(
		private readonly logger: ILogger,
		private readonly workflowRepository: IWorkflowRepository,
		private readonly notificationPort: INotificationPort,
	) {}

	async execute(
		command: ProcessWorkflowActionCommand,
	): Promise<WorkflowInstanceDto> {
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

		// Notify fires exactly once per successful execute(), even if status is
		// unchanged (Decision 7); a notify() failure is logged, not propagated — no rollback exists (Decision 8).
		const notification = this.buildNotification(
			command,
			saved,
			fromStatus,
			now,
		);
		try {
			await this.notificationPort.notify(notification);
		} catch (err) {
			// WARN, not ERROR: a handled, tolerated degradation (ADR-004) — the transition
			// already succeeded, notify() failing doesn't break anything. Guarded so execute()
			// still resolves after a successful update() (Decision 8) even if the injected
			// ILogger itself throws; console.error is the deliberate last resort, reachable
			// only when ILogger has also failed (DEF-023).
			try {
				this.logger.warn({
					msg: "workflow_action.notify_failed",
					err,
					...notification,
				});
			} catch {
				// eslint-disable-next-line no-console -- last resort once ILogger itself has failed
				console.error(
					"workflow_action.notify_failed (logger also failed)",
					err,
					notification,
				);
			}
		}

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
		command: ProcessWorkflowActionCommand,
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
