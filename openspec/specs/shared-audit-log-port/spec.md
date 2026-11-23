# shared-audit-log-port Specification

## Purpose

Defines a domain-agnostic, cross-domain port for writing an audit-trail row into the existing
`audit_logs` table, so that Hazardous Events (now) and future CA domains (Disaster Events/Disaster
Records) share one audit-write mechanism instead of each reimplementing it.

## Requirements

### Requirement: `record()` writes exactly one correctly-shaped row

`IAuditLogPort.record(entry)` SHALL insert exactly one row into `audit_logs` containing
`entry.tableName`, `entry.recordId`, `entry.userId`, `entry.action`, `entry.oldValues`,
`entry.newValues`, and `entry.countryAccountsId` as given, with no transformation other than the
storage layer's own JSON serialization of `oldValues`/`newValues`.

#### Scenario: A full entry is written as given

- **WHEN** `record()` is called with an entry carrying non-null `oldValues`, `newValues`, and
  `countryAccountsId`
- **THEN** exactly one new row exists in `audit_logs` afterward
- **AND** every field of that row matches the entry exactly, with `oldValues`/`newValues`
  round-tripping to the same object structure that was passed in

#### Scenario: `oldValues`, `newValues`, or `countryAccountsId` may each be independently null

- **WHEN** `record()` is called with `oldValues: null` (e.g. a create) or `newValues: null` (e.g.
  a delete) or `countryAccountsId: null`
- **THEN** the inserted row stores that field as null without error

### Requirement: `record()` given a transaction writes inside it

`IAuditLogPort.record(entry, tx)` SHALL execute the insert using the given transaction handle when
one is provided, so the write participates in the caller's own atomicity guarantee.

#### Scenario: A rollback after `record()` removes the audit row too

- **WHEN** `record()` is called with a transaction handle, and that same transaction is later
  rolled back (because a later step in the same transaction throws)
- **THEN** no row from that `record()` call exists in `audit_logs` afterward

#### Scenario: A commit after `record()` persists the audit row

- **WHEN** `record()` is called with a transaction handle, and that same transaction later commits
  successfully
- **THEN** the row from that `record()` call exists in `audit_logs` afterward

### Requirement: `record()` without a transaction writes immediately through its own client

`IAuditLogPort.record(entry)` called with no transaction handle SHALL execute the insert
immediately, using the adapter's own database client, independent of any transaction the caller
may or may not be inside.

#### Scenario: A write with no transaction handle persists immediately

- **WHEN** `record()` is called with no second argument
- **THEN** the row exists in `audit_logs` as soon as the call resolves, with no dependency on any
  later commit by the caller

### Requirement: Concurrent callers each produce their own independent row

Because `audit_logs` is a shared, append-only table that more than one async caller can write to
at the same time (e.g. two use cases completing concurrently), a `record()` call MUST NOT
overwrite, drop, or otherwise be affected by another concurrent `record()` call.

#### Scenario: Two concurrent `record()` calls both persist, independently

- **WHEN** `record()` is called twice, concurrently, for two different entries, before either call
  resolves
- **THEN** both calls resolve successfully
- **AND** both rows exist in `audit_logs` afterward, each matching its own entry exactly
- **AND** neither call's row is missing, duplicated, or has fields from the other call's entry

### Requirement: `findByRecord()` returns tenant-scoped audit rows for one record, newest first

`IAuditLogPort.findByRecord(tableName, recordId, countryAccountsId)` SHALL return every
`audit_logs` row matching `tableName` and `recordId` **and** `countryAccountsId`, ordered by
`timestamp` descending, each resolved with the acting user's display name. It SHALL NOT return
rows belonging to a different `countryAccountsId`, even when `tableName`/`recordId` match.

#### Scenario: Rows are returned newest-first, scoped to the given tenant

- **GIVEN** three `audit_logs` rows for the same `tableName`/`recordId` written at different
  times, two under tenant A and one under tenant B
- **WHEN** `findByRecord(tableName, recordId, "tenant-A")` is called
- **THEN** exactly the two tenant-A rows are returned, newest first
- **AND** the tenant-B row is not included

#### Scenario: No matching rows

- **WHEN** `findByRecord()` is called for a `tableName`/`recordId`/`countryAccountsId` combination
  with no audit history
- **THEN** it resolves to an empty array, not an error

#### Scenario: A row whose acting user no longer resolves

- **GIVEN** an `audit_logs` row whose `user_id` no longer has a matching `userTable` row (e.g. a
  deleted user)
- **WHEN** `findByRecord()` resolves that row
- **THEN** the row's actor-name field MUST be present as a non-throwing fallback value (for
  example null or empty), not a failed query

### Requirement: `findByRecord()` requires an explicit `countryAccountsId`

Unlike `record()`, which tolerates a null `countryAccountsId` for historic rows, `findByRecord()`
SHALL require a non-null `countryAccountsId` argument, so that no caller can accidentally read
audit history across tenants.

#### Scenario: Calling without a `countryAccountsId` is a type-level error

- **GIVEN** `findByRecord`'s signature requires `countryAccountsId: string` (not
  `string | null`)
- **WHEN** a caller is written against this port
- **THEN** omitting `countryAccountsId` or passing `null`/`undefined` MUST fail to compile
