## Purpose

Defines the single, entity-type-agnostic use case that processes a validation-workflow
action (`submit-validation`/`validate`/`publish`/`return`) for a `WorkflowInstance`,
replacing today's two independently-duplicated generic services
(`handleApprovalWorkflowService`, `processApprovalStatusActionService`).

## ADDED Requirements

### Requirement: ProcessWorkflowActionUseCase maps the four-action command onto WorkflowInstance's real transition methods

`ProcessWorkflowActionUseCase.execute(command)` SHALL accept a
`ProcessWorkflowActionCommand` discriminated union on `action` (`'submit-validation' |
'validate' | 'publish' | 'return'`). It MUST load the `WorkflowInstance` via
`IWorkflowRepository.findByEntity(command.entityId, command.entityType)`, call the
corresponding entity transition method(s) with a single internally-computed `now = new
Date()` and `userId: command.actingUserId`, persist the result via
`IWorkflowRepository.save()`, and return a `WorkflowInstanceDto` derived from `save()`'s
resolved value. `action: 'reject'` and any transition producing or consuming the
`REJECTED` status MUST NOT be supported by this use case (DEF-022).

#### Scenario: submit-validation calls submit() from DRAFT

- **GIVEN** an existing `WorkflowInstance` with `status: "DRAFT"`
- **WHEN** `execute({ action: "submit-validation", entityId, entityType, actingUserId })`
  is called
- **THEN** `IWorkflowRepository.save` SHALL be called exactly once with an instance whose
  `status` is `"SUBMITTED"` and `submittedByUserId` equals `actingUserId`
- **AND** the returned `WorkflowInstanceDto.status` SHALL be `"SUBMITTED"`

#### Scenario: submit-validation calls submit() from REVISION_REQUESTED

- **GIVEN** an existing `WorkflowInstance` with `status: "REVISION_REQUESTED"`
- **WHEN** `execute({ action: "submit-validation", entityId, entityType, actingUserId })`
  is called
- **THEN** the saved instance's `status` SHALL be `"SUBMITTED"`

#### Scenario: validate with alsoApprove false validates only, status unchanged

- **GIVEN** an existing `WorkflowInstance` with `status: "SUBMITTED"`
- **WHEN** `execute({ action: "validate", alsoApprove: false, entityId, entityType,
actingUserId })` is called
- **THEN** `IWorkflowRepository.save` SHALL be called exactly once with an instance whose
  `status` is still `"SUBMITTED"` and `validatedByUserId` equals `actingUserId`
- **AND** `approvedByUserId` on the saved instance SHALL remain `null`

#### Scenario: validate with alsoApprove true composes validate() then approve()

- **GIVEN** an existing `WorkflowInstance` with `status: "SUBMITTED"`
- **WHEN** `execute({ action: "validate", alsoApprove: true, entityId, entityType,
actingUserId })` is called
- **THEN** `IWorkflowRepository.save` SHALL be called exactly once (not twice — the
  composition happens in memory before the single `save` call) with an instance whose
  `status` is `"APPROVED"`, `validatedByUserId` equals `actingUserId`, and
  `approvedByUserId` equals `actingUserId`
- **AND** `validatedAt` and `approvedAt` on the saved instance SHALL be equal (both stamped
  from the same internally-computed `now`)

#### Scenario: publish calls publish() from APPROVED

- **GIVEN** an existing `WorkflowInstance` with `status: "APPROVED"`
- **WHEN** `execute({ action: "publish", entityId, entityType, actingUserId })` is called
- **THEN** the saved instance's `status` SHALL be `"PUBLISHED"` and `publishedByUserId`
  SHALL equal `actingUserId`

#### Scenario: return calls requestRevision() from SUBMITTED

- **GIVEN** an existing `WorkflowInstance` with `status: "SUBMITTED"`
- **WHEN** `execute({ action: "return", entityId, entityType, actingUserId })` is called
- **THEN** the saved instance's `status` SHALL be `"REVISION_REQUESTED"`

### Requirement: An invalid transition propagates the entity's own ConflictError unmodified

