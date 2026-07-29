# notices-module-wiring Specification

## Purpose
TBD - created by archiving an earlier change. Update Purpose after archive.
## Requirements
### Requirement: NoticesModule compiles without error
`NoticesModule` SHALL compile into a valid NestJS `TestingModule` when passed to
`Test.createTestingModule`. No error MUST be thrown during `compile()`.

#### Scenario: Module compiles successfully
- **WHEN** `Test.createTestingModule({ imports: [NoticesModule] }).compile()` is called
- **THEN** the returned module is defined and no exception is thrown

### Requirement: NOTICE_REPOSITORY resolves to DrizzleNoticeRepository
`NoticesModule` SHALL register `DrizzleNoticeRepository` under the `NOTICE_REPOSITORY`
injection token. Calling `module.get(NOTICE_REPOSITORY)` MUST return an instance of
`DrizzleNoticeRepository`.

#### Scenario: Token resolves to the correct adapter
- **WHEN** `module.get(NOTICE_REPOSITORY)` is called on a compiled `NoticesModule`
- **THEN** the returned value is an instance of `DrizzleNoticeRepository`

#### Scenario: Token resolves to the same singleton on repeated gets
- **WHEN** `module.get(NOTICE_REPOSITORY)` is called twice on the same compiled module
- **THEN** both calls return the exact same object reference (NestJS singleton scope)

### Requirement: CreateNoticeUseCase is resolvable from NoticesModule
`NoticesModule` SHALL export `CreateNoticeUseCase` such that
`module.get(CreateNoticeUseCase)` resolves to a defined instance.

#### Scenario: CreateNoticeUseCase resolves to a defined instance
- **WHEN** `module.get(CreateNoticeUseCase)` is called on a compiled `NoticesModule`
- **THEN** the returned value is defined and not null

### Requirement: ListNoticesUseCase is resolvable from NoticesModule
`NoticesModule` SHALL export `ListNoticesUseCase` such that
`module.get(ListNoticesUseCase)` resolves to a defined instance.

#### Scenario: ListNoticesUseCase resolves to a defined instance
- **WHEN** `module.get(ListNoticesUseCase)` is called on a compiled `NoticesModule`
- **THEN** the returned value is defined and not null

### Requirement: GetNoticeByIdUseCase is resolvable from NoticesModule
`NoticesModule` SHALL export `GetNoticeByIdUseCase` such that
`module.get(GetNoticeByIdUseCase)` resolves to a defined instance.

#### Scenario: GetNoticeByIdUseCase resolves to a defined instance
- **WHEN** `module.get(GetNoticeByIdUseCase)` is called on a compiled `NoticesModule`
- **THEN** the returned value is defined and not null

### Requirement: NOTICE_REPOSITORY token is a typed Symbol
The `NOTICE_REPOSITORY` token SHALL be a `Symbol`-based `InjectionToken<INoticeRepository>`.
Using the plain string `"NOTICE_REPOSITORY"` at an injection site MUST NOT resolve the
same provider (consistent with the `DRIZZLE_CLIENT` pattern).

#### Scenario: Token identity — symbol not string
- **WHEN** the `NOTICE_REPOSITORY` constant is inspected
- **THEN** `typeof NOTICE_REPOSITORY` is `"symbol"`

### Requirement: Concurrent NoticesModule compilation does not error
Two concurrent `Test.createTestingModule({ imports: [NoticesModule] }).compile()` calls
SHALL each succeed and each independently resolve all three use cases and
`NOTICE_REPOSITORY` without interfering with each other.

#### Scenario: Concurrent compilation produces independent containers
- **WHEN** two `Test.createTestingModule({ imports: [NoticesModule] }).compile()` calls
  are awaited concurrently via `Promise.all`
- **THEN** both compiled modules are defined, and each independently resolves
  `CreateNoticeUseCase`, `ListNoticesUseCase`, `GetNoticeByIdUseCase`, and
  `NOTICE_REPOSITORY` to defined values

### Requirement: NoticesModule use-case factories construct loggers via getPinoLogger
`NoticesModule` (`app/domains/notices/infrastructure/NoticesModule.server.ts`) SHALL construct
each of `CreateNoticeUseCase`, `ListNoticesUseCase`, and `GetNoticeByIdUseCase`'s `ILogger`
dependency via `getPinoLogger()` (`app/infrastructure/logging/PinoLogger.server.ts`) in its
`useFactory` providers, rather than `new NoOpLogger()`. The `inject: [NOTICE_REPOSITORY]`
dependency array MUST remain unchanged — `getPinoLogger()` is a plain function call and
requires no injection token.

#### Scenario: CreateNoticeUseCase resolves with a PinoLogger-backed logger
- **WHEN** `Test.createTestingModule({ imports: [NoticesModule] }).compile()` resolves
  `CreateNoticeUseCase`
- **THEN** the resolved instance is defined
- **AND** the module's `useFactory` for `CreateNoticeUseCase` MUST have constructed it using
  `getPinoLogger()`, not `new NoOpLogger()`

#### Scenario: ListNoticesUseCase resolves with a PinoLogger-backed logger
- **WHEN** `Test.createTestingModule({ imports: [NoticesModule] }).compile()` resolves
  `ListNoticesUseCase`
