## Why

`HazardousEventFormPage.tsx` (lines 219-230) renders only a static placeholder `<p>` for
"Spatial footprint," with a permanently-empty hidden `spatialObservation` input and
`spatialObservationChanged` hardcoded to `"0"`. No code path can ever flip it to `"1"`, so
`CreateHazardousEventUseCase`'s and `UpdateHazardousEventUseCase`'s own conditional
`RecordSpatialObservationUseCase` composition — already wired end-to-end, tested, and consuming
exactly the `{ geometries, divisionIds }` JSON shape `parseHazardousEventFormData.server.ts`
already parses — can never actually fire from the CA UI (`DEF-057`). This is the last open item on
`6c` (`feature/ca-he-route-adapter-write`, archived with routes done but this gap explicitly
flagged). Confirmed still needed: no later intent resolved it, and `6c`'s own roadmap entry is
still marked "`DEF-057` spatial-footprint picker still open."

## Revision (2026-11-19): presentation-layer restructuring from a live Chrome review

The picker below was already substantially implemented when a live Chrome review against
legacy's actual form surfaced four confirmed, not assumed, UX problems: no section chrome (the
picker was a bare label with the map/button always inline, unlike the sibling `attachments`
field's own grey-card/single-action chrome on this same form); no entry step (legacy always asks
"Map coordinates or Geographic level?" first, the new picker showed both at once); an unstyled,
button-shaped-but-not-button-styled location-search control; and no Enter-key search submission.

**The fix is presentation-layer only — the data model is unchanged.** `SpatialObservation`'s one
combined `geometries[]`/`divisionIds[]` set, the hidden-field serialization, and every other
already-shipped decision below stand as-is. The picker now renders inside a new `Section`
chrome (grey card, bold caption, single Add/Edit action, design.md Decision 13), gates the map and
the division-list dialog behind a new entry-step choice dialog mirroring legacy's own radio choice
(design.md Decision 14), and fixes both search-button bugs where the search bar now lives, inside
the relocated map dialog (design.md Decision 15). See design.md's "Revision" subsection and
Decisions 13-15 for the full reasoning; see tasks.md group 13 for the restructuring work itself.

## Revision 2 (2026-11-19): row-table rebuild from a full, screenshotted live Chrome walkthrough

A second, full live Chrome walkthrough of legacy's actual form — every step performed and
screenshotted, not assumed — found that Revision 1's collapsed-summary-behind-one-Add/Edit-button
design (Decisions 13-14 above) does not match legacy's real structure: legacy renders a **table of
independently-managed rows**, one per recorded item, each with its own Edit (geometry only) and
Delete actions — not a single combined summary. **Decisions 13 and 14 are revised in place** (not
left standing alongside new, contradicting text) to describe this instead; a new Decision 16
resolves the row-granularity question (one row per geometry, one row per division) and specifies
the "Shape: `<TYPE>`" + Lat/Lng summary legacy's own Add dialog shows after a shape is saved; a new
Decision 17 fixes four previously-unfixed Gate 9 findings in this same pass: the map dialog's
~270px shrink-to-fit width, Escape mid-draw silently discarding the in-progress shape, a confirmed
root-cause bug where deleting a reloaded (prefilled) shape via click+Save doesn't persist, and the
Section action-placement mismatch Revision 1 left unfixed. **Still presentation-layer only** — the
`geometries[]`/`divisionIds[]` data model, hidden-field serialization, and every Decision 1-12/15
mechanic are unchanged. See design.md's "Revision 2" subsection and Decisions 13/14/16/17; see
tasks.md group 9d, ordered cleanup-first, for the rebuild work itself.

## What Changes

- Add an interactive spatial-footprint picker to `HazardousEventFormPage.tsx`, replacing the
  static placeholder, supporting both of legacy's two selection modes — freehand map drawing
  (point/line/polygon/rectangle/circle) and geographic-level (division-tree) selection — because
  `SpatialObservation.create()` accepts `geometries` and `divisionIds` together, not as a mutually
  exclusive either/or choice the way legacy's per-item `map_option` models it. **Revised (Revision
  2):** the picker's own chrome now matches the sibling `attachments` field's grey-card section
  with a real Title/Action-style row table below it (one row per geometry, one row per division,
  design.md Decision 14/16) and an Add/Preview-map action row below that — not a single Add/Edit
  button and not both tools shown inline at once. Adding an item opens a dialog whose radio
  (Map coordinates / Geographic level) inline-reveals that type's own field and trigger button
  ("Open map" / "Select"); editing a geometry row jumps straight to the map tool, pre-loaded with
  that one shape (design.md Decisions 13-14).
