import { describe, expect, it } from "vitest";
import type { Tx } from "~/db.server";
import {
	AuthorizationError,
	ConcurrentModificationError,
	ConflictError,
	DomainError,
	NotFoundError,
	ValidationError,
} from "~/shared/errors";
import {
	STATUS_CHANGE_NOT_SUPPORTED,
	WorkflowInstanceNotFoundError,
} from "~/domains/validation-workflow/application/errors/WorkflowInstanceErrors";
import type { Status } from "~/domains/validation-workflow/domain/WorkflowInstance";
import type { HazardousEventAttachmentInput } from "../dto/HazardousEventAttachmentInput";
import type { HazardousEventCsvRowError } from "../dto/HazardousEventCsvImportResult";
import type { HazardousEventExportRow } from "../dto/HazardousEventExportRow";
import { API_IMPORT_ID_CONFLICT } from "../ports/IHazardousEventRepository";
import type { MappedColumn } from "./hazardousEventCsvColumns";
import type { CsvEventFields, MappedCsvRow } from "./mapCsvRowToCommand";
import {
	changedColumns,
	checkCreatePathRow,
	checkUpdateRow,
	planCreatePathRow,
	type CsvCommandContext,
	heldFileKeys,
	planUpdateRow,
	requiredCellErrors,
	rowAttachmentInputs,
	rowErrorForDomainError,
	toCreateCommand,
	toUpdateCommand,
	type UpdateRowPlan,
} from "./importRowPolicy";

