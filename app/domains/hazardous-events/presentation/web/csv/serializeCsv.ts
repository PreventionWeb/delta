import { stringify } from "csv-stringify/sync";
import {
	GUARDED_CELL_PATTERN,
	guardFormulaCell,
} from "~/domains/hazardous-events/application/csv/formulaGuard";

/** RFC 4180 writer (D8): CRLF records, no BOM, quoting for `,` `"` CR LF. Every cell passes the
 * formula guard (OD-10); status columns have no CHECK constraint, so none is exempt. */
export function serializeCsv(
	header: readonly string[],
	rows: readonly (readonly string[])[],
): string {
	const guardedRows = rows.map((row) => row.map(guardFormulaCell));
	return stringify([[...header], ...guardedRows], {
		record_delimiter: "windows",
		// Guarded cells are quoted too (OWASP); edge whitespace is quoted so a trimming parser keeps it.
		quoted_match: [/[",\r\n]/, GUARDED_CELL_PATTERN, /^\s|\s$/],
		bom: false,
	});
}

/** D8 response headers, legacy filename (OD-11). */
export const CSV_RESPONSE_HEADERS: Readonly<Record<string, string>> = {
	"Content-Type": "text/csv; charset=utf-8; header=present",
	"Content-Disposition": 'attachment; filename="hazardous-event.csv"',
	"Cache-Control": "no-store",
};
