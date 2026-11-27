import { describe, expect, it } from "vitest";
import type { Status } from "~/domains/validation-workflow/domain/WorkflowInstance";
import type { HazardousEventExportRow } from "../dto/HazardousEventExportRow";
import { exportRowCells, exportRowValues } from "./exportRowCells";

const EVENT_ID = "44444444-4444-4444-8444-444444444444";
const TENANT_ID = "66666666-6666-4666-8666-666666666666";
const SH_ID = "11111111-1111-4111-8111-111111111111";
const CAUSE_ID = "55555555-5555-4555-8555-555555555555";
const LEGACY_PARENT_ID = "77777777-7777-4777-8777-777777777777";

// design.md E1 + the appended columns, typed out from the spec.
const EXPORT_COLUMNS =
	"updatedAt,createdAt,approvalStatus,createdByUserId,updatedByUserId,submittedByUserId,submittedAt,validatedByUserId,validatedAt,publishedByUserId,publishedAt,apiImportId,hipHazardId,hipClusterId,hipTypeId,id,countryAccountsId,specificHazardId,status,nationalSpecification,startDate,endDate,description,chainsExplanation,magnitude,recordOriginator,hazardousEventStatus,dataSource,specificHazardLocalName,specificHazardNationalName,parent,spatialFootprint,attachments".split(
		",",
	);

function exportRow(
	overrides: Partial<HazardousEventExportRow> = {},
): HazardousEventExportRow {
	return {
		id: EVENT_ID,
		tenantId: TENANT_ID,
		specificHazardId: SH_ID,
		apiImportId: "A1",
		status: "pending",
		nationalSpecification: "ns",
		startDate: "2025-03",
		endDate: "2025",
		description: "desc",
		chainsExplanation: "chains",
		magnitude: "-5",
		recordOriginator: "Météo-France",
		hazardousEventStatus: "ongoing",
		dataSource: "src",
		specificHazardLocalName: "local",
		specificHazardNationalName: "national",
		createdByUserId: "creator",
		updatedByUserId: "updater",
		createdAt: new Date("2025-01-02T03:04:05.678Z"),
		updatedAt: new Date("2025-02-03T04:05:06.789Z"),
		workflowStatus: "PUBLISHED",
		workflowSubmittedByUserId: null,
		workflowSubmittedAt: null,
		workflowValidatedByUserId: "wf-validator",
		workflowValidatedAt: new Date("2025-04-01T00:00:00.000Z"),
		workflowPublishedByUserId: "wf-publisher",
		workflowPublishedAt: new Date("2025-04-02T00:00:00.000Z"),
		hazardSourceRefId: "78424",
		clusterSourceRefId: "1844",
		typeSourceRefId: "1037",
		causeId: null,
		causeCount: 0,
		legacyApprovalStatus: "validated",
		legacySubmittedByUserId: "legacy-submitter",
		legacySubmittedAt: new Date("2024-01-01T00:00:00.000Z"),
		legacyValidatedByUserId: "legacy-validator",
		legacyValidatedAt: new Date("2024-01-02T00:00:00.000Z"),
		legacyPublishedByUserId: "legacy-publisher",
		legacyPublishedAt: new Date("2024-01-03T00:00:00.000Z"),
		legacyHipHazardId: "78568",
		legacyHipClusterId: "1743",
		legacyHipTypeId: "1038",
		legacyParentId: null,
		currentObservation: null,
		legacyGeometries: [],
		legacyDivisionIds: [],
		attachments: [],
		legacyAttachments: null,
		...overrides,
	};
}

describe("exportRowCells: approvalStatus", () => {
	it.each([
		["DRAFT", "draft"],
		["SUBMITTED", "waiting-for-validation"],
		["REVISION_REQUESTED", "needs-revision"],
		["APPROVED", "validated"],
		["PUBLISHED", "published"],
		["REJECTED", ""],
	] as const)(
		"maps workflow status %s back to %j",
		(status: Status, legacy) => {
			expect(
				exportRowCells(exportRow({ workflowStatus: status })).approvalStatus,
			).toBe(legacy);
		},
	);

	it("uses the stored legacy approvalStatus when there is no WorkflowInstance", () => {
		const cells = exportRowCells(
			exportRow({
				workflowStatus: null,
				legacyApprovalStatus: "needs-revision",
			}),
		);
		expect(cells.approvalStatus).toBe("needs-revision");
	});
});

