---
name: design-system-check
description:
  "Quality Gate 9 checklist for DELTA Design System and WCAG 2.2 AA compliance.
  Covers static token/icon/copy guards (yarn test:design), automated Playwright
  WCAG 2.2 AA & layout audits (yarn design:check), interactive state checks, and
  manual keyboard/visual verification against _docs/design/DESIGN.md."
---

# Design System & Accessibility Check (Gate 9) — DELTA Resilience

Run this checklist as **Gate 9** for any change that touches `app/design-system/**`,
`app/domains/*/presentation/**`, `app/routes/**`, or `app/styles/**` (any rendered UI). Skip only
for pure backend/API changes with no rendered output, and state the skip explicitly.

Authoritative specification: `_docs/design/DESIGN.md`, `_docs/design/tokens.css`, and
`_docs/design/tokens.json` (synced read-only from `unisdr/delta-design`).

---

## 1. Automated Static Checks (Mandatory, Fast)

Run the fast static + component test gate:

```bash
yarn test:design
```

Verify across all **new or modified UI files** in your diff:

- [ ] **Semantic tokens only** — use `var(--bg)`, `var(--surface)`, `var(--fg)`, `var(--accent)`,
      or Tailwind `@theme` utilities. No hardcoded hex colours (`#...`), no `tokens.css` primitive
      variables (`--color-neutral-*`, `--color-warm-*`, `--color-accent-*`, `--color-green-*`,
      `--color-amber-*`, `--color-red-*`).
- [ ] **Lucide icons only** — import icons from `lucide-react` (`16px` inline, `20px` standalone).
      Never introduce `react-icons`, `primeicons`, or other icon libraries in new UI.
- [ ] **No PrimeReact or domain leakage in `app/design-system/`** — enforced automatically by
      `tests/unit/design-system/components/imports.test.ts`.
- [ ] **Spacing discipline** — values from the 4px scale (`4, 8, 12, 16, 24, 32, 48, 64px`).
      Use `gap` on flex/grid containers; never combine margin between siblings with parent `gap`.
- [ ] **No feature-level motion** — motion durations and easings live inside design-system
      components only; do not add custom animations or transition timings in feature code.
- [ ] **Copy & typography rules** — UK English with `"organization"` (with `z`), sentence case for
      headings and labels, no em-dashes (`—`) in UI copy, no lorem ipsum, `--fg-3` never used for
      readable text (decorative/disabled only).

---

## 2. Automated Browser Audit — WCAG 2.2 AA & Breakpoints (Mandatory for Routes)

Start the app (`yarn dev`) and run the Gate 9 Playwright audit across `mobile` (`375x812`),
`tablet` (`768x1024`), and `desktop` (`1280x900`):

```bash
yarn design:check \
  --url http://localhost:3000/en/<route> \
  --screenshots /tmp/gate9-<feature>
```

- By default, `yarn design:check` scopes `axe-core` and target-size/label checks to `<main>` so
  new screens are not blocked by legacy header/footer chrome in `app/root.tsx`.
- Pass `--full-page` for standalone pages without main navigation (e.g. login, reset password) or
  when auditing header/footer chrome itself.
- Pass `--login-email <email> --login-password <pass>` for authenticated routes.
- Pass `--executable-path <path>` (or set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`) when running with a preinstalled Chromium binary instead of Playwright's bundled browser.

Confirm the CLI exits `0` with:

- [ ] **Zero `axe-core` WCAG 2.2 AA violations** (`wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`)
- [ ] **Zero horizontal page overflow** (`scrollWidth <= innerWidth`) at `375px`, `768px`, and `1280px`
- [ ] **WCAG 2.2 target size (`>= 24x24px`)** on all visible interactive controls and non-empty
      accessible names on all icon-only buttons
- [ ] **Zero uncaught `pageerror` or `console.error` events**
- [ ] **Focused element never obscured** by fixed/sticky bars or overlays

---

## 3. Interactive State Checks (Playwright E2E / Live Verification)

When the change includes forms, dialogs, filters, or tables, verify interactive states (using
`tests/e2e/helpers/designSystemChecks.ts` in Playwright E2E tests):

- [ ] **Dialogs & popovers**: open each dialog/popover/menu and run `assertWcag22AA(page, { scope: '[role="dialog"]' })`.
- [ ] **Form validation lifecycle**:
  - No validation errors shown before the user submits.
  - Invalid submit shows plain-language errors directly under the offending field(s).
  - Editing a field clears its error.
  - Successful save closes the dialog and shows a confirmation toast.
- [ ] **Tables**:
  - Non-clickable rows (where only row action buttons act) do NOT show `cursor: pointer` or hover
    fill (`assertRowCursorSemantics(row, { clickable: false })`).
  - Sortable columns toggle `aria-sort` via click AND keyboard `Enter`.
  - Long unbroken text truncates cleanly with ellipsis without causing horizontal page overflow.
  - Pagination defaults to 25 rows (`25`, `50`, `100`) where applicable.

---

## 4. Manual Keyboard, Accessibility & Visual Parity Walk-Through

Automated `axe-core` catches only part of WCAG 2.2 AA. Always perform:

- [ ] **Keyboard-only walk-through**: navigate the full screen using `Tab`, `Shift+Tab`,
      `Arrow*`, `Enter`, `Space`, and `Escape`. Confirm visible `2px` `--focus-ring` (`2px` offset),
      no keyboard traps, and focus returns to the trigger when closing dialogs/menus.
- [ ] **Heading hierarchy**: `h1` → `h2` → `h3` matches document structure without skipped levels,
      using `.t-page-title` / `.t-section-title` / `.t-body-strong`.
- [ ] **Colour never sole signal**: status indicators always pair an 8px dot with sentence-case text.
- [ ] **Visual parity**: inspect the screenshots captured in `/tmp/gate9-<feature>/{mobile,tablet,desktop}.png`
      item-by-item against `design.md`'s content-level ground-truth checklist and `_docs/design/DESIGN.md`.
- [ ] **Missing tokens or patterns**: never silently invent a token, colour, spacing step, or pattern.
      If something is missing from `_docs/design/DESIGN.md`, document the gap in the PR/spec and
      raise an issue in `unisdr/delta-design`.
