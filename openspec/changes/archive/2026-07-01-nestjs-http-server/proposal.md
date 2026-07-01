## Why

Task 3c of the Notices Pilot Roadmap: Phase 5 REST API endpoints (5c — Notices REST Controller)
cannot be built until a NestJS HTTP server is listening on a separate port alongside the existing
Remix SSR process. The DomainErrorFilter is also required now so that every future controller
inherits consistent error mapping without per-controller try/catch.

## What Changes

- `app/init.server.tsx` — add `NestFactory.create(CoreModule)` bootstrap on `process.env.API_PORT`
  (default 3001), guarded by the same single-bootstrap pattern already used for `applicationContext`;
  both the application context and the HTTP app are started together; Remix loaders are unaffected.
- `app/infrastructure/DomainErrorFilter.server.ts` (new) — NestJS `ExceptionFilter` that intercepts
  any `DomainError` subtype, maps `statusHint` → HTTP status code, and writes the `ErrorResponse`
  envelope (ADR-003) with `success: false`, `error.code`, `error.message`, `error.details`,
  `error.traceId`, and `error.timestamp`. Unknown exceptions fall through to a generic 500 response.
- `app/infrastructure/CoreModule.server.ts` — add `APP_FILTER` global provider binding
  `DomainErrorFilter` so it applies to every controller registered in the HTTP app.

No DB migration is required.

## Capabilities

### New Capabilities

- `nestjs-http-server-bootstrap`: NestJS HTTP server starts on `API_PORT` (default 3001) alongside
  the existing application context; global prefix `/api/v2` is set; the server logs a structured
  info event on successful start.
- `domain-error-filter`: Global NestJS exception filter that maps each `DomainError` subtype
  (`NotFoundError` → 404, `ValidationError` → 422, `AuthorizationError` → 403,
  `ConflictError` → 409) to the correct HTTP status code and `ErrorResponse` envelope including a
  `traceId` field; unhandled exceptions return a generic 500.

### Modified Capabilities

<!-- None — no existing spec-level behaviour changes. -->

## Impact

- **Files changed:** `app/init.server.tsx`, `app/infrastructure/CoreModule.server.ts`,
  `app/infrastructure/DomainErrorFilter.server.ts` (new).
- **Runtime ports:** The HTTP server binds to `API_PORT` (default 3001). The existing Remix Express
  server on port 3000 is unaffected.
- **Test approach:** NestJS supertest integration tests. `DomainErrorFilter` is tested via a minimal
  in-process HTTP app created with `Test.createTestingModule` + `app.listen(0)` (random ephemeral
  port) — no real DB required for the filter tests.
- **Security / multi-tenancy:** The HTTP server itself has no auth guard at this stage — individual
  controllers added in 5c will enforce auth. `DomainErrorFilter` must not leak internal error
  details or stack traces to the client; only `code`, `message`, `details` (from `DomainError.context`),
  `traceId`, and `timestamp` are returned. Unknown exceptions return a generic message only.
- **Dependencies:** One new production package — `@nestjs/platform-express` (the NestJS Express
  HTTP adapter, required by `NestFactory.create()`). `@nestjs/core`, `@nestjs/common`, and
  `@nestjs/testing` were installed in step 3a; `@nestjs/platform-express` was not and must be
  added in this change. `supertest` and `@types/supertest` are already in devDependencies and
  require no new install.
