## 1. Test schema mirror (prerequisite — not a re-export, per design.md Decision 4)

- [x] 1.1 Update `tests/integration/db/testSchema/hazardousEventTable.ts` to add
      `specificHazardLocalName: text("specific_hazard_local_name")` and
      `specificHazardNationalName: text("specific_hazard_national_name")` (no `.notNull()`, no
      relation entry — design.md Decision 3) to the existing `hazardousEventTable` definition,
      matching the legacy file's own new columns exactly. Verify by diffing the two files' column
      lists (legacy vs. mirror) and confirming they match after this edit.

## 2. `hazardous_event.specific_hazard_local_name` / `specific_hazard_national_name` columns

- [x] 2.1 Write failing test
      `tests/integration/db/queries/hazardousEventSpecificHazardNames.test.ts`
      (`import "../setup"`) covering the base scenarios from spec.md: a `hazardous_event` row can be
      inserted with either/both new columns omitted (`NULL`); a row can be inserted/updated with
      either column set to a non-null string; both columns can be set independently on the same row.
      Seed via `tests/integration/db/models/hazardousEventTestHelpers.ts`'s
      `baseFields`/`seedHazardousEvent` (a bare `hazardous_event` insert fails otherwise — `id` FKs
      to `event`, `hip_type_id` is `NOT NULL`), inserting directly into `hazardousEventTable`
      (bypassing the model layer, matching `2i`'s pattern — neither new column is a model field
      yet, this is a schema-only intent). Run
      `yarn vitest run tests/integration/db/queries/hazardousEventSpecificHazardNames.test.ts` —
      fails (columns don't exist).
- [x] 2.2 Add `specificHazardLocalName: text("specific_hazard_local_name")` and
      `specificHazardNationalName: text("specific_hazard_national_name")` to
      `app/drizzle/schema/hazardousEventTable.ts` — no `.notNull()`, no default, no relation entry,
      no `hazardousEventTableConstraits` entry (design.md Decisions 2 and 3). Do not touch any other
      column on this file.
- [x] 2.3 Run `yarn vitest run tests/integration/db/queries/hazardousEventSpecificHazardNames.test.ts`
      — base scenarios pass.

## 3. Independence and concurrent access

- [x] 3.1 Add a failing test (same file) covering: one column can be set while the other stays
      `NULL` (both directions); both columns can be set to distinct non-null values on the same
      row. Run — fails until 2.2 lands, then passes with no further code change.
- [x] 3.2 Add a failing test (same file) covering: two concurrent inserts of different
      `hazardous_event` rows — one setting `specific_hazard_local_name`, the other setting
      `specific_hazard_national_name` (or both) to distinct non-null values — both succeed
      independently (design.md Decision 9). Run — fails until 2.2 lands, then passes with no
      further code change.
- [x] 3.3 Run `yarn vitest run tests/integration/db/queries/hazardousEventSpecificHazardNames.test.ts`
      — all scenarios in this file pass (spec.md's full
      `hazardous-event-specific-hazard-names-schema` set, 1:1).

## 4. Real migration

- [x] 4.1 Hand-author
      `app/drizzle/migrations/20260909100000_add_specific_hazard_names_to_hazardous_event.sql` — a
      single top-level statement, empirically verified against the live dev DB in design.md
      Decision 5 (no second statement, no `--> statement-breakpoint` needed):

      ```sql
      ALTER TABLE "hazardous_event"
        ADD COLUMN "specific_hazard_local_name" text,
        ADD COLUMN "specific_hazard_national_name" text;
      ```
- [x] 4.2 Add the matching entry to `app/drizzle/migrations/meta/_journal.json` — exactly as pinned
      in design.md Decision 6: `idx` 55, `version` `"7"`, `when` `1788948000000`, `tag`
      `20260909100000_add_specific_hazard_names_to_hazardous_event`, `breakpoints` `true`, following
      the `20260909090000_add_specific_hazard_id_to_hazardous_event` entry at `idx` 54. Hand-edit the
      JSON append — do not run `prettier --write` on `_journal.json`.
- [x] 4.3 Run `yarn dbsync` against a local Postgres and confirm it applies cleanly with no errors;
      verify directly against `information_schema.columns` that both `specific_hazard_local_name`
      and `specific_hazard_national_name` exist on `hazardous_event` as `text`, nullable, no
      default; verify against `pg_constraint`/`pg_indexes` that neither column has a foreign key or
      an index — do not trust a clean `yarn dbsync` exit code alone (per the `2c` migration-
      execution bug precedent).

## 5. Quality gates

- [x] 5.1 `yarn vitest run tests/integration/db/queries/hazardousEventSpecificHazardNames.test.ts` —
      green.
- [x] 5.2 `yarn tsc` — zero errors.
- [x] 5.3 `yarn format:check` — clean (scoped `npx prettier --check` on the changed `.ts` files;
      `.sql` has no prettier parser, same as prior migrations; `_journal.json` kept in its
      pre-existing 2-space style — clean append, not a full-file reformat; preview any `.md` file
      `prettier --write` via a copy first before trusting it).
- [x] 5.4 Anti-pattern review against `.github/skills/anti-pattern-check/SKILL.md` — confirm no
      findings.
- [x] 5.5 Invoke `solid-reviewer` agent on the modified `hazardousEventTable.ts` files — confirm no
      SOLID violations.
- [x] 5.6 Documentation review — any comments explain WHY, not WHAT, terse single-line only.
- [x] 5.7 Project conventions review against `.github/copilot-instructions.md` — confirm no
      violations.
- [x] 5.8 Run `.github/skills/code-review/SKILL.md` in full. Confirm every spec.md scenario in
      `hazardous-event-specific-hazard-names-schema` maps 1:1 to a test, no gaps.
- [x] 5.9 Visual/UX parity — N/A, no presentation-layer file is touched by this change.

## 6. Regression and archive

- [x] 6.1 Run `yarn test:run2` on `feature/he-ca-phase2` at its current head (this branch's actual
      base, before any change in this diff) first — record the exact pass/fail/total counts and
      which test(s) fail, if any. Run again after this change's implementation. Confirm the same
      pre-existing failure(s), if any, are unchanged and no new failures were introduced — do not
      label any failure "pre-existing" without this explicit baseline comparison.
      Baseline: 723 tests (722 passed, 1 failed), 77 files. After: 732 tests (731 passed, 1
      failed), 78 files. Same failure both times:
      entityValidationAssignmentRepository.test.ts > EntityValidationAssignment compatibility >
      model delete removes both legacy and new discriminators. No regression.
- [x] 6.2 Run `opsx:archive` on this branch before raising the PR (PR targets `feature/he-ca-phase2`,
      not `dev`).
