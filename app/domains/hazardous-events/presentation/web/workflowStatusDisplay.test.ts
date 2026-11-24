import { describe, expect, it } from "vitest";
import { workflowStatusDisplay } from "./workflowStatusDisplay";

describe("workflowStatusDisplay", () => {
	it.each([
		["DRAFT", "dts-status dts-status--draft", "draft"],
		[
			"SUBMITTED",
			"dts-status dts-status--waiting-for-validation",
			"waiting_for_validation",
		],
		[
			"REVISION_REQUESTED",
			"dts-status dts-status--needs-revision",
			"needs_revision",
		],
		["APPROVED", "dts-status dts-status--validated", "validated"],
		["REJECTED", "dts-status dts-status--rejected", "rejected"],
		["PUBLISHED", "dts-status dts-status--published", "published"],
	] as const)(
		"maps %s to the legacy class %s with label key %s",
		(status, expectedClassName, expectedLabelKey) => {
			const result = workflowStatusDisplay(status);

			expect(result.className).toBe(expectedClassName);
			expect(result.labelKey).toBe(expectedLabelKey);
			expect(result.style).toBeUndefined();
		},
	);

	it("maps null (DEF-031) to the missing-status token color, distinct from every known status", () => {
		const result = workflowStatusDisplay(null);

		expect(result.className).toBe("dts-status");
		expect(result.style).toEqual({
			backgroundColor: "var(--color-dts-status-missing)",
		});
		expect(result.labelKey).toBe("missing");
	});
});