`ProcessWorkflowActionUseCase` MUST NOT add its own status-guard logic. When the entity
method invoked for a given `action` throws `ConflictError` (the current status is not in
that method's `allowedFrom` set), `execute()` MUST reject with that same `ConflictError`
instance, and MUST NOT call `IWorkflowRepository.save()` or `INotificationPort.notify()`.

#### Scenario: publish from DRAFT propagates ConflictError

- **GIVEN** an existing `WorkflowInstance` with `status: "DRAFT"`
- **WHEN** `execute({ action: "publish", entityId, entityType, actingUserId })` is called
- **THEN** the returned promise SHALL reject with an instance of `ConflictError`
- **AND** `IWorkflowRepository.save` SHALL NOT have been called
- **AND** `INotificationPort.notify` SHALL NOT have been called

#### Scenario: validate from DRAFT propagates ConflictError before any approve() call is attempted

- **GIVEN** an existing `WorkflowInstance` with `status: "DRAFT"`
- **WHEN** `execute({ action: "validate", alsoApprove: true, entityId, entityType,
actingUserId })` is called
- **THEN** the returned promise SHALL reject with an instance of `ConflictError`
- **AND** `IWorkflowRepository.save` SHALL NOT have been called

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
- **AND** `IWorkflowRepository.save` SHALL NOT have been called

### Requirement: Repository save errors propagate unmodified

When `IWorkflowRepository.save()` rejects, `execute()` MUST allow the error to propagate
to the caller unmodified and MUST NOT call `INotificationPort.notify()`.

#### Scenario: Repository save throws

- **GIVEN** a valid command whose target transition is legal from the instance's current
  status
- **AND** `IWorkflowRepository.save` is stubbed to reject with a generic `Error`
- **WHEN** `execute(command)` is called
- **THEN** the returned promise SHALL reject with the same error instance
- **AND** `INotificationPort.notify` SHALL NOT have been called

### Requirement: Notification is triggered exactly once per successful execute() call, and never for a failed one

After a successful `IWorkflowRepository.save()`, `execute()` MUST call
`INotificationPort.notify()` exactly once, with a payload whose `fromStatus` reflects the
status before any entity-method call in this `execute()` invocation and whose `toStatus`
reflects the status after the last one. This applies even when `status` itself is
unchanged (a `'validate'` action with `alsoApprove: false`). `notify()` MUST NOT be called
when the transition failed (`ConflictError`) or when `save()` rejected.

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

When `INotificationPort.notify()` rejects after a successful `IWorkflowRepository.save()`,
`execute()` MUST still resolve with the `WorkflowInstanceDto` derived from `save()`'s
result. The `notify()` failure MUST be logged via the injected `ILogger.warn` (not
`ILogger.error` — a swallowed, tolerated degradation per ADR-004's error-handling rules,
not a broken system) and MUST NOT be re-thrown. If the injected `ILogger` itself throws
while logging the swallowed failure, `execute()` MUST still resolve, falling back to a
last-resort `console.error` call (the sanctioned `ILogger` channel has itself failed, so no
other channel exists at that point — `DEF-023`).

#### Scenario: Notification port throws after a successful save

- **GIVEN** a valid command whose transition succeeds and `IWorkflowRepository.save`
  resolves normally
- **AND** `INotificationPort.notify` is stubbed to reject with a generic `Error`
- **WHEN** `execute(command)` is called
- **THEN** the returned promise SHALL resolve with a `WorkflowInstanceDto` matching the
  saved instance
- **AND** the injected `ILogger.warn` SHALL have been called at least once with the
  notification failure
- **AND** the injected `ILogger.error` SHALL NOT have been called

#### Scenario: Both notify() and the injected ILogger reject/throw

- **GIVEN** a valid command whose transition succeeds
- **AND** `INotificationPort.notify` is stubbed to reject with a generic `Error`
- **AND** the injected `ILogger.warn` is stubbed to throw
- **WHEN** `execute(command)` is called
- **THEN** the returned promise SHALL still resolve with a `WorkflowInstanceDto` matching
  the saved instance
- **AND** a last-resort `console.error` call SHALL record the notification failure

### Requirement: A successful execute() call logs one INFO line reflecting the actual transition

After a successful `IWorkflowRepository.save()` (and regardless of whether `notify()`
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

### Requirement: The returned WorkflowInstanceDto is derived from save()'s resolved value, not the pre-save instance

`toWorkflowInstanceDto()` MUST be called with the `WorkflowInstance` resolved by
`IWorkflowRepository.save()`, never with the use case's own locally-transitioned instance,
so that any repository-side enrichment (e.g. DB-generated values) is reflected in the
returned DTO.

#### Scenario: A repository that returns an enriched instance is reflected in the DTO

- **GIVEN** `IWorkflowRepository.save` is stubbed to resolve a `WorkflowInstance` whose
  `updatedAt` differs from the instance passed into it
- **WHEN** a valid command is executed
- **THEN** the returned `WorkflowInstanceDto.updatedAt` SHALL match the `save()`-resolved
  instance's `updatedAt`, not the pre-save instance's

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

### Requirement: Concurrent callers to ProcessWorkflowActionUseCase on the same entity race at the repository tier — last write wins, no error to either caller, even across conflicting actions

When two callers invoke `ProcessWorkflowActionUseCase.execute()` for the same `entityId` +
`entityType`, and one caller's transition is driven from a stale pre-transition snapshot
that a second caller has already moved on from, the stale caller's `execute()` call MUST
still resolve successfully (no `ConflictError`) as long as its action was legal from the
status it actually read — even when the outcome contradicts a transition the other caller
already persisted (e.g. one caller approves/publishes the record while the stale caller
sends it back for revision). The `IWorkflowRepository.save()` call that completes last is
the one whose result persists; a caller whose own `save()` completed earlier receives no
error and no indication that its transition was subsequently overwritten by a conflicting
one — this holds even when the overwritten state was `PUBLISHED`, since
`WorkflowInstance`'s "terminal" guarantee is enforced only per in-memory instance, not at
the persistence tier. This is an accepted, inherited limitation of `IWorkflowRepository`'s
current contract (no optimistic-locking or lost-update guard exists at that tier) — not a
defect introduced by this use case, and not fixed by it.

#### Scenario: A stale-read 'return' silently overwrites a concurrently-published record

- **GIVEN** a single `WorkflowInstance` with `status: "SUBMITTED"`, read by both caller A
  and caller B's first call from a fake `IWorkflowRepository` whose `findByEntity`
  resolves that same pre-transition `SUBMITTED` snapshot to both
- **AND** caller B makes two sequential `execute()` calls that both complete before A's
  does: first `validate` with `alsoApprove: true` (reads the shared `SUBMITTED` snapshot,
  persists `status: "APPROVED"`, one `save()`, one `notify()` with `toStatus: "APPROVED"`),
  then `publish` (freshly reads B's own just-saved `APPROVED` instance — not the stale
  snapshot — persists `status: "PUBLISHED"`, a second `save()`, a second `notify()` with
  `toStatus: "PUBLISHED"`)
- **WHEN** caller A, still holding its original stale `SUBMITTED` snapshot (read before
  either of B's calls), calls `execute({ action: "return", entityId, entityType,
  actingUserId: userA })` and its `save()` call completes after both of caller B's
- **THEN** caller A's returned promise SHALL resolve successfully (no `ConflictError`,
  since A's in-memory transition was legal from the `SUBMITTED` status it read)
- **AND** the entity's persisted `status` SHALL be `"REVISION_REQUESTED"`, overwriting the
  `"PUBLISHED"` state B's second `save()` had persisted
- **AND** `IWorkflowRepository.save` SHALL have been called exactly three times in total
  (B's `validate`+`alsoApprove:true`, B's `publish`, A's `return`) and
  `INotificationPort.notify` SHALL have fired exactly three times — once per successful
  `execute()` call per Decision 7 — with `toStatus` values, in completion order,
  `["APPROVED", "PUBLISHED", "REVISION_REQUESTED"]` and no mechanism reconciling the final
  two contradictory notifications
- **AND** neither caller's returned `WorkflowInstanceDto` SHALL indicate that a conflicting
  concurrent transition occurred

**Correction:** an earlier draft of this scenario underspecified caller B as a single
"sequence of calls" and asserted only two `save()`/`notify()` calls total. Recounted
directly against Decision 7 ("notify fires once per successful `execute()` call"): B's
`validate`+`alsoApprove:true` and B's `publish` are two separate `execute()` invocations
(the second reads the first's freshly-saved `APPROVED` result, not the stale snapshot),
so together with A's `return` there are three `execute()` calls, three `save()` calls, and
three `notify()` calls, not two. Decision 7 itself is unchanged — this is a scenario
arithmetic fix, not a design change.
