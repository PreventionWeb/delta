# system-settings Specification

## Purpose

Tenant-scoped System settings screen at `/:lang/settings/system`, displaying Instance, Country, Email, and Software configuration groups and enabling administrators with `ManageCountrySettings` permission to update the instance name and default language via an accessible in-page modal dialog.

## ADDED Requirements

### Requirement: Permission-guarded and tenant-scoped System settings read and update

The `/:lang/settings/system` route `loader` SHALL be wrapped with `authLoaderWithPerm("ManageCountrySettings", ...)` and the `action` SHALL be wrapped with `authActionWithPerm("ManageCountrySettings", ...)`. Both handlers SHALL resolve the active tenant via `getCountryAccountsIdFromSession(request)`. Updating settings via `SettingsService.updateSettings` and `InstanceSystemSettingRepository.updateByCountryAccountId` SHALL scope the update strictly to the active session's `countryAccountsId` and MUST NOT trust a client-supplied settings `id`.

#### Scenario: Administrator with ManageCountrySettings updates instance settings for the active tenant

- **GIVEN** an authenticated administrator with `ManageCountrySettings` permission for tenant A
- **WHEN** the administrator submits a `POST` request to `/:lang/settings/system` with a valid `instanceName` (1 to 50 characters) and a supported `language` code
- **THEN** `SettingsService.updateSettings` and `InstanceSystemSettingRepository.updateByCountryAccountId` MUST update only tenant A's `instance_system_settings` row
- **AND** the action MUST return a success JSON response `{ ok: true }`

#### Scenario: Non-admin user with EditData permission cannot update system settings

- **GIVEN** an authenticated user with `EditData` permission (such as a `data-collector` or `data-validator`) who lacks `ManageCountrySettings`
- **WHEN** the user sends a `POST` request directly to `/:lang/settings/system`
- **THEN** `authActionWithPerm("ManageCountrySettings", ...)` MUST reject the request with an authorization failure
- **AND** no `instance_system_settings` row MUST be modified

#### Scenario: Cross-tenant update attempt cannot modify another tenant's settings

- **GIVEN** tenant A and tenant B each have an `instance_system_settings` row
- **WHEN** an administrator authenticated to tenant A submits a `POST` request to `/:lang/settings/system` (even if an `id` field belonging to tenant B is included in the form payload)
- **THEN** `InstanceSystemSettingRepository.updateByCountryAccountId` MUST update only tenant A's settings row
- **AND** tenant B's `instance_system_settings` row MUST remain unchanged

### Requirement: Grouped System settings layout and value presentation

The `/:lang/settings/system` route SHALL export `handle = { useDesignSystemCanvas: true }` and `SystemSettingsPage` SHALL render inside `<main>` without `NavSettings`, `MainContainer`, or PrimeReact components. It SHALL display the heading `"System settings"`, subtitle `"How this instance of DELTA Resilience is set up."`, and four stacked cards in exact order: `Instance`, `Country`, `Email`, and `Software`.

#### Scenario: Four setting groups render required headings, subtitles, fields, and formatting

- **GIVEN** a tenant has configured `instance_system_settings`, country account metadata, `EMAIL_TRANSPORT="smtp"` with SMTP host/port/secure settings, and `dtsSystemInfo` version
- **WHEN** `SystemSettingsPage` renders
- **THEN** the `Instance` section MUST display heading `"Instance"`, a right-aligned secondary `"Edit"` button with pencil icon, and rows in order: `Instance name`, `Language` (formatted as a human-readable language name via `Intl.DisplayNames`), `Application URL`, and `Name shown in authenticator apps`
- **AND** the `Country` section MUST display heading `"Country"`, subtitle `"Set when the instance was created. Contact UNDRR to change it."`, and rows in order: `Country`, `Type` (raw DB value), and `Currency` (raw DB value)
- **AND** the `Email` section MUST display heading `"Email"`, subtitle `"Set on the server. How DELTA sends invitations and password emails."`, and rows in order: `Transport` (`"SMTP"`), `Host`, `Port` (with `tabular-nums`), and `Secure connection` (`"Yes"` or `"No"`)
- **AND** the `Software` section MUST display heading `"Software"` and row `DELTA Resilience version` (with `tabular-nums`)

