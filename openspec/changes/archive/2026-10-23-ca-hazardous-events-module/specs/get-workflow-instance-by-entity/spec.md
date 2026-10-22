## Purpose

Defines the business behaviour of `GetWorkflowInstanceByEntityUseCase` — the
validation-workflow use case that proxies a single-entity `WorkflowInstance` lookup for a
cross-domain caller (`GetHazardousEventByIdUseCase` and `UpdateHazardousEventUseCase`
today), so neither caller depends on `IWorkflowRepository` directly.

## ADDED Requirements

### Requirement: Returns the WorkflowInstance for the given entity, or null when absent

`GetWorkflowInstanceByEntityUseCase.execute()` SHALL call
`IWorkflowRepository.findByEntity(query.entityId, query.entityType)` and return its
result unmodified — `null` when no instance exists, matching
`IWorkflowRepository.findByEntity`'s own documented contract ("resolves null, never
throws, when no instance exists yet").

#### Scenario: An existing WorkflowInstance is returned

- **GIVEN** a `WorkflowInstance` exists for `entityId`/`entityType`
- **WHEN** `GetWorkflowInstanceByEntityUseCase.execute({ entityId, entityType })` is
  called
- **THEN** the returned value is that `WorkflowInstance`

#### Scenario: A missing WorkflowInstance resolves to null, not an error

- **GIVEN** no `WorkflowInstance` exists for `entityId`/`entityType`
- **WHEN** `GetWorkflowInstanceByEntityUseCase.execute({ entityId, entityType })` is
  called
- **THEN** the returned value is `null`
- **AND** `execute()` does not throw

### Requirement: Concurrent callers for the same entity each resolve independently

This use case SHALL hold no in-process cache or request-coalescing of its own — each call
fires its own `IWorkflowRepository.findByEntity` query. This is a deliberate, stated
decision (not an oversight): coalescing concurrent identical reads is a caching concern
that does not belong in a thin proxy use case, and nothing in this change's scope asks for
one.

#### Scenario: Two concurrent reads for the same entity both resolve to the current state

- **GIVEN** a `WorkflowInstance` exists for a given `entityId`/`entityType`
- **WHEN** two `GetWorkflowInstanceByEntityUseCase.execute()` calls for that same
  `entityId`/`entityType` are invoked concurrently, neither awaited before the other starts
- **THEN** both calls resolve successfully
- **AND** `IWorkflowRepository.findByEntity` is called once per `execute()` call (twice in
  total) — no call is coalesced or skipped on the other's behalf

### Requirement: GetWorkflowInstanceByEntityUseCase does not log

`execute()` SHALL NOT take an `ILogger` dependency or emit any log event. This is a
collaborator-only use case, never reached directly by a route; its callers each already
log one composite event per top-level call (`hazardous_event.fetched`,
`hazardous_event.updated`). Giving this use case its own log line would add new
per-sub-fetch log noise with no corresponding behavioural need.

#### Scenario: execute() emits no log event regardless of outcome

- **WHEN** `execute()` is called, whether it resolves to a `WorkflowInstance` or `null`
- **THEN** no `ILogger` method is invoked by this use case
