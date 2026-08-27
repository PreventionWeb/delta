import { describe, expect, it } from "vitest";

import { formatDate } from "~/utils/date";

describe("formatDate", () => {
	it("formats Date objects as yyyy-mm-dd", () => {
		expect(formatDate(new Date("2026-08-06T10:20:30.000Z"))).toBe("2026-08-06");
	});

	it("returns plain yyyy-mm-dd strings unchanged", () => {
		expect(formatDate("2026-08-06")).toBe("2026-08-06");
	});

	it("preserves year-only precision", () => {
		expect(formatDate("2026")).toBe("2026");
	});

	it("preserves year-month precision", () => {
		expect(formatDate("2026-08")).toBe("2026-08");
	});

	it("parses datetime strings", () => {
		expect(formatDate("2026-08-06T10:20:30.000Z")).toBe("2026-08-06");
	});

	it("returns empty string for invalid values", () => {
		expect(formatDate("not-a-date")).toBe("");
		expect(formatDate(null)).toBe("");
		expect(formatDate(undefined)).toBe("");
		expect(formatDate("   ")).toBe("");
	});
});
