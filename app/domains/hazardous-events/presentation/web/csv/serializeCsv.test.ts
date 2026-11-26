import { describe, expect, it } from "vitest";
import { parse } from "csv-parse/sync";
import { EXPORT_HEADER } from "~/domains/hazardous-events/application/csv/hazardousEventCsvColumns";
import { CSV_RESPONSE_HEADERS, serializeCsv } from "./serializeCsv";

// OWASP CSV Injection leading characters, including full-width forms.
const GUARDED = ["=", "+", "-", "@", "\t", "\r", "\n", "＝", "＋", "－", "＠"];

const E1_LINE =
	"updatedAt,createdAt,approvalStatus,createdByUserId,updatedByUserId,submittedByUserId,submittedAt,validatedByUserId,validatedAt,publishedByUserId,publishedAt,apiImportId,hipHazardId,hipClusterId,hipTypeId,id,countryAccountsId,specificHazardId,status,nationalSpecification,startDate,endDate,description,chainsExplanation,magnitude,recordOriginator,hazardousEventStatus,dataSource,specificHazardLocalName,specificHazardNationalName";

function parseCsv(text: string): string[][] {
	const records: string[][] = parse(text);
	return records;
}

/** Serializes one cell under the given column and returns its parsed value. */
function roundTrip(column: string, value: string): string {
	const records = parseCsv(serializeCsv([column], [[value]]));
	return records[1][0];
}

describe("serializeCsv: record format", () => {
	it("writes the export header as the legacy header followed by ,parent", () => {
		const out = serializeCsv(EXPORT_HEADER, []);
		expect(out).toBe(`${E1_LINE},parent\r\n`);
	});

	it("ends every record with CRLF and has no bare LF", () => {
		const out = serializeCsv(
			["a", "b"],
			[
				["1", "2"],
				["3", "4"],
			],
		);
		expect(out).toBe("a,b\r\n1,2\r\n3,4\r\n");
		expect(out.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
	});

	it("writes no BOM", () => {
		const out = serializeCsv(["a"], [["1"]]);
		expect(out.charCodeAt(0)).not.toBe(0xfeff);
		expect(out.startsWith("a")).toBe(true);
	});

	it("leaves a plain cell unquoted", () => {
		expect(serializeCsv(["a"], [["plain text"]])).toBe("a\r\nplain text\r\n");
	});
});

describe("serializeCsv: RFC 4180 quoting", () => {
	it.each([
		["a,b", '"a,b"'],
		['a"b', '"a""b"'],
		["a\nb", '"a\nb"'],
		["a\rb", '"a\rb"'],
		['say "hi", ok', '"say ""hi"", ok"'],
	])("quotes %j as %s", (value, expected) => {
		expect(serializeCsv(["a"], [[value]])).toBe(`a\r\n${expected}\r\n`);
	});

	it('round-trips a, "b", a line break, then c', () => {
		const description = 'a, "b"\nc';
		expect(roundTrip("description", description)).toBe(description);
	});

	it("preserves non-ASCII text through UTF-8", () => {
		const out = serializeCsv(["recordOriginator"], [["Météo-France"]]);
		const decoded = new TextDecoder("utf-8").decode(
			new TextEncoder().encode(out),
		);
		expect(parseCsv(decoded)[1][0]).toBe("Météo-France");
	});
});

describe("serializeCsv: formula guard on user text", () => {
	it.each(GUARDED)("prefixes ' to a description starting with %j", (char) => {
		expect(roundTrip("description", `${char}x`)).toBe(`'${char}x`);
	});

	it("writes the HYPERLINK example exactly as the spec states", () => {
		const out = serializeCsv(
			["recordOriginator"],
			[['=HYPERLINK("http://example.invalid")']],
		);
		expect(out).toBe(
			`recordOriginator\r\n"'=HYPERLINK(""http://example.invalid"")"\r\n`,
		);
	});

	it("writes a magnitude of -5 as '-5", () => {
		expect(roundTrip("magnitude", "-5")).toBe("'-5");
	});

	it("quotes a guarded cell even when it needs no RFC 4180 quoting", () => {
		expect(serializeCsv(["magnitude"], [["-5"]])).toBe(
			`magnitude\r\n"'-5"\r\n`,
		);
	});

	it("guards apiImportId as user text", () => {
		expect(roundTrip("apiImportId", "=A1")).toBe("'=A1");
	});

	it("does not change a safe user-text cell", () => {
		expect(roundTrip("description", "a=b")).toBe("a=b");
	});
});

describe("serializeCsv: every column is guarded (gate 10, finding 4)", () => {
	it.each([
		"id",
		"parent",
		"hipHazardId",
		"specificHazardId",
		"approvalStatus",
		"status",
		"hazardousEventStatus",
		"updatedAt",
		"countryAccountsId",
	])("guards a leading = in %s, as for user text", (column) => {
		expect(roundTrip(column, "=cmd")).toBe("'=cmd");
	});

	it("leaves well-formed system values unchanged", () => {
		const values = [
			"0557a691-1fbf-451d-a7b8-dc540806c91e",
			"pending",
			"published",
			"2025-01-01T00:00:00.000Z",
			"78424",
		];
		for (const value of values) {
			expect(roundTrip("id", value)).toBe(value);
		}
	});

	it("guards every cell of a full export row", () => {
		const row = EXPORT_HEADER.map(() => "-1");
		const [, parsed] = parseCsv(serializeCsv(EXPORT_HEADER, [row]));
		expect(parsed.every((cell) => cell === "'-1")).toBe(true);
	});
});
describe("CSV_RESPONSE_HEADERS", () => {
	it("declares CSV with a header row, the legacy filename and no-store", () => {
		expect(CSV_RESPONSE_HEADERS).toEqual({
			"Content-Type": "text/csv; charset=utf-8; header=present",
			"Content-Disposition": 'attachment; filename="hazardous-event.csv"',
			"Cache-Control": "no-store",
		});
	});
});

describe("serializeCsv: whitespace survives a trimming parser (review M4)", () => {
	it.each(["foo ", " foo", " foo ", " x"])(
		"quotes %j so csv-parse with trim keeps it",
		(value) => {
			const text = serializeCsv(["description"], [[value]]);
			const records: string[][] = parse(text, { trim: true });
			expect(records[1][0]).toBe(value);
		},
	);
});
