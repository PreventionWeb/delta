**Note**: mutation testing (Stryker) is deliberately omitted from this entire task list — no
`test-quality-auditor` task appears anywhere below, not even marked skipped. See design.md's
closing note for why.

## 1. Shared audit-log module

- [x] 1.1 Write failing PGlite integration tests for `DrizzleAuditLogAdapter.record()` in
      `app/domains/shared/audit-log/infrastructure/DrizzleAuditLogAdapter.test.ts`: a full entry
      (all fields non-null) persists exactly as given; `oldValues`/`newValues`/`countryAccountsId`
      independently null persist as null; a call given a transaction handle rolls back with that
      transaction when a later step in the same transaction throws; a call given a transaction
      handle persists once that transaction commits; a call given no transaction handle persists
      immediately via the adapter's own client; two concurrent `record()` calls for two different
      entries both persist independently, neither missing nor duplicated. Verify: `yarn vitest run
      app/domains/shared/audit-log/infrastructure/DrizzleAuditLogAdapter.test.ts` fails (red).
- [x] 1.2 Create `IAuditLogPort`/`AuditLogEntry`
      (`app/domains/shared/audit-log/application/ports/IAuditLogPort.ts`) per design.md Decision 2.
- [x] 1.3 Implement `DrizzleAuditLogAdapter`
      (`app/domains/shared/audit-log/infrastructure/DrizzleAuditLogAdapter.server.ts`): constructor
      takes its own injected `Dr` client (`DRIZZLE_CLIENT` token, same convention as
      `DrizzleWorkflowRepository`); `record(entry, tx)` inserts into `auditLogsTable` using
      `tx ?? this.db` as the executor. Verify: 1.1's test file passes (green).
- [x] 1.4 Add `AuditLogPortToken.ts` and `SharedAuditLogModule.server.ts` (`@Module` with
      `providers`/`exports`, hidden-token convention) per `SharedAttachmentStorageModule`'s
      existing pattern. Verify: `yarn tsc` clean on the new files.
- [x] 1.5 Refactor: review 1.1-1.4 for duplication/clarity against the existing attachments
      module's own file layout. Verify: 1.1's tests stay green.

## 2. Use-case wiring — Create/Update/Delete HazardousEvent

- [x] 2.1 Write failing integration tests for `CreateHazardousEventUseCase` (PGlite): a successful
      create writes exactly one `audit_logs` row with `action: "Create hazardous event"`,
      `oldValues: null`, `newValues` matching the inserted event when parsed once (not double-
      encoded), `countryAccountsId: command.tenantId`; a failure inside the same transaction (e.g.
      HIP crosswalk stamp throws) leaves no audit row. Verify: `yarn vitest run
      app/domains/hazardous-events/application/use-cases/CreateHazardousEvent.test.ts` fails (red)
      for the new cases.
- [x] 2.2 Inject `Pick<IAuditLogPort, "record">` into `CreateHazardousEventUseCase`; call
      `record()` inside the existing `transactionRunner.run()` callback, immediately after the
      event insert (same placement convention as `hipCrosswalkPort.stamp()`), passing the raw
      inserted event as `newValues` (not `JSON.stringify()`'d — design.md Decision 4). Verify: 2.1
      passes (green).
- [x] 2.3 Write failing integration tests for `UpdateHazardousEventUseCase` (PGlite): a successful
      update writes exactly one `audit_logs` row with `action: "Update hazardous event"`,
      `oldValues` the pre-update row, `newValues` the post-update row, `countryAccountsId:
      command.tenantId`; a failure inside the same transaction leaves no new audit row. Verify:
      fails (red) for the new cases.
- [x] 2.4 Inject `Pick<IAuditLogPort, "record">` into `UpdateHazardousEventUseCase`; call
      `record()` inside the existing transaction, immediately after `hazardousEventRepository
      .update()` resolves. Verify: 2.3 passes (green).
- [x] 2.5 Write failing integration tests for `DeleteHazardousEventUseCase` (PGlite): a successful
      delete writes exactly one `audit_logs` row with `action: "delete"`, `oldValues` the
      pre-delete row, `newValues: null`, `countryAccountsId: command.tenantId`; a delete blocked
      by a dependent writes no audit row; the existing no-op (concurrent-delete-already-happened)
      path writes no audit row. Verify: fails (red) for the new cases.
- [x] 2.6 Inject `Pick<IAuditLogPort, "record">` into `DeleteHazardousEventUseCase`; call
      `record()` inside the existing transaction, immediately after
      `hazardousEventRepository.delete()`, before the `return true`. Verify: 2.5 passes (green).
- [x] 2.7 Refactor: review the three use cases' `record()` call sites for consistency (entry
      construction, placement relative to the row write each documents). Verify: 2.1, 2.3, 2.5 all
      stay green.

## 3. Thread `tenantId` into `ProcessWorkflowActionCommand`

- [x] 3.1 Write a failing unit/integration test in `ProcessWorkflowAction.test.ts` asserting
      `ProcessWorkflowActionCommandBase` requires `tenantId` (a command built without it fails
      type-checking — covered by `yarn tsc`, not a runtime assertion) and that `execute()` accepts
      it without otherwise changing behavior for any existing test case. Verify: `yarn tsc` fails
      (red) against the current command type once the test file references the new field.
