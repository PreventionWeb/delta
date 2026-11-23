# Proposal

## Why

DELTA's OpenSpec SDD workflow has strong backend, security, and DDD quality gates, but its presentation-layer and design-system gates have gaps now that the DELTA Design System (`unisdr/delta-design` v0.7.2: `DESIGN.md`, `tokens.css`, `tokens.json`) is being adopted:

- `openspec/config.yaml` omits `app/design-system/` and `_docs/design/`, still cites PrimeReact as the target JSX layer, and scopes Gate 9 (`Visual/UX parity review`) only to `app/domains/*/presentation/` and `app/routes/`.
- `sdd-implementer` Gate 9 only captures a desktop screenshot for manual parity comparison — it does not run automated `axe-core` WCAG 2.2 AA checks, multi-breakpoint horizontal-overflow checks, WCAG 2.2 minimum target-size (`24x24px`) checks, icon-button accessible-name checks, or keyboard focus-obscuration checks.
- `spec-writer`, `anti-pattern-check`, and `code-review` lack design-system and WCAG 2.2 AA checklists.
- `unisdr/delta-design/example-page-source/` contains 23 ad-hoc `.cjs` check scripts whose underlying verification patterns (WCAG 2.2 AA `axe-core` across states, zero console/page errors, mobile horizontal overflow, keyboard traversal, table row cursor semantics, form-validation lifecycle) should be distilled into typed, reusable Playwright helpers and a Gate 9 CLI audit runner.

## What Changes

1. **Runtime Playwright audit helpers & Gate 9 CLI runner**:
   - Install `@axe-core/playwright` (`devDependency`) and add `yarn test:design` and `yarn design:check` scripts to `package.json`.
   - Create `tests/e2e/helpers/designSystemChecks.ts` exporting reusable Playwright assertions (`assertWcag22AA`, `attachErrorCollector`, `assertNoHorizontalOverflow`, `assertTargetSizesAndLabels`, `assertFocusNotObscured`, `assertRowCursorSemantics`).
   - Create `scripts/check-design-a11y.ts` (`yarn design:check`) to audit any route across `375x812`, `768x1024`, and `1280x900`, defaulting `axe-core` and DOM audits to `<main>` (with `--full-page` opt-in so new screens are not blocked by pre-existing legacy header/footer chrome in `app/root.tsx`).
2. **Static Vitest design-system guards**:
   - Extend `tests/unit/design-system/components/imports.test.ts` to enforce Lucide-only icon imports, zero hardcoded hex colors, zero `tokens.css` primitive `--color-(neutral|warm|accent|green|amber|red)-*` tokens, and zero em-dashes in JSX copy inside `app/design-system/components/`.
   - Add `tests/unit/design-system/tokenSync.test.ts` to validate `_docs/design/tokens.css`, `_docs/design/tokens.json`, `app/styles/all.css` `@theme` mappings, and `app/styles/fonts.css` font assets (gracefully guarding if `_docs/design/` is not yet merged on the branch).
   - Add `tests/unit/design-system/designSystemChecks.test.ts` testing pure helper logic and CLI argument parsing.
3. **OpenSpec workflow, skills, agents, and lightweight PR CI**:
   - Create `.github/skills/design-system-check/SKILL.md` codifying static, runtime, interactive-state, and manual Gate 9 checks.
   - Update `openspec/config.yaml`, `.github/agents/spec-writer.agent.md`, `.github/agents/sdd-implementer.agent.md`, `.github/agents/test-writer.agent.md`, `.github/agents/tdd-test-writer.agent.md`, `.github/skills/anti-pattern-check/SKILL.md`, `.github/skills/code-review/SKILL.md`, `.github/agents/README.md`, and `_docs/workflows/openspec.md`.
   - Add `.github/workflows/design-system-check.yml` running `yarn test:design` on PRs touching design-system, styles, or design-spec paths.

### Expected File Changes

