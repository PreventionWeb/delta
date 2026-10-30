# list-workflow-instances-by-entity-ids Specification

## Purpose

Defines the business behaviour of `ListWorkflowInstancesByEntityIdsUseCase` — the
validation-workflow use case that proxies a batched `WorkflowInstance` lookup for a
cross-domain caller (`ListHazardousEventsUseCase` today), so the caller does not depend on
`IWorkflowRepository` directly.

## Requirements

### Requirement: Returns the WorkflowInstances for the given entity ids, omitting entities with none

`ListWorkflowInstancesByEntityIdsUseCase.execute()` SHALL call
`IWorkflowRepository.findByEntityIds(query.entityIds, query.entityType)` and return its
result unmodified — matching `IWorkflowRepository.findByEntityIds`'s own documented
contract ("omits entities with no instance rather than returning nulls").

#### Scenario: Instances are returned for entities that have one, omitting those that don't

- **GIVEN** `entityIds` contains three ids, of which only two have a `WorkflowInstance`
- **WHEN** `ListWorkflowInstancesByEntityIdsUseCase.execute({ entityIds, entityType })` is
  called
- **THEN** the returned array contains exactly the two existing `WorkflowInstance`s, with
  no `null` placeholder for the third

#### Scenario: An empty entityIds array resolves to an empty array

- **GIVEN** `entityIds` is `[]`
- **WHEN** `ListWorkflowInstancesByEntityIdsUseCase.execute({ entityIds: [], entityType })`
  is called
- **THEN** the returned value is `[]`
- **AND** `execute()` does not throw

### Requirement: Concurrent callers for overlapping entity ids each resolve independently

Same rationale as `GetWorkflowInstanceByEntityUseCase`: this use case SHALL hold no
in-process cache or request-coalescing, by deliberate decision, not oversight.

#### Scenario: Two concurrent batched reads with overlapping entity ids both resolve to the current state

- **GIVEN** `WorkflowInstance`s exist for a set of entity ids
- **WHEN** two `ListWorkflowInstancesByEntityIdsUseCase.execute()` calls, each for an
  overlapping subset of those entity ids, are invoked concurrently, neither awaited before
  the other starts
- **THEN** both calls resolve successfully, each returning the instances matching its own
  requested subset
- **AND** `IWorkflowRepository.findByEntityIds` is called once per `execute()` call (twice
  in total) — no call is coalesced or skipped on the other's behalf

### Requirement: ListWorkflowInstancesByEntityIdsUseCase does not log

`execute()` SHALL NOT take an `ILogger` dependency or emit any log event — same rationale
as `GetWorkflowInstanceByEntityUseCase`: a collaborator-only use case whose caller
(`ListHazardousEventsUseCase`) already logs one composite `hazardous_events.listed` event
per top-level call.

#### Scenario: execute() emits no log event regardless of outcome

- **WHEN** `execute()` is called, regardless of how many instances it returns
- **THEN** no `ILogger` method is invoked by this use case
