import {
	HAZARDOUS_EVENT_STATUS_VALUES,
	type HazardousEventStatus,
} from "../../domain/HazardousEvent";
import { isValidFlexibleDateFormat } from "~/domains/shared/domain/flexibleDateFormat";
import type {
	SourceRefQuery,
	SourceRefResolution,
} from "../ports/ISpecificHazardTaxonomyRepository";
import type {
	HazardousEventCsvRowError,
	HazardousEventCsvRowErrorCode,
} from "../dto/HazardousEventCsvImportResult";
import {
	legacyApprovalStatusToStatus,
	type ImportableStatus,
} from "./approvalStatusMapping";
import { stripFormulaGuard } from "./formulaGuard";
import type { CsvImportMode, MappedColumn } from "./hazardousEventCsvColumns";
import { createPathErrors, requiredCellErrors } from "./importRowPolicy";

const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ECHOED_VALUE_LENGTH = 100;

/** Event fields a row supplies; an absent key leaves the stored value unchanged. */
export interface CsvEventFields {
	startDate?: string;
	endDate?: string;
	nationalSpecification?: string;
	description?: string;
	chainsExplanation?: string;
	magnitude?: string;
	recordOriginator?: string;
	dataSource?: string;
	hazardousEventStatus?: HazardousEventStatus | null;
	specificHazardLocalName?: string | null;
	specificHazardNationalName?: string | null;
}

export interface MappedCsvRow {
	line: number;
	/** Guard-reversed cells of every mapped column in the header (NOD-13). */
	cells: ReadonlyMap<MappedColumn, string>;
	/** Update mode only. */
	id?: string;
	/** `undefined` when the column is absent; `null` when the cell is empty. */
	apiImportId?: string | null;
	fields: CsvEventFields;
	/** Resolved CA hazard (D13); `undefined` when the row names none or resolution failed (error recorded). */
	specificHazardId?: string;
	/** `undefined` when the `approvalStatus` column is absent. */
	targetStatus?: ImportableStatus;
	/** `undefined` when the column is absent; `""` means no cause or clear (D14). */
	causeId?: string;
	hasNotYetImportedData: boolean;
	/** Update/upsert only: rule errors that apply only if the row is not unchanged (NOD-4). */
	deferredErrors: HazardousEventCsvRowError[];
}

export interface MapCsvRowsInput {
	mode: CsvImportMode;
	columns: ReadonlyMap<MappedColumn, number>;
	notYetImportedIndexes: readonly number[];
	rows: readonly (readonly string[])[];
	firstDataLine: number;
	/** Physical start line per row; falls back to `firstDataLine + index` (D1). */
	lineNumbers?: readonly number[];
	role: string | null;
	lookup: SourceRefResolution;
}

function rowError(
	line: number,
	code: HazardousEventCsvRowErrorCode,
	column?: string,
	value?: string,
): HazardousEventCsvRowError {
	return {
		line,
		code,
		...(column !== undefined ? { column } : {}),
		...(value !== undefined
			? { value: value.slice(0, MAX_ECHOED_VALUE_LENGTH) }
			: {}),
	};
}

const UUID_COLUMNS: ReadonlySet<MappedColumn> = new Set([
	"id",
	"parent",
	"specificHazardId",
]);

/** Guard-reversed; a valid UUID is lower-cased so it compares equal to the stored id. */
function readCell(column: MappedColumn, raw: string): string {
	const value = stripFormulaGuard(raw);
	return UUID_COLUMNS.has(column) && UUID_RE.test(value)
		? value.toLowerCase()
		: value;
}

function readCells(
	columns: ReadonlyMap<MappedColumn, number>,
	row: readonly string[],
): Map<MappedColumn, string> {
	const cells = new Map<MappedColumn, string>();
	for (const [column, index] of columns) {
		cells.set(column, readCell(column, row[index] ?? ""));
	}
	return cells;
}

/** Postgres text rejects U+0000 (SQLSTATE 22021), so such a cell must never reach a query. */
function hasNulCharacter(value: string): boolean {
	return value.includes("\u0000");
}

