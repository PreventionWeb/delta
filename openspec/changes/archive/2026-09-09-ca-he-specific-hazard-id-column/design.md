## Context

Target ER diagram (`tmp/hazardous-events-er-diagram/hazardous-events.drawio`), the `hazardous_event`
table, cell `KqZPbQY2Lv0Ew4p42Cft-12`, and edge `KqZPbQY2Lv0Ew4p42Cft-108`
(`specific_hazard.id` [one] → `hazardous_event.specific_hazard_id` [many], `ERoneToMany`). Already
verified against the raw XML and confirmed with the user prior to this proposal — not re-derived
here.

Direct precedents: `2b`'s `specificHazardTable.ts` (the FK target, already merged); this table's
own existing `hipHazardId`/`hipClusterId`/`hipTypeId` columns via
`hipRelationColumnsRequired()` in `app/utils/drizzleUtil.ts` (the naming-convention and
no-index precedent this intent follows); `2h`'s explicit-constraint-naming convention (the
convention this intent deliberately departs from, for reasons specific to this being the legacy
file rather than a new one).

## Goals / Non-Goals

**Goals:** one nullable, unindexed, RESTRICT-on-delete FK column on the existing `hazardous_event`
table; a matching relation entry; a matching `hazardousEventTableConstraits` entry; the PGlite test
mirror kept in sync since it is a hand duplicate, not a re-export; a single-statement hand-authored
migration.

**Non-Goals:** `nationalSpecification`/`hazardousEventStatus`/`status` columns (2j's concern, not
started); any domain-layer, use-case, repository, route, or model code; a query path that actually
reads/writes `specific_hazard_id` from a route (that arrives with whichever later phase builds the
UI against this column); an index (explicitly deferred — Decision 6).

## Decisions

