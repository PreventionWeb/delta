import { describe, expect, it } from "vitest";
import { isValidFlexibleDateFormat } from "~/domains/shared/domain/flexibleDateFormat";
import {
	formatFlexibleDateValue,
	parseFlexibleDateValue,
} from "./flexiblePrecisionDate";

describe("parseFlexibleDateValue", () => {
	it("parses a 10-char yyyy-mm-dd value as yyyy-mm-dd precision", () => {
		expect(parseFlexibleDateValue("2026-03-15")).toEqual({
			precision: "yyyy-mm-dd",
			parts: { y: 2026, m: 3, d: 15 },
		});
	});

	it("parses a 7-char yyyy-mm value as yyyy-mm precision, day defaulted to 1", () => {
		expect(parseFlexibleDateValue("2026-03")).toEqual({
			precision: "yyyy-mm",
			parts: { y: 2026, m: 3, d: 1 },
		});
	});

	it("parses a 4-char yyyy value as yyyy precision, month/day defaulted to 1", () => {
		expect(parseFlexibleDateValue("2026")).toEqual({
			precision: "yyyy",
			parts: { y: 2026, m: 1, d: 1 },
		});
	});

	it("falls back to empty yyyy-mm-dd parts for an empty string", () => {
		expect(parseFlexibleDateValue("")).toEqual({
			precision: "yyyy-mm-dd",
			parts: { y: 0, m: 0, d: 0 },
		});
	});
});

describe("formatFlexibleDateValue", () => {
	it("formats yyyy-mm-dd from complete parts", () => {
		const result = formatFlexibleDateValue(
			{ y: 2026, m: 3, d: 15 },
			"yyyy-mm-dd",
		);
		expect(result).toBe("2026-03-15");
		expect(isValidFlexibleDateFormat(result)).toBe(true);
	});

	it("formats yyyy-mm from complete parts, ignoring day", () => {
		const result = formatFlexibleDateValue({ y: 2026, m: 3, d: 0 }, "yyyy-mm");
		expect(result).toBe("2026-03");
		expect(isValidFlexibleDateFormat(result)).toBe(true);
	});

	it("formats yyyy from complete parts, ignoring month/day", () => {
		const result = formatFlexibleDateValue({ y: 2026, m: 0, d: 0 }, "yyyy");
		expect(result).toBe("2026");
		expect(isValidFlexibleDateFormat(result)).toBe(true);
	});

	it("returns empty string for yyyy-mm-dd when day is missing", () => {
		expect(formatFlexibleDateValue({ y: 2026, m: 3, d: 0 }, "yyyy-mm-dd")).toBe(
			"",
		);
	});

	it("returns empty string for yyyy-mm-dd when only year is missing, not a malformed string (test-quality-auditor finding)", () => {
		expect(formatFlexibleDateValue({ y: 0, m: 3, d: 15 }, "yyyy-mm-dd")).toBe(
			"",
		);
	});

	it("returns empty string for yyyy-mm-dd when only month is missing, not a malformed string like '2026-00-15' (test-quality-auditor finding)", () => {
		expect(formatFlexibleDateValue({ y: 2026, m: 0, d: 15 }, "yyyy-mm-dd")).toBe(
			"",
		);
	});

	it("returns empty string for yyyy-mm when month is missing", () => {
		expect(formatFlexibleDateValue({ y: 2026, m: 0, d: 0 }, "yyyy-mm")).toBe(
			"",
		);
	});

	it("returns empty string for yyyy when year is missing", () => {
		expect(formatFlexibleDateValue({ y: 0, m: 0, d: 0 }, "yyyy")).toBe("");
	});

	it("pads single-digit month/day with a leading zero", () => {
		expect(formatFlexibleDateValue({ y: 2026, m: 1, d: 5 }, "yyyy-mm-dd")).toBe(
			"2026-01-05",
		);
	});
});
