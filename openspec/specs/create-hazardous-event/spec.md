# create-hazardous-event Specification

## Purpose

Defines `CreateHazardousEventUseCase`, the single entry point that constructs and persists a new
`HazardousEvent`, optionally links it as the effect of an existing cause event, initializes its
`WorkflowInstance` at `DRAFT`, and returns a `HazardousEventDto`.

## Requirements

### Requirement: CreateHazardousEventUseCase constructs and persists a HazardousEvent with no causeId

`CreateHazardousEventUseCase.execute(command)` SHALL generate a new id internally, compute
`validHazardDriverIds`/`validCustomFieldDefinitionIds` via `IHazardTaxonomyRepository` scoped to
`command.tenantId`, construct a `HazardousEvent` via `HazardousEvent.create()`, and persist it via
`IHazardousEventRepository.save()`. When `command.causeId` is absent, no cause lookup and no
`ICausalChainRepository` call of any kind SHALL be made.

#### Scenario: Happy path with no causeId persists the HazardousEvent and no causal edge

- **GIVEN** a valid `CreateHazardousEventCommand` with `causeId` omitted
- **WHEN** `execute(command)` is called
- **THEN** `IHazardousEventRepository.save` SHALL be called exactly once with a `HazardousEvent`
  whose fields match the command
- **AND** `ICausalChainRepository.findReachableEdgesFrom` and `ICausalChainRepository.saveEdge`
  SHALL NOT be called

#### Scenario: ValidationError from HazardousEvent.create() propagates unmodified

- **GIVEN** a `CreateHazardousEventCommand` whose `hazardDriverIds` includes an id not present in
  the tenant-scoped set `IHazardTaxonomyRepository.findValidHazardDriverIds` resolves
- **WHEN** `execute(command)` is called
- **THEN** the call SHALL reject with the `ValidationError` thrown by `HazardousEvent.create()`,
  unmodified
- **AND** `IHazardousEventRepository.save` SHALL NOT be called

#### Scenario: An empty-string causeId is treated as absent, same as omitted

- **GIVEN** a valid `CreateHazardousEventCommand` with `causeId: ""`
- **WHEN** `execute(command)` is called
- **THEN** `IHazardousEventRepository.findById` SHALL NOT be called
- **AND** `ICausalChainRepository.findReachableEdgesFrom` and `ICausalChainRepository.saveEdge`
  SHALL NOT be called
- **AND** the `hazardous_event.created` log line's `hasCause` field SHALL be `false`

#### Scenario: A failure from the HazardousEvent save propagates unmodified, no later step runs

- **GIVEN** a valid `CreateHazardousEventCommand`, and a fake `IHazardousEventRepository.save`
  stubbed to reject with a generic `Error`
- **WHEN** `execute(command)` is called
- **THEN** the call SHALL reject with that same `Error`, unmodified
- **AND** `IWorkflowRepository.save` and `ICausalChainRepository.saveEdge` SHALL NOT be called

### Requirement: An optional causeId links the new event as the effect of an existing cause

When `command.causeId` is present (a non-empty string — `undefined` or `""` both count as absent),
`execute(command)` SHALL validate the cause event exists via
`IHazardousEventRepository.findById(command.causeId, command.tenantId)` (same-tenant-only,
final for this change; see design.md Decision 4), load the edges reachable from the new event's generated id
via `ICausalChainRepository.findReachableEdgesFrom`, call
`assertCausalLinkDoesNotCreateCycle(edges, command.causeId, newId)`, persist the `HazardousEvent`,
initialize and persist its `WorkflowInstance`, and only then persist the new
`causeId -> effectId` edge via `ICausalChainRepository.saveEdge`. The order MUST be:
`IHazardousEventRepository.save` -> `IWorkflowRepository.save` -> `ICausalChainRepository.saveEdge`
(design.md Decision 5 — this order is deliberate, not incidental: it makes the harder-to-recover
failure, a `HazardousEvent` with no `WorkflowInstance`, require the _second_ write to fail rather
than either of the last two).

#### Scenario: Happy path with a valid causeId persists the event, the workflow instance, then the edge

- **GIVEN** a valid `CreateHazardousEventCommand` with `causeId` set to an id that
  `IHazardousEventRepository.findById` resolves successfully
- **WHEN** `execute(command)` is called
- **THEN** `IHazardousEventRepository.save` SHALL be called before `IWorkflowRepository.save`,
  which SHALL be called before `ICausalChainRepository.saveEdge`
- **AND** `saveEdge` SHALL be called exactly once with `{ causeId: command.causeId, effectId:
<the newly-generated id> }` and `command.causalityExplanation` (or `null` if omitted)

#### Scenario: A failure after the HazardousEvent is saved propagates unmodified, with no compensating delete

- **GIVEN** a valid `CreateHazardousEventCommand` (with or without `causeId`), and a fake
  `IWorkflowRepository.save` or `ICausalChainRepository.saveEdge` stubbed to reject with a generic
  `Error`
- **WHEN** `execute(command)` is called
- **THEN** the call SHALL reject with that same `Error`, unmodified
- **AND** the `HazardousEvent` already persisted by `IHazardousEventRepository.save` SHALL remain
  persisted — `execute()` MUST NOT attempt to delete or roll back any write that already succeeded
  (design.md Decision 5, `DEF-026`: no unit-of-work abstraction exists to make these writes
  atomic; a caller that retries the same logical request on this rejection creates a second,
  distinct `HazardousEvent` rather than resuming the original, since `id` is freshly generated
  per call)

