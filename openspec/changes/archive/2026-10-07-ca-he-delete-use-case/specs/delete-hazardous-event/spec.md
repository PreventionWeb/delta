## Purpose

Tenant-scoped deletion of a `HazardousEvent`, blocked by one unified dependent-reference check
across the three mechanisms this check covers — a Disaster Event's `hazardousEventId`, an
`event_causality` row in either direction, and another `HazardousEvent`'s causal link on either
the cause or effect side — surfaced as a single `ConflictError` naming every blocking dependent
and how many (with a same-tenant/cross-tenant disclosure split for the `event_causality` source
specifically). A successful delete also cleans up the event's own `WorkflowInstance` row. The
legacy `event_relationship` table's own outgoing-link role is a known, separately tracked gap
(`DEF-035`) deliberately not covered by this check.

## ADDED Requirements

### Requirement: A hazardous event with no dependents is deleted

`DeleteHazardousEventUseCase.execute(command)` SHALL delete the `HazardousEvent` identified by
`command.id` within `command.tenantId` via `IHazardousEventRepository.delete` when all three
dependent-reference checks resolve no blocking dependent, after first cleaning up the event's
own `WorkflowInstance` row via `IWorkflowRepository.deleteByEntity`.

#### Scenario: Zero dependents deletes successfully

- **GIVEN** a `HazardousEvent` within `command.tenantId` with zero referencing Disaster
  Events, zero `event_causality` rows, and zero `hazardous_event_causality` edges
- **WHEN** `execute(command)` is called
- **THEN** `IWorkflowRepository.deleteByEntity` SHALL be called exactly once with `command.id`
  and `"HE"`
- **AND** `IHazardousEventRepository.delete` SHALL be called exactly once with `command.id`
  and `command.tenantId`
- **AND** `execute()` SHALL resolve without throwing

### Requirement: A missing or foreign-tenant event is rejected before any dependent check

`execute()` SHALL propagate `IHazardousEventRepository.findById`'s own `NotFoundError` when no
`HazardousEvent` exists for `command.id` within `command.tenantId`, and SHALL NOT call any of
the three dependent-reference counts, `IWorkflowRepository.deleteByEntity`, or
`IHazardousEventRepository.delete` in that case.

#### Scenario: findById throws NotFoundError

- **GIVEN** `IHazardousEventRepository.findById` rejects with `NotFoundError` for `command.id`
  and `command.tenantId`
- **WHEN** `execute(command)` is called
- **THEN** the same `NotFoundError` SHALL propagate from `execute()`
- **AND** none of `countReferencingDisasterEvents`, `IEventCausalityRepository.countReferences`,
  `ICausalChainRepository.countEdgesTouching`, `IWorkflowRepository.deleteByEntity`, or `delete`
  SHALL be called

### Requirement: A missing or non-string id, tenantId, or actingUserId is rejected before any lookup

`execute()` SHALL throw `ValidationError` when `command.id`, `command.tenantId`, or
`command.actingUserId` is an empty string, or a non-string value reachable only by a caller
bypassing the compile-time type. No repository call of any kind SHALL occur.

#### Scenario: Empty or non-string id, tenantId, or actingUserId

- **GIVEN** a command whose `id`, `tenantId`, or `actingUserId` is an empty string, or a
  non-string value reachable only by a caller bypassing the compile-time type
- **WHEN** `execute(command)` is called
- **THEN** it SHALL throw `ValidationError`
- **AND** `IHazardousEventRepository.findById` SHALL NOT be called

### Requirement: The ConflictError context has a fixed, observable shape, with a disclosure split for the event_causality source

Every `ConflictError` this use case throws SHALL carry a `context` of the shape
`{ hazardousEventId: string; dependents: Array<DisasterEventDependent |
EventCausalityDependent | CausalChainDependent> }`, where:

- `DisasterEventDependent` is `{ type: "DISASTER_EVENT"; count: number }`
- `EventCausalityDependent` is `{ type: "EVENT_CAUSALITY"; count: number;
  crossTenantReferenceExists: boolean }`, where `count` SHALL equal the same-tenant count only
  — it SHALL NEVER equal or be derived from the cross-tenant count
- `CausalChainDependent` is `{ type: "CAUSAL_CHAIN"; count: number }`

`hazardousEventId` SHALL equal `command.id`. `dependents` SHALL contain exactly one entry per
dependent source that resolved as blocking, each naming that source's own literal discriminator
— never an entry for a non-blocking source, and never more than one entry for the same source.

#### Scenario: A single blocking dependent produces a one-entry dependents array

