## 1. Red — Failing Tests First

- [x] 1.1 Create `app/domains/hazardous-events/domain/SpatialObservation.test.ts` with tests for
      every scenario in `specs/hazardous-event-spatial-observation/spec.md`: valid props construct
      successfully; missing `id`/`hazardousEventId` rejected; non-`Date`/`NaN`-time
      `observationTime`/`createdAt`/`updatedAt` rejected as `ValidationError` (not a raw
      `TypeError`); non-array `geometries`/`divisionIds` rejected as `ValidationError` before any
      array-element check (added as 2.7/Decision 8 after a Gate 8 finding); repeated `divisionIds`
      rejected; a `divisionId` absent from `validDivisionIds`
      rejected, present accepted, empty `divisionIds` skips the check; `selectCurrent` picks
      latest by `observationTime` regardless of array order (including the backfilled-earlier-time
      inserted-last case), returns `null` for empty array, trivial single-element case;
      `assertNoConflictingObservationTime` allows `null` existing, rejects non-`null` existing
      without `confirmReplace`, allows non-`null` existing with `confirmReplace: true`. Verify:
      `yarn vitest run app/domains/hazardous-events/domain/SpatialObservation.test.ts` fails
      because `SpatialObservation.ts` does not exist yet (import error), not because of a typo or
      bad assertion.

## 2. Green — Minimum Implementation

- [x] 2.1 Create `app/domains/hazardous-events/domain/SpatialObservation.ts` per design.md
      Decision 1: export `SpatialObservationProps` interface and the private-constructor
      `SpatialObservation` class with a `create(props, validDivisionIds)` static factory and
      read-only getters for every prop, matching `HazardousEvent.ts`'s established shape. Verify:
      `yarn vitest run app/domains/hazardous-events/domain/SpatialObservation.test.ts` — the "valid
      props construct successfully" test passes.
- [x] 2.2 Implement Decision 2's required-field and Date-validity guards in `create()`: `id`/
      `hazardousEventId` through the `typeof !== "string" || .trim().length === 0` loop; local
      `isInvalidDate` predicate applied to `observationTime`/`createdAt`/`updatedAt` before any
      other check. Verify: the missing-`id`/`hazardousEventId` and invalid-`observationTime`/
      `createdAt`/`updatedAt` tests from 1.1 pass, with `ValidationError` thrown, never a raw
      `TypeError`.
- [x] 2.3 Implement Decision 3's duplicate-`divisionIds` check (`new Set(...).size !==
      .length` → `ValidationError`), checked before Decision 4's membership check. Verify: the
      repeated-`divisionId` test from 1.1 passes.
- [x] 2.4 Implement Decision 4's `validDivisionIds` membership check (mandatory parameter, no
      default; `ValidationError` naming the first offending id). Verify: the
      absent-from-`validDivisionIds`, present-in-`validDivisionIds`, and empty-`divisionIds` tests
      from 1.1 pass.
- [x] 2.5 Implement Decision 5's `selectCurrent(observations)` static method (single pass over the
      array, compare `observationTime.getTime()`, keep first-seen on an exact tie, `null` for
      empty array). Verify: all four `selectCurrent` tests from 1.1 pass, including the
      backfilled-earlier-time-inserted-last case.
- [x] 2.6 Implement Decision 6's `assertNoConflictingObservationTime(existingAtSameTime,
      confirmReplace)` static method (`ConflictError` iff `existingAtSameTime !== null &&
      !confirmReplace`). Verify: all three `assertNoConflictingObservationTime` tests from 1.1
      pass.
- [x] 2.7 Implement Decision 8's `Array.isArray` guards for `geometries`/`divisionIds`, added
      after a Gate 8 code review of the already-implemented entity found the gap (no shape check
      on the two array-typed props, unlike every scalar field). Runs immediately after the Date
      guards, before Decision 3's duplicate-value check and the constructor's array-copying.
      Verify: the new `geometries`/`divisionIds` array-shape tests in
      `SpatialObservation.test.ts` pass, including the ordering tests proving the array-shape
      check fires before both the duplicate-value check and the id/hazardousEventId string loop.

## 3. Refactor — Quality Gates

- [x] 3.1 Gate 1: `yarn vitest run app/domains/hazardous-events/domain/SpatialObservation.test.ts`
      — all tests green.
- [x] 3.2 Gate 2: `yarn tsc` — zero TypeScript errors.
- [x] 3.3 Gate 3: `yarn format:check` on the two new files — Prettier clean (`yarn format` scoped
      to these two files if not).
- [x] 3.4 Gate 4: Anti-pattern review against `.github/skills/anti-pattern-check/SKILL.md` —
      confirm no listed anti-pattern is reproduced (e.g. no `as any`, no silent fail-open on a
      missing `validDivisionIds` entry, no shared-state leakage between `selectCurrent` calls).
- [x] 3.5 Gate 5: SOLID review — invoke `solid-reviewer` agent on `SpatialObservation.ts`, focused
      on SRP (entity shape validation vs. the two cross-observation static rules stay clearly
      separated per design.md Decision 1's own "alternative considered" reasoning) and DIP (no
      DB/framework dependency leaking in, `validDivisionIds` stays an opaque injected set).
- [x] 3.6 Gate 6: Documentation review — comments explain WHY (e.g. why `id`/`hazardousEventId`
      join the required-field loop but `note` doesn't, why the conflict check is a separate static
      method rather than folded into `create()`, why `selectCurrent`'s tie-break is defensive
      rather than expected) not WHAT; one full-diff sweep over both files by a fresh subagent
      immediately before the final report, not just this round's delta.
- [x] 3.7 Gate 7: Project conventions review against `.github/copilot-instructions.md`.
- [x] 3.8 Gate 8: Code review — run `.github/skills/code-review/SKILL.md` in full, via a fresh
      subagent. Resolve findings.
- [x] 3.9 Gate 9: Visual/UX parity review — **N/A, no presentation-layer or route file touched by
      this change**; mark N/A with this reason rather than skipping silently.
- [x] 3.10 Gate 10: Independent second-opinion review — Claude Code's built-in `code-review` at
      `high` effort, via a second, separate fresh subagent. Resolve findings before proceeding.
- [x] 3.11 Test-quality check (mandatory — this change adds a file under
      `app/domains/hazardous-events/domain/`): invoke `test-quality-auditor` scoped to
      `SpatialObservation.ts`, e.g.
      `yarn mutation -- --mutate "app/domains/hazardous-events/domain/SpatialObservation.ts"`.
      Resolve any real gap the mutation report surfaces (e.g. a surviving mutant on the
      `confirmReplace` boolean branch, the tie-break comparison operator in `selectCurrent`, or the
      duplicate-`divisionIds`/membership-check boundary conditions) — check any "low-value,
      message-only" classification against `HazardousEvent.test.ts`'s own established convention
      (asserts message content via regex, not just error type) before dismissing a survivor,
      per `3c`'s own round-2 correction.

## 4. Regression and Archive

- [x] 4.1 `yarn test:run2` (full PGlite suite) passes with no new failures. Any pre-existing
      failure is confirmed pre-existing by running the same suite on the pre-change branch tip
      first, not assumed.
- [x] 4.2 Confirmed with the human reviewer: PR targets `feature/he-ca-phase3` (the Phase 3
      integration branch), matching `3a`/`3b`/`3c`'s precedent.
- [x] 4.3 Run `opsx:archive` on this branch (`feature/ca-he-spatial-observation-entity`) before
      raising the PR — merges the delta spec into
      `openspec/specs/hazardous-event-spatial-observation/` and moves this change folder to
      `openspec/changes/archive/`.
