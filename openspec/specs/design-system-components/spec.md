# design-system-components Specification

## Purpose

Reusable, cross-cutting React Aria presentation primitives — not owned by any single domain —
that custom-style React Aria's unstyled components to be visually and behaviorally identical to
DELTA's existing legacy UI, serving as the forward-path replacement for PrimeReact across every
future Clean Architecture presentation-layer intent.

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
