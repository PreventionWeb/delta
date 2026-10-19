# validation-workflow-module-wiring Specification

## Purpose

Defines the NestJS DI wiring that makes `ProcessWorkflowActionUseCase` resolvable from
an application context, by registering concrete adapters for `IWorkflowRepository` and
`INotificationPort` behind typed tokens that the use case is constructed from.

## Requirements

### Requirement: ValidationWorkflowModule compiles without error

`ValidationWorkflowModule` SHALL compile into a valid NestJS `TestingModule` when passed
to `Test.createTestingModule`. No error MUST be thrown during `compile()`.

#### Scenario: Module compiles successfully

- **WHEN** `Test.createTestingModule({ imports: [ValidationWorkflowModule] }).compile()`
  is called
- **THEN** the returned module is defined and no exception is thrown

### Requirement: WORKFLOW_REPOSITORY resolves to DrizzleWorkflowRepository

`ValidationWorkflowModule` SHALL register `DrizzleWorkflowRepository` under the
`WORKFLOW_REPOSITORY` injection token. Calling `module.get(WORKFLOW_REPOSITORY)` MUST
return an instance of `DrizzleWorkflowRepository`.

#### Scenario: Token resolves to the correct adapter

- **WHEN** `module.get(WORKFLOW_REPOSITORY)` is called on a compiled
  `ValidationWorkflowModule`
- **THEN** the returned value is an instance of `DrizzleWorkflowRepository`

#### Scenario: Token resolves to the same singleton on repeated gets

- **WHEN** `module.get(WORKFLOW_REPOSITORY)` is called twice on the same compiled module
- **THEN** both calls return the exact same object reference (NestJS singleton scope)

### Requirement: WORKFLOW_REPOSITORY token is a typed Symbol

The `WORKFLOW_REPOSITORY` token SHALL be a `Symbol`-based
`InjectionToken<IWorkflowRepository>`. Using the plain string `"WORKFLOW_REPOSITORY"` at
an injection site MUST NOT resolve the same provider.

#### Scenario: Token identity — symbol not string

- **WHEN** the `WORKFLOW_REPOSITORY` constant is inspected
- **THEN** `typeof WORKFLOW_REPOSITORY` is `"symbol"`

### Requirement: NOTIFICATION_PORT resolves to EmailNotificationAdapter

`ValidationWorkflowModule` SHALL register `EmailNotificationAdapter` under the
`NOTIFICATION_PORT` injection token, constructed with zero arguments (relying on its own
real-module defaults for `UserLookup`, `SendEmailFn`, and `ConfigPublicUrlFn`). Calling
`module.get(NOTIFICATION_PORT)` MUST return an instance of `EmailNotificationAdapter`
without the module's `compile()` call throwing `UnknownDependenciesException` or any
other dependency-resolution error.

#### Scenario: Token resolves to the correct adapter without a resolution error

- **WHEN** `Test.createTestingModule({ imports: [ValidationWorkflowModule] }).compile()`
  is called
- **THEN** `compile()` resolves without throwing
- **AND** `module.get(NOTIFICATION_PORT)` returns an instance of
  `EmailNotificationAdapter`

#### Scenario: Token resolves to the same singleton on repeated gets

- **WHEN** `module.get(NOTIFICATION_PORT)` is called twice on the same compiled module
- **THEN** both calls return the exact same object reference (NestJS singleton scope)

### Requirement: NOTIFICATION_PORT token is a typed Symbol

The `NOTIFICATION_PORT` token SHALL be a `Symbol`-based `InjectionToken<INotificationPort>`.
Using the plain string `"NOTIFICATION_PORT"` at an injection site MUST NOT resolve the
same provider.

#### Scenario: Token identity — symbol not string

- **WHEN** the `NOTIFICATION_PORT` constant is inspected
- **THEN** `typeof NOTIFICATION_PORT` is `"symbol"`

### Requirement: ProcessWorkflowActionUseCase is resolvable from ValidationWorkflowModule

`ValidationWorkflowModule` SHALL export `ProcessWorkflowActionUseCase`, constructed via
a `useFactory` that injects `WORKFLOW_REPOSITORY` and `NOTIFICATION_PORT` and builds its
`ILogger` dependency via `getPinoLogger()`. `module.get(ProcessWorkflowActionUseCase)`
MUST resolve to a defined instance whose injected repository and notification port are
the same singletons `WORKFLOW_REPOSITORY`/`NOTIFICATION_PORT` resolve to.

#### Scenario: ProcessWorkflowActionUseCase resolves to a defined instance

- **WHEN** `module.get(ProcessWorkflowActionUseCase)` is called on a compiled
  `ValidationWorkflowModule`
- **THEN** the returned value is defined and not null

#### Scenario: ProcessWorkflowActionUseCase's logger is constructed via getPinoLogger, not NoOpLogger

- **WHEN** `ProcessWorkflowActionUseCase` is resolved from a compiled
  `ValidationWorkflowModule`
- **THEN** its `logger` property is the exact singleton `getPinoLogger()` returns

#### Scenario: ProcessWorkflowActionUseCase's injected dependencies are the module's own singletons

- **WHEN** `ProcessWorkflowActionUseCase` is resolved from a compiled
  `ValidationWorkflowModule`
- **THEN** its `workflowRepository` property is the exact object `module.get(WORKFLOW_REPOSITORY)`
  returns
- **AND** its `notificationPort` property is the exact object `module.get(NOTIFICATION_PORT)`
  returns

### Requirement: WORKFLOW_REPOSITORY and NOTIFICATION_PORT are not exported from ValidationWorkflowModule

`ValidationWorkflowModule`'s `exports` array SHALL contain only
`ProcessWorkflowActionUseCase`. Neither `WORKFLOW_REPOSITORY` nor `NOTIFICATION_PORT`
MUST appear in `exports` — consumers depend on the use case, never on either adapter
directly.

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

### Requirement: Concurrent ValidationWorkflowModule compilation does not error

Two concurrent `Test.createTestingModule({ imports: [ValidationWorkflowModule] }).compile()`
calls SHALL each succeed and each independently resolve `ProcessWorkflowActionUseCase`,
`WORKFLOW_REPOSITORY`, and `NOTIFICATION_PORT` without interfering with each other.

#### Scenario: Concurrent compilation produces independent containers

- **WHEN** two `Test.createTestingModule({ imports: [ValidationWorkflowModule] }).compile()`
  calls are awaited concurrently via `Promise.all`
- **THEN** both compiled modules are defined, and each independently resolves
  `ProcessWorkflowActionUseCase`, `WORKFLOW_REPOSITORY`, and `NOTIFICATION_PORT` to
  defined values
- **AND** those three providers' singleton instances are distinct objects between the
  two containers (does not apply to `DRIZZLE_CLIENT`, which is always the same global
  `dr` singleton by design)
