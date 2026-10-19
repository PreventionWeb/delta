## Why

`ProcessWorkflowActionUseCase` and its two port dependencies (`IWorkflowRepository`,
`INotificationPort`) were built and unit-tested in isolation across `5a`/`5b`, but no
NestJS module wires them to concrete adapters. Today the use case is unreachable from
the application DI context (`getAppContext()`), and no future consumer —
`HazardousEventsModule` (`5g`) chief among them — has anything to import. Without this
wiring, `5g` cannot proceed, and `EmailNotificationAdapter.server.ts`'s own docstring
already flags this gap: "Real `@Inject(TOKEN)` wiring awaits the roadmap's `5c` intent."

## What Changes

- Create `ValidationWorkflowModule` (`app/domains/validation-workflow/infrastructure/ValidationWorkflowModule.server.ts`)
  as a NestJS module that:
  - Registers `DrizzleProvider` (same DI-scope pattern as every other domain module).
  - Registers `DrizzleWorkflowRepository` under a new `WORKFLOW_REPOSITORY` injection
    token (new file, `WorkflowRepositoryToken.ts`).
  - Registers `EmailNotificationAdapter` under a new `NOTIFICATION_PORT` injection token
    (new file, `NotificationPortToken.ts`).
  - Exports only `ProcessWorkflowActionUseCase` (constructed via a `useFactory` injecting
    both tokens plus `getPinoLogger()`) — the two port tokens are NOT exported, so
    consumers depend on the use case, never on the adapters directly (mirrors
    `NoticesModule`'s own `NOTICE_REPOSITORY`-hiding rationale).
- Update `CoreModule.server.ts` to import `ValidationWorkflowModule` so
  `ProcessWorkflowActionUseCase` is resolvable from `getAppContext()`.
- Add `tests/integration/domains/validation-workflow/ValidationWorkflowModule.test.ts`
  (PGlite integration tier) verifying the module compiles and resolves
  `ProcessWorkflowActionUseCase`, both tokens, and `CoreModule`-level resolution.

**Open design question flagged for sign-off before `tasks.md` implementation steps are
locked in (see design.md "Open Questions" and `tasks.md` Task 0):** `EmailNotificationAdapter`'s
constructor takes three interface/function-typed parameters, all with real-module
defaults, and carries no `@Inject()` decorators. Reading the file confirms NestJS's
reflection-based `useClass` auto-injection cannot resolve interface-erased parameter
types without an explicit token — registering `{ provide: NOTIFICATION_PORT, useClass:
EmailNotificationAdapter }` is very likely to throw NestJS's `UnknownDependenciesException`
at module compile time. The recommended fix, within this change's own narrow scope, is a
zero-arg `useFactory: () => new EmailNotificationAdapter()`, which bypasses Nest's
constructor-reflection entirely and relies on the adapter's own baked-in defaults. This
does not touch `EmailNotificationAdapter.server.ts` itself.

## Capabilities

### New Capabilities

- `validation-workflow-module-wiring`: NestJS DI wiring for the validation-workflow
  domain — token resolution, use-case export, singleton behaviour, and concurrent
  compilation, mirroring `notices-module-wiring`'s shape.

### Modified Capabilities

- `core-module`: adds the requirement that `CoreModule` imports `ValidationWorkflowModule`
  and that `ProcessWorkflowActionUseCase` is resolvable from a `CoreModule`-based test
  container, without breaking existing `NoticesModule`-derived resolution.

## Impact

- **Files touched:**
  - `app/domains/validation-workflow/infrastructure/ValidationWorkflowModule.server.ts` (new)
  - `app/domains/validation-workflow/infrastructure/WorkflowRepositoryToken.ts` (new)
  - `app/domains/validation-workflow/infrastructure/NotificationPortToken.ts` (new)
  - `app/infrastructure/CoreModule.server.ts` (update — add import only)
  - `tests/integration/domains/validation-workflow/ValidationWorkflowModule.test.ts` (new)
- **DB migration:** None. `DrizzleWorkflowRepository` and its underlying tables already
  exist from `5a`; this change only adds DI wiring.
- **Test approach:** Integration tier, PGlite (`yarn test:run2`) —
  `Test.createTestingModule({ imports: [ValidationWorkflowModule] }).compile()` and a
  second `Test.createTestingModule({ imports: [CoreModule] }).compile()` case, matching
  `NoticesModule.test.ts`'s own two-`describe`-block structure.
- **Security / multi-tenancy:** None. `IWorkflowRepository`'s own docstring states the
  underlying table carries no `countryAccountsId` — tenancy scoping is the caller's
  responsibility, unchanged by this wiring change. No controller, guard, or route is
  added by this module — it is DI wiring only, exposing nothing over HTTP.
- **Downstream consumers:** `CoreModule` (this change) and, per the roadmap, a future
  `HazardousEventsModule` (`5g`) will import `ValidationWorkflowModule` directly (not via
  `CoreModule`) for the same reason `NoticesModule` is not re-exported for cross-module
  use — avoiding circular module dependencies.
