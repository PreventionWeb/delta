## Purpose

Provides the interactive spatial-footprint picker on the Hazardous Event create/edit form — map
drawing and division-tree selection that together produce the `spatialObservation`/
`spatialObservationChanged` hidden-field payload the existing create/edit actions already consume.

## ADDED Requirements

### Requirement: The picker renders a row table inside a grey-card section, with Add/Preview-map actions below it

`HazardousEventSpatialFootprintPicker` SHALL render inside a section with a visible caption and a
grey-background card, matching this form's existing `attachments` field's own section chrome. The
section's content MUST be a table of rows — one row per currently-set geometry and one row per
currently-selected division (see the row-granularity requirement below) — never a single
collapsed summary and never the raw map/division-list controls rendered inline and
unconditionally. Below the table, the section MUST show exactly two actions: "Add" (always
enabled) and "Preview map" (disabled when the table holds zero rows, enabled otherwise).

#### Scenario: An untouched picker shows an empty table, an enabled Add action, and a disabled Preview map action

- **WHEN** the picker renders with no prior observation and no interaction
- **THEN** the table shows only its header row, with no empty-state text (matching legacy)
- **AND** the "Add" action is enabled
- **AND** the "Preview map" action is disabled
- **AND** no map canvas and no division list are visible on the page

#### Scenario: A picker holding content shows one row per geometry and one row per division, with Preview map enabled

- **WHEN** the picker holds at least one geometry or at least one selected division
- **THEN** the table shows exactly that many rows, each labelled per the row-granularity
  requirement below
- **AND** the "Preview map" action is enabled

### Requirement: Row granularity — one row per geometry, one row per division, never a combined blob

The picker's row table SHALL derive its rows directly from `geometries` and `divisionIds`: each
`geometries[i]` entry is its own row, and each `divisionIds[i]` entry is its own row. Adding
multiple divisions in one "Select" session MUST add that many rows at once, each independently
removable afterward. There is no row that represents more than one geometry or more than one
division, and no row that represents "an Add session" rather than a specific geometry or division.

#### Scenario: Columns are Option, Value, Action in that order