- **GIVEN** exactly one of the three dependent-reference sources resolves as blocking
- **WHEN** `execute(command)` throws `ConflictError`
- **THEN** the error's `context.hazardousEventId` SHALL equal `command.id`
- **AND** `context.dependents` SHALL have exactly one entry, naming that one dependent type's
  own literal discriminator

### Requirement: A Disaster Event referencing the hazardous event blocks the delete

`execute()` SHALL throw `ConflictError` when
`IHazardousEventRepository.countReferencingDisasterEvents` resolves a count greater than zero,
and SHALL NOT call `IWorkflowRepository.deleteByEntity` or `delete` in that case. The thrown
error's `context.dependents` SHALL include an entry with `type: "DISASTER_EVENT"` and that
count.

#### Scenario: One referencing Disaster Event blocks the delete

- **GIVEN** `countReferencingDisasterEvents` resolves `1` for `command.id`
- **AND** the other two dependent-reference sources resolve non-blocking
- **WHEN** `execute(command)` is called
- **THEN** it SHALL throw `ConflictError`
- **AND** the error's `context.dependents` SHALL include `{ type: "DISASTER_EVENT", count: 1 }`
- **AND** neither `IWorkflowRepository.deleteByEntity` nor `IHazardousEventRepository.delete`
  SHALL be called

### Requirement: An event_causality reference in either direction blocks the delete, disclosing only a same-tenant count and a cross-tenant flag

`execute()` SHALL throw `ConflictError` when `IEventCausalityRepository.countReferences`
resolves a result whose `sameTenantCount` plus `crossTenantCount` is greater than zero, and
SHALL NOT call `IWorkflowRepository.deleteByEntity` or `delete` in that case. The thrown error's
`context.dependents` SHALL include an entry with `type: "EVENT_CAUSALITY"`, `count` equal to
`sameTenantCount`, and `crossTenantReferenceExists` equal to whether `crossTenantCount` is
greater than zero. This is a deliberate behavior change: today, deleting a `HazardousEvent`
referenced only via `event_causality` succeeds and silently cascades away the `event_causality`
row.

#### Scenario: One same-tenant event_causality reference blocks the delete, discloses its count, flags no cross-tenant reference

- **GIVEN** `IEventCausalityRepository.countReferences` resolves
  `{ sameTenantCount: 1, crossTenantCount: 0 }` for `command.id`
