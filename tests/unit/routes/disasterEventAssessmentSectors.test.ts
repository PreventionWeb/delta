import { describe, expect, it } from "vitest";
import { normalizeAssessmentSectorPayload } from "~/routes/$lang+/api+/disaster-event+/$disasterEventId+/assessments+/$id+/sectors+/sectors_api.server";

describe("normalizeAssessmentSectorPayload", () => {
	it("accepts a single sector id object", () => {
		expect(normalizeAssessmentSectorPayload({ sectorId: "abc" })).toEqual([
			"abc",
		]);
	});

	it("accepts a list of sector ids from an array", () => {
		expect(normalizeAssessmentSectorPayload(["a", "b", "a"])).toEqual([
			"a",
			"b",
		]);
	});

	it("accepts a list of sector ids from an object", () => {
		expect(normalizeAssessmentSectorPayload({ sectorIds: ["a", "b"] })).toEqual([
			"a",
			"b",
		]);
	});
});
