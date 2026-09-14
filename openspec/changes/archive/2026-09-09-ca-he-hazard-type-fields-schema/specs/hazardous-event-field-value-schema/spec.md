## Purpose

Defines the persisted shape of the recorded field-value system for hazardous events:
`hazardous_event_field_value` (values against global field definitions) and
`hazardous_event_custom_field_value` (values against tenant-custom field definitions). This spec
covers schema-level observable behaviour only: what a direct insert/query against these tables
must accept or reject.

## ADDED Requirements

### Requirement: `hazardous_event_field_value` table shape and constraints

The `hazardous_event_field_value` table MUST persist one row per recorded value of a global field
against a hazardous event, with columns `id` (UUID primary key), `hazardous_event_id` (UUID, not
null, FK to `hazardous_event.id`, cascade on delete), `hazard_type_field_definition_id` (UUID, not
null, FK to `hazard_type_field_definition.id`, cascade on delete), `value` (text, not null),
`created_at` (timestamptz, not null), and `updated_at` (timestamptz, not null). The same
`(hazardous_event_id, hazard_type_field_definition_id)` pair MUST NOT be persisted twice.

#### Scenario: Insert a field value under an existing event and definition

- **WHEN** a row is inserted with `hazardous_event_id` matching an existing `hazardous_event` row
  and `hazard_type_field_definition_id` matching an existing `hazard_type_field_definition` row,
  and a valid `value`
- **THEN** the insert succeeds

#### Scenario: `hazardous_event_id` is required

- **WHEN** a row is inserted with `hazardous_event_id = NULL`
- **THEN** the insert is rejected by a database-level not-null constraint

#### Scenario: `hazard_type_field_definition_id` is required

- **WHEN** a row is inserted with `hazard_type_field_definition_id = NULL`
- **THEN** the insert is rejected by a database-level not-null constraint

#### Scenario: `value` is required

- **WHEN** a row is inserted with `value = NULL`
- **THEN** the insert is rejected by a database-level not-null constraint

#### Scenario: `hazardous_event_id` must reference an existing hazardous event

- **WHEN** a row is inserted with a `hazardous_event_id` that matches no row in `hazardous_event`
- **THEN** the insert is rejected by the foreign key constraint

#### Scenario: `hazard_type_field_definition_id` must reference an existing field definition

- **WHEN** a row is inserted with a `hazard_type_field_definition_id` that matches no row in
  `hazard_type_field_definition`
- **THEN** the insert is rejected by the foreign key constraint

#### Scenario: Deleting the referenced hazardous event cascades

- **WHEN** a `hazardous_event` row is deleted while a `hazardous_event_field_value` row still
  references its `id`
- **THEN** the dependent `hazardous_event_field_value` row is deleted along with it, per the
  `onDelete: "cascade"` constraint on `hazardous_event_id`

#### Scenario: Deleting the referenced field definition cascades

- **WHEN** a `hazard_type_field_definition` row is deleted while a `hazardous_event_field_value`
  row still references its `id`
- **THEN** the dependent `hazardous_event_field_value` row is deleted along with it, per the
  `onDelete: "cascade"` constraint on `hazard_type_field_definition_id`

#### Scenario: An event can have values recorded for multiple field definitions

- **WHEN** two rows are inserted with the same `hazardous_event_id` but different
  `hazard_type_field_definition_id` values, both referencing existing rows
- **THEN** both inserts succeed

#### Scenario: A field definition can have values recorded across multiple events

- **WHEN** two rows are inserted with the same `hazard_type_field_definition_id` but different
  `hazardous_event_id` values, both referencing existing rows
- **THEN** both inserts succeed

#### Scenario: The same event cannot record the same field definition twice

- **WHEN** a row is inserted with `hazardous_event_id` and `hazard_type_field_definition_id`
  matching an existing `hazardous_event_field_value` row's values exactly
- **THEN** the insert is rejected by a database-level unique constraint

#### Scenario: Concurrent inserts of different field values under the same event both succeed

- **WHEN** two callers concurrently insert two `hazardous_event_field_value` rows with different
  `hazard_type_field_definition_id` values that both reference the same existing
  `hazardous_event_id`, before either transaction commits
