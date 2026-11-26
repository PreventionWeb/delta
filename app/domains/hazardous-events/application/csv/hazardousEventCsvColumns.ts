import type { HazardousEventCsvFileError } from "../dto/HazardousEventCsvImportResult";

export const CSV_IMPORT_MODES = ["create", "update", "upsert"] as const;
export type CsvImportMode = (typeof CSV_IMPORT_MODES)[number];

export function isCsvImportMode(value: string): value is CsvImportMode {
	return (CSV_IMPORT_MODES as readonly string[]).includes(value);
}

/** Legacy export header, in legacy order (design.md E1). */
export const LEGACY_EXPORT_HEADER = [
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
] as const;

/** NOD-10: legacy header unchanged, then appended columns. */
export const EXPORT_HEADER: readonly string[] = [
	...LEGACY_EXPORT_HEADER,
	"parent",
];

/** Columns whose cells become command fields (D3). `id` is handled per mode. */
export const MAPPED_COLUMNS = [
	"parent",
	"hipHazardId",
	"hipClusterId",
	"hipTypeId",
	"specificHazardId",
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
	"specificHazardLocalName",
	"specificHazardNationalName",
	"apiImportId",
] as const;
export type MappedColumn = (typeof MAPPED_COLUMNS)[number] | "id";

/** Accepted and ignored with a per-file notice until 6d-2 (D15). */
export const NOT_YET_IMPORTED_COLUMNS: readonly string[] = [
	"spatialFootprint",
	"attachments",
];

/** Read-only legacy export columns plus the never-honoured tenant column (D3, OD-2). */
const READ_ONLY_COLUMNS: readonly string[] = [
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
	"countryAccountsId",
];

/** Cells required to be non-empty whenever a row takes the create path (D3). */
export const CREATE_PATH_REQUIRED_COLUMNS: readonly MappedColumn[] = [
	"startDate",
	"endDate",
	"recordOriginator",
];

const REQUIRED_COLUMNS: Readonly<Record<CsvImportMode, readonly string[]>> = {
	create: CREATE_PATH_REQUIRED_COLUMNS,
	update: ["id"],
	upsert: ["apiImportId"],
};

type ColumnRole = "mapped" | "ignored" | "rejected";

function columnRole(column: string, mode: CsvImportMode): ColumnRole {
	if (column === "id") {
		if (mode === "update") return "mapped";
		return mode === "upsert" ? "ignored" : "rejected";
	}
	if ((MAPPED_COLUMNS as readonly string[]).includes(column)) return "mapped";
	if (
		READ_ONLY_COLUMNS.includes(column) ||
		NOT_YET_IMPORTED_COLUMNS.includes(column)
	) {
		return "ignored";
	}
	return "rejected";
}

export type HeaderCheck =
	| {
			ok: true;
			/** Mapped column name → cell index. */
			columns: ReadonlyMap<MappedColumn, number>;
			/** Cell indexes of the not-yet-imported columns, for the D15 notice. */
			notYetImportedIndexes: readonly number[];
			ignoredColumns: string[];
	  }
	| {
			ok: false;
			fileErrors: HazardousEventCsvFileError[];
			ignoredColumns: string[];
	  };

/** Exact, case-sensitive match after trimming; an allow-list (OWASP Input Validation). */
export function checkHeader(
	header: readonly string[],
	mode: CsvImportMode,
): HeaderCheck {
	const fileErrors: HazardousEventCsvFileError[] = [];
	const ignoredColumns: string[] = [];
	const columns = new Map<MappedColumn, number>();
	const notYetImportedIndexes: number[] = [];
	const seen = new Set<string>();

	header.forEach((rawColumn, index) => {
		const column = rawColumn.trim();
		if (seen.has(column)) {
			fileErrors.push({ code: "duplicate_column", column });
			return;
		}
		seen.add(column);
		const role = columnRole(column, mode);
		if (role === "rejected") {
			fileErrors.push({ code: "unknown_column", column });
		} else if (role === "ignored") {
			ignoredColumns.push(column);
			if (NOT_YET_IMPORTED_COLUMNS.includes(column)) {
				notYetImportedIndexes.push(index);
			}
		} else {
			columns.set(column as MappedColumn, index);
		}
	});

	for (const column of REQUIRED_COLUMNS[mode]) {
		if (!seen.has(column)) {
			fileErrors.push({ code: "missing_required_column", column });
		}
	}

	return fileErrors.length > 0
		? { ok: false, fileErrors, ignoredColumns }
		: { ok: true, columns, notYetImportedIndexes, ignoredColumns };
}