- **WHEN** the row table renders
- **THEN** its columns are "Option" (the row's item type: "Map coordinates" or "Geographic
  level"), "Value" (the row's label), and "Action" (right-aligned), in that order
- **AND** each row's actions are icon buttons — delete, then edit — each with an accessible name
  that includes the row's label unescaped (e.g. "Delete Abyan Governorate / Zinjibar")

#### Scenario: Multi-selecting two divisions in one session adds two independent rows

- **WHEN** the user selects two divisions in one "Geographic level" session and commits it
- **THEN** the table gains exactly two new rows, one per selected division
- **AND** each of those two rows can be removed independently of the other afterward

#### Scenario: A geometry row's label identifies its shape type and coordinates

- **WHEN** a geometry row is rendered
- **THEN** its label reads `"Shape: <TYPE>"`, where `<TYPE>` is that geometry's bare GeoJSON
  `type` (e.g. "Polygon", "Point"), followed by its corner Lat/Lng coordinates as read-only text

#### Scenario: A division row's label is its breadcrumb path, not its bare name

- **WHEN** a division row is rendered for a division that has a parent in the tenant's division
  tree
- **THEN** its label is that division's breadcrumb path (e.g. "Abyan Governorate / Zinjibar"), not
  its bare name alone

### Requirement: Clicking Add opens a dialog whose radio inline-reveals the chosen type's own field; Apply commits the result

Clicking the section's "Add" action MUST open a dialog offering an "Item type" choice between
"Map coordinates" and "Geographic level" — matching legacy's own "Add new item" item-type choice,
with no Title field (CA's data model has no per-item title). Selecting one of the two options
MUST reveal, inline below the radio, that type's own field and trigger button ("Open map" for Map
coordinates, "Select" for Geographic level) — the two tools are never both reachable from this
dialog, and selecting the other option switches which field is shown, not adds to it. The dialog's
primary action is "Apply", which commits whatever was staged during this session into the row
table and closes the dialog; dismissing the dialog (Escape, outside-click, close icon) before
Apply discards anything staged in this session without touching the row table.

#### Scenario: Clicking Add opens legacy's "Add new item" dialog with Map coordinates pre-selected

- **WHEN** the user clicks the section's "Add" action
- **THEN** a dialog titled "Add new item" opens offering "Map coordinates" and "Geographic level"
  as the item-type choice, with no Title field anywhere in the dialog
- **AND** "Map coordinates" is already selected, so its field and "Open map" trigger show, as in
  legacy
- **AND** neither the map nor the division-list dialog is open yet

#### Scenario: The Add dialog keeps legacy's fixed width and layout across screen sizes

- **WHEN** the Add dialog is open
- **THEN** its width is fixed relative to the viewport (legacy's `min(92vw, 72rem)`, narrowing
  on smaller screens), not sized to its content, and does not change as options are switched or
  a value is staged
- **AND** each field sits in its own bordered card, the staged value shows in a read-only input
  joined to its trigger button, and Apply/Cancel sit right-aligned below a divider
- **AND** on a narrow screen the two item-type options stack and nothing overflows horizontally

#### Scenario: Staged divisions show in the read-only field by breadcrumb path

- **WHEN** the user has selected one or more divisions in this Add session
- **THEN** the geographic-level field's read-only input lists their breadcrumb paths, comma
  separated

#### Scenario: Selecting Map coordinates reveals an "Open map" trigger, not the division field

- **WHEN** the user selects "Map coordinates" in the Add dialog's item-type radio
- **THEN** the field shown below the radio is the map-coordinates field, with an "Open map"
  trigger button
- **AND** the division-level field/trigger is not shown

#### Scenario: Selecting Geographic level reveals a "Select" trigger, not the map field

- **WHEN** the user selects "Geographic level" in the Add dialog's item-type radio
- **THEN** the field shown below the radio is the geographic-level field, with a "Select" trigger
  button
- **AND** the map-coordinates field/trigger is not shown

#### Scenario: Opening the map tool, saving a shape, and returning to the Add dialog shows its summary inline

- **WHEN** the user activates "Open map", draws and saves a shape, and the map tool closes
- **THEN** the Add dialog's map-coordinates field now shows that shape's `"Shape: <TYPE>"` +
  corner Lat/Lng summary
- **AND** the Add dialog's "Apply" action is now enabled

#### Scenario: Apply is disabled until a shape has been saved in this Add session

- **WHEN** the user has selected "Map coordinates" but has not yet saved a shape in this Add
  session
- **THEN** the Add dialog's "Apply" action is disabled

#### Scenario: Activating Select, choosing divisions, and applying adds one row per selected division

- **WHEN** the user activates "Select", selects one or more divisions in the division-list
  dialog, closes it, and activates the Add dialog's "Apply"
- **THEN** the row table gains one new row per division selected in that session
- **AND** the Add dialog closes

#### Scenario: Dismissing the Add dialog before Apply commits nothing

- **WHEN** the user dismisses the Add dialog (via Escape, outside-click, or its close icon) before
  activating "Apply", having drawn a shape or selected a division during this session
- **THEN** the row table is unchanged — nothing from this session is added to `geometries` or
  `divisionIds`

### Requirement: A geometry row's Edit action reopens the map tool directly, pre-loaded with that one shape

Clicking a geometry row's "Edit" action MUST open the map tool directly, with no Add-dialog
item-type step, pre-loaded with only that row's single geometry. "Save Coordinates" in this
session MUST replace that row's geometry in place; closing the Mapper without it (close icon or
Escape) MUST leave that row unchanged.

#### Scenario: Editing a geometry row opens the map tool directly, without the Add dialog's radio

- **WHEN** the user clicks a geometry row's "Edit" action
- **THEN** the map tool opens directly, pre-loaded with that row's geometry
- **AND** no item-type radio or Add-dialog chrome is shown

#### Scenario: Saving during Edit replaces that row's geometry; cancelling leaves it unchanged

- **WHEN** the user edits a geometry row's shape in the map tool and saves
- **THEN** that row's geometry is replaced with the newly drawn/edited shape, in the same row
  position
- **AND** no new row is added and no other row is affected

### Requirement: A division row's Edit action opens legacy's "Edit item" dialog, committed only by Apply

Clicking a division row's "Edit" action MUST open the Add dialog titled "Edit item", pre-filled
with "Geographic level" and only that row's division (legacy's own Edit behaviour). Its "Apply"
MUST replace that row in place with the selected divisions (additional picks inserted immediately
after it, ones already present in other rows dropped); switching to "Map coordinates" and applying
MUST turn that row into a geometry row. "Cancel", Escape, outside-click, and the close icon MUST
leave the row unchanged. Nothing is committed by closing any dialog.

#### Scenario: Editing a division row and applying a different division replaces it in place

