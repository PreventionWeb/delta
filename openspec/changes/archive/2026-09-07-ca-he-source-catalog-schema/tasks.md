## 1. `source_catalog` table

- [x] 1.1 Write failing test `tests/integration/db/queries/sourceCatalog.test.ts`
      (`import "../setup"`) covering all 7 spec.md scenarios: insert under an existing
      `country_accounts_id` succeeds; insert with `name` omitted is rejected (not-null);
      insert with `country_accounts_id = NULL` is rejected (not-null); insert with a
      `country_accounts_id` matching no `country_accounts` row is rejected (FK); two
      rows with the same `name` under different `country_accounts_id` both succeed;
      two concurrent inserts under the same `country_accounts_id` both succeed.
      Run `yarn vitest run tests/integration/db/queries/sourceCatalog.test.ts` — fails
      (table doesn't exist).
- [x] 1.2 Add `app/domains/hazardous-events/infrastructure/sourceCatalogTable.ts` —
      `id` via `ourRandomUUID()`, `name` text not null, `countryAccountsId` uuid not null
      `.references(() => countryAccountsTable.id, { onDelete: "cascade" })`, `createdAt`/
      `updatedAt` timestamp(`{ withTimezone: true }`) not null defaulting to
      `CURRENT_TIMESTAMP` — per design.md Decisions 1/2/3.
- [x] 1.3 Add `tests/integration/db/testSchema/sourceCatalogTable.ts` re-exporting it
      (design.md Decision 7) and add it to `tests/integration/db/testSchema/index.ts`.
      Do NOT add it to `app/drizzle/schema/index.ts` — per design.md Decision 3.
- [x] 1.4 Run `yarn vitest run tests/integration/db/queries/sourceCatalog.test.ts` —
      passes.

## 2. Cascade-delete behaviour

- [x] 2.1 Write failing test (same file, additional `describe`/`it` block) covering:
      deleting a `country_accounts` row cascades to delete its dependent
      `source_catalog` rows. Run it — fails until 1.2 lands, then passes with no further
      code change.
- [x] 2.2 Run `yarn vitest run tests/integration/db/queries/sourceCatalog.test.ts` —
      passes.

## 3. Real migration

- [x] 3.1 Hand-author `app/drizzle/migrations/<timestamp>_add_source_catalog_table.sql`
      — one `CREATE TABLE IF NOT EXISTS` statement matching the Drizzle schema exactly
      (uuid PK default `gen_random_uuid()`, FK to `country_accounts(id)` with `ON DELETE
  CASCADE`, `created_at`/`updated_at` `timestamptz NOT NULL DEFAULT
  CURRENT_TIMESTAMP`), same style as `20260904120000_add_hip_hierarchy_tables.sql`.
- [x] 3.2 Add the matching entry to `app/drizzle/migrations/meta/_journal.json`.
- [x] 3.3 Run `yarn dbsync` against a local Postgres and confirm it applies cleanly with
      no errors.

## 4. Quality gates

- [x] 4.1 `yarn vitest run tests/integration/db/queries/sourceCatalog.test.ts` — green.
- [x] 4.2 `yarn tsc` — zero errors.
- [x] 4.3 `yarn format:check` — clean (or `yarn format` on changed files only, never
      repo-wide).
- [x] 4.4 Anti-pattern review against `.github/skills/anti-pattern-check/SKILL.md`.
- [x] 4.5 Invoke `solid-reviewer` agent on `sourceCatalogTable.ts`.
- [x] 4.6 Documentation review — comments (if any) explain WHY, not WHAT.
- [x] 4.7 Project conventions review against `.github/copilot-instructions.md`.
- [x] 4.8 Run `.github/skills/code-review/SKILL.md` in full.
- [x] 4.9 Visual/UX parity — N/A, no presentation-layer file is touched by this change.

## 5. Post-review correction — `UNIQUE(country_accounts_id, name)`

- [x] 5.1 Independent code review flagged: no uniqueness constraint meant a tenant could
      insert the same source name arbitrarily many times, defeating the point of a
      catalog. Added `uniqueIndex("source_catalog_country_accounts_id_name_unique")` on
      `(country_accounts_id, name)` — per design.md Decision 8.
- [x] 5.2 Updated `spec.md` (new required rule + "cannot register the same name twice"
      scenario; renamed the concurrent-insert scenario to use two different names, since
      it must not collide with the new unique constraint) and the hand-authored
      migration (added the matching `CREATE UNIQUE INDEX`).
- [x] 5.3 Added a test asserting a duplicate `(country_accounts_id, name)` insert is
      rejected; re-ran the full test file — all 8 tests green.
- [x] 5.4 **Migration execution bug found and fixed**: the two-statement migration
      (`CREATE TABLE` + `CREATE UNIQUE INDEX`) with no separator caused `yarn dbsync` to
      report success and record a migration-tracking row, but the table was never
      actually created — verified directly against `information_schema.columns` (empty),
      while running the identical SQL directly via `pg`'s `client.query()` worked. Fixed
      by adding `--> statement-breakpoint` between the two statements (drizzle-kit's own
      generated-migration convention); re-verified from a clean drop (table + tracking
      row) that `yarn dbsync` now creates the table, FK, and unique index correctly.

## 6. Regression and archive

- [x] 6.1 Run `yarn test:run2` (full PGlite suite) against the `feature/he-ca-phase2`
      baseline first to establish which failures are pre-existing, then run it again
      after this change and confirm no new failures — only pre-existing ones (if any),
      confirmed pre-existing by the baseline run, plus the new test(s) from sections 1-2
      and 5. Baseline (stashed, clean `feature/he-ca-phase2` tree): 2 failed / 574 passed
      / 576 total. Post-change (2 runs): 2 failed / 581 passed / 583 total each time (+7
      = this change's new tests before the uniqueness fix, no other test count changed).
      Both post-change runs reproduce `entityValidationAssignmentRepository.test.ts`'s
      legacy-discriminator failure, matching the baseline exactly — confirmed
      pre-existing, unrelated to this change. The second failure slot is flaky and
      rotates across unrelated test files each run (`HttpServerBootstrap.test.ts` in
      baseline, `approvalStatusWorkflowService.test.ts` and
      `hazardousEventDisasterEventBoundary.test.ts` in the two post-change runs — all
      timeouts, none touching `source_catalog` or any file this change modifies) —
      pre-existing suite flakiness, not a regression. Re-run after 5.1-5.4's addition
      (+1 test = 8 total, 584 overall): run 3 times — 2 runs clean at 1 failed / 583
      passed / 584 total (the same pre-existing `entityValidationAssignmentRepository`
      failure); 1 run showed 4 failures across unrelated files (`HttpServerBootstrap`
      and 2 others), reproducing the same pre-existing rotating-flake pattern already
      documented above, not a regression. No new failures introduced by this change at
      any point.
- [x] 6.2 Run `opsx:archive` on this branch before raising the PR (PR targets
      `feature/he-ca-phase2`, not `dev`) — user-controlled, stopping here per
      instructions.
