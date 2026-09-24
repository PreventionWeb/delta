# ADR-004: Logging and Traceability

## Status
Proposed

## Date
2026-05-12

## Context

The existing codebase has two parallel logging systems: `app/utils/logger.ts` (150 lines, console wrappers) and `app/utils/logger.server.ts` (550 lines, Winston). Most production code uses neither — raw `console.log` is scattered throughout handlers, models, and services (flagged in P1-27). There is no request correlation, no tenant/user context in logs, and no consistent log level discipline.

**Revised 2026-09-24** against the team's own logging guideline (`tmp/logging-clean-architecture-ddd-guideline.md`), found while reviewing `4a`'s (`ProcessWorkflowActionUseCase`) swallowed-notification-failure handling. The mechanics (Pino, `ILogger` port, AsyncLocalStorage, redact paths, 4 levels, domain-never-logs) already matched; this revision tightens level discipline and error-handling rules that this ADR previously left under-specified, and explicitly documents one deliberate divergence (typed thrown errors, not `Result` types) rather than leaving it unstated. See Decisions below for what changed and why.

Logging and tracing solve different problems and must be treated separately but wired together:
- **Logging** answers *what happened* — a record of events with context at a point in time.
- **Tracing** answers *how a request flowed* — the full journey of one request, correlating all related log lines into a single timeline.

The architecture must support multi-tenant log filtering (`tenantId`), request correlation (`traceId`), and eventual distributed tracing without requiring domain code changes.

## Decision

### Logger: Pino

**Pino** replaces both existing logging systems and all `console.log` usage. Zero `console.log` calls are permitted in any server-side file after a domain is migrated.

Pino is chosen over Winston because:
- Deferred serialisation — log objects are not stringified on the hot path; batching happens in a worker thread
- Native structured JSON output — directly consumable by Datadog, Grafana Loki, ELK without transformation
- `pino-pretty` for human-readable development output with zero config change in production

```typescript
// app/utils/logger.server.ts — replaces existing Winston implementation
import pino from 'pino';

export const logger = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty' }
    : undefined,
  timestamp: () => `,"time":"${new Date().toISOString()}"`,  // always UTC
  redact: [
    'req.headers.authorization',
    'req.headers.cookie',
    '*.password',
    '*.token',
    '*.secret',
  ],
});
```

### ILogger Port in the Application Layer

The domain and application layers must not depend on Pino or any logging framework. A port interface is defined in shared infrastructure:

```typescript
// shared/logging/ILogger.ts
export interface ILogger {
  info(data: Record<string, unknown>): void;
  warn(data: Record<string, unknown>): void;
  error(data: Record<string, unknown>): void;
  debug(data: Record<string, unknown>): void;
}
```

Use cases declare `ILogger` as a dependency. The Pino implementation is injected via NestJS DI (infrastructure concern). In tests, a mock or no-op logger is injected — no Pino dependency in test setup.

The domain layer does not log. Logging belongs in the application layer (use cases) at boundaries — one line per use case outcome (see Log at Boundaries below), and caught infrastructure errors per the Error Handling Rules.

### Request Context via AsyncLocalStorage

Every log line during a request must carry `traceId`, `tenantId`, and `userId` without manually passing them through every function call. AsyncLocalStorage provides this transparently.

```typescript
// app/utils/requestContext.server.ts
import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  traceId: string;
  tenantId: string | null;
  userId: string | null;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

export function withRequestContext<T>(
  ctx: RequestContext,
  fn: () => Promise<T>
): Promise<T> {
  return requestContext.run(ctx, fn);
}

// Logger reads context automatically on every call
export function getContextualLogger() {
  const ctx = requestContext.getStore();
  return logger.child({
    traceId: ctx?.traceId,
    tenantId: ctx?.tenantId,
    userId: ctx?.userId,
  });
}
```

Every React Router loader and action wraps its execution in `withRequestContext`:

```typescript
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const traceId = crypto.randomUUID();
  const { userId, tenantId } = await resolveFromSession(request);
  return withRequestContext({ traceId, tenantId, userId }, async () => {
    // all log calls here carry traceId, tenantId, userId automatically
    return listNoticesUseCase.execute({ locale });
  });
};
```

When NestJS exposes an HTTP server, `pino-http` middleware provides the equivalent for that surface, wiring into the same AsyncLocalStorage context.

### Log Level Discipline

| Level | Use when | Example |
|---|---|---|
| `error` | Something is broken, or failed for a reason nobody designed for | DB connection failed, an unexpected/unhandled exception reaching a boundary |
| `warn` | Handled but degraded — the system compensated, recovered, or tolerated something | A caught, swallowed error (fallback used, no rethrow); a retry that succeeded; a tolerated malformed input the code can still handle |
| `info` | Meaningful business event — readable as an audit trail | Notice created, workflow action processed, user authenticated, report exported |
| `debug` | Developer internals — off in production by default | Cache hit/miss, SQL parameters, intermediate values |

