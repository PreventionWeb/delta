## ADDED Requirements

### Requirement: Isolated route

The POC list page SHALL be served at `/{lang}/poc-react-aria/hazardous-event` and SHALL NOT be
linked from any navigation menu (`app/components/RegularMenuBar.tsx` or any other nav surface)
during the lifetime of this experiment.

#### Scenario: Direct URL access

- **WHEN** a user navigates directly to `/{lang}/poc-react-aria/hazardous-event`
- **THEN** the React Aria + Tailwind list page SHALL render

#### Scenario: Not reachable via navigation

- **WHEN** a user browses the app's standard navigation menu
- **THEN** no link to the POC list route SHALL be present anywhere in that menu

### Requirement: Auth boundary matches production (public)

The POC list page SHALL be reachable without authentication, matching the production Hazardous
Event list page's public access. This requirement governs only the _auth boundary_; it does not
imply anything about which columns render — the "Visual and behavioral parity" requirement below
governs rendering, and rendering is no longer conditioned on the `isPublic`/authenticated
distinction at all (the page always renders the full column set regardless of auth state).

#### Scenario: Unauthenticated visitor can view the list

- **WHEN** an unauthenticated visitor requests `/{lang}/poc-react-aria/hazardous-event`
- **THEN** the page SHALL render the list without redirecting to login

### Requirement: List rows are served from a static fixture

The POC list loader SHALL serve its displayed rows from a static, in-memory fixture rather than a
live `hazardousEventsLoader` query, after the real `authLoaderPublicOrWithPerm("ViewData", ...)`
check has run (see the Auth boundary requirement above, which is unaffected by this).

#### Scenario: Rows come from a fixture, not a live query

- **WHEN** the POC list page renders
- **THEN** the displayed hazardous event rows SHALL come from a static fixture shaped like
  `hazardousEventsLoader`'s real return value, and `hazardousEventsLoader` SHALL NOT be invoked

#### Scenario: Empty-state fixture variant

- **WHEN** the fixture's zero-rows variant is used
- **THEN** the POC list page SHALL render the same "no records found" messaging behavior described
  below, driven entirely by fixture data

### Requirement: Fixture data supports pagination

The populated list-rows fixture SHALL contain at least 25 rows, so that the pagination control is
genuinely exercised across multiple pages rather than only structurally present with a single
page of results.

#### Scenario: Multiple pages of results

- **WHEN** the POC list page renders using the populated fixture
- **THEN** the pagination control SHALL offer more than one page, and navigating to page 2 or
  later SHALL display a different subset of the fixture's rows than page 1

### Requirement: Visual and behavioral parity with the production list page

The POC list page SHALL always render the same full column set, "Showing X of Y" summary text,
spacing, colors, sort/filter behavior, and pagination as the production Hazardous Event list
page's authenticated rendering (`app/frontend/events/hazardeventlist.tsx`), using React Aria
Components + Tailwind instead of the current markup, such that an end user cannot tell the two
apart by look and feel alone. The POC SHALL NOT branch its own rendering on a public/authenticated
distinction — it always renders the full column set regardless of any `isPublic` value present in
the fixture/loader return shape.

#### Scenario: Column parity

- **WHEN** the POC list page renders a page of results
- **THEN** it SHALL display the same columns in the same order as production's authenticated list
  view: hazard type, record status, hazardous event UUID, created date, updated date, and Actions

#### Scenario: Results summary text parity

- **WHEN** the POC list page renders a page of results
- **THEN** it SHALL display a "Showing X of Y hazardous event(s)" summary above the table, matching
  production's copy and placement, where X is the number of rows shown on the current page and Y
  is the total matching row count read directly from the fixture's `pagination.totalItems`
- **NOTE:** production computes Y from a client-side `totalCountRef` that ratchets upward on
  unfiltered views rather than always reading `pagination.totalItems` directly
  (`hazardeventlist.tsx` lines 62-79, 115-131); the POC intentionally uses the simpler direct read
  since it has no live data source for the ratcheting behavior to protect against, so Y may differ
  from production's value in edge cases involving client-side filter state — this is a known,
  accepted simplification, not a parity gap to fix

#### Scenario: Empty state parity

- **WHEN** no hazardous events match the current filters
- **THEN** the POC list page SHALL display the same "no records found" messaging behavior as the
  production list page

### Requirement: Actions column is a non-functional visual mock

The POC list page SHALL display an Actions column with edit, view, and delete icon buttons that
visually reuse production's exact SVG icon sprites (`edit.svg`, `eye-show-password.svg`,
`trash-alt.svg`, as used by `app/frontend/components/data-collection/ActionLinks.tsx`), but none
of the three buttons SHALL perform real navigation or a real mutation against fixture data, since
fixture row IDs do not correspond to real database records.

#### Scenario: Clicking edit, view, or delete opens a placeholder modal

- **WHEN** a user clicks the edit, view, or delete icon button for any row
- **THEN** a single shared informational modal SHALL open, displaying placeholder copy explaining
  the action is not wired up in this POC
- **AND** no navigation to an edit or detail route SHALL occur, and no delete request SHALL be
  submitted

#### Scenario: No real deletion is possible

- **WHEN** a user clicks the delete icon button and then dismisses the placeholder modal
- **THEN** the row SHALL remain present in the rendered table, unchanged

### Requirement: Navigation affordance to record detail

The POC list page SHALL provide a way to reach an individual hazardous event's detail page, as the
production list page does via its UUID-column link.

#### Scenario: Following the ID link

- **WHEN** a user clicks the truncated UUID shown for a hazardous event row
- **THEN** the browser SHALL navigate to the production detail route `/hazardous-event/{id}`
  (there is no POC-specific detail page in this spike's scope)

### Requirement: Disposable outcome is acceptable

This capability SHALL be treated as evidence-gathering, not a shippable feature. Failing to
achieve full visual parity SHALL be treated as an acceptable, reportable outcome, not a defect.

#### Scenario: Parity gap discovered

- **WHEN** some visual or behavioral aspect of the production list page cannot be reasonably
  reproduced with React Aria Components + Tailwind within the spike's time-box
- **THEN** that gap SHALL be recorded as a finding (not silently dropped, and not treated as a
  blocking bug requiring extended work beyond the time-box)
