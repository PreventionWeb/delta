## 1. Blocking decisions and spikes (resolve with the human before writing component code)

- [x] 1.1 Design.md's Blocking Decisions are resolved with the human, except one: flat vs.
      hierarchical division list (task 1.3 below feeds that one). The other four are settled and
      recorded in design.md: `/api/geojson/:id` tenant scoping is fixed in this change's own scope
      (Decision 9, task 1.4 below); "clear everything" reverts the hidden fields to `""`/`"0"`
      (Decision 1 Addendum, task 5.3); React Aria governs this picker's new chrome, **and** (re-
      confirmed, superseding this task's own first pass) the sibling PrimeReact modals are migrated
      in this same change too, not left untouched — `DEF-060` resolved here, not deferred (Decision
      2/12, tasks 9a/9b); and the detail page is widened to render `divisionIds` (Decision 10, tasks
      6.3-6.4), so task 9.3 below asserts detail-page display, not persistence-only.
- [x] 1.2 Spike: verify `leaflet-draw@1.0.4` (loaded from
      `https://cdnjs.cloudflare.com/ajax/libs/leaflet.draw/1.0.4/`, the exact URL
      `app/components/ContentRepeater/index.tsx` already loads it from) actually supports
      polygon/marker/rectangle/circle draw + edit + delete against the already-loaded
      `leaflet@1.9.4`, in a throwaway local page. Note any incompatibility found and adjust the task
      list below before proceeding.
- [x] 1.3 Confirm real tenant division data's hierarchy depth (query `division` for at least one
      seeded tenant) to inform the one remaining Blocking Decision (flat vs. hierarchical division
      list, design.md) — a flat list is only safe if no tenant's divisions are more than one level
      deep or have colliding names across levels. **Resolved: hierarchical**, decided with the human
      on existing evidence (GADM level-4 import support, no schema-level name-uniqueness constraint
      across levels) — the real tenant-data queries above were not run; DB access was unavailable in
      the implementing environment. See design.md's Blocking Decisions section for the full reasoning.
- [x] 1.4 Fix `/api/geojson/:id`'s tenant-scoping gap, brought into this change's own scope
      (design.md Decision 9, resolved — not merely flagged): add
      `getCountryAccountsIdFromSession(request)` (the same import `/api/division/tree.ts` and
      `/api/division/list.ts` already use) and filter the `divisionTable.findFirst` lookup with
      `and(eq(divisionTable.id, id), eq(divisionTable.countryAccountsId, countryAccountsId))` instead
      of `id` alone. No existing test file covers this route (confirmed — none exists anywhere under
      `tests/`); write a new PGlite integration test (location at the implementer's judgment, e.g.
      alongside the other `app/routes/$lang+/api+/` coverage) that mocks `~/utils/session`'s
      `getCountryAccountsIdFromSession` the same way `HazardousEventEditRoute.test.ts` already does
      (`vi.mock("~/utils/session", ...)`), seeds two tenants' `divisionTable` rows, and asserts: a
      same-tenant id still returns its `geojson` (unchanged behavior); a foreign-tenant id returns 404
      instead of that tenant's boundary. Verify red, implement, verify green.

## 2. `leafletLoader.ts` extension

- [x] 2.1 The widened typed surface (`Marker`, `Polygon`, `Polyline`, `Rectangle`, `Circle`,
      `FeatureGroup`, `Draw.Event.*` constants) is a compile-time property, not a runtime one —
      verify it with `yarn tsc` after implementing, not with a Vitest assertion. No red/green cycle
      for this part; implement alongside 2.2.
- [x] 2.2 `app/domains/hazardous-events/presentation/web/leafletLoader.dom.test.ts` **already
      exists** (confirmed by reading it — jsdom tier, its own `fakeL`/`getScripts()`/cleanup helpers,
      `vi.resetModules()` in `beforeEach`, manual `dispatchEvent(new Event("load"/"error"))` to
      resolve the promise without a real network fetch). Extend it, following its own existing
      pattern exactly: add a failing `describe("ensureLeafletDrawLoaded")` block asserting it injects
      exactly one `<script>`/`<link>` pair at
      `https://cdnjs.cloudflare.com/ajax/libs/leaflet.draw/1.0.4/...` (task 1.2's confirmed URL).
      Verify red, implement, verify green with
      `yarn vitest run app/domains/hazardous-events/presentation/web/leafletLoader.dom.test.ts`.
- [x] 2.3 Write a failing test asserting `leaflet-draw`'s `<script>` is injected only after base
      Leaflet's own `onload` fires, never concurrently (Risks — legacy's own load order, `window.L`
      must exist first). Verify red, implement, verify green with the same command.
- [x] 2.4 Write the **mandatory concurrent-callers test**: two simultaneous calls before the first
      load resolves must share one in-flight promise and inject each `<script>`/`<link>` exactly
      once — for both the existing Leaflet load and the new `leaflet-draw` load, firing each mocked
      `onload` manually. Verify with the same command.
- [x] 2.5 Implement the `leaflet-draw` CDN load (ordered after base Leaflet) in `leafletLoader.ts`
      until 2.2-2.4 are green and 2.1's `yarn tsc` is clean.

## 3. Division list dialog (`react-aria-components`)

- [x] 3.1 Write a failing test for a new
      `app/domains/hazardous-events/presentation/web/HazardousEventDivisionListDialog.dom.test.tsx`
      (`.dom.test.tsx` — needs jsdom for real interaction, per `vitest.config.ts`'s tiering) asserting
      it fetches `/api/division/tree`, renders the tenant's divisions (flat or hierarchical per
      the one remaining Blocking Decision, design.md), and calls back with a selected division's id on
      confirm. Verify red with
      `yarn vitest run app/domains/hazardous-events/presentation/web/HazardousEventDivisionListDialog.dom.test.tsx`.
- [x] 3.2 Write a failing test asserting selecting a division triggers a `GET /api/geojson/:id`
      fetch for its boundary and surfaces both the id and the fetched geometry to the caller as a
      preview (not persisted — design.md Decision 1). Verify red, implement, verify green with the
      same command. **Architectural placement note:** `HazardousEventDivisionListDialog` itself only
      reports id selection/deselection to its caller (confirmed by its own test file, which deliberately
      scopes the `/api/geojson/:id` fetch out — "belongs to the picker's map component per design.md
      Decision 7, not this division-list dialog"). The boundary-preview fetch is implemented in the
      picker composition (task group 5) instead, which owns `previewDivisions` and feeds the map. This
      task is satisfied there, not in this file — left unticked here, re-verify at group 5.
- [x] 3.3 Write a failing test asserting selecting an already-selected division does not duplicate
      it in the caller's `divisionIds`. Verify red, implement, verify green.
- [x] 3.4 Write a failing test for the empty/loading/error states (division list fetch fails, or
      returns zero divisions). Verify red, implement, verify green.

## 4. Map/draw component

- [x] 4.1 Write a failing test for a new
      `app/domains/hazardous-events/presentation/web/HazardousEventSpatialFootprintMap.test.tsx`
      asserting it renders a drawable map container (not `HazardousEventLocationMap`, per design.md
      Decision 7) with a mocked `ensureLeafletLoaded`, matching
      `HazardousEventLocationMap.test.tsx`'s own `renderToString`-level precedent where no real
      draw interaction is needed. Verify red with
      `yarn vitest run app/domains/hazardous-events/presentation/web/HazardousEventSpatialFootprintMap.test.tsx`.
- [x] 4.2 Write failing tests, in a `.dom.test.tsx` sibling file (real draw interaction needs
      jsdom), for draw-add (polygon, marker, rectangle, circle — each unwrapped from the turf `Feature`
      helpers in `app/utils/spatialUtils.ts` to a bare Geometry via `.geometry`, per design.md
      Decision 4) and draw-remove. Verify red with
      `yarn vitest run app/domains/hazardous-events/presentation/web/HazardousEventSpatialFootprintMap.dom.test.tsx`,
      implement, verify green. **Scope note:** explicit test coverage is polygon + circle + delete, not
      a separate test per marker/rectangle/polyline — confirmed via the 1.2 spike that
      `layer.toGeoJSON().geometry` is the correct, identical bare-Geometry extraction for all of
      polygon/marker/rectangle/polyline (only circle needs `convertCircleToTurfPolygon`, per Decision
      4's own addendum), so the implementation has one shared, type-dispatched code path, not four
      separate ones — a per-type test would exercise the same branch the polygon test already covers.
- [x] 4.3 Write a failing test asserting a degenerate shape (fewer than 3 points for a polygon) is
      rejected before being appended to `geometries` (design.md Decision 4 addendum). Verify red,
      implement, verify green in the same `.dom.test.tsx` file.
- [x] 4.4 Write a failing test asserting prefilled `geometries` render on mount (edit-mode case),
      and a separate, non-persisted preview layer renders for any division passed in alongside. Verify
      red, implement, verify green.
- [x] 4.5 Write a failing test for the load-failure degrade path (`ensureLeafletLoaded` resolves
      `null` → non-blocking unavailable message, no crash, no hidden-field mutation). Verify red,
      implement, verify green.
- [x] 4.6 Kept, not dropped (design.md Decision 11, resolved): write a failing test for the map's
      free-text Nominatim location search — a non-empty query triggers a fetch to Nominatim's search
      endpoint and recenters/fits the map to the first result, with no change to `geometries`/
      `divisionIds`; an empty query shows a prompt message with no network call; a zero-result
      response leaves the map unchanged and shows a "not found" message. Verify red with the
      `.dom.test.tsx` command from 4.2, implement, verify green.
- [x] 4.7 Kept, not left unwired (design.md Decision 11, resolved): write a failing test for the
      outside-division warning — completing a drawn shape while at least one division is selected,
      where the shape falls outside every selected division's boundary (via
      `checkShapeAgainstDivisions`, already imported per Decision 4), shows a
      `react-aria-components`-based confirmation affordance before the shape is added; confirming adds
      it, cancelling discards it; no division selected, or the shape falling inside a selected
      division's boundary, skips the warning entirely. Verify red with the same command, implement,
      verify green.

## 5. `HazardousEventSpatialFootprintPicker.tsx` (composition + hidden-field serialization)

- [x] 5.1 Write a failing test in a new `.dom.test.tsx` file asserting the picker composes the map
      (task group 4) and division list (task group 3), holds one combined
      `{ geometries, divisionIds }` state, and renders the two existing hidden inputs
      (`spatialObservation`, `spatialObservationChanged`) at `""`/`"0"` for both create and
      no-prior-observation edit modes. Verify red with
      `yarn vitest run app/domains/hazardous-events/presentation/web/HazardousEventSpatialFootprintPicker.dom.test.tsx`.
- [x] 5.2 Write a failing test asserting any draw or division-selection change sets
      `spatialObservationChanged` to `"1"` and serializes valid JSON into `spatialObservation`. Verify
      red, implement, verify green.
- [x] 5.3 Write a failing test for the "clear everything after an interaction" case (design.md
      Decision 1 Addendum, resolved): after at least one draw/selection (hidden fields already live
      JSON/`"1"`), removing every shape and deselecting every division reverts the hidden
      `spatialObservation` input to `""` and `spatialObservationChanged` back to `"0"` — matching
      create's own no-op-by-default behavior, never an explicit empty-array JSON. Verify red,
      implement, verify green.
- [x] 5.3a Write a failing test for edit mode's own version of 5.3 (design.md Decision 1
      Addendum's known edit-mode consequence): prefill from a non-null `currentSpatialObservation`,
      clear every shape/division, submit — assert the hidden fields are `""`/`"0"` at submit time and
      (characterization, same style as 5.5) that `UpdateHazardousEventUseCase.execute` is therefore
      called without a `spatialObservation` field, so the server's previously recorded observation is
      left unchanged. Verify red, implement, verify green.
- [x] 5.4 Write a failing test asserting edit mode's non-null `currentSpatialObservation` prefills
      the picker's combined state and starts `spatialObservationChanged` at `"0"`. Verify red,
      implement, verify green.
- [x] 5.5 Add a **characterization test** (not a red/green TDD step — the existing action never
      involves the picker component, only the parsed form data) to the existing
      `tests/integration/domains/hazardous-events/routes/HazardousEventNewRoute.test.ts`: submit the
      action's `FormData` with `spatialObservation` omitted entirely (simulating what 5.1's `""`-
      initial hidden field produces) and assert `CreateHazardousEventUseCase.execute` is called
      without a `spatialObservation` field. This documents the real guard against the spurious-row
      bug lives in the picker's own initial render (5.1) plus this action's existing, unchanged
      gating — not in this test itself. The actual end-to-end guarantee (picker renders `""` → no
      row) is confirmed by E2E 9.2. Run with
      `yarn vitest run tests/integration/domains/hazardous-events/routes/HazardousEventNewRoute.test.ts`.

