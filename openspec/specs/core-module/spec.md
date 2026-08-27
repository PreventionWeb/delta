## ADDED Requirements

### Requirement: CoreModule declares and exports DrizzleProvider

`CoreModule` SHALL be a class decorated with `@Module({ providers: [DrizzleProvider], exports: [DrizzleProvider] })` exported from `app/infrastructure/CoreModule.server.ts`. The
`providers` array MUST contain `DrizzleProvider` so the token is resolvable within the
module. The `exports` array MUST also contain `DrizzleProvider` so any module that imports
`CoreModule` can inject `DRIZZLE_CLIENT` without re-declaring the provider.

#### Scenario: CoreModule compiles without error

- **WHEN** `NestFactory.createApplicationContext(CoreModule)` is called with a valid `Dr`
  singleton in scope
- **THEN** the returned promise SHALL resolve to a live `INestApplicationContext` without
  throwing

#### Scenario: DRIZZLE_CLIENT is resolvable from the compiled CoreModule

- **WHEN** a test calls `Test.createTestingModule({ imports: [CoreModule] }).compile()` and
  then calls `module.get(DRIZZLE_CLIENT)`
- **THEN** the returned value SHALL equal the `dr` singleton (or the test double provided
  in the test environment)

#### Scenario: Importing module can inject DRIZZLE_CLIENT

- **GIVEN** a second NestJS module `FeatureModule` declares `imports: [CoreModule]`
- **WHEN** a provider inside `FeatureModule` declares `@Inject(DRIZZLE_CLIENT) private dr: Dr`
- **THEN** NestJS SHALL inject the Drizzle instance without a "No provider for DRIZZLE_CLIENT"
  error

### Requirement: CoreModule does not start an HTTP server

`CoreModule` MUST be bootstrapped exclusively via
`NestFactory.createApplicationContext(CoreModule)`. Calling `NestFactory.create(CoreModule)`
(which starts an HTTP server) SHALL NOT occur anywhere in the server bootstrap sequence.

#### Scenario: No HTTP port is opened during bootstrap

- **WHEN** `initServer()` completes
- **THEN** no TCP listener on any port is created by NestJS — only the application context
  DI container is initialised

### Requirement: CoreModule compiles without error after importing NoticesModule
`CoreModule` SHALL compile into a valid NestJS `TestingModule`. No error MUST be thrown
during `compile()`. Adding `NoticesModule` to `CoreModule`'s imports must not break
existing compilation.

#### Scenario: CoreModule still compiles after importing NoticesModule
- **WHEN** `Test.createTestingModule({ imports: [CoreModule] }).compile()` is called
  after `NoticesModule` has been added to `CoreModule`'s imports
- **THEN** the returned module is defined and no exception is thrown

### Requirement: CreateNoticeUseCase is resolvable via CoreModule
After `NoticesModule` is added to `CoreModule`'s imports and exports, calling
`module.get(CreateNoticeUseCase)` on a `CoreModule`-based test container MUST resolve
to a defined instance.

#### Scenario: CreateNoticeUseCase resolves from CoreModule context
- **WHEN** `Test.createTestingModule({ imports: [CoreModule] }).compile()` is called
  and `module.get(CreateNoticeUseCase)` is invoked on the result
- **THEN** the returned value is defined and not null

### Requirement: ListNoticesUseCase is resolvable via CoreModule
After `NoticesModule` is added to `CoreModule`'s imports and exports, calling
`module.get(ListNoticesUseCase)` on a `CoreModule`-based test container MUST resolve
to a defined instance.

#### Scenario: ListNoticesUseCase resolves from CoreModule context
- **WHEN** `Test.createTestingModule({ imports: [CoreModule] }).compile()` is called
  and `module.get(ListNoticesUseCase)` is invoked on the result
- **THEN** the returned value is defined and not null

### Requirement: GetNoticeByIdUseCase is resolvable via CoreModule
After `NoticesModule` is added to `CoreModule`'s imports and exports, calling
`module.get(GetNoticeByIdUseCase)` on a `CoreModule`-based test container MUST resolve
to a defined instance.

#### Scenario: GetNoticeByIdUseCase resolves from CoreModule context
- **WHEN** `Test.createTestingModule({ imports: [CoreModule] }).compile()` is called
  and `module.get(GetNoticeByIdUseCase)` is invoked on the result
- **THEN** the returned value is defined and not null
