## Context

See proposal.md - Why for the motivation. This section covers only what's needed to
explain the approach: the exact divergence between `5l`'s retracted migration and the
adopted migration, and what's already true vs. still needed in the codebase today.

**Branch state as of this proposal.** `feature/he-ca-phase5` does NOT yet contain
`6d98c11c`/`c42affd1` (confirmed: `git merge-base --is-ancestor` returns false for both).
This branch currently has `5l`'s full result: the three Shared Kernel TS schema files, the
three hazard tables already migrated to `nameTextContentId`, `5l`'s own migration file and
journal entry, and all six `5l`-updated test files using `nameTextContentId`. `dev`, by
contrast, has `6d98c11c`/`c42affd1` applied as raw SQL only — it has **no** TS schema files
for `language`/`text_content`/`translation` at all, and its three hazard-table TS files
(`hazardTypeTable.ts`, `hazardClusterTable.ts`, `specificHazardTable.ts`) and six
dependent test files are still on the pre-`5l`, plain-`name` shape. This means `dev`'s own
TS layer is already out of sync with `dev`'s own live DB shape after `6d98c11c` runs — not
a new problem this change creates, just the state this change must reconcile.

**Exact adopted-migration text, verified by reading both files in full** (not inferred
from the roadmap prose):

```sql
-- 6d98c11c, step 3 (verbatim CREATE TABLE statements):
CREATE TABLE public.hazard_type (
    id uuid PRIMARY KEY,
    name_text_content_id uuid REFERENCES public.text_content(id),
    hip_version_id uuid REFERENCES public.hips_version(id),
    source_ref_id text UNIQUE
);
CREATE TABLE public.hazard_cluster (
    id uuid PRIMARY KEY,
    name_text_content_id uuid REFERENCES public.text_content(id),
    hazard_type_id uuid REFERENCES public.hazard_type(id),
    source_ref_id text UNIQUE
);
CREATE TABLE public.specific_hazard (
    id uuid PRIMARY KEY,
    name_text_content_id uuid REFERENCES public.text_content(id),
    code text NOT NULL,
    hazard_cluster_id uuid REFERENCES public.hazard_cluster(id),
    source_ref_id text UNIQUE,
    description_text_content_id uuid REFERENCES public.text_content(id)
);
-- step 2 (shared tables):
CREATE TABLE IF NOT EXISTS public.text_content (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    original_text text NOT NULL,
    original_language_id uuid REFERENCES public.language(id)
);
CREATE TABLE IF NOT EXISTS public.translation (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    text_content_id uuid REFERENCES public.text_content(id),
    language_id uuid REFERENCES public.language(id),
    translation text NOT NULL
);
```

No column above other than `code`/`original_text`/`translation` carries `NOT NULL`. None
of the three new tables' FKs carry `ON DELETE`. `hazard_type`/`hazard_cluster`/
`specific_hazard`'s `id` has no `DEFAULT` (unlike `language`/`text_content`/`translation`,
which get `DEFAULT gen_random_uuid()`) — **this is deliberate, not a gap**: the migration
always supplies `id` explicitly as a deterministic `md5(...)::uuid` hash so re-running the
import against another instance produces matching IDs; a DB-side random default would
defeat that. Flagged here, not touched.

`c42affd1` separately renames `language.language_name` → `language_cd`, changes its type
to `varchar(2)` with a `CHECK (char_length(language_cd) = 2)` constraint named
`language_cd_length_check`, then adds back a new, nullable-then-`NOT NULL` `language_name`
text column with a fresh `UNIQUE` constraint. Final `language` shape: `id`, `language_cd`
(`varchar(2)`, NOT NULL, UNIQUE, checked), `language_name` (`text`, NOT NULL, UNIQUE) — the
same two columns `5l` already specified, different type for one of them. Kept as-is per
the user's explicit decision.

## Goals / Non-Goals

**Goals:** retract `5l`'s own migration cleanly; adopt the other team's migration
unmodified; layer one small, `ALTER`-only correction migration fixing all four regressions
(proposal.md "Why") — the rename, the cascade, `NOT NULL` on all nine affected columns,
and the backfill; keep the TS schema and specs in sync with the corrected (not the
adopted-as-is) shape; prove the correction migration's own fixes with a dedicated test,
without re-testing the adopted migration's own mechanics.

