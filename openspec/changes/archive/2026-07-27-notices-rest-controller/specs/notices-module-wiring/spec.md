## ADDED Requirements

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
