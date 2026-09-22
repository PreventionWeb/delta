## 1. Failing tests — hazard driver id collection (Red)

- [x] 1.1 In `app/domains/hazardous-events/domain/HazardousEvent.test.ts`, add
      `baseProps.hazardDriverIds: []` (and the equivalent for `attachments`/`fieldValues`/
      `customFieldValues`, tasks 2.1/3.1/4.1). Separately, update all 64 existing
      `HazardousEvent.create(props)` call sites in this file to
      `HazardousEvent.create(props, new Set(), new Set())` (empty `validHazardDriverIds`/
      `validCustomFieldDefinitionIds` — every pre-existing test's `props.hazardDriverIds`/
      `customFieldValues` is empty via `baseProps`, so an empty valid-set never rejects them; this
      is a mechanical, behavior-preserving bulk update, not a scenario-content change) so every
      pre-existing test keeps compiling and passing unchanged once `create()`'s signature changes
      (design.md Decision 4). Verify with
      `yarn vitest run app/domains/hazardous-events/domain/HazardousEvent.test.ts` (fails to
      compile until `HazardousEventProps` gains the four fields and `create()` gains the two new
      parameters, task 5.1/5.2).
      **Post-hoc cleanup (user-flagged readability issue, post-Gate-10):** the bulk update above
      left 65 raw `HazardousEvent.create(props, new Set(), new Set())` call sites with no naming,
      inconsistent with `IHazardousEventRepository.test.ts`'s `makeHazardousEvent()` wrapper.
      Added an equivalent `createHazardousEvent(props, validHazardDriverIds?, validCustomFieldDefinitionIds?)`
      helper (defaulted empty sets) directly below `baseProps` and routed all call sites through it;
      the membership-check-specific tests (1.3/4.2) now pass locally-scoped, named
      `validHazardDriverIds`/`validCustomFieldDefinitionIds` consts instead of a bare `new Set()`,
      even where the value is empty, so they stay self-documenting about what they check. Pure
      mechanical refactor — no assertion content changed; reconfirmed 114/114 passing (both touched
      test files combined), `yarn tsc` and `prettier --check` clean.
- [x] 1.2 Add failing scenarios for `hazardDriverIds`: happy path (empty array, distinct ids),
      non-array rejected, empty/whitespace element rejected, duplicate id rejected — per
      specs/hazardous-event-entity/spec.md "HazardousEvent validates the hazard driver id
      collection". Verify with the same `yarn vitest run` command; all new assertions fail (no
      implementation yet).
- [x] 1.3 Add failing scenarios for the `validHazardDriverIds` membership check: a driver id
      absent from `validHazardDriverIds` is rejected, a driver id present is accepted, an empty
      `hazardDriverIds` array requires no membership check regardless of the set's contents — per
      specs/hazardous-event-entity/spec.md "Failure — a hazardDriverId absent from
      validHazardDriverIds is rejected" / "An empty hazardDriverIds array requires no membership
      check" (design.md Decision 4, closes `DEF-021`). Verify with the same `yarn vitest run`
      command; new assertions fail until `create()` accepts and checks the parameter.

## 2. Failing tests — attachment collection (Red)

- [x] 2.1 Add `HazardousEventAttachmentProps`-shaped fixtures and failing scenarios: happy path
      (empty array, one well-formed attachment), non-array rejected, missing/blank required text
      field rejected, non-finite/non-integer `fileSize` rejected, `fileSize: 0` accepted (shape
      only, no positivity rule) — per specs/hazardous-event-entity/spec.md "HazardousEvent
      validates the attachment collection". Verify with
      `yarn vitest run app/domains/hazardous-events/domain/HazardousEvent.test.ts`.

## 3. Failing tests — hazard-type field value collection (Red)

- [x] 3.1 Add failing scenarios for `fieldValues`: happy path (empty array, distinct definition
      ids including an empty `value`), non-array rejected, missing definition id rejected,
      non-string `value` rejected, duplicate definition id rejected — per
      specs/hazardous-event-entity/spec.md "HazardousEvent validates the hazard-type field value
      collection". Verify with the same `yarn vitest run` command.

## 4. Failing tests — hazard-type custom field value collection (Red)

- [x] 4.1 Add failing scenarios for `customFieldValues`: happy path (empty array, a
      `fieldValues`/`customFieldValues` definition id collision across the two collections
      accepted), non-array rejected, duplicate custom field definition id rejected — per
      specs/hazardous-event-entity/spec.md "HazardousEvent validates the hazard-type custom field
      value collection". Verify with the same `yarn vitest run` command.
