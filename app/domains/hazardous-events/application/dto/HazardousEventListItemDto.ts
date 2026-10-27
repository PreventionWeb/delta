import type { HazardousEvent } from "../../domain/HazardousEvent";
import type {
	Status,
	WorkflowInstance,
} from "~/domains/validation-workflow/domain/WorkflowInstance";
import type { HazardousEventDto } from "./HazardousEventDto";
import { mapHazardousEventFields } from "./HazardousEventDto";
import type { SpecificHazardTaxonomyNames } from "../ports/ISpecificHazardTaxonomyRepository";

export interface HazardousEventListItemDto extends Omit<
	HazardousEventDto,
	"workflowStatus"
> {
	/** null means not yet determined (e.g. migration-pending). */
	workflowStatus: Status | null;
	/** Resolved taxonomy name; null when the join found no match (design.md's reversed hazard-name decision). */
	specificHazardName: string | null;
}

export function toHazardousEventListItemDto(
	event: HazardousEvent,
	workflowInstance: WorkflowInstance | null,
	taxonomyNames: SpecificHazardTaxonomyNames | null,
): HazardousEventListItemDto {
	return {
		...mapHazardousEventFields(event),
		workflowStatus: workflowInstance?.status ?? null,
		specificHazardName: taxonomyNames?.specificHazardName ?? null,
	};
}
