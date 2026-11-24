# Design

## UI Design Governance Metadata

```yaml
ui-classification: react-aria

design-system:
  repository: https://github.com/unisdr/delta-design
  version-or-tag: v0.7.2
  commit: a86cc3a62378871e93cbfa14aa69740201b8c556

feature-prototype:
  repository: https://github.com/unisdr/delta-feature-prototypes
  path: features/organization-management
  commit: 239cd12e413fd096aa69a0a715333c09cfc8341a
  status: approved
```

## Context

See `proposal.md` for motivation and scope. Currently, `app/routes/$lang+/settings+/organizations+/_layout.tsx` uses `authLoaderPublicOrWithPerm("ManageOrganizations", ...)` to call `OrganizationService.getOrganizationsPageData`, which fetches paginated `{ id, name }` rows (default 50/page, always `asc(organizationTable.name)`, unescaped `ILIKE` on `id::text` or `name`, no user counts). `app/pages/OrganizationManagementPage.tsx` wraps PrimeReact `DataTable` and `Paginator` inside `MainContainer` + `NavSettings` and navigates to child routes (`new.tsx`, `edit.$id.tsx`, `delete.$id.tsx`) that render PrimeReact `Dialog` overlays via `<Outlet />`. Duplicate checks in `OrganizationRepository.getByNameAndCountryAccountsId` are case-sensitive.

Local `_docs/design/DESIGN.md`, `_docs/design/tokens.css`, and `_docs/design/tokens.json` are synced to `unisdr/delta-design` `v0.7.2` (`a86cc3a62378871e93cbfa14aa69740201b8c556`) and imported via `app/styles/all.css`. Reusable `v0.7.2` React Aria primitives already live in `app/design-system/ui/`, while transitional Phase 6a/6h components in `app/design-system/components/` remain untouched.

## Goals / Non-Goals

**Goals:**
- Migrate the `<main>` content of `/:lang/settings/organizations/` to the approved `v0.7.2` React Aria design system and `features/organization-management` prototype, removing `MainContainer` and `NavSettings`.
- Support URL-driven server-side name search (`search`), full-list sorting (`sort`: `name | users`, `dir`: `asc | desc`, default `name` asc), user-count aggregation (`LEFT JOIN user_country_accounts`), and clamped pagination (`page`, `pageSize` defaulting to 25 with options 25/50/100).
- Support in-page React Aria modals (`Add organization`, `Edit organization`, `Delete organization`, and up-front `This organization is in use` alertdialog when `users > 0`) wired via `useFetcher` to the existing `ManageOrganizations`-guarded child routes.
- Enforce case-insensitive duplicate organization name validation both client-side and server-side (scoped to `countryAccountsId`).
- Tighten `_layout.tsx`, `edit.$id.tsx`, and `delete.$id.tsx` loaders to `authLoaderWithPerm("ManageOrganizations", ...)` and guard `getById` with `isValidUUID`.

**Non-Goals:**
- Changing the outer application shell / top navigation outside `<main>`.
- Adding database migrations or changing the `organization` or `user_country_accounts` schema.
- Auto-reassigning users during organization deletion (admins are directed to Access management, matching the prototype).
- Modifying transitional Phase 6a/6h components in `app/design-system/components/`.

## Decisions

### 1. Repository Query Architecture (`app/db/queries/organizationRepository.ts`)