**1. Exact column (from the `.drawio`, already confirmed with the user):** `specific_hazard_id`,
uuid, nullable (diagram shows an `FK` badge only, no `NN` badge). References `specific_hazard.id`
(uuid, `2b`'s `specificHazardTable`, `ourRandomUUID()` — type-compatible). Nullable is also the
only operationally viable choice: existing `hazardous_event` rows (25 in the current dev DB) have
no value for this column today and won't until Phase M's backfill runs; `NOT NULL` would break the
migration immediately.

**2. No cascade — RESTRICT (Postgres default, no `ON DELETE` clause).** `specific_hazard` is
reference/taxonomy data, same tier as `hip_hazard`/`hip_cluster`/`hip_type` on this same table
(all RESTRICT) and `hazard_type`/`hazard_cluster`/`field_data_type`/`field_unit` from `2b`/`2h`
(also all RESTRICT, per the same "shared reference data shouldn't be silently affected" reasoning).
Confirmed live: `specific_hazard`'s own FK to `hazard_cluster` (`specific_hazard_hazard_cluster_id_fk`)
is likewise plain RESTRICT with no `ON DELETE` clause — consistent with this tier throughout the
schema.

**3. Add the `specificHazard` relation entry.** Every sibling FK on `hazardousEventTable` — `event`,
`countryAccount`, `hipHazard`, `hipCluster`, `hipType`, three user relations — has a matching entry
in `hazardousEventRel`. Adding `specificHazard: one(specificHazardTable, { fields:
[hazardousEventTable.specificHazardId], references: [specificHazardTable.id] })` is genuinely
in-scope for this schema-only intent: it is zero additional DDL, it is required for consistency
within this one file (the stated tiebreaker throughout this table's existing columns), and skipping
it would leave the new FK as the only column on this table without a corresponding relation entry.

**4. Constraint naming — no explicit name in the TS schema; live-DB-verified name in the hand-
authored migration SQL.** This file's own `hipHazardId`/`hipClusterId`/`hipTypeId` columns
(`hipRelationColumnsRequired()`) all use bare `.references(() => someTable.id)` with no explicit
constraint name, relying on Drizzle's auto-generated name — a deliberate departure from every
`2b`-`2h` table, which explicitly names every constraint on their brand-new infra tables. That
newer convention does not apply here because this intent extends the pre-existing legacy file
rather than creating a new one; consistency within this one file outweighs consistency with the
newer infra convention. The TS schema still passes no explicit name for `specificHazardId`.

Queried the live dev DB directly (`pg_constraint` via `psql`, not the `hazardousEventTableConstraits`
object literal, per the brief's caution that the object could be stale) for the actual current FK
names on this table:

```
hazardous_event_hip_cluster_id_hip_cluster_id_fk    FOREIGN KEY (hip_cluster_id) REFERENCES hip_cluster(id)
hazardous_event_hip_hazard_id_hip_hazard_id_fk      FOREIGN KEY (hip_hazard_id) REFERENCES hip_hazard(id)
hazardous_event_hip_type_id_hip_class_id_fk         FOREIGN KEY (hip_type_id) REFERENCES hip_class(id)
```

The `hip_type_id → hip_class` row is the decisive evidence for the naming algorithm: `hip_type_id`
references `hip_class(id)` — a different table name from the column name — and the resulting
constraint name is `hazardous_event_hip_type_id_hip_class_id_fk`. This proves the algorithm is
`${table}_${column}_${foreignTable}_${foreignColumn}_fk` (segment 3 is the foreign *table* name,
not a repeat of the column name — the `hip_hazard`/`hip_cluster` rows are ambiguous on this point
because their column and table names happen to share a prefix, but `hip_type_id`/`hip_class` is
not). The live query also confirms `hazardousEventTableConstraits`'s existing three entries are
accurate, not stale, as written.

Applying the identical algorithm: `specific_hazard_id` references `specific_hazard(id)` →
**`hazardous_event_specific_hazard_id_specific_hazard_id_fk`** (56 bytes, byte-counted directly —
well under Postgres's 63-byte identifier limit, so no truncation risk that would diverge the
unnamed TS schema from the named migration SQL).

**5. `hazardousEventTableConstraits` entry — this object is a live consumer, not documentation.**
Grepped the codebase: `hazardousEventTableConstraits` is imported by
`app/backend.server/models/event.ts` and `app/backend.server/models/event/hazardous_event_create_update.ts`,
both of which pass it to `checkConstraintError(err, constraints)`
(`app/backend.server/models/common.ts`). That function matches a raised Postgres FK-violation's raw
`err.constraint` string against the object's values; on a match it returns a field-level error keyed
by the object's key (`errorForField(key, ...)`) instead of the generic
`"Database constraint failed: ..."` form-level error. This corrects the brief's framing ("if it's
genuinely unused, still fine to add for documentation consistency") — it is used, and adding
`specificHazardId: "hazardous_event_specific_hazard_id_specific_hazard_id_fk"` is a real behavioral
change to how a future FK violation on this column would surface, not an inert doc addition.

It is safe to add now because no route or model currently writes `specific_hazard_id` — the entry
is inert until a later phase adds a write path — but whoever adds that write path must also add a
matching `specificHazardId` form field key, or the mapped field-level error will point at a
nonexistent form field. No new consumer is invented here; this task only adds the object entry.

**6. No index on `specific_hazard_id` — deliberate, documented so a future reader does not "fix"
this as an oversight.** Postgres does not auto-index FK columns, and "index every FK" is not a
blanket rule — `2h`'s index-every-FK convention was justified there because those were small,
constantly-joined lookup/definition tables. Neither justification applies here: (a) `specific_hazard`
rows are rarely-deleted reference/taxonomy data, so there is no hot delete-path to protect against a
seq-scan; (b) nothing in Phase 2's scope queries `hazardous_event` by `specific_hazard_id` yet — an
index can be added once a later phase (3/4/5) builds a real query that filters/joins on it, justified
by that actual access pattern instead of speculatively now. This is also consistent with this exact
table's own existing precedent: `hip_hazard_id`/`hip_cluster_id`/`hip_type_id` have never been
indexed on `hazardous_event`, including `hip_type_id`, which is `NOT NULL` on every row.

**7. Test schema mirror — hand duplicate, not a re-export; must be updated explicitly.** Checked
`tests/integration/db/testSchema/hazardousEventTable.ts` directly: unlike
`tests/integration/db/testSchema/specificHazardTable.ts` (a genuine one-line re-export, `export *
from "~/domains/hazardous-events/infrastructure/specificHazardTable"`, because `2b`'s table lives
in the domain's own infrastructure), the `hazardousEventTable.ts` mirror is a full hand-duplicated
copy of the legacy schema file — same columns, same relations block, but with its own import paths
(`./countryAccounts` vs. the real file's `./countryAccountsTable`, `~/utils/drizzleUtil` vs. the
real file's relative `../../utils/drizzleUtil`). This is because the legacy table lives under
`app/drizzle/schema/`, outside the domain-owned infrastructure re-export pattern established for
`2b`-`2h`.

This means the brief's assumption ("if so, no barrel change needed, the new column arrives
automatically through the existing re-export") does not hold for this file — it is not a re-export.
The mirror must be edited by hand to add the identical `specificHazardId` column and
`specificHazard` relation entry, importing `specificHazardTable` from the sibling
`../testSchema/specificHazardTable` (itself a real re-export of `2b`'s table) — matching how this
same mirror already imports `hipHazardTable`/`hipClusterTable`/`hipTypeTable` from their own
`../testSchema/*` siblings rather than reaching into `app/drizzle/schema/` or
`app/domains/.../infrastructure/` directly. Without this edit, `dr` in PGlite tests would not see
the column at all and every scenario below would fail for the wrong reason (missing test-schema
column, not missing migration).

**8. Import-cycle check — verified, no cycle.** `.references(() => specificHazardTable.id)` forces
the import regardless of whether the relation entry is added. Traced the dependency chain:
`specificHazardTable.ts` imports `hazardClusterTable.ts`, which imports `hazardTypeTable.ts`; neither
imports anything from `app/drizzle/schema/hazardousEventTable.ts`. No cycle. This is the first edge
running from the legacy schema *into* domain-owned infrastructure (every prior `2c`-`2h` FK ran the
other direction, domain infrastructure referencing *into* the legacy table), so this check was worth
doing explicitly rather than assuming the existing pattern's safety transfers.

**9. Migration — single statement, empirically verified.** Tested directly against the live dev DB
(`dts_development`, inside a transaction, rolled back — no persisted side effect):

```sql
BEGIN;
ALTER TABLE "hazardous_event"
  ADD COLUMN "specific_hazard_id_test" uuid
  CONSTRAINT "hazardous_event_specific_hazard_id_test_fk"
  REFERENCES "specific_hazard"("id");
-- confirmed via pg_constraint: constraint created correctly, FK resolves
ROLLBACK;
```

This confirms Postgres's `ALTER TABLE ADD COLUMN` grammar accepts an inline named column
constraint (`CONSTRAINT constraint_name REFERENCES ...`) directly on the new column — no separate
`ALTER TABLE ... ADD CONSTRAINT` statement is required. The real migration is therefore exactly one
top-level statement:

```sql
ALTER TABLE "hazardous_event"
  ADD COLUMN "specific_hazard_id" uuid
  CONSTRAINT "hazardous_event_specific_hazard_id_specific_hazard_id_fk"
  REFERENCES "specific_hazard"("id");
```

Because this is a single statement, **no `--> statement-breakpoint` is needed or should be added**
— stating this explicitly so a future reader does not add one defensively out of habit from the
`2c`/`2e`/`2f`/`2g` multi-statement bug precedent, which does not apply here.

**10. Journal entry — pin the exact values.** Following the last entry
(`20260907170000_add_hazard_type_field_tables`, `idx` 53):

```json
{
  "idx": 54,
  "version": "7",
  "when": 1788944400000,
  "tag": "20260909090000_add_specific_hazard_id_to_hazardous_event",
  "breakpoints": true
}
```

(`when` computed as the UTC epoch-millisecond value for `2026-09-09T09:00:00Z`, matching this
project's existing tag/`when` correspondence convention.)

**11. Test tier and file — new `queries/` file, not folded into an existing `models/` file.**
Checked `tests/integration/db/models/hazardousEventCoreCrud.test.ts`: it exercises model-layer
functions (`validate`, `hazardousEventCreate`, `hazardousEventUpdate`, ...), not raw column/FK
behavior — folding schema-level FK/RESTRICT assertions in there would conflate model logic with
schema-layer verification. Matches the `2c`-`2h` precedent of a dedicated `queries/` file for
schema-only PGlite coverage: new file
`tests/integration/db/queries/hazardousEventSpecificHazard.test.ts`, reusing
`tests/integration/db/models/hazardousEventTestHelpers.ts`'s `seedHazardousEvent`/`baseFields`
seeding chain (a bare insert into `hazardous_event` fails without it: `id` FKs to `event`, and
`hip_type_id` is `NOT NULL`, requiring a seeded `hip_class` row via `seedHipChain`).

## Risks / Trade-offs

- [No index on `specific_hazard_id` (Decision 6)] → deliberate, not an oversight; documented above
  so a future reader doesn't "fix" it without a real query pattern to justify it.
- [Cross-package FK running from the legacy schema *into* domain infrastructure — the reverse
  direction from every prior `2c`-`2h` FK (Decision 8)] → verified no import cycle; this is the
  first edge in this direction and worth flagging for whoever migrates `hazardous_event` itself in
  a later CA phase, since the direction will need to invert (or be replaced) at that point. The
  roadmap's `7e` step (expanded 2026-09-09) now schedules this exact relocation —
  `app/drizzle/schema/hazardousEventTable.ts` moves into
  `app/domains/hazardous-events/infrastructure/` once the legacy `hip*Id` columns are dropped, at
  which point this FK becomes a normal in-domain reference (like `2b`'s `hazard_type_id`), not a
  cross-package exception.
- [`hazardousEventTableConstraits` entry changes real error-handling behavior once a write path
  exists (Decision 5)] → inert today (no route/model writes this column yet), but the next phase
  that adds a write path must add a matching `specificHazardId` form field key or the mapped error
  will target a field that doesn't exist. Flagged explicitly, not left implicit.
- [Test schema mirror is a hand duplicate requiring a manual, parallel edit (Decision 7)] →
  confirmed by direct inspection, not assumed; if a future intent modifies this same legacy table
  again, the same manual-sync step will be needed again until `hazardous_event` itself is
  CA-migrated and this mirror can become a genuine re-export.

## Migration Plan

Additive only — one `ALTER TABLE ADD COLUMN` statement, no existing column altered, no data
migration, no rollback data-loss risk beyond dropping the new column
(`ALTER TABLE "hazardous_event" DROP COLUMN "specific_hazard_id"`), which nothing yet depends on.