// Each block keeps its former file's fixtures in its own scope.
describe("importRowPolicy: changedColumns", () => {
	const EVENT_ID = "44444444-4444-4444-8444-444444444444";
	const TENANT_ID = "66666666-6666-4666-8666-666666666666";
	const SH_ID = "11111111-1111-4111-8111-111111111111";
	const SH_OTHER = "22222222-2222-4222-8222-222222222222";

	// Migrated by default: CA hazard 78424 / 1844 / 1037; legacy hip values differ on purpose.
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
			recordOriginator: "orig",
			hazardousEventStatus: "ongoing",
			dataSource: "src",
			specificHazardLocalName: "local",
			specificHazardNationalName: null,
			createdByUserId: null,
			updatedByUserId: null,
			createdAt: new Date("2025-01-02T03:04:05.678Z"),
			updatedAt: null,
			workflowStatus: null,
			workflowSubmittedByUserId: null,
			workflowSubmittedAt: null,
			workflowValidatedByUserId: null,
			workflowValidatedAt: null,
			workflowPublishedByUserId: null,
			workflowPublishedAt: null,
			hazardSourceRefId: "78424",
			clusterSourceRefId: "1844",
			typeSourceRefId: "1037",
			causeId: null,
			causeCount: 0,
			legacyApprovalStatus: "",
			legacySubmittedByUserId: null,
			legacySubmittedAt: null,
			legacyValidatedByUserId: null,
			legacyValidatedAt: null,
			legacyPublishedByUserId: null,
			legacyPublishedAt: null,
			legacyHipHazardId: "78568",
			legacyHipClusterId: "1743",
			legacyHipTypeId: "1038",
			legacyParentId: null,
			currentObservation: null,
			legacyGeometries: [],
			legacyDivisionIds: [],
			attachments: [],
			legacyAttachments: [],
			...overrides,
		};
	}

	function row(
		cells: [MappedColumn, string][],
		extra: Partial<MappedCsvRow> = {},
	): MappedCsvRow {
		return {
			line: 2,
			cells: new Map(cells),
			fields: {},
			deferredErrors: [],
			...extra,
		};
	}

	const unmigrated = exportRow({ specificHazardId: null });

	describe("changedColumns", () => {
		describe("plain cells", () => {
			it("returns an empty list when the row has no cells", () => {
				expect(changedColumns(row([]), exportRow())).toStrictEqual([]);
			});

			it("does not report cells equal to the exported value", () => {
				expect(
					changedColumns(
						row([
							["description", "desc"],
							["startDate", "2025-03"],
							["specificHazardNationalName", ""],
							["parent", ""],
						]),
						exportRow(),
					),
				).toStrictEqual([]);
			});

			it("reports a single differing cell", () => {
				expect(
					changedColumns(row([["description", "new"]]), exportRow()),
				).toStrictEqual(["description"]);
			});

			it("reports every differing cell in cell order", () => {
				expect(
					changedColumns(
						row([
							["magnitude", "7"],
							["description", "desc"],
							["parent", SH_OTHER],
							["startDate", "2024"],
						]),
						exportRow(),
					),
				).toStrictEqual(["magnitude", "parent", "startDate"]);
			});

			it("reports an empty cell over a non-empty exported value", () => {
				expect(
					changedColumns(row([["description", ""]]), exportRow()),
				).toStrictEqual(["description"]);
			});

			it("compares case-sensitively", () => {
				expect(
					changedColumns(row([["description", "DESC"]]), exportRow()),
				).toStrictEqual(["description"]);
			});

			it("reports a changed apiImportId", () => {
				expect(
					changedColumns(row([["apiImportId", "A2"]]), exportRow()),
				).toStrictEqual(["apiImportId"]);
			});
		});

		describe("approvalStatus", () => {
			it("treats draft as equal to an exported empty legacy status", () => {
				expect(
					changedColumns(row([["approvalStatus", "draft"]]), exportRow()),
				).toStrictEqual([]);
			});

			it("treats empty as equal to an exported draft", () => {
				expect(
					changedColumns(
						row([["approvalStatus", ""]]),
						exportRow({ workflowStatus: "DRAFT" }),
					),
				).toStrictEqual([]);
			});

			it("treats an identical non-draft status as equal", () => {
				expect(
					changedColumns(
						row([["approvalStatus", "published"]]),
						exportRow({ workflowStatus: "PUBLISHED" }),
					),
				).toStrictEqual([]);
			});

			it("reports a different status", () => {
				expect(
					changedColumns(
						row([["approvalStatus", "published"]]),
						exportRow({ workflowStatus: "DRAFT" }),
					),
				).toStrictEqual(["approvalStatus"]);
			});

			it("reports draft over an exported non-draft status", () => {
				expect(
					changedColumns(
						row([["approvalStatus", "draft"]]),
						exportRow({ workflowStatus: "APPROVED" }),
					),
				).toStrictEqual(["approvalStatus"]);
			});

			it("reports a value outside the legacy enum against draft", () => {
				expect(
					changedColumns(row([["approvalStatus", "bogus"]]), exportRow()),
				).toStrictEqual(["approvalStatus"]);
			});
		});

		describe("hazard on a migrated event with a resolved hazard", () => {
			it("is unchanged when the resolved id matches and hazard cells are empty", () => {
				expect(
					changedColumns(
						row(
							[
								["hipHazardId", ""],
								["hipClusterId", ""],
								["hipTypeId", ""],
								["specificHazardId", ""],
							],
							{ specificHazardId: SH_ID },
						),
						exportRow(),
					),
				).toStrictEqual([]);
			});

			it("is unchanged when only some hazard cells are supplied", () => {
				expect(
					changedColumns(
						row([["hipHazardId", "78424"]], { specificHazardId: SH_ID }),
						exportRow(),
					),
				).toStrictEqual([]);
			});

			it("compares by id even when a supplied cell differs from the export", () => {
				expect(
					changedColumns(
						row([["hipClusterId", "9999"]], { specificHazardId: SH_ID }),
						exportRow(),
					),
				).toStrictEqual([]);
			});

			it("reports specificHazardId when the resolved id differs", () => {
				expect(
					changedColumns(
						row([["specificHazardId", SH_OTHER]], {
							specificHazardId: SH_OTHER,
						}),
						exportRow(),
					),
				).toStrictEqual(["specificHazardId"]);
			});

			it("reports a hazard change via hip cells as specificHazardId", () => {
				expect(
					changedColumns(
						row([["hipHazardId", "78424"]], { specificHazardId: SH_OTHER }),
						exportRow(),
					),
				).toStrictEqual(["specificHazardId"]);
			});

			it("appends specificHazardId after other changed columns", () => {
				expect(
					changedColumns(
						row(
							[
								["specificHazardId", SH_OTHER],
								["description", "new"],
							],
							{ specificHazardId: SH_OTHER },
						),
						exportRow(),
					),
				).toStrictEqual(["description", "specificHazardId"]);
			});
		});

		describe("hazard on a migrated event with no resolved hazard", () => {
			it("is unchanged when every hazard cell is empty", () => {
				expect(
					changedColumns(
						row([
							["hipHazardId", ""],
							["specificHazardId", ""],
						]),
						exportRow(),
					),
				).toStrictEqual([]);
			});

			it("is unchanged when supplied cells equal the exported CA refs", () => {
				expect(
					changedColumns(
						row([
							["hipHazardId", "78424"],
							["hipClusterId", "1844"],
							["hipTypeId", "1037"],
							["specificHazardId", SH_ID],
						]),
						exportRow(),
					),
				).toStrictEqual([]);
			});

			it("reports a supplied hipHazardId that differs", () => {
				expect(
					changedColumns(row([["hipHazardId", "99999"]]), exportRow()),
				).toStrictEqual(["specificHazardId"]);
			});

			it("treats a differing hipClusterId without a hazard cell as no change (an absent hazard leaves it unchanged)", () => {
				expect(
					changedColumns(row([["hipClusterId", "1743"]]), exportRow()),
				).toStrictEqual([]);
			});

			it("treats a differing hipTypeId without a hazard cell as no change (an absent hazard leaves it unchanged)", () => {
				expect(
					changedColumns(row([["hipTypeId", "1038"]]), exportRow()),
				).toStrictEqual([]);
			});

			it("reports a supplied specificHazardId cell that differs", () => {
				expect(
					changedColumns(row([["specificHazardId", SH_OTHER]]), exportRow()),
				).toStrictEqual(["specificHazardId"]);
			});

			it("reports specificHazardId once when several hazard cells differ", () => {
				expect(
					changedColumns(
						row([
							["hipHazardId", "1"],
							["hipClusterId", "2"],
						]),
						exportRow(),
					),
				).toStrictEqual(["specificHazardId"]);
			});

			it("treats an empty hazard id cell as naming no hazard", () => {
				expect(
					changedColumns(
						row([
							["hipHazardId", ""],
							["hipClusterId", "1743"],
						]),
						exportRow(),
					),
				).toStrictEqual([]);
			});

			it("does not count an empty cluster cell beside an unchanged hipHazardId", () => {
				expect(
					changedColumns(
						row([
							["hipHazardId", "78424"],
							["hipClusterId", ""],
						]),
						exportRow(),
					),
				).toStrictEqual([]);
			});

			it("does not count a differing non-hazard cell as a hazard change", () => {
				expect(
					changedColumns(
						row([
							["hipHazardId", "78424"],
							["description", "changed"],
						]),
						exportRow(),
					),
				).toStrictEqual(["description"]);
			});

			it("reports a differing hipClusterId beside an unchanged hipHazardId", () => {
				expect(
					changedColumns(
						row([
							["hipHazardId", "78424"],
							["hipClusterId", "1743"],
						]),
						exportRow(),
					),
				).toStrictEqual(["specificHazardId"]);
			});
		});

		describe("hazard on an unmigrated event", () => {
			it("treats differing hipClusterId and hipTypeId without a hazard cell as no change", () => {
				expect(
					changedColumns(
						row([
							["hipClusterId", "1844"],
							["hipTypeId", "1037"],
						]),
						unmigrated,
					),
				).toStrictEqual([]);
			});

			it("is unchanged when supplied cells equal the legacy hip values", () => {
				expect(
					changedColumns(
						row(
							[
								["hipHazardId", "78568"],
								["hipClusterId", "1743"],
								["hipTypeId", "1038"],
							],
							{ specificHazardId: SH_ID },
						),
						unmigrated,
					),
				).toStrictEqual([]);
			});

			it("compares literally even when the row resolved a hazard", () => {
				expect(
					changedColumns(
						row([["hipHazardId", "78424"]], { specificHazardId: SH_ID }),
						unmigrated,
					),
				).toStrictEqual(["specificHazardId"]);
			});

			it("reports a supplied specificHazardId cell, since the export writes none", () => {
				expect(
					changedColumns(
						row([["specificHazardId", SH_ID]], { specificHazardId: SH_ID }),
						unmigrated,
					),
				).toStrictEqual(["specificHazardId"]);
			});

			it("is unchanged when every hazard cell is empty", () => {
				expect(
					changedColumns(
						row([
							["hipHazardId", ""],
							["hipClusterId", ""],
							["hipTypeId", ""],
							["specificHazardId", ""],
						]),
						unmigrated,
					),
				).toStrictEqual([]);
			});

			it("does not report an empty cell over a non-empty legacy value", () => {
				expect(
					changedColumns(row([["hipHazardId", ""]]), unmigrated),
				).toStrictEqual([]);
			});
		});

		describe("attachments (D6, OD-2, OD-6)", () => {
			const LINK = {
				type: "Link" as const,
				title: "Report",
				url: "https://example.com/a",
				tag: null,
				fileKey: null,
				fileType: null,
			};
			const FILE = {
				type: "File" as const,
				title: "Scan",
				url: null,
				tag: [{ id: "t", name: "Tag" }],
				fileKey: "k.pdf",
				fileType: "application/pdf",
			};
			const withBoth = exportRow({ attachments: [LINK, FILE] });

			function attachmentsRow(value: unknown) {
				return row([
					[
						"attachments",
						typeof value === "string" ? value : JSON.stringify(value),
					],
				]);
			}

			const linkItem = {
				title: "Report",
				tag: [],
				file_option: "Link",
				url: "https://example.com/a",
			};
			const fileItem = {
				title: "Scan",
				tag: [{ id: "t", name: "Tag" }],
				file_option: "File",
				file: { name: "/elsewhere/k.pdf" },
			};

			it("does not report an empty cell, even over attachments", () => {
				expect(changedColumns(attachmentsRow(""), withBoth)).toStrictEqual([]);
			});

			it("does not report the same set in another order, without ids, with a null tag written as []", () => {
				expect(
					changedColumns(attachmentsRow([fileItem, linkItem]), withBoth),
				).toStrictEqual([]);
			});

			it("reports a changed title", () => {
				expect(
					changedColumns(
						attachmentsRow([{ ...linkItem, title: "Other" }, fileItem]),
						withBoth,
					),
				).toStrictEqual(["attachments"]);
			});

			it("reports [] over attachments, and not over none", () => {
				expect(changedColumns(attachmentsRow("[]"), withBoth)).toStrictEqual([
					"attachments",
				]);
				expect(changedColumns(attachmentsRow("[]"), exportRow())).toStrictEqual(
					[],
				);
			});

			it("compares an unmigrated row with its legacy jsonb (OD-6)", () => {
				const legacy = exportRow({
					specificHazardId: null,
					attachments: [LINK],
					legacyAttachments: [
						{
							id: "x",
							title: "Legacy",
							file_option: "Link",
							url: "https://l.example",
						},
					],
				});
				expect(
					changedColumns(
						attachmentsRow([
							{
								title: "Legacy",
								file_option: "Link",
								url: "https://l.example",
							},
						]),
						legacy,
					),
				).toStrictEqual([]);
			});
		});

		describe("spatialFootprint (D6, OD-2)", () => {
			const D1 = "694d72d0-0000-4000-8000-000000000001";
			const D2 = "694d72d0-0000-4000-8000-000000000002";
			const POINT = { type: "Point", coordinates: [77.2, 28.6] };
			const LINE_GEOM = {
				type: "LineString",
				coordinates: [
					[77, 28],
					[78, 29],
				],
			};
			const observed = exportRow({
				currentObservation: {
					observationTime: new Date("2026-01-01T00:00:00Z"),
					geometries: [POINT, LINE_GEOM],
					divisionIds: [D1],
				},
			});

			function footprintRow(value: unknown) {
				return row([
					[
						"spatialFootprint",
						typeof value === "string" ? value : JSON.stringify(value),
					],
				]);
			}

			it("does not report an empty cell, even over a non-empty footprint", () => {
				expect(changedColumns(footprintRow(""), observed)).toStrictEqual([]);
			});

			it("does not report the same footprint reformatted and reordered", () => {
				const cell = JSON.stringify(
					[
						{ map_option: "Geographic level", division_id: D1 },
						{ map_option: "Map coordinates", geojson: LINE_GEOM },
						{
							map_option: "Map coordinates",
							geojson: { type: "Feature", geometry: POINT, properties: {} },
						},
					],
					null,
					2,
				);
				expect(changedColumns(footprintRow(cell), observed)).toStrictEqual([]);
			});

			it("reports a different footprint", () => {
				expect(
					changedColumns(
						footprintRow([
							{ map_option: "Map coordinates", geojson: POINT },
							{ map_option: "Geographic level", division_id: D2 },
						]),
						observed,
					),
				).toStrictEqual(["spatialFootprint"]);
			});

			it("reports [] over a non-empty current observation", () => {
				expect(changedColumns(footprintRow("[]"), observed)).toStrictEqual([
					"spatialFootprint",
				]);
			});

			it("does not report [] when the event has no footprint at all", () => {
				expect(changedColumns(footprintRow("[]"), exportRow())).toStrictEqual(
					[],
				);
			});

			it("does not report [] over an empty current observation, whatever the legacy rows", () => {
				expect(
					changedColumns(
						footprintRow("[]"),
						exportRow({
							currentObservation: {
								observationTime: new Date("2026-01-01T00:00:00Z"),
								geometries: [],
								divisionIds: [],
							},
							legacyGeometries: [POINT],
							legacyDivisionIds: [D1],
						}),
					),
				).toStrictEqual([]);
			});

			it("compares against the legacy rows when there is no CA observation (OD-6)", () => {
				const legacy = exportRow({
					legacyGeometries: [POINT],
					legacyDivisionIds: [D1],
				});
				expect(
					changedColumns(
						footprintRow([
							{ map_option: "Map coordinates", geojson: POINT },
							{ map_option: "Geographic level", division_id: D1 },
						]),
						legacy,
					),
				).toStrictEqual([]);
				expect(changedColumns(footprintRow("[]"), legacy)).toStrictEqual([
					"spatialFootprint",
				]);
			});

			it("reports a cell the parser rejects when its JSON differs from the export", () => {
				const odd = JSON.stringify([{ map_option: "Other" }]);
				expect(changedColumns(footprintRow(odd), observed)).toStrictEqual([
					"spatialFootprint",
				]);
			});
		});
	});
});

