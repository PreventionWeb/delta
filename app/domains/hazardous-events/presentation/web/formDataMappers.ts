export type MappedWorkflowAction =
	| "submit-draft"
	| "direct-validate"
	| "direct-publish"
	| "submit-validation";

/** Legacy's own ApprovalAction union (approvalWorkflowService.ts) -- `submit-return` maps to
 * null, confirmed out of scope for 6c (design.md Decision 7, DEF-053). */
export function mapTempActionToWorkflowAction(
	tempAction: string | null,
): MappedWorkflowAction | null {
	switch (tempAction) {
		case "submit-draft":
			return "submit-draft";
		case "submit-validate":
			return "direct-validate";
		case "submit-publish":
			return "direct-publish";
		case "submit-validation":
			return "submit-validation";
		default:
			return null;
	}
}

/** Mirrors emailValidationWorkflowService.ts:94-99 exactly (design.md Decision 9). */
export function deriveRecordDate(startDate: string, endDate: string): string {
	if (!startDate && !endDate) {
		return "";
	}
	let recordDate = startDate;
	if (endDate && endDate !== startDate) {
		recordDate += ` to ${endDate}`;
	}
	return recordDate;
}
