# delete-workflow-instance Specification

## Purpose

Defines the business behaviour of `DeleteWorkflowInstanceUseCase` — the
validation-workflow use case that removes the `WorkflowInstance` for a deleted entity, on
behalf of a cross-domain caller (`DeleteHazardousEventUseCase` today). Exists so that a
foreign bounded context never calls `IWorkflowRepository.deleteByEntity()` directly.

## Requirements

### Requirement: The WorkflowInstance for the given entity is removed, idempotently

`DeleteWorkflowInstanceUseCase.execute()` SHALL call
`IWorkflowRepository.deleteByEntity(command.entityId, command.entityType, command.tx)`
and resolve. Matching `IWorkflowRepository.deleteByEntity`'s own documented contract, this
MUST resolve normally even when no matching instance exists — it is not an error for this
use case to be called for an entity with no `WorkflowInstance` row.

#### Scenario: An existing WorkflowInstance is deleted

- **GIVEN** a `WorkflowInstance` exists for `entityId`/`entityType`
- **WHEN** `DeleteWorkflowInstanceUseCase.execute({ entityId, entityType })` is called
- **THEN** `IWorkflowRepository.deleteByEntity` is called exactly once with that
  `entityId` and `entityType`
- **AND** no `WorkflowInstance` row remains for that `entityId`/`entityType` afterward

#### Scenario: Deleting a non-existent WorkflowInstance resolves normally

- **GIVEN** no `WorkflowInstance` exists for `entityId`/`entityType`
- **WHEN** `DeleteWorkflowInstanceUseCase.execute({ entityId, entityType })` is called
- **THEN** `execute()` resolves without throwing

### Requirement: An optional transaction handle is threaded to the repository call

`execute()` SHALL accept an optional `tx` on its command and pass it, unmodified, to
`IWorkflowRepository.deleteByEntity()`, so a caller running its own
`transactionRunner.run()` block gets this delete inside the same transaction.

#### Scenario: A caller-supplied tx is passed through to the repository

- **GIVEN** `command.tx` is a caller-supplied transaction handle
- **WHEN** `execute(command)` is called
- **THEN** `IWorkflowRepository.deleteByEntity()` is called with that exact `tx` as its
  third argument

#### Scenario: An omitted tx is passed through as undefined

- **GIVEN** `command.tx` is omitted
- **WHEN** `execute(command)` is called
- **THEN** `IWorkflowRepository.deleteByEntity()` is called with `undefined` as its third
  argument

### Requirement: Concurrent callers for the same entity are both safe, by the repository's own idempotency

Unlike `InitializeWorkflowInstanceUseCase`'s insert-side race (which the database's unique
constraint turns into a deterministic winner/loser), `IWorkflowRepository.deleteByEntity`'s
idempotency SHALL ensure neither concurrent caller observes an error.

#### Scenario: Two concurrent deletes for the same entity both resolve successfully

- **GIVEN** exactly one `WorkflowInstance` row exists for a given `entityId`/`entityType`
- **WHEN** two `DeleteWorkflowInstanceUseCase.execute()` calls for that same
  `entityId`/`entityType` are invoked concurrently, neither awaited before the other starts
- **THEN** both calls resolve successfully (neither rejects)
- **AND** exactly zero rows remain for that `entityId`/`entityType` afterward — whichever
  call's delete actually removed the row, the other's delete is a no-op against an
  already-absent row, per `IWorkflowRepository.deleteByEntity`'s own idempotent contract

### Requirement: DeleteWorkflowInstanceUseCase does not log its own success

`execute()` SHALL NOT take an `ILogger` dependency or emit any log event on success — same
rationale as `InitializeWorkflowInstanceUseCase`: it always runs inside a caller's own open
transaction, and the caller logs its own composite event after that transaction commits.

#### Scenario: execute() emits no log event regardless of outcome

- **WHEN** `execute()` is called, whether it resolves or rejects
- **THEN** no `ILogger` method is invoked by this use case
