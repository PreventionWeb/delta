# hazardous-events-module-wiring Specification

## Purpose

Defines the NestJS DI wiring that makes the six Phase 4 hazardous-events use cases
resolvable from an application context, by registering concrete adapters for
`IHazardousEventRepository`, `ICausalChainRepository`, `IHazardTaxonomyRepository`,
`IDivisionRepository`, and `ITransactionRunner` behind typed tokens, and by importing
`ValidationWorkflowModule` and `EventCausalityModule` for their respective
cross-domain port dependencies.

## Requirements

### Requirement: HazardousEventsModule compiles without error

`HazardousEventsModule` SHALL compile into a valid NestJS `TestingModule` when
passed to `Test.createTestingModule`, including its imports of
`ValidationWorkflowModule` and `EventCausalityModule`. No error MUST be thrown
during `compile()`.

#### Scenario: Module compiles successfully

- **WHEN** `Test.createTestingModule({ imports: [HazardousEventsModule] }).compile()`
  is called
- **THEN** the returned module is defined and no exception is thrown

### Requirement: HAZARDOUS_EVENT_REPOSITORY resolves to DrizzleHazardousEventRepository

`HazardousEventsModule` SHALL register `DrizzleHazardousEventRepository` under the
`HAZARDOUS_EVENT_REPOSITORY` injection token. `module.get(HAZARDOUS_EVENT_REPOSITORY)`
MUST return an instance of `DrizzleHazardousEventRepository`, and repeated calls
MUST return the same singleton.

#### Scenario: Token resolves to the correct adapter

- **WHEN** `module.get(HAZARDOUS_EVENT_REPOSITORY)` is called on a compiled
  `HazardousEventsModule`
- **THEN** the returned value is an instance of `DrizzleHazardousEventRepository`

#### Scenario: Token resolves to the same singleton on repeated gets

- **WHEN** `module.get(HAZARDOUS_EVENT_REPOSITORY)` is called twice on the same
  compiled module
- **THEN** both calls return the exact same object reference

### Requirement: CAUSAL_CHAIN_REPOSITORY resolves to DrizzleCausalChainRepository

`HazardousEventsModule` SHALL register `DrizzleCausalChainRepository` under the
`CAUSAL_CHAIN_REPOSITORY` injection token. `module.get(CAUSAL_CHAIN_REPOSITORY)`
MUST return an instance of `DrizzleCausalChainRepository`, and repeated calls MUST
return the same singleton.

#### Scenario: Token resolves to the correct adapter

- **WHEN** `module.get(CAUSAL_CHAIN_REPOSITORY)` is called on a compiled
  `HazardousEventsModule`
- **THEN** the returned value is an instance of `DrizzleCausalChainRepository`

#### Scenario: Token resolves to the same singleton on repeated gets

- **WHEN** `module.get(CAUSAL_CHAIN_REPOSITORY)` is called twice on the same
  compiled module
- **THEN** both calls return the exact same object reference

### Requirement: HAZARD_TAXONOMY_REPOSITORY resolves to DrizzleHazardTaxonomyRepository

`HazardousEventsModule` SHALL register `DrizzleHazardTaxonomyRepository` under the
`HAZARD_TAXONOMY_REPOSITORY` injection token. `module.get(HAZARD_TAXONOMY_REPOSITORY)`
MUST return an instance of `DrizzleHazardTaxonomyRepository`, and repeated calls
MUST return the same singleton.

#### Scenario: Token resolves to the correct adapter

- **WHEN** `module.get(HAZARD_TAXONOMY_REPOSITORY)` is called on a compiled
  `HazardousEventsModule`
- **THEN** the returned value is an instance of `DrizzleHazardTaxonomyRepository`

#### Scenario: Token resolves to the same singleton on repeated gets

- **WHEN** `module.get(HAZARD_TAXONOMY_REPOSITORY)` is called twice on the same
  compiled module
- **THEN** both calls return the exact same object reference

