import { ValidationError, type DomainError } from "./DomainError";

/** ADR-003 envelope `details`: only `{ field }` from a ValidationError; other context never leaves the server. */
export function toErrorResponseDetails(
	err: DomainError,
): { field: string } | undefined {
	if (!(err instanceof ValidationError)) {
		return undefined;
	}
	const field = err.context?.field;
	return typeof field === "string" ? { field } : undefined;
}
