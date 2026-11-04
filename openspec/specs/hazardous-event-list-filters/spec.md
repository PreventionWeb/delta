# hazardous-event-list-filters Specification

## Purpose

HE-owned parsing of the `/he-preview` list route's URL query into a typed, validated filter
object, and the presentation-layer composition of the filter bar from design-system primitives,
matching the legacy `hazardevent-filters.tsx` field set.

## Requirements

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

### Requirement: An "Add new event" navigation link renders above the list page, role-gated by EditData, on the main list route only

A new component, `HazardousEventListActions` (exported from
`app/domains/hazardous-events/presentation/web/HazardousEventListActions.tsx`), SHALL render an
"Add new event" navigation link to the create route (`ctx.url("/he-preview/new")`) when
`roleHasPermission(role, "EditData")` is `true` for its given `role` prop, and SHALL render nothing
when it is `false` (including `role: "data-viewer"`, `null`, or `undefined`).

The main list route (`app/routes/$lang+/_authenticated+/he-preview+/_index.tsx`) SHALL render
`HazardousEventListActions` as a sibling preceding `HazardousEventListPage`, passing the loader's
own `role` value. `HazardousEventListPage` itself SHALL NOT render this link internally, and
`app/routes/$lang+/_authenticated+/he-preview+/picker.tsx` (the parent-picker route, which reuses
`HazardousEventListPage` via `HazardousEventPickerPage` per the existing `hazardous-event-list-page`
capability's component-reuse design) SHALL NOT render `HazardousEventListActions` at all — the
picker route's own `EditData` gate (`requireEditDataPermission`) means every picker session would
otherwise pass the same role check the main list route uses, so keeping the link's placement
exclusive to the main route is the only way to prevent it appearing inside the parent-picker popup.

#### Scenario: A role with EditData sees the "Add new event" link on the main list route

- **GIVEN** `HazardousEventListActions` receives `role: "data-collector"`
- **WHEN** the component is rendered
- **THEN** the rendered output SHALL contain a link whose `href` resolves to `/en/he-preview/new`
  (via `ctx.url`) and whose text is the `list.add_new_event` translation

#### Scenario: data-viewer does not see the "Add new event" link

- **GIVEN** `HazardousEventListActions` receives `role: "data-viewer"`
- **WHEN** the component is rendered
- **THEN** the rendered output SHALL NOT contain a link to `/en/he-preview/new`

#### Scenario: A missing role does not see the "Add new event" link

- **GIVEN** `HazardousEventListActions` receives `role: null`
- **WHEN** the component is rendered
- **THEN** the rendered output SHALL NOT contain a link to `/en/he-preview/new`

#### Scenario: The parent-picker popup never renders the "Add new event" link, even for an admin session

- **GIVEN** `app/routes/$lang+/_authenticated+/he-preview+/picker.tsx`'s loader resolves
  `role: "admin"` (an `EditData`-holding role)
- **WHEN** `HazardousEventPickerRoute`'s default export is rendered
- **THEN** the rendered output SHALL NOT contain a link to `/en/he-preview/new`
- **AND** `HazardousEventListActions` SHALL NOT be present anywhere in `picker.tsx`'s own rendered
  component tree

### Requirement: A top-of-page unfiltered-total count header renders on the main list route, independent of the existing filtered/unfiltered summary line

A new component, `HazardousEventListHeader` (exported from
`app/domains/hazardous-events/presentation/web/HazardousEventListHeader.tsx`), SHALL accept
`totalCount: number` and `instanceName: string` props and render the text "{{count}} hazardous
event(s) in {{instance}}" (the `list.count_in_instance` translation, interpolated with `totalCount`
and `instanceName`) unconditionally — no role gate.

