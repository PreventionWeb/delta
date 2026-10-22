## MODIFIED Requirements

### Requirement: WORKFLOW_REPOSITORY and NOTIFICATION_PORT are not exported from ValidationWorkflowModule

`ValidationWorkflowModule`'s `exports` array SHALL contain `ProcessWorkflowActionUseCase`,
`InitializeWorkflowInstanceUseCase`, `DeleteWorkflowInstanceUseCase`,
`GetWorkflowInstanceByEntityUseCase`, and `ListWorkflowInstancesByEntityIdsUseCase`.
Neither `WORKFLOW_REPOSITORY` nor `NOTIFICATION_PORT` MUST appear in `exports` —
every cross-domain consumer depends on one of these five use cases, never on either
adapter directly. (This widens the exported-use-case list from the original,
archived `ca-validation-workflow-module` Decision 4, which named only
`ProcessWorkflowActionUseCase`; the "neither token is exported" half of that decision
is otherwise restored unchanged. An earlier version of this change exported
`WORKFLOW_REPOSITORY` directly for `HazardousEventsModule`'s own use — that export is
reverted by this correction; see `hazardous-events-module-wiring`'s own spec for why.)

#### Scenario: Importing module cannot resolve WORKFLOW_REPOSITORY directly

- **GIVEN** a second NestJS module imports `ValidationWorkflowModule`
- **WHEN** that module attempts to inject `WORKFLOW_REPOSITORY` (e.g. via a
  `useFactory` provider's `inject` array)
- **THEN** NestJS SHALL throw a "no provider for WORKFLOW_REPOSITORY" style resolution
  error, because the token is not re-exported

#### Scenario: Importing module cannot resolve NOTIFICATION_PORT directly

- **GIVEN** a second NestJS module imports `ValidationWorkflowModule`
- **WHEN** that module attempts to inject `NOTIFICATION_PORT` (e.g. via a
  `useFactory` provider's `inject` array)
- **THEN** NestJS SHALL throw a "no provider for NOTIFICATION_PORT" style resolution
  error, because the token is not re-exported

#### Scenario: ValidationWorkflowModule's exports array contains exactly the five use cases, and neither hidden token

- **WHEN** `ValidationWorkflowModule`'s `@Module()` metadata is inspected after
  this change
- **THEN** `exports` equals `[ProcessWorkflowActionUseCase, InitializeWorkflowInstanceUseCase,
  DeleteWorkflowInstanceUseCase, GetWorkflowInstanceByEntityUseCase,
  ListWorkflowInstancesByEntityIdsUseCase]`
- **AND** `exports` does not contain `WORKFLOW_REPOSITORY` or `NOTIFICATION_PORT`

## ADDED Requirements

### Requirement: InitializeWorkflowInstanceUseCase is resolvable from ValidationWorkflowModule

`ValidationWorkflowModule` SHALL export `InitializeWorkflowInstanceUseCase`, constructed
via a `useFactory` that injects only `WORKFLOW_REPOSITORY` (no `ILogger` — see the
`initialize-workflow-instance` capability spec's own Decision on logging).
`module.get(InitializeWorkflowInstanceUseCase)` MUST resolve to a defined instance whose
injected `workflowRepository` is the same singleton `WORKFLOW_REPOSITORY` resolves to.

#### Scenario: InitializeWorkflowInstanceUseCase resolves to a defined instance with its dependency correctly positioned

- **WHEN** `InitializeWorkflowInstanceUseCase` is resolved from a compiled
  `ValidationWorkflowModule`
- **THEN** the returned value is defined and not null
- **AND** its `workflowRepository` property is the exact object
  `module.get(WORKFLOW_REPOSITORY)` returns

### Requirement: DeleteWorkflowInstanceUseCase is resolvable from ValidationWorkflowModule

`ValidationWorkflowModule` SHALL export `DeleteWorkflowInstanceUseCase`, constructed via a
`useFactory` that injects only `WORKFLOW_REPOSITORY`. `module.get(DeleteWorkflowInstanceUseCase)`
MUST resolve to a defined instance whose injected `workflowRepository` is the same
singleton `WORKFLOW_REPOSITORY` resolves to.

#### Scenario: DeleteWorkflowInstanceUseCase resolves to a defined instance with its dependency correctly positioned

- **WHEN** `DeleteWorkflowInstanceUseCase` is resolved from a compiled
  `ValidationWorkflowModule`
- **THEN** the returned value is defined and not null
- **AND** its `workflowRepository` property is the exact object
  `module.get(WORKFLOW_REPOSITORY)` returns

### Requirement: GetWorkflowInstanceByEntityUseCase is resolvable from ValidationWorkflowModule

`ValidationWorkflowModule` SHALL export `GetWorkflowInstanceByEntityUseCase`, constructed
via a `useFactory` that injects only `WORKFLOW_REPOSITORY`.
`module.get(GetWorkflowInstanceByEntityUseCase)` MUST resolve to a defined instance whose
injected `workflowRepository` is the same singleton `WORKFLOW_REPOSITORY` resolves to.

#### Scenario: GetWorkflowInstanceByEntityUseCase resolves to a defined instance with its dependency correctly positioned

- **WHEN** `GetWorkflowInstanceByEntityUseCase` is resolved from a compiled
  `ValidationWorkflowModule`
- **THEN** the returned value is defined and not null
- **AND** its `workflowRepository` property is the exact object
  `module.get(WORKFLOW_REPOSITORY)` returns

### Requirement: ListWorkflowInstancesByEntityIdsUseCase is resolvable from ValidationWorkflowModule

`ValidationWorkflowModule` SHALL export `ListWorkflowInstancesByEntityIdsUseCase`,
constructed via a `useFactory` that injects only `WORKFLOW_REPOSITORY`.
`module.get(ListWorkflowInstancesByEntityIdsUseCase)` MUST resolve to a defined instance
whose injected `workflowRepository` is the same singleton `WORKFLOW_REPOSITORY` resolves to.

#### Scenario: ListWorkflowInstancesByEntityIdsUseCase resolves to a defined instance with its dependency correctly positioned

- **WHEN** `ListWorkflowInstancesByEntityIdsUseCase` is resolved from a compiled
  `ValidationWorkflowModule`
- **THEN** the returned value is defined and not null
- **AND** its `workflowRepository` property is the exact object
  `module.get(WORKFLOW_REPOSITORY)` returns

### Requirement: A second module can inject each of the four new use cases, proving a genuine re-export

Non-strict `Test.createTestingModule` resolution ignores the `exports` array, so only a
second, importing module SHALL prove a token or provider is genuinely re-exported rather
than merely present in `ValidationWorkflowModule`'s own provider graph (same rationale as
the original, archived `EventCausalityModule.test.ts` coverage for
`EVENT_CAUSALITY_REPOSITORY`).

#### Scenario: A second module importing ValidationWorkflowModule can resolve each of the four new use cases directly

- **GIVEN** a second NestJS module imports `ValidationWorkflowModule` and declares a
  provider that injects `InitializeWorkflowInstanceUseCase`, `DeleteWorkflowInstanceUseCase`,
  `GetWorkflowInstanceByEntityUseCase`, or `ListWorkflowInstancesByEntityIdsUseCase` via its
  own `useFactory`'s `inject` array
- **WHEN** that second module is compiled with
  `Test.createTestingModule({ imports: [ConsumerModule] }).compile()`
- **THEN** compilation succeeds and the injected value is the exact same object
  `module.get(...)` returns for that use case on the inner `ValidationWorkflowModule`
