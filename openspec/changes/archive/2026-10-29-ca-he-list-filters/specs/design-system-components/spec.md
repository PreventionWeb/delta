## ADDED Requirements

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

### Requirement: Components ship with no PrimeReact dependency (extends the existing requirement to the four new primitives)

`Select`, `Combobox`, and `DateRangePicker` SHALL NOT import from `primereact`, consistent with
every other component under `app/design-system/components/`. `Checkbox` is covered by this same
rule as a new file under that location.

#### Scenario: No PrimeReact import in any new primitive

- **WHEN** `Select.tsx`, `Combobox.tsx`, `DateRangePicker.tsx`, or `Checkbox.tsx` is inspected
- **THEN** it MUST NOT import anything from the `primereact` package

### Requirement: The four new primitives carry no domain-specific knowledge

`Select`, `Combobox`, `DateRangePicker`, and `Checkbox` SHALL NOT import a type, DTO, or module
from any `app/domains/*` bounded context.

#### Scenario: No domain import in any new primitive

- **WHEN** `Select.tsx`, `Combobox.tsx`, `DateRangePicker.tsx`, or `Checkbox.tsx` is inspected
- **THEN** it MUST NOT import anything from any `app/domains/*` path
