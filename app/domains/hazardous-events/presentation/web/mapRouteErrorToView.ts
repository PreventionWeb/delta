import { isRouteErrorResponse } from "react-router";

export type HazardousEventErrorKind =
	| "not_found"
	| "forbidden"
	| "invalid_request"
	| "conflict"
	| "unexpected";

export interface HazardousEventErrorView {
	/** Drives the `error.<kind>.*` copy keys. */
	kind: HazardousEventErrorKind;
	/** A non-empty envelope traceId, else null. */
	traceId: string | null;
}

const KIND_BY_STATUS: Readonly<
	Partial<Record<number, HazardousEventErrorKind>>
> = {
	400: "invalid_request",
	403: "forbidden",
	404: "not_found",
	409: "conflict",
	422: "invalid_request",
};

/** The body may be any shape (a string, a foreign object), so every level is checked. */
function traceIdOf(data: unknown): string | null {
	if (typeof data !== "object" || data === null || !("error" in data)) {
		return null;
	}
	const { error } = data;
	if (typeof error !== "object" || error === null || !("traceId" in error)) {
		return null;
	}
	const { traceId } = error;
	return typeof traceId === "string" && traceId !== "" ? traceId : null;
}

/** Kind comes from the HTTP status; only traceId is read from the body, never message, details or stack (ADR-003 Rule 4). */
export function mapRouteErrorToView(error: unknown): HazardousEventErrorView {
	if (!isRouteErrorResponse(error)) {
		return { kind: "unexpected", traceId: null };
	}
	return {
		kind: KIND_BY_STATUS[error.status] ?? "unexpected",
		traceId: traceIdOf(error.data),
	};
}
