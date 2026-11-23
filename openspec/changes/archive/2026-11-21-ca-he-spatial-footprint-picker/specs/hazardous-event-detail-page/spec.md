## ADDED Requirements

### Requirement: The Location Card renders the current observation's divisionIds, not only its geometries

`HazardousEventDetailPage`'s Location Card SHALL render `currentSpatialObservation.divisionIds`
whenever it is a non-empty array, independent of whether `geometries` is empty — closing the gap
where a division-only observation (no hand-drawn shape) was recorded correctly but never visible
anywhere on this page (design.md Decision 10, `ca-he-spatial-footprint-picker`). It is
display-only, under a visible "Divisions" label: each division is shown by its breadcrumb path
(e.g. "Abyan Governorate / Zinjibar" — the same label the form's rows use), resolved client-side
from the cached division tree; never as a raw id. Until the tree arrives it shows a loading status;
a division missing from the tree (or a failed fetch) shows the form's "Unknown division (id)"
label. It does **not** copy a division's boundary into `geometries` or alter the existing
`HazardousEventLocationMap` rendering.

#### Scenario: A division-only observation now shows its divisionIds

- **WHEN** `currentSpatialObservation` is non-null, `geometries` is empty, and `divisionIds` is a
  non-empty array
- **THEN** the Location Card renders those divisions by breadcrumb path, not raw id
- **AND** the Location Card does NOT render the page's "no observation" empty state (it is
  non-null, so that state never applied here — see design.md Decision 10's own correction)

#### Scenario: An observation with both geometries and divisionIds renders both

- **WHEN** `currentSpatialObservation` is non-null, `geometries` is a non-empty array, and
  `divisionIds` is also a non-empty array
- **THEN** the Location Card renders the existing map for `geometries`
- **AND** the Location Card also renders the divisions from `divisionIds` by breadcrumb path

#### Scenario: An observation with no divisionIds renders no division list

- **WHEN** `currentSpatialObservation` is non-null and `divisionIds` is an empty array
- **THEN** the Location Card renders no division list element (existing `geometries`/map
  rendering is unaffected)
