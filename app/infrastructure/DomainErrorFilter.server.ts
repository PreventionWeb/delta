import {
	Catch,
	HttpException,
	type ArgumentsHost,
	type ExceptionFilter,
} from "@nestjs/common";

import { DomainError } from "~/shared/errors/DomainError";

/**
 * Global NestJS exception filter that enforces the ADR-003 ErrorResponse envelope
 * for every request that reaches the NestJS HTTP surface.
 *
 * WHY @Catch() with no arguments (catch-all) rather than @Catch(DomainError):
 *   A type-specific decorator only intercepts errors whose prototype chain matches
 *   the declared type. Unknown programmer errors (plain Error) would fall through to
 *   NestJS's built-in DefaultExceptionFilter and return a shape that violates ADR-003.
 *   Using catch-all and discriminating internally ensures a single, consistent error
 *   envelope for every exception that escapes a controller.
 *
 * WHY HttpException is handled separately (not collapsed into the unknown-error branch):
 *   NestJS throws HttpException for infrastructure-level conditions such as unmatched
 *   routes (NotFoundException -> 404) and, in 5c, ValidationPipe failures
 *   (BadRequestException -> 400). Mapping these to 500 INTERNAL_ERROR produces incorrect
 *   HTTP semantics. Passing through the HttpException status code preserves correct
 *   semantics while still enforcing the ADR-003 envelope.
 *
 * WHY registered via APP_FILTER (not app.useGlobalFilters):
 *   APP_FILTER participates in NestJS DI, making the filter injectable and testable.
 */
@Catch()
export class DomainErrorFilter implements ExceptionFilter<unknown> {
	catch(exception: unknown, host: ArgumentsHost): void {
		const ctx = host.switchToHttp();
		// Typed as unknown and narrowed below -- avoids importing @types/express
		// directly in this file (NestJS re-exports the HTTP context types we need).
		const response = ctx.getResponse<{
			status(code: number): { json(body: unknown): void };
		}>();

		const traceId = crypto.randomUUID();
		const timestamp = new Date().toISOString();

		if (exception instanceof DomainError) {
			const body: Record<string, unknown> = {
				success: false,
				error: {
					code: exception.code,
					message: exception.message,
					// Omit the details field entirely when context is absent -- the
					// ADR-003 spec says the field must not be present (not null) when empty.
					...(exception.context !== undefined
						? { details: exception.context }
						: {}),
					traceId,
					timestamp,
				},
			};
			response.status(exception.statusHint).json(body);
		} else if (exception instanceof HttpException) {
			// NestJS infrastructure exceptions (unmatched routes, ValidationPipe, guards).
			// Use getResponse() rather than exception.message -- the response payload may
			// carry structured field-level errors (e.g. ValidationPipe returns an array of
			// messages). If the payload is an object, use exception.message as the
			// human-readable summary and surface the full payload as details; if it is a
			// plain string, use it directly with no details field.
			const nestResponse = exception.getResponse();
			const isObject =
				typeof nestResponse === "object" && nestResponse !== null;
			const message = isObject ? exception.message : String(nestResponse);
			const details = isObject ? nestResponse : undefined;
			response.status(exception.getStatus()).json({
				success: false,
				error: {
					code: "HTTP_ERROR",
					message,
					...(details !== undefined ? { details } : {}),
					traceId,
					timestamp,
				},
			});
		} else {
			// Unknown exception -- programmer error or infrastructure failure.
			// Log server-side with the traceId so the client-facing traceId can be
			// correlated with the stack trace in server logs. Do NOT surface the original
			// message or stack in the response -- leaking internal details aids attackers.
			console.error({ msg: "Unhandled exception", traceId, error: exception });
			response.status(500).json({
				success: false,
				error: {
					code: "INTERNAL_ERROR",
					message: "An unexpected error occurred. Please try again later.",
					traceId,
					timestamp,
				},
			});
		}
	}
}
