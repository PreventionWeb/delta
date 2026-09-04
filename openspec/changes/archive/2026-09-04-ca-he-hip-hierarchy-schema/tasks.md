## 1. `hips_version` (no dependency — build first)

- [x] 1.1 Write failing test `tests/integration/db/queries/hipsVersion.test.ts` (`import "../setup"`) covering: insert with `version_no` succeeds; insert with `version_no` omitted is rejected. Run `yarn vitest run tests/integration/db/queries/hipsVersion.test.ts` — fails (table doesn't exist).
- [x] 1.2 Add `app/domains/hazardous-events/infrastructure/hipsVersionTable.ts` (`id` via `ourRandomUUID()`, `version_no` text not null) per design.md Decision 1/3/7.
- [x] 1.3 Add `tests/integration/db/testSchema/hipsVersionTable.ts` re-exporting it (design.md Decision 8) and add both to `app/drizzle/schema/index.ts` and `tests/integration/db/testSchema/index.ts`.
- [x] 1.4 Run `yarn vitest run tests/integration/db/queries/hipsVersion.test.ts` — passes.

## 2. `hazard_type` (depends on `hips_version`)

- [x] 2.1 Write failing test `tests/integration/db/queries/hazardType.test.ts` covering: insert under an existing `hips_version_id` succeeds; insert with an unknown `hips_version_id` is rejected (FK); insert with `hips_version_id = NULL` is rejected (not-null). Run it — fails.
- [x] 2.2 Add `app/domains/hazardous-events/infrastructure/hazardTypeTable.ts` (`id`, `name` not null, `hips_version_id` uuid not null FK → `hipsVersionTable.id`, no `onDelete`) per design.md Decisions 1/2/4/5.
- [x] 2.3 Add matching `tests/integration/db/testSchema/hazardTypeTable.ts` re-export; add both to the two barrels.
- [x] 2.4 Run the test — passes.

## 3. `hazard_cluster` (depends on `hazard_type`)

- [x] 3.1 Write failing test `tests/integration/db/queries/hazardCluster.test.ts` covering: insert under an existing `hazard_type_id` succeeds; insert with an unknown `hazard_type_id` is rejected; insert with `hazard_type_id = NULL` is rejected (added during code review, gate 7.8, to match design.md Decision 4's NOT NULL on all three chain FKs — spec.md updated to match). Run it — fails.
- [x] 3.2 Add `app/domains/hazardous-events/infrastructure/hazardClusterTable.ts` (`id`, `name` not null, `hazard_type_id` uuid not null FK → `hazardTypeTable.id`).
- [x] 3.3 Add matching testSchema re-export; add to both barrels.
- [x] 3.4 Run the test — passes.

## 4. `specific_hazard` (depends on `hazard_cluster`)

- [x] 4.1 Write failing test `tests/integration/db/queries/specificHazard.test.ts` covering: insert under an existing `hazard_cluster_id` succeeds; insert with an unknown `hazard_cluster_id` is rejected; insert with `hazard_cluster_id = NULL` is rejected. Run it — fails.
- [x] 4.2 Add `app/domains/hazardous-events/infrastructure/specificHazardTable.ts` (`id`, `name` not null, `code` not null, `hazard_cluster_id` uuid not null FK → `hazardClusterTable.id`).
- [x] 4.3 Add matching testSchema re-export; add to both barrels.
- [x] 4.4 Run the test — passes.

## 5. Chain integrity

- [x] 5.1 Write failing test `tests/integration/db/queries/hipHierarchyChain.test.ts` covering: deleting a `hazard_cluster` referenced by a `specific_hazard` row is rejected; two concurrent inserts of different `specific_hazard` rows against the same existing `hazard_cluster_id` both succeed. Run it — fails until 1–4 are done, then passes with no further code change.
- [x] 5.2 Run `yarn vitest run tests/integration/db/queries/hipHierarchyChain.test.ts` — passes.

## 6. Real migration

- [x] 6.1 Hand-author `app/drizzle/migrations/<timestamp>_add_hip_hierarchy_tables.sql` — 4 `CREATE TABLE IF NOT EXISTS` statements matching the Drizzle schemas exactly (uuid PK default `gen_random_uuid()`, FK constraints, no cascade), same style as `20260902120000_add_workflow_tables.sql`.
- [x] 6.2 Add the matching entry to `app/drizzle/migrations/meta/_journal.json`.
- [x] 6.3 Run `yarn dbsync` against a local Postgres and confirm it applies cleanly with no errors.

## 7. Quality gates

- [x] 7.1 `yarn vitest run tests/integration/db/queries/hipsVersion.test.ts tests/integration/db/queries/hazardType.test.ts tests/integration/db/queries/hazardCluster.test.ts tests/integration/db/queries/specificHazard.test.ts tests/integration/db/queries/hipHierarchyChain.test.ts` — all green.
- [x] 7.2 `yarn tsc` — zero errors.
- [x] 7.3 `yarn format:check` — clean (or `yarn format` on changed files only, never repo-wide).
- [x] 7.4 Anti-pattern review against `.github/skills/anti-pattern-check/SKILL.md`.
- [x] 7.5 Invoke `solid-reviewer` agent on the 4 new schema files.
- [x] 7.6 Documentation review — comments (if any) explain WHY, not WHAT.
- [x] 7.7 Project conventions review against `.github/copilot-instructions.md`.
- [x] 7.8 Run `.github/skills/code-review/SKILL.md` in full. One finding: `hazard_cluster` spec was missing a `hazard_type_id` NOT NULL scenario present on the other three tables (design.md Decision 4 covers all three chain FKs); added the scenario to spec.md and the matching test, gates 1/2/3 re-verified green.
- [x] 7.9 Visual/UX parity — N/A, no presentation-layer file is touched by this change.

## 8. Regression and archive

- [x] 8.1 Run `yarn test:run2` (full PGlite suite) — no new failures vs. `feature/he-ca-phase2` baseline; any pre-existing failure confirmed pre-existing by running the same suite on that baseline first. Baseline (pre-change, on `feature/he-ca-phase2`): 561/563 passed, 2 failures (`HttpServerBootstrap.test.ts` 15s timeout, `entityValidationAssignmentRepository.test.ts` legacy-discriminator assertion). After: 575/576 passed, 1 failure (`entityValidationAssignmentRepository.test.ts`, identical pre-existing assertion). `HttpServerBootstrap.test.ts` did not fail this run — a timing-dependent flake unrelated to this schema-only change. No new failures; +13 tests across the 5 new files accounted for exactly.
- [x] 8.2 **Post-review correction — schema location (design.md Decision 7):** initially placed the 4 tables in `app/drizzle/schema/`, justified by citing existing Notices/Track B convention without checking that convention against ADR-009. Corrected: moved all 4 files to `app/domains/hazardous-events/infrastructure/`, removed their exports from `app/drizzle/schema/index.ts`, updated the 4 `testSchema` re-exports and all import paths across the 5 test files. Verified HIP hierarchy is not HE-exclusive (Disaster Event/Disaster Records also consume the legacy tables) before deciding placement; user's explicit call: HE's own `infrastructure/` for now (no CA domain exists yet for the shared consumers, no real domain behavior on this data today), revisit and extract to `app/shared/`/`app/infrastructure/` once Disaster Events' CA migration starts. `yarn tsc`/full regression re-verified green after the move.
- [x] 8.3 Run `opsx:archive` on this branch before raising the PR (PR targets `feature/he-ca-phase2`, not `dev`) — user-controlled, stopping here per instructions.
