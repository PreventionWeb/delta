# Proposal

## Why

The current Access management screen at `/:lang/settings/access-mgmnt/` uses legacy `dts-*` layout markup and PrimeReact components, lacks unified user search and full-list sorting, and forces multi-step navigation for invite, edit, delete, and resend flows. Applying the approved DELTA Design System (`v0.7.2`) interactive mockup for Access management migrates the `<main>` content to React Aria Components with semantic tokens, WCAG 2.2 Level AA compliance, unified search across name/email/organization, full-list sorting, and streamlined in-page dialogs with one-click invitation resending.

**UI classification**: `react-aria`

**Security-sensitive change**: Yes — modifies tenant-scoped user listing queries (`countryAccountsId`) and interacts with permission-guarded access-management routes (`ViewUsers`, `InviteUsers`, `EditUsers`). All database queries MUST remain strictly scoped by `countryAccountsId`, and every route loader/action MUST remain wrapped with `authLoaderWithPerm` / `authActionWithPerm`.

**Database migration required**: No. Existing `user`, `user_country_accounts`, and `organization` tables already support nullable `organization_id` and all required fields (`added_at`, `role`, `is_primary_admin`, `email_verified`). The Edit dialog continues to display `"System Admin"` for "Added by" without adding a new column.

## What Changes

- **Access management `<main>` redesign (`/:lang/settings/access-mgmnt/`)**:
  - Replace the PrimeReact list page inside `<main>` with the DELTA Design System v0.7.2 layout: page heading (`Access management`), subtitle (`Invite people and set what they can do on this site.`), primary `Invite user` button, unified search bar (`Search by name, email or organization`), role filter dropdown with inline role-capability summary when filtered, and `Clear filters` button.
  - Remove `NavSettings` and the duplicate `MainContainer` page header on this screen, as well as the legacy `"Currently there are N users"` banner and status legend.
  - Replace PrimeReact `DataTable` and `Paginator` with a React Aria sortable table inside a card (columns: `Name`, `Status`, `Email`, `Organization`, `Role`, `Date added`, and `Actions` with `sr-only` header) and v0.7.2 pagination (`25`, `50`, `100` rows per page, default `25`).
  - Render Status as an 8px dot plus text (`Active` / `Invitation pending`), Organization as `-` when empty, pending user Name falling back to `email` when `firstName` and `lastName` are empty, and Role labels in sentence case via CSS while keeping `roles.ts` unchanged and preserving `(Primary Admin)` + edit/delete protection for primary admins.
- **In-page React Aria modals and one-click resend via `useFetcher`**:
  - Open Invite user, Edit user, and Delete user as React Aria modal dialogs over the list page (closing only via Cancel, close button, or Escape — never on outside click) so search, sort, and pagination state remain intact.
  - Submit Invite, Edit, Delete, and one-click row Resend actions via `useFetcher` against the existing permission-guarded child routes (`new.tsx`, `edit.$id.tsx`, `delete.$id.tsx`, `resend-invitation.$id.tsx`), returning JSON responses for fetcher requests while keeping `organization` optional (`"No organization"` clears it).
  - Show bottom-right toast notifications naming the affected user (`Invitation sent to [email].`, `Changes saved for [name].`, `[Name] was deleted.`, `Invitation sent again to [email].`).
- **Server-side unified search, sorting, and pagination defaults**:
  - Extend `getUserCountryAccountsWithUserByCountryAccountsId` to perform a tenant-scoped join across `user_country_accounts`, `user`, and `organization` (left join) supporting case-insensitive `search` (first name, last name, full name, email, organization name), `role` filter, and full-list `sort` (`name`, `status`, `org`, `role`, `added`) + `dir` (`asc` / `desc`, default `added` desc).
  - Update the `_layout.tsx` loader to parse `search`, `role`, `sort`, `dir`, `page`, and `pageSize` (default `25`, allowed `25 | 50 | 100`).
- **Reusable DELTA Design System v0.7.2 React Aria primitives (`app/design-system/`)**:
  - Add reusable, domain-agnostic, zero-PrimeReact v0.7.2 React Aria components (`Button`, `ModalDialog`, `TextField`, `FormSelect`, `FilterSelect`, `SortableTable`, `Pagination`, `StatusIndicator`, `Tooltip`, `ToastRegion`) under `app/design-system/ui/` without modifying the existing Phase 6a/6h legacy-parity components under `app/design-system/components/`.

## Capabilities

