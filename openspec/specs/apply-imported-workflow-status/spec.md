# apply-imported-workflow-status Specification

## Purpose

Applies a workflow status carried by an imported record (for example a record already published
in the source system) to a new CA WorkflowInstance, through the domain's own transitions, inside
the caller's transaction, without notifications and only for admins.

## Requirements

### Requirement: ApplyImportedWorkflowStatusUseCase moves a new instance to an imported status through the domain's own transitions

`ApplyImportedWorkflowStatusUseCase.execute({ entityId, entityType, tenantId, targetStatus,
actingUserId, actingUserRole, tx })`, in the `validation-workflow` application layer, SHALL read the entity's
WorkflowInstance with `tx`. It SHALL then apply this path from its current status, using only
`WorkflowInstance`'s own transition methods, so `REQUIRED_SET`/`REQUIRED_NULL` hold by
construction:

| `targetStatus`     | From DRAFT                       | From REVISION_REQUESTED       |
| ------------------ | -------------------------------- | ----------------------------- |
| DRAFT              | no-op                            | `status_change_not_supported` |
| SUBMITTED          | `submit`                         | `submit`                      |
| REVISION_REQUESTED | `submit`, then `requestRevision` | no-op                         |
| APPROVED           | `directValidate`                 | `directValidate`              |
| PUBLISHED          | `directPublish`                  | `directPublish`               |

A target equal to the current status SHALL be a no-op from any status. Any other combination
MUST throw `ConflictError` with `context.reason = "status_change_not_supported"`. Every
transition SHALL use `actingUserId` and one `now` taken once per call (NOD-1). The result SHALL
be saved with `tx` (`IWorkflowRepository.update`, optimistic lock). One audit entry with action
"Workflow status imported", `countryAccountsId = tenantId` and old/new status SHALL be written with
`IAuditLogPort.record(entry, tx)`. Unlike `ProcessWorkflowActionUseCase`, which records without
`tx` and tolerates failure (`ProcessWorkflowAction.ts:219-250`), a failure here MUST reject, so the
import rolls back rather than committing a status change with no audit trail. `REJECTED` MUST NOT be accepted as a target (no legacy value maps to
it; DEF-022).

#### Scenario: Import as published

- **GIVEN** a DRAFT instance for entity E
- **WHEN** `execute({ entityId: E, targetStatus: "PUBLISHED", actingUserId: U, actingUserRole: "admin", tx })` resolves
- **THEN** the instance is PUBLISHED with `validatedByUserId = publishedByUserId = U` and both
  times equal
- **AND** one audit row is written in `tx`

#### Scenario: Import as needs revision

- **GIVEN** a DRAFT instance
- **WHEN** the target is `REVISION_REQUESTED`
- **THEN** the instance is REVISION_REQUESTED with `submittedByUserId = U` set and the approved
  and published pairs null

#### Scenario: Unsupported change

- **GIVEN** a PUBLISHED instance
- **WHEN** the target is `DRAFT`
- **THEN** `ConflictError` with reason `status_change_not_supported` is thrown and nothing is
  saved

### Requirement: Imported statuses never notify and require the admin role

The use case MUST NOT call `INotificationPort`, for any target (NOD-3). Any target other than
DRAFT MUST pass the existing role check `isWorkflowActionAuthorized("direct-publish", actingUserRole)`
(`validation-workflow/application/isWorkflowActionAuthorized.ts`, admin only), enforced inside the
use case and never by a second literal; otherwise it MUST
throw `AuthorizationError` before any write (NOD-2, the same rule as direct-validate and
direct-publish). The use case MUST NOT log its own success; its caller logs the outcome.

#### Scenario: A non-admin import of a validated status is refused

- **WHEN** `actingUserRole` is `data-collector` and the target is `APPROVED`
- **THEN** `AuthorizationError` is thrown and the instance is unchanged

#### Scenario: Submitting on import sends no email

- **WHEN** the target is `SUBMITTED`
- **THEN** the notification port is never called and no `workflow_notification` row exists

### Requirement: The status change rolls back with the caller's transaction

All reads and writes of the use case SHALL use the caller's `tx`. If the caller rolls back, the
instance's status, attribution and audit entry MUST be unchanged afterwards.

#### Scenario: Rollback undoes the imported status

- **GIVEN** a DRAFT instance and a caller transaction `outer`
- **WHEN** `execute({ ..., targetStatus: "PUBLISHED", tx: outer })` resolves and `outer` is then
  rolled back
- **THEN** the instance is still DRAFT and no audit row for it exists

#### Scenario: Two concurrent imports of the same entity's status

- **GIVEN** a DRAFT instance and two caller transactions that both call `execute` for it at the
  same time
- **WHEN** both try to commit
- **THEN** at most one status change commits, and the other rejects with
  `ConcurrentModificationError` (the repository's existing optimistic lock on `updatedAt`)
