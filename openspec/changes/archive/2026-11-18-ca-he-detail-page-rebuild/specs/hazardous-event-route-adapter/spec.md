## MODIFIED Requirements

### Requirement: HE detail loader resolves and returns the acting role

The `loader` exported from `app/routes/$lang+/_authenticated+/he-preview+/$id.tsx` SHALL continue
to call `requireViewDataPermission({ request })` for its authorization side-effect (a real
`ViewData` gate, shared with the list loader), but SHALL NOT capture its return value or include a
`role` field in the loader's return value. This reverses the "Captured (was previously discarded)"
change made by a different, already-archived change
(`2026-11-04-ca-he-route-adapter-write`, design.md Decision 16) to feed the Edit/add-cause links
the two Requirements below now remove.

#### Scenario: Detail loader returns the resolved role alongside the event

- **GIVEN** an authenticated session with `ViewData` permission and role `"data-collector"`
- **WHEN** the detail loader runs for an existing, tenant-scoped event
- **THEN** `requireViewDataPermission({ request })` SHALL still have resolved and authorized that
  role (its 403-on-missing-permission behavior is unchanged)
- **AND** the loader's return value SHALL NOT include a `role` field alongside the event (title
  retained from the superseded requirement for delta continuity; the behavior is now the opposite
  of what the title describes literally — see the Requirement text above)

### Requirement: HE detail page renders an "Edit" link, gated by EditData AND the same status-aware check the edit route's own loader enforces

`HazardousEventDetailPage` SHALL NOT render a link to `he-preview/edit/{id}`, for any role or
`workflowStatus`. This reverses the Requirement of the same name added by
`2026-11-04-ca-he-route-adapter-write` (design.md Decision 16): a fresh manual review against
legacy's real current detail page (`app/frontend/events/hazardeventform.tsx`'s
`HazardousEventView`, `hideEditButton={true}` at line 693, honored unconditionally by
`app/frontend/components/data-collection/View.tsx:624`) found legacy has no Edit link on this page
at all — Edit remains reachable from the Hazardous events list page's own row actions instead.
Every scenario below (titles retained from the superseded requirement for delta continuity) now
asserts the link is absent in the case it used to assert the link was present.

#### Scenario: A role with EditData sees the Edit link for an editable status (DRAFT)

- **GIVEN** a detail page rendered for a role with `EditData` permission (e.g. `"data-collector"`)
  and `data.workflowStatus: "DRAFT"`
- **WHEN** the page renders
- **THEN** no link to `he-preview/edit/{id}` SHALL be present

#### Scenario: A role with EditData sees the Edit link for REVISION_REQUESTED

- **GIVEN** a detail page rendered for a role with `EditData` permission (e.g. `"admin"`) and
  `data.workflowStatus: "REVISION_REQUESTED"`
- **WHEN** the page renders
- **THEN** no link to `he-preview/edit/{id}` SHALL be present

#### Scenario: A role with EditData never sees the Edit link for a locked status

- **GIVEN** a detail page rendered with `role: "admin"` and `data.workflowStatus` one of
  `"SUBMITTED"`, `"APPROVED"`, `"PUBLISHED"`
- **WHEN** the page renders
- **THEN** no link to `he-preview/edit/{id}` SHALL be present

#### Scenario: data-viewer never sees the Edit link

- **GIVEN** a detail page rendered with `role: "data-viewer"`
- **WHEN** the page renders
- **THEN** no link to `he-preview/edit/{id}` SHALL be present

#### Scenario: A null/missing role never sees the Edit link

- **GIVEN** a detail page rendered with `role: null`
- **WHEN** the page renders
- **THEN** no link to `he-preview/edit/{id}` SHALL be present

### Requirement: HE detail page renders an "Add hazardous event caused by this event" link, gated the same way

`HazardousEventDetailPage` SHALL NOT render a link to `he-preview/new?parent={id}`, for any role.
This reverses the Requirement of the same name added by `2026-11-04-ca-he-route-adapter-write`
(design.md Decision 16): a fresh manual review against legacy's real current detail page found no
equivalent entry point for this link anywhere on the page's redesign. The route at
`he-preview/new.tsx` and its `?parent=` query-param handling are unchanged and still function if
reached directly by URL — only the in-app link to it from this page is removed. Both scenarios
below (titles retained from the superseded requirement for delta continuity) now assert the link
is absent in the case that used to assert it was present.

#### Scenario: A role with EditData sees the add-cause link

- **GIVEN** a detail page rendered for a role with `EditData` permission (e.g. `"admin"`) for
  event id `"evt-1"`
- **WHEN** the page renders
- **THEN** no link to `he-preview/new?parent=evt-1` SHALL be present

#### Scenario: data-viewer never sees the add-cause link

- **GIVEN** a detail page rendered with `role: "data-viewer"`
- **WHEN** the page renders
- **THEN** no link to `he-preview/new?parent={id}` SHALL be present
