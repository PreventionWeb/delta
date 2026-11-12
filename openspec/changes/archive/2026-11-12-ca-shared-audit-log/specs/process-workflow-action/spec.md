## ADDED Requirements

### Requirement: An audit row is written for every processed workflow action

`ProcessWorkflowActionUseCase.execute()` SHALL write one `audit_logs` row for every one of its
seven actions (`submit-validation`/`validate`/`publish`/`return`/`submit-draft`/
`direct-validate`/`direct-publish`) after `workflowRepository.update()` resolves successfully —
`tableName` resolved from `command.entityType` to its legacy table name (`"hazardous_event"` for
`"HE"`), `recordId: command.entityId`, `userId: command.actingUserId`, `action` the command's own
action literal, `oldValues: { status: fromStatus }`, `newValues: { status: saved.status }`,
`countryAccountsId: command.tenantId`.

#### Scenario: Each of the seven actions writes its own audit row

- **WHEN** `execute()` is called with any one of the seven supported actions and the transition
  succeeds
- **THEN** exactly one `audit_logs` row is written
- **AND** its `action` equals the command's own action string, its `tableName` equals the legacy
  table name for `command.entityType`, and its `recordId` equals `command.entityId`
- **AND** its `oldValues.status` equals the instance's status before this call, and its
  `newValues.status` equals `saved.status` (the instance's status after this call resolves,
  including a `validate` call with `alsoApprove: true`, which reflects the final `APPROVED`
  status in one row, not two)

#### Scenario: A failed transition writes no audit row

- **WHEN** `workflowRepository.update()` throws (e.g. `ConcurrentModificationError` or the
  entity's own `ConflictError` on an invalid transition)
- **THEN** no `audit_logs` row is written for that call

### Requirement: An audit-write failure does not block an already-succeeded transition

Mirrors the existing `notify()`-failure precedent (`DEF-023`/Decision 8): `execute()` SHALL NOT
undo or fail a transition whose own `update()` call already succeeded, even if the audit-port
write that follows it fails.

#### Scenario: `record()` rejecting still lets `execute()` resolve successfully

- **WHEN** `workflowRepository.update()` succeeds but the audit port's `record()` call rejects
- **THEN** `execute()` still resolves with the saved `WorkflowInstanceDto`, exactly as if the
  audit write had succeeded
- **AND** the failure is logged at WARN level, independent of and not suppressed by the existing
  `notify()`-failure handling

### Requirement: An unmapped entity type's audit write is skipped, not thrown

Only `"HE"` currently has a legacy table to key `audit_logs` rows against. `execute()` SHALL NOT
fail a transition solely because `command.entityType` has no mapped legacy table name
(`"DE"`/`"DR"`, until they migrate).

#### Scenario: A `DE` or `DR` transition succeeds with no audit row

- **WHEN** `execute()` is called with `command.entityType` set to `"DE"` or `"DR"` and the
  transition succeeds
- **THEN** `execute()` resolves successfully, exactly as it does today
- **AND** no `audit_logs` row is written for that call
- **AND** the skip is logged at WARN level
