## Purpose

HE-owned parsing of the `/he-preview` list route's URL query into a typed, validated filter
object, and the presentation-layer composition of the filter bar from design-system primitives,
matching the legacy `hazardevent-filters.tsx` field set.

## ADDED Requirements

### Requirement: Filter query params are parsed into a typed, validated object

`parseHazardousEventListFilters(searchParams: URLSearchParams)` SHALL read `hazardTypeId`,
`hazardClusterId`, `specificHazardId`, `fromDate`, `toDate`, `recordingOrganization`,
`hazardousEventStatus`, `recordStatus`, `viewMyRecords`, `pendingMyAction` from the given query
string and resolve a `HazardousEventListFilterInput` object. A param that is absent or an empty
string SHALL resolve to that field being absent from the returned object (not an empty string).

#### Scenario: All filter params supplied

- **WHEN** `parseHazardousEventListFilters` is called with a query string containing a valid
  value for every filter param
- **THEN** the resolved object SHALL have every corresponding field set to that value

#### Scenario: No filter params supplied

- **WHEN** `parseHazardousEventListFilters` is called with a query string containing no filter
  params at all
- **THEN** the resolved object SHALL have no filter fields set

### Requirement: A malformed UUID-shaped filter value is dropped, not passed through

`hazardTypeId`, `hazardClusterId`, and `specificHazardId` SHALL each be validated against a UUID
shape before being included in the resolved filter object. A value that does not match SHALL be
treated as absent.

#### Scenario: Non-UUID specificHazardId is dropped

- **WHEN** the query string contains `specificHazardId=not-a-uuid`
- **THEN** the resolved object's `specificHazardId` field SHALL be absent

### Requirement: A malformed date filter value is dropped, not passed through

`fromDate`/`toDate` SHALL each be validated against the shape `YYYY`, `YYYY-MM`, or `YYYY-MM-DD`
before being included. A value that does not match SHALL be treated as absent.

#### Scenario: Malformed fromDate is dropped

- **WHEN** the query string contains `fromDate=not-a-date`
- **THEN** the resolved object's `fromDate` field SHALL be absent

#### Scenario: A full ISO date is accepted

- **WHEN** the query string contains `fromDate=2024-03-15`
- **THEN** the resolved object's `fromDate` field SHALL equal `"2024-03-15"`

### Requirement: An unrecognized enum filter value is dropped, not passed through

`hazardousEventStatus` SHALL be validated against `"forecasted" | "ongoing" | "passed"`;
`recordStatus` SHALL be validated against the CA `Status` enum values (`DRAFT`, `SUBMITTED`,
`REVISION_REQUESTED`, `APPROVED`, `REJECTED`, `PUBLISHED`). A value outside the known set SHALL
be treated as absent.

#### Scenario: Unrecognized recordStatus is dropped

- **WHEN** the query string contains `recordStatus=waiting-for-validation` (a legacy value, not
  a CA `Status` value)
- **THEN** the resolved object's `recordStatus` field SHALL be absent

#### Scenario: A recognized CA Status value is accepted

- **WHEN** the query string contains `recordStatus=SUBMITTED`
- **THEN** the resolved object's `recordStatus` field SHALL equal `"SUBMITTED"`

### Requirement: Checkbox filter params follow the same `"on"` convention as the legacy form