**Non-Goals:**
- Modifying `6d98c11c`/`c42affd1` themselves — already committed, shared history on `dev`.
- Re-validating the adopted migration's own legacy-reimport mechanics (8/38/281 count
  guards, FK save/restore dance around `hazard_type_custom_field_definition`/
  `hazard_type_field_definition`, deterministic hash-ID generation) — that migration's
  correctness is `dev`'s own already-landed concern, not re-derived here.
- `event_causality`/`event-causality` (`5m`) — untouched.
- Enforcement of the same-language `translation` invariant for any *future* writer of
  `text_content` (a DB trigger vs. an application-layer contract) — unchanged from `5l`
  Decision 5, still undecided, still out of scope here. This change only backfills the
  rows the adopted migration already wrote without a same-language `translation` row; it
  does not add enforcement going forward.
- Wiring these tables into any route, model, `fieldsDef`, or `5i`'s
  `DrizzleHazardTaxonomyRepository` — pure schema + migration, same as `5l`.

Both Open Questions originally raised here (same-language `translation` invariant;
3-vs-9-column `NOT NULL` scope) are resolved — see proposal.md "Decisions Finalized
During Review". Decisions 2 and 4 below reflect the final, single-branch design; no
alternate branch remains to choose between.

## Decisions

**1. TypeScript schema changes are smaller than the originating intent assumed — verified
by reading the current files, not assumed.** Four of the six files it named as needing
edits are already correct on this branch:

| File | Originating intent assumed | Actual current state (verified) | Action |
|---|---|---|---|
| `languageTable.ts` | `languageCd` → `varchar(2)` | `text` + check, needs the change | **Edit**: `text("language_cd")` → `varchar("language_cd", { length: 2 })`; keep the check constraint (`varchar(2)` enforces a maximum of 2, not exactly 2 — a 1-char or 0-char value still passes the type and must still be rejected by the check). |
| `translationTable.ts` | needs `{ onDelete: "cascade" }` added | already has `.references(() => textContentTable.id, { onDelete: "cascade" })` | **No edit** — `5l` already declared this; only the real DB (post-adopted-migration) lacked it, which the new correction migration fixes. |
| `hazardTypeTable.ts` | field name might need checking | already `hipsVersionId` / column `hips_version_id`, with a comment already noting the diagram's typo | **No edit** — only the adopted migration's raw SQL column name was ever wrong. |
| `hazardClusterTable.ts`, `specificHazardTable.ts` | `nameTextContentId` might need `.notNull()` | already `.notNull()` on both | **No edit.** |

This matters for tasks.md: four of the six files the originating intent listed need no
code change at all, only a verification step. Don't let that read as scope creep in the
other direction — the actual DB-level gap (the real Postgres column being nullable despite
the TS declaring `.notNull()`) is real and is what the correction migration closes.

