# hazardous-event-attachment-schema Specification

## Purpose
Defines the normalized attachment data model for hazardous events — the `hazardous_event_attachment`
table's shape, constraints, cascade behavior, and indexing, replacing the jsonb `attachments`
column's role for new normalized reads/writes (the jsonb column itself is out of scope, see
Non-Goals in design.md).

## Requirements

### Requirement: hazardous_event_attachment table shape

The `hazardous_event_attachment` table MUST store `id`, `hazardous_event_id`, `title`,
`file_key`, `file_name`, `file_type`, `file_size`, `created_at`, and `updated_at` for each
attachment row.

#### Scenario: Insert a valid attachment

- **WHEN** a row is inserted with an existing `hazardous_event_id`, and non-null `title`,
  `file_key`, `file_name`, `file_type`, `file_size`
- **THEN** the insert succeeds and the row is readable with all supplied values intact

#### Scenario: title is required

- **WHEN** a row is inserted with `title = NULL`
- **THEN** the insert is rejected by a not-null constraint

#### Scenario: file_key is required

- **WHEN** a row is inserted with `file_key = NULL`
- **THEN** the insert is rejected by a not-null constraint

#### Scenario: file_name is required

- **WHEN** a row is inserted with `file_name = NULL`
- **THEN** the insert is rejected by a not-null constraint

#### Scenario: file_type is required

- **WHEN** a row is inserted with `file_type = NULL`
- **THEN** the insert is rejected by a not-null constraint

#### Scenario: file_size is required

- **WHEN** a row is inserted with `file_size = NULL`
- **THEN** the insert is rejected by a not-null constraint

#### Scenario: file_size stores values beyond 32-bit integer range

- **WHEN** a row is inserted with `file_size = 5000000000` (greater than the int4 maximum of
  2,147,483,647)
- **THEN** the insert succeeds and the row is readable with `file_size` intact

#### Scenario: created_at and updated_at default when omitted

- **WHEN** a row is inserted without supplying `created_at` or `updated_at`
- **THEN** both columns are populated with the current timestamp

### Requirement: hazardous_event_id foreign key and cascade behavior

`hazardous_event_attachment.hazardous_event_id` MUST reference an existing `hazardous_event.id`
row and MUST be not null. Deleting the referenced `hazardous_event` row MUST cascade-delete its
dependent `hazardous_event_attachment` rows.

#### Scenario: hazardous_event_id is required

- **WHEN** a row is inserted with `hazardous_event_id = NULL`
- **THEN** the insert is rejected by a not-null constraint

#### Scenario: hazardous_event_id must reference an existing row

- **WHEN** a row is inserted with a `hazardous_event_id` that matches no `hazardous_event` row
- **THEN** the insert is rejected by a foreign key constraint

#### Scenario: deleting the parent event cascades

- **WHEN** a `hazardous_event` row with one or more dependent `hazardous_event_attachment` rows
  is deleted
- **THEN** its dependent `hazardous_event_attachment` rows are also deleted

### Requirement: multiple attachments per event

An event MUST be able to have more than one attachment row; no uniqueness constraint limits
`hazardous_event_id` to a single row.

#### Scenario: two attachments for the same event both succeed

- **WHEN** two rows are inserted with the same `hazardous_event_id` and different `file_key`
  values
- **THEN** both inserts succeed and both rows are readable

#### Scenario: concurrent inserts under the same event both succeed

- **WHEN** two attachment inserts for the same `hazardous_event_id`, with different `file_key`
  values, are issued concurrently before either resolves
- **THEN** both inserts succeed independently and both rows are readable — no serialization
  conflict or lost write occurs