- **THEN** the resolved instance is defined
- **AND** the module's `useFactory` for `ListNoticesUseCase` MUST have constructed it using
  `getPinoLogger()`, not `new NoOpLogger()`

#### Scenario: GetNoticeByIdUseCase resolves with a PinoLogger-backed logger
- **WHEN** `Test.createTestingModule({ imports: [NoticesModule] }).compile()` resolves
  `GetNoticeByIdUseCase`
- **THEN** the resolved instance is defined
- **AND** the module's `useFactory` for `GetNoticeByIdUseCase` MUST have constructed it using
  `getPinoLogger()`, not `new NoOpLogger()`

#### Scenario: existing module-wiring behaviour is unchanged by the logger swap
- **WHEN** `NoticesModule` is compiled via `Test.createTestingModule` after this change
- **THEN** `NOTICE_REPOSITORY` still resolves to a `DrizzleNoticeRepository` instance, still
  resolves to the same singleton on repeated `get` calls, and remains a symbol-based token,
  exactly as before this change
- **AND** two concurrent `Test.createTestingModule({ imports: [NoticesModule] }).compile()`
  calls still each independently resolve all three use cases and `NOTICE_REPOSITORY` without
  interfering with each other

### Requirement: NoticesModule registers NoticesController
`NoticesModule` (`app/domains/notices/infrastructure/NoticesModule.server.ts`) SHALL declare
`NoticesController` in its `controllers` array so its five routes are reachable once the
module is imported into `CoreModule`'s HTTP application.

#### Scenario: NoticesController routes are reachable through CoreModule
- **WHEN** the NestJS HTTP application is bootstrapped from `CoreModule`
- **THEN** `GET /api/v2/notices` is a registered route (not a 404 from an unmatched route)

### Requirement: NoticesModule exports UpdateNoticeUseCase and DeleteNoticeUseCase
`NoticesModule` SHALL register `UpdateNoticeUseCase` and `DeleteNoticeUseCase` as providers,
each constructed via `useFactory` injecting `NOTICE_REPOSITORY` and constructing `ILogger` via
`getPinoLogger()` — the same pattern already used for `CreateNoticeUseCase`,
`ListNoticesUseCase`, and `GetNoticeByIdUseCase` — and SHALL export both so they are resolvable
from `CoreModule`'s context.

#### Scenario: UpdateNoticeUseCase resolves to a defined instance
- **WHEN** `module.get(UpdateNoticeUseCase)` is called on a compiled `NoticesModule`
- **THEN** the returned value is defined and not null

#### Scenario: DeleteNoticeUseCase resolves to a defined instance
- **WHEN** `module.get(DeleteNoticeUseCase)` is called on a compiled `NoticesModule`
- **THEN** the returned value is defined and not null

#### Scenario: Both new use cases construct their logger via getPinoLogger
- **WHEN** `UpdateNoticeUseCase` or `DeleteNoticeUseCase` is resolved from a compiled
  `NoticesModule`
- **THEN** its `logger` property is the exact singleton `getPinoLogger()` returns, not a
  `NoOpLogger`

### Requirement: NoticesModule registers SessionAuthGuard and applies it to NoticesController
`NoticesModule` SHALL provide `SessionAuthGuard` and apply it to every `NoticesController`
route (via `@UseGuards()` on the controller class, not per-method) so no route can be added in
the future without the guard by omission.

#### Scenario: Every NoticesController route is guarded
- **WHEN** `NoticesController`'s route metadata is inspected
- **THEN** `SessionAuthGuard` applies to all five routes

### Requirement: NoticesModule opens one request-context scope per request via module-scoped middleware
`NoticesModule` SHALL implement `NestModule.configure()` to apply a `RequestContextMiddleware`
to all routes under `notices`, opening exactly one `withRequestContext({ traceId })` scope for
the whole request (guard execution included), before `SessionAuthGuard` runs.

#### Scenario: The guard's session lookup is memoized within the same request
- **WHEN** a single request to any `NoticesController` route triggers both
  `SessionAuthGuard.canActivate()` and the controller method's own use of
  `getRequestContext()`
- **THEN** both read from the same `RequestContextStore` instance — no second, independent
  `withRequestContext()` scope is opened inside the controller method

#### Scenario: Concurrent requests do not share or leak request-context state
- **WHEN** two requests to `NoticesController` routes for two different tenants arrive
  concurrently
- **THEN** each request's `RequestContextStore` independently reflects its own `tenantId` and
  `userId` — neither request observes the other's values, and each response's `traceId` (when
  an error occurs) is distinct

### Requirement: Existing NoticesModule wiring is unaffected by these additions
Adding the controller, guard, two use cases, and middleware SHALL NOT change the existing
behaviour verified in `tests/integration/domains/notices/NoticesModule.test.ts`:
`NOTICE_REPOSITORY` still resolves to `DrizzleNoticeRepository` as a singleton, and
`CreateNoticeUseCase`/`ListNoticesUseCase`/`GetNoticeByIdUseCase` still resolve unchanged.

#### Scenario: Pre-existing use cases still resolve after this change
- **WHEN** `NoticesModule` is compiled after this change
- **THEN** `CreateNoticeUseCase`, `ListNoticesUseCase`, `GetNoticeByIdUseCase`, and
  `NOTICE_REPOSITORY` all resolve exactly as they did before this change

