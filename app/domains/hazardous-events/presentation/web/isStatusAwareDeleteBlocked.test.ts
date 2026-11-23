import { describe, expect, it } from "vitest";
import {
	STATUS_VALUES,
	type Status,
} from "~/domains/validation-workflow/domain/WorkflowInstance";
import { isStatusAwareDeleteBlocked } from "./isStatusAwareDeleteBlocked";

// Every role x {each Status, null} cell of design.md's OD-1 table.
const ALL_STATUSES: readonly (Status | null)[] = [...STATUS_VALUES, null];

describe("isStatusAwareDeleteBlocked", () => {
	it("covers every Status value (fails if a new status is added without updating OD-1)", () => {
		expect([...STATUS_VALUES].sort()).toEqual(
			[
				"APPROVED",
				"DRAFT",
				"PUBLISHED",
				"REJECTED",
				"REVISION_REQUESTED",
				"SUBMITTED",
			].sort(),
		);
	});

	describe.each(["admin", "data-validator"])("%s", (role) => {
		it.each(ALL_STATUSES)("is allowed at status %s", (workflowStatus) => {
			expect(isStatusAwareDeleteBlocked(role, workflowStatus)).toBe(false);
		});
	});

	describe("data-collector", () => {
		it.each(["DRAFT", "REVISION_REQUESTED", "REJECTED"] as const)(
			"is allowed at status %s",
			(workflowStatus) => {
				expect(
					isStatusAwareDeleteBlocked("data-collector", workflowStatus),
				).toBe(false);
			},
		);

		it.each(["SUBMITTED", "APPROVED", "PUBLISHED"] as const)(
			"is blocked at status %s",
			(workflowStatus) => {
				expect(
					isStatusAwareDeleteBlocked("data-collector", workflowStatus),
				).toBe(true);
			},
		);

		it("is blocked for a null workflow status (fail closed, DEF-031 legacy row)", () => {
			expect(isStatusAwareDeleteBlocked("data-collector", null)).toBe(true);
		});
	});

	describe.each(["data-viewer", "super_admin", "unknown-role", ""])(
		"role %j",
		(role) => {
			it.each(ALL_STATUSES)("is blocked at status %s", (workflowStatus) => {
				expect(isStatusAwareDeleteBlocked(role, workflowStatus)).toBe(true);
			});
		},
	);

	describe.each([null, undefined])("no role (%s)", (role) => {
		it.each(ALL_STATUSES)("is blocked at status %s", (workflowStatus) => {
			expect(isStatusAwareDeleteBlocked(role, workflowStatus)).toBe(true);
		});
	});
});
