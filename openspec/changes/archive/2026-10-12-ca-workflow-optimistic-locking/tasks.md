## 0. Resolve open design questions with the user (blocking — see proposal.md and design.md)

- [x] 0.1 Resolved 2026-10-12: propagate unmodified (design.md Decision 6). Section 6
      below uses the propagate-unmodified test/implementation path, not retry.
- [x] 0.2 Resolved 2026-10-12: no tombstone (design.md Decision 7). Decision 2's design
      stands as-is.

## 1. Shared error type

- [x] 1.1 Write a failing test in `app/shared/errors/DomainError.test.ts` (new file)
      asserting `ConcurrentModificationError` is a class extending `ConflictError`, has
      `code === "CONFLICT"` and `statusHint === 409` (inherited, not overridden — confirm
      this compiles under `yarn tsc` per design.md Decision 5's rationale for not
      overriding `code`), and that `instanceof ConflictError` is `true` for an instance of
      it. Verify: `yarn vitest run app/shared/errors/DomainError.test.ts` fails (class
      doesn't exist yet).
- [x] 1.2 Add `ConcurrentModificationError extends ConflictError` to
      `app/shared/errors/DomainError.ts` and export it from
      `app/shared/errors/index.ts`. Verify: `yarn vitest run
app/shared/errors/DomainError.test.ts` passes.

## 2. IWorkflowRepository port — insert()/update() interface shape

- [x] 2.1 Update `app/domains/validation-workflow/application/ports/IWorkflowRepository.test.ts`:
      replace `FakeWorkflowRepository.save()` with `insert()` (plain write, throws
      `ConflictError` on id-reused-for-different-entity, matching today's fake behavior)
      and `update(instance, expectedUpdatedAt)` (conditional write — for this
      interface-conformance fake, a straightforward in-memory equality check against the
      stored instance's `updatedAt` is sufficient; the real conditional-SQL behavior is
      `DrizzleWorkflowRepository`'s own concern, covered in Section 4). Update every
      `repo.save(...)` call site in that file to `repo.insert(...)`. Replace the
      `_saveArity` compile-time assertion with `_insertArity` and `_updateArity` (the
      latter asserting `expectedUpdatedAt: Date` is a required second parameter — test
      this fails to compile if made optional, per `workflow-repository-port` spec's
      "update's expectedUpdatedAt parameter is required" scenario). Add a test for the new
      `ConcurrentModificationError` behavior on a stale `update()` call, and for a stale
      `update()` after a `deleteByEntity()`. Verify: `yarn vitest run
app/domains/validation-workflow/application/ports/IWorkflowRepository.test.ts` fails to
      typecheck/run (interface doesn't exist yet).
- [x] 2.2 Update `app/domains/validation-workflow/application/ports/IWorkflowRepository.ts`:
      remove `save()`, add `insert(instance: WorkflowInstance): Promise<WorkflowInstance>`
      and `update(instance: WorkflowInstance, expectedUpdatedAt: Date):
Promise<WorkflowInstance>`, per the `workflow-repository-port` spec delta's "insert
      persists a brand-new WorkflowInstance" and "update persists a transition..."
      requirements. Verify: `yarn vitest run
app/domains/validation-workflow/application/ports/IWorkflowRepository.test.ts` passes and
      `yarn tsc` reports errors only in files not yet updated (expected at this point —
      resolved by Sections 3, 5, 6, 7).

## 3. DrizzleWorkflowRepository — insert()

- [x] 3.1 In `tests/integration/domains/validation-workflow/DrizzleWorkflowRepository.test.ts`,
      rewrite the `describe("save", ...)` block's first-insert scenarios (lines 216-226,
      330-339, 341-365, 367-389, 391-411) to call `repository.insert(...)` instead of
      `repository.save(...)`, matching the `workflow-repository-port` spec delta's
      "DrizzleWorkflowRepository's insert ..." requirement. Verify: `yarn vitest run
tests/integration/domains/validation-workflow/DrizzleWorkflowRepository.test.ts` fails
      (`insert` doesn't exist on the adapter yet).
- [x] 3.2 In `app/domains/validation-workflow/infrastructure/DrizzleWorkflowRepository.server.ts`,
      implement `insert(instance)`: a plain `INSERT` (no `onConflictDoUpdate`), preserving
      today's `pgErrorCode`-based mapping of `23505` → `ConflictError`, `23503`/`22P02` →
      `ValidationError`. Verify: the Section 3.1 tests pass.

## 4. DrizzleWorkflowRepository — update() with optimistic locking

- [x] 4.1 In the same integration test file, invert the existing test at (current) line
      413 — titled "...characterizes DEF-024" — so the losing concurrent call now asserts
      rejection with `ConcurrentModificationError`, matching the
      `workflow-repository-port` spec delta's "Concurrent callers updating the same
      existing row — the losing write is rejected..." scenario. Rewrite the remaining
      `describe("save", ...)`/`describe("save — identity-mismatch guard", ...)`/
      `describe("save — status transition round trips", ...)` blocks' update-path
      scenarios (lines 228-277, 279-328, 442-475, 477-644) to call
      `repository.update(instance, expectedUpdatedAt)`, threading each scenario's
      previously-read `updatedAt` through. Add a new test for the delete/save resurrection
      race: a `deleteByEntity()` that completes before a stale `update()` for the same
      entity, asserting `ConcurrentModificationError` and no row resurrected. Verify:
      `yarn vitest run
tests/integration/domains/validation-workflow/DrizzleWorkflowRepository.test.ts` fails
      (`update` doesn't exist on the adapter yet, and the DEF-024 test still expects
      silent success).
- [x] 4.2 In `DrizzleWorkflowRepository.server.ts`, implement `update(instance,
expectedUpdatedAt)`: a conditional `UPDATE ... WHERE id = ? AND entity_id = ? AND
entity_type = ? AND updated_at = ?` (millisecond-truncated comparison per design.md
      Decision 3 — no new column), `RETURNING *`. On zero rows, issue the diagnostic
      re-read by `id` (design.md Decision 4) and throw `ConcurrentModificationError` for
      "no row" or "updated_at mismatch", or the pre-existing `ConflictError` message for
      "entity mismatch". Preserve the existing `pgErrorCode` mapping for `23503`/`22P02`.
      Verify: all Section 4.1 tests pass.
- [x] 4.3 Run `yarn vitest run
tests/integration/domains/validation-workflow/DrizzleWorkflowRepository.test.ts` in full
      and confirm every test (Sections 3 and 4) passes together, not just in isolation
      (shared `describe` blocks can mask order-dependent failures).

## 5. CreateHazardousEventUseCase — insert() call site

- [x] 5.1 Update `app/domains/hazardous-events/application/use-cases/CreateHazardousEvent.test.ts`:
      change `FakeWorkflowRepository`'s `save` method to `insert` (same signature/behavior
      — this use case only ever inserts), and every `repo.save`/assertion on
      `IWorkflowRepository.save` to `insert`, per the `create-hazardous-event` spec
      delta's updated scenarios. Verify: `yarn vitest run
app/domains/hazardous-events/application/use-cases/CreateHazardousEvent.test.ts` fails
      (use case still calls `.save()`).
- [x] 5.2 In `app/domains/hazardous-events/application/use-cases/CreateHazardousEvent.ts`
      line 192, change `this.workflowRepository.save(workflowInstance)` to
      `this.workflowRepository.insert(workflowInstance)`. Verify: Section 5.1 tests pass.

## 6. ProcessWorkflowActionUseCase — update() call site, propagates ConcurrentModificationError unmodified (design.md Decision 6)

- [x] 6.1 Update `app/domains/validation-workflow/application/use-cases/ProcessWorkflowAction.test.ts`'s
      `makeRepository` helper (line 28) to implement `insert`/`update` instead of `save`,
      and update every `repo.save`/`IWorkflowRepository.save` assertion across the file to
      `update`, asserting the second argument equals the pre-transition `existing.updatedAt`.
      Rewrite the "Repository save errors propagate unmodified" test to "Repository
      update throws a generic error" (per the spec delta — unconditional case only).
      Rewrite the former "Concurrent callers... last write wins" scenario to assert
      `execute()` itself rejects with `ConcurrentModificationError` for the stale caller
      (no retry — propagate unmodified). Verify: `yarn vitest run
app/domains/validation-workflow/application/use-cases/ProcessWorkflowAction.test.ts`
      fails (use case still calls `.save()` with no `expectedUpdatedAt`).
- [x] 6.2 In `app/domains/validation-workflow/application/use-cases/ProcessWorkflowAction.ts`
      line 74, change `this.workflowRepository.save(transitioned)` to
      `this.workflowRepository.update(transitioned, existing.updatedAt)`. No retry loop —
      `ConcurrentModificationError` propagates unmodified, same as every other error this
      use case already lets through. Verify: Section 6.1 tests pass.

## 7. Other IWorkflowRepository fakes across hazardous-events use-case tests

- [x] 7.1 Update the `FakeWorkflowRepository` (or equivalent stub) in each of
      `app/domains/hazardous-events/application/use-cases/DeleteHazardousEvent.test.ts`,
      `GetHazardousEventById.test.ts`, `ListHazardousEvents.test.ts`, and
      `UpdateHazardousEvent.test.ts` (this fourth file was in proposal.md's own Impact
      list but omitted from this task's original file list — corrected during
      implementation) to implement `insert`/`update` instead of `save` (these use cases
      don't call either method directly today per the earlier repo-wide grep, but each
      file's fake must still satisfy the `IWorkflowRepository` interface to compile).
      Verify: `yarn tsc` reports zero errors in these four files.

## 8. Full-suite verification

- [x] 8.1 Run `yarn tsc` across the whole repo and confirm zero errors (closes out every
      call site enumerated in Sections 2-7).
- [x] 8.2 Run `npx prettier --check` scoped to every file touched in Sections 1-7 (do not
      run a bare `yarn format` — it reformats unrelated files in this repo) and fix any
      formatting drift with a scoped `npx prettier --write` on the same file list,
      previewing the diff first.
- [x] 8.3 Anti-pattern review: check the touched files against
      `.github/skills/anti-pattern-check/SKILL.md`; resolve any match found.
- [x] 8.4 SOLID review: invoke the `solid-reviewer` agent against the touched files;
      resolve any violation found (fix-vs-defer is a joint call with the user — report
      findings with reasoning, don't unilaterally defer).
- [x] 8.5 Documentation review: one full-diff sweep (not per-round) confirming every new
      comment explains WHY, not WHAT, and is as terse as it can be without losing meaning.
- [x] 8.6 Project-conventions review: check the touched files against
      `.github/copilot-instructions.md`.
- [x] 8.7 Test-quality-auditor: invoke `test-quality-auditor` scoped to
      `DrizzleWorkflowRepository.server.ts`, `IWorkflowRepository.ts`,
      `ProcessWorkflowAction.ts`, and `CreateHazardousEvent.ts` (all contain real
      implementation logic touched by this change); resolve any real gap it finds.
- [x] 8.8 Code review: run `.github/skills/code-review/SKILL.md` in full, via a fresh
      subagent, against the complete diff for this change.
- [x] 8.9 Visual/UX parity review: **not applicable** — this change touches no
      `app/domains/*/presentation/` or `app/routes/` file. State this explicitly rather
      than silently skipping.
- [x] 8.10 Independent second-opinion review: invoke Claude Code's built-in `code-review`
      at `high` effort via a second, separate fresh subagent; resolve findings before
      archiving.

## 9. Regression gate

- [x] 9.1 Run `yarn test:run2` (full PGlite suite) and confirm it passes with no new
      failures. If any failure is suspected pre-existing, confirm this by running the same
      suite against the base branch (`dev`) before this change's commits, per the
      no-assumptions-certainty rule — do not label a failure "pre-existing" without that
      comparison.

## 10. Archive

- [x] 10.1 Confirm Task 0.2 (the no-tombstone decision) is recorded in design.md.
- [x] 10.2 Close `DEF-024` in `_docs/refactoring-plan/deferred-items-register.md`
      (mark resolved, reference this change).
- [x] 10.3 Run `opsx:archive` on this change, on this branch
      (`feature/ca-workflow-optimistic-locking`), before raising the PR.