describe("importRowPolicy: rowRules", () => {
	const SH_ID = "11111111-1111-4111-8111-111111111111";
	const LINE = 7;
	const IMPORT_TIME = new Date("2026-11-26T10:00:00.000Z");

	function exportRow(
		overrides: Partial<HazardousEventExportRow> = {},
	): HazardousEventExportRow {
		return {
			id: "44444444-4444-4444-8444-444444444444",
			tenantId: "66666666-6666-4666-8666-666666666666",
			specificHazardId: SH_ID,
			apiImportId: "A1",
			status: "pending",
			nationalSpecification: "",
			startDate: "2025",
			endDate: "2025",
			description: "",
			chainsExplanation: "",
			magnitude: "",
			recordOriginator: "orig",
			hazardousEventStatus: null,
			dataSource: "",
			specificHazardLocalName: null,
			specificHazardNationalName: null,
			createdByUserId: null,
			updatedByUserId: null,
			createdAt: new Date("2025-01-01T00:00:00.000Z"),
			updatedAt: null,
			workflowStatus: null,
			workflowSubmittedByUserId: null,
			workflowSubmittedAt: null,
			workflowValidatedByUserId: null,
			workflowValidatedAt: null,
			workflowPublishedByUserId: null,
			workflowPublishedAt: null,
			hazardSourceRefId: null,
			clusterSourceRefId: null,
			typeSourceRefId: null,
			causeId: null,
			causeCount: 0,
			legacyApprovalStatus: "",
			legacySubmittedByUserId: null,
			legacySubmittedAt: null,
			legacyValidatedByUserId: null,
			legacyValidatedAt: null,
			legacyPublishedByUserId: null,
			legacyPublishedAt: null,
			legacyHipHazardId: null,
			legacyHipClusterId: null,
			legacyHipTypeId: null,
			legacyParentId: null,
			currentObservation: null,
			legacyGeometries: [],
			legacyDivisionIds: [],
			attachments: [],
			legacyAttachments: [],
			...overrides,
		};
	}

	function row(extra: Partial<MappedCsvRow> = {}): MappedCsvRow {
		return {
			line: LINE,
			cells: new Map(),
			fields: {},
			deferredErrors: [],
			...extra,
		};
	}

	const deferred: HazardousEventCsvRowError = {
		line: LINE,
		code: "required",
		column: "startDate",
	};
	const deferredSecond: HazardousEventCsvRowError = {
		line: LINE,
		code: "not_found",
		column: "hipHazardId",
	};

	const FIELDS = {
		fieldsChanged: true,
		statusChanged: false,
		parentChanged: false,
		footprintChanged: false,
	};
	const STATUS = {
		fieldsChanged: false,
		statusChanged: true,
		parentChanged: false,
		footprintChanged: false,
	};
	const BOTH = {
		fieldsChanged: true,
		statusChanged: true,
		parentChanged: false,
		footprintChanged: false,
	};
	const NONE = {
		fieldsChanged: false,
		statusChanged: false,
		parentChanged: false,
		footprintChanged: false,
	};
	const PARENT = {
		fieldsChanged: true,
		statusChanged: false,
		parentChanged: true,
		footprintChanged: false,
	};

	describe("planUpdateRow", () => {
		it("returns no change for an empty list", () => {
			expect(planUpdateRow([])).toStrictEqual(NONE);
		});

		it("flags only status when approvalStatus alone changed", () => {
			expect(planUpdateRow(["approvalStatus"])).toStrictEqual(STATUS);
		});

		it("flags only fields when a non-status column changed", () => {
			expect(planUpdateRow(["description"])).toStrictEqual(FIELDS);
		});

		it("flags fields for a hazard change", () => {
			expect(planUpdateRow(["specificHazardId"])).toStrictEqual(FIELDS);
		});

		it("flags both when status and another column changed", () => {
			expect(planUpdateRow(["approvalStatus", "description"])).toStrictEqual(
				BOTH,
			);
		});

		it("flags both regardless of order", () => {
			expect(planUpdateRow(["description", "approvalStatus"])).toStrictEqual(
				BOTH,
			);
		});

		it("flags a parent change as a field change", () => {
			expect(planUpdateRow(["parent"])).toStrictEqual(PARENT);
		});

		it("flags a parent change alongside a status change", () => {
			expect(planUpdateRow(["approvalStatus", "parent"])).toStrictEqual({
				fieldsChanged: true,
				statusChanged: true,
				parentChanged: true,
				footprintChanged: false,
			});
		});

		it("flags a footprint change as a field change (D6)", () => {
			expect(planUpdateRow(["spatialFootprint"])).toStrictEqual({
				fieldsChanged: true,
				statusChanged: false,
				parentChanged: false,
				footprintChanged: true,
			});
		});
	});

	describe("checkUpdateRow", () => {
		const check = (args: {
			row?: MappedCsvRow;
			existing?: HazardousEventExportRow;
			plan?: UpdateRowPlan;
			role?: string | null;
			workflowStatus?: Status | null;
			importTime?: Date;
		}) =>
			checkUpdateRow({
				row: args.row ?? row(),
				existing: args.existing ?? exportRow(),
				plan: args.plan ?? BOTH,
				role: args.role === undefined ? "admin" : args.role,
				workflowStatus:
					args.workflowStatus === undefined ? null : args.workflowStatus,
				importTime: args.importTime ?? IMPORT_TIME,
			});

		it("returns null when every rule passes", () => {
			expect(check({})).toBeNull();
		});

		describe("not_migrated", () => {
			it("rejects an unmigrated event with no column", () => {
				expect(
					check({ existing: exportRow({ specificHazardId: null }) }),
				).toStrictEqual({ line: LINE, code: "not_migrated" });
			});

			it("comes before every other rule", () => {
				expect(
					check({
						row: row({
							deferredErrors: [deferred],
							apiImportId: "OTHER",
							targetStatus: "PUBLISHED",
						}),
						existing: exportRow({ specificHazardId: null }),
						role: "data-viewer",
						workflowStatus: "PUBLISHED",
					}),
				).toStrictEqual({ line: LINE, code: "not_migrated" });
			});
		});

		describe("deferred errors", () => {
			it("returns the first deferred error", () => {
				expect(
					check({ row: row({ deferredErrors: [deferred, deferredSecond] }) }),
				).toBe(deferred);
			});

			it("comes before api_import_id_immutable and later rules", () => {
				expect(
					check({
						row: row({
							deferredErrors: [deferredSecond],
							apiImportId: "OTHER",
							targetStatus: "PUBLISHED",
						}),
						role: "data-viewer",
					}),
				).toBe(deferredSecond);
			});
		});

		describe("api_import_id_immutable", () => {
			const immutable = {
				line: LINE,
				code: "api_import_id_immutable",
				column: "apiImportId",
			};

			it("passes when the apiImportId column is absent", () => {
				expect(check({ row: row({ apiImportId: undefined }) })).toBeNull();
			});

			it("passes when the apiImportId equals the stored one", () => {
				expect(check({ row: row({ apiImportId: "A1" }) })).toBeNull();
			});

			it("passes when both are empty", () => {
				expect(
					check({
						row: row({ apiImportId: null }),
						existing: exportRow({ apiImportId: null }),
					}),
				).toBeNull();
			});

			it("rejects a different apiImportId", () => {
				expect(check({ row: row({ apiImportId: "A2" }) })).toStrictEqual(
					immutable,
				);
			});

			it("rejects clearing a stored apiImportId", () => {
				expect(check({ row: row({ apiImportId: null }) })).toStrictEqual(
					immutable,
				);
			});

			it("rejects setting one where none is stored", () => {
				expect(
					check({
						row: row({ apiImportId: "A1" }),
						existing: exportRow({ apiImportId: null }),
					}),
				).toStrictEqual(immutable);
			});

			it("applies even when nothing else changed", () => {
				expect(
					check({ row: row({ apiImportId: "A2" }), plan: NONE }),
				).toStrictEqual(immutable);
			});

			it("comes before not_editable", () => {
				expect(
					check({
						row: row({ apiImportId: "A2" }),
						role: "data-viewer",
						workflowStatus: "PUBLISHED",
					}),
				).toStrictEqual(immutable);
			});
		});

		describe("not_editable", () => {
			const notEditable = { line: LINE, code: "not_editable" };

			it.each(["SUBMITTED", "APPROVED", "PUBLISHED"] as const)(
				"rejects a field change on a %s event",
				(workflowStatus) => {
					expect(check({ plan: FIELDS, workflowStatus })).toStrictEqual(
						notEditable,
					);
				},
			);

			it.each(["DRAFT", "REVISION_REQUESTED", "REJECTED"] as const)(
				"allows a field change on a %s event",
				(workflowStatus) => {
					expect(check({ plan: FIELDS, workflowStatus })).toBeNull();
				},
			);

			it("allows a field change when there is no workflow instance", () => {
				expect(
					check({ plan: FIELDS, role: "data-collector", workflowStatus: null }),
				).toBeNull();
			});

			it("rejects a field change by a data-viewer with no workflow instance", () => {
				expect(
					check({ plan: FIELDS, role: "data-viewer", workflowStatus: null }),
				).toStrictEqual(notEditable);
			});

			it("does not apply to a status-only change on a blocked event", () => {
				expect(
					check({
						row: row({ targetStatus: "DRAFT" }),
						plan: STATUS,
						workflowStatus: "PUBLISHED",
					}),
				).toBeNull();
			});

			it("does not apply to a status-only change by a data-viewer", () => {
				expect(
					check({
						row: row({ targetStatus: "DRAFT" }),
						plan: STATUS,
						role: "data-viewer",
					}),
				).toBeNull();
			});

			it("comes before status_not_permitted", () => {
				expect(
					check({
						row: row({ targetStatus: "PUBLISHED" }),
						plan: BOTH,
						role: "data-collector",
						workflowStatus: "SUBMITTED",
					}),
				).toStrictEqual(notEditable);
			});
		});

		describe("parent_multiple_causes", () => {
			const multiple = {
				line: LINE,
				code: "parent_multiple_causes",
				column: "parent",
			};

			it("rejects a parent change on an effect with two causes", () => {
				expect(
					check({ plan: PARENT, existing: exportRow({ causeCount: 2 }) }),
				).toStrictEqual(multiple);
			});

			it.each([0, 1])(
				"allows a parent change on an effect with %i cause(s)",
				(causeCount) => {
					expect(
						check({ plan: PARENT, existing: exportRow({ causeCount }) }),
					).toBeNull();
				},
			);

			it("does not apply when the parent did not change", () => {
				expect(
					check({ plan: BOTH, existing: exportRow({ causeCount: 3 }) }),
				).toBeNull();
			});

			it("comes after not_editable", () => {
				expect(
					check({
						plan: PARENT,
						existing: exportRow({ causeCount: 2 }),
						role: "data-collector",
						workflowStatus: "PUBLISHED",
					}),
				).toStrictEqual({ line: LINE, code: "not_editable" });
			});

			it("comes before status_not_permitted", () => {
				expect(
					check({
						row: row({ targetStatus: "PUBLISHED" }),
						plan: { ...PARENT, statusChanged: true },
						existing: exportRow({ causeCount: 2 }),
						role: "data-collector",
					}),
				).toStrictEqual(multiple);
			});
		});

		describe("status_not_permitted", () => {
			const notPermitted = {
				line: LINE,
				code: "status_not_permitted",
				column: "approvalStatus",
			};

			it.each([
				"SUBMITTED",
				"REVISION_REQUESTED",
				"APPROVED",
				"PUBLISHED",
			] as const)(
				"rejects a non-admin changing status to %s",
				(targetStatus) => {
					expect(
						check({
							row: row({ targetStatus }),
							plan: STATUS,
							role: "data-collector",
						}),
					).toStrictEqual(notPermitted);
				},
			);

			it("rejects a change to a non-draft status with no role", () => {
				expect(
					check({
						row: row({ targetStatus: "PUBLISHED" }),
						plan: STATUS,
						role: null,
					}),
				).toStrictEqual(notPermitted);
			});

			it("rejects a data-validator changing status to non-draft", () => {
				expect(
					check({
						row: row({ targetStatus: "APPROVED" }),
						plan: STATUS,
						role: "data-validator",
					}),
				).toStrictEqual(notPermitted);
			});

			it("allows an admin to change status to non-draft", () => {
				expect(
					check({
						row: row({ targetStatus: "PUBLISHED" }),
						plan: BOTH,
						role: "admin",
					}),
				).toBeNull();
			});

			it("allows a non-admin to change status to DRAFT", () => {
				expect(
					check({
						row: row({ targetStatus: "DRAFT" }),
						plan: STATUS,
						role: "data-collector",
					}),
				).toBeNull();
			});

			it("does not apply when the status did not change", () => {
				expect(
					check({
						row: row({ targetStatus: "PUBLISHED" }),
						plan: FIELDS,
						role: "data-collector",
					}),
				).toBeNull();
			});
		});
	});

	describe("heldFileKeys and rowAttachmentInputs (D5)", () => {
		const FILE_ROW = {
			type: "File" as const,
			title: "Scan",
			url: null,
			tag: null,
			fileKey: "k.pdf",
			fileType: "application/pdf",
		};
		const LINK_ROW = {
			type: "Link" as const,
			title: "Report",
			url: "https://example.com/k2.pdf",
			tag: null,
			fileKey: null,
			fileType: null,
		};

		it("holds only the CA File rows' keys, never Link rows or the legacy jsonb", () => {
			expect([
				...heldFileKeys(
					exportRow({
						attachments: [FILE_ROW, LINK_ROW],
						legacyAttachments: [
							{ file_option: "File", file: { name: "/x/legacy.pdf" } },
						],
					}),
				),
			]).toStrictEqual(["k.pdf"]);
		});

		it("gives no inputs for a row without attachment items", () => {
			expect(rowAttachmentInputs(row(), new Set())).toStrictEqual({
				ok: true,
				inputs: undefined,
			});
		});

		it("builds link and existing-file inputs", () => {
			expect(
				rowAttachmentInputs(
					row({
						attachments: [
							{ type: "Link", title: "L", tag: null, url: "https://a.example" },
							{
								type: "File",
								title: "F",
								tag: null,
								fileKey: "k.pdf",
								staged: false,
							},
						],
					}),
					new Set(["k.pdf"]),
				),
			).toStrictEqual({
				ok: true,
				inputs: [
					{
						id: "",
						title: "L",
						tag: null,
						kind: "link",
						url: "https://a.example",
					},
					{
						id: "",
						title: "F",
						tag: null,
						kind: "existingFile",
						fileKey: "k.pdf",
					},
				],
			});
		});

		it("reports invalid_attachment_url on the attachments column, echoing the URL", () => {
			expect(
				rowAttachmentInputs(
					row({
						attachments: [
							{
								type: "Link",
								title: "L",
								tag: null,
								url: "ftp://example.com/f",
							},
						],
					}),
					new Set(),
				),
			).toStrictEqual({
				ok: false,
				error: {
					line: LINE,
					code: "invalid_attachment_url",
					column: "attachments",
					value: "ftp://example.com/f",
				},
			});
		});

		it("reports file_reference_not_supported for a key the event does not hold", () => {
			expect(
				rowAttachmentInputs(
					row({
						attachments: [
							{
								type: "File",
								title: "F",
								tag: null,
								fileKey: "other.pdf",
								staged: false,
							},
						],
					}),
					new Set(["k.pdf"]),
				),
			).toMatchObject({
				ok: false,
				error: { code: "file_reference_not_supported", value: "other.pdf" },
			});
		});

		it("truncates an echoed URL to 100 characters", () => {
			const url = `ftp://${"a".repeat(200)}`;
			const result = rowAttachmentInputs(
				row({ attachments: [{ type: "Link", title: "L", tag: null, url }] }),
				new Set(),
			);
			expect(!result.ok && result.error.value).toBe(url.slice(0, 100));
		});
	});

	describe("checkCreatePathRow: File references (D5)", () => {
		it("rejects a File item on the create path, after the deferred errors", () => {
			const fileRow = row({
				cells: new Map([
					["startDate", "2025"],
					["endDate", "2025"],
					["recordOriginator", "A"],
				]),
				specificHazardId: SH_ID,
				attachments: [
					{
						type: "File",
						title: "F",
						tag: null,
						fileKey: "k.pdf",
						staged: false,
					},
				],
			});
			expect(checkCreatePathRow(fileRow, "admin")).toStrictEqual({
				line: LINE,
				code: "file_reference_not_supported",
				column: "attachments",
				value: "k.pdf",
			});
			expect(
				checkCreatePathRow({ ...fileRow, deferredErrors: [deferred] }, "admin"),
			).toStrictEqual(deferred);
		});

		it("accepts an https Link on the create path", () => {
			expect(
				checkCreatePathRow(
					row({
						cells: new Map([
							["startDate", "2025"],
							["endDate", "2025"],
							["recordOriginator", "A"],
						]),
						specificHazardId: SH_ID,
						attachments: [
							{ type: "Link", title: "L", tag: null, url: "https://a.example" },
						],
					}),
					"admin",
				),
			).toBeNull();
		});
	});

	describe("planCreatePathRow (6d-2)", () => {
		const complete = new Map<MappedColumn, string>([
			["startDate", "2025"],
			["endDate", "2025"],
			["recordOriginator", "A"],
		]);

		it("returns the attachment inputs of a valid create-path row", () => {
			expect(
				planCreatePathRow(
					row({
						cells: complete,
						specificHazardId: SH_ID,
						attachments: [
							{ type: "Link", title: "L", tag: null, url: "https://a.example" },
						],
					}),
					"admin",
				),
			).toStrictEqual({
				ok: true,
				attachments: [
					{
						id: "",
						title: "L",
						tag: null,
						kind: "link",
						url: "https://a.example",
					},
				],
			});
		});

		it("returns no inputs for a row without attachments", () => {
			expect(
				planCreatePathRow(
					row({ cells: complete, specificHazardId: SH_ID }),
					"admin",
				),
			).toStrictEqual({ ok: true, attachments: [] });
		});

		it("returns the first rule error, as checkCreatePathRow does", () => {
			expect(
				planCreatePathRow(row({ cells: complete }), "admin"),
			).toStrictEqual({
				ok: false,
				error: { line: LINE, code: "specific_hazard_required" },
			});
		});
	});

	describe("checkUpdateRow: OD-9 current observation dated after the import", () => {
		const FOOTPRINT = {
			fieldsChanged: true,
			statusChanged: false,
			parentChanged: false,
			footprintChanged: true,
		};
		const check = (args: {
			observationTime: Date | null;
			plan?: UpdateRowPlan;
		}) =>
			checkUpdateRow({
				row: row(),
				existing: exportRow({
					currentObservation:
						args.observationTime === null
							? null
							: {
									observationTime: args.observationTime,
									geometries: [],
									divisionIds: [],
								},
				}),
				plan: args.plan ?? FOOTPRINT,
				role: "admin",
				workflowStatus: null,
				importTime: IMPORT_TIME,
			});

		it("rejects a changed footprint with conflict on spatialFootprint", () => {
			expect(
				check({ observationTime: new Date(IMPORT_TIME.getTime() + 1) }),
			).toStrictEqual({
				line: LINE,
				code: "conflict",
				column: "spatialFootprint",
			});
		});

		it("allows a current observation dated before the import", () => {
			expect(
				check({ observationTime: new Date(IMPORT_TIME.getTime() - 1) }),
			).toBeNull();
		});

		it("leaves an observation at the import time to the unique constraint", () => {
			expect(check({ observationTime: IMPORT_TIME })).toBeNull();
		});

		it("allows an event with no observation", () => {
			expect(check({ observationTime: null })).toBeNull();
		});

		it("does not apply when the footprint did not change", () => {
			expect(
				check({
					observationTime: new Date(IMPORT_TIME.getTime() + 1),
					plan: FIELDS,
				}),
			).toBeNull();
		});

		it("comes after not_editable", () => {
			expect(
				checkUpdateRow({
					row: row(),
					existing: exportRow({
						currentObservation: {
							observationTime: new Date(IMPORT_TIME.getTime() + 1),
							geometries: [],
							divisionIds: [],
						},
					}),
					plan: FOOTPRINT,
					role: "data-collector",
					workflowStatus: "PUBLISHED",
					importTime: IMPORT_TIME,
				}),
			).toStrictEqual({ line: LINE, code: "not_editable" });
		});
	});

	describe("requiredCellErrors", () => {
		const cells = (entries: [MappedColumn, string][]) =>
			row({ cells: new Map(entries) });

		it("flags a supplied empty cell on either path", () => {
			const supplied = cells([
				["startDate", ""],
				["endDate", "2025"],
				["recordOriginator", "orig"],
			]);
			const expected = [{ line: LINE, code: "required", column: "startDate" }];
			expect(requiredCellErrors(supplied, { absentIsEmpty: false })).toEqual(
				expected,
			);
			expect(requiredCellErrors(supplied, { absentIsEmpty: true })).toEqual(
				expected,
			);
		});

		it("leaves an absent column alone on the update path", () => {
			expect(
				requiredCellErrors(cells([["endDate", "2025"]]), {
					absentIsEmpty: false,
				}),
			).toEqual([]);
		});

		it("flags an absent column on the create path", () => {
			expect(
				requiredCellErrors(cells([["endDate", "2025"]]), {
					absentIsEmpty: true,
				}),
			).toEqual([
				{ line: LINE, code: "required", column: "startDate" },
				{ line: LINE, code: "required", column: "recordOriginator" },
			]);
		});
	});

	describe("checkCreatePathRow", () => {
		const filled: [MappedColumn, string][] = [
			["startDate", "2025"],
			["endDate", "2025"],
			["recordOriginator", "orig"],
		];
		const clean = (extra: Partial<MappedCsvRow> = {}) =>
			row({ cells: new Map(filled), specificHazardId: SH_ID, ...extra });

		it("returns null for a clean row", () => {
			expect(checkCreatePathRow(clean(), "data-collector")).toBeNull();
		});

		it("returns the first deferred error before create-path errors", () => {
			expect(
				checkCreatePathRow(
					row({ deferredErrors: [deferredSecond, deferred] }),
					"data-collector",
				),
			).toBe(deferredSecond);
		});

		it("returns required for the first missing required cell", () => {
			expect(
				checkCreatePathRow(
					row({ cells: new Map(), specificHazardId: SH_ID }),
					"admin",
				),
			).toStrictEqual({ line: LINE, code: "required", column: "startDate" });
		});

		it("returns required for an empty required cell", () => {
			expect(
				checkCreatePathRow(
					clean({
						cells: new Map<MappedColumn, string>([
							["startDate", "2025"],
							["endDate", "2025"],
							["recordOriginator", ""],
						]),
					}),
					"admin",
				),
			).toStrictEqual({
				line: LINE,
				code: "required",
				column: "recordOriginator",
			});
		});

		it("returns required before specific_hazard_required", () => {
			expect(
				checkCreatePathRow(
					row({ cells: new Map([["startDate", "2025"]]) }),
					"admin",
				),
			).toStrictEqual({ line: LINE, code: "required", column: "endDate" });
		});

		it("returns specific_hazard_required when no hazard resolved", () => {
			expect(
				checkCreatePathRow(clean({ specificHazardId: undefined }), "admin"),
			).toStrictEqual({ line: LINE, code: "specific_hazard_required" });
		});

		it("returns specific_hazard_required before status_not_permitted", () => {
			expect(
				checkCreatePathRow(
					clean({ specificHazardId: undefined, targetStatus: "PUBLISHED" }),
					"data-collector",
				),
			).toStrictEqual({ line: LINE, code: "specific_hazard_required" });
		});

		it("returns status_not_permitted for a non-admin non-draft status", () => {
			expect(
				checkCreatePathRow(
					clean({ targetStatus: "PUBLISHED" }),
					"data-collector",
				),
			).toStrictEqual({
				line: LINE,
				code: "status_not_permitted",
				column: "approvalStatus",
			});
		});

		it("allows an admin a non-draft status", () => {
			expect(
				checkCreatePathRow(clean({ targetStatus: "PUBLISHED" }), "admin"),
			).toBeNull();
		});

		it("allows a non-admin a DRAFT status", () => {
			expect(
				checkCreatePathRow(clean({ targetStatus: "DRAFT" }), null),
			).toBeNull();
		});
	});
});

