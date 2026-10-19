## 1. INotificationPort — TDD

- [x] 1.1 Write `app/domains/validation-workflow/application/ports/INotificationPort.test.ts`
      (arity/compile-time conformance assertions, following `IWorkflowRepository.test.ts`'s
      `AssertEqual` pattern, plus the no-op-double scenario from
      `specs/notification-port/spec.md`); verify red with `yarn vitest run
app/domains/validation-workflow/application/ports/INotificationPort.test.ts` (fails
      because `INotificationPort.ts` does not exist yet)
- [x] 1.2 Implement `app/domains/validation-workflow/application/ports/INotificationPort.ts`
      (`WorkflowActionNotification` type + `INotificationPort` interface, design.md
      Decision 12) and verify the same test file passes (green)

## 2. WorkflowInstanceDto — TDD

- [x] 2.1 Write `app/domains/validation-workflow/application/dto/WorkflowInstanceDto.test.ts`
      covering both `specs/process-workflow-action/spec.md`'s "WorkflowInstanceDto shape is
      correct" scenarios (fully-attributed instance maps every `*At` field via
      `.toISOString()`; a `DRAFT` instance with all-null attribution maps to all-null
      `*At` fields without throwing); verify red with `yarn vitest run
app/domains/validation-workflow/application/dto/WorkflowInstanceDto.test.ts` (fails
      because the file does not exist yet)
- [x] 2.2 Implement `app/domains/validation-workflow/application/dto/WorkflowInstanceDto.ts`
      (`WorkflowInstanceDto` interface + `toWorkflowInstanceDto()` mapper, design.md
      Decision 11) and verify the same test file passes (green)

## 3. WorkflowInstanceErrors