describe("exportRowCells: attribution", () => {
	it("takes submitted, validated and published pairs from the WorkflowInstance", () => {
		const cells = exportRowCells(exportRow({ workflowStatus: "PUBLISHED" }));
		expect(cells.submittedByUserId).toBe("");
		expect(cells.submittedAt).toBe("");
		expect(cells.validatedByUserId).toBe("wf-validator");
		expect(cells.validatedAt).toBe("2025-04-01T00:00:00.000Z");
		expect(cells.publishedByUserId).toBe("wf-publisher");
		expect(cells.publishedAt).toBe("2025-04-02T00:00:00.000Z");
	});

	it("falls back to the legacy attribution columns without a WorkflowInstance", () => {
		const cells = exportRowCells(exportRow({ workflowStatus: null }));
		expect(cells.submittedByUserId).toBe("legacy-submitter");
		expect(cells.submittedAt).toBe("2024-01-01T00:00:00.000Z");
		expect(cells.validatedByUserId).toBe("legacy-validator");
		expect(cells.validatedAt).toBe("2024-01-02T00:00:00.000Z");
		expect(cells.publishedByUserId).toBe("legacy-publisher");
		expect(cells.publishedAt).toBe("2024-01-03T00:00:00.000Z");
	});
});

describe("exportRowCells: HIP ids", () => {
	it("writes the taxonomy source_ref_ids of the specific hazard", () => {
		const cells = exportRowCells(exportRow());
		expect(cells.hipHazardId).toBe("78424");
		expect(cells.hipClusterId).toBe("1844");
		expect(cells.hipTypeId).toBe("1037");
		expect(cells.specificHazardId).toBe(SH_ID);
	});

	it("falls back to the stored hip_* values when specificHazardId is null", () => {
		const cells = exportRowCells(
			exportRow({
				specificHazardId: null,
				hazardSourceRefId: null,
				clusterSourceRefId: null,
				typeSourceRefId: null,
			}),
		);
		expect(cells.hipHazardId).toBe("78568");
		expect(cells.hipClusterId).toBe("1743");
		expect(cells.hipTypeId).toBe("1038");
		expect(cells.specificHazardId).toBe("");
	});
});

describe("exportRowCells: parent", () => {
	it("writes the CA cause when there is one", () => {
		const cells = exportRowCells(
			exportRow({ causeId: CAUSE_ID, legacyParentId: LEGACY_PARENT_ID }),
		);
		expect(cells.parent).toBe(CAUSE_ID);
	});

	it("falls back to the legacy parent for an unmigrated row", () => {
		const cells = exportRowCells(
			exportRow({
				specificHazardId: null,
				causeId: null,
				legacyParentId: LEGACY_PARENT_ID,
			}),
		);
		expect(cells.parent).toBe(LEGACY_PARENT_ID);
	});

	it("does not fall back on a migrated row: no CA cause means it was cleared (review M5)", () => {
		const cells = exportRowCells(
			exportRow({ causeId: null, legacyParentId: LEGACY_PARENT_ID }),
		);
		expect(cells.parent).toBe("");
	});

	it("is empty when there is neither", () => {
		expect(exportRowCells(exportRow()).parent).toBe("");
	});
});

describe("exportRowCells: dates and timestamps", () => {
	it("writes timestamps as UTC ISO 8601 with Z", () => {
		const cells = exportRowCells(
			exportRow({
				createdAt: new Date("2026-01-02T03:04:05.678+05:30"),
				updatedAt: null,
			}),
		);
		expect(cells.createdAt).toBe("2026-01-01T21:34:05.678Z");
		expect(cells.updatedAt).toBe("");
	});

	it("writes dates as stored", () => {
		const cells = exportRowCells(exportRow());
		expect(cells.startDate).toBe("2025-03");
		expect(cells.endDate).toBe("2025");
	});

	it("leaves the formula guard to the serializer", () => {
		expect(exportRowCells(exportRow()).magnitude).toBe("-5");
	});
});

