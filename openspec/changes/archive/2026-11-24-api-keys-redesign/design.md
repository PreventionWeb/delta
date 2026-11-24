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
  path: features/api-keys
  commit: 239cd12e413fd096aa69a0a715333c09cfc8341a
  status: approved
```

## Context

See `proposal.md` for motivation and scope. Currently, `app/routes/$lang+/settings+/api-key+/_layout.tsx` loads all `api_key` rows for the active `countryAccountsId` ordered by `desc(apiKeyTable.name)`, slices them in React state with PrimeReact `DataTable` and `Paginator` (default 10 rows/page) inside `MainContainer` + `NavSettings`, and navigates to child routes (`new.tsx`, `edit.$id.tsx`, `delete.$id.tsx`) that render PrimeReact `Dialog` overlays via `<Outlet />`. Creating a key redirects back to the list with a `"Changes saved"` flash message without showing the full newly generated secret.

Local `_docs/design/DESIGN.md`, `_docs/design/tokens.css`, and `_docs/design/tokens.json` are synced to `unisdr/delta-design` `v0.7.2` (`a86cc3a62378871e93cbfa14aa69740201b8c556`) and imported via `app/styles/all.css`. Reusable `v0.7.2` React Aria primitives already live in `app/design-system/ui/` (from `2026-11-23-access-management-redesign`), while transitional Phase 6a/6h components in `app/design-system/components/` remain untouched.

## Goals / Non-Goals

**Goals:**
- Migrate the `<main>` content of `/:lang/settings/api-key/` to the approved `v0.7.2` React Aria design system and `features/api-keys` prototype, removing `MainContainer` and `NavSettings`.
- Implement URL-driven server-side full-list sorting (`sort`, `dir`) and pagination (`page`, `pageSize` defaulting to 25 with options 25/50/100) consistent with Access management.
- Support in-page React Aria modals (`Add API key`, `API key created`, `Rename API key`, `Delete API key`) wired via `useFetcher` to the existing `EditAPIKeys`-guarded child routes (`new.tsx`, `edit.$id.tsx`, `delete.$id.tsx`).
- Enforce case-insensitive duplicate key name validation both client-side and server-side (scoped to `countryAccountsId`).
- Fix two pre-existing route-loader security gaps (`edit.$id.tsx` missing tenant check in loader; `delete.$id.tsx` using `authLoaderPublicOrWithPerm` instead of `authLoaderWithPerm`).

**Non-Goals:**
- Changing the outer application shell / top navigation outside `<main>`.
- Adding database migrations, changing the `api_key` table schema, or changing API key authentication/hashing behavior (`ApiKeyAuthGuard.server.ts`).
- Adding a search or filter bar (not part of the `features/api-keys` prototype).
- Modifying transitional Phase 6a/6h components in `app/design-system/components/`.

## Decisions

### 1. Repository Query Architecture (`app/db/queries/apiKeyRepository.ts`)

Add SQL query methods on `ApiKeyRepository` alongside existing methods:
- `listByCountryAccountsId(countryAccountsId, options)` using `dr.select(...).from(apiKeyTable).innerJoin(userTable, eq(apiKeyTable.managedByUserId, userTable.id))` scoped by `eq(apiKeyTable.countryAccountsId, countryAccountsId)`, returning `{ items, total, existingNames }`:
  - **Sorting**: map validated `ApiKeySortColumn` values to deterministic SQL `orderBy` expressions with a secondary tie-breaker on `apiKeyTable.id`:
    - `name`: `sql\`lower(${apiKeyTable.name})\``
    - `managedBy`: `sql\`lower(${userTable.email})\``
    - `created`: `apiKeyTable.createdAt` (default: `desc`)
  - **Pagination**: apply SQL `LIMIT` (`pageSize`) and `OFFSET` (`(page - 1) * pageSize`) with a separate tenant-scoped `COUNT(*)` query.
  - **Existing names**: return the tenant's existing key names (`string[]`) so client-side duplicate validation works accurately even when a tenant has more than 25 keys across multiple pages.
