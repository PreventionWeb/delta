import { describe, expect, it } from "vitest";
import type { HazardousEventDetailDto } from "~/domains/hazardous-events/application/dto/HazardousEventDetailDto";
import type { HazardousEventAttachmentProps } from "~/domains/hazardous-events/domain/HazardousEvent";
import { mapAttachmentsToWidgetShape } from "./mapAttachmentsToWidgetShape";
import { mapEventToEditFormInitialValues } from "./mapEventToEditFormInitialValues";

/** Minimal-but-complete DTO fixture -- param is a `Pick` of the real detail DTO, not a bespoke
 * shape (loader hands it the full DTO as-is). */
function baseEvent(): HazardousEventDetailDto {
	return {
		id: "event-1",
		tenantId: "tenant-1",
		specificHazardId: "hazard-1",
		startDate: "2026-01-01",
		endDate: "2026-01-02",
		nationalSpecification: "national-spec",
		description: "description",
		chainsExplanation: "chains-explanation",
		magnitude: "magnitude",
		recordOriginator: "originator",
		dataSource: "data-source",
		hazardousEventStatus: "ongoing",
		specificHazardLocalName: null,
		specificHazardNationalName: null,
		apiImportId: null,
		createdByUserId: null,
		updatedByUserId: null,
		submittedByUserId: null,
		submittedAt: null,
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: null,
		hazardDriverIds: [],
		attachments: [],
		fieldValues: [],
		customFieldValues: [],
		workflowStatus: null,
		currentSpatialObservation: null,
		specificHazardName: null,
		hazardClusterName: null,
		hazardTypeName: null,
		specificHazardCode: null,
		cause: null,
		effects: [],
		auditLog: [],
	};
}

describe("mapEventToEditFormInitialValues", () => {
	it("maps a non-null currentSpatialObservation through, preserving geometries and divisionIds", () => {
		const geometry = { type: "Point", coordinates: [1, 2] };
		const event: HazardousEventDetailDto = {
			...baseEvent(),
			currentSpatialObservation: {
				id: "obs-1",
				hazardousEventId: "event-1",
				observationTime: "2026-01-01T00:00:00.000Z",
				note: null,
				geometries: [geometry],
				divisionIds: ["division-1"],
				createdAt: "2026-01-01T00:00:00.000Z",
				updatedAt: "2026-01-01T00:00:00.000Z",
			},
		};

		const result = mapEventToEditFormInitialValues(event);

		expect(result.currentSpatialObservation).toEqual({
			geometries: [geometry],
			divisionIds: ["division-1"],
		});
	});

	it("maps a null currentSpatialObservation to null, not undefined", () => {
		const event: HazardousEventDetailDto = {
			...baseEvent(),
			currentSpatialObservation: null,
		};

		const result = mapEventToEditFormInitialValues(event);

		expect(result.currentSpatialObservation).toBeNull();
	});

	it("maps the remaining form fields through unchanged, matching edit.$id.tsx's current inline object", () => {
		const attachment: HazardousEventAttachmentProps = {
			id: "att-1",
			title: "Photo",
			type: "Link",
			url: "https://example.com",
			tag: null,
			fileKey: null,
			fileName: null,
			fileType: null,
			fileSize: null,
		};
		const event: HazardousEventDetailDto = {
			...baseEvent(),
			attachments: [attachment],
		};

		const result = mapEventToEditFormInitialValues(event);

		expect(result.specificHazardId).toBe(event.specificHazardId);
		expect(result.startDate).toBe(event.startDate);
		expect(result.endDate).toBe(event.endDate);
		expect(result.nationalSpecification).toBe(event.nationalSpecification);
		expect(result.description).toBe(event.description);
		expect(result.chainsExplanation).toBe(event.chainsExplanation);
		expect(result.magnitude).toBe(event.magnitude);
		expect(result.recordOriginator).toBe(event.recordOriginator);
		expect(result.dataSource).toBe(event.dataSource);
		expect(result.hazardousEventStatus).toBe(event.hazardousEventStatus);
		expect(result.attachments).toEqual(
			mapAttachmentsToWidgetShape(event.attachments, {
				tenantId: event.tenantId,
				hazardousEventId: event.id,
			}),
		);
	});
});
