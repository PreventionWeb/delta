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
  path: features/access-management
  commit: 239cd12e413fd096aa69a0a715333c09cfc8341a
  status: approved
```

> Note: `feature-prototype.status` is set to `required` until human specification review approves the hand-off (changing it to `approved` prior to `/opsx:apply`).

## Context

See `proposal.md` for motivation and scope. Currently, `app/routes/$lang+/settings+/access-mgmnt+/_layout.tsx` loads a paginated list of `user_country_accounts` rows filtered only by `organization` (in-memory substring match on organization names) and `role`, with no sorting and a default page size of 50. `app/pages/AccessManagementPage.tsx` wraps a PrimeReact `DataTable` and `Paginator` inside `MainContainer` + `NavSettings` and navigates to child routes (`new.tsx`, `edit.$id.tsx`, `delete.$id.tsx`, `resend-invitation.$id.tsx`) that render PrimeReact `Dialog` overlays via `<Outlet />`.

Local `_docs/design/DESIGN.md`, `_docs/design/tokens.css`, and `_docs/design/tokens.json` are already synced to `unisdr/delta-design` `v0.7.2` (`a86cc3a62378871e93cbfa14aa69740201b8c556`) and imported via `app/styles/all.css`. Existing Phase 6a/6h transitional components live in `app/design-system/components/` and must remain untouched.

## Goals / Non-Goals

**Goals:**
- Migrate the `<main>` content of `/:lang/settings/access-mgmnt/` to the approved `v0.7.2` React Aria design system and `features/access-management` prototype.
- Support tenant-scoped server-side unified search (`search`), role filtering (`role`), full-list sorting (`sort`, `dir`), and pagination (`page`, `pageSize` defaulting to 25 with options 25/50/100).
- Build reusable, domain-agnostic `v0.7.2` React Aria UI primitives under `app/design-system/ui/` using semantic tokens only.
- Keep existing child routes (`new.tsx`, `edit.$id.tsx`, `delete.$id.tsx`, `resend-invitation.$id.tsx`) as permission-guarded POST endpoints invoked via `useFetcher` from in-page modals and the one-click row resend button.

**Non-Goals:**
- Changing the outer application shell / top navigation outside `<main>`.
- Adding database migrations or a new `added_by` column (Edit dialog keeps `"System Admin"`).
- Modifying `app/frontend/user/roles.ts` labels globally (sentence-case presentation is applied via CSS in Access management).
- Blocking admins from editing their own role or adding record-ownership transfer on user deletion.
- Modifying existing Phase 6a/6h transitional components in `app/design-system/components/`.

## Decisions

### 1. Repository Query Architecture (`app/db/queries/userCountryAccountsRepository.ts`)

Replace `dr.query.userCountryAccountsTable.findMany(...)` inside `getUserCountryAccountsWithUserByCountryAccountsId` with a Drizzle SQL query using `innerJoin(userTable)` and `leftJoin(organizationTable)`, always scoped by `eq(userCountryAccountsTable.countryAccountsId, countryAccountsId)`.

- **Rationale**: Drizzle's relational `findMany` cannot filter or sort by joined `user` and `organization` columns in SQL while keeping `LIMIT`/`OFFSET` and `COUNT(*)` accurate across the whole tenant list.
- **Unified search**: When `filters.search?.trim()` is non-empty, apply a case-insensitive `ilike` pattern (`%${escaped}%`) across:
  - `userTable.firstName`
  - `userTable.lastName`
  - `sql\`concat_ws(' ', ${userTable.firstName}, ${userTable.lastName})\``
  - `userTable.email`
  - `organizationTable.name`
- **Full-list sorting**: Map validated `AccessManagementSortColumn` values to deterministic SQL `orderBy` expressions (with a secondary tie-breaker on `userCountryAccountsTable.id` for stable pagination):
  - `name`: `sql\`lower(coalesce(nullif(trim(concat_ws(' ', ${userTable.firstName}, ${userTable.lastName})), ''), ${userTable.email}))\``
  - `status`: `userTable.emailVerified` (active vs. pending)
  - `org`: `sql\`lower(coalesce(${organizationTable.name}, ''))\``
  - `role`: `userCountryAccountsTable.role`
  - `added`: `userCountryAccountsTable.addedAt` (default: `desc`)
- **Backward compatibility**: Preserve `organizationIds` in the filter type if any other caller passes it, while `_layout.tsx` switches to `search`, `role`, `sort`, and `dir`.
- **Alternatives considered**: Fetching all tenant users into memory and filtering/sorting in JS. Rejected because it breaks server-side pagination scalability and violates repository query conventions.

### 2. Child Route Actions + `useFetcher` for In-Page Modals & One-Click Resend