The main list route (`app/routes/$lang+/_authenticated+/he-preview+/_index.tsx`) SHALL render
`HazardousEventListHeader` as a sibling preceding `HazardousEventListActions` and
`HazardousEventListPage`, passing the loader's own `unfilteredTotalCount` value as `totalCount` —
the same value already used as the denominator in `HazardousEventListPage`'s own
`list.showing_of_total` summary line (this capability's existing requirement) — and not a second,
independently-queried total. The route's loader SHALL resolve `instanceName` via
`getCountrySettingsFromSession(request)`, using `settings?.websiteName || "DELTA Resilience"` as the
value, matching legacy's own fallback exactly.

This header and `HazardousEventListPage`'s existing `list.showing_of_total` line are both present on
the page simultaneously and SHALL NOT be treated as duplicates of one another: this header's count
SHALL NOT change in response to any filter state, while `list.showing_of_total`'s `filtered` value
SHALL continue to change with the active filters (this capability's existing behavior, unmodified).

`app/routes/$lang+/_authenticated+/he-preview+/picker.tsx` SHALL NOT render
`HazardousEventListHeader`.

#### Scenario: The header renders the unfiltered total and instance name, unconditionally

- **GIVEN** the main list route's loader resolves `unfilteredTotalCount: 42` and
  `instanceName: "Example Country Instance"`, for a session with any role including `null`
- **WHEN** the route's default export is rendered
- **THEN** the rendered output SHALL contain the text "42 hazardous event(s) in Example Country
  Instance"

#### Scenario: The header's count does not change when a filter is applied

- **GIVEN** the main list route's loader resolves `unfilteredTotalCount: 42` and `totalCount: 5`
  (a filter is active, narrowing the result set to 5 of 42)
- **WHEN** the route's default export is rendered
- **THEN** `HazardousEventListHeader`'s rendered text SHALL still read "42 hazardous event(s) in
  ..." — not 5
- **AND** `HazardousEventListPage`'s own `list.showing_of_total` line SHALL separately read
  "Showing 5 of 42 hazardous event(s)" (this capability's existing, unmodified requirement)

#### Scenario: instanceName falls back to "DELTA Resilience" when no custom name is configured

- **GIVEN** `getCountrySettingsFromSession(request)` resolves a settings object with no
  `websiteName` set (or resolves nothing at all)
- **WHEN** the main list route's loader runs
- **THEN** the loader's returned `instanceName` SHALL be `"DELTA Resilience"`

#### Scenario: The parent-picker popup never renders the top-of-page count header

- **GIVEN** `picker.tsx`'s loader resolves any `unfilteredTotalCount`
- **WHEN** `HazardousEventPickerRoute`'s default export is rendered
- **THEN** `HazardousEventListHeader` SHALL NOT be present anywhere in `picker.tsx`'s own rendered
  component tree

### Requirement: The main list route's default actions cell renders a status-aware "Edit" link before the existing "View" link

`HazardousEventListPage`'s default actions cell (rendered only when `renderActionsCell` is not
supplied — the main list route; the parent-picker route always supplies its own "Select" override and
is unaffected by this requirement) SHALL render a link to `he-preview/edit/{id}` before the existing
link to `he-preview/{id}`, labelled with the `detail.edit` translation, whenever
`roleHasPermission(role, "EditData")` is `true` AND `isStatusAwareEditBlocked(role,
item.workflowStatus)` is `false`, where `role` is `HazardousEventListPageData`'s own `role` prop and
`item.workflowStatus` is each row's own field. This matches the gating already specified for the
detail page's own Edit link (`hazardous-event-route-adapter` capability) — the same predicate, not a
second, independently-derived rule.

When the gate is not satisfied, the row SHALL render the existing "View" link plus a fixed-width,
non-interactive placeholder in the Edit link's own position, so that the View link's horizontal
position within the actions cell does not change depending on whether the Edit link renders for that
row (design.md Decision 24). This placeholder SHALL render whenever the Edit link does not render for
a row, for any reason the gate above can fail (locked `workflowStatus`, a role without `EditData`, or
a `null`/missing role) — one rule, not a status-specific special case. The placeholder SHALL carry
`aria-hidden="true"`, SHALL have no `href` and no focusable content, and SHALL NOT be reachable via
keyboard navigation of the row.

#### Scenario: The View link renders at the same horizontal position whether or not the Edit link is present

- **GIVEN** a rendered list containing one row with an editable `workflowStatus` (e.g. `DRAFT`) and
  one row with a locked `workflowStatus` (e.g. `SUBMITTED`), both rows rendered for the same role
  holding `EditData`
- **WHEN** each row's actions cell renders
- **THEN** both rows' actions cell renders exactly two slots in the same DOM order: an Edit slot
  first, and the View link second
- **AND** the `DRAFT` row's Edit slot is the real Edit link, while the `SUBMITTED` row's Edit slot is
  the non-interactive placeholder described above, occupying the same layout position
- **AND** the placeholder carries `aria-hidden="true"` and renders no `<a>`/`href`, so it is excluded
  from the accessibility tree and from keyboard focus

#### Scenario: A role without EditData, or a null role, renders the placeholder on every row

- **GIVEN** `HazardousEventListPage` is rendered with `role: "data-viewer"` (or `role: null`), for any
  row regardless of `workflowStatus`
- **WHEN** the row's actions cell renders
- **THEN** the Edit slot renders the non-interactive placeholder, not the real Edit link, for every
  row
- **AND** the View link still renders, in the same position as it does for a row where the real Edit
  link is present

#### Scenario: A role with EditData sees the Edit link for a row with an editable status

- **GIVEN** `HazardousEventListPage` is rendered with `role: "data-collector"` and a row whose
  `workflowStatus` is `"DRAFT"`
- **WHEN** the row's actions cell renders
- **THEN** a link to `he-preview/edit/{id}` SHALL be present, before the link to `he-preview/{id}`

#### Scenario: A role with EditData does not see the Edit link for a row with a locked status

- **GIVEN** `HazardousEventListPage` is rendered with `role: "admin"` and a row whose `workflowStatus`
  is one of `"SUBMITTED"`, `"APPROVED"`, `"PUBLISHED"`
- **WHEN** the row's actions cell renders
- **THEN** no link to `he-preview/edit/{id}` SHALL be present for that row
- **AND** the link to `he-preview/{id}` SHALL still be present

#### Scenario: data-viewer never sees the Edit link

- **GIVEN** `HazardousEventListPage` is rendered with `role: "data-viewer"`, for any row
- **WHEN** the row's actions cell renders
- **THEN** no link to `he-preview/edit/{id}` SHALL be present for that row

#### Scenario: A null/missing role never sees the Edit link

- **GIVEN** `HazardousEventListPage` is rendered with `role: null`, for any row
- **WHEN** the row's actions cell renders
- **THEN** no link to `he-preview/edit/{id}` SHALL be present for that row

#### Scenario: The parent-picker's own action column never renders the Edit link

- **GIVEN** `HazardousEventPickerPage` renders `HazardousEventListPage` with its own
  `renderActionsCell` override, for a session with role `"admin"`
- **WHEN** a row's actions cell renders
- **THEN** no link to `he-preview/edit/{id}` SHALL be present for that row
- **AND** only the picker's own "Select" action SHALL be present
