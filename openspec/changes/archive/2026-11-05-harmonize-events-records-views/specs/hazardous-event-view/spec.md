# Spec: Hazardous Event Harmonized View

## Overview

Specifies the observable behavior and visual structure of the Hazardous Event detail view at route `app/routes/$lang+/hazardous-event+/$id.tsx` and presentation component `HazardousEventView` in `app/frontend/events/hazardeventform.tsx`.

## Scenarios

### Scenario 1: Rendering Hazardous Event Detail View (Happy Path)
- **GIVEN** an authorized user navigating to `/:lang/hazardous-event/:id`
- **WHEN** the loader in `app/routes/$lang+/hazardous-event+/$id.tsx` resolves valid event data from `hazardousEventById`
- **THEN** the page MUST render an outlined back button labeled "Back to Hazardous events" linking to `/:lang/hazardous-event`
- **AND** the page MUST NOT display the legacy top summary with raw title and id
- **AND** the page MUST render the following modular cards with exact headers:
  - `Basic information` (with `pi-info-circle text-blue-600` icon) displaying Originator, Status badge, Magnitude, Data source, UUID, and Created/Updated timestamps
  - `Hazard details` (with `pi-map-marker text-blue-600` icon) displaying Hazard Type, Hazard Cluster, Specific Hazard name/code, Start date, End date, National specification (before description), Description, and Chains explanation
  - `Location` (with `pi-map-marker text-blue-600` icon) displaying Geographic level pills, spatial footprint titles, and the Leaflet location map
  - `Attachments` (with `pi-paperclip text-blue-600` icon) displaying document and link table with Title, Tag badges, and File/URL links with file size and type
  - `Linked events` (with `pi-link text-blue-600` icon) displaying parent (causing) and child (caused) event cards
- **AND** the `Linked events` card MUST NOT render an "Add hazardous event caused by this event" button.

### Scenario 2: Rendering Linked Event Relationships (Parent and Child events)
- **GIVEN** a Hazardous Event record with a parent event and two child events
- **WHEN** `HazardousEventView` renders the `Linked events` section
- **THEN** the parent event MUST be rendered under a "Triggering (caused by)" block as a formatted linked event card
- **AND** each child event MUST be rendered under a "Triggered (causing)" block as a formatted linked event card
- **AND** if no parent or child events exist, the card MUST display an italicized empty message stating no linked events are recorded.

### Scenario 3: Conditional Rendering of Empty or Optional Fields
- **GIVEN** a Hazardous Event record where `chainsExplanation` and `nationalSpecification` are null or empty
- **WHEN** `HazardousEventView` renders `Basic information` and `Hazard details`
- **THEN** fields with missing data MUST display a hyphen (`-`) fallback or be conditionally omitted without throwing errors or breaking card grid alignment.

### Scenario 4: Unauthorized Access (Error Path)
- **GIVEN** an unauthenticated or unauthorized user attempting to access `/:lang/hazardous-event/:id`
- **WHEN** the loader in `app/routes/$lang+/hazardous-event+/$id.tsx` executes
- **THEN** the route handler MUST reject access with status code 403 or redirect to login.
