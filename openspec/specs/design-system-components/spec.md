# design-system-components Specification

## Purpose

Reusable, cross-cutting React Aria presentation primitives — not owned by any single domain —
serving as the forward-path replacement for PrimeReact across every Clean Architecture
presentation-layer intent.

### Governance & Migration Framing

- **Design-system authority**: [`unisdr/delta-design`](https://github.com/unisdr/delta-design) is
  the authoritative source for design tokens, reusable component rules, accessibility requirements
  (WCAG 2.2 Level AA), interaction conventions, and visual standards. Local copies of
  `DESIGN.md`, `tokens.json`, and `tokens.css` are manually synced from a pinned tag/commit of
  `unisdr/delta-design`.
- **Feature hand-off authority**: [`unisdr/delta-feature-prototypes`](https://github.com/unisdr/delta-feature-prototypes)
  is the authoritative design-to-development hand-off layer for feature-specific presentation and
  interaction changes.
- **Transitional legacy-parity baseline (Phase 6a/6h)**: The `dts-table`, `dts-form-component`,
  and `dts-*` class requirements below reflect the initial Phase 6a/6h transitional baseline
  implemented in `app/design-system/components/` so early Hazardous Events preview screens match
  surrounding unmigrated pages prior to token re-skinning.
- **Forward rule**: Legacy parity is permitted ONLY for explicitly classified `legacy-exempt`
  changes or these transitional Phase 6a/6h baseline primitives until re-skinned. Every new or
  re-skinned component or screen (`ui-classification: react-aria`) MUST follow the pinned
  `unisdr/delta-design` reference (semantic CSS variables, approved spacing scale, WCAG 2.2 AA
  target sizes and keyboard/focus semantics) and identify its approved prototype in
  `unisdr/delta-feature-prototypes` (or record a valid `not-required` exception in `design.md`).

## Requirements

### Requirement: Table primitives render with the same markup/CSS classes as the legacy data table

The `Table`/`TableColumn`/`TableRow`/`TableCell` components SHALL render using React Aria's
accessible table primitives, styled so the rendered DOM carries the same CSS classes the legacy
hazardous-event list table uses (`dts-table`, `dts-table__cell-centered`, `dts-table__actions`),
producing visually identical output to the legacy `<table className="dts-table ...">` markup for
equivalent content.

#### Scenario: Rendered table carries the legacy table class

- **WHEN** `Table` is rendered with a set of columns and rows
- **THEN** the rendered root element MUST include the `dts-table` class

#### Scenario: A centered column header renders with the centering class

- **WHEN** a `TableColumn` is rendered with the centered-header option set
- **THEN** its rendered header cell MUST include the `dts-table__cell-centered` class

### Requirement: Link primitive renders as a standard anchor matching legacy link behavior

The `Link` component SHALL render as a standard, keyboard-activatable anchor element whose
rendered output and navigation behavior matches the legacy application's own link components
(`LangLink`) — activatable via mouse click and keyboard (Enter), with a visible focus indicator.

#### Scenario: Link navigates to its target on activation

- **WHEN** `Link` is rendered with `href="/he-preview/abc"` and is activated (click or Enter key
  while focused)
- **THEN** navigation to `/he-preview/abc` MUST occur

#### Scenario: Link is reachable and activatable via keyboard alone

- **WHEN** `Link` is rendered inside a page and the page is navigated via Tab key
- **THEN** the link MUST receive visible keyboard focus
- **AND** pressing Enter while it has focus MUST activate it

### Requirement: Checkbox primitive renders as a native checkbox input, styled to match the legacy custom appearance

The `Checkbox` component SHALL render an activatable checkbox whose underlying DOM element is a
native `<input type="checkbox">`, styled with the legacy `dts-form-component` custom appearance
(no native OS checkmark) and reporting its checked state correctly to assistive technology.

#### Scenario: Checkbox renders a native input element

- **WHEN** `Checkbox` is rendered
- **THEN** the rendered output MUST contain an `<input type="checkbox">` element

#### Scenario: Checkbox is keyboard-activatable

- **WHEN** `Checkbox` is rendered inside a page, reaches keyboard focus via Tab, and the Space
  key is pressed
- **THEN** its checked state MUST toggle

### Requirement: Select primitive matches the legacy closed-state trigger styling

The `Select` component SHALL render a trigger whose closed-state appearance (border, border-
radius, padding, chevron) matches the legacy `.dts-form-component select` rule, and SHALL submit
its selected value under its given field `name` in a native GET form submission.

#### Scenario: Select submits its value as a named form field

- **WHEN** `Select` is rendered inside a `<form method="get">` with `name="example"` and a value
  is selected, and the form is submitted
- **THEN** the resulting query string MUST contain `example=<selected value>`

#### Scenario: Select is reachable and operable via keyboard alone

- **WHEN** `Select` is rendered inside a page and reached via Tab, then opened and an option
  chosen via keyboard alone (no mouse)
- **THEN** the chosen option MUST become the selected value

### Requirement: Combobox primitive supports live, case-insensitive search with a capped result list

The `Combobox` component SHALL filter its options by a case-insensitive substring match against
each option's display text as the user types, capping the displayed list at 20 options, and
SHALL submit only an actually-selected option's id under its given field `name` — free text that
does not match a selectable option MUST NOT be submitted as the field's value.

#### Scenario: Typing filters the option list case-insensitively

- **GIVEN** `Combobox` is rendered with options including one named `"Tropical Cyclone"`
- **WHEN** the user types `"cyclone"` into the input
- **THEN** the displayed option list MUST include `"Tropical Cyclone"`

#### Scenario: Unselected free text is not submitted

- **GIVEN** `Combobox` is rendered inside a `<form method="get">` with `name="example"`
- **WHEN** the user types text that does not match any option, without selecting one, and the
  form is submitted
- **THEN** the resulting query string MUST NOT contain a non-empty `example` value

#### Scenario: Selecting an option submits that option's id

- **GIVEN** `Combobox` is rendered inside a `<form method="get">` with `name="example"` and an
  option with id `"abc"`
- **WHEN** the user selects that option and the form is submitted
- **THEN** the resulting query string MUST contain `example=abc`

### Requirement: DateRangePicker primitive renders two independent native date inputs

The `DateRangePicker` component SHALL render two independent `<input type="date">` elements (a
"from" and a "to" field), each submitting its own value under its own given field `name` — not a
single composite/segmented control.

#### Scenario: Two independently-named native date inputs are rendered

- **WHEN** `DateRangePicker` is rendered with `fromName="fromDate"` and `toName="toDate"`
- **THEN** the rendered output MUST contain two `<input type="date">` elements, one with
  `name="fromDate"` and one with `name="toDate"`

#### Scenario: Setting only one field does not require the other

- **GIVEN** `DateRangePicker` is rendered inside a `<form method="get">`
- **WHEN** only the "from" field is given a value and the form is submitted
- **THEN** the resulting query string MUST contain the "from" field's value
- **AND** it MUST NOT require the "to" field to have been set

### Requirement: Components ship with no PrimeReact dependency

None of these components SHALL import from `primereact`. Styling is applied via the legacy
application's own existing `dts-*`/`mg-*` CSS classes together with the minimal, `6a`-scoped
Tailwind `@theme` token block these components themselves introduce (design.md Decision 8) — not
any further, broader cross-cutting token/theme system beyond that one block (e.g. the full
`DEF-014` Pass-1 extraction remains out of scope for this intent, per proposal.md item 3).

#### Scenario: No PrimeReact import

- **WHEN** any file under the design-system components location is inspected
- **THEN** it MUST NOT import anything from the `primereact` package

### Requirement: Components carry no domain-specific knowledge

None of these components SHALL import a type, DTO, or module from any `app/domains/*` bounded
context. Domain-specific composition (which columns to show, what a row links to) is the
responsibility of the consuming domain's own presentation layer, not these primitives.

#### Scenario: No domain import

- **WHEN** any file under the design-system components location is inspected
- **THEN** it MUST NOT import anything from any `app/domains/*` path

### Requirement: Components enforce Lucide-only icons, semantic tokens, and copy rules

Every `.ts`/`.tsx` file under `app/design-system/components/` SHALL use `lucide-react` exclusively for icons (forbidding `react-icons`, `primeicons`, `@heroicons`, `@fortawesome`), forbid hardcoded hex color literals and `tokens.css` primitive `--color-*` variables, and forbid em-dashes (`—`) in visible UI copy outside comments.

#### Scenario: No non-Lucide icon library imports

- **WHEN** any `.ts` or `.tsx` file under `app/design-system/components/` is inspected
- **THEN** it MUST NOT import from `react-icons`, `primeicons`, `@heroicons`, or `@fortawesome`

#### Scenario: No hardcoded hex colors or tokens.css primitives

- **WHEN** any `.ts` or `.tsx` file under `app/design-system/components/` is inspected
- **THEN** it MUST NOT contain hex color literals (`#[0-9a-fA-F]{3,8}`)
- **AND** it MUST NOT reference `--color-(neutral|warm|accent|green|amber|red)-` CSS custom properties

#### Scenario: No em-dashes in visible JSX UI copy

- **WHEN** any `.ts` or `.tsx` file under `app/design-system/components/` is inspected outside comments
- **THEN** string literals and JSX text MUST NOT contain the em-dash character (`—`)