- [x] 3.2 Add `tenantId: string` to `ProcessWorkflowActionCommandBase`
      (`app/domains/validation-workflow/application/use-cases/ProcessWorkflowAction.ts`). Verify:
      3.1's type-check passes (green); existing `ProcessWorkflowAction.test.ts` cases updated to
      pass `tenantId` and still pass.
- [x] 3.3 Thread `tenantId` through `composeWorkflowAction()`'s args
      (`app/domains/hazardous-events/presentation/web/composeWorkflowAction.server.ts`) into all
      three `processWorkflowActionUseCase.execute()` call sites; update
      `composeWorkflowAction.server.test.ts` to supply it. Verify: `yarn vitest run
      app/domains/hazardous-events/presentation/web/composeWorkflowAction.server.test.ts` passes.
- [x] 3.4 Update `he-preview+/new.tsx` and `he-preview+/edit.$id.tsx` to pass their own
      already-in-scope `tenantId` into `composeWorkflowAction()`. Verify: `yarn tsc` clean; the
      existing E2E workflow-action tests for these routes still pass.

## 4. Audit-write hook inside `ProcessWorkflowActionUseCase`

- [x] 4.1 Write failing tests in `ProcessWorkflowAction.test.ts`: one per action
      (`submit-validation`/`validate`/`publish`/`return`/`submit-draft`/`direct-validate`/
      `direct-publish`) confirming an `audit_logs`-shaped call is made with the right
      `tableName`/`recordId`/`action`/`oldValues.status`/`newValues.status`/`countryAccountsId`;
      `validate` with `alsoApprove: true` writes one row reflecting the final `APPROVED` status,
      not two rows; a failed `workflowRepository.update()` call results in no audit-port call; a
      successful update followed by the audit port's `record()` rejecting still lets `execute()`
      resolve with the saved DTO (mirrors the existing `notify()`-failure test); an entity type
      with no mapped table name (`"DE"`/`"DR"`) succeeds with no audit-port call. Verify: `yarn
      vitest run app/domains/validation-workflow/application/use-cases/ProcessWorkflowAction.test
      .ts` fails (red) for the new cases.
- [x] 4.2 Inject `Pick<IAuditLogPort, "record">` as a new 4th constructor argument to
      `ProcessWorkflowActionUseCase`. Add the private `ENTITY_TYPE_TABLE_NAME` lookup (design.md
      Decision 7, `HE` only). After `workflowRepository.update()` resolves, resolve the table
      name; if mapped, build the entry (`action` = `command.action` literal, `oldValues: {
      status: fromStatus }`, `newValues: { status: saved.status }`, `countryAccountsId:
      command.tenantId`) and call `record()` in its own `try/catch`, structurally identical to the
      existing `notify()` block (WARN log on failure, swallowed, `console.error` last resort);
      if unmapped, log a WARN and skip, same tolerated-degradation path. Verify: 4.1 passes
      (green).
- [x] 4.3 Refactor: review the new hook's placement and the entity-type lookup for clarity against
      the existing `notify()` block immediately below it. Verify: 4.1 stays green.

## 5. DI wiring

- [x] 5.1 Update `HazardousEventsModule.server.ts` to import `SharedAuditLogModule` and inject
      `AUDIT_LOG_PORT` into the `useFactory` providers for Create/Update/DeleteHazardousEventUseCase.
      Verify: `yarn tsc` clean; module bootstraps without a DI resolution error.
- [x] 5.2 Update `ValidationWorkflowModule.server.ts` to import `SharedAuditLogModule` and inject
      `AUDIT_LOG_PORT` into `ProcessWorkflowActionUseCase`'s `useFactory` provider. Verify: `yarn
      tsc` clean; module bootstraps without a DI resolution error.

## 6. Quality gates

- [x] 6.1 Gate 1: `yarn vitest run` across every test file touched/added in this change — all
      green.
- [x] 6.2 Gate 2: `yarn tsc` — zero errors.
- [x] 6.3 Gate 3: `yarn format:check` scoped to this change's files — clean (run `yarn format`
      scoped to just these files if not; never a bulk repo-wide format run).
- [x] 6.4 Gate 4: Anti-pattern review against `.github/skills/anti-pattern-check/SKILL.md`.
- [x] 6.5 Gate 5: `solid-reviewer` agent review, scoped to this change's files.
- [x] 6.6 Gate 6: Documentation review by a fresh subagent — comments explain WHY not WHAT,
      compacted without losing meaning; one full-diff sweep before the final report.
- [x] 6.7 Gate 7: Project conventions review against `.github/copilot-instructions.md`.
- [x] 6.8 Gate 8: Code review via a fresh subagent, running `.github/skills/code-review/SKILL.md`
      in full.
- [x] 6.9 Gate 9: Visual/UX parity review — **not applicable, skip**. This change does touch
      `composeWorkflowAction.server.ts` and the two `he-preview+` routes (threading `tenantId`
      through), but only as plumbing -- no JSX, markup, or rendered output changes; nothing in
      this change alters what a user sees.
- [x] 6.10 Gate 10 (Claude Code only): independent second-opinion review via a second, separate
      fresh subagent invoking the built-in `code-review` skill at high effort. Resolve findings
      before archiving.

## 7. Regression and archive

- [x] 7.1 Run `yarn test:run2` (full PGlite suite) — must pass with no new failures. Any failure
      present must be confirmed genuinely pre-existing by re-running the same failing file(s)
      against a clean stash of this branch's changes, not assumed.
- [x] 7.2 Run `opsx:archive` on this branch before raising the PR.
