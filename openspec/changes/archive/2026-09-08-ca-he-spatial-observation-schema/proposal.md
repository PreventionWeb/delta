## Why

`hazardous_event` currently has exactly one geom row (`hazardous_event_geom`) and one division
set (`hazardous_event_division`) per event — a single spatial snapshot with no time dimension.
The ER diagram's "Spatial Data" swimlane models a time-series instead: multiple dated
observations per event, each with its own geometry and division set. This intent adds the three
tables enabling that model, inserted between `hazardous_event` and today's snapshot tables
(which stay untouched — superseded, not replaced, per the roadmap's `2f` scope).

## What Changes

- Add `hazardous_event_spatial_observation` (parent): `id`, `hazardous_event_id` FK, `observation_time`
  (timestamptz), `note` (nullable text), `created_at`/`updated_at`. `UNIQUE(hazardous_event_id,
observation_time)` — DB-level defense-in-depth against exact-duplicate-timestamp inserts
  (application-layer conflict check is `3d`/`5e`'s job). Multiple rows per `hazardous_event_id` are
  explicitly permitted — that is the point of the table.
- Add `hazardous_event_spatial_observation_division` (join table): `id`,
  `hazardous_event_spatial_observation_id` FK, `division_id` FK, `created_at`/`updated_at`.
  `UNIQUE(hazardous_event_spatial_observation_id, division_id)`.
- Add `hazardous_event_spatial_observation_geom` (child table — named to avoid colliding with the
  existing, untouched `hazardous_event_geom`; see design.md): `id`,
  `hazardous_event_spatial_observation_id` FK, `geom` (`geometry(Geometry,4326)`, not null),
  `title` (nullable text), `created_at`/`updated_at`.
- Add an `index()` on every FK column across all three tables (four indexes total) — the legacy
  geom/division tables have none of these, and this intent does not repeat that gap.
- Generate and apply a hand-authored migration via `yarn dbsync`.

No route, model, handler, or `fieldsDef` changes — pure schema addition, same scope as `2b`-`2e`.

## Capabilities

### New Capabilities

- `hazardous-event-spatial-observation-schema`: the time-series spatial observation data model
  for hazardous events — parent observation row plus its division and geometry child tables,
  their constraints, cascade behavior, and indexing.

### Modified Capabilities

None. `hazardous_event_geom` and `hazardous_event_division` are unmodified — no delta spec against
either.

## Impact

**Files:**

- `app/domains/hazardous-events/infrastructure/hazardousEventSpatialObservationTable.ts` (new)
- `app/domains/hazardous-events/infrastructure/hazardousEventSpatialObservationDivisionTable.ts` (new)
- `app/domains/hazardous-events/infrastructure/hazardousEventSpatialObservationGeomTable.ts` (new)
- `app/drizzle/migrations/<timestamp>_add_hazardous_event_spatial_observation_tables.sql` (new,
  hand-authored)
- `app/drizzle/migrations/meta/_journal.json` (new entry, idx 51)
- `tests/integration/db/testSchema/hazardousEventSpatialObservationTable.ts` (new, re-export)
- `tests/integration/db/testSchema/hazardousEventSpatialObservationDivisionTable.ts` (new, re-export)
- `tests/integration/db/testSchema/hazardousEventSpatialObservationGeomTable.ts` (new, re-export)
- `tests/integration/db/testSchema/index.ts` (add three barrel exports)
- `tests/integration/db/queries/hazardousEventSpatialObservation.test.ts` (new)

**DB migration required:** yes — three `CREATE TABLE` statements plus four `CREATE INDEX`
statements, applied via `yarn dbsync` (never `drizzle-kit push`).

**Test approach:** PGlite (`yarn test:run2`) — schema/constraint verification only, no route or
domain logic involved.

**Multi-tenancy:** no `country_accounts_id` column on any of the three new tables — tenant scoping
is inherited transitively via `hazardous_event_id` → `hazardous_event.country_accounts_id`, same
pattern as the existing `hazardous_event_geom`/`hazardous_event_division`.

**Security:** none directly — pure schema, no route/auth surface touched. Two cross-package FKs
(into legacy `hazardousEventTable` and legacy, shared `divisionTable`) are flagged in design.md as
narrow, necessary exceptions, not new access paths.
