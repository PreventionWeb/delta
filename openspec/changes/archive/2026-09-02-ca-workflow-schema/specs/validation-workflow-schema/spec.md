## Purpose

Defines the persisted shape of the generic, cross-entity (HE/DE/DR) validation workflow —
`workflow_instance`, `workflow_history`, and `workflow_notification` — that later domain and
use-case layers (Phase 3a/4a) build on. This spec covers schema-level observable behaviour
only: what a direct insert/query against these tables must accept or reject.

## ADDED Requirements

### Requirement: `workflow_instance` table shape and constraints

The `workflow_instance` table MUST persist one row per validation-tracked entity, with columns
`id` (UUID primary key), `entity_id` (UUID, not null, not a foreign key), `entity_type`
(`'HE'|'DE'|'DR'`, not null), `status`
(`'DRAFT'|'SUBMITTED'|'REVISION_REQUESTED'|'APPROVED'|'REJECTED'|'PUBLISHED'`, not null), a
symmetric attribution + timestamp pair for each of the four transitions —
`submitted_by_user_id`/`submitted_at`, `validated_by_user_id`/`validated_at`,
`approved_by_user_id`/`approved_at`, `published_by_user_id`/`published_at` (each `*_by_user_id`
a nullable UUID FK to `user.id`, each `*_at` a nullable TIMESTAMPTZ) — `created_at`
(TIMESTAMPTZ, not null), `updated_at` (TIMESTAMPTZ, not null). The table MUST NOT carry a
`country_accounts_id` column.

#### Scenario: Insert a valid workflow instance

- **WHEN** a row is inserted with `entity_id`, `entity_type = 'HE'`, and no `status` supplied
- **THEN** the insert succeeds and the stored row has `status = 'DRAFT'`

#### Scenario: `entity_type` rejects a value outside the declared set

- **WHEN** an insert supplies `entity_type = 'XX'` (not `'HE'`, `'DE'`, or `'DR'`)
- **THEN** the insert is rejected by a database-level constraint, not merely by a TypeScript
  compile-time check

#### Scenario: `status` rejects a value outside the declared set

- **WHEN** an insert supplies `status = 'ARCHIVED'` (not one of the six declared statuses)
- **THEN** the insert is rejected by a database-level constraint

#### Scenario: A second workflow instance for the same entity is rejected

- **WHEN** a `workflow_instance` row already exists for `entity_id = X`, `entity_type = 'HE'`,
  and a second insert is attempted with the same `entity_id` and `entity_type`
- **THEN** the second insert is rejected by a unique constraint on `(entity_id, entity_type)`

#### Scenario: The same entity_id is permitted across different entity_type values

- **WHEN** a `workflow_instance` row exists for `entity_id = X`, `entity_type = 'HE'`, and a
  second insert is attempted with `entity_id = X`, `entity_type = 'DE'`
- **THEN** the second insert succeeds — the uniqueness constraint is scoped to the
  `(entity_id, entity_type)` pair, not `entity_id` alone

#### Scenario: Concurrent callers creating an instance for the same entity

- **WHEN** two callers concurrently attempt to insert a `workflow_instance` row for the same
  `entity_id` and `entity_type`, both before either transaction commits
- **THEN** exactly one insert succeeds; the other fails on the `(entity_id, entity_type)`
  unique constraint rather than both succeeding and leaving two rows for the same entity

#### Scenario: No `country_accounts_id` column exists

- **WHEN** the table's column set is inspected
- **THEN** no `country_accounts_id` (or equivalently-named tenant) column is present —
  tenant scoping for this table is enforced by the caller's own aggregate repository before
  any row here is read or written, not by this table itself

#### Scenario: All four transition attribution/timestamp pairs default to null and round-trip independently

- **WHEN** a row is inserted with only `entity_id`/`entity_type` supplied
- **THEN** `submitted_by_user_id`, `submitted_at`, `validated_by_user_id`, `validated_at`,
  `approved_by_user_id`, `approved_at`, `published_by_user_id`, and `published_at` are all
  `null` on the stored row — none of the four transitions has an implicit default value or
  DB-level side effect from any other

### Requirement: `workflow_history` table shape and constraints

The `workflow_history` table MUST persist an append-only transition log, with columns `id`
(UUID primary key), `instance_id` (UUID, not null, FK to `workflow_instance.id`, cascade
delete), `from_status` (nullable — no prior status on the initial entry — else one of the six
declared statuses), `to_status` (not null, one of the six declared statuses), `acting_user_id`
(UUID, not null, FK to `user.id`), `occurred_at` (TIMESTAMPTZ, not null), `comment` (text,
nullable).

#### Scenario: Insert the initial transition with no prior status

- **WHEN** a row is inserted with `from_status = NULL` and `to_status = 'DRAFT'`
- **THEN** the insert succeeds

#### Scenario: Insert a transition between two declared statuses

- **WHEN** a row is inserted with `from_status = 'DRAFT'` and `to_status = 'SUBMITTED'`
- **THEN** the insert succeeds

#### Scenario: `to_status` rejects a value outside the declared set

- **WHEN** an insert supplies `to_status = 'ARCHIVED'`
- **THEN** the insert is rejected by a database-level constraint

#### Scenario: `instance_id` must reference an existing workflow instance

- **WHEN** an insert supplies an `instance_id` that does not match any row in
  `workflow_instance`
- **THEN** the insert is rejected by the foreign key constraint

#### Scenario: Deleting the parent workflow instance cascades to its history

- **WHEN** a `workflow_instance` row with existing `workflow_history` rows is deleted
- **THEN** all `workflow_history` rows referencing that `instance_id` are deleted along with
  it

#### Scenario: `comment` is optional on a transition

- **WHEN** a row is inserted with a `comment` value (e.g. a rejection reason)
- **THEN** the insert succeeds and the comment is stored as given
- **WHEN** a row is inserted with no `comment` supplied
- **THEN** the insert succeeds and `comment` is `null`

### Requirement: `workflow_notification` table shape and constraints

The `workflow_notification` table MUST persist one row per notification associated with a
workflow instance, with columns `id` (UUID primary key), `instance_id` (UUID, not null, FK to
`workflow_instance.id`, cascade delete), `notified_user_id` (UUID, not null, FK to `user.id`
— the recipient), `notified_by_user_id` (UUID, nullable, FK to `user.id` — who or what
triggered the notification), `notified_at` (TIMESTAMPTZ, nullable, no DB-level default),
`notification_message` (text, nullable), `channel` (text, nullable, unconstrained value set).

#### Scenario: Insert a notification with delivery already recorded

- **WHEN** a row is inserted with `notified_at` set to a timestamp, `notified_by_user_id` set,
  `notification_message` set, and `channel = 'email'`
- **THEN** the insert succeeds and all values are stored as given

#### Scenario: Insert a notification with delivery still pending

- **WHEN** a row is inserted with `notified_at = NULL`, `notified_by_user_id = NULL`,
  `notification_message = NULL`, and `channel = NULL`
- **THEN** the insert succeeds — delivery mechanism and timing are not required at write time,
  and `notified_at` is **not** auto-populated by a database default

#### Scenario: `instance_id` must reference an existing workflow instance

- **WHEN** an insert supplies an `instance_id` that does not match any row in
  `workflow_instance`
- **THEN** the insert is rejected by the foreign key constraint

#### Scenario: Deleting the parent workflow instance cascades to its notifications

- **WHEN** a `workflow_instance` row with existing `workflow_notification` rows is deleted
- **THEN** all `workflow_notification` rows referencing that `instance_id` are deleted along
  with it
