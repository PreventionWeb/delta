## ADDED Requirements

### Requirement: HazardousEvent.create() validates hazardousEventStatus against the known enum

`hazardous_event.hazardous_event_status` is a plain `text` column with no DB-level CHECK constraint
(`app/drizzle/migrations/20250325105544_initial_db.sql:666`), and the presentation-layer parser
(`parseHazardousEventFormData.server.ts`) performs an unchecked cast
(`strOrNull(formData, "hazardousEventStatus") as HazardousEventStatus | null`) with no runtime guard.
`HazardousEvent.create()` SHALL reject any non-null `hazardousEventStatus` value that is not a member
of `HAZARDOUS_EVENT_STATUS_VALUES` (`"forecasted" | "ongoing" | "passed"`) by throwing
`ValidationError`, the same enum-guard pattern `WorkflowInstance.create()` already uses for
`entityType`/`status` (`!ENTITY_TYPE_VALUES.includes(...)` / `!STATUS_VALUES.includes(...)`). A `null`
value remains valid (the field is nullable) and is unaffected by this guard.

#### Scenario: A valid hazardousEventStatus value is accepted

- **GIVEN** a well-formed set of `HazardousEventProps` with `hazardousEventStatus: "ongoing"`
- **WHEN** `HazardousEvent.create(props, validHazardDriverIds, validCustomFieldDefinitionIds)` is
  called
- **THEN** it SHALL NOT throw, and the constructed entity's `hazardousEventStatus` getter SHALL return
  `"ongoing"`

#### Scenario: A null hazardousEventStatus value is accepted

- **GIVEN** a well-formed set of `HazardousEventProps` with `hazardousEventStatus: null`
- **WHEN** `HazardousEvent.create(...)` is called
- **THEN** it SHALL NOT throw

#### Scenario: An invalid hazardousEventStatus value is rejected

- **GIVEN** a well-formed set of `HazardousEventProps` with `hazardousEventStatus` set to a string
  that is not one of `"forecasted"`, `"ongoing"`, `"passed"` (e.g. a tampered/hand-crafted form
  submission bypassing the UI's own `<select>`, which only ever offers valid options)
- **WHEN** `HazardousEvent.create(...)` is called
- **THEN** it SHALL throw `ValidationError`
- **AND** no `HazardousEvent` instance SHALL be constructed
