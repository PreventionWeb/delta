## 1. `hazard_driver` table

- [x] 1.1 Write failing test `tests/integration/db/queries/hazardDriver.test.ts`
      (`import "../setup"`) covering the `hazard_driver` scenarios from spec.md: insert
      under an existing `country_accounts_id` succeeds; insert with `name` omitted is
      rejected (not-null); insert with `country_accounts_id = NULL` is rejected
      (not-null); insert with a `country_accounts_id` matching no `country_accounts` row
      is rejected (FK); two rows with the same `name` under different
      `country_accounts_id` both succeed; two concurrent inserts under the same
      `country_accounts_id` both succeed. Run
      `yarn vitest run tests/integration/db/queries/hazardDriver.test.ts` — fails (table
      doesn't exist).
- [x] 1.2 Add `app/domains/hazardous-events/infrastructure/hazardDriverTable.ts` — `id`
      via `ourRandomUUID()`, `name` text not null, `countryAccountsId` uuid not null
      `.references(() => countryAccountsTable.id, { onDelete: "cascade" })`, `createdAt`/
      `updatedAt` timestamp(`{ withTimezone: true }`) not null defaulting to
      `CURRENT_TIMESTAMP` — per design.md Decisions 1/2.
- [x] 1.3 Add `tests/integration/db/testSchema/hazardDriverTable.ts` re-exporting it
      (design.md Decision 9) and add it to `tests/integration/db/testSchema/index.ts`.
      Do NOT add it to `app/drizzle/schema/index.ts` — per design.md Decision 4.
- [x] 1.4 Run `yarn vitest run tests/integration/db/queries/hazardDriver.test.ts` —
      `hazard_driver` scenarios pass.

## 2. `hazard_driver` cascade-delete behaviour

- [x] 2.1 Add a failing test (same file, additional `describe`/`it` block) covering:
      deleting a `country_accounts` row cascades to delete its dependent `hazard_driver`
      rows. Run it — fails until 1.2 lands, then passes with no further code change.
- [x] 2.2 Run `yarn vitest run tests/integration/db/queries/hazardDriver.test.ts` —
      passes.

## 3. `hazardous_event_hazard_driver` join table

- [x] 3.1 Add failing tests (same file, new `describe` block) covering the join-table
      scenarios from spec.md: insert an association between an existing event and an
      existing driver succeeds; `hazardous_event_id = NULL` rejected (not-null);
      `hazard_driver_id = NULL` rejected (not-null); a `hazardous_event_id` matching no
      `hazardous_event` row rejected (FK); a `hazard_driver_id` matching no
      `hazard_driver` row rejected (FK); an event can have multiple drivers (two rows,
      same event, different drivers, both succeed); a driver can be reused across events
      (two rows, same driver, different events, both succeed); two concurrent inserts of
      different associations sharing the same `hazardous_event_id` both succeed. Run —
      fails (table doesn't exist). Seed a `hazardous_event` row via the existing
      `testSchema` fixtures used elsewhere in `tests/integration/db/queries/` for this
      table.
- [x] 3.2 Add
      `app/domains/hazardous-events/infrastructure/hazardousEventHazardDriverTable.ts` —
      `id` via `ourRandomUUID()`, `hazardousEventId` uuid not null
      `.references(() => hazardousEventTable.id, { onDelete: "cascade" })`,
      `hazardDriverId` uuid not null
      `.references(() => hazardDriverTable.id, { onDelete: "cascade" })`, `createdAt`/
      `updatedAt` timestamp(`{ withTimezone: true }`) not null defaulting to
      `CURRENT_TIMESTAMP` — per design.md Decisions 1/3/6. Import `hazardousEventTable`
      from `~/drizzle/schema/hazardousEventTable` (the one cross-package import in this
      change).
- [x] 3.3 Add
      `tests/integration/db/testSchema/hazardousEventHazardDriverTable.ts` re-exporting
      it and add it to `tests/integration/db/testSchema/index.ts`.
      `tests/integration/db/testSchema/hazardousEventTable.ts` already exists — no new
      barrel entry needed for the FK target.
- [x] 3.4 Run `yarn vitest run tests/integration/db/queries/hazardDriver.test.ts` — all
      join-table scenarios pass.

## 4. `hazardous_event_hazard_driver` cascade-delete behaviour

- [x] 4.1 Add failing tests (same file) covering: deleting a `hazardous_event` row
      cascades to delete its dependent `hazardous_event_hazard_driver` rows; deleting a
      `hazard_driver` row cascades to delete its dependent
      `hazardous_event_hazard_driver` rows. Run — fails until 3.2 lands, then passes with
      no further code change.
- [x] 4.2 Run `yarn vitest run tests/integration/db/queries/hazardDriver.test.ts` — all
      scenarios (17 total: 6 for `hazard_driver`, 1 cascade, 8 for the join table, 2
      cascade) pass.

## 5. Real migration

- [x] 5.1 Hand-author
      `app/drizzle/migrations/20260907130000_add_hazard_driver_tables.sql` — two
      `CREATE TABLE IF NOT EXISTS` statements matching the Drizzle schemas exactly (uuid
      PK default `gen_random_uuid()`; `hazard_driver` first with its FK to
      `country_accounts(id)` `ON DELETE CASCADE`; `hazardous_event_hazard_driver` second
      with FKs to `hazardous_event(id)` and `hazard_driver(id)`, both `ON DELETE
  CASCADE`; `created_at`/`updated_at` `timestamptz NOT NULL DEFAULT
  CURRENT_TIMESTAMP` on both) — separated by `--> statement-breakpoint` per design.md
      Decision 8, same style as `20260907120000_add_source_catalog_table.sql`.
- [x] 5.2 Add the matching entry to `app/drizzle/migrations/meta/_journal.json` (`idx`
      49, following the `20260907120000_add_source_catalog_table` entry).
- [x] 5.3 Run `yarn dbsync` against a local Postgres and confirm it applies cleanly with
      no errors; verify directly against `information_schema.columns`/
      `information_schema.table_constraints` that both tables, all FKs, and the cascade
      rules exist as written (per the `2c` migration-execution bug — do not trust a
      clean `yarn dbsync` exit code alone).

## 6. Quality gates

- [x] 6.1 `yarn vitest run tests/integration/db/queries/hazardDriver.test.ts` — green.
- [x] 6.2 `yarn tsc` — zero errors.
- [x] 6.3 `yarn format:check` — clean (scoped `npx prettier --check` on ts files).
      `.sql` has no prettier parser (same as prior migrations). `_journal.json` kept
      in its pre-existing 2-space style, matching `2c`'s precedent (clean append, not
      a full-file reformat).
- [x] 6.4 Anti-pattern review against `.github/skills/anti-pattern-check/SKILL.md` — no
      findings.
- [x] 6.5 Invoke `solid-reviewer` agent on `hazardDriverTable.ts` and
      `hazardousEventHazardDriverTable.ts` — no SOLID violations found.
- [x] 6.6 Documentation review — comments (if any) explain WHY, not WHAT.
- [x] 6.7 Project conventions review against `.github/copilot-instructions.md` — no
      violations.
- [x] 6.8 Run `.github/skills/code-review/SKILL.md` in full. All 17 spec.md scenarios
      (7 `hazard_driver`, 10 join table) map 1:1 to a test, no gaps. No findings.
- [x] 6.9 Visual/UX parity — N/A, no presentation-layer file is touched by this change.

## 7. Post-review correction — `UNIQUE` + indexes on the join table

- [x] 7.1 Independent code review flagged: `hazardous_event_hazard_driver` had no
      composite uniqueness or FK indexes, unlike the closer precedent
      `disasterEventAssessmentSectorTable.ts` (a pure two-FK join table with both). Added
      `unique("hazardous_event_hazard_driver_event_id_driver_id_unique")` on
      `(hazardous_event_id, hazard_driver_id)`, plus an `index()` on each FK column, and
      `index("hazard_driver_country_accounts_id_idx")` on `hazard_driver` (which had lost
      its only index when the uniqueness-on-name constraint was deliberately not added) —
      per design.md Decision 3a.
- [x] 7.2 Updated `spec.md` (new required rule + "cannot be associated twice" scenario)
      and the hand-authored migration (added the two new indexes + the join table's
      unique constraint, each separated by its own `--> statement-breakpoint`).
- [x] 7.3 Fixed a duplicated test helper: `hazardDriver.test.ts` reimplemented
      `insertCountryAccount()` instead of reusing `seedCountryAccount()`, already
      exported from `hazardousEventTestHelpers.ts` (which this file already imports from
      for `seedHazardousEvent`). Replaced all 6 call sites; removed the now-unused
      `countriesTable` import.
- [x] 7.4 Added a test asserting a duplicate `(hazardous_event_id, hazard_driver_id)`
      insert is rejected. Re-ran the full test file — all 18 tests green.
- [x] 7.5 Re-verified the migration from a clean drop (both tables + tracking row):
      `yarn dbsync` recreates both tables, all indexes, and the unique constraint exactly
      as written, confirmed directly via `pg_indexes`/`pg_constraint` — not just a clean
      exit code.

## 8. Regression and archive

- [x] 8.1 Ran `yarn test:run2` on `feature/he-ca-phase2` (this branch's actual base,
      before any change in this diff) first: 1 failed / 583 passed / 584 total, 68/69
      files — the 1 failure is `entityValidationAssignmentRepository.test.ts >
  EntityValidationAssignment compatibility > model delete removes both legacy and
  new discriminators`, pre-existing and unrelated to this change. Ran again after the
      original implementation: 1 failed / 600 passed / 601 total (17 new tests). Ran once
      more after 7.1-7.4's addition (+1 test = 18 total, 602 overall): same single
      pre-existing failure, no new failures at any point.
- [x] 8.2 Run `opsx:archive` on this branch before raising the PR (PR targets
      `feature/he-ca-phase2`, not `dev`).
