## ADDED Requirements

### Requirement: An optional spatialObservation is recorded inside the same transaction as the create

`CreateHazardousEventCommand` SHALL accept an optional `spatialObservation` field, with the same
shape as `UpdateHazardousEventCommand`'s own `spatialObservation` field (`Omit<RecordSpatialObservationCommand,
"tenantId" | "hazardousEventId" | "tx">`). When present, `execute()` SHALL call
`RecordSpatialObservationUseCase.execute({ ...command.spatialObservation, tenantId: command.tenantId,
hazardousEventId: <the saved event's id>, tx })` inside the same `transactionRunner.run()` block
that persists the `HazardousEvent` and its `WorkflowInstance` — mirroring
`UpdateHazardousEventUseCase`'s own composition of `RecordSpatialObservationUseCase` exactly. When
absent, no spatial-observation write of any kind SHALL occur.

#### Scenario: A command with spatialObservation records it inside the create's own transaction

- **GIVEN** a valid `CreateHazardousEventCommand` with `spatialObservation` present
- **WHEN** `execute(command)` resolves successfully
- **THEN** `RecordSpatialObservationUseCase.execute` SHALL have been called exactly once, with
  `hazardousEventId` equal to the newly-created event's id and the same `tx` used for the
  `HazardousEvent`/`WorkflowInstance` writes
- **AND** the structured success log SHALL be emitted only after this call (and every other write
  in the transaction) has committed

#### Scenario: A command with no spatialObservation performs no spatial-observation write

- **GIVEN** a valid `CreateHazardousEventCommand` with `spatialObservation` omitted
- **WHEN** `execute(command)` is called
- **THEN** `RecordSpatialObservationUseCase.execute` SHALL NOT be called

#### Scenario: A spatial-observation failure rolls back the whole transaction, including the already-inserted event

- **GIVEN** a valid `CreateHazardousEventCommand` with `spatialObservation` present, and a fake
  `RecordSpatialObservationUseCase.execute` stubbed to reject with a generic `Error`
- **WHEN** `execute(command)` is called
- **THEN** the call SHALL reject with that same `Error`
- **AND** no `HazardousEvent`, no `WorkflowInstance`, and no spatial observation from this call
  SHALL exist afterward — the same whole-transaction-rolls-back guarantee
  "The full write sequence runs as one atomic transaction" already specifies for the other two
  writes now extends to this third, conditional one

### Requirement: An optional cause must not start after the new event, same guard Update already enforces

When `command.causeId` is present, `execute()` SHALL call
`assertCauseStartsNoLaterThanEffect(cause.startDate, newEvent.startDate)` immediately after the
existing `assertCausalLinkDoesNotCreateCycle` check, and before any write. A cause whose `startDate`
is later than the new event's `startDate` SHALL cause `execute()` to reject with the `ConflictError`
`assertCauseStartsNoLaterThanEffect` throws, with no write of any kind performed.

#### Scenario: A cause starting after the new event is rejected before any write

- **GIVEN** a `CreateHazardousEventCommand` with `causeId` set to an existing event whose
  `startDate` is later than `command.startDate`
- **WHEN** `execute(command)` is called
- **THEN** the call SHALL reject with the `ConflictError` thrown by
  `assertCauseStartsNoLaterThanEffect`
- **AND** `IHazardousEventRepository.insert`, `IWorkflowRepository.insert`, and
  `ICausalChainRepository.saveEdge` SHALL NOT be called

#### Scenario: A cause starting no later than the new event passes the check

- **GIVEN** a `CreateHazardousEventCommand` with `causeId` set to an existing event whose
  `startDate` is equal to or earlier than `command.startDate`
- **WHEN** `execute(command)` is called
- **THEN** execution SHALL proceed to persist the event, its workflow instance, and the causal edge

#### Scenario: A malformed startDate on either event skips the check, same as Update's own behavior

- **GIVEN** a `CreateHazardousEventCommand` with `causeId` present, where either the cause's or the
  new event's `startDate` is not a validly-formatted flexible date
- **WHEN** `execute(command)` is called
- **THEN** `assertCauseStartsNoLaterThanEffect` SHALL NOT reject the call on that basis — the
  temporal-order check is skipped, matching `assertCauseStartsNoLaterThanEffect`'s own documented
  behavior (a malformed date skips the check rather than failing closed)

### Requirement: The new event's legacy HIP columns are populated via the anti-corruption layer, inside the same transaction

`execute()` SHALL call `IHipCrosswalkPort.resolve(command.specificHazardId)` and, inside the same
`transactionRunner.run()` block that inserts the `HazardousEvent`, call
`IHipCrosswalkPort.stamp(saved.id, command.tenantId, <the resolved ids>, tx)` immediately after the
`HazardousEvent` insert succeeds.

#### Scenario: A successful create stamps the resolved HIP ids inside its own transaction

- **GIVEN** a valid `CreateHazardousEventCommand` whose `specificHazardId` resolves to a non-null
  `hipHazardId`/`hipClusterId`/`hipTypeId` crosswalk
- **WHEN** `execute(command)` resolves successfully
- **THEN** `IHipCrosswalkPort.stamp` SHALL have been called exactly once, with the newly-created
  event's id, `command.tenantId`, the resolved ids, and the same `tx` used for the `HazardousEvent`/
  `WorkflowInstance` writes

#### Scenario: A stamp() failure rolls back the whole transaction, including the already-inserted event

- **GIVEN** a valid `CreateHazardousEventCommand`, and a fake `IHipCrosswalkPort.stamp` stubbed to
  reject with a generic `Error`
- **WHEN** `execute(command)` is called
- **THEN** the call SHALL reject with that same `Error`
- **AND** no `HazardousEvent` and no `WorkflowInstance` from this call SHALL exist afterward