- **WHEN** the user clicks a division row's "Edit" action, picks a different division in the tree,
  applies the tree, and applies the "Edit item" dialog
- **THEN** that row now shows the newly picked division, in the same row position
- **AND** no other row is affected

#### Scenario: Cancelling a division row's Edit leaves the row unchanged

- **WHEN** the user clicks a division row's "Edit" action and then cancels or dismisses the dialog
- **THEN** that row is unchanged

### Requirement: The division tree dialog matches legacy's "Select geographic level" picker, with checkbox multi-select and Apply/Discard

The division tree MUST open in a fixed-width dialog (legacy's `min(92vw, 64rem)`, narrowing on
small screens) titled "Select geographic level", with "Expand All", "Collapse All", and a search
box above a "Geographic levels" tree. Levels MUST start collapsed and expand/collapse per node.
Each division MUST be selectable by checkbox, several at once; selections MUST be listed below the
tree as removable path chips that wrap within the fixed width (the dialog never widens). The tree
area MUST have a fixed height and be the only part that scrolls when levels are expanded — the
toolbar, selections, and footer stay visible, and the dialog never exceeds the screen height.
"Apply" MUST commit the checked divisions back to the Add/Edit dialog; "Discard", Escape,
outside-click, and the close icon MUST discard this session's changes — except Escape inside a
non-empty search box, which MUST only clear the search.

#### Scenario: Search narrows the tree to matches and their ancestors

- **WHEN** the user types into the tree dialog's search box
- **THEN** only divisions whose names match (case-insensitively), plus their ancestors, remain,
  expanded so the matches are visible
- **AND** a "No results found" message shows when nothing matches
- **AND** divisions checked before searching stay selected

#### Scenario: Escape in a non-empty search box clears it instead of discarding

- **WHEN** the search box has text and the user presses Escape in it
- **THEN** the search is cleared and the tree dialog stays open with its checked divisions
- **WHEN** the user presses Escape again with the search box empty
- **THEN** the tree dialog is discarded as usual

#### Scenario: Unknown divisions are labelled the same everywhere in the picker

- **WHEN** a division id is not in the tenant's division tree (or the tree failed to load)
- **THEN** its picker row, the Add/Edit dialog's read-only field and its tree-dialog chip all show
  "Unknown division (id)" — never a bare id
- **AND** once the tree has loaded in this page, later dialogs show breadcrumb paths from their
  first frame, without a loading or unknown-label flash

#### Scenario: Expand All and Collapse All are disabled when they have nothing to do

- **WHEN** every level is expanded (or none is)
- **THEN** "Expand All" (respectively "Collapse All") is disabled

#### Scenario: Discard keeps the Add/Edit dialog's previous selection

- **WHEN** the user changes the checked divisions and then discards the tree dialog
- **THEN** the Add/Edit dialog's geographic-level field still shows the divisions it had before

### Requirement: A row's Delete action removes it directly, without any map interaction

Clicking either a geometry row's or a division row's "Delete" action MUST remove that row's
underlying `geometries`/`divisionIds` entry directly from the picker's state. This MUST NOT open
the map tool and MUST NOT depend on `leaflet-draw`'s own delete-selection mechanism in any way —
it is a direct state update, independent of whichever UI path originally added that row.

#### Scenario: Deleting a geometry row removes it without opening the map

- **WHEN** the user clicks a geometry row's "Delete" action
- **THEN** that geometry is removed from `geometries`
- **AND** the map tool is never opened as part of this action

#### Scenario: Deleting a division row removes it without opening the division dialog

- **WHEN** the user clicks a division row's "Delete" action
- **THEN** that division's id is removed from `divisionIds`
- **AND** the division-list dialog is never opened as part of this action

### Requirement: Preview map shows a combined, read-only view of all current rows

The section's "Preview map" action, when enabled, MUST open a full-screen read-only map titled
"Map preview" (legacy's own title; same full-screen panel as the Mapper) showing both every currently-set geometry and the boundary of every
currently-selected division, combined into one view — not geometries alone. This action MUST stay
disabled whenever the table holds zero rows.

#### Scenario: Preview map shows both drawn shapes and selected-division boundaries together

- **WHEN** the picker holds at least one geometry and at least one selected division, and the user
  activates "Preview map"
- **THEN** the opened read-only map renders every geometry and every selected division's boundary
  together

#### Scenario: Preview map remains disabled with zero rows

- **WHEN** the picker holds no geometries and no selected divisions
- **THEN** the "Preview map" action is disabled and cannot be activated

### Requirement: Drawing a shape adds it to the observation's geometries

`HazardousEventSpatialFootprintPicker` SHALL let the user draw a point, line, polygon, rectangle,
or circle on an interactive map, and MUST append the drawn shape's bare GeoJSON Geometry (not a
Feature) to its in-progress `geometries` array.

