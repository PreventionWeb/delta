# Proposal: Harmonize Hazardous Events and Disaster Records Views with Disaster Events

## Why

The presentation layer of DELTA Resilience is actively migrating towards a modern PrimeReact + Tailwind design system.
The **Disaster Events view** (`/en/disaster-event/:id`) has already been migrated to this modern card-based review layout (`DisasterEventReviewStep.tsx`), providing an intuitive, accessible visual hierarchy with top back navigation, clean section cards, two-column responsive grids, structured attachment rows, and interactive spatial footprint maps.

In contrast, **Hazardous Events** (`/en/hazardous-event/:id`) and **Disaster Records** (`/en/disaster-record/:id`) still rely on legacy `FieldsView` (`dts-form`), raw unstyled summary banners, and disconnected HTML tables. This creates an inconsistent user experience across core entity detail pages.

This proposal harmonizes both views using dedicated review presentation components per domain (Option B), matching the Disaster Events layout, typography, and card headers exactly without risking regressions to existing Disaster Event pages.

## What Changes

1. **Hazardous Events View (`/en/hazardous-event/:id`)**:
   - Introduce `HazardousEventReviewStep.tsx` inside `app/frontend/events/`.
   - Update `HazardousEventView` in `app/frontend/events/hazardeventform.tsx` to use `HazardousEventReviewStep`.
   - Update `app/routes/$lang+/hazardous-event+/$id.tsx` to set `hideTopSummary={true}` on `ViewComponentMainDataCollection` and provide an outlined top back button (`<Button outlined icon="pi pi-arrow-left" label="Back to Hazardous events" />`).
   - Structure into cards: `Basic information`, `Hazard details`, `Location` (with interactive Leaflet map), `Attachments`, `Linked events` (parent/children cards, omitting the add button), and `Audit log history`.

2. **Disaster Records View (`/en/disaster-record/:id`)**:
   - Introduce `DisasterRecordReviewStep.tsx` inside `app/frontend/disaster-record/`.
   - Update `DisasterRecordsView` in `app/frontend/disaster-record/form.tsx` to use `DisasterRecordReviewStep`.
   - Update `app/routes/$lang+/disaster-record+/$id.tsx` to set `hideTopSummary={true}` on `ViewComponentMainDataCollection`, provide an outlined top back button (`<Button outlined icon="pi pi-arrow-left" label="Back to Disaster records" />`), and integrate `Human effects`, `Sector effects`, `Non-economic losses`, and `Audit log history` into harmonized cards.
   - For `Human effects`: display summary KPI metric chips (`Deaths`, `Injured`, `Missing`, `Directly Affected`, `Indirectly Affected`, `Displaced`) at the top of the card, followed by the complete totals table and disaggregations.

3. **Preserve Form-CSV-API integrity**:
   - `fieldsDef` and `fieldsDefCommon` remain completely unchanged on both models/forms to preserve CSV and API endpoints.

## File Touchpoints

| File | Reason |
| :--- | :--- |
| `app/frontend/events/HazardousEventReviewStep.tsx` | New dedicated card-based review presentation component for Hazardous Events. |
| `app/frontend/events/hazardeventform.tsx` | Update `HazardousEventView` to render `HazardousEventReviewStep` instead of legacy `FieldsView`. |
| `app/routes/$lang+/hazardous-event+/$id.tsx` | Set `hideTopSummary={true}` and pass the outlined back button in `extraInfo`. |
| `app/frontend/disaster-record/DisasterRecordReviewStep.tsx` | New dedicated card-based review presentation component for Disaster Records including KPI chips. |
| `app/frontend/disaster-record/form.tsx` | Update `DisasterRecordsView` to render `DisasterRecordReviewStep` instead of legacy `FieldsView`. |
| `app/routes/$lang+/disaster-record+/$id.tsx` | Set `hideTopSummary={true}`, pass outlined back button, and integrate effects/losses into cards. |
| `tests/unit/components/HazardousEventReviewStep.test.ts` | Unit tests for Hazardous Event review component rendering and structure. |
| `tests/unit/components/DisasterRecordReviewStep.test.ts` | Unit tests for Disaster Record review component rendering and KPI chips. |

## Database Migration

**No database migration is required.** This change is purely presentation and layout harmonization.

## Test Approach

- **Component & Integration testing via Vitest + jsdom (`yarn test:dom` / `yarn vitest run`)**: Verify rendering of all card sections, KPI chips, attachment links, and conditional elements.
- **Full regression suite via PGlite (`yarn test:run2`)**: Ensure all existing model, handler, and route tests remain green.

## Security & Multi-tenancy

This change does not modify authorization, loaders, or database queries. All tenant scoping (`countryAccountsId`) and permission checks (`authLoader*`, `authAction*`) in `app/routes/$lang+/hazardous-event+/$id.tsx` and `app/routes/$lang+/disaster-record+/$id.tsx` remain strictly intact.
