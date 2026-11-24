# Proposal

## Why

The current API keys screen at `/:lang/settings/api-key/` uses legacy `MainContainer`/`NavSettings` chrome and PrimeReact `DataTable`/`Paginator`/`Dialog` components, lacks column sorting and duplicate-name validation, navigates away to separate dialog routes for add/edit/delete, and does not display the newly generated key in a dedicated reveal dialog after creation. Applying the DELTA Design System (`v0.7.2`) interactive mockup for API keys migrates the `<main>` content to React Aria Components with semantic tokens, WCAG 2.2 Level AA compliance, URL-driven server-side sorting and pagination (consistent with Access management), case-insensitive duplicate-name validation, and streamlined in-page dialogs including the post-create key reveal flow.

**UI classification**: `react-aria`

**Security-sensitive change**: Yes — modifies tenant-scoped API key listing and duplicate-name queries (`countryAccountsId`), returns the newly generated secret once on key creation to display in the reveal dialog, and hardens two pre-existing route-loader gaps (`edit.$id.tsx` missing `countryAccountsId` check in its loader and `delete.$id.tsx` using `authLoaderPublicOrWithPerm` instead of `authLoaderWithPerm`). All database queries MUST remain strictly scoped by `countryAccountsId`, and every route loader and action MUST be wrapped with `authLoaderWithPerm("EditAPIKeys", ...)` / `authActionWithPerm("EditAPIKeys", ...)`.

**Database migration required**: No. The existing `api_key` table already stores `id`, `name`, `secret`, `user_id` (`managedByUserId`), `country_accounts_id`, `created_at`, and `updated_at`.

## What Changes

- **API keys `<main>` redesign (`/:lang/settings/api-key/`)**:
  - Replace the PrimeReact list page inside `<main>` with the DELTA Design System `v0.7.2` layout: page heading (`API keys`), subtitle (`Keys that let other applications read and send data for this site.`), and primary `Add API key` button.
  - Remove `MainContainer` and `NavSettings` on this screen so only the prototype's `<main>` content renders inside the outer application shell.
  - Replace PrimeReact `DataTable` and `Paginator` with the `v0.7.2` React Aria `SortableTable` inside a card (columns: `Name` [sortable], `Key` [first 5 characters + `…` in monospace + `Copy key` icon button], `Managed by` [sortable], `Created` [sortable, default descending, `dd MMM yyyy`], and `Actions` with `sr-only` header for `Rename key` and `Delete key`) and `v0.7.2` `Pagination` (`25`, `50`, `100` rows per page, default `25`, noun `keys`).
  - Render the prototype empty state inside the table (`No API keys yet. Add one when another application needs access to this site's data.` + secondary `Add API key` button when permitted).
- **In-page React Aria modals via `useFetcher` and post-create key reveal**:
  - Open `Add API key`, `Rename API key`, and `Delete API key` (`role="alertdialog"`) as React Aria modal dialogs over the list page (closing only via Cancel, close button, or Escape — never on outside click) so sort and pagination URL state remain intact.
  - Submit create, rename, and delete via `useFetcher` against the existing `EditAPIKeys`-guarded child routes (`new.tsx`, `edit.$id.tsx`, `delete.$id.tsx`), returning typed JSON responses for fetcher requests while preserving redirect fallback for standard form POSTs.
  - After creating a key, open the wide `API key created` dialog with a success callout (`<name> is ready to use`), a read-only monospace `Key` field showing the full newly created secret (auto-selecting on focus), a `Copy key` button, and a `Done` button.
  - Enforce case-insensitive duplicate key name validation (`A key with this name already exists.`) and required name validation (`Enter a name.`) both client-side (inline below the field on submit, cleared on edit) and server-side (scoped to `countryAccountsId`).
  - Show bottom-right toast confirmations (`Key copied.`, `Changes saved.`, `<name> was deleted.`).
- **URL-driven server-side sorting, pagination, and route security fixes**:
  - Add tenant-scoped SQL query methods in `ApiKeyRepository` for sorted/paginated listing (`sort`: `name | managedBy | created`, `dir`: `asc | desc`, default `created` desc; `page`, `pageSize`: `25 | 50 | 100`, default `25`), tenant-scoped case-insensitive duplicate name lookup, and returning `{ id, name, secret }` from `create()`.
  - Update `_layout.tsx` loader to parse `sort`, `dir`, `page`, and `pageSize` from URL search params and pass existing tenant key names for immediate client-side duplicate validation alongside server-side enforcement.
  - Harden `edit.$id.tsx` loader to verify `countryAccountsId` ownership and switch `delete.$id.tsx` loader from `authLoaderPublicOrWithPerm` to `authLoaderWithPerm("EditAPIKeys", ...)`.