Keep `new.tsx`, `edit.$id.tsx`, `delete.$id.tsx`, and `resend-invitation.$id.tsx` with their existing `authActionWithPerm` (`InviteUsers` / `EditUsers`) guards and `AccessManagementService` calls. When a request includes `Accept: application/json` or a `_fetcher=1` form field (or `request.headers.get("X-Requested-With") === "fetcher"`), return a typed JSON response (`AccessManagementActionResult`) instead of a 302 redirect so `useFetcher` can close the modal, trigger React Router loader revalidation, and show the exact named toast without losing search/sort/page URL params. Standard full-page form submissions continue to redirect cleanly.

- **Rationale**: Simplest architecture that preserves per-action permission boundaries (`InviteUsers` vs. `EditUsers`), avoids duplicating service calls into `_layout.tsx`, and keeps `<Outlet />` fallback intact.
- **Alternatives considered**: Consolidating all 4 mutations into a single `_layout.tsx` action with an `intent` switch. Rejected because `InviteUsers` and `EditUsers` are distinct permissions and splitting them cleanly across existing route modules is simpler and safer.

### 3. Reusable v0.7.2 Primitives in `app/design-system/ui/`

Create a dedicated `app/design-system/ui/` directory for `v0.7.2` semantic-token React Aria components rather than mutating `app/design-system/components/`.

- **Rationale**: `openspec/specs/design-system-components/spec.md` pins `app/design-system/components/` to the Phase 6a/6h legacy-parity `dts-*` contract used by Hazardous Events preview screens. Separating `v0.7.2` primitives into `app/design-system/ui/` lets new screens adopt DELTA Design System `v0.7.2` cleanly with zero regression risk.

### 4. TypeScript Types & Interfaces Added / Changed

- `app/db/queries/userCountryAccountsRepository.ts`:
  - `export type AccessManagementSortColumn = "name" | "status" | "org" | "role" | "added";`
  - `export type SortDirection = "asc" | "desc";`
  - `export interface AccessManagementListFilters { search?: string; role?: string; organizationIds?: string[]; sort?: AccessManagementSortColumn; dir?: SortDirection; }`
  - `export interface AccessManagementUserRow { id: string; userId: string; countryAccountsId: string; role: string; isPrimaryAdmin: boolean; addedAt: Date; organizationId: string | null; user: { id: string; firstName: string; lastName: string; email: string; emailVerified: boolean }; organization: { id: string; name: string } | null; }`
- `app/routes/$lang+/settings+/access-mgmnt+/`:
  - `export type AccessManagementActionResult = { ok: true; message?: string } | { ok: false; fieldErrors?: Record<string, string>; error?: string };`
- `app/design-system/ui/`:
  - `ButtonProps` (`variant: "primary" | "secondary" | "ghost" | "destructive" | "icon"`, `size: "sm" | "md" | "lg"`, `isLoading?: boolean`)
  - `ModalDialogProps` (`isOpen`, `onOpenChange`, `title`, `role?: "dialog" | "alertdialog"`, `size?: "md" | "lg"`, `children`, `footer`)
  - `TextFieldProps` (`label`, `name`, `type`, `value`, `onChange`, `placeholder`, `isRequired`, `isDisabled`, `errorMessage`, `helpText`, `aria-label`)
  - `SelectOption` (`{ id: string; label: string }`), `FormSelectProps`, `FilterSelectProps`
  - `SortableColumnDef`, `SortDescriptor`, `SortableTableProps<T>`
  - `PaginationProps` (`total`, `page`, `pageSize`, `pageSizeOptions`, `onPageChange`, `onPageSizeChange`, `noun`)
  - `StatusTone` (`"positive" | "warning" | "critical" | "info" | "neutral"`), `StatusIndicatorProps`
  - `TooltipProps` (`text`, `children`)
  - `ToastItem`, `ToastRegionProps`

### 5. Database Schema & Form-CSV-API Impact

- **Drizzle schema changes**: None. No migration required; `tests/integration/db/testSchema/` requires no updates.
- **Form-CSV-API `fieldsDef` impact**: None. Access management does not use `fieldsDef` or `formScreen()`.

### 6. Test Infrastructure Choice

- **PGlite (`yarn test:run2`)**: Used for `tests/integration/db/queries/userCountryAccounts.test.ts` because `user`, `user_country_accounts`, and `organization` are standard PostgreSQL tables without PostGIS-only functions, so PGlite executes the exact SQL joins, `ilike` search, `orderBy`, and `countryAccountsId` isolation fast with no external DB.
- **DOM (`yarn test:dom`)**: Used for `tests/dom/access-management.test.tsx` (`vitest.dom.config.ts` + `@testing-library/react` + `@testing-library/user-event`) to test real keyboard navigation, Escape/backdrop modal behavior, validation clearing on edit, optional organization clearing, and fetcher-driven UI states.
- **Playwright E2E (`yarn test:e2e`)**: Used for `tests/e2e/access-management.spec.ts` to run Gate 9b automated axe-core (WCAG 2.0/2.1/2.2 A & AA) checks, full keyboard walk-through, and Gate 9c viewport screenshots (375px, 768px, 1280px).