- `existsByNameInTenant(countryAccountsId, name, excludeId?)`: executes a tenant-scoped `SELECT id FROM api_key WHERE country_accounts_id = $1 AND lower(trim(name)) = lower(trim($2))` (plus `AND id <> $3` when `excludeId` is provided) for authoritative server-side duplicate validation.
- `create(...)`: extend `.returning(...)` from `{ id: apiKeyTable.id }` to `{ id: apiKeyTable.id, name: apiKeyTable.name, secret: apiKeyTable.secret }` so `new.tsx` can return the newly generated secret to the `API key created` reveal dialog.

- **Rationale**: Matches `userCountryAccountsRepository.ts` (`access-management-redesign`) for URL-driven server-side sorting and pagination consistency across Settings screens, guarantees tenant isolation in SQL, and requires zero schema changes.
- **Alternatives considered**: Keeping in-memory sorting/pagination in `_layout.tsx` (as suggested in prototype `README.md`). Rejected per explicit decision to keep Settings list pages consistent with Access management's URL-driven server-side pattern.

### 2. Child Route Actions + `useFetcher` for In-Page Modals

Keep `new.tsx`, `edit.$id.tsx`, and `delete.$id.tsx` as permission-guarded routes (`authLoaderWithPerm("EditAPIKeys")` / `authActionWithPerm("EditAPIKeys")`). When a request carries `_fetcher=1` (or `X-Requested-With: fetcher` / `Accept: application/json`), return a typed JSON `ApiKeyActionResult` instead of a 302 redirect so `useFetcher` can:
- On create success: close `Add API key`, open `API key created` with `{ id, name, secret }`, and revalidate the loader without losing URL sort/page state.
- On rename success: close `Rename API key`, revalidate the loader, and show toast `"Changes saved."`.
- On delete success: close `Delete API key`, revalidate the loader, and show toast `"<name> was deleted."`.
- On validation error: display server `fieldErrors.name` inline below the `Name` field (or server error in an inline error `Callout` banner).

Standard non-fetcher form POSTs continue redirecting via `redirectWithMessage`.

- **Rationale**: Preserves existing route URLs, permission boundaries, and `<Outlet />` fallback, matching `access-management-redesign`.
- **Alternatives considered**: Consolidating all mutations into `_layout.tsx` via an `intent` field. Rejected to avoid duplicating route handlers and to keep consistency with Access management.

### 3. Reusable `v0.7.2` Primitives in `app/design-system/ui/`

Reuse `Button`, `ModalDialog`, `SortableTable`, `Pagination`, `TextField`, `ToastRegion`, and `Tooltip` from `app/design-system/ui/`. Make two minimal, backward-compatible additions:
- Extend `TextFieldProps` in `app/design-system/ui/TextField.tsx` with optional `isReadOnly?: boolean`, `autoFocus?: boolean`, and `onFocus?: FocusEventHandler<HTMLInputElement>` (and make `onChange` optional when `isReadOnly` is true).
- Add `app/design-system/ui/Callout.tsx` (`tone: "success" | "error" | "info" | "warning"`, `title?: string`, `children: ReactNode`) using semantic tokens (`bg-good-bg`/`border-good-border`/`text-good`, `bg-crit-bg`/`border-crit-border`/`text-crit`, `bg-info-bg`/`border-info-border`/`text-info`, `bg-warn-bg`/`border-warn-border`/`text-warn`), exported from `app/design-system/ui/index.ts`.

### 4. TypeScript Types & Interfaces Added / Changed

- `app/db/queries/apiKeyRepository.ts`:
  - `export type ApiKeySortColumn = "name" | "managedBy" | "created";`
  - `export type ApiKeySortDirection = "asc" | "desc";`
  - `export interface ApiKeyListOptions { page: number; pageSize: number; sort: ApiKeySortColumn; dir: ApiKeySortDirection; }`
  - `export interface ApiKeyListRow { id: string; name: string; secret: string; createdAt: Date; managedByUserId: string; managedByUser: { email: string }; }`
  - `export interface ApiKeyListResult { items: ApiKeyListRow[]; total: number; existingNames: string[]; }`
