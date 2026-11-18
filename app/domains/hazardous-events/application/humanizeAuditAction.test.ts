import { describe, expect, it } from "vitest";
import { humanizeAuditAction } from "./humanizeAuditAction";

describe("humanizeAuditAction", () => {
	it.each([
		["submit-draft", "Submit draft"],
		["direct-publish", "Direct publish"],
		["validate", "Validate"],
		["return", "Return"],
		["submit-validation", "Submit validation"],
		["direct-validate", "Direct validate"],
	])("humanizes workflow action %s to %s", (input, expected) => {
		expect(humanizeAuditAction(input)).toBe(expected);
	});

	it.each([
		"Create hazardous event",
		"Update hazardous event",
		"Delete hazardous event",
	])(
		"returns %s unchanged -- translateAuditLogAction's own translation already handles it",
		(action) => {
			expect(humanizeAuditAction(action)).toBe(action);
		},
	);

	// DeleteHazardousEvent.ts's real write-side value: lowercase, no object (design.md Decision 4).
	it("humanizes the legacy lowercase 'delete' action, since it doesn't match the known Delete-object form", () => {
		expect(humanizeAuditAction("delete")).toBe("Delete");
	});
});