---

## UI Design Specification (Gate 9 Contract)

### Affected Routes & Presentation Components

- Route layout & loader: `app/routes/$lang+/settings+/access-mgmnt+/_layout.tsx`
- Child action routes: `new.tsx`, `edit.$id.tsx`, `delete.$id.tsx`, `resend-invitation.$id.tsx`
- Page presentation: `app/pages/AccessManagementPage.tsx` (removing `MainContainer` header and `NavSettings`)
- Reusable UI primitives: `app/design-system/ui/{Button,ModalDialog,TextField,SelectField,SortableTable,Pagination,StatusIndicator,Tooltip,ToastRegion,index}.tsx`

### Selected Design Tokens & UI Components

- **Surfaces & borders**: `--bg` (page), `--surface` (card, inputs, dialogs, popovers), `--inset` (filter active state, disabled inputs, hover states), `--overlay` (modal scrim), `--border`, `--border-subtle` (card & table row dividers), `--control-border` (inputs, selects, secondary buttons).
- **Text & action**: `--fg`, `--fg-2`, `--fg-3` (disabled/decorative only), `--fg-inverse`, `--accent`, `--accent-hover`, `--accent-active`, `--accent-disabled`, `--focus-ring` (`2px solid`, `2px` offset).
- **Status & feedback**: `--good` (Active dot), `--warn` (Invitation pending dot), `--crit` / `--crit-hover` / `--crit-bg` / `--crit-border` (field errors, destructive Delete button, error banner), `--toast-bg` (toast background).
- **Typography & spacing**: `Inter` (`--font`), `.t-page-title` (20/500), `.t-section` (16/500), body (14/400), `.t-th` (12/500, sentence case, `--fg-2`), `.tnum` (`tabular-nums` for dates and counts); spacing strictly on the 4/8/12/16/24/32/48/64px scale via parent `gap`.
- **Icons**: `lucide-react` only (`UserPlus`/`Plus`, `Mail`, `Pencil`, `Trash2`, `X`, `ChevronDown`, `ChevronLeft`, `ChevronRight`, `ArrowUp`, `ArrowDown`, `ChevronsUpDown`, `Check`, `AlertCircle`), 16px inline, 20px standalone where applicable.

### Content & Interaction Ground-Truth Checklist

- **Page header**: `<h1>Access management</h1>`, subtitle `"Invite people and set what they can do on this site."`, primary button `"Invite user"` with icon.
- **Filter bar (`role="search"`)**: Search input (`width: 340px` desktop, full width mobile, placeholder `"Search by name, email or organization"`, `aria-label="Search by name, email or organization"`), Role filter trigger (`All roles`, `Data viewer`, `Data collector`, `Data validator`, `Admin`), ghost `"Clear filters"` button. When a role is selected, show `"<Role>: <capability>"` below the filter bar.
- **Table column order & sorting**:
  1. `Name` (sortable, row header, truncated at `max-w-[200px]` with `title` tooltip; falls back to `email` when `firstName` & `lastName` are empty)
  2. `Status` (sortable; 8px dot + `"Active"` or `"Invitation pending"`)
  3. `Email` (not sortable; truncated at `max-w-[260px]` with `title` tooltip)
  4. `Organization` (sortable; truncated at `max-w-[180px]` with `title`; `"-"` when empty)
  5. `Role` (sortable; CSS sentence-case styling + `(Primary Admin)` when `isPrimaryAdmin`)
  6. `Date added` (sortable, default `desc`; `tabular-nums`, formatted `dd MMM yyyy`, e.g. `14 Sep 2026`)
  7. `Actions` (not sortable, `sr-only` header; right-aligned icon buttons in fixed slots: Resend invitation [pending only, empty 32px spacer when active], Edit user, Delete user)
- **Pagination defaults**: Default `25` rows/page; options `25`, `50`, `100`; left text `"Showing X-Y of N users"`; right `"Rows per page"` select + Previous button + `"Page X of Y"` + Next button.
- **Invite user dialog**: Title `"Invite user"`, fields in order: `Email address (required)` (placeholder `"name@organization.org"`), `Organization` (optional, placeholder `"Select an organization"`, `"No organization"` clears), `Role (required)` (placeholder `"Select a role"`, live helper `"A <role> can ..."` below). Footer: `Cancel` (secondary), `Send invitation` (primary).
- **Edit user dialog**: Title `"Edit user"`, read-only `<dl>` metadata (`Status`, `Date added`, `Added by` = `"System Admin"`), disabled `Email address (required)`, optional `Organization` (clearable via `"No organization"`), `Role (required)` with live helper. Footer: `Cancel` (secondary), `Save changes` (primary).
- **Delete user dialog**: `role="alertdialog"`, Title `"Delete user"`, body `"<strong><displayName></strong> will lose access to DELTA. This cannot be undone."`, Footer: `Cancel` (secondary), `Delete user` (destructive).
- **One-click resend**: Clicking Resend invitation icon on a pending row submits directly without a confirmation modal.

