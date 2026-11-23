import { describe, expect, it } from "vitest";
import { isStatusAwareEditBlocked } from "./isStatusAwareEditBlocked";

// Mirrors requireStatusAwareEditPermission's own scenarios in
// requestAuthorizationGuards.server.test.ts -- same predicate, extracted so it can be reused
// isomorphically (design.md Decision 16 correction).
describe("isStatusAwareEditBlocked", () => {
	it("is not blocked for a non-data-viewer role and a non-blocked status (DRAFT)", () => {
		expect(isStatusAwareEditBlocked("data-collector", "DRAFT")).toBe(false);
	});

	it("is not blocked for a non-data-viewer role and REVISION_REQUESTED", () => {
		expect(
			isStatusAwareEditBlocked("data-collector", "REVISION_REQUESTED"),
		).toBe(false);
	});

	it("is not blocked for a null workflowStatus (DEF-031 legacy row)", () => {
		expect(isStatusAwareEditBlocked("admin", null)).toBe(false);
	});

	it.each(["SUBMITTED", "APPROVED", "PUBLISHED"] as const)(
		"is blocked for status %s regardless of role",
		(workflowStatus) => {
			expect(isStatusAwareEditBlocked("admin", workflowStatus)).toBe(true);
			expect(isStatusAwareEditBlocked("data-validator", workflowStatus)).toBe(
				true,
			);
			expect(isStatusAwareEditBlocked("data-collector", workflowStatus)).toBe(
				true,
			);
		},
	);

	it("is blocked for a data-viewer role even at a non-blocked status (DRAFT)", () => {
		expect(isStatusAwareEditBlocked("data-viewer", "DRAFT")).toBe(true);
	});

	it("is not blocked for a null/undefined role at a non-blocked status (DRAFT)", () => {
		expect(isStatusAwareEditBlocked(null, "DRAFT")).toBe(false);
		expect(isStatusAwareEditBlocked(undefined, "DRAFT")).toBe(false);
	});
});
