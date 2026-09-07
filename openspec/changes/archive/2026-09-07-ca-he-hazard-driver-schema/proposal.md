## Why

No "driver" concept exists anywhere in this codebase's schema today (confirmed by
repo-wide grep). The target ER diagram
(`tmp/hazardous-events-er-diagram/hazardous-events.drawio`, "Hazard driver management"
swimlane, cells `KqZPbQY2Lv0Ew4p42Cft-172..222`) introduces a tenant-scoped `hazard_driver`
reference table plus a many-to-many join to `hazardous_event`. This intent adds both new
tables — a genuinely new business capability, not a reconciliation against an existing
table.

## What Changes

- Add `hazard_driver`, a tenant-scoped reference table (`id`, `name`, `country_accounts_id`
  cascade FK to `country_accounts`), matching the `.drawio` swimlane exactly.
- Add `hazardous_event_hazard_driver`, a join table (`id`, `hazardous_event_id`,
  `hazard_driver_id`, both FKs not-null cascade), linking `hazardous_event` rows to their
  drivers. No `country_accounts_id` on the join table — tenant scoping is inherited via
  `hazardous_event`.
- Add `createdAt`/`updatedAt` audit columns on both tables not present in the diagram — a
  deliberate, user-confirmed addition (see design.md Decision 1).
- Register a hand-authored migration + `_journal.json` entry (repo convention since `2a`).
- No existing table, column, route, model, or `fieldsDef` is touched — purely additive.

## Capabilities

### New Capabilities

- `hazard-driver-schema`: persisted shape and constraints of the tenant-scoped
  `hazard_driver` reference table and the `hazardous_event_hazard_driver` join table
  linking it to `hazardous_event`.

### Modified Capabilities

None.

## Impact

- **Files**:
  - `app/domains/hazardous-events/infrastructure/hazardDriverTable.ts` (new) — the
    tenant-scoped reference table.
  - `app/domains/hazardous-events/infrastructure/hazardousEventHazardDriverTable.ts`
    (new) — the join table, with one FK into the legacy
    `app/drizzle/schema/hazardousEventTable.ts` (see design.md Decision 6).
  - `app/drizzle/migrations/<timestamp>_add_hazard_driver_tables.sql` (new) —
    hand-authored migration, two `CREATE TABLE IF NOT EXISTS` statements separated by
    `--> statement-breakpoint`.
  - `app/drizzle/migrations/meta/_journal.json` (updated) — new migration entry.
  - `tests/integration/db/testSchema/hazardDriverTable.ts` (new) and
    `tests/integration/db/testSchema/hazardousEventHazardDriverTable.ts` (new) —
    re-export barrel entries for PGlite tests.
  - `tests/integration/db/testSchema/index.ts` (updated) — export both new barrel files.
  - `tests/integration/db/queries/hazardDriver.test.ts` (new) — PGlite tests.
- **DB migration**: required, `yarn dbsync`. Additive only (`CREATE TABLE` x2), no
  existing table altered, no data migration.
- **Test approach**: PGlite (`yarn test:run2`) for schema shape, not-null, and FK
  constraints (tenant scoping on `hazard_driver`, cascade delete on both tables, the
  join table's two-parent FK behaviour). No real-DB (`test:run3`) or E2E coverage needed
  — pure schema, no route/model wiring.
- **Multi-tenancy / security**: `hazard_driver` introduces tenant scoping
  (`country_accounts_id`, not null, cascade on delete). The join table has no tenant
  column of its own — scoping is inherited transitively via `hazardous_event_id` →
  `hazardous_event.country_accounts_id`, the same shape as any other child-of-a-tenant-
  scoped-parent join table in this schema. No route, loader, or action reads/writes
  either table in this intent, so no `authLoaderWithPerm`/`authActionWithPerm` wiring is
  needed yet.
- **Ownership note**: unlike `2b` (HIP hierarchy) and `2c` (source catalog), this data is
  HE-exclusive — confirmed via repo-wide grep, no "driver" concept exists anywhere else
  in the schema. Not flagged for future extraction (see design.md Decision 5).
