# Gate 9 Verification Evidence Report - `organization-management-redesign`

## Metadata

- **Change**: `organization-management-redesign`
- **UI classification**: `react-aria`
- **Design system**: `https://github.com/unisdr/delta-design` (`v0.7.2`, commit `a86cc3a62378871e93cbfa14aa69740201b8c556`)
- **Feature prototype**: `https://github.com/unisdr/delta-feature-prototypes` (`features/organization-management`, commit `239cd12e413fd096aa69a0a715333c09cfc8341a`, status: `approved`)

## Commands Run

- **Gate 9a (Static design-system & spec check)**:
  - `yarn check:design-system --verify-spec --change organization-management-redesign` -> **PASS** (0 violations)
  - `yarn check:design-system --change organization-management-redesign` -> **PASS** (0 violations)
- **Gate 9b (DOM + WCAG 2.2 AA E2E)**:
  - `yarn vitest run tests/integration/db/queries/organizationRepository.test.ts tests/integration/routes/organizationsRoutes.test.ts tests/dom/organization-management.dom.test.tsx` -> **PASS** (14/14 tests passed)
  - `yarn test:e2e tests/e2e/organization-management.spec.ts` -> **PASS** (3/3 passed in 19.4s against isolated `delta_e2e` database: zero axe-core WCAG 2.0/2.1/2.2 A & AA violations on `<main>`, `Add organization` dialog, and `This organization is in use` alertdialog; target sizes >= 24x24px and icon labels passed; focus-not-obscured passed; non-backdrop modal dismiss, duplicate validation, create, edit, in-use delete block, and unused delete flows passed).
- **Gate 9c (Prototype parity & independent audit)**:
  - Audited against `unisdr/delta-feature-prototypes` (`features/organization-management` @ `239cd12e413fd096aa69a0a715333c09cfc8341a`) and `design.md` ground-truth checklist.
  - Responsive screenshots captured at `375x812` (mobile), `768x1024` (tablet), and `1280x900` (desktop) in `test-results/gate-9/organization-management-redesign/`.

## Parity Checklist

| Category | Requirement | Status | Notes |
|---|---|---|---|
| Hierarchy & layout | `<main>` header (`Organizations`, subtitle, `Add organization`), `role="search"` bar (`Search by name`), no `MainContainer` or `NavSettings` | PASS | Verified in `OrganizationManagementPage.tsx`, DOM tests, and E2E |
| Columns, sorting & pagination | `Name` (sortable, default `asc`, 560px truncate), `Users` (sortable, `tabular-nums`), `Actions` (`sr-only`), pagination `25/50/100` (default `25`, noun `organizations`) | PASS | Verified in PGlite, route, DOM, and E2E tests |
| Dialogs & states | `Add organization`, `Edit organization`, `This organization is in use` (`users > 0`, single `Close` button), `Delete organization` (`users === 0`, destructive), search empty state + `Clear search`, zero-org empty state, inline errors clearing on edit, toasts (`<name> was added.`, `Changes saved.`, `<name> was deleted.`) | PASS | Verified in DOM and E2E tests |
| Responsive & keyboard | `max-w-[1280px]`, horizontal table scroll, 32x32 icon targets, `ModalDialog` `isDismissable={false}` (Escape/Cancel/Close only), Enter-to-submit in Add/Edit forms | PASS | Verified in DOM and Playwright E2E (375/768/1280 screenshots captured) |
| Design system & tokens | Semantic tokens only, zero hex/`--color-*`, zero PrimeReact in modified routes/page, Lucide icons only | PASS | `yarn check:design-system` passed with 0 violations |
| Content & copy | Sentence case, UK English (`organization`), no em dashes, all visible strings localized with `ctx.t(...)` | PASS | `yarn i18n:extractor` executed cleanly |

## Approved Deviations

1. **URL-driven server-side search, sorting, and pagination**: Implemented via URL search params (`search`, `sort`, `dir`, `page`, `pageSize`) backed by SQL in `OrganizationRepository.listByCountryAccountsId` for consistency with `AccessManagementPage`.
2. **Server-side duplicate-name enforcement & FK safety net**: Case-insensitive duplicate validation enforced both client-side and server-side (scoped to `countryAccountsId`); PostgreSQL `23503` handler retained for concurrent assignments.
3. **`NavSettings` removed**: Explicitly requested by user to apply only the prototype `<main>` design.
4. **Permission gating**: Preserves `ManageOrganizations` on all routes (`authLoaderWithPerm`/`authActionWithPerm`) and UI permission checks.
5. **Toast success icon token (`--good-on-dark`)**: Inherits `ToastRegion` deviation (`text-good-bg` on `bg-toast`) until upstream PR `unisdr/delta-design#1` merges.

## Independent Subagent Audit (Gates 4-9)

A fresh `research` subagent audited all changed files against Gates 4-9 and identified 4 required fixes, all of which were resolved and re-verified:

- Replaced `catch (err: any)` with `catch (err: unknown)` and safe property narrowing in `app/services/organizationService.ts`.
- Wrapped `"Unknown error"` fallback in `backendCtx.t(...)` in `app/services/organizationService.ts`.
- Added integration test coverage in `tests/integration/routes/organizationsRoutes.test.ts` for PostgreSQL `23503` concurrent FK delete blocking and cross-tenant 404 on edit/delete actions.
- Cleared pending `searchTimerRef` inside `updateQuery` in `app/pages/OrganizationManagementPage.tsx` and generated this Gate 9 evidence report.
