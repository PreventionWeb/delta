import type { ConflictError } from "~/shared/errors";

export type CausalConflictKind = "cycle" | "cause_after_effect";

/** Classifies CausalChain.ts's ConflictErrors by `context` shape, never message text; other
 * conflicts (concurrency, duplicate ids) return `null`. Shared by the form and the CSV import. */
export function causalConflictKind(
	err: ConflictError,
): CausalConflictKind | null {
	const context = err.context;
	if (context === undefined) {
		return null;
	}
	if ("causeStartDate" in context && "effectStartDate" in context) {
		return "cause_after_effect";
	}
	if ("causeId" in context && "effectId" in context) {
		return "cycle";
	}
	return null;
}
