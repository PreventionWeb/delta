# organization-management Specification

## Purpose

Tenant-scoped Organization management screen at `/:lang/settings/organizations/` enabling administrators to search, sort, paginate, add, edit, and delete organizations (with per-organization user counts and up-front in-use delete protection) under DELTA Design System v0.7.2.

## Requirements

### Requirement: Organizations loader enforces permission, tenant isolation, search, user counts, sorting, and pagination

The `app/routes/$lang+/settings+/organizations+/_layout.tsx` `loader` SHALL be wrapped with `authLoaderWithPerm("ManageOrganizations", ...)`, scope all queries via `countryAccountsId`, parse URL search params (`search`, `sort`, `dir`, `page`, `pageSize`), and invoke `OrganizationRepository.listByCountryAccountsId` with defaults `sort="name"`, `dir="asc"`, `page=1`, `pageSize=25` (allowed `25`, `50`, `100`), returning per-organization user counts and clamped `page`.

#### Scenario: Default listing returns tenant organizations with user counts sorted by name ascending

- **GIVEN** an authenticated administrator with `ManageOrganizations` permission for tenant A
- **WHEN** the user requests `/:lang/settings/organizations/` without query parameters
- **THEN** the loader MUST return only organizations belonging to tenant A sorted by `name` ascending with `pageSize=25`
- **AND** each row MUST include the count of `user_country_accounts` rows assigned to that organization in tenant A

#### Scenario: Search escapes ILIKE wildcards and matches organization names case-insensitively

- **GIVEN** tenant A has organizations `"100%_Match Org"` and `"Ministry of Health"`
- **WHEN** the user requests `/:lang/settings/organizations/?search=100%25_`
- **THEN** `OrganizationRepository.listByCountryAccountsId` MUST match `"100%_Match Org"` and MUST NOT match `"Ministry of Health"`

#### Scenario: Sorting by users and invalid query params behave deterministically

- **GIVEN** tenant A has 30 organizations with varying user counts
- **WHEN** the user requests `?sort=users&dir=desc&page=1&pageSize=25`
- **THEN** results MUST be sorted across all 30 tenant organizations by user count descending before `LIMIT`/`OFFSET`
- **AND** invalid `sort`, `dir`, `page`, or `pageSize` values MUST fall back to `name`, `asc`, `1`, and `25`

#### Scenario: Unauthenticated or unauthorized user is rejected

- **GIVEN** a request without a valid session or without `ManageOrganizations` permission
- **WHEN** the user requests `/:lang/settings/organizations/`
- **THEN** `authLoaderWithPerm` MUST reject or redirect the request without exposing any organization records

### Requirement: Organization management page renders the v0.7.2 `<main>` layout, search bar, table, and empty states

`OrganizationManagementPage` SHALL render inside `<main>` without `MainContainer` or `NavSettings`, showing the `"Organizations"` heading, subtitle, primary `"Add organization"` button (when permitted), a `role="search"` input (`"Search by name"`), a card-wrapped `SortableTable` (`Name`, `Users`, and `Actions` with `sr-only` header), and `Pagination` (`25`, `50`, `100`, noun `organizations`).

#### Scenario: Search empty state shows query feedback and Clear search action

- **GIVEN** tenant A has organizations, none matching `"nonexistent"`
- **WHEN** `/:lang/settings/organizations/?search=nonexistent` renders
- **THEN** the table empty state MUST display `No organizations match "nonexistent".` and a secondary `"Clear search"` button that clears the search parameter

#### Scenario: Empty tenant displays zero-organization empty state

- **GIVEN** tenant A has zero organizations and no search query is active
- **WHEN** `/:lang/settings/organizations/` renders
- **THEN** the table empty state MUST display `"No organizations yet."`

### Requirement: Creating an organization validates case-insensitive uniqueness and shows toast feedback

The `Add organization` dialog and `app/routes/$lang+/settings+/organizations+/new.tsx` `action` (`authActionWithPerm("ManageOrganizations")`) SHALL require a non-empty name that is unique (case-insensitive, trimmed) within `countryAccountsId`, persist the organization via `OrganizationService.organizationAction`, close the dialog on fetcher success, and show toast `"<name> was added."`.

#### Scenario: Valid organization creation succeeds and displays confirmation toast

- **GIVEN** an administrator opens `"Add organization"` and enters a unique name `"Red Cross Haiti"`
- **WHEN** the administrator activates `"Add organization"` (or presses `Enter`)
- **THEN** `new.tsx` `action` MUST create the organization scoped to `countryAccountsId` and return `{ ok: true, intent: "create" }` for fetcher requests
- **AND** the dialog MUST close and a toast `"Red Cross Haiti was added."` MUST appear

