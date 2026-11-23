# access-management Specification

## Purpose

Tenant-scoped user access management for a DELTA country instance at `/:lang/settings/access-mgmnt/`, enabling administrators to search, filter, sort, paginate, invite, edit, resend invitations to, and remove users within their tenant.

## Requirements

### Requirement: Tenant-scoped user listing with unified search, role filter, sorting, and pagination

The `getUserCountryAccountsWithUserByCountryAccountsId` query and `/:lang/settings/access-mgmnt/` layout loader SHALL return only users in the active `countryAccountsId`, filtered by case-insensitive `search` (name, email, organization) and `role`, sorted across the full result set (`name`, `status`, `org`, `role`, `added`; default `added` desc), and paginated (default 25; options 25, 50, 100).

#### Scenario: Unified search matches name, email, and organization within the active tenant

- **GIVEN** a tenant has users across multiple organizations and another tenant has a user with a matching name
- **WHEN** `getUserCountryAccountsWithUserByCountryAccountsId` is called with `search` matching a user's first name, last name, full name, email, or organization name
- **THEN** only matching users belonging to the requested `countryAccountsId` MUST be returned
- **AND** `pagination.total` MUST reflect the total number of matching users in that tenant

#### Scenario: Full-list sorting orders results before pagination

- **GIVEN** a tenant has more than 25 users with varying names, statuses, organizations, roles, and `addedAt` timestamps
- **WHEN** the loader requests `sort=name&dir=asc&page=1&pageSize=25`
- **THEN** the returned 25 rows MUST be the first 25 users across the entire filtered tenant dataset ordered by name ascending
- **AND** invalid `sort`, `dir`, or `pageSize` query values MUST fall back safely to `added` descending and page size `25`

#### Scenario: Role filter displays active role capability summary

- **GIVEN** an administrator is on `/:lang/settings/access-mgmnt/`
- **WHEN** the administrator selects a specific role (e.g. `Data collector`) in the role filter
- **THEN** the table MUST display only users with that role and reset to page 1
- **AND** a helper line MUST display what that role can do below the filter bar

#### Scenario: Empty search or filter results show empty state and clear action

- **GIVEN** an administrator enters a search term or role filter that matches zero users
- **WHEN** the filtered list loads
- **THEN** the table MUST display `"No users match these filters."`
- **AND** activating `"Clear filters"` MUST reset `search` to empty, `role` to `All`, and `page` to `1`

### Requirement: Access management main layout and table presentation

The `AccessManagementPage` `<main>` region SHALL render without `NavSettings`, duplicate `MainContainer` heading, user-count banner, or status legend. It SHALL display the page title, subtitle, `Invite user` action, search and role filters, a card-wrapped sortable table (`Name`, `Status`, `Email`, `Organization`, `Role`, `Date added`, hidden `Actions`), and pagination controls.

#### Scenario: Active and pending user rows render required fields and fallbacks

- **GIVEN** a tenant has an active user with an organization and a pending user with empty `firstName`/`lastName` and no organization
- **WHEN** `AccessManagementPage` renders the user table
- **THEN** the active user MUST display full name, positive status dot with `"Active"`, email, organization name, CSS sentence-case role label, formatted date added, and Edit and Delete icon buttons (with no Resend button)
- **AND** the pending user MUST fall back to `email` in the `Name` column, display warning status dot with `"Invitation pending"`, display `"-"` in the `Organization` column, and display Resend invitation, Edit, and Delete icon buttons

#### Scenario: Rows do not advertise row-level click interaction

- **GIVEN** `AccessManagementPage` renders user rows
- **WHEN** a user hovers or focuses a table row
- **THEN** only the row action icon buttons MUST act as interactive controls and table rows MUST NOT show pointer hover fill or row-click navigation

### Requirement: Invite user dialog with optional organization and inline validation

Activating `Invite user` SHALL open a React Aria modal dialog over the list without losing filters. It SHALL require `Email address` and `Role` (marked `(required)`), keep `Organization` optional (clearable via `"No organization"`), show a live role-capability helper, and submit via `POST` to `/:lang/settings/access-mgmnt/new`.

#### Scenario: Successful user invitation closes dialog, refreshes list, and shows toast

- **GIVEN** an administrator with `InviteUsers` permission opens the `Invite user` dialog
- **WHEN** the administrator enters a valid email, optionally selects an organization (or leaves it empty), selects a role, and activates `Send invitation`
- **THEN** the `new.tsx` action MUST create the tenant assignment and send the invitation
- **AND** the dialog MUST close, the user list MUST refresh, and a toast MUST display `"Invitation sent to <email>."`

#### Scenario: Missing or invalid invite fields show inline errors that clear on edit

- **GIVEN** the `Invite user` dialog is open
- **WHEN** the administrator submits with an empty or malformed email or no role selected
- **THEN** inline error text MUST appear under each invalid field with an invalid border state and the dialog MUST remain open
- **AND** editing an invalid field MUST clear that field's error message immediately

#### Scenario: Server-side invite rejection surfaces field error in the dialog

