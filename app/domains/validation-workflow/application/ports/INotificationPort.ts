import type { EntityType, Status } from "../../domain/WorkflowInstance";

/**
 * Self-sufficient event payload; carries no resolved recipient (no
 * `notifiedUserId`) — recipient resolution is an adapter's job.
 */
export interface WorkflowActionNotification {
	instanceId: string;
	entityId: string;
	entityType: EntityType;
	action: "submit-validation" | "validate" | "publish" | "return";
	fromStatus: Status;
	toStatus: Status;
	actingUserId: string;
	occurredAt: Date;
}

/** No adapter in this change — interface-now/adapter-later, matching IWorkflowRepository. */
export interface INotificationPort {
	notify(notification: WorkflowActionNotification): Promise<void>;
}
