# Proposal

## Why

The current Organization management screen at `/:lang/settings/organizations/` uses legacy `MainContainer`/`NavSettings` chrome and PrimeReact `DataTable`/`Paginator`/`Dialog` components, displays only organization names without user counts, lacks column sorting, performs case-sensitive duplicate checks, and navigates away to separate dialog routes for add/edit/delete (only surfacing a foreign-key error after a failed delete attempt). Applying the DELTA Design System (`v0.7.2`) interactive mockup for Organization management migrates the `<main>` content to React Aria Components with semantic tokens, WCAG 2.2 Level AA compliance, a sortable `Users` count column, URL-driven server-side search/sorting/pagination, case-insensitive duplicate validation, and streamlined in-page dialogs including up-front in-use delete protection.

**UI classification**: `react-aria`

**Security-sensitive change**: Yes — modifies tenant-scoped organization listing, user-count aggregation, and duplicate-name queries (`countryAccountsId`), tightens `_layout.tsx`, `edit.$id.tsx`, and `delete.$id.tsx` loaders from `authLoaderPublicOrWithPerm` to `authLoaderWithPerm("ManageOrganizations", ...)`, and guards `getById` against invalid UUIDs. All database queries MUST remain strictly scoped by `countryAccountsId`, and every route loader and action MUST be wrapped with `authLoaderWithPerm("ManageOrganizations", ...)` / `authActionWithPerm("ManageOrganizations", ...)`.

**Database migration required**: No. Existing `organization` and `user_country_accounts` tables already store `organization_id` and `country_accounts_id`.

## What Changes

- **Organization management `<main>` redesign (`/:lang/settings/organizations/`)**:
  - Replace the PrimeReact list page inside `<main>` with the DELTA Design System `v0.7.2` layout: page heading (`Organizations`), subtitle (`The organizations people on this site belong to.`), primary `Add organization` button, and a `role="search"` input (`Search by name`, debounced URL search).
  - Remove `MainContainer` and `NavSettings` on this screen so only the prototype's `<main>` content renders inside the outer application shell.
  - Replace PrimeReact `DataTable` and `Paginator` with the `v0.7.2` React Aria `SortableTable` inside a card (columns: `Name` [sortable, default ascending], `Users` [sortable, `tabular-nums` user count], and `Actions` with `sr-only` header for `Edit organization` and `Delete organization`) and `v0.7.2` `Pagination` (`25`, `50`, `100` rows per page, default `25`, noun `organizations`).
  - Render prototype empty states inside the table (`No organizations match "<search>".` + secondary `Clear search` button when searching; `No organizations yet.` when empty).
- **In-page React Aria modals via `useFetcher` and up-front in-use delete protection**:
  - Open `Add organization`, `Edit organization`, and `Delete organization` (`role="alertdialog"`) as React Aria modal dialogs over the list page (closing only via Cancel, close button, or Escape — never on outside click) so search, sort, and pagination URL state remain intact.
  - Submit create, edit, and delete via `useFetcher` against the existing `ManageOrganizations`-guarded child routes (`new.tsx`, `edit.$id.tsx`, `delete.$id.tsx`), returning typed JSON responses for fetcher requests while preserving redirect fallback for standard form POSTs.
  - When deleting an organization with `users > 0`, show the `This organization is in use` alertdialog (`<name> has N user(s). Move them to another organization in Access management, then delete it.` with a single `Close` button) instead of attempting a failing delete; retain the server-side `23503` foreign-key guard as a safety net.
  - Enforce case-insensitive duplicate organization name validation (`An organization with this name already exists.`) and required name validation (`Enter a name.`) both client-side (inline below the field on submit, cleared on edit) and server-side (scoped to `countryAccountsId`).
  - Show bottom-right toast confirmations (`<name> was added.`, `Changes saved.`, `<name> was deleted.`).
