## 1. `hazardous_event_causality` table

- [x] 1.1 Write failing test
      `tests/integration/db/queries/hazardousEventCausality.test.ts`
      (`import "../setup"`) covering the base scenarios from spec.md: insert with
      distinct, existing `cause_hazardous_event_id`/`effect_hazardous_event_id` succeeds;
      insert with `causality_explanation = NULL` succeeds; `cause_hazardous_event_id =
  NULL` rejected (not-null); `effect_hazardous_event_id = NULL` rejected (not-null); a
      `cause_hazardous_event_id` matching no `hazardous_event` row rejected (FK); an
      `effect_hazardous_event_id` matching no `hazardous_event` row rejected (FK); one
      event can be the cause of multiple effect events (two rows, same cause, different
      effects, both succeed); one event can be the effect of multiple cause events (two
      rows, same effect, different causes, both succeed); two concurrent inserts of
      different causality links sharing the same `cause_hazardous_event_id` both succeed.
      Seed `hazardous_event` rows via the existing `testSchema` fixtures used elsewhere in
      `tests/integration/db/queries/` for this table. Run
      `yarn vitest run tests/integration/db/queries/hazardousEventCausality.test.ts` —
      fails (table doesn't exist).
- [x] 1.2 Add
      `app/domains/hazardous-events/infrastructure/hazardousEventCausalityTable.ts` —
      `id` via `ourRandomUUID()`, `causeHazardousEventId`/`effectHazardousEventId` uuid
      not null `.references(() => hazardousEventTable.id, { onDelete: "cascade" })`
      (importing `hazardousEventTable` from `~/drizzle/schema/hazardousEventTable`),
      `causalityExplanation` text nullable, `createdAt`/`updatedAt`
      timestamp(`{ withTimezone: true }`) not null defaulting to `CURRENT_TIMESTAMP`, an
      `index("hazardous_event_causality_cause_id_idx")` on `causeHazardousEventId`, an
      `index("hazardous_event_causality_effect_id_idx")` on `effectHazardousEventId`, and
      a `check("hazardous_event_causality_cause_effect_distinct_check", ...)` (from
      `drizzle-orm/pg-core`) asserting `cause_hazardous_event_id <>
  effect_hazardous_event_id` — per design.md Decisions 1/2/3/4/8.
- [x] 1.3 Add
      `tests/integration/db/testSchema/hazardousEventCausalityTable.ts` re-exporting it
      and add it to `tests/integration/db/testSchema/index.ts`. Do NOT add it to
      `app/drizzle/schema/index.ts` — per design.md Decision 6.
      `tests/integration/db/testSchema/hazardousEventTable.ts` already exists — no new
      barrel entry needed for the FK target.
- [x] 1.4 Run
      `yarn vitest run tests/integration/db/queries/hazardousEventCausality.test.ts` —
      base scenarios pass.

## 2. Cascade-delete behaviour

- [x] 2.1 Add failing tests (same file, additional `describe`/`it` blocks) covering:
      deleting the `hazardous_event` row referenced as `cause_hazardous_event_id`
      cascades to delete the dependent `hazardous_event_causality` row; deleting the
      `hazardous_event` row referenced as `effect_hazardous_event_id` cascades likewise.
      Run — fails until 1.2 lands, then passes with no further code change.
- [x] 2.2 Run
      `yarn vitest run tests/integration/db/queries/hazardousEventCausality.test.ts` —
      passes.

## 3. Self-reference CHECK constraint

- [x] 3.1 Add a failing test asserting: inserting a row with
      `cause_hazardous_event_id = effect_hazardous_event_id` (both set to the same
      existing `hazardous_event` row's `id`) is rejected by the database-level CHECK
      constraint. Run — fails until 1.2 lands, then passes with no further code change.
- [x] 3.2 Add a test asserting the CHECK constraint does NOT block a multi-hop cycle:
      insert a row where event A causes event B, then a second row where event B causes
      event A — both inserts succeed, confirming the constraint only rejects the
      1-length degenerate case and the general cycle case correctly stays unblocked at
      the DB level (per design.md Decision 5 / roadmap open decision #7).
- [x] 3.3 Run
      `yarn vitest run tests/integration/db/queries/hazardousEventCausality.test.ts` —
      all 13 scenarios pass (9 base, 2 cascade, 2 CHECK-constraint), matching spec.md
      1:1.

## 4. Real migration

- [x] 4.1 Hand-author
      `app/drizzle/migrations/<timestamp>_add_hazardous_event_causality_table.sql` —
      **three top-level statements**, each separated by its own
      `--> statement-breakpoint` line (Postgres has no inline non-unique-index syntax
      inside `CREATE TABLE`, so this migration structurally cannot be a single
      statement — this is the `2c` migration-execution bug's exact shape, not a
      hypothetical, per design.md Decision 9): 1. `CREATE TABLE IF NOT EXISTS hazardous_event_causality` matching the Drizzle
      schema exactly (uuid PK default `gen_random_uuid()`;
      `cause_hazardous_event_id`/`effect_hazardous_event_id` uuid not null, FK to
      `hazardous_event(id)` `ON DELETE CASCADE`; `causality_explanation` text
      nullable; `created_at`/`updated_at` `timestamptz NOT NULL DEFAULT
     CURRENT_TIMESTAMP`; inline `CONSTRAINT
     hazardous_event_causality_cause_effect_distinct_check CHECK
     (cause_hazardous_event_id <> effect_hazardous_event_id)`). 2. `CREATE INDEX hazardous_event_causality_cause_id_idx ON
     hazardous_event_causality (cause_hazardous_event_id)`. 3. `CREATE INDEX hazardous_event_causality_effect_id_idx ON
     hazardous_event_causality (effect_hazardous_event_id)`.
      Same style as `20260907130000_add_hazard_driver_tables.sql` after its `2d`
      post-review correction (tasks.md 7.2), which added indexes the same way.
- [x] 4.2 Add the matching entry to `app/drizzle/migrations/meta/_journal.json`
      (`idx` 50, following the `20260907130000_add_hazard_driver_tables` entry at
      `idx` 49).
- [x] 4.3 Run `yarn dbsync` against a local Postgres and confirm it applies cleanly with
      no errors; verify directly against `information_schema.columns`/
      `information_schema.table_constraints`/`pg_constraint` that the table, both FKs
      (with cascade), the CHECK constraint, and both indexes exist as written (per the
      `2c` migration-execution bug — do not trust a clean `yarn dbsync` exit code
      alone).

## 5. Quality gates

- [x] 5.1 `yarn vitest run tests/integration/db/queries/hazardousEventCausality.test.ts`
      — green.
- [x] 5.2 `yarn tsc` — zero errors.
- [x] 5.3 `yarn format:check` — clean (scoped `npx prettier --check` on the changed `.ts`
      files; `.sql` has no prettier parser, same as prior migrations; `_journal.json`
      kept in its pre-existing 2-space style, matching `2c`/`2d`'s precedent — clean
      append, not a full-file reformat).
- [x] 5.4 Anti-pattern review against `.github/skills/anti-pattern-check/SKILL.md` — no
      findings.
- [x] 5.5 Invoke `solid-reviewer` agent on `hazardousEventCausalityTable.ts` — no SOLID
      violations found.
- [x] 5.6 Documentation review — comments (if any) explain WHY, not WHAT, terse
      single-line only.
- [x] 5.7 Project conventions review against `.github/copilot-instructions.md` — no
      violations.
- [x] 5.8 Run `.github/skills/code-review/SKILL.md` in full. All spec.md scenarios map
      1:1 to a test, no gaps. No findings.
- [x] 5.9 Visual/UX parity — N/A, no presentation-layer file is touched by this change.

## 6. Regression and archive

- [x] 6.1 Run `yarn test:run2` on the base branch (`feature/he-ca-phase2`, before any
      change in this diff) first, record the exact pass/fail/total counts and which
      test(s) fail. Run again after this change's implementation. Confirm the same
      pre-existing failure(s), if any, are unchanged and no new failures were
      introduced — do not label any failure "pre-existing" without this baseline
      comparison.

## 7. Post-review corrections

- [x] 7.1 Independent code review flagged: the CHECK constraint used the `sql`
      tagged template with interpolated `${table.col}` column references,
      contradicting `2a`'s own archived design.md Decision 6 (bare column-name
      strings are the proven-working pattern). Switched to bare
      `cause_hazardous_event_id <> effect_hazardous_event_id` inside the same
      `sql` template, matching `eventCausalityTable.ts`'s actual convention.
      Re-verified: `yarn tsc` clean, all 13 tests still pass, full regression
      re-run — no new failures.
- [x] 7.2 Independent code review also flagged the missing same-tenant constraint on
      cause/effect as resembling Phase 0's untenanted-join bugs. User corrected this:
      it's a real, confirmed business requirement (transboundary hazards genuinely
      cross tenant boundaries), not an oversight — the actual reliable/secure/on-demand
      cross-tenant sharing mechanism is a distinct, unsolved architecture question, out
      of scope here. Reframed `proposal.md`'s Multi-tenancy note and added `design.md`
      Decision 12 + a matching Risks entry; added a cross-reference note to the
      roadmap's `3c` section so this isn't lost before Phase 3 planning.
- [x] 7.3 Run `opsx:archive` on this branch before raising the PR (PR targets
      `feature/he-ca-phase2`, not `dev`).
