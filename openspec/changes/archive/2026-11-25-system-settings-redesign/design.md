# Design

## UI Design Governance Metadata

```yaml
ui-classification: react-aria

design-system:
  repository: https://github.com/unisdr/delta-design
  version-or-tag: v0.7.3
  commit: 9107103efc7b192c3aa898ba99a508da57988a09

feature-prototype:
  repository: https://github.com/unisdr/delta-feature-prototypes
  path: features/system-settings
  commit: e24b8ad4dee319d5efa2a7c57fca30948f130bd0
  status: approved
```

> Note: `feature-prototype.status` is set to `required` until human specification review approves the hand-off (changing it to `approved` prior to `/opsx:apply`).

## Context

See `proposal.md` for motivation and scope. Currently, `app/routes/$lang+/settings+/system.tsx` renders PrimeReact `Dialog`, `InputText`, `Dropdown`, `Button`, and `Toast` inside `MainContainer` + `NavSettings` with hardcoded `#004F91` icon classes. Its `action` is wrapped with `authLoaderWithPerm("EditData")` instead of `authActionWithPerm("ManageCountrySettings")` and updates `instance_system_settings` by a client-supplied `id` without session tenant verification.

Local `_docs/design/DESIGN.md`, `_docs/design/tokens.css`, and `_docs/design/tokens.json` are synced to `unisdr/delta-design` `v0.7.3` (`9107103efc7b192c3aa898ba99a508da57988a09`). All shared React Aria primitives live in `app/design-system/components/`, and `root.tsx` supports `export const handle = { useDesignSystemCanvas: true };` to apply warm `--bg` and `.ds-scope` cleanly during the UI transition.

## Goals / Non-Goals

**Goals:**
- Migrate `<main>` of `/:lang/settings/system` to the DELTA Design System `v0.7.3` and `features/system-settings` prototype (`e24b8ad4dee319d5efa2a7c57fca30948f130bd0`).
- Remove `NavSettings`, `MainContainer`, and PrimeReact from `/:lang/settings/system` and opt the route into `useDesignSystemCanvas: true`.
- Display settings in four stacked cards (`Instance`, `Country`, `Email`, `Software`) with the `Edit` action in the `Instance` header, `Intl.DisplayNames` language labels, and a React Aria `Edit instance settings` modal + toast.
- Fix the `system.tsx` action security bugs: enforce `authActionWithPerm("ManageCountrySettings")`, scope updates to session `countryAccountsId`, and enforce the 50-character `instanceName` limit server-side.

**Non-Goals:**
- Changing the outer application shell / top navigation / footer outside `<main>`.
- Adding database migrations (existing `website_name` column is `varchar(250)`).
- Re-enabling commented-out fields (privacy URL, terms URL, logo URL, approved records visibility, TOTP issuer editing).
- Formatting `Currency` or `Type` beyond raw DB values.

## Decisions

### 1. Tenant-Scoped Action & Service Contract

Replace the client-supplied `id` update path with a session-scoped update:
- Add `InstanceSystemSettingRepository.updateByCountryAccountId(countryAccountId, data, tx)` using `WHERE eq(instanceSystemSettingsTable.countryAccountsId, countryAccountId)`.
- Update `SettingsService.updateSettings` to accept `countryAccountsId` (from `getCountryAccountsIdFromSession(request)`) instead of a client-supplied settings `id`, trim `instanceName`, validate non-empty and `<= 50` characters, validate `language` against `configSupportedLanguages(getAvailableLanguages())`, and throw `SettingsValidationError` with field-keyed errors (`instanceName`, `language`).
- Wrap `system.tsx` `action` with `authActionWithPerm("ManageCountrySettings", ...)` and return a typed JSON `SystemSettingsActionResult` (`{ ok: true } | { ok: false; fieldErrors?: Record<string, string>; error?: string }`).

