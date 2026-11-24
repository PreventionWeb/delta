# Spec Delta

## Purpose

Tenant-scoped API keys management screen at `/:lang/settings/api-key/` enabling administrators to view, sort, paginate, create (with immediate one-time key reveal), copy, rename, and delete API keys with strict multi-tenant isolation and DELTA Design System v0.7.2 compliance.

## ADDED Requirements

### Requirement: API keys loader enforces permission, tenant isolation, and URL-driven sorting and pagination

The `app/routes/$lang+/settings+/api-key+/_layout.tsx` `loader` SHALL be wrapped with `authLoaderWithPerm("EditAPIKeys", ...)`, scope all queries via `countryAccountsId` from session, parse URL search params (`sort`, `dir`, `page`, `pageSize`), and call `ApiKeyRepository.listByCountryAccountsId` with validated defaults (`sort="created"`, `dir="desc"`, `page=1`, `pageSize=25`, allowed `pageSize` values `25`, `50`, `100`).

#### Scenario: Default listing loads page 1 sorted by creation date descending

- **GIVEN** an authenticated administrator with `EditAPIKeys` permission for tenant A
- **WHEN** the user requests `/:lang/settings/api-key/` without query parameters
- **THEN** the loader MUST return only API keys belonging to tenant A
- **AND** the results MUST be sorted by `createdAt` descending with a `pageSize` of `25` and `page` of `1`

#### Scenario: Invalid sort, direction, page, or pageSize query parameters fall back safely

- **GIVEN** an authenticated administrator with `EditAPIKeys` permission
- **WHEN** the user requests `/:lang/settings/api-key/?sort=invalid&dir=sideways&page=0&pageSize=999`
- **THEN** the loader MUST fall back to `sort="created"`, `dir="desc"`, `page=1`, and `pageSize=25` without throwing an error

#### Scenario: Sorting by name, managed by, or created date operates across the full tenant list

- **GIVEN** tenant A has 30 API keys spanning multiple pages
- **WHEN** the user requests `/:lang/settings/api-key/?sort=name&dir=asc&page=1&pageSize=25` (or `sort=managedBy` or `sort=created`)
- **THEN** `ApiKeyRepository.listByCountryAccountsId` MUST sort all 30 tenant keys in SQL before applying `LIMIT` and `OFFSET`
- **AND** keys from tenant B MUST NOT appear in the results or total count

#### Scenario: Unauthenticated or unauthorized user is rejected

- **GIVEN** a request without a valid session or without `EditAPIKeys` permission
- **WHEN** the user requests `/:lang/settings/api-key/`
- **THEN** `authLoaderWithPerm` MUST reject or redirect the request without exposing any API key records

### Requirement: API keys page renders the v0.7.2 `<main>` layout, table columns, copy action, and empty state

`ApiKeysPage` SHALL render inside `<main>` without `MainContainer` or `NavSettings`, showing the `"API keys"` heading, subtitle, primary `"Add API key"` button (when `canAdd` is true), a card-wrapped `SortableTable` (`Name`, `Key`, `Managed by`, `Created`, and `Actions` with `sr-only` header), and `Pagination` (`25`, `50`, `100`, noun `keys`). The `Key` cell SHALL display the first 5 secret characters plus `…` in monospace with a `Copy key` icon button.

#### Scenario: Populated list displays masked keys and copies the full secret with toast feedback

- **GIVEN** tenant A has an API key named `"National statistics sync"` with secret `"dk_7f3a9c2e..."`
- **WHEN** the page renders and the user activates the `"Copy key for National statistics sync"` button
- **THEN** the table MUST display `"dk_7f…"` in monospace
- **AND** the full secret MUST be copied to the clipboard and a toast `"Key copied."` MUST appear

#### Scenario: Empty tenant displays the prototype empty state and Add API key action

- **GIVEN** tenant A has zero API keys and the user has `canAdd` permission
- **WHEN** `/:lang/settings/api-key/` renders
- **THEN** the table empty state MUST display `"No API keys yet. Add one when another application needs access to this site's data."`
- **AND** a secondary `"Add API key"` button MUST be rendered that opens the Add API key dialog

### Requirement: Creating an API key validates name uniqueness and opens the post-create key reveal dialog

The `Add API key` dialog and `app/routes/$lang+/settings+/api-key+/new.tsx` `action` (`authActionWithPerm("EditAPIKeys")`) SHALL require a non-empty name that is unique (case-insensitive, trimmed) within the session's `countryAccountsId`, persist the key via `ApiKeyRepository.create` returning `{ id, name, secret }`, and on fetcher success open the wide `"API key created"` dialog showing the full read-only monospace secret with `"Copy key"` and `"Done"`.

#### Scenario: Valid key creation reveals the full newly created key

- **GIVEN** an administrator opens the `"Add API key"` dialog and enters a unique name `"Early warning dashboard"`
- **WHEN** the administrator activates `"Create key"`
- **THEN** `new.tsx` `action` MUST persist the key scoped to `countryAccountsId` and return `{ ok: true, key: { id, name, secret } }`
- **AND** the `"Add API key"` dialog MUST close and the `"API key created"` dialog MUST open showing a success callout (`"Early warning dashboard is ready to use"`), the full read-only monospace key, a `"Copy key"` button, and a `"Done"` button

