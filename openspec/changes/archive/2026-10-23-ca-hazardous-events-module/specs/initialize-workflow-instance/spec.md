## Purpose

Defines the business behaviour of `InitializeWorkflowInstanceUseCase` — the
validation-workflow use case that builds and persists a DRAFT `WorkflowInstance` for a
newly-created entity, on behalf of a cross-domain caller (`CreateHazardousEventUseCase`
today). Exists so that a foreign bounded context never constructs a `WorkflowInstance`
itself and hands it to `IWorkflowRepository.insert()` directly — the owning context
(validation-workflow) builds and persists its own aggregate.

## ADDED Requirements

### Requirement: A DRAFT WorkflowInstance is built and persisted for the given entity

`InitializeWorkflowInstanceUseCase.execute()` SHALL construct a `WorkflowInstance` via
`WorkflowInstance.createDraft()` using a freshly-generated `id` and a single
internally-computed `now`, matching `command.entityId` and `command.entityType`, persist
it via `IWorkflowRepository.insert()`, and return the repository's resolved value (not the
pre-insert instance).

#### Scenario: A new DRAFT WorkflowInstance is created and persisted

- **WHEN** `InitializeWorkflowInstanceUseCase.execute({ entityId, entityType })` is called
- **THEN** `IWorkflowRepository.insert()` is called exactly once with a `WorkflowInstance`
  whose `entityId` is `command.entityId`, `entityType` is `command.entityType`, `status`
  is `"DRAFT"`, and every attribution field (`submittedByUserId`, `validatedByUserId`,
  `approvedByUserId`, `publishedByUserId`) is `null`
- **AND** the use case's own return value is `IWorkflowRepository.insert()`'s resolved
  value, not the pre-insert instance

### Requirement: An optional transaction handle is threaded to the repository call

`execute()` SHALL accept an optional `tx` on its command and pass it, unmodified, to
`IWorkflowRepository.insert()`, so a caller running its own `transactionRunner.run()`
block gets this write inside the same transaction.

#### Scenario: A caller-supplied tx is passed through to the repository

- **GIVEN** `command.tx` is a caller-supplied transaction handle
- **WHEN** `execute(command)` is called
- **THEN** `IWorkflowRepository.insert()` is called with that exact `tx` as its second
  argument

#### Scenario: An omitted tx is passed through as undefined

- **GIVEN** `command.tx` is omitted
- **WHEN** `execute(command)` is called
- **THEN** `IWorkflowRepository.insert()` is called with `undefined` as its second
  argument, letting the repository's own default (no explicit transaction) apply

### Requirement: Concurrent callers for the same entity race on the table's own uniqueness constraint

`workflow_instance` has a unique index on `(entity_id, entity_type)`
(`ca-validation-workflow-module`, archived). `InitializeWorkflowInstanceUseCase` SHALL
perform no existence check of its own before inserting — it MUST rely entirely on this
constraint. Two concurrent `execute()` calls for the *same* `entityId`/`entityType`
therefore behave exactly as the repository's own insert behaviour, not as a no-op:
`IWorkflowRepository.insert()`'s own contract ("first-time persistence only — never
updates an existing row") is exactly the property that makes this scenario deterministic
without the use case adding any locking of its own.

#### Scenario: Two concurrent calls for the same entity — one commits, the other rejects with the constraint violation

- **GIVEN** no `WorkflowInstance` yet exists for a given `entityId`/`entityType`
- **WHEN** two `InitializeWorkflowInstanceUseCase.execute()` calls for that same
  `entityId`/`entityType` are invoked concurrently, neither awaited before the other starts
- **THEN** exactly one call resolves successfully, persisting exactly one row for that
  `entityId`/`entityType`
- **AND** the other call's returned promise rejects with the underlying unique-constraint
  violation, surfaced unmodified — never silently swallowed or converted into a successful
  no-op

#### Scenario: Two concurrent calls for different entities both succeed independently

- **WHEN** two `InitializeWorkflowInstanceUseCase.execute()` calls for two different
  `entityId`s are invoked concurrently
- **THEN** both resolve successfully, each persisting its own distinct row, and neither
  call's resolved `WorkflowInstance` is affected by the other's concurrent write

### Requirement: InitializeWorkflowInstanceUseCase does not log its own success

`execute()` SHALL NOT take an `ILogger` dependency or emit any log event on success. This
use case is always invoked from inside a caller's own open transaction (see the
"transaction handle" requirement above); a log emitted before that transaction commits
would describe a write that may still roll back. The caller logs its own composite event
after its own transaction resolves (matches `RecordSpatialObservationUseCase`'s existing,
identical precedent).

#### Scenario: execute() emits no log event regardless of outcome

- **WHEN** `execute()` is called, whether it resolves or rejects
- **THEN** no `ILogger` method is invoked by this use case
