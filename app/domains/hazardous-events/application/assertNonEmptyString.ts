import { ValidationError } from "~/shared/errors";

/** Same required-string-field rule as HazardousEvent.ts's own private helper —
 * shared here because command-level fields (tenantId, hazardousEventId) are validated at the
 * use-case boundary. */
export function assertNonEmptyString(value: unknown, fieldName: string): void {
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new ValidationError(`${fieldName} must not be empty`);
	}
}
