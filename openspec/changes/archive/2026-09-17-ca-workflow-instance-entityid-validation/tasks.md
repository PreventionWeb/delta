## 1. Red — failing tests first

- [x] 1.1 In `app/domains/validation-workflow/domain/WorkflowInstance.test.ts`, add a new
      `describe` block for the `entityId` presence check (following the file's own
      `as unknown as WorkflowInstanceProps` cast convention, lines 94-95, for the
      null/undefined case since the prop type is `string`): empty string `entityId`
      (`""`), whitespace-only `entityId` (`"   "`), and `null`/`undefined` `entityId` each
      throw `ValidationError` referencing `entityId`; a real UUID `entityId` does not
      throw and the getter returns it unchanged; and empty `entityId` combined with an
      invalid `entityType` throws referencing `entityId`, not `entityType` (ordering
      scenario). Verify:
      `yarn vitest run app/domains/validation-workflow/domain/WorkflowInstance.test.ts`
      fails only on the new cases (existing cases still pass — confirms Red, not a broken
      file).

## 2. Green — minimal implementation

- [x] 2.1 In `app/domains/validation-workflow/domain/WorkflowInstance.ts`, add the
      `entityId` presence check as the first statement inside `static create()`, before
      the existing `entityType` check:
      throw `ValidationError("entityId must not be empty")` when
      `props.entityId == null || props.entityId.trim().length === 0`
      (matching `HazardousEvent.create()`'s convention exactly). Verify:
      `yarn vitest run app/domains/validation-workflow/domain/WorkflowInstance.test.ts`
      passes in full (all new and existing cases green).

## 3. Refactor

- [x] 3.1 Re-read the diff for terseness and consistency with `HazardousEvent.create()`'s
      required-field loop comment style; adjust only if the check reads as inconsistent
      with the sibling file. Verify:
      `yarn vitest run app/domains/validation-workflow/domain/WorkflowInstance.test.ts` still passes.

## 4. Quality gates (route gate agents through sdd-implementer, one at a time)

- [x] 4.1 Gate 1 — `yarn vitest run app/domains/validation-workflow/domain/WorkflowInstance.test.ts`
      green.
- [x] 4.2 Gate 2 — `yarn tsc` reports zero TypeScript errors.
- [x] 4.3 Gate 3 — `npx prettier --check app/domains/validation-workflow/domain/WorkflowInstance.ts app/domains/validation-workflow/domain/WorkflowInstance.test.ts`
      clean (scoped check only — never a bulk `yarn format`).
- [x] 4.4 Gate 4 — Anti-pattern review against `.github/skills/anti-pattern-check/SKILL.md`.
- [x] 4.5 Gate 5 — SOLID review via the `solid-reviewer` agent, invoked by `sdd-implementer`
      (not launched in parallel by the coordinator).
- [x] 4.6 Gate 6 — Documentation review: comments explain WHY not WHAT, one full-diff
      sweep by a fresh subagent before the final report.
- [x] 4.7 Gate 7 — Project conventions review against `.github/copilot-instructions.md`.
- [x] 4.8 Gate 8 — Code review: run `.github/skills/code-review/SKILL.md` in full via a
      fresh subagent, invoked by `sdd-implementer`.
- [x] 4.9 Gate 9 — Visual/UX parity review: **N/A, explicitly skipped**. This change
      touches only `app/domains/validation-workflow/domain/` — no
      `app/domains/*/presentation/` file and no route are affected.
- [x] 4.10 Gate 10 — Independent second-opinion review: Claude Code's built-in
      `/code-review` at high effort via a second, separate fresh subagent; resolve any
      findings before archiving.
- [x] 4.11 Test-quality gate — this change modifies
      `app/domains/validation-workflow/domain/WorkflowInstance.ts`, so invoke the
      `test-quality-auditor` agent (via `sdd-implementer`) scoped to
      `WorkflowInstance.ts`/`WorkflowInstance.test.ts`; resolve any real mutation-coverage
      gap it finds.

## 6. Round 2 fixes — entityId non-string-value gap (Red → Green)

- [x] 6.1 Write a failing test in
      `app/domains/validation-workflow/domain/WorkflowInstance.test.ts` for the
      non-string, non-null `entityId` gap (design.md Decision 4, found during this
      change's own Gate 10 review): a props object where `entityId` is a number (e.g.
      `12345`) — neither `null`/`undefined` nor a string — must throw `ValidationError`
      referencing `entityId`, not an unhandled `TypeError` from `.trim()` being called on
      a non-string value. Verify red:
      `yarn vitest run app/domains/validation-workflow/domain/WorkflowInstance.test.ts`
      fails only on the new case (existing cases still pass).
- [x] 6.2 Implement the fix in
      `app/domains/validation-workflow/domain/WorkflowInstance.ts` (design.md Decision 4):
      replace `props.entityId == null || props.entityId.trim().length === 0` with
      `typeof props.entityId !== "string" || props.entityId.trim().length === 0` — a
      single condition that already covers `null`/`undefined`/number/object/etc. (none of
      which satisfy `typeof x === "string"`) and the empty/whitespace-only case. Verify
      green:
      `yarn vitest run app/domains/validation-workflow/domain/WorkflowInstance.test.ts`
      passes in full (all new and existing cases green).

## 7. Round 2 quality gates

- [x] 7.1 Gate 1 — `yarn vitest run app/domains/validation-workflow/domain/WorkflowInstance.test.ts`
      green.
- [x] 7.2 Gate 2 — `yarn tsc` reports zero TypeScript errors.
- [x] 7.3 Gate 3 — `npx prettier --check app/domains/validation-workflow/domain/WorkflowInstance.ts app/domains/validation-workflow/domain/WorkflowInstance.test.ts`
      clean (scoped check only — never a bulk `yarn format`).
- [x] 7.4 Gate 4 — Anti-pattern review against `.github/skills/anti-pattern-check/SKILL.md`.
- [x] 7.5 Gate 5 — SOLID review via the `solid-reviewer` agent, invoked by
      `sdd-implementer` (not launched in parallel by the coordinator).
- [x] 7.6 Gate 6 — Documentation review: comments explain WHY not WHAT, one full-diff
      sweep by a fresh subagent before the final report.
- [x] 7.7 Gate 7 — Project conventions review against `.github/copilot-instructions.md`.
- [x] 7.8 Gate 8 — Code review: run `.github/skills/code-review/SKILL.md` in full via a
      fresh subagent, invoked by `sdd-implementer`.
- [x] 7.9 Gate 9 — Visual/UX parity review: **N/A, explicitly skipped**. This round still
      touches only `app/domains/validation-workflow/domain/` — no
      `app/domains/*/presentation/` file and no route are affected.
- [x] 7.10 Gate 10 — Independent second-opinion review: Claude Code's built-in
      `/code-review` at high effort via a second, separate fresh subagent; resolve any
      findings before archiving.
- [x] 7.11 Test-quality gate — this round again modifies
      `app/domains/validation-workflow/domain/WorkflowInstance.ts`, so invoke the
      `test-quality-auditor` agent (via `sdd-implementer`) scoped to
      `WorkflowInstance.ts`/`WorkflowInstance.test.ts`; resolve any real mutation-coverage
      gap it finds. Result: 94.34% mutation score (99 killed, 1 timeout, 6 survived, 88
      excluded), log at `/tmp/wi_round2_stryker.log`. Zero survivors on lines 118-127 (the
      entityId guard this round touched) — all 6 survivors are on unrelated pre-existing
      lines (entityType/status message-join formatting, the REJECTED conditional,
      publish()'s validator-backfill logic) untouched by this round's diff. No real gap
      introduced by this round.

## 8. Round 2 regression check

- [x] 8.1 Run `yarn test:run2` (full PGlite suite) on the branch with round 2 applied, and
      compare against the 5.1 baseline (re-establish it first if it's gone stale): it MUST
      pass with no new failures beyond the confirmed pre-existing set. Baseline
      (`/tmp/3b_baseline_test_run2.log`, same `feature/he-ca-phase3` tip commit
      `79206091`, still current — reused, not re-run): 81/82 files passed, 844/845 tests
      passed, 1 pre-existing timeout failure in
      `tests/integration/db/models/hazardousEventDisasterEventBoundary.test.ts`. Round 2
      result (`/tmp/wi_round2_test_run2.log`): 84/84 files passed, 908/908 tests passed,
      exit code 0 — zero failures, no regression (the baseline's one pre-existing failure
      didn't even reproduce this run).

## 5. Regression and archive

- [x] 5.1 Establish the regression baseline: on `feature/he-ca-phase3`'s own tip (the
      integration branch this work descends from and will merge back into — not `dev`,
      and not a merge-base with `dev`), run `yarn test:run2` and record any failing tests
      as the pre-existing baseline — do not assume "pre-existing" without this run. Reuse
      `3b`'s own already-established baseline log if it's still valid (same base commit),
      rather than re-running it from scratch.
- [x] 5.2 On the branch with this change's implementation applied, run `yarn test:run2`
      (full PGlite suite) and compare against the 5.1 baseline: it MUST pass with no new
      failures beyond the confirmed pre-existing set.
- [x] 5.3 Confirm every task checkbox in this file (rounds 1 and 2), and every task
      checkbox in `openspec/changes/ca-he-hazardous-event-entity/tasks.md` (the sibling
      `3b` change sharing this branch/PR, including its own round 3), is ticked complete.
- [x] 5.4 Run `opsx:archive` for `ca-workflow-instance-entityid-validation` on
      `feature/ca-he-hazardous-event-entity` before raising the PR.
- [x] 5.5 Run `opsx:archive` for `ca-he-hazardous-event-entity` on the same branch, in the
      same session, before raising the single shared PR to `feature/he-ca-phase3` (the
      Phase 3 integration branch — matching `3a`'s and `3b`'s own confirmed target, not
      `dev`).
