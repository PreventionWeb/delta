---
name: design-system-check
description:
  "Gate 9 verification checklist and audit guide for DELTA UI changes. Covers DELTA Design System
  (unisdr/delta-design) token compliance, React Aria Components, WCAG 2.2 Level AA accessibility
  and keyboard behaviour, Recharts accessibility, content/copy rules, and feature-prototype parity
  (unisdr/delta-feature-prototypes)."
---

# Design System, Accessibility & Feature Hand-Off Check — DELTA Resilience

Run this skill during **Gate 9 (`9a`, `9b`, `9c`)** for any change that touches
`app/domains/*/presentation/`, `app/routes/`, `app/components/`, `app/design-system/`, or related
CSS/styles.

A finding means: stop, fix (or document and obtain human approval for a justified deviation),
re-run tests and static checks, and re-verify before exiting the Refactor loop.

---

## Authorities & Traceability Pre-Check

Before reviewing code or screenshots, verify `openspec/changes/<name>/design.md`:

- [ ] `ui-classification` is explicitly set to `react-aria`, `legacy-exempt`, or `non-visual`.
- [ ] `design-system` records `https://github.com/unisdr/delta-design`, an immutable
      `version-or-tag`, and an immutable `commit` SHA (never solely a moving branch such as `main`).
- [ ] `feature-prototype` records `https://github.com/unisdr/delta-feature-prototypes`:
  - either `status: approved` with a concrete repository `path` and immutable `commit` SHA;
  - or `status: not-required` with an explicit, permitted `exception-reason` (backend-only,
    non-visual, trivial copy correction, approved `legacy-exempt` bug fix, or explicitly approved
    human review exception).
- [ ] `yarn check:design-system --verify-spec --change "<name>"` passes with zero errors.

---

## Gate 9a: Design-System and Token Compliance (`unisdr/delta-design`)

Run `yarn check:design-system --change "<name>"` first, then verify every item below on the diff:

### 1. Tokens and CSS

- [ ] **Semantic CSS variables only**: Feature and component styles consume semantic tokens
      (e.g. `var(--fg)`, `var(--accent)`, `var(--border-subtle)`, `var(--surface)`) rather than raw
      colour values.
- [ ] **No prohibited `--color-*` primitives in feature code**: Primitive palette variables are
      mapped exclusively in the token definition layer (`tokens.css`), never referenced directly in
      feature components or route styles.
- [ ] **No unapproved hardcoded colours**: Zero raw hexadecimal (`#fff`, `#004f91`), `rgb()`,
      `rgba()`, `hsl()`, `hsla()`, or named CSS colours in `react-aria` classified files (unless
      narrowly suppressed via an approved inline `delta-design-ignore-next-line` comment with a
      documented rationale).
- [ ] **Approved spacing scale**: Layout and component spacing strictly follows the pinned design
      system spacing scale (e.g. `4, 8, 12, 16, 24, 32, 48, 64` px / corresponding semantic
      spacing tokens).
- [ ] **Parent `gap` over sibling margins**: Flex and Grid containers use parent `gap` for layout
      spacing between items rather than sibling `margin-top` / `margin-bottom` / `margin-left` /
      `margin-right`.
- [ ] **Approved radii, borders, shadows, typography, and breakpoints**: Uses the design system's
      semantic border radii, border widths/tokens, elevation shadows, typography roles (`.t-*`),
      and responsive breakpoints.

### 2. Components and Interaction

- [ ] **React Aria Components foundation**: New or migrated interactive widgets (`Button`, `Table`,
      `Select`, `ComboBox`, `Checkbox`, `Dialog`, `Modal`, `Tabs`, `DatePicker`, `Menu`, etc.) are
      built on `react-aria-components`, and reusable primitives live under
      `app/design-system/components/` (imported via `~/design-system/components`).
- [ ] **No new PrimeReact dependency**: Zero imports from `primereact` or `primeicons` in any
      `react-aria` classified change.
- [ ] **Lucide React iconography**: Icons use `lucide-react` at the approved sizes and stroke
      weights.
- [ ] **Accessible names on icon-only controls**: Every icon-only button or link has an explicit,
      translated accessible name (`aria-label` or `aria-labelledby`), and decorative icons inside
      labelled controls carry `aria-hidden="true"`.
- [ ] **No inappropriate `radius-full` on standard buttons**: Standard action buttons use the
      approved button border-radius token; full pill radius (`rounded-full` / `radius-full`) is
      restricted to badges, tags, or avatars where specified by the design system.
- [ ] **Complete interactive state semantics**: Hover, focus-visible (`[data-focus-visible]`),
      pressed (`[data-pressed]`), selected (`[data-selected]`), expanded (`[data-expanded]`),
      disabled (`[data-disabled]`), and invalid (`[data-invalid]`) states are styled and
      semantically exposed.

### 3. Charts (Recharts)

- [ ] **Approved Recharts styling and palettes**: Uses the approved categorical or sequential
      design-system tokens/palettes, stroke widths, and subtle horizontal gridlines.
- [ ] **Accessible chart name and text summary**: Every chart container exposes an accessible name
      and a concise text summary of the insight or range shown.