/** The distinct refs every row names, for the single taxonomy read of D13. */
export function collectSourceRefs(
	columns: ReadonlyMap<MappedColumn, number>,
	rows: readonly (readonly string[])[],
): SourceRefQuery {
	const collect = (column: MappedColumn, keep: (v: string) => boolean) => {
		const index = columns.get(column);
		if (index === undefined) return [];
		const values = rows
			.map((row) => readCell(column, row[index] ?? ""))
			.filter(
				(value) => value !== "" && !hasNulCharacter(value) && keep(value),
			);
		return [...new Set(values)];
	};
	const any = () => true;
	return {
		hazardRefs: collect("hipHazardId", any),
		clusterRefs: collect("hipClusterId", any),
		typeRefs: collect("hipTypeId", any),
		specificHazardIds: collect("specificHazardId", (v) => UUID_RE.test(v)),
	};
}

/** D13 rules 1-2; `undefined` when the row names no hazard or an error was pushed (rule 3 is the caller's). */
function resolveHazard(
	cells: ReadonlyMap<MappedColumn, string>,
	lookup: SourceRefResolution,
	line: number,
	errors: HazardousEventCsvRowError[],
): string | undefined {
	const hazardRef = cells.get("hipHazardId") ?? "";
	const clusterRef = cells.get("hipClusterId") ?? "";
	const typeRef = cells.get("hipTypeId") ?? "";
	const specificHazardId = cells.get("specificHazardId") ?? "";

	let ancestors: { hazardClusterId: string; hazardTypeId: string } | undefined;
	let resolved: string | undefined;

	if (hazardRef !== "") {
		const hazard = lookup.hazards.get(hazardRef);
		if (hazard === undefined) {
			errors.push(rowError(line, "not_found", "hipHazardId"));
			return undefined;
		}
		resolved = hazard.specificHazardId;
		ancestors = hazard;
	}

	if (specificHazardId !== "") {
		if (!UUID_RE.test(specificHazardId)) {
			errors.push(
				rowError(line, "invalid_id", "specificHazardId", specificHazardId),
			);
			return undefined;
		}
		const entry = lookup.specificHazards.get(specificHazardId);
		if (entry === undefined) {
			errors.push(rowError(line, "not_found", "specificHazardId"));
			return undefined;
		}
		if (resolved !== undefined && resolved !== specificHazardId) {
			errors.push(rowError(line, "hip_mismatch", "specificHazardId"));
			return undefined;
		}
		resolved = specificHazardId;
		ancestors = entry;
	}

	if (ancestors === undefined) {
		return undefined;
	}
	if (
		clusterRef !== "" &&
		lookup.clusters.get(clusterRef)?.hazardClusterId !==
			ancestors.hazardClusterId
	) {
		errors.push(rowError(line, "hip_mismatch", "hipClusterId"));
		return undefined;
	}
	if (
		typeRef !== "" &&
		lookup.types.get(typeRef)?.hazardTypeId !== ancestors.hazardTypeId
	) {
		errors.push(rowError(line, "hip_mismatch", "hipTypeId"));
		return undefined;
	}
	return resolved;
}

const DATE_COLUMNS = ["startDate", "endDate"] as const;
const ZERO_TEXT_COLUMNS = [
	"nationalSpecification",
	"description",
	"chainsExplanation",
	"magnitude",
	"recordOriginator",
	"dataSource",
] as const;
const NULLABLE_TEXT_COLUMNS = [
	"specificHazardLocalName",
	"specificHazardNationalName",
] as const;

function mapFields(
	cells: ReadonlyMap<MappedColumn, string>,
	line: number,
	errors: HazardousEventCsvRowError[],
): CsvEventFields {
	const fields: CsvEventFields = {};
	for (const column of DATE_COLUMNS) {
		const value = cells.get(column);
		if (value === undefined) continue;
		if (value !== "" && !isValidFlexibleDateFormat(value)) {
			errors.push(rowError(line, "invalid_date", column, value));
		}
		fields[column] = value;
	}
	for (const column of ZERO_TEXT_COLUMNS) {
		const value = cells.get(column);
		// Empty stays "" (DEF-009 zeroText), never null.
		if (value !== undefined) fields[column] = value;
	}
	for (const column of NULLABLE_TEXT_COLUMNS) {
		const value = cells.get(column);
		if (value !== undefined) fields[column] = value === "" ? null : value;
	}
	const status = cells.get("hazardousEventStatus");
	if (status !== undefined) {
		if (status === "") {
			fields.hazardousEventStatus = null;
		} else if (
			(HAZARDOUS_EVENT_STATUS_VALUES as readonly string[]).includes(status)
		) {
			fields.hazardousEventStatus = status as HazardousEventStatus;
		} else {
			errors.push(
				rowError(line, "invalid_enum", "hazardousEventStatus", status),
			);
		}
	}
	return fields;
}

