# Design

## UI Classification & Authority Metadata

```yaml
ui-classification: react-aria
design-system:
  repository: https://github.com/unisdr/delta-design
  version-or-tag: v0.7.3
  commit: 9107103efc7b192c3aa898ba99a508da57988a09
feature-prototype:
  repository: https://github.com/unisdr/delta-feature-prototypes
  path: features/sectors/
  commit: e24b8ad4dee319d5efa2a7c57fca30948f130bd0
  status: approved
```

## Context

The current `app/routes/$lang+/settings+/sectors.tsx` renders a PrimeReact `TabView` (`Tree View` and `Table view`), PrimeReact `Tree`, `VirtualScroller`, `DataTable`, `Paginator`, `Button`, `InputText`, plus legacy `MainContainer` and `NavSettings`, and uses `authLoader` (allowing any authenticated user).

The approved DELTA Sectors prototype replaces the two-tab screen with a single read-only React Aria tree inside the standard settings page shell (no `NavSettings`), showing `Name`, `Level`, and `Description` inline, with live name-only search and `Expand all` / `Collapse all` controls. The exact same `TreeList` pattern is shared with the Geographic levels prototype (`features/geography/`), so extracting a reusable `TreeList` primitive under `app/design-system/components/` avoids duplication.

## Goals / Non-Goals

**Goals:**
- Enforce `ManageSectorSettings` (`admin` role) on `/:lang/settings/sectors` via `authLoaderWithPerm`.
- Introduce a reusable, accessible `TreeList` primitive in `app/design-system/components/TreeList.tsx` exported from `~/design-system/components`.
- Replace `app/routes/$lang+/settings+/sectors.tsx` with a thin route module (`meta`, `loader`, rendering `<SectorsPage />`) and a dedicated `app/pages/SectorsPage.tsx` matching the `features/sectors/` `<main>` prototype.
- Remove `NavSettings`, `MainContainer`, and all PrimeReact imports from the Sectors settings screen.
- Sort sectors alphabetically by localized `name` within each hierarchy level.

**Non-Goals:**
- Creating, editing, or deleting sectors (the sector list is global and read-only).
- Modifying the top navigation bar or shell outside `<main>`.
- Changing `sectorTable` schema, backend sector models, or analytics sector pages.
- Refactoring Geographic levels in this change (only preparing the reusable `TreeList` primitive it will share).

## Technical Design

### TypeScript Types & Interfaces

Added or modified types:

1. `app/frontend/user/roles.ts`:
   - `PermissionId`: add `"ManageSectorSettings"` to the union type, register it in `permissions(ctx)` with `role: "admin"`, and add `"ManageSectorSettings"` to `roles.admin`.
2. `app/design-system/components/TreeList.tsx` (re-exported from `app/design-system/components/index.ts`):
   - `export interface TreeListNode { id: string; name: string; children?: readonly TreeListNode[]; }`
   - `export interface TreeListProps<T extends TreeListNode> { ariaLabel: string; nodes: readonly T[]; expandedKeys: ReadonlySet<string>; onExpandedChange: (keys: Set<string>) => void; emptyMessage: string; renderMain: (node: T, level: number) => ReactNode; renderActions?: (node: T, level: number) => ReactNode; }`
3. `app/frontend/sectorsTree.ts` (pure, testable tree helpers):
   - `export interface SectorRow { id: string; name: string; description: string | null; level: number; parentId: string | null; }`
   - `export interface SectorTreeNode { id: string; name: string; description: string | null; level: number; children?: SectorTreeNode[]; }` (structurally compatible with `TreeListNode` without coupling `app/frontend/` to `app/design-system/`).
   - Pure helper functions:
     - `buildSectorTree(rows: readonly SectorRow[], locale?: string): SectorTreeNode[]` — builds hierarchy from flat rows, sorting siblings with `localeCompare(b.name, locale, { sensitivity: "base" })`.
     - `collectBranchIds(nodes: readonly TreeListNode[]): string[]` — returns all node IDs that have non-empty `children`.
     - `filterSectorTree(nodes: readonly SectorTreeNode[], query: string): SectorTreeNode[]` — case-insensitive substring match on `node.name` only; retains all children of a matching parent when none of its children match.
     - `countTreeNodes(nodes: readonly TreeListNode[]): number` — counts total visible nodes in a tree.
