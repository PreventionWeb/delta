# hazard-type-field-definition-schema Specification

## Purpose
Defines the persisted shape of the hazard-type field-definition system: the two shared lookup
tables `field_data_type` and `field_unit`, the global `hazard_type_field_definition` table, and
the tenant-custom `hazard_type_custom_field_definition` table. This spec covers schema-level
observable behaviour only: what a direct insert/query against these tables must accept or reject.

## Requirements

### Requirement: `field_data_type` table shape and constraints

The `field_data_type` table MUST persist one row per distinct field data type, with columns `id`
(UUID primary key) and `type` (text, not null, unique). It MUST be shared by both
`hazard_type_field_definition.data_type` and `hazard_type_custom_field_definition.data_type` — one
physical table, not duplicated per consumer.

#### Scenario: Insert a new data type

- **WHEN** a row is inserted with a `type` value not already present
- **THEN** the insert succeeds

#### Scenario: `type` is required

- **WHEN** a row is inserted with `type = NULL`
- **THEN** the insert is rejected by a database-level not-null constraint

#### Scenario: `type` must be unique

- **WHEN** a row is inserted with a `type` value matching an existing `field_data_type` row's
  `type` exactly
- **THEN** the insert is rejected by a database-level unique constraint

#### Scenario: Concurrent inserts of different data types both succeed

- **WHEN** two callers concurrently insert two `field_data_type` rows with different `type`
  values, before either transaction commits
- **THEN** both inserts succeed — the unique constraint validates each row independently

### Requirement: `field_unit` table shape and constraints

The `field_unit` table MUST persist one row per distinct field unit, with columns `id` (UUID
primary key) and `unit` (text, not null, unique). It MUST be shared by both
`hazard_type_field_definition.unit` and `hazard_type_custom_field_definition.unit` — one physical
table, not duplicated per consumer.

#### Scenario: Insert a new unit

- **WHEN** a row is inserted with a `unit` value not already present
- **THEN** the insert succeeds

#### Scenario: `unit` is required

- **WHEN** a row is inserted with `unit = NULL`
- **THEN** the insert is rejected by a database-level not-null constraint

#### Scenario: `unit` must be unique

- **WHEN** a row is inserted with a `unit` value matching an existing `field_unit` row's `unit`
  exactly
- **THEN** the insert is rejected by a database-level unique constraint

#### Scenario: Concurrent inserts of different units both succeed

- **WHEN** two callers concurrently insert two `field_unit` rows with different `unit` values,
  before either transaction commits
- **THEN** both inserts succeed — the unique constraint validates each row independently

### Requirement: `hazard_type_field_definition` table shape and constraints

The `hazard_type_field_definition` table MUST persist one row per globally-defined, hazard-type-
scoped field, with columns `id` (UUID primary key), `hazard_type_id` (UUID, not null, FK to
`hazard_type.id`, no cascade), `field_key` (text, not null), `label` (text, not null), `data_type`
(UUID, not null, FK to `field_data_type.id`, no cascade), `required` (boolean, not null), `unit`
(UUID, not null, FK to `field_unit.id`, no cascade), `created_at` (timestamptz, not null), and
`updated_at` (timestamptz, not null). The same `field_key` MUST be permitted to repeat across
different `hazard_type_id` values, but the same `(hazard_type_id, field_key)` pair MUST NOT be
persisted twice.

#### Scenario: Insert a field definition under an existing hazard type

- **WHEN** a row is inserted with `hazard_type_id` matching an existing `hazard_type` row,
  `data_type` matching an existing `field_data_type` row, `unit` matching an existing `field_unit`
  row, and valid `field_key`/`label`/`required`
- **THEN** the insert succeeds

#### Scenario: `hazard_type_id` is required

- **WHEN** a row is inserted with `hazard_type_id = NULL`
- **THEN** the insert is rejected by a database-level not-null constraint

#### Scenario: `field_key` is required

- **WHEN** a row is inserted with `field_key = NULL`
- **THEN** the insert is rejected by a database-level not-null constraint

#### Scenario: `label` is required

- **WHEN** a row is inserted with `label = NULL`
- **THEN** the insert is rejected by a database-level not-null constraint

#### Scenario: `data_type` is required

- **WHEN** a row is inserted with `data_type = NULL`
- **THEN** the insert is rejected by a database-level not-null constraint

#### Scenario: `required` is required

- **WHEN** a row is inserted with `required = NULL`
- **THEN** the insert is rejected by a database-level not-null constraint

#### Scenario: `unit` is required

- **WHEN** a row is inserted with `unit = NULL`
- **THEN** the insert is rejected by a database-level not-null constraint

#### Scenario: `hazard_type_id` must reference an existing hazard type

- **WHEN** a row is inserted with a `hazard_type_id` that matches no row in `hazard_type`
- **THEN** the insert is rejected by the foreign key constraint

#### Scenario: `data_type` must reference an existing field data type

- **WHEN** a row is inserted with a `data_type` that matches no row in `field_data_type`
- **THEN** the insert is rejected by the foreign key constraint

#### Scenario: `unit` must reference an existing field unit