describe("exportRowCells: spec scenarios", () => {
	it("exports a pre-Phase-M row in full from legacy data", () => {
		const cells = exportRowCells(
			exportRow({
				specificHazardId: null,
				hazardSourceRefId: null,
				clusterSourceRefId: null,
				typeSourceRefId: null,
				legacyHipHazardId: "78568",
				workflowStatus: null,
				legacyApprovalStatus: "validated",
				causeId: null,
				legacyParentId: LEGACY_PARENT_ID,
			}),
		);
		expect(cells.hipHazardId).toBe("78568");
		expect(cells.approvalStatus).toBe("validated");
		expect(cells.parent).toBe(LEGACY_PARENT_ID);
		expect(cells.specificHazardId).toBe("");
	});

	it("exports a CA-created published event with its CA status and HIP ids", () => {
		const cells = exportRowCells(exportRow({ workflowStatus: "PUBLISHED" }));
		expect(cells.approvalStatus).toBe("published");
		expect(cells.hipHazardId).toBe("78424");
		expect(cells.hipClusterId).toBe("1844");
		expect(cells.hipTypeId).toBe("1037");
	});

	it("exports the tenant and id", () => {
		const cells = exportRowCells(exportRow());
		expect(cells.id).toBe(EVENT_ID);
		expect(cells.countryAccountsId).toBe(TENANT_ID);
	});
});

describe("exportRowCells: null fields", () => {
	it("writes an empty cell for every null field, with or without a hazard", () => {
		const nulls = {
			createdByUserId: null,
			updatedByUserId: null,
			apiImportId: null,
			hazardousEventStatus: null,
			specificHazardLocalName: null,
			specificHazardNationalName: null,
			workflowStatus: null,
			legacySubmittedByUserId: null,
			legacyValidatedByUserId: null,
			legacyPublishedByUserId: null,
		} as const;
		const migrated = exportRowCells(
			exportRow({
				...nulls,
				hazardSourceRefId: null,
				clusterSourceRefId: null,
				typeSourceRefId: null,
			}),
		);
		const unmigrated = exportRowCells(
			exportRow({
				...nulls,
				specificHazardId: null,
				legacyHipHazardId: null,
				legacyHipClusterId: null,
				legacyHipTypeId: null,
			}),
		);
		for (const cells of [migrated, unmigrated]) {
			for (const column of [
				"createdByUserId",
				"updatedByUserId",
				"submittedByUserId",
				"validatedByUserId",
				"publishedByUserId",
				"apiImportId",
				"hipHazardId",
				"hipClusterId",
				"hipTypeId",
				"hazardousEventStatus",
				"specificHazardLocalName",
				"specificHazardNationalName",
			]) {
				expect(cells[column], column).toBe("");
			}
		}
	});
});

describe("exportRowCells: spatialFootprint (D8, OD-6)", () => {
	const D1 = "694d72d0-0000-4000-8000-000000000001";
	const D2 = "694d72d0-0000-4000-8000-000000000002";
	const POINT = { type: "Point", coordinates: [77.2, 28.6] };
	const LINE = {
		type: "LineString",
		coordinates: [
			[77, 28],
			[78, 29],
		],
	};
	const observed = (geometries: unknown[], divisionIds: string[]) => ({
		observationTime: new Date("2026-01-01T00:00:00Z"),
		geometries,
		divisionIds,
	});

	it("Scenario: A CA footprint exports in the legacy format", () => {
		const cell = exportRowCells(
			exportRow({ currentObservation: observed([POINT], [D1]) }),
		).spatialFootprint;
		expect(JSON.parse(cell)).toStrictEqual([
			{
				map_option: "Map coordinates",
				geojson: { type: "Feature", geometry: POINT, properties: {} },
			},
			{
				map_option: "Geographic level",
				division_id: D1,
				geojson: {
					type: "Feature",
					geometry: null,
					properties: { division_id: D1 },
				},
			},
		]);
	});

	it("Scenario: A cleared footprint is not resurrected from legacy rows", () => {
		expect(
			exportRowCells(
				exportRow({
					currentObservation: observed([], []),
					legacyGeometries: [POINT],
					legacyDivisionIds: [D1],
				}),
			).spatialFootprint,
		).toBe("[]");
	});

	it("falls back to the legacy rows only when there is no CA observation (OD-6)", () => {
		const legacy = { legacyGeometries: [LINE], legacyDivisionIds: [D2] };
		const fallback = JSON.parse(
			exportRowCells(exportRow(legacy)).spatialFootprint,
		) as { geojson: { geometry: unknown } }[];
		expect(fallback.map((item) => item.geojson.geometry)).toStrictEqual([
			LINE,
			null,
		]);
		const ca = JSON.parse(
			exportRowCells(
				exportRow({ ...legacy, currentObservation: observed([POINT], []) }),
			).spatialFootprint,
		) as { geojson: { geometry: unknown } }[];
		expect(ca.map((item) => item.geojson.geometry)).toStrictEqual([POINT]);
	});

	it("falls back on an unmigrated row too", () => {
		expect(
			JSON.parse(
				exportRowCells(
					exportRow({ specificHazardId: null, legacyGeometries: [POINT] }),
				).spatialFootprint,
			),
		).toHaveLength(1);
	});

	it("writes [] when the event has no footprint at all", () => {
		expect(exportRowCells(exportRow()).spatialFootprint).toBe("[]");
	});

	it("is deterministic whatever order the rows were read in", () => {
		expect(
			exportRowCells(
				exportRow({ currentObservation: observed([LINE, POINT], [D2, D1]) }),
			).spatialFootprint,
		).toBe(
			exportRowCells(
				exportRow({ currentObservation: observed([POINT, LINE], [D1, D2]) }),
			).spatialFootprint,
		);
	});
});

