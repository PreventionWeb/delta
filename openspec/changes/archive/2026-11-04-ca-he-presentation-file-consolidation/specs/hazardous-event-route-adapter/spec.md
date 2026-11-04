## MODIFIED Requirements

### Requirement: HE detail page renders an "Edit" link, gated by EditData AND the same status-aware check the edit route's own loader enforces

`HazardousEventDetailPage` SHALL render a link to `he-preview/edit/{id}` labelled with the
translation key `detail.edit` whenever `roleHasPermission(role, "EditData")` is `true` AND
`isStatusAwareEditBlocked(role, data.workflowStatus)` is `false`, where `role` is the value returned
by the detail loader and `data.workflowStatus` is the detail DTO's own field. This matches legacy's
own Edit link (`app/frontend/components/data-collection/View.tsx`, gated by
`canEditDataCollectionRecord(role, approvalStatus)`): locked for every role when `workflowStatus` is
`SUBMITTED`/`APPROVED`/`PUBLISHED`, editable otherwise (`DRAFT`/`REVISION_REQUESTED`/`null`) for
every role with `EditData`. `isStatusAwareEditBlocked` is the same predicate
`requireStatusAwareEditPermission` (in `requestAuthorizationGuards.server.ts`) already uses for the
edit route's own loader (Decision 2) — not a second, independently-derived status rule.

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
