## 1. `hazardous_event_spatial_observation` table

- [x] 1.1 Write failing test
      `tests/integration/db/queries/hazardousEventSpatialObservation.test.ts`
      (`import "../setup"`) covering the base scenarios from spec.md: insert with an existing
      `hazardous_event_id` and valid `observation_time` succeeds; insert with `note = NULL`
      succeeds; `hazardous_event_id = NULL` rejected (not-null); `observation_time = NULL`
      rejected (not-null); a `hazardous_event_id` matching no `hazardous_event` row rejected
      (FK); two rows with the same `hazardous_event_id` but different `observation_time`
      values both succeed; a duplicate `(hazardous_event_id, observation_time)` pair rejected
      (unique constraint); two concurrent inserts of different `observation_time` values under
      the same `hazardous_event_id` both succeed. Seed `hazardous_event` rows via the existing
      `testSchema` fixtures used elsewhere in `tests/integration/db/queries/` for this table.
      Run
      `yarn vitest run tests/integration/db/queries/hazardousEventSpatialObservation.test.ts`
      — fails (table doesn't exist).
- [x] 1.2 Add
      `app/domains/hazardous-events/infrastructure/hazardousEventSpatialObservationTable.ts`
      — `id` via `ourRandomUUID()`, `hazardousEventId` uuid not null `.references(() =>
      hazardousEventTable.id, { onDelete: "cascade" })` (importing `hazardousEventTable` from
      `~/drizzle/schema/hazardousEventTable`), `observationTime` timestamp(`{ withTimezone:
      true }`) not null, `note` text nullable, `createdAt`/`updatedAt` timestamp(`{
      withTimezone: true }`) not null defaulting to `CURRENT_TIMESTAMP`, an
      `index("hazardous_event_spatial_observation_hazardous_event_id_idx")` on
      `hazardousEventId`, and a `unique("hazardous_event_spatial_observation_event_id_time_unique")`
      on `(hazardousEventId, observationTime)` — per design.md Decisions 1/2/3/4/7.
- [x] 1.3 Add
      `tests/integration/db/testSchema/hazardousEventSpatialObservationTable.ts` re-exporting
      it and add it to `tests/integration/db/testSchema/index.ts`. Do NOT add it to
      `app/drizzle/schema/index.ts` — per design.md Decision 8.
      `tests/integration/db/testSchema/hazardousEventTable.ts` already exists — no new barrel
      entry needed for the FK target.
- [x] 1.4 Run
      `yarn vitest run tests/integration/db/queries/hazardousEventSpatialObservation.test.ts`
      — base scenarios pass.

## 2. `hazardous_event_spatial_observation` cascade-delete and multi-observation behaviour

- [x] 2.1 Add failing tests (same file, additional `describe`/`it` blocks) covering: deleting
      a `hazardous_event` row cascades to delete its dependent
      `hazardous_event_spatial_observation` rows. Run — fails until 1.2 lands, then passes
      with no further code change.
- [x] 2.2 Run
      `yarn vitest run tests/integration/db/queries/hazardousEventSpatialObservation.test.ts`
      — passes.

## 3. `hazardous_event_spatial_observation_division` join table

- [x] 3.1 Add failing tests (same file, new `describe` block) covering the division scenarios
      from spec.md: insert an association between an existing observation and an existing
      division succeeds; `hazardous_event_spatial_observation_id = NULL` rejected (not-null);
      `division_id = NULL` rejected (not-null); a `hazardous_event_spatial_observation_id`
      matching no row rejected (FK); a `division_id` matching no `division` row rejected (FK);
      an observation can be associated with multiple divisions (two rows, same observation,
      different divisions, both succeed); a division can be reused across observations (two
      rows, same division, different observations, both succeed); a duplicate
      `(hazardous_event_spatial_observation_id, division_id)` pair rejected (unique
      constraint); two concurrent inserts of different division associations sharing the same
      `hazardous_event_spatial_observation_id` both succeed. Seed `division` rows via the
      existing `testSchema` fixtures used elsewhere in `tests/integration/db/queries/` for
      this table. Run — fails (table doesn't exist).
- [x] 3.2 Add
      `app/domains/hazardous-events/infrastructure/hazardousEventSpatialObservationDivisionTable.ts`
      — `id` via `ourRandomUUID()`, `hazardousEventSpatialObservationId` uuid not null
      `.references(() => hazardousEventSpatialObservationTable.id, { onDelete: "cascade" })`,
      `divisionId` uuid not null `.references(() => divisionTable.id)` (**no** `onDelete` —
      matches `hazardousEventDivisionTable`'s existing precedent; importing `divisionTable`
      from `~/drizzle/schema/divisionTable`), `createdAt`/`updatedAt` timestamp(`{
      withTimezone: true }`) not null defaulting to `CURRENT_TIMESTAMP`, an
      `index("hazardous_event_spatial_observation_division_observation_id_idx")` on
      `hazardousEventSpatialObservationId`, an
      `index("hazardous_event_spatial_observation_division_division_id_idx")` on `divisionId`,
      and a `unique("hazardous_event_spatial_observation_division_obs_div_unique")`
      on `(hazardousEventSpatialObservationId, divisionId)` — per design.md Decisions 1/3/7.
      (Name shortened from the originally-drafted
      `..._obs_id_division_id_unique`, which is 70 bytes — over Postgres's 63-byte identifier
      limit; see design.md Risks.)
- [x] 3.3 Add
      `tests/integration/db/testSchema/hazardousEventSpatialObservationDivisionTable.ts`
      re-exporting it and add it to `tests/integration/db/testSchema/index.ts`.
      `tests/integration/db/testSchema/divisionTable.ts` already exists — no new barrel entry
      needed for the FK target.
- [x] 3.4 Run
      `yarn vitest run tests/integration/db/queries/hazardousEventSpatialObservation.test.ts`
      — all division scenarios pass.

## 4. `hazardous_event_spatial_observation_division` cascade/restrict behaviour

- [x] 4.1 Add failing tests (same file) covering: deleting a `hazardous_event_spatial_observation`
      row cascades to delete its dependent `hazardous_event_spatial_observation_division` rows;
      deleting a `division` row that is still referenced by a
      `hazardous_event_spatial_observation_division` row is rejected by the FK constraint (no
      cascade). Run — fails until 3.2 lands, then passes with no further code change.
- [x] 4.2 Run
      `yarn vitest run tests/integration/db/queries/hazardousEventSpatialObservation.test.ts`
      — passes.

## 5. `hazardous_event_spatial_observation_geom` child table

- [x] 5.1 Add failing tests (same file, new `describe` block) covering the geom scenarios from
      spec.md: insert a geometry under an existing observation succeeds; `title = NULL`
      succeeds; `hazardous_event_spatial_observation_id = NULL` rejected (not-null); `geom =
      NULL` rejected (not-null); a `hazardous_event_spatial_observation_id` matching no row
      rejected (FK); an observation can have multiple geometries (two rows, same observation,
      different geom values, both succeed); two concurrent inserts of different geometries
      sharing the same `hazardous_event_spatial_observation_id` both succeed. Run — fails
      (table doesn't exist).
- [x] 5.2 Add
      `app/domains/hazardous-events/infrastructure/hazardousEventSpatialObservationGeomTable.ts`
      — `id` via `ourRandomUUID()`, `hazardousEventSpatialObservationId` uuid not null
      `.references(() => hazardousEventSpatialObservationTable.id, { onDelete: "cascade" })`,
      `geom` via the same `customType<{ data: unknown }>({ dataType: () =>
      "geometry(Geometry,4326)" })` helper pattern as `hazardousEventGeomTable.ts`, `.notNull()`
      `.$type<unknown>()`, `title` text nullable, `createdAt`/`updatedAt` timestamp(`{
      withTimezone: true }`) not null defaulting to `CURRENT_TIMESTAMP`, an
      `index("hazardous_event_spatial_observation_geom_observation_id_idx")` on
      `hazardousEventSpatialObservationId` — per design.md Decisions 1/2/3/6/7.
- [x] 5.3 Add
      `tests/integration/db/testSchema/hazardousEventSpatialObservationGeomTable.ts`
      re-exporting it and add it to `tests/integration/db/testSchema/index.ts`.
- [x] 5.4 Run
      `yarn vitest run tests/integration/db/queries/hazardousEventSpatialObservation.test.ts`
      — all geom scenarios pass.

## 6. `hazardous_event_spatial_observation_geom` cascade-delete behaviour

- [x] 6.1 Add a failing test (same file) covering: deleting a
      `hazardous_event_spatial_observation` row cascades to delete its dependent
      `hazardous_event_spatial_observation_geom` rows. Run — fails until 5.2 lands, then
      passes with no further code change.
- [x] 6.2 Run
      `yarn vitest run tests/integration/db/queries/hazardousEventSpatialObservation.test.ts`
      — all scenarios pass (spec.md's full set across all three tables, 1:1).

## 7. Real migration

- [x] 7.1 Hand-author
      `app/drizzle/migrations/<timestamp>_add_hazardous_event_spatial_observation_tables.sql`
      — **seven top-level statements**, each separated by its own `--> statement-breakpoint`
      line (Postgres has no inline non-unique-index syntax inside `CREATE TABLE`, so this
      migration structurally cannot be fewer statements — the `2c` migration-execution bug's
      exact shape, per design.md Decision 11), in dependency order:
      Statement 1: `CREATE TABLE IF NOT EXISTS hazardous_event_spatial_observation` — uuid PK
      default `gen_random_uuid()`; `hazardous_event_id` uuid not null, FK to
      `hazardous_event(id)` `ON DELETE CASCADE`; `observation_time` timestamptz not null;
      `note` text nullable; `created_at`/`updated_at` `timestamptz NOT NULL DEFAULT
      CURRENT_TIMESTAMP`; inline unique constraint on `(hazardous_event_id, observation_time)`.

      Statement 2: `CREATE TABLE IF NOT EXISTS hazardous_event_spatial_observation_division` —
      uuid PK default `gen_random_uuid()`; `hazardous_event_spatial_observation_id` uuid not
      null, FK to `hazardous_event_spatial_observation(id)` `ON DELETE CASCADE`; `division_id`
      uuid not null, FK to `division(id)` with no `ON DELETE` clause; `created_at`/`updated_at`
      `timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP`; inline unique constraint on
      `(hazardous_event_spatial_observation_id, division_id)`. FK constraint names for both
      child tables' link back to the parent are shortened (`..._obs_id_fk`, not the
      `<table>_<column>_fk` convention) for the same 63-byte reason — see design.md Risks.

      Statement 3: `CREATE TABLE IF NOT EXISTS hazardous_event_spatial_observation_geom` —
      uuid PK default `gen_random_uuid()`; `hazardous_event_spatial_observation_id` uuid not
      null, FK to `hazardous_event_spatial_observation(id)` `ON DELETE CASCADE`; `geom
      geometry(Geometry,4326) NOT NULL`; `title` text nullable; `created_at`/`updated_at`
      `timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP`.

      Statements 4-7: one `CREATE INDEX` each, on `hazardous_event_spatial_observation
      (hazardous_event_id)`, `hazardous_event_spatial_observation_division
      (hazardous_event_spatial_observation_id)`, `hazardous_event_spatial_observation_division
      (division_id)`, and `hazardous_event_spatial_observation_geom
      (hazardous_event_spatial_observation_id)`.

      Same style as `20260907140000_add_hazardous_event_causality_table.sql`.

- [x] 7.2 Add the matching entry to `app/drizzle/migrations/meta/_journal.json` (`idx` 51,
      following the `20260907140000_add_hazardous_event_causality_table` entry at `idx` 50).
- [x] 7.3 Run `yarn dbsync` against a local Postgres and confirm it applies cleanly with no
      errors; verify directly against `information_schema.columns`/
      `information_schema.table_constraints`/`pg_constraint`/`pg_indexes` that all three
      tables, every FK (with correct cascade behavior per Decision 3 — cascade on
      `hazardous_event_id` and both `hazardous_event_spatial_observation_id` columns, RESTRICT
      on `division_id`), both unique constraints, and all four indexes exist as written (per
      the `2c` migration-execution bug — do not trust a clean `yarn dbsync` exit code alone).

## 8. Quality gates

- [x] 8.1 `yarn vitest run tests/integration/db/queries/hazardousEventSpatialObservation.test.ts`
      — green.
- [x] 8.2 `yarn tsc` — zero errors.
- [x] 8.3 `yarn format:check` — clean (scoped `npx prettier --check` on the changed `.ts`
      files; `.sql` has no prettier parser, same as prior migrations; `_journal.json` kept in
      its pre-existing 2-space style, matching `2c`-`2e`'s precedent — clean append, not a
      full-file reformat).
- [x] 8.4 Anti-pattern review against `.github/skills/anti-pattern-check/SKILL.md` — confirm
      no findings.
- [x] 8.5 Invoke `solid-reviewer` agent on the three new table files — confirm no SOLID
      violations.
- [x] 8.6 Documentation review — any comments explain WHY, not WHAT, terse single-line only.
- [x] 8.7 Project conventions review against `.github/copilot-instructions.md` — confirm no
      violations.
- [x] 8.8 Run `.github/skills/code-review/SKILL.md` in full. Confirm every spec.md scenario
      maps 1:1 to a test, no gaps.
- [x] 8.9 Visual/UX parity — N/A, no presentation-layer file is touched by this change.

## 9. Regression and archive

- [x] 9.1 Run `yarn test:run2` on `feature/he-ca-phase2` (this branch's actual base, before
      any change in this diff) first — record the exact pass/fail/total counts and which
      test(s) fail. Run again after this change's implementation. Confirm the same
      pre-existing failure(s), if any, are unchanged and no new failures were introduced — do
      not label any failure "pre-existing" without this baseline comparison.
- [x] 9.2 Run `opsx:archive` on this branch before raising the PR (PR targets
      `feature/he-ca-phase2`, not `dev`).
