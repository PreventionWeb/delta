/**
 * PinoLogger — production ILogger adapter backed by Pino (ADR-004).
 */
import pino from "pino";
import { DrizzleQueryError } from "drizzle-orm/errors";
import type { ILogger } from "~/shared/logging/ILogger";
import { getRequestContext } from "~/utils/requestContext.server";

export class PinoLogger implements ILogger {
	constructor(private readonly logger: pino.Logger) {}

	info(data: Record<string, unknown>): void {
		this.logger.info(data);
	}

	warn(data: Record<string, unknown>): void {
		this.logger.warn(data);
	}

	error(data: Record<string, unknown>): void {
		this.logger.error(data);
	}

	debug(data: Record<string, unknown>): void {
		this.logger.debug(data);
	}
}

/** Pino `mixin` — merges request context into each log line; exported so tests reuse it. */
export function contextMixin(): Record<string, unknown> {
	const ctx = getRequestContext();
	return ctx
		? { traceId: ctx.traceId, tenantId: ctx.tenantId, userId: ctx.userId }
		: {};
}

/** Exported so tests assert this exact array. Wildcards only redact one level deep (fast-redact has no recursive glob) — see design.md Risks. */
export const REDACT_PATHS = [
	"req.headers.authorization",
	"req.headers.cookie",
	"*.password",
	"*.token",
	"*.secret",
];

const SAFE_QUERY_MESSAGE = "Failed query";
const SAFE_DRIVER_FIELDS = ["code", "constraint", "table", "routine"] as const;

/** Driver fields that never carry a cell value; `message`, `detail` and `where` can. */
function safeDriverFields(cause: unknown): Record<string, unknown> {
	if (typeof cause !== "object" || cause === null) return {};
	const source = cause as Record<string, unknown>;
	return Object.fromEntries(
		SAFE_DRIVER_FIELDS.filter((key) => typeof source[key] === "string").map(
			(key) => [key, source[key]],
		),
	);
}

/** Pino's `err` serializer; DrizzleQueryError's message, stack, params and driver cause embed
 * query values, so only safe fields are kept, at any depth of the cause chain. */
function serializeLogError(
	err: unknown,
	seen: WeakSet<object> = new WeakSet(),
): unknown {
	if (!(err instanceof Error)) return err;
	if (seen.has(err)) return "[Circular]";
	seen.add(err);
	if (err instanceof DrizzleQueryError) {
		return {
			type: "DrizzleQueryError",
			message: SAFE_QUERY_MESSAGE,
			stack: err.stack?.replace(err.message, SAFE_QUERY_MESSAGE),
			db: safeDriverFields(err.cause),
		};
	}
	if (err.cause === undefined) return pino.stdSerializers.err(err);
	// Serialize a cause-less copy: pino would append cause messages to `message` unsanitized.
	const withoutCause: Error = Object.assign(
		Object.create(Object.getPrototypeOf(err)),
		err,
		{ message: err.message, stack: err.stack },
	);
	Reflect.deleteProperty(withoutCause, "cause");
	return {
		...pino.stdSerializers.err(withoutCause),
		cause: serializeLogError(err.cause, seen),
	};
}

/** Exported so tests assert the base instance uses it. */
export const LOG_SERIALIZERS = {
	err: (err: unknown): unknown => serializeLogError(err),
};

/**
 * Module-level base Pino instance — constructed exactly once at module load.
 */
const basePinoInstance = pino({
	serializers: LOG_SERIALIZERS,
	level: process.env.NODE_ENV === "production" ? "info" : "debug",
	transport:
		process.env.NODE_ENV !== "production"
			? { target: "pino-pretty" }
			: undefined,
	timestamp: () => `,"time":"${new Date().toISOString()}"`,
	redact: REDACT_PATHS,
	mixin: contextMixin,
});

// Memoized wrapper around basePinoInstance — constructed once, returned by
// every getPinoLogger() call (see the ILogger export below).
const pinoLoggerSingleton: ILogger = new PinoLogger(basePinoInstance);

/**
 * Singleton accessor for code that runs before any NestJS DI container exists
 * for the request.
 */
export function getPinoLogger(): ILogger {
	return pinoLoggerSingleton;
}

/**
 * Test-only accessor for the module-level base Pino instance.
 */
export function __getBasePinoInstanceForTest(): pino.Logger {
	return basePinoInstance;
}