describe("importRowPolicy: rowErrorForDomainError", () => {
	const EVENT_ID = "44444444-4444-4444-8444-444444444444";
	const PARENT_ID = "55555555-5555-4555-8555-555555555555";
	const OTHER_ID = "66666666-6666-4666-8666-666666666666";

	const noKeys = {};
	const updateRow = { id: EVENT_ID, causeId: PARENT_ID };

	class OtherDomainError extends DomainError {
		readonly code = "OTHER";
		readonly statusHint = 400;
	}

	describe("rowErrorForDomainError", () => {
		describe("AuthorizationError", () => {
			it("maps to status_not_permitted on approvalStatus", () => {
				expect(
					rowErrorForDomainError(new AuthorizationError("no"), noKeys),
				).toStrictEqual({
					code: "status_not_permitted",
					column: "approvalStatus",
				});
			});
		});

		describe("ConcurrentModificationError", () => {
			it("maps to concurrent_modification with no column", () => {
				expect(
					rowErrorForDomainError(
						new ConcurrentModificationError("x"),
						updateRow,
					),
				).toStrictEqual({ code: "concurrent_modification" });
			});

			it("is checked before ConflictError even with a causal context", () => {
				const err = new ConcurrentModificationError("x", {
					causeId: PARENT_ID,
					effectId: EVENT_ID,
				});
				expect(rowErrorForDomainError(err, updateRow)).toStrictEqual({
					code: "concurrent_modification",
				});
			});
		});

		describe("WorkflowInstanceNotFoundError", () => {
			it("maps to status_change_not_supported on approvalStatus", () => {
				const err = new WorkflowInstanceNotFoundError(EVENT_ID, "HE");
				expect(rowErrorForDomainError(err, updateRow)).toStrictEqual({
					code: "status_change_not_supported",
					column: "approvalStatus",
				});
			});

			it("is checked before NotFoundError even when its id equals the cause", () => {
				const err = new WorkflowInstanceNotFoundError(PARENT_ID, "HE");
				expect(rowErrorForDomainError(err, updateRow)).toStrictEqual({
					code: "status_change_not_supported",
					column: "approvalStatus",
				});
			});
		});

		describe("ConflictError", () => {
			it("maps STATUS_CHANGE_NOT_SUPPORTED to status_change_not_supported", () => {
				const err = new ConflictError("x", {
					reason: STATUS_CHANGE_NOT_SUPPORTED,
				});
				expect(rowErrorForDomainError(err, updateRow)).toStrictEqual({
					code: "status_change_not_supported",
					column: "approvalStatus",
				});
			});

			it("maps API_IMPORT_ID_CONFLICT to conflict on apiImportId", () => {
				const err = new ConflictError("x", { reason: API_IMPORT_ID_CONFLICT });
				expect(rowErrorForDomainError(err, noKeys)).toStrictEqual({
					code: "conflict",
					column: "apiImportId",
				});
			});

			it("maps a cycle context to conflict on parent", () => {
				const err = new ConflictError("x", {
					causeId: PARENT_ID,
					effectId: EVENT_ID,
				});
				expect(rowErrorForDomainError(err, updateRow)).toStrictEqual({
					code: "conflict",
					column: "parent",
				});
			});

			it("maps a cause_after_effect context to cause_after_effect on parent", () => {
				const err = new ConflictError("x", {
					causeStartDate: "2025-02-01",
					effectStartDate: "2025-01-01",
				});
				expect(rowErrorForDomainError(err, updateRow)).toStrictEqual({
					code: "cause_after_effect",
					column: "parent",
				});
			});

			it("maps a plain conflict with no context to conflict with no column", () => {
				expect(
					rowErrorForDomainError(new ConflictError("x"), updateRow),
				).toStrictEqual({ code: "conflict" });
			});

			it("maps an unknown reason to conflict with no column", () => {
				const err = new ConflictError("x", { reason: "SOMETHING_ELSE" });
				expect(rowErrorForDomainError(err, updateRow)).toStrictEqual({
					code: "conflict",
				});
			});
		});

		describe("NotFoundError", () => {
			it("maps a missing cause to not_found on parent", () => {
				const err = new NotFoundError("HazardousEvent", PARENT_ID);
				expect(rowErrorForDomainError(err, updateRow)).toStrictEqual({
					code: "not_found",
					column: "parent",
				});
			});

			it("maps another missing id to not_found on id when the row has an id", () => {
				const err = new NotFoundError("HazardousEvent", OTHER_ID);
				expect(rowErrorForDomainError(err, updateRow)).toStrictEqual({
					code: "not_found",
					column: "id",
				});
			});

			it("maps to not_found with no column when the row has no id", () => {
				const err = new NotFoundError("HazardousEvent", OTHER_ID);
				expect(
					rowErrorForDomainError(err, { causeId: PARENT_ID }),
				).toStrictEqual({ code: "not_found", column: undefined });
			});

			it("does not treat an absent cause as matching", () => {
				const err = new NotFoundError("HazardousEvent", EVENT_ID);
				expect(rowErrorForDomainError(err, { id: EVENT_ID })).toStrictEqual({
					code: "not_found",
					column: "id",
				});
			});
		});

		describe("ValidationError", () => {
			it("maps a mapped CSV field to validation on that column", () => {
				const err = new ValidationError("x", { field: "startDate" });
				expect(rowErrorForDomainError(err, noKeys)).toStrictEqual({
					code: "validation",
					column: "startDate",
				});
			});

			it("maps the id field to validation on id", () => {
				const err = new ValidationError("x", { field: "id" });
				expect(rowErrorForDomainError(err, noKeys)).toStrictEqual({
					code: "validation",
					column: "id",
				});
			});

			it("maps a non-CSV field to validation with no column", () => {
				const err = new ValidationError("x", { field: "hazardDriverIds" });
				expect(rowErrorForDomainError(err, noKeys)).toStrictEqual({
					code: "validation",
				});
			});

			it("maps a non-string field to validation with no column", () => {
				const err = new ValidationError("x", { field: 42 });
				expect(rowErrorForDomainError(err, noKeys)).toStrictEqual({
					code: "validation",
				});
			});

			it("maps a context without a field to validation with no column", () => {
				const err = new ValidationError("x", { reason: "bad" });
				expect(rowErrorForDomainError(err, noKeys)).toStrictEqual({
					code: "validation",
				});
			});

			it("maps no context to validation with no column", () => {
				expect(
					rowErrorForDomainError(new ValidationError("x"), noKeys),
				).toStrictEqual({ code: "validation" });
			});
		});

		describe("other DomainError subclasses", () => {
			it("maps to validation with no column", () => {
				const err = new OtherDomainError("x", { field: "startDate" });
				expect(rowErrorForDomainError(err, updateRow)).toStrictEqual({
					code: "validation",
				});
			});
		});
	});
});