#### Scenario: Empty or duplicate key name is rejected client-side and server-side

- **GIVEN** tenant A already has an API key named `"Early warning dashboard"`
- **WHEN** the administrator submits an empty name or `"early warning dashboard"` (case-insensitive duplicate)
- **THEN** validation MUST prevent creation and display `"Enter a name."` (for empty) or `"A key with this name already exists."` (for duplicate) inline below the `Name` field
- **AND** editing the `Name` field MUST clear the inline error immediately

#### Scenario: Server-side duplicate check blocks cross-page or direct POST duplicates

- **GIVEN** tenant A already has a key `"Red Cross field app"` and a direct POST is sent to `/:lang/settings/api-key/new` with `name="RED CROSS FIELD APP"`
- **WHEN** `new.tsx` `action` executes `ApiKeyRepository.existsByNameInTenant`
- **THEN** the action MUST NOT insert a duplicate row and MUST return `{ ok: false, fieldErrors: { name: "A key with this name already exists." } }` (or equivalent non-fetcher error)

### Requirement: Renaming an API key enforces tenant ownership and case-insensitive uniqueness

The `Rename API key` dialog and `app/routes/$lang+/settings+/api-key+/edit.$id.tsx` (`loader` and `action` wrapped with `authLoaderWithPerm("EditAPIKeys", ...)` and `authActionWithPerm("EditAPIKeys", ...)`) SHALL verify the target key belongs to the session's `countryAccountsId`, reject empty or duplicate names within the same tenant (excluding the key being renamed), update the key via `ApiKeyRepository.update`, close the dialog on fetcher success, and show a `"Changes saved."` toast.

#### Scenario: Renaming a key to a valid unique name succeeds

- **GIVEN** an administrator activates `"Rename National statistics sync"` and changes the name to `"IHSI statistics sync"`
- **WHEN** the administrator activates `"Save changes"`
- **THEN** `edit.$id.tsx` `action` MUST update the key name and return `{ ok: true }` for fetcher requests
- **AND** the dialog MUST close, the list MUST revalidate, and a `"Changes saved."` toast MUST appear

#### Scenario: Renaming to a duplicate name in the same tenant fails

- **GIVEN** tenant A has keys `"Key A"` and `"Key B"`
- **WHEN** the administrator attempts to rename `"Key A"` to `"key b"`
- **THEN** validation MUST reject the update with `"A key with this name already exists."` and leave `"Key A"` unchanged

#### Scenario: Accessing edit loader or action for another tenant's key returns 404

- **GIVEN** key K belongs to tenant B and the authenticated administrator belongs to tenant A
- **WHEN** tenant A requests `GET` or `POST` on `/:lang/settings/api-key/edit/<K>`
- **THEN** both `loader` and `action` MUST respond with HTTP 404 without leaking key metadata

### Requirement: Deleting an API key requires confirmation via alertdialog and enforces tenant ownership

The `Delete API key` confirmation dialog (`role="alertdialog"`) and `app/routes/$lang+/settings+/api-key+/delete.$id.tsx` (`loader` and `action` wrapped with `authLoaderWithPerm("EditAPIKeys", ...)` and `authActionWithPerm("EditAPIKeys", ...)`) SHALL warn that applications using the key will stop working immediately and the action cannot be undone, verify tenant ownership, delete the key via `ApiKeyRepository.delete`, close the dialog, and show a `"<name> was deleted."` toast.

#### Scenario: Confirming deletion removes the key and shows a confirmation toast

- **GIVEN** an administrator activates `"Delete Red Cross field app"`
- **WHEN** the `"Delete API key"` `alertdialog` opens and the administrator activates `"Delete key"`
- **THEN** `delete.$id.tsx` `action` MUST delete the key and return `{ ok: true }` for fetcher requests
- **AND** the dialog MUST close, the list MUST revalidate, and a `"Red Cross field app was deleted."` toast MUST appear

#### Scenario: Accessing delete loader or action for another tenant's key or without permission fails

- **GIVEN** key K belongs to tenant B (or the requester lacks `EditAPIKeys` permission)
- **WHEN** a request is made to `/:lang/settings/api-key/delete/<K>`
- **THEN** the loader and action MUST reject unauthorized users via `authLoaderWithPerm` / `authActionWithPerm` and return HTTP 404 for cross-tenant key IDs

### Requirement: All API key dialogs enforce non-backdrop dismissal and keyboard accessibility

All four API key dialogs (`Add API key`, `API key created`, `Rename API key`, `Delete API key`) SHALL close only via `Escape`, the header `Close` button, or explicit footer buttons (`Cancel` / `Done`), and SHALL NOT close when clicking the overlay scrim outside the dialog.

#### Scenario: Clicking outside a dialog does not dismiss it while Escape closes it

- **GIVEN** the `"Add API key"` dialog is open with unsaved text in the `Name` field
- **WHEN** the user clicks the backdrop outside the dialog
- **THEN** the dialog MUST remain open with the typed text preserved
- **AND** when the user presses `Escape` or activates `Cancel` or `Close`, the dialog MUST close and return focus to its trigger