`info` logs must be understandable by someone with no code knowledge. `debug` logs are for developers only. Never construct large objects eagerly for a `debug` call — even when the level is disabled, eager construction has a cost.

**Expected business outcomes are not `error`, and are usually not even `warn`.** A validation failure, a business-rule violation, or a "not found" is a normal, designed-for result — typically nothing is logged at the point it's thrown (see Error Handling Rules below; the boundary decides whether it's worth an `info` line), and it is never logged at `error`. Reserve `error` for the case the code did not anticipate.

### Error Handling Rules

Adopted from the team's logging guideline. Every error is logged **exactly once**, by the code that decides its fate:

1. **Log or throw, never both.** Catch-log-rethrow at each layer turns one failure into several `error` lines. If you're rethrowing (or letting it propagate), don't log at that layer — the eventual handler does.
2. **The handler logs.** An error is handled in exactly one place: where it becomes an HTTP response, a swallowed fallback, or a retry. That place logs it — not every layer it passed through.
   - Repositories/adapters wrap and rethrow without logging (e.g. `throw new PersistenceError("save failed", { cause: e })`); the `cause` chain carries context to the eventual log line.
   - A NestJS global exception filter (or the equivalent React Router `handleError` boundary) is the single place an *unexpected* error gets logged, at `error`, with the full chain. **Not yet implemented in this codebase** — see Consequences.
3. **Swallowed errors are logged where they are swallowed, at `warn`.** If you catch an error and do not rethrow it (a fallback was used, the failure was tolerated), that's a `warn` line, not `error` — the operation the caller cares about still succeeded. Example: `ProcessWorkflowActionUseCase`'s `notify()` failure (the workflow transition already persisted; notification failing is a tolerated degradation, not a broken system — `DEF-023`).
4. **A caught, propagated `DomainError` is not itself an `error`-level event at the point it's caught.** Whether it becomes a `warn`, an `info`, or nothing at all is the boundary's call once it decides the HTTP status/response shape — not every intermediate layer's job.

### Mandatory Fields in Every Log Line

Every log line emitted during a request must include:
- `traceId` — from AsyncLocalStorage context
- `tenantId` — from AsyncLocalStorage context
- `userId` — from AsyncLocalStorage context
- `time` — UTC ISO 8601 (handled by Pino timestamp config)
- `msg` — the message key (always a string, never string concatenation)

Log objects, never strings:
```typescript
// Correct
logger.info({ msg: 'Notice created', noticeId: result.id });

// Wrong — unqueryable, not structured
logger.info('Notice created: ' + result.id);
```

### Log at Boundaries — One Line Per Use-Case Outcome, Not Entry-And-Exit

**Revised:** the original text here said "log at the entry and exit of use cases." Dropped — tracing (OpenTelemetry spans, see below) already shows which code path a request took; an entry line and an exit line for every use case call just doubles log volume without adding information tracing doesn't already give. The actual pattern already in use (`CreateNoticeUseCase`, `ProcessWorkflowActionUseCase`): **one `info` line per use case outcome**, logged once, with enough fields to be a self-contained audit record (not "entering X" / "leaving X").

Also log at external API calls and DB operations, at `debug`/`warn` per the level table above. Not inside every private method. Not inside domain entity methods — the domain layer never logs (see below).

### Domain Layer: Thrown Typed Errors, Not `Result` Types

The team's logging guideline's reference examples use `Result<T, DomainError>` return values instead of thrown exceptions, reasoning that an error a caller is expected to handle shouldn't use exception control flow. **This codebase deliberately does not follow that pattern.** `ADR-003` (Error Handling Architecture) already established a thrown, typed `DomainError` hierarchy (`ValidationError`, `ConflictError`, `NotFoundError`, `AuthorizationError`) before this revision, and every Clean-Architecture domain built since (`Notice`, `WorkflowInstance`, `HazardousEvent`, `CausalChain`, `SpatialObservation` — all archived, merged, in production) throws rather than returns a `Result`. Reworking this to `Result` types now would mean unwinding every one of those shipped changes for no behavior change — not worth it, and the guideline itself names this exact question as contested industry-wide, not settled.

What both approaches agree on regardless of shape: the domain layer itself never logs. A thrown `ValidationError`/`ConflictError` and a returned `Result.err(...)` carry the same non-logging responsibility — deciding whether/how to log it belongs to whoever catches it (the boundary), not the domain code that raised it.

### OpenTelemetry — Phased Adoption

| Phase | TraceId mechanism | Capability |
|---|---|---|
| Now (pilot) | `crypto.randomUUID()` per request | All logs for a request share one ID — filterable in log aggregator |
| Phase 2 | OTel SDK + `@opentelemetry/instrumentation-pino` bridge | TraceId in logs links to spans in a trace backend |
| Phase 3 | OTel Collector + Grafana Tempo or Jaeger | Full waterfall trace UI, distributed tracing across services |