- **WHEN** a row is inserted with a `unit` value that matches no row in `field_unit`
- **THEN** the insert is rejected by the foreign key constraint

#### Scenario: The same field key can apply to multiple hazard types

- **WHEN** two rows are inserted with the same `field_key` but different `hazard_type_id` values,
  both otherwise valid
- **THEN** both inserts succeed — a field key is not globally unique, only unique within its own
  hazard type

#### Scenario: The same hazard type cannot define the same field key twice

- **WHEN** a row is inserted with `hazard_type_id` and `field_key` matching an existing
  `hazard_type_field_definition` row's `hazard_type_id` and `field_key` exactly
- **THEN** the insert is rejected by a database-level unique constraint

#### Scenario: Deleting the referenced hazard type is blocked while still referenced

- **WHEN** a `hazard_type` row is deleted while a `hazard_type_field_definition` row still
  references its `id`
- **THEN** the delete is rejected by the foreign key constraint — `hazard_type_id` has no cascade,
  reference/taxonomy data is not removed because something referencing it was deleted

#### Scenario: Deleting the referenced data type is blocked while still referenced

- **WHEN** a `field_data_type` row is deleted while a `hazard_type_field_definition` row still
  references its `id`
- **THEN** the delete is rejected by the foreign key constraint — `data_type` has no cascade

#### Scenario: Deleting the referenced unit is blocked while still referenced

- **WHEN** a `field_unit` row is deleted while a `hazard_type_field_definition` row still
  references its `id`
- **THEN** the delete is rejected by the foreign key constraint — `unit` has no cascade

#### Scenario: Concurrent inserts of different field keys under the same hazard type both succeed

- **WHEN** two callers concurrently insert two `hazard_type_field_definition` rows with different
  `field_key` values that both reference the same existing `hazard_type_id`, before either
  transaction commits
- **THEN** both inserts succeed — the FK and unique constraints validate each row independently
  and do not serialize unrelated inserts against the same parent

### Requirement: `hazard_type_custom_field_definition` table shape and constraints

The `hazard_type_custom_field_definition` table MUST persist one row per tenant-defined,
hazard-type-scoped custom field, with the same columns as `hazard_type_field_definition` plus
`country_accounts_id` (UUID, not null, FK to `country_accounts.id`, cascade on delete). The same
`(country_accounts_id, hazard_type_id, field_key)` triple MUST NOT be persisted twice, but the
same `(hazard_type_id, field_key)` pair MUST be permitted across different tenants, and the same
tenant MUST be permitted to define the same `field_key` under different hazard types.

#### Scenario: Insert a custom field definition for a tenant

- **WHEN** a row is inserted with `country_accounts_id` matching an existing `country_accounts`
  row, `hazard_type_id` matching an existing `hazard_type` row, `data_type` and `unit` matching
  existing rows in their respective tables, and valid `field_key`/`label`/`required`
- **THEN** the insert succeeds

#### Scenario: `country_accounts_id` is required

- **WHEN** a row is inserted with `country_accounts_id = NULL`
- **THEN** the insert is rejected by a database-level not-null constraint

#### Scenario: `country_accounts_id` must reference an existing tenant

- **WHEN** a row is inserted with a `country_accounts_id` that matches no row in
  `country_accounts`
- **THEN** the insert is rejected by the foreign key constraint

#### Scenario: The same field key can be reused by different tenants for the same hazard type

- **WHEN** two rows are inserted with the same `hazard_type_id` and `field_key` but different
  `country_accounts_id` values, both otherwise valid
- **THEN** both inserts succeed — the uniqueness rule is scoped per tenant, not global

#### Scenario: The same tenant can define the same field key under different hazard types

- **WHEN** two rows are inserted with the same `country_accounts_id` and `field_key` but
  different `hazard_type_id` values, both otherwise valid
- **THEN** both inserts succeed

#### Scenario: The same tenant cannot redefine the same field key for the same hazard type twice

- **WHEN** a row is inserted with `country_accounts_id`, `hazard_type_id`, and `field_key`
  matching an existing `hazard_type_custom_field_definition` row's values exactly
- **THEN** the insert is rejected by a database-level unique constraint

#### Scenario: Deleting the referenced tenant cascades

- **WHEN** a `country_accounts` row is deleted while a `hazard_type_custom_field_definition` row
  still references its `id`
- **THEN** the dependent `hazard_type_custom_field_definition` row is deleted along with it, per
  the `onDelete: "cascade"` constraint on `country_accounts_id`

#### Scenario: Deleting the referenced hazard type is blocked while still referenced

- **WHEN** a `hazard_type` row is deleted while a `hazard_type_custom_field_definition` row still
  references its `id`
- **THEN** the delete is rejected by the foreign key constraint — `hazard_type_id` has no cascade

#### Scenario: Concurrent inserts of different custom field keys for the same tenant and hazard type both succeed

- **WHEN** two callers concurrently insert two `hazard_type_custom_field_definition` rows with
  different `field_key` values that both reference the same existing `country_accounts_id` and
  `hazard_type_id`, before either transaction commits
- **THEN** both inserts succeed — the FK and unique constraints validate each row independently
  and do not serialize unrelated inserts against the same parents
