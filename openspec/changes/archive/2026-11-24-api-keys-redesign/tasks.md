# Tasks

## 1. Repository Query & Duplicate Validation (`ApiKeyRepository`)

- [x] 1.1 Write failing PGlite integration tests in `tests/integration/db/queries/apiKeyRepository.test.ts` covering `listByCountryAccountsId` (sorting by `name`, `managedBy`, `created` asc/desc, pagination boundaries, `existingNames`, strict `countryAccountsId` isolation), `existsByNameInTenant` (case-insensitive trim matching and `excludeId`), and `create()` returning `{ id, name, secret }`; verify the new test file fails before implementation (`yarn vitest run tests/integration/db/queries/apiKeyRepository.test.ts`)
- [x] 1.2 Implement `listByCountryAccountsId`, `existsByNameInTenant`, and extended `create()` returning `{ id, name, secret }` in `app/db/queries/apiKeyRepository.ts`; verify `yarn vitest run tests/integration/db/queries/apiKeyRepository.test.ts` passes

## 2. Reusable v0.7.2 Design-System Primitives (`app/design-system/ui/`)

- [x] 2.1 Write failing jsdom tests in `tests/dom/api-keys-ui-primitives.dom.test.tsx` for `Callout` (`success` with `role="status"`, `error` with `role="alert"`, title + body rendering) and `TextField` (`isReadOnly`, `autoFocus`, `onFocus`); verify the tests fail before implementation (`yarn vitest run tests/dom/api-keys-ui-primitives.dom.test.tsx`)
- [x] 2.2 Implement `app/design-system/ui/Callout.tsx`, extend `app/design-system/ui/TextField.tsx` with `isReadOnly`, `autoFocus`, and `onFocus` (optional `onChange` when read-only), and export `Callout` / `CalloutProps` from `app/design-system/ui/index.ts`; verify `yarn vitest run tests/dom/api-keys-ui-primitives.dom.test.tsx` passes

## 3. Route Loaders, Actions & Security Hardening (`app/routes/$lang+/settings+/api-key+/`)

- [x] 3.1 Write failing Vitest tests in `tests/integration/routes/apiKeysRoutes.test.ts` covering `parseApiKeysQuery` defaults and fallbacks (`sort`, `dir`, `page`, `pageSize`), `new.tsx` duplicate rejection and JSON fetcher response `{ ok: true, key: { id, name, secret } }`, `edit.$id.tsx` loader cross-tenant 404 + duplicate rejection + JSON fetcher response, and `delete.$id.tsx` `authLoaderWithPerm` + cross-tenant 404 + JSON fetcher response; verify tests fail (`yarn vitest run tests/integration/routes/apiKeysRoutes.test.ts`)
- [x] 3.2 Update `app/routes/$lang+/settings+/api-key+/_layout.tsx` to export `parseApiKeysQuery`, call `ApiKeyRepository.listByCountryAccountsId`, and render `ApiKeysPage` without `MainContainer`/`NavSettings`; update `new.tsx`, `edit.$id.tsx`, and `delete.$id.tsx` with server-side duplicate validation, tenant-check/auth-guard fixes, and dual JSON/redirect responses; verify `yarn vitest run tests/integration/routes/apiKeysRoutes.test.ts` passes

## 4. API Keys `<main>` Presentation (`app/pages/ApiKeysPage.tsx`) & i18n

- [x] 4.1 Write failing jsdom interaction tests in `tests/dom/api-keys.dom.test.tsx` covering header/subtitle, sortable columns (`Name`, `Managed by`, `Created`), masked monospace `Key` (`first 5 + …`) + `Copy key` toast `"Key copied."`, pagination (`25`/`50`/`100`, noun `keys`), empty state + secondary `Add API key` button, all 4 dialogs (`Add API key`, `API key created` with read-only full key + copy + `Done`, `Rename API key`, `Delete API key` `alertdialog`), non-backdrop dismissal (Escape/Cancel/X only), inline validation + clear-on-edit, and `canAdd`/`canEdit` gating; verify tests fail (`yarn vitest run tests/dom/api-keys.dom.test.tsx`)
- [x] 4.2 Implement `app/pages/ApiKeysPage.tsx` using `app/design-system/ui/` primitives, `lucide-react` icons, `useFetcher`, `useSearchParams`, and `ctx.t({ code, msg })` strings; run `yarn i18n:extractor` to update locale catalogs; verify `yarn vitest run tests/dom/api-keys.dom.test.tsx` passes

## 5. E2E & Accessibility Verification (`tests/e2e/api-keys.spec.ts`)

- [x] 5.1 Add `tests/e2e/api-keys.spec.ts` covering desktop (1280px), tablet (768px), and mobile (375px) renders, full keyboard navigation across table/dialogs/pagination, add -> reveal -> copy -> rename -> delete flow, Gate 9b axe-core WCAG 2.0/2.1/2.2 A & AA checks via `tests/e2e/helpers/a11y.ts`, and Gate 9c parity screenshots in `test-results/gate-9/api-keys-redesign/`; verify `yarn test:e2e tests/e2e/api-keys.spec.ts` passes

## 6. Quality Gates & Regression

- [x] 6.1 Quality gate 1 of 10: Run `yarn vitest run tests/integration/db/queries/apiKeyRepository.test.ts tests/integration/routes/apiKeysRoutes.test.ts tests/dom/api-keys-ui-primitives.dom.test.tsx tests/dom/api-keys.dom.test.tsx` and confirm all tests pass after any refactor
- [x] 6.2 Quality gate 2 of 10: Run `yarn tsc` and confirm zero TypeScript errors
- [x] 6.3 Quality gate 3 of 10: Run `npx prettier --check` on all modified/added files (fix with `npx prettier --write <files>` if needed)
- [x] 6.4 Quality gate 4 of 10: Anti-pattern review against `.github/skills/anti-pattern-check/SKILL.md`
- [x] 6.5 Quality gate 5 of 10: SOLID review via `solid-reviewer` agent
- [x] 6.6 Quality gate 6 of 10: Documentation review (full-diff sweep by a fresh subagent ensuring comments explain WHY not WHAT)
- [x] 6.7 Quality gate 7 of 10: Project conventions review against `.github/copilot-instructions.md`
- [x] 6.8 Quality gate 8 of 10: Code review via `.github/skills/code-review/SKILL.md` in full using a fresh subagent
- [x] 6.9 Quality gate 9 of 10: Design system, accessibility & prototype parity review — run Gate 9a (`yarn check:design-system` + `.github/skills/design-system-check/SKILL.md`), Gate 9b (axe-core & keyboard checks), and Gate 9c (parity audit by a fresh subagent with evidence saved in `openspec/changes/api-keys-redesign/evidence/gate-9-report.md` and screenshots in `test-results/gate-9/api-keys-redesign/`)
- [x] 6.10 Quality gate 10 of 10: Independent second-opinion review (or explicitly skip if not running in Claude Code)
- [x] 6.11 Full PGlite + DOM regression check: run `yarn test:run2` and confirm zero new failures (any pre-existing failures explicitly verified as pre-existing)

## Workflow follow-up

- Run `/opsx:archive` on the same branch after all tasks and quality gates pass, before raising the PR.
