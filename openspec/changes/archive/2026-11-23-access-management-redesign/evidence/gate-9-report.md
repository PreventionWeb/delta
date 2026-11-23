# Gate 9 Verification Evidence Report — `access-management-redesign`

## Metadata

- **Change**: `access-management-redesign`
- **UI classification**: `react-aria`
- **Design system**: `https://github.com/unisdr/delta-design` (`v0.7.2`, commit `a86cc3a62378871e93cbfa14aa69740201b8c556`)
- **Feature prototype**: `https://github.com/unisdr/delta-feature-prototypes` (`features/access-management`, commit `239cd12e413fd096aa69a0a715333c09cfc8341a`, status: `approved`)

## Commands Run

- **Gate 9a (Static design-system & spec check)**:
  - `yarn check:design-system --verify-spec --change access-management-redesign` -> **PASS** (0 violations)
  - `yarn check:design-system --change access-management-redesign` -> **PASS** (0 violations)
- **Gate 9b (DOM + WCAG 2.2 AA E2E)**:
  - `yarn vitest run tests/dom/design-system-ui.dom.test.tsx tests/dom/access-management.dom.test.tsx` -> **PASS** (14/14 tests passed)
  - `yarn test:e2e tests/e2e/access-management.spec.ts` -> **PASS** (3/3 passed in 16.4s against isolated `delta_e2e` database: zero axe-core WCAG 2.0/2.1/2.2 A & AA violations on `<main>` and `[role="dialog"]`, target sizes >= 24x24px and icon labels passed, focus-not-obscured passed, non-backdrop modal dismiss + Escape passed).
- **Gate 9c (Prototype parity & independent audit)**:
  - Audited against `unisdr/delta-feature-prototypes` (`features/access-management` @ `239cd12e413fd096aa69a0a715333c09cfc8341a`) and `design.md` ground-truth checklist.
  - Responsive screenshots captured at `375x812` (mobile), `768x1024` (tablet), and `1280x900` (desktop) in `test-results/gate-9/access-management-redesign/`.

## Parity Checklist

| Category | Requirement | Status | Notes |
|---|---|---|---|
| Hierarchy & layout | `<main>` header (`Access management`, subtitle, `Invite user`), no `NavSettings`, no legacy user count or status legend | PASS | Verified in `AccessManagementPage.tsx` and DOM tests |
| Fields, columns & actions | Unified search, Role filter + capability summary, `Clear filters`, columns `Name`, `Status`, `Email`, `Organization`, `Role`, `Date added`, `Actions` (`sr-only`), pagination `25/50/100` (default `25`) | PASS | Verified in PGlite, route, and DOM tests |
| States | Empty (`No users match these filters.`), loading (`isLoading` buttons), inline validation errors clearing on edit, server error banner, named success toasts, destructive `alertdialog` | PASS | Verified in DOM tests |
| Responsive & keyboard | `max-w-[1280px]`, horizontal table scroll, 32x32 icon targets, `ModalDialog` `isDismissable={false}` (Escape/Cancel/Close only) | PASS | Verified in DOM tests + Playwright E2E (375/768/1280 screenshots captured) |
| Design system & tokens | Semantic tokens only, zero hex/`--color-*`, zero PrimeReact in `app/design-system/ui/` and modified routes/page, Lucide icons only | PASS | `yarn check:design-system` passed with 0 violations |
| Content & copy | Sentence case, UK English (`organization`), no em dashes, `ctx.t` localized | PASS | `yarn i18n:extractor` executed cleanly |

## Approved Deviations

1. **Toast success icon token (`--good-on-dark`)**: Pending upstream PR `unisdr/delta-design#1`; uses semantic token `text-good-bg` on `bg-toast` until PR #1 merges and `_docs/design/tokens.css` is re-synced.
2. **`NavSettings` removed**: Explicitly requested by user to apply only the prototype `<main>` design.
3. **Primary Admin protection**: Preserves `(Primary Admin)` label and disabled Edit/Delete buttons matching `AccessManagementService` server enforcement.
4. **Pending user empty name fallback**: Falls back to `email` when `firstName`/`lastName` are empty.
5. **Role sentence-case via CSS**: `app/frontend/user/roles.ts` left unchanged globally; Access management applies CSS `inline-block lowercase first-letter:uppercase`.

## Independent Subagent Audit (Gates 4–9)

A fresh `research` subagent audited all changed files against Gates 4–9 and identified 5 required fixes + 4 advisories, all of which were resolved and re-verified (`yarn tsc`, `yarn check:design-system`, `yarn i18n:extractor`, and 25/25 change-scoped Vitest tests passing):

- Wrapped `(Primary Admin)`, Pagination `showingText`/`pageText`, and route error messages in `ctx.t(...)`; changed meta title to sentence case (`Access management`).
- Fixed Admin role helper grammar to `<Role>: <desc>`.
- Debounced search `navigate()` (250ms, `{ replace: true }`) and added `useNavigation()` `aria-busy` loading state on the table card.
- Removed off-scale `pb-[2px]` from `Button.tsx` and `SelectField.tsx`; extracted shared `SelectPopoverList`.
- Formatted `Date added` in UTC (`Intl.DateTimeFormat`) for SSR hydration safety, disabled all resend buttons while submitting, cleared toast timers on dismiss/unmount, added `Accept: application/json` detection, and added disabled-reason `title` on Primary Admin action wrappers.

