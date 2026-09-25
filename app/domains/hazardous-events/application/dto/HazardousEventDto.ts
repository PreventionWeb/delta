import type {
	HazardousEvent,
	HazardousEventAttachmentProps,
	HazardousEventCustomFieldValueProps,
	HazardousEventFieldValueProps,
	HazardousEventStatus,
} from "../../domain/HazardousEvent";
import type {
	Status,
	WorkflowInstance,
} from "~/domains/validation-workflow/domain/WorkflowInstance";

/**
 * Serialisable representation of a HazardousEvent crossing the
 * application-to-presentation boundary; dates as ISO 8601 strings.
 */
export interface HazardousEventDto {
	id: string;
	tenantId: string;
	specificHazardId: string;
	startDate: string;
	endDate: string;
	nationalSpecification: string;
	description: string;
	chainsExplanation: string;
	magnitude: string;
	recordOriginator: string;
	dataSource: string;
	hazardousEventStatus: HazardousEventStatus | null;
	specificHazardLocalName: string | null;
	specificHazardNationalName: string | null;
	apiImportId: string | null;
	createdByUserId: string | null;
	updatedByUserId: string | null;
	submittedByUserId: string | null;
	submittedAt: string | null;
	createdAt: string;
	updatedAt: string | null;
	hazardDriverIds: readonly string[];
	attachments: readonly HazardousEventAttachmentProps[];
	fieldValues: readonly HazardousEventFieldValueProps[];
	customFieldValues: readonly HazardousEventCustomFieldValueProps[];
	/** Not narrowed to "DRAFT" — this DTO shape is reused for any Status (4d). Named
	 * workflowStatus, not status, to avoid colliding with the entity's own unrelated
	 * hazardousEventStatus (design.md Decision 6). */
	workflowStatus: Status;
}

/** Pure mapper — see `toNoticeDto`'s own WHY comment for why this lives outside the domain layer. */
export function toHazardousEventDto(
	event: HazardousEvent,
	workflowInstance: WorkflowInstance,
): HazardousEventDto {
	return {
		id: event.id,
		tenantId: event.tenantId,
		specificHazardId: event.specificHazardId,
		startDate: event.startDate,
		endDate: event.endDate,
		nationalSpecification: event.nationalSpecification,
		description: event.description,
		chainsExplanation: event.chainsExplanation,
		magnitude: event.magnitude,
		recordOriginator: event.recordOriginator,
		dataSource: event.dataSource,
		hazardousEventStatus: event.hazardousEventStatus,
		specificHazardLocalName: event.specificHazardLocalName,
		specificHazardNationalName: event.specificHazardNationalName,
		apiImportId: event.apiImportId,
		createdByUserId: event.createdByUserId,
		updatedByUserId: event.updatedByUserId,
		submittedByUserId: event.submittedByUserId,
		submittedAt: event.submittedAt?.toISOString() ?? null,
		createdAt: event.createdAt.toISOString(),
		updatedAt: event.updatedAt?.toISOString() ?? null,
		hazardDriverIds: event.hazardDriverIds,
		attachments: event.attachments,
		fieldValues: event.fieldValues,
		customFieldValues: event.customFieldValues,
		workflowStatus: workflowInstance.status,
	};
}
