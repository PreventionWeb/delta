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
	/** Resolved taxonomy name; null when the join finds no match. */
	specificHazardName: string | null;
	hazardClusterName: string | null;
	hazardTypeName: string | null;
	/** Null when the join finds no match, same as the three name fields above. */
	specificHazardCode: string | null;
	/** Null when this event has no causal-chain parent; resolved via findCauseEdge() (design.md Decision 8). */
	cause: {
		id: string;
		displayName: string;
		causalityExplanation: string | null;
		/** Resolved taxonomy code for the subtitle; null when no match exists (Decision 14). */
		specificHazardCode: string | null;
		description: string;
	} | null;
	/** Direct children only (findEffectEdges()); a dangling, unresolvable edge is omitted, not represented as a gap. */
	effects: {
		id: string;
		displayName: string;
		causalityExplanation: string | null;
		specificHazardCode: string | null;
		description: string;
	}[];
	/** Tenant-scoped audit_logs rows, newest first (findByRecord()); timestamp is an ISO string. */
	auditLog: {
		id: string;
		action: string;
		actorName: string;
		timestamp: string;
	}[];
}

export function toHazardousEventDetailDto(
	event: HazardousEvent,
	workflowInstance: WorkflowInstance | null,
	currentObservation: SpatialObservationRecord | null,
	taxonomyNames: SpecificHazardTaxonomyNames | null,
	cause: HazardousEventDetailDto["cause"] = null,
	effects: HazardousEventDetailDto["effects"] = [],
	auditLog: HazardousEventDetailDto["auditLog"] = [],
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
		specificHazardCode: taxonomyNames?.specificHazardCode ?? null,
		cause,
		effects,
		auditLog,
	};
}