- **Rationale**: Eliminates both the privilege escalation (`EditData` users could previously POST to system settings) and IDOR (client-supplied `id` could target another tenant's settings row).
- **Alternatives considered**: Verifying `settings.id === formData.id` after fetching by `countryAccountsId`. Rejected because `id` does not need to come from the client at all when there is a 1:1 `countryAccountsId` -> `instance_system_settings` relationship.

### 2. Language Display Formatting via `Intl.DisplayNames`

Format locale codes (e.g. `"en"`, `"fr"`, `"es"`, `"ar"`, `"ru"`, `"zh"`) into human-readable display names using `Intl.DisplayNames([ctx.lang], { type: "language" })` with safe fallback to the raw code if `Intl.DisplayNames` throws or returns empty, and sentence-casing the first character when needed. Store and submit the raw locale code (`"en"`, `"fr"`, etc.) so `SettingsService` and `instance_system_settings.language` remain unchanged.

- **Rationale**: Automatically localizes language names to the active UI language (`ctx.lang`) without maintaining a manual static dictionary.

### 3. Extend `FormSelect` with Optional `helpText`

Add optional `helpText?: string` to `FormSelectProps` in `app/design-system/components/SelectField.tsx`, rendering `<Text slot="description" className="text-label text-fg-2">` when `helpText` is set and `errorMessage` is absent (matching `TextField.tsx` behavior).

- **Rationale**: Keeps description accessibility (`aria-describedby`) wired natively through React Aria's `Select` + `Text slot="description"` rather than ad-hoc sibling `<p>` tags.

### 4. TypeScript Types & Interfaces Added / Changed

- `app/design-system/components/SelectField.tsx`:
  - `FormSelectProps`: add `helpText?: string;`
- `app/frontend/systemSettingsAction.ts` (new shared client/server type):
  - `export type SystemSettingsActionResult = { ok: true } | { ok: false; fieldErrors?: Record<string, string>; error?: string };`
- `app/db/queries/instanceSystemSettingRepository.ts`:
  - Add `updateByCountryAccountId(countryAccountId: string, data: Partial<Omit<InsertInstanceSystemSettings, "id" | "countryAccountsId" | "dtsInstanceCtryIso3" | "countryName">>, tx?: Tx): Promise<SelectInstanceSystemSettings | null>`
- `app/services/settingsService.ts`:
  - `export const INSTANCE_NAME_MAX_LENGTH = 50;`
  - Update `SettingsService.updateSettings(countryAccountsId: string, instanceName: string, language: string)`

### 5. Database Schema & Form-CSV-API Impact

- **Drizzle schema changes**: None. `instance_system_settings.website_name` is already `varchar(250)`.
- **Form-CSV-API `fieldsDef` impact**: None. System settings does not use `fieldsDef` or `formScreen()`.

### 6. Test Infrastructure Choice

- **PGlite (`yarn test:run2`)**: Used for `tests/integration/db/queries/instanceSystemSettingRepository.test.ts` and `tests/integration/routes/systemSettingsRoute.test.ts` because `instance_system_settings` and `country_accounts` are standard PostgreSQL tables without PostGIS-only functions.
- **DOM (`yarn test:run2` dom project — `tests/dom/system-settings.dom.test.tsx`)**: Used with `@testing-library/react` + `@testing-library/user-event` to test the 4 grouped cards, `Intl.DisplayNames` formatting, conditional SMTP rows, modal open/close rules, inline validation (empty & >50 chars) clearing on edit, and toast confirmation.
- **Playwright E2E (`yarn test:e2e`)**: Used for `tests/e2e/system-settings.spec.ts` to run Gate 9b automated axe-core (WCAG 2.0/2.1/2.2 A & AA) checks, target size checks, keyboard walk-through, and Gate 9c responsive screenshots (375px, 768px, 1280px).

---

## UI Design Specification (Gate 9 Contract)

### Affected Routes & Presentation Components

- Route module: `app/routes/$lang+/settings+/system.tsx` (`export const handle = { useDesignSystemCanvas: true };`)
- Page presentation: `app/pages/SystemSettingsPage.tsx` (replaces inline JSX, `MainContainer`, `NavSettings`, PrimeReact)
- Shared design-system component: `app/design-system/components/SelectField.tsx` (`FormSelect` optional `helpText`)

### Selected Design Tokens & UI Components

- **Surfaces & borders**: `--bg` (via `useDesignSystemCanvas`), `--surface` (cards, inputs, modal, select popover), `--inset` (hover/disabled), `--overlay` (modal scrim), `--border` (row dividers), `--border-subtle` (card outlines), `--control-border` (inputs, selects, secondary `Edit` / `Cancel` buttons).
- **Text & action**: `--fg`, `--fg-2`, `--fg-inverse`, `--accent` / `--accent-hover` / `--accent-active` / `--accent-disabled`, `--focus-ring` (`2px solid`, `2px` offset via `.ds-scope`).
- **Status & feedback**: `--crit` / `--crit-bg` / `--crit-border` (inline field error & error `Callout`), `--toast-bg` & `--good-on-dark` (`ToastRegion`).
- **Typography & spacing**: `Inter` (`--font`), `text-page` (20/500), `text-section` (16/500), `text-body` (14/400), `text-label` (12/400), `tabular-nums` for `Port` and `DELTA Resilience version`; spacing on the 4/8/12/16/24/32/48/64px scale via parent `gap`.
- **Icons**: `lucide-react` only (`Pencil`, `X`, `ChevronDown`, `Check`, `CheckCircle2`, `AlertCircle`), 16px inline.

### Content & Interaction Ground-Truth Checklist

- **Page header**: `<h1>System settings</h1>`, subtitle `"How this instance of DELTA Resilience is set up."` (no button in page header).
- **Group 1 — `Instance`**:
  - Heading `<h2>Instance</h2>`, right-aligned secondary button `Edit` with `Pencil` icon.
  - Rows in exact order:
    1. `Instance name` (fallback `"-"` when empty)
    2. `Language` (formatted via `Intl.DisplayNames`, fallback raw code or `"-"`)
    3. `Application URL` (`break-words`, fallback `"-"`)
    4. `Name shown in authenticator apps` (fallback `"-"`)
- **Group 2 — `Country`**:
  - Heading `<h2>Country</h2>`, subtitle `"Set when the instance was created. Contact UNDRR to change it."`.
  - Rows in exact order:
    1. `Country`
    2. `Type` (raw DB value from `countryAccountType`)
    3. `Currency` (raw DB value from `currencyCode`)
- **Group 3 — `Email`**:
  - Heading `<h2>Email</h2>`, subtitle `"Set on the server. How DELTA sends invitations and password emails."`.
  - Rows in exact order:
    1. `Transport` (`"SMTP"` when `EMAIL_TRANSPORT === "smtp"`, otherwise raw transport value)
    2. `Host` (only when `EMAIL_TRANSPORT === "smtp"`, fallback `"Not set"`)
    3. `Port` (`tabular-nums`, only when `EMAIL_TRANSPORT === "smtp"`, fallback `"Not set"`)
    4. `Secure connection` (`"Yes"` / `"No"`, only when `EMAIL_TRANSPORT === "smtp"`)
- **Group 4 — `Software`**:
  - Heading `<h2>Software</h2>` (no subtitle).
  - Row: `DELTA Resilience version` (`tabular-nums`, fallback `"-"`).
- **Edit dialog (`Edit instance settings`, `ModalDialog` `size="md"`, `480px`)**:
  - `Instance name`: `TextField`, `maxLength={50}`, no `(required)` marker, helper `"Shown in the site selector and in emails."`, empty error `"Enter an instance name."`, >50-char error `"Instance name must be 50 characters or fewer."`
  - `Language`: `FormSelect`, no `(required)` marker, options from `availableLanguages` with `Intl.DisplayNames` labels, helper `"The default language for everyone on this instance."`
  - Note: `"Changes apply the next time you sign in."` (`text-label text-fg-2`)
  - Footer: `Cancel` (secondary), `Save changes` (primary, `isLoading` while submitting).
- **Sorting, filtering, pagination**: Not applicable (read-only grouped key-value screen).

### Material States

- **Empty**: Missing optional DB values render `"-"` (or `"Not set"` for unset SMTP host/port).
- **Loading**: `Save changes` shows spinner + disabled state (`isLoading`); `Cancel` disables while submitting.
- **Error**: Empty or >50-char `Instance name` shows inline 12px `--crit` error below the field (replacing helper text) and clears immediately on edit. Server errors render as field errors or an inline `Callout` (`role="alert"`) without losing entered values.
- **Success**: Dialog closes, `Instance` card updates via loader revalidation, and bottom-right `ToastRegion` shows `"Settings saved. They apply the next time you sign in."` (4s auto-dismiss).
- **Destructive action**: None on this screen.

### Responsive, Keyboard & Accessibility Expectations

- **Responsive**: Centered `max-w-[1280px]`, padding `px-4 md:px-6 xl:px-8`; `<dl>` rows stack 1-column on mobile (`375px`) and switch to `md:grid-cols-[220px_minmax(0,1fr)]` at `768px+`; modal fits mobile viewport cleanly.
- **Keyboard & focus order**: `Edit` button -> modal traps focus -> `Close` -> `Instance name` -> `Language` -> `Cancel` -> `Save changes`; Enter submits form; Escape/Cancel/Close dismisses modal and returns focus to `Edit`; backdrop click does NOT dismiss.
- **Target sizes**: All interactive controls >= 24x24 CSS px (`Edit`, `Cancel`, `Save changes`, inputs/selects 32px high; `Close` icon button 32x32px).
- **Accessible names & label-in-name**: Visible labels match accessible names (`Edit`, `Cancel`, `Save changes`, `Instance name`, `Language`); `Close` icon button has `aria-label="Close"`.
- **Copy & localisation**: All user-facing strings wrapped in `ctx.t({ code, msg })` with sentence case, UK English, no em dashes (`—`, use `-` for empty fallback). Run `yarn i18n:extractor` after adding/updating keys.

### Documented Deviations from Prototype / Design System

1. **Instance name 50-character limit**: Prototype has no length cap; production enforces a 50-character maximum (raised from legacy 20 characters) both client-side and server-side.
2. **Raw DB values for `Country` `Type` and `Currency`**: Prototype shows `"Official"` and `"HTG, Haitian gourde"`; production keeps raw DB values from `countryAccountType` and `currencyCode` as confirmed by user.
3. **Conditional SMTP rows**: Prototype always shows `Host`, `Port`, `Secure connection` for `SMTP`; production retains conditional rendering of those rows only when `EMAIL_TRANSPORT === "smtp"` (e.g., `file` transport in dev shows only `Transport`).
4. **`NavSettings` removed & outer shell unchanged**: Explicitly scoped to `<main>` only via `useDesignSystemCanvas: true`; top bar/footer shell remains legacy until the global shell migration.

## Risks / Trade-offs

- **Auth change on `system.tsx` `action`**: Tightening `action` from `EditData` to `ManageCountrySettings` blocks non-admin roles from POSTing to system settings. This aligns with `loader` (which already required `ManageCountrySettings`) and fixes a security bug; covered by route integration tests.
- **`Intl.DisplayNames` runtime fallback**: Older/minimal ICU builds or custom locale codes could return the raw code or throw; wrapping `Intl.DisplayNames` in a small helper with `try/catch` ensures safe fallback without crashing SSR.
