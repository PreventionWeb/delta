## ADDED Requirements

### Requirement: An audit row is written inside the same transaction as an update

`UpdateHazardousEventUseCase.execute()` SHALL write one `audit_logs` row — `tableName:
"hazardous_event"`, `recordId` the event's id, `userId: command.actingUserId`, `action: "Update
hazardous event"`, `oldValues` the full pre-update row, `newValues` the full updated row,
`countryAccountsId: command.tenantId` — as part of the same transaction as the row update, not
after it.

#### Scenario: A successful update writes exactly one correctly-shaped audit row

- **WHEN** `execute()` is called with a valid command and completes successfully
- **THEN** exactly one new `audit_logs` row exists for the event's id afterward
- **AND** its `action` is `"Update hazardous event"`, its `oldValues` matches the event's state
  before this update, and its `newValues` matches the event's state after this update
- **AND** its `countryAccountsId` equals `command.tenantId`

#### Scenario: A failure inside the update's own transaction leaves no audit row either

- **WHEN** `execute()`'s transaction fails partway through (e.g. the HIP crosswalk stamp step, the
  causal-edge change, or the spatial-observation delegation throws) after the row update but
  before the transaction commits
- **THEN** the row update is rolled back
- **AND** no new `audit_logs` row from this attempted update exists afterward
