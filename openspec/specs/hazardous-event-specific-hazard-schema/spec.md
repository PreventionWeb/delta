# hazardous-event-specific-hazard-schema Specification

## Purpose
Defines the persisted shape and constraint behavior of the `specific_hazard_id` column added to
the existing `hazardous_event` table. This spec covers schema-level observable behaviour only:
what a direct insert/update/delete against `hazardous_event` and `specific_hazard` must accept or
reject once this column exists. It does not cover any route, model, or `fieldsDef` behavior — none
is added by this change.

## Requirements

### Requirement: `hazardous_event.specific_hazard_id` column shape

The `hazardous_event` table MUST carry a `specific_hazard_id` column (UUID, nullable), a foreign
key to `specific_hazard.id`, with no `ON DELETE` clause (default RESTRICT) and no index.

#### Scenario: Migration applies cleanly against a table with existing rows

- **WHEN** the migration adding `specific_hazard_id` is applied to a `hazardous_event` table that
  already contains rows (simulating real production data)
- **THEN** the migration succeeds and every pre-existing row's `specific_hazard_id` is `NULL` — the
  migration does not fail and does not require any pre-existing row to already have a value

#### Scenario: A new or updated row can set `specific_hazard_id` to an existing `specific_hazard`

- **WHEN** a `hazardous_event` row is inserted or updated with `specific_hazard_id` set to a value
  matching an existing `specific_hazard` row's `id`
- **THEN** the write succeeds

#### Scenario: `specific_hazard_id` may be left `NULL`

- **WHEN** a `hazardous_event` row is inserted with `specific_hazard_id` omitted or explicitly
  `NULL`
- **THEN** the insert succeeds — the column is nullable, not required

#### Scenario: `specific_hazard_id` must reference an existing `specific_hazard` row

- **WHEN** a `hazardous_event` row is inserted or updated with a `specific_hazard_id` value that
  matches no row in `specific_hazard`
- **THEN** the write is rejected by the foreign key constraint

#### Scenario: Deleting a referenced `specific_hazard` row is blocked while still referenced

- **WHEN** a `specific_hazard` row is deleted while a `hazardous_event` row still references its
  `id` via `specific_hazard_id`
- **THEN** the delete is rejected by the foreign key constraint — `specific_hazard_id` has no
  cascade and no null-out-on-delete behavior; the referencing `hazardous_event` row is left
  untouched and the `specific_hazard` row is not removed

#### Scenario: Concurrent inserts referencing the same `specific_hazard` row both succeed

- **WHEN** two callers concurrently insert two different `hazardous_event` rows, both setting
  `specific_hazard_id` to the same existing `specific_hazard` row's `id`, before either
  transaction commits
- **THEN** both inserts succeed — the foreign key validates each row independently and does not
  serialize unrelated inserts against the same referenced parent (confirms the diagram's edge is a
  standard one-to-many relationship, not a one-to-one)
