## Context

Target ER diagram (`tmp/hazardous-events-er-diagram/hazardous-events.drawio`), `hazardous_event`
table, cells `KqZPbQY2Lv0Ew4p42Cft-15` (`specific_hazard_local_name (text)`, no badge → nullable)
and `KqZPbQY2Lv0Ew4p42Cft-18` (`specific_hazard_national_name (text)`, no badge → nullable). Both
confirmed present in the raw `.drawio` XML and confirmed absent from the live `hazardous_event`
table via `docker exec delta-local-db psql -U postgres -d dts_development -c '\d hazardous_event'`
in this proposal (only `specific_hazard_id`, from `2i`, appears among `specific_hazard%` columns).

Direct precedent: `2i`'s `specificHazardId` column on this same file — same table, same
hand-authored-migration process, same PGlite test-schema-mirror caveat. This intent differs from
`2i` in one structural way: `2i` added an FK column (relation entry + constraint-object entry
required); these two are plain scalar `text` columns with no FK, so neither of those two additions
applies here.

Scope correction already confirmed with the user before this proposal (not re-derived here): the
roadmap's other two `2j` columns (`nationalSpecification`, `status`) are out of scope — both already
exist under the names/forms documented in proposal.md's Why section.

## Goals / Non-Goals

**Goals:** two nullable, unconstrained `text` columns on the existing `hazardous_event` table; the
PGlite test mirror kept in sync (hand duplicate, not a re-export, per `2i`'s established finding); a
single-statement hand-authored migration, empirically verified against the live dev DB.

**Non-Goals:** `nationalSpecification` and `status` (roadmap's original `2j` text — already resolved
under different existing columns, see proposal.md; not touched, not renamed, not backfilled here);
any FK, index, default, or `CHECK` constraint on either new column; any relation entry or
`hazardousEventTableConstraits` entry (both are FK-only concerns and neither column is a foreign
key); any route, model, handler, or `fieldsDef` change; reconciling `status` /
`hazardous_event_status` / `approvalStatus` (Phase 7e's concern).

## Decisions

**1. Exact columns (from the `.drawio`, already confirmed with the user):**
`specific_hazard_local_name` and `specific_hazard_national_name`, both `text`, both nullable (no
`NN` badge in the diagram on either cell). No FK — neither cell carries a relationship edge to
another table in the diagram, unlike `specific_hazard_id`'s `KqZPbQY2Lv0Ew4p42Cft-108` edge. These
are free-text localization fields (a hazard's name as commonly used locally vs. nationally),
independent of the `specific_hazard` taxonomy FK `2i` added.

**2. No default, no `zeroText` wrapper.** This file's other free-text columns
(`nationalSpecification`, `startDate`, `description`, etc.) use the `zeroText()` helper from
`app/utils/drizzleUtil.ts`, which makes a column `NOT NULL DEFAULT ''`. That pattern does not apply
here: the diagram shows no default/NN badge, and — critically — existing `hazardous_event` rows (25
in the current dev DB) have no value for either new column today. A `zeroText()` `NOT NULL DEFAULT
''` column is technically safe to add to a table with existing rows (Postgres backfills the
default), but it would silently assert "these rows have a known local/national name of empty
string," which is a different claim than "these rows genuinely have no data yet." Plain nullable
`text()` (matching `hazardousEventStatus`'s and `specificHazardId`'s existing nullable-without-
default style on this same file) makes the "not yet populated" state explicit and distinguishable
from "populated with an empty string," and matches the diagram's own no-default depiction. Plain
`text("specific_hazard_local_name")` / `text("specific_hazard_national_name")` — nullable by
omission of `.notNull()`.

**3. No relation entry, no `hazardousEventTableConstraits` entry.** Both objects exist specifically
for foreign-key columns — `hazardousEventRel` documents `one(...)` relations, and
`hazardousEventTableConstraits` maps Postgres FK-violation constraint names to form field keys for
`checkConstraintError` (see `2i`'s design.md Decision 5 for the latter's live-consumer analysis).
Neither new column is a foreign key, so neither object gains an entry — adding one would be dead
weight with no corresponding DB constraint to name.

**4. Test schema mirror — hand duplicate, must be edited by hand (re-confirmed, not re-derived).**
`tests/integration/db/testSchema/hazardousEventTable.ts` is the same full hand-duplicated copy of
the legacy schema file that `2i`'s design.md Decision 7 already documented (own import paths,
e.g. `./countryAccounts` vs. the real file's `./countryAccountsTable`). Re-read directly in this
proposal to confirm it still matches the legacy file column-for-column as of `2i`'s merge. It must
be edited by hand to add the identical two `text(...)` columns — no relation or constraint-object
change needed here (Decision 3), so this edit is strictly smaller than `2i`'s equivalent step.

**5. Migration — single statement, empirically verified in this proposal.** Tested directly against
the live dev DB (`dts_development`, inside a transaction, rolled back):

```sql
BEGIN;
ALTER TABLE "hazardous_event"
  ADD COLUMN "specific_hazard_local_name_test" text,
  ADD COLUMN "specific_hazard_national_name_test" text;
-- \d hazardous_event confirmed both columns present, nullable, no default
ROLLBACK;
```

Followed by a direct re-query confirming the rollback left no trace (`information_schema.columns`
for `hazardous_event` shows only `specific_hazard_id` among `specific_hazard%` columns after
rollback). This confirms Postgres's `ALTER TABLE` grammar accepts multiple comma-separated
`ADD COLUMN` clauses in one top-level statement — no second statement, and therefore
**no `--> statement-breakpoint` is needed or should be added** (the `2c`/`2e`/`2f`/`2g` multi-
statement bug precedent does not apply here, since there is exactly one statement). The real
migration:

```sql
ALTER TABLE "hazardous_event"
  ADD COLUMN "specific_hazard_local_name" text,
  ADD COLUMN "specific_hazard_national_name" text;
```

**6. Journal entry — pin the exact values.** Following the last entry
(`20260909090000_add_specific_hazard_id_to_hazardous_event`, `idx` 54, `when` 1788944400000):

```json
{
  "idx": 55,
  "version": "7",
  "when": 1788948000000,
  "tag": "20260909100000_add_specific_hazard_names_to_hazardous_event",
  "breakpoints": true
}
```

(`when` computed as `1788944400000 + 3_600_000` — the UTC epoch-millisecond value for
`2026-09-09T10:00:00Z`, one hour after `2i`'s entry, matching this project's existing tag/`when`
correspondence convention seen across every prior entry.)

**7. Migration file name.** `20260909100000_add_specific_hazard_names_to_hazardous_event.sql`,
matching the journal tag exactly (Drizzle resolves migration files by tag).

**8. Test tier and file — new `queries/` file, not folded into `2i`'s
`hazardousEventSpecificHazard.test.ts`.** Considered folding into `2i`'s file (same table, adjacent
concern, explicitly flagged as worth checking in the brief) but decided against it: `2i`'s file is
scoped to one FK column's shape and constraint behavior (`describe("hazardous_event.specific_hazard_id")`
with nested `restrict-delete behaviour` / `concurrent access` sub-suites specific to FK semantics).
These two new columns have no FK, no constraint, and no delete-cascade behavior to test — forcing
them into that file's structure would mean either awkwardly nesting unrelated plain-column scenarios
under an FK-shaped `describe` block, or renaming/restructuring `2i`'s already-merged, already-tested
file for no functional gain. A new sibling file
`tests/integration/db/queries/hazardousEventSpecificHazardNames.test.ts` keeps each file's scope
matched to one diagram concern, consistent with the `2c`-`2h`/`2i` precedent of one dedicated
`queries/` file per schema-only PGlite concern. Reuses the same
`tests/integration/db/models/hazardousEventTestHelpers.ts` `baseFields`/seeding chain `2i` used (a
bare `hazardous_event` insert fails without it: `id` FKs to `event`, `hip_type_id` is `NOT NULL`).

**9. Concurrent access scenario — required per this project's spec-writer standard for shared
mutable state, applied here even though these are plain non-unique text columns.** Two callers
concurrently inserting two different `hazardous_event` rows, each setting either new column to a
distinct non-null string, both before either commits, must both succeed — there is no uniqueness
constraint, FK, or shared counter/cache on either column, so no serialization or contention is
expected. This is a lighter-weight version of `2i`'s concurrent-access scenario (no shared
referenced-row contention here, since these columns are per-row scalars, not FKs to a shared parent)
but is included for the same reason `2i`'s was: confirming the column behaves as an ordinary
per-row scalar under concurrent writes, not as an accidental shared/serialized resource.