Replace `dr.query.organizationTable.findMany(...)` inside `listByCountryAccountsId` with a Drizzle SQL query using `leftJoin(userCountryAccountsTable, and(eq(userCountryAccountsTable.organizationId, organizationTable.id), eq(userCountryAccountsTable.countryAccountsId, countryAccountsId)))` + `groupBy(organizationTable.id)`:
- **User count**: `sql<number>\`count(${userCountryAccountsTable.id})::int\`` selected as `users`.
- **Search**: when `search` is non-empty, escape `%`, `_`, and `\` before applying `ilike(organizationTable.name, \`%${escaped}%\`)` (matching the prototype's `"Search by name"`).
- **Sorting**: deterministic SQL `orderBy` with secondary tie-breaker on `organizationTable.id`:
  - `name` (default `asc`): `sql\`lower(${organizationTable.name})\``
  - `users`: `sql\`count(${userCountryAccountsTable.id})\``
- **Pagination & clamping**: count filtered rows first (`totalItems`), compute `totalPages = Math.max(1, Math.ceil(totalItems / pageSize))`, clamp `safePage = Math.min(Math.max(1, page), totalPages)`, then apply `LIMIT`/`OFFSET`.
- **Existing names**: fetch all tenant organization names (`select({ name: organizationTable.name }).from(organizationTable).where(eq(organizationTable.countryAccountsId, countryAccountsId))`) so client-side duplicate validation is accurate across all pages and while a search filter is active.
- **Case-insensitive duplicate lookup & UUID guard**:
  - Update `getByNameAndCountryAccountsId` to compare `sql\`lower(trim(${organizationTable.name})) = lower(trim(${name}))\``.
  - Guard `getById(id)` with `if (!isValidUUID(id)) return undefined;` so malformed route IDs cleanly return HTTP 404 instead of PostgreSQL `22P02`.

- **Rationale**: Matches `userCountryAccountsRepository.ts` (`access-management-redesign`) for URL-driven server-side search/sorting/pagination, computes accurate tenant-scoped user counts in SQL, and requires zero schema changes.
- **Alternatives considered**: Fetching all organizations and running `COUNT` per row in JS. Rejected due to N+1 queries and breaking server-side sorting by `users`.

### 2. Child Route Actions + `useFetcher` for In-Page Modals

Keep `new.tsx`, `edit.$id.tsx`, and `delete.$id.tsx` as permission-guarded routes (`authLoaderWithPerm("ManageOrganizations")` / `authActionWithPerm("ManageOrganizations")`). When a request carries `_fetcher=1` (or `X-Requested-With: fetcher` / `Accept: application/json`), return a typed JSON `OrganizationActionResult` (`{ ok: true, intent }` or `{ ok: false, fieldErrors?: { name?: string }, error?: string }`) so `useFetcher` can close the dialog, revalidate the loader, and show the exact toast without losing search/sort/page URL params. Standard non-fetcher form POSTs continue redirecting via `redirectWithMessage`.

- **Rationale**: Preserves existing route URLs, permission guards, and `OrganizationService` business logic, matching `access-management-redesign`.
- **Alternatives considered**: Consolidating mutations into `_layout.tsx`. Rejected for consistency with Access management and existing route structure.

### 3. Reusing `v0.7.2` Primitives in `app/design-system/ui/`

Reuse `Button`, `ModalDialog`, `SortableTable`, `Pagination`, `TextField`, `ToastRegion`, and `Tooltip` from `app/design-system/ui/`. Add optional `autoFocus?: boolean` to `TextFieldProps` in `app/design-system/ui/TextField.tsx` (backward-compatible) so the `Name` field focuses when Add/Edit dialogs open. Render server error banners inside dialogs using an inline `role="alert"` semantic-token container (`border-crit-border bg-crit-bg text-crit`, matching `AccessManagementPage.tsx`) to avoid unnecessary extra primitive files on `dev`.

### 4. TypeScript Types & Interfaces Added / Changed

- `app/db/queries/organizationRepository.ts`:
  - `export type OrganizationSortColumn = "name" | "users";`
  - `export type OrganizationSortDirection = "asc" | "desc";`
  - `export type OrganizationListItem = Pick<SelectOrganization, "id" | "name"> & { users: number };`
  - `ListByCountryAccountsIdArgs`: add optional `sort?: OrganizationSortColumn`, `dir?: OrganizationSortDirection`.
- `app/services/organizationService.ts`:
  - `OrganizationActionResult`: extend failure branch with optional `fieldErrors?: { name?: string }`.
- `app/frontend/organizationAction.ts`:
  - `export { isFetcherRequest } from "~/frontend/user/accessManagementAction";`
  - `export type OrganizationFetcherResult = { ok: true; intent: "create" | "update" | "delete" } | { ok: false; fieldErrors?: { name?: string }; error?: string };`
- `app/design-system/ui/TextField.tsx`:
  - `TextFieldProps`: add optional `autoFocus?: boolean`.

### 5. Database Schema & Form-CSV-API Impact

- **Drizzle schema changes**: None. No migration required; `tests/integration/db/testSchema/` requires no updates.
- **Form-CSV-API `fieldsDef` impact**: None. Organization management settings routes do not use `fieldsDef` or `formScreen()`.

### 6. Test Infrastructure Choice

- **PGlite (`yarn test:run2`, node project)**: Used for `tests/integration/db/queries/organizationRepository.test.ts` and `tests/integration/routes/organizationsRoutes.test.ts` because `organization` and `user_country_accounts` are standard PostgreSQL tables without PostGIS-only functions.
- **DOM (`yarn test:run2`, dom project via `*.dom.test.tsx`)**: Used for `tests/dom/organization-management.dom.test.tsx` (`@testing-library/react` + `@testing-library/user-event`) to test search, clear search, sorting, pagination, Add/Edit/Delete/In-use dialogs, non-backdrop dismissal, Escape/Enter keyboard behavior, inline validation clearing on edit, and toasts.
- **Playwright E2E (`yarn test:e2e`)**: Used for `tests/e2e/organization-management.spec.ts` to run Gate 9b automated axe-core (WCAG 2.0/2.1/2.2 A & AA) checks, full keyboard walk-through, and Gate 9c viewport screenshots (375px, 768px, 1280px).

---

## UI Design Specification (Gate 9 Contract)

### Affected Routes & Presentation Components

- Route layout & loader: `app/routes/$lang+/settings+/organizations+/_layout.tsx`
- Child action routes: `new.tsx`, `edit.$id.tsx`, `delete.$id.tsx`
- Page presentation: `app/pages/OrganizationManagementPage.tsx` (removing `MainContainer` and `NavSettings`)
- Reusable UI primitives: `app/design-system/ui/{Button,ModalDialog,SortableTable,Pagination,TextField,Tooltip,ToastRegion,index}.tsx`

### Selected Design Tokens & UI Components

- **Surfaces & borders**: `--bg` (page), `--surface` (card, inputs, dialogs), `--inset` (hover states), `--overlay` (modal scrim), `--border`, `--border-subtle` (card & table row dividers), `--control-border` (inputs, secondary buttons).
- **Text & action**: `--fg`, `--fg-2`, `--fg-3` (decorative sort arrows / disabled), `--fg-inverse`, `--accent`, `--accent-hover`, `--accent-active`, `--accent-disabled`, `--focus-ring` (`2px solid`, `2px` offset).
- **Status & feedback**: `--crit` / `--crit-hover` / `--crit-bg` / `--crit-border` (field errors, destructive `Delete organization` button, server error banner), `--toast-bg` (toast background).
- **Typography & spacing**: `Inter` (`--font`), `text-page` (20/500), `text-section` (16/500), `text-body` (14/400), `text-label` (12/500, sentence case, `--fg-2`), `tabular-nums` for user counts and pagination counts; spacing strictly on the 4/8/12/16/24/32/48/64px scale via parent `gap`.
- **Icons**: `lucide-react` only (`Plus`, `Pencil`, `Trash2`, `X`, `Check`, `AlertCircle`, `ArrowUp`, `ArrowDown`, `ChevronsUpDown`, `ChevronLeft`, `ChevronRight`), 16px inline.

### Content & Interaction Ground-Truth Checklist

- **Page header**: `<h1>Organizations</h1>`, subtitle `"The organizations people on this site belong to."`, primary button `"Add organization"` with `Plus` icon (when permitted).
- **Search bar (`role="search"`)**: `TextField` (`type="search"`, `w-[340px] max-w-full`, `aria-label="Search by name"`, `placeholder="Search by name"`, debounced 250ms URL navigation resetting `page=1`).
- **Table column order & sorting**:
  1. `Name` (sortable, default `asc`, row header, truncated at `max-w-[560px]` with `title` tooltip)
  2. `Users` (sortable, `tabular-nums`, integer count)
  3. `Actions` (not sortable, `sr-only` header; right-aligned icon buttons when permitted: `Edit organization` pencil with `aria-label="Edit <name>"`, `Delete organization` trash with `aria-label="Delete <name>"`)
- **Pagination defaults**: Default `25` rows/page; options `25`, `50`, `100`; left text `"Showing X-Y of N organizations"`; right `"Rows per page"` select + Previous button + `"Page X of Y"` + Next button.
- **Add organization dialog**: `size="md"`, Title `"Add organization"`, `<form onSubmit>` with `Name` `TextField` (required, `autoFocus`). Validation on submit (cleared on edit): empty -> `"Enter a name."`; case-insensitive duplicate -> `"An organization with this name already exists."`. Footer: `Cancel` (secondary), `Add organization` (primary).
- **Edit organization dialog**: `size="md"`, Title `"Edit organization"`, `<form onSubmit>` with prefilled `Name` `TextField` + same empty/duplicate validation (excluding self). Footer: `Cancel` (secondary), `Save changes` (primary).
- **Delete organization dialog (`users > 0`, blocked)**: `role="alertdialog"`, `size="md"`, Title `"This organization is in use"`, body `"<strong><name></strong> has <N user|N users>. Move them to another organization in Access management, then delete it."`. Footer: single primary `"Close"` button.
- **Delete organization dialog (`users === 0`, confirmable)**: `role="alertdialog"`, `size="md"`, Title `"Delete organization"`, body `"<strong><name></strong> will be deleted. This cannot be undone."`. Footer: `Cancel` (secondary), `Delete organization` (destructive).

### Material States

- **Empty**: Search active -> `No organizations match "<search>".` + secondary `"Clear search"` button; zero organizations -> `"No organizations yet."`.
- **Loading**: Submit buttons show loading spinner + disabled state while `fetcher.state !== "idle"`; page container sets `aria-busy` while `navigation.state === "loading"`.
- **Error**: Field validation errors render in 12px `--crit` below `Name` on submit and clear immediately on edit. Server/network errors render in an inline `role="alert"` banner (`--crit-bg`, `--crit-border`, `--crit`) without clearing user input.
- **Success**: Dialog closes on success; bottom-right toast (`--toast-bg`, `--fg-inverse`, 4s auto-dismiss, max 3 stacked) confirms:
  - Add: `"<name> was added."`
  - Edit: `"Changes saved."`
  - Delete: `"<name> was deleted."`
- **Destructive action**: Delete dialog checks `users > 0` up front; when `users === 0`, names the organization, states `"This cannot be undone."`, and uses the `destructive` button variant.

### Responsive, Keyboard & Accessibility Expectations

- **Responsive**: Content centered in `max-w-[1280px]`; mobile (375px) stacks header, full-width search, and pagination cleanly with horizontal scroll on the table container and padded modal; tablet (768px) and desktop (1280px) match prototype layout.
- **Keyboard & focus order**: Tab flows top-to-bottom: `Add organization` -> search input -> sortable column headers (`Name`, `Users`) -> per-row `Edit`, `Delete` icon buttons -> pagination controls. Pressing `Enter` inside Add/Edit dialog inputs submits the form. Opening any dialog traps focus inside; closing via `Escape`, `Cancel`, or `Close` restores focus to the trigger.
- **Target sizes**: All clickable controls >= 24x24 CSS px (`--target-min`); all action and close icon buttons 32x32 CSS px (`h-8 w-8`).
- **Accessible names & label-in-name**: Visible button text matches accessible name (`Add organization`, `Save changes`, `Delete organization`, `Clear search`, `Cancel`, `Close`). Icon-only buttons carry descriptive `aria-label` + matching Tooltip (`Edit <name>`, `Delete <name>`, `Close`, `Previous page`, `Next page`).
- **Copy & localisation**: All user-facing strings wrapped in `ctx.t({ code, msg })` with sentence case, UK English (`organization` with `z`), and no em dashes. Run `yarn i18n:extractor` after adding/updating keys.

### Documented Deviations from Prototype / Design System

1. **URL-driven server-side search, sorting, and pagination**: Prototype filters, sorts, and paginates in client state; production uses URL search params (`search`, `sort`, `dir`, `page`, `pageSize`) backed by SQL in `OrganizationRepository.listByCountryAccountsId` for consistency with `AccessManagementPage`.
2. **Server-side duplicate-name enforcement & FK safety net**: Production enforces case-insensitive uniqueness both client-side and server-side (scoped to `countryAccountsId`) and retains the server `23503` foreign-key handler on delete for concurrent assignment protection.
3. **`NavSettings` removal**: Explicitly requested by user to apply only the prototype `<main>` design on `/:lang/settings/organizations/`.
4. **Permission gating**: Production preserves `ManageOrganizations` on all routes and `canManageOrganizations` / `canAddNewRecord` UI checks.
5. **Toast success icon token (`--good-on-dark`)**: Inherits the existing `ToastRegion` deviation (`text-good-bg` on `bg-toast`) until upstream PR `unisdr/delta-design#1` merges.

## Risks / Trade-offs

- **Concurrent user assignment before delete** -> Even though the UI blocks deletion up front when `users > 0`, a user could be assigned to the organization in another tab between list load and delete POST; `OrganizationService.organizationAction`'s `23503` catch handler continues returning a clear error without crashing.
- **Race condition on concurrent duplicate-name creation** -> Without a case-insensitive unique functional index, simultaneous inserts could pass the application check; `23505` handling in `OrganizationService` remains in place.
- **Dual response format in child route actions** -> Returning JSON for `useFetcher` requests and redirects for full-page form POSTs keeps existing URLs functional while enabling in-page modals; covered by integration and DOM tests.
