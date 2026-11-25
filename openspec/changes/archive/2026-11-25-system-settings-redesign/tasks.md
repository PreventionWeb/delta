# Tasks

## 1. Tenant-Scoped Repository & Service Validation (TDD)

- [x] 1.1 Write failing PGlite integration tests in `tests/integration/db/queries/instanceSystemSettingRepository.test.ts` covering `InstanceSystemSettingRepository.updateByCountryAccountId` (updates active tenant row, preserves other tenants' rows, returns `null` when tenant has no settings row) and `SettingsService.updateSettings` (rejects empty `instanceName`, rejects `instanceName` > 50 characters, rejects unsupported `language`, trims `instanceName`, updates only the active tenant); verify failure with `yarn vitest run tests/integration/db/queries/instanceSystemSettingRepository.test.ts`
- [x] 1.2 Implement `InstanceSystemSettingRepository.updateByCountryAccountId` in `app/db/queries/instanceSystemSettingRepository.ts` and update `SettingsService.updateSettings` (`INSTANCE_NAME_MAX_LENGTH = 50`, session `countryAccountsId` scoping) in `app/services/settingsService.ts`; verify green with `yarn vitest run tests/integration/db/queries/instanceSystemSettingRepository.test.ts`

## 2. Reusable `FormSelect` `helpText` Support (TDD)

- [x] 2.1 Write failing DOM interaction tests in `tests/dom/system-settings.dom.test.tsx` (or `tests/dom/design-system-ui.dom.test.tsx`) verifying `FormSelect` renders `helpText` via `<Text slot="description">` when no `errorMessage` is set and replaces `helpText` with `FieldError` when `errorMessage` is active; verify failure with `yarn vitest run tests/dom/system-settings.dom.test.tsx`
- [x] 2.2 Add optional `helpText?: string` prop to `FormSelect` in `app/design-system/components/SelectField.tsx` using semantic tokens only (`text-label text-fg-2`); verify green with `yarn vitest run tests/dom/system-settings.dom.test.tsx`

## 3. Permission-Guarded Route Loader & Action (TDD)

- [x] 3.1 Write failing route integration tests in `tests/integration/routes/systemSettingsRoute.test.ts` verifying `system.tsx` exports `handle = { useDesignSystemCanvas: true }`, `loader` requires `ManageCountrySettings`, `action` uses `authActionWithPerm("ManageCountrySettings")` (rejecting `EditData`-only users), ignores any client-supplied `id` in favor of session `countryAccountsId`, enforces the 50-character `instanceName` limit, and returns typed `SystemSettingsActionResult` JSON; verify failure with `yarn vitest run tests/integration/routes/systemSettingsRoute.test.ts`
- [x] 3.2 Add `app/frontend/systemSettingsAction.ts` and update `app/routes/$lang+/settings+/system.tsx` to export `handle = { useDesignSystemCanvas: true }`, replace `authLoaderWithPerm("EditData")` on `action` with `authActionWithPerm("ManageCountrySettings")`, scope updates to session `countryAccountsId`, remove PrimeReact/`MainContainer`/`NavSettings`, and render `<SystemSettingsPage />`; verify green with `yarn vitest run tests/integration/routes/systemSettingsRoute.test.ts`

## 4. System Settings `<main>` Screen, Edit Modal & Toast Feedback (TDD)

- [x] 4.1 Expand failing DOM interaction tests in `tests/dom/system-settings.dom.test.tsx` covering: no `NavSettings`/`MainContainer`/PrimeReact, four stacked groups (`Instance`, `Country`, `Email`, `Software`) with exact headings/subtitles/row order, `Edit` button in `Instance` header, `Intl.DisplayNames` language display, raw DB `Type`/`Currency` values, `SMTP` transport + conditional SMTP rows, `tabular-nums` on `Port` and version, `Edit instance settings` modal (`isDismissable={false}`, Escape/Cancel/Close dismissal, helper texts, `"Changes apply the next time you sign in."`, inline empty and >50-char validation clearing on edit, server error callout), and `"Settings saved. They apply the next time you sign in."` toast; verify failure with `yarn vitest run tests/dom/system-settings.dom.test.tsx`
- [x] 4.2 Implement `app/pages/SystemSettingsPage.tsx` using `~/design-system/components` (`Button`, `ModalDialog`, `TextField`, `FormSelect`, `Callout`, `ToastRegion`) and `useFetcher`, extract new/updated i18n keys via `yarn i18n:extractor`, and verify green with `yarn vitest run tests/dom/system-settings.dom.test.tsx`

## 5. End-to-End & WCAG 2.2 AA Verification (TDD)

- [x] 5.1 Write Playwright E2E and WCAG 2.2 AA accessibility tests in `tests/e2e/system-settings.spec.ts` using `tests/e2e/helpers/a11y.ts` covering desktop (`1280px`), tablet (`768px`), and mobile (`375px`) layouts, keyboard-only walk-through, modal focus trapping and non-backdrop dismissal, edit/validation/save toast flow, and axe-core WCAG 2.0/2.1/2.2 A and AA checks on `<main>` and `[role="dialog"]`; verify green with `yarn test:e2e tests/e2e/system-settings.spec.ts`

## 6. Quality Gates (1-10) & Regression Suite

- [x] 6.1 Quality gate 1 of 10: Run all change-scoped Vitest suites (`yarn vitest run tests/integration/db/queries/instanceSystemSettingRepository.test.ts tests/integration/routes/systemSettingsRoute.test.ts tests/dom/system-settings.dom.test.tsx`) and verify all tests pass
- [x] 6.2 Quality gate 2 of 10: Run `yarn tsc` and verify zero TypeScript errors
- [x] 6.3 Quality gate 3 of 10: Run `npx prettier --check` on all modified/created files (fixing with `npx prettier --write <files>` if needed) and verify clean formatting
- [x] 6.4 Quality gate 4 of 10: Anti-pattern review — check `.github/skills/anti-pattern-check/SKILL.md` against all changed files and verify zero violations
- [x] 6.5 Quality gate 5 of 10: SOLID review — invoke `solid-reviewer` agent on changed files and resolve any findings
- [x] 6.6 Quality gate 6 of 10: Documentation review — run a full-diff sweep via a fresh subagent confirming comments explain WHY not WHAT and are concise
- [x] 6.7 Quality gate 7 of 10: Project conventions review — check `.github/copilot-instructions.md` (multi-tenancy, `authActionWithPerm`, i18n keys, `.server` boundaries, semantic tokens) and verify compliance
- [x] 6.8 Quality gate 8 of 10: Code review — run `.github/skills/code-review/SKILL.md` in full via a fresh subagent and resolve findings
- [x] 6.9 Quality gate 9 of 10: Design system, accessibility & prototype parity review (required: touches `app/design-system/`, `app/routes/`, `app/pages/`) — run Gate 9a (`yarn check:design-system --verify-spec --change system-settings-redesign` and `yarn check:design-system --change system-settings-redesign` + `.github/skills/design-system-check/SKILL.md`), Gate 9b (automated WCAG 2.2 AA axe-core and keyboard walk-through via `tests/e2e/helpers/a11y.ts`), and Gate 9c (parity audit against `unisdr/delta-feature-prototypes` `features/system-settings` at `e24b8ad4dee319d5efa2a7c57fca30948f130bd0`), saving screenshots in `test-results/gate-9/system-settings-redesign/` and the audit report in `openspec/changes/system-settings-redesign/evidence/gate-9-report.md` reviewed by a fresh subagent
- [x] 6.10 Quality gate 10 of 10: Independent second-opinion review (second fresh subagent or explicit skip note if unsupported)
- [x] 6.11 Mandatory regression suite: Run `yarn test:run2` (full PGlite + dom suite) and verify zero new failures (confirming any pre-existing failures explicitly)

## Workflow follow-up

- Human review of `proposal.md`, `specs/`, `design.md`, and `tasks.md`, and approval of `feature-prototype.status: required -> approved` in `design.md` before running `/opsx:apply`.
- Human review of the final diff and `openspec/changes/system-settings-redesign/evidence/gate-9-report.md` after all quality gates pass.
- Run `/opsx:archive` on the same branch before raising the PR.
