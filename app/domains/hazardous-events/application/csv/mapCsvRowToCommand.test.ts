import { describe, expect, it } from "vitest";
import type { SourceRefResolution } from "../ports/ISpecificHazardTaxonomyRepository";
import type { HazardousEventCsvRowError } from "../dto/HazardousEventCsvImportResult";
import {
	checkHeader,
	type CsvImportMode,
	type MappedColumn,
} from "./hazardousEventCsvColumns";
import {
	collectDivisionIds,
	collectSourceRefs,
	mapCsvRows,
	type MappedCsvRow,
} from "./mapCsvRowToCommand";
import { createPathErrors } from "./importRowPolicy";

const SH_78424 = "11111111-1111-4111-8111-111111111111";
const SH_OTHER = "22222222-2222-4222-8222-222222222222";
const SH_UNKNOWN = "33333333-3333-4333-8333-333333333333";
const CLUSTER_1844 = "c1844000-0000-4000-8000-000000000000";
const CLUSTER_1743 = "c1743000-0000-4000-8000-000000000000";
const TYPE_1037 = "t1037000-0000-4000-8000-000000000000";
const TYPE_1038 = "t1038000-0000-4000-8000-000000000000";
const EVENT_ID = "44444444-4444-4444-8444-444444444444";
const PARENT_ID = "55555555-5555-4555-8555-555555555555";
const DIVISION_OWN = "694d72d0-0000-4000-8000-000000000001";
const DIVISION_OTHER = "694d72d0-0000-4000-8000-000000000002";

// 78424 sits under cluster 1844 and type 1037; SH_OTHER under cluster 1743.
const lookup: SourceRefResolution = {
	hazards: new Map([
		[
			"78424",
			{
				specificHazardId: SH_78424,
				hazardClusterId: CLUSTER_1844,
				hazardTypeId: TYPE_1037,
			},
		],
	]),
	clusters: new Map([
		["1844", { hazardClusterId: CLUSTER_1844, hazardTypeId: TYPE_1037 }],
		["1743", { hazardClusterId: CLUSTER_1743, hazardTypeId: TYPE_1037 }],
	]),
	types: new Map([
		["1037", { hazardTypeId: TYPE_1037 }],
		["1038", { hazardTypeId: TYPE_1038 }],
	]),
	specificHazards: new Map([
		[SH_78424, { hazardClusterId: CLUSTER_1844, hazardTypeId: TYPE_1037 }],
		[SH_OTHER, { hazardClusterId: CLUSTER_1743, hazardTypeId: TYPE_1037 }],
	]),
};

const VALID_CREATE: Record<string, string> = {
	hipTypeId: "1037",
	hipClusterId: "1844",
	hipHazardId: "78424",
	startDate: "2025-01-01",
	endDate: "2025-01-31",
	recordOriginator: "Agency",
};

interface MapOptions {
	role?: string | null;
	firstDataLine?: number;
	/** The session tenant's divisions among those the file names (D4). */
	validDivisionIds?: ReadonlySet<string>;
}

/** Runs the real header check first, then the mapper, as the use case does. */
function mapFile(
	mode: CsvImportMode,
	header: readonly string[],
	rows: readonly (readonly string[])[],
	options: MapOptions = {},
) {
	const check = checkHeader(header, mode);
	if (!check.ok) {
		throw new Error(`header rejected: ${JSON.stringify(check.fileErrors)}`);
	}
	return mapCsvRows({
		mode,
		columns: check.columns,
		rows,
		firstDataLine: options.firstDataLine ?? 2,
		role: options.role === undefined ? "admin" : options.role,
		lookup,
		validDivisionIds: options.validDivisionIds ?? new Set([DIVISION_OWN]),
	});
}

/** Builds a file from records; the header is the union of keys in first-seen order. */
function mapRecords(
	mode: CsvImportMode,
	records: readonly Record<string, string>[],
	options: MapOptions = {},
) {
	const header: string[] = [];
	for (const record of records) {
		for (const key of Object.keys(record)) {
			if (!header.includes(key)) header.push(key);
		}
	}
	const rows = records.map((record) => header.map((key) => record[key] ?? ""));
	return mapFile(mode, header, rows, options);
}

function createRow(overrides: Record<string, string> = {}) {
	return { ...VALID_CREATE, ...overrides };
}

function codes(errors: readonly HazardousEventCsvRowError[]) {
	return errors.map((e) => e.code);
}

describe("mapCsvRows: a valid create row", () => {
	it("produces no errors and resolves the HIP hazard to the specific hazard", () => {
		const { rows, errors } = mapRecords("create", [createRow()]);
		expect(errors).toEqual([]);
		expect(rows[0].specificHazardId).toBe(SH_78424);
		expect(rows[0].line).toBe(2);
	});

	it("accepts YYYY and YYYY-MM dates", () => {
		const { errors } = mapRecords("create", [
			createRow({ startDate: "2025", endDate: "2025-02" }),
		]);
		expect(errors).toEqual([]);
	});
});

