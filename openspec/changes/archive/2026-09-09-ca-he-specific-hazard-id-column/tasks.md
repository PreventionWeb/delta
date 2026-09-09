## 1. Test schema mirror (prerequisite — not a re-export, per design.md Decision 7)

- [x] 1.1 Update `tests/integration/db/testSchema/hazardousEventTable.ts` to add the
      `specificHazardId` column (`uuid("specific_hazard_id").references(() =>
      specificHazardTable.id)` — no explicit constraint name, matching this file's existing
      `hipHazardId`/`hipClusterId`/`hipTypeId` style) and a `specificHazard: one(specificHazardTable,
      { fields: [hazardousEventTable.specificHazardId], references: [specificHazardTable.id] })`
      entry in the `hazardousEventRel` block, importing `specificHazardTable` from the sibling
      `../testSchema/specificHazardTable` (a real re-export of `2b`'s table) — matching how this
      mirror already imports `hipHazardTable`/`hipClusterTable`/`hipTypeTable` from their own
      `../testSchema/*` siblings. This file is a hand duplicate of the legacy schema, not a
      re-export — it will not pick up the column automatically. Per design.md Decision 8, verified
      no import cycle (`specificHazardTable` → `hazardClusterTable` → `hazardTypeTable`, none
      reference back to `hazardousEventTable`).

## 2. `hazardous_event.specific_hazard_id` column

- [x] 2.1 Write failing test
      `tests/integration/db/queries/hazardousEventSpecificHazard.test.ts` (`import "../setup"`)
      covering the base scenarios from spec.md: a `hazardous_event` row can be inserted with
      `specific_hazard_id` omitted/`NULL`; a `hazardous_event` row can be inserted/updated with
      `specific_hazard_id` set to an existing `specific_hazard` row's `id`; a `specific_hazard_id`
      matching no `specific_hazard` row is rejected (FK violation). Seed via
      `tests/integration/db/models/hazardousEventTestHelpers.ts`'s `seedHazardousEvent`/`baseFields`
      (needed because a bare `hazardous_event` insert fails otherwise — `id` FKs to `event`, and
      `hip_type_id` is `NOT NULL`) plus a directly-inserted `specific_hazard` row (seed its
      `hazard_cluster`/`hazard_type` dependency chain the same way `hazardTypeFieldDefinitionTestHelpers.ts`
      does for `2h`). Run
      `yarn vitest run tests/integration/db/queries/hazardousEventSpecificHazard.test.ts` — fails
      (column doesn't exist).
- [x] 2.2 Add `specificHazardId: uuid("specific_hazard_id").references(() =>
      specificHazardTable.id)` to `app/drizzle/schema/hazardousEventTable.ts` — no explicit
      constraint name (design.md Decision 4), no `onDelete` (design.md Decision 2), no `index()`
      call (design.md Decision 6). Import `specificHazardTable` from
      `~/domains/hazardous-events/infrastructure/specificHazardTable`. Add
      `specificHazard: one(specificHazardTable, { fields:
      [hazardousEventTable.specificHazardId], references: [specificHazardTable.id] })` to the
      existing `hazardousEventRel` block (design.md Decision 3). Add
      `specificHazardId: "hazardous_event_specific_hazard_id_specific_hazard_id_fk"` to the
      existing `hazardousEventTableConstraits` object (design.md Decision 4/5 — this object is a
      live consumer via `checkConstraintError`, not inert documentation; confirm the addition does
      not affect any existing call site, since no current route/model writes this column).
- [x] 2.3 Run `yarn vitest run tests/integration/db/queries/hazardousEventSpecificHazard.test.ts`
      — base scenarios pass.

## 3. Restrict-on-delete behaviour

- [x] 3.1 Add a failing test (same file) covering: deleting a `specific_hazard` row that is still
      referenced by a `hazardous_event` row is rejected by the foreign key constraint (RESTRICT,
      no cascade, no silent null-out — confirms design.md Decision 2). Run — fails until 2.2 lands,
      then passes with no further code change.
- [x] 3.2 Run `yarn vitest run tests/integration/db/queries/hazardousEventSpecificHazard.test.ts`
      — passes.

## 4. Concurrent access

- [x] 4.1 Add a failing test (same file) covering: two concurrent inserts of different
      `hazardous_event` rows, both setting `specific_hazard_id` to the same existing
      `specific_hazard` row's `id`, both succeed — confirms the diagram's edge is one-to-many, not
      one-to-one, and matches the concurrent-access precedent already established in
      `hazardTypeFieldDefinition.test.ts`. Run — fails until 2.2 lands, then passes with no further
      code change.
- [x] 4.2 Run `yarn vitest run tests/integration/db/queries/hazardousEventSpecificHazard.test.ts`
      — all scenarios in this file pass (spec.md's full `hazardous-event-specific-hazard-schema`
      set, 1:1).

## 5. Real migration

- [x] 5.1 Hand-author
      `app/drizzle/migrations/20260909090000_add_specific_hazard_id_to_hazardous_event.sql` — a
      single top-level statement, empirically verified against the live dev DB in design.md
      Decision 9 (no second `ADD CONSTRAINT` statement, no `--> statement-breakpoint` needed since
      there is only one statement):

      ```sql
      ALTER TABLE "hazardous_event"
        ADD COLUMN "specific_hazard_id" uuid
        CONSTRAINT "hazardous_event_specific_hazard_id_specific_hazard_id_fk"
        REFERENCES "specific_hazard"("id");
      ```
- [x] 5.2 Add the matching entry to `app/drizzle/migrations/meta/_journal.json` — exactly as
      pinned in design.md Decision 10: `idx` 54, `version` `"7"`, `when` `1788944400000`, `tag`
      `20260909090000_add_specific_hazard_id_to_hazardous_event`, `breakpoints` `true`, following
      the `20260907170000_add_hazard_type_field_tables` entry at `idx` 53.
- [x] 5.3 Run `yarn dbsync` against a local Postgres and confirm it applies cleanly with no
      errors; verify directly against `information_schema.columns`/`pg_constraint` that
      `specific_hazard_id` exists on `hazardous_event` as `uuid`, nullable, with exactly the FK
      named `hazardous_event_specific_hazard_id_specific_hazard_id_fk` and no `ON DELETE` clause,
      and that no index was created on it (per the `2c` migration-execution bug — do not trust a
      clean `yarn dbsync` exit code alone).

## 6. Quality gates

- [x] 6.1 `yarn vitest run tests/integration/db/queries/hazardousEventSpecificHazard.test.ts` —
      green.
- [x] 6.2 `yarn tsc` — zero errors.
- [x] 6.3 `yarn format:check` — clean (scoped `npx prettier --check` on the changed `.ts` files;
      `.sql` has no prettier parser, same as prior migrations; `_journal.json` kept in its
      pre-existing 2-space style — clean append, not a full-file reformat).
- [x] 6.4 Anti-pattern review against `.github/skills/anti-pattern-check/SKILL.md` — confirm no
      findings.
- [x] 6.5 Invoke `solid-reviewer` agent on the modified `hazardousEventTable.ts` files — confirm
      no SOLID violations.
- [x] 6.6 Documentation review — any comments explain WHY, not WHAT, terse single-line only.
- [x] 6.7 Project conventions review against `.github/copilot-instructions.md` — confirm no
      violations.
- [x] 6.8 Run `.github/skills/code-review/SKILL.md` in full. Confirm every spec.md scenario in
      `hazardous-event-specific-hazard-schema` maps 1:1 to a test, no gaps.
- [x] 6.9 Visual/UX parity — N/A, no presentation-layer file is touched by this change.

## 7. Regression and archive

- [x] 7.1 Run `yarn test:run2` on `feature/he-ca-phase2` @ `25280fe0` (this branch's actual base,
      before any change in this diff) first — record the exact pass/fail/total counts and which
      test(s) fail, if any. Run again after this change's implementation. Confirm the same
      pre-existing failure(s), if any, are unchanged and no new failures were introduced — do not
      label any failure "pre-existing" without this baseline comparison.

      Result: ran full suite 3 times total (2x on clean `25280fe0` base via `git stash`, 1x with
      this change implemented). `tests/integration/db/queries/entityValidationAssignmentRepository.test.ts`
      ("model delete removes both legacy and new discriminators") fails deterministically in all
      three runs, unrelated to this change (EntityValidationAssignment legacy/new discriminator
      compatibility, no relation to `hazardous_event`/`specific_hazard`) — genuine pre-existing
      failure per baseline comparison. Two other files
      (`tests/integration/nestjs/HttpServerBootstrap.test.ts`,
      `tests/integration/db/models/hazardousEventDisasterEventBoundary.test.ts`,
      `tests/integration/domains/notices/NoticesController.test.ts`) failed with timeouts in some
      runs but not others — including on the unmodified base commit across its own two runs (first
      base run failed `HttpServerBootstrap`, second base run did not) — confirming these are
      parallel-load timing flakes, not deterministic regressions; each passed cleanly when run in
      isolation. The new `hazardousEventSpecificHazard.test.ts` file (6 tests) passed in every run.
      No regression introduced by this change.
- [x] 7.2 Run `opsx:archive` on this branch before raising the PR (PR targets `feature/he-ca-phase2`,
      not `dev`).
