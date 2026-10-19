## MODIFIED Requirements

### Requirement: CreateHazardousEventUseCase constructs and persists a HazardousEvent with no causeId

`CreateHazardousEventUseCase.execute(command)` SHALL generate a new id internally, compute
`validHazardDriverIds`/`validCustomFieldDefinitionIds` via `IHazardTaxonomyRepository` scoped to
`command.tenantId`, construct a `HazardousEvent` via `HazardousEvent.create()`, and persist it via
`IHazardousEventRepository.save()`. When `command.causeId` is absent, no cause lookup and no
`ICausalChainRepository` call of any kind SHALL be made.

`execute(command)` SHALL validate that `command.actingUserId` is present (neither `undefined`/`null`
nor an empty or whitespace-only string after trimming) before any write, and MUST throw
`ValidationError` referencing `actingUserId` otherwise, with no write of any kind.

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

#### Scenario: A missing or non-string actingUserId is rejected before any write

- **GIVEN** a `CreateHazardousEventCommand` whose `actingUserId` is an empty string, or a non-string
  value reachable only by a caller bypassing the compile-time type
- **WHEN** `execute(command)` is called
- **THEN** the call SHALL reject with `ValidationError`
- **AND** `IHazardousEventRepository.save` SHALL NOT be called
