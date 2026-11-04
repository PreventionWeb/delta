import { ConflictError, ValidationError } from "~/shared/errors";

/** Fields the create/edit form renders -- the only names this heuristic maps a message to. */
const KNOWN_FIELDS = new Set([
	"specificHazardId",
	"startDate",
	"endDate",
	"nationalSpecification",
	"description",
	"chainsExplanation",
	"magnitude",
	"recordOriginator",
	"dataSource",
	"hazardousEventStatus",
	"specificHazardLocalName",
	"specificHazardNationalName",
	"causeId",
]);

/** Infers a field key from each message's "<fieldName> must ..." convention (no domain
 * ValidationError carries a structured field key, design.md, under Decision 17). Null -> caller
 * uses a generic message. */
export function extractFieldError(
	err: ValidationError,
): { field: string; message: string } | null {
	const match = /^(\w+)\s/.exec(err.message);
	const field = match?.[1];
	if (field === undefined || !KNOWN_FIELDS.has(field)) {
		return null;
	}
	return { field, message: err.message };
}

/** Maps CausalChain.ts's three ConflictErrors (self-cause, cycle, cause-starts-after-effect) to
 * the causeId field. Discriminated by `context` shape, not message text -- other ConflictErrors
 * (concurrency, duplicate id/observationTime) use unrelated shapes and must still fall through. */
export function extractCauseConflictError(
	err: ConflictError,
): { field: string; message: string } | null {
	const context = err.context;
	if (context === undefined) {
		return null;
	}
	const isCausalChainConflict =
		("causeId" in context && "effectId" in context) ||
		("causeStartDate" in context && "effectStartDate" in context);
	return isCausalChainConflict
		? { field: "causeId", message: err.message }
		: null;
}
