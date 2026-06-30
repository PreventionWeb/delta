## Context

The Notices pilot Clean Architecture pipeline has three layers already in place:

1. Domain entity (`Notice`) and port interface (`INoticeRepository`).
2. Application use cases (`CreateNoticeUseCase`, `ListNoticesUseCase`,
   `GetNoticeByIdUseCase`) — plain TypeScript classes injected via constructor.
3. Infrastructure adapter (`DrizzleNoticeRepository`) — `@Injectable()`, depends on
   `DRIZZLE_CLIENT`.

`CoreModule` currently provides and exports only `DrizzleProvider` (the Drizzle singleton).
No NestJS module wires the use cases or the repository adapter together, so
`getAppContext().get(CreateNoticeUseCase)` would throw "provider not found".

## Goals / Non-Goals

**Goals:**

- Register `DrizzleNoticeRepository` under a typed `NOTICE_REPOSITORY` injection token.
- Provide all three use cases as NestJS providers inside `NoticesModule`.
- Export the three use cases from `NoticesModule` so they are resolvable from the root
  application context via `CoreModule`.
- Satisfy `ILogger` for each use case inside the module without introducing a production
  logging infrastructure that does not yet exist.
- Add an integration test that verifies the wiring with the PGlite double.

**Non-Goals:**

- Adding a production `ILogger` NestJS provider (Pino adapter) — that is a separate work item.
- Registering HTTP controllers or guards inside `NoticesModule`.
- Changing any existing schema, migration, or Drizzle query.
- Wiring route loaders to the use cases (Phase 4i+).

## Decisions

### Decision 1 — Separate `NoticeRepositoryToken.ts` file for `NOTICE_REPOSITORY`

The `DRIZZLE_CLIENT` token lives in `DrizzleProvider.server.ts` alongside its provider
descriptor. For `NOTICE_REPOSITORY` the token is conceptually a port-level constant, not
tied to any single infrastructure file. Placing it in its own file
(`NoticeRepositoryToken.ts`) lets both `NoticesModule` (which registers the provider) and
future test overrides import the token without pulling in the full repository
implementation.

Alternative considered: embed the token in `INoticeRepository.ts` (domain layer).
Rejected because injection tokens are an infrastructure concern; mixing them into the
domain port would violate the layering rule that domain types must not import from
`@nestjs/common`.

### Decision 1b — `NoticesModule` file MUST carry the `.server.ts` suffix

`NoticesModule.server.ts` directly imports `DrizzleNoticeRepository.server.ts`, which
contains Node.js-only dependencies (`pg`, Drizzle ORM). React Router v7's bundler
excludes any file ending in `.server.ts` from the client bundle. This is a framework
mechanism, not a project convention: if `NoticesModule` were named without the suffix,
an accidental import from a route component would either cause a build-time error or
silently bundle server-only code into the browser — both unacceptable outcomes.

The `.server.ts` suffix makes the server-only constraint framework-enforced, not
just documented. Every other NestJS infrastructure file in this project carries it
(`CoreModule.server.ts`, `DrizzleProvider.server.ts`, `DrizzleNoticeRepository.server.ts`)
for the same reason. This is the correct industry practice for any Remix/React Router v7
application that co-locates a NestJS DI container with the framework.

### Decision 2 — `NoticesModule` declares `DrizzleProvider` directly; it does NOT import `CoreModule`

`DrizzleNoticeRepository` depends on `DRIZZLE_CLIENT`. `NoticesModule` satisfies this by
declaring `DrizzleProvider` in its own `providers` array — it does NOT import `CoreModule`.

**Why not import `CoreModule`:** `CoreModule` imports `NoticesModule` (Decision 5). If
`NoticesModule` also imported `CoreModule`, the result would be a circular NestJS module
dependency (`CoreModule → NoticesModule → CoreModule`), which NestJS detects at compile
time and rejects with "module at index [0] is undefined".

**Why declaring `DrizzleProvider` directly is correct:** `DrizzleProvider` is a
`FactoryProvider` whose factory returns the global `dr` singleton (`useFactory: () => dr`).
Declaring it in `NoticesModule`'s `providers` array registers `DRIZZLE_CLIENT` within
`NoticesModule`'s DI scope — the factory still returns the same singleton, so no second
database connection is created. This is the standard NestJS pattern: **composition roots
import feature modules; feature modules do not import the composition root.** `CoreModule`
is the composition root; `NoticesModule` is a self-contained feature module.

