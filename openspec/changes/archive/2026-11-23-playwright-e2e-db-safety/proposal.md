# Proposal

## Why

Running `yarn test:e2e` without a `.env.playwright` file inside a development environment (such as the local Docker app container) silently falls back to the container's live `DATABASE_URL` and causes `tests/e2e/global.teardown.ts` to terminate active connections and execute `DROP DATABASE IF EXISTS <live_db>` even when `global.setup.ts` fails. This can destroy a developer's local database without warning.

**UI classification**: `non-visual`

**Security-sensitive change**: No (test infrastructure only; does not modify application auth or tenant scoping, though it prevents destructive database drops in local/CI environments).

**Database migration required**: No.

## What Changes

- **Fail-fast `.env.playwright` loading with override**: Update `playwright.config.ts` to load `.env.playwright` explicitly with `{ override: true }` (or require `PLAYWRIGHT_DATABASE_URL`) so a pre-existing `DATABASE_URL` from the shell or Docker container can never silently leak into Playwright E2E runs.
- **Dedicated E2E database variable & strict test-DB name guard**: Add a pure, unit-tested helper `tests/e2e/helpers/e2eDbGuard.ts` used by `tests/e2e/global.setup.ts` and `tests/e2e/global.teardown.ts` that:
  - Requires `PLAYWRIGHT_DATABASE_URL` (never falling back to `DATABASE_URL`).
  - Validates the target database name against a strict test-only suffix pattern (`/^[a-zA-Z0-9_]+_(test|e2e|playwright)$/`), refusing any `pg_terminate_backend` or `DROP DATABASE` on non-test database names and rejecting SQL-unsafe identifiers.
  - Passes `DATABASE_URL` to Playwright's `webServer.env` from the validated `PLAYWRIGHT_DATABASE_URL` so the dev server launched by Playwright talks exclusively to the isolated E2E database.
- **Teardown creation marker**: Record a temporary marker file only after `global.setup.ts` successfully creates the E2E database; `global.teardown.ts` MUST skip `pg_terminate_backend` and `DROP DATABASE` if that marker is absent (preventing teardown from dropping an untouched database after a failed setup).
- **Documentation & gitignore**: Add a dedicated `example.env.playwright` template documenting `PLAYWRIGHT_DATABASE_URL` and add `.env.playwright` explicitly to `.gitignore`.

## Capabilities

### New Capabilities
- `e2e-database-safety`: Fail-fast environment isolation, test-database naming guardrails, and setup-marker verification preventing Playwright E2E setup/teardown from dropping non-test or live databases.

### Modified Capabilities
- None.

## Impact

### Files expected to change

| File | Reason |
|---|---|
| `tests/e2e/helpers/e2eDbGuard.ts` | Pure validation helper for `PLAYWRIGHT_DATABASE_URL`, safe test DB suffix check, and setup marker lifecycle |
| `playwright.config.ts` | Load `.env.playwright` with `{ override: true }` and wire `webServer.env.DATABASE_URL` from `PLAYWRIGHT_DATABASE_URL` |
| `tests/e2e/global.setup.ts` | Validate `PLAYWRIGHT_DATABASE_URL` via `e2eDbGuard`, quote identifier safely, and write setup marker on success |
| `tests/e2e/global.teardown.ts` | Validate `PLAYWRIGHT_DATABASE_URL` via `e2eDbGuard`, require setup marker before terminating connections or dropping DB, and clean up marker |
| `example.env.playwright` | Dedicated template documenting `PLAYWRIGHT_DATABASE_URL` for E2E DB isolation |
| `.gitignore` | Explicitly ignore `.env.playwright` alongside `.env.local` |
| `tests/unit/e2e/e2eDbGuard.test.ts` | Vitest unit tests covering missing env, live DB rejection, SQL-unsafe names, valid test DB names, and teardown marker gating |

### Test approach

- **Unit (`yarn test:run2`)**: Fast Vitest unit tests in `tests/unit/e2e/e2eDbGuard.test.ts` verifying every guard condition (missing `PLAYWRIGHT_DATABASE_URL`, `DATABASE_URL` ignored, non-test names like `unog_training` or `delta` rejected, SQL injection characters rejected, valid `*_test`/`*_e2e`/`*_playwright` names accepted, and teardown skipped when setup marker is missing).