| File                                                  | Reason                                                                                                                  |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `package.json` & `yarn.lock`                          | Add `@axe-core/playwright` devDependency plus `test:design` and `design:check` scripts                                  |
| `tests/e2e/helpers/designSystemChecks.ts`             | Reusable Playwright WCAG 2.2 AA, overflow, target-size, focus-obscuration, error-collector, and row-cursor helpers      |
| `scripts/check-design-a11y.ts`                        | Gate 9 CLI runner auditing routes across mobile/tablet/desktop viewports (defaults to `<main>`, supports `--full-page`) |
| `tests/unit/design-system/components/imports.test.ts` | Extend static guards for Lucide-only icons, no hex literals, no primitive tokens, no em-dashes in UI copy               |
| `tests/unit/design-system/tokenSync.test.ts`          | Contract tests for `_docs/design/tokens.{css,json}` ↔ `app/styles/all.css` `@theme` and self-hosted fonts               |
| `tests/unit/design-system/designSystemChecks.test.ts` | Unit tests for CLI arg parsing and pure audit formatting/evaluation helpers                                             |
| `.github/skills/design-system-check/SKILL.md`         | Authoritative Gate 9 design-system & WCAG 2.2 AA checklist                                                              |
| `openspec/config.yaml`                                | Add `app/design-system/` & `_docs/design/` context, UI rules, and upgraded Gate 9 definition                            |
| `.github/agents/spec-writer.agent.md`                 | Require `DESIGN.md` references, UI states, breakpoints, keyboard flows, and missing-token flagging in `design.md`       |
| `.github/agents/sdd-implementer.agent.md`             | Upgrade Gate 9 to run `yarn test:design`, `yarn design:check`, interactive checks, and visual parity                    |
| `.github/agents/test-writer.agent.md`                 | Document Playwright design-system/a11y helpers for E2E specs                                                            |
| `.github/agents/tdd-test-writer.agent.md`             | Include accessible-role and semantic-token assertions for presentation tests                                            |
| `.github/skills/anti-pattern-check/SKILL.md`          | Add Design System & Accessibility anti-pattern checks                                                                   |
| `.github/skills/code-review/SKILL.md`                 | Add Design System & Accessibility code review checklist                                                                 |
| `.github/agents/README.md`                            | List `design-system-check/SKILL.md` in the Skills table                                                                 |
| `_docs/workflows/openspec.md`                         | Update Gate 9 table, skills table, and useful commands                                                                  |
| `.github/workflows/design-system-check.yml`           | Lightweight GitHub Actions PR workflow running `yarn test:design`                                                       |
| `example.env`                                         | Document optional `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` override for `yarn design:check`                                |

## Capabilities

### New Capabilities

- `design-system-quality-gates`: Automated static Vitest guards, Playwright WCAG 2.2 AA / layout / keyboard audit helpers, a Gate 9 CLI runner (`yarn design:check`) scoped to `<main>` by default, OpenSpec workflow/skill/agent enforcement, and a lightweight PR CI check.

### Modified Capabilities

- `design-system-components`: Adds static source constraints forbidding non-Lucide icon libraries, hardcoded hex color literals, `tokens.css` primitive `--color-*` variables, and em-dashes in JSX UI copy across `app/design-system/components/`.

## Impact

- **Database migration**: None required.
- **Auth / multi-tenancy**: Not security-sensitive; touches no loaders, actions, models, or tenant queries.
- **Test approach**: Vitest unit tests (`yarn test:design` and `yarn vitest run tests/unit/`) plus Playwright CLI smoke verification against local valid and intentionally failing HTML fixtures (no DB required).
- **Branch coordination**: Branched independently from `dev`. `tokenSync.test.ts` checks `_docs/design/tokens.{css,json}` and `app/styles/fonts.css` once `feature/integrate-delta-design` is merged into `dev`, and passes cleanly without false failures beforehand.
