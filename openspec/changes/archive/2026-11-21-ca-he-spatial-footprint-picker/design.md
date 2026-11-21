## Context

See proposal.md for motivation. This section captures the ground truth the picker must be built
against and the constraints that decide its shape.

**Wire contract (already shipped, unchanged by this intent).**
`parseHazardousEventFormData.server.ts`'s `parseSpatialObservation()` reads a hidden
`spatialObservation` field as JSON `{ geometries: unknown[], divisionIds: string[] }` (silently
dropping anything else, including `observationTime`/`note`/`confirmReplace` if present — those
three are never read from the form today) and a hidden `spatialObservationChanged` field
(`"1"`/`"0"`). `new.tsx`'s action includes `spatialObservation` whenever
`parsed.spatialObservation !== undefined`; `edit.$id.tsx`'s action additionally requires
`parsed.spatialObservationChanged` to be true. The picker's only job is to keep these two hidden
fields in sync with its own selection state — it does not need, and must not invent, any other
wire shape.

**Domain contract.** `SpatialObservation.create()` (`domain/SpatialObservation.ts`) accepts
`geometries: readonly unknown[]` (bare GeoJSON Geometry objects, not Features — confirmed by
`HazardousEventLocationMap.tsx`'s own comment referencing `ST_AsGeoJSON`) and
`divisionIds: readonly string[]` **together**, not as a mutually exclusive choice. Empty arrays
for both are valid (a "no observation yet" reading is representable, though in practice the UI
only ever calls the use case when the user has picked something). A duplicate `divisionIds` entry
throws; a `divisionId` absent from the tenant-scoped `validDivisionIds` set throws.

**Reference source for Gate 9 (type (a): a real, existing page of the same page-type, read as
code).** Legacy's actual Hazardous Event form —
`app/frontend/events/hazardeventform.tsx` (line 644) — renders `SpatialFootprintFormView`
(`app/frontend/spatialFootprintFormView.tsx`), **not** `SpatialFootprintFormView2`. This is the
correct Gate 9 target, confirmed by reading `hazardeventform.tsx` directly rather than assumed
from the intent brief, which suggested the disaster-event modal as "the closest real precedent."
The disaster-event modal (`edit.$id.spatial-footprint-modal.tsx`, using `SpatialFootprintFormView2`)
is a different domain's own narrower widget (map-coordinates-only, no geographic-level mode), not
the parity target, and its own _route structure_ is rejected as a pattern for this change too: it
is a nested outlet route (`useOutletContext`) under disaster-event's own parent route, which has a
child route to nest under in the first place. HE's create/edit form (`new.tsx`/`edit.$id.tsx`) has
no child route today, so adopting the same modal-as-nested-route structure here would mean adding
one — a route restructuring with no benefit over an in-page modal rendered directly by
`HazardousEventFormPage` (React state, no navigation), which is what this change does instead.

### Ground-truth checklist (legacy `SpatialFootprintFormView` via `hazardeventform.tsx`)

- Field wrapper: a `Field` with an **empty label** (`label=""`) — the section's own caption
  ("Spatial footprint") comes from the widget's internal `ContentRepeater` caption, not the form
  field label, matching this form's existing "no visible field label" pattern for widget-owned
  sections (`attachments` uses the same `label=""` convention today).
- Two selection modes per entry, chosen via an "Item type" select: **Map coordinates** (opens a
  native `<dialog>`-based Leaflet map with draw tools: polygon/polyline/rectangle/circle/marker,
  colored by shape type, a Nominatim free-text location search, drag enable/disable, reset) and
  **Geographic level** (a read-only text field + "Select" button opening a division-tree dialog).
- The Geographic-level dialog: header "Select geographic level," built on a tree of the tenant's
  divisions (root caption "Geographic levels"), single-apply (not a live per-node select button),
  with an explicit Apply/footer action. On apply: fetches the selected division's boundary via
  `GET /api/geojson/:id`, winds it with `rewindGeoJSON`, and stores
  `{ division_id, division_ids, import_id, level, name, national_id }` as feature metadata
  alongside the fetched geometry.
- Each entry carries a required free-text **Title** and is listed in a table (Title 40% / Option
  40% / Action 20%) with add/edit/delete actions — legacy supports **multiple titled footprint
  entries** per record, each independently either Map-coordinates or Geographic-level.

**Named, deliberate parity deviation (not an oversight):** CA's `SpatialObservation` has no
per-entry title and no itemized list — it is one flat `geometries[]` + one flat `divisionIds[]`
per observation. The titled-multi-entry list structure above does **not** carry over; the picker
lets the user add multiple shapes and/or multiple divisions to one observation, but none of them
have a title and there is no "which type is this row" distinction once saved. This mirrors
`ca-he-detail-page-rebuild`'s own established Gate 9 bar for this phase: "content and structure
parity, not literal component-library parity." Both underlying selection mechanisms (draw, and
division-tree pick) are preserved; the per-item bookkeeping chrome is not.

