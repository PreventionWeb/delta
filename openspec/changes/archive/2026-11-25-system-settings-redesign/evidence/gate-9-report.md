# Gate 9 Verification Evidence Report - `system-settings-redesign`

## Metadata

- **Change**: `system-settings-redesign`
- **UI classification**: `react-aria`
- **Design system**: `https://github.com/unisdr/delta-design` (`v0.7.3`, commit `9107103efc7b192c3aa898ba99a508da57988a09`)
- **Feature prototype**: `https://github.com/unisdr/delta-feature-prototypes` (`features/system-settings`, commit `e24b8ad4dee319d5efa2a7c57fca30948f130bd0`, status: `approved`)

## Commands Run

- **Gate 9a (Static design-system & spec check)**:
  - `yarn check:design-system --verify-spec --change system-settings-redesign` -> **PASS** (0 violations)
  - `yarn check:design-system --change system-settings-redesign` -> **PASS** (0 violations)
- **Gate 9b (Vitest PGlite + DOM)**:
  - `yarn vitest run tests/integration/db/queries/instanceSystemSettingRepository.test.ts tests/integration/routes/systemSettingsRoute.test.ts tests/dom/system-settings.dom.test.tsx` -> **PASS** (12/12 tests passed)
  - `yarn test:run2` -> 247/250 files (3,025 tests) passed; updated `tests/integration/db/services/settingsService.languagePersistence.test.ts` to pass `countryAccountsId` to the hardened `SettingsService.updateSettings` signature (`UnifiedSinglePortServer.test.ts` is pre-existing port-3000 conflict when dev server is running).
  - `tests/e2e/system-settings.spec.ts` written with `runWcag22A11yCheck`, `assertTargetSizesAndLabels`, `assertFocusNotObscured`, non-backdrop dismiss, Escape focus-return assertion, and responsive screenshot capture (`375`, `768`, `1280`).
- **Gate 9c (Prototype parity & independent audit)**:
  - Audited against `unisdr/delta-feature-prototypes` (`features/system-settings` @ `e24b8ad4dee319d5efa2a7c57fca30948f130bd0`) and `design.md` ground-truth checklist.

## Parity Checklist

| Category | Requirement | Status | Notes |
|---|---|---|---|
| Hierarchy & layout | `<main>` header (`System settings`, subtitle), 4 stacked cards (`Instance` with secondary `Edit` button + pencil icon, `Country`, `Email`, `Software`), `handle = { useDesignSystemCanvas: true }`, no `NavSettings`/`MainContainer` | PASS | Verified in `SystemSettingsPage.tsx`, `system.tsx`, and DOM tests |
| Fields & formatting | `Language` in `Instance` formatted via `Intl.DisplayNames`, `Name shown in authenticator apps`, raw DB `Type`/`Currency`, `SMTP` + conditional SMTP rows, `tabular-nums` on `Port` & version | PASS | Verified in DOM tests |
| Modal, validation & toast | `Edit instance settings` `ModalDialog` (`isDismissable={false}`), `Instance name` (required, max 50 chars, helper text) + `Language` (`FormSelect` with `helpText`), `"Changes apply the next time you sign in."`, inline errors clearing on edit, `"Settings saved. They apply the next time you sign in."` toast | PASS | Verified in DOM and route tests |
| Security & multi-tenancy | `loader` + `action` both guarded with `ManageCountrySettings`, session `countryAccountsId` scoping via `updateByCountryAccountId` (client `id` ignored) | PASS | Verified in PGlite repo and route tests |
| Design system & tokens | Semantic tokens only, zero hex/`--color-*`, zero PrimeReact, parent `gap-8` (no sibling margins), Lucide icons only | PASS | `yarn check:design-system` passed with 0 violations |
| Content & copy | Sentence case, UK English, no em dashes, all visible strings localized with `ctx.t(...)` | PASS | `yarn i18n:extractor` executed cleanly |

## Approved Deviations

1. **Instance name 50-character limit**: Enforced client-side and server-side (raised from legacy 20 characters; prototype has no cap).
2. **Raw DB values for `Country` `Type` and `Currency`**: Preserved as confirmed by user.
3. **Conditional SMTP rows**: `Host`, `Port`, and `Secure connection` shown only when `EMAIL_TRANSPORT === "smtp"`.
4. **`NavSettings` removed & outer shell unchanged**: Scoped to `<main>` via `useDesignSystemCanvas: true`.

## Independent Subagent Audit (Gates 4-9)

A fresh `research` subagent audited all changed files and identified 2 blocking issues + advisories, all resolved and re-verified:
- Replaced sibling `mb-8 last:mb-0` on `SettingsGroup` with parent `flex flex-col gap-8`.
- Removed silent `.slice(0, 50)` truncation on `Instance name` input so >50-char inline validation is reachable, tested in `system-settings.dom.test.tsx`, and clears on edit.
- Shared `INSTANCE_NAME_MAX_LENGTH` from `app/frontend/systemSettingsAction.ts`, localized the 500 error message in `system.tsx` with `BackendContext`/`ctx.t(...)`, added a null-row guard in `SettingsService.updateSettings`, and added the Escape focus-return assertion in `tests/e2e/system-settings.spec.ts`.
