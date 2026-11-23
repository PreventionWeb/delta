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

### Requirement: ProcessWorkflowActionUseCase supports submit-draft, direct-validate, and direct-publish, mapped onto WorkflowInstance's new direct-transition methods

`ProcessWorkflowActionCommand`'s discriminated union gains three new `action` members:
`'submit-draft'`, `'direct-validate'`, `'direct-publish'`. `submit-draft` carries the base fields
(`entityId`, `entityType`, `actingUserId`) plus `actingUserRole: string | undefined` — the field the
use case's own role-gating check (see "submit-draft requires an edit-capable role" below) reads.
`direct-validate` and `direct-publish` each also carry `actingUserRole: string | undefined` — the
field the use case's own admin-only authorization check (see the Requirement below) reads; no other
additional payload on any of the three.
`applyTransition()`'s switch SHALL call `existing.resetToDraft(transitionParams)` for
`'submit-draft'`, `existing.directValidate(transitionParams)` for `'direct-validate'`, and
`existing.directPublish(transitionParams)` for `'direct-publish'` — each resolved to exactly one
`IWorkflowRepository.update()` call, the same single-commit-boundary shape as every other action.

#### Scenario: submit-draft calls resetToDraft from any status

- **GIVEN** an existing `WorkflowInstance` with `status: "PUBLISHED"`
- **WHEN** `execute({ action: "submit-draft", entityId, entityType, actingUserId, actingUserRole:
  "data-collector" })` is called
- **THEN** `IWorkflowRepository.update` SHALL be called exactly once with an instance whose
  `status` is `"DRAFT"` and every attribution pair is `null`

#### Scenario: direct-validate calls directValidate from DRAFT

- **GIVEN** an existing `WorkflowInstance` with `status: "DRAFT"`
- **WHEN** `execute({ action: "direct-validate", entityId, entityType, actingUserId, actingUserRole:
  "admin" })` is called
- **THEN** the persisted instance's `status` SHALL be `"APPROVED"` and `validatedByUserId` SHALL
  equal `actingUserId`

#### Scenario: direct-publish calls directPublish from REVISION_REQUESTED

- **GIVEN** an existing `WorkflowInstance` with `status: "REVISION_REQUESTED"`
- **WHEN** `execute({ action: "direct-publish", entityId, entityType, actingUserId, actingUserRole:
  "admin" })` is called
- **THEN** the persisted instance's `status` SHALL be `"PUBLISHED"`, `validatedByUserId` and
  `publishedByUserId` SHALL both equal `actingUserId`

#### Scenario: direct-validate from a disallowed status propagates ConflictError, same as every other action

- **GIVEN** an existing `WorkflowInstance` with `status: "SUBMITTED"`
- **WHEN** `execute({ action: "direct-validate", entityId, entityType, actingUserId, actingUserRole:
  "admin" })` is called
- **THEN** the returned promise SHALL reject with an instance of `ConflictError`
- **AND** `IWorkflowRepository.update` SHALL NOT have been called

### Requirement: submit-validation requires a non-empty validator list, enforced authoritatively inside ProcessWorkflowActionUseCase

