import type { HazardousEvent } from "../../domain/HazardousEvent";
import type {
	Status,
	WorkflowInstance,
} from "~/domains/validation-workflow/domain/WorkflowInstance";
import type { HazardousEventDto } from "./HazardousEventDto";
import { mapHazardousEventFields } from "./HazardousEventDto";

export interface HazardousEventListItemDto extends Omit<
	HazardousEventDto,
	"workflowStatus"
> {
	/** null means not yet determined (e.g. migration-pending). */
	workflowStatus: Status | null;
}

export function toHazardousEventListItemDto(
	event: HazardousEvent,
	workflowInstance: WorkflowInstance | null,
): HazardousEventListItemDto {
	return {
		...mapHazardousEventFields(event),
		workflowStatus: workflowInstance?.status ?? null,
	};
}