The `traceId: string` field in `RequestContext` is source-agnostic. Switching from `crypto.randomUUID()` to an OTel span ID is a one-line change in the loader wrapper — no domain or application code changes.

OpenTelemetry SDK initialisation **must** happen before any other server bootstrap:

```typescript
// app/init.server.tsx
export async function initServer() {
  await startTelemetry();   // OTel FIRST — before DB, before everything
  initDB();
  initCookieStorage();
  // ...
}
```

### Frontend Error Tracking — Sentry

Frontend errors disappear into the browser. Sentry provides:
- Automatic error grouping across users
- Breadcrumb trail (console, network, UI interactions) leading up to an error
- React component stack on rendering errors
- Backend trace correlation

```typescript
// app/entry.client.tsx
Sentry.init({
  dsn: process.env.VITE_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  integrations: [Sentry.browserTracingIntegration()],
  tracesSampleRate: 0.2,
});
```

**Frontend ↔ backend correlation**: the server includes `x-trace-id` in every response header. The frontend attaches it to Sentry events, linking a Sentry frontend error directly to the backend log that caused it.

### Rules Enforced as Team Conventions

1. `console.log`/`console.*` is banned in all server-side code. **Correction (2026-09-24): no ESLint `no-console` rule actually exists in this repo today** — no ESLint config of any kind is present. This line described a target, not reality; see `DEF-025` for the rollout plan. Until then, this is a manual-review convention only, not a tooling-enforced one — and it already has known violations (`app/entry.server.tsx` uses raw `console.log`/`console.error` in four places, pre-existing, outside any CA domain).
   - **The one sanctioned exception**, once the rule exists: a last-resort `console.error` fallback for the case where the injected `ILogger` implementation itself throws — there is no other channel at that point by definition. Mark it with `eslint-disable-next-line no-console` and a comment explaining why (see `ProcessWorkflowActionUseCase` for the pattern). This is not a loophole for routine logging; it's a documented exception for when the sanctioned system has already failed.
2. Inject the logger — do not instantiate it. Logger comes from DI so request context flows automatically.
3. Log objects, not strings. Every log call uses `{ msg: '...', ...fields }` — queryable, structured.
4. Log at boundaries — one line per use case outcome (not entry/exit), external calls, DB operations. Not inside every method.
5. Never log sensitive data — passwords, tokens, session cookies, PII. Pino `redact` is a safety net, not the primary control.
6. OTel initialises before NestJS and before React Router serves requests.
7. Log or throw, never both (see Error Handling Rules above) — a caught-and-rethrown error is not logged at the layer that rethrows it.
8. A caught error you do not rethrow is logged at `warn`, not `error` — reserve `error` for what nobody designed for.

### Code Review Checklist

Check this on every PR that adds or changes logging, adapted from the team guideline:

- [ ] No logger import or call in the domain layer
- [ ] No catch-log-rethrow — a layer that rethrows does not also log
- [ ] Every catch that swallows (does not rethrow) logs at `warn`, not `error`
- [ ] Business-rule/validation failures are never logged at `error`
- [ ] No entry/exit log pairs for a single use-case call — one outcome line
- [ ] Fields are structured (`{ entityId, action }`), never interpolated into the message string
- [ ] No PII, secrets, or tokens outside the `redact` paths
- [ ] Every new `error` log is something a human should actually act on
- [ ] Any `console.*` call is the documented last-resort exception, with `eslint-disable-next-line no-console` and a reason — not routine logging

## Consequences

- Every log line is filterable by `tenantId` — support can isolate all activity for a tenant instantly
- `traceId` in the error response UI means users can self-report a correlation key — support can find the exact log without guessing
- The `ILogger` port means use cases are testable with a no-op logger — no Pino in unit tests
- Winston and the console-wrapper `logger.ts` are deleted as each domain is migrated — scoped to domain rewrites, not a global change
- Sentry adds an external dependency and DSN secret to manage — scoped to production deployments

## References

- Team logging guideline (`tmp/logging-clean-architecture-ddd-guideline.md`, gitignored — not a permanent doc, source for the 2026-09-24 revision above)
- [P1-27: Consolidate two logging systems](../refactoring-plan/phases/phase-1-structural.md)
- [ADR-003: Error Handling Architecture](ADR-003-error-handling-architecture.md) — traceId flows from error handling into logging
- [ADR-002: Timezone Handling](ADR-002-timezone-handling.md) — log timestamps always UTC
- [OpenTelemetry Node.js SDK](https://opentelemetry.io/docs/languages/js/getting-started/nodejs/)
- [pino-http](https://github.com/pinojs/pino-http)
