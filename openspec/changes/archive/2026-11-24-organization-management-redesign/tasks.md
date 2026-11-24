# Tasks

## 1. Repository Query, User Counts & Duplicate Validation (`OrganizationRepository` & `OrganizationService`)

- [x] 1.1 Write failing PGlite integration tests in `tests/integration/db/queries/organizationRepository.test.ts` covering `listByCountryAccountsId` (per-organization tenant-scoped user count, escaped `%`/`_`/`\` `ILIKE` search on `name`, SQL sorting by `name` and `users` asc/desc, clamped pagination, `existingNames`, strict `countryAccountsId` isolation), case-insensitive `getByNameAndCountryAccountsId`, and UUID guard in `getById`; verify tests fail (`yarn vitest run tests/integration/db/queries/organizationRepository.test.ts`)
- [x] 1.2 Implement the updated `OrganizationRepository` queries and `OrganizationService` (`getOrganizationsPageData` defaults `name` asc / `pageSize=25`, case-insensitive duplicate validation, structured `fieldErrors`) in `app/db/queries/organizationRepository.ts` and `app/services/organizationService.ts`; verify `yarn vitest run tests/integration/db/queries/organizationRepository.test.ts` passes

## 2. Route Loaders, Actions & Security Hardening (`app/routes/$lang+/settings+/organizations+/`)

- [x] 2.1 Write failing Vitest tests in `tests/integration/routes/organizationsRoutes.test.ts` covering `parseOrganizationsQuery` defaults and fallbacks (`search`, `sort`, `dir`, `page`, `pageSize`), `authLoaderWithPerm("ManageOrganizations")` enforcement across `_layout.tsx`/`edit.$id.tsx`/`delete.$id.tsx`, cross-tenant and malformed-UUID 404 responses, case-insensitive duplicate rejection, and dual JSON fetcher responses; verify tests fail (`yarn vitest run tests/integration/routes/organizationsRoutes.test.ts`)
- [x] 2.2 Create `app/frontend/organizationAction.ts` and update `_layout.tsx`, `new.tsx`, `edit.$id.tsx`, and `delete.$id.tsx` under `app/routes/$lang+/settings+/organizations+/`; verify `yarn vitest run tests/integration/routes/organizationsRoutes.test.ts` passes

## 3. Organization Management `<main>` Presentation (`app/pages/OrganizationManagementPage.tsx`), `TextField` & i18n

- [x] 3.1 Write failing jsdom interaction tests in `tests/dom/organization-management.dom.test.tsx` covering header/subtitle, debounced `Search by name` + `Clear search` empty state, zero-org empty state, sortable `Name` and `Users` columns, pagination (`25`/`50`/`100`, noun `organizations`), `Add organization` and `Edit organization` dialogs (Enter-to-submit, inline empty/duplicate validation clearing on edit, toasts), `Delete organization` alertdialog (both `users > 0` `This organization is in use` single `Close` button and `users === 0` destructive confirmation + toast), non-backdrop dismissal (Escape/Cancel/Close only), and permission gating; verify tests fail (`yarn vitest run tests/dom/organization-management.dom.test.tsx`)
- [x] 3.2 Add optional `autoFocus` prop to `app/design-system/ui/TextField.tsx`, implement `app/pages/OrganizationManagementPage.tsx` without `MainContainer`/`NavSettings` using `app/design-system/ui/` primitives and `ctx.t(...)`, and run `yarn i18n:extractor`; verify `yarn vitest run tests/dom/organization-management.dom.test.tsx` passes

## 4. E2E & Accessibility Verification (`tests/e2e/organization-management.spec.ts`)

- [x] 4.1 Add `tests/e2e/organization-management.spec.ts` covering desktop (1280px), tablet (768px), and mobile (375px) renders, keyboard/modal rules, search, add -> edit -> in-use delete block -> unused delete flow, Gate 9b axe-core WCAG 2.0/2.1/2.2 A & AA checks via `tests/e2e/helpers/a11y.ts`, and Gate 9c parity screenshots in `test-results/gate-9/organization-management-redesign/`; verify `yarn test:e2e tests/e2e/organization-management.spec.ts` passes

## 5. Quality Gates & Regression

- [x] 5.1 Quality gate 1 of 10: Run `yarn vitest run tests/integration/db/queries/organizationRepository.test.ts tests/integration/routes/organizationsRoutes.test.ts tests/dom/organization-management.dom.test.tsx` and confirm all tests pass after any refactor
- [x] 5.2 Quality gate 2 of 10: Run `yarn tsc` and confirm zero TypeScript errors
- [x] 5.3 Quality gate 3 of 10: Run `npx prettier --check` on all modified/added files (fix with `npx prettier --write <files>` if needed)
- [x] 5.4 Quality gate 4 of 10: Anti-pattern review against `.github/skills/anti-pattern-check/SKILL.md`
- [x] 5.5 Quality gate 5 of 10: SOLID review via `solid-reviewer` agent
- [x] 5.6 Quality gate 6 of 10: Documentation review (full-diff sweep by a fresh subagent ensuring comments explain WHY not WHAT)
- [x] 5.7 Quality gate 7 of 10: Project conventions review against `.github/copilot-instructions.md`
- [x] 5.8 Quality gate 8 of 10: Code review via `.github/skills/code-review/SKILL.md` in full using a fresh subagent
- [x] 5.9 Quality gate 9 of 10: Design system, accessibility & prototype parity review — run Gate 9a (`yarn check:design-system --verify-spec --change organization-management-redesign` and `--change organization-management-redesign`), Gate 9b (axe-core & keyboard checks), and Gate 9c (parity audit by a fresh subagent with evidence saved in `openspec/changes/organization-management-redesign/evidence/gate-9-report.md` and screenshots in `test-results/gate-9/organization-management-redesign/`)
- [x] 5.10 Quality gate 10 of 10: Independent second-opinion review (or explicitly skip if not running in Claude Code)
- [x] 5.11 Full PGlite + DOM regression check: run `yarn test:run2` and confirm zero new failures (any pre-existing failures explicitly verified as pre-existing)

## Workflow follow-up

- Run `/opsx:archive` on the same branch after all tasks and quality gates pass, before raising the PR targeting `dev`.
