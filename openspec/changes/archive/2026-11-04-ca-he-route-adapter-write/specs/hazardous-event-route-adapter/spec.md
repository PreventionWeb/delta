## ADDED Requirements

### Requirement: HE detail loader resolves and returns the acting role

The `loader` exported from `app/routes/$lang+/_authenticated+/he-preview+/$id.tsx` SHALL capture the
role returned by `requireViewDataPermission({ request })` and include it as `role` in the loader's
return value, alongside the resolved `HazardousEventDetailDto`.

#### Scenario: Detail loader returns the resolved role alongside the event

- **GIVEN** an authenticated session with `ViewData` permission and role `"data-collector"`
- **WHEN** the detail loader runs for an existing, tenant-scoped event
- **THEN** the loader's return value SHALL include `role: "data-collector"`

### Requirement: HE detail page renders an "Edit" link, gated by EditData AND the same status-aware check the edit route's own loader enforces

`HazardousEventDetailPage` SHALL render a link to `he-preview/edit/{id}` labelled with the
translation key `detail.edit` whenever `roleHasPermission(role, "EditData")` is `true` AND
`isStatusAwareEditBlocked(role, data.workflowStatus)` is `false`, where `role` is the value returned
by the detail loader and `data.workflowStatus` is the detail DTO's own field. This matches legacy's
own Edit link (`app/frontend/components/data-collection/View.tsx`, gated by
`canEditDataCollectionRecord(role, approvalStatus)`): locked for every role when `workflowStatus` is
`SUBMITTED`/`APPROVED`/`PUBLISHED`, editable otherwise (`DRAFT`/`REVISION_REQUESTED`/`null`) for
every role with `EditData`. `isStatusAwareEditBlocked` is the same predicate
`requireStatusAwareEditPermission.server.ts` already uses for the edit route's own loader
(Decision 2) — not a second, independently-derived status rule.

#### Scenario: A role with EditData sees the Edit link for an editable status (DRAFT)

- **GIVEN** a detail page rendered with `role: "data-collector"` and `data.workflowStatus: "DRAFT"`
- **WHEN** the page renders
- **THEN** a link to `he-preview/edit/{id}` SHALL be present

#### Scenario: A role with EditData sees the Edit link for REVISION_REQUESTED

- **GIVEN** a detail page rendered with `role: "admin"` and `data.workflowStatus:
  "REVISION_REQUESTED"`
- **WHEN** the page renders
- **THEN** a link to `he-preview/edit/{id}` SHALL be present

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

`HazardousEventDetailPage` SHALL render a link to `he-preview/new?parent={id}` labelled with the
translation key `detail.add_cause`, gated by the same `roleHasPermission(role, "EditData")` check as
the Edit link, matching legacy's own `canAddNewRecord` gate on this link
(`app/frontend/events/hazardeventform.tsx`).

#### Scenario: A role with EditData sees the add-cause link

- **GIVEN** a detail page rendered with `role: "admin"` for event id `"evt-1"`
- **WHEN** the page renders
- **THEN** a link to `he-preview/new?parent=evt-1` SHALL be present

#### Scenario: data-viewer never sees the add-cause link

- **GIVEN** a detail page rendered with `role: "data-viewer"`
- **WHEN** the page renders
- **THEN** no link to `he-preview/new?parent={id}` SHALL be present
