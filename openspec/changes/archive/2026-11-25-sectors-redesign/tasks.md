# Tasks

## 1. Permission & Tree Helpers (TDD)

- [x] 1.1 Write failing unit tests in `tests/unit/routes/settings-sectors.test.ts` covering `ManageSectorSettings` permission (`admin` granted; `data-viewer`, `data-collector`, `data-validator` denied) and pure tree helpers (`buildSectorTree` localized sibling sorting & orphan handling, `filterSectorTree` name-only case-insensitive matching & parent-match child retention, `collectBranchIds`, `countTreeNodes`). Verify failure with `yarn vitest run tests/unit/routes/settings-sectors.test.ts`.
- [x] 1.2 Add `ManageSectorSettings` to `PermissionId`, `permissions(ctx)` (`role: "admin"`), and `roles.admin` in `app/frontend/user/roles.ts`, and implement `app/frontend/sectorsTree.ts`. Verify green with `yarn vitest run tests/unit/routes/settings-sectors.test.ts`.

## 2. Reusable `TreeList` Design-System Primitive (TDD)

- [x] 2.1 Write failing DOM interaction tests in `tests/unit/design-system/treeList.dom.test.tsx` covering `TreeList` rendering, branch expand/collapse via chevron and row activation, keyboard navigation, indentation levels, empty state, and optional `renderActions` slot. Verify failure with `yarn vitest run tests/unit/design-system/treeList.dom.test.tsx`.
- [x] 2.2 Implement `app/design-system/components/TreeList.tsx` using `react-aria-components` (`Tree`, `TreeItem`, `TreeItemContent`, `Button` with `slot="chevron"`), `lucide-react` `ChevronRight`, and semantic DELTA tokens, and export it from `app/design-system/components/index.ts`. Verify green with `yarn vitest run tests/unit/design-system/treeList.dom.test.tsx tests/unit/design-system/components/imports.test.ts`.

## 3. Sectors Settings Page & Route Migration (TDD)

- [x] 3.1 Write failing DOM interaction tests in `tests/dom/sectors-page.dom.test.tsx` covering header/subtitle, absence of `NavSettings` and Tree/Table tabs, default level-1 expansion, level label rendering (`Type`, `Sector`, `Sub-sector`, `Category`), live name-only search (auto-expanding branches, retaining matching parent's children, ignoring description-only matches), disabled `Expand all` / `Collapse all` while searching, restoration of prior expansion on clear, empty search state, empty catalog state, and footer count copy. Verify failure with `yarn vitest run tests/dom/sectors-page.dom.test.tsx`.
- [x] 3.2 Implement `app/pages/SectorsPage.tsx` using `TreeList`, `Button`, `TextField` from `~/design-system/components` and `app/frontend/sectorsTree.ts`, matching the `features/sectors/` prototype `<main>` design.
- [x] 3.3 Update `app/routes/$lang+/settings+/sectors.tsx` to export `meta`, guard `loader` with `authLoaderWithPerm("ManageSectorSettings", ...)`, query localized `name` and `description` ordered by localized `name`, remove `NavSettings`, `MainContainer`, and all PrimeReact imports, and render `<SectorsPage />`. Verify green with `yarn vitest run tests/dom/sectors-page.dom.test.tsx tests/unit/routes/settings-sectors.test.ts`.
- [x] 3.4 Run `yarn i18n:extractor` and verify all new translation keys in `locales/app/` are extracted cleanly.

## 4. Automated WCAG 2.2 AA & Prototype Parity E2E Test

- [x] 4.1 Add `tests/e2e/sectors-settings-a11y.spec.ts` verifying `/en/settings/sectors` as admin with `axe-core` WCAG 2.2 AA (`tests/e2e/helpers/a11y.ts`), keyboard navigation, and desktop/mobile screenshots saved under `test-results/gate-9/sectors-redesign/`. Run with `yarn test:e2e tests/e2e/sectors-settings-a11y.spec.ts`.

## 5. Quality Gates & Regression

- [x] 5.1 Quality gate 1 of 10: Run `yarn vitest run tests/unit/routes/settings-sectors.test.ts tests/unit/design-system/treeList.dom.test.tsx tests/dom/sectors-page.dom.test.tsx tests/unit/design-system/components/imports.test.ts` — all tests green after refactor.
- [x] 5.2 Quality gate 2 of 10: Run `yarn tsc` — zero TypeScript errors.
- [x] 5.3 Quality gate 3 of 10: Run `npx prettier --check app/frontend/user/roles.ts app/frontend/sectorsTree.ts app/design-system/components/TreeList.tsx app/design-system/components/index.ts app/pages/SectorsPage.tsx app/routes/$lang+/settings+/sectors.tsx tests/unit/routes/settings-sectors.test.ts tests/unit/design-system/treeList.dom.test.tsx tests/dom/sectors-page.dom.test.tsx tests/e2e/sectors-settings-a11y.spec.ts` — Prettier clean.
- [x] 5.4 Quality gate 4 of 10: Anti-pattern review against `.github/skills/anti-pattern-check/SKILL.md`.
- [x] 5.5 Quality gate 5 of 10: SOLID review — invoke `solid-reviewer` agent on changed files.
- [x] 5.6 Quality gate 6 of 10: Documentation review — full-diff sweep via a fresh subagent confirming comments explain WHY not WHAT.
- [x] 5.7 Quality gate 7 of 10: Project conventions review against `.github/copilot-instructions.md`.
- [x] 5.8 Quality gate 8 of 10: Code review — run `.github/skills/code-review/SKILL.md` in full via a fresh subagent.
- [x] 5.9 Quality gate 9 of 10: Design system, accessibility & prototype parity review — run Gate 9a (`yarn check:design-system` + `.github/skills/design-system-check/SKILL.md`), Gate 9b (WCAG 2.2 AA axe-core + keyboard checks), and Gate 9c (prototype parity screenshots in `test-results/gate-9/sectors-redesign/` and audit report in `openspec/changes/sectors-redesign/evidence/gate-9-report.md` via a fresh subagent).
- [x] 5.10 Quality gate 10 of 10: Independent second-opinion review (skipped — Claude Code-only gate; full independent audit performed by fresh `research` subagent).
- [x] 5.11 Mandatory regression: Run `yarn test:run2` (full PGlite + DOM suite) and confirm zero new failures.

## Workflow follow-up

- Run `/opsx:archive` on the same feature branch after all tasks and quality gates pass, before raising the PR targeting `dev`.
