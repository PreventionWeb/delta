# Tasks

## 1. Repository Search, Sorting & Pagination (TDD)

- [x] 1.1 Write failing PGlite integration tests in `tests/integration/db/queries/userCountryAccounts.test.ts` covering tenant-scoped unified `search` (first name, last name, full name, email, organization name, wildcard escaping), `role` filter, full-list `sort` (`name`, `status`, `org`, `role`, `added`) + `dir` (`asc`/`desc`), default `added` desc ordering, and pagination boundaries; verify failure with `yarn vitest run tests/integration/db/queries/userCountryAccounts.test.ts`
- [x] 1.2 Implement `AccessManagementSortColumn`, `SortDirection`, `AccessManagementListFilters`, and the joined tenant-scoped query in `app/db/queries/userCountryAccountsRepository.ts` (`getUserCountryAccountsWithUserByCountryAccountsId`), refactoring for clarity; verify green with `yarn vitest run tests/integration/db/queries/userCountryAccounts.test.ts`

## 2. Reusable DELTA Design System v0.7.2 Primitives (`app/design-system/ui/`) (TDD)

- [x] 2.1 Write failing DOM interaction tests in `tests/dom/design-system-ui.test.tsx` covering `Button`, `ModalDialog` (`isDismissable={false}`, Escape/Cancel/Close dismissal, focus return), `TextField`, `SelectField` (form select + filter select), `SortableTable` (sort toggles, non-sortable columns), `Pagination` (`25`/`50`/`100`, boundary disabled states), `StatusIndicator`, `Tooltip`, and `ToastRegion`; verify failure with `yarn vitest run --config vitest.dom.config.ts tests/dom/design-system-ui.test.tsx`
- [x] 2.2 Implement the reusable semantic-token React Aria primitives under `app/design-system/ui/` (`Button.tsx`, `ModalDialog.tsx`, `TextField.tsx`, `SelectField.tsx`, `SortableTable.tsx`, `Pagination.tsx`, `StatusIndicator.tsx`, `Tooltip.tsx`, `ToastRegion.tsx`, `index.ts`) with zero PrimeReact imports and zero hardcoded hex/`--color-*` values, leaving `app/design-system/components/` unchanged; verify green with `yarn vitest run --config vitest.dom.config.ts tests/dom/design-system-ui.test.tsx` and `yarn test:design`

## 3. Route Loader & Fetcher-Compatible Action Endpoints (TDD)

- [x] 3.1 Write failing route tests in `tests/integration/routes/access-management-routes.test.ts` verifying `_layout.tsx` URL param parsing (`search`, `role`, `sort`, `dir`, `page`, `pageSize` defaulting to `25` with safe fallbacks) and JSON `AccessManagementActionResult` responses for fetcher POST requests to `new.tsx`, `edit.$id.tsx`, `delete.$id.tsx`, and `resend-invitation.$id.tsx` (including optional `organization`, `InviteUsers`/`EditUsers` permission enforcement, and primary admin rejection); verify failure with `yarn vitest run tests/integration/routes/access-management-routes.test.ts`
- [x] 3.2 Update `app/routes/$lang+/settings+/access-mgmnt+/_layout.tsx`, `new.tsx`, `edit.$id.tsx`, `delete.$id.tsx`, and `resend-invitation.$id.tsx` to support search/sort/pagination params and fetcher JSON responses while preserving existing `authLoaderWithPerm`/`authActionWithPerm` guards and redirect fallback; verify green with `yarn vitest run tests/integration/routes/access-management-routes.test.ts`

## 4. Access Management `<main>` Screen, Dialogs & Toast Feedback (TDD)

- [x] 4.1 Write failing DOM interaction tests in `tests/dom/access-management.test.tsx` covering removal of `NavSettings`/duplicate header/user-count/status-legend, search + role filter + role capability helper + `Clear filters`, sorting, pagination, pending user email fallback in Name and Delete dialog, `"-"` empty organization display, CSS sentence-case role styling, `(Primary Admin)` protection, Invite/Edit/Delete React Aria modals (no outside-click dismiss, validation errors clear on edit, `"No organization"` clears org, `"System Admin"` Added by), one-click row Resend, and named toast messages; verify failure with `yarn vitest run --config vitest.dom.config.ts tests/dom/access-management.test.tsx`
- [x] 4.2 Implement the redesigned `<main>` UI in `app/pages/AccessManagementPage.tsx` using `app/design-system/ui/` components and `useFetcher` calls to child routes, extract new/updated i18n keys via `yarn i18n:extractor`, and verify green with `yarn vitest run --config vitest.dom.config.ts tests/dom/access-management.test.tsx`