4. `app/routes/$lang+/settings+/sectors.tsx`:
   - `SectorsLoaderData`: `{ sectors: SectorRow[]; lang: string }` (inferred via `typeof loader`).

### Database, Schema & Form-CSV-API Impact

- **Drizzle schema changes**: None. `sectorTable` is unchanged and global (no `countryAccountsId` column).
- **Migrations**: None.
- **Form-CSV-API `fieldsDef` pipeline**: No impact. Sectors has no `fieldsDef` CRUD form or CSV import/export pipeline.

### Loader Query

In `app/routes/$lang+/settings+/sectors.tsx`:
- Wrap `loader` with `authLoaderWithPerm("ManageSectorSettings", async (loaderArgs) => { ... })`.
- Query `sectorTable` directly without the unused `parent` self-join or `createdAt`:
  - `id: sectorTable.id`
  - `name: sql<string>\`dts_jsonb_localized(\${sectorTable.name}, \${ctx.lang})\`.as("name")`
  - `description: sql<string | null>\`dts_jsonb_localized(\${sectorTable.description}, \${ctx.lang})\`.as("description")`
  - `level: sectorTable.level`
  - `parentId: sectorTable.parentId`
  - `.orderBy(sql\`name\`, sectorTable.id)` (deterministic tie-breaker; `buildSectorTree` also applies locale-aware sibling sort).
- Export `meta: MetaFunction` using `htmlTitle(ctx, ctx.t({ code: "nav.analysis.sectors", msg: "Sectors" }))`.

## UI & Accessibility Specification

### Affected Routes & Presentation Components

- Route: `app/routes/$lang+/settings+/sectors.tsx` (`/:lang/settings/sectors`)
- Page component: `app/pages/SectorsPage.tsx`
- Reusable design-system primitive: `app/design-system/components/TreeList.tsx` (barrel `~/design-system/components`)
- Pure helpers: `app/frontend/sectorsTree.ts`

### Selected Design Tokens & UI Components

- **Tokens** (semantic only, from `_docs/design/tokens.css` / `app/styles/all.css`):
  - Surfaces & borders: `bg-surface`, `bg-inset`, `border-border`, `border-border-subtle`, `border-control-border`
  - Foreground: `text-fg`, `text-fg-2`
  - Focus ring: `outline-accent` (`2px solid var(--accent)`)
  - Typography: `text-page` (`20px`, `font-medium`, `leading-[var(--lh-tight)]`), `text-body` (`14px`), `text-label` (`12px`)
  - Radii & motion: `rounded-xl`, `rounded-md`, `duration-[var(--dur-fast)]`
- **Components**:
  - `TreeList` (`~/design-system/components`) built on `react-aria-components` `Tree`, `TreeItem`, `TreeItemContent`, `Button` (`slot="chevron"`), and `lucide-react` `ChevronRight`.
  - `Button` (`variant="ghost"`, `isDisabled`) from `~/design-system/components` for `Expand all` and `Collapse all`.
  - `TextField` (`type="search"`, `aria-label="Search sectors"`, `placeholder="Search sectors"`) from `~/design-system/components` (or React Aria `SearchField` with matching input styling).

### Content & Interaction Ground-Truth Checklist

- **Page header** (`flex flex-col gap-1 pt-8 pb-6`):
  - `<h1>`: `Sectors`
  - Subtitle (`text-body text-fg-2`): `The sectors used to classify losses and damages. The list is the same for every country and cannot be changed here.`
- **Toolbar** (`flex flex-wrap items-center gap-2 pb-4`):
  - Search input (`w-[340px] max-w-full`, placeholder `Search sectors`, accessible label `Search sectors`).
  - Right-aligned (`ml-auto flex gap-2`) ghost buttons: `Expand all` and `Collapse all`.
