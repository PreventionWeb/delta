import { describe, expect, it } from "vitest";
import {
	isValidFlexibleDateFormat,
	normalizeFlexibleDateCeiling,
	normalizeFlexibleDateFloor,
} from "./flexibleDateFormat";

describe("isValidFlexibleDateFormat", () => {
	it("accepts a bare year within 1900-2100", () => {
		expect(isValidFlexibleDateFormat("1900")).toBe(true);
		expect(isValidFlexibleDateFormat("2026")).toBe(true);
		expect(isValidFlexibleDateFormat("2100")).toBe(true);
	});

	it("rejects a bare year outside 1900-2100", () => {
		expect(isValidFlexibleDateFormat("1899")).toBe(false);
		expect(isValidFlexibleDateFormat("2101")).toBe(false);
	});

	it("accepts a full date outside 1900-2100", () => {
		expect(isValidFlexibleDateFormat("1899-12-31")).toBe(true);
		expect(isValidFlexibleDateFormat("2101-01-01")).toBe(true);
	});

	it("rejects any non-zero-padded component", () => {
		expect(isValidFlexibleDateFormat("2026-9-1")).toBe(false);
		expect(isValidFlexibleDateFormat("2026-09-1")).toBe(false);
		expect(isValidFlexibleDateFormat("2026-9-01")).toBe(false);
	});

	it("accepts a zero-padded full date", () => {
		expect(isValidFlexibleDateFormat("2026-09-01")).toBe(true);
	});

	it("rejects an out-of-range month", () => {
		expect(isValidFlexibleDateFormat("2026-13-01")).toBe(false);
		expect(isValidFlexibleDateFormat("2026-00-01")).toBe(false);
	});

	it("accepts a day-overflow date within a real month", () => {
		expect(isValidFlexibleDateFormat("2026-02-30")).toBe(true);
		expect(isValidFlexibleDateFormat("2026-04-31")).toBe(true);
	});

	it("rejects an empty string and non-date garbage", () => {
		expect(isValidFlexibleDateFormat("")).toBe(false);
		expect(isValidFlexibleDateFormat("not-a-date")).toBe(false);
	});

	it("rejects a numeric string longer than 4 digits, even if it ends in a valid year", () => {
		expect(isValidFlexibleDateFormat("01999")).toBe(false);
		expect(isValidFlexibleDateFormat("0001999")).toBe(false);
	});

	it("rejects extra leading digits before an otherwise-valid year-month", () => {
		expect(isValidFlexibleDateFormat("12020-06")).toBe(false);
		expect(isValidFlexibleDateFormat("20200-06")).toBe(false);
	});

	it("rejects extra leading digits before an otherwise-valid full date", () => {
		expect(isValidFlexibleDateFormat("12020-06-15")).toBe(false);
	});

	it("rejects a full date with a trailing time/zone suffix", () => {
		expect(isValidFlexibleDateFormat("2020-06-15T00:00")).toBe(false);
		expect(isValidFlexibleDateFormat("2020-06-15Z")).toBe(false);
	});
});

describe("normalizeFlexibleDateFloor", () => {
	it("pads a bare year to its first day", () => {
		expect(normalizeFlexibleDateFloor("2020")).toBe("2020-01-01");
	});

	it("pads a year-month to its first day", () => {
		expect(normalizeFlexibleDateFloor("2020-06")).toBe("2020-06-01");
	});

	it("leaves a full date unchanged", () => {
		expect(normalizeFlexibleDateFloor("2020-06-15")).toBe("2020-06-15");
	});
});

describe("normalizeFlexibleDateCeiling", () => {
	it("pads a bare year to its last day", () => {
		expect(normalizeFlexibleDateCeiling("2020")).toBe("2020-12-31");
	});

	it("leaves a full date unchanged", () => {
		expect(normalizeFlexibleDateCeiling("2020-06-15")).toBe("2020-06-15");
	});

	it("pads a year-month to the real last day of that month, leap-year aware", () => {
		expect(normalizeFlexibleDateCeiling("2024-02")).toBe("2024-02-29");
		expect(normalizeFlexibleDateCeiling("2023-02")).toBe("2023-02-28");
		expect(normalizeFlexibleDateCeiling("1900-02")).toBe("1900-02-28");
		expect(normalizeFlexibleDateCeiling("2000-02")).toBe("2000-02-29");
		expect(normalizeFlexibleDateCeiling("2100-02")).toBe("2100-02-28");
		expect(normalizeFlexibleDateCeiling("2026-04")).toBe("2026-04-30");
		expect(normalizeFlexibleDateCeiling("2026-12")).toBe("2026-12-31");
	});
});
