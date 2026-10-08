## MODIFIED Requirements

### Requirement: `hazard_type` table shape and constraints

The `hazard_type` table MUST persist one row per hazard type, with columns `id` (UUID
primary key), `name_text_content_id` (UUID, not null, FK to `text_content.id`),
`hips_version_id` (UUID, not null, FK to `hips_version.id`), and `source_ref_id` (text,
nullable, unique).

#### Scenario: Insert a hazard type under an existing version

- **WHEN** a row is inserted with a `hips_version_id` matching an existing `hips_version`
  row and a `name_text_content_id` matching an existing `text_content` row
- **THEN** the insert succeeds

#### Scenario: `hips_version_id` must reference an existing version

- **WHEN** a row is inserted with a `hips_version_id` that matches no row in
  `hips_version`
- **THEN** the insert is rejected by the foreign key constraint

#### Scenario: `hips_version_id` is required

- **WHEN** a row is inserted with `hips_version_id = NULL`
- **THEN** the insert is rejected by a database-level not-null constraint

#### Scenario: `name_text_content_id` is required

- **WHEN** a row is inserted with `name_text_content_id = NULL`
- **THEN** the insert is rejected by a database-level not-null constraint

#### Scenario: `name_text_content_id` must reference an existing text_content row

- **WHEN** a row is inserted with a `name_text_content_id` that matches no row in
  `text_content`
- **THEN** the insert is rejected by the foreign key constraint

#### Scenario: `source_ref_id` is optional

- **WHEN** a row is inserted with no `source_ref_id`
- **THEN** the insert succeeds

#### Scenario: `source_ref_id` must be unique when provided

- **WHEN** a row is inserted with a `source_ref_id` matching an existing `hazard_type`
  row's non-null `source_ref_id`
- **THEN** the insert is rejected by a database-level unique constraint

#### Scenario: multiple rows with no `source_ref_id` are all allowed

- **WHEN** two rows are each inserted with no `source_ref_id`
- **THEN** both inserts succeed — the unique constraint does not treat two `NULL` values
  as a duplicate

#### Scenario: concurrent inserts with the same non-null source_ref_id — exactly one succeeds

- **WHEN** two callers concurrently insert `hazard_type` rows with the identical non-null
  `source_ref_id`, before either transaction commits
- **THEN** exactly one insert succeeds and the other is rejected by the unique constraint

### Requirement: `hazard_cluster` table shape and constraints

The `hazard_cluster` table MUST persist one row per hazard cluster, with columns `id`
(UUID primary key), `name_text_content_id` (UUID, not null, FK to `text_content.id`),
`hazard_type_id` (UUID, not null, FK to `hazard_type.id`), and `source_ref_id` (text,
nullable, unique).

#### Scenario: Insert a cluster under an existing type

- **WHEN** a row is inserted with a `hazard_type_id` matching an existing `hazard_type`
  row and a `name_text_content_id` matching an existing `text_content` row
- **THEN** the insert succeeds

#### Scenario: `hazard_type_id` must reference an existing type

- **WHEN** a row is inserted with a `hazard_type_id` that matches no row in `hazard_type`
- **THEN** the insert is rejected by the foreign key constraint

#### Scenario: `hazard_type_id` is required

- **WHEN** a row is inserted with `hazard_type_id = NULL`
- **THEN** the insert is rejected by a database-level not-null constraint

#### Scenario: `name_text_content_id` is required

- **WHEN** a row is inserted with `name_text_content_id = NULL`
- **THEN** the insert is rejected by a database-level not-null constraint

#### Scenario: `name_text_content_id` must reference an existing text_content row

- **WHEN** a row is inserted with a `name_text_content_id` that matches no row in
  `text_content`
- **THEN** the insert is rejected by the foreign key constraint

#### Scenario: `source_ref_id` is optional

- **WHEN** a row is inserted with no `source_ref_id`
- **THEN** the insert succeeds

#### Scenario: `source_ref_id` must be unique when provided

- **WHEN** a row is inserted with a `source_ref_id` matching an existing `hazard_cluster`
  row's non-null `source_ref_id`
- **THEN** the insert is rejected by a database-level unique constraint

#### Scenario: multiple rows with no `source_ref_id` are all allowed

- **WHEN** two rows are each inserted with no `source_ref_id`
- **THEN** both inserts succeed — the unique constraint does not treat two `NULL` values
  as a duplicate

#### Scenario: concurrent inserts with the same non-null source_ref_id — exactly one succeeds

- **WHEN** two callers concurrently insert `hazard_cluster` rows with the identical non-null
  `source_ref_id`, before either transaction commits
- **THEN** exactly one insert succeeds and the other is rejected by the unique constraint

### Requirement: `specific_hazard` table shape and constraints

The `specific_hazard` table MUST persist one row per specific hazard, with columns `id`
(UUID primary key), `name_text_content_id` (UUID, not null, FK to `text_content.id`),
`code` (text, not null), `hazard_cluster_id` (UUID, not null, FK to `hazard_cluster.id`),
`source_ref_id` (text, nullable, unique), and `description_text_content_id` (UUID,
nullable, FK to `text_content.id`).