- **GIVEN** an administrator invites an email address already assigned to the tenant with an active account or unexpired invite
- **WHEN** `new.tsx` returns a validation error for `email`
- **THEN** the dialog MUST remain open and display the server's error message under the `Email address` field

### Requirement: Edit user dialog with read-only metadata and primary admin protection

Activating the Edit icon button on a non-primary-admin row SHALL open a React Aria modal dialog (`Edit user`) showing read-only `Status`, `Date added`, and `Added by` (`System Admin`) metadata lines, a disabled `Email address` field, optional `Organization` select (clearable via `"No organization"`), and required `Role` select, submitting via `POST` to `/:lang/settings/access-mgmnt/edit/:id`. Admins SHALL be permitted to edit their own role if they are not the primary admin.

#### Scenario: Successful edit updates role or organization and shows toast

- **GIVEN** an administrator with `EditUsers` permission opens `Edit user` for a non-primary-admin user
- **WHEN** the administrator changes the role or clears the organization to `"No organization"` and activates `Save changes`
- **THEN** `edit.$id.tsx` MUST persist the updated `role` and `organizationId` (`null` when cleared) for that tenant
- **AND** the dialog MUST close, the list MUST refresh, and a toast MUST display `"Changes saved for <displayName>."`

#### Scenario: Primary admin cannot be edited or deleted

- **GIVEN** a user row has `isPrimaryAdmin: true`
- **WHEN** `AccessManagementPage` renders that row
- **THEN** the role cell MUST retain the `(Primary Admin)` indicator and edit/delete controls MUST remain disabled or blocked
- **AND** direct `POST` requests to `edit.$id.tsx` or `delete.$id.tsx` for a primary admin MUST continue to be rejected by `AccessManagementService`

### Requirement: Delete user confirmation dialog

Activating the Delete icon button on a non-primary-admin row SHALL open a React Aria `alertdialog` modal (`Delete user`) naming the user (`"<displayName> will lose access to DELTA. This cannot be undone."`, falling back to `email` when name is empty), with `Cancel` and destructive `Delete user` buttons, submitting via `POST` to `/:lang/settings/access-mgmnt/delete/:id`.

#### Scenario: Confirming deletion removes tenant access and shows toast

- **GIVEN** an administrator with `EditUsers` permission opens the `Delete user` dialog for a non-primary-admin user
- **WHEN** the administrator activates `Delete user`
- **THEN** `delete.$id.tsx` MUST remove the user's `user_country_accounts` assignment for the active tenant without requiring record ownership transfer
- **AND** the dialog MUST close, the list MUST refresh, and a toast MUST display `"<displayName> was deleted."`

#### Scenario: Server failure during deletion keeps dialog open with error feedback

- **GIVEN** the `Delete user` dialog is open
- **WHEN** `delete.$id.tsx` returns an error response (e.g. primary admin or server failure)
- **THEN** the dialog MUST remain open and display the error message in plain language

### Requirement: One-click resend invitation from pending user rows

Activating the Resend invitation icon button on a pending (`emailVerified === false`) user row SHALL submit directly via `POST` to `/:lang/settings/access-mgmnt/resend-invitation/:id` without opening a confirmation dialog.

#### Scenario: Resending an invitation succeeds in one click

- **GIVEN** a user row has `emailVerified: false`
- **WHEN** the administrator activates the `Resend invitation` icon button on that row
- **THEN** `resend-invitation.$id.tsx` MUST refresh the invitation expiry and resend the invitation email
- **AND** a toast MUST display `"Invitation sent again to <email>."`

#### Scenario: Resend failure displays an error notification

- **GIVEN** a pending user row has a missing invite code or already-verified account on the server
- **WHEN** the administrator activates `Resend invitation` and `resend-invitation.$id.tsx` returns an error
- **THEN** an error banner or critical toast MUST inform the administrator without losing current search, sort, or pagination state

### Requirement: Modal dismiss rules, keyboard navigation, and WCAG 2.2 AA accessibility

All Access management dialogs SHALL close only via the `Cancel` button, the top-right `Close` icon button, or the `Escape` key — clicking the modal backdrop/scrim MUST NOT close any dialog. Every interactive control SHALL meet WCAG 2.2 Level AA requirements, including minimum 24x24 CSS pixel hit targets (32x32 for icon buttons), visible `:focus-visible` focus rings, label-in-name conformance, and zero axe-core WCAG 2.0/2.1/2.2 A and AA violations.

#### Scenario: Clicking outside a modal dialog does not dismiss it

- **GIVEN** the `Invite user`, `Edit user`, or `Delete user` modal dialog is open
- **WHEN** the user clicks on the scrim outside the modal panel
- **THEN** the dialog MUST remain open and preserve any entered form values

#### Scenario: Pressing Escape or activating Cancel or Close dismisses the dialog and restores focus

- **GIVEN** a modal dialog is open
- **WHEN** the user presses `Escape`, clicks `Cancel`, or clicks the `Close` icon button
- **THEN** the dialog MUST close and keyboard focus MUST return to the trigger control