- `app/routes/$lang+/settings+/api-key+/`:
  - `export type ApiKeyActionResult = { ok: true; key?: { id: string; name: string; secret: string } } | { ok: false; fieldErrors?: { name?: string }; error?: string };`
- `app/pages/ApiKeysPage.tsx`:
  - `export interface ApiKeysPageProps { items: ApiKeyListRow[]; total: number; existingNames: string[]; sort: ApiKeySortColumn; dir: ApiKeySortDirection; page: number; pageSize: number; canAdd: boolean; canEdit: boolean; }`
- `app/design-system/ui/TextField.tsx`:
  - `TextFieldProps`: add `isReadOnly?: boolean`, `autoFocus?: boolean`, `onFocus?: React.FocusEventHandler<HTMLInputElement>`, make `onChange?: (value: string) => void`.
- `app/design-system/ui/Callout.tsx`:
  - `export type CalloutTone = "success" | "error" | "info" | "warning";`
  - `export interface CalloutProps { tone: CalloutTone; title?: string; children: ReactNode; className?: string; }`

### 5. Database Schema & Form-CSV-API Impact

- **Drizzle schema changes**: None. No migration required; `tests/integration/db/testSchema/` requires no updates.
- **Form-CSV-API `fieldsDef` impact**: None. API keys settings routes do not use `fieldsDef` or `formScreen()`.

### 6. Test Infrastructure Choice

- **PGlite (`yarn test:run2`, node project)**: Used for `tests/integration/db/queries/apiKeyRepository.test.ts` because `api_key` and `user` are standard PostgreSQL tables without PostGIS-only functions, so PGlite runs the exact SQL joins, `lower(trim(...))` duplicate checks, `orderBy`, `LIMIT`/`OFFSET`, and `countryAccountsId` isolation fast with no external DB.
- **DOM (`yarn test:run2`, dom project via `*.dom.test.tsx`)**: Used for `tests/dom/api-keys.dom.test.tsx` (`@testing-library/react` + `@testing-library/user-event`) to test all 4 dialogs, non-backdrop dismissal, Escape/Cancel/X focus restoration, client + server duplicate validation clearing on edit, post-create reveal dialog, clipboard copy + toast, and URL-driven sort/pagination.
- **Playwright E2E (`yarn test:e2e`)**: Used for `tests/e2e/api-keys.spec.ts` to run Gate 9b automated axe-core (WCAG 2.0/2.1/2.2 A & AA) checks, full keyboard walk-through, and Gate 9c viewport screenshots (375px, 768px, 1280px).

---

## UI Design Specification (Gate 9 Contract)

### Affected Routes & Presentation Components

- Route layout & loader: `app/routes/$lang+/settings+/api-key+/_layout.tsx`
- Child action routes: `new.tsx`, `edit.$id.tsx`, `delete.$id.tsx`
- Page presentation: `app/pages/ApiKeysPage.tsx` (removing `MainContainer` and `NavSettings`)
- Reusable UI primitives: `app/design-system/ui/{Button,ModalDialog,SortableTable,Pagination,TextField,Callout,Tooltip,ToastRegion,index}.tsx`

### Selected Design Tokens & UI Components