## Risks / Trade-offs

- [No default value on either column (Decision 2)] → deliberate: matches the diagram's no-default
  depiction and keeps "not yet populated" distinguishable from "populated with empty string";
  documented here so a future reader does not "fix" this by adding `zeroText()` to match this file's
  majority pattern without checking the diagram first.
- [No relation entry, no `hazardousEventTableConstraits` entry (Decision 3)] → deliberate, not an
  oversight; both are FK-only mechanisms and neither column is a foreign key.
- [Test schema mirror is a hand duplicate requiring a manual, parallel edit (Decision 4)] →
  re-confirmed, not assumed; the same manual-sync step will be needed again until `hazardous_event`
  itself is CA-migrated (tracked under the roadmap's expanded `7e` step, per `2i`'s design.md).
- [New PGlite test file rather than extending `2i`'s (Decision 8)] → deliberate scope separation;
  flagged explicitly so a future reader understands this was a considered choice, not a missed
  opportunity to consolidate.

## Migration Plan

Additive only — one `ALTER TABLE ADD COLUMN, ADD COLUMN` statement, no existing column altered, no
data migration, no rollback data-loss risk beyond dropping the two new columns
(`ALTER TABLE "hazardous_event" DROP COLUMN "specific_hazard_local_name", DROP COLUMN
"specific_hazard_national_name"`), which nothing yet depends on.
