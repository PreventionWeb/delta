## Context

`app/init.server.tsx` currently bootstraps only `NestFactory.createApplicationContext(CoreModule)` —
a DI container with no HTTP listener. `CoreModule.server.ts` wires `DrizzleProvider` and
`NoticesModule`. Phase 3c (this change) must add an HTTP server on a dedicated port so that
NestJS `@Controller` classes can serve REST requests independently of the Remix/Express SSR
process on port 3000.

The error-handling contract for that HTTP surface is defined in ADR-003: every operational error
MUST be returned as an `ErrorResponse` envelope with `success: false`, machine-readable `code`,
human-readable `message`, optional `details`, a `traceId`, and a UTC `timestamp`. The filter is
the single enforcement point for that contract on the HTTP surface.

## Goals / Non-Goals

**Goals:**

- Start `NestFactory.create(CoreModule)` on `process.env.API_PORT` (default 3001) with a single
  bootstrap guard so concurrent callers share the same `INestApplication` instance.
- Set global prefix `/api/v2` on the HTTP app.
- Register `DomainErrorFilter` as a global `APP_FILTER` in `CoreModule` so it applies to every
  controller without per-controller decoration.
- Log a structured `info` event when the HTTP server starts successfully (port, timestamp).
- Map `DomainError` subtypes to their `statusHint` HTTP status code and the `ErrorResponse` envelope.
- Map unknown exceptions to a generic 500 `ErrorResponse` (no internal details leaked).
- Ensure Remix loaders calling `getAppContext()` are completely unaffected by the HTTP bootstrap.

**Non-Goals:**

- Auth guards — individual controllers (5c) enforce authentication.
- Request tracing via AsyncLocalStorage — the `traceId` in the filter uses `crypto.randomUUID()`
  directly for now; full AsyncLocalStorage propagation is ADR-004 work deferred to a later intent.
- NestJS validation pipe (`ValidationPipe`) — class-validator is introduced in 5c with the first
  request DTO class.
- Rate limiting, CORS, Helmet — deferred to a dedicated hardening intent.

## Decisions

### Decision 1 — HTTP app and application context share the same module (`CoreModule`)

**Alternatives considered:**

- _Separate HTTP module_: keeps `CoreModule` as a context-only root and introduces a new
  `HttpCoreModule` for HTTP bootstrap. Adds indirection with no benefit at this stage — `CoreModule`
  is already the composition root and both surfaces need access to the same provider graph.
- _Single `NestFactory.create` replaces `createApplicationContext`_: `INestApplication` implements
  `INestApplicationContext`, so `getAppContext()` could return it directly. However, this conflates
  the DI container lifecycle with the HTTP server lifecycle, complicating shutdown and test setup.

**Decision:** Keep both `appContext` (`INestApplicationContext`) and `httpApp` (`INestApplication`)
as separate module-level singletons, both bootstrapped from `CoreModule`. The application context
is bootstrapped first (existing behaviour); the HTTP app is bootstrapped second. `getAppContext()`
continues to return the application context unchanged.

### Decision 2 — `APP_FILTER` token for global filter registration

`CoreModule` registers `DomainErrorFilter` via the NestJS `APP_FILTER` token (from
`@nestjs/core`). This is the standard NestJS pattern for globally scoped filters — it works
regardless of whether the filter is registered before or after individual modules are imported.

The alternative (calling `app.useGlobalFilters(new DomainErrorFilter())`) is viable but
bypasses NestJS DI, which means the filter cannot inject services. Using `APP_FILTER` keeps
the filter DI-injectable for future extension.

### Decision 3 — `traceId` from `crypto.randomUUID()` inside the filter

The filter generates a fresh `traceId` using `crypto.randomUUID()` for each caught exception.
This is intentional for now: full `AsyncLocalStorage` traceId propagation (ADR-004) is deferred.
Once ADR-004 traceId propagation is wired up, the filter will read from the storage context
instead — the `ErrorResponse` shape and filter interface do not change.

### Decision 4 — HTTP bootstrap guard mirrors the application context guard

`app/init.server.tsx` already uses a `bootstrapPromise` pattern for the application context so
concurrent callers on a cold start do not create two DI containers. The HTTP app uses a
`httpBootstrapPromise` variable with the same structure. Both are reset to `undefined` on
rejection so a subsequent call can retry.

### Decision 5 — No `@nestjs/platform-fastify`; Express adapter is the default

The project already uses Express 5 for the Remix SSR server. Using the default NestJS
Express adapter (`@nestjs/platform-express`) avoids a second HTTP framework. The HTTP server
for NestJS runs on a different port (3001) so there is no conflict with the Remix Express app.

