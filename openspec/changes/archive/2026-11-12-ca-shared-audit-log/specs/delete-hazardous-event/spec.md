## ADDED Requirements

### Requirement: An audit row is written inside the same transaction as a delete

`DeleteHazardousEventUseCase.execute()` SHALL write one `audit_logs` row — `tableName:
"hazardous_event"`, `recordId` the deleted event's id, `userId: command.actingUserId`, `action:
"delete"` (lowercase, matching legacy's own existing convention for this action), `oldValues` the
full pre-delete row, `newValues: null`, `countryAccountsId: command.tenantId` — as part of the
same transaction as the row delete, not after it.

#### Scenario: A successful delete writes exactly one correctly-shaped audit row

- **WHEN** `execute()` is called for an event with no blocking dependents and completes
  successfully
- **THEN** exactly one `audit_logs` row exists for the deleted event's id afterward
- **AND** its `action` is `"delete"`, its `oldValues` matches the event's state immediately
  before the delete, and its `newValues` is null
- **AND** its `countryAccountsId` equals `command.tenantId`

#### Scenario: A delete blocked by a dependent writes no audit row

- **WHEN** `execute()` finds a blocking dependent (a referencing Disaster Event, event-causality
  link, or causal-chain edge) and throws `ConflictError` before the row delete runs
- **THEN** no `audit_logs` row is written for that event

#### Scenario: A no-op delete (row already removed by a concurrent caller) writes no audit row

- **WHEN** `execute()`'s row-lock step finds the event already deleted by a concurrent transaction
  and resolves as a no-op, as it already does today
- **THEN** no `audit_logs` row is written for that attempt