describe("mapCsvRows: required", () => {
	it("reports an empty recordOriginator on create without echoing a value", () => {
		const { errors } = mapRecords("create", [
			createRow({ recordOriginator: "" }),
		]);
		expect(errors).toEqual([
			{ line: 2, column: "recordOriginator", code: "required" },
		]);
	});

	it.each(["startDate", "endDate"])(
		"reports an empty %s on create",
		(column) => {
			const { errors } = mapRecords("create", [createRow({ [column]: "" })]);
			expect(errors).toContainEqual({ line: 2, column, code: "required" });
		},
	);

	it("defers a present but empty startDate on update until the unchanged check (NOD-4)", () => {
		const { rows, errors } = mapFile(
			"update",
			["id", "startDate"],
			[[EVENT_ID, ""]],
		);
		expect(errors).toEqual([]);
		expect(rows[0].deferredErrors).toEqual([
			{ line: 2, column: "startDate", code: "required" },
		]);
	});

	it("defers an unknown hipHazardId on update until the unchanged check (NOD-4)", () => {
		const { rows, errors } = mapFile(
			"update",
			["id", "hipHazardId"],
			[[EVENT_ID, "99999"]],
		);
		expect(errors).toEqual([]);
		expect(rows[0].deferredErrors).toEqual([
			{ line: 2, column: "hipHazardId", code: "not_found" },
		]);
	});

	it("reports an empty id on update", () => {
		const { errors } = mapFile("update", ["id", "description"], [["", "d"]]);
		expect(errors).toContainEqual({ line: 2, column: "id", code: "required" });
	});

	it("reports an empty apiImportId on upsert", () => {
		const { errors } = mapFile(
			"upsert",
			["apiImportId", "description"],
			[["", "d"]],
		);
		expect(errors).toContainEqual({
			line: 2,
			column: "apiImportId",
			code: "required",
		});
	});
});

describe("mapCsvRows: invalid_date", () => {
	it("reports 2025-13-45 on line 3 with its column and value", () => {
		const { errors } = mapRecords("create", [
			createRow(),
			createRow({ startDate: "2025-13-45" }),
		]);
		expect(errors).toContainEqual({
			line: 3,
			column: "startDate",
			code: "invalid_date",
			value: "2025-13-45",
		});
	});

	it.each(["01/02/2025", "2025-1-1", "yesterday", "2025-01-01T00:00:00Z"])(
		"rejects %j as an endDate",
		(value) => {
			const { errors } = mapRecords("create", [createRow({ endDate: value })]);
			expect(errors).toContainEqual({
				line: 2,
				column: "endDate",
				code: "invalid_date",
				value,
			});
		},
	);
});

describe("mapCsvRows: invalid_enum", () => {
	it("reports an unknown hazardousEventStatus", () => {
		const { errors } = mapRecords("create", [
			createRow({ hazardousEventStatus: "unknown" }),
		]);
		expect(errors).toEqual([
			{
				line: 2,
				column: "hazardousEventStatus",
				code: "invalid_enum",
				value: "unknown",
			},
		]);
	});

	it.each(["forecasted", "ongoing", "passed"])(
		"accepts hazardousEventStatus %j",
		(value) => {
			const { rows, errors } = mapRecords("create", [
				createRow({ hazardousEventStatus: value }),
			]);
			expect(errors).toEqual([]);
			expect(rows[0].fields.hazardousEventStatus).toBe(value);
		},
	);

	it.each(["bogus", "Published", "rejected"])(
		"reports approvalStatus %j as invalid_enum",
		(value) => {
			const { errors } = mapRecords("create", [
				createRow({ approvalStatus: value }),
			]);
			expect(errors).toContainEqual({
				line: 2,
				column: "approvalStatus",
				code: "invalid_enum",
				value,
			});
		},
	);
});

describe("mapCsvRows: invalid_id", () => {
	it("reports a non-UUID id on update", () => {
		const { errors } = mapFile(
			"update",
			["id", "description"],
			[["not-a-uuid", "d"]],
		);
		expect(errors).toEqual([
			{ line: 2, column: "id", code: "invalid_id", value: "not-a-uuid" },
		]);
	});

	it("reports a non-UUID specificHazardId", () => {
		const { errors } = mapRecords("create", [
			{
				specificHazardId: "78424",
				startDate: "2025",
				endDate: "2025",
				recordOriginator: "A",
			},
		]);
		expect(errors).toContainEqual({
			line: 2,
			column: "specificHazardId",
			code: "invalid_id",
			value: "78424",
		});
	});

	it("reports a non-UUID parent", () => {
		const { errors } = mapRecords("create", [createRow({ parent: "P-1" })]);
		expect(errors).toContainEqual({
			line: 2,
			column: "parent",
			code: "invalid_id",
			value: "P-1",
		});
	});
});

describe("mapCsvRows: invalid_character (gate 10, finding 2)", () => {
	it.each(["hipHazardId", "description", "startDate"])(
		"reports a NUL character in %s as invalid_character on that column (other checks on the cell may still report it)",
		(column) => {
			const { errors } = mapRecords("create", [
				createRow({ [column]: "a\u0000b" }),
			]);
			expect(errors).toContainEqual({
				line: 2,
				code: "invalid_character",
				column,
			});
		},
	);

	it("reports a NUL in an upsert apiImportId in phase 1, before any lookup by it", () => {
		const { errors } = mapFile(
			"upsert",
			["apiImportId", "description"],
			[["A\u00001", "x"]],
		);
		expect(errors).toEqual([
			{ line: 2, code: "invalid_character", column: "apiImportId" },
		]);
	});

	it("reports it in phase 1 for update rows too, not deferred", () => {
		const { errors, rows } = mapFile(
			"update",
			["id", "description"],
			[[EVENT_ID, "x\u0000"]],
		);
		expect(errors).toEqual([
			{ line: 2, code: "invalid_character", column: "description" },
		]);
		expect(rows[0].deferredErrors).toEqual([]);
	});
});

