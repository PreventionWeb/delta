## Purpose

Defines the persisted shape of the `specific_hazard_local_name` and `specific_hazard_national_name`
columns added to the existing `hazardous_event` table. This spec covers schema-level observable
behaviour only: what a direct insert/update against `hazardous_event` must accept once these columns
exist. It does not cover any route, model, or `fieldsDef` behavior — none is added by this change.

## ADDED Requirements

### Requirement: `hazardous_event.specific_hazard_local_name` column shape

The `hazardous_event` table MUST carry a `specific_hazard_local_name` column (`text`, nullable), with
no foreign key, no default value, and no index.

#### Scenario: Migration applies cleanly against a table with existing rows

- **WHEN** the migration adding `specific_hazard_local_name` is applied to a `hazardous_event` table
  that already contains rows (simulating real production data)
- **THEN** the migration succeeds and every pre-existing row's `specific_hazard_local_name` is `NULL`
  — the migration does not fail and does not require any pre-existing row to already have a value

#### Scenario: A new or updated row can set `specific_hazard_local_name` to a non-null string

- **WHEN** a `hazardous_event` row is inserted or updated with `specific_hazard_local_name` set to a
  non-null string value
- **THEN** the write succeeds and the stored value equals the string that was set

#### Scenario: `specific_hazard_local_name` may be left `NULL`

- **WHEN** a `hazardous_event` row is inserted with `specific_hazard_local_name` omitted or
  explicitly `NULL`
- **THEN** the insert succeeds — the column is nullable, not required

### Requirement: `hazardous_event.specific_hazard_national_name` column shape

The `hazardous_event` table MUST carry a `specific_hazard_national_name` column (`text`, nullable),
with no foreign key, no default value, and no index.

#### Scenario: Migration applies cleanly against a table with existing rows

- **WHEN** the migration adding `specific_hazard_national_name` is applied to a `hazardous_event`
  table that already contains rows (simulating real production data)
- **THEN** the migration succeeds and every pre-existing row's `specific_hazard_national_name` is
  `NULL` — the migration does not fail and does not require any pre-existing row to already have a
  value

#### Scenario: A new or updated row can set `specific_hazard_national_name` to a non-null string

- **WHEN** a `hazardous_event` row is inserted or updated with `specific_hazard_national_name` set
  to a non-null string value
- **THEN** the write succeeds and the stored value equals the string that was set

#### Scenario: `specific_hazard_national_name` may be left `NULL`

- **WHEN** a `hazardous_event` row is inserted with `specific_hazard_national_name` omitted or
  explicitly `NULL`
- **THEN** the insert succeeds — the column is nullable, not required

### Requirement: The two columns are independent of each other

`specific_hazard_local_name` and `specific_hazard_national_name` MUST be settable independently —
neither column's nullability nor value depends on the other.

#### Scenario: One column can be set while the other stays `NULL`

- **WHEN** a `hazardous_event` row is inserted with `specific_hazard_local_name` set to a non-null
  string and `specific_hazard_national_name` omitted (or vice versa)
- **THEN** the write succeeds, the set column stores the given value, and the omitted column is
  `NULL`

#### Scenario: Both columns can be set on the same row

- **WHEN** a `hazardous_event` row is inserted or updated with both `specific_hazard_local_name` and
  `specific_hazard_national_name` set to distinct non-null string values
- **THEN** the write succeeds and both stored values independently equal the strings that were set

#### Scenario: Concurrent callers setting either column on different rows both succeed

- **WHEN** two callers concurrently insert two different `hazardous_event` rows, one setting
  `specific_hazard_local_name` and the other setting `specific_hazard_national_name` (or both,
  to distinct non-null string values), before either transaction commits
- **THEN** both inserts succeed independently — neither column carries a uniqueness constraint, FK,
  or shared counter/cache, so no serialization or contention occurs between the two writes
