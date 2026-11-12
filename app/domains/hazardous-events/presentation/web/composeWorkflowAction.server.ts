import { ProcessWorkflowActionUseCase } from "~/domains/validation-workflow/application/use-cases/ProcessWorkflowAction";
import { getPinoLogger } from "~/infrastructure/logging/PinoLogger.server";
import { getAppContext } from "~/init.server";
import { GetHazardousEventByIdUseCase } from "~/domains/hazardous-events/application/use-cases/GetHazardousEventById";
import { FindValidatorCandidatesUseCase } from "~/domains/validation-workflow/application/use-cases/FindValidatorCandidates";
import { deriveRecordDate, type MappedWorkflowAction } from "./formDataMappers";
import type { ParsedHazardousEventFormData } from "./parseHazardousEventFormData.server";

export type ComposeWorkflowActionResult =
	| { attempted: false }
	| { attempted: true; outcome: "succeeded" }
	| { attempted: true; outcome: "failed" };

/** Shared by create/edit actions, called after the primary use case has already committed.
 * `mappedAction` (authorized by the caller's `requireWorkflowActionAuthorized`) and
 * `validatorUserIds` (candidate-filtered by the caller's `requireValidValidatorIds`) are both
 * resolved before the primary use case (design.md Decision 25) and used as-is here, not
 * re-derived or re-checked -- one call site per guard (SOLID review finding);
 * `ProcessWorkflowActionUseCase.execute()` remains the authoritative backstop for an empty
 * validator list. A legitimate workflow-transition write failure returns `outcome: "failed"` so
 * the caller can flash-redirect. */
export async function composeWorkflowAction(args: {
	processWorkflowActionUseCase: Pick<ProcessWorkflowActionUseCase, "execute">;
	mappedAction: MappedWorkflowAction | null;
	parsed: ParsedHazardousEventFormData;
	entityId: string;
	tenantId: string;
	actingUserId: string;
	actingUserRole: string | undefined;
	/** Only called when the mapped action is submit-validation -- avoids an unneeded lookup for every other save. */
	getRecordDisplayName: () => Promise<string>;
	/** Already filtered against the real tenant-scoped candidate list by the caller, before the
	 * primary use case ran (design.md Decision 25) -- used as-is, not re-validated here. */
	validatorUserIds: readonly string[];
}): Promise<ComposeWorkflowActionResult> {
	const { parsed, mappedAction, processWorkflowActionUseCase } = args;
	if (mappedAction === null) {
		return { attempted: false };
	}

	// Resolved before the try block -- a failure here is a bug in the caller's lookup, not a
	// workflow-transition write failure, so it must not be reported as a partial-success case.
	const recordDisplayName =
		mappedAction === "submit-validation"
			? await args.getRecordDisplayName()
			: "";

	try {
		if (mappedAction === "submit-validation") {
			await processWorkflowActionUseCase.execute({
				action: "submit-validation",
				entityId: args.entityId,
				entityType: "HE",
				tenantId: args.tenantId,
				actingUserId: args.actingUserId,
				validatorUserIds: args.validatorUserIds,
				recordDisplayName,
				recordDate: deriveRecordDate(parsed.startDate, parsed.endDate),
			});
		} else if (
			mappedAction === "direct-validate" ||
			mappedAction === "direct-publish"
		) {
			await processWorkflowActionUseCase.execute({
				action: mappedAction,
				entityId: args.entityId,
				entityType: "HE",
				tenantId: args.tenantId,
				actingUserId: args.actingUserId,
				actingUserRole: args.actingUserRole,
			});
		} else {
			await processWorkflowActionUseCase.execute({
				action: mappedAction,
				entityId: args.entityId,
				entityType: "HE",
				tenantId: args.tenantId,
				actingUserId: args.actingUserId,
				actingUserRole: args.actingUserRole,
			});
		}
		return { attempted: true, outcome: "succeeded" };
	} catch (err) {
		// A status-transition write failure after a committed create/update is a partial
		// success, not a 500 (Decision 3) -- still logged (WARN) so it's visible, not swallowed.
		getPinoLogger().warn({
			msg: "hazardous_event.workflow_action_failed",
			err,
			entityId: args.entityId,
			action: mappedAction,
		});
		return { attempted: true, outcome: "failed" };
	}
}

/** Shared `composeWorkflowAction` callback factory (new.tsx/edit.$id.tsx). `id` is a call-time
 * param, not factory-level, since `getValidCandidateIds` must be callable pre-create. */
export function buildWorkflowComposerCallbacks({
	tenantId,
	actingUserId,
}: {
	tenantId: string;
	actingUserId: string;
}): {
	getRecordDisplayName: (id: string) => Promise<string>;
	getValidCandidateIds: () => Promise<string[]>;
} {
	return {
		// Re-fetched here, not derived from a caller-held pre-edit `event` -- a submission that both
		// changes the hazard classification and requests submit-validation would otherwise email
		// validators the stale pre-edit name (code review finding, edit.$id.tsx's own precedent).
		getRecordDisplayName: async (id: string) => {
			const detail = await getAppContext()
				.get(GetHazardousEventByIdUseCase)
				.execute({ id, tenantId });
			return (
				detail.specificHazardName ||
				detail.hazardClusterName ||
				detail.hazardTypeName ||
				""
			);
		},
		getValidCandidateIds: async () => {
			const candidates = await getAppContext()
				.get(FindValidatorCandidatesUseCase)
				.execute({ tenantId, excludingUserId: actingUserId });
			return candidates.map((c) => c.id);
		},
	};
}