#### Scenario: Missing cause propagates NotFoundError, no writes occur

- **GIVEN** a `CreateHazardousEventCommand` with `causeId` set to an id
  `IHazardousEventRepository.findById` does not find
- **WHEN** `execute(command)` is called
- **THEN** the call SHALL reject with the `NotFoundError` thrown by `findById`, unmodified
- **AND** `IHazardousEventRepository.save`, `ICausalChainRepository.saveEdge`, and
  `IWorkflowRepository.save` SHALL NOT be called

#### Scenario: A causeId belonging to a different tenant is rejected (same-tenant-only, final for this change — see design.md Decision 4)

- **GIVEN** a `CreateHazardousEventCommand` with `command.tenantId` set to `"tenant-1"` and
  `causeId` set to an id that only exists under a different tenant
- **WHEN** `execute(command)` is called
- **THEN** `IHazardousEventRepository.findById` SHALL be called with `(command.causeId,
command.tenantId)`, and the call SHALL reject with the resulting `NotFoundError`, unmodified,
  even though the cause event genuinely exists under another tenant
- **AND** `IHazardousEventRepository.save`, `ICausalChainRepository.saveEdge`, and
  `IWorkflowRepository.save` SHALL NOT be called

#### Scenario: findReachableEdgesFrom is called with the newly-generated id, not causeId

- **GIVEN** any valid `CreateHazardousEventCommand` with `causeId` present
- **WHEN** `execute(command)` is called
- **THEN** `ICausalChainRepository.findReachableEdgesFrom` SHALL be called with the newly-generated
  id (not `command.causeId`)
- **AND** `assertCausalLinkDoesNotCreateCycle` SHALL be called with that id as `effectId` and
  `command.causeId` as `causeId`
- **AND**, with a fake `ICausalChainRepository` returning the edges a real adapter would return for
  a brand-new id (`[]`), execution MUST proceed to persist the edge — a freshly-generated id has no
  existing edges and cannot equal `command.causeId`

#### Scenario: A cycle rejection from a contrived edge set propagates and blocks every write

- **GIVEN** a `CreateHazardousEventCommand` with `causeId` present, and a fake
  `ICausalChainRepository.findReachableEdgesFrom` stubbed to resolve
  `[{ causeId: <the newly-generated id>, effectId: command.causeId }]` (a contrived edge set — not
  reachable through a real adapter, per design.md Decision 1)
- **WHEN** `execute(command)` is called
- **THEN** the call SHALL reject with the `ConflictError` `assertCausalLinkDoesNotCreateCycle`
  throws, unmodified
- **AND** `IHazardousEventRepository.save`, `ICausalChainRepository.saveEdge`, and
  `IWorkflowRepository.save` SHALL NOT be called

#### Scenario: Two concurrent creates with the same causeId both succeed, producing two distinct edges

- **GIVEN** two concurrent `execute()` calls, each with a different `CreateHazardousEventCommand`
  but the same `causeId`, both invoked before either resolves
- **WHEN** both calls resolve
- **THEN** each SHALL persist its own distinct, newly-generated `effectId`
- **AND** `ICausalChainRepository.saveEdge` SHALL be called twice, once per call, each with the
  shared `causeId` and a different `effectId`
- **AND** neither call's cycle check SHALL be affected by the other's in-flight write, because
  each call's own `effectId` is unique to that call and did not exist before it — there is no
  edge either call could observe that involves the other call's `effectId`

### Requirement: WorkflowInstance is initialized at DRAFT for every newly-created HazardousEvent

`execute(command)` SHALL, after persisting the `HazardousEvent` and before persisting any causal
edge (design.md Decision 5), construct a `WorkflowInstance` via `WorkflowInstance.create()` with
`entityId` equal to the saved `HazardousEvent`'s id, `entityType: "HE"`, `status: "DRAFT"`, and
every attribution field `null`, and persist it via `IWorkflowRepository.save()`.

#### Scenario: A DRAFT WorkflowInstance is created and persisted alongside every new event

- **GIVEN** any valid `CreateHazardousEventCommand`
- **WHEN** `execute(command)` resolves successfully
- **THEN** `IWorkflowRepository.save` SHALL have been called exactly once with a `WorkflowInstance`
  whose `entityId` equals the saved `HazardousEvent`'s `id`, `entityType` is `"HE"`, `status` is
  `"DRAFT"`, and every attribution field is `null`

### Requirement: The returned HazardousEventDto reflects the saved event and its DRAFT workflow status

`execute(command)` SHALL return a `HazardousEventDto` derived from `IHazardousEventRepository.save()`'s
resolved value and `IWorkflowRepository.save()`'s resolved value — never the pre-save
`HazardousEvent`/`WorkflowInstance` instances. Date fields MUST be serialized as ISO 8601 strings.

#### Scenario: Returned DTO has status DRAFT and matches the saved event's fields

- **GIVEN** any valid `CreateHazardousEventCommand`
- **WHEN** `execute(command)` resolves
- **THEN** the returned `HazardousEventDto.workflowStatus` SHALL be `"DRAFT"`
- **AND** the DTO's `id` SHALL equal `IHazardousEventRepository.save()`'s resolved `id`
- **AND** `createdAt` SHALL be an ISO 8601 string equal to the saved event's `createdAt`
