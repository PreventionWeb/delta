## REMOVED Requirements

### Requirement: A missing WorkflowInstance for an otherwise-valid event is rejected

**Reason**: Resolves `DEF-031` — every event created before this refactor has no
`WorkflowInstance` row until Phase M's backfill runs, and Phase 6 does not depend on Phase M
(per the roadmap's own phase-dependency graph). Throwing here made the detail route unusable for
all pre-refactor data. Superseded by "A missing WorkflowInstance for an otherwise-valid event
degrades gracefully" below, matching `list-hazardous-events`' own existing
`workflowStatus: null` pattern.

**Migration**: Callers that previously caught `NotFoundError` specifically to detect a missing
`WorkflowInstance` must instead check `HazardousEventDetailDto.workflowStatus === null`. No
caller in this codebase does this today (verified: `GetHazardousEventByIdUseCase` has no
production call site yet outside its own tests).

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

## ADDED Requirements

### Requirement: A missing WorkflowInstance for an otherwise-valid event degrades gracefully

`execute()` SHALL NOT throw when no `WorkflowInstance` exists for an event that itself was
successfully resolved by `query.id`/`query.tenantId`. The resolved `HazardousEventDetailDto.workflowStatus`
SHALL be `null` in this case, and the spatial-observation lookup SHALL still proceed normally
(unlike the superseded behavior, which skipped it after throwing). A `null` `workflowStatus`
here is ambiguous between a real data-integrity gap and a not-yet-backfilled legacy row —
this requirement does not resolve that ambiguity, it only ensures the read does not fail
because of it.

#### Scenario: An existing event with no WorkflowInstance is still returned

- **GIVEN** an existing `HazardousEvent` within `query.tenantId` that has no associated
  `WorkflowInstance`
- **WHEN** `execute(query)` is called with that event's id and tenant
- **THEN** `execute()` SHALL NOT throw
- **AND** the resolved `HazardousEventDetailDto.workflowStatus` SHALL be `null`
- **AND** the spatial-observation lookup SHALL still be performed, using the resolved event's
  own id

#### Scenario: An existing event with a WorkflowInstance is unaffected

- **GIVEN** an existing `HazardousEvent` within `query.tenantId` with an associated
  `WorkflowInstance`
- **WHEN** `execute(query)` is called with that event's id and tenant
- **THEN** the resolved `HazardousEventDetailDto.workflowStatus` SHALL equal the
  `WorkflowInstance`'s current status, not `null`

## MODIFIED Requirements

### Requirement: A successful fetch is logged; a failed one is not

`execute()` SHALL emit exactly one structured log event on a successful fetch — including
when the event has no `WorkflowInstance` (now a successful, non-throwing outcome) — and SHALL
NOT emit a log event when it throws for any reason.

#### Scenario: Log event on success

- **WHEN** `execute(query)` succeeds
- **THEN** a structured log event SHALL be emitted exactly once, identifying the fetched
  event's id and tenant

#### Scenario: Log event flags a missing WorkflowInstance without throwing

- **GIVEN** an existing `HazardousEvent` within `query.tenantId` with no associated
  `WorkflowInstance`
- **WHEN** `execute(query)` is called with that event's id and tenant
- **THEN** `execute()` SHALL succeed (not throw)
- **AND** the structured log event emitted for this call SHALL indicate the missing
  `WorkflowInstance` (e.g. a `workflowStatusMissing: true` field), distinguishing it from a
  normal successful fetch for observability purposes

#### Scenario: No log event on any failure

- **WHEN** `execute(query)` throws for any reason (missing id, missing tenant, or missing
  event)
- **THEN** no log event SHALL be emitted