describe("importRowPolicy: csvRowCommands", () => {
	const TENANT_ID = "66666666-6666-4666-8666-666666666666";
	const USER_ID = "user-1";
	const SH_ID = "11111111-1111-4111-8111-111111111111";
	const EVENT_ID = "44444444-4444-4444-8444-444444444444";
	const PARENT_ID = "55555555-5555-4555-8555-555555555555";

	// Opaque handle: the mappers only pass it through, never call it.
	const tx = {} as Tx;
	const IMPORT_TIME = new Date("2026-11-26T10:00:00.000Z");
	const context: CsvCommandContext = {
		tenantId: TENANT_ID,
		actingUserId: USER_ID,
		tx,
		importTime: IMPORT_TIME,
	};

	function row(extra: Partial<MappedCsvRow> = {}): MappedCsvRow {
		return {
			line: 2,
			cells: new Map(),
			fields: {},
			deferredErrors: [],
			...extra,
		};
	}

	const allFields: CsvEventFields = {
		startDate: "2025-01-01",
		endDate: "2025-01-02",
		nationalSpecification: "ns",
		description: "desc",
		chainsExplanation: "chains",
		magnitude: "5",
		recordOriginator: "orig",
		dataSource: "src",
		hazardousEventStatus: "ongoing",
		specificHazardLocalName: "local",
		specificHazardNationalName: "national",
	};

	describe("toCreateCommand", () => {
		it("defaults every absent field", () => {
			expect(toCreateCommand(row(), context)).toStrictEqual({
				tenantId: TENANT_ID,
				specificHazardId: "",
				startDate: "",
				endDate: "",
				nationalSpecification: "",
				description: "",
				chainsExplanation: "",
				magnitude: "",
				recordOriginator: "",
				dataSource: "",
				hazardousEventStatus: null,
				specificHazardLocalName: null,
				specificHazardNationalName: null,
				apiImportId: null,
				actingUserId: USER_ID,
				hazardDriverIds: [],
				attachments: [],
				fieldValues: [],
				customFieldValues: [],
				tx,
			});
		});

		it("copies every supplied field, the hazard and the apiImportId", () => {
			expect(
				toCreateCommand(
					row({
						fields: allFields,
						specificHazardId: SH_ID,
						apiImportId: "A1",
					}),
					context,
				),
			).toStrictEqual({
				tenantId: TENANT_ID,
				specificHazardId: SH_ID,
				...allFields,
				apiImportId: "A1",
				actingUserId: USER_ID,
				hazardDriverIds: [],
				attachments: [],
				fieldValues: [],
				customFieldValues: [],
				tx,
			});
		});

		it("keeps explicit null nullable fields as null", () => {
			const command = toCreateCommand(
				row({
					fields: {
						hazardousEventStatus: null,
						specificHazardLocalName: null,
						specificHazardNationalName: null,
					},
					apiImportId: null,
				}),
				context,
			);
			expect(command.hazardousEventStatus).toBeNull();
			expect(command.specificHazardLocalName).toBeNull();
			expect(command.specificHazardNationalName).toBeNull();
			expect(command.apiImportId).toBeNull();
		});

		it("includes causeId when the parent cell is non-empty", () => {
			const command = toCreateCommand(row({ causeId: PARENT_ID }), context);
			expect(command.causeId).toBe(PARENT_ID);
		});

		it("omits causeId when the parent cell is empty", () => {
			expect("causeId" in toCreateCommand(row({ causeId: "" }), context)).toBe(
				false,
			);
		});

		it("omits causeId when the parent column is absent", () => {
			expect("causeId" in toCreateCommand(row(), context)).toBe(false);
		});

		it("passes the transaction through by reference", () => {
			expect(toCreateCommand(row(), context).tx).toBe(tx);
		});

		it("returns fresh empty arrays", () => {
			const command = toCreateCommand(row(), context);
			expect(command.hazardDriverIds).toStrictEqual([]);
			expect(command.attachments).toStrictEqual([]);
			expect(command.fieldValues).toStrictEqual([]);
			expect(command.customFieldValues).toStrictEqual([]);
		});
	});

	describe("toUpdateCommand", () => {
		it("carries only the keys and context when the row supplies nothing", () => {
			expect(toUpdateCommand(row(), EVENT_ID, [], context)).toStrictEqual({
				id: EVENT_ID,
				tenantId: TENANT_ID,
				actingUserId: USER_ID,
				tx,
			});
		});

		it("carries only the supplied fields", () => {
			expect(
				toUpdateCommand(
					row({
						fields: { description: "new", specificHazardLocalName: null },
					}),
					EVENT_ID,
					["description"],
					context,
				),
			).toStrictEqual({
				id: EVENT_ID,
				tenantId: TENANT_ID,
				actingUserId: USER_ID,
				description: "new",
				specificHazardLocalName: null,
				tx,
			});
		});

		it("includes specificHazardId when the hazard resolved", () => {
			expect(
				toUpdateCommand(
					row({ specificHazardId: SH_ID }),
					EVENT_ID,
					[],
					context,
				),
			).toStrictEqual({
				id: EVENT_ID,
				tenantId: TENANT_ID,
				actingUserId: USER_ID,
				specificHazardId: SH_ID,
				tx,
			});
		});

		it("omits specificHazardId when no hazard resolved", () => {
			expect(
				"specificHazardId" in
					toUpdateCommand(row(), EVENT_ID, ["specificHazardId"], context),
			).toBe(false);
		});

		it("includes causeId when parent changed", () => {
			expect(
				toUpdateCommand(
					row({ causeId: PARENT_ID }),
					EVENT_ID,
					["parent"],
					context,
				),
			).toStrictEqual({
				id: EVENT_ID,
				tenantId: TENANT_ID,
				actingUserId: USER_ID,
				causeId: PARENT_ID,
				tx,
			});
		});

		it("includes an empty causeId to clear the cause when parent changed", () => {
			const command = toUpdateCommand(
				row({ causeId: "" }),
				EVENT_ID,
				["description", "parent"],
				context,
			);
			expect("causeId" in command).toBe(true);
			expect(command.causeId).toBe("");
		});

		it("omits causeId when parent did not change", () => {
			expect(
				"causeId" in
					toUpdateCommand(
						row({ causeId: PARENT_ID }),
						EVENT_ID,
						["description"],
						context,
					),
			).toBe(false);
		});

		it("omits causeId when parent is listed but the column is absent", () => {
			expect(
				"causeId" in toUpdateCommand(row(), EVENT_ID, ["parent"], context),
			).toBe(false);
		});

		it("does not let row fields override the id or context keys", () => {
			const command = toUpdateCommand(
				row({ fields: allFields }),
				EVENT_ID,
				[],
				context,
			);
			expect(command).toStrictEqual({
				id: EVENT_ID,
				tenantId: TENANT_ID,
				actingUserId: USER_ID,
				...allFields,
				tx,
			});
		});

		it("passes the transaction through by reference", () => {
			expect(toUpdateCommand(row(), EVENT_ID, [], context).tx).toBe(tx);
		});
	});

	describe("attachments (D5, NOD-7)", () => {
		const inputs: HazardousEventAttachmentInput[] = [
			{ kind: "link", id: "", title: "L", tag: null, url: "https://a.example" },
		];

		it("puts the given inputs on a create command, defaulting to none", () => {
			expect(toCreateCommand(row(), context, inputs).attachments).toBe(inputs);
			expect(toCreateCommand(row(), context).attachments).toStrictEqual([]);
		});

		it("carries attachments on an update command only when they changed", () => {
			expect(
				toUpdateCommand(row(), EVENT_ID, ["attachments"], context, {
					attachments: inputs,
				}).attachments,
			).toBe(inputs);
			expect(
				"attachments" in
					toUpdateCommand(row(), EVENT_ID, ["description"], context, {
						attachments: inputs,
					}),
			).toBe(false);
		});

		it("carries an empty set when [] changed the attachments, so they are cleared", () => {
			expect(
				toUpdateCommand(row(), EVENT_ID, ["attachments"], context, {
					attachments: [],
				}).attachments,
			).toStrictEqual([]);
		});
	});

	describe("expectedUpdatedAt (6d-2 concurrency)", () => {
		it("passes the projection's updatedAt to Update as the expected version", () => {
			const at = new Date("2026-01-05T12:30:00.000Z");
			expect(
				toUpdateCommand(row(), EVENT_ID, ["description"], context, {
					expectedUpdatedAt: at,
				}).expectedUpdatedAt,
			).toBe(at);
			expect(
				toUpdateCommand(row(), EVENT_ID, ["description"], context, {
					expectedUpdatedAt: null,
				}).expectedUpdatedAt,
			).toBeNull();
		});
	});

	describe("spatialObservation (D3)", () => {
		const D1 = "694d72d0-0000-4000-8000-000000000001";
		const POINT = { type: "Point", coordinates: [77.2, 28.6] };
		const footprint = { geometries: [POINT], divisionIds: [D1] };
		const empty = { geometries: [], divisionIds: [] };

		it("adds a non-empty footprint to a create command at the import time", () => {
			expect(
				toCreateCommand(row({ spatialFootprint: footprint }), context)
					.spatialObservation,
			).toStrictEqual({
				geometries: [POINT],
				divisionIds: [D1],
				observationTime: IMPORT_TIME,
			});
		});

		it("records nothing on create for [] or an absent footprint", () => {
			expect(
				"spatialObservation" in
					toCreateCommand(row({ spatialFootprint: empty }), context),
			).toBe(false);
			expect("spatialObservation" in toCreateCommand(row(), context)).toBe(
				false,
			);
		});

		it("adds the footprint to an update command only when it changed", () => {
			expect(
				toUpdateCommand(
					row({ spatialFootprint: footprint }),
					EVENT_ID,
					["spatialFootprint"],
					context,
				).spatialObservation,
			).toStrictEqual({
				geometries: [POINT],
				divisionIds: [D1],
				observationTime: IMPORT_TIME,
			});
			expect(
				"spatialObservation" in
					toUpdateCommand(
						row({ spatialFootprint: footprint }),
						EVENT_ID,
						["description"],
						context,
					),
			).toBe(false);
		});

		it("records an empty observation when [] changed the footprint (NOD-8)", () => {
			expect(
				toUpdateCommand(
					row({ spatialFootprint: empty }),
					EVENT_ID,
					["spatialFootprint"],
					context,
				).spatialObservation,
			).toStrictEqual({
				geometries: [],
				divisionIds: [],
				observationTime: IMPORT_TIME,
			});
		});

		it("does not put the footprint among the event fields", () => {
			const command = toUpdateCommand(
				row({ spatialFootprint: footprint }),
				EVENT_ID,
				["spatialFootprint"],
				context,
			);
			expect(Object.keys(command)).not.toContain("spatialFootprint");
		});
	});
});