- On change, the picker serializes its current selection into the existing hidden
  `spatialObservation` (`{ geometries: unknown[], divisionIds: string[] }` JSON) and
  `spatialObservationChanged` (`"1"`) fields — the wire contract `parseHazardousEventFormData.server.ts`
  and both route actions already implement; no backend, use-case, domain, or DTO file changes.
- Edit mode prefills the picker from the event's `currentSpatialObservation` (the loader already
  fetches it; it's `HazardousEventFormInitialValues` and the edit route's own `initialValues={...}`
  mapping that silently drop it today — design.md Decision 8), shown already-selected on the map
  and in the division list, immediately editable (no separate "edit mode" toggle — matches how
  every other field on this form already renders: populated and directly editable, not read-only-
  first).
- Extend `extractFormFieldErrors.ts`'s `KNOWN_FIELDS` (plus a small singular-to-plural alias) so a
  `ValidationError` thrown by `SpatialObservation.create()` for a duplicate or stale/foreign
  `divisionIds` entry surfaces as an inline field error under the picker, not a 500 via the
  generic error boundary — the two realistic validation failures this UI can actually trigger
  through the form (see design.md Decision 6; a `geometries`-shape error is not reachable this
  way, since the existing parser already coerces it to a valid array first).
- No UI for `observationTime`/`note`/`confirmReplace` — matches the wire contract's own existing
  omission (`parseSpatialObservation` never reads these three fields today); the recorded
  observation is always "now," same as the current, UI-less behavior. Historical/backdated
  observations stay REST-API-only (`6f`'s `POST /:id/spatial-observations`).
- Fixes `/api/geojson/:id`'s pre-existing tenant-scoping gap (no `countryAccountsId` filter on its
  division lookup) as part of this change, not deferred — the picker's own new division-boundary
  preview fetch (design.md Decision 9) is what newly exposes this gap to a UI path, which tips the
  balance toward fixing the shared route's lookup here rather than tracking it separately.