#### Scenario: Drawing a polygon appends it to geometries

- **WHEN** the user draws a polygon on the picker's map
- **THEN** the picker's `geometries` array gains one GeoJSON `Polygon` geometry
- **AND** no `Feature` wrapper or per-shape title is attached

#### Scenario: Removing a drawn shape removes it from geometries

- **WHEN** the user removes a previously drawn shape with the Mapper's "Undo" (no draw in
  progress) or "Clear"
- **THEN** that shape's geometry is removed from the picker's `geometries` array

#### Scenario: Removing a reloaded (prefilled) shape removes it from geometries, the same as a freshly-drawn one

- **WHEN** the map mounts with a non-empty `geometries` prop (e.g. the picker's Edit action
  reopening a single prefilled shape) and the user removes that shape with "Undo" or "Clear",
  then saves
- **THEN** that shape's geometry is removed from the picker's `geometries` array, identically to
  removing a shape drawn fresh in the current session
- **AND** this holds regardless of how the shape was originally added to the map (prefilled on
  mount vs. drawn live)

### Requirement: The map tool is legacy's full-screen "Mapper", driven by a drawing-mode dropdown

The map tool MUST open full-screen, titled "Mapper", with a close icon and no footer. Above the
map, one toolbar row MUST hold, in legacy's order: a location search field (Enter searches), a
drawing-mode dropdown ("Move map", "Polygon", "Line", "Rectangle", "Circle", "Marker", plus
"Edit shape"), "Clear", "Undo", and "Save Coordinates". Choosing a drawing mode MUST start
that tool; when a draw finishes or is cancelled the dropdown MUST return to "Move map". There is
no Cancel button — the close icon and Escape (with no draw active) discard the session. The map
MUST fill the remaining height, and on narrow screens the search and dropdown MUST go full-width
with the buttons sharing a row.

#### Scenario: One shape per item — drawing another asks before replacing it

