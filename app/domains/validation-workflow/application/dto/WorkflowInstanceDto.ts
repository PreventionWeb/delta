import type {
	EntityType,
	Status,
	WorkflowInstance,
} from "../../domain/WorkflowInstance";

/**
 * Serialisable representation of a WorkflowInstance crossing the
 * application-to-presentation boundary; dates as ISO 8601 strings
 */
export interface WorkflowInstanceDto {
	id: string;
	entityId: string;
	entityType: EntityType;
	status: Status;
	submittedByUserId: string | null;
	submittedAt: string | null;
	validatedByUserId: string | null;
	validatedAt: string | null;
	approvedByUserId: string | null;
	approvedAt: string | null;
	publishedByUserId: string | null;
	publishedAt: string | null;
	createdAt: string;
	updatedAt: string;
}

/** Pure mapper — see `toNoticeDto`'s own WHY comment for why this lives outside the domain layer. */
export function toWorkflowInstanceDto(
	instance: WorkflowInstance,
): WorkflowInstanceDto {
	return {
		id: instance.id,
		entityId: instance.entityId,
		entityType: instance.entityType,
		status: instance.status,
		submittedByUserId: instance.submittedByUserId,
		submittedAt: instance.submittedAt?.toISOString() ?? null,
		validatedByUserId: instance.validatedByUserId,
		validatedAt: instance.validatedAt?.toISOString() ?? null,
		approvedByUserId: instance.approvedByUserId,
		approvedAt: instance.approvedAt?.toISOString() ?? null,
		publishedByUserId: instance.publishedByUserId,
		publishedAt: instance.publishedAt?.toISOString() ?? null,
		createdAt: instance.createdAt.toISOString(),
		updatedAt: instance.updatedAt.toISOString(),
	};
}
