## Purpose

Specifies the observable disabled/enabled contract of the hazardous-event create/edit form's main
"Save or submit" button: its state must always be an accurate, immediate signal of whether the form
can currently be submitted successfully, rather than only being checked at the moment of submission.
Also specifies two related observable contracts of the hazard classification group this button's own
validity depends on: its "Specific hazard" field's own required-marker display, and that field's
continued responsiveness to user interaction regardless of unrelated edits elsewhere on the form.

## ADDED Requirements

### Requirement: The "Save or submit" button is disabled whenever the form has an invalid required field

On the hazardous-event create/edit form, the main "Save or submit" button SHALL be disabled whenever
the form is not currently valid per native HTML5 constraint validation (any required field -- the
hazard classification, start date, end date, or record originator -- is empty or otherwise invalid),
and SHALL be enabled whenever the form is valid. This state SHALL be correct immediately on initial
render, before any user interaction, and SHALL continue to update live as the user fills in or
clears any field -- not only at the moment of submission. This is a deliberate departure from the
form's own legacy equivalent, which has no such check.

#### Scenario: A brand-new, empty create form renders with the button disabled

- **WHEN** the create form is rendered with no field values filled in
- **THEN** the "Save or submit" button SHALL be disabled

#### Scenario: An edit form pre-filled from a stored record missing a required field renders with the button disabled

- **GIVEN** an existing record whose stored end date is missing (e.g. a legacy row with no end date)
- **WHEN** the edit form is rendered with that record's values, before any user interaction
- **THEN** the "Save or submit" button SHALL be disabled

#### Scenario: An edit form pre-filled with every required field valid renders with the button enabled

- **GIVEN** an existing record whose hazard classification, start date, end date, and record
  originator are all present and valid
- **WHEN** the edit form is rendered with that record's values, before any user interaction
- **THEN** the "Save or submit" button SHALL be enabled

#### Scenario: Filling the last empty required field enables the button

- **GIVEN** a form where every required field except one already holds a valid value
- **WHEN** the user supplies a valid value for the one remaining empty required field
- **THEN** the "Save or submit" button SHALL transition from disabled to enabled
- **AND** no page reload or form submission SHALL be required for this transition

#### Scenario: Clearing a previously-valid required field disables the button

- **GIVEN** a form where every required field currently holds a valid value and the button is enabled
- **WHEN** the user clears one required field back to empty
- **THEN** the "Save or submit" button SHALL transition from enabled to disabled

#### Scenario: A React-driven change to a required control's value leaves the button correctly disabled

- **GIVEN** a form where every required field currently holds a valid value (including the hazard
  classification) and the button is enabled
- **WHEN** the user types into the hazard classification's own filter-by-name field, which resets the
  hazard classification's own required selection to empty as a side effect
- **THEN** the "Save or submit" button SHALL become disabled, reflecting the required control's
  now-empty value as committed by React, not a stale pre-commit snapshot of it

### Requirement: A disabled "Save or submit" button cannot open the save/submit action modal

While the "Save or submit" button is disabled, activating it SHALL have no effect: it SHALL NOT open
the save/submit action modal and SHALL NOT submit the form.

#### Scenario: Activating a disabled button has no effect

- **GIVEN** the "Save or submit" button is disabled because a required field is invalid
- **WHEN** a user attempts to activate the button
- **THEN** the save/submit action modal SHALL NOT open
- **AND** the form SHALL NOT be submitted

### Requirement: The "Specific hazard" field displays its own required marker

The "Specific hazard" field within the hazard classification group SHALL display its own visible
required-field marker (a literal `" *"` suffix on its own label), independently of the hazard
classification group's own hardcoded `"Hazard classification *"` heading, since "Specific hazard" is
the one individually-required control within that group (design.md Decision 19).

#### Scenario: The "Specific hazard" field's own label carries a required marker

- **WHEN** the hazard classification group is rendered
- **THEN** the "Specific hazard" field's own label SHALL read "Specific hazard \*"
- **AND** the group's own heading SHALL still read "Hazard classification \*"

#### Scenario: "Hazard type" and "Hazard cluster" carry no required marker of their own

- **WHEN** the hazard classification group is rendered
- **THEN** neither the "Hazard type" field's label nor the "Hazard cluster" field's label SHALL carry
  a required marker

### Requirement: The "Specific hazard" control remains responsive to user interaction regardless of unrelated form edits elsewhere on the page

The "Specific hazard" `<select>` SHALL remain selectable, by click, keyboard type-ahead, or arrow-key
navigation, at any point in the form-filling session, regardless of how many times the user has, in
the interim, edited any other field on the same create/edit form (design.md Decision 20). Filling in
other required fields while "Specific hazard" is left temporarily unselected SHALL NOT leave the
control permanently unresponsive to subsequent native selection attempts.

#### Scenario: Selecting a specific hazard after filling other fields first still works

- **GIVEN** a hazard type and hazard cluster have been selected, leaving "Specific hazard" unselected
- **WHEN** the user then fills in the record originator, start date, and end date fields, without
  selecting a specific hazard
- **AND** the user returns to "Specific hazard" and selects one of its options
- **THEN** the "Specific hazard" `<select>` SHALL reflect the selected option as its value
- **AND** the "Save or submit" button SHALL subsequently reflect that field as valid, consistent with
  the rest of this capability's own button-disabled contract

#### Scenario: Editing an unrelated required field does not re-render the hazard classification group when its own data is unchanged

- **GIVEN** the hazard classification group's own props (`taxonomyOptions`, the initial specific
  hazard id, and any field errors) are unchanged
- **WHEN** the user edits any other required field on the form (e.g. record originator or a date
  field), triggering this capability's own live-validity recheck
- **THEN** the hazard classification group SHALL NOT re-render as a result of that unrelated edit