- **WHEN** a shape already exists in this Mapper session and the user chooses a drawing mode
- **THEN** a confirmation (this app's own dialog, never a browser pop-up) asks before replacing it
- **AND** keeping the current shape leaves it untouched and the dropdown on "Move map"
- **AND** proceeding starts the chosen tool, with the current shape still in place

#### Scenario: A replacing shape removes the old one only once it is committed

- **WHEN** the user has proceeded to replace the current shape and finishes a new shape that
  passes the degenerate and outside-division checks (or is confirmed with "Add anyway")
- **THEN** the new shape replaces the old one, and Save Coordinates saves only the new shape
- **WHEN** the replacing draw instead ends without a committed shape — Escape, Undo during a
  rectangle/circle/marker draw, a mode change, Save Coordinates with the shape unfinished, a
  degenerate result, or "Discard shape"
- **THEN** the original shape remains, and Save Coordinates saves it

#### Scenario: An edited shape is checked like a new one

- **WHEN** the user edits a shape with "Edit shape" so that it becomes degenerate
- **THEN** the shape returns to its pre-edit geometry, on the map and in what is saved, and the
  degenerate-shape message is shown
- **WHEN** the edit moves the shape outside every selected division
- **THEN** the outside-division confirmation is shown; "Add anyway" keeps the edit and
  "Discard shape" returns the shape to its pre-edit geometry
- **AND** if the edit was committed by Save Coordinates and needed either outcome, the Mapper
  stays open so the user sees it; pressing Save Coordinates again saves

#### Scenario: Undo removes the last point mid-draw, otherwise the shape; Clear removes everything

- **WHEN** the user presses "Undo" while drawing a polygon or line
- **THEN** only the last placed point is removed and drawing continues (with no point to remove,
  Undo does nothing — leaflet-draw keeps the first point; Escape cancels)
- **WHEN** the user presses "Undo" while drawing a rectangle, circle or marker
- **THEN** that draw is cancelled and the existing shape, if any, stays
- **WHEN** the user presses "Undo" with no draw in progress, or presses "Clear"
- **THEN** the shape is removed

#### Scenario: Edit shape moves an existing shape's points, and Save Coordinates keeps the moved points

- **WHEN** a shape exists and the user chooses "Edit shape", drags a point, and presses
  "Save Coordinates"
- **THEN** the saved geometry reflects the moved point (a circle is saved as its polygon
  conversion)
- **AND** "Edit shape" is unavailable whenever no shape exists

### Requirement: Pressing Escape while actively drawing cancels the draw, not the dialog

While a draw tool is active (between leaflet-draw's own draw-start and draw-end), pressing Escape
— wherever focus is in the Mapper, including its toolbar — MUST cancel only the in-progress draw
action, leaving the map dialog open and leaving the
session's existing shape untouched. Escape MUST continue to close the map dialog
normally whenever no draw is currently active.

#### Scenario: Escape mid-draw cancels the draw without closing the dialog or discarding the shape

- **WHEN** the session already has a shape, the user proceeds to replace it, starts drawing the
  new shape, and presses Escape before completing it
- **THEN** the in-progress draw is cancelled
- **AND** the map dialog remains open
- **AND** the existing shape remains, unaffected, and is what Save Coordinates saves

#### Scenario: Escape with no active draw closes the dialog normally

- **WHEN** no draw tool is currently active and the user presses Escape
- **THEN** the map dialog closes, the same as before this fix

### Requirement: Selecting a division adds its id and shows a non-persisted preview of its boundary

`HazardousEventSpatialFootprintPicker` SHALL let the user select one or more divisions from a
tenant-scoped division list, and MUST append each selected division's id to `divisionIds`. The
picker MUST also fetch and display that division's boundary on the map as a preview, but MUST NOT
append that boundary geometry to `geometries` — `divisionIds` and `geometries` stay independent,
matching `hazardous_event_spatial_observation_division`'s own schema (a pure id-membership join,
no geometry column).

#### Scenario: Selecting a division adds its id and a map preview, not a geometries entry

- **WHEN** the user selects a division from the picker's division list
- **THEN** the picker's `divisionIds` array gains that division's id
- **AND** the map shows that division's fetched boundary as a preview overlay
- **AND** the picker's `geometries` array is unchanged

#### Scenario: Deselecting a division removes its id and its preview, nothing else

- **WHEN** the user deselects a previously selected division
- **THEN** that division's id is removed from `divisionIds`
- **AND** its preview overlay is removed from the map
- **AND** the picker's `geometries` array is unchanged (it was never added there)

#### Scenario: Re-selecting an already-selected division does not duplicate it

- **WHEN** the user selects a division that is already present in the picker's `divisionIds`
- **THEN** `divisionIds` still contains exactly one entry for that division's id

#### Scenario: A division deselected before its boundary fetch resolves does not get its preview added

- **WHEN** the user selects a division and then deselects it again before the triggered
  `GET /api/geojson/:id` fetch has resolved
- **THEN** once that fetch does resolve, its result is discarded, not added to the map
- **AND** that division's id is not present in `divisionIds`

#### Scenario: Rapidly selecting the same division twice produces one preview overlay

- **WHEN** the user selects the same division twice in quick succession, before the first
  triggered boundary fetch resolves
- **THEN** exactly one `GET /api/geojson/:id` request is made for that division (or, if two are
  made, exactly one overlay layer results — no duplicate overlay)

#### Scenario: Opening the division list twice before the first tree fetch resolves shares one request

- **WHEN** the user opens the division-list dialog twice in quick succession, before the first
  `GET /api/division/tree` request has resolved
- **THEN** exactly one request is made to `/api/division/tree`, and both dialog-open attempts
  render from its single resolved result

### Requirement: The division-boundary preview fetch only returns the requester's own tenant's division

`GET /api/geojson/:id`, used by the picker's division-boundary preview fetch (and by legacy's own
Geographic-level flow), SHALL scope its division lookup to the requesting session's own
`countryAccountsId`, matching the same tenant-scoping pattern `/api/division/tree` and
`/api/division/list` already use for this table. A division id belonging to a different tenant
SHALL return 404, not that other tenant's boundary.

#### Scenario: A division id from another tenant returns 404, not that tenant's boundary

- **WHEN** the picker's preview fetch requests `GET /api/geojson/:id` for a division id that
  exists but belongs to a different tenant than the current session's `countryAccountsId`
- **THEN** the response is 404
- **AND** no geometry belonging to another tenant is returned

#### Scenario: A division id belonging to the requester's own tenant still resolves normally

- **WHEN** the picker's preview fetch requests `GET /api/geojson/:id` for a division id belonging
  to the current session's own tenant
