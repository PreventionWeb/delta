Execution order below follows design.md Decision 2 (dependency-driven: Group 4
is a leaf that Groups 1 and 3 import from), not the proposal's narrative
1/2/3/4 numbering. Group 2 is fully independent and placed last only for
convenience.

## 1. Group 4 -- `formDataMappers.ts` (mapTempActionToWorkflowAction + deriveRecordDate)

- [x] 1.1 Create `app/domains/hazardous-events/presentation/web/formDataMappers.ts`
      containing `mapTempActionToWorkflowAction`/`MappedWorkflowAction` and
      `deriveRecordDate`, moved verbatim (no logic change) from
      `mapTempActionToWorkflowAction.ts` and `deriveRecordDate.ts`. Create
      `formDataMappers.test.ts` by merging the two existing test files'
      cases verbatim. Verify: `yarn vitest run app/domains/hazardous-events/presentation/web/formDataMappers.test.ts`
      passes with a test count >= the sum of the two pre-merge test files.
- [x] 1.2 Update the internal imports in `requireWorkflowActionAuthorized.server.ts`,
      `requireValidValidatorIds.server.ts`, and `composeWorkflowAction.server.ts`
      (still standalone files at this point) from `./mapTempActionToWorkflowAction`
      / `./deriveRecordDate` to `./formDataMappers`. Verify: `yarn tsc` reports
      zero errors.
- [x] 1.3 Delete `mapTempActionToWorkflowAction.ts`, `mapTempActionToWorkflowAction.test.ts`,
      `deriveRecordDate.ts`, `deriveRecordDate.test.ts`. Verify:
      `yarn vitest run app/domains/hazardous-events/presentation/web/formDataMappers.test.ts`
      still passes and `yarn tsc` still reports zero errors.

## 2. Group 1 -- `requestAuthorizationGuards.server.ts`