describe("mapCsvRows: duplicate_key", () => {
	it("reports a repeated upsert apiImportId on its second line only", () => {
		const header = ["apiImportId", "description"];
		const { errors } = mapFile("upsert", header, [
			["A1", "a"],
			["B1", "b"],
			["C1", "c"],
			["A1", "d"],
		]);
		expect(errors).toEqual([
			{ line: 5, column: "apiImportId", code: "duplicate_key", value: "A1" },
		]);
	});

	it("reports a repeated id in update mode", () => {
		const { errors } = mapFile(
			"update",
			["id", "description"],
			[
				[EVENT_ID, "a"],
				[EVENT_ID, "b"],
			],
		);
		expect(errors).toEqual([
			{ line: 3, column: "id", code: "duplicate_key", value: EVENT_ID },
		]);
	});

	it("treats formula-guarded and unguarded forms of one key as the same key", () => {
		const { errors } = mapFile("upsert", ["apiImportId"], [["'=A1"], ["=A1"]]);
		expect(errors).toContainEqual(
			expect.objectContaining({ line: 3, code: "duplicate_key" }),
		);
	});
});

describe("mapCsvRows: HIP resolution (D13)", () => {
	it("reports an unknown hipHazardId as not_found on that column", () => {
		const { errors } = mapRecords("create", [
			createRow({ hipHazardId: "99999" }),
		]);
		expect(errors).toContainEqual({
			line: 2,
			column: "hipHazardId",
			code: "not_found",
		});
	});

	it("reports an unknown specificHazardId as not_found on that column", () => {
		const { errors } = mapRecords("create", [
			{
				specificHazardId: SH_UNKNOWN,
				startDate: "2025",
				endDate: "2025",
				recordOriginator: "A",
			},
		]);
		expect(errors).toContainEqual({
			line: 2,
			column: "specificHazardId",
			code: "not_found",
		});
	});

	it("uses specificHazardId directly when no HIP ids are given", () => {
		const { rows, errors } = mapRecords("create", [
			{
				specificHazardId: SH_OTHER,
				startDate: "2025",
				endDate: "2025",
				recordOriginator: "A",
			},
		]);
		expect(errors).toEqual([]);
		expect(rows[0].specificHazardId).toBe(SH_OTHER);
	});

	it("accepts a specificHazardId that agrees with hipHazardId", () => {
		const { rows, errors } = mapRecords("create", [
			createRow({ specificHazardId: SH_78424 }),
		]);
		expect(errors).toEqual([]);
		expect(rows[0].specificHazardId).toBe(SH_78424);
	});

	it("reports hip_mismatch when hipClusterId is not the hazard's cluster", () => {
		const { errors } = mapRecords("create", [
			createRow({ hipClusterId: "1743" }),
		]);
		expect(errors).toContainEqual(
			expect.objectContaining({ line: 2, code: "hip_mismatch" }),
		);
		expect(errors.find((e) => e.code === "hip_mismatch")).not.toHaveProperty(
			"value",
		);
	});

	it("reports hip_mismatch when hipTypeId is not the hazard's type", () => {
		const { errors } = mapRecords("create", [createRow({ hipTypeId: "1038" })]);
		expect(errors).toContainEqual(
			expect.objectContaining({ line: 2, code: "hip_mismatch" }),
		);
	});

	it("reports hip_mismatch when hipClusterId is an unknown ref", () => {
		const { errors } = mapRecords("create", [
			createRow({ hipClusterId: "9999" }),
		]);
		expect(errors).toContainEqual(
			expect.objectContaining({ line: 2, code: "hip_mismatch" }),
		);
	});

	it("reports hip_mismatch when specificHazardId disagrees with hipHazardId", () => {
		const { errors } = mapRecords("create", [
			createRow({ specificHazardId: SH_OTHER }),
		]);
		expect(errors).toContainEqual(
			expect.objectContaining({ line: 2, code: "hip_mismatch" }),
		);
	});

	it("reports hip_mismatch when hipClusterId contradicts specificHazardId", () => {
		const { errors } = mapRecords("create", [
			{
				specificHazardId: SH_78424,
				hipClusterId: "1743",
				startDate: "2025",
				endDate: "2025",
				recordOriginator: "A",
			},
		]);
		expect(errors).toContainEqual(
			expect.objectContaining({ line: 2, code: "hip_mismatch" }),
		);
	});
});

