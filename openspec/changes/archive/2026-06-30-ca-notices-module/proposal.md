## Why

The three Notices application use cases (`CreateNoticeUseCase`, `ListNoticesUseCase`,
`GetNoticeByIdUseCase`) and their `DrizzleNoticeRepository` adapter exist as standalone
classes but are not registered with the NestJS container. Until a `NoticesModule` module
wires them together and is imported into `CoreModule`, callers cannot resolve any of these
use cases from the application context — blocking the route loaders from using the
Clean Architecture pipeline end-to-end.

## What Changes

- **New** `app/domains/notices/infrastructure/NoticesModule.server.ts` — NestJS module that
  registers `DrizzleNoticeRepository` under the `NOTICE_REPOSITORY` injection token,
  declares `DrizzleProvider` directly in its own providers array to gain `DRIZZLE_CLIENT`
  (does NOT import `CoreModule` — that would create a circular dependency since `CoreModule`
  imports `NoticesModule`), provides all three use cases as NestJS providers (with a
  `NoOpLogger` factory satisfying `ILogger`), and exports the use cases so consumers can
  resolve them.
- **New** `app/domains/notices/infrastructure/NoticeRepositoryToken.ts` — typed
  `InjectionToken<INoticeRepository>` constant `NOTICE_REPOSITORY`, following the same
  pattern as `DRIZZLE_CLIENT` in `DrizzleProvider.server.ts`.
- **Update** `app/infrastructure/CoreModule.server.ts` — add `NoticesModule` to the
  `imports` and `exports` arrays so the use cases are reachable from the root application
  context via `getAppContext().get(...)`.
- **New** `tests/integration/domains/notices/NoticesModule.test.ts` — integration test
  that bootstraps `Test.createTestingModule([NoticesModule])` with the PGlite double and
  verifies all three use cases resolve to defined instances and that the `NOTICE_REPOSITORY`
  token resolves to the `DrizzleNoticeRepository` adapter.

No DB migration is required — this change only adds NestJS wiring; no schema changes.

Test approach: PGlite (`yarn test:run2`) — `tests/integration/domains/notices/` using
`import "../../db/setup"` for the PGlite mock.

No auth or multi-tenancy logic is introduced at the module wiring level; the existing
per-method tenancy guards in `DrizzleNoticeRepository` remain unchanged.

## Capabilities

### New Capabilities

- `notices-module-wiring`: NestJS module that registers the Notices domain providers
  (`DrizzleNoticeRepository` under `NOTICE_REPOSITORY`, the three use cases) and exports
  the use cases so they are resolvable from `CoreModule`.

### Modified Capabilities

- `core-module`: `CoreModule` gains `NoticesModule` in its imports and exports so that
  the application context bootstrapped via `getAppContext()` can resolve Notices use cases.

## Impact

- `app/infrastructure/CoreModule.server.ts` — gains one import + one export entry.
- New `NOTICE_REPOSITORY` token file must be imported by both `NoticesModule` and any
  future consumer that needs to override the repository (e.g., in tests).
- No breaking changes to existing providers; `DRIZZLE_CLIENT` and `DrizzleProvider`
  are unchanged.
- Downstream impact: Notices route loaders (Phase 4i+) will depend on this module being
  wired before they can call use cases via `getAppContext()`.
