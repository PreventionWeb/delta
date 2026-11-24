## ADDED Requirements

### Requirement: An audit row is written inside the same transaction as a create

`CreateHazardousEventUseCase.execute()` SHALL write one `audit_logs` row — `tableName:
"hazardous_event"`, `recordId` the new event's id, `userId: command.actingUserId`, `action:
"Create hazardous event"`, `oldValues: null`, `newValues` the inserted event (single-encoded, not
double-JSON-stringified), `countryAccountsId: command.tenantId` — as part of the same transaction
as the event insert, not after it.

#### Scenario: A successful create writes exactly one correctly-shaped audit row

- **WHEN** `execute()` is called with a valid command and completes successfully
- **THEN** exactly one `audit_logs` row exists for the new event's id afterward
- **AND** its `action` is `"Create hazardous event"`, its `oldValues` is null, and its
  `newValues` matches the inserted event when parsed once (not nested JSON requiring a second
  parse)
- **AND** its `countryAccountsId` equals `command.tenantId`

#### Scenario: A failure inside the create's own transaction leaves no audit row either

- **WHEN** `execute()`'s transaction fails partway through (e.g. the HIP crosswalk stamp step
  throws) after the event insert but before the transaction commits
- **THEN** the event insert is rolled back
- **AND** no `audit_logs` row exists for that attempted event id afterward
