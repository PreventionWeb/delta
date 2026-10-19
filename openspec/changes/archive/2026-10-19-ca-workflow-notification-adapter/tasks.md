## 0. Resolve open design questions with the user (blocking)

- [x] 0.1 **Confirm the `submit-validation` widening scope** (proposal.md - "Decision
      confirmed"). Human reviewer confirmed 2026-10-16: widen `submit-validation` the same
      way `return` is widened (Sections 2-5 below already assume this, no swap needed).
- [x] 0.2 **Confirm the assignees-vs-submitter resolution** (design.md Decision 2) is
      accepted as evidenced — human reviewer confirmed 2026-10-16, backed by direct
      `View.tsx` UI evidence of two live, distinct actions.

## 1. INotificationPort — widen WorkflowActionNotification

- [x] 1.1 Update `app/domains/validation-workflow/application/ports/INotificationPort.test.ts`:
      extend `makeNotification()`'s return type/object to the widened
      `WorkflowActionNotification` shape; update the `_notificationShape` `AssertEqual` to
      the new 14-key union (per the `notification-port` spec delta's shape-assertion
      scenario); add the new scenario tests (submittedByUserId sourcing placeholder,
      submit-validation-only fields, return-only fields, return-without-assigneeUserIds).
      Verify: `yarn vitest run
app/domains/validation-workflow/application/ports/INotificationPort.test.ts` fails to
      compile (the interface doesn't have the new fields yet).
- [x] 1.2 Update `app/domains/validation-workflow/application/ports/INotificationPort.ts`:
      add `submittedByUserId: string | null` and the five action-specific optional fields
      (`validatorUserIds?`, `recordDisplayName?`, `recordDate?`, `rejectionComments?`,
      `assigneeUserIds?: readonly string[]`) to `WorkflowActionNotification`. Update the
      file's doc comment — it currently says "No adapter in this change —
      interface-now/adapter-later, matching IWorkflowRepository"; that's no longer true
      once Section 6 exists. Verify: `yarn vitest run
app/domains/validation-workflow/application/ports/INotificationPort.test.ts` passes.

## 2. ProcessWorkflowActionCommand — widen the return (and, per Task 0.1, submit-validation) variants

- [x] 2.1 Update `app/domains/validation-workflow/application/use-cases/ProcessWorkflowAction.test.ts`:
      add `rejectionComments: string` (and optionally `assigneeUserIds`) to every existing
      `{ action: "return" }` command literal (currently at lines ~431 and ~851); add
      `validatorUserIds`, `recordDisplayName`, `recordDate` to every existing `{ action:
      "submit-validation" }` command literal (currently 6 occurrences, lines ~260-801) —
      unless Task 0.1 chose the narrow alternative, in which case skip the
      `submit-validation` literals. Add the new notify-payload assertions from the
      `process-workflow-action` spec delta's ADDED requirement (submittedByUserId
      pass-through, return/submit-validation field pass-through, validate/publish omitting
      all five fields). Verify: `yarn vitest run
app/domains/validation-workflow/application/use-cases/ProcessWorkflowAction.test.ts` fails
      to compile (the command type doesn't have the new required fields yet).
- [x] 2.2 Update `app/domains/validation-workflow/application/use-cases/ProcessWorkflowAction.ts`:
      widen `ProcessWorkflowActionCommand`'s `{ action: "return" }` variant with
      `rejectionComments: string` (required) and `assigneeUserIds?: readonly string[]`; per
      Task 0.1's resolution, widen `{ action: "submit-validation" }` with
      `validatorUserIds: readonly string[]`, `recordDisplayName: string`,
      `recordDate: string` (required). In `execute()`, populate the
      `WorkflowActionNotification` with `submittedByUserId: saved.submittedByUserId` and the
      action-specific fields copied from `command` (present only for the matching `action`).
      Verify: `yarn vitest run
app/domains/validation-workflow/application/use-cases/ProcessWorkflowAction.test.ts` and
      `yarn vitest run
app/domains/validation-workflow/application/ports/INotificationPort.test.ts` both pass.

## 3. EmailNotificationAdapter — scaffolding, URL/label mapping, no-ctx construction

- [x] 3.1 Write a failing test in
      `app/domains/validation-workflow/infrastructure/EmailNotificationAdapter.test.ts`
      (new file) asserting `EmailNotificationAdapter` can be constructed with no
      `BackendContext` argument and implements `INotificationPort` (a bare `notify()` call
      with a minimal `"publish"` notification resolves). Mock `sendEmail`
      (`app/utils/email.ts`) and `UserRepository.getById`
      (`app/db/queries/UserRepository`) at the module level. Verify: `yarn vitest run
app/domains/validation-workflow/infrastructure/EmailNotificationAdapter.test.ts` fails
      (file doesn't exist yet).
- [x] 3.2 Create `app/domains/validation-workflow/infrastructure/EmailNotificationAdapter.server.ts`
      (`.server.ts` convention, `.github/copilot-instructions.md` — corrected from
      proposal.md's original filename during implementation)
      implementing `INotificationPort`, with the `EntityType` → URL-segment/display-label
      map (design.md Decision 9) and a `recordUrl()` helper using `configPublicUrl()`
      directly (no `ctx`, no language segment). Verify: Task 3.1's test passes.
- [x] 3.3 Add tests for the entity-type mapping scenario (`email-notification-adapter` spec:
      "Each entity type produces its own URL segment and label") for `"HE"`/`"DE"`/`"DR"`.
      Verify: `yarn vitest run
app/domains/validation-workflow/infrastructure/EmailNotificationAdapter.test.ts` passes.

## 4. submit-validation — assigned-validators email

- [x] 4.1 Add failing tests to `EmailNotificationAdapter.test.ts` for: two validators both
      emailed (per-recipient), a validator with no email on file skipped without failing the
      others, and `recordDisplayName`/`recordDate` appearing in the body (per the
      `email-notification-adapter` spec's "submit-validation" requirement). Skip this task
      entirely if Task 0.1 chose the narrow alternative — add the no-op scenario test
      instead. Verify: tests fail (behavior not implemented yet).
- [x] 4.2 Implement the `"submit-validation"` branch in `EmailNotificationAdapter.notify()`:
      iterate `notification.validatorUserIds`, resolve each via `UserRepository.getById`,
      skip silently when no email, send the "assigned validators" email (subject/body
      hardcoded English strings per design.md Decision 8) with `recordDisplayName`,
      `recordDate`, and the mapped record URL. Verify: Task 4.1's tests pass.

## 5. validate / publish — submitter email

- [x] 5.1 Add failing tests to `EmailNotificationAdapter.test.ts` for: `"validate"` with
      `toStatus: "APPROVED"` sends the "validated" email to `submittedByUserId`; `"validate"`
      with `toStatus: "SUBMITTED"` sends nothing and resolves; `"publish"` sends the
      "published" email to `submittedByUserId`; `submittedByUserId: null` sends nothing and
      resolves (per the `email-notification-adapter` spec's matching requirement). Verify:
      tests fail.
- [x] 5.2 Implement the `"validate"`/`"publish"` branches in `notify()`, keyed on
      `action`/`toStatus` per design.md Decision 6's dispatch table. Verify: Task 5.1's
      tests pass.

## 6. return — assignees-or-submitter email, HTML escaping

- [x] 6.1 Add failing tests to `EmailNotificationAdapter.test.ts` for: `assigneeUserIds`
      present and non-empty notifies only those assignees (not the submitter); absent
      `assigneeUserIds` notifies the submitter; an empty `assigneeUserIds` array notifies
      the submitter (not zero recipients); `rejectionComments` containing `<script>`/`<b>`
      is HTML-escaped in both the assignees and submitter HTML bodies (per the
      `email-notification-adapter` spec's "return" and "escaping" requirements). Verify:
      tests fail.
- [x] 6.2 Implement the `"return"` branch in `notify()`: dispatch to assignees when
      `assigneeUserIds` is present and non-empty, otherwise to `submittedByUserId`; add an
      `escapeHtml()` helper (or reuse the one in `emailValidationWorkflowService.ts` if
      exporting it cleanly is simpler than duplicating it — confirm during implementation
      which is less invasive) and apply it to every interpolated HTML value, with no
      exception for the submitter template (design.md Decision 7 — this fixes a real
      unescaped-HTML bug present in the legacy code it replaces). Verify: Task 6.1's tests
      pass.

## 7. Per-recipient continue-on-error

- [x] 7.1 Add failing tests to `EmailNotificationAdapter.test.ts` for: one failing recipient
      among several (`submit-validation` or `return`-with-assignees) does not prevent the
      other recipients from being attempted, and `notify()` rejects only after every
      recipient has been attempted; all recipients failing still attempts every one before
      rejecting once (per the `email-notification-adapter` spec's continue-on-error
      requirement). Verify: tests fail.
- [x] 7.2 Implement continue-on-error across all multi-recipient branches: attempt every
      recipient via `Promise.allSettled` (or equivalent), and after all attempts complete,
      throw one aggregated error if any attempt failed. Verify: Task 7.1's tests pass, and
      re-run every test from Sections 4-6 to confirm this change didn't alter their
      single-recipient-failure assertions.

## 8. Full-suite verification

- [x] 8.1 Run `yarn tsc` across the whole repo and confirm zero errors (closes out every
      call site touched in Sections 1-2 and the new adapter file).
- [x] 8.2 Run `npx prettier --check` scoped to every file touched in Sections 1-7 (do not
      run a bare `yarn format` — it reformats unrelated files in this repo) and fix any
      formatting drift with a scoped `npx prettier --write` on the same file list,
      previewing the diff first.
- [x] 8.3 Anti-pattern review: check the touched files against
      `.github/skills/anti-pattern-check/SKILL.md`; resolve any match found.
- [x] 8.4 SOLID review: invoke the `solid-reviewer` agent against the touched files;
      resolve any violation found (fix-vs-defer is a joint call with the user — report
      findings with reasoning, don't unilaterally defer).
- [x] 8.5 Documentation review: one full-diff sweep (not per-round, by a fresh subagent)
      confirming every new comment explains WHY, not WHAT, and is as terse as it can be
      without losing meaning.
- [x] 8.6 Project-conventions review: check the touched files against
      `.github/copilot-instructions.md`.
- [x] 8.7 Test-quality-auditor: invoke `test-quality-auditor` scoped to
      `EmailNotificationAdapter.server.ts`, `EmailNotificationTemplates.ts` (added during
      implementation, gate 5 SOLID review), `ProcessWorkflowAction.ts`, and
      `INotificationPort.ts` (the first three contain real implementation logic touched by
      this change; the fourth is a type-only interface — include it only if the auditor's
      scope expects the full touched-file list). Resolve any real gap it finds.
- [x] 8.8 Code review: run `.github/skills/code-review/SKILL.md` in full, via a fresh
      subagent, against the complete diff for this change.
- [x] 8.9 Visual/UX parity review: **not applicable** — this change touches no
      `app/domains/*/presentation/` or `app/routes/` file (it is not wired to any route yet
      — that's a later intent per the roadmap's `5c`). State this explicitly rather than
      silently skipping.
- [x] 8.10 Independent second-opinion review: invoke Claude Code's built-in `code-review` at
      `high` effort via a second, separate fresh subagent; resolve findings before
      archiving.

## 9. Regression gate and deferred-items housekeeping

- [x] 9.1 Run `yarn test:run2` (full PGlite suite) and confirm it passes with no new
      failures. If any failure is suspected pre-existing, confirm this by running the same
      suite against the base branch (`dev`) before this change's commits, per the
      no-assumptions-certainty rule — do not label a failure "pre-existing" without that
      comparison.
- [x] 9.2 Add a new entry to `_docs/refactoring-plan/deferred-items-register.md`:
      `EmailNotificationAdapter` sends single-locale English email content regardless of
      recipient or acting-user language — no i18n mechanism exists for server-sent
      notifications from a NestJS singleton provider (design.md Decision 8). If Task 0.1
      chose the narrow alternative, also add the second deferred item named there
      (`submit-validation` has no adapter implementation).

## 10. Archive

- [x] 10.1 Confirm Task 0.1's and 0.2's resolutions are recorded in design.md with the date
      decided.
- [x] 10.2 Run `opsx:archive` on this change, on this branch
      (`feature/ca-workflow-notification-adapter`), before raising the PR.