## 5. End-to-End & Accessibility Verification (TDD)

- [x] 5.1 Write Playwright E2E and WCAG 2.2 AA accessibility tests in `tests/e2e/access-management.spec.ts` using `tests/e2e/helpers/a11y.ts` covering desktop (1280px), tablet (768px), and mobile (375px) layouts, keyboard-only walk-through, modal focus trapping and non-backdrop dismissal, and axe-core WCAG 2.0/2.1/2.2 A and AA checks; verify green with `yarn test:e2e tests/e2e/access-management.spec.ts`

## 6. Quality Gates (1–10) & Regression Suite

- [x] 6.1 Quality gate 1 of 10: Run all change-scoped Vitest suites (`yarn vitest run tests/integration/db/queries/userCountryAccounts.test.ts tests/integration/routes/access-management-routes.test.ts` and `yarn vitest run --config vitest.dom.config.ts tests/dom/design-system-ui.test.tsx tests/dom/access-management.test.tsx`) and verify all tests pass
- [x] 6.2 Quality gate 2 of 10: Run `yarn tsc` and verify zero TypeScript errors
- [x] 6.3 Quality gate 3 of 10: Run `npx prettier --check` on all modified/created files (fixing with `npx prettier --write <files>` if needed) and verify clean formatting
- [x] 6.4 Quality gate 4 of 10: Anti-pattern review — check `.github/skills/anti-pattern-check/SKILL.md` against all changed files and verify zero violations
- [x] 6.5 Quality gate 5 of 10: SOLID review — invoke `solid-reviewer` agent on changed files and resolve any findings
- [x] 6.6 Quality gate 6 of 10: Documentation review — run a full-diff sweep via a fresh subagent confirming comments explain WHY not WHAT and are concise
- [x] 6.7 Quality gate 7 of 10: Project conventions review — check `.github/copilot-instructions.md` (multi-tenancy, auth wrappers, i18n keys, `.server` boundaries, semantic tokens) and verify compliance
- [x] 6.8 Quality gate 8 of 10: Code review — run `.github/skills/code-review/SKILL.md` in full via a fresh subagent and resolve findings
- [x] 6.9 Quality gate 9 of 10: Design system, accessibility & prototype parity review (required: touches `app/design-system/`, `app/routes/`, `app/pages/`) — run Gate 9a (`yarn check:design-system` + `.github/skills/design-system-check/SKILL.md`), Gate 9b (automated WCAG 2.2 AA axe-core and keyboard walk-through via `tests/e2e/helpers/a11y.ts`), and Gate 9c (parity audit against `unisdr/delta-feature-prototypes` `features/access-management` at `239cd12e413fd096aa69a0a715333c09cfc8341a`), saving screenshots in `test-results/gate-9/access-management-redesign/` and the audit report in `openspec/changes/access-management-redesign/evidence/gate-9-report.md` reviewed by a fresh subagent
- [x] 6.10 Quality gate 10 of 10: Independent second-opinion review (Claude Code high-effort second fresh subagent, or equivalent platform feature / explicit skip note if unsupported)
- [x] 6.11 Mandatory regression suite: Run `yarn test:run2` (full PGlite suite) and `yarn test:dom` and verify zero new failures (confirming any pre-existing failures explicitly)

## Workflow follow-up

- Human review of `proposal.md`, `specs/`, `design.md`, and `tasks.md`, and approval of `feature-prototype.status: required -> approved` in `design.md` before running `/opsx:apply`.
- Human review of the final diff and `openspec/changes/access-management-redesign/evidence/gate-9-report.md` after all quality gates pass.
- Run `/opsx:archive` on the same branch before raising the PR.