- **Card** (`<section aria-label="Sectors" className="overflow-hidden rounded-xl border border-border-subtle bg-surface">`):
  - Column header (`aria-hidden="true"`, `flex h-10 items-center gap-2 border-b border-border pl-10 pr-4 text-label font-medium text-fg-2`):
    1. `Name` (`min-w-0 flex-1`)
    2. `Level` (`w-[96px] flex-none`)
    3. `Description` (`hidden w-[440px] flex-none lg:block`)
  - Tree rows (`min-h-10 border-b border-border-subtle flex items-center gap-2 pr-4`, `paddingInlineStart: 8 + (level - 1) * 24`):
    - Branch rows have `cursor-pointer` and hover highlight (`bg-inset`).
    - Chevron button (`h-6 w-6`, `24x24` CSS px; `ChevronRight` `h-4 w-4` rotating `90deg` when expanded). Leaf rows render an `aria-hidden="true"` `h-6 w-6` spacer.
    - Column 1 (`Name`): `min-w-0 flex-1 truncate text-fg` with `title={node.name}`.
    - Column 2 (`Level`): `w-[96px] flex-none truncate text-fg-2` mapped from `node.level` (`1: Type`, `2: Sector`, `3: Sub-sector`, `4: Category`, fallback `-`).
    - Column 3 (`Description`): `hidden w-[440px] flex-none truncate text-fg-2 lg:block` with `title={node.description || undefined}` (renders `node.description || ""`).
  - Footer (`border-t border-border px-4 py-3 text-fg-2`):
    - Default: `{count} sector` / `{count} sectors`
    - Searching: `{count} sector matches your search` / `{count} sectors match your search`
- **Bottom spacing**: `<div className="h-16" />`.

### Sorting, Filtering & Pagination Defaults

- **Sorting**: Siblings sorted alphabetically by localized `name` (ascending). No interactive column sort controls (read-only tree).
- **Filtering**: Live client-side case-insensitive substring match on `name` only. When a parent matches and none of its children match, all children of that parent remain visible. While searching, all visible branches are expanded and `Expand all` / `Collapse all` are disabled; clearing search restores the previous `expandedKeys`.
- **Pagination**: None (single unified tree replaces the legacy paginated table).

### States

- **Default loaded**: All top-level (level 1) nodes expanded; levels 2+ collapsed.
- **Empty search**: `No sectors match "{query}".` inside tree body; footer shows `0 sectors match your search`.
- **Empty catalog (0 rows from DB)**: `No sectors available.` inside tree body; footer shows `0 sectors`.
- **Loading**: SSR-loaded via React Router loader; no client-side async fetch spinner needed.
- **Error / Success / Destructive actions**: Not applicable on this screen (read-only list; no forms, mutations, toasts, or dialogs).

### Responsive, Keyboard, Target Size & Copy Requirements

- **Responsive**:
  - Container `mx-auto w-full max-w-[1280px] px-4 md:px-12`.
  - Toolbar wraps cleanly on narrow screens (`flex-wrap`).
  - `Description` column displays at `lg` (`>= 1024px`) and is hidden below `lg`; `Name` and `Level` remain visible across mobile, tablet, and desktop.
- **Keyboard & focus order**:
  - Tab order: Search input -> `Expand all` button -> `Collapse all` button -> Tree (`TreeItem` roving focus).
  - Within `Tree` (provided by React Aria `Tree`): `ArrowDown` / `ArrowUp` move between visible rows, `ArrowRight` expands a collapsed branch (or moves to first child), `ArrowLeft` collapses an expanded branch (or moves to parent), `Enter` / `Space` toggles branch expansion (`onAction`), `Home` / `End` jump to first/last visible row.
  - Visible `2px solid var(--accent)` focus indicator on every interactive element (`data-[focus-visible]`).