### Decision 3 — `ILogger` satisfied via a `useValue: new NoOpLogger()` factory per use case

The use cases require an `ILogger` at construction time. No NestJS-managed `ILogger`
provider exists yet. Rather than leaving the logger injectionless (which would require
making the parameter optional), each use case provider uses `useFactory` and constructs
`new NoOpLogger()` inline.

Alternative considered: register `NoOpLogger` as a shared module-level provider under an
`ILOGGER` token. Rejected as premature — it introduces another token and export without a
confirmed consumer outside `NoticesModule`. When a production Pino adapter is introduced
(separate work item), this decision can be revisited and the inline factories replaced
with a shared provider.

Alternative considered: make `ILogger` optional in use case constructors. Rejected
because that weakens the constructor contract and obscures the logger dependency from
callers.

### Decision 4 — Use cases are plain class providers (not `@Injectable()`)

`CreateNoticeUseCase`, `ListNoticesUseCase`, and `GetNoticeByIdUseCase` are plain
TypeScript classes without NestJS decorators. This is intentional — use cases must not
depend on the framework. In `NoticesModule` each use case is registered with a `useFactory`
that explicitly constructs the instance with its dependencies, keeping the use cases
framework-agnostic.

### Decision 5 — `CoreModule` imports and re-exports `NoticesModule`

`CoreModule` is the root NestJS module bootstrapped by `initServer()` via
`NestFactory.createApplicationContext(CoreModule)`. Adding `NoticesModule` to its
`imports` and `exports` makes the use cases resolvable from `getAppContext().get(...)`.
This is consistent with how `CoreModule` currently re-exports `DrizzleProvider`.

### Decision 6 — Integration test location: `tests/integration/domains/notices/`

The test bootstraps `Test.createTestingModule` with `NoticesModule` and the PGlite mock.
It is co-located with the domain rather than in `tests/integration/nestjs/` because it
tests domain-specific provider resolution, not general CoreModule behaviour. The PGlite
mock is inherited from `tests/integration/db/setup.ts` via
`import "../../db/setup"` (two levels up from `tests/integration/domains/notices/`).

## Risks / Trade-offs

- **`NoOpLogger` in production if wiring is incorrect** → The `NoOpLogger` provider is
  declared inside `NoticesModule`, which is only loaded server-side via
  `NestFactory.createApplicationContext`. It will never be bundled to the client (`.server.ts`
  suffix + React Router bundle boundary). Risk is low.

- **`NoticesModule` test requires PGlite `noticesTable` to exist** → The
  `tests/integration/db/testSchema/noticesTable.ts` table definition already exists
  (confirmed in the file tree). The PGlite `pushSchema` call in `setup.ts` includes it via
  the `testSchema/index.ts` barrel. No additional test schema work is needed.

- **Concurrent `Test.createTestingModule` calls in the integration test** → Because each
  `compile()` creates an isolated NestJS container, two concurrent compiles of
  `NoticesModule` should each resolve independent instances. The spec requires a concurrent
  scenario (see specs) to confirm this.

## Migration Plan

1. Create `NoticeRepositoryToken.ts` (no other file changes needed first).
2. Create `NoticesModule.server.ts` declaring `DrizzleProvider` directly and the token (NOT importing `CoreModule` — see Decision 2).
3. Update `CoreModule.server.ts` to import and export `NoticesModule`.
4. Add integration test at `tests/integration/domains/notices/NoticesModule.test.ts`.
5. Run `yarn vitest run tests/integration/domains/notices/NoticesModule.test.ts` to confirm green.
6. Run `yarn tsc` to confirm zero TypeScript errors.
7. Run `yarn test:run2` full suite to confirm no regressions.

No rollback plan is needed — the change adds new files and a two-line update to
`CoreModule`; reverting is a one-commit revert.

## Open Questions

- When the production Pino logger adapter is introduced, should `NoticesModule` switch to
  importing a shared `LoggerModule`? Decision deferred to that work item.
- Should `NoticesModule` be `@Global()`? Current answer: no — global modules make
  dependency graphs opaque. `CoreModule` imports and re-exports it explicitly.
