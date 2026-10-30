## Context

See proposal.md - Why. The use case, both ports, and both concrete adapters already
exist and are independently unit-tested (`5a` for `DrizzleWorkflowRepository`, `5b` for
`EmailNotificationAdapter` and `INotificationPort`). This change adds only the NestJS
module that wires them together. `NoticesModule.server.ts` is the closest structural
precedent — it hides its repository behind a DI token and exports only use cases built
via `useFactory`. `EventCausalityModule.server.ts` is a simpler precedent — it exports
its repository token directly because it has no use case of its own — but `5c`'s intent
text explicitly says "exporting `ProcessWorkflowActionUseCase`", so Notices' shape
applies here, not EventCausality's.

Neither `IWorkflowRepository` nor `INotificationPort` has a DI token file yet (unlike
`INoticeRepository`'s `NoticeRepositoryToken.ts`). This change creates both.

## Goals / Non-Goals

**Goals:**

- Make `ProcessWorkflowActionUseCase` resolvable from `getAppContext()` via `CoreModule`.
- Make `ValidationWorkflowModule` importable directly by a future `HazardousEventsModule`
  (`5g`), without going through `CoreModule` (avoids circular module dependencies, same
  reasoning `NoticesModule`'s own comment already documents).
- Keep both port adapters hidden behind tokens — only `ProcessWorkflowActionUseCase` is
  exported, so no consumer can bypass the use case and inject `IWorkflowRepository` or
  `INotificationPort` directly from this module.

**Non-Goals:**

- No controller, guard, or HTTP route. This module has no presentation layer — the
  validation-workflow domain's own `WorkflowInstance`/ports have no route today, and
  none is in scope for `5c`.
- No change to `DrizzleWorkflowRepository.server.ts`, `EmailNotificationAdapter.server.ts`,
  `ProcessWorkflowAction.ts`, `IWorkflowRepository.ts`, or `INotificationPort.ts`. All
  five files are consumed as-is.
- No change to `HazardousEventsModule` — that is `5g`'s own scope.

## Decisions

### Decision 1 — Token names and files

`WORKFLOW_REPOSITORY` (`WorkflowRepositoryToken.ts`, `InjectionToken<IWorkflowRepository>`)
and `NOTIFICATION_PORT` (`NotificationPortToken.ts`, `InjectionToken<INotificationPort>`),
both Symbol-based, both placed in `app/domains/validation-workflow/infrastructure/` —
exact structural mirror of `NoticeRepositoryToken.ts`'s own documented rationale (DI
tokens are an infrastructure concern, must not be imported into a domain port file, and
a Symbol prevents accidental injection via a string literal).

**Alternative considered:** a plain string token (`"WORKFLOW_REPOSITORY"`). Rejected for
the same reason `NoticeRepositoryToken.ts` rejected it — NestJS treats a string and a
Symbol as different provider keys, and the Symbol is what every other port token in this
codebase (`DRIZZLE_CLIENT`, `NOTICE_REPOSITORY`) already uses.

**This is the first `INotificationPort`-shaped token in the codebase** (every prior
token wraps a repository). Flagged as an open question (see below) purely on naming —
not on the Symbol-vs-string choice, which is settled by precedent.

### Decision 2 — EmailNotificationAdapter provider registration: useFactory, not useClass

`EmailNotificationAdapter`'s constructor is:

```ts
constructor(
  private readonly userRepository: UserLookup = defaultUserRepository,
  private readonly sendEmail: SendEmailFn = defaultSendEmail,
  private readonly configPublicUrl: ConfigPublicUrlFn = defaultConfigPublicUrl,
) {}
```

All three parameter types are TypeScript interfaces/function-aliases, which erase to
`Object`/`Function` under `emitDecoratorMetadata`, and none carries an `@Inject()`
decorator. NestJS's `useClass` provider resolves constructor dependencies purely from
reflected `design:paramtypes` (or explicit `@Inject()` tokens) — it does not consult
default parameter values at all. Registering `{ provide: NOTIFICATION_PORT, useClass:
EmailNotificationAdapter }` therefore risks `UnknownDependenciesException` at module
`compile()` time, because Nest has no provider registered under the generic `Object`/`Function`
tokens it will look for at each of the three argument positions.

**Correction (second-opinion review, 2026-10-19):** tested directly against this repo's
own Vite/esbuild transform — `useClass` actually compiles fine here, since esbuild never
emits `design:paramtypes` in the first place, so Nest sees no params to resolve at all.
The quoted risk holds under `tsc`'s `emitDecoratorMetadata`, not under this codebase's
actual build. `useFactory` is kept anyway as the more defensive choice if the build
toolchain ever changes, not because the risk is proven to materialize today.

**Decision:** register it via a zero-argument factory instead:

```ts
{ provide: NOTIFICATION_PORT, useFactory: () => new EmailNotificationAdapter() }
```

This sidesteps Nest's reflection-based resolution entirely — the adapter is constructed
exactly as `new EmailNotificationAdapter()`, which falls through to its own three
real-module defaults (`defaultUserRepository`, `defaultSendEmail`, `defaultConfigPublicUrl`),
exactly as the file's own docstring says those defaults exist to support.

**Alternative considered:** add `@Inject()` decorators and token wiring to
`EmailNotificationAdapter.server.ts` itself, matching `DrizzleWorkflowRepository`'s
`@Inject(DRIZZLE_CLIENT)` pattern. Rejected for this change — it would touch a file
outside `5c`'s declared scope (`EmailNotificationAdapter.server.ts` is `5b`'s file, not
listed in `5c`'s "Files touched"), and the adapter's own docstring already documents
that its defaults are the intended mechanism until `5c`'s wiring lands; the defaults are
real production implementations (not test stubs), so using them in production via
`useFactory` is not a shortcut.

**This reverses the readiness check's assumption #5** ("useClass should work with zero
extra provider wiring... verify this is actually true by reading the file"). Having
read the file, it does not hold — flagged as an open question below for explicit
sign-off before `tasks.md`'s TDD steps lock in the `useFactory` approach as the tested
behavior.

### Decision 3 — DrizzleWorkflowRepository registration: useClass (unchanged pattern)

`DrizzleWorkflowRepository`'s constructor is `constructor(@Inject(DRIZZLE_CLIENT)
private readonly db: Dr) {}` — an explicit `@Inject()` token, identical in shape to
`DrizzleNoticeRepository`'s and `DrizzleEventCausalityRepository`'s own constructors.
`{ provide: WORKFLOW_REPOSITORY, useClass: DrizzleWorkflowRepository }` with
`DrizzleProvider` also registered in this module's `providers` works without
modification, following the same pattern as every other domain module.

### Decision 4 — ProcessWorkflowActionUseCase export shape

```ts
{
  provide: ProcessWorkflowActionUseCase,
  useFactory: (repo: IWorkflowRepository, port: INotificationPort) =>
    new ProcessWorkflowActionUseCase(getPinoLogger(), repo, port),
  inject: [WORKFLOW_REPOSITORY, NOTIFICATION_PORT],
}
```

Matches `NoticesModule`'s own `useFactory` pattern for its five use cases (logger via
`getPinoLogger()`, port(s) injected by token). Only `ProcessWorkflowActionUseCase` is
exported — `WORKFLOW_REPOSITORY` and `NOTIFICATION_PORT` are not — for the same reason
`NOTICE_REPOSITORY` is not exported from `NoticesModule`: callers depend on the use case
interface, not the adapters.

### Decision 5 — CoreModule import, no re-export

`CoreModule.server.ts` adds `ValidationWorkflowModule` to its `imports` array. It is
**not** added to `exports`. Per `CoreModule`'s own existing docstring, "Feature modules
... declare their own providers directly rather than importing CoreModule, which avoids
circular module dependencies" — confirmed by the roadmap's own `5g` note, which states
`HazardousEventsModule` will import `ValidationWorkflowModule` directly, not via
`CoreModule`. Exporting it from `CoreModule` would invite exactly the circular-import
pattern the codebase has deliberately avoided everywhere else.

## Risks / Trade-offs

- **[Risk]** If Decision 2's `useFactory` analysis is wrong and `useClass` actually
  resolves fine → **Mitigation:** `tasks.md`'s first test asserts `module.get(NOTIFICATION_PORT)`
  resolves without `compile()` throwing — confirms `useFactory` works, but doesn't run
  `useClass` itself to observe the predicted exception; that part stays inferred from
  reflection mechanics (Decision 2), not independently exercised.
- **[Risk]** A future domain (`5g`'s `HazardousEventsModule`, or later) imports
  `ValidationWorkflowModule` directly and could, in principle, re-export the hidden
  tokens upward if it ever imported `ValidationWorkflowModule` into its own `exports`
  array → **Mitigation:** out of this change's control; flagged for `5g`'s own design
  review to inherit the same "export only the use case" discipline.
- **[Trade-off]** Hiding both tokens means any future second use case in this domain
  needing only `IWorkflowRepository` (not the full `ProcessWorkflowActionUseCase`) would
  need a new exported use case rather than direct repository access — consistent with
  the rest of this codebase's Clean Architecture boundary, accepted as intentional.
- **[Risk, tooling]** Stryker produced 0 mutants on all three new files — not a quality
  gap in them, but a confirmed structural exclusion: `@Module()` decorator content is
  categorically outside Stryker's traversal, and a `Symbol()` description string is
  correctly excluded as behaviorally inert. No fix possible within this change; the
  behavioral integration tests (verified green directly, gate 1) are this file shape's
  only available verification.

## Migration Plan

No data migration. Deployment is a pure code change: `ValidationWorkflowModule` is
additive, and `CoreModule`'s only change is one new import. Rollback is reverting the
commit — no schema or running-state impact.

## Open Questions — resolved 2026-10-19

All three were escalated to the user rather than decided unilaterally from internal
precedent alone, since the user asked that each be validated against actual NestJS/Clean
Architecture standards, not just this codebase's existing `NoticesModule` pattern. Resolved
after web research (cited below); all three confirm the original proposal unchanged.

1. **Token naming — confirmed.** `WORKFLOW_REPOSITORY` / `NOTIFICATION_PORT`, Symbol-based,
   in `WorkflowRepositoryToken.ts` / `NotificationPortToken.ts`. The
   [NestJS Custom Providers docs](https://docs.nestjs.com/fundamentals/custom-providers)
   state TypeScript interfaces are erased at runtime and can't serve as DI tokens directly;
   their own worked example registers a Symbol token (`LOGGER_SERVICE`) for exactly this
   case, noting symbols avoid the string-token collisions reported in
   [nestjs/nest#9271](https://hub.harborframework.com/tasks/abundant/nestjs__nest-9271).
   `InjectionToken<T>` is confirmed to be a real exported type in this repo's installed
   `@nestjs/common` (`node_modules/@nestjs/common/index.d.ts:6`) — `NoticeRepositoryToken.ts`'s
   pattern is not a fabricated convention. The only documented alternative, an abstract
   class as both contract and token, fits "one artifact, one token" better than a domain
   port already built in `5a`/`5b` as a plain interface — not adopted.
2. **`useFactory` over `useClass` for `EmailNotificationAdapter` — confirmed.** TypeScript's
   `emitDecoratorMetadata` erases an interface-typed constructor parameter (`UserLookup`)
   to `Object`; the parameter's own default value never appears in that reflected metadata
   at all, so Nest's injector attempts to resolve a provider for `Object`/`Function` and
   throws `UnknownDependenciesException` regardless of the default — a well-known NestJS
   gotcha, not a hypothetical. The
   [NestJS Custom Providers docs](https://docs.nestjs.com/fundamentals/custom-providers)
   introduce `useFactory` as exactly this escape hatch, for manual construction when a
   class isn't amenable to reflection-based wiring. The alternative — adding `@Inject()`
   to all three of `EmailNotificationAdapter`'s constructor parameters — would require
   registering `UserRepository`/`sendEmail`/`configPublicUrl` as their own Nest providers
   too, a materially larger change to the already-reviewed, already-merged `5b` file; not
   adopted.
3. **`CoreModule` imports but does not export `ValidationWorkflowModule` — confirmed.** The
   [NestJS Modules docs](https://docs.nestjs.com/modules) do document re-exporting in
   general (their own canonical example is a `CoreModule` importing and exporting a shared
   `CommonModule`), so re-exporting is not wrong per se. But `HazardousEventsModule` (`5g`)
   is a sibling feature module, not shared infrastructure, and the roadmap already plans
   for `CoreModule` to import `HazardousEventsModule` too. Exporting `ValidationWorkflowModule`
   from `CoreModule` would let `5g` reach it only by importing `CoreModule` back — producing
   the exact `CoreModule → HazardousEventsModule → CoreModule` cycle NestJS's own
   [circular-dependency documentation](https://digitalocean.com/community/tutorials/understanding-circular-dependency-in-nestjs)
   warns about, fixable only with `forwardRef()`. Sibling-to-sibling direct imports avoid
   this entirely and match `NoticesModule`'s own already-established rationale in this
   codebase; not changed.