describe("exportRowCells: attachments (D8, OD-6)", () => {
	const LINK = {
		type: "Link" as const,
		title: "Report",
		url: "https://example.com/a",
		tag: [{ id: "t", name: "Tag" }],
		fileKey: null,
		fileType: null,
	};
	const FILE = {
		type: "File" as const,
		title: "Scan",
		url: null,
		tag: null,
		fileKey: "k.pdf",
		fileType: "application/pdf",
	};
	const LEGACY = [
		{
			id: "x",
			title: "Legacy",
			file_option: "File",
			file: {
				name: "/uploads/tenant-t/hazardous-event/e/l.pdf",
				tenantPath: "uploads/tenant-t",
				content_type: "application/pdf",
			},
		},
	];

	it("Scenario: A CA link exports in the legacy format, a File with its tenant path and no tenantPath", () => {
		const cell = exportRowCells(
			exportRow({ attachments: [LINK, FILE], legacyAttachments: LEGACY }),
		).attachments;
		expect(JSON.parse(cell)).toStrictEqual([
			{
				title: "Scan",
				tag: null,
				file_option: "File",
				file: {
					name: `/uploads/tenant-${TENANT_ID}/hazardous-event/${EVENT_ID}/k.pdf`,
					content_type: "application/pdf",
				},
			},
			{
				title: "Report",
				tag: [{ id: "t", name: "Tag" }],
				file_option: "Link",
				url: "https://example.com/a",
			},
		]);
		expect(cell).not.toContain("tenantPath");
	});

	it("Scenario: An unmigrated row exports its legacy jsonb, without tenantPath (OD-6)", () => {
		const cell = exportRowCells(
			exportRow({ specificHazardId: null, legacyAttachments: LEGACY }),
		).attachments;
		expect(JSON.parse(cell)).toStrictEqual([
			{
				title: "Legacy",
				file_option: "File",
				file: {
					name: "/uploads/tenant-t/hazardous-event/e/l.pdf",
					content_type: "application/pdf",
				},
			},
		]);
	});

	it("does not fall back to the legacy jsonb on a migrated row", () => {
		expect(
			exportRowCells(exportRow({ legacyAttachments: LEGACY })).attachments,
		).toBe("[]");
	});

	it("writes [] for no attachments", () => {
		expect(exportRowCells(exportRow()).attachments).toBe("[]");
	});
});

describe("exportRowValues", () => {
	it("writes one cell per export column, in header order", () => {
		const row = exportRow({ causeId: CAUSE_ID });
		const values = exportRowValues(row);
		expect(values).toHaveLength(EXPORT_COLUMNS.length);
		const cells = exportRowCells(row);
		expect(values).toEqual(EXPORT_COLUMNS.map((column) => cells[column]));
		expect(values[EXPORT_COLUMNS.indexOf("parent")]).toBe(CAUSE_ID);
		expect(values[EXPORT_COLUMNS.indexOf("id")]).toBe(EVENT_ID);
	});

	it("never writes undefined for a nullable field", () => {
		const values = exportRowValues(
			exportRow({
				apiImportId: null,
				hazardousEventStatus: null,
				specificHazardLocalName: null,
				specificHazardNationalName: null,
				createdByUserId: null,
				updatedByUserId: null,
				workflowStatus: null,
				legacySubmittedByUserId: null,
				legacySubmittedAt: null,
				specificHazardId: null,
				legacyHipHazardId: null,
				legacyHipClusterId: null,
				legacyHipTypeId: null,
			}),
		);
		for (const value of values) expect(typeof value).toBe("string");
	});
});
