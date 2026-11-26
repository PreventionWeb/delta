import { describe, expect, it } from "vitest";
import {
	EXPORT_HEADER,
	LEGACY_EXPORT_HEADER,
	checkHeader,
	isCsvImportMode,
	type CsvImportMode,
	type MappedColumn,
} from "./hazardousEventCsvColumns";

// design.md E1, typed out from the spec so the test does not mirror the module's constant.
const E1 = [
	"updatedAt",
	"createdAt",
	"approvalStatus",
	"createdByUserId",
	"updatedByUserId",
	"submittedByUserId",
	"submittedAt",
	"validatedByUserId",
	"validatedAt",
	"publishedByUserId",
	"publishedAt",
	"apiImportId",
	"hipHazardId",
	"hipClusterId",
	"hipTypeId",
	"id",
	"countryAccountsId",
	"specificHazardId",
	"status",
	"nationalSpecification",
	"startDate",
	"endDate",
	"description",
	"chainsExplanation",
	"magnitude",
	"recordOriginator",
	"hazardousEventStatus",
	"dataSource",
	"specificHazardLocalName",
	"specificHazardNationalName",
];

// design.md X1 plus `apiImportId`, which the legacy create template omits.
const X1 =
	"parent,hipHazardId,hipClusterId,hipTypeId,approvalStatus,nationalSpecification,startDate,endDate,description,chainsExplanation,magnitude,spatialFootprint,attachments,recordOriginator,hazardousEventStatus,dataSource,apiImportId,countryAccountsId".split(
		",",
	);

const READ_ONLY = [
	"updatedAt",
	"createdAt",
	"createdByUserId",
	"updatedByUserId",
	"submittedByUserId",
	"submittedAt",
	"validatedByUserId",
	"validatedAt",
	"publishedByUserId",
	"publishedAt",
	"status",
];

const MAPPED: MappedColumn[] = [
	"parent",
	"hipHazardId",
	"hipClusterId",
	"hipTypeId",
	"approvalStatus",
	"nationalSpecification",
	"startDate",
	"endDate",
	"description",
	"chainsExplanation",
	"magnitude",
	"recordOriginator",
	"hazardousEventStatus",
	"dataSource",
	"apiImportId",
	"specificHazardId",
	"specificHazardLocalName",
	"specificHazardNationalName",
];

const MODES: CsvImportMode[] = ["create", "update", "upsert"];

/** The minimal header that satisfies a mode's required columns. */
function baseHeader(mode: CsvImportMode): string[] {
	if (mode === "create") return ["startDate", "endDate", "recordOriginator"];
	if (mode === "update") return ["id"];
	return ["apiImportId"];
}

function codesOf(result: ReturnType<typeof checkHeader>) {
	return result.ok ? [] : result.fileErrors;
}

describe("isCsvImportMode", () => {
	it("accepts create, update and upsert", () => {
		for (const mode of MODES) expect(isCsvImportMode(mode)).toBe(true);
	});

	it("rejects any other value, including case variants", () => {
		for (const value of ["bogus", "", "Create", "UPDATE", " upsert"]) {
			expect(isCsvImportMode(value)).toBe(false);
		}
	});
});

describe("export headers", () => {
	it("LEGACY_EXPORT_HEADER is the legacy export header E1 in legacy order", () => {
		expect([...LEGACY_EXPORT_HEADER]).toEqual(E1);
	});

	it("EXPORT_HEADER is E1 followed by parent only", () => {
		expect([...EXPORT_HEADER]).toEqual([...E1, "parent"]);
	});

	it("EXPORT_HEADER emits neither spatialFootprint nor attachments in 6d-1", () => {
		expect(EXPORT_HEADER).not.toContain("spatialFootprint");
		expect(EXPORT_HEADER).not.toContain("attachments");
	});
});

describe("checkHeader: accepted columns", () => {
	it.each(MODES)("maps every legacy and CA data column in %s mode", (mode) => {
		const header = [...new Set([...baseHeader(mode), ...MAPPED])];
		const result = checkHeader(header, mode);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		for (const column of MAPPED) {
			expect(result.columns.get(column), column).toBe(header.indexOf(column));
		}
		expect(result.ignoredColumns).toEqual([]);
	});

	it("maps id to its cell index in update mode", () => {
		const result = checkHeader(["description", "id"], "update");
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.columns.get("id")).toBe(1);
	});

	it("accepts columns in any order", () => {
		const result = checkHeader(
			["recordOriginator", "endDate", "startDate"],
			"create",
		);
		expect(result.ok).toBe(true);
	});
});

describe("checkHeader: ignored columns", () => {
	it.each(MODES)(
		"reports read-only, tenant and not-yet-imported columns as ignored in %s mode",
		(mode) => {
			const ignored = [
				...READ_ONLY,
				"countryAccountsId",
				"spatialFootprint",
				"attachments",
			];
			const result = checkHeader([...baseHeader(mode), ...ignored], mode);
			expect(result.ok).toBe(true);
			if (!result.ok) return;
			expect([...result.ignoredColumns].sort()).toEqual([...ignored].sort());
			for (const column of ignored) {
				expect([...result.columns.keys()], column).not.toContain(column);
			}
		},
	);

	it("reports the cell indexes of spatialFootprint and attachments for the notice", () => {
		const result = checkHeader(
			[
				"spatialFootprint",
				"startDate",
				"endDate",
				"attachments",
				"recordOriginator",
			],
			"create",
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect([...result.notYetImportedIndexes].sort()).toEqual([0, 3]);
	});

	it("does not count other ignored columns, such as createdAt, for the notice", () => {
		const result = checkHeader(
			["createdAt", "startDate", "endDate", "recordOriginator"],
			"create",
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.ignoredColumns).toContain("createdAt");
		expect(result.notYetImportedIndexes).toEqual([]);
	});

	it("ignores id in upsert mode", () => {
		const result = checkHeader(["apiImportId", "id"], "upsert");
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.ignoredColumns).toEqual(["id"]);
		expect([...result.columns.keys()]).not.toContain("id");
	});
});

