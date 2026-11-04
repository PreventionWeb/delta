import { describe, expect, it } from "vitest";
import {
	deriveRecordDate,
	mapTempActionToWorkflowAction,
} from "./formDataMappers";

describe("mapTempActionToWorkflowAction", () => {
	it("maps submit-draft to submit-draft", () => {
		expect(mapTempActionToWorkflowAction("submit-draft")).toBe("submit-draft");
	});

	it("maps submit-validate to direct-validate", () => {
		expect(mapTempActionToWorkflowAction("submit-validate")).toBe(
			"direct-validate",
		);
	});

	it("maps submit-publish to direct-publish", () => {
		expect(mapTempActionToWorkflowAction("submit-publish")).toBe(
			"direct-publish",
		);
	});

	it("maps submit-validation to submit-validation", () => {
		expect(mapTempActionToWorkflowAction("submit-validation")).toBe(
			"submit-validation",
		);
	});

	it("maps an empty string (no tempAction, a plain save) to null", () => {
		expect(mapTempActionToWorkflowAction("")).toBeNull();
	});

	it("maps an unrecognized action (e.g. legacy's submit-return) to null", () => {
		expect(mapTempActionToWorkflowAction("submit-return")).toBeNull();
	});

	it("maps null to null", () => {
		expect(mapTempActionToWorkflowAction(null)).toBeNull();
	});
});

describe("deriveRecordDate", () => {
	it("returns empty when both dates are empty", () => {
		expect(deriveRecordDate("", "")).toBe("");
	});

	it("returns only startDate when endDate is empty", () => {
		expect(deriveRecordDate("2026-01-01", "")).toBe("2026-01-01");
	});

	it("returns only startDate when endDate equals startDate", () => {
		expect(deriveRecordDate("2026-01-01", "2026-01-01")).toBe("2026-01-01");
	});

	it("returns a 'start to end' range when endDate differs from startDate", () => {
		expect(deriveRecordDate("2026-01-01", "2026-01-05")).toBe(
			"2026-01-01 to 2026-01-05",
		);
	});

	it("returns ' to endDate' when startDate is empty but endDate is set (test-quality-auditor finding)", () => {
		expect(deriveRecordDate("", "2026-01-05")).toBe(" to 2026-01-05");
	});
});
