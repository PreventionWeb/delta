## MODIFIED Requirements

### Requirement: The export keeps the legacy header and appends three columns

The header SHALL be the legacy export header in its legacy order (design.md E1 of 6d-1):

`updatedAt`, `createdAt`, `approvalStatus`, `createdByUserId`, `updatedByUserId`,
`submittedByUserId`, `submittedAt`, `validatedByUserId`, `validatedAt`, `publishedByUserId`,
`publishedAt`, `apiImportId`, `hipHazardId`, `hipClusterId`, `hipTypeId`, `id`,
`countryAccountsId`, `specificHazardId`, `status`, `nationalSpecification`, `startDate`,
`endDate`, `description`, `chainsExplanation`, `magnitude`, `recordOriginator`,
`hazardousEventStatus`, `dataSource`, `specificHazardLocalName`, `specificHazardNationalName`.

It SHALL be followed by exactly three appended columns, in this order: `parent`,
`spatialFootprint`, `attachments` (NOD-10). Legacy never exported `spatialFootprint` or
`attachments`; roadmap 6d-2 appends them.

Rows SHALL be ordered by `id` ascending. Dates SHALL be written as stored. Timestamps SHALL be
UTC ISO 8601 with `Z` (ADR-002). An empty tenant SHALL produce a header-only file at 200.

#### Scenario: Header order

- **WHEN** any export is downloaded
- **THEN** its first line is exactly the legacy export header followed by
  `,parent,spatialFootprint,attachments`

#### Scenario: Empty tenant

- **GIVEN** a tenant with no events
- **WHEN** the export is downloaded
- **THEN** the body is the header line only and the status is 200

## ADDED Requirements

### Requirement: Footprint and attachment cells use the legacy JSON formats, from CA data with legacy fallbacks

`ExportHazardousEventsCsvUseCase` SHALL write `spatialFootprint` and `attachments` as JSON arrays
that the CA import accepts unchanged.

`spatialFootprint`:

- It SHALL come from the event's current CA spatial observation (latest by observation time).
- It SHALL contain one item `{"map_option":"Map coordinates","geojson":{"type":"Feature","geometry":<g>,"properties":{}}}`
  per geometry.
- It SHALL contain one item `{"map_option":"Geographic level","division_id":<d>,"geojson":{"type":"Feature","geometry":null,"properties":{"division_id":<d>}}}`
  per division. The item MUST NOT embed the division's boundary geometry.
- A current observation that is empty SHALL write `[]`.
- Only when the event has no CA observation at all SHALL the legacy footprint rows be used
  instead, in the same format (design.md OD-6).

`attachments`:

- It SHALL come from the event's CA attachment rows: Link items
  `{"title","tag","file_option":"Link","url"}`, and File items
  `{"title","tag","file_option":"File","file":{"name":"/uploads/tenant-<tenant>/hazardous-event/<event>/<fileKey>","content_type":<type>}}`.
- Only an unmigrated row (null `specific_hazard_id`) SHALL fall back to the legacy `attachments`
  jsonb, projected to the same item shape (design.md OD-6).
- No item SHALL carry `tenantPath`.

An event with no data of a kind SHALL write `[]`. Items SHALL be in a deterministic order, so
two exports of unchanged data are byte-identical; attachment items that tie on
`(file_option, title, url or file name)` are ordered by their full content.

#### Scenario: A CA footprint and link export in the legacy format

- **GIVEN** an event whose current observation holds Point (77.2, 28.6) and division D1, and one
  Link attachment `https://example.com/a`
- **WHEN** it is exported
- **THEN** its `spatialFootprint` cell holds one `Map coordinates` item with that Point and one
  `Geographic level` item naming D1 with a null geometry
- **AND** its `attachments` cell holds one Link item with that URL

#### Scenario: A cleared footprint is not resurrected from legacy rows

- **GIVEN** an event with legacy geometry rows and a CA current observation that is empty
- **WHEN** it is exported
- **THEN** its `spatialFootprint` cell is `[]`

#### Scenario: An unmigrated row exports its legacy data

- **GIVEN** an event with `specific_hazard_id = NULL`, one legacy geometry row, and a legacy
  `attachments` jsonb holding one Link item and one File item with a `tenantPath`
- **WHEN** it is exported
- **THEN** its `spatialFootprint` cell holds that geometry
- **AND** its `attachments` cell holds both items, without `tenantPath`

#### Scenario: Exported footprint and attachments re-import unchanged

- **GIVEN** an export of a tenant whose events have footprints and attachments
- **WHEN** the file is imported in update mode
- **THEN** every row counts as `unchanged`, no observation is recorded and no file is deleted