describe("checkHeader: rejected columns", () => {
	it("rejects id in create mode with unknown_column", () => {
		const result = checkHeader([...baseHeader("create"), "id"], "create");
		expect(result.ok).toBe(false);
		expect(codesOf(result)).toContainEqual(
			expect.objectContaining({ code: "unknown_column", column: "id" }),
		);
	});

	it.each(MODES)("rejects an unknown column in %s mode, naming it", (mode) => {
		const result = checkHeader([...baseHeader(mode), "unknownCol"], mode);
		expect(result.ok).toBe(false);
		expect(codesOf(result)).toContainEqual(
			expect.objectContaining({ code: "unknown_column", column: "unknownCol" }),
		);
	});

	it("matches case-sensitively, so a case variant is unknown", () => {
		const result = checkHeader(
			[...baseHeader("create"), "Description"],
			"create",
		);
		expect(codesOf(result)).toContainEqual(
			expect.objectContaining({
				code: "unknown_column",
				column: "Description",
			}),
		);
	});

	it("rejects a semicolon-joined header as one unknown column", () => {
		const result = checkHeader(
			["startDate;endDate;recordOriginator"],
			"create",
		);
		expect(codesOf(result)).toContainEqual(
			expect.objectContaining({
				code: "unknown_column",
				column: "startDate;endDate;recordOriginator",
			}),
		);
	});
});

describe("checkHeader: trimming", () => {
	it("trims surrounding whitespace before matching", () => {
		const result = checkHeader(
			["  startDate", "endDate\t", " recordOriginator "],
			"create",
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.columns.get("startDate")).toBe(0);
		expect(result.columns.get("recordOriginator")).toBe(2);
	});
});

describe("checkHeader: missing_required_column", () => {
	it.each([
		["create", ["startDate", "endDate", "recordOriginator"]],
		["update", ["id"]],
		["upsert", ["apiImportId"]],
	] as const)("names every required column of %s mode", (mode, required) => {
		const result = checkHeader(["description"], mode);
		expect(result.ok).toBe(false);
		for (const column of required) {
			expect(codesOf(result)).toContainEqual(
				expect.objectContaining({ code: "missing_required_column", column }),
			);
		}
	});

	it("does not require startDate, endDate or recordOriginator in update mode", () => {
		expect(checkHeader(["id", "description"], "update").ok).toBe(true);
	});

	it("does not require id in upsert mode", () => {
		expect(checkHeader(["apiImportId"], "upsert").ok).toBe(true);
	});
});

describe("checkHeader: duplicate_column", () => {
	it("names a duplicated header", () => {
		const result = checkHeader(
			[...baseHeader("create"), "recordOriginator"],
			"create",
		);
		expect(result.ok).toBe(false);
		expect(codesOf(result)).toContainEqual(
			expect.objectContaining({
				code: "duplicate_column",
				column: "recordOriginator",
			}),
		);
	});

	it("treats columns equal after trimming as duplicates", () => {
		const result = checkHeader(
			[...baseHeader("create"), " recordOriginator "],
			"create",
		);
		expect(codesOf(result)).toContainEqual(
			expect.objectContaining({
				code: "duplicate_column",
				column: "recordOriginator",
			}),
		);
	});

	it("rejects a duplicated ignored column too", () => {
		const result = checkHeader(
			[...baseHeader("create"), "attachments", "attachments"],
			"create",
		);
		expect(codesOf(result)).toContainEqual(
			expect.objectContaining({
				code: "duplicate_column",
				column: "attachments",
			}),
		);
	});
});

describe("checkHeader: legacy files", () => {
	it("accepts the legacy create template header X1 in create mode", () => {
		const result = checkHeader(X1, "create");
		expect(result.ok).toBe(true);
	});

	it("reports countryAccountsId, spatialFootprint and attachments of X1 as ignored", () => {
		const result = checkHeader(X1, "create");
		expect([...result.ignoredColumns].sort()).toEqual(
			["attachments", "countryAccountsId", "spatialFootprint"].sort(),
		);
	});

	it.each(["update", "upsert"] as const)(
		"accepts the legacy export header E1 in %s mode",
		(mode) => {
			const result = checkHeader(E1, mode);
			expect(result.ok).toBe(true);
		},
	);

	it.each(["update", "upsert"] as const)(
		"accepts the 6d export header (E1 + parent) in %s mode",
		(mode) => {
			expect(checkHeader([...E1, "parent"], mode).ok).toBe(true);
		},
	);

	it("lists E1's read-only and tenant columns as ignored in update mode", () => {
		const result = checkHeader(E1, "update");
		expect([...result.ignoredColumns].sort()).toEqual(
			[...READ_ONLY, "countryAccountsId"].sort(),
		);
	});

	it("also lists id as ignored for E1 in upsert mode", () => {
		const result = checkHeader(E1, "upsert");
		expect([...result.ignoredColumns].sort()).toEqual(
			[...READ_ONLY, "countryAccountsId", "id"].sort(),
		);
	});
});
