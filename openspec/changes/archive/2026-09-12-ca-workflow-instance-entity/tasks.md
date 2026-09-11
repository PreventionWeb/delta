## 1. WorkflowInstance — construction (Red → Green)

- [x] 1.1 Write failing tests in `app/domains/validation-workflow/domain/WorkflowInstance.test.ts` for the "construction via validated factory" requirement (spec: `workflow-instance-entity` — happy path fresh DRAFT, happy path reconstitution with partial attribution, invalid `entityType` throws `ValidationError`, invalid `status` throws `ValidationError`). Verify red: `yarn vitest run app/domains/validation-workflow/domain/WorkflowInstance.test.ts` fails because `WorkflowInstance.ts` does not exist yet.
- [x] 1.2 Implement `app/domains/validation-workflow/domain/WorkflowInstance.ts`: private constructor, `WorkflowInstance.create(props)` static factory validating `entityType` against `['HE','DE','DR']` and `status` against the six-value status enum, read-only getters for every column (`id`, `entityId`, `entityType`, `status`, all four attribution pairs, `createdAt`, `updatedAt`). Verify green: `yarn vitest run app/domains/validation-workflow/domain/WorkflowInstance.test.ts`.

## 2. WorkflowInstance — status-transition graph (Red → Green)

- [x] 2.1 Add failing tests for `submit()` (happy path from `DRAFT`, happy path resubmit from `REVISION_REQUESTED` overwriting prior attribution, failure from `SUBMITTED`, failure from `APPROVED`/`REJECTED`/`PUBLISHED` — design.md Decision 1's table). Verify red: `yarn vitest run app/domains/validation-workflow/domain/WorkflowInstance.test.ts`.
- [x] 2.2 Implement `submit()` per design.md Decision 1 and 3 (`ConflictError` from `~/shared/errors` on disallowed source status, with `context: { entityId, entityType, from: status, attemptedTransition: "submit" }`). Verify green.
- [x] 2.3 Add failing tests for `validate()` (happy path while `SUBMITTED`, failure from every other status). Verify red.
- [x] 2.4 Implement `validate()` per design.md Decision 1. Verify green.
- [x] 2.5 Add failing tests for `approve()` (happy path from `SUBMITTED` writing `approvedByUserId`/`approvedAt`; failure from every other status). No `reject()` in this change — see design.md Decision 4. Verify red.
- [x] 2.6 Implement `approve()` per design.md Decision 1. Verify green.
- [x] 2.7 Add failing tests for `requestRevision()` (happy path from `SUBMITTED` writing no attribution field, prior attribution left untouched; failure from every other status). Verify red.
- [x] 2.8 Implement `requestRevision()` per design.md Decision 1. Verify green.

## 3. WorkflowInstance — publish backfill rule (Red → Green)

- [x] 3.1 Add failing tests for `publish()` covering both backfill branches from spec `workflow-instance-entity`: (a) direct publish with `validatedByUserId`/`validatedAt` both `null` gets backfilled from the publisher, (b) publish after a separate `validate()` call preserves the existing validator's attribution unchanged; plus failure from every status other than `APPROVED`. Verify red.
- [x] 3.2 Implement `publish()` per design.md Decision 1 (open decision #9): always stamp `publishedByUserId`/`publishedAt`; stamp `validatedByUserId`/`validatedAt` from the publisher only when both are currently `null`. Verify green: `yarn vitest run app/domains/validation-workflow/domain/WorkflowInstance.test.ts`.

## 4. WorkflowInstance — immutability (Red → Green)

- [x] 4.1 Add tests for the "pure, never mutates the receiver" requirement: original instance unchanged after a successful transition; two sequential transitions called from the same source instance produce independent, non-interfering results. Note: these passed immediately (no red) — purity is inherent to `transition()`'s object-spread design (Decision 2), not new behavior; verified as characterization tests rather than driving new code.
- [x] 4.2 Confirmed the implementation: every transition method returns a new `WorkflowInstance` via `transition()`'s `{ ...this.props, ...patch }`; no field on `this` is ever reassigned. Verify green.

## 5. IWorkflowRepository port

- [x] 5.1 Implement `app/domains/validation-workflow/application/ports/IWorkflowRepository.ts` per design.md Decision 6 and spec `workflow-repository-port`: `findByEntity(entityId, entityType): Promise<WorkflowInstance | null>`, `findByEntityIds(entityIds, entityType): Promise<WorkflowInstance[]>`, `save(instance): Promise<WorkflowInstance>` — no `tenantId` parameter on any method, no Drizzle/NestJS/Remix import. Verify via `yarn tsc` (zero errors referencing this file) and a manual read-through against each of the four `workflow-repository-port` spec requirements (interface compiles; `findByEntity` null-not-throw; `findByEntityIds` batched/array signature; `save` signature; no `tenantId` anywhere).

## 6. Refactor pass

- [x] 6.1 Refactor `WorkflowInstance.ts` for duplication across the six transition methods (e.g. a shared internal "assert current status is one of X, else throw ConflictError" helper) without changing any observable behavior. Verify green: `yarn vitest run app/domains/validation-workflow/domain/WorkflowInstance.test.ts`. (Done inline during Green phase — the private `transition()` helper was introduced immediately, so no separate duplication existed to refactor out; re-confirmed green above.)

## 7. Quality gates

- [x] 7.1 Gate 1 — `yarn vitest run app/domains/validation-workflow/domain/WorkflowInstance.test.ts` — all tests green (40/40).
- [x] 7.2 Gate 2 — `yarn tsc` — zero TypeScript errors (confirms zero DB/framework dependency compiles cleanly, per Phase 3 Gate).
- [x] 7.3 Gate 3 — `npx prettier --check app/domains/validation-workflow/domain/WorkflowInstance.ts app/domains/validation-workflow/domain/WorkflowInstance.test.ts app/domains/validation-workflow/application/ports/IWorkflowRepository.ts` — Prettier clean (previewed --write on a same-directory copy of the test file first per convention, diff was pure line-wrapping, then applied).
- [x] 7.4 Gate 4 — Anti-pattern review against `.github/skills/anti-pattern-check/SKILL.md`: no P0 hits (no Drizzle/NestJS/auth/tenancy code in this change). No `any`, no non-null assertions, no swallowed errors, no sentinel strings (typed `ConflictError`/`ValidationError` used throughout), `tsc`/`format:check` scoped-clean. Two checklist items noted as documented exceptions rather than violations: (1) tests live in `app/domains/validation-workflow/domain/` alongside the entity, matching the existing `Notice.test.ts` precedent, not the `tests/` convention that targets a different (orphaned `app/backend.server`) pattern; (2) the group-4 purity tests passed without a Red phase because immutability is structural (inherent to `transition()`'s object-spread), not new behavior — recorded in tasks.md 4.1.
- [x] 7.5 Gate 5 — SOLID review: invoke the `solid-reviewer` agent against the two new files. Found one real DIP finding (`STATUS_VALUES`/`ENTITY_TYPE_VALUES` duplicated from `workflowInstanceTable.ts` with no drift guard — same finding Gate 8 raised independently) — resolved via the drift-guard test (see Gate 8 note). ISP note on `requestRevision`'s unused `TransitionParams` and the optional `findByEntityIds` return-shape suggestion were both confirmed as already-documented, deliberate trade-offs (design.md Decisions 1 and 6) — no change needed. No SRP violations found.
- [x] 7.6 Gate 6 — Documentation review: every comment in both files is a single line and explains WHY (framework-free rationale, design.md decision references, the publish backfill rule's intent, why no `reject()` exists) — none restate what the adjacent code already shows. Comment count (~10 one-liners) stays well under the code-line count; user flagged verbose multi-line JSDoc mid-implementation and it was trimmed across both files before this gate.
- [x] 7.7 Gate 7 — Project conventions review against `.github/copilot-instructions.md`: confirmed N/A — `.server.ts` suffix (no server/framework code here), `authLoaderWithPerm`/auth wrappers (no loaders), `countryAccountsId` tenant scoping (no DB queries, and deliberately no `tenantId` param per design.md Decision 6), `yarn dbsync` (no migration). Path alias `~/shared/errors` used correctly in `WorkflowInstance.ts`; `IWorkflowRepository.ts` uses a relative import to `../../domain/WorkflowInstance`, matching `INoticeRepository.ts`'s own precedent exactly. Test file colocated under `app/domains/validation-workflow/domain/` (Vitest, picked up by `yarn vitest run`) matches the `Notice.test.ts` precedent, not the orphaned `node:test` pattern the conventions doc warns against.
- [x] 7.8 Gate 8 — Run `.github/skills/code-review/SKILL.md` in full, via a fresh subagent, against the diff. Findings resolved: (A1/D1) `save()`'s lost-update risk documented in design.md Risks and the misleading `IWorkflowRepository.ts` comment reworded to scope it correctly; (A2, also raised independently by the Gate 5 SOLID review) added a drift-guard test asserting `ENTITY_TYPE_VALUES`/`STATUS_VALUES` match `workflowInstanceTable.ts`'s own arrays; (S1) added `IWorkflowRepository.test.ts` — a `FakeWorkflowRepository` conformance implementation plus `Parameters<...>` tuple-equality checks for all three methods, regression-proofing the port's spec requirements instead of relying on a one-time manual `tsc` check; (N1) `transition()`'s `attemptedTransition` param is now a literal union, not `string`; (N3) added one comment above the "Failure paths" describe block explaining the `as unknown as X` casts' intent. D2 (an out-of-scope modification to `_docs/workflows/openspec.md`) was pre-existing before this change started and is not this change's file — left untouched, reported to the user. N2 (Date mutability) is inherited `Notice.ts` precedent, not a regression — no action per the reviewer's own recommendation.
- [x] 7.9 Gate 9 — Visual/UX parity review: **not applicable**. This change touches no `app/domains/*/presentation/` file and renders no route — confirmed by the file list in proposal.md (`WorkflowInstance.ts`, its test, `IWorkflowRepository.ts` only). Recorded explicitly rather than silently skipped.
- [x] 7.10 Gate 10 — Independent second-opinion review, via a fresh subagent (generic code review, not the DELTA-specific Gate 8 checklist). Real findings: `updatedAt` never stamped by any transition; getters returned live mutable `Date`s; `WorkflowInstanceProps` fields weren't actually `readonly`; `create()` had no cross-field consistency check; `publish()`'s validator-backfill condition was under-exercised for a mixed null/set state. All resolved in section 10 below.

## 8. Domain test-quality audit

- [x] 8.1 Invoked `test-quality-auditor` (Stryker) scoped to `WorkflowInstance.ts`/`.test.ts`. 80–83% mutation score across two independent runs; both converged on the same real gaps: the `publish()` backfill's OR-condition under-exercised for a mixed validator state (same finding as Gate 10), and `ConflictError`'s message/context never asserted by any test. Resolved in section 10 below.

## 10. Post-review fixes (Gate 10 + mutation testing findings, plus two user decisions)

- [x] 10.1 `create()` now validates cross-field consistency (design.md Decision 7): each attribution pair must be jointly null/set, and each status requires/forbids specific pairs (`REJECTED` exempt). Closes the `publish()` asymmetric-state gap upstream rather than defensively in `publish()` itself.
- [x] 10.2 `submit()` now clears `validatedByUserId`/`validatedAt` on every call (design.md Decision 8) — matches confirmed live `hazardousEventUpdateApprovalStatusNeedRevision` behavior; a validator's sign-off on a since-corrected draft no longer persists across a resubmission.
- [x] 10.3 All five transition methods now stamp `updatedAt: now`.
- [x] 10.4 `Date`-returning getters now clone before returning; `WorkflowInstanceProps` fields are now `readonly` at the type level.
- [x] 10.5 Added tests asserting `ConflictError`'s `.message` and `.context` payload (previously only `.toThrow(ConflictError)`-checked).
- [x] 10.6 Fixed `IWorkflowRepository.test.ts`'s style nit (imports `EntityType` instead of a hardcoded union).
- [x] 10.7 Updated `proposal.md`/`design.md`/`specs/workflow-instance-entity/spec.md` to document all of the above as real requirements, not just implementation notes. `openspec validate --strict` passes.
- [x] 10.8 Re-ran gates 1–3 (73/73 tests green, `yarn tsc` clean, Prettier clean) after the fixes.

## 11. Re-verification after post-review fixes

- [x] 11.1 Re-run SOLID review (`solid-reviewer`) against the updated `WorkflowInstance.ts`.
- [x] 11.2 Re-run Gate 8 (`.github/skills/code-review/SKILL.md`, fresh subagent) against the updated diff.
- [x] 11.3 Re-run Gate 10 (independent second-opinion review, fresh subagent) to confirm the fixes and check nothing new was introduced.
- [x] 11.4 Re-run `test-quality-auditor` (mutation testing) to confirm the two previously-found gaps are closed.
- [x] 11.5 Run `yarn test:run2` (full PGlite suite) in isolation (no concurrent Stryker/background load — a prior contaminated run showed 30 spurious failures from resource contention). Confirm against `feature/he-ca-phase3`'s own baseline, not assumed.

## 13. Round 3 fixes (two independent code-review passes + two mutation-testing runs)

- [x] 13.1 Moved the enum drift-guard test out of `WorkflowInstance.test.ts` into a new
      `app/domains/validation-workflow/infrastructure/workflowInstanceTable.test.ts` —
      domain tests must import no DB/framework code, and the guard test needed
      `workflowInstanceTable.ts` (Drizzle-backed) to compare against. Infrastructure
      importing domain is the correct dependency direction.
- [x] 13.2 Added `createdAt`/`updatedAt` validity checks to `create()` — both must be a
      valid `Date` instance (`instanceof Date` and not `NaN` via `getTime()`), throwing
      `ValidationError` referencing the field name otherwise (design.md Decision 9).
- [x] 13.3 Fixed the defensive-copy gap at construction (Gate 10 finding): the private
      constructor now clones every `Date`/nullable-`Date` field of incoming `props` before
      storing, so both `create()` and `transition()`'s internal `new WorkflowInstance(...)`
      are protected uniformly against a caller mutating a `Date` after passing it in
      (design.md Decision 2, round 3 hardening).
- [x] 13.4 Closed test gaps found by mutation testing and Gate 10: `createdAt`/`updatedAt`
      getter clone behavior; the XOR pair-consistency rule isolated from the
      required-set/required-null rules (`SUBMITTED` with a split `validated` pair);
      `REQUIRED_SET.REVISION_REQUESTED`'s missing-attribution case; `REQUIRED_NULL.APPROVED`
      -with-`published`-set; message-content assertions for the pair-consistency,
      required-set, and required-null error paths; the construction-time and
      transition-time defensive-copy fixes; the `createdAt`/`updatedAt` validity checks.
- [x] 13.5 Broadened the REJECTED attribution test to cover a non-null-but-pair-consistent
      combination in addition to all-null, plus a case confirming pair consistency still
      applies to REJECTED (a split pair still throws) — matches the spec's own wording,
      so no spec change was needed for this one.
- [x] 13.6 Fixed `IWorkflowRepository.test.ts`'s batched-lookup test to match the spec's
      own three-id, middle-missing shape (previously two ids with the second missing —
      a weaker shape that wouldn't catch an index-aligned or truncate-on-first-miss bug).
      Extracted a `makeInstance()` helper to avoid duplicating the 14-field props literal.
- [x] 13.7 Updated `design.md` (Decision 8's timing wording, Decision 2's post-review
      hardening paragraph, new Decision 9) and `specs/workflow-instance-entity/spec.md`
      (timestamp validity requirement + scenario, defensive-copy-on-construction
      requirement + two scenarios) to document round 3's behaviors as real requirements.
      `openspec validate ca-workflow-instance-entity --strict` passes.
- [x] 13.8 Re-ran gates 1-3 and the full gate sequence (4-10) against the round 3 diff —
      see section 14.
- [x] 13.9 Gate 8 fixes: added two missing construction-time defensive-copy tests
      (`createdAt`, `updatedAt` via `create()` directly — previously only `submittedAt`
      and a transition's shared `now` were covered); extracted a `cloneRequiredDate()`
      helper to remove duplication between the constructor and the `createdAt`/`updatedAt`
      getters; reordered `spec.md`'s prose to match `create()`'s actual check order
      (timestamp validity before cross-field consistency); documented (design.md Decision
      9 addendum + a new Risks/Trade-offs bullet) that the timestamp-validity check is
      scoped to `createdAt`/`updatedAt` only, not the four attribution `*At` fields —
      a real, not-yet-closed gap, flagged rather than silently widened beyond this
      round's scoped request.
- [x] 13.10 Mutation-testing gaps: 89.29% score (75 killed / 9 survived / 86 excluded),
      clearing the configured threshold. Of the 9 survivors, 7 were already-known
      equivalent mutants from round 2 (the `REJECTED` guard's redundant condition, the
      `publish()` backfill's unconstructable asymmetric state, the enum-list join
      separator). Two were real small gaps, both fixed: added
      `REVISION_REQUESTED`-with-`approved`-set and `REVISION_REQUESTED`-with-`published`
      -set tests (`REQUIRED_NULL.REVISION_REQUESTED` was untested for both pairs it
      forbids); added message-content assertions for the `createdAt`/`updatedAt`
      validity errors (previously `.toThrow(ValidationError)`-only).

## 14. Round 3 quality gates

- [x] 14.1 Gate 1 — `yarn vitest run` on all three touched test files — all green.
- [x] 14.2 Gate 2 — `yarn tsc` — zero TypeScript errors.
- [x] 14.3 Gate 3 — `npx prettier --check` on all touched files — clean (previewed
      `--write` on copies of the two new/changed test files first, diff was pure
      formatting, then applied to the real files).
- [x] 14.4 Gate 4 — Anti-pattern review against `.github/skills/anti-pattern-check/SKILL.md`
      — no P0 hits; no `any`, no non-null assertions; DB/auth/tenancy/NestJS checklist
      items confirmed N/A (pure domain-tier change, same as prior rounds).
- [x] 14.5 Gate 5 — SOLID review (`solid-reviewer`): no SRP/DIP violations in round 3's
      changes; prior rounds' accepted trade-offs (private `transition()` helper, no
      `reject()`, no `tenantId` on the port) reconfirmed sound, not re-flagged. One
      optional suggestion (document that the constructor assumes already-validated Dates)
      applied as a one-line comment.
- [x] 14.6 Gate 6 — Documentation review: comments stay single-line and WHY-focused;
      comment count still well under code-line count.
- [x] 14.7 Gate 7 — Project conventions review: still N/A for `.server.ts` suffix,
      `authLoaderWithPerm`, `countryAccountsId`, `yarn dbsync` (no DB/auth/loader code in
      this change); new infrastructure test file correctly picked up by `yarn vitest`.
- [x] 14.8 Gate 8 — Code review (`.github/skills/code-review/SKILL.md`, fresh subagent,
      high effort) against the round 3 diff. Two real findings (both fixed, see 13.9):
      missing construction-time defensive-copy test for `createdAt`/`updatedAt`, and the
      timestamp-validity check's scope not covering the four attribution timestamps
      (documented as a known limitation rather than silently expanded). Two nitpicks
      fixed: `cloneDate`/`cloneRequiredDate` duplication, spec.md prose ordering.
- [x] 14.9 Gate 9 — Visual/UX parity review: not applicable — this change touches no
      `app/domains/*/presentation/` file and renders no route (same as prior rounds).
- [x] 14.10 Gate 10 — Independent second-opinion review (fresh subagent, high effort)
      against the round 3 diff. One real test gap fixed: the `instanceof Date` disjunct
      of the timestamp-validity check was only exercised via its `NaN`-time branch, never
      via a genuinely non-`Date` value — added `createdAt`/`updatedAt`-is-not-a-Date-at-all
      tests. Two findings documented (not fixed) as known limitations in design.md's
      Risks/Trade-offs, consistent with how the Gate 8 scope question was handled:
      `transition()`'s caller-supplied `now` is never validated (would contradict
      `transition()`'s own existing "bypasses create()'s validation by design" decision —
      needs an explicit user decision, not a silent addition); and
      `IWorkflowRepository.save()`'s return-value contract (same object vs. fresh
      reconstitution) is unpinned, deferred to the Phase 4a/5a adapter proposal. Three
      minor/nitpick findings (no empty-string validation on id fields, `publish()`'s
      OR-condition not itself defensive, `instanceof Date` realm-sensitivity) accepted
      with no action, consistent with prior rounds' treatment of similarly low-value
      findings.
- [x] 14.11 Domain test-quality audit — `test-quality-auditor` (Stryker), scoped to
      `WorkflowInstance.ts` against both `WorkflowInstance.test.ts` and the relocated
      `workflowInstanceTable.test.ts`. 89.29% mutation score (75 killed / 9 survived / 86
      excluded), clearing the configured threshold. Two real gaps found and fixed (see
      13.10); the remaining 7 survivors are already-known equivalent mutants from round 2
      re-confirmed, not new gaps.
- [x] 14.12 Regression check — confirmed no concurrent Stryker/vitest processes and an
      empty `.stryker-tmp/`, then ran `yarn test:run2` twice: once on the true baseline
      (this branch's HEAD is identical to `feature/he-ca-phase3`'s, so all round 3 changes
      were stashed via `git stash push -u` to get a clean baseline, then restored via
      `git stash pop` immediately after each run — verified via `git status`/`wc -l` that
      nothing was lost). Baseline: 3 failed / 730 passed (733), 78 files
      (`HttpServerBootstrap.test.ts` timeout, `entityValidationAssignmentRepository.test.ts`
      assertion mismatch, `NoticesController.test.ts` hook timeout — none touch
      `validation-workflow`). Post-change: 2 failed / 823 passed (825), 81 files (3 new
      files from this change) — `entityValidationAssignmentRepository.test.ts` (same
      pre-existing failure) and a new one, `hazardousEventDisasterEventBoundary.test.ts`
      (a 5000ms test timeout, seeding 201 rows sequentially). Verified this wasn't a real
      regression by re-running that single test file against the clean baseline (stashed
      again,
      restored after): 6/6 passed in 53.95s with no timeout, versus a much slower overall
      run when it failed — confirms environmental timing variance (this change touches
      zero files this HE/DE-domain test depends on), not a regression. No regression
      introduced by this change.

## 16. Round 4 fixes (two user-approved gaps from round 3's Risks section)

- [x] 16.1 Extended `create()`'s Date-validity check (design.md Decision 9) to the four
      nullable attribution timestamps (`submittedAt`/`validatedAt`/`approvedAt`/
      `publishedAt`, each checked only when non-null), reusing the existing
      `PAIR_NAMES`/`pairFields` infrastructure and a new shared `isInvalidDate()` predicate
      extracted from the previously-duplicated `createdAt`/`updatedAt` checks. Placed as its
      own loop after `createdAt`/`updatedAt`'s checks and before Decision 7's
      pair-consistency loop, so an invalid `*At` is always reported as a Date-validity
      error, not misreported as a pair-split error.
- [x] 16.2 Added `transition()`'s own `now` validity check (design.md Decision 5 addendum),
      using the same `isInvalidDate()` predicate, at the one choke point all five public
      transition methods call through. Throws `ValidationError` (not `ConflictError`) and
      runs before the `allowedFrom` status guard — malformed input takes priority over a
      state-conflict report, pinned by a test.
- [x] 16.3 Added 7 new tests: `it.each` over the four attribution pairs for the NaN-time
      case (with message assertions), one not-a-Date-instance case, and two tests for
      `transition()`'s `now` validation (invalid `now` from a legal status; invalid `now`
      from a disallowed status, pinning that `ValidationError` wins over `ConflictError`).
      Confirmed Red (all 7 failed for the expected reason, including the ordering test
      catching a `ConflictError` where a `ValidationError` was expected) by temporarily
      reverting the two implementation changes, then confirmed Green after restoring them.
- [x] 16.4 Updated `design.md`: Decision 9 rewritten to describe the expanded scope (all six
      `Date`-typed fields, shared `isInvalidDate` predicate) and its former "known scope
      limitation" paragraph removed (resolved, not just documented); Decision 5 given a
      round 4 addendum documenting `transition()`'s `now` check and its ordering relative to
      the `allowedFrom` guard; Decision 2 given a short round 4 note that no invalid Date can
      now reach the private constructor through the public API; both now-resolved Risk
      bullets (attribution timestamp validity gap, `transition()`'s unvalidated `now`)
      removed from Risks/Trade-offs.
- [x] 16.5 Updated `specs/workflow-instance-entity/spec.md`: widened the timestamp-validity
      requirement's text to cover the four attribution timestamps (not just a new scenario
      appended), added its failure scenario; added a new requirement "Transition methods
      validate the caller-supplied now" with two scenarios (invalid `now` throws
      `ValidationError`; invalid `now` takes priority over a status conflict).
- [x] 16.6 Ran `openspec validate ca-workflow-instance-entity --strict` — passes.

## 17. Round 4 quality gates

- [x] 17.1 Gate 1 — `yarn vitest run app/domains/validation-workflow/domain/WorkflowInstance.test.ts` — 95/95 green.
- [x] 17.2 Gate 2 — `yarn tsc` — zero TypeScript errors.
- [x] 17.3 Gate 3 — `npx prettier --check` on both touched files — clean.
- [x] 17.4 Gate 4 — Anti-pattern review — no P0 hits; no `any`, no non-null assertions,
      no swallowed errors; DB/auth/tenancy/NestJS checklist items still N/A.
- [x] 17.5 Gate 5 — SOLID review (`solid-reviewer` agent), run against round 4's three
      changes specifically (the `isInvalidDate` extraction, the attribution-timestamp
      validity loop in `create()`, `transition()`'s `now` check). No new SRP or DIP
      violations: `isInvalidDate` is a single, correctly-extracted shared predicate reused
      by three call sites rather than duplicated; the new loop in `create()` and the new
      guard in `transition()` both fall under each method's existing "validate all
      preconditions" responsibility, not a new one. No new coupling — `now`/the four
      attribution fields were already typed `Date` before round 4; nothing new depends on
      Date internals beyond what Decision 5 already committed to.
- [x] 17.6 Gate 6 — Documentation review — comments stay single-purpose and WHY-focused.
- [x] 17.7 Gate 7 — Project conventions review — still N/A for `.server.ts`/auth/tenancy/
      migrations; test file conventions unchanged.
- [x] 17.8 Gate 8 — Code review (`.github/skills/code-review/SKILL.md`, fresh subagent,
      high effort) against the round 4 diff. One real gap found and fixed: the
      Date-validity-before-pair-consistency ordering claim (design.md Decision 9) was
      documented but not pinned by a test — every round 4 attribution-timestamp test kept
      `ByUserId` set, so the only input shape where the two `PAIR_NAMES` loops could
      disagree (`ByUserId: null` + invalid `At`) was never exercised. Added 4 new
      `it.each` tests (one per pair) asserting the Date-validity message wins; verified by
      temporarily swapping the two loops and confirming all 4 fail for the right reason,
      then restoring and confirming green. Added a matching spec.md scenario. One doc
      drift fixed: the private constructor's comment still named only
      `createdAt`/`updatedAt` — reworded to cover all six Date-typed fields plus `now`
      (matches design.md Decision 2's round 4 note). One nitpick fixed: the
      not-a-Date-instance test covered only `submittedAt`; converted to `it.each` across
      all four pairs for symmetry with the NaN-time test and round 3's own precedent. One
      nitpick accepted with no action (now-validity tested only via `submit()`, not the
      other four methods — reasonable given `transition()` is the single shared choke
      point).
- [x] 17.9 Gate 9 — Visual/UX parity review — not applicable (no `presentation/` file, no
      route touched).
- [x] 17.10 Gate 10 — Independent second-opinion review (generic code review, fresh
      subagent, high effort, deliberately not using the DELTA-specific Gate 8 checklist)
      against the round 4 diff. No real bug found. Two real-but-minor gaps fixed (see
      section 18): a missing "now is not a Date instance at all" test (round 4's own
      not-a-Date-instance pattern for the four attribution fields was never extended to
      `now`), and `isInvalidDate`'s parameter widened from `Date` to `unknown` so its
      `instanceof` disjunct can't later be "simplified away" as unreachable. One real
      architectural question raised but deliberately NOT fixed, since fixing it would
      contradict/refine a design.md decision without the user's explicit sign-off: whether
      `transition()`'s invalid-`now` check should throw an operational `ValidationError`
      (current, catchable, 422) or be treated as a programmer error per `DomainError`'s own
      ADR-003 distinction, given `now` is a service-supplied clock value, not user input.
      Documented as a new Risk in design.md rather than silently resolved — see section 18.
      Remaining findings (message wording tied to the same open question; several
      "considered, not a problem" items — cross-realm `instanceof` fragility, per-method
      `now` test coverage, the two-loop ordering in `create()`) required no action.
- [x] 17.11 Domain test-quality audit — `test-quality-auditor` (Stryker), scoped to
      `WorkflowInstance.ts` (test scope: `WorkflowInstance.test.ts` +
      `workflowInstanceTable.test.ts`, per round 3's configuration). 92.31% mutation score
      (83 killed / 1 timeout / 7 survived / 92 excluded), clearing both the configured
      `break` (75) and `high` (90) thresholds — an improvement over round 3's 89.29%. All
      three pieces of round 4's new logic (both `isInvalidDate` disjuncts, the
      `PAIR_NAMES` loop's `at !== null` guard, `transition()`'s new check) were fully
      killed. One real gap found and fixed: the `now`-validity `ValidationError`'s message
      string (`WorkflowInstance.ts:199`, `"now must be a valid Date"`) had no
      message-content assertion — added one, breaking the pattern the rest of the file
      otherwise followed consistently (every other Date-validity branch already had a
      message-content test). The remaining 6 survivors are the same already-known
      equivalent mutants re-confirmed from round 3 (enum-list join separator, the
      `REJECTED` guard's no-op branch, `publish()`'s backfill OR/AND swap — all
      unconstructable given `create()`'s own invariants).
- [x] 17.12 Regression check — confirmed no concurrent Stryker/vitest processes (checked
      via `Get-CimInstance Win32_Process`; only an unrelated MCP server and a Playwright
      test-server were running) and an empty `.stryker-tmp/`, then ran `yarn test:run2`
      (logged to `/tmp/round4_test_run2.log`). Result: 1 failed / 839 passed (840), 81
      files — the one failure is `entityValidationAssignmentRepository.test.ts`
      (`model delete removes both legacy and new discriminators`), the same pre-existing
      failure round 3 already recorded in its own baseline (14.12). Round 3's other
      recorded post-change failure (`hazardousEventDisasterEventBoundary.test.ts`, a
      characterized timing-variance timeout) did not recur this run. Failure set is a
      subset of round 3's recorded post-change set, not a new one — no re-baseline needed
      per the "only re-baseline if the failure set differs" rule. No regression
      introduced by round 4.

## 18. Round 5 fixes (Gate 5 + Gate 10, run separately after round 4 was reported done in error — 17.5/17.10 had been left unchecked)

- [x] 18.1 Added the missing "now is not a Date instance at all" test to
      `WorkflowInstance.test.ts` (Gate 10 finding): round 4's not-a-Date-instance pattern
      was applied to all four attribution fields but never extended to `transition()`'s
      `now`, so only its NaN-time disjunct was exercised. Placed alongside the existing
      `now`-validity tests, matching their style.
- [x] 18.2 Widened `isInvalidDate`'s parameter from `Date` to `unknown` (Gate 10 finding):
      typing it `Date` invites a future "the `instanceof` branch is unreachable, TS already
      guarantees this" simplification that would silently delete the exact defense the
      function exists to provide (every call site's static type already claims `Date` —
      that claim is precisely what this guard distrusts). No behavior change; comment
      updated to explain why.
- [x] 18.3 Documented, but deliberately did NOT fix, a real architectural question from Gate
      10: `transition()`'s invalid-`now` check throws `ValidationError` (an operational,
      catchable `DomainError`) for what is arguably a programmer error under
      `DomainError`'s own ADR-003 distinction, since `now` is a service-supplied clock
      value, never user input (Decision 5). Fixing this would mean either changing the
      thrown error type or the message wording — both would contradict/refine an existing
      design.md decision (Decision 5's round 4 addendum), which requires the user's
      explicit sign-off per this project's design-deviation guardrail, not a silent change.
      Added as a new Risk in `design.md`'s Risks/Trade-offs section instead. Zero impact
      today — no production caller of `transition()` exists yet.
- [x] 18.4 Re-ran gates 1–3 against the round 5 fix:
      `yarn vitest run app/domains/validation-workflow/domain/WorkflowInstance.test.ts`
      — 104/104 green (was 103, +1 new test); `yarn tsc` — zero errors; `npx prettier --check` on
      `WorkflowInstance.ts`, `WorkflowInstance.test.ts`, and `design.md` — clean (previewed
      `--write` on copies of all three first per convention; no diff, so no reformatting
      was needed).
- [x] 18.5 Regression check — confirmed no concurrent Stryker process (empty
      `.stryker-tmp/`) and no other vitest run in progress, then ran `yarn test:run2`
      (logged to `/tmp/round5_test_run2.log`). Result: 1 failed / 840 passed (841), 81
      files — the one failure is `entityValidationAssignmentRepository.test.ts`
      (`model delete removes both legacy and new discriminators`), the same pre-existing
      failure round 4 recorded (17.12) and round 3 before it (14.12). Same failure set as
      round 4's post-change run — no re-baseline needed per the "only re-baseline if the
      failure set differs" rule. No regression introduced by round 5's fix.

## 19. Round 6 — deduplicate ENTITY_TYPE_VALUES/STATUS_VALUES (user-raised, researched, approved)

- [x] 19.1 Confirmed via a repo-wide grep that `workflowInstanceTable.ts` and
      `workflowHistoryTable.ts` are the only two consumers of these two arrays outside
      `WorkflowInstance.ts` itself.
- [x] 19.2 `WorkflowInstance.ts` is now the sole definition; its two comments updated to
      describe it as canonical, not "mirrored."
- [x] 19.3 `workflowInstanceTable.ts` imports `ENTITY_TYPE_VALUES`/`STATUS_VALUES` from
      `../domain/WorkflowInstance` instead of declaring its own copies.
- [x] 19.4 `workflowHistoryTable.ts` imports `STATUS_VALUES` from `../domain/WorkflowInstance`
      directly (previously re-imported it from `workflowInstanceTable.ts`); its unrelated
      imports (`sqlValueList`, `workflowInstanceTable` for the FK) are unchanged.
- [x] 19.5 Deleted `workflowInstanceTable.test.ts` (the round-3 drift-guard test) — drift is
      now structurally impossible with one definition, so there is nothing left for it to
      catch. `design.md` Decision 9 updated to record the round-3 test's relocation as
      superseded, not silently erased from the record.
- [x] 19.6 Verification: `yarn vitest run app/domains/validation-workflow/` — 106/106 green
      (108 minus the 2 deleted drift-guard tests); `yarn tsc` — zero errors;
      `npx prettier --check` on all five touched/added files — clean;
      `openspec validate ca-workflow-instance-entity --strict` — passes.
- [x] 19.7 Regression check — confirmed no concurrent Stryker process (empty
      `.stryker-tmp/`), then ran `yarn test:run2` (logged to `/tmp/round6_test_run2.log`).
      Result: 2 failed / 837 passed (839), 80 files —
      `entityValidationAssignmentRepository.test.ts` (the same pre-existing failure every
      prior round recorded) and `HttpServerBootstrap.test.ts`'s `NestFactory.create` test (a
      17s timeout under full-suite load). The latter is new to this specific run but not new
      to this change: round 3's own clean baseline (14.12) already recorded this exact test
      as pre-existing/timing-flaky. Verified, not assumed — re-ran
      `HttpServerBootstrap.test.ts` alone: 10/10 passed in 4.67s, confirming a timing/
      resource-contention artifact of full-suite load, unrelated to this change (which
      touches only `validation-workflow` domain/infrastructure files). No regression
      introduced by round 6.

## 15. Regression and archive

- [x] 15.1 Run `opsx:archive` on this branch (`feature/ca-workflow-instance-entity`) before raising the PR. The PR targets `feature/he-ca-phase3` (the Phase 3 integration branch), not `dev` — per this change's own branch context, not a decision made by this task list.
