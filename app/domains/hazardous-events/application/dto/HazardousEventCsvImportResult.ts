import type { CsvImportMode } from "../csv/hazardousEventCsvColumns";

export type HazardousEventCsvFileErrorCode =
	| "unknown_column"
	| "duplicate_column"
	| "missing_required_column"
	| "invalid_mode"
	| "no_data"
	| "file_too_large"
	| "invalid_encoding"
	| "malformed_csv"
	| "missing_file";

export interface HazardousEventCsvFileError {
	code: HazardousEventCsvFileErrorCode;
	column?: string;
	line?: number;
}

export type HazardousEventCsvRowErrorCode =
	| "required"
	| "invalid_date"
	| "invalid_enum"
	| "invalid_id"
	| "duplicate_key"
	| "not_found"
	| "conflict"
	| "not_editable"
	| "not_migrated"
	| "concurrent_modification"
	| "api_import_id_immutable"
	| "hip_mismatch"
	| "specific_hazard_required"
	| "status_not_permitted"
	| "status_change_not_supported"
	| "cause_after_effect"
	| "parent_multiple_causes"
	| "invalid_character"
	| "validation";

export interface HazardousEventCsvRowError {
	/** 1-based physical line; the header is line 1. */
	line: number;
	column?: string;
	code: HazardousEventCsvRowErrorCode;
	/** Echoed only for cell-level codes, truncated to 100 characters (D6). */
	value?: string;
}

export type HazardousEventCsvImportMode = CsvImportMode;

/** Action data for the import page (OD-6): expected outcomes, never thrown. */
export type HazardousEventCsvImportResult =
	| {
			ok: true;
			mode: HazardousEventCsvImportMode;
			created: number;
			updated: number;
			unchanged: number;
			ignoredColumns: string[];
			skippedDataNotice?: { rows: number };
	  }
	| {
			ok: false;
			/** `null` when the posted mode itself was invalid. */
			mode: HazardousEventCsvImportMode | null;
			/** File then row errors, together at most `MAX_REPORTED_CSV_ERRORS`. */
			fileErrors: HazardousEventCsvFileError[];
			rowErrors: HazardousEventCsvRowError[];
			/** Every error found, including those left out of the two lists. */
			errorCount: number;
			ignoredColumns: string[];
	  };

/** Bounds the action data and the rendered list for a file with many bad rows. */
export const MAX_REPORTED_CSV_ERRORS = 200;