### Requirement: DIVISION_REPOSITORY resolves to DrizzleDivisionRepository

`HazardousEventsModule` SHALL register `DrizzleDivisionRepository` under the
`DIVISION_REPOSITORY` injection token. `module.get(DIVISION_REPOSITORY)` MUST
return an instance of `DrizzleDivisionRepository`, and repeated calls MUST return
the same singleton.

#### Scenario: Token resolves to the correct adapter

- **WHEN** `module.get(DIVISION_REPOSITORY)` is called on a compiled
  `HazardousEventsModule`
- **THEN** the returned value is an instance of `DrizzleDivisionRepository`

#### Scenario: Token resolves to the same singleton on repeated gets

- **WHEN** `module.get(DIVISION_REPOSITORY)` is called twice on the same compiled
  module
- **THEN** both calls return the exact same object reference

### Requirement: TRANSACTION_RUNNER resolves to DrizzleTransactionRunner

`HazardousEventsModule` SHALL register `DrizzleTransactionRunner` under the
already-existing `TRANSACTION_RUNNER` injection token
(`app/infrastructure/TransactionRunnerToken.ts`). `module.get(TRANSACTION_RUNNER)`
MUST return an instance of `DrizzleTransactionRunner`, and repeated calls MUST
return the same singleton.

#### Scenario: Token resolves to the correct adapter

- **WHEN** `module.get(TRANSACTION_RUNNER)` is called on a compiled
  `HazardousEventsModule`
- **THEN** the returned value is an instance of `DrizzleTransactionRunner`

#### Scenario: Token resolves to the same singleton on repeated gets

- **WHEN** `module.get(TRANSACTION_RUNNER)` is called twice on the same compiled
  module
- **THEN** both calls return the exact same object reference

### Requirement: All five repository/runner tokens are hidden from importers

`HazardousEventsModule`'s `exports` array SHALL contain only the six Phase 4 use
cases (see below). None of `HAZARDOUS_EVENT_REPOSITORY`, `CAUSAL_CHAIN_REPOSITORY`,
`HAZARD_TAXONOMY_REPOSITORY`, `DIVISION_REPOSITORY`, or `TRANSACTION_RUNNER` MUST
appear in `exports` — consumers depend on the use cases, never on an adapter
directly, matching `NoticesModule`'s and `ValidationWorkflowModule`'s own
hidden-token precedent.

#### Scenario: Importing module cannot resolve a hidden token directly

