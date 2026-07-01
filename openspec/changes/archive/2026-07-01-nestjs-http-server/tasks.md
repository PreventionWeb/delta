## 0. Pre-requisite — Install Express HTTP Adapter

- [x] 0.1 Install the NestJS Express platform adapter (required for `NestFactory.create()` — absent from package.json; `createApplicationContext` used in 3b did not need it):
  ```bash
  yarn add @nestjs/platform-express
  ```
- [x] 0.2 Confirm `@nestjs/platform-express` appears in `package.json` dependencies and `yarn.lock` is updated.

## 1. Red Phase — Write Failing Tests for DomainErrorFilter

- [x] 1.1 Create `tests/integration/nestjs/DomainErrorFilter.test.ts` with a minimal
      `TestModule` containing a stub `@Controller('/test')` that exposes one GET endpoint per
      `DomainError` subtype (throws `NotFoundError`, `ValidationError`, `AuthorizationError`,
      `ConflictError` on request) plus one endpoint that throws a plain `Error`. Register
      `DomainErrorFilter` as a global filter via `APP_FILTER` in the test module. Use
      `Test.createTestingModule`, compile, create a full NestJS HTTP application via
      `moduleRef.createNestApplication()`, call `app.listen(0)` for an ephemeral port, then
      use `supertest(app.getHttpServer())` to make requests. Do NOT import `./setup` — this
      test has no DB dependency.

- [x] 1.2 Write the following test scenarios (all FAILING at this point — filter does not exist yet):
  - `NotFoundError` → status 404, body `{ success: false, error: { code: "NOT_FOUND", ... } }`
  - `ValidationError` → status 422, body `{ success: false, error: { code: "VALIDATION_ERROR", ... } }`
  - `AuthorizationError` → status 403, body `{ success: false, error: { code: "FORBIDDEN", ... } }`
  - `ConflictError` → status 409, body `{ success: false, error: { code: "CONFLICT", ... } }`
  - `NotFoundError` with context → response body includes `error.details`
  - `ValidationError` without context → response body does NOT include `error.details`
  - Any `DomainError` → `error.traceId` matches UUID pattern `/^[0-9a-f-]{36}$/i`
  - Any `DomainError` → `error.timestamp` is a valid ISO 8601 date string
  - Unknown `Error` → status 500, body `{ success: false, error: { code: "INTERNAL_ERROR", ... } }`
  - Unknown `Error` → response body does NOT contain the original error message or stack trace
  - Two concurrent requests → `traceId` values are distinct (send two requests in parallel, assert `traceId` inequality)

- [x] 1.3 Confirm tests are red: `yarn vitest run tests/integration/nestjs/DomainErrorFilter.test.ts`
      (all assertions fail or the import fails because `DomainErrorFilter.server.ts` does not exist yet)

## 2. Red Phase — Write Failing Tests for HTTP Server Bootstrap

- [x] 2.1 Create `tests/integration/nestjs/HttpServerBootstrap.test.ts`. Import `initServer` from
      `~/init.server` and spy on `NestFactory.create`. Verify that after `initServer()` resolves,
      the `NestFactory.create` spy was called with `CoreModule` and that `app.setGlobalPrefix('/api/v2')`
      and `app.listen` were invoked. Use `vi.mock('@nestjs/core', ...)` to avoid a real HTTP port
      binding in tests. Assert the concurrent-call guard: call `initServer()` twice in parallel and
      verify `NestFactory.create` was called exactly once for the HTTP app.

- [x] 2.2 Confirm those tests are red: `yarn vitest run tests/integration/nestjs/HttpServerBootstrap.test.ts`

## 3. Green Phase — Implement DomainErrorFilter

- [x] 3.1 Create `app/infrastructure/DomainErrorFilter.server.ts`. Decorate with `@Catch()` (catch-all).
      Implement `ExceptionFilter<unknown>` from `@nestjs/common`. In `catch(exception, host)`:
  - Use `host.switchToHttp()` to get the response object.
  - If `exception instanceof DomainError`: set status to `exception.statusHint`, build the
    `ErrorResponse` body with `code = exception.code`, `message = exception.message`,
    `details = exception.context` (omit if `undefined`), `traceId = crypto.randomUUID()`,
    `timestamp = new Date().toISOString()`. Set `success: false`.
  - Otherwise (unknown exception): set status 500, code `"INTERNAL_ERROR"`, message
    `"An unexpected error occurred. Please try again later."`, include `traceId` and `timestamp`.
    Do NOT include the original error message or stack.
  - Use `response.status(status).json(body)` to write the response.

