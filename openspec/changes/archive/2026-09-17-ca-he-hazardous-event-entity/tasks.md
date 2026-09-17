## 1. HazardousEvent — construction (Red → Green)

- [x] 1.1 Write failing tests in `app/domains/hazardous-events/domain/HazardousEvent.test.ts` for
      the "construction via validated factory" requirement (spec: `hazardous-event-entity` —
      happy path with all required fields present, happy path with `endDate: ""` for an
      ongoing/forecasted event, missing `tenantId`/`specificHazardId`/`startDate` each throw
      `ValidationError` referencing the field name, `startDate > endDate` throws `ValidationError`).
      `startDate` required / `endDate` optional is resolved (design.md Decision 2, confirmed by the
      user 2026-09-16) — not an open question; test to this reading directly. Verify red:
      `yarn vitest run app/domains/hazardous-events/domain/HazardousEvent.test.ts` fails because
      `HazardousEvent.ts` does not exist yet.
- [x] 1.2 Implement `app/domains/hazardous-events/domain/HazardousEvent.ts`: private constructor,
      `HazardousEvent.create(props)` static factory validating presence of `tenantId`,
      `specificHazardId`, `startDate` (throws `ValidationError` referencing the field name) and
      `startDate <= endDate` when both are non-empty (design.md Decisions 2–3). Read-only getters
      for every retained column (design.md Context's column list). No approval-status or
      HIP-hierarchy property (design.md Context — excluded columns). Verify green:
      `yarn vitest run app/domains/hazardous-events/domain/HazardousEvent.test.ts`.

## 2. HazardousEvent — attribution field normalization (Red → Green)

- [x] 2.1 Add failing tests for the empty-string-to-null normalization requirement: each of
      `createdByUserId`/`updatedByUserId`/`submittedByUserId` passed as `""` resolves to `null` on
      the returned instance (not thrown, not stored as `""`); a real UUID string value is
      preserved unchanged. `submittedByUserId` is kept paired with `submittedAt` (design.md
      Decision 4, confirmed by the user 2026-09-16) — not an open question; test `submittedAt`'s
      presence, `Date | null` typing, and defensive-clone behavior alongside the three normalized
      fields. Verify red.
- [x] 2.2 Implement the normalization in `create()` (design.md Decision 4): `""` → `null` for the
      three attribution fields only, distinct from Decision 2's required-field rule. Verify green.

## 3. HazardousEvent — no approval-status or HIP-hierarchy property (characterization)

- [x] 3.1 Add a test asserting the constructed instance has no `status`, `approvalStatus`,
      `validatedByUserId`, `validatedAt`, `publishedByUserId`, `publishedAt`, `hipHazardId`,
      `hipClusterId`, or `hipTypeId` property (spec: `hazardous-event-entity`, "carries no
      approval-status or HIP-hierarchy field"). This should pass immediately once 1.2 lands (the
      entity never declares these props) — a characterization test, not new behavior; note this
      explicitly rather than treating it as an undriven Red phase.

## 4. HazardousEvent — immutability (Red → Green)

- [x] 4.1 Add a test asserting `HazardousEventProps` fields are not reassignable after
      construction and that two entities built from the same base props but different overrides
      do not interfere with each other. Verify red if the initial implementation used a mutable
      internal object; otherwise record as a characterization test per 3a's own precedent for its
      equivalent purity tests.
- [x] 4.2 Confirm/implement: `create()` never mutates a shared reference across calls; getters
      return the stored value directly for primitives and a defensive clone for every `Date`-typed
      getter (`createdAt`, `updatedAt`, and `submittedAt` when non-null), matching
      `WorkflowInstance`'s own defensive-cloning precedent for its own nullable attribution
      timestamps. Verify green.

## 5. IHazardousEventRepository port

- [x] 5.1 Implement `app/domains/hazardous-events/application/ports/IHazardousEventRepository.ts`
      per design.md Decisions 5–6 and spec `hazardous-event-repository-port`: the provisional
      `SpatialObservationRecord` type (design.md Decision 5, with its supersession comment), and
      the seven methods `findById`, `findAll`, `save`, `delete`, `findCurrentSpatialObservation`,
      `findSpatialObservationByTime`, `saveSpatialObservation` with the exact signatures the spec
      lists — no Drizzle/NestJS/Remix import, no Drizzle-inferred type anywhere in the file.
      Verify via `yarn tsc` (zero errors referencing this file).
- [x] 5.2 Write `IHazardousEventRepository.test.ts`: a `FakeHazardousEventRepository` conformance
      implementation (matching `3a`'s `IWorkflowRepository.test.ts` pattern) exercising
      `findById`'s throw-on-absent contract, `findAll`'s tenant-scoped pagination, `save`'s
      single-parameter signature, `delete`'s tenant scoping, `findCurrentSpatialObservation`'s
      null-not-throw contract, and `findSpatialObservationByTime`'s exact-time lookup. Verify
      green: `yarn vitest run app/domains/hazardous-events/application/ports/IHazardousEventRepository.test.ts`.
- [x] 5.3 Add the concurrent-callers test required by spec `hazardous-event-repository-port`
      ("Concurrent saveSpatialObservation calls..."): using the fake repository, simulate two
      overlapping `saveSpatialObservation` calls for the same `hazardousEventId` +
      `observationTime` and assert the fake's own conflict behavior (e.g. a `Map`-keyed
      last-write-wins or an explicit thrown error — document whichever the fake implements, since
      the real contract is deferred to `3d` per design.md Decision 7) — the point of this test is
      to pin that the fake's documented behavior doesn't silently regress, not to validate a real
      DB unique-constraint race (that requires `3d`'s adapter). Verify green.

## 6. Refactor pass

- [x] 6.1 Refactor `HazardousEvent.ts` and `IHazardousEventRepository.ts` for any duplication
      between the required-field-presence checks and the attribution-normalization logic, without
      changing observable behavior. Verify green:
      `yarn vitest run app/domains/hazardous-events/domain/HazardousEvent.test.ts app/domains/hazardous-events/application/ports/IHazardousEventRepository.test.ts`.

## 7. Quality gates

- [x] 7.1 Gate 1 — `yarn vitest run app/domains/hazardous-events/domain/HazardousEvent.test.ts app/domains/hazardous-events/application/ports/IHazardousEventRepository.test.ts` — all tests green.
- [x] 7.2 Gate 2 — `yarn tsc` — zero TypeScript errors (confirms zero DB/framework dependency
      compiles cleanly, per Phase 3 Gate).
- [x] 7.3 Gate 3 — `npx prettier --check` on both new production files and both new test files —
      Prettier clean (preview `--write` on copies first per project convention; apply only if the
      diff is pure formatting).
- [x] 7.4 Gate 4 — Anti-pattern review against `.github/skills/anti-pattern-check/SKILL.md`: no
      `any`, no non-null assertions, no swallowed errors, no Drizzle/NestJS/auth/tenancy code
      outside the documented `tenantId` parameters, `tsc`/`format:check` scoped-clean.
- [x] 7.5 Gate 5 — SOLID review: invoke the `solid-reviewer` agent against the two new production
      files and their tests.
- [x] 7.6 Gate 6 — Documentation review: every comment explains WHY (design.md decision
      references, the DEF-005/DEF-006 closure rationale, the provisional-type flag on
      `SpatialObservationRecord`) not WHAT; one full-diff sweep before the final report.
- [x] 7.7 Gate 7 — Project conventions review against `.github/copilot-instructions.md`: confirm
      `countryAccountsId`/tenant scoping is present on every method that needs it, no `.server.ts`
      suffix needed (no server/framework code here), no auth wrapper needed (no loaders), no
      migration needed, path aliases used correctly, test files use `*.test.ts` naming.
- [x] 7.8 Gate 8 — Run `.github/skills/code-review/SKILL.md` in full, via a fresh subagent, against
      the diff.
- [x] 7.9 Gate 9 — Visual/UX parity review: **not applicable**. This change touches no
      `app/domains/*/presentation/` file and renders no route — record this explicitly rather than
      silently skipping.
- [x] 7.10 Gate 10 — Independent second-opinion review, via a second, separate fresh subagent
      (Claude Code's built-in code-review at high effort), against the diff.

## 8. Domain test-quality audit

- [x] 8.1 Invoke `test-quality-auditor` (Stryker) scoped to `HazardousEvent.ts`/`.test.ts` (this
      change touches `app/domains/hazardous-events/domain/`, triggering the mandatory audit).
      Resolve any real gap found.

## 10. Round 2 fixes — createdAt/updatedAt/submittedAt Date-validity gap (Red → Green)

- [x] 10.1 Write failing tests in `HazardousEvent.test.ts` for the Date-validity rule (spec:
      `hazardous-event-entity`, design.md Decision 9): `createdAt` as `undefined`, `null`, a
      non-`Date` value, and `new Date("garbage")` (NaN-time) each throw `ValidationError`
      referencing `createdAt`, never a raw `TypeError`; the same four shapes for `updatedAt` and
      for `submittedAt`, each only when non-null (plus a happy-path test confirming a `null`
      `updatedAt`/`submittedAt` still skips the check and does not throw); and an ordering test
      confirming an invalid `createdAt` combined with `startDate > endDate` throws referencing
      `createdAt`, not `endDate`. Verify red:
      `yarn vitest run app/domains/hazardous-events/domain/HazardousEvent.test.ts` fails only on
      the new cases (existing tests stay green).
- [x] 10.2 Implement the fix in `HazardousEvent.ts` (design.md Decision 9): add a local
      `isInvalidDate(value: unknown): boolean` predicate
      (`!(value instanceof Date) || Number.isNaN(value.getTime())`, typed `unknown` — not `Date` —
      matching `WorkflowInstance.ts`'s own reasoning so the `instanceof` disjunct can't be
      "simplified away" as unreachable). Wire it into `create()`: check `createdAt` unconditionally, then `updatedAt`
      and `submittedAt` each only when non-null, throwing `ValidationError` referencing the field
      name — all before the existing `startDate <= endDate` ordering check. Verify green:
      `yarn vitest run app/domains/hazardous-events/domain/HazardousEvent.test.ts`.

## 11. Round 2 quality gates

- [x] 11.1 Gate 1 — `yarn vitest run app/domains/hazardous-events/domain/HazardousEvent.test.ts app/domains/hazardous-events/application/ports/IHazardousEventRepository.test.ts` — all tests green.
- [x] 11.2 Gate 2 — `yarn tsc` — zero TypeScript errors.
- [x] 11.3 Gate 3 — `npx prettier --check` on `HazardousEvent.ts` and `HazardousEvent.test.ts` —
      Prettier clean (preview `--write` on copies first per project convention; apply only if the
      diff is pure formatting).
- [x] 11.4 Gate 4 — Anti-pattern review against `.github/skills/anti-pattern-check/SKILL.md`: no
      `any`, no non-null assertions, no swallowed errors; confirm the new `isInvalidDate` logic
      introduces no Drizzle/NestJS/auth/tenancy dependency.
- [x] 11.5 Gate 5 — SOLID review: invoke the `solid-reviewer` agent against the round 2 diff.
- [x] 11.6 Gate 6 — Documentation review: the new comments explain WHY (the `unknown`-typing
      rationale, the DEF-adjacent scope-gap note, the check-ordering rationale) not WHAT; one
      full-diff sweep before the final report.
- [x] 11.7 Gate 7 — Project conventions review against `.github/copilot-instructions.md`: still N/A
      for `.server.ts` suffix, auth wrapper, tenancy scoping, and migrations (pure domain-tier
      change, no new file added).
- [x] 11.8 Gate 8 — Run `.github/skills/code-review/SKILL.md` in full, via a fresh subagent, against
      the round 2 diff.
- [x] 11.9 Gate 9 — Visual/UX parity review: **not applicable**. This round touches no
      `app/domains/*/presentation/` file and renders no route — record this explicitly.
- [x] 11.10 Gate 10 — Independent second-opinion review, Claude Code's built-in code-review at high
      effort, via a second, separate fresh subagent, against the round 2 diff. Resolve findings
      before archiving.

## 12. Round 2 domain test-quality audit

- [x] 12.1 Invoke `test-quality-auditor` (Stryker) scoped to `HazardousEvent.ts`/`.test.ts` — this
      round again touches `app/domains/hazardous-events/domain/`, triggering the mandatory audit.
      Resolve any real gap found (e.g. confirm both `isInvalidDate` disjuncts — not-a-Date-instance
      and NaN-time — are independently killed for all three fields, not just one branch per field).

## 13. Round 2 regression check

- [x] 13.1 Run `yarn test:run2` (full PGlite suite). Confirm any failing test is pre-existing by
      re-running against this branch's true baseline, not assumed — per this project's "no
      assumptions, certainty required" convention. No new failures introduced by round 2 before
      archiving.

## 14. Post-review comment compaction (human review finding)

- [x] 14.1 Round 2's own Gate 6 checkbox (11.6) claimed a full-diff comment sweep, but the human
      reviewer found 12 comment blocks exceeding 2 consecutive lines across all 4 touched files
      (up to 16 lines in `IHazardousEventRepository.ts`) — self-review by `sdd-implementer` had
      missed real bloat for a second time (`3a` had the same failure mode). All 12 compacted
      directly, preserving the WHY and pointing to `design.md`/spec references rather than
      restating their content inline. One accuracy gap found and fixed in the same pass:
      `create()`'s `@throws` JSDoc was stale — never updated to mention Decision 9's
      createdAt/updatedAt/submittedAt validity check, added in round 2.
- [x] 14.2 Verified: `yarn vitest run app/domains/hazardous-events/` — 56/56 green (unaffected,
      comment-only edit); `yarn tsc` — zero errors; `npx prettier --check` on all 4 files — clean.
- [x] 14.3 Process fix (not scoped to this change, applies to all future changes): Gate 6's
      full-diff sweep must now be performed by a fresh subagent, not `sdd-implementer` re-reading
      its own comments — self-review has failed this exact check twice. Updated
      `sdd-implementer.agent.md` (both `.claude`/`.github` mirrors), `_docs/workflows/openspec.md`,
      and `openspec/config.yaml`'s injected gate-6 rule text.

## 15. Round 3 fixes — tenantId/specificHazardId/startDate non-string-value gap (Red → Green)

- [x] 15.1 Write failing tests in `HazardousEvent.test.ts` for the non-string, non-null gap
      (design.md Decision 10, applying the sibling `ca-workflow-instance-entityid-validation`
      change's own Gate 10 finding to this file for consistency — not an independently-discovered
      issue here): a props object where `tenantId` (and, in separate cases, `specificHazardId` and
      `startDate`) is a number (e.g. `12345`) — neither `null`/`undefined` nor a string — must throw
      `ValidationError` referencing the field's name, not an unhandled `TypeError` from `.trim()`
      being called on a non-string value. Verify red:
      `yarn vitest run app/domains/hazardous-events/domain/HazardousEvent.test.ts` fails only on the
      new cases (existing tests stay green).
- [x] 15.2 Implement the fix in `HazardousEvent.ts` (design.md Decision 10): in `create()`'s
      `for (const field of ["tenantId", "specificHazardId", "startDate"] as const)` loop, replace
      `value == null || value.trim().length === 0` with
      `typeof value !== "string" || value.trim().length === 0` — a single condition that already
      covers `null`/`undefined`/number/object/etc. (none of which satisfy `typeof value === "string"`)
      and the empty/whitespace-only case. Verify green:
      `yarn vitest run app/domains/hazardous-events/domain/HazardousEvent.test.ts`.

## 16. Round 3 quality gates

- [x] 16.1 Gate 1 — `yarn vitest run app/domains/hazardous-events/domain/HazardousEvent.test.ts app/domains/hazardous-events/application/ports/IHazardousEventRepository.test.ts` — all tests green.
- [x] 16.2 Gate 2 — `yarn tsc` — zero TypeScript errors.
- [x] 16.3 Gate 3 — `npx prettier --check` on `HazardousEvent.ts` and `HazardousEvent.test.ts` —
      Prettier clean (preview `--write` on copies first per project convention; apply only if the
      diff is pure formatting).
- [x] 16.4 Gate 4 — Anti-pattern review against `.github/skills/anti-pattern-check/SKILL.md`: no
      `any`, no non-null assertions, no swallowed errors; confirm the `typeof` guard introduces no
      Drizzle/NestJS/auth/tenancy dependency.
- [x] 16.5 Gate 5 — SOLID review: invoke the `solid-reviewer` agent against the round 3 diff.
- [x] 16.6 Gate 6 — Documentation review: the updated comment explains WHY (provenance from the
      sibling change's Gate 10 finding, per design.md Decision 10) not WHAT; one full-diff sweep by
      a fresh subagent before the final report (per the process fix recorded in 14.3 — self-review
      does not satisfy this gate). Fresh subagent fixed one stale JSDoc (create()'s @throws didn't
      cover the new non-string case); flagged (not fixed, out of round-3 scope) that endDate's
      ordering guard still lacks the typeof guard.
- [x] 16.7 Gate 7 — Project conventions review against `.github/copilot-instructions.md`: still N/A
      for `.server.ts` suffix, auth wrapper, tenancy scoping, and migrations (pure domain-tier
      change, no new file added).
- [x] 16.8 Gate 8 — Run `.github/skills/code-review/SKILL.md` in full, via a fresh subagent, against
      the round 3 diff. Two low-severity nits found (no blocking findings): describe-block label
      updated to cite Decision 2/10 for traceability (applied); JSDoc's Decision 2-only citation
      left as-is — deliberate per design.md's own "supersedes the expression, not the reasoning"
      framing, not a defect.
- [x] 16.9 Gate 9 — Visual/UX parity review: **not applicable**. This round touches no
      `app/domains/*/presentation/` file and renders no route — record this explicitly.
- [x] 16.10 Gate 10 — Independent second-opinion review, Claude Code's built-in code-review at high
      effort, via a second, separate fresh subagent, against the round 3 diff. Resolve findings
      before archiving. One low-severity, non-blocking finding: error message doesn't distinguish
      "empty" from "non-string" for the new case. No action — design.md Decision 10 explicitly
      specifies the message must stay `${field} must not be empty` unchanged; matches the same
      accepted trade-off already in the sibling `WorkflowInstance.ts`.

## 17. Round 3 domain test-quality audit

- [x] 17.1 Invoke `test-quality-auditor` (Stryker) scoped to `HazardousEvent.ts`/`.test.ts` — this
      round again touches `app/domains/hazardous-events/domain/`, triggering the mandatory audit.
      Resolve any real gap found (e.g. confirm both `typeof`-guard disjuncts — non-string-type and
      empty/whitespace-after-trim — are independently killed for all three fields, not just one
      branch per field). Result: 100.00% mutation score (51 killed, 0 timeout, 0 survived, 39
      excluded), log at `/tmp/he_round3_stryker.log`. Zero survivors at all — both guard disjuncts
      independently killed for all three fields. No gap.

## 18. Round 3 regression check

- [x] 18.1 Run `yarn test:run2` (full PGlite suite). Confirm any failing test is pre-existing by
      re-running against this branch's true baseline, not assumed — per this project's "no
      assumptions, certainty required" convention. No new failures introduced by round 3 before
      archiving. Baseline (`/tmp/3b_baseline_test_run2.log`, same `feature/he-ca-phase3` tip
      commit `79206091`, still current — reused, not re-run): 81/82 files, 844/845 tests, 1
      pre-existing timeout failure in
      `tests/integration/db/models/hazardousEventDisasterEventBoundary.test.ts`. Round 3 result
      (`/tmp/he_round3_test_run2.log`): 84/84 files passed, 911/911 tests passed, exit code 0 —
      zero failures, no regression.

## 19. Round 4 fixes — endDate non-string ordering-check gap (Red → Green)

- [x] 19.1 Write failing tests in `HazardousEvent.test.ts` for the non-string `endDate` gap
      (design.md Decision 11, found by human review after round 3 — round 3's own Gate 6/Gate 10
      already flagged this exact gap and deliberately left it out of scope): a props object where
      `endDate` is a number (e.g. `20260501`) — neither `null`/`undefined` nor a string — must throw
      `ValidationError` referencing `endDate`, not an unhandled `TypeError` from `.trim()` being
      called on a non-string value, and must not silently skip the ordering check. Since
      `HazardousEventProps.endDate` is statically typed `string`, construct this props object the
      same way the existing round-3 non-string tests do for `tenantId`/`specificHazardId`/`startDate`
      (`HazardousEvent.test.ts` lines 134–142 et al.):
      `{ ...baseProps, endDate: 12345 } as unknown as HazardousEventProps` — never `as any`
      (project convention). Also add/confirm explicit regression-guard tests that `endDate: null`
      and `endDate: undefined` still do not throw (the existing happy-path test only covers
      `endDate: ""`). Verify red:
      `yarn vitest run app/domains/hazardous-events/domain/HazardousEvent.test.ts` fails only on the
      new non-string case (existing tests, including the `null`/`undefined`/`""` happy paths, stay
      green).
- [x] 19.2 Implement the fix in `HazardousEvent.ts` (design.md Decision 11): add
      `if (props.endDate != null && typeof props.endDate !== "string") { throw new ValidationError("endDate must be a string"); }`
      as its own separate `if` block immediately before the existing `startDate`/`endDate` ordering
      check — not combined into the ordering check's condition, per Decision 11's
      per-concern-per-message reasoning (matching Decision 9's one-`if`-per-field style, not
      Decision 10's shared-message loop style). In the same task, update `create()`'s own `@throws`
      JSDoc (currently listing Decision 2/9/3 cases only) to also mention a present, non-string
      `endDate` (Decision 11) — this exact JSDoc has already gone stale twice (14.1 after round 2,
      16.6 after round 3); fix it here in the Green task itself rather than leaving it for Gate 6 to
      catch a third time. Verify green:
      `yarn vitest run app/domains/hazardous-events/domain/HazardousEvent.test.ts`.

## 20. Round 4 quality gates

- [x] 20.1 Gate 1 — `yarn vitest run app/domains/hazardous-events/domain/HazardousEvent.test.ts app/domains/hazardous-events/application/ports/IHazardousEventRepository.test.ts` — all tests green. 60/60 passed.
- [x] 20.2 Gate 2 — `yarn tsc` — zero TypeScript errors.
- [x] 20.3 Gate 3 — `npx prettier --check` on `HazardousEvent.ts` and `HazardousEvent.test.ts` —
      Prettier clean (preview `--write` on copies first per project convention; apply only if the
      diff is pure formatting). Clean, no `--write` needed.
- [x] 20.4 Gate 4 — Anti-pattern review against `.github/skills/anti-pattern-check/SKILL.md`: no
      `any`, no non-null assertions, no swallowed errors; confirm the new `endDate` type guard
      introduces no Drizzle/NestJS/auth/tenancy dependency. Confirmed clean.
- [x] 20.5 Gate 5 — SOLID review: invoke the `solid-reviewer` agent against the round 4 diff. No
      violation — the guard is one more instance of `create()`'s single "reject invalid prop shape"
      responsibility, not a new one; DIP unchanged (no Drizzle/cross-domain import). Non-blocking
      watch-item noted (extract named guard helpers if a third inline type-guard appears in a future
      round) — not warranted at current scale of one instance, no action taken.
- [x] 20.6 Gate 6 — Documentation review: one full-diff sweep by a fresh subagent (per the process fix
      recorded in 14.3) across all 4 touched files, not just this round's delta. Compacted 19 comments
      that restated design.md reasoning at length; confirmed `create()`'s `@throws` JSDoc lists all
      five throw conditions accurately (no third stale-JSDoc occurrence this round). Re-ran gates 1-3
      after the sweep: 60/60 tests green, `tsc` clean, prettier clean.
- [x] 20.7 Gate 7 — Project conventions review against `.github/copilot-instructions.md`: still N/A
      for `.server.ts` suffix, auth wrapper, tenancy scoping, and migrations (pure domain-tier
      change, no new file added).
- [x] 20.8 Gate 8 — Run `.github/skills/code-review/SKILL.md` in full, via a fresh subagent, against
      the round 4 diff. One actionable nitpick found and fixed: the new test's `/endDate/` regex also
      matched the ordering-check's own message, so it wouldn't catch a mutant throwing the wrong
      message for this input — tightened to `/endDate must be a string/`. All other checks passed
      (correctness, spec alignment, type safety, doc accuracy). Re-ran gates 1-3: green/clean.
- [x] 20.9 Gate 9 — Visual/UX parity review: **not applicable**. This round touches no
      `app/domains/*/presentation/` file and renders no route — record this explicitly.
- [x] 20.10 Gate 10 — Independent second-opinion review, Claude Code's built-in code-review at high
      effort, via a second, separate fresh subagent, against the round 4 diff. Three findings, none
      requiring action in this round:
      (1) **Architectural, deferred, not fixed** — `create()`'s ordering check does raw untrimmed
      lexicographic string comparison with no date-format validation (e.g. a padded `startDate` like
      `"2026-05-10 "` sorts greater than an equal-but-unpadded `endDate`). Pre-existing since Decision
      3/round 1, not introduced or aggravated by round 4's fix. Flagged as a round-5 candidate for the
      user's decision, same disposition round 3 gave the endDate-typeof gap in 16.6 before it became
      round 4's own scope — not actioned here.
      (2) **No action** — message asymmetry (`endDate` throws "must be a string", the three required
      fields throw "must not be empty") is not a new finding: 16.10 already dispositioned this exact
      class ("the message must stay `${field} must not be empty` unchanged... matches the same
      accepted trade-off already in the sibling `WorkflowInstance.ts`"). Decision 11 never claims
      uniform messaging across fields, so this isn't an artifact inaccuracy either.
      (3) **No action** — nitpick suggesting a narrowed local to avoid re-testing
      `props.endDate != null` twice; Decision 11 prescribes the literal snippet, so not applied
      without a user-approved design deviation.

## 21. Round 4 domain test-quality audit

- [x] 21.1 Invoke `test-quality-auditor` (Stryker) scoped to `HazardousEvent.ts`/`.test.ts` — this
      round again touches `app/domains/hazardous-events/domain/`, triggering the mandatory audit.
      Result: 100% mutation score (57/57 scored mutants killed, 0 survived, 0 timeout, 43 additional
      neutralized by the TypeScript checker before reaching tests), log at
      `/tmp/he_round4_stryker.log`. Zero real gap. The new guard's `props.endDate != null` disjunct is
      killed by a runtime test; its `typeof props.endDate !== "string"` disjunct is killed only via
      `tsc` CompileError (mutating it narrows a later `.trim()` reference to `never`) — the identical
      compiler-dependent-not-test-dependent pattern round 3's audit (17.1) already accepted for the
      required-field loop's own `typeof` guard (51 killed/39 excluded there vs 57 killed/43 excluded
      here); same disposition, no new test added. The tightened exact-message assertion
      (`/endDate must be a string/`, the round-4 Gate 8 fix) is independently confirmed to kill a
      message-text mutant.

## 22. Round 4 regression check

- [x] 22.1 Run `yarn test:run2` (full PGlite suite). Confirm any failing test is pre-existing by
      re-running against this branch's true baseline, not assumed — per this project's "no
      assumptions, certainty required" convention. No new failures introduced by round 4 before
      archiving. Baseline commit `79206091` (`feature/he-ca-phase3` tip) unchanged since round 3 —
      reused `/tmp/3b_baseline_test_run2.log` rather than re-running (baseline: 81/82 files, 844/845
      tests, 1 pre-existing timeout in `hazardousEventDisasterEventBoundary.test.ts`; round 3's own
      run, `/tmp/he_round3_test_run2.log`, showed that same test passing clean at 84/84, 911/911 —
      i.e. that timeout is flaky, not deterministic, present in neither log as a hard failure).
      Round 4 result (`/tmp/he_round4_test_run2.log`): 84/84 files passed, 912/912 tests passed
      (911 + round 4's new `endDate` non-string test), exit code 0 — zero failures. No regression:
      nothing fails in round 4 that was absent from both prior logs.

## 9. Regression and archive

- [x] 9.1 Run `yarn test:run2` (full PGlite suite). Confirm any failing test is pre-existing by
      re-running against this branch's true baseline (`feature/he-ca-phase3`, or a clean stash of
      this change's diff), not assumed — per this project's "no assumptions, certainty required"
      convention. No new failures introduced by this change before archiving.
- [x] 9.2 Run `opsx:archive` on this branch (`feature/ca-he-hazardous-event-entity`) before raising
      the PR. Confirm with the human reviewer where the PR should target — Track A's `3a` targeted
      `feature/he-ca-phase3` (the Phase 3 integration branch), not `dev`; this change's target
      should follow the same convention unless the reviewer says otherwise.