#### Scenario: Empty or case-insensitive duplicate name is rejected client-side and server-side

- **GIVEN** tenant A already has an organization named `"DGPC Haiti"`
- **WHEN** the administrator submits an empty name or `"dgpc haiti"`
- **THEN** validation MUST reject creation with `"Enter a name."` or `"An organization with this name already exists."` inline below `Name`
- **AND** editing the `Name` field MUST clear the inline error immediately

### Requirement: Editing an organization enforces tenant ownership and case-insensitive uniqueness

The `Edit organization` dialog and `app/routes/$lang+/settings+/organizations+/edit.$id.tsx` (`authLoaderWithPerm` and `authActionWithPerm` for `"ManageOrganizations"`) SHALL verify UUID format and `countryAccountsId` ownership, reject empty or duplicate names (excluding the edited organization), update via `OrganizationService.organizationAction`, close the dialog on fetcher success, and show toast `"Changes saved."`.

#### Scenario: Renaming an organization to a unique name succeeds

- **GIVEN** an administrator activates `"Edit DGPC Haiti"` and changes the name to `"DGPC National"`
- **WHEN** the administrator activates `"Save changes"`
- **THEN** `edit.$id.tsx` `action` MUST update the organization and return `{ ok: true, intent: "update" }` for fetcher requests
- **AND** the dialog MUST close and a toast `"Changes saved."` MUST appear

#### Scenario: Cross-tenant or malformed organization ID returns 404 without leaking data

- **GIVEN** organization O belongs to tenant B (or `params.id` is `"not-a-uuid"`)
- **WHEN** tenant A requests `GET` or `POST` on `/:lang/settings/organizations/edit/<id>`
- **THEN** the loader and action MUST respond with HTTP 404 (or 403/404 on action) without exposing organization data or throwing a database UUID error

### Requirement: Deleting an organization blocks in-use organizations up front and confirms unused deletions

The `Delete organization` `alertdialog` and `app/routes/$lang+/settings+/organizations+/delete.$id.tsx` (`authLoaderWithPerm` and `authActionWithPerm` for `"ManageOrganizations"`) SHALL show `"This organization is in use"` with a single `"Close"` button when `users > 0`, and when `users === 0` confirm deletion with `"This cannot be undone."`, verify tenant ownership, delete via `OrganizationService.organizationAction`, and show toast `"<name> was deleted."`.

#### Scenario: Attempting to delete an organization with assigned users shows the in-use dialog

- **GIVEN** organization `"DGPC Haiti"` has `4` assigned users
- **WHEN** an administrator activates `"Delete DGPC Haiti"`
- **THEN** an `alertdialog` titled `"This organization is in use"` MUST open stating `"DGPC Haiti has 4 users. Move them to another organization in Access management, then delete it."`
- **AND** only a `"Close"` button MUST be rendered (no destructive delete button)

#### Scenario: Confirming deletion of an unused organization deletes it and shows toast

- **GIVEN** organization `"Statistics Office"` has `0` assigned users
- **WHEN** an administrator activates `"Delete Statistics Office"` and confirms `"Delete organization"`
- **THEN** `delete.$id.tsx` `action` MUST delete the organization and return `{ ok: true, intent: "delete" }` for fetcher requests
- **AND** the dialog MUST close and a toast `"Statistics Office was deleted."` MUST appear

#### Scenario: Server foreign-key check blocks deletion if assignments exist concurrently

- **GIVEN** an organization is still referenced by database records when a direct POST hits `delete.$id.tsx`
- **WHEN** `OrganizationService.organizationAction` attempts deletion and receives PostgreSQL error `23503`
- **THEN** the action MUST return `{ ok: false, error: ... }` without crashing

### Requirement: All organization dialogs enforce non-backdrop dismissal and keyboard accessibility

All organization dialogs (`Add organization`, `Edit organization`, `Delete organization`, `This organization is in use`) SHALL close only via `Escape`, the header `Close` button, or explicit footer buttons (`Cancel` / `Close`), and SHALL NOT close when clicking the overlay scrim outside the dialog.

#### Scenario: Clicking outside a dialog preserves state while Escape closes it

- **GIVEN** the `"Add organization"` dialog is open with typed text in `Name`
- **WHEN** the user clicks the backdrop outside the dialog
- **THEN** the dialog MUST remain open with the typed text preserved
- **AND** pressing `Escape` or activating `Cancel` or `Close` MUST close the dialog and restore focus to its trigger