- **Target sizes**:
  - Toolbar buttons and search input: `32px` height (`>= 24x24` WCAG 2.2 AA).
  - Tree row height: `min-h-10` (`40px`); chevron button `24x24` CSS px (`h-6 w-6`), matching prototype `.tl-chev` and meeting the `24x24` minimum (while the full `40px`-tall branch row is also clickable to toggle).
- **Accessible names & label-in-name**:
  - Search input: `aria-label="Search sectors"` matching visible placeholder.
  - Buttons: visible text `Expand all` and `Collapse all`.
  - Tree landmark/widget: `<section aria-label="Sectors">` and `<Tree aria-label="Sectors">`.
  - Chevron button: `aria-label` handled by React Aria `TreeItem` `slot="chevron"` (announced with expand/collapse state).
- **Copy & localisation**:
  - All user-facing strings wrapped in `ctx.t(...)` and extracted via `yarn i18n:extractor`.
  - Sentence case throughout (`Expand all`, `Collapse all`, `Search sectors`, `Sub-sector`); no em dashes.

### Documented Deviations from Prototype

1. **Permission guard (`ManageSectorSettings`)**: The prototype README notes "Backend: No changes" and "Users: Admins and super admins", while the existing route used `authLoader`. Adding `ManageSectorSettings` (assigned to `admin`) and guarding with `authLoaderWithPerm` aligns the route with DELTA's RBAC conventions.
2. **Localized alphabetical sibling sort**: The prototype uses static sample data in hand-authored order; the live DB stores localized JSONB names with UUID primary keys, so sorting siblings alphabetically by localized `name` provides predictable ordering across languages.
3. **Empty DB fallback copy**: Added `No sectors available.` for a 0-row database, which cannot occur with the prototype's hardcoded sample data.

## Testing Strategy

- **Unit & PGlite (`yarn test:run2`, node project)**:
  - `tests/unit/routes/settings-sectors.test.ts` — verifies `ManageSectorSettings` permission grant (`admin` allowed; `data-viewer`, `data-collector`, `data-validator` denied), `buildSectorTree` localized sorting & hierarchy, `filterSectorTree` name-only matching & parent-match child retention, `collectBranchIds`, and `countTreeNodes`. Does not require a real PostgreSQL instance because tree helpers are pure and permission checks are synchronous.
- **DOM interaction (`yarn test:run2`, jsdom project via `*.dom.test.tsx`)**:
  - `tests/unit/design-system/treeList.dom.test.tsx` — verifies `TreeList` expand/collapse by click and keyboard, indentation levels, empty state, and optional `renderActions` slot (for future Geographic levels reuse).
  - `tests/dom/sectors-page.dom.test.tsx` — verifies `SectorsPage` header/subtitle, absence of `NavSettings` and Tree/Table tabs, default level-1 expansion, live name-only search, parent-match child retention, disabled `Expand all` / `Collapse all` while searching, restoration of prior expansion on clear, empty states, and footer counts.
- **E2E & Gate 9 (`yarn test:e2e`)**:
  - `tests/e2e/sectors-settings-a11y.spec.ts` — navigates to `/en/settings/sectors` as admin, runs `axe-core` WCAG 2.2 AA check via `tests/e2e/helpers/a11y.ts`, verifies keyboard navigation, and captures desktop/mobile screenshots in `test-results/gate-9/sectors-redesign/`.

## Risks / Trade-offs

- **Auth tightening (`authLoader` -> `authLoaderWithPerm("ManageSectorSettings")`)**: Non-admin users who previously bookmarked `/en/settings/sectors` will now receive a forbidden response (consistent with `NavSettings` already hiding the link from non-admins and the prototype's intended audience).
- **Orphaned child rows in DB**: If a sector row references a missing `parentId`, `buildSectorTree` should safely promote it to a root node (or handle gracefully) rather than silently dropping it.
- **Description truncation on `< lg` viewports**: Matches the prototype (`hidden w-[440px] lg:block`), trading mobile description visibility for clean horizontal layout without horizontal overflow.
