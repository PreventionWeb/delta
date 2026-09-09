## Why

The target ER diagram (`tmp/hazardous-events-er-diagram/hazardous-events.drawio`, `hazardous_event`
table) models two nullable text columns — `specific_hazard_local_name`
(`KqZPbQY2Lv0Ew4p42Cft-15`) and `specific_hazard_national_name` (`KqZPbQY2Lv0Ew4p42Cft-18`) — that
do not yet exist on the live `hazardous_event` table. `2j`'s roadmap text (written from a paraphrased
diagram summary, not actual code/DB inspection — the same root cause `2i`'s proposal already
documented) also listed `nationalSpecification` and `status` as columns to add here. A readiness
check against the live dev DB, empirically re-verified in this proposal (`docker exec ... psql -d
dts_development -c '\d hazardous_event'`), found both already exist under different names/forms:

- `national_specification` (text, `NOT NULL`, default `''`) is already present — adding it again
  would either collide or require dropping/redefining an existing column, neither of which is in
  scope. Reconciling its nullability/default is explicitly deferred to Phase 7e (see
  `hazardous-events-phase0-audit-findings.md` action item 9).
- The diagram's "Ongoing/Passed" lifecycle concept is already implemented by the existing,
  genuinely-live `hazardous_event_status` column (nullable enum `forecasted`/`ongoing`/`passed`,
  confirmed wired into `app/frontend/events/hazardevent-filters.tsx` and
  `app/frontend/events/hazardeventform.tsx`). A plain `status` column already exists too (text,
  `NOT NULL`, default `'pending'`) and is unrelated to the lifecycle concept — a new column literally
  named `status` would collide with it. Reconciling all three status-shaped columns
  (`status`/`hazardous_event_status`/`approvalStatus`) is deferred to Phase 7e, not this intent.

This proposal's scope is therefore narrowed to exactly the two columns confirmed absent from the
live table: `specific_hazard_local_name` and `specific_hazard_national_name`.

## What Changes

- Add `specificHazardLocalName` (SQL `specific_hazard_local_name`, `text`, nullable) to the existing
  `hazardousEventTable` in `app/drizzle/schema/hazardousEventTable.ts`.
- Add `specificHazardNationalName` (SQL `specific_hazard_national_name`, `text`, nullable) to the
  same file.
- Both are plain nullable text columns — no FK, no enum, no `CHECK` constraint, no default, no
  relation entry, no `hazardousEventTableConstraits` entry (that object is for FK constraint names
  only; neither column is a foreign key).
- Hand-author a single-statement migration and register it in
  `app/drizzle/migrations/meta/_journal.json`, following the same-table `2i` precedent
  (`20260909090000_add_specific_hazard_id_to_hazardous_event`).
- Update the hand-duplicated PGlite mirror `tests/integration/db/testSchema/hazardousEventTable.ts`
  with the same two columns — confirmed (again, matching `2i`'s finding) that this file is a full
  hand copy of the legacy schema, not a re-export, so the columns do not arrive there automatically.

No route, model, handler, or `fieldsDef` changes — pure schema addition, same scope class as `2b`-`2h`
and `2i`.

## Capabilities

### New Capabilities

- `hazardous-event-specific-hazard-names-schema`: the `specific_hazard_local_name` and
  `specific_hazard_national_name` nullable text columns on the existing `hazardous_event` table. New
  capability because no prior OpenSpec capability specs the legacy `hazardous_event` table's own
  shape (it predates this workflow, same as `2i`'s
  `hazardous-event-specific-hazard-schema`); this spec covers only the two columns being added.

### Modified Capabilities

None — `hazardous_event` itself has no existing capability spec to modify, and
`hazardous-event-specific-hazard-schema` (from `2i`) is a distinct, unrelated column.

## Impact

**Files:**

- `app/drizzle/schema/hazardousEventTable.ts` (modified — add two nullable text columns only, no
  relation or constraint-object change)
- `app/drizzle/migrations/<timestamp>_add_specific_hazard_names_to_hazardous_event.sql` (new,
  hand-authored)
- `app/drizzle/migrations/meta/_journal.json` (new entry, idx 55)
- `tests/integration/db/testSchema/hazardousEventTable.ts` (modified — hand-sync the same two
  columns; hand duplicate, not a re-export)
- `tests/integration/db/queries/hazardousEventSpecificHazardNames.test.ts` (new — see design.md
  Decision 6 for why this is a new file rather than folding into `2i`'s
  `hazardousEventSpecificHazard.test.ts`)

**DB migration required:** yes — empirically verified in this proposal (rolled-back transaction
against the live dev DB, `dts_development`) that Postgres accepts multiple `ADD COLUMN` clauses in
one comma-separated top-level `ALTER TABLE` statement:

```sql
ALTER TABLE "hazardous_event"
  ADD COLUMN "specific_hazard_local_name" text,
  ADD COLUMN "specific_hazard_national_name" text;
```

No `--> statement-breakpoint` is needed — this is one top-level statement. Applied via
`yarn dbsync` (never `drizzle-kit push`).

**Test approach:** PGlite (`yarn test:run2`) — schema-level column verification only, no route or
domain logic involved.

**Multi-tenancy:** no change — both columns are plain per-row text fields on the existing
tenant-scoped `hazardous_event` table (scoped via its existing `country_accounts_id`); this change
introduces no new query path and no new tenant-scoping surface.

**Security:** none — pure additive schema change, no route/auth surface touched, no FK (so no
cross-package reference direction question, unlike `2i`'s `specific_hazard_id`).