- [x] 4.2 Add failing scenarios for the `validCustomFieldDefinitionIds` membership check: a
      `hazardTypeCustomFieldDefinitionId` absent from `validCustomFieldDefinitionIds` is rejected,
      one present is accepted, an empty `customFieldValues` array requires no membership check —
      per specs/hazardous-event-entity/spec.md "Failure — a hazardTypeCustomFieldDefinitionId
      absent from validCustomFieldDefinitionIds is rejected" / "An empty customFieldValues array
      requires no membership check" (design.md Decision 4, closes `DEF-021`). Also add a passing
      assertion (may be written now, since it needs no new implementation beyond task 1.3/5.2's
      shared ordering) that `fieldValues`'s `hazardTypeFieldDefinitionId` is never checked against
      `validCustomFieldDefinitionIds` or any equivalent set. Verify with the same `yarn vitest run`
      command; new assertions fail until `create()` accepts and checks the parameter.

## 5. Implementation (Green)

- [x] 5.1 In `app/domains/hazardous-events/domain/HazardousEvent.ts`, add exported types
      `HazardousEventAttachmentProps`, `HazardousEventFieldValueProps`,
      `HazardousEventCustomFieldValueProps` (design.md Decision 2), and add `hazardDriverIds`,
      `attachments`, `fieldValues`, `customFieldValues` to `HazardousEventProps` (design.md
      Decision 1 — all four required, no `?:`).
- [x] 5.2 Change `create()`'s signature to
      `create(props, validHazardDriverIds: ReadonlySet<string>, validCustomFieldDefinitionIds: ReadonlySet<string>)`
      (design.md Decision 4 — both mandatory, no default). Implement the `Array.isArray` guard,
      per-item shape checks, and duplicate-value checks for all four collections inside `create()`,
      then the membership check against `validHazardDriverIds`/`validCustomFieldDefinitionIds` for
      `hazardDriverIds`/`customFieldValues` only, in the order design.md Decision 6 specifies
      (existing checks unchanged and first; then drivers → attachments → field values → custom
      field values; within each, array-shape guard before per-item checks before duplicate check
      before membership check where one applies). Add the four new read-only getters, each
      returning a defensive array copy (design.md Context — matches `3d`'s `[...props.x]` clone
      pattern). Verify with
      `yarn vitest run app/domains/hazardous-events/domain/HazardousEvent.test.ts` — all tests
      from Sections 1-4 now pass, and every pre-existing test in the file still passes unchanged
      once updated to pass the two new required arguments (task 1.1).

## 6. Downstream fixture fix

