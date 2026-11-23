# Design

## UI Design Governance Metadata

```yaml
ui-classification: non-visual

feature-prototype:
  repository: https://github.com/unisdr/delta-feature-prototypes
  path: n/a
  commit: n/a
  status: not-required
  exception-reason: Non-visual Playwright E2E test-harness database safety fix; no UI presentation or user interaction changes.
```

## Context

See `proposal.md` for motivation. Currently, `playwright.config.ts` calls `config({ path: ".env.playwright" })` without checking whether the file exists or passing `{ override: true }`. When `.env.playwright` is missing inside a Docker container whose `DATABASE_URL` points to a live local database (e.g. `unog_training`), `tests/e2e/global.setup.ts` and `tests/e2e/global.teardown.ts` both read `process.env.DATABASE_URL` directly. Even when `global.setup.ts` fails on active connections, Playwright still executes `global.teardown.ts`, which runs `pg_terminate_backend` and `DROP DATABASE IF EXISTS unog_training`.

## Goals / Non-Goals

**Goals:**
- Make it impossible for Playwright E2E setup/teardown to touch `DATABASE_URL` or drop any non-test database.
- Guarantee `global.teardown.ts` never drops a database that `global.setup.ts` did not create.
- Keep all guard logic pure and unit-tested under `yarn test:run2`.

**Non-Goals:**
- Changing production DB connection logic (`app/db.server.ts`) or PGlite tests (`tests/integration/db/setup.ts`).
- Adding or modifying Drizzle schemas or migrations.

## Decisions

### 1. Dedicated `PLAYWRIGHT_DATABASE_URL` + `.env.playwright` `{ override: true }`

- `playwright.config.ts` loads `.env.playwright` with `{ override: true }` so an already-exported shell/container variable cannot silently shadow `.env.playwright`.
- `global.setup.ts` and `global.teardown.ts` read **only** `PLAYWRIGHT_DATABASE_URL` via `resolvePlaywrightDatabaseConfig(process.env)` — never `DATABASE_URL`.
- `playwright.config.ts` passes `env: { ...process.env, DATABASE_URL: process.env.PLAYWRIGHT_DATABASE_URL ?? "" }` to `webServer` so the Playwright-launched React Router server uses the isolated E2E DB without needing to overwrite the developer's shell `DATABASE_URL`.

### 2. Strict Identifier & Test Suffix Guard (`tests/e2e/helpers/e2eDbGuard.ts`)

- Validate `dbName` with `/^[a-zA-Z0-9_]+_(test|e2e|playwright)$/`.
- Use parameterized query `$1` in `pg_terminate_backend` (`WHERE pg_stat_activity.datname = $1`) instead of string interpolation, and quote the validated identifier (`"${dbName}"`) in `DROP DATABASE` / `CREATE DATABASE`.

### 3. Setup Creation Marker File

- Store a small marker file in `os.tmpdir()` (e.g. `delta-playwright-db-created.json` containing `{ dbName, pid }`) written only after `CREATE DATABASE` succeeds in `global.setup.ts`.
- `global.teardown.ts` checks `hasCreatedDbMarker(dbName)` before terminating connections or dropping the database, and deletes the marker in `finally`.

### 4. TypeScript Types & Interfaces

- `tests/e2e/helpers/e2eDbGuard.ts`:
  - `export interface PlaywrightDbConfig { databaseUrl: string; dbName: string; host: string; port: number; user: string; password: string; }`
  - `export function resolvePlaywrightDatabaseConfig(env: NodeJS.ProcessEnv): PlaywrightDbConfig`
  - `export function writeDbCreatedMarker(dbName: string, markerPath?: string): void`
  - `export function hasDbCreatedMarker(dbName: string, markerPath?: string): boolean`
  - `export function clearDbCreatedMarker(markerPath?: string): void`

### 5. Database Schema, Form-CSV-API & Test Tier

- **Drizzle schema changes**: None.
- **Form-CSV-API `fieldsDef` impact**: None.
- **Test tier**: Pure Vitest unit tests (`yarn test:run2`) in `tests/unit/e2e/e2eDbGuard.test.ts` — no real PostgreSQL or PGlite needed because all URL parsing, regex validation, and tmpdir marker logic are pure functions.

## Risks / Trade-offs

- **Existing developers with `DATABASE_URL` in `.env.playwright`** -> Clear error message tells them to rename `DATABASE_URL` to `PLAYWRIGHT_DATABASE_URL` in `.env.playwright` and ensure the DB name ends with `_test`, `_e2e`, or `_playwright`.