- **Surfaces & borders**: `--bg` (page), `--surface` (card, inputs, dialogs), `--inset` (hover states, read-only input), `--overlay` (modal scrim), `--border`, `--border-subtle` (card & table row dividers), `--control-border` (inputs, secondary buttons).
- **Text & action**: `--fg`, `--fg-2`, `--fg-3` (decorative sort arrows / disabled), `--fg-inverse`, `--accent`, `--accent-hover`, `--accent-active`, `--accent-disabled`, `--focus-ring` (`2px solid`, `2px` offset).
- **Status & feedback**: `--good` / `--good-bg` / `--good-border` (`API key created` success callout), `--crit` / `--crit-hover` / `--crit-bg` / `--crit-border` (field errors, destructive `Delete key` button, error callout), `--toast-bg` (toast background).
- **Typography & spacing**: `Inter` (`--font`), `IBM Plex Mono` (`--mono` / `font-mono` for masked key in table and read-only full key in reveal dialog), `.t-page-title` (20/500), `.t-section` (16/500), body (14/400), `.t-th` (12/500, sentence case, `--fg-2`), `.tnum` (`tabular-nums` for dates and pagination counts); spacing strictly on the 4/8/12/16/24/32/48/64px scale.
- **Icons**: `lucide-react` only (`Plus`, `Copy`, `Pencil`, `Trash2`, `X`, `Check`, `CheckCircle2`, `AlertCircle`, `ArrowUp`, `ArrowDown`, `ChevronsUpDown`, `ChevronLeft`, `ChevronRight`), 16px inline.

### Content & Interaction Ground-Truth Checklist

- **Page header**: `<h1>API keys</h1>`, subtitle `"Keys that let other applications read and send data for this site."`, primary button `"Add API key"` with `Plus` icon (shown when `canAdd`).
- **Table column order & sorting**:
  1. `Name` (sortable, row header, truncated at `max-w-[320px]` with `title` tooltip)
  2. `Key` (not sortable; monospace `secret.slice(0, 5)` + `"…"` + `Copy key` icon button with Tooltip `"Copy key"`, `aria-label="Copy key for <name>"`; copies full `secret` and triggers toast `"Key copied."`)
  3. `Managed by` (sortable, truncated at `max-w-[260px]` with `title` tooltip; displays `managedByUser.email`)
  4. `Created` (sortable, default `desc`; `tabular-nums`, formatted `dd MMM yyyy`, e.g. `18 Sep 2026`)
  5. `Actions` (not sortable, `sr-only` header; right-aligned icon buttons when `canEdit`: `Rename key` pencil with `aria-label="Rename <name>"`, `Delete key` trash with `aria-label="Delete <name>"`)
- **Pagination defaults**: Default `25` rows/page; options `25`, `50`, `100`; left text `"Showing X-Y of N keys"`; right `"Rows per page"` select + Previous button + `"Page X of Y"` + Next button.
- **Add API key dialog**: `size="md"`, Title `"Add API key"`, field `Name` (required, `autoFocus`, help text `"Name the key after the application that will use it."`). Validation on submit (cleared on edit): empty -> `"Enter a name."`; case-insensitive duplicate -> `"A key with this name already exists."`. Footer: `Cancel` (secondary), `Create key` (primary).
- **API key created dialog**: `size="lg"` (wide), Title `"API key created"`, `Callout` (`tone="success"`, title `"<name> is ready to use"`, body `"Copy the key and add it to the application that needs it."`), read-only monospace `TextField` (`label="Key"`, `isReadOnly`, `onFocus` selects full text) beside secondary `"Copy key"` button (copies secret + toast `"Key copied."`). Footer: single `"Done"` button.
- **Rename API key dialog**: `size="md"`, Title `"Rename API key"`, same `Name` field prefilled with current name + help text + empty/duplicate validation (excluding self). Footer: `Cancel` (secondary), `Save changes` (primary).
- **Delete API key dialog**: `role="alertdialog"`, `size="md"`, Title `"Delete API key"`, body `"<strong><name></strong> will be deleted. Applications that use this key will stop working straight away. This cannot be undone."`. Footer: `Cancel` (secondary), `Delete key` (destructive).

### Material States

