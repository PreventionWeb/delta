import type { HazardousEventDetailDto } from "~/domains/hazardous-events/application/dto/HazardousEventDetailDto";
import type { HazardousEventFormInitialValues } from "./HazardousEventFormPage";
import { mapAttachmentsToWidgetShape } from "./mapAttachmentsToWidgetShape";

/** Pure extraction of `edit.$id.tsx`'s own `initialValues={...}` object-building logic, mirroring
 * `mapAttachmentsToWidgetShape.ts`'s precedent, so it's unit-testable (design.md Decision 8). */
export function mapEventToEditFormInitialValues(
	event: HazardousEventDetailDto,
): HazardousEventFormInitialValues {
	return {
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
		attachments: mapAttachmentsToWidgetShape(event.attachments, {
			tenantId: event.tenantId,
			hazardousEventId: event.id,
		}),
		currentSpatialObservation: event.currentSpatialObservation
			? {
					geometries: event.currentSpatialObservation.geometries,
					divisionIds: event.currentSpatialObservation.divisionIds,
				}
			: null,
	};
}
