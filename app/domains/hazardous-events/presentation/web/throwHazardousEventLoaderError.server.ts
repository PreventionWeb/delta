import { DomainError } from "~/shared/errors/DomainError";
import { toErrorResponseDetails } from "~/shared/errors/toErrorResponseDetails";
import type { ErrorResponse } from "~/shared/errors/ErrorResponse";
import { getRequestContext } from "~/utils/requestContext.server";
import { getPinoLogger } from "~/infrastructure/logging/PinoLogger.server";

const INTERNAL_ERROR_MESSAGE =
	"An unexpected error occurred. Please try again later.";

function errorEnvelope(
	error: Pick<ErrorResponse["error"], "code" | "message" | "details">,
): ErrorResponse {
	return {
		success: false,
		error: {
			...error,
			traceId: getRequestContext()?.traceId ?? crypto.randomUUID(),
			timestamp: new Date().toISOString(),
		},
	};
}

/** Maps a route failure to an ADR-003 error Response: DomainError by status, a thrown Response passes through, anything else is logged and masked as a 500. */
export function throwHazardousEventLoaderError(
	err: unknown,
	context: { logMsg: string; url: string },
): never {
	if (err instanceof DomainError) {
		const details = toErrorResponseDetails(err);
		throw Response.json(
			errorEnvelope({
				code: err.code,
				message: err.message,
				...(details !== undefined ? { details } : {}),
			}),
			{ status: err.statusHint },
		);
	}
	if (err instanceof Response) {
		throw err;
	}
	getPinoLogger().error({ msg: context.logMsg, err, url: context.url });
	throw Response.json(
		errorEnvelope({ code: "INTERNAL_ERROR", message: INTERNAL_ERROR_MESSAGE }),
		{ status: 500 },
	);
}
