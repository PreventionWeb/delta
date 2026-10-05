# get-hazardous-event-by-id Specification

## Purpose

Fetches a single, tenant-owned `HazardousEvent` by id and enriches it with its current
workflow status and current spatial observation, returning a `HazardousEventDetailDto` for
a single-event detail view.

## Requirements

### Requirement: Fetch an existing event by id, enriched with workflow status and current spatial observation

`GetHazardousEventByIdUseCase.execute(query)` SHALL retrieve the `HazardousEvent`
identified by `query.id` within `query.tenantId`, resolve its current `WorkflowInstance`
status and its current spatial observation (the reading with the latest `observationTime`,
or `null` if none has been recorded), and return a `HazardousEventDetailDto` reflecting
all three.

#### Scenario: Happy path — an existing event with a recorded spatial observation

- **GIVEN** an existing `HazardousEvent` within `query.tenantId`, an associated
  `WorkflowInstance`, and at least one recorded spatial observation
- **WHEN** `execute(query)` is called with that event's id and tenant
- **THEN** the resolved `HazardousEventDetailDto` SHALL reflect the event's own fields
- **AND** `HazardousEventDetailDto.workflowStatus` SHALL equal the `WorkflowInstance`'s
  current status
- **AND** `HazardousEventDetailDto.currentSpatialObservation` SHALL equal the observation
  `IHazardousEventRepository.findCurrentSpatialObservation` reports as current for that
  event (the port's own contract: latest by `observationTime`, not insertion order — that
  ordering rule is verified by the real adapter's own PGlite test, roadmap `5e`, not by
  this use case's own unit tests, which only verify correct passthrough of whatever the
  port reports)

#### Scenario: No spatial observation has been recorded yet

- **GIVEN** an existing `HazardousEvent` within `query.tenantId` with no spatial
  observation recorded against it
- **WHEN** `execute(query)` is called with that event's id and tenant
- **THEN** `execute()` SHALL NOT throw for this reason
- **AND** the resolved `HazardousEventDetailDto.currentSpatialObservation` SHALL be `null`

### Requirement: A missing or cross-tenant id is rejected before any further lookup

`execute()` SHALL throw `NotFoundError` when `query.id` does not correspond to any
`HazardousEvent` within `query.tenantId` (either the id does not exist at all, or it
exists under a different tenant). No further lookup of any kind SHALL occur.

#### Scenario: Failure — the event does not exist under the caller's tenant

- **GIVEN** `query.id` does not correspond to any `HazardousEvent` within `query.tenantId`
- **WHEN** `execute(query)` is called
- **THEN** it SHALL throw `NotFoundError`
- **AND** no workflow-instance lookup and no spatial-observation lookup SHALL occur

#### Scenario: A missing or non-string tenantId/id is rejected before any lookup

- **GIVEN** a query whose `tenantId` or `id` is an empty string, or a non-string value
  reachable only by a caller bypassing the compile-time type
- **WHEN** `execute(query)` is called
- **THEN** it SHALL throw `ValidationError`
- **AND** no repository lookup of any kind SHALL occur

### Requirement: A missing WorkflowInstance for an otherwise-valid event is rejected

`execute()` SHALL throw `NotFoundError` when no `WorkflowInstance` exists for an event
that itself was successfully resolved by `query.id`/`query.tenantId`. This is a defensive
check: a `WorkflowInstance` is expected to exist for every such event (see design.md
Decision 2 for a named, open risk around pre-migration data this requirement does not
resolve).

#### Scenario: An existing event with no WorkflowInstance

- **GIVEN** an existing `HazardousEvent` within `query.tenantId` that has no associated
  `WorkflowInstance`
- **WHEN** `execute(query)` is called with that event's id and tenant
- **THEN** it SHALL throw `NotFoundError`
- **AND** no spatial-observation lookup SHALL occur

### Requirement: Every lookup after the initial fetch is keyed off the resolved event's own id, not the caller's raw input

`execute()` SHALL use the id resolved by the initial, tenant-scoped `HazardousEvent` lookup
— not the caller-supplied `query.id` directly — for every subsequent lookup, including the
workflow-instance lookup (which has no tenant parameter of its own).

#### Scenario: Subsequent lookups use the resolved event's own id

- **GIVEN** an existing `HazardousEvent` within `query.tenantId`
- **WHEN** `execute(query)` is called with that event's id and tenant
- **THEN** the workflow-instance lookup and the spatial-observation lookup SHALL each be
  performed using the id the initial, tenant-scoped lookup itself resolved

### Requirement: A successful fetch is logged; a failed one is not

`execute()` SHALL emit exactly one structured log event on a successful fetch, and SHALL
NOT emit a log event when it throws for any reason.

#### Scenario: Log event on success

- **WHEN** `execute(query)` succeeds
- **THEN** a structured log event SHALL be emitted exactly once, identifying the fetched
  event's id and tenant

#### Scenario: No log event on any failure

- **WHEN** `execute(query)` throws for any reason (missing id, missing tenant, missing
  event, missing WorkflowInstance)
- **THEN** no log event SHALL be emitted

### Requirement: Concurrent callers for different ids resolve independently

Two simultaneous `execute()` calls for different event ids MUST each produce their own
correct result without cross-contamination — this use case holds no shared mutable state
of its own (no cache, no counter, no module-level variable) that two concurrent calls
could race over.

#### Scenario: Two concurrent fetches for different ids

- **GIVEN** two existing `HazardousEvent`s, `A` and `B`, both within `query.tenantId`
- **WHEN** `execute({ id: A.id, tenantId })` and `execute({ id: B.id, tenantId })` are
  called concurrently, before either resolves
- **THEN** the first call SHALL resolve with a `HazardousEventDetailDto` reflecting `A`
- **AND** the second call SHALL resolve with a `HazardousEventDetailDto` reflecting `B`
- **AND** each call's own repository lookups SHALL be keyed off its own resolved event's
  id, with no interference between the two calls' results
