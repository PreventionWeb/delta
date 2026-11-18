## ADDED Requirements

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
