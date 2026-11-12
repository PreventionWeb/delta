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