- **GIVEN** a second NestJS module imports `HazardousEventsModule`
- **WHEN** that module attempts to inject any of `HAZARDOUS_EVENT_REPOSITORY`,
  `CAUSAL_CHAIN_REPOSITORY`, `HAZARD_TAXONOMY_REPOSITORY`, `DIVISION_REPOSITORY`, or
  `TRANSACTION_RUNNER` (e.g. via a `useFactory` provider's `inject` array)
- **THEN** NestJS SHALL throw a "no provider for ..." style resolution error for
  that token, because it is not re-exported

### Requirement: HazardousEventsModule imports ValidationWorkflowModule for its four cross-domain use cases

`HazardousEventsModule` SHALL import `ValidationWorkflowModule` directly (not via
`CoreModule`) so that `InitializeWorkflowInstanceUseCase`, `DeleteWorkflowInstanceUseCase`,
`GetWorkflowInstanceByEntityUseCase`, and `ListWorkflowInstancesByEntityIdsUseCase` are each
resolvable within its own provider graph, feeding the corresponding
`Pick<..., "execute">` constructor dependency of `CreateHazardousEventUseCase`,
`DeleteHazardousEventUseCase`, `GetHazardousEventByIdUseCase`, `ListHazardousEventsUseCase`,
and `UpdateHazardousEventUseCase`. `HazardousEventsModule` MUST NOT depend on
`WORKFLOW_REPOSITORY` directly — it is not exported from `ValidationWorkflowModule`
(`validation-workflow-module-wiring` spec) — only on these four use cases.

#### Scenario: The four validation-workflow use cases are each resolvable inside a compiled HazardousEventsModule

- **WHEN** `Test.createTestingModule({ imports: [HazardousEventsModule] }).compile()`
  is called
- **THEN** `module.get(InitializeWorkflowInstanceUseCase)`,
  `module.get(DeleteWorkflowInstanceUseCase)`, `module.get(GetWorkflowInstanceByEntityUseCase)`,
  and `module.get(ListWorkflowInstancesByEntityIdsUseCase)` each resolve to a defined
  instance without a resolution error

#### Scenario: WORKFLOW_REPOSITORY is not a dependency of any HazardousEventsModule provider

- **GIVEN** a compiled `HazardousEventsModule`
- **WHEN** the `inject` array of every `useFactory` provider registered by
  `HazardousEventsModule` is inspected
- **THEN** none of them names `WORKFLOW_REPOSITORY`

### Requirement: HazardousEventsModule imports EventCausalityModule for EVENT_CAUSALITY_REPOSITORY

`HazardousEventsModule` SHALL import `EventCausalityModule` directly so that
`EVENT_CAUSALITY_REPOSITORY` is resolvable within its own provider graph, feeding
the `IEventCausalityRepository` constructor dependency of
`DeleteHazardousEventUseCase`.

#### Scenario: EVENT_CAUSALITY_REPOSITORY is resolvable inside a compiled HazardousEventsModule

- **WHEN** `Test.createTestingModule({ imports: [HazardousEventsModule] }).compile()`
  is called
- **THEN** `module.get(EVENT_CAUSALITY_REPOSITORY)` resolves to an instance of
  `DrizzleEventCausalityRepository` without a resolution error

### Requirement: Each of the six Phase 4 use cases resolves with correctly-wired dependencies

`HazardousEventsModule` SHALL export `CreateHazardousEventUseCase`,
`UpdateHazardousEventUseCase`, `GetHazardousEventByIdUseCase`,
`ListHazardousEventsUseCase`, `DeleteHazardousEventUseCase`, and
`RecordSpatialObservationUseCase`. Each MUST resolve to a defined instance whose
injected constructor dependencies are the exact singletons the module's own
tokens/imports resolve to (not a mismatched or `undefined` positional slot).

#### Scenario: CreateHazardousEventUseCase resolves with its six dependencies correctly positioned

- **WHEN** `CreateHazardousEventUseCase` is resolved from a compiled
  `HazardousEventsModule`
- **THEN** its injected `taxonomyRepository`, `hazardousEventRepository`,
  `initializeWorkflowInstanceUseCase`, `causalChainRepository`, and `transactionRunner`
  fields are the exact singletons `HAZARD_TAXONOMY_REPOSITORY`,
  `HAZARDOUS_EVENT_REPOSITORY`, `InitializeWorkflowInstanceUseCase`,
  `CAUSAL_CHAIN_REPOSITORY`, and `TRANSACTION_RUNNER` resolve to, respectively, and its
  `logger` is the `getPinoLogger()` singleton

#### Scenario: UpdateHazardousEventUseCase resolves with its seven dependencies correctly positioned

- **WHEN** `UpdateHazardousEventUseCase` is resolved from a compiled
  `HazardousEventsModule`
- **THEN** its injected `taxonomyRepository`, `hazardousEventRepository`,
  `getWorkflowInstanceByEntityUseCase`, `causalChainRepository`, `transactionRunner`, and
  `recordSpatialObservationUseCase` fields are the exact singletons the module's own
  tokens and the `GetWorkflowInstanceByEntityUseCase`/`RecordSpatialObservationUseCase`
  providers resolve to, respectively, and its `logger` is the `getPinoLogger()` singleton

#### Scenario: GetHazardousEventByIdUseCase resolves with its two dependencies correctly positioned

- **WHEN** `GetHazardousEventByIdUseCase` is resolved from a compiled
  `HazardousEventsModule`
- **THEN** its injected `hazardousEventRepository` and `getWorkflowInstanceByEntityUseCase`
  fields are the exact singletons `HAZARDOUS_EVENT_REPOSITORY` and
  `GetWorkflowInstanceByEntityUseCase` resolve to, respectively

#### Scenario: ListHazardousEventsUseCase resolves with its two dependencies correctly positioned

- **WHEN** `ListHazardousEventsUseCase` is resolved from a compiled
  `HazardousEventsModule`
- **THEN** its injected `hazardousEventRepository` and
  `listWorkflowInstancesByEntityIdsUseCase` fields are the exact singletons
  `HAZARDOUS_EVENT_REPOSITORY` and `ListWorkflowInstancesByEntityIdsUseCase` resolve to,
  respectively

#### Scenario: DeleteHazardousEventUseCase resolves with its five dependencies correctly positioned

- **WHEN** `DeleteHazardousEventUseCase` is resolved from a compiled
  `HazardousEventsModule`
- **THEN** its injected `hazardousEventRepository`, `eventCausalityRepository`,
  `causalChainRepository`, `deleteWorkflowInstanceUseCase`, and `transactionRunner`
  fields are the exact singletons `HAZARDOUS_EVENT_REPOSITORY`,
  `EVENT_CAUSALITY_REPOSITORY`, `CAUSAL_CHAIN_REPOSITORY`, `DeleteWorkflowInstanceUseCase`,
  and `TRANSACTION_RUNNER` resolve to, respectively

#### Scenario: RecordSpatialObservationUseCase resolves with its two dependencies correctly positioned

- **WHEN** `RecordSpatialObservationUseCase` is resolved from a compiled
  `HazardousEventsModule`
- **THEN** its injected `hazardousEventRepository` and `divisionRepository` fields
  are the exact singletons `HAZARDOUS_EVENT_REPOSITORY` and `DIVISION_REPOSITORY`
  resolve to, respectively

### Requirement: A full lifecycle round-trip succeeds end-to-end through the compiled module

Resolving each use case to a defined, non-null instance is not sufficient proof
that every positional `useFactory`/`inject` argument is wired to the correct
dependency, since two structurally-similar repository-shaped arguments swapped at
adjacent constructor positions still resolve without `compile()` throwing. A
behavioral round-trip through real use-case calls SHALL be exercised against the
compiled module to prove each dependency is wired to the correct slot.

#### Scenario: Create, read, list, update-with-spatial-observation, and delete all succeed in sequence

- **GIVEN** a compiled `HazardousEventsModule` under PGlite
- **WHEN** `CreateHazardousEventUseCase.execute()` is called, followed by
  `GetHazardousEventByIdUseCase.execute()`, `ListHazardousEventsUseCase.execute()`,
  `UpdateHazardousEventUseCase.execute()` with a `spatialObservation` payload, and
  finally `DeleteHazardousEventUseCase.execute()`, each against the same entity id
- **THEN** every call resolves successfully, each returned DTO reflects the
  preceding step's own write (including the spatial observation persisted via
  `RecordSpatialObservationUseCase`'s delegation), and the final delete leaves no
  resolvable row for that id

### Requirement: Concurrent HazardousEventsModule compilation does not error

Two concurrent `Test.createTestingModule({ imports: [HazardousEventsModule]
}).compile()` calls SHALL each succeed and each independently resolve all six use
cases without interfering with each other.

#### Scenario: Concurrent compilation produces independent containers

- **WHEN** two `Test.createTestingModule({ imports: [HazardousEventsModule]
  }).compile()` calls are awaited concurrently via `Promise.all`
- **THEN** both compiled modules are defined, and each independently resolves all
  six use cases to defined values
- **AND** those use cases' singleton instances are distinct objects between the
  two containers (does not apply to `DRIZZLE_CLIENT`, which is always the same
  global `dr` singleton by design)