**2. Correction migration is `ALTER`-only, no new table, no destructive drop** — the
adopted migration already did the one destructive rebuild. Four fixes across twelve
statements, each independently safe against the small (hundreds-of-rows) reference tables
involved (same
sub-second-lock reasoning `5l`'s own design.md Risk 4 already accepted):

```sql
-- 1. Rename the typo'd column and its auto-generated FK constraint.
-- Constraint name resolved dynamically via pg_constraint, not hardcoded — the adopted
-- migration's own CREATE TABLE used an unnamed inline REFERENCES, so Postgres assigned
-- the default name from the ACTUAL column name at creation time (hip_version_id), which
-- may not exactly match an assumed "hazard_type_hip_version_id_fkey" in every environment.
DO $$
DECLARE fk_name text;
BEGIN
    SELECT conname INTO fk_name
    FROM pg_constraint
    WHERE conrelid = 'public.hazard_type'::regclass
      AND confrelid = 'public.hips_version'::regclass
      AND contype = 'f';
    EXECUTE format('ALTER TABLE public.hazard_type RENAME COLUMN hip_version_id TO hips_version_id');
    -- Restores 2b's original name (app/drizzle/migrations/20260904120000_add_hip_hierarchy_tables.sql),
    -- not Postgres's regenerated default — matches this table family's existing `_fk` convention.
    EXECUTE format('ALTER TABLE public.hazard_type RENAME CONSTRAINT %I TO hazard_type_hips_version_id_fk', fk_name);
END $$;
--> statement-breakpoint

-- 2. Add ON DELETE CASCADE to translation.text_content_id (Postgres has no ALTER ... SET
-- ON DELETE; the FK must be dropped and re-added).
DO $$
DECLARE fk_name text;
BEGIN
    SELECT conname INTO fk_name
    FROM pg_constraint
    WHERE conrelid = 'public.translation'::regclass
      AND confrelid = 'public.text_content'::regclass
      AND contype = 'f';
    EXECUTE format('ALTER TABLE public.translation DROP CONSTRAINT %I', fk_name);
    EXECUTE format(
        'ALTER TABLE public.translation ADD CONSTRAINT %I FOREIGN KEY (text_content_id) REFERENCES public.text_content(id) ON DELETE CASCADE',
        fk_name
    );
END $$;
--> statement-breakpoint

-- 3. NOT NULL on all nine columns the adopted migration left nullable (proposal.md
-- Decisions Finalized During Review, item 2) — the three name_text_content_id columns
-- originally named, plus six more found by Phase 0 investigation. Postgres validates
-- existing rows when adding NOT NULL; these tables are fully populated by the adopted
-- migration's own import, so this is expected to succeed with no pre-check needed
-- (hundreds of rows, not millions).
ALTER TABLE public.hazard_type ALTER COLUMN name_text_content_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE public.hazard_cluster ALTER COLUMN name_text_content_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE public.specific_hazard ALTER COLUMN name_text_content_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE public.hazard_type ALTER COLUMN hips_version_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE public.hazard_cluster ALTER COLUMN hazard_type_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE public.specific_hazard ALTER COLUMN hazard_cluster_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE public.text_content ALTER COLUMN original_language_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE public.translation ALTER COLUMN text_content_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE public.translation ALTER COLUMN language_id SET NOT NULL;
--> statement-breakpoint

-- 4. Backfill the same-language translation rows the adopted migration's own step 7
-- deliberately excludes (it inserts a translation row for every language EXCEPT a row's
-- own original one — proposal.md Decisions Finalized During Review, item 1). Preserves
-- the 5l/ADR-001 invariant that every text_content row has a same-language translation
-- row, rather than reversing it. The NOT EXISTS guard makes this idempotent: a
-- text_content row that already has a same-language translation row (none do today,
-- since this is the first time this backfill runs, but a future re-run must still be
-- safe) is left untouched, never given a duplicate.
INSERT INTO public.translation (text_content_id, language_id, translation)
SELECT id, original_language_id, original_text
FROM public.text_content
WHERE NOT EXISTS (
    SELECT 1 FROM public.translation t
    WHERE t.text_content_id = text_content.id
      AND t.language_id = text_content.original_language_id
);
```

**3. Timestamp/filename**: `app/drizzle/migrations/20261011000000_fix_hips_multilang_corrections.sql`
— later than `20261009091033` (the adopted migration's own timestamp), dated to this
proposal's own authoring date. `meta/_journal.json` gets one new entry with `idx: 59`
(after dev's `idx: 58`), `version: "7"`, a `when` value greater than `1791537033187`
(`c42affd1`'s own `when`), `tag: "20261011000000_fix_hips_multilang_corrections"`,
`breakpoints: true`.

**4. New migration-boundary test, scoped to this change's own migration only — not a
re-test of the adopted migration.** `5l`'s own `translation.test.ts` already covers the
cascade-delete behavior (test exists today, predates the adopted migration); `hazardType`/
`hazardCluster`/`specificHazard.test.ts` already cover the NOT NULL rejection for the
three named columns via `@ts-expect-error` + runtime insert. **None of that tells you
whether the correction migration itself ran and did its job** — `pushSchema` builds the
test `dr` straight from the already-correct TS files, so it can never distinguish
"TS says NOT NULL" from "the real migration SQL that makes the DB agree actually exists
and runs cleanly". This is the same tier gap `5l`'s own design.md Decision 9 identified
for its own backfill — same shape of problem, here for a rename, a cascade fix, nine
`ALTER COLUMN ... SET NOT NULL`s, and a `translation` backfill of its own.

New file: `tests/integration/db/queries/hipsMultilangCorrectionMigration.test.ts`. Opens
its own raw `PGlite` client (not the mocked `dr`), builds a **post-`c42affd1`-shaped**
fixture DDL by hand (copied from the two verbatim `CREATE TABLE` blocks in Context above,
plus `c42affd1`'s final `language` shape) — not a replay of `6d98c11c` itself, whose
8/38/281 count guard and named-FK save/restore logic are impractical to reproduce as a
test fixture and are not this change's concern per Non-Goals. Seeds one row per table with
a populated `name_text_content_id`/`hip_version_id` (typo'd, pre-correction, matching the
fixture). Reads the correction migration SQL file from disk, splits on
`--> statement-breakpoint`, executes each statement, then asserts:
- `information_schema.columns` shows `hips_version_id` (not `hip_version_id`) on
  `hazard_type`; a `drizzle(client).select().from(hazardTypeTable)` through the real TS
  schema object resolves `.hipsVersionId` without error (this is the real Red/Green for
  the rename: before the migration, the same select throws because the TS schema's
  `hips_version_id` column doesn't exist in the fixture).
- `pg_constraint.confdeltype = 'c'` for `translation`'s FK to `text_content` (was the
  Postgres default, not `'c'`, before the migration ran — assert both states).
- `pg_attribute.attnotnull = true` for all nine corrected columns:
  `name_text_content_id` on all three hazard tables, `hazard_type.hips_version_id`,
  `hazard_cluster.hazard_type_id`, `specific_hazard.hazard_cluster_id`,
  `text_content.original_language_id`, `translation.text_content_id`,
  `translation.language_id`.
- A direct `INSERT ... VALUES (NULL)` against each of the nine columns succeeds against
  the fixture before the migration and is rejected (`23502`) after.
- Seed the fixture with at least one `text_content` row that has no same-language
  `translation` row (mirroring the adopted migration's own step 7 behavior). Assert that
  before the correction migration runs, no `translation` row exists for that
  (`text_content_id`, `original_language_id`) pair; after it runs, exactly one does, with
  `translation` text equal to the row's `original_text`. Also seed one `text_content` row
  that already has a same-language `translation` row (simulating a future re-run) and
  assert the backfill leaves it as exactly one row, not two — proves the `NOT EXISTS`
  guard's idempotency, not just the happy path.
- For `languageTable.ts`'s `varchar(2)` TS change specifically (not the correction
  migration — this is a pre-existing-in-`c42affd1` constraint, just now reflected in TS):
  a `language.test.ts` case asserting SQLSTATE for a 3-char `language_cd` insert is
  `22001` (string-too-long for `varchar(2)`) rather than today's `23514` (check-constraint
  violation on a `text` column) — this is the real Red for the TS type change, since a
  `text` column with only the length-2 check would never produce `22001`. The existing
  1-char-rejection test is kept unchanged (still enforced by the check, not the type).

**5. Expected merge/rebase conflicts and their resolution** (not a design choice, a
documented fact the implementer needs before starting):

| File | Conflict | Resolution |
|---|---|---|
| `app/drizzle/migrations/meta/_journal.json` | both branches append after `idx: 56` | Drop this branch's `idx: 57` entry (the retracted migration) entirely; take `dev`'s `idx: 57`/`58` entries as-is; append this change's new `idx: 59` entry. |
| `hazardType.test.ts`, `hazardCluster.test.ts`, `specificHazard.test.ts`, `hipHierarchyChain.test.ts`, `hazardousEventSpecificHazard.test.ts`, `hazardTypeFieldDefinitionTestHelpers.ts` | `dev` still has these on the pre-`5l`, plain-`name` shape (`dev` never merged `5l`); this branch already has the `nameTextContentId`-based versions | Take this branch's versions — they already encode the shape both migrations converge on. |
| `app/domains/hazardous-events/infrastructure/hazardTypeTable.ts`, `hazardClusterTable.ts`, `specificHazardTable.ts` | `dev`'s copies are untouched since `2b` (plain `name`); this branch's copies are `5l`'s `nameTextContentId` versions | Take this branch's versions — no line-level overlap expected since `dev` never edited these files, so this should resolve as a clean "ours" pick, not a real textual conflict. |

**6. Non-blocking constraint/index naming drift — accepted, not fixed, per existing
precedent.** Two more names differ between what `5l`'s own TS already declares and what
the adopted migration's real DB now has:
- TS: `check("language_language_cd_length_check", ...)` vs. real DB (`c42affd1`):
  `language_cd_length_check`.
- TS: `uniqueIndex("translation_text_content_id_language_id_unique")` vs. real DB
  (`6d98c11c`): `CREATE UNIQUE INDEX ... translation_text_language_uq`.

Both are cosmetic (DDL metadata only; this project hand-authors migrations and never runs
`drizzle-kit generate` against the live DB, so no tool ever compares these names for
equality). `5l`'s own Gate 8 (tasks.md task 8.8, finding 4) already accepted the exact
same class of drift for the second one ("behaviorally identical, matches `2b`'s own
FK-naming-mismatch precedent"). Not touched by the correction migration; noted here so
it isn't rediscovered as a surprise.

Same class of drift, not separately itemized above: Decision 2's rename restores
`hazard_type_hips_version_id_fk` to match `2b`'s own naming for that one constraint only.
Every other FK the adopted migration created on these same tables (`hazard_cluster`,
`specific_hazard`, `translation`, `text_content`) still carries Postgres's auto-generated
`_fkey` suffix, not `_fk` — this correction migration doesn't make the table family
internally consistent, it only restores the one name `2b` originally chose.

## Risks / Trade-offs

- [The backfill's `NOT EXISTS` guard is the only thing preventing a duplicate
  `translation` row if this migration were ever mistakenly re-run] → the guard makes the
  statement idempotent by construction (re-asserted by the dedicated idempotency test in
  Decision 4); the existing `UNIQUE (text_content_id, language_id)` constraint on
  `translation` is a second, independent backstop that would reject a true duplicate
  insert outright even if the `NOT EXISTS` logic were ever wrong.
- [Merge conflicts across 9 files when the implementation branch is created] → Decision 5
  gives an exact per-file resolution rule; none require manual reconciliation of logic,
  only a pick-one-side resolution.
- [The correction migration's FK-constraint-name lookups rely on exactly one FK existing
  per `(conrelid, confrelid)` pair at migration time] → true for both target pairs today
  (`hazard_type`→`hips_version`, `translation`→`text_content`), verified by reading the
  adopted migration's `CREATE TABLE` statements directly; if a future migration adds a
  second FK between the same two tables before this one runs, the `SELECT conname INTO`
  would need a tie-breaker — out of scope today, flagged for whoever adds that FK.
- [`ALTER TABLE ... SET NOT NULL` validates every existing row at migration time, which
  briefly holds a lock] → accepted, same precedent as `5l`'s own Risk entry: these are
  small (hundreds-of-rows), slow-changing reference tables with no high-concurrency
  writers.
- [The backfill requirement's wording ("translation text equals original_text") is
  stronger than what the migration's `NOT EXISTS` guard actually checks (existence of a
  same-language row, not text equality)] → accepted gap, not fixed: no current writer can
  create a `text_content` row and a same-language `translation` row with differing text,
  so the divergence is unreachable today. No runtime validation added for it.

## Migration Plan

Order (all four fixes in one file, run after `6d98c11c` and `c42affd1`): rename
`hip_version_id` → `hips_version_id` + its FK constraint → drop+re-add `translation`'s FK
to `text_content` with `ON DELETE CASCADE` → set `NOT NULL` on all nine columns → backfill
missing same-language `translation` rows.

**Rollback**: reverse order — drop the backfilled same-language `translation` rows
(identifiable as rows where `language_id = text_content.original_language_id` and no
other distinguishing marker exists, so only safe to reverse immediately after this
migration, before any other same-language translation could legitimately be added) →
`ALTER COLUMN ... DROP NOT NULL` on the nine columns → drop+re-add `translation`'s FK
without `ON DELETE CASCADE` → rename `hips_version_id` back to `hip_version_id` and its
constraint back to the lookup-derived name. Not authored as a script in this change,
matching `2a`/`2b`/`5l`'s own precedent of not shipping rollback scripts; the reverse
mapping above is lossless as long as rollback happens before any new row is written
against the corrected constraints.
