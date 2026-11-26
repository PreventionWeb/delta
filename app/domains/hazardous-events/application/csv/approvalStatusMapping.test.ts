import { describe, expect, it } from "vitest";
import type { Status } from "~/domains/validation-workflow/domain/WorkflowInstance";
import {
	legacyApprovalStatusToStatus,
	statusToLegacyApprovalStatus,
} from "./approvalStatusMapping";

describe("legacyApprovalStatusToStatus (D12, import direction)", () => {
	it.each([
		["", "DRAFT"],
		["draft", "DRAFT"],
		["waiting-for-validation", "SUBMITTED"],
		["needs-revision", "REVISION_REQUESTED"],
		["validated", "APPROVED"],
		["published", "PUBLISHED"],
	] as const)("maps %j to %s", (legacy, status) => {
		expect(legacyApprovalStatusToStatus(legacy)).toBe(status);
	});

	it.each([
		"unknown",
		"Published",
		"PUBLISHED",
		"Draft",
		"rejected",
		"approved",
		"submitted",
		" published",
	])("returns null for %j, outside the legacy enum", (value) => {
		expect(legacyApprovalStatusToStatus(value)).toBeNull();
	});

	it("never yields REJECTED for any legacy value", () => {
		const legacy = [
			"",
			"draft",
			"waiting-for-validation",
			"needs-revision",
			"validated",
			"published",
		];
		for (const value of legacy) {
			expect(legacyApprovalStatusToStatus(value)).not.toBe("REJECTED");
		}
	});
});

describe("statusToLegacyApprovalStatus (D12, export direction)", () => {
	it.each([
		["DRAFT", "draft"],
		["SUBMITTED", "waiting-for-validation"],
		["REVISION_REQUESTED", "needs-revision"],
		["APPROVED", "validated"],
		["PUBLISHED", "published"],
		["REJECTED", ""],
	] as const)("maps %s to %j", (status: Status, legacy) => {
		expect(statusToLegacyApprovalStatus(status)).toBe(legacy);
	});

	it("round-trips every importable status", () => {
		const statuses: Status[] = [
			"DRAFT",
			"SUBMITTED",
			"REVISION_REQUESTED",
			"APPROVED",
			"PUBLISHED",
		];
		for (const status of statuses) {
			expect(
				legacyApprovalStatusToStatus(statusToLegacyApprovalStatus(status)),
			).toBe(status);
		}
	});
});
