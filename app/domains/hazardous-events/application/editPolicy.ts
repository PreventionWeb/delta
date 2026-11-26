import type { Status } from "~/domains/validation-workflow/domain/WorkflowInstance";
import { isWorkflowActionAuthorized } from "~/domains/validation-workflow/application/isWorkflowActionAuthorized";

const BLOCKED_STATUSES: ReadonlySet<Status> = new Set([
	"SUBMITTED",
	"APPROVED",
	"PUBLISHED",
]);

/** canEditDataCollectionRecord (roles.ts:487-520) in CA's Status vocabulary. Application-layer
 * so the CSV import enforces the same rule as the edit route (OD-7). */
export function isStatusAwareEditBlocked(
	role: string | undefined | null,
	workflowStatus: Status | null,
): boolean {
	return (
		role === "data-viewer" ||
		(workflowStatus !== null && BLOCKED_STATUSES.has(workflowStatus))
	);
}

/** Who may import a non-draft workflow status (NOD-2): the direct-publish rule, never a second literal. */
export function canImportNonDraftStatus(role: string | null): boolean {
	return isWorkflowActionAuthorized("direct-publish", role ?? undefined);
}
