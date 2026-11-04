import type { Status } from "~/domains/validation-workflow/domain/WorkflowInstance";

const BLOCKED_STATUSES: ReadonlySet<Status> = new Set([
	"SUBMITTED",
	"APPROVED",
	"PUBLISHED",
]);

/** Pure predicate translating canEditDataCollectionRecord (roles.ts:487-520) into CA's Status
 * vocabulary. Shared by requireStatusAwareEditPermission (in requestAuthorizationGuards.server.ts)
 * and HazardousEventDetailPage's Edit-link gate -- not `.server.ts`-suffixed so the latter can call
 * it isomorphically. */
export function isStatusAwareEditBlocked(
	role: string | undefined | null,
	workflowStatus: Status | null,
): boolean {
	return (
		role === "data-viewer" ||
		(workflowStatus !== null && BLOCKED_STATUSES.has(workflowStatus))
	);
}
