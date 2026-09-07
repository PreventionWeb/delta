## Purpose

Defines the persisted shape of the tenant-scoped `hazard_driver` reference table and the
`hazardous_event_hazard_driver` join table linking it to `hazardous_event`. This spec
covers schema-level observable behaviour only: what a direct insert/query against these
tables must accept or reject.

## ADDED Requirements

### Requirement: `hazard_driver` table shape and constraints

The `hazard_driver` table MUST persist one row per named driver, scoped to a single
tenant, with columns `id` (UUID primary key), `name` (text, not null), `country_accounts_id`
(UUID, not null, FK to `country_accounts.id`), `created_at` (timestamptz, not null), and
`updated_at` (timestamptz, not null).

#### Scenario: Insert a driver under an existing country account

- **WHEN** a row is inserted with `name = "Heavy rainfall"` and a `country_accounts_id`
  matching an existing `country_accounts` row
- **THEN** the insert succeeds

#### Scenario: `name` is required

- **WHEN** a row is inserted with no `name`
- **THEN** the insert is rejected by a database-level not-null constraint

#### Scenario: `country_accounts_id` is required

- **WHEN** a row is inserted with `country_accounts_id = NULL`
- **THEN** the insert is rejected by a database-level not-null constraint

#### Scenario: `country_accounts_id` must reference an existing country account

- **WHEN** a row is inserted with a `country_accounts_id` that matches no row in
  `country_accounts`
- **THEN** the insert is rejected by the foreign key constraint

#### Scenario: Deleting the referenced country account cascades

- **WHEN** a `country_accounts` row is deleted while a `hazard_driver` row still
  references its `id`
- **THEN** the dependent `hazard_driver` row is deleted along with it, per the
  `onDelete: "cascade"` constraint

#### Scenario: Two tenants can register a driver with the same name independently

- **WHEN** two rows are inserted with an identical `name` but different
  `country_accounts_id` values, both referencing existing country accounts
- **THEN** both inserts succeed — no uniqueness constraint applies across or within
  tenants for this table

#### Scenario: Concurrent inserts under the same tenant both succeed

- **WHEN** two callers concurrently insert two `hazard_driver` rows that both reference
  the same existing `country_accounts_id`, before either transaction commits
- **THEN** both inserts succeed — the FK constraint validates each reference
  independently and does not serialize unrelated inserts against the same parent

### Requirement: `hazardous_event_hazard_driver` join table shape and constraints

The `hazardous_event_hazard_driver` table MUST persist one row per (hazardous event,
hazard driver) association, with columns `id` (UUID primary key), `hazardous_event_id`
(UUID, not null, FK to `hazardous_event.id`, cascade on delete), `hazard_driver_id` (UUID,
not null, FK to `hazard_driver.id`, cascade on delete), `created_at` (timestamptz, not
null), and `updated_at` (timestamptz, not null). It carries no `country_accounts_id` of
its own — tenant scoping is inherited transitively through `hazardous_event_id`. The same
`(hazardous_event_id, hazard_driver_id)` pair MUST NOT be persisted twice.

#### Scenario: Insert an association between an existing event and an existing driver

- **WHEN** a row is inserted with `hazardous_event_id` matching an existing
  `hazardous_event` row and `hazard_driver_id` matching an existing `hazard_driver` row
- **THEN** the insert succeeds

#### Scenario: `hazardous_event_id` is required

- **WHEN** a row is inserted with `hazardous_event_id = NULL`
- **THEN** the insert is rejected by a database-level not-null constraint

#### Scenario: `hazard_driver_id` is required

- **WHEN** a row is inserted with `hazard_driver_id = NULL`
- **THEN** the insert is rejected by a database-level not-null constraint

#### Scenario: `hazardous_event_id` must reference an existing hazardous event

- **WHEN** a row is inserted with a `hazardous_event_id` that matches no row in
  `hazardous_event`
- **THEN** the insert is rejected by the foreign key constraint

#### Scenario: `hazard_driver_id` must reference an existing hazard driver

- **WHEN** a row is inserted with a `hazard_driver_id` that matches no row in
  `hazard_driver`
- **THEN** the insert is rejected by the foreign key constraint

#### Scenario: Deleting the referenced hazardous event cascades

- **WHEN** a `hazardous_event` row is deleted while a `hazardous_event_hazard_driver`
  row still references its `id`
- **THEN** the dependent `hazardous_event_hazard_driver` row is deleted along with it,
  per the `onDelete: "cascade"` constraint on `hazardous_event_id`

#### Scenario: Deleting the referenced hazard driver cascades

- **WHEN** a `hazard_driver` row is deleted while a `hazardous_event_hazard_driver` row
  still references its `id`
- **THEN** the dependent `hazardous_event_hazard_driver` row is deleted along with it,
  per the `onDelete: "cascade"` constraint on `hazard_driver_id`

#### Scenario: A hazardous event can be associated with multiple drivers

- **WHEN** two rows are inserted with the same `hazardous_event_id` but different
  `hazard_driver_id` values, both referencing existing rows
- **THEN** both inserts succeed — no uniqueness constraint prevents an event from having
  more than one driver

#### Scenario: A hazard driver can be associated with multiple hazardous events

- **WHEN** two rows are inserted with the same `hazard_driver_id` but different
  `hazardous_event_id` values, both referencing existing rows
- **THEN** both inserts succeed — no uniqueness constraint prevents a driver from being
  reused across events

#### Scenario: The same event cannot be associated with the same driver twice

- **WHEN** a row is inserted with `hazardous_event_id` and `hazard_driver_id` matching an
  existing `hazardous_event_hazard_driver` row's `hazardous_event_id` and
  `hazard_driver_id` exactly
- **THEN** the insert is rejected by a database-level unique constraint

#### Scenario: Concurrent inserts of different associations both succeed

- **WHEN** two callers concurrently insert two `hazardous_event_hazard_driver` rows with
  different `hazard_driver_id` values that both reference the same existing
  `hazardous_event_id`, before either transaction commits
- **THEN** both inserts succeed — each FK constraint validates its own reference
  independently and does not serialize unrelated inserts against the same parent
