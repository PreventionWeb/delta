# hazardous-event-attachment-schema Specification

## Purpose

Defines the normalized attachment data model for hazardous events — the `hazardous_event_attachment`
table's shape, constraints, cascade behavior, and indexing, replacing the jsonb `attachments`
column's role for new normalized reads/writes (the jsonb column itself is out of scope, see
Non-Goals in design.md).

## Requirements

### Requirement: hazardous_event_attachment table shape

The `hazardous_event_attachment` table MUST store `id`, `hazardous_event_id`, `title`, `type`
(`"File"` or `"Link"`), `url`, `tag`, `file_key`, `file_name`, `file_type`, `file_size`,
`created_at`, and `updated_at` for each attachment row. `title` MUST be not-null (an empty
string is a valid value). `type` MUST be not-null. `url`, `tag`, `file_key`, `file_name`,
`file_type`, and `file_size` MUST be nullable — which of them is populated depends on `type`
(see "Attachment field population matches its type").

#### Scenario: Insert a valid attachment

- **WHEN** a row is inserted with an existing `hazardous_event_id`, `type = 'File'`, non-null
  `title`, `file_key`, `file_name`, `file_type`, `file_size`, and `url`/`tag` omitted
- **THEN** the insert succeeds and the row is readable with all supplied values intact

#### Scenario: Insert a valid File-type attachment

- **WHEN** a row is inserted with an existing `hazardous_event_id`, `type = 'File'`, non-null
  `title`, `file_key`, `file_name`, `file_type`, `file_size`, and `url`/`tag` omitted
- **THEN** the insert succeeds and the row is readable with all supplied values intact

#### Scenario: Insert a valid Link-type attachment

- **WHEN** a row is inserted with an existing `hazardous_event_id`, `type = 'Link'`, non-null
  `title` and `url`, and `file_key`/`file_name`/`file_type`/`file_size` omitted
- **THEN** the insert succeeds and the row is readable with all supplied values intact

#### Scenario: Insert a valid attachment with a tag

- **WHEN** a row is inserted with `tag` set to a JSON array of `{id, name}`-shaped objects
- **THEN** the insert succeeds and `tag` is readable back as the same array of objects

#### Scenario: title is required

- **WHEN** a row is inserted with `title = NULL`
- **THEN** the insert is rejected by a not-null constraint

#### Scenario: type is required

- **WHEN** a row is inserted with `type = NULL`
- **THEN** the insert is rejected by a not-null constraint

#### Scenario: file_key is required

- **WHEN** a `type = 'File'` row is inserted with `file_key = NULL`
- **THEN** the insert is rejected (by the type-matching check constraint — `file_key` is no
  longer an unconditional not-null column; it is required only when `type = 'File'`, see
  "Attachment field population matches its type")

#### Scenario: file_name is required

- **WHEN** a `type = 'File'` row is inserted with `file_name = NULL`
- **THEN** the insert is rejected (by the type-matching check constraint, same conditional
  requirement as `file_key`)

#### Scenario: file_type is required

- **WHEN** a `type = 'File'` row is inserted with `file_type = NULL`
- **THEN** the insert is rejected (by the type-matching check constraint, same conditional
  requirement as `file_key`)

#### Scenario: file_size is required

- **WHEN** a `type = 'File'` row is inserted with `file_size = NULL`
- **THEN** the insert is rejected (by the type-matching check constraint, same conditional
  requirement as `file_key`)

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

An event MUST be able to have more than one attachment row, of mixed `type`; no uniqueness
constraint limits `hazardous_event_id` to a single row.

#### Scenario: two attachments for the same event both succeed

- **WHEN** two rows are inserted with the same `hazardous_event_id`, one `type = 'File'` with a
  distinct `file_key` and one `type = 'Link'` with a distinct `url`
- **THEN** both inserts succeed and both rows are readable

#### Scenario: concurrent inserts under the same event both succeed

- **WHEN** two attachment inserts for the same `hazardous_event_id`, with different `file_key`
  values, are issued concurrently before either resolves
- **THEN** both inserts succeed independently and both rows are readable — no serialization
  conflict or lost write occurs

### Requirement: Attachment field population matches its type

A `check()` constraint MUST enforce that a `type = 'File'` row has all of `file_key`,
`file_name`, `file_type`, `file_size` non-null and `url` null, and that a `type = 'Link'` row has
`url` non-null and all of `file_key`, `file_name`, `file_type`, `file_size` null — mirroring
`event_causality`'s existing `event_causality_triggering_entity_fk_check` discriminator-paired
check pattern.

#### Scenario: A File-type row missing a file field is rejected

- **WHEN** a row is inserted with `type = 'File'` and `file_key = NULL` (or any of `file_name`/
  `file_type`/`file_size` null)
- **THEN** the insert is rejected by the check constraint

#### Scenario: A File-type row with a non-null url is rejected

- **WHEN** a row is inserted with `type = 'File'`, all file fields populated, and `url` also
  non-null
- **THEN** the insert is rejected by the check constraint

#### Scenario: A Link-type row missing url is rejected

- **WHEN** a row is inserted with `type = 'Link'` and `url = NULL`
- **THEN** the insert is rejected by the check constraint

#### Scenario: A Link-type row with any non-null file field is rejected

- **WHEN** a row is inserted with `type = 'Link'`, `url` non-null, and any one of `file_key`/
  `file_name`/`file_type`/`file_size` also non-null
- **THEN** the insert is rejected by the check constraint

### Requirement: Pre-existing rows are migrated to a valid type on upgrade

Every `hazardous_event_attachment` row that existed before this change (all of which were
inserted with the file-specific columns required, never through the real widget path) MUST be
assigned `type = 'File'` by the migration, before `type` becomes not-null and the check
constraint is added, so the upgrade does not fail against existing data.

#### Scenario: A pre-existing row passes the new check constraint after migration

- **GIVEN** a `hazardous_event_attachment` row inserted before this change, with all
  file-specific columns populated and no `type` column
- **WHEN** the migration runs
- **THEN** the row has `type = 'File'`
- **AND** the row satisfies the new check constraint without modification to its other columns
