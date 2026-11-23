import type { ProcessWorkflowActionCommand } from "./use-cases/ProcessWorkflowAction";

const EDIT_CAPABLE_ROLES = new Set([
	"data-collector",
	"data-validator",
	"admin",
]);

/**
 * Role-gating for a `ProcessWorkflowActionCommand` action. direct-validate/direct-publish:
 * admin-only. submit-draft: accepts only data-collector/data-validator/admin (Decision 26
 * minimal backstop, not HE's own richer edit-permission rule). Everything else: unrestricted.
 *
 * Shared by `requireWorkflowActionAuthorized` (HE presentation, in
 * `requestAuthorizationGuards.server.ts`) and
 * `ProcessWorkflowActionUseCase.execute` (authoritative) so the two can't drift apart.
 */
export function isWorkflowActionAuthorized(
	action: ProcessWorkflowActionCommand["action"],
	actingUserRole: string | undefined,
): boolean {
	if (action === "direct-validate" || action === "direct-publish") {
		return actingUserRole === "admin";
	}
	if (action === "submit-draft") {
		return (
			actingUserRole !== undefined && EDIT_CAPABLE_ROLES.has(actingUserRole)
		);
	}
	return true;
}
