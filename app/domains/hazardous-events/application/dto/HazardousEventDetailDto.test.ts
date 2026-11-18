import { describe, expect, it } from "vitest";
import {
	HazardousEvent,
	type HazardousEventProps,
} from "../../domain/HazardousEvent";
import { WorkflowInstance } from "~/domains/validation-workflow/domain/WorkflowInstance";
import type { SpatialObservationRecord } from "../ports/IHazardousEventRepository";
import { toHazardousEventDto } from "./HazardousEventDto";
import { toSpatialObservationDto } from "./SpatialObservationDto";
import { toHazardousEventDetailDto } from "./HazardousEventDetailDto";

const baseEventProps: HazardousEventProps = {
	id: "event-A",
	tenantId: "tenant-1",
	specificHazardId: "hazard-1",
	startDate: "2026-01-01",
	endDate: "",
	nationalSpecification: "national spec",
	description: "Original",
	chainsExplanation: "chains",
	magnitude: "5.2",
	recordOriginator: "originator",
	dataSource: "source",
	hazardousEventStatus: null,
	specificHazardLocalName: "Local name",
	specificHazardNationalName: null,
	apiImportId: null,
	createdByUserId: "user-1",
	updatedByUserId: null,
	submittedByUserId: null,
	submittedAt: null,
	createdAt: new Date("2026-01-01T00:00:00.000Z"),
	updatedAt: null,
	hazardDriverIds: ["driver-a"],
	attachments: [],
	fieldValues: [],
	customFieldValues: [
		{ hazardTypeCustomFieldDefinitionId: "custom-a", value: "orig" },
	],
};

function makeEvent(
	overrides: Partial<HazardousEventProps> = {},
): HazardousEvent {
	return HazardousEvent.create(
		{ ...baseEventProps, ...overrides },
		new Set(["driver-a"]),
		new Set(["custom-a"]),
	);
}

function makeWorkflow(entityId: string): WorkflowInstance {
	return WorkflowInstance.createDraft({
		id: `workflow-${entityId}`,
		entityId,
		entityType: "HE",
		now: new Date("2026-01-01T00:00:00.000Z"),
	});
}

function makeObservationRecord(
	overrides: Partial<SpatialObservationRecord> = {},
): SpatialObservationRecord {
	return {
		id: "observation-1",
		hazardousEventId: "event-A",
		observationTime: new Date("2026-01-02T00:00:00.000Z"),
		note: null,
		geometries: [{ type: "Point" }],
		divisionIds: ["div-1"],
		createdAt: new Date("2026-01-01T00:00:00.000Z"),
		updatedAt: new Date("2026-01-03T00:00:00.000Z"),
		...overrides,
	};
}

