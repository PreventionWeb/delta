## 0. Resolve open design questions with the user (blocking)

- [x] 0.1 Confirm token naming: `WORKFLOW_REPOSITORY` (`WorkflowRepositoryToken.ts`) and
      `NOTIFICATION_PORT` (`NotificationPortToken.ts`), both Symbol-based
      `InjectionToken<T>`, mirroring `NoticeRepositoryToken.ts` — first port-token (not
      repository-token) pair in the codebase. Confirmed 2026-10-19 after web research
      against official NestJS docs, not just internal precedent (design.md Open Questions).
- [x] 0.2 Confirm the `useFactory: () => new EmailNotificationAdapter()` wiring
      (design.md Decision 2) over the readiness-check's original `useClass` assumption.
      Confirmed 2026-10-19 after verifying the TypeScript metadata-erasure mechanics and
      checking NestJS's own docs for the `useFactory` escape-hatch pattern (design.md Open
      Questions).
- [x] 0.3 Confirm `ValidationWorkflowModule` is NOT added to `CoreModule`'s `exports`
      array (design.md Decision 5) — `HazardousEventsModule` (`5g`) will import it
      directly once built. Confirmed 2026-10-19 after researching NestJS's circular-module
      guidance (design.md Open Questions).

## 1. Token files (Red → Green)

- [x] 1.1 Write a failing test asserting `WORKFLOW_REPOSITORY` is a `Symbol` typed as
      `InjectionToken<IWorkflowRepository>`
      (`tests/integration/domains/validation-workflow/ValidationWorkflowModule.test.ts`,
      `typeof WORKFLOW_REPOSITORY === "symbol"`) — run via
      `yarn vitest run tests/integration/domains/validation-workflow/ValidationWorkflowModule.test.ts`
      and confirm it fails because `WorkflowRepositoryToken.ts` does not exist yet.
- [x] 1.2 Create `app/domains/validation-workflow/infrastructure/WorkflowRepositoryToken.ts`
      exporting `WORKFLOW_REPOSITORY: InjectionToken<IWorkflowRepository> = Symbol("WORKFLOW_REPOSITORY")`
      and verify task 1.1's assertion passes.
- [x] 1.3 Extend the same test file with a failing assertion that `NOTIFICATION_PORT` is
      a `Symbol` typed as `InjectionToken<INotificationPort>` and confirm it fails
      because `NotificationPortToken.ts` does not exist yet.
- [x] 1.4 Create `app/domains/validation-workflow/infrastructure/NotificationPortToken.ts`
      exporting `NOTIFICATION_PORT: InjectionToken<INotificationPort> = Symbol("NOTIFICATION_PORT")`
      and verify task 1.3's assertion passes.

## 2. ValidationWorkflowModule wiring (Red → Green)

- [x] 2.1 Write a failing test: `Test.createTestingModule({ imports:
      [ValidationWorkflowModule] }).compile()` resolves without throwing — run
      `yarn vitest run tests/integration/domains/validation-workflow/ValidationWorkflowModule.test.ts`
      and confirm it fails (module file does not exist).
- [x] 2.2 Create `app/domains/validation-workflow/infrastructure/ValidationWorkflowModule.server.ts`
      with `DrizzleProvider` and `{ provide: WORKFLOW_REPOSITORY, useClass:
      DrizzleWorkflowRepository }` registered (no `exports` yet) and verify task 2.1
      passes.
- [x] 2.3 Write a failing test asserting `module.get(WORKFLOW_REPOSITORY)` is an
      instance of `DrizzleWorkflowRepository`, and that two `module.get(WORKFLOW_REPOSITORY)`
      calls return the identical singleton reference — verify both fail first (token not
      wired to the real adapter until 2.2 lands — re-run to confirm pass after 2.2).
- [x] 2.4 Write a failing test asserting `module.get(NOTIFICATION_PORT)` resolves to an
      instance of `EmailNotificationAdapter` without `compile()` throwing
      `UnknownDependenciesException` — run and confirm it fails (provider not yet
      registered).
- [x] 2.5 Add `{ provide: NOTIFICATION_PORT, useFactory: () => new
      EmailNotificationAdapter() }` to the module's `providers` array (per design.md
      Decision 2, confirmed by task 0.2) and verify task 2.4 passes — this is the
      empirical confirmation that `useFactory` avoids the reflection-resolution failure
      `useClass` would hit.
- [x] 2.6 Write a failing test asserting `module.get(NOTIFICATION_PORT)` returns the
      identical singleton reference on repeated gets, and confirm it passes once 2.5
      lands (NestJS default Singleton scope requires no extra code).
- [x] 2.7 Write a failing test asserting `module.get(ProcessWorkflowActionUseCase)`
      resolves to a defined instance whose `logger` is the exact `getPinoLogger()`
      singleton, whose `workflowRepository` is the exact object
      `module.get(WORKFLOW_REPOSITORY)` returns, and whose `notificationPort` is the
      exact object `module.get(NOTIFICATION_PORT)` returns — confirm it fails (use case
      not registered yet).
- [x] 2.8 Add the `useFactory` provider for `ProcessWorkflowActionUseCase` (injecting
      `WORKFLOW_REPOSITORY` and `NOTIFICATION_PORT`, constructing `ILogger` via
      `getPinoLogger()`) and add it to the module's `exports` array and verify task 2.7
      passes.