- **THEN** both inserts succeed — the FK and unique constraints validate each row independently
  and do not serialize unrelated inserts against the same parent

### Requirement: `hazardous_event_custom_field_value` table shape and constraints

The `hazardous_event_custom_field_value` table MUST persist one row per recorded value of a
tenant-custom field against a hazardous event, with columns `id` (UUID primary key),
`hazardous_event_id` (UUID, not null, FK to `hazardous_event.id`, cascade on delete),
`hazard_type_custom_field_definition_id` (UUID, not null, FK to
`hazard_type_custom_field_definition.id`, cascade on delete), `value` (text, not null),
`created_at` (timestamptz, not null), and `updated_at` (timestamptz, not null). The same
`(hazardous_event_id, hazard_type_custom_field_definition_id)` pair MUST NOT be persisted twice.
This is a distinct table from `hazardous_event_field_value` — a different FK target and a
different unique constraint, not a shared table under a different name.

#### Scenario: Insert a custom field value under an existing event and custom definition

- **WHEN** a row is inserted with `hazardous_event_id` matching an existing `hazardous_event` row
  and `hazard_type_custom_field_definition_id` matching an existing
  `hazard_type_custom_field_definition` row, and a valid `value`
- **THEN** the insert succeeds

#### Scenario: `hazardous_event_id` is required

- **WHEN** a row is inserted with `hazardous_event_id = NULL`
- **THEN** the insert is rejected by a database-level not-null constraint

#### Scenario: `hazard_type_custom_field_definition_id` is required

- **WHEN** a row is inserted with `hazard_type_custom_field_definition_id = NULL`
- **THEN** the insert is rejected by a database-level not-null constraint

#### Scenario: `value` is required

- **WHEN** a row is inserted with `value = NULL`
- **THEN** the insert is rejected by a database-level not-null constraint

#### Scenario: `hazardous_event_id` must reference an existing hazardous event

- **WHEN** a row is inserted with a `hazardous_event_id` that matches no row in `hazardous_event`
- **THEN** the insert is rejected by the foreign key constraint

#### Scenario: `hazard_type_custom_field_definition_id` must reference an existing custom field definition

- **WHEN** a row is inserted with a `hazard_type_custom_field_definition_id` that matches no row
  in `hazard_type_custom_field_definition`
- **THEN** the insert is rejected by the foreign key constraint

#### Scenario: Deleting the referenced hazardous event cascades

- **WHEN** a `hazardous_event` row is deleted while a `hazardous_event_custom_field_value` row
  still references its `id`
- **THEN** the dependent `hazardous_event_custom_field_value` row is deleted along with it, per
  the `onDelete: "cascade"` constraint on `hazardous_event_id`

#### Scenario: Deleting the referenced custom field definition cascades

- **WHEN** a `hazard_type_custom_field_definition` row is deleted while a
  `hazardous_event_custom_field_value` row still references its `id`
- **THEN** the dependent `hazardous_event_custom_field_value` row is deleted along with it, per
  the `onDelete: "cascade"` constraint on `hazard_type_custom_field_definition_id`

#### Scenario: An event can have values recorded for multiple custom field definitions

- **WHEN** two rows are inserted with the same `hazardous_event_id` but different
  `hazard_type_custom_field_definition_id` values, both referencing existing rows
- **THEN** both inserts succeed

#### Scenario: A custom field definition can have values recorded across multiple events

- **WHEN** two rows are inserted with the same `hazard_type_custom_field_definition_id` but
  different `hazardous_event_id` values, both referencing existing rows
- **THEN** both inserts succeed

#### Scenario: The same event cannot record the same custom field definition twice

- **WHEN** a row is inserted with `hazardous_event_id` and
  `hazard_type_custom_field_definition_id` matching an existing
  `hazardous_event_custom_field_value` row's values exactly
- **THEN** the insert is rejected by a database-level unique constraint

#### Scenario: Concurrent inserts of different custom field values under the same event both succeed

- **WHEN** two callers concurrently insert two `hazardous_event_custom_field_value` rows with
  different `hazard_type_custom_field_definition_id` values that both reference the same existing
  `hazardous_event_id`, before either transaction commits
- **THEN** both inserts succeed — the FK and unique constraints validate each row independently
  and do not serialize unrelated inserts against the same parent