describe("mapCsvRows: specific_hazard_required (NOD-6)", () => {
	it("is reported on create when only hipTypeId and hipClusterId are given", () => {
		const { errors } = mapRecords("create", [createRow({ hipHazardId: "" })]);
		expect(errors).toContainEqual(
			expect.objectContaining({ line: 2, code: "specific_hazard_required" }),
		);
		expect(
			errors.find((e) => e.code === "specific_hazard_required"),
		).not.toHaveProperty("value");
	});

	it("is reported on create when no hazard column exists at all", () => {
		const { errors } = mapRecords("create", [
			{ startDate: "2025", endDate: "2025", recordOriginator: "A" },
		]);
		expect(codes(errors)).toContain("specific_hazard_required");
	});

	it("is not reported on update; the hazard stays unchanged", () => {
		const { rows, errors } = mapFile(
			"update",
			["id", "description"],
			[[EVENT_ID, "d"]],
		);
		expect(errors).toEqual([]);
		expect(rows[0].specificHazardId).toBeUndefined();
	});
});

describe("mapCsvRows: status_not_permitted (NOD-2)", () => {
	it.each(["data-collector", "data-validator", "data-viewer", null])(
		"rejects a published create row from role %j",
		(role) => {
			const { errors } = mapRecords(
				"create",
				[createRow({ approvalStatus: "published" })],
				{ role },
			);
			expect(errors).toContainEqual(
				expect.objectContaining({ line: 2, code: "status_not_permitted" }),
			);
			expect(
				errors.find((e) => e.code === "status_not_permitted"),
			).not.toHaveProperty("value");
		},
	);

	it.each(["waiting-for-validation", "needs-revision", "validated"])(
		"rejects non-draft status %j from a data-collector",
		(status) => {
			const { errors } = mapRecords(
				"create",
				[createRow({ approvalStatus: status })],
				{ role: "data-collector" },
			);
			expect(codes(errors)).toContain("status_not_permitted");
		},
	);

	it("lets an admin import a published row", () => {
		const { rows, errors } = mapRecords(
			"create",
			[createRow({ approvalStatus: "published" })],
			{ role: "admin" },
		);
		expect(errors).toEqual([]);
		expect(rows[0].targetStatus).toBe("PUBLISHED");
	});

	it.each(["", "draft"])(
		"lets a data-collector import approvalStatus %j as DRAFT",
		(status) => {
			const { rows, errors } = mapRecords(
				"create",
				[createRow({ approvalStatus: status })],
				{ role: "data-collector" },
			);
			expect(errors).toEqual([]);
			expect(rows[0].targetStatus).toBe("DRAFT");
		},
	);
});

describe("mapCsvRows: every failure is listed", () => {
	it("reports line 2's missing recordOriginator and line 4's bad status, in line order", () => {
		const { errors } = mapRecords("create", [
			createRow({ recordOriginator: "" }),
			createRow(),
			createRow({ hazardousEventStatus: "unknown" }),
		]);
		expect(errors).toEqual([
			{ line: 2, column: "recordOriginator", code: "required" },
			{
				line: 4,
				column: "hazardousEventStatus",
				code: "invalid_enum",
				value: "unknown",
			},
		]);
	});

	it("lists errors in line order, keeping several errors of one line together", () => {
		const { errors } = mapFile(
			"upsert",
			["apiImportId", "startDate"],
			[
				["A1", "2025"],
				["A1", "bad"],
				["B1", "bad"],
			],
		);
		const lines = errors.map((e) => e.line);
		expect(lines).toEqual([...lines].sort((a, b) => a - b));
		expect(lines).toEqual([3, 3, 4]);
	});

	it("reports both an unknown hipHazardId and an empty recordOriginator on one row", () => {
		const { errors } = mapRecords("create", [
			createRow({ hipHazardId: "99999", recordOriginator: "" }),
		]);
		expect(errors).toContainEqual(
			expect.objectContaining({
				line: 2,
				code: "not_found",
				column: "hipHazardId",
			}),
		);
		expect(errors).toContainEqual({
			line: 2,
			column: "recordOriginator",
			code: "required",
		});
	});
});

describe("mapCsvRows: empty versus absent cells", () => {
	it("leaves every absent column undefined", () => {
		const { rows, errors } = mapFile(
			"update",
			["id", "description"],
			[[EVENT_ID, "d2"]],
		);
		expect(errors).toEqual([]);
		const row = rows[0];
		expect(row.fields.description).toBe("d2");
		expect(row.fields).not.toHaveProperty("magnitude");
		expect(row.fields).not.toHaveProperty("startDate");
		expect(row.fields).not.toHaveProperty("hazardousEventStatus");
		expect(row.fields).not.toHaveProperty("specificHazardLocalName");
		expect(row.causeId).toBeUndefined();
		expect(row.targetStatus).toBeUndefined();
		expect(row.apiImportId).toBeUndefined();
		expect(row.specificHazardId).toBeUndefined();
	});

	it.each([
		"nationalSpecification",
		"description",
		"chainsExplanation",
		"magnitude",
		"dataSource",
	])("maps an empty %s cell to an empty string, never null", (column) => {
		const { rows, errors } = mapFile(
			"update",
			["id", column],
			[[EVENT_ID, ""]],
		);
		expect(errors).toEqual([]);
		expect(rows[0].fields).toHaveProperty(column, "");
	});

	it.each(["specificHazardLocalName", "specificHazardNationalName"])(
		"maps an empty %s cell to null",
		(column) => {
			const { rows } = mapFile("update", ["id", column], [[EVENT_ID, ""]]);
			expect(rows[0].fields).toHaveProperty(column, null);
		},
	);

	it("maps an empty hazardousEventStatus cell to null", () => {
		const { rows, errors } = mapFile(
			"update",
			["id", "hazardousEventStatus"],
			[[EVENT_ID, ""]],
		);
		expect(errors).toEqual([]);
		expect(rows[0].fields.hazardousEventStatus).toBeNull();
	});

	it("maps an empty parent cell to an empty causeId, which clears the link", () => {
		const { rows, errors } = mapFile(
			"update",
			["id", "parent"],
			[[EVENT_ID, ""]],
		);
		expect(errors).toEqual([]);
		expect(rows[0].causeId).toBe("");
	});

	it("maps a parent UUID to causeId", () => {
		const { rows } = mapRecords("create", [createRow({ parent: PARENT_ID })]);
		expect(rows[0].causeId).toBe(PARENT_ID);
	});
});