- [x] 2.9 Write a failing test asserting that a second NestJS module importing
      `ValidationWorkflowModule` cannot resolve `WORKFLOW_REPOSITORY` or
      `NOTIFICATION_PORT` via `@Inject()` (both throw a "no provider for ..." resolution
      error) — confirm this already passes once 2.8 lands, since neither token was ever
      added to `exports` (documents the intentional hiding; no code change expected).
- [x] 2.10 Write a failing test asserting two concurrent
      `Test.createTestingModule({ imports: [ValidationWorkflowModule] }).compile()`
      calls each independently resolve `ProcessWorkflowActionUseCase`,
      `WORKFLOW_REPOSITORY`, and `NOTIFICATION_PORT` to distinct, non-shared singleton
      instances — confirm it passes without further code changes (NestJS's own
      per-`compile()` container isolation).

## 3. CoreModule integration (Red → Green)

- [x] 3.1 Write a failing test: `Test.createTestingModule({ imports: [CoreModule]
      }).compile()` still resolves without throwing after `ValidationWorkflowModule` is
      added — confirm it fails first only in the sense that `CoreModule` doesn't import
      it yet (the resolution assertions in 3.2 are what actually fail).
- [x] 3.2 Write a failing test asserting `module.get(ProcessWorkflowActionUseCase)`
      resolves to a defined instance when compiled via `CoreModule` — run and confirm it
      fails (`ValidationWorkflowModule` not yet imported into `CoreModule`).
- [x] 3.3 Add `ValidationWorkflowModule` to `CoreModule.server.ts`'s `imports` array
      only (per task 0.3 / design.md Decision 5 — do NOT add to `exports`) and verify
      tasks 3.1 and 3.2 pass.
- [x] 3.4 Write a regression test asserting `CoreModule`'s `@Module()` metadata
      `exports` array contains `DrizzleProvider` and `NoticesModule` but does NOT
      contain `ValidationWorkflowModule`, and verify it passes.
- [x] 3.5 Run the pre-existing `tests/integration/domains/notices/NoticesModule.test.ts`
      `CoreModule`-resolution block (`yarn vitest run
      tests/integration/domains/notices/NoticesModule.test.ts`) and confirm
      `CreateNoticeUseCase`, `ListNoticesUseCase`, and `GetNoticeByIdUseCase` still
      resolve unchanged.

## 4. Refactor

- [x] 4.1 Review `ValidationWorkflowModule.server.ts` and the two token files for
      naming/comment consistency with `NoticesModule.server.ts` and
      `NoticeRepositoryToken.ts`; tighten any comment that merely restates the code
      rather than explaining a WHY-level decision.
- [x] 4.2 Re-run the full test file
      (`yarn vitest run tests/integration/domains/validation-workflow/ValidationWorkflowModule.test.ts`)
      after any refactor to confirm all assertions from section 2 and 3 are still green.

## 5. Quality gates

- [x] 5.1 `yarn vitest run tests/integration/domains/validation-workflow/ValidationWorkflowModule.test.ts` — tests still green.
- [x] 5.2 `yarn tsc` — zero TypeScript errors.
- [x] 5.3 `yarn format:check` — Prettier clean (run `yarn format` scoped to the touched files only if not).
- [x] 5.4 Anti-pattern review — check `.github/skills/anti-pattern-check/SKILL.md` against all touched files.
- [x] 5.5 SOLID review — invoke `solid-reviewer` agent on `ValidationWorkflowModule.server.ts`, `WorkflowRepositoryToken.ts`, `NotificationPortToken.ts`, and the `CoreModule.server.ts` diff.
- [x] 5.6 Documentation review (fresh subagent, not self-review) — comments explain WHY not WHAT, one full-diff sweep before the final report.
- [x] 5.7 Project conventions review — check `.github/copilot-instructions.md`.
- [x] 5.8 Code review — run `.github/skills/code-review/SKILL.md` in full, via a fresh subagent.
- [x] 5.9 Visual/UX parity review — SKIPPED: this change touches no file under `app/domains/*/presentation/` or `app/routes/` (pure NestJS DI wiring, no controller or route).
- [x] 5.10 Independent second-opinion review — Claude Code's built-in `code-review` at `high` effort via a second, separate fresh subagent; resolve findings before archiving.
- [x] 5.11 Test quality audit — invoke `test-quality-auditor` scoped to
      `ValidationWorkflowModule.server.ts`, `WorkflowRepositoryToken.ts`, and
      `NotificationPortToken.ts` (all contain real DI-wiring/provider-construction
      logic, not type-only or trivial re-exports); resolve any real gap found.

## 6. Regression and archive

- [x] 6.1 `yarn test:run2` (full PGlite suite) — 1556 passed, 1 todo, 1 failed
      (`tests/unit/services/countryAccountService.clone.test.ts`, a 20s timeout under
      full-suite parallel load). Confirmed non-regression: this file has zero import
      relationship to anything this change touches, passes cleanly in isolation (4.26s),
      and flaked identically — same file, same timeout — during `ca-workflow-notification-
      adapter`'s (5b) archive run on 2026-10-19, an unrelated branch/change. Two
      independent occurrences on two unrelated branches is stronger evidence of a
      recurring resource-contention flake than a single isolation re-run alone.
- [x] 6.2 Run `opsx:archive` on this branch (`feature/ca-validation-workflow-module`)
      before raising the PR.
