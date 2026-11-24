# Gate 9 Verification Evidence Report - `api-keys-redesign`

## Metadata

- **Change**: `api-keys-redesign`
- **UI classification**: `react-aria`
- **Design system**: `https://github.com/unisdr/delta-design` (`v0.7.2`, commit `a86cc3a62378871e93cbfa14aa69740201b8c556`)
- **Feature prototype**: `https://github.com/unisdr/delta-feature-prototypes` (`features/api-keys`, commit `239cd12e413fd096aa69a0a715333c09cfc8341a`, status: `approved`)

## Commands Run

- **Gate 9a (Static design-system & spec check)**:
  - `yarn check:design-system --verify-spec --change api-keys-redesign` -> **PASS** (0 violations)
  - `yarn check:design-system --change api-keys-redesign` -> **PASS** (0 violations)
- **Gate 9b (DOM + WCAG 2.2 AA E2E)**:
  - `yarn vitest run tests/integration/db/queries/apiKeyRepository.test.ts tests/integration/routes/apiKeysRoutes.test.ts tests/dom/api-keys-ui-primitives.dom.test.tsx tests/dom/api-keys.dom.test.tsx` -> **PASS** (21/21 tests passed)
  - `yarn test:e2e tests/e2e/api-keys.spec.ts` -> **PASS** (3/3 passed against isolated `delta_e2e` database: zero axe-core WCAG 2.0/2.1/2.2 A & AA violations on `<main>`, `Add API key` dialog, and `API key created` dialog; target sizes >= 24x24px and icon labels passed; focus-not-obscured passed; non-backdrop modal dismiss, duplicate validation, create -> reveal, rename, and delete flows passed).
- **Gate 9c (Prototype parity & independent audit)**:
  - Audited against `unisdr/delta-feature-prototypes` (`features/api-keys` @ `239cd12e413fd096aa69a0a715333c09cfc8341a`) and `design.md` ground-truth checklist.
  - Responsive screenshots captured at `375x812` (mobile), `768x1024` (tablet), and `1280x900` (desktop) in `test-results/gate-9/api-keys-redesign/`.

## Parity Checklist

| Category | Requirement | Status | Notes |
|---|---|---|---|
| Hierarchy & layout | `<main>` header (`API keys`, subtitle, `Add API key`), no `MainContainer` or `NavSettings` | PASS | Verified in `ApiKeysPage.tsx`, DOM tests, and E2E |
| Columns, sorting & pagination | `Name` (sortable), `Key` (first 5 chars + `…` in monospace + `Copy key`), `Managed by` (sortable), `Created` (sortable, default `desc`, `dd MMM yyyy`), `Actions` (`sr-only`), pagination `25/50/100` (default `25`, noun `keys`) | PASS | Verified in PGlite, route, DOM, and E2E tests |
| Dialogs & states | `Add API key`, `API key created` (wide, success `Callout`, read-only monospace key + `Copy key` + `Done`), `Rename API key`, `Delete API key` (`alertdialog`), empty state, inline errors clearing on edit, toasts (`Key copied.`, `Changes saved.`, `<name> was deleted.`) | PASS | Verified in DOM and E2E tests |
| Responsive & keyboard | `max-w-[1280px]`, horizontal table scroll, 32x32 icon targets, `ModalDialog` `isDismissable={false}` (Escape/Cancel/Close only), Enter-to-submit in Add/Rename forms | PASS | Verified in DOM and Playwright E2E (375/768/1280 screenshots captured) |
| Design system & tokens | Semantic tokens only (`bg-surface`, `bg-inset` on read-only, `text-page`, `Callout` semantic tones), zero hex/`--color-*`, zero PrimeReact in `app/design-system/ui/` and modified routes/page, Lucide icons only | PASS | `yarn check:design-system` passed with 0 violations |
| Content & copy | Sentence case, no em dashes, all visible strings localized with `ctx.t(...)` | PASS | `yarn i18n:extractor` executed cleanly |

## Approved Deviations

1. **URL-driven server-side sorting and pagination**: Implemented via URL search params (`sort`, `dir`, `page`, `pageSize`) and SQL `ORDER BY`/`LIMIT`/`OFFSET` in `ApiKeyRepository.listByCountryAccountsId` for consistency with `AccessManagementPage`.
2. **Server-side duplicate-name enforcement**: Case-insensitive duplicate checking enforced both client-side and server-side (scoped to `countryAccountsId`).
3. **`NavSettings` removed**: Explicitly confirmed by user to apply only the prototype `<main>` design.
4. **Permission gating**: Preserves `EditAPIKeys` on all routes and `canAddNewRecord` / `canEditRecord` UI checks.
5. **Toast success icon token (`--good-on-dark`)**: Inherits `ToastRegion` deviation (`text-good-bg` on `bg-toast`) until upstream PR `unisdr/delta-design#1` merges.

## Independent Subagent Audit (Gates 4-9)

A fresh `research` subagent audited all changed files against Gates 4-9 and identified 8 required fixes, all of which were resolved and re-verified:

- Replaced undefined `text-page-title` with `text-page` (`--text-page: 20px`).
- Passed `ctx.t(...)` for `Pagination` (`showingText`, `pageText`), `ToastRegion` (`dismissLabel`), `TextField` (`requiredLabel`), and `"Missing ID"` route responses.
- Replaced sibling margins (`mt-1` in `ApiKeysPage.tsx`, `mt-0.5` in `Callout.tsx`) with parent `flex flex-col gap-*`.
- Applied `bg-inset` to read-only `TextField` inputs.
- Wrapped Add/Rename dialog inputs in `<form onSubmit>` so pressing `Enter` submits.
- Made `copyTextToClipboard` return `Promise<boolean>` and show an error toast on failure instead of unconditionally showing `"Key copied."`.
- Added UUID validation in `ApiKeyRepository.getById` to return 404 instead of PostgreSQL `22P02` on malformed IDs.
- Clamped out-of-range `page` against `totalPages` in `ApiKeyRepository.listByCountryAccountsId` so deleting the last row on a page never shows the empty state when keys exist.