- [x] 6.1 Update `app/domains/hazardous-events/application/ports/IHazardousEventRepository.test.ts`'s
      `baseHazardousEventProps` to supply `hazardDriverIds: []`, `attachments: []`,
      `fieldValues: []`, `customFieldValues: []`, and update its single
      `makeHazardousEvent()` helper's `HazardousEvent.create({...})` call to pass
      `new Set(), new Set()` as the two new arguments (proposal.md Impact — roadmap deviation
      found during Phase 0; only one call site in this file, unlike task 1.1's 64). Verify with
      `yarn vitest run app/domains/hazardous-events/application/ports/IHazardousEventRepository.test.ts`.

## 7. Refactor

- [x] 7.1 Re-read the full diff of `HazardousEvent.ts`/`HazardousEvent.test.ts` for duplication
      across the four new validation blocks (e.g. a shared "required non-empty string in an
      array" helper vs. four near-identical inline loops) and simplify where it doesn't obscure
      per-collection error messages. Verify with
      `yarn vitest run app/domains/hazardous-events/domain/HazardousEvent.test.ts` — still green.

## 8. Quality gates

- [x] 8.1 Gate 1/10: `yarn vitest run app/domains/hazardous-events/domain/HazardousEvent.test.ts`
      and `yarn vitest run app/domains/hazardous-events/application/ports/IHazardousEventRepository.test.ts`
      — both green.
- [x] 8.2 Gate 2/10: `yarn tsc` — zero TypeScript errors.
- [x] 8.3 Gate 3/10: `yarn format:check` — Prettier clean (scope to the touched files; do not run
      a bare `yarn format`).
- [x] 8.4 Gate 4/10: Anti-pattern review against `.github/skills/anti-pattern-check/SKILL.md`.
- [x] 8.5 Gate 5/10: SOLID review — invoke `solid-reviewer` agent.
- [x] 8.6 Gate 6/10: Documentation review by a fresh subagent — comments explain WHY not WHAT,
      one full-diff sweep, not just the round's delta.
- [x] 8.7 Gate 7/10: Project conventions review against `.github/copilot-instructions.md`.
- [x] 8.8 Gate 8/10: Code review — run `.github/skills/code-review/SKILL.md` in full, via a fresh
      subagent. Finding: `validateAttachments`/`validateFieldValues`/`validateCustomFieldValues`
      dereferenced a collection element's properties without first checking the element itself was
      a non-null object, so a malformed element (e.g. `attachments: [null]`) threw a raw `TypeError`
      instead of `ValidationError`. Classified as an architectural/design flaw per the resolution
      table: `spec-writer` added an addendum to design.md Decision 6 and one new Failure scenario
      to each of the three ADDED requirements in spec.md; implemented a new `assertIsObject` guard
      (run after the array-shape guard, before any per-field check, matching Decision 6's ordering)
      and added `it.each([null, undefined, "garbage"])` regression tests per collection, plus the
      review's three nitpicks (customFieldValues per-item shape tests, two more ordering-boundary
      tests, defensive-copy tests for all four collections, and the Decision 4 -> Decision 3 JSDoc
      citation fix). Re-ran gates 1-3, all green.
- [x] 8.9 Gate 9/10: Visual/UX parity review — **N/A, state explicitly**. This change touches
      only `app/domains/hazardous-events/domain/` and its test files; no file under
      `app/domains/*/presentation/` or `app/routes/` changes.
- [x] 8.10 Gate 10/10: Independent second-opinion review — Claude Code's built-in `/code-review`
      at high effort, via a second, separate fresh subagent. Findings: (1) the constructor/getter
      "defensive copy" clones arrays only, not contained element objects — fixed by clarifying the
      constructor/getter comments' scope claim and adding two Non-Goal lines to design.md (matches
      spec.md's own scenario wording, which is array-level, not deep-clone) plus one
      characterization test proving the boundary is intentional; (2) `assertIsObject`'s name/message
      could imply arrays/boxed primitives are excluded when they are not (crash-prevention only) —
      clarified with a comment; (3) no documented Non-Goal for string-length/collection-cardinality
      bounds — added one to design.md (no DB `CHECK` constraint to mirror, same reasoning as
      Decision 5); (4) raw id interpolation into `ValidationError` messages with no truncation —
      left as-is, consistent with this file's own pre-existing convention (e.g. the required-field
      loop, `SpatialObservation.ts`'s `validDivisionIds` check) and `3d`'s Decision-2-style scoping
      against inconsistent, unrequested tightening. Re-ran gates 1-3, all green.
- [x] 8.11 Test quality — invoke `test-quality-auditor` scoped to
      `app/domains/hazardous-events/domain/HazardousEvent.ts`/`.test.ts` (this change modifies a
      file under `app/domains/*/domain/`). Mutation score 91.33% (137/150); 10 real gaps found (9
      message-wording-only per this project's own standing lesson that such survivors are real
      gaps, plus 1 masked substantive gap: the "empty/whitespace hazardDriverIds entry" test used
      an empty `validHazardDriverIds` set, so deleting the per-item check was masked by the
      downstream membership check also throwing). Fixed all 10 by adding exact-message regex
      assertions to the 6 affected tests and changing the masked test's `validHazardDriverIds` to
      contain the literal invalid entry, isolating the per-item check. 3 additional `fileSize`
      guard mutants confirmed genuinely equivalent (mathematically redundant given
      `Number.isInteger`'s own semantics) — left as-is, not a test gap, and not simplified in
      source since design.md Decision 5 explicitly specifies the triple-check. Re-ran gates 1-3
      after the fix, all green (114/114 tests).

## 9. Regression and archive

- [x] 9.1 `yarn test:run2` (full PGlite suite) MUST pass with no new failures. Any pre-existing
      failure must be confirmed pre-existing by running the same suite against `feature/he-ca-phase3`
      (this branch's base) before this change's commits, not assumed. Baseline (run before any
      change in this session, clean working tree at `feature/ca-he-aggregate-child-value-objects`
      == `feature/he-ca-phase3`): 85/86 test files passed, 968/970 tests passed, 1 failure
      (`tests/integration/nestjs/HttpServerBootstrap.test.ts` — a 15000ms timeout, unrelated to
      this change's files), 1 todo. Final (after full implementation): 86/86 test files passed,
      1023/1024 tests passed, 0 failures, 1 todo — the baseline's timeout did not reproduce (flaky,
      not a regression this change introduced). No new failures; 54 net new tests added.
- [x] 9.2 Run `opsx:archive` on this branch before raising the PR. Confirmed with the human
      reviewer: PR targets `feature/he-ca-phase3` (the Phase 3 integration branch), matching
      `3a`/`3b`/`3c`/`3d`'s precedent.
