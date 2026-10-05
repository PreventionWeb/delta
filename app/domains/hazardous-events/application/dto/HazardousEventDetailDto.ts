import type { HazardousEvent } from "../../domain/HazardousEvent";
import type { WorkflowInstance } from "~/domains/validation-workflow/domain/WorkflowInstance";
import type { SpatialObservationRecord } from "../ports/IHazardousEventRepository";
import type { HazardousEventDto } from "./HazardousEventDto";
import { toHazardousEventDto } from "./HazardousEventDto";
import type { SpatialObservationDto } from "./SpatialObservationDto";
import { toSpatialObservationDto } from "./SpatialObservationDto";

export interface HazardousEventDetailDto extends HazardousEventDto {
	currentSpatialObservation: SpatialObservationDto | null;
}

export function toHazardousEventDetailDto(
	event: HazardousEvent,
	workflowInstance: WorkflowInstance,
	currentObservation: SpatialObservationRecord | null,
): HazardousEventDetailDto {
	return {
		...toHazardousEventDto(event, workflowInstance),
		currentSpatialObservation:
			currentObservation === null
				? null
				: toSpatialObservationDto(currentObservation),
	};
}