`viewMyRecords`/`pendingMyAction` SHALL resolve to `true` only when the corresponding query param
is exactly `"on"` (an HTML checkbox's own default submitted value), and `false` otherwise,
including when absent.

#### Scenario: Checked checkbox param

- **WHEN** the query string contains `viewMyRecords=on`
- **THEN** the resolved object's `viewMyRecords` field SHALL be `true`

#### Scenario: Absent checkbox param

- **WHEN** the query string contains no `pendingMyAction` param
- **THEN** the resolved object's `pendingMyAction` field SHALL be `false`

### Requirement: The filter bar renders the full legacy field set, grouped into the same rows

`HazardousEventFilterBar` SHALL render, in this order: a row of three fields (hazard type select,
cluster select, specific-hazard combobox), a row of three fields (from-date, to-date, recording
organization), a row of two fields (hazardous-event-status select, record-status select), and an
actions row (the two "mine" checkboxes on the left, "Clear" and "Apply filters" buttons on the
right).

#### Scenario: Filter bar renders all documented fields

- **WHEN** `HazardousEventFilterBar` is rendered
- **THEN** it SHALL render exactly one hazard-type select, one cluster select, one specific-hazard
  combobox, one from-date input, one to-date input, one recording-organization text input, one
  hazardous-event-status select, one record-status select, and (subject to the next requirement)
  two checkboxes

### Requirement: The "mine" checkboxes are hidden for a role that cannot add records

The `viewMyRecords`/`pendingMyAction` checkboxes SHALL be rendered only when the current user's
role can add new records (matching the legacy component's own `canAddNewRecord` gate); for a role
that cannot, neither checkbox SHALL be present in the rendered output.

#### Scenario: Data-viewer role sees no "mine" checkboxes

- **WHEN** `HazardousEventFilterBar` is rendered for a user whose role is `data-viewer`
- **THEN** neither the "View my records" nor the "Pending my action" checkbox SHALL be present in
  the rendered output

#### Scenario: A role that can add records sees both checkboxes

- **WHEN** `HazardousEventFilterBar` is rendered for a user whose role can add new records
- **THEN** both checkboxes SHALL be present in the rendered output

### Requirement: The record-status dropdown's options are restricted for a data-viewer role

The record-status `Select`'s option list SHALL be restricted to `APPROVED`/`PUBLISHED`-equivalent
options when the current user's role is `data-viewer`, matching the legacy component's own
`getRecordStatusOptions` role-based restriction, independent of the backend's own data-viewer
restriction (`list-hazardous-events` capability).

#### Scenario: Data-viewer role sees only Validated/Published options

- **WHEN** `HazardousEventFilterBar` is rendered for a user whose role is `data-viewer`
- **THEN** the record-status `Select`'s option list SHALL contain only the options corresponding
  to `APPROVED` and `PUBLISHED`

#### Scenario: A non-data-viewer role sees every record-status option

- **WHEN** `HazardousEventFilterBar` is rendered for a user whose role is not `data-viewer`
- **THEN** the record-status `Select`'s option list SHALL contain every `Status` value

### Requirement: The filter bar renders above the table, independent of whether results are empty

`HazardousEventListPage` SHALL render the filter bar unconditionally, before the summary line,
legend, and table/empty-state — not only when `items.length > 0`.

#### Scenario: Filter bar renders with zero results

- **WHEN** `HazardousEventListPage` receives data whose `items` array is empty
- **THEN** the filter bar SHALL still be present in the rendered output

### Requirement: The filter bar renders as a sibling before the page's own section, not nested inside it

`HazardousEventListPage` SHALL render `HazardousEventFilterBar` as a sibling preceding the
existing `<section className="dts-page-section">` element, not as a child nested inside it —
matching the legacy list page's own sibling placement.

#### Scenario: Filter bar is not a descendant of the page section

- **WHEN** `HazardousEventListPage` is rendered
- **THEN** `HazardousEventFilterBar`'s rendered output SHALL NOT be a descendant of the
  `<section className="dts-page-section">` element

### Requirement: The summary line and legend render even when the result set is empty

`HazardousEventListPage` SHALL render the "Showing X of Y" summary line and the record-status
legend unconditionally (matching legacy's own unconditional rendering) — only the table itself is
replaced by the "No records found" message when `items` is empty.

#### Scenario: Summary line and legend render on a zero-result page

- **WHEN** `HazardousEventListPage` receives data whose `items` array is empty
- **THEN** the summary line and the record-status legend SHALL both still be present in the
  rendered output
- **AND** the table SHALL be replaced by the "No records found" message

### Requirement: Applying filters resets pagination to page 1 while preserving pageSize via a hidden field

The filter form SHALL include a hidden `pageSize` input carrying the current view's `pageSize`
value, and SHALL NOT include a `page` field at all, so that submission's resulting navigation has
no `page` param (causing the loader's own default to apply, i.e. page 1) and a `pageSize` param
equal to the current view's value.

#### Scenario: Submitting the filter form drops page but keeps pageSize

- **GIVEN** the current URL is `?page=3&pageSize=10&hazardTypeId=abc`
- **WHEN** the filter form is submitted with a changed filter value
- **THEN** the resulting navigation's query string SHALL NOT contain a `page` param
- **AND** the resulting navigation's query string SHALL contain `pageSize=10`

### Requirement: Clearing filters navigates to the bare list path with no query params

The "Clear" control SHALL link to the list route's own base path with no query string at all —
not merely with the filter params removed while pagination params remain.

#### Scenario: Clear link has no query string

- **WHEN** `HazardousEventFilterBar` is rendered with `clearFiltersUrl` set to the list route's
  base path
- **THEN** the "Clear" control's target SHALL be that base path with no query string
