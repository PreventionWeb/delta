# hazardous-event-spatial-observation-schema Specification

## Purpose
Defines the persisted shape of the time-series spatial observation model for hazardous events:
`hazardous_event_spatial_observation` (one dated observation per event), and its two child tables
`hazardous_event_spatial_observation_division` and `hazardous_event_spatial_observation_geom`.
This spec covers schema-level observable behaviour only: what a direct insert/query against
these tables must accept or reject.

## Requirements

### Requirement: `hazardous_event_spatial_observation` table shape and constraints

The `hazardous_event_spatial_observation` table MUST persist one row per dated spatial
observation of a `hazardous_event`, with columns `id` (UUID primary key), `hazardous_event_id`
(UUID, not null, FK to `hazardous_event.id`, cascade on delete), `observation_time` (timestamptz,
not null), `note` (text, nullable), `created_at` (timestamptz, not null), and `updated_at`
(timestamptz, not null). Multiple rows MUST be permitted for the same `hazardous_event_id`. The
same `(hazardous_event_id, observation_time)` pair MUST NOT be persisted twice.

#### Scenario: Insert an observation under an existing hazardous event

- **WHEN** a row is inserted with `hazardous_event_id` matching an existing `hazardous_event`
  row and a valid `observation_time`
- **THEN** the insert succeeds

#### Scenario: `note` is optional

- **WHEN** a row is inserted with `note = NULL` and otherwise valid `hazardous_event_id` and
  `observation_time`
- **THEN** the insert succeeds

#### Scenario: `hazardous_event_id` is required

- **WHEN** a row is inserted with `hazardous_event_id = NULL`
- **THEN** the insert is rejected by a database-level not-null constraint

#### Scenario: `observation_time` is required

- **WHEN** a row is inserted with `observation_time = NULL`
- **THEN** the insert is rejected by a database-level not-null constraint

#### Scenario: `hazardous_event_id` must reference an existing hazardous event

- **WHEN** a row is inserted with a `hazardous_event_id` that matches no row in
  `hazardous_event`
- **THEN** the insert is rejected by the foreign key constraint

#### Scenario: Deleting the referenced hazardous event cascades

- **WHEN** a `hazardous_event` row is deleted while a `hazardous_event_spatial_observation`
  row still references its `id`
- **THEN** the dependent `hazardous_event_spatial_observation` row is deleted along with it,
  per the `onDelete: "cascade"` constraint on `hazardous_event_id`

#### Scenario: A hazardous event can have multiple dated observations

- **WHEN** two rows are inserted with the same `hazardous_event_id` but different
  `observation_time` values, both otherwise valid
- **THEN** both inserts succeed — no uniqueness constraint limits an event to a single
  observation; this is the time-series model this table exists to support

#### Scenario: The same event cannot have two observations at the exact same time

- **WHEN** a row is inserted with `hazardous_event_id` and `observation_time` matching an
  existing `hazardous_event_spatial_observation` row's `hazardous_event_id` and
  `observation_time` exactly
- **THEN** the insert is rejected by a database-level unique constraint — the DB-level half of
  a rule the application layer also enforces; this constraint does not by itself satisfy that
  domain-layer rule

#### Scenario: Concurrent inserts of different observations under the same event both succeed

- **WHEN** two callers concurrently insert two `hazardous_event_spatial_observation` rows with
  different `observation_time` values that both reference the same existing
  `hazardous_event_id`, before either transaction commits
- **THEN** both inserts succeed — the FK and unique constraints validate each row independently
  and do not serialize unrelated inserts against the same parent

### Requirement: `hazardous_event_spatial_observation_division` table shape and constraints

The `hazardous_event_spatial_observation_division` table MUST persist one row per (spatial
observation, division) association, with columns `id` (UUID primary key),
`hazardous_event_spatial_observation_id` (UUID, not null, FK to
`hazardous_event_spatial_observation.id`, cascade on delete), `division_id` (UUID, not null, FK
to `division.id`, no cascade), `created_at` (timestamptz, not null), and `updated_at`
(timestamptz, not null). The same `(hazardous_event_spatial_observation_id, division_id)` pair
MUST NOT be persisted twice.

#### Scenario: Insert an association between an existing observation and an existing division

- **WHEN** a row is inserted with `hazardous_event_spatial_observation_id` matching an existing
  `hazardous_event_spatial_observation` row and `division_id` matching an existing `division` row
- **THEN** the insert succeeds

#### Scenario: `hazardous_event_spatial_observation_id` is required

- **WHEN** a row is inserted with `hazardous_event_spatial_observation_id = NULL`
- **THEN** the insert is rejected by a database-level not-null constraint

#### Scenario: `division_id` is required

- **WHEN** a row is inserted with `division_id = NULL`
- **THEN** the insert is rejected by a database-level not-null constraint

#### Scenario: `hazardous_event_spatial_observation_id` must reference an existing observation

- **WHEN** a row is inserted with a `hazardous_event_spatial_observation_id` that matches no
  row in `hazardous_event_spatial_observation`