- **URL-driven server-side search, sorting, user-count aggregation, pagination, and security hardening**:
  - Update `OrganizationRepository.listByCountryAccountsId` to `LEFT JOIN user_country_accounts` scoped by `countryAccountsId`, compute `COUNT(user_country_accounts.id)` per organization, escape `%`/`_`/`\` wildcards in `ILIKE` search against `organization.name`, support full-list SQL sorting (`sort`: `name | users`, `dir`: `asc | desc`, default `name` asc), clamp out-of-range `page` against `totalPages`, and return tenant `existingNames`.
  - Update `OrganizationRepository.getByNameAndCountryAccountsId` (or add `existsByNameInTenant`) to match case-insensitively (`lower(trim(name))`) with optional `excludeId`, and guard `getById` with `isValidUUID`.
  - Tighten `_layout.tsx`, `edit.$id.tsx`, and `delete.$id.tsx` loaders to `authLoaderWithPerm("ManageOrganizations", ...)`.
- **Small additive `TextField` prop (`app/design-system/ui/TextField.tsx`)**:
  - Add optional `autoFocus` prop to `TextField` so modal inputs focus cleanly on open.

## Capabilities

### New Capabilities
- `organization-management`: Tenant-scoped Organization management list with server-side name search, full-list sorting (`Name`, `Users`), pagination (`25`/`50`/`100`), in-page React Aria add/edit/delete dialogs with up-front in-use protection, case-insensitive duplicate validation, and toast feedback.

### Modified Capabilities
<!-- None: adding optional autoFocus to TextField is a non-breaking prop addition; no existing spec requirements change. -->

## Impact

### Files expected to change

| File | Reason |
|---|---|
| `app/db/queries/organizationRepository.ts` | Add tenant-scoped `LEFT JOIN` user count, escaped name `ILIKE` search, SQL sorting (`name`, `users`), clamped pagination, `existingNames`, case-insensitive duplicate check, and UUID guard in `getById` |
| `app/services/organizationService.ts` | Parse URL `search`, `sort`, `dir`, `page`, `pageSize` (default `name` asc, 25/page), use case-insensitive duplicate check, and return structured field errors |
| `app/frontend/organizationAction.ts` | Typed `OrganizationActionResult` and `isFetcherRequest` re-export for route actions and `useFetcher` |
| `app/routes/$lang+/settings+/organizations+/_layout.tsx` | Switch loader to `authLoaderWithPerm("ManageOrganizations")`, add `meta`, export `parseOrganizationsQuery`, pass `existingNames` and `canManage` flags |
| `app/routes/$lang+/settings+/organizations+/new.tsx` | Add `authLoaderWithPerm` redirect loader and dual JSON/redirect fetcher action response |
| `app/routes/$lang+/settings+/organizations+/edit.$id.tsx` | Switch loader to `authLoaderWithPerm("ManageOrganizations")` and support dual JSON/redirect fetcher action response |
| `app/routes/$lang+/settings+/organizations+/delete.$id.tsx` | Switch loader to `authLoaderWithPerm("ManageOrganizations")` and support dual JSON/redirect fetcher action response |
| `app/pages/OrganizationManagementPage.tsx` | Replace `MainContainer`/`NavSettings`/PrimeReact UI with `v0.7.2` React Aria `<main>` layout, search bar, sortable table, pagination, 3 dialogs, and toasts |
| `app/design-system/ui/TextField.tsx` | Add optional `autoFocus` prop for dialog inputs |
| `tests/integration/db/queries/organizationRepository.test.ts` | PGlite integration tests for user-count aggregation, escaped name search, sorting (`name`/`users`), clamped pagination, case-insensitive duplicate check, UUID guard, and tenant isolation |
| `tests/integration/routes/organizationsRoutes.test.ts` | Integration tests for `parseOrganizationsQuery`, `authLoaderWithPerm`, cross-tenant 404, duplicate rejection, and dual JSON fetcher responses |
| `tests/dom/organization-management.dom.test.tsx` | jsdom + React Testing Library interaction tests for search, sorting, pagination, all 3 dialogs (including `This organization is in use`), non-backdrop dismissal, validation/clear-on-edit, and toasts |
| `tests/e2e/organization-management.spec.ts` | Playwright E2E + Gate 9b axe-core (WCAG 2.0/2.1/2.2 A & AA) and keyboard walk-through tests + Gate 9c parity screenshots |

### Test approach

- **PGlite (`yarn test:run2`, node project)**: Integration tests for `OrganizationRepository` and `organizations` route loaders/actions covering user counts, escaped `ILIKE` search, `name`/`users` sorting, clamped pagination, case-insensitive duplicate checks, UUID guards, and strict `countryAccountsId` isolation.
- **DOM (`yarn test:run2`, dom project via `*.dom.test.tsx`)**: Component interaction tests using `@testing-library/react` + `@testing-library/user-event` for `OrganizationManagementPage` (search + clear, sorting, pagination, Add/Edit/Delete/In-use dialogs, non-backdrop dismissal, Escape/Enter keyboard behavior, inline validation clearing on edit, toasts, permission gating).
- **E2E (`yarn test:e2e`)**: Playwright tests verifying desktop/tablet/mobile layouts, keyboard navigation, automated axe-core WCAG 2.2 AA compliance (Gate 9b), and Gate 9c parity screenshots.
