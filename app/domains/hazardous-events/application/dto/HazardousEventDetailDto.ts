import type { HazardousEvent } from "../../domain/HazardousEvent";
import type {
	Status,
	WorkflowInstance,
} from "~/domains/validation-workflow/domain/WorkflowInstance";
import type { SpatialObservationRecord } from "../ports/IHazardousEventRepository";
import type { HazardousEventDto } from "./HazardousEventDto";
import { mapHazardousEventFields } from "./HazardousEventDto";
import type { SpatialObservationDto } from "./SpatialObservationDto";
import { toSpatialObservationDto } from "./SpatialObservationDto";
import type { SpecificHazardTaxonomyNames } from "../ports/ISpecificHazardTaxonomyRepository";

// Omit-and-override pattern, same as HazardousEventListItemDto (DEF-031) -- design.md Decision 3.
export interface HazardousEventDetailDto extends Omit<
	HazardousEventDto,
	"workflowStatus"
> {
	workflowStatus: Status | null;
	currentSpatialObservation: SpatialObservationDto | null;
	/** Resolved taxonomy names; null when the join found no match (design.md's reversed hazard-name decision). */
	specificHazardName: string | null;
	hazardClusterName: string | null;
	hazardTypeName: string | null;
	/** Null when this event has no causal-chain parent; resolved via
	 * ICausalChainRepository.findCauseEdge(), not carried on HazardousEvent itself. */
	cause: {
		id: string;
		displayName: string;
		causalityExplanation: string | null;
	} | null;
}

export function toHazardousEventDetailDto(
	event: HazardousEvent,
	workflowInstance: WorkflowInstance | null,
	currentObservation: SpatialObservationRecord | null,
	taxonomyNames: SpecificHazardTaxonomyNames | null,
	cause: HazardousEventDetailDto["cause"] = null,
): HazardousEventDetailDto {
	return {
		...mapHazardousEventFields(event),
		workflowStatus: workflowInstance?.status ?? null,
		currentSpatialObservation:
			currentObservation === null
				? null
				: toSpatialObservationDto(currentObservation),
		specificHazardName: taxonomyNames?.specificHazardName ?? null,
		hazardClusterName: taxonomyNames?.hazardClusterName ?? null,
		hazardTypeName: taxonomyNames?.hazardTypeName ?? null,
		cause,
	};
}
