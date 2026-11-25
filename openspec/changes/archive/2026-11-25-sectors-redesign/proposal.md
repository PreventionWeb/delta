# Proposal

## Why

The Settings → Sectors screen (`/:lang/settings/sectors`) still uses legacy PrimeReact `TabView`, `Tree`, `DataTable`, and `Paginator`, plus `MainContainer` and `NavSettings`, splitting read-only sector browsing across two redundant tabs (Tree view and Table view). Migrating it to the approved DELTA Design System (`v0.7.3`) and Sectors feature prototype (`features/sectors/`) consolidates the screen into one accessible, read-only React Aria tree with inline level and description columns, removes `NavSettings`, and tightens route access control to admin roles.

## What Changes

- **Security-sensitive auth change**: Add the `ManageSectorSettings` permission (assigned to the `admin` role) in `app/frontend/user/roles.ts` and switch the `/:lang/settings/sectors` loader from `authLoader` to `authLoaderWithPerm("ManageSectorSettings", ...)`.
- **Reusable `TreeList` design-system primitive**: Create `app/design-system/components/TreeList.tsx` (built on `react-aria-components` `Tree`, `TreeItem`, `TreeItemContent`) and export it from `app/design-system/components/index.ts` so both Sectors and the upcoming Geographic levels screen share one accessible tree list component.
- **Sectors settings page redesign**:
  - Replace the PrimeReact two-tab implementation in `app/routes/$lang+/settings+/sectors.tsx` with a dedicated `app/pages/SectorsPage.tsx` (following the `ApiKeysPage` / `OrganizationManagementPage` pattern).
  - Remove `NavSettings` and legacy `MainContainer` from the Sectors route; render inside the standard DELTA settings `<main>` container (`mx-auto w-full max-w-[1280px] px-4 md:px-12`).
  - Render a single read-only tree with columns `Name`, `Level` (`Type`, `Sector`, `Sub-sector`, `Category`), and `Description` (visible at `lg+`), with top-level nodes expanded by default.
  - Sort siblings alphabetically by localized `name` in the loader/tree builder.
  - Add case-insensitive name-only search (auto-expanding matching branches, retaining a matching parent's children when no child matches, disabling `Expand all` / `Collapse all` while searching, and restoring prior expansion when cleared) and a footer count summary.
  - Export route `meta` with `htmlTitle`.
- **Database migrations**: None required (`sectorTable` is unchanged and global across countries).

## Capabilities

### New Capabilities
- `sectors-settings`: Admin-only read-only Sectors settings page (`/:lang/settings/sectors`) displaying the hierarchical DELTA sector taxonomy in a single searchable, keyboard-accessible React Aria tree sorted by localized name.

### Modified Capabilities
<!-- None — no existing spec under openspec/specs/ covers settings/sectors. -->

## Impact

### Expected Files to Change
- `app/frontend/user/roles.ts` — Add `ManageSectorSettings` to `PermissionId`, `permissions()`, and `roles.admin`.
- `app/design-system/components/TreeList.tsx` — New reusable React Aria `TreeList` primitive (with generic node rendering, indentation, chevron toggle, optional actions slot, and empty state).
- `app/design-system/components/index.ts` — Export `TreeList` and its TypeScript types.
- `app/pages/SectorsPage.tsx` — New Sectors settings page presentation component matching the `features/sectors/` prototype `<main>` design.
- `app/routes/$lang+/settings+/sectors.tsx` — Guard loader with `authLoaderWithPerm("ManageSectorSettings", ...)`, sort sectors by localized `name`, add `meta`, and render `<SectorsPage />` without `NavSettings` or `MainContainer`.
- `locales/app/en.json` (and extracted locale files via `yarn i18n:extractor`) — Add new translation keys for the Sectors page copy and `ManageSectorSettings` permission label.
- `tests/unit/design-system/treeList.dom.test.tsx` — DOM interaction tests for `TreeList` (expand/collapse, keyboard navigation, empty state, actions slot).
- `tests/dom/sectors-page.dom.test.tsx` — DOM interaction tests for `SectorsPage` (default level-1 expansion, localized sorting, name-only search with parent-match child retention, disabled Expand/Collapse all during search, footer count, empty state).
- `tests/unit/routes/settings-sectors.test.ts` — Unit tests for `ManageSectorSettings` role permission and `sectorsTree` localized sorting/filtering helpers.
- `tests/e2e/sectors-settings-a11y.spec.ts` — Playwright WCAG 2.2 AA (`axe-core`) and keyboard navigation test for Gate 9b/9c.

### Test Approach
- **Unit + PGlite (`yarn test:run2`)**: Tree builder/filter pure helpers, `ManageSectorSettings` role permission checks, and loader behavior (`tests/unit/routes/settings-sectors.test.ts`).
- **DOM (`yarn test:run2`, jsdom project via `*.dom.test.tsx`)**: Component rendering, expand/collapse, search, and keyboard interactions for `TreeList` and `SectorsPage`.
- **E2E (`yarn test:e2e`)**: Automated WCAG 2.2 AA (`tests/e2e/helpers/a11y.ts`) and visual/parity screenshots for Gate 9.