- **THEN** the response includes that division's `geojson` boundary, unchanged from today's
  behavior for a legitimate, same-tenant lookup

#### Scenario: A prefilled division id no longer present in the live tree list is still shown and removable

- **WHEN** the edit form prefills a `divisionId` that no longer appears in a fresh
  `/api/division/tree` fetch (the division was deleted or moved after the observation was
  recorded)
- **THEN** that id is still shown as selected in the division list (e.g. labelled as unknown/
  unavailable) and can still be deselected
- **AND** if its preview boundary fetch (`GET /api/geojson/:id`) returns a 404, the picker does
  not crash — it omits that preview overlay and leaves the id selectable for removal

### Requirement: The hidden `spatialObservation` field starts empty and only becomes JSON after a real interaction

The picker MUST render the hidden `spatialObservation` input as the literal empty string (`""`)
until the user's first draw or division selection, in both create and edit modes with no prior
observation. This is required, not optional styling: `new.tsx`'s action includes
`spatialObservation` in its use-case call whenever the parsed value is not `undefined`, with no
`spatialObservationChanged` gate (that flag only gates the edit action) — and
`parseSpatialObservation("")` is the only input that parses to `undefined`. Rendering any JSON
(even `{"geometries":[],"divisionIds":[]}`) from mount would cause every create submission to
write a spurious empty spatial-observation row, even when the user never touched the picker.

Once the user has drawn at least one shape or selected at least one division, the picker MUST
keep the hidden `spatialObservation` input synchronized with its own current
`{ geometries, divisionIds }` state as valid JSON, and MUST set the hidden
`spatialObservationChanged` input to `"1"` — **except** when the user subsequently removes every
shape and deselects every division, returning `geometries` and `divisionIds` both to empty. In
that case the picker MUST revert the hidden `spatialObservation` input back to `""` and the hidden
`spatialObservationChanged` input back to `"0"`, the same untouched values as before any
interaction (resolved: Decision 1 Addendum), rather than submitting an explicit empty-array JSON
observation.

#### Scenario: An untouched picker leaves the hidden fields at their "nothing submitted" values

- **WHEN** the form renders with no prior observation (create, or edit of an event with a `null`
  `currentSpatialObservation`) and the user has not yet drawn a shape or selected a division
- **THEN** the hidden `spatialObservation` input's value is `""`
- **AND** the hidden `spatialObservationChanged` input's value is `"0"`

#### Scenario: A draw or division selection marks the observation changed

- **WHEN** the user draws at least one shape or selects at least one division
- **THEN** the hidden `spatialObservationChanged` input's value is `"1"`
- **AND** the hidden `spatialObservation` input's value is valid JSON matching the picker's
  current `geometries`/`divisionIds` state

#### Scenario: Clearing every shape and division after an interaction reverts the hidden fields to their untouched values

- **WHEN** the user, having previously drawn at least one shape or selected at least one
  division, removes every shape and deselects every division, returning to zero geometries and
  zero divisionIds
- **THEN** the hidden `spatialObservation` input's value reverts to `""`
- **AND** the hidden `spatialObservationChanged` input's value reverts to `"0"`
- **AND** no explicit empty-array JSON (`{"geometries":[],"divisionIds":[]}`) is ever submitted
  for this case (resolved: Decision 1 Addendum)

#### Scenario: A create submitted without any picker interaction writes no observation row

- **WHEN** a new Hazardous Event is submitted via `new.tsx`'s action with the picker never
  interacted with
- **THEN** `parseHazardousEventFormData`'s `spatialObservation` is `undefined`
- **AND** `CreateHazardousEventUseCase.execute` is called without a `spatialObservation` field
- **AND** no `hazardous_event_spatial_observation` row is created for the new event

#### Scenario: A form session with no draw or division interaction leaves the fields untouched

- **WHEN** the user submits the form without ever drawing a shape or selecting a division
- **THEN** the hidden `spatialObservationChanged` input's value is `"0"`

### Requirement: Edit mode prefills from the event's current observation

When rendered in edit mode with a non-null `currentSpatialObservation`, the picker MUST initialize
its map and division-list selection state from that observation's `geometries` and `divisionIds`,
and MUST start with `spatialObservationChanged` set to `"0"` until the user makes a change.

#### Scenario: An event with an existing observation prefills the picker

- **WHEN** the edit form renders for an event whose `currentSpatialObservation` is non-null
- **THEN** the picker's map displays every geometry from that observation
- **AND** the picker's division list shows every division from that observation's `divisionIds`
  as selected
