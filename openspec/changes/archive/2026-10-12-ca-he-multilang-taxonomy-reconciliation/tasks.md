Both of proposal.md's Open Questions are resolved (see "Decisions Finalized During
Review"): the correction migration backfills the missing same-language `translation`
rows, and fixes `NOT NULL` on all nine affected columns, not just the three originally
named. All task groups below reflect the final, single-branch design — no conditional
paths remain.

## 0. Merge/rebase precondition (not a code task — verify before anything else)

- [x] 0.1 Confirm the implementation branch contains commits `6d98c11c` and `c42affd1`
  (`git merge-base --is-ancestor 6d98c11c HEAD && git merge-base --is-ancestor c42affd1 HEAD`
  both exit 0). If not, merge/rebase onto latest `dev` first — this change has nothing
  to apply on top of otherwise.
- [x] 0.2 Resolve the expected merge conflicts per design.md Decision 5: drop this
  branch's `_journal.json` `idx: 57` entry, keep `dev`'s `idx: 57`/`58` entries; take this
  branch's versions of `hazardType.test.ts`, `hazardCluster.test.ts`,
  `specificHazard.test.ts`, `hipHierarchyChain.test.ts`,
  `hazardousEventSpecificHazard.test.ts`, `hazardTypeFieldDefinitionTestHelpers.ts`,
  `hazardTypeTable.ts`, `hazardClusterTable.ts`, `specificHazardTable.ts`. Verify with
  `yarn vitest run tests/integration/db/queries/hazardType.test.ts tests/integration/db/queries/hazardCluster.test.ts tests/integration/db/queries/specificHazard.test.ts tests/integration/db/queries/hipHierarchyChain.test.ts tests/integration/db/queries/hazardousEventSpecificHazard.test.ts` — all green post-merge, before any of this change's own edits.
- [x] 0.3 If a local `dts_development` database has `5l`'s retracted migration applied,
  reset it before `yarn dbsync` in task 5: drop the four affected tables (or the whole
  schema) and delete the corresponding row(s) from `public."__drizzle_migrations__"`
  (column is `id`, not `tag` — see reference_drizzle_migrations_table). Running
  `6d98c11c` against a DB that already has `5l`'s column-add-then-drop shape applied will
  fail at its own `DROP TABLE IF EXISTS` / re-`CREATE TABLE` step mismatch or at its
  `INSERT INTO language(language_name)` step if `language_cd` already exists as NOT NULL
  with no value supplied — do not skip this reset.

## 1. Delete the retracted migration

- [x] 1.1 Delete `app/drizzle/migrations/20261008000000_add_shared_multilang_taxonomy.sql`.
- [x] 1.2 Remove its entry (`idx: 57`, tag `20261008000000_add_shared_multilang_taxonomy`)
  from `app/drizzle/migrations/meta/_journal.json`, after confirming (task 0.2) `dev`'s
  `idx: 57`/`58` entries are the ones now present at those indices.
- [x] 1.3 Delete `tests/integration/db/queries/sharedMultilangTaxonomyBackfill.test.ts` —
  tested the now-deleted migration's own backfill mechanics (design.md Non-Goals).
- [x] 1.4 `yarn vitest run tests/integration/db/queries` — confirm no test still imports
  the deleted file's path or references the deleted migration's filename.

## 2. Correction migration — write the failing test first (all four fixes)

- [x] 2.1 Write failing test `tests/integration/db/queries/hipsMultilangCorrectionMigration.test.ts`
  per design.md Decision 4: open a raw `PGlite` client, build the post-`c42affd1` fixture
  DDL (copied verbatim from design.md Context's `CREATE TABLE` blocks, plus `c42affd1`'s
  final `language` shape — `hip_version_id` typo'd, no `ON DELETE CASCADE` on
  `translation.text_content_id`, no `NOT NULL` on any of the nine target columns). Seed
  one row per table (`hips_version` → `hazard_type` → `hazard_cluster` →
  `specific_hazard`), one `language`/`text_content` row pair with **no** same-language
  `translation` row, and one `language`/`text_content`/`translation` row set that
  **already has** a same-language `translation` row (simulating a future re-run). Assert,
  against the fixture BEFORE running the correction SQL: a `NULL` insert succeeds on each
  of the nine target columns; the `translation`→`text_content` FK's
  `pg_constraint.confdeltype` is not `'c'`; a `drizzle(client).select().from(hazardTypeTable)`
  (the real TS schema object) throws, because the fixture's column is `hip_version_id`,
  not `hips_version_id`; no `translation` row exists for the no-same-language-row fixture
  pair. Run it — passes on these "before" assertions by construction (no migration run
  yet), confirming the fixture itself is correctly pre-correction-shaped.