**Per-affordance kept/dropped decision, each named explicitly rather than left for Gate 9 to
discover (per this intent's own `design.md` quality bar). All items below are now resolved with
the human (Nominatim and the outside-division warning both as **kept**, Decision 11) rather than
silently assumed either way:**

- Polygon / marker / rectangle / circle draw — **kept**, all four, via `leaflet-draw` (Decision 3).
- Polyline draw — **kept**, `SpatialObservation.geometries` has no shape-type restriction.
- Nominatim free-text location search — **kept** (confirmed with the human, resolving this
  design's earlier "proposed dropped" framing): it only orients the map view, has no effect on the
  saved shape, and adds an unauthenticated third-party network call, but is being ported as-is.
  See Decision 11.
- Color-by-shape-type (`glbColors`) — **dropped**: this picker has no "type" per shape (every
  drawn shape is just a `geometries` entry); a single consistent draw color is used instead.
- Drag-enable/disable while drawing, reset-drawing control — **kept**, `leaflet-draw`'s own
  handler API provides both natively.
- Outside-division warning (`checkShapeAgainstDivisions`, imported per Decision 4 for its geometry
  math) — **kept**, confirmed with the human: ported as a real, wired UI warning, not left unwired.
  See Decision 11.
- Inline native `<dialog>` map surface — **kept conceptually** (a modal map surface), rebuilt with
  `react-aria-components` chrome around a Leaflet canvas (Decision 2), not a literal `<dialog>`
  element port.
- Division **tree** (parent/child hierarchy) vs. a flat list — **resolved: tree**, see Blocking
  Decisions below.

### Revision (2026-11-19): live Chrome review findings, confirmed against the shipped code, not assumed

A live Chrome review of the implemented picker (against legacy's actual form,
`hazardeventform.tsx`, the same Gate 9 target as Context above) surfaced four real UX problems,
each confirmed by reading the exact current source, not inferred from this design's own earlier
intent:

1. **No section chrome.** `HazardousEventSpatialFootprintPicker.tsx` renders a bare `<p>` caption
   followed by the map and the "Select divisions" button, unconditionally, always visible —
   confirmed by reading the component directly (no wrapping card, no header styling, no
   collapsed/summary state). The sibling `attachments` field on this exact same form
   (`HazardousEventFormPage.tsx` line ~239, `AttachmentsFormView` → `ContentRepeater`) renders
   inside a grey-background card (`.content-repeater`, `background: #f2f2f2; border: 1px solid
#e3e3e3`, confirmed in `content-repeater.css`) with a medium-weight caption
   (`.content-repeater-caption`, `font-size: 1.29rem; font-weight: 500`) and a single add action.
   Legacy's own `SpatialFootprintFormView` used the same `ContentRepeater` chrome for its
   "Spatial footprint" section too (Context above) — the new picker dropped that chrome entirely
   when it dropped `ContentRepeater`'s per-item list structure (Decision 1), rather than replacing
   it with an equivalent wrapper.
2. **No entry step.** Legacy's own flow always asks "Map coordinates" or "Geographic level" first
   (the `map_option`/"Item type" radio field in `ContentRepeater`'s own "Add new item" dialog,
   confirmed in `spatialFootprintFormView.tsx` lines 177-231), then opens the corresponding tool.
   The current picker shows the map and the "Select divisions" button simultaneously, with no
   equivalent choice step.
3. **Unstyled search button.** `HazardousEventSpatialFootprintMap.tsx`'s location-search button
   (line 291, `<button type="button" onClick={handleSearch}>`) carries no CSS class at all —
   confirmed live via computed styles: no background, no border, no padding,
   `cursor: default`. It renders as plain text, not a button, despite the already-built
   design-system `Button` being available and already used elsewhere in this same file (the
   outside-division-warning dialog's footer buttons).
4. **No Enter-key submission.** The same search `<input>` has no `onKeyDown` handler and is not
   inside a `<form>`, so pressing Enter does nothing — confirmed by reading the component's full
   render output (lines 283-294). Legacy's own Mapper modal supports Enter-to-search.

**Agreed fix, confirmed with the human: presentation-layer restructuring only.** The data model —
`SpatialObservation`'s combined `geometries[]`/`divisionIds[]` set, the hidden-field
serialization (Decision 1 Addendum), and every Decision 1-12 requirement above — is unchanged.
This is explicitly **not** a revert to `ContentRepeater`'s literal multi-item-list behavior, which
Decision 1 already rejected for incompatibility with the already-shipped backend contract; it
restyles and re-sequences the same single combined set, nothing more. See Decisions 13-15 below.

### Revision 2 (2026-11-19): live Chrome walkthrough — final, confirmed contract, superseding Decisions 13-14's entry-dialog design

The Revision above (same day, earlier pass) fixed four UX bugs but kept the picker's own data
shape as a single collapsed summary behind one Add/Edit button and a shared entry-choice dialog.
A second, full live Chrome walkthrough against legacy's actual form — every step actually
performed and screenshotted, not assumed — found that this collapsed-summary design itself does
not match legacy at the structural level, not just chrome-deep: legacy renders a real
**table of rows**, one row per recorded item, each independently editable/deletable; there is no
single "Add/Edit the whole thing" button once content exists. This also surfaces an explicit
correction to Decision 14's own original framing ("Clicking Edit... applies identically to Add"):
that framing assumed one combined entry per picker. It does not survive contact with a real
row-table, where each row has its own, independent action set.

**What below supersedes, in place, not left standing alongside the new text:** Decision 13's
`action`-in-header-row placement (Gate 9 finding (a), never fixed last round); Decision 14's entire
entry-dialog/single-Add-Edit-button state machine, replaced by a row table plus a per-session "Add"
dialog that itself nests the map/division tools. Decision 1 (data model), Decision 2 (library
split), Decisions 3-11 (map/draw mechanics, division list, field-error mapping, prefill, Nominatim,
outside-division warning), Decision 12 (the three shared primitives), and Decision 15 (search button
fix) are **unaffected** — this is still presentation-layer restructuring only, now one layer deeper.

### Decision 13 — `Section` renders the row table; its action slot moves below content, not beside the caption

**Revised (Gate 9 finding (a), previously unfixed):** `Section`'s header row holds only the
`title` — confirmed by re-reading `content-repeater.css` directly: `.content-repeater-caption` is
its own block-level element with `margin-bottom: 1.71rem`, and `.content-repeater-actions` (the
Add button's own row) is a **separate**, later sibling block, not inlined next to the caption.
`Section.tsx`'s `action: ReactNode` prop (previously rendered in the header row) is replaced with
`actions: ReactNode`, rendered **after** `children`, in its own row carrying legacy's
`.content-repeater-actions` class. This is a breaking prop-rename on `Section` (its only consumer
so far is this picker — confirmed by grepping for the component, zero other call sites), not an
additive change.

**Confirmed, not assumed, that this is not already fixed by the row-table restructuring alone**
(per this change's own instruction to verify rather than assume): the row-table change moves what
`children` renders (a `Table`, not a collapsed-summary `<p>`), but `action`'s placement inside the
header row is a separate, independent piece of `Section`'s own layout contract — fixing the first
does not touch the second. Both must be changed explicitly; task group 9d does both.

`Section` itself still holds no picker-specific knowledge — `title: string`, `children: ReactNode`
(now always the row table, never a collapsed summary), and `actions: ReactNode` (now the Add/Preview
map button row). Any future sectioned-and-tabular field on this or another CA form can reuse it
unchanged.

**Not a `ContentRepeater` reuse, and not a `Card` reuse either, confirmed deliberately:**
`Card.tsx` (`ca-he-detail-page-rebuild`) is a white-background detail-page primitive with a
different visual target (`rounded-2xl border-gray-200 bg-white`, Gate-9-matched against the
_detail_ page, not this form). Reusing it here would not match Attachments' own grey-card look on
_this_ form. `Section` is a new, separate primitive for exactly this chrome instead.

**Styling: legacy's own classes, not a re-port.** `Section` renders `.content-repeater` /
`.content-repeater-caption` / `.content-repeater-actions` directly and imports
`app/components/ContentRepeater/assets/content-repeater.css` itself (so it never depends on a
sibling `ContentRepeater` being on the page). This also brings legacy's
`.content-repeater .dts-table th { font-size: 1.14rem }` header rule for free. No `all.css` classes
or tokens are added for `Section`. (An earlier revision copied these values into new
`.dts-section*` classes plus a `--color-dts-section-border` token; the copy drifted — e.g. it missed
the header font rule — so it was removed in favour of the originals. See the Gate 9 round-2
addendum.)

**Collapsed-summary content is the picker's own responsibility, not `Section`'s.** `Section`
renders whatever `children` the picker passes; the picker decides what that is (Decision 14).

### Decision 14 — Row table + nested "Add" dialog, mirroring legacy's actual add-flow structure (not a shared entry-choice dialog)

**Superseded in full, not patched:** the single Add/Edit button plus shared entry-choice dialog
(original Decision 14) assumed one combined entry per picker. The live walkthrough confirmed
legacy's own structure is a **table of independently-managed rows** — exactly `ContentRepeater`'s
own Title/Option/Action list (Context above), minus the Title column CA's data model has no field
for. This is a structural correction, not a styling one: the picker's state model gains a derived
**row list**, and the old `step: "closed" | "choosing" | "map" | "divisions"` single-selection
machine is replaced by a model where the map/division tools are reached two different ways
depending on whether the user is adding a new item or editing an existing one.

**Row model.** Each entry in `geometries` and each entry in `divisionIds` is its own row — not one
row per "Add action," not a combined blob (this change's own open row-granularity question,
resolved here and in Decision 16 below):

| Row source                 | Option             | Value                                                                                     | Actions      |
| -------------------------- | ------------------ | ----------------------------------------------------------------------------------------- | ------------ |
| One `geometries[i]` entry  | "Map coordinates"  | `"Shape: <TYPE> — Lat …, Lng …"` (Decision 16), `<TYPE>` the bare GeoJSON `geometry.type` | Delete, Edit |
| One `divisionIds[i]` entry | "Geographic level" | That division's breadcrumb path (`DivisionTreeNode.path`, already fetched — Decision 16)  | Delete, Edit |

Built on the existing `app/design-system/components/Table.tsx`/`TableColumn.tsx`/`TableRow.tsx`/
`TableCell.tsx` family (no new table primitive). Three columns:

- **Option** — first, so the item type is the first thing scanned (user decision, replacing
  legacy's Title-first order since CA has no Title field). `w-40 whitespace-nowrap`: wide enough
  for "Geographic level" even while the table is empty, so the layout doesn't shift on first add;
  still grows for longer translations. Labels reuse the Add dialog's own `entry_dialog.map_option`/
  `division_option` keys.
- **Value** — the row header; takes all remaining width so long coordinate strings don't wrap early.
- **Action** — last, `w-px whitespace-nowrap !text-right`: shrinks to its header/icons and
  right-aligns like legacy (`!` is needed — legacy's unlayered `.dts-table th { text-align: left }`
  otherwise beats Tailwind's layered utility).

Row actions are legacy's own `pi pi-trash` / `pi pi-pencil` icon buttons, in legacy's order
(delete, then edit), via `Button`'s `icon` variant. No empty-state text: legacy shows a bare header
row, so `Table` only passes `renderEmptyState` when an `emptyState` is supplied (React Aria renders
a blank row otherwise).

**Division-row Edit** opens the Add dialog as legacy's **"Edit item"** (its `initial` prop),
pre-filled with "Geographic level" and only that division (user decision, Gate 9 round 4). Only
its **Apply** commits: the picks replace that row in place (extras inserted right after it,
duplicates of other rows dropped; applying unchanged is a no-op, so the field isn't flagged as
touched); switching to Map coordinates and applying turns the row into a geometry row. Cancel,
Escape, outside-click and close never change anything. (Round 2 briefly had the tree open
directly with close-to-save; replaced because a stray click plus Escape could add a row.
Originally division rows were Delete-only; reversed in round 2 to match legacy's Edit-on-every-row.)

**Division tree dialog (Gate 9 round 4)** — `HazardousEventDivisionListDialog` follows legacy's
"Select geographic level" picker, fixing its height problem and adding multi-select:

- `Dialog variant="item" size="medium"` — legacy's `min(92vw, 64rem)` (`max-w-5xl`), same
  responsive narrowing as the Add dialog. The item panel is a flex column: header and footer stay
  put and the body shrinks, so the dialog never exceeds the screen.
- Toolbar (right-aligned, wraps on narrow screens): **Expand All** / **Collapse All**
  (`muted-outline`, each disabled when it has nothing to do) and a **Search** box. Search keeps
  case-insensitive matches plus their ancestors and expands them (`filterDivisionTree`,
  `collectParentIds` in `divisionTree.ts`); "No results found" when empty.
- **"Geographic levels"** caption, then a React Aria `Tree` in a fixed `h-96` area (shrinks to
  `min-h-24` on short screens) — the **only** part that scrolls. Levels start collapsed; each
  parent has legacy's `mg-button--small mg-button-system` ►/▼ toggle (◄ in RTL), sized
  `!text-xs !leading-3.5` for legacy's `font-size: x-small` (measured 43×36, legacy ~43×36);
  leaves get an invisible spacer with the same classes so names align; 3em indent per level
  (legacy's `ul.tree li`).
- **Checkboxes** (user decision over legacy's hover-only "Select" button — works with keyboard and
  touch, and the tree shows what's picked): RAC `Checkbox slot="selection"`,
  `selectionBehavior="toggle"`. Picks survive search filtering and keep pick order.
- **Selected** chips below the tree (legacy `.selected` look in Tailwind palette classes), wrapping
  inside the fixed width and scrolling past `max-h-24` — the dialog never widens.
- Footer **Apply** (commits to the Add/Edit dialog) / **Discard** (legacy's label); Escape,
  outside-click and close also discard — except Escape inside a non-empty search box, which only
  clears the search. Each open starts from the caller's ids, collapsed and unfiltered, reset
  during render (as the Mapper dialog does) so the first frame never shows the last session.
- Legacy's tree connector lines (`ul.tree li:before`) are not reproduced.

**Below the table, in `Section`'s new `actions` slot (Decision 13):** two buttons —
**Add** (always enabled, opens the Add dialog below) and **Preview map** (**disabled whenever both
`geometries` and `divisionIds` are empty** — confirmed requirement, not merely "disabled when no
map content," since a division-only observation has nothing `HazardousEventLocationMap` can render
either, Decision below). There is no page-level "Edit" button anymore — editing is a per-row
action.

**The "Add" dialog — one dialog, inline-revealing content, no Title field.** A rewritten
`HazardousEventSpatialFootprintEntryDialog.tsx` (keeps its filename/export name — same `Dialog`
primitive host, Decision 12 — but its own internal structure changes) renders:

- An "Item type" radio — **Map coordinates** / **Geographic level** (same two labels/order as
  before, read directly from `spatialFootprintFormView.tsx`'s own `map_option` field, Context
  above) — unchanged from the superseded design.
- **Inline, below the radio, that type's own field + trigger button** — confirmed via live
  screenshot this is one dialog whose content changes under the radio, not two separate top-level
  buttons and not two separate dialogs chosen between (the superseded design's own model):
  - **Map coordinates** reveals a field showing either nothing yet (first open) or, once a shape
    has been drawn and saved in this session, the **"Shape: `<TYPE>`" + corner Lat/Lng summary**
    (Decision 16) — plus a trigger button, labelled **"Open map"** (confirmed live wording, not
    "Select", matching legacy's own Mapper-field affordance), that opens the map tool.
  - **Geographic level** reveals a field with a single trigger button, labelled **"Select"**
    (confirmed live wording, matching legacy's own geographic-level field, Context above), that
    opens the division-tree dialog.
- **No Title field.** Confirmed as an explicit correction, not an oversight carried over from
  legacy: legacy's own dialog has a required Title (Context above), but CA's `SpatialObservation`
  has no per-item title column anywhere in its schema (Goals/Non-Goals, unchanged) — there is
  nothing for a Title field in this dialog to write to, so it is dropped, matching this change's
  already-established "no per-entry titles" Non-Goal, now also confirmed as the correct call by
  the live walkthrough rather than merely asserted from the schema alone.
- A primary **Apply** action in the dialog's footer (replacing the superseded design's
  **Continue**, which only ever opened a tool and never itself committed anything) — **Apply is
  what commits this Add session's result into the row table**, closing the Add dialog back to the
  main `Section`. Cancelling/dismissing the Add dialog (Escape, outside-click, close icon) discards
  whatever was staged in this session without touching the committed `geometries`/`divisionIds` —
  matching every other dialog in this picker's own "cancel never partially commits" convention
  (Decision 11's outside-division warning, Decision 12's `Dialog` dismiss semantics).

**Look and layout (Gate 9 round 3): legacy's "Add new item" dialog, rebuilt in Tailwind classes —
no PrimeReact components and no PrimeReact theme classes** (the project is moving off PrimeReact;
reusing `p-button`/`p-inputtext` would only swap the components for the theme stylesheet). The
Lara theme is itself built on Tailwind's palette, so every legacy colour has an exact palette class
(`blue-500` = `#3b82f6`, `gray-300` = `#d1d5db`, `slate-500` = `#64748b`, …):

- **Shell** — `Dialog`'s new opt-in `variant="item"` (the default chrome, used by the save/discard/
  map/division dialogs, is untouched): fixed width `w-11/12 max-w-6xl` (legacy `min(92vw, 72rem)`),
  narrowing `max-xl:w-9/10` / `max-md:w-19/20` (legacy's 90vw/95vw breakpoints, at Tailwind's
  nearest); `p-6` header with a `text-xl font-bold text-gray-700` title and a round `pi-times`
  close button; body `px-6 pb-8`; footer uses legacy's own
  `mt-5 flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4`.
- **Field cards, radio grid** — legacy's own Tailwind classes copied verbatim
  (`rounded-lg border border-slate-200 bg-slate-50/60 p-3`; `grid grid-cols-1 gap-2
sm:grid-cols-2`, so the options stack on narrow screens). The radio is a visually hidden native
  input plus a styled ring (`group-has-checked:`), keeping native keyboard/screen-reader behaviour.
- **Read-only value + trigger** — a joined input group (`rounded-l-md` input, `rounded-l-none`
  button). Map shows `"Shape: <TYPE>"` in the input and the corner lines in a bordered box below
  (legacy's `.mapper-selected-shape` layout); divisions show their breadcrumb paths, comma
  separated (legacy is single-select, so had no multi-value display to copy).
- **Buttons** — `Button`'s new `accent` (Apply), `accent-outline` (Open map/Select) and
  `muted-outline` (Cancel) variants: legacy's padding (`px-5 py-3`), bold label, `pi-check`/
  `pi-times`/`pi-globe` icons.
- **"Map coordinates" pre-selected** on open, as legacy does — so a field card always shows and
  the dialog never collapses to a bare radio.
- **Kept deliberately different:** Apply stays disabled until something is staged (legacy enables
  it and errors on click); legacy's first-open glitch showing both option cards at once is not
  copied; radio ring is `size-6` — 21px at this app's 14px root, not legacy's 22px; signed off
  as is.

**What "Apply" commits, per item type:**

- **Map coordinates:** if a shape was drawn and saved (via the map tool's own Save, below) during
  this Add session, Apply appends exactly **one** new `geometries` entry (one new row). If the user
  opened the map tool and cancelled without saving a shape, there is nothing to commit — Apply is
  disabled until a shape has been saved in this session (mirrors the superseded design's own
  Continue-disabled-until-a-choice precedent, now gating on "a shape exists" instead of "a radio is
  checked").
- **Geographic level:** the division-tree dialog (next bullet) is itself multi-select and commits
  its own selection on its own Apply (round 4: the tree now has its own Apply/Discard footer and
  hands back the checked ids only on Apply); the Add dialog's own Apply then adds **one new row per division selected
  in that sub-dialog session** — confirmed requirement: "multi-selecting several divisions in one
  'Select' session adds that many new rows at once, each independently deletable afterward," not a
  single combined row.

**The map tool (reached via "Open map"), unchanged in nesting depth, fixed per Decision 17:**
`HazardousEventSpatialFootprintMap` continues to render inside a `Dialog` (Decision 12), now
nested **inside** the Add dialog (or opened directly for Edit, below) rather than as a sibling of
it — RAC's `ModalOverlay` stacking (both dialogs portal to `document.body`, later-mounted on top in
DOM order) is relied on for this, verified empirically during implementation, not assumed (Risks).
"Save Coordinates" closes the map dialog and returns to the Add dialog showing the "Shape: TYPE" +
coordinates summary (Decision 16); the close icon (or Escape with no draw active) discards any
shape not already saved in a prior Open-map round within the same Add session.

**The map tool's look and controls (Gate 9 round 5): legacy's full-screen "Mapper".** Superseding
round 3's wide dialog with an on-map leaflet-draw toolbar and Save/Cancel footer:

- `Dialog variant="fullscreen"` — whole viewport, white, legacy's own `dts-dialog__header` /
  `dts-heading-2` / `dts-dialog-close-button` classes, title **"Mapper"**, no footer (legacy has
  no Cancel; × discards — user decision). Padding `px-4 py-8 md:px-6` approximates legacy's
  2.29rem/1.14rem (1.71rem ≥768px). Every level is a shrinking flex column, so the map fills the
  remaining height (`flex-1`, `min-h-64` floor) instead of legacy's fixed 500px.
- **Toolbar row** (legacy order and look, Tailwind for legacy's inline styles): `bg-neutral-500`
  (legacy `#777`), `gap-2 p-2` (8px); search field `flex-1 basis-64` and mode dropdown
  `basis-56`, both `rounded-md border-black/35 px-3 py-2`, full-width below `md` (legacy's own
  ≤767px rule); then Clear / Undo (`mg-button--small mg-button-system`) and **Save Coordinates**
  (`mg-button--small mg-button-primary`, new `Button` `system-primary` variant), sized
  `!px-3.5 !py-1.5 !text-base` for legacy's inline 0.4rem/0.9rem/1rem, sharing a row on phones.
- **Search** — Enter only, no Search button (legacy's behaviour; supersedes Decision 15's button).
- **Mode dropdown** drives leaflet-draw's standalone tools (`L.Draw.Polygon` and its siblings
  for line, rectangle, circle and marker — confirmed live: they fire DRAWSTART/DRAWSTOP/CREATED on
  the map exactly as the toolbar did); leaflet-draw's on-map toolbar is gone. Labels follow legacy except
  "Line" / "Marker" (legacy "Line(s)" / "Marker(s)"), renamed at the user's request since an item
  holds one shape — see below. When a draw ends or is cancelled the dropdown returns to
  "Move map".
- **One shape per item.** The Add/Edit flows keep only `geometries[0]`, so a second drawn shape
  used to be dropped silently. Choosing a draw mode while a shape exists now opens this app's own
  confirm dialog (legacy used a native `confirm()`); keeping restores "Move map", proceeding
  starts the tool. **Replace on create (9k):** the existing shape stays until the new one is
  committed — it is removed only when the new shape passes the degenerate and outside-division
  checks (or "Add anyway"). A draw that ends without a committed shape (Escape, Undo during a
  rectangle/circle/marker draw, a mode change, Save Coordinates with a polygon unfinished, a
  degenerate result, "Discard shape")
  leaves the original in place, so Save Coordinates can never save an empty session by
  accident.
- **"Edit shape"** (user decision to keep, beyond legacy) — `L.EditToolbar.Edit` on the shapes
  group, disabled with no shape. Edits are committed (`save()` → EDITED, geometry rebuilt via
  `geometryFromLayer`, which keeps the circle→polygon conversion) when leaving the mode and
  before Save Coordinates; Save hands the map's own current geometries to `onSave`, so the host
  never reads a render-stale copy. **Edit validation (9k):** an edited shape gets the same checks
  as a new one. A degenerate edit is reverted to its stored pre-edit geometry and shows the
  degenerate message; an edit outside every selected division opens the outside-division
  confirm — "Add anyway" keeps it, "Discard shape" reverts it. The revert also restores the map:
  the edited layer is swapped for a fresh one built from the stored geometry, since leaflet-draw
  drops its own revert snapshot when the edit tool is disabled. When the commit was triggered by
  Save Coordinates or a mode change and needed either intervention, that action stops so the
  user sees the message or answers the confirm; pressing Save again saves.
- **Undo** removes the last point mid-draw (polygon/line, `deleteLastVertex` — a no-op at 0–1
  points, leaflet-draw's own guard; Escape cancels); during a rectangle/circle/marker draw (no
  points to drop) it cancels the draw and keeps the shape; otherwise it removes the shape. **Clear** removes everything and discards an in-progress edit.
- **Look:** toolbar buttons add `!leading-tight` — `!text-base` alone also sets a 1.5
  line-height, making them 33px tall against legacy's 29px (now 29.6px). The search field is
  focused when the Mapper opens, as legacy does.
- **Escape mid-draw** — leaflet-draw only hears Escape while focus is inside the map, but focus
  now usually sits in the toolbar, so a document `keydown` listener (active only while a draw
  tool is on) cancels the draw; the dialog's own Escape stays disabled during a draw, as before.

**The division-tree dialog (reached via "Select"):** rebuilt in Gate 9 round 4 — see "Division
tree dialog" above for its layout, checkbox multi-select (the agreed CA enhancement over legacy's
single-select hover "Select" button), and Apply/Discard. Chip labels are the breadcrumb `path`
(Decision 16), e.g. `"Abyan Governorate / Zinjibar"`.

**Edit for geometry rows does not go through the Add dialog at all** (division rows do — see "Division-row Edit" above). A row's **Edit** button
opens the map tool's `Dialog` **directly**, pre-loaded with that one row's single geometry — no
Item-type radio, no Apply step, since the row's type is already known. Saving in this direct-edit
map session **replaces that row's geometry in place** (same array index); cancelling leaves the row
unchanged. This is a deliberate, confirmed departure from the superseded Decision 14's "Edit
applies identically to Add" framing — that framing was correct for a single combined entry and is
wrong for a row table, where each row is independently, directly editable.

**Delete (both row types) is a direct table action, not a map interaction.** Clicking a row's
**Delete** button removes that one `geometries[i]` or `divisionIds[i]` entry directly from the
picker's state (array filter by index/id) — it does not open the map tool and does not go through
`leaflet-draw`'s own delete tool at all. This sidesteps Gate 9 finding (d) for the common case
entirely; Decision 17 still fixes finding (d)'s root cause inside the map component itself, because
a user editing a shape via Edit → Open map can still reach leaflet-draw's own delete-and-Save path
from within that single-shape session, and that path must not silently fail to persist either.

**Preview map** opens a full-screen `Dialog` titled **"Map preview"** (round 5: legacy opens a
full-page "Map preview" browser tab; the same `variant="fullscreen"` panel as the Mapper keeps the
user on the form) containing the existing read-only `HazardousEventLocationMap` (Decision 7; a
new opt-in `fill` prop lets it fill the panel, the detail page's card keeps `h-80`), fed a **combined**
geometry list — `geometries` plus the boundary geometry of every currently selected division — not
`geometries` alone. The division boundaries are already fetched for exactly this purpose by the
already-shipped `useDivisionBoundaryPreviews` hook (Decision 7's own preview-overlay mechanism);
Preview map reuses that same hook/fetch rather than adding a second one. This closes a real gap a
`geometries`-only preview would otherwise have: a division-only observation (no drawn shape) would
make `HazardousEventLocationMap` render `null` (Decision 7's own "empty `geometries` → null"
behavior) even though its row is both present and non-empty, leaving "Preview map" enabled but
showing nothing — confirmed as a real risk by reading `HazardousEventLocationMap.tsx` directly, not
assumed, and fixed here rather than left as a silent gap. `Preview map`'s disabled condition stays
`geometries.length === 0 && divisionIds.length === 0` (zero rows in the table), matching the
confirmed contract exactly.

### Decision 15 — Search button gets real `Button` styling and Enter-key submission, in the same edit that relocates it

> **Superseded in Gate 9 round 5:** the Mapper's search is Enter-only with no button, as legacy
> (see "The map tool's look and controls" under Decision 14). Kept below for history.

Both bugs are fixed where the search bar now lives (inside `HazardousEventSpatialFootprintMap`,
reached via the map dialog, Decision 14 — the bar's own position within that component is
unchanged, only the component's own mount location moves):

- The raw `<button type="button" onClick={handleSearch}>` is replaced with the design-system
  `Button` (`variant="outline"`, `type="submit"` — the same component already used for this file's
  outside-division-warning dialog footer, so no new primitive is needed).
- The search input and button are wrapped in a local, unnamed `<form onSubmit={...}>` (calling
  `e.preventDefault()` then the existing `handleSearch` logic) — a plain native form-submit, not a
  new `onKeyDown` handler, so Enter in the text input and clicking the button both route through
  one `onSubmit`. This local `<form>` is nested only inside the map tool's own `Dialog` (Decision
  14), which already portals outside the page's own `<Form method="post">` DOM subtree (confirmed,
  Decision 12's own "Correction" note on `MultiSelectCombobox`'s hidden input) — so this nested
  form cannot be mistaken for, or interfere with, the real page-level submit.

### Decision 16 — Row labels: `"Shape: <TYPE>"` + corner Lat/Lng for geometries, breadcrumb `path` for divisions; row granularity resolved

**Row granularity, the one open design question the first revision carried, now resolved by the
live walkthrough rather than guessed:** one row per `geometries[i]` entry, one row per
`divisionIds[i]` entry (Decision 14's row model, above) — not one row per "Add action" and not a
single combined blob. Multi-selecting several divisions in one "Select" session adds that many
rows at once (Decision 14); each row is independently deletable afterward regardless of which
session created it.

**Geometry row label and the Add dialog's post-save summary — same text, same computation, two
render sites.** A new pure function (`describeGeometry.ts` or a repurposing of the existing
`buildSpatialFootprintSummary.ts` — implementer's call once the two call sites are compared side by
side, not prescribed here) takes one bare GeoJSON `BareGeometry` (the same shape
`spatialFootprintGeometry.ts`'s `extractGeometry`/`isDegenerate` already operate on) and returns:

- `"Shape: <TYPE>"` where `<TYPE>` is `geometry.type` verbatim (e.g. `"Shape: Polygon"`,
  `"Shape: Point"`) — confirmed live wording and casing, not translated/re-labelled (a `Point`
  stays `"Point"`, not re-worded to "Marker" — the leaflet-draw shape type on the wire is what the
  GeoJSON `type` field already says).
- The shape's corner coordinates as **literal read-only Lat/Lng text**, confirmed live as legacy's
  own format for this summary. The exact per-type extraction (a `Polygon`'s ring corners, a
  `Point`'s single coordinate, a `LineString`'s endpoints, a circle's already-polygonized ring per
  Decision 4) is an implementation-time detail the task list leaves to whoever builds it, grounded
  in whichever bare-geometry shape `extractGeometry` already produces — not a new wire format.

This same text renders in **two places**: inside the Add dialog's own "Map coordinates" field,
immediately after a shape is saved (Decision 14), and as the row table's own label for that
geometry's row once Apply commits it. Both call the same function — no duplicated formatting
logic between the two render sites.

**Division row label and chip label — same correction, same source field.** Both the row table's
division-row label and `HazardousEventDivisionListDialog`'s own removable-chip label switch from
the division's bare `name` to its already-fetched breadcrumb `path` — confirmed by reading
`app/components/TreeView.tsx`'s `buildTree()` directly: `node.path` is already built as
`"<parent path> / <node name>"` (space-slash-space separator, root nodes starting bare) by
`setPathsAndIds()`, and `/api/division/tree.ts` already returns this field today, unchanged by this
decision — `HazardousEventDivisionListDialog.tsx`'s `DivisionTreeNode` interface already types
`path: string` (confirmed, already shipped); only the two render sites that read `node?.name`
switch to `node?.path`. No new fetch, no DTO/backend change — this is a one-line read-site
correction in an existing, already-tenant-scoped response.

### Decision 17 — Four Gate 9 engineering fixes carried over from the prior round, finished here, not deferred again

All four were found and left unfixed by the earlier live Chrome review (listed in this change's
own task instructions); each is a real bug independent of the row-table restructuring above and
must be fixed in this same pass:

- **(a) Section chrome vs. Attachments/`ContentRepeater`.** Fixed by Decision 13's `action` →
  `actions`, below-content placement. **Confirmed, not assumed:** the row-table change (Decision 14)
  alone does not fix this — it changes what `Section`'s `children` render, not where `actions`
  sits, which is why Decision 13 is revised separately and explicitly above.
- **(b) Map dialog renders ~270px wide in a 1536px viewport.** Root cause, confirmed by reading
  `all.css` directly: `.dts-dialog-panel` has no `width`/`max-width` rule at all — every `Dialog`
  instance shrink-fits to its content's intrinsic width, and the map container's own `w-full` is
  relative to that already-shrunk panel, not the viewport. Fix: `Dialog` gains a `size?: "default" |
"wide"` prop (default unchanged, so the Add/division/warning dialogs keep their current
  content-fit sizing — only the map tool needs near-full-viewport space, confirmed live against
  legacy's own Mapper, which is itself near-full-viewport). A new `.dts-dialog-panel--wide` class
  (e.g. `width: min(96vw, 1400px); height: min(90vh, 900px)`, exact values at the implementer's
  judgment against a live check, not prescribed to the pixel here) is applied only to the map
  tool's `Dialog` instance. _(Round 5: the map tool and Preview map both moved to
  `variant="fullscreen"`; `size="wide"` and `.dts-dialog-panel--wide` were then removed as unused.)_
- **(c) Escape mid-draw closes the whole dialog, silently discarding the in-progress shape.**
  Root cause: RAC's `ModalOverlay isDismissable` treats every Escape keydown as "close the modal,"
  with no awareness that `leaflet-draw` is itself mid-draw (where Escape's own, correct behavior is
  "cancel this draw action, stay in the dialog," matching leaflet-draw's own documented Escape
  handling for an active draw handler). Fix, revised at Gate 5 (SOLID review): track draw-active
  state (leaflet-draw's own `L.Draw.Event.DRAWSTART`/`DRAWSTOP` events) and report it via a new
  `onDrawActiveChange` callback prop on `HazardousEventSpatialFootprintMap`, rather than the map
  component reaching into a document-level listener to pre-empt `ModalOverlay`'s own Escape
  handling directly. `HazardousEventSpatialFootprintMapDialog` holds that boolean and passes it to
  `Dialog`'s own new `dismissDisabled` prop (wrapping RAC's `isKeyboardDismissDisabled`), which
  suppresses Escape-to-close only, leaving outside-click dismissal untouched. This replaces an
  initial implementation that used a `document`-level capture-phase `keydown` listener calling
  `stopImmediatePropagation()` — functionally correct and empirically verified (red-checked both
  in jsdom and against a real-browser E2E run), but flagged by the SOLID reviewer as a fragile,
  undeclared coupling to `ModalOverlay`'s internal Escape-handling timing. The explicit prop is the
  shipped version. _(Round 5: with the on-map toolbar gone, focus usually sits in the Mapper's own
  toolbar, where leaflet-draw doesn't hear Escape, so the map adds a plain document `keydown`
  listener — active only while a draw tool is on — that cancels the draw. It doesn't stop
  propagation; `dismissDisabled` still keeps the dialog open.)_
- **(d) Deleting a shape via click+Save sometimes doesn't persist (most severe).** Confirmed root
  cause, matching this change's own task instructions exactly: a prefilled `geometries[i]` is added
  to the map via `L.geoJSON(geometry)` (mount effect, `HazardousEventSpatialFootprintMap.tsx`),
  which returns a **`GeoJSON` layer _group_** wrapping the actual drawn layer as a child — but that
  wrapper group is what gets stored as `shape.layer` in `shapesRef.current`, while leaflet-draw's
  own delete-click selection operates on the group's **inner child layer**, not the group itself.
  `handleDeleted`'s `removed.includes(shape.layer)` check therefore never matches for a prefilled
  shape — only a shape drawn fresh in the current session (where `event.layer` from
  `L.Draw.Event.CREATED` already is the real drawn layer, not a wrapping group) deletes correctly.
  **Fix:** when adding a prefilled geometry to the map, store the group's actual inner layer as
  `shape.layer` — not the `L.geoJSON()` wrapper — e.g. via the group's own `getLayers()[0]` (a
  `L.GeoJSON` group wrapping one Feature/Geometry has exactly one child layer; confirmed against
  Leaflet's own `GeoJSON.addData` behavior for a single bare Geometry input, not multiple) — so
  `shapesRef.current`'s stored reference is the same object leaflet-draw's delete selection
  compares against, for both a freshly-drawn and a reloaded-prefilled shape alike. Verify with a
  dedicated test that specifically reproduces the prefill-then-delete path (task group 9d), not only
  the already-passing fresh-draw-then-delete path the original task 4.2 covered. _(Round 5:
  leaflet-draw's delete tool and `handleDeleted` were removed with the on-map toolbar; the
  inner-layer fix now serves Undo, Clear and Edit shape, which act on the same stored layer.)_

## Goals / Non-Goals

**Goals:**

- Let a user draw one or more shapes and/or pick one or more divisions, and submit that as the
  form's `spatialObservation` hidden-field payload, through the existing wire contract.
- Prefill the picker in edit mode from the event's current observation.
- Surface a malformed-shape validation error inline, where that's actually catchable (Decision 6).

**Non-Goals:**

- No per-entry titles — **corrected by Decision 14/Revision 2:** the picker now does render an
  itemized multi-row list (one row per geometry, one row per division, Decision 14/16), reversing
  this Non-Goal's earlier "no itemized multi-row list" half, which the live walkthrough confirmed
  does not match legacy's actual structure. Only the Title column is dropped — CA's schema has no
  field for it (unchanged reasoning, see the deviation note in Context above).
- No `observationTime`/`note`/`confirmReplace` UI — matches the wire contract's existing omission;
  historical/backdated observations remain REST-API-only (roadmap `6f`).
- No change to any `app/domains/hazardous-events/{domain,application,infrastructure}/**` file.
  (The `/api/geojson/:id` tenant-scoping fix, Decision 9, lives in `app/routes/$lang+/api+/`, a
  legacy shared route — not inside this boundary — so bringing it into scope does not violate this
  Non-Goal.)
- No name resolution for the detail page's newly-rendered `divisionIds` (Decision 10) —
  `SpatialObservationDto.divisionIds` carries ids only; resolving display names would need an
  application-layer/DTO change, which this Non-Goal above already excludes. Raw ids render instead.

## Decisions

### Decision 1 — One additive selection set, no `ContentRepeater`; divisions never write into `geometries`

The picker holds one in-progress `{ geometries: unknown[], divisionIds: string[] }` state.
Drawing a shape appends a bare Geometry to `geometries`. Picking a division appends **only** its
id to `divisionIds` — it does **not** also push the division's boundary into `geometries`.

Confirmed by reading `hazardous-event-spatial-observation-schema`'s spec directly (not assumed):
`hazardous_event_spatial_observation_division` is a pure `(observation_id, division_id)` join
table with no geometry column at all. Unlike legacy's own model (where a "Geographic level" item
has no separate id-list field, so it must carry its own `geojson` to be representable at all), CA's
domain model already separates the two concerns — `divisionIds` is administrative membership,
`geometries` is the recorded shape(s). Auto-copying a division's boundary into `geometries` would
duplicate potentially large polygons into the geom table on every save and — more importantly —
makes "deselect a division" ambiguous: once its boundary is merged into a flat `geometries` array
alongside hand-drawn shapes, there is no way to tell which array entry came from which division to
remove the right one. Keeping them separate avoids both problems by construction.

The map still shows the selected division's boundary to the user — as a **non-persisted preview
overlay layer**, fetched on selection and discarded on deselection (Decision 7) — so the user can
see what they picked, but that overlay is never serialized into the `geometries` the form submits.

**Confirmed, not merely assumed: this is transactionally safe for create.** Read
`CreateHazardousEvent.ts` directly (lines ~269-280): `recordSpatialObservationUseCase.execute()`
is called with the same `tx` as the `HazardousEvent`/`WorkflowInstance` inserts, inside one
transaction — a `ValidationError` from a bad `divisionId` rolls back the whole create, so a
field-error re-render never leaves behind an already-committed event a resubmission would
duplicate.

No `ContentRepeater`, no per-item dialog, no title field — there is nothing CA's domain model
would do with a title.

### Decision 1 Addendum — The hidden `spatialObservation` field starts empty, not as empty-array JSON

`new.tsx`'s action includes `spatialObservation` in the `CreateHazardousEventUseCase` call
whenever `parsed.spatialObservation !== undefined` — **it never checks
`spatialObservationChanged`** (confirmed by reading the action directly; that flag only gates the
_edit_ action, since create has no prior state to diff against). `SpatialObservation.create()`
accepts empty `geometries`/`divisionIds` arrays as valid. If the picker always serialized
`{"geometries":[],"divisionIds":[]}` into the hidden field from mount, **every single create would
write a spurious empty spatial-observation row**, even when the user never touched the picker.

To avoid this, the hidden `spatialObservation` input MUST render as the literal empty string
(`""`) in both create and edit modes until the user's first draw or division-selection —
`parseSpatialObservation("")` already returns `undefined` today, which is exactly "no observation
submitted," the correct behavior for an untouched picker. Only after the first interaction does
the field switch to real JSON. This is a correction to this design's own first draft, which
specified "always valid JSON, never empty string" without checking the create action's actual
gating — flagged here rather than silently fixed, since it changes the picker spec's own
requirements (see spec `hazardous-event-spatial-footprint-picker`).

**Resolved with the human:** once the user has interacted and then removes every shape/division
(back to zero geometries and zero divisionIds), the picker reverts **both** hidden fields to their
untouched values — `spatialObservation` back to `""` and `spatialObservationChanged` back to
`"0"` — the same no-op-by-default behavior an untouched picker already has on create. It does
**not** send an explicit empty-array JSON; option (b) above is rejected.

**Known consequence of this choice, confirmed and accepted, not an oversight:** in **edit** mode,
if the event already has a non-null `currentSpatialObservation`, and the user clears every
shape/division and submits, the hidden fields revert to `""`/`"0"` exactly as above —
`parseSpatialObservation("")` parses to `undefined`, and `edit.$id.tsx`'s action only calls
`UpdateHazardousEventUseCase` with a `spatialObservation` field when both
`parsed.spatialObservation !== undefined` and `parsed.spatialObservationChanged` are true. Neither
holds after a full clear, so the action does not touch the observation at all, and the event's
previously recorded observation **remains the current one on the server**, unchanged — visually
clearing the picker and submitting does not delete an existing footprint. There is no UI path in
this change that lets a user record "no footprint, explicitly" over a previously-recorded one;
doing so still requires the REST API (`6f`). This mirrors create's own existing no-op-by-default
behavior exactly, at the cost of this one edit-mode asymmetry, which the human has confirmed as
acceptable.

### Decision 2 — UI library split: Leaflet (+ `leaflet-draw`) for the map canvas, React Aria for all chrome

The DELTA-wide mandate (confirmed in `design-system-unification-roadmap.md`: "React Aria instead
of PrimeReact... Applies to `6a` onward") governs new Phase-6 React components. This picker is
`6c` work, so it applies. Splitting the decision by what's actually a React component resolves the
apparent conflict cleanly:

- **The map/draw surface itself is not a React Aria concern.** Legacy's own mapper dialog
  (`app/components/ContentRepeater/controls/mapper/index.tsx`) is a native `<dialog>` with
  hand-rolled DOM, not PrimeReact — it mostly hand-rolls polygon/polyline/marker drawing via raw
  click handling and direct `L.polygon`/`L.polyline`/`L.marker` construction, but does use the
  real `leaflet-draw` plugin's handler API for rectangle/circle specifically (confirmed by its own
  `rectangleHandle`/`circleHandle` objects' `.disable()` calls and its `L.Draw.Event.CREATED`
  reference). This change follows the same approach: load Leaflet (already loaded by
  `leafletLoader.ts`) plus `leaflet-draw` (Decision 3), and drive the actual drawing imperatively,
  same pattern `HazardousEventLocationMap.tsx` already established for the read-only map. No React
  Aria component renders inside the map canvas.
- **Every chrome component around it — the picker's own dialog/modal shell, buttons, the
  division-list selector — is built with `react-aria-components`**, not PrimeReact, per the
  mandate. Confirmed this is the actual package already in use (not raw `react-aria` hooks) by
  reading `app/design-system/components/Combobox.tsx`'s own imports.
- This form's existing `HazardousEventSaveSubmitModal`/`HazardousEventDiscardModal` already use
  PrimeReact's `Dialog`/`Button` (confirmed by reading both files directly:
  `HazardousEventSaveSubmitModal.tsx` imports `Dialog` from `"primereact/dialog"`, `Button` from
  `"primereact/button"`, `Checkbox` from `"primereact/checkbox"`, and a type from
  `"primereact/multiselect"`; `HazardousEventDiscardModal.tsx` imports `Dialog`/`Button` from the
  same two PrimeReact packages). **These are not treated as a sanctioned precedent for new work**
  — the mandate is dated 2026-10-23 and `6c` (this exact form) was archived 2026-11-04, so these
  two modals were most likely built _without applying_ the mandate, not before it existed; either
  way, the mandate takes priority over local file-neighbor consistency, not the reverse.
  **Re-confirmed with the human, superseding this design's own earlier call:** this was first
  logged as a deliberate, out-of-scope boundary (`DEF-060`). The human has since reviewed that
  entry and asked for it to be fixed here, not deferred, so that roadmap item `6c` can be marked
  fully complete once this change ships — `DEF-060` is removed from the register entirely (it is
  resolved by this change, not tracked as a follow-up) rather than deleted-later-at-archive the
  way a genuinely-deferred item would be. Both modals are migrated to `react-aria-components` in
  this same change, as a parity port (same behavior, new chrome) — see Decision 12 for the new
  design-system primitives this requires and their token sourcing.
- Legacy's `TreeView.tsx` (the component its own Geographic-level dialog uses) is itself
  PrimeReact-coupled (`primereact/button`, `primereact/inputtext`) and built against legacy's own
  `ViewContext`/`ctx.t()`, not `react-i18next` — confirmed by reading it directly, not assumed.
  Reusing it wholesale would reintroduce PrimeReact through the back door. This change builds a
  new, minimal, React-Aria-based division list/dialog instead (Decision 5), not a `TreeView` port.

### Decision 3 — Extend `leafletLoader.ts`'s typed subset; add `leaflet-draw` from the exact host/version legacy already loads

`leafletLoader.ts`'s `LeafletNamespace` today only types `map`/`tileLayer`/`geoJSON`/
`latLngBounds` — enough for a read-only display, not enough to draw. Add the typed surface this
picker needs (`Marker`/`Polygon`/`Polyline`/`Rectangle`/`Circle` constructors, `FeatureGroup`,
`Draw.Event.*` constants, an editable-layer add/remove API) and a second CDN load for
`leaflet-draw`, at the **exact URL legacy itself already loads it from** — confirmed by reading
`app/components/ContentRepeater/index.tsx` (lines 148-161) directly, not assumed or recalled:
`https://cdnjs.cloudflare.com/ajax/libs/leaflet.draw/1.0.4/leaflet.draw.css` and
`.../leaflet.draw.js`. Note this is **cdnjs**, not unpkg — different host from
`leafletLoader.ts`'s own existing base-Leaflet load (unpkg), kept as two separate loads rather
than switched to one host, since `leafletLoader.ts`'s unpkg load is already shipped and untouched
by this change. The `leaflet-draw` load is gated the same way the existing Leaflet script tag is
(load-once, promise-cached, resolves `null` on failure). No new npm dependency.

### Decision 4 — Reuse `app/utils/spatialUtils.ts` as-is for geometry math; unwrap Feature to bare Geometry before storing

`convertMarkersToTurfPolygon`/`convertCircleToTurfPolygon`/`convertRectangleToTurfPolygon`/
`convertPolylineToTurfPolygon`/`checkShapeAgainstDivisions`/`rewindGeoJSON` are generic, already
shared, already untouched-by-legacy-view-coupling utilities (confirmed by reading the file: no
import of `ContentRepeater`, `ViewContext`, or any PrimeReact component). This change imports them
directly rather than reimplementing shape-to-GeoJSON conversion. No changes to this file.

**Important shape mismatch, must be handled explicitly, not glossed over:** every `convert*`
helper returns a turf **`Feature<...>`** (confirmed by each function's own return type in
`spatialUtils.ts`), but `SpatialObservation`'s `geometries` array holds bare GeoJSON **Geometry**
objects, not Features (Context, above). The picker's own draw-completion handler MUST take
`.geometry` off the returned Feature before appending to its `geometries` state — an explicit,
typed unwrap step (no `as any`), not left implicit.

Separately: PostGIS-level geometry validity (e.g. a degenerate 1-point "polygon" that slipped
past a drawing-tool edge case) is checked at insert time, not by `SpatialObservation.create()`
(which only checks `Array.isArray`, per its own comment "untyped PostGIS geometry — no typed
shape"). A PostGIS insert failure surfaces as a raw DB error, not a `ValidationError`, so it is
**not** caught by Decision 6's field-error mapping at all — it would reach the generic error
boundary as an unhandled 500. Mitigation: the picker rejects a degenerate shape (e.g. fewer than 3
points for a polygon) client-side, before ever committing it to state, rather than relying on a
server-side catch that doesn't exist for this failure mode (Risks, below).

### Decision 5 — A new, CA-native division list (React Aria), not legacy's `TreeView`

Consumes the existing `/api/division/tree` endpoint directly (already tenant-scoped via
`getCountryAccountsIdFromSession`, confirmed by reading its loader — no new backend route). It
does not need `TreeView`'s full feature surface (checkbox multi-select across arbitrary depth,
lazy per-domain data sources) regardless of hierarchy depth. **Renders a real parent/child tree,
not a flat list** (Blocking Decisions, below, resolved on existing evidence rather than the real
tenant-data queries tasks.md 1.3 names) — `divisionTable` carries `parentId`/`level`, and
`/api/division/tree`'s own `buildTree()` already returns the nested structure this needs directly.
On selection, fetches `GET /api/geojson/:id` for the boundary and shows it as a non-persisted
preview overlay (Decision 1, Decision 7) — it is not appended to `geometries`.

### Decision 6 — Field-error mapping: only two messages are reachable through the real form path; alias both to `divisionIds`

Corrected after re-reading `parseSpatialObservation()` directly (the first draft of this decision
assumed a `"geometries"/"divisionIds" must be an array` `ValidationError` was reachable through
the form; it is not): `parseSpatialObservation()` already coerces a non-array `geometries` to
`[]` and filters `divisionIds` to its string entries, so `SpatialObservation.create()`'s own
`Array.isArray` guard can never throw via this wire path — only a direct, non-form caller (e.g.
the REST controller, `6f`) could trigger it. There is nothing for this change's field-error
mapping to catch there.

The two `ValidationError`s this picker's own real behavior **can** realistically trigger are both
on `divisionIds`:

- `"divisionIds must not contain duplicate values"` — only if the picker fails to dedupe a
  re-selected division client-side (defended against directly, see the picker spec's own
  "re-selecting doesn't duplicate" scenario; this mapping is defense-in-depth, not the primary
  guard).
- `"divisionId ${id} is not present in validDivisionIds"` (singular) — a division selected from
  a live `/api/division/tree` fetch that becomes invalid before submit (deleted, or moved to a
  different tenant) between page load and form submission, not only deliberate tampering.

`extractFormFieldErrors.ts`'s `extractFieldError()` infers a field key from a `ValidationError`
message's leading `"<fieldName> "` word, restricted to a static `KNOWN_FIELDS` set. Add
`"divisionIds"` to that set (catches the plural message as-is), and add a small alias step before
the `KNOWN_FIELDS` lookup that normalizes the singular captured word `"divisionId"` to
`"divisionIds"` — a presentation-layer fix entirely inside this one file, no domain/backend
message-format change needed. This closes the gap the first draft of this decision had wrongly
accepted as permanent.

### Decision 7 — `HazardousEventLocationMap.tsx` is not reused for the editable picker

It is read-only (no draw API), returns `null` when `geometries` is empty (the picker must show an
empty, drawable map instead), and its `useEffect` is keyed on `[geometries]` identity — every
draw action would tear down and fully rebuild the Leaflet map (the same `L.map()`/tile-layer/
fit-bounds sequence), which is wrong for an interactive surface where the map instance itself
must persist across edits. The new picker's map component is written fresh, reusing only the
`ensureLeafletLoaded()` CDN-load pattern (Decision 3 extends it), not `HazardousEventLocationMap`
itself. `HazardousEventLocationMap` is left unchanged and continues to serve the read-only detail
page exactly as today.

The new map component renders two distinct layer groups, kept separate per Decision 1: a
persistent layer for the picker's own `geometries` state (hand-drawn shapes, added/removed via
`leaflet-draw`), and a transient, non-persisted preview layer for whichever divisions are
currently selected in the division list (Decision 5) — fetched via `GET /api/geojson/:id` on
selection, removed from the map (not from `geometries`, since it was never added there) on
deselection.

### Decision 8 — Edit prefill

`GetHazardousEventByIdUseCase`'s DTO already resolves `currentSpatialObservation` (typed
`SpatialObservationDto | null` on `HazardousEventDetailDto`, confirmed by reading the DTO file
directly — used by the detail page's read-only map, per `ca-he-detail-page-rebuild` Decision 5).
**The gap is not in `edit.$id.tsx`'s `loader`** — it already fetches and returns the whole
`event` object, `currentSpatialObservation` included. The gap is in the route module's default-
exported component, which hand-picks specific fields into `HazardousEventFormPage`'s
`initialValues={...}` prop and today simply omits `currentSpatialObservation` from that object —
`HazardousEventFormInitialValues` has no spatial field at all to receive it. This change adds an
optional
`currentSpatialObservation: { geometries: readonly unknown[]; divisionIds: readonly string[] } | null`
to `HazardousEventFormInitialValues`, and adds one field to the edit route component's existing
`initialValues={...}` object: `currentSpatialObservation: event.currentSpatialObservation`.
`null` when the event has never recorded one — same empty, drawable-from-scratch picker state as
create mode. The create route passes nothing (no prior observation can exist).

### Decision 9 — Fixed in scope: add tenant (`countryAccountsId`) scoping to `/api/geojson/:id`'s division lookup

`app/routes/$lang+/api+/geojson.$id.ts`'s loader (`authLoaderPublicOrWithPerm("ViewData", ...)`)
looks up `divisionTable.findFirst({ where: eq(divisionTable.id, id) })` with no
`countryAccountsId` filter — any authenticated user (the "public" branch may even widen this
further, not fully traced here) can fetch any tenant's division boundary by guessing/enumerating
ids. Legacy's own Geographic-level flow already calls this route as-is; this picker's division
list (Decision 5) and its division-boundary preview fetch (Decision 7) would too. No existing
`DEF` register entry covers this (checked).

**Confirmed with the human: fixed as part of this change, not deferred.** The new division-preview
feature (Decision 5/7) is what newly exposes this pre-existing gap to this UI path, which tips the
balance toward fixing it here rather than tracking it separately. The fix follows the exact same
pattern `/api/division/tree.ts` and `/api/division/list.ts` already use for this same table:
resolve `countryAccountsId` via `getCountryAccountsIdFromSession(request)` inside the loader, and
filter the lookup with `and(eq(divisionTable.id, id), eq(divisionTable.countryAccountsId,
countryAccountsId))` instead of `id` alone (`authLoaderPublicOrWithPerm` already resolves a
`countryAccountsId` from the same session before calling this loader, redirecting to
`/user/select-instance` if none exists — the loader re-deriving it from `request` is the same
value, not a new auth requirement). A division id belonging to a different tenant now 404s instead
of leaking that tenant's boundary.

**Blast radius, confirmed before fixing a shared route:** this file has exactly one other real
caller — legacy's own `SpatialFootprintFormView`'s Geographic-level flow (grep-confirmed, Context
above) — and no route/component calls it cross-tenant by design, so adding this filter only
removes an exploit path; it does not change behavior for any legitimate, same-tenant caller, legacy
included. `app/routes/$lang+/api+/spatial-footprint-geojson.ts` is a separate, unrelated route
(uses the forbidden `authLoaderApiDocs`, per this project's own documented P1-22, and queries
`disaster_records` only) — confirmed unusable for HE regardless, untouched by this fix, so this
change does not call it. See tasks.md 1.4 for the implementation task.

**Addendum (task group 5, implementation-time addition):** the response also now includes `name`
(the division's resolved display name, same `en`-priority-then-first-key resolution `buildTree()`
uses). The picker's own division-preview chip (Decision 5/7) needs a name to show, and
`HazardousEventDivisionListDialog`'s `onSelectionChange` reports bare ids only (Decision 5, already
shipped) — reusing this same fetch avoids a second, redundant `/api/division/tree` round-trip and
its own cache/race surface purely for a name lookup. Additive and backward-compatible (existing
`{geojson}` consumers are unaffected by the new sibling field); does not touch any
`app/domains/hazardous-events/{domain,application,infrastructure}` file, so this Non-Goal is
unaffected.

### Decision 10 — Division-only observations become visible on the detail page; `divisionIds` renders, display-only

> **Revised (Gate 9 round 6, user request):** the list is no longer raw ids — a new
> `HazardousEventDivisionNames` shows each division by breadcrumb path (same label as the form's
> rows), under a visible "Divisions" label, resolved client-side from the cached
> `fetchDivisionTree` (one request, shared with the form). Loading status until it arrives;
> "Unknown division (id)" for a missing id or failed fetch. No server/domain change. The
> raw-ids reasoning below is kept for history.

**Correcting this design's own earlier mis-description, confirmed by re-reading
`HazardousEventDetailPage.tsx` directly:** the original concern was that a division-only
observation would fall into the page's "no observation" empty state. That is **not** what happens
— `HazardousEventDetailPage.tsx`'s Location Card null-checks `currentSpatialObservation` itself,
not `geometries`, so a division-only observation (non-null, empty `geometries`, non-empty
`divisionIds`) already renders Observation time and Note correctly. The real, narrower gap: the
page has **zero** reference to `divisionIds` anywhere, so a user who only ever selects divisions —
never drawing a shape — sees Observation time/Note but no indication a division was recorded at
all; the map area renders nothing, since `HazardousEventLocationMap` itself returns `null` for an
empty `geometries` array (Decision 7, unchanged).

**Confirmed with the human: widen this change's own scope to fix it, not deferred.** The Location
Card now also renders `currentSpatialObservation.divisionIds` whenever it is non-empty, independent
of whether `geometries` is empty — a division-only observation is no longer invisible. This is a
**display-only** read of a field the DTO already carries (`SpatialObservationDto.divisionIds`,
confirmed in `app/domains/hazardous-events/application/dto/SpatialObservationDto.ts`); it does
**not** copy a division's boundary into `geometries`, and Decision 1's geometry/division separation
stays exactly as designed — this is not a reason to revisit it.

**Deliberately out of scope: name resolution.** `SpatialObservationDto.divisionIds` carries ids
only, not names (confirmed by reading the DTO file directly — no join to `divisionTable.name`
anywhere in its construction). Resolving a division id to its display name would need either an
application-layer/DTO change (excluded by this change's own Non-Goals — no
`app/domains/hazardous-events/application/**` file changes) or a new client-side fetch the detail
page doesn't otherwise need. Neither is in scope here: the Location Card renders the raw division
id(s) instead. This is a known, accepted limitation of this minimal fix, not an oversight — a
future polish pass can add name resolution without touching this change's own scope boundary.

**New finding, read directly rather than guessed, that informed this decision:** legacy's own
`syncHazardousEventSpatialFootprint` (`app/backend.server/models/event.ts`, lines ~351-422) already
keeps map-coordinate and geographic-level items in fully separate tables, never merging a
division's boundary into the geometry table for the same item. The Phase M backfill (`Ma`, another
team member's own workstream) maps these two legacy tables straight across to the new schema's
`_geom`/`_division` child tables along the same split, not merged. So this decision's
"render `divisionIds` separately, don't copy into `geometries`" choice also matches what
legacy/migrated data actually looks like, not a new CA-only convention.

### Decision 11 — Nominatim search and the outside-division warning are kept, ported as React-Aria chrome, not dropped

**Confirmed with the human, resolving this design's earlier "proposed dropped"/"undecided"
framing (Context, per-affordance list above):** both affordances are kept, not dropped.

- **Nominatim free-text location search.** The picker's map renders a free-text search input
  (matching legacy's own affordance) that calls the same unauthenticated
  `https://nominatim.openstreetmap.org/search?q=...&format=json` endpoint legacy already calls
  (`app/components/ContentRepeater/controls/mapper/index.tsx`, confirmed by reading it directly)
  and fits/recenters the map to the first result's `boundingbox`. It has no effect on `geometries`/
  `divisionIds` — it only orients the view, exactly as legacy's own behavior. An empty query is
  rejected before any network call (legacy's own guard, ported as-is); a zero-result response
  leaves the map unchanged with a "not found" message instead of crashing or silently doing
  nothing.
- **Outside-division warning (`checkShapeAgainstDivisions`).** Ported as a real, wired UI warning,
  not left unwired. **Scope decision, named explicitly:** legacy's own call sites
  (`app/components/ContentRepeater/controls/mapper/index.tsx`, lines ~510-821) pass a `divisions`
  prop that is that ContentRepeater instance's own full division set, checking a drawn shape
  against _every_ division known to it. This picker has no equivalent "every known division"
  concept readily at hand without fetching and holding every tenant division's full boundary
  geometry just for this check — a cost this design does not accept. Instead, the picker checks a
  newly completed shape against the boundaries of whichever divisions are **currently selected**
  in its own `divisionIds` (the same boundaries already fetched for the preview overlay, Decision 7) — the one set of division geometries this picker already holds in memory. If no division is
  currently selected, the check is skipped entirely (nothing to compare against, matching
  `checkShapeAgainstDivisions`'s own `divisions.length === 0` → `""` short-circuit). Legacy's own
  gate semantics are preserved exactly: a shape outside every checked division's boundary triggers
  a warning with the option to proceed or discard — **confirming adds the shape anyway; cancelling
  discards it, never adding it to `geometries`** — matching each `userConfirmed`/`return false`
  call site in legacy's own mapper. The warning itself is a `react-aria-components`-based
  confirmation affordance, not a native `confirm()` — a native dialog is not `react-aria-components`
  chrome and would sit outside Decision 2's own mandate scope for this picker's new UI.

### Decision 12 — Three new design-system primitives (`Button`, `Dialog`, `MultiSelectCombobox`) for the sibling-modal migration, tokens sourced from real legacy values, not invented

Migrating `HazardousEventSaveSubmitModal`/`HazardousEventDiscardModal` off PrimeReact (Decision 2,
resolved) needs three pieces no existing `app/design-system/components/` file provides: a
standalone `Button` primitive (today, `Select.tsx` is the only file importing RAC's own `Button`,
inline, for its own trigger — there is no reusable wrapper), a `Dialog`/modal-shell primitive (the
Open Question this design previously left open — now resolved: build it), and a filterable
**multi**-select with removable chips (the validator picker) — `Combobox.tsx` wraps RAC's
`ComboBox`, which is single-selection by construction (`onChange`'s `Key | null` signature,
`formValue="key"`); extending it to multi-select would mean a different selection model entirely,
not a prop addition, so this is a new sibling file, not a `Combobox.tsx` change.

**Naming**, matching this design system's own established convention (each wrapper is named after
the RAC primitive it wraps — `Select.tsx`→`Select`, `Combobox.tsx`→`ComboBox`,
`Link.tsx`→`Link`): `Button.tsx` (wraps RAC's `Button`), `Dialog.tsx` (wraps RAC's
`ModalOverlay`/`Modal`/`Dialog`), `MultiSelectCombobox.tsx` (no single RAC primitive to name it
after — a hand-composed filter-input + multi-select `ListBox` + chip row, named descriptively
instead, the same way this design system already has no problem naming a hand-composed primitive
by behavior rather than by a 1:1 RAC source when none exists).

**Token sourcing — every existing `.dts-*` class in `all.css` consumes tokens via `var(--...)`,
none hardcodes a raw value in the class body (confirmed by reading the whole file); these three
new components follow the same rule, reusing an existing token wherever the value already matches
and adding a new, clearly-scoped token only where nothing existing covers it. Every new token's
value is sourced from a real, already-shipped legacy rule — none invented:**

| New component need                                            | Source (confirmed by reading it)                                                                                                                                                                                                                                                                                                                                                                                                                 | Token                                                                                                             | Reused or new                                                                                                                                                                                                                                               |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Button border-radius                                          | `style-dts.css` `.mg-button` (`border-radius: 0.57rem`)                                                                                                                                                                                                                                                                                                                                                                                          | `--radius-dts-button`                                                                                             | **Reused** (already `0.57rem`, exact match)                                                                                                                                                                                                                 |
| Button primary hover bg / outline hover border+text           | `style-dts.css` `.mg-button-primary:hover` / `.mg-button-outline:hover` (`#106cb8`, both)                                                                                                                                                                                                                                                                                                                                                        | `--color-dts-action`                                                                                              | **Reused** (already `#106cb8`, exact match)                                                                                                                                                                                                                 |
| Button disabled text/border (both variants)                   | `style-dts.css` `.mg-button:disabled`'s `color: #cccccc` / `.mg-button-outline:disabled`                                                                                                                                                                                                                                                                                                                                                         | `--color-dts-input-border`                                                                                        | **Reused** (already `#cccccc`, exact match)                                                                                                                                                                                                                 |
| Button primary resting background                             | `style-dts.css` `.mg-button-primary` (`background-color: #004f91`)                                                                                                                                                                                                                                                                                                                                                                               | `--color-dts-button-primary-bg: #004f91`                                                                          | **New** — also reused for outline's resting border/text color (same `#004f91` in `.mg-button-outline`)                                                                                                                                                      |
| Button primary disabled background                            | `style-dts.css` `.mg-button:disabled` (`background-color: #808080`)                                                                                                                                                                                                                                                                                                                                                                              | `--color-dts-button-disabled-bg: #808080`                                                                         | **New** — not `--color-dts-status-missing` (same hex, unrelated purpose — a workflow-status pill, not a button; this app already tolerates same-hex/different-purpose tokens, e.g. `--color-dts-checkbox-checked` vs. `.mg-button-primary`, both `#004f91`) |
| Button primary focus ring                                     | `style-dts.css` `.mg-button-primary:focus-visible` (`box-shadow: 0 0 0 2px #106cb8`)                                                                                                                                                                                                                                                                                                                                                             | `--shadow-dts-button-primary-focus: 0 0 0 2px #106cb8`                                                            | **New** (literal value, matching this file's own convention of literal, non-nested token values — see `--shadow-dts-checkbox-glow`)                                                                                                                         |
| Button outline hover/focus ring                               | `style-dts.css` `.mg-button-outline:hover` / `:focus-visible` (identical `box-shadow: 0 0 0 2px rgba(145, 202, 255, 0.4)` both states)                                                                                                                                                                                                                                                                                                           | `--shadow-dts-button-outline-hover: 0 0 0 2px rgba(145, 202, 255, 0.4)`                                           | **New**                                                                                                                                                                                                                                                     |
| Button padding                                                | `style-dts.css` `.mg-button` (`padding: 0.86rem 1.14rem`)                                                                                                                                                                                                                                                                                                                                                                                        | `--spacing-dts-button-padding: 0.86rem 1.14rem`                                                                   | **New**                                                                                                                                                                                                                                                     |
| Button base text color (filled), gap, font-weight/line-height | `style-dts.css` `.mg-button` (`color:#fff`, `gap:0.57rem`, etc.)                                                                                                                                                                                                                                                                                                                                                                                 | _(none)_                                                                                                          | Not tokenized — matches this file's own precedent of leaving small one-off layout values (e.g. `.dts-checkbox-label`'s `gap: 0.5rem`) as plain CSS, not tokens; tokens are reserved for colors/borders/radii/shadows shared across states or components     |
| Dialog panel border + radius                                  | `style-dts.css` — no PrimeReact-dialog-equivalent legacy rule exists (PrimeReact's current stock `lara-light-blue` theme governs today's look, already flagged elsewhere in this roadmap as never a deliberate color match); reuses the same bordered-panel tokens `.dts-select-popover` already established for exactly this purpose                                                                                                            | `--color-dts-input-border` / `--radius-dts-input`                                                                 | **Reused** (identical precedent: `.dts-select-popover` already borrows these same two tokens for its own bordered floating panel)                                                                                                                           |
| Dialog panel shadow (visible depth)                           | `Card.tsx`'s own existing elevation shadow (confirmed by reading it directly) — reused rather than inventing a new one, for the same "panel needs visible depth" need `Card` sections already have                                                                                                                                                                                                                                               | `--shadow-dts-dialog: 0 2px 1px -1px rgba(0,0,0,0.2), 0 1px 1px 0 rgba(0,0,0,0.14), 0 1px 3px 0 rgba(0,0,0,0.12)` | **New** (value copied from `Card.tsx`, not invented)                                                                                                                                                                                                        |
| Dialog overlay/backdrop                                       | `style-dts.css` line 415-417: `::backdrop { background: rgba(0, 0, 0, 0.5); }` — legacy's own real backdrop rule, already used by the native `<dialog>`-based map/draw surface this same `ca-he-spatial-footprint-picker` change builds (Decision 2/7)                                                                                                                                                                                           | `--color-dts-overlay: rgba(0, 0, 0, 0.5)`                                                                         | **New** (exact legacy value)                                                                                                                                                                                                                                |
| MultiSelectCombobox filter input + dropdown chrome            | `.dts-text-input` / `.dts-select-popover` — already shared by every Select/Combobox dropdown today (`.dts-select-popover`'s own comment: "covers every Select/Combobox dropdown")                                                                                                                                                                                                                                                                | _(existing classes, no new tokens)_                                                                               | **Reused**, zero new CSS beyond the chip row itself                                                                                                                                                                                                         |
| MultiSelectCombobox chip background/border/radius             | No legacy color exists for this: `style-dts.css`'s own `.save-modal-notify-multiselect`/`.return-modal-notify-multiselect` rules style only layout (flex-wrap, ellipsis), not color — the chip's current color comes from PrimeReact's stock theme, same caveat as the Dialog panel above, not a deliberate legacy value to preserve. Reuses this app's existing light, neutral, bordered-surface tokens instead of inventing a new color family | `--color-dts-option-hover` (bg) / `--color-dts-input-border` (border) / `--radius-dts-input` (radius)             | **Reused**, zero new tokens                                                                                                                                                                                                                                 |

**New CSS classes** (in `all.css`, consuming the tokens above exactly as every existing `.dts-*`
class already does — never a raw value in the class body): `.dts-button` (base) +
`.dts-button--primary` / `.dts-button--outline` (variants, including their own `:disabled`/
RAC-state-selector rules — the exact RAC data-attribute names (`data-hovered`/`data-focus-visible`/
`data-disabled` vs. native `:hover`/`:focus-visible`/`:disabled`) must be confirmed against the
installed `react-aria-components` version when this is implemented, the same choice
`.dts-select-popover`'s own `[data-hovered]`/`[data-focused]` selectors already made for exactly
this situation — not assumed here); `.dts-dialog-overlay` / `.dts-dialog-panel` /
`.dts-dialog-title` / `.dts-dialog-body` / `.dts-dialog-footer`; `.dts-multiselect-chip` (and a
wrapping `.dts-multiselect-chips` row). See tasks.md for the `all.css` edit itself as its own
task — not made in this design pass.

**Behavior preserved exactly (parity port, confirmed against each file's own current behavior and
existing tests), not redesigned:**

- `Dialog`'s dismiss-on-Escape and dismiss-on-outside-click match PrimeReact's `Dialog`'s own
  `onHide` behavior today (RAC's `ModalOverlay` with `isDismissable` provides the same two
  triggers natively) — no behavior change for either modal's existing "closes without saving"
  interaction.
- **A close-icon button in the dialog header, easily missed:** confirmed by reading PrimeReact's
  own type definitions (`node_modules/primereact/dialog/dialog.d.ts`), `closable` defaults to
  `true` and neither modal passes `closable={false}`, so both already render PrimeReact's default
  header close ("X") icon today, a third dismiss trigger alongside Escape and outside-click. `Dialog`
  must render an equivalent close-icon button (a `Button` in its header, calling `onOpenChange(false)`)
  to preserve this, not drop it as an oversight. Its accessible label is a **caller-supplied prop**
  (e.g. `closeLabel`), not self-translated inside `Dialog` — matching every other design-system
  component's own convention of taking text as props and never importing `useTranslation` itself
  (confirmed: none of `Select`/`Combobox`/`Checkbox`/`DateRangePicker` do). Needs one new i18n key
  (task 11.1) for the two callers to pass in.
- `HazardousEventSaveSubmitModal`'s role-gated option cards stay plain native `<input type="radio">`
  elements (unaffected by this migration — they were never PrimeReact), its publish-checkbox→
  action-switch logic (`setPublishChecked`/`setSelectedAction` pairing) is unchanged, only its
  `Checkbox` import moves from `primereact/checkbox` to this project's own already-existing
  `design-system/components/Checkbox.tsx` (a native `<input type="checkbox">` already, no new
  component needed for this one piece — confirmed directly reusable by reading it), and its
  disabled-submit logic (`isSubmitDisabled`) is unchanged.
- The validator `MultiSelect`'s filter+chip-display behavior is preserved by the new
  `MultiSelectCombobox`; the caller maps its existing `validatorOptions` (`{..., displayName}`) to
  the new component's fixed `{id, name}` option shape before passing them in (trivial, no behavior
  change — matches how `Select`/`Combobox` already use a fixed `{id, name}` shape rather than a
  flexible `optionLabel` prop).
- The `useEffect` reset-on-hide effect (`!visible` → reset `selectedAction`/`selectedValidators`/
  `publishChecked`) is unchanged — it depends on the `visible` prop, not on which dialog
  implementation renders it.
- `HazardousEventDiscardModal`'s two footer buttons (`Save as draft` primary, `Discard work and
exit` outline, in that visual order — design.md Decision 9 of the archived `ca-he-route-adapter-
write` change) keep the same order and the same two variants, now via the new `Button`
  component's `variant="primary"`/`variant="outline"` instead of `mg-button-primary`/
  `mg-button-outline` class strings.

**Completing `6c`.** `6c`'s own roadmap entry is currently marked "Routes done; `DEF-057`
spatial-footprint picker still open." This change already closes `DEF-057`; migrating these two
sibling modals in the same change closes the only other known gap against `6c`'s own scope, so
`6c` can be marked fully complete once this change ships and merges — not marked here (the roadmap
checkmark is an implementation/archive-time edit, tasks.md 12.2, after the change actually ships).

**Addendum (Gate 8 code-review fixes, implementation-time additions):** `MultiSelectCombobox`
gained two props beyond the above. `removeLabel: (name: string) => string` builds each chip's
remove-button accessible name — the same caller-supplied-text convention `Dialog`'s `closeLabel`
already established above, applied consistently rather than left hardcoded. Its `name` prop now
labels a hidden `<input type="hidden">` carrying the comma-joined `selectedIds` (the real,
form-submittable value), not the visible filter `<input>` (transient text) as first built —
matching `Combobox.tsx`'s own "`name` identifies the submitted value" contract and this app's
existing comma-joined multi-id hidden-field convention. Both are additive; the one current caller
(`HazardousEventSaveSubmitModal`) is unaffected since it submits via its own separate
`tempValidatorUserIds` field regardless. Separately, `Dialog` gained a `footer: ReactNode` prop
(caller-supplied footer content for the two modals' action buttons) — consistent with, not a
deviation from, its own `closeLabel` caller-supplied-text precedent above.

**Correction (Gate 10):** the hidden input above is NOT "correct for any future native-form
caller" as first claimed — RAC's `ModalOverlay` (this component's one real usage, inside
`Dialog`) portals its content outside the `<form>` DOM subtree entirely, so no input inside a
`MultiSelectCombobox` placed in a `Dialog` can ever submit natively, regardless of which input
carries `name`. The hidden-input fix is still a real improvement for a future non-modal caller;
the claim just overstated its scope for this component's actual (modal) usage.

**Addendum (Gate 9 visual-parity fixes, re-reviewed live and confirmed):** the search input and
the division-tree's row indentation each needed a missing CSS class (the latter via RAC's own
`--tree-item-level` inline custom property, confirmed live to land on the same row element the
className does). The map's status/error messages gained `role="status"`/`role="alert"` plus a new
shared `.dts-inline-error` class. `MultiSelectCombobox`'s filtered suggestion list had no popover
chrome; wrapping it in RAC's `<Popover>` broke option filtering in jsdom (confirmed via a failing
test, reverted), so the shared chrome class is applied directly to the inline `<ListBox>` instead
— confirmed live as an acceptable non-floating dropdown (border/shadow/hover/max-height all
render correctly; `width: var(--trigger-width)`'s missing fallback resolves to block-level `auto`,
visually matching the filter input above it, not broken). `MultiSelectCombobox`'s self-wrap in
`.dts-form-component` was NOT inert after all, correcting the earlier "accepted" note above: a
real end-to-end run (click a filtered option) failed with that `<div>` intercepting the click --
`.dts-form-component` is `display:grid`, and with no real grid parent to subgrid from here (this
caller is a plain flex div, not `HazardousEventFormField`), its children stacked into overlapping
grid cells instead of flowing normally. The static screenshot-only check in the first live review
couldn't have caught this, since it never exercised a real click on a rendered option. Fixed by
dropping `.dts-form-component` from this root (kept `.dts-form-component__label`, which is
self-contained) -- confirmed via the same E2E test, now passing.

**Two real, live-confirmed bugs the leaflet-draw edit/delete toolbar check surfaced, both fixed:**
(1) the map had no default center/zoom, so leaflet-draw threw "Set map center and zoom first" on
any draw attempt until a location search ran — fixed with the same `fitBounds`-or-`setView([0,0],
2)` fallback the read-only sibling `HazardousEventLocationMap.tsx` already uses; (2) the map
container's `h-80` height clipped the toolbar's edit/delete section below the visible area —
rendered and enabled correctly in the DOM, but unreachable by a real click (confirmed via a real
hit-test landing on a different element) — fixed by growing the container to `h-[27rem]`. The
E2E toolbar assertion was strengthened to check bounding-box containment against the map
container, since `toBeVisible()` alone doesn't hit-test this exact clipping failure mode --
red-checked against a reverted `h-80` (fails at the exact `buttonBox.y + buttonBox.height`
assertion, confirming it actually guards this bug, not just coincidentally passing). _(Superseded
in round 5: the on-map toolbar, the `h-[27rem]` container and that E2E containment check are all
gone — the Mapper's toolbar sits above a map that fills the remaining height.)_

**Separately, a pre-existing hydration race in the unrelated "parent-picker flow" E2E test**
(`he-preview-form.spec.ts`) — confirmed pre-existing via a base-branch comparison: base failed 1
of 2 counted runs with the identical `window.open()`-before-handler-attached timeout; on this
branch it failed every observed run before the fix, 2 of those on a confirmed-quiet machine. Not
proven that this change's added page weight worsens the race's odds — only that the race itself
predates this change. Fixed with this suite's own established `networkidle` convention
(`notices.spec.ts`'s identical fix for the same Playwright hydration-race issue), test-only, no
production code change.

## Risks / Trade-offs

- [The migrated `Dialog`'s visual chrome will not pixel-match PrimeReact's current stock
  `lara-light-blue` rendering, Decision 12] → This is an accepted, visible UI change for these two
  modals specifically — not a regression to avoid, since that stock appearance was never a
  deliberate design target in the first place (already flagged elsewhere in the design-system
  roadmap). Mitigation: Gate 9 (visual-parity-reviewer) checks the migrated modals against their
  own existing behavior and this design's own token table, not against PrimeReact's incidental
  current look.
- [Two existing dom tests assert literal `"mg-button-primary"`/`"mg-button-outline"` class-name
  strings (`HazardousEventDiscardModal.dom.test.tsx`), which stop matching once `Button.tsx`
  renders `dts-button--primary`/`dts-button--outline` instead] → Mitigation: update these
  assertions as part of the migration task (tasks.md), not left to fail silently; confirmed by
  reading the test file directly, not assumed.
- [RAC's `ModalOverlay`/`Modal` portal target must still be queryable the way
  `HazardousEventSaveSubmitModal.dom.test.tsx`'s existing icon-badge tests already query
  `document.body` (today, for PrimeReact's own portal)] → Mitigation: verify RAC's default portal
  target against the installed `react-aria-components` version during implementation; if it
  differs, update those assertions rather than letting them pass for the wrong reason or fail
  silently.
- [Leaflet-draw version/compat risk — `leaflet-draw@1.0.4` (the exact version legacy already
  loads, Decision 3) is unmaintained upstream and its last release predates Leaflet 1.9's own
  changes] → Mitigation: same risk legacy already carries today (it loads the exact same plugin
  from the exact same cdnjs URL); verify the specific interaction set needed (polygon/marker/
  rectangle/circle draw + edit + delete) against Leaflet 1.9.4 in a spike before committing the
  full task list, not assumed compatible (tasks.md 1.2).
- [`/api/geojson/:id` tenant-scoping gap, Decision 9] → **Resolved, fixed in this change** (tasks.md
  1.4), not merely flagged — the new division-boundary preview fetch (Decision 7) is what newly
  exposes this pre-existing gap to this UI path, so the human confirmed fixing the shared route's
  lookup rather than tracking it separately. Confirmed no legitimate caller (legacy included)
  depends on the unscoped behavior (Decision 9's own blast-radius note).
- [Nominatim free-text search, kept per Decision 11, is an unauthenticated third-party network
  call with no SLA] → Mitigation: it only orients the map view and never touches `geometries`/
  `divisionIds` (Decision 11) — a failed or slow request degrades to "not found"/unchanged map,
  never blocks or corrupts the picker's own save-relevant state; same exposure legacy already
  carries today, not a new one introduced here.
- [Division-list UI is new, not a port — risk of missing a legacy affordance (e.g. search-as-you-
  type across a large division set)] → Mitigation: Gate 9 checklist above states this isn't a 1:1
  structural port; sign-off is content/structure parity, confirmed with the human at Gate 9, not
  assumed from this design alone.
- [Concurrent callers of `ensureLeafletLoaded()`'s module-level promise cache, now shared by two
  CDN loads instead of one] → Mitigation: see `hazardous-event-spatial-footprint-picker` spec's
  own concurrent-callers scenario; the existing cache-then-resolve shape already handles this for
  one script tag, extended to two (Leaflet + leaflet-draw) without changing the pattern.
- [A degenerate/malformed drawn shape reaches PostGIS as a raw DB error, not a `ValidationError`
  — Decision 4's addendum] → Mitigation: client-side rejection of degenerate shapes before they
  ever enter picker state, not a server-side catch (none exists for this failure mode).
- [Every form-originated observation sets `note: null` (`parseSpatialObservation` never reads a
  `note` from the form, Decision 1 Addendum's wire contract) — a `note` set through the future
  REST API (`6f`) is silently dropped the next time this form records a new "current" observation]
  → Mitigation: none in this change (no UI for `note`, by design, proposal.md); flagged so it is
  not mistaken for an oversight if noticed later.
- [`leaflet-draw` requires `window.L` (base Leaflet) to already exist before it loads — legacy's
  own `ContentRepeater/index.tsx` loads it inside base Leaflet's own `onload` callback, not in
  parallel] → Mitigation: the extended `ensureLeafletLoaded()`/`ensureLeafletDrawLoaded()`
  (Decision 3) must preserve that ordering, not load both scripts concurrently; covered by its own
  spec scenario and test (tasks.md 2.2).
- [Test tier mismatch — any test needing real DOM interaction (simulated draw clicks, division-
  list keyboard/pointer interaction) must use the `*.dom.test.{ts,tsx}` naming convention to run
  under `vitest.config.ts`'s separate jsdom project; the default `*.test.ts(x)` naming runs under
  the `node` tier and has no DOM at all] → Mitigation: tasks.md names the correct suffix per test
  file below; confirmed by reading `vitest.config.ts` directly, not assumed from
  `HazardousEventLocationMap.test.tsx`'s own `renderToString`-only precedent (which doesn't need
  jsdom and is a node-tier test).
- [Stryker's Babel-based TS printer crashes instrumenting `useDivisionBoundaryPreviews.ts`
  (`TypeError` re-printing a `TSFunctionType` parameter annotation) — same root-cause family as
  the known implements-clause crash, different trigger construct, no Stryker score obtainable for
  this file] → Mitigation: covered by a direct `*.dom.test.tsx` file instead (fetch-once/dedupe/
  discard-after-deselect/error-swallowed scenarios; the discard-after-deselect scenario was
  explicitly red-checked against its own guard removed). These same four scenarios are also
  already exercised indirectly through `HazardousEventSpatialFootprintPicker.dom.test.tsx`
  (fetch mocked there too) — the new file adds direct isolation, not net-new coverage against a
  previously-zero-coverage file. Per standing guidance this gap is noted here, not as a new
  deferred-register entry.
- [The same Stryker/Babel crash family hits `Button.tsx`, `Dialog.tsx`, and
  `MultiSelectCombobox.tsx` too (task 10.12) — a third trigger shape: an exported interface's
  own property typed as a function signature, e.g. `onPress?: () => void`. All three unscoreable;
  confirmed via source/config read (not an empirical mutant run, since instrumentation never
  completes) that neither cause is a coverage gap on its own: the `vitest.config.ts` node-project
  include fix for `app/design-system/**` is still in place, and Stryker's vitest-runner wires
  both the node and dom projects whenever it gets far enough to run tests] → Mitigation: none
  available short of an instrumenter/Babel version fix; manual code review is the substitute.
  Per standing guidance, noted here rather than as a new deferred-register entry.

- [**Superseded, re-scoped (Revision 2):** the picker's own existing `.dom.test.tsx` (task group
  5), the entry-dialog's own test (task group 9c), and the summary function's own test
  (`buildSpatialFootprintSummary.test.ts`) all assert against the now-superseded collapsed-summary/
  single-Add-Edit-button structure — moving to a row table with per-row Edit/Delete and a nested
  Add dialog (Decisions 13-14/16) means these tests must be restructured again, not just patched a
  second time] → Mitigation: task group 9d's cleanup-first ordering removes/rewrites each
  superseded test file before any new rebuild test is written, so no test file is left asserting
  either the original always-visible layout or the Revision-1 entry-dialog layout.
- [Nesting a `<form onSubmit>` for the search bar inside the map tool's own `Dialog` (Decision 15)
  risks an accidental interaction with the outer page-level `<Form method="post">` if `Dialog`'s
  portal target ever changes] → Mitigation: covered by the same portal-target verification Decision
  12's own Risks entry above already requires; no new verification mechanism needed, same
  dependency.
- [**New (Revision 2):** the map tool's `Dialog` now nests inside the Add dialog's own `Dialog`
  (Decision 14) rather than rendering as a sibling of it — two RAC `ModalOverlay` instances open at
  once, both portaled to `document.body` at the same `.dts-dialog-overlay` `z-index: 1000`, relying
  on later-mounted-renders-on-top DOM ordering for correct stacking, and on each `ModalOverlay`'s
  own focus-trap not fighting the other's] → **Confirmed empirically, 9d**: a real-browser E2E run
  (`tests/e2e/hazardous-events/he-preview-form-spatial-footprint.spec.ts`) opens Add, opens the
  nested map dialog, draws and Saves a real shape, returns to the Add dialog's own summary field,
  and Applies — all against a live Chromium instance, not jsdom. Stacking/focus return to the Add
  dialog after the inner one closes, confirmed working as designed. **Escape-mid-draw (task
  9d.6.1) and DRAWSTART/DRAWSTOP for every draw tool (task 9d.6.4) are now also confirmed live**,
  not just in jsdom: a `L.Map.prototype.fire` hook injected into a real running instance
  confirmed `draw:drawstart` fires immediately on toolbar activation and `draw:drawstop` fires on
  Escape-cancel, for all five tools (polygon, marker, rectangle, circle, polyline) — each time the
  map dialog ("Draw on map") stayed mounted through the cancel, confirmed by querying for both
  dialog panels' own titles in the live DOM, not inferred from one ambiguous selector match. A
  final Escape with no draw active closed the map dialog normally, leaving only the Add dialog.
- [**New (Revision 2):** Decision 17(c)'s Escape-during-draw fix depends on leaflet-draw's own
  `DRAWSTART`/`DRAWSTOP` events firing reliably for every draw tool (polygon/marker/rectangle/
  circle/polyline) — if any one tool's handler doesn't fire `DRAWSTOP` on its own internal Escape
  handling (a known inconsistency class in older Leaflet plugins), that tool's mid-draw Escape
  could still leak through to `ModalOverlay` and close the dialog] → **Resolved, confirmed live
  (task 9d.6.4)**: a `L.Map.prototype.fire` hook against a real running instance confirmed both
  events fire for all five tools (polygon/marker/rectangle/circle/polyline), each correctly
  leaving the map dialog open through an Escape-cancel. Not assumed from the fix's own jsdom
  red-check alone, which only exercised the mocked map's own synthetic DRAWSTART/DRAWSTOP calls,
  not leaflet-draw's real per-tool firing behavior.
- [**New (Revision 2), confirmed not to need a code fix, but tracked:** a live DB check found a
  real fixture record with a genuine saved geometry row in
  `hazardous_event_spatial_observation_geom`, yet legacy's own detail/view page's "Location"
  section still shows "No location details available" for it — legacy's own read path is
  disconnected from the new CA spatial-observation tables entirely. Confirmed pre-existing and
  unrelated to this change (legacy's own code is not touched here); CA's own detail page was
  separately confirmed correct for the same fixture record (a real Leaflet map rendering the saved
  polygon, per Decision 10's own already-shipped work)] → **Not fixed here, by explicit scope
  decision** — legacy's own read path is out of this change's boundary (Non-Goals, unchanged).
  Documented here so it is not mistaken for a regression this change introduced if it is noticed
  again later.
- [**Open, not resolved by this design alone, flagged for Gate 9 to confirm against the human:**
  whether legacy's own "Preview map" affordance renders division boundaries at all when the
  recorded item is geographic-level-only, or whether it (like `HazardousEventLocationMap`) is
  itself map-coordinates-only and simply disabled/empty for a division-only legacy item too] →
  Mitigation: Decision 14's "Preview map" already defensively combines `geometries` with fetched
  division boundaries regardless of which answer turns out to be true, so this change's own
  behavior is strictly not worse than a `geometries`-only preview either way; Gate 9 confirms
  against a live legacy Preview-map click on a division-only item if one exists in seed data, and
  notes the actual legacy behavior here once confirmed, rather than leaving it assumed.

## Open Questions

The row-granularity question this design previously carried into Gate 9 is now resolved by the
live walkthrough, not guessed (Decision 16). The one open question this design previously carried
before Revision 1 (whether the picker's own division-list/map dialog chrome should become a new,
reusable `Dialog.tsx`) is also resolved: Decision 12 builds it, shared by the picker's own chrome
(Decisions 2/5/14) and the migrated `HazardousEventSaveSubmitModal`/`HazardousEventDiscardModal`
alike — one implementation, not a one-off per caller.

**Resolved at Gate 9:** the Preview-map division-boundary question (Preview map combines the
selected divisions' boundaries with `geometries`, Decision 14), and the map dialog's sizing —
`size="wide"` was replaced by the full-screen Mapper in round 5 and removed.

### Addendum (9d implementation-time additions, artifact-drift update)

- **New file, not in the original list: `HazardousEventSpatialFootprintMapDialog.tsx`.** Decision
  14 requires the map tool's own dialog to have explicit Save/Cancel semantics (buffer locally,
  commit only on Save) — a behavior the existing `HazardousEventSpatialFootprintMap` doesn't
  provide on its own (every draw/delete mutates its caller's state immediately). This new wrapper
  owns that buffer, `size="wide"`, and the Save/Cancel footer, shared identically by the Add
  dialog's "Open map" session and a geometry row's direct Edit action, so the wiring exists once.
  _(Since round 5 it is the full-screen "Mapper" with no footer: the map's own Save Coordinates
  calls `onSave`, × discards, and the dialog only snapshots `initialGeometries` at open and gates
  Escape while a draw is active. The map's `onGeometriesChange` prop had no production caller
  after that and was removed in 9k.)_
- **Preview map's own `Dialog` also used `size="wide"`** until round 5, when both it and the map
  tool moved to the full-screen variant and `size="wide"` was removed.
- **`describeGeometry`'s own text is not translated.** It stays fully literal English (matching
  Decision 16's "Shape: TYPE never translated" stance, extended here to the whole Lat/Lng summary
  line), so no new i18n keys were added for it. Flagged for sign-off: if this should instead be
  translated per-locale, this needs revisiting.
- **Division rows resolve their breadcrumb `path` via the division-list dialog's own exported
  `fetchDivisionTree`/`findNode`**, not a second fetch mechanism — the picker calls these directly
  on mount/whenever `divisionIds` changes, sharing the same module-level cache Decision 5's dialog
  already established. _(9k: all four callers now share `useDivisionTree` + `divisionLabel`,
  below.)_
- **Edit → delete the only shape → Save removes that row entirely**, not merely clearing its
  geometry to an empty/invalid value — treated the same as that row's own Delete action. Not
  explicitly spelled out by Decision 14's own text; flagged as a reasonable, bounded interpretation
  rather than a silently-assumed one.
- **More than one shape drawn in a single Add/Edit map session:** unspecified by Decision 14,
  which assumes one shape per session throughout. The implementation takes only the first drawn
  shape (`buffered[0]`) on Save/Apply; any additional undeleted shapes from that same session are
  silently not committed. _(Resolved in round 5: one shape per item — drawing another asks to
  replace the current one, Decision 14.)_

### Addendum (Gate 5 SOLID review, 9d)

Two concrete, mechanical findings fixed in this same round:

- **Escape-mid-draw's document-level listener** replaced with an explicit `onDrawActiveChange`
  callback + `Dialog`'s new `dismissDisabled` prop — see the revised Decision 17(c) text above
  (round 5 added a separate, non-intercepting listener that only cancels the draw).
- **`fetchDivisionTree`/`findNode`/`collectAllIds`/`DivisionTreeNode`** extracted out of
  `HazardousEventDivisionListDialog.tsx` into a standalone `divisionTree.ts` module (plus its own
  test file), so the picker's row-label resolution depends on a plain data module, not a sibling
  dialog component's internals. `HazardousEventDivisionListDialog.tsx` now imports from it too.
  (`collectAllIds` was later removed in 9k — only its own test used it.)

One finding flagged for a human fix-vs-defer decision, not acted on unilaterally: the reviewer
suggested extracting a `useSpatialFootprintRows` hook out of
`HazardousEventSpatialFootprintPicker.tsx` to separate state/fetch/row-derivation/serialization
from dialog/table composition. This is a larger restructuring of an already-fully-tested, working
component late in this round — flagged for the human to decide whether to do now or defer, not
done here.

### Addendum (Gate 8 code review, 9d)

Fixed, bounded and mechanical:

- **`describeGeometry.ts` dumped one line per ring point**, including a polygonized circle's
  64-point ring — unusable UI. Now caps at 8 corners before switching to a `"N corner points"`
  count summary.
- **Add-dialog Apply on an all-duplicate division selection silently closed** as if it had
  committed something. Now stays open (no-op) when the dedup filter leaves zero new ids, instead
  of closing with nothing added.
- **`as any` casts in `HazardousEventSpatialFootprintMap.dom.test.tsx`'s outside-division
  assertions** replaced with the same typed cast
  (`as Parameters<typeof checkShapeAgainstDivisions>[1]`) the production code uses. The file's
  fake Leaflet setup still declared `any` until 9k, which replaced it with local types
  (`FakeMap`, `FakeLayer`, `FakeDrawTool`, …) — the file now has no `any`.
- **The map tool's `Dialog` title reused the "Map coordinates" radio-option label** for both the
  Add session's nested map dialog and a row's direct-Edit map dialog. New
  `form.spatial_footprint.map_dialog.title` key used instead (then "Draw on map"; "Mapper" since
  round 5).

Flagged, not acted on (reach outside this round's own diff):

- `MultiSelectCombobox.tsx` and `HazardousEventDivisionListDialog.tsx` independently hand-roll an
  identical removable-chip-row pattern, built across two different rounds of this same change —
  worth a shared `Chip`/`ChipList` design-system primitive, but `MultiSelectCombobox.tsx` is an
  earlier round's already-shipped, already-gated component; refactoring it now is outside this
  round's scope.
- `divisionGeometry.ts`'s `toDivisionGeometry() ?? d.geojson` fallback (earlier round, Decision 4's
  addendum) masks rather than guards against a division's malformed stored `geojson` reaching the
  outside-division check, which expects a strict Geometry. Low likelihood, pre-existing, not
  touched by this round — flagged for a future pass, not fixed here.

### Addendum (test-quality-auditor, 9d)

Scoped to exactly `describeGeometry.ts` and `divisionTree.ts` — the two genuinely risky new
pure-logic files this round; everything else is wiring/UI, already covered by dom tests, E2E, and
Gate 9, per standing guidance. Mutation score 82.81% overall (`describeGeometry.ts` 80.43%,
`divisionTree.ts` 88.89%); no instrumenter crash on either file (both files' own types are plain
data, not function-typed interface members — the documented crash family above doesn't apply).

5 real gaps found, all fixed with new test cases: `dropRingClosingPoint`'s 0/1-point early-return
guard was uncovered; every Polygon fixture used an already-closed ring, so the closing-point
match's `&&`/`||`/single-operand mutants all survived (added an open-ring case and both
single-axis-match cases); the `?? []` fallback for a ring-less Polygon and the empty-coordinates
LineString guard were both unreached; `findNode`'s "keep searching later siblings" path was
unexercised since the fixture tree only ever had one node per level (added a two-sibling case).
One survivor (`divisionTree.ts`'s thrown error message text) judged low-value, matching this
project's own stance that message-wording mutants aren't unit-test-worthy — left as-is.

### Addendum (Gate 10 independent second-opinion review, 9d)

Three findings fixed:

- **`fetchDivisionTree`'s module-level cache ignored its own `url` argument once warm** — a
  resolved/in-flight promise for one language segment's tree was returned for a _different_
  language's request too, silently. Fixed: keyed the cache by `url` (a `Map`, not a single slot),
  matching the real reason `leafletLoader.ts`'s own analogous single-slot cache is safe (its CDN
  URL is a hardcoded constant; this one varies with the current `$lang` segment). New test added
  proving two different URLs don't share a result, red-checked against the reverted single-slot
  version.
- **The map-dialog's render-time reset wrote to a ref during render** (`wasOpenRef.current = ...`),
  deviating from React's own documented-safe version of this exact pattern (store the previous
  value in `useState`, not a ref — a ref write during render is explicitly called out as unsafe).
  Fixed: replaced the ref with a second `useState`. A new test wraps the reopen-transition
  scenario in `<StrictMode>` to guard against the double-render hazard this deviation could cause.
  **Empirically, the red-check against the reverted ref-based version did not reproduce the
  hazard in this project's installed React/testing-library versions** — noted honestly rather than
  overclaiming the test proves the old code was broken; the fix is still the objectively correct,
  documented-safe idiom regardless, and the new test is a real regression guard for the future.
- **`HazardousEventSpatialFootprintEntryDialog` didn't clear the inactive item-type's staged
  value when the radio switched** — a user who staged a shape, switched to "Geographic level," then
  back to "Map coordinates" within one Add session would see the stale shape summary reappear.
  Cosmetic only (never reached `handleApply`, which only reads the field matching the _current_
  `itemType`), but cheap to fix: both radio `onChange` handlers now clear the other type's staged
  value.

One finding flagged for a human decision, not acted on: `dismissDisabled` only suppresses
Escape-to-close; the header close (`×`) button and outside-click can still discard the entire
buffered session (every shape drawn and saved so far, not just the in-progress one) while a draw
is active, with no guard and no confirmation — the same hazard class as the Escape bug, left
half-fixed. This may be an accepted scope boundary (only the Escape case was ever reported as a
bug) or worth widening — a conscious call for the human to make, not decided here.

### Note: a large-batch Vitest flake in this environment, investigated and not a code defect

Running 6+ of this round's own `.dom.test.tsx` files together in one `vitest run` invocation
intermittently fails (a `TestingLibraryElementError: Found multiple elements`, or a test timeout),
always cascading from one test exceeding the 5000ms default timeout under load -- when that
happens, its `afterEach` cleanup never runs before the next test starts, leaving stale DOM behind.
Investigated at length (added `cleanup()` to every file's `afterEach` per this project's own
`HazardousEventLocationMap.dom.test.tsx` precedent; removed a `vi.resetModules()` call that
turned out not to be the cause; mocked `divisionTree.ts` directly in the picker's own test to
remove a real module-cache concern unrelated to this flake). Every file passes reliably standalone
and in small combinations; only large simultaneous batches in this specific sandboxed environment
(confirmed via `Get-CimInstance Win32_OperatingSystem`: ~27% free memory during a long session with
several accumulated Node processes) hit this. Not a logic defect in the implementation or its
tests -- documented here per this project's own standing practice (e.g. task 10.9's hydration-race
note) rather than chased further. Run each touched file standalone or in small groups to verify;
large combined runs may need a re-run to rule out this same load-dependent flake.

### Addendum (Gate 9 visual-parity review, 9d)

Three real, live-confirmed findings, all fixed:

- **A geometry row's "Edit" action reliably opened a blank, non-interactive map on a user's first
  attempt per page session.** Root cause: `HazardousEventSpatialFootprintMapDialog`'s own buffer
  reset lived in a `useEffect` keyed on `isOpen`, which runs one render pass too late — the map
  mounts fresh on the same render where `isOpen` first flips true, so its own one-time
  (`[]`-deps) mount-time prefill effect would read the _previous_ session's stale buffer, which
  the effect only corrects afterward (too late for that one-time effect to see). Fixed by
  resetting the buffer during render instead (React's documented "adjust state while rendering"
  pattern), so the corrected value is already in place before the map ever mounts with it. A
  mocked-map test can't reproduce this race (a mock reads props live, masking the real
  mount-effect timing); the regression test lives in `HazardousEventSpatialFootprintMap.dom.test.tsx`
  against the real `HazardousEventSpatialFootprintMapDialog` + real `HazardousEventSpatialFootprintMap`,
  red-checked against the reverted `useEffect` version.
- **The actions row was missing legacy's `padding: 0.71rem`** — an incomplete port. (Moot since
  round 2: `Section` now uses legacy's `.content-repeater-actions` class directly.)
- **The Add dialog had no explicit "Cancel" button**, unlike legacy's own "Add new item" dialog
  footer (Apply + Cancel side by side). Functionally equivalent to the existing Escape/
  outside-click/close-icon dismissal, but a visible chrome gap against the cited precedent with no
  stated reason to drop it. Added, calling the same `onDismiss` path.

One item traced to source but not independently re-verified live by this reviewer pass alone
(Preview map's combined geometry+division rendering with both present simultaneously): already
covered by `HazardousEventSpatialFootprintPicker.dom.test.tsx`'s own "Preview map opens a dialog
containing the read-only map, fed geometries plus every selected division's boundary" test and by
the E2E spec's "Preview map shows a combined view of a drawn shape and a selected division's
boundary" case, both of which exercise a shape and a division together. Not re-flagged as open.

### Addendum (Gate 9 round 2 — user's side-by-side review against legacy and Attachments)

The first Gate 9 pass checked behaviour, not looks; the user found these visual gaps, all fixed:

- **Table header** didn't match (font size, centered Actions). Fixed by `Section` using legacy's
  `.content-repeater*` classes (Decision 13) and a right-aligned, content-width Action column.
  `TableColumn` gained a `className` passthrough for this.
- **No Option column** to tell item types apart. Added as the first column; columns are now
  Option / Value / Action (Decision 14). "Item" was renamed "Value".
- **Text "Edit"/"Delete" buttons** instead of legacy's icons. Now `pi-trash`/`pi-pencil` icon
  buttons (`Button` `icon` variant, tooltip via `title` on the `aria-hidden` icon, since RAC's
  Button doesn't accept `title`).
- **Add / Preview map** used the blue outline style. Now legacy's `mg-button mg-button-system`
  (`Button` `system` variant; `outline` left untouched for the modals using it). Known residual:
  disabled Preview map gets legacy's own `:disabled` grey rather than legacy's 0.5 opacity on an
  `<a>` — matching that would need untokenized colours.
- **"No shapes or divisions added yet."** existed in neither legacy nor Attachments. Removed.
- **Division rows had no Edit.** Added (Decision 14).
- **Gap before Attachments** was 64px vs legacy's 48px: `.dts-form-component`'s own bottom margin
  stacked on the cards' `.content-repeater` margins. Both card fields now pass `!mb-0` through
  `HazardousEventFormField`'s new `className` prop; measured gaps now equal legacy's (40/48/24px
  above/between/below).
- **Screen-reader labels escaped "/" as `&#x2F;`** (e.g. "Delete Abyan Governorate &#x2F; Sibah").
  Runtime i18next escapes interpolations by default; the tests had turned that off, hiding it.
  Fixed with `interpolation: { escapeValue: false }` on the three label calls (React escapes
  already), and both test files now use runtime-default escaping.

### Addendum (9k: approved fixes from the 9j gate run)

- **Mapper replace-on-create and edit validation** — see "One shape per item" and "Edit shape"
  under Decision 14. "Proceed" only arms the replace (a ref the mount-time CREATED handler
  reads); CREATED consumes it, and leaving a mode or DRAWSTOP disarms it. A pending
  outside-division warning carries its own `replace` flag, since leaflet-draw fires DRAWSTOP
  right after CREATED, before the user answers.
- **Shared division-tree lookup.** `useDivisionTree(enabled)` (new `useDivisionTree.ts`) wraps
  the cached `fetchDivisionTree` and returns `{status, tree}` (loading / ready / error; a failed
  fetch retries when re-enabled); `divisionLabel(tree, id, t)` gives the breadcrumb path or
  "Unknown division (id)". The picker rows, the Add/Edit dialog's read-only field, the tree
  dialog's chips and `HazardousEventDivisionNames` all use them — so the Add/Edit dialog now
  shows the unknown-division label instead of a raw id. Every hook instance reads the shared
  cache (`cachedDivisionTree`): it starts `ready` when the tree is already loaded, and an instance
  that errored or was mounted disabled picks up a tree another instance loads later — so a
  successful retry anywhere fixes every label, and there is no "Unknown division" frame right
  after Apply. Before the very first load completes, rows and chips show that label briefly
  (left as-is by the human's decision, below). It lives in its own file so tests that mock
  `./divisionTree` still reach it.
- **Cache scope: URL only, relying on a tenant/user change being a full page load in that tab.**
  The `fetchDivisionTree` promise map and `cachedDivisionTree` are keyed by URL (language) alone
  and refresh only on a full page load; the client has no tenant id to key on. Every place that
  sets `countryAccountsId` reloads the document in the tab that made the change:
  `selectInstanceService.ts` (`redirectDocument` after setting it), `login.tsx`
  (`redirectDocument`), and the SSO login (`?code=` branch) and callback routes, which are only
  reached by the identity provider's full-page redirect. Logout and TOTP login are client-side:
  logout ends the session, so HE pages redirect to login, whose tenant-setting paths use
  `redirectDocument`; TOTP login starts a session with no tenant, so HE pages redirect to
  select-instance, whose action uses `redirectDocument`. If switching ever becomes client-side
  (no full load), the cache must be keyed by tenant or cleared on switch/logout.
- **Smaller fixes.** The Add/Edit and tree dialogs reset their session during render (first
  frame is never the previous session); `useDivisionBoundaryPreviews` returns a memoized array,
  so Preview map no longer rebuilds (and loses pan/zoom) on unrelated re-renders;
  `describeGeometryParts` gives the dialog the summary's title and lines (list keyed by index —
  lines can repeat), `describeGeometry`'s text unchanged; the read-only fields are named by their
  card caption ("Map coordinates" / "Geographic level"), not the placeholder their button shares;
  dead code removed (`onGeometriesChange`, `collectAllIds`, unused `leafletLoader.ts` members,
  the `DivisionTreeNode` re-export).
- **Agreed follow-up, not done in this change:** `HazardousEventSpatialFootprintMap.tsx` (~650
  lines) should be split — extract a pure `classifyDrawnShape` (degenerate / outside-division /
  ok) and optionally a `MapperToolbar` component; move the picker's row transforms (add, edit,
  delete, division-edit replace) into a pure module. Agreed with the human at 9j; deliberately
  not in the deferred-items register.
- **Degenerate-shape message lifetime.** The "too few points" alert clears when a tool starts,
  on Escape mid-draw, and on Save Coordinates (cleared before the edit commit, so a rejected
  edit's own message still shows); each rejection re-keys the alert, so a second identical
  rejection is announced again.
- **Decided by the human, left as-is (9k reviews):**
  - First load: on an edit page prefilled with divisions, rows read "Unknown division (id)"
    until the first tree fetch resolves.
  - A rejected edit reuses the new-shape wording ("Shape not added…", "Discard shape").
  - Undo with 0–1 polygon/line points does nothing (leaflet-draw's own guard); Escape cancels.
  - Undo after a rejected edit/draw removes the restored shape — consistent with "Undo with no
    draw in progress removes the shape".
  - Cross-tab: the tenant lives in a shared cookie, so switching tenant in tab B leaves tab A's
    division-tree cache on the old tenant until tab A reloads. Accepted: display-only (the server
    scopes divisions by tenant), and a real fix needs a new server-sent tenant id. Within one tab
    it can't happen (see "Cache scope" above). Divisions edited under geography settings likewise
    show only after a reload.
  - Remaining nits: the legacy tree endpoint builds names in "en" only, the cached
    `response.json()` has no shape check, `hiddenData`'s type, the degenerate message keeps the
    language it was shown in, some tests check only end state, one extra `setState` on a
    ready start.
- **Test note:** the picker and division-names dom tests warm their component's module once in
  `beforeAll` (60s hook limit); the cold compile took 5–21s under memory pressure and, past the
  5s per-test default, its late render leaked into the next test.

## Blocking Decisions (must be resolved with the human before task group 3 is implemented)

All of this design's original blocking decisions are now resolved with the human; see Decisions 1
Addendum, 9, 10, and 11 above, and the resolution below for the last one.

1. **Division list: flat vs. hierarchical** (Decision 5) — **resolved: hierarchical.** Confirmed
   `TreeView.tsx` is PrimeReact-coupled and won't be reused as-is (Decision 5). The real tenant-data
   queries task 1.3 names (max `level` per tenant; duplicate `name->>'en'` per tenant) were **not**
   run — DB access was unavailable in the implementing environment. This decision is made on the
   existing, already-read evidence instead, not on those queries:
   - `app/utils/geoValidation.ts`'s `extractDivisionHierarchy()` already handles GADM-format
     imports up to **admin level 4** (`GID_4`/`GID_3`/`GID_2`/`GID_1`/`GID_0`) — a real, already-
     coded 5-level-deep case, not a hypothetical one this design is guarding against speculatively.
   - `divisionTable`'s only uniqueness constraints are `(countryAccountsId, importId)` and
     `(countryAccountsId, nationalId)` — nothing in the schema prevents two divisions at different
     levels of the same tenant's hierarchy from sharing a `name`, so a flat list's own "parent-
     qualified label" mitigation (Decision 5's own caveat) would be load-bearing, not optional,
     for any tenant with real GADM-depth data.
   - `_docs/division/division_import_guide.md` documents an existing `divisionBreadcrumb(languages,
id, countryAccountsId)` function that already generates a hierarchical breadcrumb path for a
     division — reusable for the division list's own parent-qualified display, so building a real
     tree isn't starting from nothing.
     Given a real, already-shipped 5-level-deep import path and no schema-level protection against
     same-tenant name collisions across levels, a flat list's own safety condition ("no tenant's
     divisions are more than one level deep or have colliding names") cannot be assumed to hold.
     Task group 3 builds a real parent/child tree, not a flat list.
