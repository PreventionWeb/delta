## ADDED Requirements

### Requirement: The edit route passes the event's already-resolved current spatial observation through to the form

`edit.$id.tsx`'s `loader` already resolves the full event DTO, including
`currentSpatialObservation`, via `GetHazardousEventByIdUseCase` — no new use-case call is
introduced. The route's default-exported component SHALL include
`currentSpatialObservation: event.currentSpatialObservation` in the `initialValues` object it
passes to `HazardousEventFormPage`, so the spatial-footprint picker can prefill from it.

#### Scenario: Edit route passes a non-null current observation through for prefill

- **WHEN** `edit.$id.tsx` renders for an event with a non-null `currentSpatialObservation`
- **THEN** `HazardousEventFormPage` is rendered with `initialValues.currentSpatialObservation`
  equal to that observation's `geometries` and `divisionIds`

#### Scenario: Edit route passes a null current observation through unchanged

- **WHEN** `edit.$id.tsx` renders for an event whose `currentSpatialObservation` is `null`
- **THEN** `HazardousEventFormPage` is rendered with `initialValues.currentSpatialObservation`
  equal to `null`, and the picker starts empty

### Requirement: A `divisionIds`-shaped ValidationError maps to the picker's field error, including its singular form

The create/edit actions' existing `ValidationError` → `fieldErrors` mapping (`extractFieldError`
in `extractFormFieldErrors.ts`) SHALL recognize `"divisionIds"` as a known field name, and SHALL
additionally alias the singular `"divisionId"` (the leading word of
`SpatialObservation.create()`'s "divisionId `${id}` is not present in validDivisionIds" message)
to the same `divisionIds` field key before applying the `KNOWN_FIELDS` check. Both cases return a
field error for the spatial-footprint field instead of propagating to the generic error boundary.
A `ValidationError` naming `geometries` is out of scope for this mapping: `parseSpatialObservation`
already coerces a non-array `geometries` to `[]` before it ever reaches
`SpatialObservation.create()`, so that `ValidationError` is not reachable through this form.

#### Scenario: A duplicate-divisionIds ValidationError returns a field error, not a 500

- **WHEN** `CreateHazardousEventUseCase.execute` or `UpdateHazardousEventUseCase.execute` rejects
  with a `ValidationError` whose message is `"divisionIds must not contain duplicate values"`
- **THEN** the action returns `{ success: false, fieldErrors: { divisionIds: [message] } }`
- **AND** `throwHazardousEventLoaderError` is never called for this case

#### Scenario: An unknown-division-id ValidationError (singular message) also returns a field error

- **WHEN** `CreateHazardousEventUseCase.execute` or `UpdateHazardousEventUseCase.execute` rejects
  with a `ValidationError` whose message begins with the singular `"divisionId "` (an id absent
  from the tenant's valid set)
- **THEN** `extractFieldError` aliases the captured word to `divisionIds` and the action returns
  `{ success: false, fieldErrors: { divisionIds: [message] } }`
- **AND** `throwHazardousEventLoaderError` is never called for this case
