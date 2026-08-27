import {
	Catch,
	Inject,
	Injectable,
	Optional,
	HttpException,
	type ArgumentsHost,
	type ExceptionFilter,
} from "@nestjs/common";
import { I18nContext, I18nService } from "nestjs-i18n";

import { DomainError } from "~/shared/errors/DomainError";
import { InvalidLocaleTagError } from "~/shared/i18n/resolveLocale";
import { OPENAPI_DOCS_PATH } from "~/shared/openApiDocsPath";

// Structural, not `import { Request } from "express"` — @types/express isn't installed.
interface StructuredRequest {
	protocol: string;
	headers: { host?: string };
}

// Built from the request's own protocol/host, never hardcoded (design.md Decision 15).
// OPENAPI_DOCS_PATH is shared with mountOpenApiDocs() (app/init.server.tsx) so this can
// never point at a stale docs path if that mount point ever moves.
function buildDocumentationUrl(req: StructuredRequest): string {
	return `${req.protocol}://${req.headers.host}${OPENAPI_DOCS_PATH}`;
}

/**
 * Global NestJS exception filter enforcing the ADR-003 ErrorResponse envelope on every request.
 *
 * - `@Catch()` (catch-all, not `@Catch(DomainError)`): a typed decorator would let plain
 *   `Error`s fall through to Nest's default filter and break the envelope.
 * - `HttpException` branch: preserves Nest's own status codes (404 routes, 400 ValidationPipe)
 *   instead of collapsing them to 500.
 * - `InvalidLocaleTagError` branch: framework-agnostic type from `resolveLocale()` (design.md
 *   Decision 4) -- not an `HttpException`, so it needs its own check.
 * - `APP_FILTER` (not `app.useGlobalFilters`): keeps the filter in Nest's DI, so it's injectable
 *   and testable.
 */
@Catch()
@Injectable()
export class DomainErrorFilter implements ExceptionFilter<unknown> {
	// @Optional(): I18nModule is @Global() but only present when the compiled graph includes
	// CoreModule (design.md Decision 19) — this filter's own isolated tests register it via a
	// bare APP_FILTER provider with no I18nModule, and must still work with an untranslated default.
	constructor(
		@Optional() @Inject(I18nService) private readonly i18n?: I18nService,
	) {}

	catch(exception: unknown, host: ArgumentsHost): void {
		const ctx = host.switchToHttp();
		// Typed as unknown to avoid an @types/express import; narrowed to what's used.
		const response = ctx.getResponse<{
			status(code: number): { json(body: unknown): void };
		}>();

		const traceId = crypto.randomUUID();
		const timestamp = new Date().toISOString();

		if (exception instanceof DomainError) {
			const lang = I18nContext.current(host)?.lang;
			const message = exception.i18nKey
				? (this.i18n?.t(exception.i18nKey, { lang, args: exception.context }) ??
					exception.message)
				: exception.message;
			const body: Record<string, unknown> = {
				success: false,
				error: {
					code: exception.code,
					message,
					// ADR-003: omit `details` entirely when empty, not null.
					...(exception.context !== undefined
						? { details: exception.context }
						: {}),
					traceId,
					timestamp,
				},
			};
			response.status(exception.statusHint).json(body);
		} else if (exception instanceof InvalidLocaleTagError) {
			response.status(400).json({
				success: false,
				error: {
					code: exception.code,
					message: exception.message,
					details: { supportedLocales: exception.supportedLocales },
					traceId,
					timestamp,
				},
			});
		} else if (exception instanceof HttpException) {
			// getResponse() may be a structured object (e.g. ValidationPipe's field errors)
			// or a plain string; only the object case gets a `details` payload.
			const nestResponse = exception.getResponse();
			const isObject =
				typeof nestResponse === "object" && nestResponse !== null;
			const message = isObject ? exception.message : String(nestResponse);
			const details = isObject ? nestResponse : undefined;
			const status = exception.getStatus();
			// Unmatched-route 404s only (design.md Decision 15) — resource-not-found
			// 404s are DomainErrors, handled by the branch above, so never reach here.
			// Safe only while every controller models not-found as a DomainError; a raw
			// NotFoundException for a real resource would wrongly get this link too.
			const documentationUrl =
				status === 404
					? buildDocumentationUrl(ctx.getRequest<StructuredRequest>())
					: undefined;
			response.status(status).json({
				success: false,
				error: {
					code: "HTTP_ERROR",
					message,
					...(details !== undefined ? { details } : {}),
					traceId,
					timestamp,
				},
				...(documentationUrl !== undefined ? { documentationUrl } : {}),
			});
		} else {
			// Unknown exception (programmer/infra error): log server-side with traceId for
			// correlation, but never leak the message or stack to the client.
			console.error({ msg: "Unhandled exception", traceId, error: exception });
			const lang = I18nContext.current(host)?.lang;
			response.status(500).json({
				success: false,
				error: {
					code: "INTERNAL_ERROR",
					message:
						this.i18n?.t("common.error.generic_retry", { lang }) ??
						"An unexpected error occurred. Please try again later.",
					traceId,
					timestamp,
				},
			});
		}
	}
}