### Decision 6 — No Drizzle schema changes

This change introduces no new tables, columns, or migrations. No `yarn dbsync` is required.

### Decision 7 — Test approach: NestJS supertest integration (no PGlite, no real DB)

`DomainErrorFilter` and the HTTP bootstrap are tested via NestJS supertest:

```
tests/integration/nestjs/DomainErrorFilter.test.ts
```

The test creates a minimal `TestModule` with a stub `@Controller` that throws each
`DomainError` subtype on demand. `Test.createTestingModule` + `app.listen(0)` (ephemeral port)
gives a real HTTP surface without any DB dependency. This matches the test tier specified in the
roadmap: "Integration — NestJS supertest".

The test file is placed under `tests/integration/nestjs/` (not under `tests/integration/db/`)
because it has no database dependency and requires no PGlite setup import.

### Decision 8 — `console.info` for the HTTP server start log (not `ILogger`)

`ILogger` is an application-layer port injected via NestJS DI. The server-start event occurs
at bootstrap time, before the DI container is fully available to `init.server.tsx`. Using
`console.info` with a structured object literal matches the existing pattern in `init.server.tsx`
(e.g. `console.log("init.serve.tsx:init")`). Switching to a proper structured logger is deferred
to a later intent that wires up the concrete `ILogger` adapter.

## TypeScript Types and Interfaces

No new exported types are required. The existing `DomainError` hierarchy from
`app/shared/errors/DomainError.ts` and the `ErrorResponse` shape (documented in ADR-003, not
currently a TypeScript type in the codebase) are sufficient.

The filter's return value conforms to this inline shape (no separate interface file is added;
the shape is defined inline in the filter as a `const response` object):

```typescript
{
  success: false,
  error: {
    code: string,       // err.code for DomainError; "INTERNAL_ERROR" for unknown
    message: string,    // err.message for DomainError; safe generic for unknown
    details?: unknown,  // err.context for DomainError; omitted for unknown
    traceId: string,    // crypto.randomUUID()
    timestamp: string,  // new Date().toISOString()
  }
}
```

## Risks / Trade-offs

- **Port conflict** — If `API_PORT=3001` is already bound, the HTTP app bootstrap will throw.
  Mitigation: the bootstrap error is caught and re-thrown with a clear message; `httpBootstrapPromise`
  is reset so the next request retries. Operators must configure a free port.

- **Two bootstrap paths** — `initServer()` now starts two NestJS instances from the same module.
  Both share the same provider instances only if NestJS module scope is `DEFAULT` (singleton).
  Providers registered as `REQUEST` scope would get separate instances — there are none at this
  stage. This is acceptable for now; a future intent that adds request-scoped providers must
  revisit whether sharing `CoreModule` between both instances is still correct.

- **HTTP server shutdown in `endServer()`** — `endServer()` is now `async` and calls
  `httpApp.close()` before `endDB()`, ensuring the HTTP listener is released before the Drizzle
  pool closes. Full SIGTERM handling (process signal wiring) is deferred to a hardening intent.

- **Lazy bootstrap — port 3001 is not bound until the first request to port 3000** — `initServer()`
  is called as a side effect inside `entry.server.tsx`, which is a lazy SSR chunk evaluated only
  when `react-router-serve` handles its first request. Consequence: if an API client (mobile app,
  health check, integration) hits port 3001 before any browser request has warmed port 3000, it
  receives a connection refused rather than an error response. This is acceptable for the pilot
  (authenticated browser users always precede API calls in the pilot workflow), but is a
  **production blocker for headless API consumers**. Mitigation deferred to a dedicated hardening
  intent (`feature/ca-eager-server-bootstrap`) that introduces a custom React Router server entry
  (`server.ts`) calling `initServer()` eagerly at process startup — the same intent that will wire
  up SIGTERM graceful shutdown.

## Migration Plan

1. Merge this change on `feature/ca-nestjs-http-server`.
2. Add `API_PORT=3001` to `example.env` with a comment.
3. Verify with `curl http://localhost:3001/api/v2` — expected 404 with `{ "success": false, "error": { "code": "HTTP_ERROR", ... } }` (no routes yet; DomainErrorFilter wraps the NestJS NotFoundException in the ADR-003 envelope).
4. No DB migration required; no `yarn dbsync` needed.
5. Rollback: revert the three file changes; the Remix process is unaffected.

## Open Questions

- None outstanding. The ADR-003 `ErrorResponse` shape is settled. The `APP_FILTER` pattern is
  the NestJS standard. Port configuration via `process.env.API_PORT` is consistent with the
  existing `initDB()` pattern for env-var-driven config.