- **Reusable `v0.7.2` design-system primitive enhancements (`app/design-system/ui/`)**:
  - Extend `TextField` with optional `isReadOnly`, `autoFocus`, and `onFocus` props to support read-only copyable monospace inputs and dialog field autofocus.
  - Add a reusable `Callout` banner primitive (`success`, `error`, `info`, `warning` tones using semantic tokens) for the `API key created` success banner and inline alert banners.

## Capabilities

### New Capabilities
- `api-keys`: Tenant-scoped API keys management screen with URL-driven server-side sorting and pagination, in-page React Aria add/rename/delete dialogs, post-create full-key reveal dialog, copy-to-clipboard with toast feedback, and client + server case-insensitive duplicate name validation.

### Modified Capabilities
- `design-system-components`: Add reusable `v0.7.2` `Callout` banner primitive and `TextField` `isReadOnly`/`autoFocus`/`onFocus` support under `app/design-system/ui/`.

## Impact

### Files expected to change

| File | Reason |
|---|---|
| `app/db/queries/apiKeyRepository.ts` | Add tenant-scoped paginated/sorted listing query, case-insensitive duplicate-name check, and return `{ id, name, secret }` from `create()` |
| `app/routes/$lang+/settings+/api-key+/_layout.tsx` | Parse URL `sort`, `dir`, `page`, `pageSize` (default `created` desc, 25/page), load tenant keys and names, render `ApiKeysPage` without `MainContainer`/`NavSettings` |
| `app/routes/$lang+/settings+/api-key+/new.tsx` | Add server-side duplicate-name check and JSON fetcher response returning `{ ok: true, key: { id, name, secret } }` |
| `app/routes/$lang+/settings+/api-key+/edit.$id.tsx` | Add tenant check in loader, add server-side duplicate-name check (excluding current key), and support JSON fetcher response |
| `app/routes/$lang+/settings+/api-key+/delete.$id.tsx` | Replace `authLoaderPublicOrWithPerm` with `authLoaderWithPerm("EditAPIKeys")` and support JSON fetcher response |
| `app/pages/ApiKeysPage.tsx` | New `v0.7.2` React Aria `<main>` presentation component with sortable table, pagination, 4 dialogs, clipboard copy, and toasts |
| `app/design-system/ui/TextField.tsx` | Add optional `isReadOnly`, `autoFocus`, and `onFocus` props |
| `app/design-system/ui/Callout.tsx` | New reusable `v0.7.2` semantic-token callout banner (`success`, `error`, `info`, `warning`) |
| `app/design-system/ui/index.ts` | Export `Callout` and `CalloutProps` |
| `tests/integration/db/queries/apiKeyRepository.test.ts` | PGlite integration tests for sorting, pagination, duplicate-name check, `create()` returning secret, and tenant isolation |
| `tests/dom/api-keys.dom.test.tsx` | jsdom + React Testing Library interaction tests for all 4 dialogs, no outside-click close, validation/clear-on-edit, copy toast, and URL sort/pagination |
| `tests/e2e/api-keys.spec.ts` | Playwright E2E + Gate 9b axe-core (WCAG 2.0/2.1/2.2 A & AA) and keyboard walk-through tests + Gate 9c parity screenshots |

### Test approach

- **PGlite (`yarn test:run2`, node project)**: Integration tests for `ApiKeyRepository` covering `listByCountryAccountsId` sorting (`name`, `managedBy`, `created` asc/desc), pagination boundaries, `existsByNameInTenant` case-insensitive matching and self-exclusion on rename, `create()` returning `{ id, name, secret }`, and strict `countryAccountsId` isolation.
- **DOM (`yarn test:run2`, dom project via `*.dom.test.tsx`)**: Component interaction tests using `@testing-library/react` + `@testing-library/user-event` for `ApiKeysPage`, `Callout`, and `TextField` read-only/focus behavior (4 dialogs, Escape/Cancel/X dismiss only, inline error display & clear on edit, post-create reveal dialog, copy-to-clipboard toast, permission gating, URL sort/pagination).
- **E2E (`yarn test:e2e`)**: Playwright tests verifying desktop/tablet/mobile layouts, full keyboard navigation, automated axe-core WCAG 2.2 AA compliance (Gate 9b), and Gate 9c parity screenshots.
