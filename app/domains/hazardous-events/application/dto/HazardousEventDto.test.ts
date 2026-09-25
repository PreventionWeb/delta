import { describe, expect, it } from "vitest";
import {
	HazardousEvent,
	type HazardousEventProps,
} from "../../domain/HazardousEvent";
import { WorkflowInstance } from "~/domains/validation-workflow/domain/WorkflowInstance";
import { toHazardousEventDto } from "./HazardousEventDto";

const baseHazardousEventProps: HazardousEventProps = {
	id: "he-1",
	tenantId: "tenant-1",
	specificHazardId: "hazard-1",
	startDate: "2026-01-01",
	endDate: "2026-01-02",
	nationalSpecification: "national spec",
	description: "description",
	chainsExplanation: "chains explanation",
	magnitude: "5.0",
	recordOriginator: "originator",
	dataSource: "source",
	hazardousEventStatus: "ongoing",
	specificHazardLocalName: "local name",
	specificHazardNationalName: "national name",
	apiImportId: "api-1",
	createdByUserId: "user-1",
	updatedByUserId: null,
	submittedByUserId: null,
	submittedAt: null,
	createdAt: new Date("2026-01-01T00:00:00.000Z"),
	updatedAt: null,
	hazardDriverIds: ["driver-1", "driver-2"],
	attachments: [
		{
			id: "attachment-1",
			title: "title",
			fileKey: "key",
			fileName: "name",
			fileType: "type",
			fileSize: 100,
		},
	],
	fieldValues: [{ hazardTypeFieldDefinitionId: "field-1", value: "value-1" }],
	customFieldValues: [
		{ hazardTypeCustomFieldDefinitionId: "custom-1", value: "custom-value" },
	],
};

function makeHazardousEvent(
	overrides: Partial<HazardousEventProps> = {},
): HazardousEvent {
	return HazardousEvent.create(
		{ ...baseHazardousEventProps, ...overrides },
		new Set(["driver-1", "driver-2"]),
		new Set(["custom-1"]),
	);
}

function makeWorkflowInstance(
	overrides: Partial<Parameters<typeof WorkflowInstance.create>[0]> = {},
): WorkflowInstance {
	return WorkflowInstance.create({
		id: "workflow-1",
		entityId: "he-1",
		entityType: "HE",
		status: "DRAFT",
		submittedByUserId: null,
		submittedAt: null,
		validatedByUserId: null,
		validatedAt: null,
		approvedByUserId: null,
		approvedAt: null,
		publishedByUserId: null,
		publishedAt: null,
		createdAt: new Date("2026-01-01T00:00:00.000Z"),
		updatedAt: new Date("2026-01-01T00:00:00.000Z"),
		...overrides,
	});
}

describe("toHazardousEventDto", () => {
	it("maps every field, serializes Date fields as ISO strings, and takes workflowStatus from the passed-in WorkflowInstance", () => {
		const submittedAt = new Date("2026-01-03T00:00:00.000Z");
		const updatedAt = new Date("2026-01-04T00:00:00.000Z");
		const event = makeHazardousEvent({ submittedAt, updatedAt });
		const workflowInstance = makeWorkflowInstance({ status: "DRAFT" });

		const dto = toHazardousEventDto(event, workflowInstance);

		expect(dto.id).toBe("he-1");
		expect(dto.tenantId).toBe("tenant-1");
		expect(dto.specificHazardId).toBe("hazard-1");
		expect(dto.startDate).toBe("2026-01-01");
		expect(dto.endDate).toBe("2026-01-02");
		expect(dto.nationalSpecification).toBe("national spec");
		expect(dto.description).toBe("description");
		expect(dto.chainsExplanation).toBe("chains explanation");
		expect(dto.magnitude).toBe("5.0");
		expect(dto.recordOriginator).toBe("originator");
		expect(dto.dataSource).toBe("source");
		expect(dto.hazardousEventStatus).toBe("ongoing");
		expect(dto.specificHazardLocalName).toBe("local name");
		expect(dto.specificHazardNationalName).toBe("national name");
		expect(dto.apiImportId).toBe("api-1");
		expect(dto.createdByUserId).toBe("user-1");
		expect(dto.updatedByUserId).toBeNull();
		expect(dto.submittedByUserId).toBeNull();
		expect(dto.submittedAt).toBe(submittedAt.toISOString());
		expect(dto.createdAt).toBe(baseHazardousEventProps.createdAt.toISOString());
		expect(dto.updatedAt).toBe(updatedAt.toISOString());
		expect(dto.hazardDriverIds).toEqual(["driver-1", "driver-2"]);
		expect(dto.attachments).toEqual(baseHazardousEventProps.attachments);
		expect(dto.fieldValues).toEqual(baseHazardousEventProps.fieldValues);
		expect(dto.customFieldValues).toEqual(
			baseHazardousEventProps.customFieldValues,
		);
		expect(dto.workflowStatus).toBe("DRAFT");
	});

	it("maps every nullable Date field as null, not as a thrown error, when unset", () => {
		const event = makeHazardousEvent({
			submittedAt: null,
			updatedAt: null,
		});
		const workflowInstance = makeWorkflowInstance();

		const dto = toHazardousEventDto(event, workflowInstance);

		expect(dto.submittedAt).toBeNull();
		expect(dto.updatedAt).toBeNull();
	});

	it("reflects the passed-in WorkflowInstance's own status, not a hardcoded DRAFT", () => {
		const event = makeHazardousEvent();
		const workflowInstance = makeWorkflowInstance({
			status: "SUBMITTED",
			submittedByUserId: "user-1",
			submittedAt: new Date("2026-01-05T00:00:00.000Z"),
		});

		const dto = toHazardousEventDto(event, workflowInstance);

		expect(dto.workflowStatus).toBe("SUBMITTED");
	});
});
