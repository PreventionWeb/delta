import type { EntityType, Status } from "../../domain/WorkflowInstance";

interface WorkflowActionNotificationBase {
	instanceId: string;
	entityId: string;
	entityType: EntityType;
	fromStatus: Status;
	toStatus: Status;
	actingUserId: string;
	occurredAt: Date;
	/** Sourced from the saved WorkflowInstance, never reloaded from an entity-type-specific table. */
	submittedByUserId: string | null;
}

/**
 * Self-sufficient event payload — no resolved recipient (no `notifiedUserId`/`recipientEmail`);
 * recipient resolution is the adapter's job. Discriminated union mirroring
 * `ProcessWorkflowActionCommand`'s shape (design.md Decision 1) makes a mismatched field (e.g.
 * `rejectionComments` on `"submit-validation"`) a compile error, not just documented convention.
 */
export type WorkflowActionNotification =
	| (WorkflowActionNotificationBase & {
			action: "submit-validation";
			validatorUserIds: readonly string[];
			recordDisplayName: string;
			recordDate: string;
	  })
	| (WorkflowActionNotificationBase & { action: "validate" })
	| (WorkflowActionNotificationBase & { action: "publish" })
	| (WorkflowActionNotificationBase & {
			action: "return";
			rejectionComments: string;
			assigneeUserIds?: readonly string[];
	  });

/** Implemented by EmailNotificationAdapter (infrastructure/). */
export interface INotificationPort {
	notify(notification: WorkflowActionNotification): Promise<void>;
}