describe("mapCsvRows: line numbers", () => {
	it("numbers rows from firstDataLine", () => {
		const { rows, errors } = mapRecords(
			"create",
			[createRow(), createRow({ startDate: "bad" })],
			{ firstDataLine: 10 },
		);
		expect(rows.map((r) => r.line)).toEqual([10, 11]);
		expect(errors).toEqual([
			{ line: 11, column: "startDate", code: "invalid_date", value: "bad" },
		]);
	});
});

describe("mapCsvRows: echoed values", () => {
	const long = "x".repeat(150);

	it("truncates an echoed invalid_date value to 100 characters", () => {
		const { errors } = mapRecords("create", [createRow({ startDate: long })]);
		const error = errors.find((e) => e.code === "invalid_date");
		expect(error?.value).toBe("x".repeat(100));
	});

	it("does not echo the value of a not_found error (D6)", () => {
		const { errors } = mapRecords("create", [createRow({ hipHazardId: long })]);
		const error = errors.find((e) => e.code === "not_found");
		expect(error).toBeDefined();
		expect(error?.value).toBeUndefined();
	});

	it("truncates an echoed duplicate_key value to 100 characters", () => {
		const { errors } = mapFile("upsert", ["apiImportId"], [[long], [long]]);
		expect(errors).toEqual([
			{
				line: 3,
				column: "apiImportId",
				code: "duplicate_key",
				value: "x".repeat(100),
			},
		]);
	});

	it("echoes no value for required errors", () => {
		const { errors } = mapRecords("create", [
			createRow({ recordOriginator: "" }),
		]);
		expect(errors[0]).not.toHaveProperty("value");
	});
});

describe("mapCsvRows: formula-guard reversal (NOD-13)", () => {
	const guarded = [
		"=",
		"+",
		"-",
		"@",
		"\t",
		"\r",
		"\n",
		"＝",
		"＋",
		"－",
		"＠",
	];

	it.each(guarded)("strips the ' before %j in a text cell", (char) => {
		const { rows } = mapFile(
			"update",
			["id", "description"],
			[[EVENT_ID, `'${char}x`]],
		);
		expect(rows[0].fields.description).toBe(`${char}x`);
		expect(rows[0].cells.get("description")).toBe(`${char}x`);
	});

	it("keeps a cell that merely starts with '", () => {
		const { rows } = mapFile(
			"update",
			["id", "description"],
			[[EVENT_ID, "'quoted"]],
		);
		expect(rows[0].fields.description).toBe("'quoted");
	});

	it("matches an upsert row by the unguarded apiImportId", () => {
		const { rows, errors } = mapFile(
			"upsert",
			["apiImportId", "magnitude"],
			[["'=A1", "'-5"]],
		);
		expect(errors).toEqual([]);
		expect(rows[0].apiImportId).toBe("=A1");
		expect(rows[0].fields.magnitude).toBe("-5");
	});
});

function attachments(items: unknown): string {
	return JSON.stringify(items);
}

const LINK_ITEM = {
	id: "1",
	title: "Report",
	tag: [{ id: "t", name: "Tag" }],
	file_option: "Link",
	url: "https://example.com/a",
};

function fileItem(name: string) {
	return {
		title: "Scan",
		file_option: "File",
		file: { name, content_type: "application/pdf" },
	};
}

