import {
	AuthorizationError,
	ConcurrentModificationError,
	ConflictError,
	NotFoundError,
} from "~/shared/errors";
import { OUTGOING_EVENT_RELATIONSHIP_CONFLICT } from "~/domains/hazardous-events/application/ports/IHazardousEventRepository";
import type { DeleteHazardousEventDependent } from "~/domains/hazardous-events/application/use-cases/DeleteHazardousEvent";

type DependentType = DeleteHazardousEventDependent["type"];

// Insertion order is the display order (design.md D2).
const DEPENDENT_MESSAGE_KEYS = {
	DISASTER_EVENT: "delete.blocked.disaster_event",
	EVENT_CAUSALITY: "delete.blocked.event_causality",
	CAUSAL_CHAIN: "delete.blocked.causal_chain",
} as const satisfies Record<DependentType, string>;

const CAUSED_BY_KEY = "delete.blocked.caused_by";
const GENERIC_BLOCKED_KEY = "delete.blocked.generic";
const NOT_FOUND_KEY = "delete.not_found";
const FORBIDDEN_KEY = "delete.forbidden";

export type DeleteMessageKey =
	| (typeof DEPENDENT_MESSAGE_KEYS)[DependentType]
	| typeof CAUSED_BY_KEY
	| typeof GENERIC_BLOCKED_KEY
	| typeof NOT_FOUND_KEY
	| typeof FORBIDDEN_KEY;

/** Body the delete route returns for an expected failure; the button toasts it. */
export interface DeleteHazardousEventFailure {
	ok: false;
	messageKeys: DeleteMessageKey[];
}

function dependentTypesOf(context: Record<string, unknown> | undefined) {
	const dependents = context?.dependents;
	if (!Array.isArray(dependents)) {
		return new Set<unknown>();
	}
	return new Set<unknown>(
		dependents.flatMap((dependent: unknown) =>
			typeof dependent === "object" && dependent !== null && "type" in dependent
				? [dependent.type]
				: [],
		),
	);
}

/** The repository marks its DEF-044 conflict explicitly; anything unmarked is unknown. */
function isOutgoingRelationshipConflict(err: ConflictError): boolean {
	return (
		!(err instanceof ConcurrentModificationError) &&
		err.context?.reason === OUTGOING_EVENT_RELATIONSHIP_CONFLICT
	);
}

/** Keyed off error type and context markers only, never err.message. Null means "not an
 * expected delete outcome", so the caller rethrows. */
export function mapDeleteErrorToMessageKeys(
	err: unknown,
): DeleteMessageKey[] | null {
	if (err instanceof NotFoundError) {
		return [NOT_FOUND_KEY];
	}
	if (err instanceof AuthorizationError) {
		return [FORBIDDEN_KEY];
	}
	if (!(err instanceof ConflictError)) {
		return null;
	}
	const types = dependentTypesOf(err.context);
	const keys = (Object.keys(DEPENDENT_MESSAGE_KEYS) as DependentType[])
		.filter((type) => types.has(type))
		.map((type) => DEPENDENT_MESSAGE_KEYS[type]);
	if (keys.length > 0) {
		return keys;
	}
	return [
		isOutgoingRelationshipConflict(err) ? CAUSED_BY_KEY : GENERIC_BLOCKED_KEY,
	];
}