#### Scenario: Insert a specific hazard under an existing cluster

- **WHEN** a row is inserted with a `hazard_cluster_id` matching an existing
  `hazard_cluster` row and a `name_text_content_id` matching an existing `text_content` row
- **THEN** the insert succeeds

#### Scenario: `hazard_cluster_id` must reference an existing cluster

- **WHEN** a row is inserted with a `hazard_cluster_id` that matches no row in
  `hazard_cluster`
- **THEN** the insert is rejected by the foreign key constraint, orphaning the row is not
  possible

#### Scenario: `hazard_cluster_id` is required

- **WHEN** a row is inserted with `hazard_cluster_id = NULL`
- **THEN** the insert is rejected by a database-level not-null constraint

#### Scenario: `name_text_content_id` is required

- **WHEN** a row is inserted with `name_text_content_id = NULL`
- **THEN** the insert is rejected by a database-level not-null constraint

#### Scenario: `name_text_content_id` must reference an existing text_content row

- **WHEN** a row is inserted with a `name_text_content_id` that matches no row in
  `text_content`
- **THEN** the insert is rejected by the foreign key constraint

#### Scenario: `description_text_content_id` is optional

- **WHEN** a row is inserted with `description_text_content_id = NULL`
- **THEN** the insert succeeds

#### Scenario: `description_text_content_id` must reference an existing text_content row when provided

- **WHEN** a row is inserted with a non-null `description_text_content_id` that matches no
  row in `text_content`
- **THEN** the insert is rejected by the foreign key constraint

#### Scenario: `source_ref_id` is optional

- **WHEN** a row is inserted with no `source_ref_id`
- **THEN** the insert succeeds

#### Scenario: `source_ref_id` must be unique when provided

- **WHEN** a row is inserted with a `source_ref_id` matching an existing `specific_hazard`
  row's non-null `source_ref_id`
- **THEN** the insert is rejected by a database-level unique constraint

#### Scenario: multiple rows with no `source_ref_id` are all allowed

- **WHEN** two rows are each inserted with no `source_ref_id`
- **THEN** both inserts succeed — the unique constraint does not treat two `NULL` values
  as a duplicate

#### Scenario: concurrent inserts with the same non-null source_ref_id — exactly one succeeds

- **WHEN** two callers concurrently insert `specific_hazard` rows with the identical
  non-null `source_ref_id`, before either transaction commits
- **THEN** exactly one insert succeeds and the other is rejected by the unique constraint

## ADDED Requirements

### Requirement: existing taxonomy names are preserved across the multi-language migration

A `specific_hazard`, `hazard_cluster`, or `hazard_type` row that existed before this
migration MUST resolve, through its new `name_text_content_id`, to a `text_content` row
whose `original_text` equals that row's pre-migration `name` value, with
`original_language_id` referencing the `language` row seeded for `en`. That same
`text_content` row MUST also have a corresponding `translation` row whose `language_id`
references the `en` `language` row and whose `translation` text equals the same
pre-migration `name` value, per the standing invariant that every `text_content` row has a
same-language `translation` row. The migration MUST NOT alter `code` (`specific_hazard`),
`hazard_cluster_id`/`hazard_type_id`/`hips_version_id` chain references, or any other
pre-existing column on these three tables.

#### Scenario: a pre-existing row's name is preserved and resolvable

- **GIVEN** a `specific_hazard` row existed before the migration with `name = "Earthquake"`
- **WHEN** the migration runs
- **THEN** the row's `name_text_content_id` resolves through `text_content` to a row with
  `original_text = "Earthquake"` and `original_language_id` referencing the `en` `language`
  row

#### Scenario: a same-language translation row is also created for every backfilled name

- **GIVEN** a `specific_hazard` row existed before the migration with `name = "Earthquake"`
- **WHEN** the migration runs
- **THEN** a `translation` row exists whose `text_content_id` is the row's
  `name_text_content_id`, whose `language_id` references the `en` `language` row, and whose
  `translation` text equals `"Earthquake"`

#### Scenario: the plain `name` column no longer exists

- **WHEN** the migration runs
- **THEN** `specific_hazard`, `hazard_cluster`, and `hazard_type` each no longer have a
  `name` column

#### Scenario: pre-existing rows have no description or source_ref_id

- **GIVEN** a `specific_hazard` row existed before the migration (with no pre-existing
  `description` column to source a value from)
- **WHEN** the migration runs
- **THEN** that row's `description_text_content_id` is `NULL` and its `source_ref_id` is
  `NULL`

#### Scenario: the seeded language rows are present after migration

- **WHEN** the migration runs
- **THEN** `language` contains one row per `VALID_LANGUAGES` code (`ar`, `zh`, `en`, `fr`,
  `ru`, `es`, `sr`, `sq`, `tg`), including the `en` row used by the backfill above