describe("mapCsvRows: attachments (D5, D10)", () => {
	it("maps a Link item to an attachment item, dropping its id", () => {
		const { rows, errors } = mapRecords("create", [
			createRow({ attachments: attachments([LINK_ITEM]) }),
		]);
		expect(errors).toEqual([]);
		expect(rows[0].attachments).toStrictEqual([
			{
				type: "Link",
				title: "Report",
				tag: [{ id: "t", name: "Tag" }],
				url: "https://example.com/a",
			},
		]);
	});

	it("never reports a row as carrying not-yet-imported data", () => {
		const { rows } = mapRecords("create", [
			createRow({ attachments: "[]", spatialFootprint: "[]" }),
		]);
		expect("hasNotYetImportedData" in rows[0]).toBe(false);
	});

	it.each(["create", "update", "upsert"] as const)(
		"OD-2: treats an empty cell as not supplied in %s mode",
		(mode) => {
			const key: Record<string, string> =
				mode === "create"
					? createRow()
					: mode === "update"
						? { id: EVENT_ID }
						: { apiImportId: "A1" };
			const { rows, errors } = mapRecords(mode, [{ ...key, attachments: "" }]);
			expect(errors).toEqual([]);
			expect(rows[0].attachments).toBeUndefined();
			expect(rows[0].deferredErrors).toEqual([]);
		},
	);

	describe("create mode: every rule in phase 1", () => {
		it("rejects unparseable JSON and an object, without echoing the cell", () => {
			const { errors } = mapRecords("create", [
				createRow({ attachments: "{bad" }),
				createRow({ attachments: attachments(LINK_ITEM) }),
			]);
			expect(errors).toEqual([
				{ line: 2, code: "invalid_attachments", column: "attachments" },
				{ line: 3, code: "invalid_attachments", column: "attachments" },
			]);
		});

		it("rejects an item with no file_option (OD-3)", () => {
			const { errors } = mapRecords("create", [
				createRow({
					attachments: attachments([{ title: "x", url: "https://a.example" }]),
				}),
			]);
			expect(codes(errors)).toEqual(["invalid_attachments"]);
		});

		it("rejects an empty Link URL with invalid_attachment_url, without echoing it", () => {
			const { errors } = mapRecords("create", [
				createRow({ attachments: attachments([{ ...LINK_ITEM, url: "" }]) }),
			]);
			expect(errors).toEqual([
				{ line: 2, code: "invalid_attachment_url", column: "attachments" },
			]);
		});

		it.each(["javascript:alert(1)", "data:text/html,x"])(
			"rejects the Link %j with invalid_attachment_url, echoing it",
			(url) => {
				const { errors } = mapRecords("create", [
					createRow({ attachments: attachments([{ ...LINK_ITEM, url }]) }),
				]);
				expect(errors).toEqual([
					{
						line: 2,
						code: "invalid_attachment_url",
						column: "attachments",
						value: url,
					},
				]);
			},
		);

		it("truncates an echoed URL to 100 characters", () => {
			const url = `javascript:${"a".repeat(200)}`;
			const { errors } = mapRecords("create", [
				createRow({ attachments: attachments([{ ...LINK_ITEM, url }]) }),
			]);
			expect(errors[0].value).toBe(url.slice(0, 100));
		});

		it.each([
			"/uploads/temp/report.pdf",
			"/uploads/hazardous-event/E/report.pdf",
		])(
			"rejects the File item %s with file_reference_not_supported, echoing the basename",
			(name) => {
				const { errors } = mapRecords("create", [
					createRow({ attachments: attachments([fileItem(name)]) }),
				]);
				expect(errors).toEqual([
					{
						line: 2,
						code: "file_reference_not_supported",
						column: "attachments",
						value: "report.pdf",
					},
				]);
			},
		);
	});

	describe.each(["update", "upsert"] as const)(
		"%s mode: only JSON syntax in phase 1 (D10, NOD-4)",
		(mode) => {
			const key: Record<string, string> =
				mode === "update" ? { id: EVENT_ID } : { apiImportId: "A1" };

			it("rejects unparseable JSON at once", () => {
				const { rows, errors } = mapRecords(mode, [
					{ ...key, attachments: "{bad" },
				]);
				expect(errors).toEqual([
					{ line: 2, code: "invalid_attachments", column: "attachments" },
				]);
				expect(rows[0].deferredErrors).toEqual([]);
			});

			it("defers a shape error until the row is known to be changed", () => {
				const { rows, errors } = mapRecords(mode, [
					{ ...key, attachments: attachments(LINK_ITEM) },
				]);
				expect(errors).toEqual([]);
				expect(rows[0].deferredErrors).toEqual([
					{ line: 2, code: "invalid_attachments", column: "attachments" },
				]);
			});

			it("leaves URL and File checks to phase 2, which knows the event's files", () => {
				const { rows, errors } = mapRecords(mode, [
					{
						...key,
						attachments: attachments([
							{ ...LINK_ITEM, url: "javascript:x" },
							fileItem("/uploads/temp/r.pdf"),
						]),
					},
				]);
				expect(errors).toEqual([]);
				expect(rows[0].deferredErrors).toEqual([]);
				expect(rows[0].attachments).toHaveLength(2);
			});
		},
	);
});

function footprint(items: unknown): string {
	return JSON.stringify(items);
}

const POINT_ITEM = {
	map_option: "Map coordinates",
	geojson: {
		type: "Feature",
		geometry: { type: "Point", coordinates: [77.2, 28.6] },
		properties: {},
	},
};

function divisionItem(id: string) {
	return {
		map_option: "Geographic level",
		geojson: { properties: { division_id: id } },
	};
}