function mapKeys(
	mapped: MappedCsvRow,
	mode: CsvImportMode,
	errors: HazardousEventCsvRowError[],
): void {
	const { cells, line } = mapped;
	const id = cells.get("id");
	if (id !== undefined) {
		if (id === "") {
			errors.push(rowError(line, "required", "id"));
		} else if (!UUID_RE.test(id)) {
			errors.push(rowError(line, "invalid_id", "id", id));
		}
		mapped.id = id;
	}
	const apiImportId = cells.get("apiImportId");
	if (apiImportId !== undefined) {
		if (mode === "upsert" && apiImportId === "") {
			errors.push(rowError(line, "required", "apiImportId"));
		}
		mapped.apiImportId = apiImportId === "" ? null : apiImportId;
	}
}

function mapStatusAndParent(
	mapped: MappedCsvRow,
	errors: HazardousEventCsvRowError[],
): void {
	const { cells, line } = mapped;
	const approvalStatus = cells.get("approvalStatus");
	if (approvalStatus !== undefined) {
		const status = legacyApprovalStatusToStatus(approvalStatus);
		if (status === null) {
			errors.push(
				rowError(line, "invalid_enum", "approvalStatus", approvalStatus),
			);
		} else {
			mapped.targetStatus = status;
		}
	}
	const parent = cells.get("parent");
	if (parent !== undefined) {
		if (parent !== "" && !UUID_RE.test(parent)) {
			errors.push(rowError(line, "invalid_id", "parent", parent));
		}
		mapped.causeId = parent;
	}
}

/** Required cells and hazard. On update and upsert they are deferred past the unchanged check
 * (NOD-4); a create row lists every failure, without a duplicate hazard error. */
function mapRules(
	mapped: MappedCsvRow,
	input: MapCsvRowsInput,
	errors: HazardousEventCsvRowError[],
): void {
	const ruleErrors = input.mode === "create" ? errors : mapped.deferredErrors;
	if (input.mode !== "create") {
		ruleErrors.push(...requiredCellErrors(mapped, { absentIsEmpty: false }));
	}
	const countBeforeHazard = ruleErrors.length;
	mapped.specificHazardId = resolveHazard(
		mapped.cells,
		input.lookup,
		mapped.line,
		ruleErrors,
	);
	const hazardFailed = ruleErrors.length > countBeforeHazard;
	if (input.mode === "create") {
		errors.push(
			...createPathErrors(mapped, input.role).filter(
				(error) => !(hazardFailed && error.code === "specific_hazard_required"),
			),
		);
	}
}

function mapRow(
	input: MapCsvRowsInput,
	row: readonly string[],
	line: number,
	errors: HazardousEventCsvRowError[],
): MappedCsvRow {
	const cells = readCells(input.columns, row);
	for (const [column, value] of cells) {
		if (hasNulCharacter(value)) {
			errors.push(rowError(line, "invalid_character", column));
		}
	}
	const mapped: MappedCsvRow = {
		line,
		cells,
		fields: mapFields(cells, line, errors),
		hasNotYetImportedData: input.notYetImportedIndexes.some(
			(index) => (row[index] ?? "") !== "",
		),
		deferredErrors: [],
	};
	mapKeys(mapped, input.mode, errors);
	mapStatusAndParent(mapped, errors);
	mapRules(mapped, input, errors);
	return mapped;
}

function duplicateKeyColumn(mode: CsvImportMode): "id" | "apiImportId" {
	return mode === "update" ? "id" : "apiImportId";
}

/** Maps and validates every row before any write (D4 phase 1); errors are in line order. */
export function mapCsvRows(input: MapCsvRowsInput): {
	rows: MappedCsvRow[];
	errors: HazardousEventCsvRowError[];
} {
	const errors: HazardousEventCsvRowError[] = [];
	const keyColumn = duplicateKeyColumn(input.mode);
	const seenKeys = new Set<string>();
	const rows = input.rows.map((row, index) => {
		const line = input.lineNumbers?.[index] ?? input.firstDataLine + index;
		const mapped = mapRow(input, row, line, errors);
		const key = mapped.cells.get(keyColumn) ?? "";
		if (key !== "") {
			if (seenKeys.has(key)) {
				errors.push(rowError(line, "duplicate_key", keyColumn, key));
			}
			seenKeys.add(key);
		}
		return mapped;
	});
	errors.sort((a, b) => a.line - b.line);
	return { rows, errors };
}