- **AND** the other two dependent-reference sources resolve non-blocking
- **WHEN** `execute(command)` is called
- **THEN** it SHALL throw `ConflictError`
- **AND** the error's `context.dependents` SHALL include `{ type: "EVENT_CAUSALITY", count: 1,
  crossTenantReferenceExists: false }`
- **AND** neither `IWorkflowRepository.deleteByEntity` nor `IHazardousEventRepository.delete`
  SHALL be called

#### Scenario: A cross-tenant-only event_causality reference still blocks the delete, disclosing a zero count and a true flag, never the cross-tenant count itself

- **GIVEN** `IEventCausalityRepository.countReferences` resolves
  `{ sameTenantCount: 0, crossTenantCount: 1 }` for `command.id`
- **AND** the other two dependent-reference sources resolve non-blocking
- **WHEN** `execute(command)` is called
- **THEN** it SHALL throw `ConflictError`
- **AND** the error's `context.dependents` SHALL include `{ type: "EVENT_CAUSALITY", count: 0,
  crossTenantReferenceExists: true }`
- **AND** the error's `context` SHALL NOT contain the number `1` (the cross-tenant count)
  anywhere under the `EVENT_CAUSALITY` entry
- **AND** neither `IWorkflowRepository.deleteByEntity` nor `IHazardousEventRepository.delete`
  SHALL be called

#### Scenario: Both same-tenant and cross-tenant event_causality references are present

- **GIVEN** `IEventCausalityRepository.countReferences` resolves
  `{ sameTenantCount: 2, crossTenantCount: 3 }` for `command.id`
- **AND** the other two dependent-reference sources resolve non-blocking
- **WHEN** `execute(command)` is called
- **THEN** it SHALL throw `ConflictError`
- **AND** the error's `context.dependents` SHALL include `{ type: "EVENT_CAUSALITY", count: 2,
  crossTenantReferenceExists: true }`
- **AND** the error's `context` SHALL NOT contain the number `3` (the cross-tenant count)
  anywhere under the `EVENT_CAUSALITY` entry

### Requirement: A causal-chain link on either the cause or the effect side blocks the delete

`execute()` SHALL throw `ConflictError` when `ICausalChainRepository.countEdgesTouching`
resolves a count greater than zero, and SHALL NOT call `IWorkflowRepository.deleteByEntity` or
`delete` in that case. The thrown error's `context.dependents` SHALL include an entry with
`type: "CAUSAL_CHAIN"` and that count. This check SHALL block the delete whether the event is
the cause or the effect side of the edge — an event that is itself an effect, with no outgoing
edge of its own, SHALL still be blocked.

#### Scenario: The event is the cause side of an edge

- **GIVEN** `ICausalChainRepository.countEdgesTouching` resolves `1` for `command.id` because
  it is the cause of some other event
- **AND** the other two dependent-reference sources resolve non-blocking
- **WHEN** `execute(command)` is called
- **THEN** it SHALL throw `ConflictError`
- **AND** the error's `context.dependents` SHALL include `{ type: "CAUSAL_CHAIN", count: 1 }`
- **AND** neither `IWorkflowRepository.deleteByEntity` nor `IHazardousEventRepository.delete`
  SHALL be called

#### Scenario: The event is the effect side of an edge, with no outgoing edge of its own

- **GIVEN** `ICausalChainRepository.countEdgesTouching` resolves `1` for `command.id` because
  it is the effect of some other event's cause, and this event causes nothing itself
- **AND** the other two dependent-reference sources resolve non-blocking
- **WHEN** `execute(command)` is called
- **THEN** it SHALL throw `ConflictError`
- **AND** the error's `context.dependents` SHALL include `{ type: "CAUSAL_CHAIN", count: 1 }`
- **AND** neither `IWorkflowRepository.deleteByEntity` nor `IHazardousEventRepository.delete`
  SHALL be called

### Requirement: All three dependent-reference checks run before any is thrown, and the error names every blocking dependent, not just the first found

`execute()` SHALL resolve all three dependent-reference checks before throwing — it SHALL NOT
stop at the first blocking result. When more than one source is blocking, the single thrown
`ConflictError`'s `context.dependents` SHALL name every blocking source, not only one of them.

#### Scenario: Two dependent sources are both blocking

- **GIVEN** `countReferencingDisasterEvents` resolves `2`
- **AND** `ICausalChainRepository.countEdgesTouching` resolves `1`
- **AND** `IEventCausalityRepository.countReferences` resolves
  `{ sameTenantCount: 0, crossTenantCount: 0 }`
- **WHEN** `execute(command)` is called
- **THEN** all three dependent-reference sources SHALL have been called before `execute()`
  throws
- **AND** it SHALL throw exactly one `ConflictError`
- **AND** that error's `context.dependents` SHALL include `{ type: "DISASTER_EVENT", count: 2 }`
  and `{ type: "CAUSAL_CHAIN", count: 1 }`, and SHALL NOT include an entry for
  `"EVENT_CAUSALITY"`
- **AND** neither `IWorkflowRepository.deleteByEntity` nor `IHazardousEventRepository.delete`
  SHALL be called

### Requirement: The event's WorkflowInstance is deleted after the dependent-check passes, before the main delete

`execute()` SHALL call `IWorkflowRepository.deleteByEntity(command.id, "HE")` after all three
dependent-reference checks resolve non-blocking, and before calling
`IHazardousEventRepository.delete`. A rejection from `deleteByEntity` SHALL propagate from
`execute()` unmodified, and `IHazardousEventRepository.delete` SHALL NOT be called in that case.

#### Scenario: deleteByEntity is called before delete, in that order

- **GIVEN** all three dependent-reference checks resolve non-blocking
- **WHEN** `execute(command)` is called
- **THEN** `IWorkflowRepository.deleteByEntity` SHALL be called before
  `IHazardousEventRepository.delete`

#### Scenario: deleteByEntity rejects, the main delete is never reached

- **GIVEN** all three dependent-reference checks resolve non-blocking
- **AND** `IWorkflowRepository.deleteByEntity` rejects with a generic `Error`
- **WHEN** `execute(command)` is called
- **THEN** the same error SHALL propagate from `execute()`
- **AND** `IHazardousEventRepository.delete` SHALL NOT be called
- **AND** no log event SHALL be emitted

### Requirement: A successful delete is logged once; a blocked or failed delete is not

`execute()` SHALL emit exactly one structured log event when the delete succeeds, naming
`command.id`, `command.tenantId`, and `command.actingUserId`, and SHALL NOT emit a log event
when it throws `NotFoundError`, `ValidationError`, or `ConflictError`, or when any repository
call rejects.

#### Scenario: Successful delete is logged once

- **GIVEN** all three dependent-reference checks resolve non-blocking
- **AND** `IWorkflowRepository.deleteByEntity` resolves successfully
- **WHEN** `execute(command)` succeeds
- **THEN** a structured log event SHALL be emitted exactly once, naming `command.id`,
  `command.tenantId`, and `command.actingUserId`

#### Scenario: No log event when blocked by a dependent

- **WHEN** `execute(command)` throws `ConflictError` for any dependent
- **THEN** no log event SHALL be emitted

#### Scenario: No log event on any other failure

- **WHEN** `execute(command)` throws `NotFoundError` or `ValidationError`, or any repository
  call rejects with an error
- **THEN** no log event SHALL be emitted

### Requirement: Repository errors propagate unmodified

`execute()` SHALL NOT catch or wrap an error rejected by `IHazardousEventRepository.findById`,
`countReferencingDisasterEvents`, `IEventCausalityRepository.countReferences`,
`ICausalChainRepository.countEdgesTouching`, `IWorkflowRepository.deleteByEntity`, or
`IHazardousEventRepository.delete` — each SHALL propagate unmodified.

#### Scenario: A dependent-reference check rejects

- **GIVEN** `findById` resolves an existing event
- **AND** `ICausalChainRepository.countEdgesTouching` rejects with a generic `Error`
- **WHEN** `execute(command)` is called
- **THEN** the same error SHALL propagate from `execute()`
- **AND** neither `IWorkflowRepository.deleteByEntity` nor `IHazardousEventRepository.delete`
  SHALL be called

#### Scenario: delete itself rejects

- **GIVEN** all three dependent-reference checks resolve non-blocking
- **AND** `IWorkflowRepository.deleteByEntity` resolves successfully
- **AND** `IHazardousEventRepository.delete` rejects with a generic `Error`
- **WHEN** `execute(command)` is called
- **THEN** the same error SHALL propagate from `execute()`
- **AND** no log event SHALL be emitted

### Requirement: Two concurrent delete calls for the same event each run to completion without either call itself throwing from shared state

Two simultaneous `execute()` calls for the **same** `id`/`tenantId`, both resolving zero
dependents, where both calls' own `findById` and dependent-reference checks resolve before
either call's own `deleteByEntity`/`delete` runs, MUST each complete without throwing — relying
on `IWorkflowRepository.deleteByEntity`'s and `IHazardousEventRepository.delete`'s own
idempotent, no-op-on-a-missing-row contracts for whichever call's writes run second. This
requirement fixes that read-before-either-write ordering explicitly (matching `4c`'s own "both
calls observe the pre-write edge set" precedent for its structurally similar concurrent
scenario) — it does not claim this is the only possible interleaving: a caller whose second
`execute()` call's own `findById` runs only after the first call's `delete` has already
committed would correctly observe `NotFoundError` instead, which is accepted as equally correct
and is not a scenario this requirement needs to cover separately.

#### Scenario: Two concurrent deletes of the same zero-dependent event, both reads before either write, both succeed

- **GIVEN** a `HazardousEvent` within `command.tenantId` with zero dependents
- **WHEN** `execute(command)` is called twice, concurrently, for the identical `command`, and
  both calls' own `findById` and all three dependent-reference checks resolve before either
  call's own `deleteByEntity`/`delete` is invoked
- **THEN** both calls SHALL resolve without throwing
- **AND** two separate structured log events SHALL be emitted, one per call — the second of
  which records a deletion that, against the real row, was actually a no-op (design.md Risks)
- **AND** this scenario does NOT establish that the real, DB-backed adapter prevents a
  dependent being inserted between either call's own checks and its own writes — that is a
  distinct, unresolved gap (design.md Risks, `DEF-033`)

### Requirement: Concurrent callers for different tenants' events resolve independently

Two simultaneous `execute()` calls for different tenants' events MUST each produce their own
correct result without cross-contamination — each call's own dependent-reference checks MUST
only ever reflect its own `command.id`.

#### Scenario: Two concurrent delete calls for different tenants

- **GIVEN** tenant `T1` has a `HazardousEvent` with zero dependents, and tenant `T2` has a
  `HazardousEvent` with one blocking `event_causality` reference
- **WHEN** `execute({ id: eventT1, tenantId: "T1", ... })` and
  `execute({ id: eventT2, tenantId: "T2", ... })` are called concurrently, before either
  resolves
- **THEN** the `T1` call SHALL resolve successfully, with `delete` called for `eventT1`
- **AND** the `T2` call SHALL throw `ConflictError`, with `delete` never called for `eventT2`
- **AND** neither call's own dependent-reference checks SHALL be affected by the other call's
  own id or result
