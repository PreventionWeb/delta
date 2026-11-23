# e2e-database-safety Specification

## Purpose

Prevent Playwright E2E database setup and teardown hooks from ever targeting, terminating sessions on, or dropping a non-test or live database.

## Requirements

### Requirement: Dedicated Playwright database variable with no fallback to DATABASE_URL

The `resolvePlaywrightDatabaseConfig` helper in `tests/e2e/helpers/e2eDbGuard.ts` SHALL read only `PLAYWRIGHT_DATABASE_URL` and MUST NOT fall back to `DATABASE_URL`. When `PLAYWRIGHT_DATABASE_URL` is missing or empty, setup and teardown MUST throw immediately without connecting to PostgreSQL.

#### Scenario: Missing PLAYWRIGHT_DATABASE_URL fails fast even when DATABASE_URL is set

- **GIVEN** `process.env.DATABASE_URL` is set to `"postgresql://postgres:postgres@localhost:5432/unog_training"` and `PLAYWRIGHT_DATABASE_URL` is unset
- **WHEN** `resolvePlaywrightDatabaseConfig` is called
- **THEN** it MUST throw an error stating that `PLAYWRIGHT_DATABASE_URL` is required in `.env.playwright`
- **AND** it MUST NOT return or connect to `unog_training`

### Requirement: Strict test-only database name and identifier validation

The `resolvePlaywrightDatabaseConfig` helper SHALL require the target database name to match `/^[a-zA-Z0-9_]+_(test|e2e|playwright)$/`. Any database name that does not end with `_test`, `_e2e`, or `_playwright`, or contains non-identifier characters, MUST be rejected before any SQL statement executes.

#### Scenario: Live or non-test database name is rejected

- **GIVEN** `PLAYWRIGHT_DATABASE_URL` points to `"postgresql://postgres:postgres@localhost:5432/unog_training"`
- **WHEN** `resolvePlaywrightDatabaseConfig` is called
- **THEN** it MUST throw an error refusing destructive operations on non-test database `"unog_training"`

#### Scenario: Valid test database name is accepted

- **GIVEN** `PLAYWRIGHT_DATABASE_URL` points to `"postgresql://postgres:postgres@localhost:5432/delta_e2e"`
- **WHEN** `resolvePlaywrightDatabaseConfig` is called
- **THEN** it MUST return the parsed connection details and validated `dbName` `"delta_e2e"`

#### Scenario: Unsafe SQL identifier characters in database name are rejected

- **GIVEN** `PLAYWRIGHT_DATABASE_URL` has database name `"delta_e2e; DROP DATABASE prod--"`
- **WHEN** `resolvePlaywrightDatabaseConfig` is called
- **THEN** it MUST throw an invalid database identifier error

### Requirement: Teardown drops database only when setup created it

`tests/e2e/global.setup.ts` SHALL write a setup marker containing the validated `dbName` only after `CREATE DATABASE` succeeds. `tests/e2e/global.teardown.ts` SHALL verify the marker exists and matches the target `dbName` before calling `pg_terminate_backend` or `DROP DATABASE`, and SHALL remove the marker afterward.

#### Scenario: Teardown skips dropping database when setup failed before creation

- **GIVEN** `global.setup.ts` failed before creating the database and no setup marker exists
- **WHEN** `global.teardown.ts` runs
- **THEN** it MUST NOT execute `pg_terminate_backend` or `DROP DATABASE`

#### Scenario: Teardown drops database and removes marker when setup succeeded

- **GIVEN** `global.setup.ts` created `"delta_e2e"` and wrote the matching setup marker
- **WHEN** `global.teardown.ts` runs for `"delta_e2e"`
- **THEN** it MUST terminate sessions on `"delta_e2e"`, drop `"delta_e2e"`, and remove the setup marker