- [ ] **`role="img"` where appropriate**: Chart SVG/container carries `role="img"` and
      `aria-label` / `aria-labelledby`.
- [ ] **Tabular data alternative**: Includes a keyboard-accessible "Show as table" toggle or
      equivalent accessible data table representation.
- [ ] **No meaning conveyed by colour alone**: Series, thresholds, and statuses use labels,
      patterns, shapes, or direct values in addition to colour.

### 4. Content and Copy

- [ ] **Sentence case**: Headings, form labels, buttons, and table column headers use sentence case
      (capitalising only the first word and proper nouns/acronyms).
- [ ] **DELTA terminology and spelling**: Follows DELTA content guidance and localisation (`ctx.t`
      used for all user-facing strings; `yarn i18n:extractor` run if new keys were added).
- [ ] **No em dashes in UI copy**: Zero `—` (`\u2014`) characters in rendered UI strings.
- [ ] **No prototype placeholder copy**: No lorem ipsum, prototype-only mock labels, or fabricated
      production data left in application code.

---

## Gate 9b: Accessibility and Keyboard Compliance (WCAG 2.2 Level AA)

Authority: WCAG 2.2 Level AA + pinned `unisdr/delta-design` accessibility requirements.

- [ ] **Automated Playwright + axe-core checks pass**: `runA11yCheck()` from
      `tests/e2e/helpers/a11y.ts` passes for all affected routes and material states with tags
      `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, and `wcag22aa`.
- [ ] **Minimum target sizes (WCAG 2.5.8)**: Every interactive target is at least `24 x 24` CSS
      pixels (`32 x 32` CSS pixels preferred for icon-only controls).
- [ ] **Focus visibility and non-obscuration (WCAG 2.4.7, 2.4.11)**: Every interactive element
      shows a high-contrast visible focus indicator when reached via keyboard, and focused elements
      are never obscured by sticky headers, footers, dialogs, toasts, or popovers.
- [ ] **Keyboard navigation and focus order (WCAG 2.1.1, 2.4.3)**:
  - `Tab` and `Shift+Tab` traverse interactive controls in a logical reading order;
  - `Enter` and `Space` activate buttons, links, and checkboxes appropriately;
  - `Escape` closes open popovers, menus, comboboxes, and modal dialogs and returns focus to the
    trigger;
  - Arrow keys navigate within composite widgets (`Table`, `Select`, `ComboBox`, `Tabs`, `Menu`,
    `RadioGroup`).
- [ ] **Label in name (WCAG 2.5.3)**: For every control with a visible text label, the accessible
      name contains the visible label text consecutively.
- [ ] **Dragging movements (WCAG 2.5.7)**: Any drag interaction (e.g. map drawing, reordering,
      sliders) provides a single-pointer click/tap or keyboard input alternative.
- [ ] **Accessible authentication (WCAG 3.3.8)**: Authentication and credential inputs allow
      pasting and set appropriate `autocomplete` attributes.
- [ ] **Error announcement and sensory characteristics (WCAG 1.3.3, 3.3.1, 4.1.3)**: Validation and
      submission errors use `role="alert"` or an assertive/polite live region as appropriate, link
      field errors via `aria-describedby` / React Aria `FieldError`, and never rely solely on
      colour, shape, position, or iconography to identify an error.
- [ ] **Exception governance**: Any approved accessibility exception records a tracked issue ID,
      technical rationale, owner, and target remediation date.

---

## Gate 9c: Feature Hand-Off Parity (`unisdr/delta-feature-prototypes`)

Authority: Approved, pinned prototype in `unisdr/delta-feature-prototypes` and the content/interaction
ground-truth checklist in `openspec/changes/<name>/design.md`.

**Conformance Standard**: Evaluate **functional, structural, state, interaction, accessibility, and
visual-intent parity** — NOT literal pixel-perfect equality.

- [ ] **Information hierarchy and layout intent**: Page header, landmark regions, section grouping,
      and visual hierarchy match the approved prototype's design intent.
- [ ] **Fields, columns, actions, and defaults**: Field and column set, ordering, labels, primary vs
      secondary action placement, sort order, filter defaults, and pagination defaults match
      `design.md`.
- [ ] **Material state coverage**: Empty, loading, error, success, and destructive-action
      confirmation states defined in `design.md` and the prototype are all implemented and tested.
- [ ] **Responsive and keyboard behaviour**: Layout adapts cleanly across principal viewports
      (desktop, tablet, mobile) and follows documented keyboard flows.
- [ ] **Production quality over prototype shortcuts**: Production code uses DELTA domain/application
      DTOs, `ctx.t` i18n, proper auth/tenant scoping, and semantic tokens — never copying prototype
      mock state or inline style hacks.
- [ ] **Evidence completeness**:
  - Screenshots captured via `tests/e2e/helpers/prototype-evidence.ts` under
    `test-results/gate-9/<name>/` for affected routes, viewports, and states;
  - Committed evidence report written to `openspec/changes/<name>/evidence/gate-9-report.md` with
    pinned SHAs, commands run, itemised parity checklist results, and any justified/approved
    deviations.