- **AND** the hidden `spatialObservationChanged` input's initial value is `"0"`

#### Scenario: An event with no recorded observation starts empty

- **WHEN** the edit form renders for an event whose `currentSpatialObservation` is `null`
- **THEN** the picker starts with an empty map and no division selected, identical to the create
  form's initial state

### Requirement: Clearing an existing observation in edit mode does not remove it server-side

In edit mode, the picker SHALL NOT delete a previously-recorded observation on the server merely
because the user cleared it back to zero shapes/divisions in the UI — resolved, known, and
accepted (design.md Decision 1 Addendum). Reverting the hidden fields to their untouched
`""`/`"0"` values (per the clear-everything requirement above) means `parseSpatialObservation`
parses `spatialObservation` as `undefined`, and `edit.$id.tsx`'s action only calls
`UpdateHazardousEventUseCase` with a `spatialObservation` field when both
`parsed.spatialObservation !== undefined` and `parsed.spatialObservationChanged` are true —
neither holds after a full clear. There is no UI path in this picker that records an explicit
"no footprint" over a previously-recorded one; that still requires the REST API (`6f`).

#### Scenario: Clearing an existing observation and submitting leaves the server's record unchanged

- **GIVEN** an event being edited whose `currentSpatialObservation` is non-null
- **WHEN** the user removes every prefilled shape and deselects every prefilled division, then
  submits the form
- **THEN** the hidden `spatialObservation` input's value is `""` and `spatialObservationChanged`
  is `"0"` at submit time
- **AND** `UpdateHazardousEventUseCase.execute` is called without a `spatialObservation` field
- **AND** the event's previously recorded spatial observation remains the current one on the
  server, unchanged

### Requirement: A divisionIds validation error surfaces inline on the picker field

When the create/edit action's use-case call rejects the submitted `spatialObservation` with a
`ValidationError` naming `divisionIds` (duplicate entry) or the singular `divisionId` (an id no
longer present in the tenant's valid set), the form MUST re-render with that error displayed under
the spatial-footprint field, not escape to the generic error boundary. See
`hazardous-event-write-route-adapter`'s own delta for the field-error mapping this relies on.

#### Scenario: A stale or foreign division id returns an inline field error, not a 500

- **WHEN** a division the picker selected from a live `/api/division/tree` fetch is no longer in
  the tenant's valid set by the time the form is submitted (deleted, or reassigned to another
  tenant, between page load and submit)
- **THEN** the form re-renders with a field error shown under the spatial-footprint field
- **AND** no unhandled error reaches the generic error boundary

#### Scenario: Submitting another tenant's division id is rejected the same way

- **WHEN** a `divisionId` belonging to a different tenant is submitted (bypassing the picker's own
  client-side list, e.g. a tampered hidden field)
- **THEN** `RecordSpatialObservationUseCase.execute` rejects it via
  `IDivisionRepository.findValidDivisionIds`'s tenant-scoped lookup, the same as any other
  cross-tenant division reference
- **AND** the form re-renders with a field error shown under the spatial-footprint field, not a
  500

### Requirement: A degenerate drawn shape is rejected before it enters picker state

The picker MUST reject a degenerate shape (e.g. a polygon with fewer than 3 distinct points, or a
zero-length line) at the moment drawing completes, before appending it to `geometries`. This is a
client-side guard, not a server-side one: a PostGIS-level geometry insert failure surfaces as a
raw, unmapped database error, not a `ValidationError`, so it cannot be caught by the field-error
mapping this picker otherwise relies on (`hazardous-event-write-route-adapter`'s delta).

#### Scenario: Completing a degenerate polygon does not add it to geometries

- **WHEN** the user's draw interaction completes with fewer than 3 distinct points for a polygon
- **THEN** no entry is appended to the picker's `geometries` array
- **AND** the picker shows a message indicating the shape was not added

### Requirement: A free-text location search orients the map, with no effect on the saved observation

`HazardousEventSpatialFootprintPicker`'s map SHALL provide a free-text location search
(Nominatim), matching legacy's own affordance (`checkShapeAgainstDivisions`'s sibling feature in
`app/components/ContentRepeater/controls/mapper/index.tsx`, kept per design.md Decision 11, not
dropped). A search SHALL only recenter/fit the map view to the result; it MUST NOT alter
`geometries`, `divisionIds`, or any hidden field value. As in legacy's Mapper, the search field
has no separate button: pressing Enter in it MUST run the search.

