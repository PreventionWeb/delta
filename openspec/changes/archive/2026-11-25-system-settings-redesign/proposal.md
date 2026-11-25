# Proposal

## Why

The current System settings screen at `/:lang/settings/system` uses legacy `MainContainer`, `NavSettings`, PrimeReact `Dialog`/`InputText`/`Dropdown`/`Button`/`Toast`, and hardcoded `#004F91` colors, groups settings inconsistently without explaining who can change each section, and has two security bugs in its action handler (`authLoaderWithPerm("EditData")` instead of `authActionWithPerm("ManageCountrySettings")`, and updating by client-supplied `id` without session tenant scoping). Applying the approved DELTA Design System (`v0.7.3`) interactive mockup for System settings migrates `<main>` to React Aria Components with semantic tokens, WCAG 2.2 Level AA compliance, clearer four-group organization, and properly permissioned, tenant-scoped updates.

**UI classification**: `react-aria`

**Security-sensitive change**: Yes — fixes a permission and tenant-isolation bug in the `/:lang/settings/system` action handler. The action MUST use `authActionWithPerm("ManageCountrySettings", ...)` (matching the loader) and MUST resolve the target settings row using `countryAccountsId` from the session rather than trusting a client-supplied `id` form field.

**Database migration required**: No. `instance_system_settings.website_name` is already `varchar(250)`, which accommodates the updated 50-character instance name limit without schema changes.

## What Changes

- **System settings `<main>` redesign (`/:lang/settings/system`)**:
  - Export `export const handle = { useDesignSystemCanvas: true };` in `app/routes/$lang+/settings+/system.tsx` so `root.tsx` applies the warm `--bg` canvas and `.ds-scope` (`Inter` font, `4px` spacing unit, `--focus-ring`).
  - Remove `NavSettings`, `MainContainer`, and all PrimeReact imports from `/:lang/settings/system`.
  - Extract presentation into `app/pages/SystemSettingsPage.tsx` rendering the page heading (`System settings`), subtitle (`How this instance of DELTA Resilience is set up.`), and four stacked semantic-token cards (`Instance`, `Country`, `Email`, `Software`) using responsive `<dl>` rows (`220px` label / flexible value on `md+`).
  - Move the `Edit` button (`variant="secondary"` with Lucide `Pencil`) into the `Instance` section header, move `Language` into `Instance`, rename `2FA/TOTP Issuer Name` to `Name shown in authenticator apps` and `Secure` to `Secure connection`, format `Port` and `DELTA Resilience version` with `tabular-nums`, format `EMAIL_TRANSPORT` `"smtp"` as `"SMTP"` (keeping SMTP detail rows conditional on `EMAIL_TRANSPORT === "smtp"`), display languages via `Intl.DisplayNames` while storing locale codes, and keep raw DB values for `Country` `Type` and `Currency`.
- **In-page React Aria `Edit instance settings` modal & toast**:
  - Replace PrimeReact `Dialog` and `Toast` with `ModalDialog` (`isDismissable={false}`, closing only via Cancel, Close, or Escape), `TextField`, `FormSelect` (extended with optional `helpText`), `Callout`, and `ToastRegion` from `~/design-system/components`.
  - Submit via `useFetcher` with inline validation (`Instance name` required, max 50 characters; errors clear immediately on edit), helper texts (`"Shown in the site selector and in emails."`, `"The default language for everyone on this instance."`), footer note (`"Changes apply the next time you sign in."`), and confirmation toast (`"Settings saved. They apply the next time you sign in."`).
- **Action permission & tenant-scoping fix**:
  - Change `system.tsx` `action` from `authLoaderWithPerm("EditData", ...)` to `authActionWithPerm("ManageCountrySettings", ...)`.
  - Update `SettingsService.updateSettings` and `InstanceSystemSettingRepository` to scope updates by `countryAccountsId` from the active session and enforce the 50-character `instanceName` limit server-side.
- **Reusable `FormSelect` `helpText` prop**:
  - Add optional `helpText?: string` (rendered via React Aria `<Text slot="description">`) to `FormSelect` in `app/design-system/components/SelectField.tsx`.

## Capabilities

### New Capabilities

- `system-settings`: Tenant-scoped System settings screen at `/:lang/settings/system` displaying Instance, Country, Email, and Software configuration groups and an in-page React Aria dialog to edit instance name (max 50 characters) and default language with `ManageCountrySettings` permission enforcement.

### Modified Capabilities

- `design-system-components`: Add optional `helpText` description support to `FormSelect` in `app/design-system/components/SelectField.tsx`.

## Impact

### Files expected to change

| File | Reason |
|---|---|
| `app/design-system/components/SelectField.tsx` | Add optional `helpText?: string` prop (`<Text slot="description">`) to `FormSelect` |
| `app/db/queries/instanceSystemSettingRepository.ts` | Add tenant-scoped `updateByCountryAccountId(countryAccountId, data, tx)` method |
| `app/services/settingsService.ts` | Scope `updateSettings` by `countryAccountsId`, enforce 50-char `instanceName` max, and return structured field errors |
| `app/routes/$lang+/settings+/system.tsx` | Export `handle = { useDesignSystemCanvas: true }`, fix `action` to `authActionWithPerm("ManageCountrySettings")` with tenant scoping, render `SystemSettingsPage` |
| `app/pages/SystemSettingsPage.tsx` | New React Aria System settings presentation page with 4 grouped cards, `Intl.DisplayNames` language formatting, `Edit instance settings` modal, and toast |
| `tests/integration/db/queries/instanceSystemSettingRepository.test.ts` | PGlite integration tests for tenant-scoped `updateByCountryAccountId` and cross-tenant isolation |
| `tests/integration/routes/systemSettingsRoute.test.ts` | Route loader/action tests covering `ManageCountrySettings` permission enforcement, tenant scoping, 50-char validation, and JSON action responses |
| `tests/dom/system-settings.dom.test.tsx` | jsdom + React Testing Library interaction tests for 4 groups, `Intl.DisplayNames` labels, modal open/close rules, validation clearing on edit, 50-char limit, and toast |
| `tests/e2e/system-settings.spec.ts` | Playwright E2E + Gate 9b WCAG 2.2 AA axe-core, target sizes, keyboard walk-through, and Gate 9c responsive screenshots |

### Test approach

- **PGlite (`yarn test:run2`)**: Integration tests for `InstanceSystemSettingRepository.updateByCountryAccountId`, `SettingsService.updateSettings`, and `system.tsx` loader/action verifying `ManageCountrySettings` enforcement, tenant isolation, and 50-character `instanceName` validation.
- **DOM (`yarn test:run2` dom project — `*.dom.test.tsx`)**: Component interaction tests using `@testing-library/react` + `@testing-library/user-event` for `SystemSettingsPage` and `FormSelect` `helpText`.
- **E2E (`yarn test:e2e`)**: Playwright tests verifying desktop/tablet/mobile layouts, keyboard navigation, non-backdrop modal dismissal, automated axe-core WCAG 2.0/2.1/2.2 A & AA compliance (Gate 9b), and parity screenshots (Gate 9c).
