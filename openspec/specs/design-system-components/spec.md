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

### Requirement: Button primitive renders visual variants matching legacy's button styling

The `Button` component SHALL render as a real, native-button-backed React Aria `Button`,
supporting a `primary` (filled) variant and an `outline` variant whose resting, hover, and
focus-visible appearance match legacy's `.mg-button-primary`/`.mg-button-outline` styling
(design.md Decision 12's token table), a `system` variant reusing legacy's
`mg-button mg-button-system` classes, a `system-primary` variant reusing
`mg-button mg-button-primary`, a chrome-less `icon` variant, and `accent`/
`accent-outline`/`muted-outline` variants for legacy's item-dialog buttons, and SHALL expose the
standard `disabled` DOM property when disabled.

#### Scenario: Primary variant renders as a filled button

- **WHEN** `Button` is rendered with `variant="primary"`
- **THEN** the rendered element is a `<button>` styled with a filled background, matching legacy's
  `.mg-button-primary`

#### Scenario: Outline variant renders as a bordered, unfilled button

- **WHEN** `Button` is rendered with `variant="outline"`
- **THEN** the rendered element is a `<button>` styled with a border and no filled background,
  matching legacy's `.mg-button-outline`

#### Scenario: System variant reuses legacy's mg-button-system classes

- **WHEN** `Button` is rendered with `variant="system"`
- **THEN** the rendered `<button>` carries legacy's own `mg-button mg-button-system` classes (the
  white, grey-bordered look of legacy `ContentRepeater`'s Add/Preview map buttons), not
  `dts-button`

#### Scenario: Accent variants reproduce legacy's item-dialog buttons in Tailwind classes

- **WHEN** `Button` is rendered with `variant="accent"`, `"accent-outline"`, or `"muted-outline"`
- **THEN** the rendered `<button>` is styled with Tailwind palette utility classes only (filled
  blue, blue outline, slate outline respectively), with no `dts-button`, `mg-button`, or
  PrimeReact class

#### Scenario: System-primary variant reuses legacy's mg-button-primary classes

- **WHEN** `Button` is rendered with `variant="system-primary"`
- **THEN** the rendered `<button>` carries legacy's own `mg-button mg-button-primary` classes

#### Scenario: Icon variant renders a bare button named by its aria-label

- **WHEN** `Button` is rendered with `variant="icon"`, an `aria-label`, and an icon child
- **THEN** the rendered `<button>` carries no `dts-button`/`mg-button` chrome and its accessible
  name is the `aria-label`

#### Scenario: A disabled Button cannot be activated

- **WHEN** `Button` is rendered with `disabled`
- **THEN** the rendered `<button>` element's `disabled` DOM property is `true`
- **AND** activating it (click or Enter/Space while focused) does not fire its `onPress` handler

### Requirement: Dialog primitive renders a modal with dismiss-on-escape and dismiss-on-outside-click, matching the PrimeReact Dialog it replaces

The `Dialog` component SHALL render a modal overlay (React Aria `ModalOverlay`/`Modal`/`Dialog`)
that traps focus while open, and SHALL be dismissible via the Escape key and via a click outside
the dialog panel — the same two dismiss triggers PrimeReact's `Dialog` already provided via its
own `onHide` callback (design.md Decision 12).

#### Scenario: Dialog renders its title and content while open

- **WHEN** `Dialog` is rendered with `isOpen` and a `title`/children
- **THEN** the title and the children content are both present in the rendered output

#### Scenario: Escape key closes the dialog

- **WHEN** `Dialog` is open and the Escape key is pressed while it has focus
- **THEN** the dialog's open-state change callback fires with `false`

#### Scenario: Clicking outside the dialog panel closes the dialog

- **WHEN** `Dialog` is open and a click occurs outside the dialog panel (on the overlay)
- **THEN** the dialog's open-state change callback fires with `false`

#### Scenario: A header close-icon button also closes the dialog

- **WHEN** `Dialog` is rendered with a `closeLabel` prop and the user activates the header's
  close-icon button
- **THEN** the dialog's open-state change callback fires with `false`
- **AND** the close-icon button's accessible name matches the supplied `closeLabel` (the label is
  caller-supplied, not translated inside `Dialog` itself — matching every other design-system
  component's own text-as-props convention)

### Requirement: Dialog supports a `variant="item"` for legacy's fixed-width item dialog

The `Dialog` component SHALL accept an optional `variant` prop (`"default"` | `"item"` |
`"fullscreen"`). Omitting
it MUST keep the existing chrome unchanged. `variant="item"` MUST render legacy ContentRepeater's
"Add new item" dialog look using Tailwind utility classes only (no PrimeReact components or theme
classes): a viewport-relative fixed width that narrows at smaller breakpoints, a bold title with a
round close-icon button, and a footer right-aligned below a divider (design.md Decision 14).

#### Scenario: Item variant keeps a fixed width regardless of content

- **WHEN** `Dialog` is rendered with `variant="item"`
- **THEN** its panel width comes from viewport-relative width classes, not from its content
- **AND** the close-icon button's accessible name is the supplied `closeLabel`

### Requirement: Dialog supports a `variant="fullscreen"` for legacy's whole-viewport Mapper

`variant="fullscreen"` MUST cover the whole viewport with a white panel, using legacy's own
`dts-dialog__header`, `dts-heading-2` and `dts-dialog-close-button` classes for its header, title
and close icon, and MUST let its content fill the remaining height (a shrinking flex column, so a
map inside can size to it).

#### Scenario: Fullscreen variant covers the viewport and closes via its close icon

- **WHEN** `Dialog` is rendered with `variant="fullscreen"`
- **THEN** its panel covers the viewport and its title uses `dts-heading-2`
- **AND** activating the close icon fires the open-state change callback with `false`

### Requirement: Dialog supports a `dismissDisabled` flag that suppresses only Escape-to-close

The `Dialog` component SHALL accept an optional `dismissDisabled` boolean. When `true`, pressing
Escape MUST NOT close the dialog, but clicking outside the dialog panel MUST still close it —
Escape-suppression only, not a full dismissal override. This lets a caller whose content owns a
competing Escape handler (e.g. a draw tool mid-draw) disable the conflict without losing
outside-click dismissal. Omitting the prop (every other caller) keeps today's behavior.

#### Scenario: dismissDisabled suppresses Escape but not outside-click dismissal

- **WHEN** `Dialog` is rendered with `dismissDisabled` and the user presses Escape
- **THEN** the dialog's open-state change callback is not called
- **WHEN** the user then clicks outside the dialog panel
- **THEN** the dialog's open-state change callback fires with `false`

#### Scenario: Omitting dismissDisabled keeps Escape-to-close working as before

- **WHEN** `Dialog` is rendered with no `dismissDisabled` prop and the user presses Escape
- **THEN** the dialog's open-state change callback fires with `false`

### Requirement: Section primitive renders a titled, grey-background card with an actions row below its content

The `Section` component SHALL render a `title`, `children`, and `actions` (e.g. one or more
`Button`s), inside a grey-background bordered card matching legacy's own `ContentRepeater` section
chrome (`.content-repeater`/`.content-repeater-caption`, design.md Decision 13) — without depending
on `ContentRepeater` or any of its per-item-list behavior. The `actions` slot renders **below**
`children`, in its own row — matching `.content-repeater-actions`' own position as a separate
block below the table, never beside the caption in the header row. `Section` SHALL have no
knowledge of what its `children`/`actions` represent; the caller decides the row-table/empty
content and which action buttons to show.

#### Scenario: Section renders its title, children, and actions, with actions after children

- **WHEN** `Section` is rendered with a `title`, `children`, and `actions`
- **THEN** the title text, the children content, and the actions element are all present in the
  rendered output
- **AND** the actions element renders after the children content, in a row below it, not beside
  the title in the header row

#### Scenario: Section's background and border match legacy's own section chrome

- **WHEN** `Section` is rendered
- **THEN** its container, caption, and actions row carry legacy's own `.content-repeater`,
  `.content-repeater-caption`, and `.content-repeater-actions` classes directly (design.md
  Decision 13), not a re-ported copy of their values

### Requirement: MultiSelectCombobox primitive supports filtering, multiple selection, and removable chips

The `MultiSelectCombobox` component SHALL filter its options by a case-insensitive substring match
as the user types, SHALL let the user select more than one option, and SHALL render each
currently-selected option as its own chip with a control to remove it — matching the PrimeReact
`MultiSelect` (`filter`, `display="chip"`) behavior it replaces (design.md Decision 12).

#### Scenario: Typing filters the option list case-insensitively

- **GIVEN** `MultiSelectCombobox` is rendered with options including one named `"Jane Doe"`
- **WHEN** the user types `"jane"` into the input
- **THEN** the displayed option list MUST include `"Jane Doe"`

#### Scenario: Selecting multiple options renders one chip per selection

- **WHEN** the user selects two different options
- **THEN** two chips are rendered, one per selected option, each showing that option's display
  text

#### Scenario: Removing a chip deselects that option

- **WHEN** the user activates a selected option's chip removal control
- **THEN** that option's chip is removed
- **AND** that option's id is no longer present in the component's selected-ids value

### Requirement: DELTA Design System v0.7.2 React Aria UI primitives use semantic tokens only

Reusable v0.7.2 primitives under `app/design-system/components/` (exported from `app/design-system/components/index.ts`) SHALL use `react-aria-components`, Tailwind CSS v4, `lucide-react`, and semantic tokens from `_docs/design/tokens.css` only (no hex values, `--color-*` primitives, PrimeReact, or `app/domains/*` imports), coexisting alongside transitional Phase 6a/6h primitives such as `LegacyButton` until those legacy primitives are retired.

#### Scenario: Primitives pass static design-system compliance checks

- **WHEN** files under `app/design-system/components/` are inspected by `yarn check:design-system` and `tests/unit/design-system/components/imports.test.ts`
- **THEN** zero hardcoded hex colors, zero `--color-*` primitive references, zero PrimeReact imports, and zero `app/domains/*` imports MUST be reported

#### Scenario: Transitional Phase 6a/6h components remain intact

- **WHEN** existing `app/design-system/components/` tests run
- **THEN** all existing `LegacyButton`, `Table`, `Select`, `Combobox`, `Checkbox`, `DateRangePicker`, and `Link` tests MUST continue to pass unchanged

### Requirement: ModalDialog primitive enforces non-backdrop dismissal and focus trapping

The `ModalDialog` primitive under `app/design-system/components/ModalDialog.tsx` SHALL use React Aria `ModalOverlay`, `Modal`, and `Dialog` with `isDismissable={false}` and `isKeyboardDismissDisabled={false}` so modals close only via Escape, the header close button, or explicit footer actions, and never via outside backdrop clicks.

#### Scenario: ModalDialog ignores backdrop click and closes on Escape

- **GIVEN** `ModalDialog` is rendered with `isOpen={true}`
- **WHEN** the user clicks the overlay scrim outside the dialog
- **THEN** `onOpenChange(false)` MUST NOT be called
- **AND** when the user presses `Escape`, `onOpenChange(false)` MUST be called

### Requirement: StatusIndicator primitive pairs a semantic dot with visible text

The `StatusIndicator` primitive under `app/design-system/components/StatusIndicator.tsx` SHALL render an 8px circular indicator dot alongside visible sentence-case text so color is never the sole carrier of status meaning.

#### Scenario: StatusIndicator renders dot and text for positive and warning tones

- **WHEN** `StatusIndicator` is rendered with `tone="positive"` and `"Active"` (or `tone="warning"` and `"Invitation pending"`)
- **THEN** both the decorative status dot (`aria-hidden="true"`) and the visible text label MUST be rendered without pill fill or outline borders

### Requirement: SortableTable and Pagination primitives follow v0.7.2 table rules

The `SortableTable` primitive SHALL render a React Aria `Table` with sortable column header buttons displaying directional sort icons on the active column and subtle double-arrow icons on other sortable columns, while non-sortable columns (including visually hidden `Actions`) render no sort control. The `Pagination` primitive SHALL render the range summary on the left (`Showing X-Y of N <noun>`) and rows-per-page (`25`, `50`, `100`) plus previous/next icon buttons and `Page X of Y` on the right.

#### Scenario: Clicking a sortable column header emits sort descriptor changes

- **GIVEN** `SortableTable` is rendered with sortable columns and an `onSortChange` handler
- **WHEN** the user activates a sortable column header via click or keyboard Enter/Space
- **THEN** `onSortChange` MUST be invoked with the column id and toggled sort direction

#### Scenario: Pagination disables boundary navigation buttons

- **GIVEN** `Pagination` is rendered on page 1 of 3 with 64 total items and page size 25
- **THEN** it MUST display `"Showing 1-25 of 64 users"` and `"Page 1 of 3"`
- **AND** the Previous page button MUST be disabled while the Next page button MUST be enabled

### Requirement: Callout primitive renders semantic-token status banners with accessible landmarks

The `Callout` primitive under `app/design-system/components/Callout.tsx` SHALL render a semantic-token status banner supporting `tone` values `"success"`, `"error"`, `"info"`, and `"warning"`, an optional `title`, body `children`, and a decorative Lucide status icon (`aria-hidden="true"`), using `role="alert"` for `"error"` banners and `role="status"` for non-error banners without any hardcoded hex colors or `--color-*` primitive tokens.

#### Scenario: Success callout renders title, body, and status role

- **GIVEN** `Callout` is rendered with `tone="success"`, `title="National statistics sync is ready to use"`, and body text `"Copy the key and add it to the application that needs it."`
- **WHEN** the component mounts
- **THEN** it MUST render both the title and body text inside a semantic-token surface (`bg-good-bg`, `border-good-border`) with `role="status"`

#### Scenario: Error callout renders with alert role

- **GIVEN** `Callout` is rendered with `tone="error"` and an error message
- **WHEN** the component mounts
- **THEN** it MUST render with `role="alert"` and semantic critical tokens (`bg-crit-bg`, `border-crit-border`)

### Requirement: TextField primitive supports read-only, autofocus, and focus callbacks

The `TextField` primitive under `app/design-system/components/TextField.tsx` SHALL support optional `isReadOnly`, `autoFocus`, and `onFocus` props so read-only copyable fields (such as newly created API keys) can render non-editable text that auto-selects on focus and modal forms can focus their initial field on open.

#### Scenario: Read-only TextField prevents editing and invokes onFocus

- **GIVEN** `TextField` is rendered with `isReadOnly={true}`, `value="dk_12345"`, and an `onFocus` handler
- **WHEN** the input receives focus
- **THEN** the underlying `<input>` MUST have the `readonly` attribute and MUST invoke `onFocus`

#### Scenario: Editable TextField without isReadOnly remains writable

- **GIVEN** `TextField` is rendered without `isReadOnly` and with an `onChange` handler
- **WHEN** the user types into the input
- **THEN** `onChange` MUST be invoked with the updated value
