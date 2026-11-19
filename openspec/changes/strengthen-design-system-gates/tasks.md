# Tasks

## 1. Dependencies & Scripts

- [x] 1.1 Install `@axe-core/playwright` as a `devDependency` and add `"test:design"` and `"design:check"` scripts to `package.json`.

## 2. Red Phase — Failing Tests First

- [x] 2.1 Write failing unit tests in `tests/unit/design-system/designSystemChecks.test.ts` covering `WCAG_22_AA_TAGS`, `BREAKPOINTS`, `formatAxeViolations()`, and `parseDesignCheckArgs()` (default `<main>` scope, `--full-page`, `--screenshots`, `--help`, missing/invalid `--url`). Run `yarn vitest run tests/unit/design-system/designSystemChecks.test.ts` and confirm failure.
- [x] 2.2 Write failing unit tests in `tests/unit/design-system/tokenSync.test.ts` covering `validateTokenSync()` against temp fixtures (complete sync, missing `@theme` mapping, version mismatch, missing font file, and graceful skip when `_docs/design/` is absent) plus repo-root check when `_docs/design/` exists. Run `yarn vitest run tests/unit/design-system/tokenSync.test.ts` and confirm failure.
- [x] 2.3 Extend `tests/unit/design-system/components/imports.test.ts` with static checks for Lucide-only icons, no hardcoded hex colors, no `tokens.css` primitive `--color-*` tokens, and no em-dashes in JSX copy (plus unit tests for the check helpers on synthetic violating snippets).

## 3. Green Phase — Runtime Audit Tooling & Helpers

- [x] 3.1 Implement `tests/e2e/helpers/designSystemChecks.ts` exporting `WCAG_22_AA_TAGS`, `BREAKPOINTS`, `formatAxeViolations`, `attachErrorCollector`, `assertWcag22AA` (defaulting to `<main>` with `fullPage` opt-in), `assertNoHorizontalOverflow`, `assertTargetSizesAndLabels`, `assertFocusNotObscured`, and `assertRowCursorSemantics`.
- [x] 3.2 Implement `scripts/check-design-a11y.ts` (`yarn design:check`) exporting `parseDesignCheckArgs` and running the multi-viewport Playwright audit (`375x812`, `768x1024`, `1280x900`) with optional login and screenshot capture.
- [x] 3.3 Implement `validateTokenSync` helper (`tests/unit/design-system/tokenSync.test.ts`) and verify `yarn test:design` passes all tests.

## 4. OpenSpec Workflow, Skills, Agents & PR CI

- [x] 4.1 Create `.github/skills/design-system-check/SKILL.md` documenting static, automated Playwright (`yarn design:check`), interactive state, and manual WCAG 2.2 AA / `DESIGN.md` checks.
- [x] 4.2 Update `openspec/config.yaml` with `app/design-system/` and `_docs/design/` context, UI rules for proposal/specs/design, and upgraded Gate 9.
- [x] 4.3 Update `.github/agents/spec-writer.agent.md`, `.github/agents/sdd-implementer.agent.md`, `.github/agents/test-writer.agent.md`, and `.github/agents/tdd-test-writer.agent.md`.
- [x] 4.4 Update `.github/skills/anti-pattern-check/SKILL.md`, `.github/skills/code-review/SKILL.md`, `.github/agents/README.md`, and `_docs/workflows/openspec.md`.
- [x] 4.5 Create lightweight PR CI workflow `.github/workflows/design-system-check.yml` running `yarn test:design` on PRs touching design-system, styles, or `_docs/design/**`.

## 5. Verification & Quality Gates

- [x] 5.1 Quality gate 1 of 10: `yarn test:design` and `yarn vitest run tests/unit/` — tests green after refactor.
- [x] 5.2 Quality gate 2 of 10: `yarn tsc` — zero TypeScript errors.
- [x] 5.3 Quality gate 3 of 10: `npx prettier --check <changed-files>` — Prettier clean.
- [x] 5.4 Quality gate 4 of 10: Anti-pattern review — check `.github/skills/anti-pattern-check/SKILL.md`.
- [x] 5.5 Quality gate 5 of 10: SOLID review — verify helper modularity (SRP/DIP).
- [x] 5.6 Quality gate 6 of 10: Documentation review — comments explain WHY not WHAT, concise and accurate.
- [x] 5.7 Quality gate 7 of 10: Project conventions review — check `.github/copilot-instructions.md` and cross-tool compatibility.
- [x] 5.8 Quality gate 8 of 10: Code review — run `.github/skills/code-review/SKILL.md` checklist in full.
- [x] 5.9 Quality gate 9 of 10: CLI smoke test (`yarn design:check --help` plus running `yarn design:check` against local compliant and non-compliant HTML fixtures; no app route UI modified, so visual parity skipped explicitly).
- [x] 5.10 Quality gate 10 of 10: Independent second-opinion review (skipped — Claude Code only).
- [x] 5.11 Regression check: verify `yarn test:design` and `yarn vitest run tests/unit/` pass with zero regressions.
- [ ] 5.12 Archive: run `opsx:archive` on this branch after human diff review, before raising PR targeting `dev`.