- **THEN** the insert is rejected by the foreign key constraint

#### Scenario: `division_id` must reference an existing division

- **WHEN** a row is inserted with a `division_id` that matches no row in `division`
- **THEN** the insert is rejected by the foreign key constraint

#### Scenario: Deleting the referenced spatial observation cascades

- **WHEN** a `hazardous_event_spatial_observation` row is deleted while a
  `hazardous_event_spatial_observation_division` row still references its `id`
- **THEN** the dependent `hazardous_event_spatial_observation_division` row is deleted along
  with it, per the `onDelete: "cascade"` constraint on `hazardous_event_spatial_observation_id`

#### Scenario: Deleting the referenced division is blocked while still associated

- **WHEN** a `division` row is deleted while a `hazardous_event_spatial_observation_division`
  row still references its `id`
- **THEN** the delete is rejected by the foreign key constraint — `division_id` has no cascade,
  matching the existing `hazardous_event_division` table's treatment of the same reference

#### Scenario: A spatial observation can be associated with multiple divisions

- **WHEN** two rows are inserted with the same `hazardous_event_spatial_observation_id` but
  different `division_id` values, both referencing existing rows
- **THEN** both inserts succeed — no uniqueness constraint prevents an observation from spanning
  more than one division

#### Scenario: A division can be associated with multiple spatial observations

- **WHEN** two rows are inserted with the same `division_id` but different
  `hazardous_event_spatial_observation_id` values, both referencing existing rows
- **THEN** both inserts succeed — no uniqueness constraint prevents a division from being
  reused across observations

#### Scenario: The same observation cannot be associated with the same division twice

- **WHEN** a row is inserted with `hazardous_event_spatial_observation_id` and `division_id`
  matching an existing `hazardous_event_spatial_observation_division` row's values exactly
- **THEN** the insert is rejected by a database-level unique constraint

#### Scenario: Concurrent inserts of different division associations both succeed

- **WHEN** two callers concurrently insert two `hazardous_event_spatial_observation_division`
  rows with different `division_id` values that both reference the same existing
  `hazardous_event_spatial_observation_id`, before either transaction commits
- **THEN** both inserts succeed — each FK and unique constraint validates its own row
  independently and does not serialize unrelated inserts against the same parent

### Requirement: `hazardous_event_spatial_observation_geom` table shape and constraints

The `hazardous_event_spatial_observation_geom` table MUST persist one row per geometry recorded
against a spatial observation, with columns `id` (UUID primary key),
`hazardous_event_spatial_observation_id` (UUID, not null, FK to
`hazardous_event_spatial_observation.id`, cascade on delete), `geom` (`geometry(Geometry,4326)`,
not null), `title` (text, nullable), `created_at` (timestamptz, not null), and `updated_at`
(timestamptz, not null).

#### Scenario: Insert a geometry under an existing spatial observation

- **WHEN** a row is inserted with `hazardous_event_spatial_observation_id` matching an existing
  `hazardous_event_spatial_observation` row and a valid `geom` value
- **THEN** the insert succeeds

#### Scenario: `title` is optional

- **WHEN** a row is inserted with `title = NULL` and otherwise valid
  `hazardous_event_spatial_observation_id` and `geom`
- **THEN** the insert succeeds

#### Scenario: `hazardous_event_spatial_observation_id` is required

- **WHEN** a row is inserted with `hazardous_event_spatial_observation_id = NULL`
- **THEN** the insert is rejected by a database-level not-null constraint

#### Scenario: `geom` is required

- **WHEN** a row is inserted with `geom = NULL`
- **THEN** the insert is rejected by a database-level not-null constraint

#### Scenario: `hazardous_event_spatial_observation_id` must reference an existing observation

- **WHEN** a row is inserted with a `hazardous_event_spatial_observation_id` that matches no
  row in `hazardous_event_spatial_observation`
- **THEN** the insert is rejected by the foreign key constraint

#### Scenario: Deleting the referenced spatial observation cascades

- **WHEN** a `hazardous_event_spatial_observation` row is deleted while a
  `hazardous_event_spatial_observation_geom` row still references its `id`
- **THEN** the dependent `hazardous_event_spatial_observation_geom` row is deleted along with
  it, per the `onDelete: "cascade"` constraint on `hazardous_event_spatial_observation_id`

#### Scenario: A spatial observation can have multiple geometries

- **WHEN** two rows are inserted with the same `hazardous_event_spatial_observation_id` but
  different `geom` values, both otherwise valid
- **THEN** both inserts succeed — no uniqueness constraint limits an observation to a single
  geometry row

#### Scenario: Concurrent inserts of different geometries under the same observation both succeed

- **WHEN** two callers concurrently insert two `hazardous_event_spatial_observation_geom` rows
  with different `geom` values that both reference the same existing
  `hazardous_event_spatial_observation_id`, before either transaction commits
- **THEN** both inserts succeed — the FK constraint validates each row independently and does
  not serialize unrelated inserts against the same parent