- **Empty**: Zero keys -> `"No API keys yet. Add one when another application needs access to this site's data."` inside table body, plus secondary `"Add API key"` button (when `canAdd`).
- **Loading**: Submit buttons show loading spinner + disabled state while `fetcher.state !== "idle"`.
- **Error**: Field validation errors render in 12px `--crit` below `Name` on submit and clear immediately on edit. Server/network errors render in an inline `Callout` (`tone="error"`, `role="alert"`) without clearing user input.
- **Success**: Dialog closes on success (or transitions from `Add API key` to `API key created`); bottom-right toast (`--toast-bg`, `--fg-inverse`, 4s auto-dismiss, max 3 stacked) confirms:
  - Copy: `"Key copied."`
  - Rename: `"Changes saved."`
  - Delete: `"<name> was deleted."`
- **Destructive action**: Delete dialog names the key, states applications will stop working immediately and `"This cannot be undone."`, and uses the `destructive` button variant.

### Responsive, Keyboard & Accessibility Expectations

- **Responsive**: Content centered in `max-w-[1280px]` matching `AccessManagementPage`; mobile (375px) stacks header and pagination cleanly with horizontal scroll on the table container and padded modal; tablet (768px) and desktop (1280px) match prototype layout.
- **Keyboard & focus order**: Tab flows top-to-bottom: `Add API key` -> sortable column headers (`Name`, `Managed by`, `Created`) -> per-row `Copy key`, `Rename`, `Delete` icon buttons -> pagination controls. Opening any dialog traps focus inside; closing via `Escape`, `Cancel`, `Done`, or `Close` restores focus to the trigger.
- **Target sizes**: All clickable controls >= 24x24 CSS px (`--target-min`); all action and close icon buttons 32x32 CSS px (`h-8 w-8`).
- **Accessible names & label-in-name**: Visible button text matches accessible name (`Add API key`, `Create key`, `Save changes`, `Delete key`, `Copy key`, `Cancel`, `Done`). Icon-only buttons carry descriptive `aria-label` + matching Tooltip (`Copy key for <name>`, `Rename <name>`, `Delete <name>`, `Close`, `Previous page`, `Next page`).
- **Copy & localisation**: All user-facing strings wrapped in `ctx.t({ code, msg })` with sentence case and no em dashes. Run `yarn i18n:extractor` after adding/updating keys.

### Documented Deviations from Prototype / Design System

1. **URL-driven server-side sorting and pagination**: Prototype sorts and paginates in client state; production uses URL search params (`sort`, `dir`, `page`, `pageSize`) backed by SQL `ORDER BY`/`LIMIT`/`OFFSET` in `ApiKeyRepository.listByCountryAccountsId` for consistency with `AccessManagementPage`.
2. **Server-side duplicate-name enforcement**: Prototype validates duplicate names client-side only; production enforces case-insensitive uniqueness both client-side and server-side (scoped to `countryAccountsId`).
3. **`NavSettings` removal**: User explicitly confirmed removing `MainContainer` and `NavSettings` and applying only the prototype `<main>` design on `/:lang/settings/api-key/`.
4. **Permission gating**: Prototype does not model RBAC; production preserves `EditAPIKeys` on all routes and `canAddNewRecord` / `canEditRecord` UI gating.
5. **Toast success icon token (`--good-on-dark`)**: Inherits the existing `ToastRegion` deviation (uses `--good-bg` until upstream PR `unisdr/delta-design#1` merges and `_docs/design/tokens.css` is re-synced).

## Risks / Trade-offs

- **Race condition on concurrent duplicate-name creation** -> Without a DB unique index on `(country_accounts_id, lower(trim(name)))`, two simultaneous requests with the same name could both pass `existsByNameInTenant`. Accepted to keep this change migration-free; a unique functional index can be added in a follow-up migration if needed.
- **Returning `secret` in `new.tsx` JSON response** -> Required for the one-time `API key created` reveal dialog (and `secret` is already loaded for the table's Copy button); response is gated by `authActionWithPerm("EditAPIKeys")` and scoped to the caller's session tenant.
- **Dual response format in child route actions** -> Returning JSON for `useFetcher` requests and redirects for full-page form POSTs keeps existing URLs working while enabling in-page modals; covered by integration and DOM tests.
