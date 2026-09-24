import type {
	EntityType,
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
	| (ProcessWorkflowActionCommandBase & { action: "submit-validation" })
	| (ProcessWorkflowActionCommandBase & {
			action: "validate";
			/** true: composes validate()+approve() in one call; false: validate()
			 * only, status stays SUBMITTED (design.md Decision 2). */
			alsoApprove: boolean;
	  })
	| (ProcessWorkflowActionCommandBase & { action: "publish" })
	| (ProcessWorkflowActionCommandBase & { action: "return" });

/**
 * Entity-type-agnostic use case that processes a validation-workflow action
 * for a WorkflowInstance.
 */
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

		// Use `saved`, not `transitioned` — the repository may enrich on write (Decision 4).
		// A ConflictError from applyTransition() above isn't caught here, so it propagates before this line (Decision 3).
		const saved = await this.workflowRepository.save(transitioned);

		// Notify fires exactly once per successful execute(), even if status is
		// unchanged (Decision 7); a notify() failure is logged, not propagated — no rollback exists (Decision 8).
		const notification: WorkflowActionNotification = {
			instanceId: saved.id,
			entityId: saved.entityId,
			entityType: saved.entityType,
			action: command.action,
			fromStatus,
			toStatus: saved.status,
			actingUserId: command.actingUserId,
			occurredAt: now,
		};
		try {
			await this.notificationPort.notify(notification);
		} catch (err) {
			// WARN, not ERROR: this is a handled, tolerated degradation (ADR-004) — the
			// transition already succeeded, notify() failing doesn't break anything nobody
			// designed for. Guarded: execute() must still resolve after a successful save()
			// (Decision 8), even if the injected ILogger itself throws. console.error is a
			// deliberate, narrow last resort — reachable only when the sanctioned ILogger has
			// itself failed, so no other logging channel exists at that point (DEF-023).
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
}
