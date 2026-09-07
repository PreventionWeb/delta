## Purpose

Defines the persisted shape of the tenant-scoped `source_catalog` reference table, the
eventual replacement for today's free-text data-source columns on `hazardous_event`,
`disaster_event`, and `disaster_records`. This spec covers schema-level observable
behaviour only: what a direct insert/query against this table must accept or reject.

## ADDED Requirements

### Requirement: `source_catalog` table shape and constraints

The `source_catalog` table MUST persist one row per named data source, scoped to a
single tenant, with columns `id` (UUID primary key), `name` (text, not null),
`country_accounts_id` (UUID, not null, FK to `country_accounts.id`), `created_at`
(timestamptz, not null), and `updated_at` (timestamptz, not null). A tenant MUST NOT have
two rows with the same `name`.

#### Scenario: Insert a source under an existing country account

- **WHEN** a row is inserted with `name = "National Meteorological Service"` and a
  `country_accounts_id` matching an existing `country_accounts` row
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

- **WHEN** a `country_accounts` row is deleted while a `source_catalog` row still
  references its `id`
- **THEN** the dependent `source_catalog` row is deleted along with it, per the
  `onDelete: "cascade"` constraint

#### Scenario: Two tenants can register a source with the same name independently

- **WHEN** two rows are inserted with an identical `name` but different
  `country_accounts_id` values, both referencing existing country accounts
- **THEN** both inserts succeed — `name` is not required to be globally unique across
  tenants

#### Scenario: A tenant cannot register the same source name twice

- **WHEN** a row is inserted with `name` and `country_accounts_id` matching an existing
  `source_catalog` row's `name` and `country_accounts_id` exactly
- **THEN** the insert is rejected by a database-level unique constraint

#### Scenario: Concurrent inserts of different source names under the same tenant both succeed

- **WHEN** two callers concurrently insert two `source_catalog` rows with different
  `name` values that both reference the same existing `country_accounts_id`, before
  either transaction commits
- **THEN** both inserts succeed — the FK constraint validates each reference
  independently and does not serialize unrelated inserts against the same parent