`execute()` SHALL reject a `submit-validation` command whose `validatorUserIds` is empty with a
`ValidationError` (`"At least one validator must be selected for submit-validation"`), before calling
`IWorkflowRepository.findByEntity`. This is the use case's own authoritative enforcement of the
invariant — revised during implementation (SOLID review, DIP finding: authorization/validation is a
business rule, not a presentation concern, same pattern as the admin-role check below), so every
caller of `execute()` gets the check, not only `hazardous-event-write-route-adapter`'s own route,
which keeps a pre-existing early short-circuit of the same check on its own request path (see that
capability's spec) rather than relying on this check alone.

#### Scenario: submit-validation is rejected when validatorUserIds is empty

- **WHEN** `execute({ action: "submit-validation", entityId, entityType, actingUserId,
  validatorUserIds: [], recordDisplayName, recordDate })` is called
- **THEN** the returned promise SHALL reject with an instance of `ValidationError`
- **AND** `IWorkflowRepository.findByEntity` SHALL NOT have been called
- **AND** `IWorkflowRepository.update` SHALL NOT have been called
- **AND** `INotificationPort.notify` SHALL NOT have been called

#### Scenario: submit-validation proceeds when validatorUserIds is non-empty

- **GIVEN** an existing `WorkflowInstance` with `status: "DRAFT"`
- **WHEN** `execute({ action: "submit-validation", entityId, entityType, actingUserId,
  validatorUserIds: ["validator-1"], recordDisplayName, recordDate })` is called
- **THEN** `IWorkflowRepository.update` SHALL be called exactly once with the persisted instance's
  `status` equal to `"SUBMITTED"`

### Requirement: direct-validate and direct-publish require the admin role, enforced authoritatively inside ProcessWorkflowActionUseCase

`execute()` SHALL reject a `direct-validate`/`direct-publish` command whose `actingUserRole` is not
`"admin"` with an `AuthorizationError` (`"${action} requires the admin role"`), before calling
`IWorkflowRepository.findByEntity`. This is the use case's own authoritative enforcement of the
invariant — revised during implementation (Gate 10 code-review finding, researched against external
Clean Architecture sources: authorization is a business rule, not a presentation concern), so every
caller of `execute()` gets the check, not only `hazardous-event-write-route-adapter`'s own route,
which keeps a pre-existing early short-circuit of the same check on its own request path (see that
capability's spec) rather than relying on this check alone.

#### Scenario: direct-validate is rejected when actingUserRole is not admin

- **WHEN** `execute({ action: "direct-validate", entityId, entityType, actingUserId,
  actingUserRole: "data-collector" })` is called
- **THEN** the returned promise SHALL reject with an instance of `AuthorizationError`
- **AND** `IWorkflowRepository.findByEntity` SHALL NOT have been called

#### Scenario: direct-publish is rejected when actingUserRole is undefined

- **WHEN** `execute({ action: "direct-publish", entityId, entityType, actingUserId,
  actingUserRole: undefined })` is called
- **THEN** the returned promise SHALL reject with an instance of `AuthorizationError`
- **AND** `IWorkflowRepository.findByEntity` SHALL NOT have been called

#### Scenario: direct-validate proceeds when actingUserRole is admin

- **GIVEN** an existing `WorkflowInstance` with `status: "DRAFT"`
- **WHEN** `execute({ action: "direct-validate", entityId, entityType, actingUserId,
  actingUserRole: "admin" })` is called
- **THEN** `IWorkflowRepository.update` SHALL be called exactly once with the persisted instance's
  `status` equal to `"APPROVED"`

### Requirement: submit-draft requires an edit-capable role, enforced authoritatively inside ProcessWorkflowActionUseCase

`execute()` SHALL reject a `submit-draft` command whose `actingUserRole` is `undefined` or
`"data-viewer"` with an `AuthorizationError` (`"submit-draft requires an edit-capable role"`), before
calling `IWorkflowRepository.findByEntity`. This is the use case's own authoritative enforcement of
the invariant (design.md Decision 26) — a minimal, generic backstop closing the gap left by
`resetToDraft()`'s own `allowedFrom` accepting every status (design.md Decision 5/6), which means the
entity provides no authorization-equivalent protection of its own for this action, unlike
`directValidate`/`directPublish`. It is deliberately narrower than HE's own status-aware
edit-permission rule (which also blocks editing by record `workflowStatus`, not just by role) —
that richer rule is HE-specific business policy and stays at the HE route/loader layer (see that
capability's own spec); this use case stays entity-type-agnostic and enforces only the role
dimension. `hazardous-event-write-route-adapter`'s own route keeps a pre-existing early short-circuit
of the same role check on its own request path (see that capability's spec) rather than relying on
this check alone, for consistency with `direct-validate`/`direct-publish`'s own early check —
though, unlike that pair, no role reachable through HE's own routes today is actually rejected by
either check (HE's flat `EditData` permission already excludes `"data-viewer"`/`undefined` before
either check runs); this requirement protects a future caller of `execute()` that does not sit behind
an equivalent gate.

#### Scenario: submit-draft is rejected when actingUserRole is data-viewer

- **WHEN** `execute({ action: "submit-draft", entityId, entityType, actingUserId, actingUserRole:
  "data-viewer" })` is called
- **THEN** the returned promise SHALL reject with an instance of `AuthorizationError`
- **AND** `IWorkflowRepository.findByEntity` SHALL NOT have been called

#### Scenario: submit-draft is rejected when actingUserRole is undefined

- **WHEN** `execute({ action: "submit-draft", entityId, entityType, actingUserId, actingUserRole:
  undefined })` is called
- **THEN** the returned promise SHALL reject with an instance of `AuthorizationError`
- **AND** `IWorkflowRepository.findByEntity` SHALL NOT have been called

#### Scenario: submit-draft proceeds for any edit-capable role

- **GIVEN** an existing `WorkflowInstance` with `status: "PUBLISHED"`
- **WHEN** `execute({ action: "submit-draft", entityId, entityType, actingUserId, actingUserRole })`
  is called with `actingUserRole` equal to `"data-collector"`, `"data-validator"`, or `"admin"`
- **THEN** `IWorkflowRepository.update` SHALL be called exactly once with the persisted instance's
  `status` equal to `"DRAFT"`, for every one of the three roles

### Requirement: submit-draft, direct-validate, and direct-publish never trigger a notification

`buildNotification()` SHALL NOT be reached for `submit-draft`, `direct-validate`, or
`direct-publish` — `execute()` SHALL skip the `notificationPort.notify()` call entirely for these
three actions, after a successful `IWorkflowRepository.update()`, matching legacy's own
`handleSubmitAsDraft`/`handleSubmitAsValidated`/`handleSubmitAsPublished`, none of which call any
email function. This is a deliberate, explicit no-notify branch for each of the three — not an
oversight a future reader should "fix" by wiring up a notification that was never supposed to exist.

#### Scenario: A successful submit-draft does not call notify

- **GIVEN** an existing `WorkflowInstance` with `status: "APPROVED"`
- **WHEN** `execute({ action: "submit-draft", entityId, entityType, actingUserId, actingUserRole:
  "data-collector" })` resolves successfully
- **THEN** `INotificationPort.notify` SHALL NOT have been called

#### Scenario: A successful direct-publish does not call notify

- **GIVEN** an existing `WorkflowInstance` with `status: "DRAFT"`
- **WHEN** `execute({ action: "direct-publish", entityId, entityType, actingUserId, actingUserRole:
  "admin" })` resolves successfully
- **THEN** `INotificationPort.notify` SHALL NOT have been called

#### Scenario: A successful submit-draft/direct-validate/direct-publish still logs one INFO line

- **GIVEN** any of the three new actions resolves successfully
- **WHEN** `execute()` completes
- **THEN** the injected `ILogger.info` SHALL still have been called with
  `msg: "workflow_action.processed"`, reflecting the correct `fromStatus`/`toStatus` — the
  no-notify rule applies only to `INotificationPort.notify`, not to the existing structured-log
  requirement every action already has

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
