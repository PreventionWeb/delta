## REMOVED Requirements

### Requirement: Concurrent callers to ProcessWorkflowActionUseCase on the same entity race at the repository tier — last write wins, no error to either caller, even across conflicting actions

**Reason**: this was the exact behavior `DEF-024` tracked as an accepted, not-yet-fixed
gap ("This is an accepted, inherited limitation of `IWorkflowRepository`'s current
contract... not fixed by it" — this change is that fix). `update()` now rejects a stale
write with `ConcurrentModificationError` instead of silently persisting it.

**Migration**: see the new "ProcessWorkflowActionUseCase passes the previously-read
updatedAt to update(), closing the stale-write race" requirement below, which propagates
`ConcurrentModificationError` unmodified (design.md Decision 6).

### Requirement: Repository save errors propagate unmodified

**Reason**: renamed and narrowed — `save()` no longer exists, and the blanket "every
error propagates unmodified" statement is now split: `ConcurrentModificationError` also
propagates unmodified (Decision 6), but is specified in its own requirement since it is
the one error type this change introduces reaction semantics for.

**Migration**: see "Repository update errors other than ConcurrentModificationError
propagate unmodified" under `ADDED Requirements` below for the unconditional case, and
"ProcessWorkflowActionUseCase passes the previously-read updatedAt to update(), closing
the stale-write race" for the `ConcurrentModificationError` case.

### Requirement: The returned WorkflowInstanceDto is derived from save()'s resolved value, not the pre-save instance

**Reason**: renamed — `save()` no longer exists; `update()` is the method whose resolved
value the DTO is now derived from. No scenario's asserted outcome changes.

**Migration**: see "The returned WorkflowInstanceDto is derived from update()'s resolved
value, not the pre-update instance" under `ADDED Requirements` below.

## MODIFIED Requirements

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
supported by this use case (DEF-022).

#### Scenario: submit-validation calls submit() from DRAFT

- **GIVEN** an existing `WorkflowInstance` with `status: "DRAFT"`
- **WHEN** `execute({ action: "submit-validation", entityId, entityType, actingUserId })`
  is called
- **THEN** `IWorkflowRepository.update` SHALL be called exactly once with an instance whose
  `status` is `"SUBMITTED"` and `submittedByUserId` equals `actingUserId`, and
  `expectedUpdatedAt` equal to the `updatedAt` of the instance `findByEntity` resolved
- **AND** the returned `WorkflowInstanceDto.status` SHALL be `"SUBMITTED"`

#### Scenario: submit-validation calls submit() from REVISION_REQUESTED

- **GIVEN** an existing `WorkflowInstance` with `status: "REVISION_REQUESTED"`
- **WHEN** `execute({ action: "submit-validation", entityId, entityType, actingUserId })`
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

## ADDED Requirements

### Requirement: Repository update errors other than ConcurrentModificationError propagate unmodified

When `IWorkflowRepository.update()` rejects with an error that is not a
`ConcurrentModificationError` (e.g. a generic connectivity failure, or the pre-existing
identity-mismatch `ConflictError`), `execute()` MUST allow the error to propagate to the
caller unmodified and MUST NOT call `INotificationPort.notify()`. `ConcurrentModificationError`
propagates the same way — see the separate requirement below (Decision 6).

#### Scenario: Repository update throws a generic error

- **GIVEN** a valid command whose target transition is legal from the instance's current
  status
- **AND** `IWorkflowRepository.update` is stubbed to reject with a generic `Error`
- **WHEN** `execute(command)` is called
- **THEN** the returned promise SHALL reject with the same error instance
- **AND** `INotificationPort.notify` SHALL NOT have been called

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

### Requirement: ProcessWorkflowActionUseCase passes the previously-read updatedAt to update(), closing the stale-write race

`ProcessWorkflowActionUseCase.execute()` MUST call `IWorkflowRepository.update(transitioned,
existing.updatedAt)`, where `existing` is the `WorkflowInstance` resolved by its own
`findByEntity()` call, before any transition method was applied to it. This is what allows
`update()` (per `workflow-repository-port`'s own requirements) to detect that another
writer has already persisted a change since this `execute()` call's own read, closing the
race the removed "last write wins" requirement above used to document as accepted.

**Decided 2026-10-12 (design.md Decision 6):** `execute()` propagates
`ConcurrentModificationError` unmodified — the same "propagate, don't retry" behavior as
every other `update()` rejection (see the "Repository update errors other than
ConcurrentModificationError propagate unmodified" requirement above). No bounded-retry
loop is implemented; a stale caller sees a hard failure and must re-read and resubmit
itself.

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
