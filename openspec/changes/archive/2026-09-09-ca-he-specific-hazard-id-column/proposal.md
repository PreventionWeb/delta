## Why

`2b` added `specific_hazard` (CA-owned, keyed by `hazard_cluster`) but nothing on the legacy
`hazardous_event` table points at it yet — every hazardous event today is only classified through
the old `hip_hazard_id`/`hip_cluster_id`/`hip_type_id` chain. The ER diagram's edge
`KqZPbQY2Lv0Ew4p42Cft-108` (`specific_hazard.id` → `hazardous_event.specific_hazard_id`,
`ERoneToMany`) models the new classification path. `hazardous_event` itself is not CA-migrated
yet, so this intent adds one nullable FK column directly to the existing legacy schema file —
additive only, per Invariant 2 — rather than creating a new table. `2j` (four unrelated columns on
the same table) is out of scope here.

## What Changes

- Add `specific_hazard_id` (uuid, nullable) to the existing `hazardous_event` table, FK →
  `specific_hazard.id`. Nullable because existing rows have no value until Phase M's backfill
  runs — `NOT NULL` would break the migration immediately, before that backfill exists.
- No `ON DELETE` clause (Postgres default RESTRICT) — `specific_hazard` is reference/taxonomy data,
  same tier as `hip_hazard`/`hip_cluster`/`hip_type`, none of which cascade on this table either.
- No explicit constraint name in the TypeScript schema — matches this file's own existing
  `hipHazardId`/`hipClusterId`/`hipTypeId` columns, which all rely on Drizzle's auto-generated FK
  name rather than an explicit one (a deliberate departure from every `2b`-`2h` table, which name
  every constraint explicitly — see design.md Decision 4 for why the departure is correct here).
- No index on the new column — deliberate, not an oversight; matches this same table's existing
  `hip_hazard_id`/`hip_cluster_id`/`hip_type_id` precedent (none indexed, including the `NOT NULL`
  one), and nothing in Phase 2's scope queries `hazardous_event` by `specific_hazard_id` yet (see
  design.md Decision 6).
- Add a `specificHazard: one(specificHazardTable, ...)` entry to the existing `hazardousEventRel`
  relations block, matching the sibling `hipHazard`/`hipCluster`/`hipType` entries already there.
- Add a `specificHazardId` entry to the existing `hazardousEventTableConstraits` object, matching
  its existing style — this object is a live consumer (`checkConstraintError`, used by
  `app/backend.server/models/event.ts` and `event/hazardous_event_create_update.ts`), not dead
  documentation; see design.md Decision 5 for what adding this entry does and does not do.
- Hand-author a single-statement migration and register it in
  `app/drizzle/migrations/meta/_journal.json`.
- Update the hand-duplicated PGlite mirror `tests/integration/db/testSchema/hazardousEventTable.ts`
  to carry the same column and relation — this file is **not** a re-export of the legacy schema
  (unlike `tests/integration/db/testSchema/specificHazardTable.ts`, which is), so the new column
  does not arrive there automatically; see design.md Decision 7.

No route, model, handler, or `fieldsDef` changes — pure schema addition, same scope as `2b`-`2h`.

## Capabilities

### New Capabilities

- `hazardous-event-specific-hazard-schema`: the `specific_hazard_id` FK column and its constraint
  behavior on the existing `hazardous_event` table. New capability because no prior OpenSpec
  capability specs the legacy `hazardous_event` table's own shape (it predates this workflow); this
  spec covers only the one column being added, not the whole table.

### Modified Capabilities

None — `hazardous_event` itself has no existing capability spec to modify.

## Impact

**Files:**

- `app/drizzle/schema/hazardousEventTable.ts` (modified — add column, relation entry, constraint
  object entry)
- `app/drizzle/migrations/<timestamp>_add_specific_hazard_id_to_hazardous_event.sql` (new,
  hand-authored, single statement)
- `app/drizzle/migrations/meta/_journal.json` (new entry, idx 54)
- `tests/integration/db/testSchema/hazardousEventTable.ts` (modified — mirror the same column and
  relation; this file duplicates the legacy schema rather than re-exporting it, so it does not
  update automatically)
- `tests/integration/db/queries/hazardousEventSpecificHazard.test.ts` (new)

**DB migration required:** yes — one `ALTER TABLE "hazardous_event" ADD COLUMN "specific_hazard_id"
uuid CONSTRAINT "hazardous_event_specific_hazard_id_specific_hazard_id_fk" REFERENCES
"specific_hazard"("id")` statement, empirically verified against the live dev DB (in a rolled-back
transaction) to be valid single-statement Postgres syntax — no second `ADD CONSTRAINT` statement
and no `--> statement-breakpoint` needed. Applied via `yarn dbsync` (never `drizzle-kit push`).

**Test approach:** PGlite (`yarn test:run2`) — schema/constraint verification only, no route or
domain logic involved.

**Multi-tenancy:** `specific_hazard` carries no `country_accounts_id` (confirmed via `\d
specific_hazard` against the live dev DB) — it is global reference/taxonomy data, same tier as
`hip_hazard`/`hip_cluster`/`hip_type`. This change adds no new query path against
`hazardous_event`, so no new tenant-scoping surface is introduced.

**Security:** none directly — pure schema, no route/auth surface touched. The FK from the legacy
`hazardousEventTable.ts` into `2b`'s domain-owned `specificHazardTable.ts` is a cross-package
reference in the opposite direction from `2c`-`2h`'s pattern (those referenced *into* the legacy
table; this one is the legacy table referencing *out* to domain infrastructure) — same narrow,
necessary exception category, not a new access path. Verified no import cycle:
`specificHazardTable` → `hazardClusterTable` → `hazardTypeTable`, none of which reference back to
`hazardousEventTable`.
