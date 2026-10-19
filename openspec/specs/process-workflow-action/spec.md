# process-workflow-action Specification

## Purpose

Defines the single, entity-type-agnostic use case that processes a validation-workflow
action (`submit-validation`/`validate`/`publish`/`return`) for a `WorkflowInstance`,
replacing today's two independently-duplicated generic services
(`handleApprovalWorkflowService`, `processApprovalStatusActionService`).

## Requirements

### Requirement: ProcessWorkflowActionUseCase maps the four-action command onto WorkflowInstance's real transition methods

`ProcessWorkflowActionUseCase.execute(command)` SHALL accept a
`ProcessWorkflowActionCommand` discriminated union on `action` (`'submit-validation' |
'validate' | 'publish' | 'return'`). It MUST load the `WorkflowInstance` via
`IWorkflowRepository.findByEntity(command.entityId, command.entityType)`, call the
corresponding entity transition method(s) with a single internally-computed `now = new
Date()` and `userId: command.actingUserId`, persist the result via
`IWorkflowRepository.update(transitioned, existing.updatedAt)` — passing the `updatedAt`
of the instance it loaded via `findByEntity`, before any transition was applied — and
return a `WorkflowInstanceDto` derived from `update()`'s resolved value. `action:
'reject'` and any transition producing or consuming the `REJECTED` status MUST NOT be
supported by this use case (DEF-022). The `{ action: "submit-validation" }` variant MUST
additionally carry `validatorUserIds: readonly string[]`, `recordDisplayName: string`, and
`recordDate: string`. The `{ action: "return" }` variant MUST additionally carry
`rejectionComments: string` (required, non-empty) and MAY carry `assigneeUserIds?: readonly
string[]`. None of these additional fields affect which transition method is called or
which status values are involved — they affect only the notification payload `execute()`
builds (see "execute() passes return/submit-validation command fields and the saved
instance's submittedByUserId through to the notification payload" below).

#### Scenario: submit-validation calls submit() from DRAFT

- **GIVEN** an existing `WorkflowInstance` with `status: "DRAFT"`
- **WHEN** `execute({ action: "submit-validation", entityId, entityType, actingUserId,
validatorUserIds: ["validator-1"], recordDisplayName: "Flood", recordDate: "2026-10-01" })`
  is called
- **THEN** `IWorkflowRepository.update` SHALL be called exactly once with an instance whose
  `status` is `"SUBMITTED"` and `submittedByUserId` equals `actingUserId`, and
  `expectedUpdatedAt` equal to the `updatedAt` of the instance `findByEntity` resolved
- **AND** the returned `WorkflowInstanceDto.status` SHALL be `"SUBMITTED"`

#### Scenario: submit-validation calls submit() from REVISION_REQUESTED

- **GIVEN** an existing `WorkflowInstance` with `status: "REVISION_REQUESTED"`
- **WHEN** `execute({ action: "submit-validation", entityId, entityType, actingUserId,
validatorUserIds: ["validator-1"], recordDisplayName: "Flood", recordDate: "2026-10-01" })`
  is called
- **THEN** the persisted instance's `status` SHALL be `"SUBMITTED"`

#### Scenario: validate with alsoApprove false validates only, status unchanged

- **GIVEN** an existing `WorkflowInstance` with `status: "SUBMITTED"`
- **WHEN** `execute({ action: "validate", alsoApprove: false, entityId, entityType,
actingUserId })` is called
- **THEN** `IWorkflowRepository.update` SHALL be called exactly once with an instance whose
  `status` is still `"SUBMITTED"` and `validatedByUserId` equals `actingUserId`
- **AND** `approvedByUserId` on the persisted instance SHALL remain `null`

#### Scenario: validate with alsoApprove true composes validate() then approve()

- **GIVEN** an existing `WorkflowInstance` with `status: "SUBMITTED"`
- **WHEN** `execute({ action: "validate", alsoApprove: true, entityId, entityType,
actingUserId })` is called
- **THEN** `IWorkflowRepository.update` SHALL be called exactly once (not twice — the
  composition happens in memory before the single `update` call) with an instance whose
  `status` is `"APPROVED"`, `validatedByUserId` equals `actingUserId`, and
  `approvedByUserId` equals `actingUserId`
- **AND** `validatedAt` and `approvedAt` on the persisted instance SHALL be equal (both stamped
  from the same internally-computed `now`)

#### Scenario: publish calls publish() from APPROVED

- **GIVEN** an existing `WorkflowInstance` with `status: "APPROVED"`
- **WHEN** `execute({ action: "publish", entityId, entityType, actingUserId })` is called
- **THEN** the persisted instance's `status` SHALL be `"PUBLISHED"` and `publishedByUserId`
  SHALL equal `actingUserId`

#### Scenario: return calls requestRevision() from SUBMITTED

- **GIVEN** an existing `WorkflowInstance` with `status: "SUBMITTED"`
- **WHEN** `execute({ action: "return", entityId, entityType, actingUserId })` is called
- **THEN** the persisted instance's `status` SHALL be `"REVISION_REQUESTED"`

### Requirement: An invalid transition propagates the entity's own ConflictError unmodified

`ProcessWorkflowActionUseCase` MUST NOT add its own status-guard logic. When the entity
method invoked for a given `action` throws `ConflictError` (the current status is not in
that method's `allowedFrom` set), `execute()` MUST reject with that same `ConflictError`
instance, and MUST NOT call `IWorkflowRepository.update()` or `INotificationPort.notify()`.

#### Scenario: publish from DRAFT propagates ConflictError

- **GIVEN** an existing `WorkflowInstance` with `status: "DRAFT"`
- **WHEN** `execute({ action: "publish", entityId, entityType, actingUserId })` is called
- **THEN** the returned promise SHALL reject with an instance of `ConflictError`
- **AND** `IWorkflowRepository.update` SHALL NOT have been called
- **AND** `INotificationPort.notify` SHALL NOT have been called

#### Scenario: validate from DRAFT propagates ConflictError before any approve() call is attempted

- **GIVEN** an existing `WorkflowInstance` with `status: "DRAFT"`
- **WHEN** `execute({ action: "validate", alsoApprove: true, entityId, entityType,
actingUserId })` is called
- **THEN** the returned promise SHALL reject with an instance of `ConflictError`
- **AND** `IWorkflowRepository.update` SHALL NOT have been called

### Requirement: A missing WorkflowInstance is reported as a typed not-found error, never auto-created

When `IWorkflowRepository.findByEntity` resolves `null` for the given `entityId` +
`entityType`, `execute()` MUST reject with `WorkflowInstanceNotFoundError` (extends
`NotFoundError`). It MUST NOT construct a new `WorkflowInstance` on the caller's behalf —
initializing one at `DRAFT` is a different use case's responsibility (`CreateHazardousEvent`
and its siblings), not this one's.

#### Scenario: No instance exists for the given entity

- **GIVEN** `IWorkflowRepository.findByEntity` is stubbed to resolve `null`
- **WHEN** `execute({ action: "submit-validation", entityId, entityType, actingUserId })`
  is called
- **THEN** the returned promise SHALL reject with an instance of
  `WorkflowInstanceNotFoundError`
- **AND** `IWorkflowRepository.update` SHALL NOT have been called

### Requirement: Repository update errors other than ConcurrentModificationError propagate unmodified

When `IWorkflowRepository.update()` rejects with an error that is not a
`ConcurrentModificationError` (e.g. a generic connectivity failure, or the pre-existing
identity-mismatch `ConflictError`), `execute()` MUST allow the error to propagate to the
caller unmodified and MUST NOT call `INotificationPort.notify()`. `ConcurrentModificationError`
propagates the same way — see "ProcessWorkflowActionUseCase passes the previously-read
updatedAt to update(), closing the stale-write race" below (Decision 6).

#### Scenario: Repository update throws a generic error

- **GIVEN** a valid command whose target transition is legal from the instance's current
  status
- **AND** `IWorkflowRepository.update` is stubbed to reject with a generic `Error`
- **WHEN** `execute(command)` is called
- **THEN** the returned promise SHALL reject with the same error instance
- **AND** `INotificationPort.notify` SHALL NOT have been called

### Requirement: Notification is triggered exactly once per successful execute() call, and never for a failed one

After a successful `IWorkflowRepository.update()`, `execute()` MUST call
`INotificationPort.notify()` exactly once, with a payload whose `fromStatus` reflects the
status before any entity-method call in this `execute()` invocation and whose `toStatus`
reflects the status after the last one. This applies even when `status` itself is
unchanged (a `'validate'` action with `alsoApprove: false`). `notify()` MUST NOT be called
when the transition failed (`ConflictError`) or when `update()` rejected, including with
`ConcurrentModificationError` (Decision 6: propagated unmodified, no retry — a rejected
`update()` never reaches `notify()`).

#### Scenario: validate with alsoApprove false still triggers exactly one notification

- **GIVEN** an existing `WorkflowInstance` with `status: "SUBMITTED"`
- **WHEN** `execute({ action: "validate", alsoApprove: false, entityId, entityType,
actingUserId })` resolves successfully
- **THEN** `INotificationPort.notify` SHALL have been called exactly once
- **AND** the notification payload's `fromStatus` and `toStatus` SHALL both be
  `"SUBMITTED"`

#### Scenario: validate with alsoApprove true triggers exactly one notification reflecting the final status

- **GIVEN** an existing `WorkflowInstance` with `status: "SUBMITTED"`
- **WHEN** `execute({ action: "validate", alsoApprove: true, entityId, entityType,
actingUserId })` resolves successfully
- **THEN** `INotificationPort.notify` SHALL have been called exactly once
- **AND** the notification payload's `fromStatus` SHALL be `"SUBMITTED"` and `toStatus`
  SHALL be `"APPROVED"`

### Requirement: A notification-send failure does not fail an already-persisted transition

When `INotificationPort.notify()` rejects after a successful `IWorkflowRepository.update()`,
`execute()` MUST still resolve with the `WorkflowInstanceDto` derived from `update()`'s
result. The `notify()` failure MUST be logged via the injected `ILogger.warn` (not
`ILogger.error` — a swallowed, tolerated degradation per ADR-004's error-handling rules,
not a broken system) and MUST NOT be re-thrown. If the injected `ILogger` itself throws
while logging the swallowed failure, `execute()` MUST still resolve, falling back to a
last-resort `console.error` call (the sanctioned `ILogger` channel has itself failed, so no
other channel exists at that point — `DEF-023`).

#### Scenario: Notification port throws after a successful save

- **GIVEN** a valid command whose transition succeeds and `IWorkflowRepository.update`
  resolves normally
- **AND** `INotificationPort.notify` is stubbed to reject with a generic `Error`
- **WHEN** `execute(command)` is called
- **THEN** the returned promise SHALL resolve with a `WorkflowInstanceDto` matching the
  persisted instance
- **AND** the injected `ILogger.warn` SHALL have been called at least once with the
  notification failure
- **AND** the injected `ILogger.error` SHALL NOT have been called

#### Scenario: Both notify() and the injected ILogger reject/throw

- **GIVEN** a valid command whose transition succeeds
- **AND** `INotificationPort.notify` is stubbed to reject with a generic `Error`
- **AND** the injected `ILogger.warn` is stubbed to throw
- **WHEN** `execute(command)` is called
- **THEN** the returned promise SHALL still resolve with a `WorkflowInstanceDto` matching
  the persisted instance
- **AND** a last-resort `console.error` call SHALL record the notification failure

### Requirement: A successful execute() call logs one INFO line reflecting the actual transition

After a successful `IWorkflowRepository.update()` (and regardless of whether `notify()`
subsequently succeeds or fails), `execute()` MUST log one `ILogger.info` line carrying the
instance id, entity id/type, action, `fromStatus`, `toStatus`, and acting user id.

#### Scenario: A successful publish logs an INFO line

- **GIVEN** an existing `WorkflowInstance` with `status: "APPROVED"`
- **WHEN** `execute({ action: "publish", entityId, entityType, actingUserId })` resolves
  successfully
- **THEN** the injected `ILogger.info` SHALL have been called with
  `msg: "workflow_action.processed"`
- **AND** the logged fields SHALL reflect `fromStatus: "APPROVED"` and
  `toStatus: "PUBLISHED"`

### Requirement: The returned WorkflowInstanceDto is derived from update()'s resolved value, not the pre-update instance

`toWorkflowInstanceDto()` MUST be called with the `WorkflowInstance` resolved by
`IWorkflowRepository.update()`, never with the use case's own locally-transitioned instance,
so that any repository-side enrichment (e.g. DB-generated values) is reflected in the
returned DTO.

#### Scenario: A repository that returns an enriched instance is reflected in the DTO

- **GIVEN** `IWorkflowRepository.update` is stubbed to resolve a `WorkflowInstance` whose
  `updatedAt` differs from the instance passed into it
- **WHEN** a valid command is executed
- **THEN** the returned `WorkflowInstanceDto.updatedAt` SHALL match the `update()`-resolved
  instance's `updatedAt`, not the pre-update instance's

### Requirement: WorkflowInstanceDto shape is correct

`toWorkflowInstanceDto(instance)` SHALL return a plain object implementing
`WorkflowInstanceDto` with the following field mappings from a `WorkflowInstance` entity:

| `WorkflowInstanceDto` field | Source                                        |
| --------------------------- | --------------------------------------------- |
| `id`                        | `instance.id`                                 |
| `entityId`                  | `instance.entityId`                           |
| `entityType`                | `instance.entityType`                         |
| `status`                    | `instance.status`                             |
| `submittedByUserId`         | `instance.submittedByUserId`                  |
| `submittedAt`               | `instance.submittedAt?.toISOString() ?? null` |
| `validatedByUserId`         | `instance.validatedByUserId`                  |
| `validatedAt`               | `instance.validatedAt?.toISOString() ?? null` |
| `approvedByUserId`          | `instance.approvedByUserId`                   |
| `approvedAt`                | `instance.approvedAt?.toISOString() ?? null`  |
| `publishedByUserId`         | `instance.publishedByUserId`                  |
| `publishedAt`               | `instance.publishedAt?.toISOString() ?? null` |
| `createdAt`                 | `instance.createdAt.toISOString()`            |
| `updatedAt`                 | `instance.updatedAt.toISOString()`            |

#### Scenario: toWorkflowInstanceDto maps all fields correctly for a fully-attributed instance

- **GIVEN** a `WorkflowInstance` entity with `status: "PUBLISHED"` and all four
  attribution pairs set to non-null values
- **WHEN** `toWorkflowInstanceDto(instance)` is called
- **THEN** every `*At` field in the returned object SHALL equal the corresponding source
  field's `.toISOString()` value
- **AND** every `*ByUserId` field SHALL equal the corresponding source field unchanged

#### Scenario: toWorkflowInstanceDto maps null attribution timestamps as null, not as a thrown error

- **GIVEN** a `WorkflowInstance` entity with `status: "DRAFT"` and all four attribution
  pairs `null`
- **WHEN** `toWorkflowInstanceDto(instance)` is called
- **THEN** `submittedAt`, `validatedAt`, `approvedAt`, and `publishedAt` SHALL all be `null`
  in the returned object
- **AND** the call SHALL NOT throw

### Requirement: ProcessWorkflowActionUseCase passes the previously-read updatedAt to update(), closing the stale-write race

`ProcessWorkflowActionUseCase.execute()` MUST call `IWorkflowRepository.update(transitioned,
existing.updatedAt)`, where `existing` is the `WorkflowInstance` resolved by its own
`findByEntity()` call, before any transition method was applied to it. This is what allows
`update()` (per `workflow-repository-port`'s own requirements) to detect that another
writer has already persisted a change since this `execute()` call's own read, closing the
race a prior version of this use case left as an accepted, unfixed limitation.

**Decided 2026-10-12 (design.md Decision 6):** `execute()` propagates
`ConcurrentModificationError` unmodified — the same "propagate, don't retry" behavior as
every other `update()` rejection (see "Repository update errors other than
ConcurrentModificationError propagate unmodified" above). No bounded-retry loop is
implemented; a stale caller sees a hard failure and must re-read and resubmit itself.

#### Scenario: A stale caller's execute() call is rejected with ConcurrentModificationError when another caller has already persisted a change

- **GIVEN** a single `WorkflowInstance` with `status: "SUBMITTED"`, read by both caller A
  and caller B from a fake `IWorkflowRepository` whose `findByEntity` resolves that same
  pre-transition `SUBMITTED` snapshot to both
- **WHEN** caller B calls `execute({ action: "validate", alsoApprove: true, ... })` and its
  `update()` call commits first, persisting `status: "APPROVED"`
- **AND** caller A, still holding its original stale `SUBMITTED` snapshot, calls
  `execute({ action: "return", ... })` and its own `update()` call — using the same
  `expectedUpdatedAt` both callers originally read — commits after B's
- **THEN** caller A's `execute()` call MUST reject with `ConcurrentModificationError`
  (the exact error instance `update()` threw, propagated unmodified)
- **AND** the entity's persisted `status` MUST remain `"APPROVED"` (B's persisted state),
  not be overwritten by A's stale `"REVISION_REQUESTED"` attempt
- **AND** `INotificationPort.notify` MUST have fired exactly once (for B's successful
  call) — not for A's rejected one

### Requirement: execute() passes return/submit-validation command fields and the saved instance's submittedByUserId through to the notification payload

After a successful `IWorkflowRepository.update()`, the `WorkflowActionNotification` built
by `execute()` MUST include `submittedByUserId` equal to the `update()`-resolved instance's
own `submittedByUserId` (never reloaded from an entity-type-specific table). When
`command.action === "submit-validation"`, the payload MUST include `validatorUserIds`,
`recordDisplayName`, and `recordDate` copied unmodified from the command. When
`command.action === "return"`, the payload MUST include `rejectionComments` copied
unmodified from the command, and `assigneeUserIds` copied unmodified from the command when
present (omitted from the payload when the command omits it). For `"validate"` and
`"publish"` commands, none of these five action-specific fields SHALL be present on the
payload.

#### Scenario: submit-validation's command fields reach the notification payload unmodified

- **GIVEN** an existing `WorkflowInstance` with `status: "DRAFT"`
- **WHEN** `execute({ action: "submit-validation", entityId, entityType, actingUserId,
validatorUserIds: ["v1", "v2"], recordDisplayName: "Flood", recordDate: "2026-10-01" })`
  resolves successfully
- **THEN** `INotificationPort.notify` SHALL have been called with a payload whose
  `validatorUserIds` is `["v1", "v2"]`, `recordDisplayName` is `"Flood"`, and `recordDate`
  is `"2026-10-01"`

#### Scenario: return's rejectionComments and assigneeUserIds reach the notification payload unmodified

- **GIVEN** an existing `WorkflowInstance` with `status: "SUBMITTED"` and
  `submittedByUserId: "submitter-1"`
- **WHEN** `execute({ action: "return", entityId, entityType, actingUserId,
rejectionComments: "Fix the location", assigneeUserIds: ["assignee-1", "assignee-2"] })`
  resolves successfully
- **THEN** `INotificationPort.notify` SHALL have been called with a payload whose
  `rejectionComments` is `"Fix the location"`, `assigneeUserIds` is `["assignee-1",
"assignee-2"]`, and `submittedByUserId` is `"submitter-1"`

#### Scenario: return without assigneeUserIds omits the field from the notification payload

- **GIVEN** an existing `WorkflowInstance` with `status: "SUBMITTED"` and
  `submittedByUserId: "submitter-1"`
- **WHEN** `execute({ action: "return", entityId, entityType, actingUserId,
rejectionComments: "Fix the location" })` resolves successfully (no `assigneeUserIds`
  supplied)
- **THEN** `INotificationPort.notify` SHALL have been called with a payload whose
  `rejectionComments` is `"Fix the location"`, `assigneeUserIds` is `undefined`, and
  `submittedByUserId` is `"submitter-1"`

#### Scenario: validate and publish notification payloads never carry the five action-specific fields

- **GIVEN** an existing `WorkflowInstance` with `status: "APPROVED"` and
  `submittedByUserId: "submitter-2"`
- **WHEN** `execute({ action: "publish", entityId, entityType, actingUserId })` resolves
  successfully
- **THEN** `INotificationPort.notify` SHALL have been called with a payload whose
  `validatorUserIds`, `recordDisplayName`, `recordDate`, `rejectionComments`, and
  `assigneeUserIds` are all `undefined`
- **AND** `submittedByUserId` on that payload SHALL be `"submitter-2"`