## 6. `HazardousEventFormPage.tsx` integration, and the detail-page display fix

- [x] 6.1 Update `HazardousEventFormInitialValues` to add the optional
      `currentSpatialObservation: { geometries: readonly unknown[]; divisionIds: readonly string[] } | null`
      field (design.md Decision 8). Update the existing
      `app/domains/hazardous-events/presentation/web/HazardousEventFormPage.dom.test.tsx` fixtures
      accordingly (confirmed this file, not `.test.tsx`, already exists) and verify green with
      `yarn vitest run app/domains/hazardous-events/presentation/web/HazardousEventFormPage.dom.test.tsx`.
- [x] 6.2 Replace the static placeholder (lines ~219-230) with
      `HazardousEventSpatialFootprintPicker`, passing `fieldErrors?.divisionIds` through (not
      `fieldErrors?.geometries` — design.md Decision 6 confirms that path is unreachable). Write/update
      the test asserting the placeholder `<p>` and the hardcoded `spatialObservationChanged` literal
      `"0"` are gone, then verify green with the same command (red first for the "placeholder gone"
      assertion). Also remove the now-dead `form.fields.spatial_footprint_placeholder` translation key
      (task 11.1).
- [x] 6.3 Widened scope, resolved (design.md Decision 10): update
      `HazardousEventDetailPage.tsx`'s Location Card to also render
      `currentSpatialObservation.divisionIds` whenever it is a non-empty array, independent of whether
      `geometries` is empty — a division-only observation was previously invisible on this page (no
      code anywhere referenced `divisionIds`, confirmed by reading the component directly). Render the
      raw division ids as a simple list (no name resolution — out of scope, design.md Non-Goals);
      display-only, does not copy a boundary into `geometries` (Decision 1 unaffected). Write a
      failing test in the existing
      `app/domains/hazardous-events/presentation/web/HazardousEventDetailPage.test.tsx` asserting a
      non-null `currentSpatialObservation` with empty `geometries` and non-empty `divisionIds` renders
      the division ids and does not render the page's "no observation" empty state. Verify red with
      `yarn vitest run app/domains/hazardous-events/presentation/web/HazardousEventDetailPage.test.tsx`,
      implement, verify green.
- [x] 6.4 Add a test in the same file asserting an observation with both `geometries` and
      `divisionIds` populated renders both the existing map and the new division-id list, not one or
      the other. Verify green in the same test run as 6.3.

## 7. `extractFormFieldErrors.ts` — field-error mapping (design.md Decision 6, corrected)

- [x] 7.1 Write failing tests in the existing
      `app/domains/hazardous-events/presentation/web/extractFormFieldErrors.test.ts` for: a
      `"divisionIds must not contain duplicate values"` message mapping to field `divisionIds`; and a
      `"divisionId xyz is not present in validDivisionIds"` message (singular) also mapping to field
      `divisionIds` via the alias step. Do **not** add a test for a `"geometries must be an array"` or
      `"divisionIds must be an array"` message reaching this function — `parseSpatialObservation`
      already coerces non-arrays to `[]` before `SpatialObservation.create()` ever runs, so that
      `ValidationError` is not reachable through this form (design.md Decision 6). Verify red,
      implement by adding `"divisionIds"` to `KNOWN_FIELDS` and adding the singular-to-plural alias
      step, verify green with
      `yarn vitest run app/domains/hazardous-events/presentation/web/extractFormFieldErrors.test.ts`.

## 8. `edit.$id.tsx` route component prefill (design.md Decision 8)