- [x] 2.1 Write the new test for `requireValidValidatorIds` (it has no prior
      test) covering: a no-op return (`[]`) for every `mappedAction` other
      than `"submit-validation"` -- asserting `getValidCandidateIds` is NOT
      called in that case, per the function's own "no-op (no DB call) for
      every other mapped action" doc comment; filtering
      `parsed.validatorUserIds` down to only ids present in
      `getValidCandidateIds()`'s result for `"submit-validation"`; and, when
      the filtered list is empty, a thrown `Response` with `status: 422`
      (`throwHazardousEventLoaderError` converts the `ValidationError` it is
      given into a `Response.json(...)` throw -- assert on the caught
      `Response`'s status, matching the pattern
      `requireWorkflowActionAuthorized.server.test.ts`'s own "throws
      ValidationError (422) for submit-validation with an empty validator
      list" test already uses, not on a raw `ValidationError` instance).
      Verify: `yarn vitest run` on a temporary
      standalone test file passes against the current
      `requireValidValidatorIds.server.ts`.
- [x] 2.2 Create `app/domains/hazardous-events/presentation/web/requestAuthorizationGuards.server.ts`
      containing `requireEditDataPermission`, `requireStatusAwareEditPermission`,
      `requireWorkflowActionAuthorized`, and `requireValidValidatorIds`, moved
      verbatim (no logic change). `requireStatusAwareEditPermission` keeps
      importing `isStatusAwareEditBlocked` from its unchanged, standalone
      `./isStatusAwareEditBlocked` path (design.md Decision 1 -- do NOT move
      or rename that file). Create `requestAuthorizationGuards.server.test.ts`
      by merging the 3 existing test files' cases verbatim plus the new
      `requireValidValidatorIds` test from 2.1. Verify:
      `yarn vitest run app/domains/hazardous-events/presentation/web/requestAuthorizationGuards.server.test.ts`
      passes with a test count >= the sum of the 3 pre-merge test files' counts
      (+ the new test cases from 2.1).
- [x] 2.3 Update every call site's import path from the 4 old files to
      `requestAuthorizationGuards.server`:
      `app/routes/$lang+/_authenticated+/he-preview+/edit.$id.tsx`,
      `app/routes/$lang+/_authenticated+/he-preview+/new.tsx`,
      `app/routes/$lang+/_authenticated+/he-preview+/picker.tsx` (only
      `requireEditDataPermission`), and the one narrow exception,
      `app/domains/validation-workflow/application/isWorkflowActionAuthorized.test.ts`
      line 13 (import-path-only edit, design.md Decision 4.1). Verify:
      `yarn tsc` reports zero errors.
- [x] 2.4 Delete `requireEditDataPermission.server.ts` (+test),
      `requireStatusAwareEditPermission.server.ts` (+test),
      `requireWorkflowActionAuthorized.server.ts` (+test),
      `requireValidValidatorIds.server.ts`. Verify:
      `yarn vitest run app/domains/hazardous-events/presentation/web/requestAuthorizationGuards.server.test.ts`
      and
      `yarn vitest run app/domains/validation-workflow/application/isWorkflowActionAuthorized.test.ts`
      both pass; `yarn tsc` still reports zero errors. **Contingency**: if
      `isWorkflowActionAuthorized.test.ts` fails at import (not at an
      assertion), design.md Decision 4.1's side-effect analysis was wrong --
      stop and ask before adding a `vi.mock` to this application-layer file,
      rather than silently widening the approved one-line exception.
- [x] 2.5 Coordinator-approved, one-line prose fix (design.md Decision 4.2):
      update the comment at
      `app/domains/validation-workflow/application/isWorkflowActionAuthorized.ts`
      line 14, which names the old `requireWorkflowActionAuthorized.server.ts`
      filename, to name `requireWorkflowActionAuthorized` (now in
      `requestAuthorizationGuards.server.ts`) instead. No code/behavior
      change. Verify: `npx prettier --check` on that one file; `yarn tsc`
      still reports zero errors.
- [x] 2.6 Invoke `test-quality-auditor`, scoped to
      `app/domains/hazardous-events/presentation/web/requestAuthorizationGuards.server.ts`'s
      `requireValidValidatorIds` function only (coordinator-approved,
      same reasoning as Group 3's step 3.5: the test written in 2.1 is
      brand-new coverage for previously-zero-coverage logic, not a
      lift-and-shift). No known-equivalent-mutant pair was identified in
      `requireValidValidatorIds`'s own logic (single linear path: an
      early no-op return, a filter, and one empty-list throw -- unlike
      `composeWorkflowAction`'s two byte-identical branches) -- if the
      auditor finds one anyway, note it in design.md rather than assuming
      none exists. Resolve any real gap found by strengthening the test
      from 2.1, not by weakening the production code.

## 3. Group 3 -- `composeWorkflowAction.server.ts` (+ buildWorkflowComposerCallbacks merge, new test coverage)

- [x] 3.1 (RED) Write `composeWorkflowAction.server.test.ts` against the
      current, still-split `composeWorkflowAction.server.ts` and
      `buildWorkflowComposerCallbacks.server.ts`, per design.md Decision 5:
      `vi.mock("~/init.server")` for `getAppContext()` with fake
      `GetHazardousEventByIdUseCase`/`FindValidatorCandidatesUseCase`; a fake
      `ProcessWorkflowActionUseCase` passed directly as a constructor arg; and
      `vi.mock` for `getPinoLogger()`. Cover: `mappedAction: null` ->
      `{ attempted: false }` with no use-case or callback call;
      `getRecordDisplayName` called only for `submit-validation`; the
      `recordDate` derivation (both branches of `deriveRecordDate`); the
      `outcome: "succeeded"` and `outcome: "failed"` paths (the latter
      asserting the `warn` log call); a `getRecordDisplayName` rejection
      propagating uncaught, with `execute` never called; the exact
      `execute` command shape per mapped action (per spec.md's "command
      shape" requirement -- `validatorUserIds`/`recordDisplayName` only for
      `submit-validation`, `actingUserRole` only for the others); and
      `buildWorkflowComposerCallbacks`'s full display-name fallback chain
      (all 3 precedence levels plus the all-empty case), its re-fetch-per-call/
      tenantId-threading contract with `GetHazardousEventByIdUseCase`, and
      its delegation of the `excludingUserId` exclusion to
      `FindValidatorCandidatesUseCase.execute` rather than a local filter.
      Note the equivalent-mutant branches design.md Decision 5 already
      declares (the `direct-validate`/`direct-publish` and catch-all `else`
      branches are byte-identical) so task 3.5 doesn't loop on them. Verify:
      `yarn vitest run app/domains/hazardous-events/presentation/web/composeWorkflowAction.server.test.ts`
      passes against the current split files (this is characterization
      coverage of already-shipped behavior, not a bug-fixing Red step --
      expected to pass on first run per design.md Decision 5).
- [x] 3.2 (GREEN) Merge `buildWorkflowComposerCallbacks.server.ts`'s contents
      into `composeWorkflowAction.server.ts` (which keeps its name), update
      its internal imports to `./formDataMappers` for
      `MappedWorkflowAction`/`deriveRecordDate` (already done for
      `composeWorkflowAction.server.ts` in task 1.2 -- confirm
      `buildWorkflowComposerCallbacks.server.ts` had no cross-group imports
      needing a change). Update `composeWorkflowAction.server.test.ts`'s own
      import of `buildWorkflowComposerCallbacks` (written in 3.1 against
      `./buildWorkflowComposerCallbacks.server`) to import it from
      `./composeWorkflowAction.server` instead -- otherwise task 3.4's
      deletion breaks this test. Verify:
      `yarn vitest run app/domains/hazardous-events/presentation/web/composeWorkflowAction.server.test.ts`
      still passes.
- [x] 3.3 Update the call sites' import path for `buildWorkflowComposerCallbacks`
      in `app/routes/$lang+/_authenticated+/he-preview+/edit.$id.tsx` and
      `app/routes/$lang+/_authenticated+/he-preview+/new.tsx` to import it
      from `~/domains/hazardous-events/presentation/web/composeWorkflowAction.server`
      instead of `~/domains/hazardous-events/presentation/web/buildWorkflowComposerCallbacks.server`
      (the `composeWorkflowAction` import in those files already points at
      the right, unchanged path). Verify: `yarn tsc` reports zero errors.
- [x] 3.4 Delete `buildWorkflowComposerCallbacks.server.ts`. Verify:
      `yarn vitest run app/domains/hazardous-events/presentation/web/composeWorkflowAction.server.test.ts`
      still passes; `yarn tsc` still reports zero errors.
- [x] 3.5 (REFACTOR) Invoke `test-quality-auditor`, scoped to
      `app/domains/hazardous-events/presentation/web/composeWorkflowAction.server.ts`
      only (per explicit coordinator direction -- Groups 1/2/4 skip mutation
      testing entirely as pure lift-and-shift; Group 3 is the one place with
      brand-new test coverage that needs a mutation-testing check). Resolve
      any real gap the auditor finds by strengthening the test added in 3.1,
      not by weakening the production code. If Stryker hits DEF-041, note it
      in design.md rather than registering a new deferred-items entry (per
      standing project convention).

## 4. Group 2 -- `extractFormFieldErrors.ts` (independent of Groups 1/3/4)

- [x] 4.1 Create `app/domains/hazardous-events/presentation/web/extractFormFieldErrors.ts`
      containing `extractFieldError` and `extractCauseConflictError`, moved
      verbatim (no logic change) from `extractFieldError.ts` and
      `extractCauseConflictError.ts`. Create `extractFormFieldErrors.test.ts`
      by merging the two existing test files' cases verbatim. Verify:
      `yarn vitest run app/domains/hazardous-events/presentation/web/extractFormFieldErrors.test.ts`
      passes with a test count >= the sum of the two pre-merge test files.
- [x] 4.2 Update the import paths for `extractFieldError` and
      `extractCauseConflictError` in
      `app/routes/$lang+/_authenticated+/he-preview+/edit.$id.tsx` and
      `app/routes/$lang+/_authenticated+/he-preview+/new.tsx` to
      `~/domains/hazardous-events/presentation/web/extractFormFieldErrors`.
      Verify: `yarn tsc` reports zero errors.
- [x] 4.3 Delete `extractFieldError.ts` (+test), `extractCauseConflictError.ts`
      (+test). Verify:
      `yarn vitest run app/domains/hazardous-events/presentation/web/extractFormFieldErrors.test.ts`
      still passes; `yarn tsc` still reports zero errors.

## 5. Quality gates

- [x] 5.1 Gate 1 -- `yarn vitest run` on all 4 new/consolidated test files
      (`formDataMappers.test.ts`, `requestAuthorizationGuards.server.test.ts`,
      `composeWorkflowAction.server.test.ts`, `extractFormFieldErrors.test.ts`)
      plus `isWorkflowActionAuthorized.test.ts` and the two HE route
      integration tests (`HazardousEventEditRoute.test.ts`,
      `HazardousEventNewRoute.test.ts`) -- all green.
- [x] 5.2 Gate 2 -- `yarn tsc` reports zero TypeScript errors.
- [x] 5.3 Gate 3 -- `npx prettier --check` scoped to every file this change
      touched (the 4 new files + their tests, the 2 route files, `picker.tsx`,
      and `isWorkflowActionAuthorized.test.ts`) -- do NOT run repo-wide
      `yarn format:check`/`yarn format`.
- [x] 5.4 Gate 4 -- Anti-pattern review against
      `.github/skills/anti-pattern-check/SKILL.md`.
- [x] 5.5 Gate 5 -- SOLID review via the `solid-reviewer` agent.
- [x] 5.6 Gate 6 -- Documentation review (comments explain WHY not WHAT,
      compacted without losing meaning; one full-diff sweep, not just each
      round's delta), via a fresh subagent.
- [x] 5.7 Gate 7 -- Project-conventions review against
      `.github/copilot-instructions.md`.
- [x] 5.8 Gate 8 -- Code review: run `.github/skills/code-review/SKILL.md` in
      full, via a fresh subagent.
- [x] 5.9 Gate 9 -- N/A, explicitly: no file under `app/routes/` or any
      `.tsx` component renders differently; only non-`.tsx` server/pure
      files moved. No reference-source checklist applies (design.md Goals).
- [x] 5.10 Gate 10 -- Independent second-opinion review: Claude Code's
      built-in `/code-review` at `high` effort, via a second, separate fresh
      subagent. Resolve findings before archiving.
- [x] 5.11 Regression gate -- `yarn test:run2` (full PGlite suite) passes
      with no new failures. Any pre-existing failure must be confirmed
      pre-existing by running the same suite on the base branch first and
      diffing the failure list -- not assumed.
- [x] 5.12 Superseded by task 6.7 below (this change gained a 4-item
      follow-up, section 6, before archiving) -- do not archive here; run
      `opsx:archive` only after section 6 is complete.

## 6. Gate-review follow-up fixes (design.md Addendum)

- [x] 6.1 (Fix A, spec-only) Verify the new `requireValidValidatorIds`
      Requirement/Scenario block added to
      `specs/hazardous-event-presentation-module-boundaries/spec.md` is
      grounded in the real `requestAuthorizationGuards.server.ts`
      implementation and its existing test file (no code/test change for
      this item). Verify: `openspec validate ca-he-presentation-file-consolidation --strict`
      passes.
- [x] 6.2 (Fix B, GREEN) Narrow
      `composeWorkflowAction.server.ts`'s `processWorkflowActionUseCase`
      parameter from `ProcessWorkflowActionUseCase` to
      `Pick<ProcessWorkflowActionUseCase, "execute">` (design.md Fix B --
      same pattern as `GetHazardousEventById.ts`'s constructor dependencies).
      Simplify `composeWorkflowAction.server.test.ts`'s 12
      `as unknown as ProcessWorkflowActionUseCase` mock casts to pass the
      fake `{ execute: vi.fn()... }` object directly. Verify:
      `yarn vitest run app/domains/hazardous-events/presentation/web/composeWorkflowAction.server.test.ts`
      passes; `yarn tsc` reports zero errors.
- [x] 6.3 (Fix C, GREEN) Remove `composeWorkflowAction`'s unused
      `request: Request` parameter from its signature; update both call
      sites (`app/routes/$lang+/_authenticated+/he-preview+/new.tsx`,
      `app/routes/$lang+/_authenticated+/he-preview+/edit.$id.tsx`) to stop
      passing `request`, and update
      `composeWorkflowAction.server.test.ts`'s existing calls to stop
      passing it too. Verify:
      `yarn vitest run app/domains/hazardous-events/presentation/web/composeWorkflowAction.server.test.ts`
      passes; `yarn tsc` reports zero errors.
- [x] 6.4 (Fix D, one-line test fix) Reword the misleading test title at
      `isStatusAwareEditBlocked.test.ts` line ~39 ("is blocked for a
      null/undefined role") to match its own `.toBe(false)` assertion and
      the predicate's real, correct behavior (design.md Fix D). No
      production code change. Verify:
      `yarn vitest run app/domains/hazardous-events/presentation/web/isStatusAwareEditBlocked.test.ts`
      passes.
- [x] 6.5 Fast gates, scoped to this follow-up's touched files only (no new
      quality-gate section needed per coordinator direction):
      `yarn vitest run` on
      `composeWorkflowAction.server.test.ts`,
      `requestAuthorizationGuards.server.test.ts`, and
      `isStatusAwareEditBlocked.test.ts`; `yarn tsc` (zero errors);
      `npx prettier --check` scoped to every file touched by 6.2-6.4
      (`composeWorkflowAction.server.ts`,
      `composeWorkflowAction.server.test.ts`, `new.tsx`, `edit.$id.tsx`,
      `isStatusAwareEditBlocked.test.ts`) -- do NOT run repo-wide
      `yarn format:check`/`yarn format`.
- [x] 6.6 Regression gate -- `yarn test:run2` (full PGlite suite) passes with
      no new failures; any pre-existing failure confirmed pre-existing
      against the base branch, not assumed.
- [x] 6.7 Run `opsx:archive` on this branch (re-archive after this
      follow-up's additions) before raising/updating the PR.
