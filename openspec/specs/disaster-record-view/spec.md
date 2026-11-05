# Spec: Disaster Record Harmonized View

## Overview

Specifies the observable behavior and visual structure of the Disaster Record detail view at route `app/routes/$lang+/disaster-record+/$id.tsx` and presentation component `DisasterRecordsView` in `app/frontend/disaster-record/form.tsx`.

## Scenarios

### Scenario 1: Rendering Disaster Record Detail View (Happy Path)
- **GIVEN** an authorized user navigating to `/:lang/disaster-record/:id`
- **WHEN** the loader in `app/routes/$lang+/disaster-record+/$id.tsx` resolves valid record data from `disasterRecordsById`
- **THEN** the page MUST render an outlined back button labeled "Back to Disaster records" linking to `/:lang/disaster-record`
- **AND** the page MUST NOT display the legacy top summary with raw title and id
- **AND** the page MUST render the following modular cards with exact headers:
  - `Basic information` (with `pi-info-circle text-blue-600` icon) displaying Record ID, Linked disaster event name/link, Recording institution, Data collector, Checked by, Validated by, Primary and other data sources, Assessment date, and Methodologies
  - `Hazard details` (with `pi-map-marker text-blue-600` icon) displaying Hazard Type, Hazard Cluster, Specific Hazard name/code, Location description, Start date, and End date
  - `Location` (with `pi-map-marker text-blue-600` icon) displaying Geographic division pills and the interactive Leaflet map
  - `Human effects` (with `pi-users text-blue-600` icon)
  - `Sector effects` (with `pi-building text-blue-600` icon) wrapping the sector effects data
  - `Non-economic losses` (with `pi-wallet text-blue-600` icon) displaying non-economic loss categories and descriptions preserving multi-line line breaks
  - `Attachments` (with `pi-paperclip text-blue-600` icon) displaying document and link table with Title, Tag badges, and File/URL links with file size and type
  - `Audit log history` (with `pi-history text-blue-600` icon) when audit records are present.

### Scenario 2: Human Effects KPI Chips and Tabular Disaggregations
- **GIVEN** a Disaster Record with recorded human effects totals and disaggregation rows
- **WHEN** the `Human effects` card renders
- **THEN** it MUST render summary KPI metric chips at the top of the card for:
  - Deaths
  - Injured
  - Missing
  - Directly Affected
  - Indirectly Affected
  - Displaced
- **AND** any non-recorded or boolean `false` values MUST be displayed as `-` instead of literal `false`
- **AND** it MUST render the detailed disaggregation tables (e.g. gender, age, disability) below the KPI chips when disaggregated data is present without rendering the redundant totals table.

### Scenario 3: Rendering Missing or Non-Applicable Effects
- **GIVEN** a Disaster Record with zero non-economic losses or empty attachments
- **WHEN** `DisasterRecordsView` renders
- **THEN** the empty sections MUST display an empty state label indicating no records exist without breaking the layout.

### Scenario 4: Unauthorized Access (Error Path)
- **GIVEN** a request to `/:lang/disaster-record/:id` belonging to a different country account than the user's active session
- **WHEN** the loader in `app/routes/$lang+/disaster-record+/$id.tsx` checks tenant scoping
- **THEN** the route handler MUST throw a 403 Unauthorized error response.