- [x] 2.2 Extend the same test to read the correction migration SQL file from disk
  (`app/drizzle/migrations/20261011000000_fix_hips_multilang_corrections.sql` — file does
  not exist yet), split on `--> statement-breakpoint`, execute each statement, then
  assert: `information_schema.columns` shows `hips_version_id` (not `hip_version_id`) on
  `hazard_type`; the earlier `drizzle(client).select().from(hazardTypeTable)` now
  resolves `.hipsVersionId` without error; `pg_constraint.confdeltype = 'c'` for
  `translation`'s FK; a fresh `NULL` insert on each of the nine target columns is now
  rejected (`23502`); a `translation` row now exists for the no-same-language-row fixture
  pair, with `translation` text equal to that `text_content` row's `original_text`; the
  already-has-a-translation fixture pair still has exactly one `translation` row (not
  two) — proves the backfill's `NOT EXISTS` guard is idempotent, not just a happy path.
  Run `yarn vitest run tests/integration/db/queries/hipsMultilangCorrectionMigration.test.ts`
  — fails (migration file doesn't exist, `readFileSync` throws).
- [x] 2.3 Hand-author `app/drizzle/migrations/20261011000000_fix_hips_multilang_corrections.sql`
  per design.md Decision 2, in order: (1) dynamic `pg_constraint` lookup + rename for
  `hip_version_id`/its FK (restoring `2b`'s original `hazard_type_hips_version_id_fk`
  name, not Postgres's regenerated default); (2) dynamic lookup + drop + re-add for
  `translation`'s FK to `text_content` with `ON DELETE CASCADE`; (3) `SET NOT NULL` on
  all nine columns (`hazard_type.name_text_content_id`, `hazard_cluster.name_text_content_id`,
  `specific_hazard.name_text_content_id`, `hazard_type.hips_version_id`,
  `hazard_cluster.hazard_type_id`, `specific_hazard.hazard_cluster_id`,
  `text_content.original_language_id`, `translation.text_content_id`,
  `translation.language_id`); (4) the same-language `translation` backfill
  `INSERT ... WHERE NOT EXISTS (...)`. Every statement separated by
  `--> statement-breakpoint`.
- [x] 2.4 Add the matching entry to `app/drizzle/migrations/meta/_journal.json`: `idx: 59`,
  `version: "7"`, `when` greater than `1791537033187`, `tag:
  "20261011000000_fix_hips_multilang_corrections"`, `breakpoints: true`.
- [x] 2.5 Run `yarn vitest run tests/integration/db/queries/hipsMultilangCorrectionMigration.test.ts`
  — passes.

## 3. `languageTable.ts` — `varchar(2)` TS type change

- [x] 3.1 Add a failing case to `tests/integration/db/queries/language.test.ts`: insert
  `languageCd: "eng"` and assert the rejection's SQLSTATE is `22001` (string-too-long for
  `varchar(2)`), not today's `23514` (check-constraint violation on a `text` column). Keep
  the existing 1-char-rejection test unchanged (still enforced by the check, not the
  type). Run `yarn vitest run tests/integration/db/queries/language.test.ts` — the new
  case fails (today's column is `text`, so the violation is `23514`, not `22001`).
- [x] 3.2 Edit `app/domains/shared/infrastructure/languageTable.ts`: import `varchar` from
  `drizzle-orm/pg-core`, change `languageCd: text("language_cd")...` to
  `languageCd: varchar("language_cd", { length: 2 })...`; keep the existing
  `check(...)` length constraint unchanged (varchar(2) only enforces a maximum, not an
  exact length — design.md Decision 1).
- [x] 3.3 Run `yarn vitest run tests/integration/db/queries/language.test.ts` — passes,
  including the new `22001` case.

## 4. Confirm already-correct files need no edit (verification only, design.md Decision 1)

- [x] 4.1 Read `app/domains/shared/infrastructure/translationTable.ts` and confirm
  `onDelete: "cascade"` is already present on `textContentId` — no edit.
- [x] 4.2 Read `app/domains/hazardous-events/infrastructure/hazardTypeTable.ts` and
  confirm the field is already `hipsVersionId`/column `hips_version_id` — no edit.
- [x] 4.3 Read `hazardClusterTable.ts` and `specificHazardTable.ts` and confirm
  `nameTextContentId` is already `.notNull()` on both — no edit.
- [x] 4.4 Run `yarn vitest run tests/integration/db/queries/translation.test.ts
  tests/integration/db/queries/textContent.test.ts` — both pass unchanged (no behavior
  affected by this change's corrections).

## 5. Real-DB sign-off

- [x] 5.1 Run `yarn dbsync` against local Postgres (after task 0.3's reset) and confirm
  `6d98c11c`, `c42affd1`, and the new correction migration all apply cleanly in order.
  Inspect `information_schema.columns`/`pg_constraint`/`pg_attribute` to confirm:
  `hazard_type.hips_version_id` exists (not `hip_version_id`), its FK constraint is named
  `hazard_type_hips_version_id_fk`; `translation`'s FK to `text_content` has
  `confdeltype = 'c'`; `attnotnull = true` on all nine target columns; every
  `text_content` row resolves at least one `translation` row in its own
  `original_language_id`.

## 6. Quality gates

- [x] 6.1 `yarn vitest run tests/integration/db/queries/hipsMultilangCorrectionMigration.test.ts tests/integration/db/queries/language.test.ts tests/integration/db/queries/textContent.test.ts tests/integration/db/queries/translation.test.ts tests/integration/db/queries/hazardType.test.ts tests/integration/db/queries/hazardCluster.test.ts tests/integration/db/queries/specificHazard.test.ts` — all green.
- [x] 6.2 `yarn tsc` — zero errors.
- [x] 6.3 `yarn format:check` on touched files only (never repo-wide `yarn format`, per
  project convention) — clean.
- [x] 6.4 Anti-pattern review against `.github/skills/anti-pattern-check/SKILL.md`.
- [x] 6.5 Invoke `solid-reviewer` agent on `languageTable.ts` and the new migration SQL
  file.
- [x] 6.6 Documentation review — comments explain WHY not WHAT, one full-diff sweep by a
  fresh subagent, not self-review.
- [x] 6.7 Project conventions review against `.github/copilot-instructions.md`.
- [x] 6.8 Run `.github/skills/code-review/SKILL.md` in full, via a fresh subagent.
- [x] 6.9 Visual/UX parity — N/A, no `app/domains/*/presentation/` or `app/routes/` file
  touched; stated explicitly, not silently skipped.
- [x] 6.10 Independent second-opinion review — Claude Code's built-in `/code-review` at
  `high` effort via a second, separate fresh subagent; resolve findings before archiving.
- [x] 6.11 Invoke `test-quality-auditor` scoped to `languageTable.ts` and the new
  correction migration SQL file (real constraint/FK logic, not a type-only re-export,
  per the same reasoning `5l`'s own tasks.md task 8.11 applied to this same table
  family); resolve any real gap found. Structural review (full Stryker mutation run
  skipped by user cost decision) found two real gaps, both closed test-only: (1) no
  existing test omitted `id` on `hazard_type`/`hazard_cluster`/`specific_hazard`, so
  nothing would catch a reintroduced DB default — added one 23502 NOT-NULL-violation
  test per table. (2) the correction migration's backfill `WHERE NOT EXISTS` predicate
  is language-specific (`t.language_id = text_content.original_language_id`), but the
  fixture only ever seeded one language, so a regression dropping that match would pass
  undetected — added a second-language (fr) fixture row and a scenario proving the `en`
  backfill still runs when a different-language translation already exists. Red
  confirmed for all 4 by temporarily reintroducing each mutant (DB default via
  `.defaultRandom()` per table; predicate without the language match) and observing the
  new test fail while all other tests passed; Green confirmed after reverting each
  mutant.

## 7. Regression and archive

- [x] 7.1 Run `yarn test:run2` (full PGlite suite) — confirm no new failures vs. this
  branch's base (post-merge from task 0). Any pre-existing failure must be confirmed
  pre-existing by running the same suite on the base branch first — never assumed.
  Re-run after 6.11's test additions: 112 test files, 1419 passed, 1 todo, 0 failed.
  Zero failures means no base-branch comparison is needed to rule out a regression.
- [x] 7.2 Run `opsx:archive` on this branch before raising the PR.
