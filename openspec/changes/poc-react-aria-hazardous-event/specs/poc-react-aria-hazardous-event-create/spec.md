## ADDED Requirements

### Requirement: Isolated route
The POC create page SHALL be served at `/{lang}/poc-react-aria/hazardous-event/new` and SHALL NOT
be linked from any navigation menu during the lifetime of this experiment.

#### Scenario: Direct URL access
- **WHEN** an authenticated, permitted user navigates directly to
  `/{lang}/poc-react-aria/hazardous-event/new`
- **THEN** the React Aria + Tailwind stepper form SHALL render

#### Scenario: Not reachable via navigation
- **WHEN** a user browses the app's standard navigation menu
- **THEN** no link to the POC create route SHALL be present anywhere in that menu

### Requirement: Auth boundary matches production (authenticated, permitted)
The POC create page SHALL enforce the same authentication and `EditData` permission check as the
production create page (`app/routes/$lang+/_authenticated+/hazardous-event+/new.tsx`), including
independently guaranteeing the redirect rather than relying on the parent layout's loader running
first.

#### Scenario: Unauthenticated visitor is redirected
- **WHEN** an unauthenticated visitor requests `/{lang}/poc-react-aria/hazardous-event/new`
- **THEN** the request SHALL redirect to the login flow, and the form SHALL NOT render

#### Scenario: Authenticated user without EditData permission is forbidden
- **WHEN** an authenticated user lacking the `EditData` permission requests the POC create route
- **THEN** the server SHALL respond with a 403 Forbidden, and the form SHALL NOT render

#### Scenario: No country account selected
- **WHEN** an authenticated, permitted user with no `countryAccountsId` in session requests the
  POC create route
- **THEN** the request SHALL redirect to the select-instance flow, matching production behavior

### Requirement: Reference and dropdown data is served from static fixtures
The POC create loader SHALL serve hazard classification options, the validator user list, and
division geojson (spatial footprint reference data) from static, in-memory fixture data rather than
live database queries, after the real authentication and permission check (see the Auth boundary
requirement above) has passed. No `dataForHazardPicker`, `getUserCountryAccountsWithValidatorRole`,
`getUserCountryAccountsWithAdminRole`, or `divisionTable` query SHALL execute as part of rendering
this page.

#### Scenario: Hazard classification options come from a fixture
- **WHEN** the POC create page renders Step 1's hazard classification control
- **THEN** the type/cluster/hazard options SHALL come from a static fixture, with the same
  type→cluster→hazard parent-linkage the real `dataForHazardPicker` response has, not from a live
  query

#### Scenario: Validator list comes from a fixture
- **WHEN** the save/submit dialog's validator selection control renders
- **THEN** the list of selectable validators SHALL come from a static fixture, not from
  `getUserCountryAccountsWithValidatorRole`/`getUserCountryAccountsWithAdminRole`

#### Scenario: Division geojson comes from a fixture
- **WHEN** the Step 3 spatial footprint widget renders its selectable base divisions
- **THEN** the division/geojson data SHALL come from a static fixture, not from a live
  `divisionTable` query

### Requirement: Multi-step stepper with at least 3 steps
The POC create page SHALL present the Hazardous Event fields as a stepper of at least 3 steps,
grouping the same field set the production single-page form collects
(`fieldsDefCommon`/`fieldsDef` in `app/frontend/events/hazardeventform.tsx`), with no field
omitted and no field duplicated across steps.

#### Scenario: Step count
- **WHEN** the POC create page renders
- **THEN** it SHALL present at least 3 distinct steps, with visible progress indication of the
  current step and total step count

#### Scenario: Values persist across step navigation
- **WHEN** a user enters a value on one step, then navigates to a different step and back
- **THEN** the previously entered value SHALL still be present, whether or not that step's inputs
  were unmounted while inactive

#### Scenario: Per-step validation gates advancement
- **WHEN** a user attempts to advance past a step that has an incomplete required field for that
  step
- **THEN** advancement SHALL be blocked and the incomplete field SHALL be indicated, without
  referencing fields belonging to other, inactive steps

### Requirement: Component styling matches production; stepper structure is an intentional change
Buttons, inputs, colors, and spacing on the POC create page SHALL visually match the production
create page's styling. The single-page-to-stepper restructuring itself is an intentional,
business-requested structural change and is explicitly exempt from "matches today" — the
production form's single-page layout is not the target for that dimension.

#### Scenario: Control-level styling parity
- **WHEN** a text field, button, or checkbox is rendered on any POC step
- **THEN** its colors, spacing, and typography SHALL match the equivalent control on the
  production create page

#### Scenario: Structural difference is not treated as a parity gap
- **WHEN** comparing the POC's multi-step flow to the production single-page form
- **THEN** the presence of multiple steps SHALL NOT be logged as a parity defect

### Requirement: Save-or-submit workflow is reachable from the final step, fully mocked
The POC create page SHALL provide access to the same save-as-draft / submit-for-validation choice
the production `SaveSubmitDialog` provides, rebuilt with React Aria Components, from the final
step of the stepper. Because this POC is presentation-layer-only and its reference/dropdown data
(hazard classification, validator list, division geojson) is static fixture data rather than live
data, the submit action itself SHALL be fully simulated: it SHALL NOT call `hazardousEventCreate`,
SHALL NOT call the approval-workflow service, and SHALL NOT create or modify any database row. The
route's authentication and `EditData` permission check (see the Auth boundary requirement above)
SHALL still run for real, unaffected by this mocking — only the data-persistence step after that
check passes is simulated.

#### Scenario: Save as draft is simulated
- **WHEN** a user completes all required fields across all steps and chooses "save as draft" on
  the final step
- **THEN** no real hazardous event record SHALL be created (`hazardousEventCreate` SHALL NOT be
  invoked), and the page SHALL render a simulated success/confirmation state reflecting a
  draft-status save, derived from the fully assembled stepper state

#### Scenario: Submit for validation requires a validator
- **WHEN** a user chooses "submit for validation" without selecting a validator
- **THEN** submission SHALL be blocked until at least one validator is selected, matching
  production's validator-required rule

#### Scenario: Submit for validation is simulated
- **WHEN** a user completes all required fields, selects at least one validator, and chooses
  "submit for validation" on the final step
- **THEN** no real hazardous event record SHALL be created and no approval-workflow side effect
  SHALL fire, and the page SHALL render a simulated success/confirmation state reflecting a
  submitted-for-validation outcome

#### Scenario: Assembled payload is complete and correctly shaped
- **WHEN** either simulated submit path completes
- **THEN** the payload assembled from the stepper's accumulated state SHALL be observable (e.g. via
  a logged value) and SHALL match the field shape `hazardousEventCreate` expects, with no field
  from any step missing or malformed — this is the POC's substitute proof point for "the stepper
  gathers complete, correctly-shaped data," in place of a real database write

### Requirement: Disposable outcome is acceptable
This capability SHALL be treated as evidence-gathering for a proceed/abandon decision on React
Aria Components, not a shippable feature.

#### Scenario: A widget cannot be reproduced within the time-box
- **WHEN** a specific PrimeReact-replacement widget (e.g. the validator multi-select in the
  save/submit dialog) cannot reach acceptable visual or functional parity within the spike's
  time-box
- **THEN** that gap SHALL be recorded as a finding informing the proceed/abandon recommendation,
  not treated as a blocking defect requiring the spike to be extended indefinitely
