## Why

Today `hazardous_event`, `disaster_event`, and `disaster_records` each record their data
source as free text (`data_source` / `primary_data_source` / `other_data_source` on
`hazardousEventTable.ts`, `disasterEventTable.ts`, `disasterRecordsTable.ts`). The target
ER diagram introduces `source_catalog`, a tenant-scoped reference table, as the eventual
replacement. This intent adds the new table only — the free-text columns stay on all
three tables until Phase 7 (`app/domains/hazardous-events` fieldsDef/route rewiring is
out of scope here and for `2c` specifically).

## What Changes

- Add one new Drizzle table, `sourceCatalogTable.ts`, tenant-scoped via
  `country_accounts_id` (cascade delete), with `id` and `name` columns matching the
  `.drawio` "Source Catalog Management" swimlane exactly.
- Add `createdAt`/`updatedAt` audit columns not present in the diagram — a deliberate,
  user-confirmed addition (see design.md Decision 1).
- Register a hand-authored migration + `_journal.json` entry (repo convention since `2a`).
- No existing table, column, route, model, or `fieldsDef` is touched — purely additive.

## Capabilities

### New Capabilities

- `source-catalog-schema`: persisted shape and constraints of the tenant-scoped
  `source_catalog` reference table.

### Modified Capabilities

None.

## Impact

- **Files**:
  - `app/domains/hazardous-events/infrastructure/sourceCatalogTable.ts` (new) — the
    Drizzle table definition.
  - `app/drizzle/migrations/<timestamp>_add_source_catalog_table.sql` (new) —
    hand-authored migration, `CREATE TABLE IF NOT EXISTS`.
  - `app/drizzle/migrations/meta/_journal.json` (updated) — new migration entry.
  - `tests/integration/db/testSchema/sourceCatalogTable.ts` (new) — re-export barrel
    entry for PGlite tests (2b's pattern; not added to `app/drizzle/schema/index.ts` —
    see design.md Decision 3).
  - `tests/integration/db/testSchema/index.ts` (updated) — export the new barrel file.
  - `tests/integration/db/queries/sourceCatalog.test.ts` (new) — PGlite tests.
- **DB migration**: required, `yarn dbsync`. Additive only (`CREATE TABLE`), no data
  migration, no existing table altered.
- **Test approach**: PGlite (`yarn test:run2`) for schema shape, not-null, and FK
  constraints (tenant scoping + cascade delete). The hand-authored migration is verified
  separately by running `yarn dbsync` against a real local Postgres.
- **Multi-tenancy / security**: this table introduces tenant scoping
  (`country_accounts_id`, `NOT NULL`, cascade on delete) — a new consideration, since the
  table it eventually replaces (`data_source` free text) has none today. No route,
  loader, or action reads/writes this table in this intent, so no `authLoaderWithPerm`/
  `authActionWithPerm` wiring is needed yet.
- **Shared data note**: this table's data is genuinely shared with Disaster Event and
  Disaster Records (each has its own free-text data-source column today), not
  HE-exclusive — flagged for extraction once Disaster Events gets its own CA migration.
  See design.md Decision 4.