- [x] 8.1 Confirmed by reading it directly: `HazardousEventEditRoute.test.ts` calls the exported
      `loader`/`action` functions only — it never renders the route's default-exported React
      component, so it cannot observe an `initialValues={...}` prop passed to `HazardousEventFormPage`.
      Two steps, not one test:
  1. Extract the route component's `initialValues={...}` object-building logic into a small, pure,
     unit-testable function (new file, e.g. `mapEventToEditFormInitialValues.ts`, mirroring
     `mapAttachmentsToWidgetShape.ts`'s existing precedent of a pure mapping function used by this
     exact route). Write a failing unit test for it asserting a non-null
     `event.currentSpatialObservation` maps to `initialValues.currentSpatialObservation` with
     matching `geometries`/`divisionIds`, and a `null` one maps to `null`. Verify red, implement,
     verify green with `yarn vitest run app/domains/hazardous-events/presentation/web/mapEventToEditFormInitialValues.test.ts`.
  2. Add one characterization assertion to `HazardousEventEditRoute.test.ts`'s existing loader
     describe block confirming `loader`'s returned `event` object already carries
     `currentSpatialObservation` unchanged (this part needs no new code — it's already true today;
     recorded so a future change can't silently drop it). The full "the form actually renders it"
     guarantee is confirmed by E2E 9.4, not by this PGlite tier.
- [x] 8.2 Write failing tests in `HazardousEventEditRoute.test.ts` (and the equivalent in
      `HazardousEventNewRoute.test.ts` for create) asserting the action's `ValidationError` handling
      now returns `fieldErrors.divisionIds` for both the plural duplicate-value message and the
      singular stale/foreign-division-id message (spec `hazardous-event-write-route-adapter`'s
      corrected scenarios). For the foreign-division-id case, seed a second tenant's real division row
      in the PGlite test DB and submit its id — exercising the real, already-tenant-scoped
      `IDivisionRepository.findValidDivisionIds` through the actual action, not a mock/fake standing
      in for it. Verify red, confirm green once task 7.1's `KNOWN_FIELDS`/alias change lands, run with
      `yarn vitest run tests/integration/domains/hazardous-events/routes/HazardousEventEditRoute.test.ts tests/integration/domains/hazardous-events/routes/HazardousEventNewRoute.test.ts`.

## 9. E2E (Playwright, per roadmap `6c`'s own stated test tier)

- [x] 9.1 Extend `tests/e2e/hazardous-events/he-preview-form.spec.ts` (confirmed this is the real,
      existing CA-era spec for `/en/he-preview/new`, not the legacy `tests/e2e/hazardous-event/`
      directory) or add a new sibling spec in `tests/e2e/hazardous-events/`: create a Hazardous Event,
      draw a shape, submit, and confirm the created record's detail page
      (`HazardousEventLocationMap`) renders that geometry. Verify with `yarn test:e2e` scoped to this
      spec file.
- [x] 9.2 Same file/directory: create a Hazardous Event without touching the picker at all, submit,
      and confirm no spatial observation was recorded (detail page's Location card shows its existing
      empty state, not a map) — the real end-to-end guard for the spurious-empty-row risk (design.md
      Decision 1 Addendum; task 5.5 only characterizes the action's own existing gating).
- [x] 9.3 Same file/directory: create a Hazardous Event, select a division from the picker's
      division list (no shape drawn), submit, and confirm both (a) the record's stored `divisionIds`
      includes it, and (b) the detail page's Location Card renders that division id (design.md
      Decision 10, resolved as "widen scope" — task 6.3's fix makes a division-only observation
      visible on the detail page).
- [x] 9.4 Add an edit-flow E2E case in the same directory (no existing CA edit-flow spec found for
      this form — confirm before assuming one exists): edit an existing event that has a recorded
      observation, confirm the picker prefills it, make no change, submit, and confirm the stored
      observation is unchanged (no spurious new observation row).

## 9a. New design-system primitives: `Button`, `Dialog`, `MultiSelectCombobox` (design.md Decision 12 — resolves `DEF-060`, fixed here, not deferred)

- [x] 9a.1 `all.css`: add the new tokens from design.md Decision 12's table — `--color-dts-button-primary-bg`,
      `--color-dts-button-disabled-bg`, `--shadow-dts-button-primary-focus`,
      `--shadow-dts-button-outline-hover`, `--spacing-dts-button-padding`, `--color-dts-overlay`,
      `--shadow-dts-dialog` — to the existing `@theme` block, and add the new
      `.dts-button`/`.dts-button--primary`/`.dts-button--outline`,
      `.dts-dialog-overlay`/`.dts-dialog-panel`/`.dts-dialog-title`/`.dts-dialog-body`/
      `.dts-dialog-footer`, `.dts-multiselect-chip`/`.dts-multiselect-chips` classes, consuming tokens
      via `var(--...)` exactly like every existing class (no raw values in a class body). Confirm the
      exact RAC state data-attribute names (`data-hovered`/`data-focus-visible`/`data-disabled`)
      against the installed `react-aria-components` version before choosing `:hover`/`:focus-visible`/
      `:disabled` vs. `[data-...]` selectors (design.md Decision 12) — matching
      `.dts-select-popover`'s own existing `[data-hovered]`/`[data-focused]` precedent for exactly
      this choice. No red/green cycle for this task (pure CSS); verify visually alongside 9a.2-9a.4.
- [x] 9a.2 Write a failing test for a new `app/design-system/components/Button.test.tsx` (node
      tier — these primitives have no existing tests to follow, confirmed; this is the family's
      first) asserting `variant="primary"`/`variant="outline"` each render the correct
      `dts-button--*` class, and `disabled` renders a `<button disabled>`. Verify red with
      `yarn vitest run app/design-system/components/Button.test.tsx`, implement, verify green.
- [x] 9a.3 Write a failing test for a new `app/design-system/components/Dialog.test.tsx` (node
      tier, open/closed non-interactive rendering) plus a `.dom.test.tsx` sibling (jsdom, real
      interaction) asserting: title/children render while open; Escape closes; outside-click closes;
      the header close-icon button (its `closeLabel` prop as its accessible name) also closes — the
      PrimeReact-default-`closable` behavior neither modal opts out of today, confirmed by reading
      `node_modules/primereact/dialog/dialog.d.ts` directly (design.md Decision 12). Verify red with
      `yarn vitest run app/design-system/components/Dialog.test.tsx app/design-system/components/Dialog.dom.test.tsx`,
      implement, verify green.
- [x] 9a.4 Write a failing test for a new
      `app/design-system/components/MultiSelectCombobox.dom.test.tsx` (jsdom, real interaction
      needed) asserting: typing filters the option list case-insensitively; selecting two options
      renders two chips; removing a chip deselects that option and removes its id from the
      selected-ids value. Verify red with
      `yarn vitest run app/design-system/components/MultiSelectCombobox.dom.test.tsx`, implement,
      verify green.

## 9b. Migrate `HazardousEventSaveSubmitModal`/`HazardousEventDiscardModal` off PrimeReact (design.md Decision 12)

- [x] 9b.1 Migrate `HazardousEventDiscardModal.tsx`: replace `primereact/dialog`'s `Dialog` with
      the new `Dialog`, and `primereact/button`'s `Button` with the new `Button`
      (`variant="primary"`/`variant="outline"` for the two footer buttons, in their existing visual
      order). Update `HazardousEventDiscardModal.dom.test.tsx`'s two class-string assertions from
      `"mg-button-primary"`/`"mg-button-outline"` to the new `Button` variant classes (confirmed by
      reading the test file directly — design.md Risks), and verify the existing
      icon/portal-target assumption still holds or update it if RAC's own portal target differs from
      PrimeReact's. Verify green with
      `yarn vitest run app/domains/hazardous-events/presentation/web/HazardousEventDiscardModal.dom.test.tsx`.
- [x] 9b.2 Migrate `HazardousEventSaveSubmitModal.tsx`: replace `primereact/dialog`'s `Dialog`
      with the new `Dialog`; replace `primereact/button`'s `Button` (footer submit button) with the
      new `Button`; replace `primereact/checkbox`'s `Checkbox` with the already-existing
      `app/design-system/components/Checkbox.tsx` (confirmed directly reusable, no new component
      needed — simplify the `onChange` handler, dropping the `e.checked === undefined` guard
      PrimeReact's own event shape required); replace `primereact/multiselect`'s `MultiSelect` with
      the new `MultiSelectCombobox`, mapping `validatorOptions` to the new component's `{id, name}`
      shape. Preserve exactly: role-gated card visibility, the publish-checkbox→action-switch logic,
      the reset-on-hide `useEffect`, and `isSubmitDisabled`. Update
      `HazardousEventSaveSubmitModal.dom.test.tsx` only where the DOM structure actually changes
      (icon-badge queries, portal-target assumption per design.md Risks) — role-visibility and
      disabled-submit assertions query by ARIA role/name and the native `disabled` property, not
      library-specific markup, so they should need no change; confirm this rather than assume it.
      Verify green with
      `yarn vitest run app/domains/hazardous-events/presentation/web/HazardousEventSaveSubmitModal.dom.test.tsx`.
- [x] 9b.3 Grep both migrated files to confirm zero remaining `primereact` imports
      (`design-system-components` spec's own "no PrimeReact dependency" requirement extends to every
      consumer this change touches, not only the new primitives themselves).

## 9c. Revision: picker restructuring from live Chrome review findings (design.md Decisions 13-15)

**Superseded by task group 9d below.** A second, full live Chrome walkthrough (every step
performed and screenshotted) found this group's own collapsed-summary-behind-one-Add/Edit-button
design, and the plain two-radio-then-Continue entry dialog it built, do not match legacy's real
row-table structure. The checkmarks below are kept as the historical record of what was actually
built and verified at the time — they are **not** a description of the current, intended
structure. Task group 9d.0 names exactly which pieces of this group's own output to remove/rewrite,
first, before any rebuild task runs. Do not treat any `[x]` below as still representing the
intended final shape.

A live Chrome review against legacy's actual form surfaced four real UX problems in the picker as
shipped by task groups 3-5/9a/9b above: no section chrome, no entry step before the map/division
tools, an unstyled search button, and no Enter-key search submission. The data model
(`geometries`/`divisionIds`, hidden-field serialization) is unchanged — this group is
presentation-layer restructuring only.

- [x] 9c.1 Write a failing test for a new `app/design-system/components/Section.test.tsx` (node
      tier, non-interactive) asserting `Section` renders its `title`, `action`, and `children`,
      and that its container carries the grey-card styling class (design.md Decision 13). Verify
      red with `yarn vitest run app/design-system/components/Section.test.tsx`, implement, verify
      green.
- [x] 9c.2 `all.css`: add `--color-dts-section-border: #e3e3e3` to the existing `@theme` block
      (reusing `--color-dts-table-header-bg` for the background — already `#f2f2f2`, no new token
      needed there), and add `.dts-section` / `.dts-section-header` / `.dts-section-caption`
      (design.md Decision 13's token table — background/border via `var(--...)`, padding/caption
      font-size/weight/margin as plain one-off values, matching every other `.dts-*` class's own
      convention of not tokenizing non-shared layout values). No red/green cycle for this task
      (pure CSS); verify visually alongside 9c.1.
- [x] 9c.3 Write a failing `.dom.test.tsx` test for a new
      `app/domains/hazardous-events/presentation/web/HazardousEventSpatialFootprintEntryDialog.tsx`
      asserting: it renders exactly two radio options labelled "Map coordinates" and "Geographic
      level" (matching `spatialFootprintFormView.tsx`'s own `map_option` labels, read directly —
      design.md Decision 14); selecting one and activating "Continue" calls back with that choice
      and closes the dialog; dismissing without choosing (Escape/outside-click/close icon) calls
      back indicating no choice was made, with no tool opened. Verify red with
      `yarn vitest run app/domains/hazardous-events/presentation/web/HazardousEventSpatialFootprintEntryDialog.dom.test.tsx`,
      implement (built on the existing `Dialog` primitive, Decision 12), verify green.
- [x] 9c.4 Rewrite the existing
      `app/domains/hazardous-events/presentation/web/HazardousEventSpatialFootprintPicker.dom.test.tsx`
      against the new `step: "closed" | "choosing" | "map" | "divisions"` state machine (design.md
      Decision 14) — the existing scenarios 1-11 (hidden-field semantics, division fetch
      caching/discarding, error rendering) are still required, but must now be reached through the
      new entry flow, not asserted against an always-mounted map/button. At minimum, add/rewrite
      for:
  1. An untouched picker renders the `Section` with an "Add" action and no map/division dialog
     mounted. Verify red against the current always-inline implementation with
     `yarn vitest run app/domains/hazardous-events/presentation/web/HazardousEventSpatialFootprintPicker.dom.test.tsx`.
  2. Clicking "Add" opens `HazardousEventSpatialFootprintEntryDialog`, not the map or division
     dialog directly.
  3. Choosing "Map coordinates" and confirming mounts the (mocked) map component; the existing
     draw-shape/clear-shapes interactions from the current test file are exercised after reaching
     this step, not before.
  4. Choosing "Geographic level" and confirming mounts the (mocked) division dialog; the existing
     select-div-1/deselect-div-1/etc. interactions are exercised after reaching this step.
  5. Closing the map or division dialog returns to the collapsed `Section`; once the picker holds
     content, the action reads "Edit" and a brief summary (shape/division counts) renders instead
     of the map.
  6. Clicking "Edit" (not only "Add") also opens the entry dialog first — same path as Add,
     per design.md Decision 14's explicit "applies identically" note.
     Implement `HazardousEventSpatialFootprintPicker.tsx`'s restructuring (new `step` state, the
     `Section`/`action` button, the entry dialog, gating the map `Dialog` and the division
     dialog's `isOpen` on `step`) until every scenario above is green, then re-verify the full
     file is green with the same command.
- [x] 9c.5 Extend `HazardousEventSpatialFootprintMap.tsx`'s existing test file(s): write failing
      tests asserting (a) the search control renders via the design-system `Button` (e.g. carries
      its `dts-button--outline` class, not an unstyled native `<button>`), and (b) pressing Enter
      in the search input (while it and the button sit inside a local `<form onSubmit>`) triggers
      the same `searchLocation` call and map-recentering behavior as clicking the button (design.md
      Decision 15). Verify red, implement, verify green with
      `yarn vitest run app/domains/hazardous-events/presentation/web/HazardousEventSpatialFootprintMap.dom.test.tsx`.
- [x] 9c.6 Add the new i18n keys this restructuring needs to both `locales/en/hazardous-events.json`
      and `locales/fr/hazardous-events.json` by hand (same convention as task 11.1 — no
      `yarn i18n:extractor`): the `Section`'s caption (may reuse the existing
      `detail.fields.spatial_footprint` string), the Add/Edit action labels, a summary string using
      this file's own existing `{{count}} hazardous event(s)`-style pluralization precedent for
      shape/division counts, and the entry dialog's title, its two option labels ("Map
      coordinates"/"Geographic level", matching legacy's own labels), and its Continue button
      label.