describe("toHazardousEventDetailDto", () => {
	it("spreads every field toHazardousEventDto itself returns, unchanged", () => {
		const event = makeEvent();
		const workflow = makeWorkflow(event.id);
		const expectedBase = toHazardousEventDto(event, workflow);

		const result = toHazardousEventDetailDto(event, workflow, null, null);

		expect(result).toMatchObject(expectedBase);
	});

	it("resolves currentSpatialObservation to null when given a null record", () => {
		const event = makeEvent();
		const workflow = makeWorkflow(event.id);

		const result = toHazardousEventDetailDto(event, workflow, null, null);

		expect(result.currentSpatialObservation).toBeNull();
	});

	it("resolves currentSpatialObservation to the real mapped shape when given a record", () => {
		const event = makeEvent();
		const workflow = makeWorkflow(event.id);
		const record = makeObservationRecord();

		const result = toHazardousEventDetailDto(event, workflow, record, null);

		expect(result.currentSpatialObservation).toEqual(
			toSpatialObservationDto(record),
		);
	});

	it("resolves workflowStatus to null when given a null WorkflowInstance (DEF-031)", () => {
		const event = makeEvent();

		const result = toHazardousEventDetailDto(event, null, null, null);

		expect(result.workflowStatus).toBeNull();
		expect(result.id).toBe(event.id);
	});

	it("resolves workflowStatus to the instance's own status when given a real WorkflowInstance", () => {
		const event = makeEvent();
		const workflow = makeWorkflow(event.id);

		const result = toHazardousEventDetailDto(event, workflow, null, null);

		expect(result.workflowStatus).toBe(workflow.status);
	});

	it("resolves the three taxonomy name fields when given a match", () => {
		const event = makeEvent();

		const result = toHazardousEventDetailDto(event, null, null, {
			specificHazardName: "Cholera",
			hazardClusterName: "Infectious disease",
			hazardTypeName: "Biological",
			specificHazardCode: "code-1",
		});

		expect(result.specificHazardName).toBe("Cholera");
		expect(result.hazardClusterName).toBe("Infectious disease");
		expect(result.hazardTypeName).toBe("Biological");
	});

	it("resolves specificHazardCode when given a match (design.md Decision 10, Fix 1)", () => {
		const event = makeEvent();

		const result = toHazardousEventDetailDto(event, null, null, {
			specificHazardName: "Cholera",
			hazardClusterName: "Infectious disease",
			hazardTypeName: "Biological",
			specificHazardCode: "MH0103",
		});

		expect(result.specificHazardCode).toBe("MH0103");
	});

	it("resolves specificHazardCode to null when no taxonomy match exists", () => {
		const event = makeEvent();

		const result = toHazardousEventDetailDto(event, null, null, null);

		expect(result.specificHazardCode).toBeNull();
	});

	it("resolves all three taxonomy name fields to null when no match is given", () => {
		const event = makeEvent();

		const result = toHazardousEventDetailDto(event, null, null, null);

		expect(result.specificHazardName).toBeNull();
		expect(result.hazardClusterName).toBeNull();
		expect(result.hazardTypeName).toBeNull();
	});

	describe("cause", () => {
		it("defaults to null when omitted", () => {
			const event = makeEvent();

			const result = toHazardousEventDetailDto(event, null, null, null);

			expect(result.cause).toBeNull();
		});

		it("resolves to the given cause object unchanged when provided", () => {
			const event = makeEvent();
			const cause = {
				id: "cause-1",
				displayName: "Flood",
				causalityExplanation: "upstream flooding",
				specificHazardCode: "MH0103",
				description: "Flood description",
			};

			const result = toHazardousEventDetailDto(event, null, null, null, cause);

			expect(result.cause).toEqual(cause);
		});

		it("passes specificHazardCode and description through unchanged, including when null/empty (design.md Decision 14, Finding 6)", () => {
			const event = makeEvent();
			const cause = {
				id: "cause-1",
				displayName: "Flood",
				causalityExplanation: null,
				specificHazardCode: null,
				description: "",
			};

			const result = toHazardousEventDetailDto(event, null, null, null, cause);

			expect(result.cause?.specificHazardCode).toBeNull();
			expect(result.cause?.description).toBe("");
		});
	});

	describe("effects", () => {
		it("defaults to an empty array when omitted", () => {
			const event = makeEvent();

			const result = toHazardousEventDetailDto(event, null, null, null);

			expect(result.effects).toEqual([]);
		});

		it("resolves to the given effects array unchanged when provided", () => {
			const event = makeEvent();
			const effects = [
				{
					id: "effect-1",
					displayName: "Landslide",
					causalityExplanation: null,
					specificHazardCode: "MH0103",
					description: "Landslide description",
				},
			];

			const result = toHazardousEventDetailDto(
				event,
				null,
				null,
				null,
				null,
				effects,
			);

			expect(result.effects).toEqual(effects);
		});

		it("passes each effect's specificHazardCode and description through unchanged, including when null/empty (design.md Decision 14, Finding 6)", () => {
			const event = makeEvent();
			const effects = [
				{
					id: "effect-1",
					displayName: "Landslide",
					causalityExplanation: null,
					specificHazardCode: null,
					description: "",
				},
			];

			const result = toHazardousEventDetailDto(
				event,
				null,
				null,
				null,
				null,
				effects,
			);

			expect(result.effects[0].specificHazardCode).toBeNull();
			expect(result.effects[0].description).toBe("");
		});
	});

	describe("auditLog", () => {
		it("defaults to an empty array when omitted", () => {
			const event = makeEvent();

			const result = toHazardousEventDetailDto(event, null, null, null);

			expect(result.auditLog).toEqual([]);
		});

		it("resolves to the given auditLog array unchanged when provided", () => {
			const event = makeEvent();
			const auditLog = [
				{
					id: "audit-1",
					action: "Create hazardous event",
					actorName: "Test",
					timestamp: "2026-01-01T00:00:00.000Z",
				},
			];

			const result = toHazardousEventDetailDto(
				event,
				null,
				null,
				null,
				null,
				[],
				auditLog,
			);

			expect(result.auditLog).toEqual(auditLog);
		});
	});
});
