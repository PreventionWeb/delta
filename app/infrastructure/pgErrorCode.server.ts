/** PG code/constraint land on `.cause`, not the top-level error, since drizzle-orm wraps driver errors in `DrizzleQueryError` -- both are checked. */

/** @throws nothing -- returns `undefined` when no PG code is found. */
export function pgErrorCode(err: unknown): string | undefined {
	if (typeof err !== "object" || err === null) {
		return undefined;
	}
	const code = "code" in err ? err.code : undefined;
	if (typeof code === "string") {
		return code;
	}
	const cause = "cause" in err ? err.cause : undefined;
	const causeCode =
		typeof cause === "object" && cause !== null && "code" in cause
			? cause.code
			: undefined;
	return typeof causeCode === "string" ? causeCode : undefined;
}

/** Same both-fields pattern as pgErrorCode, for the constraint name -- needed when more than one constraint can raise the same PG code at a call site. */
export function pgErrorConstraint(err: unknown): string | undefined {
	if (typeof err !== "object" || err === null) {
		return undefined;
	}
	const constraint = "constraint" in err ? err.constraint : undefined;
	if (typeof constraint === "string") {
		return constraint;
	}
	const cause = "cause" in err ? err.cause : undefined;
	const causeConstraint =
		typeof cause === "object" && cause !== null && "constraint" in cause
			? cause.constraint
			: undefined;
	return typeof causeConstraint === "string" ? causeConstraint : undefined;
}