- [x] 9c.7 Update `tests/e2e/hazardous-events/he-preview-form.spec.ts` (or its sibling spec, per
      task group 9's own file) so the existing draw-a-shape and pick-a-division E2E flows (9.1-9.4)
      go through the new entry-step dialog (click Add/Edit → choose Map coordinates or Geographic
      level → Continue → interact with the opened tool → close it) instead of interacting with an
      always-visible map/button. Re-run with `yarn test:e2e` scoped to this spec file; all four
      flows must still pass end-to-end against the new UI structure.
- [x] 9c.8 Re-run the applicable quality gates from group 10 below, scoped to exactly this
      revision's touched/new files (`Section.tsx`, `HazardousEventSpatialFootprintEntryDialog.tsx`,
      `HazardousEventSpatialFootprintPicker.tsx`, `HazardousEventSpatialFootprintMap.tsx`,
      `all.css`, both locale files, the E2E spec, and every test file touched by 9c.1-9c.7): Gate 1
      (tests green), Gate 2 (`yarn tsc`), Gate 3 (`yarn format:check`, scoped — never a bulk
      `yarn format`), Gate 4 (anti-pattern review), Gate 5 (`solid-reviewer`), Gate 6 (documentation
      review — comments explain WHY, under 30 words the large majority of the time, no
      change-history narration since none of this is committed yet), Gate 7 (project-conventions
      review), Gate 8 (code review, fresh subagent), Gate 9 (visual-parity-reviewer — mandatory,
      presentation-layer change; ground truth is design.md Decisions 13-14's own checklist: grey
      card/bold caption/single action matching `.content-repeater`'s real values, and the entry
      dialog's exact two option labels/order read from `spatialFootprintFormView.tsx`), Gate 10
      (independent second-opinion review, fresh subagent). **Do NOT invoke `test-quality-auditor`
      (mutation testing) for any file in this group** — out of scope for this revision and for this
      change going forward, per explicit human instruction (see task 10.12's own correction below).

## 9d. Second revision: row-table rebuild from the final, confirmed legacy contract (design.md Decisions 13/14/16/17, Revision 2)

A second, full live Chrome walkthrough of legacy's actual form — every step actually performed and
screenshotted, not assumed — found that task group 9c's own collapsed-summary-behind-one-Add/Edit-
button design does not match legacy's real structure: legacy renders a **table of independently-
managed rows**, one per recorded item, each with its own Edit (geometry only)/Delete actions — not
a single combined summary gated behind a shared entry-choice dialog. This group also finishes four
Gate 9 findings the prior round left unfixed. **Cleanup is ordered first, deliberately, so no
rebuild task below is ever written or verified against still-superseded code.** The data model
(`geometries`/`divisionIds`, hidden-field serialization) remains unchanged throughout.

### 9d.0 Cleanup (resolve every item here before starting any 9d.1+ task)

- [x] 9d.0.1 Delete `app/domains/hazardous-events/presentation/web/buildSpatialFootprintSummary.ts`
      and `buildSpatialFootprintSummary.test.ts` — count-only collapsed-summary logic
      (design.md Decision 16), superseded; the row table replaces what it rendered. Grep first to
      confirm no other file imports it (expected: only the picker, already being rewritten below).
- [x] 9d.0.2 Rewrite `HazardousEventSpatialFootprintEntryDialog.tsx`
      (`app/domains/hazardous-events/presentation/web/`): remove its plain two-radio-then-Continue
      body entirely (task 9c.3's shape) — no inline reveal, no post-save shape summary, no Apply
      action exists in that version. Delete `HazardousEventSpatialFootprintEntryDialog.dom.test.tsx`'s
      existing assertions built against that shape (exactly two radios, Continue
      disabled-until-choice, `onChoose` callback contract) — the rebuilt version below has a
      different prop contract (an Apply callback that carries the committed result, not a bare
      choice), so these tests are replaced, not kept passing by coincidence.
- [x] 9d.0.3 Rewrite `HazardousEventSpatialFootprintPicker.tsx`'s own
      `step: "closed" | "choosing" | "map" | "divisions"` state machine and its `.dom.test.tsx`
      (task 9c.4's shape): remove the
      single page-level "Add"/"Edit" button, the `buildSpatialFootprintSummary`-driven collapsed
      summary, and the shared entry-choice step. Do not attempt to make the existing 9c.4 test
      scenarios pass against the new row-table markup by patching selectors — rewrite the
      scenario list from scratch against the row-table/per-row-action contract (9d.1.4 below lists
      the new scenario set this file's test must cover).
- [x] 9d.0.4 Grep for `Section`'s existing `action` prop usage outside this picker (expected: none
      — this picker is `Section`'s only consumer so far, confirmed by reading the component
      directly at design time). Confirm before 9d.1 below treats the `action` → `actions` rename
      as a direct edit rather than a deprecate-then-migrate.

### 9d.1 `Section`: action slot moves below content (design.md Decision 13, Gate 9 finding (a))

- [x] 9d.1.1 Update `app/design-system/components/Section.test.tsx`: replace the `action`-prop
      assertion (rendered beside `title` in the header row) with an `actions`-prop assertion
      (rendered after `children`, in a new wrapper carrying the `.dts-section-actions` class).
      Verify red against the current `action`-in-header implementation with
      `yarn vitest run app/design-system/components/Section.test.tsx`, implement the prop rename
      and layout move in `Section.tsx`, verify green.
- [x] 9d.1.2 `all.css`: add `.dts-section-actions`, reusing `content-repeater.css`'s own
      `.content-repeater-actions` values directly (`list-style: none`, `flex-wrap`,
      `gap: 1.14rem`, `background: var(--color-dts-table-header-bg)`, `margin-top: 0.71rem`) —
      confirmed by reading that file, not invented. No red/green cycle (pure CSS); verify visually
      alongside 9d.1.1 and 9d.3's table render.

### 9d.2 `Dialog`: a `size="wide"` variant for the map tool (design.md Decision 17(b), Gate 9 finding (b))

- [x] 9d.2.1 Write a failing test in `app/design-system/components/Dialog.test.tsx` asserting a
      `size="wide"` `Dialog` instance's panel carries a `dts-dialog-panel--wide` class in addition
      to `dts-dialog-panel`, and that omitting `size` (every other current caller) keeps the
      existing class only. Verify red with
      `yarn vitest run app/design-system/components/Dialog.test.tsx`, implement the new optional
      `size?: "default" | "wide"` prop, verify green. **Note:** `Dialog.test.tsx` is SSR-only
      (`ModalOverlay` renders null server-side) — the real class assertion lives in
      `Dialog.dom.test.tsx` instead; `Dialog.test.tsx` only confirms `size="wide"` doesn't crash SSR.
- [x] 9d.2.2 `all.css`: add `.dts-dialog-panel--wide` (near-full-viewport sizing, e.g.
      `width: min(96vw, 1400px); height: min(90vh, 900px)` — exact values confirmed live against a
      real rendered map dialog during implementation, not assumed correct from this number alone;
      `.dts-dialog-panel`'s own `max-height: 90vh; overflow-y: auto` stays, so content still
      scrolls if the map's own fixed height exceeds the panel). No red/green cycle (pure CSS);
      verify visually alongside 9d.5.

### 9d.3 Row data, labels, and the table (design.md Decision 14/16)

- [x] 9d.3.1 Write a failing test for a new
      `app/domains/hazardous-events/presentation/web/describeGeometry.ts` (repurposing
      `buildSpatialFootprintSummary.ts`'s now-deleted per-shape logic, per 9d.0.1, into a new
      file rather than reusing the old one as-is) asserting it takes one bare `BareGeometry` (the
      same shape `spatialFootprintGeometry.ts`'s `extractGeometry` already returns) and a returns
      `"Shape: <TYPE>"` (verbatim `geometry.type`, e.g. `"Shape: Polygon"`) plus the shape's corner
      Lat/Lng as literal text — cover at minimum a `Polygon`'s ring corners, a `Point`'s single
      coordinate, and a `LineString`'s two endpoints (a circle, already polygonized per Decision 4,
      reuses the Polygon branch). Verify red, implement, verify green with
      `yarn vitest run app/domains/hazardous-events/presentation/web/describeGeometry.test.ts`.
- [x] 9d.3.2 Write a failing test in `HazardousEventDivisionListDialog.dom.test.tsx` asserting the
      removable-chip row's label is the division's breadcrumb `path` (e.g.
      `"Abyan Governorate / Zinjibar"`), not its bare `name` — the `DivisionTreeNode` interface
      already types `path` (confirmed, already shipped by `/api/division/tree.ts`'s `buildTree()`,
      no fetch/DTO change). Verify red, implement the one-line `node?.name` → `node?.path` fix (the
      `unknown_division` fallback for a since-deleted division stays as-is — it has no path to
      show either), verify green with
      `yarn vitest run app/domains/hazardous-events/presentation/web/HazardousEventDivisionListDialog.dom.test.tsx`.
- [x] 9d.3.3 Write failing tests in the rewritten `HazardousEventSpatialFootprintPicker.dom.test.tsx`
      (9d.0.3) asserting the row table (built on the existing, already-shipped
      `app/design-system/components/Table.tsx`/`TableColumn.tsx`/`TableRow.tsx`/`TableCell.tsx`
      family — already used by `HazardousEventListPage.tsx` for this exact "labelled row + centered
      actions cell" shape, reused as-is, no new table primitive):
  1. An untouched picker renders the table's `emptyState` (via `Table`'s own existing prop) and
     an enabled "Add" button plus a **disabled** "Preview map" button below it.
  2. One geometry and one division produce exactly two rows: the geometry row labelled via
     `describeGeometry` (9d.3.1), the division row labelled via its breadcrumb `path` (9d.3.2).
  3. The geometry row has both an Edit and a Delete action; the division row has Delete only (no
     Edit control rendered for a division row at all, not merely disabled).
  4. Once at least one row exists, "Preview map" becomes enabled.
     Verify red against the still-9c.4-shaped picker, implement the row derivation + `Table`
     composition, verify green with
     `yarn vitest run app/domains/hazardous-events/presentation/web/HazardousEventSpatialFootprintPicker.dom.test.tsx`.

### 9d.4 The "Add" dialog: inline-revealing radio, no Title field, Apply commits (design.md Decision 14)

- [x] 9d.4.1 Write failing tests in the rewritten `HazardousEventSpatialFootprintEntryDialog.dom.test.tsx`
      (9d.0.2) asserting: the "Item type" radio (Map coordinates / Geographic level, same labels/
      order as before) renders with **no Title field anywhere in the dialog** (explicit negative
      assertion, not merely an omission nobody checks for); selecting "Map coordinates" reveals a
      field with an **"Open map"** trigger button and no content yet (first open); selecting
      "Geographic level" reveals a field with a **"Select"** trigger button. Verify red with
      `yarn vitest run app/domains/hazardous-events/presentation/web/HazardousEventSpatialFootprintEntryDialog.dom.test.tsx`,
      implement, verify green.
- [x] 9d.4.2 Write a failing test asserting "Open map" opens the map tool's `Dialog` (mocked in
      this file's own test, per the existing sibling-mock convention) nested inside the Add
      dialog, that saving a shape in that nested session closes it and reveals, inline in the
      "Map coordinates" field, the `describeGeometry` (9d.3.1) summary text, and that the Add
      dialog's own **Apply** button is disabled until a shape has been saved in this session.
      Verify red, implement, verify green with the same command.
- [x] 9d.4.3 Write a failing test asserting "Select" opens `HazardousEventDivisionListDialog`
      (mocked) nested inside the Add dialog, that selecting divisions there and closing it returns
      to the Add dialog with Apply enabled, and that Apply commits **one new row per division
      selected in that sub-dialog session** (not one combined row) — assert against the parent
      picker's resulting row count in the composed `.dom.test.tsx` (9d.5 below), since this file in
      isolation only needs to assert the callback payload it hands up. Verify red, implement,
      verify green.
- [x] 9d.4.4 Write a failing test asserting cancelling/dismissing the Add dialog (Escape,
      outside-click, close icon) before Apply discards whatever was staged in that session —
      committing nothing to the picker's row list. Verify red, implement, verify green.

### 9d.5 Picker composition: Add → row(s), per-row Edit/Delete, Preview map (design.md Decision 14)

- [x] 9d.5.1 Write failing tests in `HazardousEventSpatialFootprintPicker.dom.test.tsx` asserting:
      clicking "Add" opens the rewritten Add dialog (9d.4); completing a "Map coordinates" Add
      session (Open map → save a shape → Apply) adds exactly one new geometry row to the table;
      completing a "Geographic level" Add session with two divisions selected adds exactly two new
      division rows at once. Verify red, implement, verify green with
      `yarn vitest run app/domains/hazardous-events/presentation/web/HazardousEventSpatialFootprintPicker.dom.test.tsx`.
- [x] 9d.5.2 Write a failing test asserting a geometry row's **Edit** button opens the map tool's
      `Dialog` **directly** (no Add dialog, no radio, no Apply step), pre-loaded with that one
      row's geometry only; saving replaces that row's geometry in place (same array position);
      cancelling leaves the row unchanged. Verify red, implement, verify green.
- [x] 9d.5.3 Write a failing test asserting a row's **Delete** button (both geometry and division
      rows) removes that one row directly from the picker's `geometries`/`divisionIds` state,
      with no map/leaflet-draw interaction involved at all. Verify red, implement, verify green.
- [x] 9d.5.4 Write a failing test asserting "Preview map" (enabled once at least one row exists)
      opens a `Dialog` containing the existing, read-only `HazardousEventLocationMap`, fed a
      combined list of `geometries` plus the boundary geometry of every currently selected
      division (reusing the already-shipped `useDivisionBoundaryPreviews` hook — no second fetch
      mechanism). Verify red, implement, verify green.
- [x] 9d.5.5 Re-verify (do not merely assume carried over) every still-applicable scenario from the
      superseded 9c.4 list — hidden-field `""`/`"0"` semantics, division fetch caching/discarding,
      edit-mode prefill into rows, inline field-error rendering — now reached through the row-table/
      Add-dialog flow instead of the old step machine. Any scenario that no longer has a direct
      equivalent (e.g. "Edit opens the same entry dialog as Add") is deliberately dropped, not
      silently lost — note which in the PR description, not silently.

### 9d.6 Map tool fixes: Escape-during-draw and prefilled-shape delete persistence (design.md Decision 17(c)/(d))

- [x] 9d.6.1 Write a failing test in `HazardousEventSpatialFootprintMap.dom.test.tsx` asserting
      that pressing Escape **while a draw tool is active** (after `L.Draw.Event.DRAWSTART` has
      fired, before `DRAWSTOP`) cancels the in-progress draw only — the map dialog stays open, and
      no shape is silently discarded from an already-saved set. Verify red against the current
      `ModalOverlay isDismissable`-only behavior, implement (track draw-active state via
      `DRAWSTART`/`DRAWSTOP`, stop the Escape keydown's propagation before `ModalOverlay`'s own
      listener while active), verify green with
      `yarn vitest run app/domains/hazardous-events/presentation/web/HazardousEventSpatialFootprintMap.dom.test.tsx`.
- [x] 9d.6.2 Write a failing test asserting Escape with **no** draw active still closes the dialog
      normally (the fix above must not swallow every Escape, only the mid-draw case). Verify red,
      confirm green alongside 9d.6.1's implementation.
- [x] 9d.6.3 Write a failing test reproducing the confirmed root cause of the prefilled-shape
      delete bug directly: mount the map with a non-empty `geometries` prop (prefilled, triggering
      the `L.geoJSON(geometry)` wrapper-group path in the mount effect), simulate leaflet-draw's
      own `DELETED` event firing with that geometry's **inner child layer** (not the wrapper
      group) in `event.layers`, and assert the shape is actually removed from `geometries` after
      Save. Verify red (reproduces the bug: `removed.includes(shape.layer)` never matches because
      `shape.layer` is the wrapper group, not the child the event reports), implement (store the
      wrapper group's own inner layer, e.g. via `group.getLayers()[0]`, as `shape.layer` when
      adding a prefilled geometry — not the `L.geoJSON()` group itself), verify green with the same
      command. Keep the existing fresh-draw-then-delete test (task 4.2) passing unchanged — this
      fix must not regress the already-correct path.
- [x] 9d.6.4 Re-run the leaflet-draw tool-compatibility spike's own check (task 1.2) specifically
      for `DRAWSTART`/`DRAWSTOP` firing on every draw tool this picker exposes (polygon/marker/
      rectangle/circle/polyline) against the installed `leaflet-draw@1.0.4` — confirmed empirically,
      not assumed from the original spike's narrower draw/edit/delete scope (design.md Risks).
      Note any tool where this doesn't hold and adjust 9d.6.1's fix accordingly before relying on
      it uniformly.

### 9d.7 i18n and E2E

- [x] 9d.7.1 Update `locales/en/hazardous-events.json` and `locales/fr/hazardous-events.json` by
      hand (no `yarn i18n:extractor`, same reasoning as task 11.1): remove the now-dead
      `form.spatial_footprint.edit_action` (no page-level Edit button remains) and
      `form.spatial_footprint.entry_dialog.continue` (no bare Continue action remains) keys; add
      keys for "Preview map", the Add dialog's "Open map"/"Select"/"Apply" button labels, the
      row-table's per-row Edit/Delete aria-labels (interpolated with the row's own label, matching
      `division_dialog.remove`'s existing `"Remove {{name}}"` convention). Keep
      `form.spatial_footprint.add_action` ("Add", still used, now always "Add" and never "Edit")
      and `form.spatial_footprint.entry_dialog.{title,map_option,division_option}` (still used by
      the rewritten Add dialog). Also removed the now-dead `form.spatial_footprint.summary.*` keys
      (only `buildSpatialFootprintSummary.ts`, deleted in 9d.0.1, read them). **Deviation, flagged
      for human sign-off:** `describeGeometry`'s own Lat/Lng text is fully literal/non-translated
      (matching Decision 16's "Shape: TYPE never translated" stance, extended here to the whole
      summary line), not run through `t()` — so no new i18n keys were added for it. If this should
      instead be translated per-locale, say so and this gets revisited.
- [x] 9d.7.2 Update `tests/e2e/hazardous-events/he-preview-form.spec.ts` (or its sibling spec, per
      task group 9's own file) so the existing draw-a-shape, pick-a-division, and edit-flow E2E
      cases (9.1-9.4, last updated for 9c's entry dialog at 9c.7) go through the rebuilt flow:
      click Add → choose Map coordinates or Geographic level → Open map/Select → interact → Apply
      → assert the resulting row → for a geometry row, additionally exercise Edit (direct map
      re-open) and Delete (direct row removal) once at least one row exists. Add a Preview-map
      case: with at least one row present, open Preview map and confirm the combined
      geometries-plus-division-boundaries render (9d.5.4). Re-run with `yarn test:e2e` scoped to
      this spec file; all cases must pass end-to-end against the rebuilt UI.

### 9d.8 Quality gates for this revision

- [x] 9d.8.1 Re-run the applicable quality gates from group 10 below, scoped to exactly this
      revision's touched/new files (`Section.tsx`, `Dialog.tsx`, `describeGeometry.ts`,
      `HazardousEventSpatialFootprintEntryDialog.tsx`, `HazardousEventSpatialFootprintPicker.tsx`,
      `HazardousEventSpatialFootprintMap.tsx`, `HazardousEventDivisionListDialog.tsx`, `all.css`,
      both locale files, the E2E spec, and every test file touched by 9d.0-9d.7; note that
      `buildSpatialFootprintSummary.ts`/`.test.ts` are deleted, not touched):
      Gate 1 (tests green), Gate 2 (`yarn tsc`), Gate 3 (`yarn format:check`, scoped — never a bulk
      `yarn format`), Gate 4 (anti-pattern review), Gate 5 (`solid-reviewer`), Gate 6 (documentation
      review — comments explain WHY, no change-history narration since none of this is committed
      yet), Gate 7 (project-conventions review), Gate 8 (code review, fresh subagent), Gate 9
      (`visual-parity-reviewer` — mandatory; ground truth is design.md Decisions 13/14/16's own
      checklist: grey card with actions below the table matching `.content-repeater`'s real
      layout, the row table's exact column/label/action set, the Add dialog's exact radio labels
      and inline-reveal behavior, the "Shape: TYPE" + Lat/Lng wording, and the breadcrumb chip/row
      format — plus a live re-check of the map dialog's width and the Escape/delete fixes against
      a real draw session), Gate 10 (independent second-opinion review, fresh subagent).
      **Mutation testing, refined mid-round:** the blanket skip above was softened by the human to
      "skip for wiring/UI, but run `test-quality-auditor` scoped to any new genuinely risky
      pure-logic file if cheap to check." Run against exactly `describeGeometry.ts` and
      `divisionTree.ts` (both new this round, real branching logic, no function-typed interface
      members in the Stryker-crash family) — 82.81% mutation score, 5 real gaps found and fixed
      with new test cases, 1 survivor (an error-message-text mutant) judged low-value. Skipped for
      every wiring/UI file in this group, per the same refined guidance.

## 9e. Gate 9 round 2: user's side-by-side visual review (design.md "Gate 9 round 2" addendum)

- [x] 9e.1 `Section` uses legacy's `.content-repeater*` classes + imports `content-repeater.css`;
      `.dts-section*` classes and `--color-dts-section-border` removed from `all.css`.
- [x] 9e.2 `Button`: add `system` (`mg-button mg-button-system`) and `icon` variants; `outline`
      unchanged. `TableColumn`: `className` passthrough. `Table`: no empty row when `emptyState`
      is omitted.
- [x] 9e.3 Picker: columns Option / Value / Action (Option `w-40`, Action content-width and
      right-aligned); `pi-trash`/`pi-pencil` icon actions; empty-state text removed; locale keys
      updated (en + fr).
- [x] 9e.4 Division-row Edit: opens the division list pre-selected with that division; closing
      replaces in place; cleared/unchanged leaves the row as-is (spec requirement updated).
- [x] 9e.5 Gap before Attachments: `HazardousEventFormField` `className` passthrough; both card
      fields pass `!mb-0`. Measured 40/48/24px, equal to legacy.
- [x] 9e.6 Fix `&#x2F;` in row/chip accessible names (`escapeValue: false` on those calls); picker
      and division-dialog tests now use runtime-default i18next escaping.
- [x] 9e.7 Tests updated/added (Section, Button variants, picker columns, division Edit replace
      and no-op cases); scoped vitest + `tsc` green.
- [x] 9e.8 User re-review of `/he-preview/new` against legacy — signed off by the user, 2026-11-20.

## 9f. Gate 9 round 3: Add dialog matches legacy's "Add new item" (design.md Decision 14, "Look and layout")

- [x] 9f.1 `Dialog` `variant="item"` (Tailwind-only fixed-width shell, responsive widths);
      `Button` `accent`/`accent-outline`/`muted-outline` variants + `className` passthrough. No
      PrimeReact components or theme classes.
- [x] 9f.2 Entry dialog rebuilt: field cards, legacy radio look, joined read-only input + trigger,
      shape summary box, staged divisions shown by path, "Map coordinates" pre-selected, legacy
      title/caption/placeholder text (en + fr).
- [x] 9f.3 Measured against legacy on the same screen (width, title, card and button positions);
      checked at 1100/760/390px widths — no horizontal overflow, options stack on narrow screens.
- [x] 9f.4 Tests updated/added (entry dialog pre-selection + division path display, Dialog item
      variant, Button variants); specs updated.
- [x] 9f.5 Division Add/Edit Apply/Cancel — done in 9g below.
- [x] 9f.6 User re-review of the Add dialog — signed off by the user, 2026-11-20.

## 9g. Gate 9 round 4: division tree dialog + division Edit via "Edit item" (design.md Decision 14)

- [x] 9g.1 User decisions: checkbox multi-select (over hover "Select"); division Edit opens the
      Add dialog as "Edit item", pre-filled, committed only by Apply.
- [x] 9g.2 `HazardousEventDivisionListDialog` rebuilt: fixed width (`size="medium"`), Expand All /
      Collapse All / Search, collapsed expandable tree with checkboxes, fixed-height tree area as
      the only scroller, wrapping chips, Apply/Discard. `filterDivisionTree`/`collectParentIds`
      added to `divisionTree.ts`. `Dialog` item panel made a flex column (footer always visible).
- [x] 9g.3 Entry dialog `initial` prop ("Edit item"); picker routes division Edit through it;
      close-to-save division Edit removed (spec requirement replaced).
- [x] 9g.4 Checked live: add three divisions incl. across a search, Edit-apply replaces in place,
      Edit-cancel no-op; 760/390px widths and a 520px-tall screen — only the tree scrolls.
- [x] 9g.5 Tests rewritten/added (division dialog, entry dialog Edit/Discard, picker Edit flows,
      tree helpers); e2e division steps use the tree's Apply.
- [x] 9g.6 User re-review of the division tree dialog and division Edit — signed off by the user, 2026-11-20.

## 9h. Gate 9 round 5: map tool becomes legacy's full-screen "Mapper" (design.md Decision 14)

- [x] 9h.1 User decisions: keep "Edit shape" (beyond legacy); no Cancel button (× discards).
- [x] 9h.2 `Dialog` `variant="fullscreen"` (legacy header/title/close classes); `Button`
      `system-primary`. Map dialog: title "Mapper", no footer.
- [x] 9h.3 Map component: legacy toolbar (Enter-only search, mode dropdown, Clear, Undo, Save
      Coordinates) driving leaflet-draw's standalone tools; on-map toolbar removed; one shape per
      item with an in-app replace confirm; Edit shape commits edits (EDITED + `geometryFromLayer`);
      Escape mid-draw cancels from anywhere; map fills the remaining height.
- [x] 9h.4 Checked live: draw rectangle, replace-confirm keep, Save Coordinates, row Edit → Edit
      shape → drag corner → saved coordinates updated; Undo mid-draw; Escape mid-draw then Escape
      closes; 760/390px widths.
- [x] 9h.5 Tests rewritten/added (map toolbar, dialog, fullscreen/system-primary variants); e2e
      drawing steps use the dropdown and Save Coordinates; locales (en + fr) updated.
- [x] 9h.6 Follow-ups: dropdown labels "Line" / "Marker" (one shape per item); Preview map now the
      same full-screen panel titled "Map preview" (legacy's full-page tab title), map filling it
      via `HazardousEventLocationMap`'s new `fill` prop; `size="wide"` + `.dts-dialog-panel--wide`
      removed as unused.
- [x] 9h.7 User re-review of the Mapper and Map preview against legacy — signed off by the user, 2026-11-20.

## 9i. Gate 9 round 6: edit/detail page walkthrough (design.md Decision 10)

- [x] 9i.1 Live walkthrough: create (shape + two divisions) → detail → edit (delete one division,
      Edit item on the other) → save → reopen; untouched save keeps the footprint.
- [x] 9i.2 Detail page shows divisions by breadcrumb path (`HazardousEventDivisionNames`), never
      raw ids; detail-page spec + Decision 10 revised; unit + e2e assertions updated.
- [x] 9i.3 Legacy's own detail page not showing CA-stored locations confirmed by the user as a
      known gap (legacy is being decommissioned).

## 9j. Quality gates for rounds 9e–9i (via `sdd-implementer`, 2026-11-21)

- [x] 9j.1 Gates 1–3: 58 files / 628 tests pass, `tsc` clean, scoped Prettier clean (re-verified
      independently after the run).
- [x] 9j.2 Gates 4, 6, 10 run; Gates 5, 7, 8, 9 run with findings returned for decision.
      Mutation testing skipped by the user's decision for this change.
- [x] 9j.3 Inline fixes applied by the gate run (each red-first where a bug): prefilled marker
      now fits the view; Expand All disabled with no expandable levels; unmounting mid-draw
      disables the active tool; comment/JSDoc corrections; two added tests.
- [x] 9j.4 Resolve the open findings with the user (fix vs. follow-up), then tick 9c.8.

## 9k. Approved fixes from the 9j gate run (design.md 9k addendum)

- [x] 9k.1 Mapper: a replacing shape removes the old one only once committed (Proceed arms it);
      a cancelled/unfinished/rejected draw keeps the original; Undo cancels a
      rectangle/circle/marker draw.
- [x] 9k.2 Mapper: edited shapes get the degenerate and outside-division checks; a rejected edit
      reverts on the map and in state; Save Coordinates stops when an edit needed attention.
- [x] 9k.3 Fake Leaflet in the map dom test typed locally (no `any`); `onGeometriesChange`,
      `collectAllIds`, unused `leafletLoader.ts` members and the `DivisionTreeNode` re-export removed.
- [x] 9k.4 `useDivisionTree` + `divisionLabel` shared by picker, Add/Edit dialog, tree dialog and
      `HazardousEventDivisionNames` (unknown divisions labelled the same everywhere); a hook
      starts `ready` from `cachedDivisionTree` once the tree has loaded.
- [x] 9k.5 Add/Edit and tree dialogs reset during render; `useDivisionBoundaryPreviews` memoized;
      `describeGeometryParts` (index keys); read-only fields named by their card caption.
- [x] 9k.6 Escape in a non-empty tree search clears it instead of discarding the dialog.
- [x] 9k.7 Visual: tree toggle `!text-xs !leading-3.5` (43×36, legacy ~43×36); Mapper buttons
      `!leading-tight` (29.6px, legacy 29px); Mapper search autofocused. Measured live.
- [x] 9k.8 design.md / proposal.md / spec updated (stale statements corrected, replace-on-create
      and edit-validation scenarios added, map-component split recorded as an agreed follow-up).
- [x] 9k.9 Gates re-run on the touched files; Playwright spatial-footprint spec run.
- [x] 9k.10 Tenant-switch cache: kept URL-keyed (human's choice); full-page-load invariant and
      the remaining cross-tab case recorded in design.md. Final scoped Gates 1–3, 8, 10, 6/7 and
      the Playwright spec re-run; three hook tests added.
- [x] 9k.11 Final round (human-approved): `useDivisionTree` reads the shared cache, so an errored
      or disabled-at-mount instance picks up a tree loaded later; the degenerate-shape message
      clears on tool start, Escape mid-draw and Save, and re-announces on repeat; the picker,
      division-names and shared-hook dom tests warm their module in `beforeAll` instead of 15s
      per-test limits. Remaining 9k review items decided by the human (accepted / kept / left),
      recorded in design.md. Final narrow Gates 1–3, 8, 10 clean; 60 files / 670 tests pass,
      `tsc` clean, Playwright spatial-footprint spec 9/9.

## 10. Quality gates

- [x] 10.1 Gate 1: `yarn vitest run` across every test file touched/added above — all green.
      Evidence: the tree-side `test:run2` (full `vitest run`, both projects) — 220 files, 218
      passed, 2 failed (both pre-existing, confirmed below in the regression comparison), 2763
      tests, 1 failed, 2758 passed. The 2 failures are not in this change's own touched test
      files.
- [x] 10.2 Gate 2: `yarn tsc` — zero TypeScript errors. Confirmed via a direct, non-piped exit
      code after every round of fixes this session, most recently after closing 10.11's 6 gaps.
- [x] 10.3 Gate 3: `yarn format:check` scoped to the files this change touches (never a bulk
      `yarn format` — see project convention) — Prettier clean. Scoped to all 55 touched files
      (21 modified + 26 new standalone + 8 under the OpenSpec change directory, via
      `git status --short` + `find`). One non-convergent markdown block in this change's own
      `proposal.md` (an indented backtick-span continuation line, introduced by an earlier
      artifact-drift edit this session, same class as design.md's own earlier instance) fixed
      directly; confirmed truly byte-stable via `npx prettier <file> | diff <file> -` (empty).
- [x] 10.4 Gate 4: Anti-pattern review against `.github/skills/anti-pattern-check/SKILL.md`.
- [x] 10.5 Gate 5: Invoke `solid-reviewer` on the new/changed files (picker composition, map,
      division list, loader extension, the three new design-system primitives, and both migrated
      modals).
- [x] 10.6 Gate 6: Documentation review — comments explain WHY not WHAT, one full-diff sweep
      before the final report.
- [x] 10.7 Gate 7: Project-conventions review against `.github/copilot-instructions.md`.
- [x] 10.8 Gate 8: Code review — run `.github/skills/code-review/SKILL.md` in full, via a fresh
      subagent. 7 findings: #1 (HIGH, fixed) stale closure over `previewDivisions` in
      `HazardousEventSpatialFootprintMap.tsx`'s mount effect meant the outside-division warning
      never fired for a division selected after mount — fixed via a live ref (same pattern as
      this file's own `interactedRef`), extended to `onGeometriesChange` too (same bug class, same
      fix) once spotted on review; #2 (MEDIUM, fixed) `MultiSelectCombobox`'s chip remove-button
      `aria-label` was hardcoded English — added a `removeLabel` prop (Decision 12 text-as-props
      convention); #3 (MEDIUM, fixed) duplicated "Select validator(s)" text in
      `HazardousEventSaveSubmitModal.tsx` post-migration — removed the redundant hint line, folded
      its required-asterisk into the `label` prop; #4 (MEDIUM, fixed) `locationSearch.ts` never
      checked `response.ok` and had no `.catch()` — now degrades to `null` on a non-ok response or
      a rejected fetch, per design.md Decision 11 Risks' own stated mitigation; #5 (LOW, fixed)
      `MultiSelectCombobox`'s `name` was bound to the transient filter input instead of the real
      selection — added a hidden input carrying the comma-joined `selectedIds` (this app's own
      multi-id hidden-field convention), inert for the one current caller (which submits via a
      separate `tempValidatorUserIds` field); correct for a future non-modal caller, though NOT
      for one inside a `Dialog` (RAC's `ModalOverlay` portals outside the `<form>` entirely regardless
      of which input carries `name` — corrected overstatement, Gate 10); #6 (LOW, accepted —
      coordinator-confirmed)
      `HazardousEventDivisionListDialog.tsx`'s `treePromise` module-level cache never invalidates
      for the page session — tenant divisions are effectively static within a session; #7
      (nitpick, fixed) unnecessary double cast in `spatialFootprintGeometry.ts` —
      `LeafletDrawLayer` already declares `getLatLng?()`/`getRadius?()`. design.md Decision 12 got
      an implementation-time addendum for the `removeLabel`/hidden-input/`footer` additions
      (artifact-drift rule).

- [x] 10.9 Gate 9: Visual/UX parity review — ran twice (initial pass + a re-review after fixes).
      Initial pass found 7 issues; all fixed except one deviation initially accepted as inert (see
      design.md's Gate 9 addendums for the full list). The re-review confirmed all fixes live and
      surfaced 2 new real bugs via the leaflet-draw toolbar check (no default map view; the
      container clipped the edit/delete toolbar) — both fixed, plus the E2E assertion strengthened
      to catch the clipping failure mode directly. Also surfaced and fixed a pre-existing
      hydration race in an unrelated E2E test — confirmed pre-existing via a base-branch
      comparison (base flaky 1/2, tree failed every observed run before the fix, 2 of those on a
      confirmed-quiet machine; design.md addendum, `networkidle` fix). A full E2E run after all
      fixes then caught the "accepted as inert" deviation wasn't --
      `MultiSelectCombobox`'s `.dts-form-component` self-wrap was intercepting real clicks; fixed by
      dropping it (design.md addendum).
- [x] 10.10 Gate 10: Independent second-opinion review. No distinct Claude Code built-in
      `/code-review` exists separately from the DELTA-specific `code-review` skill Gate 8 already
      ran — so, to keep this gate genuinely independent (generic, not DELTA-checklist-scoped),
      ran a fresh `general-purpose` agent instead, given a provider-agnostic correctness/
      concurrency/security prompt, an explicit enumerated file list (most of this change is
      untracked), and no sight of the Gate 8 report. Findings: 2 MEDIUM already known/accepted
      (the clear-and-save no-op, human-confirmed per design.md; the `treePromise` cache, Gate 8
      #6, coordinator-confirmed) — re-surfaced independently, not new. 1 LOW genuinely new and
      fixed: `cancelWarning()`'s `removeLayer` call was dead code (confirmed against leaflet-draw's
      own source — the CREATED layer is never added anywhere until `addShape()` runs), removed.
      1 LOW correction to this file's own earlier #5 note (see above) and design.md's Gate 8
      addendum. 1 confirmed-sound callout: the `geojson.$id.ts` tenant-scoping fix is a real,
      independently-recognized security improvement, not an oversight.
- [x] 10.11 `test-quality-auditor`, narrowed (coordinator decision, time cost) to exactly the 4
      pure geometry/geo-math files added by this change: `divisionGeometry.ts`,
      `spatialFootprintGeometry.ts`, `locationSearch.ts`, `useDivisionBoundaryPreviews.ts`. The
      remaining presentation-layer files in this folder (`HazardousEventSpatialFootprintMap.tsx`,
      `HazardousEventDivisionListDialog.tsx`, `HazardousEventSpatialFootprintPicker.tsx`, both
      modals, `FormPage`, `DetailPage`, `extractFormFieldErrors.ts`, `leafletLoader.ts`) are mostly
      wiring/rendering, already covered by dom tests, E2E, and Gate 9 — skipped, since geo math is
      where a subtle operator/boundary bug hides from a naive test and wiring doesn't carry that
      same risk relative to the time cost. `useDivisionBoundaryPreviews.ts` turned out unscoreable
      (Babel/TS-printer crash on its function-type parameter, same root-cause family as DEF-041,
      design.md Risks) — covered instead by a dedicated dom test file. Real results for the other
      3: `divisionGeometry.ts` 91.67%, `spatialFootprintGeometry.ts` 71.43%,
      `locationSearch.ts` 66.67% (the auditor's own initial written summary undercounted
      spatialFootprintGeometry.ts's survivors by 2 — corrected on request, from the same
      already-captured log, no Stryker re-run). Final tally: 6 distinct real gaps found across
      all three, closed with 5 test changes (one new LineString test's coordinate choice closes
      both the LineString-branch join-separator gap and the LineString-boundary cluster in one
      shot, confirmed by red-checking it against both mutants separately), each red-checked
      against its own reported mutant by hand: a malformed-geometry guard in
      `divisionGeometry.ts`; an empty-ring fallback, a Polygon-branch join-separator ambiguity,
      and the combined LineString-branch test in `spatialFootprintGeometry.ts`; a weak
      not-ok-response mock in `locationSearch.ts`. 2 mutants confirmed not real gaps, left
      untested: the circle-guard edge case (low-value/unreachable in real Leaflet usage) and a
      Polygon ring-closing-slice removal (equivalent -- `Set` already dedupes a closed ring's
      repeated first/last point with or without the slice, hand-traced against both existing
      Polygon tests).
- [x] 10.12 `test-quality-auditor`, scoped to the three new files under
      `app/design-system/components/` (`Button.tsx`, `Dialog.tsx`, `MultiSelectCombobox.tsx`) — this
      family's first mutation-coverage check, since none of its existing components have one yet.
      Attempted, tooling-blocked: Stryker's instrumenter hard-crashes before generating any
      mutant on all three (same DEF-041 root-cause family as `useDivisionBoundaryPreviews.ts`, a
      third trigger shape -- an exported interface's property typed as a function signature, e.g.
      `onPress?: () => void`). No new deferred-register entry per standing guidance. Confirmed
      (read-only, not empirically observed since instrumentation never completes): the
      `vitest.config.ts` node-project `include` fix for `app/design-system/**` is still in place;
      Stryker's vitest-runner does wire both the node and dom projects when it gets far enough to
      run tests. **Resolved (coordinator decision, this revision):** out of scope, not retried —
      per explicit human instruction, `test-quality-auditor`/mutation testing is skipped entirely
      for this change going forward, including for the new `Section.tsx`/
      `HazardousEventSpatialFootprintEntryDialog.tsx` files task group 9c adds. Not a new
      deferred-register entry, matching the standing "no more Stryker deferred items" guidance —
      this is a per-change scope decision, not a tooling gap to track.

## 11. Non-code housekeeping

- [x] 11.1 Add new i18n keys for the picker's own UI strings directly to `locales/en/hazardous-events.json`
      and `locales/fr/hazardous-events.json` (the real files backing this form's
      `useTranslation("hazardous-events")`/`t("key")` calls — confirmed by reading them, not the
      `tmp/` copy), and remove the now-dead `form.fields.spatial_footprint_placeholder` key (task
      6.2). Includes keys for the Nominatim search input/prompt/not-found messages and the
      outside-division confirmation affordance (task 4.6/4.7, design.md Decision 11), the detail
      page's new division-id list label (task 6.3, design.md Decision 10), and a new "Close" label
      (e.g. `form.close`) for the two migrated modals' `Dialog` `closeLabel` prop (task 9a.3/9b.1/9b.2,
      design.md Decision 12 — PrimeReact's own default close-icon button had no separate translated
      label before, since PrimeReact supplied the icon itself; this is new, caller-owned text). Do
      **not** run `yarn i18n:extractor` for this — `scripts/extractor-i18n.ts` parses legacy's own
      `ctx.t({ code, msg })` object-literal call shape, not react-i18next's `t("key")` string-literal
      calls this form actually uses; add both locales' keys by hand.

## 12. Regression and archive

- [x] 12.1 Run the full PGlite suite: `yarn test:run2` must pass with no new failures. Any
      pre-existing failure must be confirmed pre-existing against the base branch, not assumed.
      **Re-run fresh for 9d, not just the tree side** (coordinator instruction): the previously
      recorded base failure list only gave counts plus one flake name, which couldn't be
      verifiably matched against this round's own tree-side failures by name alone — so a fresh
      base-vs-tree comparison was taken, not just a tree-side re-run against the old base record.
      Fresh base baseline taken via `git stash -u` (byte-exact pop confirmed via a
      `git status --porcelain` diff against the pre-stash snapshot — identical, 60 paths both
      sides): 206 files, 204 passed, 2 failed, 2659 tests (2654 passed, 3 skipped, 1 todo). Tree-side run with
      every 9d change in place: 226 files, 224 passed, 2 failed, 2836 tests (2831 passed, 3
      skipped, 1 todo). The 2 failures are identical on both sides, by test name and by verbatim
      error text, not just name-matched: `tests/integration/nestjs/UnifiedSinglePortServer.test.ts`
      (a `beforeAll` hook timeout from a `WebSocket server error: Port 24678 is already in use`
      conflict, unrelated to this change) and
      `tests/integration/db/services/settingsService.languagePersistence.test.ts`'s "accepts zh as
      a tenant default language" case (a `SettingsValidationError`, also unrelated — this change
      touches no settings/language-persistence code). Zero new failures. The +20 file / +177 test
      delta between base and tree is exactly this change's own new test files across all of its
      rounds (9a-9d), not a discrepancy.
- [x] 12.2 Update `_docs/refactoring-plan/hazardous-events-refactoring-roadmap.md`'s `6c` entry
      status line to reflect `DEF-057` closed **and** `6c` fully complete (design.md Decision 12 —
      the sibling-modal migration was the only other open item against `6c`'s own scope) -- at
      archive time, not during this implementation pass (coordinator correction, same as 12.3:
      roadmap checkmarks are only ever added after a change ships/merges, all session; I reverted
      the heading back to its pending-annotation state verbatim).
- [x] 12.3 Delete the `DEF-057` row from `_docs/refactoring-plan/deferred-items-register.md`
      (resolved items are removed, never annotated in place, per project convention) -- at
      archive time, not during this implementation pass (coordinator correction: I deleted it
      prematurely, then restored it verbatim; 10.11/10.12/12.1 hadn't finished and nothing's been
      reviewed yet). `DEF-060` (sibling PrimeReact modals) was already removed from the register
      during this change's own planning update (design.md Decision 12, resolved rather than
      deferred) — nothing left to do for it here.
- [x] 12.4 Present the final state (diff, test results, gate outcomes) to the human and get
      explicit approval before running `opsx:archive` — never archive unreviewed, even with every
      checkbox above ticked.
- [x] 12.5 Run `opsx:archive` on this same branch, after that approval, before raising the PR.