#### Scenario: Pressing Enter in the search input runs the search

- **WHEN** the user types a location into the Mapper's search field and presses Enter
- **THEN** the search request runs and the map recenters on the result

#### Scenario: A successful location search recenters the map only

- **WHEN** the user submits a free-text location search that resolves to a result
- **THEN** the map view recenters/fits to that result's location
- **AND** the picker's `geometries` and `divisionIds` arrays are unchanged

#### Scenario: An empty search query is rejected before any network call

- **WHEN** the user submits the location search with an empty query
- **THEN** no request is made to the Nominatim endpoint
- **AND** the picker shows a message prompting the user to enter a location

#### Scenario: A search with no results leaves the map unchanged

- **WHEN** the user submits a free-text location search that returns zero results
- **THEN** the map view is unchanged
- **AND** the picker shows a message indicating no location was found

### Requirement: A drawn shape outside the picker's selected divisions warns before being added

`HazardousEventSpatialFootprintPicker` SHALL check a newly completed shape against the boundaries
of whichever divisions are currently selected in the picker's own `divisionIds` (via
`checkShapeAgainstDivisions`, already imported per Decision 4), when at least one division is
selected. If the shape falls outside every selected division's boundary, the picker MUST show a
`react-aria-components`-based confirmation affordance — not a native `confirm()` — presenting
`checkShapeAgainstDivisions`'s own warning text, before the shape is added to `geometries`.
Confirming adds the shape to `geometries` despite the warning; cancelling discards it — matching
legacy's own confirm-or-discard gate (design.md Decision 11), kept rather than left unwired.

#### Scenario: No division selected skips the check entirely

- **WHEN** the user completes a drawn shape and no division is currently selected in
  `divisionIds`
- **THEN** the shape is added to `geometries` with no outside-division warning shown

#### Scenario: A shape outside every selected division's boundary prompts for confirmation

- **WHEN** the user completes a drawn shape, at least one division is selected, and the shape
  falls outside every selected division's boundary
- **THEN** the picker shows a confirmation affordance carrying `checkShapeAgainstDivisions`'s
  warning text before the shape is added

#### Scenario: Confirming the warning adds the shape anyway

- **WHEN** the user confirms the outside-division warning
- **THEN** the shape is appended to `geometries`, the same as if no warning had been shown

#### Scenario: Cancelling the warning discards the shape

- **WHEN** the user cancels/dismisses the outside-division warning
- **THEN** the shape is not appended to `geometries`

#### Scenario: A shape inside at least one selected division's boundary skips the warning

- **WHEN** the user completes a drawn shape that falls inside at least one currently selected
  division's boundary
- **THEN** the shape is added to `geometries` with no warning shown

### Requirement: Leaflet/leaflet-draw CDN load failure degrades without crashing the form

If the picker's underlying map library fails to load, the picker MUST render a non-blocking
unavailable state instead of throwing, and MUST NOT alter any already-set hidden-field value.

#### Scenario: The map script fails to load

- **WHEN** `ensureLeafletLoaded()` (or the picker's `leaflet-draw` load) resolves to `null`
- **THEN** the picker renders a message indicating the map is unavailable
- **AND** the hidden `spatialObservation`/`spatialObservationChanged` inputs keep whatever value
  they held before the failed load (unchanged on a fresh create form: still `""`/`"0"`)

#### Scenario: `leaflet-draw` only loads after base Leaflet has resolved

- **WHEN** the picker's map mounts and triggers both the base-Leaflet load and the `leaflet-draw`
  load
- **THEN** the `leaflet-draw` `<script>` is injected only after base Leaflet's own load has
  resolved (matching legacy's own load order, which depends on `window.L` already existing)
- **AND** `leaflet-draw` is never injected first or concurrently with base Leaflet

### Requirement: Concurrent map-library loads are served from one shared, cached load

`ensureLeafletLoaded()`'s module-level promise cache MUST serve every concurrent caller the same
in-flight load rather than injecting a duplicate `<script>`/`<link>` tag per caller, extended to
cover the picker's additional `leaflet-draw` load the same way.

#### Scenario: Two concurrent callers before the first load resolves

- **WHEN** two call sites invoke the map library loader at effectively the same time, before
  either's underlying `<script>` has finished loading
- **THEN** exactly one `<script>` tag (and one `<link>` tag) is injected into the document for
  each resource
- **AND** both callers' promises resolve to the same loaded namespace once the single load
  completes