### Material States

- **Empty**: No matches -> `"No users match these filters."` inside table body; `"Clear filters"` resets to full list. First-use empty tenant -> `"No users found."` with `Invite user` primary action in header.
- **Loading**: Submit buttons show loading spinner + disabled state preserving width; row resend icon button disables while submitting; search/filter/pagination navigation shows subtle busy state without clearing filters.
- **Error**: Field validation errors render in 12px `--crit` below the field (`slot="errorMessage"`) on submit and clear immediately when the field is edited. Server/network errors render in an inline `role="alert"` error banner (`--crit-bg`, `--crit-border`) without losing user input or filters.
- **Success**: Dialog closes on success; bottom-right toast (`--toast-bg`, `--fg-inverse`, 4s auto-dismiss, stack up to 3) confirms:
  - Invite: `"Invitation sent to <email>."`
  - Edit: `"Changes saved for <displayName>."`
  - Delete: `"<displayName> was deleted."`
  - Resend: `"Invitation sent again to <email>."`
- **Destructive action**: Delete dialog names the user and states `"This cannot be undone."`; primary admin rows cannot be edited or deleted.

### Responsive, Keyboard & Accessibility Expectations

- **Responsive**: Content centered in `max-w-[1280px]`; mobile (375px) stacks header/search/pagination cleanly with horizontal scroll on the table container and full-screen/padded modal; tablet (768px) and desktop (1280px) match prototype grid/flex spacing.
- **Keyboard & focus order**: Tab flows top-to-bottom: `Invite user` -> search input -> role filter -> `Clear filters` -> sortable column headers -> row action buttons -> pagination controls. Opening a dialog traps focus inside the modal; closing via Escape, Cancel, or Close restores focus to the trigger.
- **Target sizes**: All clickable controls >= 24x24 CSS px (`--target-min`); all action and close icon buttons 32x32 CSS px (`h-8 w-8`).
- **Accessible names & label-in-name**: Visible button text matches accessible name (`Invite user`, `Clear filters`, `Cancel`, `Send invitation`, `Save changes`, `Delete user`). Icon-only buttons carry descriptive `aria-label` + matching Tooltip (`Resend invitation to <name>`, `Edit <name>`, `Delete <name>`, `Close`, `Previous page`, `Next page`).
- **Copy & localisation**: All user-facing strings wrapped in `ctx.t({ code, msg })` with sentence case, UK English (`organization` with `z`), and no em dashes (`—`). Run `yarn i18n:extractor` after adding/updating keys.

### Documented Deviations from Prototype / Design System

1. **Toast success icon token (`--good-on-dark`)**: Referenced in prototype `notes.md` and pending in open upstream PR `unisdr/delta-design#1` (not yet merged into pinned `a86cc3a62378871e93cbfa14aa69740201b8c556`). Until PR #1 merges and `_docs/design/tokens.css` is re-synced, the success toast icon uses `--good-bg` (high contrast on `--toast-bg`, no hardcoded hex).
2. **`NavSettings` removal**: User explicitly confirmed removing `NavSettings` and applying only the prototype `<main>` design on `/:lang/settings/access-mgmnt/`.
3. **Primary Admin protection**: Prototype omits primary-admin constraints; production preserves `(Primary Admin)` display and disabled/blocked edit & delete behavior per `AccessManagementService`.
4. **Pending user empty name fallback**: Prototype mock users always have first/last names; production falls back to `email` when `firstName` and `lastName` are empty.
5. **Role casing via CSS**: `app/frontend/user/roles.ts` remains Title Case globally; Access management applies CSS sentence-case (`inline-block lowercase first-letter:uppercase`) to match prototype typography without side effects on other pages.

## Risks / Trade-offs

- **Primary admin edit/delete UX** -> Disabling Edit/Delete buttons with an accessible tooltip/title on primary admin rows prevents futile submissions while `AccessManagementService` continues enforcing the rule server-side.
- **Dual response format in child route actions** -> Returning JSON for `useFetcher` requests and redirects for full-page form POSTs keeps existing URLs functional while enabling in-page modals; covered by unit/DOM tests.
- **SQL `ilike` special characters (`%`, `_`)** -> Escape `%`, `_`, and `\` in user search input before building the `ilike` pattern to prevent unintended wildcard matching.
