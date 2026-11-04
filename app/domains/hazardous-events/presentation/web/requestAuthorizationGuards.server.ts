import { getUserRoleFromSession } from "~/utils/session";
import { roleHasPermission } from "~/frontend/user/roles";
import { AuthorizationError, ValidationError } from "~/shared/errors";
import type { Status } from "~/domains/validation-workflow/domain/WorkflowInstance";
import { isWorkflowActionAuthorized } from "~/domains/validation-workflow/application/isWorkflowActionAuthorized";
import { throwHazardousEventLoaderError } from "./throwHazardousEventLoaderError.server";
import { isStatusAwareEditBlocked } from "./isStatusAwareEditBlocked";
import {
	mapTempActionToWorkflowAction,
	type MappedWorkflowAction,
} from "./formDataMappers";
import type { ParsedHazardousEventFormData } from "./parseHazardousEventFormData.server";

/** Replicates legacy HE's EditData gate, same convention as requireViewDataPermission. Call
 * after requireUser()/resolveTenantId(). */
export async function requireEditDataPermission(args: {
	request: Request;
}): Promise<string | undefined> {
	const role = await getUserRoleFromSession(args.request);
	if (!roleHasPermission(role, "EditData")) {
		throwHazardousEventLoaderError(
			new AuthorizationError("EditData permission required"),
			{
				logMsg: "EditData permission denied in hazardous-event loader",
				url: args.request.url,
			},
		);
	}
	return role;
}

/** Call after the flat EditData gate. Predicate lives in isStatusAwareEditBlocked.ts (shared with
 * HazardousEventDetailPage's Edit-link gate); this just adds the loader-specific throw. */
export function requireStatusAwareEditPermission(args: {
	role: string | undefined;
	workflowStatus: Status | null;
	request: Request;
}): void {
	if (isStatusAwareEditBlocked(args.role, args.workflowStatus)) {
		throwHazardousEventLoaderError(
			new AuthorizationError(
				"Record cannot be edited in its current workflow status",
			),
			{
				logMsg: "Status-aware edit permission denied in hazardous-event loader",
				url: args.request.url,
			},
		);
	}
}

/**
 * Role-gating (direct-validate/direct-publish, admin-only) and the empty-validator-list check
 * (submit-validation) -- request-authorization/well-formedness checks, not write-success checks.
 * Called once, at the top of each route's `action()`, before the primary use case runs, so a
 * rejected request never creates/updates a row -- fixes the "write-then-reject" bug (design.md
 * Decision 2/3). The resolved `MappedWorkflowAction` is threaded into
 * `composeWorkflowAction.server.ts` from there -- one call site for this guard, not an ambiguous
 * second one (SOLID review finding).
 */
export function requireWorkflowActionAuthorized(args: {
	parsed: ParsedHazardousEventFormData;
	actingUserRole: string | undefined;
	request: Request;
}): MappedWorkflowAction | null {
	const { parsed, actingUserRole, request } = args;
	const mappedAction = mapTempActionToWorkflowAction(parsed.tempAction);
	if (mappedAction === null) {
		return null;
	}

	if (
		(mappedAction === "direct-validate" || mappedAction === "direct-publish") &&
		!isWorkflowActionAuthorized(mappedAction, actingUserRole)
	) {
		throwHazardousEventLoaderError(
			new AuthorizationError(`${mappedAction} requires the admin role`),
			{
				logMsg: "Non-admin direct-validate/direct-publish request rejected",
				url: request.url,
			},
		);
	}

	// Decision 26: dead code through HE's own routes today (EditData already excludes every role
	// this rejects) -- kept for this file's own fail-fast consistency, in case a future caller
	// lacks an equivalent gate.
	if (
		mappedAction === "submit-draft" &&
		!isWorkflowActionAuthorized("submit-draft", actingUserRole)
	) {
		throwHazardousEventLoaderError(
			new AuthorizationError("submit-draft requires an edit-capable role"),
			{
				logMsg: "Non-edit-capable submit-draft request rejected",
				url: request.url,
			},
		);
	}

	if (
		mappedAction === "submit-validation" &&
		parsed.validatorUserIds.length === 0
	) {
		throwHazardousEventLoaderError(
			new ValidationError(
				"At least one validator must be selected for submit-validation",
			),
			{
				logMsg: "Empty validator list rejected on submit-validation",
				url: request.url,
			},
		);
	}

	return mappedAction;
}

/**
 * Membership-checks `submit-validation`'s client-submitted validator ids against the real,
 * tenant-scoped candidate list BEFORE the primary create/update use case runs (design.md
 * Decision 25) -- closes the residual write-before-reject gap a non-empty but entirely
 * stale/tampered list previously hit inside composeWorkflowAction.server.ts, after the write.
 * A no-op (no DB call) for every other mapped action.
 */
export async function requireValidValidatorIds(args: {
	mappedAction: MappedWorkflowAction | null;
	parsed: ParsedHazardousEventFormData;
	getValidCandidateIds: () => Promise<readonly string[]>;
	request: Request;
}): Promise<readonly string[]> {
	const { mappedAction, parsed, getValidCandidateIds, request } = args;
	if (mappedAction !== "submit-validation") {
		return [];
	}

	const validCandidateIds = new Set(await getValidCandidateIds());
	const validatorUserIds = parsed.validatorUserIds.filter((id) =>
		validCandidateIds.has(id),
	);
	if (validatorUserIds.length === 0) {
		throwHazardousEventLoaderError(
			new ValidationError(
				"At least one validator must be selected for submit-validation",
			),
			{
				logMsg:
					"No valid validator ids remained after candidate-list filtering",
				url: request.url,
			},
		);
	}

	return validatorUserIds;
}
