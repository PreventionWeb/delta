import type { Status } from "~/domains/validation-workflow/domain/WorkflowInstance";

const DATA_COLLECTOR_DELETABLE: ReadonlySet<Status> = new Set([
	"DRAFT",
	"REVISION_REQUESTED",
	"REJECTED",
]);

/** canDeleteDataCollectionRecord (roles.ts) in CA's Status vocabulary; a null status fails
 * closed for data-collector (design.md OD-1). Isomorphic: shared by the list row and the
 * delete route's guard. */
export function isStatusAwareDeleteBlocked(
	role: string | undefined | null,
	workflowStatus: Status | null,
): boolean {
	if (role === "admin" || role === "data-validator") {
		return false;
	}
	if (role === "data-collector") {
		return (
			workflowStatus === null || !DATA_COLLECTOR_DELETABLE.has(workflowStatus)
		);
	}
	return true;
}