#### Scenario: Non-SMTP email transport omits SMTP-only rows

- **GIVEN** `EMAIL_TRANSPORT` is not `"smtp"` (for example `"file"`)
- **WHEN** `SystemSettingsPage` renders the `Email` section
- **THEN** the `Email` card MUST display `Transport` and MUST NOT render `Host`, `Port`, or `Secure connection` rows

### Requirement: Edit instance settings modal dialog, validation, and toast feedback

Activating the `Edit` button in the `Instance` section header SHALL open a React Aria `ModalDialog` (`Edit instance settings`, `isDismissable={false}`) over the page without navigating away. The dialog SHALL contain `Instance name` (text input, helper `"Shown in the site selector and in emails."`, max 50 characters) and `Language` (`FormSelect` displaying language names via `Intl.DisplayNames` while submitting the locale code, helper `"The default language for everyone on this instance."`), followed by the note `"Changes apply the next time you sign in."`, and `Cancel` / `Save changes` footer buttons.

#### Scenario: Successful edit closes dialog, updates displayed values, and shows toast

- **GIVEN** an administrator opens the `Edit instance settings` dialog
- **WHEN** the administrator enters a valid `Instance name` (1 to 50 characters), selects a supported `Language`, and activates `Save changes`
- **THEN** the dialog MUST submit via `POST` to `/:lang/settings/system`
- **AND** on `{ ok: true }`, the dialog MUST close, the `Instance` card MUST reflect the updated name and formatted language, and a bottom-right toast MUST display `"Settings saved. They apply the next time you sign in."`

#### Scenario: Empty or over-50-character instance name shows inline error that clears on edit

- **GIVEN** the `Edit instance settings` dialog is open
- **WHEN** the administrator submits with an empty `Instance name` or an `Instance name` longer than 50 characters
- **THEN** an inline error message MUST appear under `Instance name` (e.g. `"Enter an instance name."` or a 50-character limit error) with an invalid border state and the dialog MUST remain open
- **AND** editing `Instance name` MUST immediately clear the inline error and restore the field's helper text

#### Scenario: Server validation or unexpected error keeps dialog open with feedback

- **GIVEN** the `Edit instance settings` dialog is open
- **WHEN** the `system.tsx` action returns `{ ok: false, fieldErrors }` or `{ ok: false, error }`
- **THEN** the dialog MUST remain open, display field errors under the matching field or an inline `role="alert"` error callout for general errors, and preserve the user's entered values

### Requirement: Modal dismiss rules, keyboard navigation, and WCAG 2.2 AA accessibility

The `Edit instance settings` modal SHALL close only via `Cancel`, the top-right `Close` icon button, or the `Escape` key — clicking the modal backdrop/scrim MUST NOT close it. Every interactive control SHALL meet WCAG 2.2 Level AA requirements, including minimum 24x24 CSS pixel hit targets (32x32 for icon buttons), visible `:focus-visible` focus rings, label-in-name conformance, and zero axe-core WCAG 2.0/2.1/2.2 A and AA violations.

#### Scenario: Clicking outside the Edit instance settings modal does not dismiss it

- **GIVEN** the `Edit instance settings` modal is open
- **WHEN** the user clicks on the scrim outside the modal panel
- **THEN** the dialog MUST remain open and preserve any entered values

#### Scenario: Pressing Escape or activating Cancel or Close dismisses the dialog and restores focus

- **GIVEN** the `Edit instance settings` modal is open
- **WHEN** the user presses `Escape`, clicks `Cancel`, or clicks the `Close` icon button
- **THEN** the dialog MUST close and keyboard focus MUST return to the `Edit` button