- [x] 3.2 Run `yarn vitest run tests/integration/nestjs/DomainErrorFilter.test.ts` — all tests MUST pass GREEN.

## 4. Green Phase — Register DomainErrorFilter as APP_FILTER in CoreModule

- [x] 4.1 Update `app/infrastructure/CoreModule.server.ts`: import `APP_FILTER` from `@nestjs/core`
      and `DomainErrorFilter` from `./DomainErrorFilter.server`. Add the following provider to the
      `providers` array:

  ```typescript
  { provide: APP_FILTER, useClass: DomainErrorFilter }
  ```

  Keep `DrizzleProvider` and all existing exports unchanged.

- [x] 4.2 Run `yarn vitest run tests/integration/nestjs/DomainErrorFilter.test.ts` — still GREEN.

## 5. Green Phase — Add HTTP Server Bootstrap to initServer()

- [x] 5.1 Confirm `@nestjs/platform-express` is present in `package.json` (installed in step 0.1) before editing — `NestFactory.create()` will fail at runtime without it.

- [x] 5.2 Update `app/init.server.tsx`:
  - Add module-level variables: `let httpApp: INestApplication | undefined` and
    `let httpBootstrapPromise: Promise<INestApplication> | undefined`.
  - Import `INestApplication` from `@nestjs/common`.
  - After `appContext = await bootstrapPromise`, add a guard block for `httpBootstrapPromise`
    that creates `NestFactory.create(CoreModule, { logger: false })`, calls
    `app.setGlobalPrefix('/api/v2')`, then `app.listen(apiPort)`, stores the result in
    `httpApp`, and emits a `console.info({ msg: 'NestJS HTTP server started', port: apiPort })`.
  - Derive `apiPort` from `process.env.API_PORT` parsed as an integer, defaulting to 3001.
  - The `httpBootstrapPromise` guard MUST mirror the existing `bootstrapPromise` pattern:
    assign the Promise before awaiting it; reset to `undefined` on rejection so a retry is possible.
  - `getAppContext()` must remain unchanged.

- [x] 5.3 Add `API_PORT=3001` to `example.env` with the comment
      `# Port for the NestJS REST API HTTP server (default: 3001)`.

- [x] 5.4 Run `yarn vitest run tests/integration/nestjs/HttpServerBootstrap.test.ts` — all tests MUST pass GREEN.

## 6. Refactor

- [x] 6.1 Review `DomainErrorFilter.server.ts` for duplication and inline comments that explain WHY
      (not WHAT). Ensure `@Catch()` decoration rationale is documented (catch-all required to handle
      both `DomainError` and unknown exceptions from a single filter).
- [x] 6.2 Review `init.server.tsx` for comment accuracy — the existing doc comment describes
      application context only; update it to describe both bootstrap paths.
- [x] 6.3 Ensure the guard block in `init.server.tsx` for `httpBootstrapPromise` has a comment
      explaining why the Promise is assigned before being awaited (same concurrent-caller rationale
      as the existing `bootstrapPromise` comment).
- [x] 6.4 Run all tests again to confirm no regression was introduced by refactor:
      `yarn vitest run tests/integration/nestjs/DomainErrorFilter.test.ts` and
      `yarn vitest run tests/integration/nestjs/HttpServerBootstrap.test.ts`

## 7. Quality Gates

- [x] 7.1 **Gate 1 — Tests green:** `yarn vitest run tests/integration/nestjs/DomainErrorFilter.test.ts`
      passes. `yarn vitest run tests/integration/nestjs/HttpServerBootstrap.test.ts` passes.

- [x] 7.2 **Gate 2 — TypeScript:** `yarn tsc` reports zero errors.

- [x] 7.3 **Gate 3 — Formatting:** `yarn format:check` reports no violations. Run `yarn format` if
      any are found, then re-check.

- [x] 7.4 **Gate 4 — Anti-pattern review:** Open `.github/skills/anti-pattern-check/SKILL.md` and
      verify none of the listed anti-patterns appear in the three changed/created files
      (`DomainErrorFilter.server.ts`, `CoreModule.server.ts`, `init.server.tsx`).

