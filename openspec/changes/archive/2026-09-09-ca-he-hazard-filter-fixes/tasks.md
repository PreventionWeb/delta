## 0. Regression Baseline (before any edit)

- [x] 0.1 Run `yarn test:run2` (full PGlite suite) on the current branch, before touching any
  file, and record the pass/fail counts. This is the baseline for comparing against the
  post-fix run in section 5 — do not label anything a "pre-existing failure" without this
  explicit before/after comparison.

## 1. Characterization Test

- [x] 1.1 Create `tests/integration/db/models/hazardFilterAnalytics.test.ts`:
  - Import `"../setup"` at the top
  - Import `seedCountryAccount`, `seedHipChain` from `./hazardousEventTestHelpers` (reuse, do not
    duplicate)
  - One `describe` block: `describe("applyHazardFilters — internal naming safety")`

- [x] 1.2 **Rename test**:
  - Seed via `seedCountryAccount()` + `seedHipChain()` to get a real
    `hipHazardId`/`hipClusterId`/`hipTypeId` triple
  - Build a minimal `dr.select().from(disasterRecordsTable)` query builder and call
    `applyHazardFilters` directly with `filters.specificHazardId` set to the seeded `hipHazardId`
  - Mock `createLogger` from `~/utils/logger.server` to capture every `logger.debug` /
    `logger.info` / `logger.warn` call (message + payload)
  - Assert: the resulting `baseConditions` array contains an
    `eq(hazardousEventTable.hipHazardId, <seeded id>)`-equivalent condition
  - Assert: every captured log payload for the seven shorthand sites listed in `design.md`
    (Applied specific hazard filter / Starting specific hazard validation / Hazard cluster
    mismatch detected / Hazard type mismatch detected / Specific hazard validation completed /
    Specific hazard not found in hierarchy / hierarchy-validation catch block) is keyed
    `specificHazardId` with the seeded id as its value
  - Run `yarn vitest run tests/integration/db/models/hazardFilterAnalytics.test.ts` — this test
    MUST pass (Green) immediately, before any code change — there is no bug to reproduce, this is
    a characterization test bracketing a pure rename

## 2. Fix the Code

- [x] 2.1 In `app/backend.server/utils/hazardFilters.ts`: rename the local variable
  `specificHazardId` (line 29) to `hipHazardIdFilter`, updating every reference (lines 35, 61,
  80-84, 93-146) per the exhaustive site list in `design.md`. Keep every log payload's emitted
  key as `specificHazardId` — the seven shorthand sites (`{ specificHazardId }`) become
  `{ specificHazardId: hipHazardIdFilter }`, not a bare shorthand of the new name. Do not touch
  the `filters.specificHazardId` derivation (right-hand side of the declaration) or any other
  file. **Do not touch `app/backend.server/models/analytics/effectDetails.ts` or
  `app/backend.server/models/analytics/geographicImpact.ts`** — both are out of scope for this
  change (see design.md "Descoped: the `effectDetails.ts` fix").

## 3. Confirm Green

- [x] 3.1 Run `yarn vitest run tests/integration/db/models/hazardFilterAnalytics.test.ts` — the
  characterization test remains Green (proving zero behavior change from the rename).

## 4. Refactor — all 9 quality gates

- [x] 4.1 `yarn vitest run tests/integration/db/models/hazardFilterAnalytics.test.ts` — tests
  still green
- [x] 4.2 `yarn tsc` — zero TypeScript errors
- [x] 4.3 `yarn format:check` — Prettier clean (scoped to the changed files; do not run bulk
  `yarn format`)
- [x] 4.4 Anti-pattern review — check `.github/skills/anti-pattern-check/SKILL.md`
- [x] 4.5 SOLID review — invoke `solid-reviewer` agent
- [x] 4.6 Documentation review — comments explain WHY not WHAT; terse single-line comments only
  where genuinely non-obvious
- [x] 4.7 Project conventions review — check `.github/copilot-instructions.md`
- [x] 4.8 Code review — run `.github/skills/code-review/SKILL.md` in full
- [x] 4.9 Visual/UX parity review — **N/A for this change**: this fix touches no
  `app/domains/*/presentation/` code and no route's rendered output; it's a backend
  utility-function rename with no UI-visible shape change. Record this reason explicitly rather
  than skipping silently.

## 5. Regression Suite

- [x] 5.1 Run `yarn test:run2` (full PGlite suite) and compare against the section 0 baseline.
  Any failure not present in the baseline is a regression introduced by this change and must be
  fixed before proceeding. Any failure that matches the baseline exactly may be confirmed as
  pre-existing — do not label a failure "pre-existing" without this explicit comparison.

## 6. Archive

- [x] 6.1 Run `opsx:archive` on this branch before raising the PR. The PR targets
  `feature/he-ca-phase2`, not `dev`.