### New Capabilities
- `access-management`: Tenant-scoped Access management user list with unified search, full-list sorting, pagination, in-page React Aria invite/edit/delete dialogs, one-click resend invitation, primary admin protection, and toast feedback.

### Modified Capabilities
- `design-system-components`: Add reusable v0.7.2 DELTA Design System React Aria primitives under `app/design-system/ui/` using semantic tokens from `_docs/design/tokens.css`, coexisting with the transitional Phase 6a/6h baseline under `app/design-system/components/`.

## Impact

### Files expected to change

| File | Reason |
|---|---|
| `app/db/queries/userCountryAccountsRepository.ts` | Add tenant-scoped SQL join supporting unified `search`, `role`, and full-list `sort`/`dir` |
| `app/routes/$lang+/settings+/access-mgmnt+/_layout.tsx` | Parse `search`, `role`, `sort`, `dir`, `page`, `pageSize` (default 25) and pass to repository |
| `app/routes/$lang+/settings+/access-mgmnt+/new.tsx` | Support JSON fetcher responses alongside existing `InviteUsers` action logic |
| `app/routes/$lang+/settings+/access-mgmnt+/edit.$id.tsx` | Support JSON fetcher responses alongside existing `EditUsers` action logic |
| `app/routes/$lang+/settings+/access-mgmnt+/delete.$id.tsx` | Support JSON fetcher responses alongside existing `EditUsers` action logic |
| `app/routes/$lang+/settings+/access-mgmnt+/resend-invitation.$id.tsx` | Support one-click POST fetcher responses alongside existing `EditUsers` action logic |
| `app/pages/AccessManagementPage.tsx` | Replace legacy `MainContainer`/`NavSettings`/PrimeReact UI with v0.7.2 React Aria `<main>` layout, dialogs, and toast |
| `app/design-system/ui/Button.tsx` | Reusable v0.7.2 React Aria button (primary, secondary, ghost, destructive, icon-only) |
| `app/design-system/ui/ModalDialog.tsx` | Reusable v0.7.2 React Aria modal dialog (no outside-click dismiss; Cancel/close/Escape only) |
| `app/design-system/ui/TextField.tsx` | Reusable v0.7.2 React Aria text/email/search input with required marker and inline error |
| `app/design-system/ui/SelectField.tsx` | Reusable v0.7.2 React Aria form select and filter select trigger with checkmark popover |
| `app/design-system/ui/SortableTable.tsx` | Reusable v0.7.2 React Aria sortable table inside card with sort arrows and empty state |
| `app/design-system/ui/Pagination.tsx` | Reusable v0.7.2 pagination bar (`Showing X-Y of N`, rows per page 25/50/100, prev/next) |
| `app/design-system/ui/StatusIndicator.tsx` | Reusable v0.7.2 status dot + sentence-case text (positive, warning, critical, info, neutral) |
| `app/design-system/ui/Tooltip.tsx` | Reusable v0.7.2 React Aria tooltip (hover and keyboard focus) |
| `app/design-system/ui/ToastRegion.tsx` | Reusable v0.7.2 bottom-right toast notification stack with auto-dismiss and live region |
| `app/design-system/ui/index.ts` | Barrel export for v0.7.2 design-system primitives |
| `tests/integration/db/queries/userCountryAccounts.test.ts` | PGlite integration tests for search, role filter, sorting, pagination, and tenant isolation |
| `tests/dom/access-management.test.tsx` | jsdom + React Testing Library interaction tests for dialogs, validation, sorting, filtering, resend, and primary admin protection |
| `tests/e2e/access-management.spec.ts` | Playwright E2E + Gate 9b axe-core (WCAG 2.0/2.1/2.2 A & AA) and keyboard walk-through tests |

### Test approach

- **PGlite (`yarn test:run2`)**: Integration tests for `getUserCountryAccountsWithUserByCountryAccountsId` covering unified search (first name, last name, full name, email, organization), role filtering, all 5 sortable columns (asc/desc), pagination boundaries, and strict `countryAccountsId` tenant isolation.
- **DOM (`yarn test:dom`)**: Component interaction tests using `@testing-library/react` + `@testing-library/user-event` for `AccessManagementPage` and `app/design-system/ui/*` (modal open/close rules, no outside-click close, validation error display and clear-on-edit, optional organization clearing, pending user email fallback, primary admin disabled/blocked controls, one-click resend toast).
- **E2E (`yarn test:e2e`)**: Playwright tests verifying desktop/tablet/mobile layouts, keyboard navigation, and automated axe-core WCAG 2.2 AA compliance (Gate 9b) plus Gate 9c parity screenshots.