- Fixes `HazardousEventDetailPage.tsx`'s Location Card to also render `currentSpatialObservation.
divisionIds` (design.md Decision 10) — previously a division-only observation (no hand-drawn
  shape) was recorded correctly but never visible anywhere on the detail page. Display-only; raw
  division ids, no name resolution (no DTO/application-layer change); does not copy a division's
  boundary into `geometries` (Decision 1's geometry/division separation is unaffected).
- Keeps, rather than drops, legacy's Nominatim free-text location search and its outside-division
  warning (`checkShapeAgainstDivisions`) — both ported as real, wired affordances using
  `react-aria-components` chrome (design.md Decision 11), not left unwired or cut for scope.
  **Revised:** the search control now uses the design-system `Button` (previously an unstyled
  native `<button>`) and supports Enter-key submission via a local form submit (previously
  wired to `onClick` only) — both confirmed as real bugs in a live review, fixed in the same edit
  that relocates the search bar into the map tool's own dialog (design.md Decision 15).
  _(Round 5: the Search button was dropped — Enter-only, as legacy's Mapper.)_
- **Revision 2:** rebuilds the picker's own Section into a real row table (reusing the existing
  `Table`/`TableColumn`/`TableRow`/`TableCell` design-system family already used by
  `HazardousEventListPage.tsx`, design.md Decision 14) with per-row Edit/Delete
  actions and an Add/Preview-map action row below it; rewrites the Add dialog to inline-reveal its
  chosen type's field (no Title field, design.md Decision 14); adds the post-save
  `"Shape: <TYPE>"` + Lat/Lng summary and switches the division chip/row label from a division's
  bare name to its breadcrumb `path` (design.md Decision 16); fixes the map dialog's shrink-to-fit
  width, Escape-during-draw discarding the in-progress shape, and a confirmed root-cause bug where
  deleting a reloaded (prefilled) shape doesn't persist (design.md Decision 17).
- Migrates this form's two existing sibling modals (`HazardousEventSaveSubmitModal`,
  `HazardousEventDiscardModal`) off PrimeReact onto three new `react-aria-components`-based
  design-system primitives (`Button`, `Dialog`, `MultiSelectCombobox` — design.md Decision 12),
  as a parity port with no behavior change (role-gating, publish-checkbox→action-switch logic,
  validator multi-select with filter+chips, disabled-submit logic, reset-on-hide effect all
  preserved). Originally logged as a deferred follow-up (`DEF-060`); the human reviewed it and
  asked for it to be fixed here instead, so roadmap item `6c` can be marked fully complete once
  this change ships. `DEF-060` is removed from the register, not left open.
- **BREAKING for no one** — this is additive UI plus three narrowly-scoped fixes; the hidden-field
  contract and both route actions are unchanged.

## Capabilities

### New Capabilities

- `hazardous-event-spatial-footprint-picker`: the interactive create/edit-form widget itself —
  rendering, map drawing, division-tree selection, prefill from an existing observation, and
  serialization into the existing `spatialObservation`/`spatialObservationChanged` hidden fields.

### Modified Capabilities

- `hazardous-event-write-route-adapter`: adds two requirements — the edit route's component now
  passes the already-resolved `event.currentSpatialObservation` through to the form for prefill
  (the loader already fetches it; nothing new to fetch), and the edit/create actions' field-error
  mapping now recognizes a `divisionIds`-shape `ValidationError` (plural and singular message
  forms).
- `hazardous-event-detail-page`: adds a requirement — the Location Card now also renders the
  current observation's `divisionIds`, not only its `geometries`, closing the gap where a
  division-only observation was invisible on the detail page (design.md Decision 10).
- `design-system-components`: adds three new primitives — `Button`, `Dialog`,
  `MultiSelectCombobox` — each styled with real legacy-sourced token values, no PrimeReact import,
  no domain-specific knowledge, matching this capability's existing requirements for every other
  component in the family (design.md Decision 12).

## Impact

**Files expected to change:**

- `app/domains/hazardous-events/presentation/web/HazardousEventFormPage.tsx` — replace the
  placeholder with the new picker component.
- `app/domains/hazardous-events/presentation/web/HazardousEventSpatialFootprintPicker.tsx`
  (existing) — composes the map and division-list components below; owns the combined
  `{ geometries, divisionIds }` state and hidden-field serialization. **Revision 2:** derives the
  row list (one row per geometry, one per division) from that same state and renders it via
  `Section`'s row table; owns per-row Edit/Delete, the Add dialog's own open/close, and
  the new Preview-map dialog (design.md Decisions 13-14/16).
- `app/domains/hazardous-events/presentation/web/HazardousEventSpatialFootprintPicker.dom.test.tsx`
  (existing — jsdom tier, real interaction; see design.md's test-tier risk). **Revision 2:**
  rewritten again against the row-table model — tests open Add/Edit-per-row/Preview map and assert
  the resulting row list, not a collapsed summary or a single Add/Edit button.
- `app/domains/hazardous-events/presentation/web/buildSpatialFootprintSummary.ts` + its test
  (existing) — **removed**, its count-only collapsed-summary logic has no caller once the row
  table replaces it (design.md Decision 16); its per-row label logic is repurposed into a new
  `describeGeometry.ts` (below), not kept as-is.
- `app/domains/hazardous-events/presentation/web/describeGeometry.ts` (new) + a test — the
  `"Shape: <TYPE>"` + corner Lat/Lng text, shared by the Add dialog's post-save summary and the
  row table's geometry-row label (design.md Decision 16).
- `app/domains/hazardous-events/presentation/web/HazardousEventSpatialFootprintMap.tsx` (existing)
  — the drawable map (not `HazardousEventLocationMap`, which stays read-only; it only gains an
  opt-in `fill` prop so Preview map can fill its full-screen panel).
  **Revised (round 5 later dropped the button; Enter-only):** its own search button now used the
  design-system `Button` and a local
  `<form onSubmit>` for Enter-key submission (design.md Decision 15); its mount location moves
  from inline-on-the-page to inside a `Dialog`, reached either via the Add dialog's "Open map" or
  directly via a geometry row's "Edit" (design.md Decision 14). **Revision 2:** also fixes
  Escape-during-draw closing the dialog and the prefilled-shape delete-persistence bug (design.md
  Decision 17(c)/(d)). Gate 5 (SOLID review) revision: reports draw-active state via a new
  `onDrawActiveChange` callback prop instead of a document-level keydown listener; the hosting
  `HazardousEventSpatialFootprintMapDialog` disables `Dialog`'s own Escape-to-close via `Dialog`'s
  new `dismissDisabled` prop while a draw is active. **Round 5:** becomes legacy's "Mapper" — a
  toolbar of Enter-only search (no Search button), drawing-mode dropdown, Clear, Undo and Save
  Coordinates; one shape per item. **9k:** a replacing shape removes the old one only once it is
  committed, and edited shapes get the same degenerate/outside-division checks (design.md
  Decision 14).
- `app/domains/hazardous-events/presentation/web/HazardousEventSpatialFootprintMap.test.tsx` +
  `.dom.test.tsx` (new).
- `app/domains/hazardous-events/presentation/web/HazardousEventDivisionListDialog.tsx` (new) —
  the `react-aria-components`-based division selector (design.md Decision 5). **Revision 2:** its
  removable-chip label switches from a division's bare `name` to its already-fetched breadcrumb
  `path` (design.md Decision 16) — a one-line read-site fix, no new fetch.
- `app/domains/hazardous-events/presentation/web/HazardousEventDivisionListDialog.dom.test.tsx`
  (new). **Revision 2:** chip-label assertions updated to the breadcrumb format.
- `app/domains/hazardous-events/presentation/web/leafletLoader.ts` + its `.dom.test.ts` — widen
  the typed `L` subset to cover the drawing API this picker needs (design.md Decision 3) and add
  the `leaflet-draw` CDN load (cdnjs, the exact URL legacy already uses); same no-new-npm-dependency
  rationale as today.
- `app/domains/hazardous-events/presentation/web/extractFormFieldErrors.ts` + its existing
  `extractFormFieldErrors.test.ts` — `KNOWN_FIELDS`/alias extension (design.md Decision 6).
- `app/domains/hazardous-events/presentation/web/HazardousEventFormPage.dom.test.tsx` (existing)
  — updated fixtures for the widened `HazardousEventFormInitialValues`.
- `tests/integration/domains/hazardous-events/routes/HazardousEventEditRoute.test.ts` and
  `HazardousEventNewRoute.test.ts` (existing) — new assertions for prefill and field-error mapping.
- `tests/e2e/hazardous-events/he-preview-form.spec.ts` (existing) and/or a new sibling spec in the
  same `tests/e2e/hazardous-events/` directory — draw-then-submit, division-pick-then-submit, and
  untouched-picker E2E cases.
- `locales/en/hazardous-events.json` and `locales/fr/hazardous-events.json` — new picker strings;
  removes the dead `form.fields.spatial_footprint_placeholder` key. Added by hand, not via
  `yarn i18n:extractor` (that script targets legacy's `ctx.t({code,msg})` call shape, not this
  form's `react-i18next` `t("key")` calls).
- `app/routes/$lang+/_authenticated+/he-preview+/edit.$id.tsx` — the route component's own
  `initialValues={...}` object (not the loader, which already resolves the full `event`) adds
  `currentSpatialObservation: event.currentSpatialObservation`.
- `app/routes/$lang+/api+/geojson.$id.ts` — add the `countryAccountsId` tenant filter to the
  division lookup (design.md Decision 9), plus a new test (no existing test file covers this
  route).
- `app/domains/hazardous-events/presentation/web/HazardousEventDetailPage.tsx` + its existing
  `HazardousEventDetailPage.test.tsx` — Location Card renders `currentSpatialObservation.
