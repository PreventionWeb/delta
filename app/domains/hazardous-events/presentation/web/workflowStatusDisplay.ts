import type { Status } from "~/domains/validation-workflow/domain/WorkflowInstance";

export interface WorkflowStatusDisplay {
	/** CSS class for the status dot; known statuses reuse legacy's `dts-status--{key}` as-is. */
	className: string;
	/** Only set for the `null` (DEF-031) state, which has no legacy class (@theme token instead). */
	style?: { backgroundColor: string };
	/** i18n key under the `hazardous-events` namespace, relative to `status.`. */
	labelKey: string;
}

// Maps CA's WorkflowInstance.Status to legacy's dts-status--{key} modifier by meaning, not name --
// DRAFT/SUBMITTED/REVISION_REQUESTED/etc. aren't legacy's own status strings (design.md Decision 8).
export function workflowStatusDisplay(
	status: Status | null,
): WorkflowStatusDisplay {
	switch (status) {
		case "DRAFT":
			return { className: "dts-status dts-status--draft", labelKey: "draft" };
		case "SUBMITTED":
			return {
				className: "dts-status dts-status--waiting-for-validation",
				labelKey: "waiting_for_validation",
			};
		case "REVISION_REQUESTED":
			return {
				className: "dts-status dts-status--needs-revision",
				labelKey: "needs_revision",
			};
		case "APPROVED":
			return {
				className: "dts-status dts-status--validated",
				labelKey: "validated",
			};
		case "REJECTED":
			return {
				className: "dts-status dts-status--rejected",
				labelKey: "rejected",
			};
		case "PUBLISHED":
			return {
				className: "dts-status dts-status--published",
				labelKey: "published",
			};
		case null:
			return {
				className: "dts-status",
				style: { backgroundColor: "var(--color-dts-status-missing)" },
				labelKey: "missing",
			};
	}
}
