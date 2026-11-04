import { describe, expect, it } from "vitest";
import type { HazardousEventListFilterInput } from "~/domains/hazardous-events/application/use-cases/ListHazardousEvents";
import { parseHazardousEventListFilters } from "./parseHazardousEventListFilters";

// RFC 4122/9562-valid (variant nibble 8/9/a/b) so a strict UUID validator accepts them, and
// distinct per field so a mis-wired param can't pass by sharing one value across fields.
const HAZARD_TYPE_UUID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const HAZARD_CLUSTER_UUID = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const SPECIFIC_HAZARD_UUID = "e8400f6f-6b2e-4a1a-8b3c-9f1c2d3e4f5a";

describe("parseHazardousEventListFilters", () => {
	it("resolves every corresponding field when a valid value is supplied for each filter param", () => {
		const searchParams = new URLSearchParams({
			hazardTypeId: HAZARD_TYPE_UUID,
			hazardClusterId: HAZARD_CLUSTER_UUID,
			specificHazardId: SPECIFIC_HAZARD_UUID,
			fromDate: "2024-01-01",
			toDate: "2024-06-01",
			recordingOrganization: "Ministry",
			hazardousEventStatus: "ongoing",
			recordStatus: "SUBMITTED",
			viewMyRecords: "on",
			pendingMyAction: "on",
		});

		const result = parseHazardousEventListFilters(searchParams);

		expect(result).toEqual({
			hazardTypeId: HAZARD_TYPE_UUID,
			hazardClusterId: HAZARD_CLUSTER_UUID,
			specificHazardId: SPECIFIC_HAZARD_UUID,
			fromDate: "2024-01-01",
			toDate: "2024-06-01",
			recordingOrganization: "Ministry",
			hazardousEventStatus: "ongoing",
			recordStatus: "SUBMITTED",
			viewMyRecords: true,
			pendingMyAction: true,
		} satisfies HazardousEventListFilterInput);
	});

	it("resolves no filter fields set (only the two checkbox fields, as false) when no params are supplied", () => {
		const searchParams = new URLSearchParams();

		const result = parseHazardousEventListFilters(searchParams);

		expect(Object.keys(result).sort()).toEqual([
			"pendingMyAction",
			"viewMyRecords",
		]);
		expect(result).toEqual({ viewMyRecords: false, pendingMyAction: false });
	});

	it("resolves no filter fields set (except the checkbox fields) when every non-checkbox param is supplied as an empty string", () => {
		const searchParams = new URLSearchParams({
			hazardTypeId: "",
			hazardClusterId: "",
			specificHazardId: "",
			fromDate: "",
			toDate: "",
			recordingOrganization: "",
			hazardousEventStatus: "",
			recordStatus: "",
		});

		const result = parseHazardousEventListFilters(searchParams);

		expect(Object.keys(result).sort()).toEqual([
			"pendingMyAction",
			"viewMyRecords",
		]);
	});

	it("drops a malformed UUID-shaped specificHazardId, leaving the field absent", () => {
		const searchParams = new URLSearchParams("specificHazardId=not-a-uuid");

		const result = parseHazardousEventListFilters(searchParams);

		expect("specificHazardId" in result).toBe(false);
		expect(result.specificHazardId).toBeUndefined();
	});

	it("drops a malformed fromDate, leaving the field absent", () => {
		const searchParams = new URLSearchParams("fromDate=not-a-date");

		const result = parseHazardousEventListFilters(searchParams);

		expect("fromDate" in result).toBe(false);
		expect(result.fromDate).toBeUndefined();
	});

	// Regression (code review finding, confirmed against PGlite): a shape-valid but
	// calendar-invalid date reaches Postgres's TO_DATE() as an unhandled range error otherwise.
	it("drops an out-of-range month, leaving the field absent", () => {
		const searchParams = new URLSearchParams("fromDate=2024-13-01");

		const result = parseHazardousEventListFilters(searchParams);

		expect("fromDate" in result).toBe(false);
	});

	it("drops a day that doesn't exist in the given month, leaving the field absent", () => {
		const searchParams = new URLSearchParams("fromDate=2024-02-30");

		const result = parseHazardousEventListFilters(searchParams);

		expect("fromDate" in result).toBe(false);
	});

	it("drops an out-of-range month for a year-month value, leaving the field absent", () => {
		const searchParams = new URLSearchParams("fromDate=2024-13");

		const result = parseHazardousEventListFilters(searchParams);

		expect("fromDate" in result).toBe(false);
	});

	it("accepts Feb 29 in a real leap year", () => {
		const searchParams = new URLSearchParams("fromDate=2024-02-29");

		const result = parseHazardousEventListFilters(searchParams);

		expect(result.fromDate).toBe("2024-02-29");
	});

	it("drops Feb 29 in a non-leap year, leaving the field absent", () => {
		const searchParams = new URLSearchParams("fromDate=2023-02-29");

		const result = parseHazardousEventListFilters(searchParams);

		expect("fromDate" in result).toBe(false);
	});

	it("accepts a full ISO date, passed through as a string unchanged", () => {
		const searchParams = new URLSearchParams("fromDate=2024-03-15");

		const result = parseHazardousEventListFilters(searchParams);

		expect(result.fromDate).toBe("2024-03-15");
	});

	it("accepts a year-only partial date", () => {
		const searchParams = new URLSearchParams("fromDate=2024");

		const result = parseHazardousEventListFilters(searchParams);

		expect(result.fromDate).toBe("2024");
	});

	it("accepts a year-month partial date", () => {
		const searchParams = new URLSearchParams("fromDate=2024-06");

		const result = parseHazardousEventListFilters(searchParams);

		expect(result.fromDate).toBe("2024-06");
	});

	it("drops an unrecognized recordStatus (a legacy kebab-case value, not a CA Status value), leaving the field absent", () => {
		const searchParams = new URLSearchParams(
			"recordStatus=waiting-for-validation",
		);

		const result = parseHazardousEventListFilters(searchParams);

		expect("recordStatus" in result).toBe(false);
		expect(result.recordStatus).toBeUndefined();
	});

	it("accepts a recognized CA Status value", () => {
		const searchParams = new URLSearchParams("recordStatus=SUBMITTED");

		const result = parseHazardousEventListFilters(searchParams);

		expect(result.recordStatus).toBe("SUBMITTED");
	});

	it("resolves viewMyRecords to true for the exact checkbox value 'on'", () => {
		const searchParams = new URLSearchParams("viewMyRecords=on");

		const result = parseHazardousEventListFilters(searchParams);

		expect(result.viewMyRecords).toBe(true);
	});

	it("resolves viewMyRecords to false for any value other than the literal 'on'", () => {
		const searchParams = new URLSearchParams("viewMyRecords=true");

		const result = parseHazardousEventListFilters(searchParams);

		expect(result.viewMyRecords).toBe(false);
	});

	it("resolves pendingMyAction to false when only it (not viewMyRecords) is absent", () => {
		const searchParams = new URLSearchParams("viewMyRecords=on");

		const result = parseHazardousEventListFilters(searchParams);

		expect(result.pendingMyAction).toBe(false);
		expect(result.viewMyRecords).toBe(true);
	});

	it("trims leading/trailing whitespace from recordingOrganization", () => {
		const searchParams = new URLSearchParams();
		searchParams.set("recordingOrganization", "  Ministry  ");

		const result = parseHazardousEventListFilters(searchParams);

		expect(result.recordingOrganization).toBe("Ministry");
	});

	it("drops an all-whitespace recordingOrganization, leaving the field absent", () => {
		const searchParams = new URLSearchParams();
		searchParams.set("recordingOrganization", "   ");

		const result = parseHazardousEventListFilters(searchParams);

		expect("recordingOrganization" in result).toBe(false);
	});
});