describe("mapCsvRows: spatialFootprint (D2, D4, D10)", () => {
	it("maps a legacy footprint to geometries and division ids", () => {
		const { rows, errors } = mapRecords("create", [
			createRow({
				spatialFootprint: footprint([POINT_ITEM, divisionItem(DIVISION_OWN)]),
			}),
		]);
		expect(errors).toEqual([]);
		expect(rows[0].spatialFootprint).toStrictEqual({
			geometries: [{ type: "Point", coordinates: [77.2, 28.6] }],
			divisionIds: [DIVISION_OWN],
		});
	});

	it("maps [] to an empty footprint", () => {
		const { rows, errors } = mapRecords("create", [
			createRow({ spatialFootprint: "[]" }),
		]);
		expect(errors).toEqual([]);
		expect(rows[0].spatialFootprint).toStrictEqual({
			geometries: [],
			divisionIds: [],
		});
	});

	it.each(["create", "update", "upsert"] as const)(
		"OD-2: treats an empty cell as not supplied in %s mode",
		(mode) => {
			const record =
				mode === "create"
					? createRow({ spatialFootprint: "" })
					: mode === "update"
						? { id: EVENT_ID, spatialFootprint: "" }
						: { apiImportId: "A1", spatialFootprint: "" };
			const { rows, errors } = mapRecords(mode, [record]);
			expect(errors).toEqual([]);
			expect(rows[0].spatialFootprint).toBeUndefined();
			expect(rows[0].deferredErrors).toEqual([]);
		},
	);

	describe("create mode: every rule in phase 1", () => {
		it("rejects unparseable JSON and a structurally broken geometry, without echoing the cell", () => {
			const { errors } = mapRecords("create", [
				createRow({ spatialFootprint: "{not json" }),
				createRow({
					spatialFootprint: footprint([
						{
							map_option: "Map coordinates",
							geojson: { type: "Point", coordinates: "x" },
						},
					]),
				}),
			]);
			expect(errors).toEqual([
				{
					line: 2,
					code: "invalid_spatial_footprint",
					column: "spatialFootprint",
				},
				{
					line: 3,
					code: "invalid_spatial_footprint",
					column: "spatialFootprint",
				},
			]);
		});

		it("rejects an object instead of an array (OD-3)", () => {
			const { errors } = mapRecords("create", [
				createRow({ spatialFootprint: footprint(POINT_ITEM) }),
			]);
			expect(codes(errors)).toEqual(["invalid_spatial_footprint"]);
		});

		it("rejects a division outside the session tenant's valid set, echoing the id", () => {
			const { errors } = mapRecords("create", [
				createRow({
					spatialFootprint: footprint([divisionItem(DIVISION_OTHER)]),
				}),
			]);
			expect(errors).toEqual([
				{
					line: 2,
					code: "invalid_division",
					column: "spatialFootprint",
					value: DIVISION_OTHER,
				},
			]);
		});

		it("rejects a non-UUID division id with invalid_division, echoing it", () => {
			const { errors } = mapRecords("create", [
				createRow({
					spatialFootprint: footprint([
						{ map_option: "Geographic level", division_id: "abc" },
					]),
				}),
			]);
			expect(errors).toEqual([
				{
					line: 2,
					code: "invalid_division",
					column: "spatialFootprint",
					value: "abc",
				},
			]);
		});

		it("accepts a valid division written in upper case", () => {
			const { rows, errors } = mapRecords("create", [
				createRow({
					spatialFootprint: footprint([
						divisionItem(DIVISION_OWN.toUpperCase()),
					]),
				}),
			]);
			expect(errors).toEqual([]);
			expect(rows[0].spatialFootprint?.divisionIds).toEqual([DIVISION_OWN]);
		});

		it("lists a footprint error beside the row's other errors", () => {
			const { errors } = mapRecords("create", [
				createRow({ startDate: "bad", spatialFootprint: "{x" }),
			]);
			expect(codes(errors).sort()).toEqual(
				["invalid_date", "invalid_spatial_footprint"].sort(),
			);
		});
	});

	describe.each(["update", "upsert"] as const)(
		"%s mode: only JSON syntax in phase 1 (D10, NOD-4)",
		(mode) => {
			const key: Record<string, string> =
				mode === "update" ? { id: EVENT_ID } : { apiImportId: "A1" };

			it("rejects unparseable JSON at once", () => {
				const { rows, errors } = mapRecords(mode, [
					{ ...key, spatialFootprint: "{not json" },
				]);
				expect(errors).toEqual([
					{
						line: 2,
						code: "invalid_spatial_footprint",
						column: "spatialFootprint",
					},
				]);
				expect(rows[0].deferredErrors).toEqual([]);
			});

			it("defers a content error until the row is known to be changed", () => {
				const { rows, errors } = mapRecords(mode, [
					{ ...key, spatialFootprint: footprint(POINT_ITEM) },
				]);
				expect(errors).toEqual([]);
				expect(rows[0].deferredErrors).toEqual([
					{
						line: 2,
						code: "invalid_spatial_footprint",
						column: "spatialFootprint",
					},
				]);
			});

			it("defers invalid_division for a division outside the tenant", () => {
				const { rows, errors } = mapRecords(mode, [
					{
						...key,
						spatialFootprint: footprint([divisionItem(DIVISION_OTHER)]),
					},
				]);
				expect(errors).toEqual([]);
				expect(rows[0].deferredErrors).toEqual([
					{
						line: 2,
						code: "invalid_division",
						column: "spatialFootprint",
						value: DIVISION_OTHER,
					},
				]);
				expect(rows[0].spatialFootprint?.divisionIds).toEqual([DIVISION_OTHER]);
			});
		},
	);
});