- [x] 7.5 **Gate 5 — SOLID review:** Invoke the `solid-reviewer` agent on the three changed files.
      Resolve any SRP or DIP violations before proceeding.

- [x] 7.6 **Gate 6 — Documentation review:** Confirm all comments in the changed files explain WHY
      the code is written the way it is, not WHAT it does. Confirm no comment is a line-for-line
      paraphrase of the code it annotates.

- [x] 7.7 **Gate 7 — Project conventions review:** Open `.github/copilot-instructions.md` and verify
      the changed files conform to all listed conventions (`.server.ts` suffix for server-only files,
      `~/*` path aliases, no `as any` casts, no bare string injection tokens, Prettier formatting).

- [x] 7.8 **Gate 8 — Code review:** Run the `code-review` skill in full on all changed and created
      files on this branch. Address every issue flagged before moving on.

## 8. Post-Review Gap Fixes (code review W1–W3 + W5)

These tasks were identified during the post-implementation code review and MUST be completed
before the quality gates below are re-run.

- [x] 8.1 **W1 — Explicit APP_FILTER global-registration test** — In
      `tests/integration/nestjs/DomainErrorFilter.test.ts`, add a dedicated `it()` block that
      creates a second stub controller inside a separate nested `@Module` (no filter decorator on
      the controller or the module) imported by the `TestModule`, has that controller throw a
      `NotFoundError`, and asserts the response is 404 with the correct `ErrorResponse` shape.
      This verifies `APP_FILTER` propagates to controllers in nested modules — a change from
      `APP_FILTER` to `useGlobalFilters()` would break this test.

- [x] 8.2 **W2 — Explicit getAppContext() post-bootstrap test** — In
      `tests/integration/nestjs/HttpServerBootstrap.test.ts`, add a dedicated `it()` block that
      calls `initServer()` then `getAppContext()` and asserts it does not throw. Use the same
      `vi.mock('@nestjs/core', ...)` mock pattern already in the file. This guards against
      `bootstrapHttpServer()` accidentally overwriting the `appContext` singleton.

- [x] 8.3 **W3 — Explicit console.info structured-log test** — In
      `tests/integration/nestjs/HttpServerBootstrap.test.ts`, add a dedicated `it()` block that
      spies on `console.info` before calling `initServer()`, then asserts it was called with an
      object containing both a `msg` field (string describing server start) and a `port` field
      (number equal to the configured `API_PORT`). Restore the spy after.

- [x] 8.4 **W5 — Verify endServer() race guard and JSDoc** — Confirm that
      `app/init.server.tsx` `endServer()` now awaits `httpBootstrapPromise` before reading
      `httpApp` (added in this review pass) and has the JSDoc warning that it must be awaited.
      Run `yarn tsc` — still zero errors.

- [x] 8.4b **Runtime fix — HttpException branch in DomainErrorFilter** — The filter now has a
  third branch: `exception instanceof HttpException` passes through the framework's own status
  code wrapped in the ADR-003 envelope with `code: "HTTP_ERROR"`. Update the existing test that
  asserted `NotFoundException → 500 INTERNAL_ERROR` to now assert `NotFoundException → 404 HTTP_ERROR`.

- [x] 8.5 Run both test files after the additions:
      `yarn vitest run tests/integration/nestjs/DomainErrorFilter.test.ts` — GREEN.
      `yarn vitest run tests/integration/nestjs/HttpServerBootstrap.test.ts` — GREEN.

## 9. Full Quality Gate Re-run

- [x] 9.1 **Gate 1 — Tests green:** Both integration test files pass with the new tests added.
- [x] 9.2 **Gate 2 — TypeScript:** `yarn tsc` zero errors.
- [x] 9.3 **Gate 3 — Formatting:** `yarn format:check` reports no violations in changed files (268 pre-existing repo-wide violations remain unchanged).
- [x] 9.4 **Gate 4 — Regression:** `yarn test:run2` — 3 pre-existing failures only; zero new failures introduced by this change.

## 10. Archive and PR

- [x] 10.1 **Archive:** Run `/opsx:archive` on `feature/ca-nestjs-http-server`. Tick every checkbox
      in this `tasks.md` (including this one) before running the archive command.

- [x] 10.2 **PR:** Raise a PR from `feature/ca-nestjs-http-server` targeting `dev`. PR title:
      `Feature: NestJS HTTP server bootstrap + DomainErrorFilter (3c)`. Include a link to the
      OpenSpec change directory in the PR description.