divisionIds` (design.md Decision 10).
- `app/design-system/components/Button.tsx` (new) + a test — wraps RAC's `Button`; first
  `primary`/`outline` (design.md Decision 12's token table), later also `system`,
  `system-primary`, `icon`, `accent`, `accent-outline` and `muted-outline` (Gate 9 rounds 2–5).
- `app/design-system/components/Dialog.tsx` (new) + a test — wraps RAC's
  `ModalOverlay`/`Modal`/`Dialog`, shared by this change's own picker chrome (Decisions 2/5) and
  the two migrated sibling modals below. **Revision 2:** gained a `size="wide"` option for the
  map tool, since removed; rounds 3–5 add `variant="item"` (legacy's fixed-width "Add new item"
  shell, with `size="medium"` for the tree dialog) and `variant="fullscreen"` (the Mapper and Map
  preview). Gate 5 revision: also gains a
  `dismissDisabled?: boolean` prop (wraps RAC's `isKeyboardDismissDisabled`), suppressing
  Escape-to-close only, for a caller whose content owns a competing Escape handler.
- `app/design-system/components/MultiSelectCombobox.tsx` (new) + a test — filterable multi-select
  with removable chips, replacing the validator picker's PrimeReact `MultiSelect`.
- `app/design-system/components/Section.tsx` (new) + a test — titled, grey-background card over a
  `children` region, giving the picker the same chrome `attachments`' `ContentRepeater` already
  has on this form (design.md Decision 13). **Revision 2:** its `action: ReactNode` prop (rendered
  in the header row beside the title) is replaced with `actions: ReactNode`, rendered below
  `children` instead — matching `.content-repeater-actions`' own position as a separate row below
  the table, not beside the caption (design.md Decision 13, fixes Gate 9 finding (a), unfixed in
  Revision 1).
- `app/domains/hazardous-events/presentation/web/HazardousEventSpatialFootprintEntryDialog.tsx`
  (existing) + its `.dom.test.tsx` — **rewritten, not just revised:** the "Add" dialog's own radio
  now inline-reveals its chosen type's field + trigger button ("Open map" / "Select") with no
  separate Continue step; gains a primary Apply action that commits the session's result into the
  picker's row list (design.md Decision 14, Revision 2 — supersedes the Revision 1 two-button/
  Continue-only shape entirely).
- `app/domains/hazardous-events/presentation/web/HazardousEventSpatialFootprintMapDialog.tsx`
  (new, implementation-time addition, not in this list's original draft) + its `.dom.test.tsx` —
  hosts the map tool as legacy's full-screen "Mapper" (`variant="fullscreen"`, no footer: the
  map's Save Coordinates commits, × discards), shared by the Add dialog's "Open map" trigger and
  a geometry row's direct Edit action (design.md Decision 14).
- `app/domains/hazardous-events/presentation/web/divisionTree.ts` (new, Gate 5 SOLID-review
  addition) + its test — `fetchDivisionTree`/`findNode`/`DivisionTreeNode` (plus the tree
  dialog's `collectParentIds`/`filterDivisionTree`) extracted out of
  `HazardousEventDivisionListDialog.tsx` into a standalone, non-UI module, so the picker's
  row-label resolution depends on a plain data module, not a sibling dialog component's
  internals.
- `app/domains/hazardous-events/presentation/web/useDivisionTree.ts` (new, 9k) + its test — the
  one tree-fetch hook and `divisionLabel` helper shared by the picker rows, the Add/Edit dialog,
  the tree dialog's chips and `HazardousEventDivisionNames` (design.md 9k addendum).
- `app/domains/hazardous-events/presentation/web/HazardousEventDivisionNames.tsx` (new, round 6)
  and its test — the detail page's division list by breadcrumb path (design.md Decision 10).
- `app/domains/hazardous-events/presentation/web/HazardousEventFormField.tsx` (existing) — a
  `className` passthrough, so the picker's card field can drop its bottom margin (round 2).
- `app/styles/all.css` — new tokens and `.dts-button`/`.dts-dialog-*`/`.dts-multiselect-chip`
  classes (design.md Decision 12's token table). No `Section` classes — `Section` uses legacy's own
  `.content-repeater*` classes directly (design.md Decision 13, Gate 9 round 2). **Revision 2:**
  added `.dts-dialog-panel--wide` (design.md Decision 17(b)), removed again in round 5 with
  `size="wide"`. The table reuses `.dts-table` with no new table CSS.
- `app/design-system/components/Table.tsx` + `TableColumn.tsx` (existing) — `TableColumn` gains a
  `className` passthrough, and `Table` renders no empty row unless an `emptyState` is given
  (round 2).
- `app/domains/hazardous-events/presentation/web/HazardousEventSaveSubmitModal.tsx` +
  `HazardousEventSaveSubmitModal.dom.test.tsx` (existing) — migrated off PrimeReact onto the three
  components above, same behavior (design.md Decision 12).
- `app/domains/hazardous-events/presentation/web/HazardousEventDiscardModal.tsx` +
  `HazardousEventDiscardModal.dom.test.tsx` (existing) — migrated the same way; the existing
  `"mg-button-primary"`/`"mg-button-outline"` class-string assertions are updated to the new
  `Button` variant classes, not left to fail.
- `_docs/refactoring-plan/hazardous-events-refactoring-roadmap.md` — update `6c`'s status line
  (closed once this change, including the modal migration, ships and merges — not marked here).
- `_docs/refactoring-plan/deferred-items-register.md` — delete the `DEF-057` row once archived
  (per project convention: deferred items resolve by deletion, never by in-place annotation).
  `DEF-060` (sibling PrimeReact modals) is removed from the register now, in this same update —
  resolved by this change's own scope, not deferred.

**No DB migration.** The three Phase 2 spatial-observation tables, the domain entity, the DTO, the
use case, and `IDivisionRepository` are all already shipped and tested; this change touches no
`app/drizzle/schema/*`, no `app/domains/hazardous-events/domain/**`, no
`app/domains/hazardous-events/application/**`, and no
`app/domains/hazardous-events/infrastructure/**` file.

**Test approach:** PGlite integration (`test:run2`) for the extended `edit.$id.tsx`/`new.tsx`
action behavior (field-error mapping) and the edit route's prefill mapping, extending the existing
`tests/integration/domains/hazardous-events/routes/HazardousEventEditRoute.test.ts` and
`HazardousEventNewRoute.test.ts`, matching `6c`'s own existing test tier. Component-level Vitest:
a `renderToString`/node-tier test for each new component's non-interactive shape (matching
`HazardousEventLocationMap.test.tsx`'s own precedent), plus a `*.dom.test.{ts,tsx}` jsdom-tier
sibling for anything needing real interaction (draw simulation, division-list selection,
concurrent-load assertions) — `vitest.config.ts` routes tests to jsdom only by that filename
suffix, confirmed by reading its config directly. E2E Playwright extending the existing
`tests/e2e/hazardous-events/he-preview-form.spec.ts` (or a new sibling spec in the same directory)
for the full draw-a-shape-then-submit, pick-a-division-then-submit, and untouched-picker flows,
per `6c`'s roadmap entry's own stated test tier. A new PGlite integration test (no existing test
file covers `geojson.$id.ts` today) seeds two tenants' `divisionTable` rows and asserts the
tenant-scoping fix (design.md Decision 9). `HazardousEventDetailPage.test.tsx` (existing, node
tier) gains an assertion for a division-only observation rendering its `divisionIds` (design.md
Decision 10). The three new design-system primitives each get a node-tier non-interactive test
plus real-interaction coverage where applicable (`Dialog` open/close/dismiss,
`MultiSelectCombobox` filter/select/remove-chip), matching the rest of
`app/design-system/components/`'s own (currently untested) family — these are its first tests.
Both migrated sibling modals' existing `.dom.test.tsx` files are updated in place (class-name
assertions, portal-target query if it changes), not replaced wholesale — their behavior is
unchanged, only their underlying implementation.

**Multi-tenancy / security:** No new query is added to the create/edit write path — division
validation already runs through the existing, already-tenant-scoped `IDivisionRepository`. The
picker's own data-fetch calls reuse `/api/division/tree` (tenant-scoped, confirmed by reading its
loader) for the division-tree dialog. **Fixed, not merely flagged, as part of this change:**
`/api/geojson/:id` (`app/routes/$lang+/api+/geojson.$id.ts`), which legacy's own picker calls to
fetch a selected division's boundary, had no `countryAccountsId` scope at all — any authenticated
user could fetch any tenant's division geometry by id. This change's own division-boundary preview
fetch is what newly exposes that gap to this UI path, so this change adds the same
`countryAccountsId` filter `/api/division/tree.ts`/`/api/division/list.ts` already use for this
table (design.md Decision 9), rather than shipping with the same exposure or merely registering a
`DEF` for it.