describe("collectDivisionIds (D4)", () => {
	it("collects distinct well-formed division ids, lower-cased, skipping malformed cells and ids", () => {
		const check = checkHeader(
			["spatialFootprint", "startDate", "endDate", "recordOriginator"],
			"create",
		);
		if (!check.ok) throw new Error("header rejected");
		const tail = ["2025", "2025", "A"];
		const ids = collectDivisionIds(check.columns, [
			[
				footprint([divisionItem(DIVISION_OWN.toUpperCase()), POINT_ITEM]),
				...tail,
			],
			[
				footprint([divisionItem(DIVISION_OWN), divisionItem(DIVISION_OTHER)]),
				...tail,
			],
			[
				footprint([{ map_option: "Geographic level", division_id: "abc" }]),
				...tail,
			],
			["{not json", ...tail],
			["", ...tail],
		]);
		expect([...ids].sort()).toEqual([DIVISION_OWN, DIVISION_OTHER].sort());
	});

	it("returns no ids when the column is absent", () => {
		const columns = new Map<MappedColumn, number>([["description", 0]]);
		expect(collectDivisionIds(columns, [["d"]])).toEqual([]);
	});
});

describe("collectSourceRefs", () => {
	it("collects distinct non-empty refs per column, with the guard reversed", () => {
		const header = [
			"hipHazardId",
			"hipClusterId",
			"hipTypeId",
			"specificHazardId",
		];
		const check = checkHeader(
			[...header, "startDate", "endDate", "recordOriginator"],
			"create",
		);
		if (!check.ok) throw new Error("header rejected");
		const refs = collectSourceRefs(check.columns, [
			["78424", "1844", "1037", SH_78424, "2025", "2025", "A"],
			["78424", "", "1037", "not-a-uuid", "2025", "2025", "A"],
			["'-1", "1743", "", SH_OTHER, "2025", "2025", "A"],
		]);
		expect([...refs.hazardRefs].sort()).toEqual(["-1", "78424"]);
		expect([...refs.clusterRefs].sort()).toEqual(["1743", "1844"]);
		expect([...refs.typeRefs]).toEqual(["1037"]);
		expect([...(refs.specificHazardIds ?? [])].sort()).toEqual(
			[SH_78424, SH_OTHER].sort(),
		);
	});

	it("leaves out refs containing a NUL character, so the lookup never sees one", () => {
		const check = checkHeader(
			[
				"hipHazardId",
				"hipClusterId",
				"startDate",
				"endDate",
				"recordOriginator",
			],
			"create",
		);
		if (!check.ok) throw new Error("header rejected");
		const refs = collectSourceRefs(check.columns, [
			["78\u0000424", "18\u000044", "2025", "2025", "A"],
			["78424", "1844", "2025", "2025", "A"],
		]);
		expect(refs.hazardRefs).toEqual(["78424"]);
		expect(refs.clusterRefs).toEqual(["1844"]);
	});

	it("returns empty lists for absent columns", () => {
		const columns = new Map<MappedColumn, number>([["description", 0]]);
		const refs = collectSourceRefs(columns, [["d"]]);
		expect(refs.hazardRefs).toEqual([]);
		expect(refs.clusterRefs).toEqual([]);
		expect(refs.typeRefs).toEqual([]);
		expect(refs.specificHazardIds ?? []).toEqual([]);
	});
});

describe("createPathErrors", () => {
	function row(
		cells: Record<string, string>,
		extra: Partial<MappedCsvRow> = {},
	): MappedCsvRow {
		const entries = Object.entries(cells) as [MappedColumn, string][];
		return {
			line: 7,
			cells: new Map(entries),
			fields: {},
			deferredErrors: [],
			...extra,
		};
	}

	const complete = {
		apiImportId: "A1",
		startDate: "2025",
		endDate: "2025",
		recordOriginator: "A",
	};

	it("is empty for a complete draft row with a hazard", () => {
		expect(
			createPathErrors(row(complete, { specificHazardId: SH_78424 }), null),
		).toEqual([]);
	});

	it("requires startDate, endDate and recordOriginator on the create path", () => {
		const errors = createPathErrors(
			row({ apiImportId: "A1" }, { specificHazardId: SH_78424 }),
			"admin",
		);
		expect(errors).toEqual(
			expect.arrayContaining([
				{ line: 7, column: "startDate", code: "required" },
				{ line: 7, column: "endDate", code: "required" },
				{ line: 7, column: "recordOriginator", code: "required" },
			]),
		);
		expect(errors).toHaveLength(3);
	});

	it("requires a specific hazard", () => {
		expect(createPathErrors(row(complete), "admin")).toEqual([
			expect.objectContaining({ line: 7, code: "specific_hazard_required" }),
		]);
	});

	it("rejects a non-draft target status for a non-admin", () => {
		const errors = createPathErrors(
			row(complete, { specificHazardId: SH_78424, targetStatus: "APPROVED" }),
			"data-validator",
		);
		expect(errors).toEqual([
			expect.objectContaining({ line: 7, code: "status_not_permitted" }),
		]);
	});

	it("allows a non-draft target status for an admin", () => {
		expect(
			createPathErrors(
				row(complete, {
					specificHazardId: SH_78424,
					targetStatus: "PUBLISHED",
				}),
				"admin",
			),
		).toEqual([]);
	});

	it("allows a DRAFT target status for any role", () => {
		expect(
			createPathErrors(
				row(complete, { specificHazardId: SH_78424, targetStatus: "DRAFT" }),
				"data-collector",
			),
		).toEqual([]);
	});
});