- [x] 3.1 Implement `app/domains/validation-workflow/application/errors/WorkflowInstanceErrors.ts`
      (`WorkflowInstanceNotFoundError extends NotFoundError`, design.md Decision 9,
      matching `NoticeErrors.ts`'s trivial-subclass precedent with no dedicated test file —
      its behavior is exercised by section 4's not-found test instead) and verify `yarn
tsc` reports zero errors referencing this file

## 4. ProcessWorkflowActionUseCase — Red phase (all requirements, before any implementation)

All tasks in this section target the same file,
`app/domains/validation-workflow/application/use-cases/ProcessWorkflowAction.test.ts`,
built incrementally against a fake in-memory `IWorkflowRepository` (same pattern as
`IWorkflowRepository.test.ts`'s `FakeWorkflowRepository`), a recording `INotificationPort`
double, and a recording `ILogger` double. Every task in this section MUST fail when run,
since `ProcessWorkflowActionUseCase` does not exist until section 5.

- [x] 4.1 Add the four action-to-method mapping scenarios (submit-validation from DRAFT and
      from REVISION_REQUESTED, validate with alsoApprove false, validate with alsoApprove
      true asserting `save` called exactly once and `validatedAt === approvedAt`, publish,
      return); verify red with `yarn vitest run
app/domains/validation-workflow/application/use-cases/ProcessWorkflowAction.test.ts`
- [x] 4.2 Add the ConflictError-propagation scenarios (publish from DRAFT;
      validate+alsoApprove:true from DRAFT), asserting `save`/`notify` are never called;
      verify red with the same command
- [x] 4.3 Add the not-found scenario (`findByEntity` resolves null →
      `WorkflowInstanceNotFoundError`, `save` never called) and the repository
      save-error-propagation scenario (generic `Error` from `save()` propagates
      unmodified, `notify` never called); verify red with the same command
- [x] 4.4 Add the notify-exactly-once scenarios (the `alsoApprove: false`
      unchanged-status case and the `alsoApprove: true` status-changed case) and the
      notify-failure-does-not-fail-execute scenario (asserting `execute()` still resolves
      and `ILogger.error` was called); verify red with the same command
- [x] 4.5 Add the `saved`-not-pre-save scenario (stub `save` to resolve a distinct
      enriched instance, assert the DTO reflects it); verify red with the same command
- [x] 4.6 Add the concurrent-callers scenario from
      `specs/process-workflow-action/spec.md` (conflicting actions racing off the same
      stale `SUBMITTED` read — caller B's two sequential `execute()` calls,
      `validate`+`alsoApprove:true` then `publish`, complete first persisting `PUBLISHED`;
      caller A's stale `return` completes last, silently overwriting it with
      `REVISION_REQUESTED`; assert all three promises resolve, `save` called exactly three
      times, `notify` called exactly three times with `toStatus` values, in completion
      order, `["APPROVED", "PUBLISHED", "REVISION_REQUESTED"]` — corrected from an earlier
      "twice" miscount, see spec.md's own correction note); verify red with the same
      command

## 5. ProcessWorkflowActionUseCase — Green phase

- [x] 5.1 Implement `ProcessWorkflowActionUseCase` in
      `app/domains/validation-workflow/application/use-cases/ProcessWorkflowAction.ts`:
      `ProcessWorkflowActionCommand` discriminated union (design.md Decision 2),
      constructor order `(logger: ILogger, workflowRepository: IWorkflowRepository,
notificationPort: INotificationPort)` (design.md Decision 13), `execute()` per
      Decision 1's action→method mapping table, `now = new Date()` computed once per call
      (Decision 10), no use-case-level status guard (Decision 3), `saved` (not the
      pre-save instance) feeding both `notify()` and the returned DTO (Decision 4),
      try/catch-and-log around `notify()` (Decision 8); verify green with `yarn vitest run
app/domains/validation-workflow/application/use-cases/ProcessWorkflowAction.test.ts`
      (all tests from section 4 pass, including the concurrent-callers test — that test
      pins the accepted last-write-wins behavior, it does not require new
      locking/guard code to pass)

## 6. Refactor

- [x] 6.1 Re-read the full diff for duplication between the four action branches (e.g. a
      shared `applyTransition` helper if the branches converge) and simplify without
      changing any test's assertions; verify `yarn vitest run
app/domains/validation-workflow/application/use-cases/ProcessWorkflowAction.test.ts`
      stays green after any refactor

## 7. Quality gates

- [x] 7.1 `yarn vitest run
app/domains/validation-workflow/application/use-cases/ProcessWorkflowAction.test.ts
app/domains/validation-workflow/application/ports/INotificationPort.test.ts
app/domains/validation-workflow/application/dto/WorkflowInstanceDto.test.ts` — all
      tests green
- [x] 7.2 `yarn tsc` — zero TypeScript errors
- [x] 7.3 `npx prettier --check` on the seven new files (never bulk `yarn format`, per
      standing project instruction) — Prettier clean
- [x] 7.4 Anti-pattern review against `.github/skills/anti-pattern-check/SKILL.md`
- [x] 7.5 SOLID review — invoke `solid-reviewer` agent (routed through `sdd-implementer`
      per standing gate-orchestration rule, not run directly in parallel by the implementer)
- [x] 7.6 Documentation review — comments explain WHY not WHAT, compacted without losing
      meaning; one full-diff sweep by a fresh subagent before the final report
- [x] 7.7 Project conventions review against `.github/copilot-instructions.md`
- [x] 7.8 Code review — run `.github/skills/code-review/SKILL.md` in full via a fresh
      subagent
- [x] 7.9 Visual/UX parity review — **skipped explicitly**: this change touches no
      `app/domains/*/presentation/` files and no `app/routes/`; it is application-layer
      only (use case, ports, DTO, errors)
- [x] 7.10 Independent second-opinion review — invoke Claude Code's built-in code-review at
      `high` effort via a second, separate fresh subagent; resolve findings before archiving

## 8. Regression and archive

- [x] 8.1 `yarn test:run2` (full PGlite suite) MUST pass with no new failures; any
      pre-existing failure MUST be confirmed pre-existing by running the same suite against
      the base branch (`feature/he-ca-phase4`) before attributing it to this change, per
      the standing no-assumptions rule
- [x] 8.2 Run `opsx:archive` on this branch (`feature/ca-process-workflow-action-use-case`)
      before raising the PR
