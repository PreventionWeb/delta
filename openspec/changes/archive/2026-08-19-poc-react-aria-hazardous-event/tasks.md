Note: this is a user-designated disposable spike (see proposal.md/design.md). The standard
TDD Red→Green→Refactor cycle, the tdd-test-writer handoff, and the full 8-gate quality pipeline
are deliberately omitted here — there is no production code path being changed, and "abandon this
approach" is an explicitly acceptable outcome. Only the gates that catch real breakage
(type errors, formatting, and manual visual/behavioral verification against the named reference
pages) are kept.

## 1. Setup

- [x] 1.1 Add `react-aria-components` to `package.json` dependencies; run `yarn install`.
- [x] 1.2 Verify whether this project's Tailwind v4 config (`app/styles/all.css`) styles React
      Aria Components' `data-*` state attributes (e.g. `data-hovered`, `data-selected`) via plain
      arbitrary attribute variants, or requires `tailwindcss-react-aria-components` — build one
      throwaway component (e.g. a styled RAC `Button` with a hover state) to confirm before
      building anything else. Add the plugin only if the plain-variant approach doesn't work.
      Confirmed via a temporarily-wired throwaway route + Playwright: plain arbitrary variants
      (`data-[hovered]:`, `data-[focus-visible]:`) work with no additional plugin — see report.
- [x] 1.3 Create the isolated route folders:
      `app/routes/$lang+/_public+/poc-react-aria+/hazardous-event+/_index.tsx` and
      `app/routes/$lang+/_authenticated+/poc-react-aria+/hazardous-event+/new.tsx`.
      Confirmed both URLs (`/en/poc-react-aria/hazardous-event`,
      `/en/poc-react-aria/hazardous-event/new`) serve HTTP 200 with placeholder content.
- [x] 1.4 Confirm `app/components/RegularMenuBar.tsx` (and any other nav surface) is NOT modified —
      isolation is achieved by omission, not a flag. Do not add a nav entry. Verified via
      `git diff --stat` (empty) and a grep for `poc-react-aria` under `app/components/` (no hits).
- [x] 1.5 Author the static mock fixture files (design.md Decision 8), before building any page
      against them: `listRows.ts` (matching `hazardousEventsLoader`'s return shape, including an
      empty-result variant), `hazardPickerData.ts` (matching `HipDataForHazardPicker` — types,
      clusters, hazards with correct parent-id linkage), `validatorUsers.ts` (matching
      `getUserCountryAccountsWithValidatorRole`'s row shape), and `divisionGeoJson.ts` (matching the
      `divisionTable` top-level-with-geojson query shape), under
      `app/routes/$lang+/_public+/poc-react-aria+/hazardous-event+/fixtures/` and
      `app/routes/$lang+/_authenticated+/poc-react-aria+/hazardous-event+/fixtures/` as
      appropriate. Hand-authored realistic values are acceptable; no live DB extraction script
      required. All fixtures typed against the real functions'/schemas' actual return shapes via
      `import type` (not hand-redeclared shapes), so `yarn tsc` compile-time-verifies the match.

## 2. List page (design.md Decision 1, 3, 8)

- [x] 2.1 Wire the POC list loader with `authLoaderPublicOrWithPerm("ViewData", ...)` exactly as
      production `_index.tsx` does (auth/permission check unchanged, real). Inside the loader body,
      after that check passes, return the static `listRows.ts` fixture (task 1.5) instead of
      calling `hazardousEventsLoader` — no live DB read for the displayed rows.
- [x] 2.2 Rebuild the results table using React Aria `Table`/`Row`/`Cell` + Tailwind, matching the
      production public-view columns: hazard type, UUID (linking to
      `/hazardous-event/{id}`, the production detail route), created date, updated date.
- [x] 2.3 Rebuild the approval-status `Tooltip` using React Aria's `Tooltip`/`TooltipTrigger`.
- [x] 2.4 Reuse unchanged: `MainContainer`, `HazardEventHeader`, `HazardousEventFilters`,
      `Pagination`, `ListLegend`.
- [x] 2.5 Hand-roll the "Add new event" link/button with a React Aria `Button`/`Link` instead of
      importing `DataMainLinks` (which pulls in a PrimeReact `Button`).
- [x] 2.6 Manually compare the rendered POC list page against the production public list page
      (`/{lang}/hazardous-event`) side by side. Note any parity gaps as findings rather than
      blocking on them.
      **Caveat:** this local dev DB's `instanceSystemSettings.approvedRecordsArePublic` is
      `false`, so `authLoaderPublicOrWithPerm` on the reference route falls into its
      `authLoaderWithPerm` branch even for the comparison login used here — the screenshot
      compared against is production's **authenticated** rendering (6 columns incl. Actions,
      "Showing X of Y" text), not the anonymous/public 4-column variant, which is not reachable
      in this environment without flipping that pre-existing settings row (a data UPDATE to a
      row this change didn't create — not done unilaterally; flag to the user if a true
      public-view capture is wanted). See the implementation report for the full comparison and
      parity-gap list.

      **Superseded by 2.11 (this amendment):** the team reconsidered after reviewing this
      comparison's screenshots and decided to stop distinguishing public/authenticated rendering
      for this POC altogether — see design.md's revised Decision 3. Tasks 2.7-2.11 below implement
      that and re-run this comparison; this entry is kept for history, not re-done in place.

- [x] 2.7 Expand `listRows.ts`'s populated fixture to at least 25 rows (keep the existing
      zero-row/empty-result fixture variant unchanged). Set the populated fixture's
      `pagination.pageSize` to `10` (not `50`) so 25 rows produce 3 real pages against
      `Pagination`'s fixed `[10, 20, 30, 40, 50]` size options — a recommendation made at
      spec-revision time, not a fixed mandate; growing the fixture past 50 rows instead is an
      acceptable alternative if it proves preferable during implementation (design.md Decision 8,
      revised). **Scope note for reviewer:** this task also requires updating the list loader to
      read `page`/`pageSize` from the request URL's search params and slice the fixture rows
      accordingly (recomputing `totalItems`, `itemsOnThisPage`, and `page` per request), instead of
      always returning the fixture unsliced with a hardcoded `page: 1`/`pageSize: 50` — verified
      the loader currently ignores these params entirely, so without this change the pagination
      control becomes clickable but stays inert once the fixture grows past one page. This loader
      change was not explicitly requested in the amendment ask; it surfaced as a necessary
      consequence of exercising real pagination and is flagged here for visibility.
- [x] 2.8 Add the "Showing X of Y hazardous event(s)" summary text above the table, matching
      production's copy (i18n code `hazardous_events.showing_filtered_of_total`,
      `hazardeventlist.tsx`) and placement (directly above the table/legend) — always shown, not
      gated behind `!isPublic` as production's is.
- [x] 2.9 Add an Actions column with edit/view/delete icon buttons, reusing production's exact SVG
      icon sprites for visual parity (`app/frontend/components/data-collection/ActionLinks.tsx`:
      `/assets/icons/edit.svg#edit`, `/assets/icons/eye-show-password.svg#eye-show`,
      `/assets/icons/trash-alt.svg#delete`) rendered via RAC `Button`, not the real
      `DataCollectionActionLinks` component and not real `LangLink`s to `${route}/edit/${id}` /
      `${route}/${id}`. Build one shared, new, POC-local RAC `Modal`/`Dialog` component with
      placeholder copy (e.g. "This action isn't wired up in this POC — mocked data only"); all
      three buttons open it instead of performing real navigation or a real delete submit, since
      the fixture rows (task 2.7) don't correspond to real DB records (design.md, revised
      `DataCollectionActionLinks` disposition note under Decision 3). Do not edit
      `app/frontend/components/delete-dialog.tsx` in place — verified also imported by
      `app/frontend/form/action_links.tsx`, `app/routes/$lang+/disaster-record+/edit.$id.tsx`, and
      `app/frontend/form/view_component.tsx`.
- [x] 2.10 Remove the `isPublic`-based column branching: the table always renders the full column
      set (hazard type, record status, UUID, created, updated, Actions) regardless of `isPublic`
      (design.md, revised Decision 3) — this supersedes the original 5-column-vs-6-column framing
      in 2.6's caveat above.
- [x] 2.11 Re-run the manual visual comparison against production's authenticated list page
      (`/{lang}/hazardous-event`, logged in) now that the column set and summary text match — this
      should show much closer parity than 2.6's original 5-column comparison. Additionally, using
      the 25-row/pageSize-10 fixture (2.7), manually click through to page 2 and page 3 to confirm
      real pagination navigation works end to end (not just that the control renders). Note in the
      findings whether 25 rows at a pageSize-10 override was sufficient to demonstrate this, or
      whether growing the fixture past 50 rows (to exceed `Pagination`'s largest page-size option)
      would have been necessary or preferable for a more realistic demo — feed this into the
      wrap-up recommendation (task 4.3). `yarn tsc`/`yarn format:check` (tasks 4.1/4.2) cover these
      changes too; no separate gate needed here.

**Round 2 polish, from live human review of the running app** (not caught by 2.11's screenshot review):

- [x] 2.12 Fix right-alignment: the "Add new event" button wrapper and the table/summary-text
      `<section>` both currently apply their own guessed
      `min-[1164px]:pr-[6.4rem] min-[1164px]:pl-[2.29rem]` padding, and neither actually lines up
      with `HazardousEventFilters`' real right/left edges — both are shifted left of where the filter
      form and its "Clear"/"Apply filters" buttons end. Do not guess another padding value.
      Inspect `HazardousEventFilters`' actual rendered bounding box (its own markup/CSS — it's
      reused unchanged, so it's the source of truth for correct width) and make the button
      wrapper and the table section match it exactly — most likely by removing the two elements'
      independent ad hoc padding and letting them size the same way the filters component does
      within the shared parent, rather than reproducing a guessed padding value a second time.
      Verify with a screenshot showing the button, the table's right edge, and the filter form's
      right edge aligned.

          **Done:** confirmed via `getBoundingClientRect()` in a real logged-in browser session that
          the mismatch was double-padding, not a wrong guessed value — `MainContainer` already wraps
          all of this page's content in a `.mg-container` div (`style-dts.css`: `padding: 0 2.29rem`
          at >=1164px, centered/max-width-capped), the same ambient padding
          `HazardousEventFilters` relies on with none of its own. Removed the guessed padding from
          both elements entirely; re-measured post-fix and the button/table right edges now equal the
          filters form's right edge exactly at both 1440px and 1024px viewports.

- [x] 2.13 Give the "Hazard type" column proportionally more width than the other columns, using
      relative sizing (not a hardcoded rem/px value) so it still adapts across screen sizes.
      Root-cause first: React Aria's `Table` renders ARIA-role `<div>`s, not a real `<table>`, so
      it does not get a native `<table>`'s automatic "longer content claims more width" layout
      behavior the way production's real `<table>` in `hazardeventlist.tsx` does — confirm this
      is actually why the columns currently render equal-width. Fix by either (a) applying
      Tailwind's `table`/`table-header-group`/`table-row`/`table-cell` display utilities to the
      Table/TableHeader/TableBody/Row/Column/Cell elements so the browser's native table
      auto-layout algorithm applies (matching production's mechanism exactly), or (b) if that
      doesn't cleanly work with RAC's Table internals, use CSS Grid with a larger `fr` share on
      the hazard-type column (e.g. a `2fr`-vs-`1fr` split) rather than a fixed width. Verify with
      screenshots at more than one viewport width that the column visibly gets more room and
      still responds to available space, not a fixed number.

      **Done — root-cause premise corrected:** checked `node_modules/react-aria-components`'s
      source directly (`dist/private/Table.mjs`, v1.20.0): when not virtualized, RAC's `Table`
      renders real `<table>/<thead>/<tbody>/<tr>/<th>/<td>` elements, not ARIA-role `<div>`s — so
      it already gets native table auto-layout, and columns were not rendering equal-width (a
      live-browser check showed "Record status"/"Hazardous event UUID" already wider than "Hazard
      type" before any fix). The real cause: auto-layout sizes each column from the widest content
      across all rows *including the header*, and "Hazardous event UUID"'s header text is far
      longer than its actual 5-character truncated cell content, pulling width away from hazard
      names (confirmed at 800px: "Tropical cyclone" wrapped to two lines pre-fix). Fixed by adding
      an explicit relative width hint (`w-[22%]`, a percentage of the table's own `w-full` width)
      to the hazard-type `Column` — neither option (a) nor (b) as originally framed was actually
      necessary once the div-vs-table premise didn't hold. Verified at 1440/1024/800px: hazard
      type is now the widest column at every width and no longer wraps.

- [x] 2.14 Only show the Edit action icon when `item.approvalStatus` is `"draft"` or
      `"needs-revision"` — showing it on every row regardless of status isn't valid (production
      gates edit via `canEditDataCollectionRecord`, which also considers user role; this POC
      simplifies to a status-only check since there's no meaningful per-user role variation to
      test here). When Edit is hidden, render a fixed-size empty placeholder in its slot
      (mirroring `ActionLinks.tsx`'s `emptySlotStyle` grid-slot trick) so View/Delete's horizontal
      position stays fixed regardless of whether Edit is present on a given row — this is also
      the point of this task: confirming the icon row doesn't reflow when one icon is
      conditionally absent. Verify with a screenshot comparing a draft/needs-revision row against
      a validated/published row.

      **Done:** the Actions cell's flex row was replaced with a CSS grid using three fixed
      `2.25rem` tracks (`grid-cols-[repeat(3,2.25rem)]`), matching `ActionLinks.tsx`'s
      `actionSlotsStyle`/`emptySlotStyle` pattern exactly. Verified with per-row screenshots:
      Published/Validated/Waiting-for-validation rows show only View+Delete with an empty slot
      where Edit would be; Draft and Needs-revision rows show Edit+View+Delete, with View/Delete
      landing at the identical horizontal position in both cases.

- [x] 2.15 Fix the action icons rendering cropped/oversized. Root-cause the actual SVG sizing (the
      `<use>` sprite elements likely need explicit width/height — check how production
      constrains icon size near `.mg-button`/`.mg-button-table` in `style-dts.css` or wherever the
      real icon CSS lives, and apply the equivalent sizing here) rather than guessing a fix.
      **Verification for this task specifically must be a cropped/zoomed screenshot of just the
      Actions column** (a full-page screenshot at normal resolution is what missed this defect
      the first time) — confirm all three icons render fully visible and uncropped before marking
      this done.

      **Done — root cause was a transform, not width/height:** the icon files
      (`edit.svg`/`eye-show-password.svg`/`trash-alt.svg`) are root `<svg width="24" height="24">`
      elements referenced via `<use>` with no width/height of its own, so per the SVG2 spec the
      generated `<use>` instance takes the *referenced* element's native 24x24 size, ignoring the
      outer wrapper svg's CSS-set 1.14rem (~18px) box — the icon rendered at native size and got
      clipped to the wrapper's top-left corner (a before-fix cropped screenshot showed
      unrecognizable fragments, not undersized-but-intact icons). `style-dts.css`'s
      `.mg-button svg * { transform: scale(0.75) translate(-2px, -2px); }` works around this exact
      issue; reproduced verbatim on the `<use>` element in `MockActionDialog.tsx`. Verified with a
      cropped Actions-column screenshot: all three icons now render as complete, recognizable
      glyphs.

- [x] 2.16 After 2.12–2.15, re-run a full visual comparison against production's authenticated
      list page plus a cropped Actions-column screenshot, and report any remaining gaps.

      **Done:** re-ran the comparison at 1440px against `/en/hazardous-event` (logged in). Right
      alignment, per-row Edit gating, and hazard-type column proportion now all visually match
      production (production's own widest column is hazard type, by a wide margin, with long
      values like "Gravitational Mass Movement ('Landslide')"; its Edit icon is likewise only
      present on Draft/Needs-revision rows). No remaining gaps identified for the four Round 2
      issues. Existing, already-accepted deviations from earlier rounds (fixture-specific values,
      mocked action dialog instead of real navigation/delete, etc.) are unchanged and out of scope
      here.

**Round 3 fix, from further live human review** — 2.12's "remove the ad hoc padding entirely"
diagnosis was wrong. Root cause, found this time by reading `style-dts.css` directly instead of
inferring from screenshots: `HazardousEventFilters` renders `<Form className="dts-form">`, and
`.dts-form:not(.dts-form--horizontal):not(.dts-form--vertical):not(.dts-form--spaced)` gets
`padding: 0 4.57rem 0 2.29rem` at `>=1164px` (i.e. `padding-left: 2.29rem`,
`padding-right: 4.57rem`) — an **asymmetric self-inset the filters form applies on top of**
`MainContainer`'s ambient `.mg-container` padding (`0 2.29rem`). The button/table have no such
self-inset, so removing their padding entirely in 2.12 made them wider than the filters instead of
matching them — the filters form was never flush with `.mg-container`'s own edge to begin with.
`HazardousEventFilters` is reused unchanged (task 2.4) — do not modify it or its `dts-form` class;
it is the source of truth for the correct inset.

- [x] 2.17 Wrap the "Add new event" button and the table/summary-text/legend/pagination
      `<section>` together in one shared container div (per the user's framing: "everything below
      the new event button is different sections within the same div") applying
      `min-[1164px]:pl-[2.29rem] min-[1164px]:pr-[4.57rem]` — the exact values from `.dts-form`'s
      rule above, not a re-guessed value. Do not add this padding to `HazardousEventFilters` itself
      or wrap it in the same container — it already self-applies this exact inset via its own
      `dts-form` class, so wrapping it too would double it. Verify via `getBoundingClientRect()`
      (not just a visual screenshot) that the button's and table's left and right edges now exactly
      equal the filters form's actual rendered content edges, at both >=1164px and just below it
      (where `.dts-form` has no extra padding, so confirm the shared container's padding is
      correctly gated behind the same `min-[1164px]:` breakpoint and doesn't over-apply below it).
      Screenshot the result at 1440px and 1024px for the record.

      **Done — corrected after review caught a DOM-order regression:** the implementer's first
      pass wrapped the button AND the `<section>` in one shared padded `<div>`, with
      `HazardousEventFilters` rendered as a later sibling *after* that whole wrapper — which
      technically satisfied the alignment measurement but silently reordered the page to
      button → table → filters, instead of production's button → filters → table. Caught via a
      fresh screenshot during final review (filters had visibly moved below the table/pagination),
      not by the bounding-rect check alone. Fixed by using **two** separate wrapper divs — one
      around just the button, one around just the `<section>` — with `HazardousEventFilters`
      rendered unwrapped in its original position between them, preserving DOM order while still
      giving each wrapper the correct self-inset.

      Re-verified end to end in a real logged-in browser session (temp user linked to the existing
      "Account for India" country account, deleted after): at 1440px, filters-body
      x=64.09/width=1279.89, table x=64.09/width=1279.89 (left/right diff = 0), button right edge
      diff = 0. At 1024px (<1164px, breakpoint should not apply): filters-body x=23.94/width=976.13,
      table x=23.94/width=976.13 (diff = 0), button right edge diff = 0 — confirming the padding is
      correctly gated behind `min-[1164px]:` and doesn't over-apply below it. DOM-order check via
      `document.querySelectorAll` confirmed button-index < filters-form-index < table-index at both
      viewports. `yarn tsc` and `prettier --check` clean on the touched file.

## 3. Create page stepper (design.md Decisions 2, 3, 4, 5, 6, 8)

- [x] 3.1 Replicate `new.tsx`'s exact loader auth pattern (manual `requireUser` →
      `getCountryAccountsIdFromSession` → `hasPermission(request, "EditData")`, with
      `argsWithSession` passed to `authLoaderGetUserForFrontend`) — do not substitute
      `authLoaderWithPerm`. After that check passes, replace the loader's `dataForHazardPicker`,
      `getUserCountryAccountsWithValidatorRole`/`getUserCountryAccountsWithAdminRole`, and
      `divisionTable` query calls with the static `hazardPickerData.ts`, `validatorUsers.ts`, and
      `divisionGeoJson.ts` fixtures (task 1.5) — no live DB read for reference/dropdown data. Keep
      the action on `authActionWithPerm` (real permission check, unchanged); per design.md Decision
      6 (revised), the action body itself no longer calls `hazardousEventCreate` or
      `handleApprovalWorkflowService` — see task 3.9a.

      **Done:** loader copies production's `requireUser` → `getCountryAccountsIdFromSession`
      (redirect to `/${lang}/user/select-instance`) → `hasPermission("EditData")` (403) →
      `argsWithSession` → `authLoaderGetUserForFrontend` sequence verbatim. Reference data
      returned is exclusively `hazardPickerDataFixture`/`validatorUsersFixture`/
      `divisionGeoJsonFixture` — no `dataForHazardPicker`, validator-role query, or
      `divisionTable` import in this file. Production's `?parent=` caused-by lookup branch (a
      real `hazardousEventById` DB read) is intentionally not carried over this round — it's
      part of Step 1's real field content (task 3.4), not this round's auth/fixture wiring, and
      is noted as deferred in the file's header comment. `action` stays on
      `authActionWithPerm("EditData", ...)` with a placeholder `{ ok: true }` body; nothing in
      this round's UI submits to it yet. Verified end to end with a temp `admin`-role user
      linked to the existing "Account for India" country account (created directly via SQL,
      logged in through the real `/en/user/login` form with Playwright, deleted afterward): the
      route returned HTTP 200 and rendered.

- [x] 3.2 Read field metadata (labels, `required` flags, enum options) from
      `fieldsDefCommon(ctx)`/`fieldsDef(ctx)` in `app/frontend/events/hazardeventform.tsx` — do
      not modify that file or the fieldsDef contract itself.

      **Done:** the route imports `fieldsDef` (which spreads `fieldsDefCommon`) and calls
      `fieldsDef(ctx)` client-side with a `new ViewContext()` (the same `DContext`-satisfying
      pattern production's own `hazardeventform.tsx` uses). A small `fieldLabel` lookup reads
      each stub field's real translated label out of that array — e.g. step 1's stub input is
      labeled from the real "National specification" field definition, not a hand-typed string.
      `hazardeventform.tsx` and the fieldsDef contract are untouched (`git diff` shows no
      changes under `app/frontend/events/`).

- [x] 3.3 Build the stepper's state model: a single controlled state object holding all field
      values, with only the active step's inputs mounted at a time (not CSS-hidden), so no
      `required` field on an inactive step can ever block native validation. Persist values across
      step navigation.

      **Done:** one `useState<Partial<HazardousEventFields>>` holds every field's value for the
      whole stepper; a separate `useState` tracks the current step index. Only the current
      step's markup (including its stub input, task 3.3's verification aid) is rendered — the
      other three steps' JSX simply doesn't exist in the tree at that point, so nothing is
      CSS-hidden. A step indicator ("Step X of 4: <title>") and React Aria `Button`-based
      Next/Back controls (disabled at the first/last step respectively) drive `stepIndex`.
      Verified with Playwright against the running dev server (temp admin user, same as 3.1):
      typed "persist-me-123" into step 1's stub input (labeled via 3.2's real fieldsDef label),
      clicked Next (step 2's differently-keyed stub input read back empty, confirming steps
      don't share state), clicked Back, and read step 1's stub input value back as
      "persist-me-123" — confirming the value survived step 1's component unmount/remount.
      Also confirmed Back is disabled on step 1 and Next is disabled on step 4. Screenshot of
      step 1 shows the page rendering inside the shared `MainContainer` header/layout wrapper
      (same as the list page and production pages), not a bare unstyled form.

- [x] 3.4 Build Step 1 (classification & linkage): hazard classification via the stubbed inline
      React Aria `ComboBox`/`Select` bound to `hip` loader data (replacing the popup-window
      `HazardPicker`), `parent`, `hazardousEventStatus`, `nationalSpecification`.

      **Done:** hazard classification is a cascading type -> cluster -> hazard picker
      (`hazardClassificationField.tsx`'s `HazardClassificationField`) built from three React
      Aria `Select`/`ListBox`/`ListBoxItem` components bound to the `hip` loader fixture
      (task 3.1) — no popup window, no `postMessage`. `parent` is read from `?parent=` in the
      loader (no live `hazardousEventById` lookup, per Decision 8) and rendered read-only via
      `CausedByField` (raw id + an "Unset" button that clears stepper state) when present, or a
      "None" message when absent — a deliberate simplification since there's no fixture keyed
      by arbitrary parent ids and the real re-pick UX is the same production-route popup being
      stubbed out above. `hazardousEventStatus` uses a React Aria `RadioGroup`/`Radio` reading
      its `enumData` from `fieldsDef(ctx)`. `nationalSpecification` uses a React Aria
      `TextField`+`TextArea`. Labels/required flags for `nationalSpecification`/
      `hazardousEventStatus` come from `fieldsDef(ctx)` (task 3.2); `hipHazardId`/
      `hipClusterId`/`hipTypeId`/`parent` have no usable `fieldsDef` label (same as production,
      which always overrides them at render time too), so their labels are sourced from the
      same i18n codes production's own override/`hazardpicker.tsx` use instead — documented in
      `hazardClassificationField.tsx`'s file header. Verified with Playwright against the
      running dev server (temp admin user linked to "Account for India", deleted after):
      selecting "Hydrological" filtered the cluster popover to exactly `Drought`/`Flood`
      (excluding Storm/Extreme temperature/Earthquake); selecting "Flood" filtered the hazard
      popover to exactly the three flood hazards (excluding Heatwave/Ground shaking) —
      confirming the cascade, not just that a selection can be made. `?parent=<uuid>` rendered
      the raw id read-only with an "Unset" button. A popover-open screenshot confirmed no
      z-index/leakage issue from the app's global PrimeReact/`style-dts.css` (Risks section
      concern). Step1Content and HazardClassificationField are defined at module scope (not
      nested in the route component) so their identity is stable across renders/keystrokes.

- [x] 3.5 Build Step 2 (timing & characterization): `startDate`, `endDate`, `magnitude`,
      `description`, `chainsExplanation`, using React Aria `TextField`/`TextArea`/`DateField`.

      **Done:** `startDate`/`endDate` use React Aria `DateField`+`DateInput`+`DateSegment`
      (`formFields.tsx`'s `DateInputField`), converting to/from the stored `yyyy-mm-dd` string
      via `@internationalized/date`'s `parseDate`/`CalendarDate` — added as an explicit
      dependency (`package.json`, alongside `react-aria-components`) since it's imported
      directly rather than relied on as an undeclared transitive dependency. **Simplification,
      not a design.md deviation:** `date_optional_precision` (these fields' real type) supports
      partial `yyyy`/`yyyy-mm` precision via a separate toggle in production's
      `app/frontend/form/input.tsx` (line 223+); this POC's `DateField` only edits full
      `yyyy-mm-dd` values and treats a stored partial value as empty — Decision 3 names the
      widget but not precision handling, so this doesn't contradict a named decision, but it's
      flagged here for the task 4.3 recommendation. `magnitude` uses a React Aria `TextField`;
      `description`/`chainsExplanation` use `TextField`+`TextArea`. All five read their
      label/required flag from `fieldsDef(ctx)` via `fieldMetaOrThrow` (task 3.2). Verified with
      Playwright: typed both dates via direct segment entry (`03/15/2026`, `03/20/2026`) and
      confirmed the field displays `3/15/2026`/`3/20/2026`; filled magnitude/description/chains
      with distinct marker strings. Cross-step persistence proof (matching task 3.3's original
      method): filled all of Step 1 + Step 2, clicked Back to Step 1 and read back the hazard
      classification/status/national-spec values, then Next back to Step 2 and read back the
      dates/magnitude/description/chains — all values survived both steps' unmount/remount.
      Step2Content is defined at module scope for the same stable-identity reason as 3.4.

      **Finding (not a functional blocker):** the browser console showed a React hydration
      mismatch on `style={{caret-color:"transparent"}}` for `Radio`/`TextArea` elements (a known
      React Aria SSR quirk — the style is applied via a client-only touch-device check) during
      manual verification. All functional assertions (cascade filtering, persistence, date
      entry) passed regardless; flagged for the task 4.3 recommendation as a real
      SSR-vs-CSR wrinkle this POC surfaced, not something this task fixes.

      **Follow-up verification (advisor-prompted, same round):** (a) confirmed steps 3/4 still
      behave exactly as task 3.3 established — step 3 shows only the placeholder text with no
      stub input, step 4 shows the placeholder plus its one `dataSource` stub input, and "Next"
      is still disabled at step 4 — i.e. this round's step-index branching change didn't alter
      steps 3/4 despite touching the same render path. (b) Checked `DateField` under a non-US
      browser locale (`en-GB`, via `browser.newContext({ locale: "en-GB" })`), since there's no
      `I18nProvider` pinning locale and this app is `$lang+`-routed: the segment order correctly
      switched to `dd/mm/yyyy` (proving the locale-driven behavior is real, not hypothetical),
      and that run captured zero hydration-mismatch console messages — the earlier
      `caret-color` mismatch didn't reproduce here, so it doesn't appear locale-dependent as
      such, but the underlying "no `I18nProvider`" gap remains a real one for the 4.3
      recommendation.

      **Two more findings for 4.3 (not blockers for this task):**
      - Partial date entry doesn't survive a step change: RAC's `DateField` only fires
        `onChange` once every segment (month/day/year) is complete, so typing e.g. only
        month+day and clicking Next writes nothing to `fields.startDate` — the partial entry is
        silently lost on the step's unmount, unlike production's precision widget, which holds
        year/month/day separately and would survive. Inherent to `DateValue | null` having no
        partial representation, not a defect in this round's code; documented here alongside
        the precision-handling simplification above since both stem from the same widget choice.
      - Date display format is inconsistent within this same POC: this create page renders
        dates as `3/15/2026` (en-US `DateField` default), while the POC list page (task 2.x)
        renders dates as `dd-MM-yyyy` via `formatDateDisplay`. Not this task's fix — task 3.12
        owns the cross-page styling/format parity comparison — but recorded here so it isn't
        rediscovered as a surprise defect later.

- [x] 3.6 Build Step 3 (location): reuse `SpatialFootprintFormView` unchanged.

      **Done:** wired exactly as production's `HazardousEventForm` does —
      `divisions={divisionGeoJSON}` (task 3.1's fixture), `ctryIso3` (newly read for real in this
      round from `getCountrySettingsFromSession`, since it's session config, not DB content
      Decision 8 mocks), `treeData={[]}` (matches production, which always passes `[]` too — the
      component lazily fetches the real division tree itself only when its "Select geographic
      level" dialog opens), `initialData={fields.spatialFootprint ?? []}`,
      `onChange={(items) => setField("spatialFootprint", items)}`. `spatialFootprint` is not
      actually a member of `HazardousEventFields` (it's loaded via a separate join, not a column
      on `hazardous_event`); introduced a local `StepperFields = Partial<HazardousEventFields> &
      { spatialFootprint?: unknown }` type for the stepper's own state instead of an `as any`
      cast (production casts `(fields as any)?.spatialFootprint` for the same gap). No friction:
      unlike `AttachmentsFormView`, this component's own `ContentRepeater.onChange` fires on every
      add/edit/delete/reorder and is properly forwarded, so the existing controlled value/onChange
      pattern applies directly. Verified with Playwright against the running dev server (temp
      admin user linked to "Account for India", deleted after): step 3 renders the widget with no
      console errors; opening "Add" → "Map coordinates" → "Open map" loads a real Leaflet map
      (OpenStreetMap tiles) with no errors, and clicking the map after selecting "Marker(s)" mode
      drops a real marker. The full commit-and-persist round trip for a *drawn* item was not
      demonstrated end to end — committing an item requires a geojson value that only comes out of
      this reused widget's own Leaflet-draw or division-tree sub-flows, both of which resisted
      reliable Playwright automation (nested PrimeReact dialog masks intercept hit-testing; this
      dev DB's live `/api/division/tree` returns `[]` for this tenant). The same `initialData`/
      `onChange` contract this step relies on *is* proven end-to-end via the sibling
      `AttachmentsFormView` in 3.7 below, so the wiring pattern itself is exercised — just via the
      other widget. Flagged for task 4.3.

- [x] 3.7 Build Step 4 (evidence, provenance & review): reuse `AttachmentsFormView`
      (`app/frontend/attachmentsFormView.tsx`) as-is, unchanged, like `SpatialFootprintFormView` —
      do NOT rebuild it. Its real PrimeReact widget cluster lives in the shared, multi-domain
      `app/components/ContentRepeater/index.tsx` (also used by disaster-event/disaster-record);
      rebuilding that is out of scope for this spike. Also add `recordOriginator`, `dataSource`.

      **Done:** wired with the same real upload/viewer URLs production's `HazardousEventForm`
      uses (`save_path_temp={TEMP_UPLOAD_PATH}`, `file_viewer_temp_url`, `file_viewer_url`,
      `api_upload_url` — all pointed at the real `/hazardous-event/...` routes, per design.md's
      "reusing the real upload mechanics is intended" note). `recordOriginator`/`dataSource` use
      the existing `TextInputField` pattern from `formFields.tsx`, reading label/required from
      `fieldsDef(ctx)` like every other Step 1/2 field. Stub input from prior rounds removed.

      **Friction found (per this task's instructions):** `AttachmentsFormView` has no `onChange`
      prop at all — the one it hands to `ContentRepeater` internally is dead code that never calls
      back out. Production doesn't need one: `ContentRepeater` commits edits into a hidden
      `<textarea>` that production's real `<form>` reads via native `FormData` at submit time, not
      through React state — a genuinely different real interface than the other stepper fields'
      controlled value/onChange pattern. Adapted with a `useLayoutEffect` cleanup on this step that
      reads that hidden textarea when the user navigates away and folds its JSON value into the
      controlled state object. Two things only surfaced by actually running it, not by reasoning
      about it: (1) `useEffect` (not `useLayoutEffect`) silently dropped every attachment on
      step-away — a passive-effect cleanup for an unmounting component runs after its DOM is
      already detached, confirmed by a live repro that lost the row, fixed by switching to
      `useLayoutEffect`; (2) `document.getElementById("attachments")` is unsafe because
      `ContentRepeater` gives both its root `<div>` and the hidden `<textarea>` the same
      `id="attachments"` (a duplicate-id bug in that reused-unchanged component) — `getElementById`
      returned the `<div>` (`.value` is `undefined`), also silently dropping data; fixed by
      querying `textarea[name="attachments"]` instead, since `name` is only set on the textarea.
      Verified with Playwright end to end (temp admin user, same as 3.6): added an attachment
      (title-only, no map/tree dependency), filled `recordOriginator`/`dataSource`, navigated Back
      through steps 3→2→1 (reading step 1/2's own values back correctly), then Next through
      1→2→3→4 — the attachment row, `recordOriginator`, and `dataSource` all survived the full
      round trip. Screenshots captured for steps 3 and 4.

      **Forward hazard for 3.9a (not this task's fix, flagged for the next round):** attachments
      only sync into stepper state on step-away (the `useLayoutEffect` cleanup above). If the final
      submit happens while the user is still standing on step 4 — which is exactly where
      `SaveSubmitDialog` lands per design.md Decision 4 — that cleanup never runs, and
      `fields.attachments` will be stale (missing the last edit) at submit time. 3.9a's mocked
      submit action should account for this (e.g. read the hidden textarea directly at submit
      time, the same way this cleanup does) rather than trusting `fields.attachments` alone.

- [x] 3.8 Rebuild the discard/exit-confirmation dialog using React Aria `Modal`/`Dialog` +
      `Button`. Confirmed inline/local to `hazardeventform.tsx` (not a shared component) — safe to
      reimplement freely in the new POC file.

      **Done:** `discardDialog.tsx`'s `DiscardDialogRac` uses a controlled RAC
      `ModalOverlay`/`Modal`/`Dialog`/`Heading`/`Button`, triggered from a new "Cancel" button
      added to the bottom button bar (present on every step, alongside "Back"). Reproduces the
      same header/body copy as production's inline dialog. Deliberate simplification: production's
      footer also duplicates a "Save as draft" button; dropped here since that action now lives
      solely in the rebuilt `SaveSubmitDialog` (task 3.9) — replaced with an explicit "Keep
      editing" button instead (production has no visible cancel affordance of its own, relying only
      on the PrimeReact `Dialog`'s built-in dismiss). Verified with Playwright against the running
      dev server (temp admin user linked to "Account for India", deleted after): opening the
      dialog from step 1 shows the header/body copy, "Keep editing" closes it and returns to the
      still-filled step, and "Discard work and exit" navigates to the POC list route. Screenshot
      captured.

- [x] 3.9 Reimplement `SaveSubmitDialog` (save-as-draft / submit-for-validation, validator
      selection, checkbox) as a **new POC-local component** using React Aria `Modal`/`Dialog`,
      `Checkbox`, and `ListBox`/`ComboBox` for the multi-select. Do NOT edit
      `app/frontend/components/approval-workflow/SaveSubmitDialog.tsx` in place — it is also
      imported by `disastereventform.tsx`, `disaster-record/form.tsx`, and `DisasterEventForm.tsx`;
      editing it would change behavior for those domains, breaking this spike's isolation. If
      reaching acceptable parity in a new component cannot be done within the time-box, record that
      as a finding rather than extending the spike indefinitely.

      **Done — multi-select parity reached, not a finding:** `saveSubmitDialog.tsx`'s
      `SaveSubmitDialogRac` reproduces all three of the real component's action rows
      (save-as-draft always; admin-only validate/publish with a nested `Checkbox`;
      validator/collector/admin submit-for-validation) plus the validator-required-for-submit
      gate on the primary action button. RAC's `ComboBox` (v1.20, confirmed by reading
      `node_modules/react-aria-components/dist/private/ComboBox.mjs` and
      `useComboBoxState`'s types) genuinely supports `selectionMode="multiple"` with a
      `value: Key[]`/`onChange` pair — a real multi-select combobox, not a hand-rolled
      substitute. The one visual gap versus PrimeReact's `display="chip"` `MultiSelect`: RAC's
      built-in `<ComboBoxValue>` only renders a comma-separated summary in the trigger, so this
      component renders its own removable chip row below the combobox instead — closing that gap
      with a small amount of extra markup, not a parity failure.

      **Real bug found and fixed during verification (not just a finding — a concrete DOM
      structure lesson):** the first pass nested the `Checkbox`/`ComboBox` as *children* of the
      `Radio` they belonged to. `Radio` renders a native `<label>` wrapping a visually-hidden
      radio `<input>` (confirmed by reading
      `node_modules/react-aria-components/dist/private/RadioGroup.mjs`) — a click on a nested
      interactive widget got consumed by the label's own activation handling before reaching the
      widget, which silently reset the RadioGroup's selection back to "submit-draft" and left the
      combobox's popover permanently unopenable. Root-caused via a live Playwright repro (render
      logging showed `selectedGroup` snapping back with no state-reset effect firing), then
      confirmed by re-reading production's `SaveSubmitDialog.tsx`: its own `<label>` already wraps
      *only* the native radio input, with the title/description/nested-widget content as a
      sibling `<div>` — this component's DOM now reproduces that same shape (`Radio` holds only
      the indicator; a sibling `<span>` holds the label text and nested widget), with an explicit
      `aria-label` added to each restructured `Radio` since the accessible name no longer comes
      from inline text content.

      Verified end to end with Playwright (temp admin user linked to "Account for India", deleted
      after): opening from step 4 shows all three options; selecting "Submit for validation"
      leaves the primary button `data-disabled="true"` with no validator chosen; opening the
      validator combobox shows all 3 fixture validators; selecting one renders a removable chip
      and clears `data-disabled`; selecting "Save as draft" needs no validator and is never
      disabled. Screenshots captured for the no-validator-blocked state, the validator popover
      open, and the selected-chip state.

      **Follow-up verification (advisor-prompted, same round):** an earlier single-run screenshot
      showed two checkboxes checked after only one deliberate option click, an unexplained
      artifact at the time. Re-ran with two options clicked deliberately (index 0, then index 1,
      re-querying the option list fresh before each click): the popover correctly showed exactly
      "Amara Okafor" and "Diego Fernandez" checked (not "Mei Tanaka" as the earlier run's stray
      third checkmark had suggested), the chip row showed exactly those two names in order, and
      the assembled payload's `tempValidatorUserIds` was the correctly comma-joined
      `"a1b2c3d4-1111-4a2b-8c3d-100000000001,a1b2c3d4-1111-4a2b-8c3d-100000000002"` — confirming
      the earlier anomaly was a one-off test-script artifact (most likely a stale `.first()`
      locator re-resolving after a popover re-render), not a real defect in the multi-select
      itself. Screenshots captured for the two-selected-validators popover state and the
      resulting success screen.

- [x] 3.9a Implement the mocked submit action (design.md Decision 6, revised): after
      `authActionWithPerm`'s real permission check passes, assemble the accumulated stepper state
      into the same shape `hazardousEventCreate` expects, `console.log` (or otherwise hold/display)
      that assembled payload, and return a simulated success result — do NOT call
      `hazardousEventCreate` or `handleApprovalWorkflowService`. Render a success/confirmation state
      on the page in place of production's redirect to `/hazardous-event/{id}` (there is no real
      `id`).

      **Done:** the action parses the `action`/`validatorIds`/`payload` fields the client submits
      via `useFetcher` (a JSON-stringified copy of the whole stepper state, not native
      `FormData`/`requestSubmit()` — consistent with design.md Decision 4, since not every field
      is ever simultaneously mounted), assembles `{ ...stepperFields, countryAccountsId,
      createdByUserId, updatedByUserId, tempAction, tempValidatorUserIds }` (mirroring
      production's own `eventData` object right before its `hazardousEventCreate` call),
      `console.log`s it, and returns it as `MockedSubmitResult` — never calling
      `hazardousEventCreate`/`handleApprovalWorkflowService`. The route's default export renders
      `SubmitSuccessContent` in place of the whole stepper once `fetcher.data.ok` is true,
      displaying the assembled payload as pretty-printed JSON on the page itself (not just
      server-terminal `console.log`, since nobody would see that while clicking through the page),
      a simulated id (`simulated-<timestamp>`), an explicit "this was a simulated save" note, and a
      link back to the POC list route.

      **Forward hazard from task 3.7, resolved:** `handleOpenSaveSubmit` (wired to the "Save or
      submit" button that opens `SaveSubmitDialogRac` from step 4) reads the same hidden
      `textarea[name="attachments"]` node Step4Content's own unmount cleanup reads, right before
      opening the dialog — since opening the dialog does not unmount Step4Content, that cleanup
      would otherwise never run and `fields.attachments` could be stale. Verified the assembled
      payload's `attachments` key reflects this (empty array in the verification run, matching no
      attachment having been added).

      Verified end to end with Playwright (temp admin user, deleted after): filled all 4 steps,
      chose submit-for-validation with one validator selected — landed on "Submitted for
      validation" showing a complete, correctly-shaped payload (`hipTypeId`/`hipClusterId`/
      `hipHazardId`, `startDate`/`endDate`, `magnitude`, `attachments: []`, `recordOriginator`,
      `dataSource`, `countryAccountsId`, `createdByUserId`/`updatedByUserId` matching the real
      temp user's id, `tempAction: "submit-validation"`, `tempValidatorUserIds` holding the
      selected validator's real fixture id); repeated with save-as-draft — landed on "Event saved
      as draft" with `tempAction: "submit-draft"` and empty `tempValidatorUserIds`; attempted
      submit-for-validation with no validator selected — confirmed blocked (primary button
      `data-disabled="true"`, mocked action never invoked). Screenshots captured for both success
      states.

- [x] 3.10 Wire per-step "Next" validation so a step cannot be left with its own required fields
      incomplete.

      **Done:** an explicit check against the state slice (design.md Decision 4's second option,
      not RAC's `isRequired`/`validate` props — this stepper never submits via a native form, so
      those props' native-`reportValidity()` semantics have nothing to hook into) implemented as
      `getBlockingErrors(stepIndex, ctx, fieldsMeta, fields)` in `new.tsx`. Gates exactly the
      fields design.md Decision 4 names as spread across steps: `hipHazardId` on step 1
      (effectively required per the UI's "Hazard classification *" label, even though it carries
      no `fieldsDefCommon` `required` flag — confirmed via `hazardClassificationField.tsx`'s
      hardcoded `required` prop, not a `fieldsDef` entry); `startDate`/`endDate` on step 2;
      `recordOriginator` on step 4 — which has no "Next" of its own, so `handleOpenSaveSubmit`
      (the "Save or submit" trigger that opens `SaveSubmitDialogRac`) is gated instead, per this
      task's own instruction. **Step 3 (location) confirmed to need no gating:** re-read
      `fieldsDefCommon` and found exactly three `required: true` entries in the whole file
      (`startDate`, `endDate`, `recordOriginator`) — `spatialFootprint` has none — so
      `getBlockingErrors` returns `[]` for step 3 and Next is never blocked there.

      Blocking reasons render in one grouped alert box near the bottom button bar (`role="alert"`,
      red border/background) — mirroring `form_components.tsx`'s real `Form` component's own
      grouped `errors.form` list rendering (one place, one list) rather than scattering per-field
      error text through Step1Content/Step2Content/Step4Content's own prop signatures. The box
      only appears once the user actually attempts to advance past a blocked step
      (`showStepErrors`, reset on every successful step change); `currentStepErrors` is recomputed
      every render rather than snapshotted at click time, so fixing the offending field makes the
      box disappear immediately without another Next click.

      Verified end to end with Playwright (temp admin user linked to "Account for India", created
      directly via SQL, deleted after) against `npx react-router dev --port 3000`: step 1 —
      clicking Next with no hazard classification selected showed "Hazard classification is
      required." and stayed on step 1; selecting Hydrological → Flood → Riverine flood then
      clicking Next advanced to step 2. Step 2 — clicking Next with both dates empty showed "Start
      date is required."/"End date is required." and stayed on step 2; typed
      "persist-magnitude-42" into the non-blocking Magnitude field first and confirmed it was
      still present in the field after the blocked Next click (no state loss from the gating
      check) — filling both dates then let Next advance to step 3. Step 3 — clicking Next
      advanced straight to step 4 with no blocking box shown at any point, confirming no gating
      fires there. Step 4 — clicking "Save or submit" with `recordOriginator` empty showed "Record
      originator is required." and did not open `SaveSubmitDialogRac`; filling it and clicking
      "Save or submit" again opened the dialog normally. One environment-specific finding fixed
      during verification (not a code defect): the very first interaction on a freshly navigated
      page silently did nothing if fired immediately after the "Step 1 of 4" text appeared — a
      client hydration race (confirmed by reproducing it in isolation and fixing it with a short
      settle wait after navigation), not a gating-logic bug; irrelevant to a real user, who takes
      more than a few hundred milliseconds to read the page before clicking.

      Screenshots (blocked → unblocked pairs) captured for the record: step 1 blocked
      (hazard-classification-required box + Next disabled-looking-but-clickable), step 2 blocked
      (both date messages + the persisted Magnitude value visible in the same screenshot), step 3
      advancing straight through with no box, step 4 blocked (Record-originator-required box, styled
      identically to steps 1/2's), and step 4 unblocked (the real `SaveSubmitDialogRac` open after
      filling the field). `yarn tsc` and `yarn prettier --check` on the touched file both clean.

- [x] 3.11 Manually verify the full mocked flow end to end: fill all 4 steps, choose save as draft
      and confirm the simulated success/confirmation state renders and the logged/assembled payload
      is complete and correctly shaped (matching `hazardousEventCreate`'s expected input) — no real
      DB row is asserted or expected; repeat and choose submit for validation with a validator
      selected (confirm the simulated success state renders); attempt submit-for-validation with no
      validator selected (confirm it's blocked before the mocked action runs).

      **Done:** verified with a scripted Playwright session (`chromium.launch()`, not the test
      runner) against `npx react-router dev --port 3000`, using a temp `admin`-role user linked to
      the existing "Account for India" country account (created via direct SQL, deleted after —
      same pattern as prior rounds). Cross-checked the assembled payload's shape directly against
      `hazardousEventCreate`'s real signature (`app/backend.server/models/event.ts:601`,
      `fields: HazardousEventFields`) and production's own `eventData` assembly
      (`app/routes/$lang+/_authenticated+/hazardous-event+/new.tsx`'s action: `{ ...data,
      countryAccountsId, createdByUserId, updatedByUserId }`).

      Run 1 (save as draft): filled all 4 steps (hazard classification Hydrological → Flood →
      Riverine flood, status radio, national spec, both dates via segment entry, magnitude,
      description, chains explanation, record originator, data source; step 3/location left
      empty — no required field there per 3.10), opened "Save or submit", left the default "Save
      as draft" radio selected, confirmed. Landed on "Event saved as draft" with a pretty-printed
      payload containing every `HazardousEventFields`-shaped key from the form
      (`hipTypeId`/`hipClusterId`/`hipHazardId`, `hazardousEventStatus`, `nationalSpecification`,
      `startDate`/`endDate`, `magnitude`, `description`, `chainsExplanation`, `attachments: []`,
      `recordOriginator`, `dataSource`) plus `countryAccountsId`/`createdByUserId`/
      `updatedByUserId` (matching the temp user's real id) and `tempAction: "submit-draft"`/
      `tempValidatorUserIds: ""`.

      Run 2 (submit for validation, one validator selected): repeated all 4 steps fresh, opened
      "Save or submit", selected "Submit for validation", opened the validator combobox and
      selected "Amara Okafor". **Real interaction bug found and worked around in the verification
      script, not in product code:** the multi-select popover stays open after picking one option
      (by design — more can be chosen), and while open, react-aria's focus-scope hides the rest of
      the dialog from the accessibility tree (`aria-hidden`) — including the primary confirm
      button — so a scripted "close popover, then click confirm" step (Escape) was needed; a real
      user tabbing/clicking away would do the same implicitly. Confirmed — clicked "Submit for
      validation", landed on "Submitted for validation" with `tempAction: "submit-validation"` and
      `tempValidatorUserIds` holding exactly the selected validator's real fixture id
      (`a1b2c3d4-1111-4a2b-8c3d-100000000001`), all other payload keys unchanged/correctly filled.

      Run 3 (submit for validation, no validator): repeated all 4 steps, opened "Save or submit",
      selected "Submit for validation" without touching the combobox — the confirm button rendered
      with `data-disabled="true"` (visually muted, screenshot captured); force-clicked it anyway to
      confirm `isDisabled` actually blocks `onPress` (not just a visual state) — dialog remained
      open, no success screen appeared, confirming the mocked action never ran. Matches 3.9's
      original gating verification; still holds after 3.10's per-step validation changes.

      Screenshots captured for the record (all under this session's scratchpad): step 1-4 filled,
      the save/submit dialog, the validator popover open, the selected-validator chip, both success
      screens (draft and submit-for-validation), and the blocked no-validator state.

- [x] 3.12 Manually compare rendered control styling (buttons, inputs, colors, spacing) against
      the production create page (`/{lang}/hazardous-event/new`) — the reference page for this
      comparison. Confirm the stepper structure itself is not treated as a parity gap.

      **Done:** screenshotted the POC's step 1/step 2 (logged in as the same temp admin user) side
      by side with production's real `/en/hazardous-event/new` (`HazardousEventForm`, single-page,
      not stepped). Per this task's framing, the stepper-vs-single-page layout difference itself is
      not counted as a gap. Control-level findings:

      - **Buttons:** near-identical — both the primary action (POC "Next"/"Save or submit",
        production "Save or submit") and the secondary action (POC "Cancel"/"Back", production
        "Discard") use the same dark-blue-solid/gray-outline pair, matching border radius, padding,
        and font weight.
      - **Text inputs and textareas** (Magnitude, Description, Chains explanation, National
        specification, Record originator, Data source): same border color/weight, border radius,
        and height between POC and production — no visible gap.
      - **Select-style dropdowns:** POC's hazard classification cascade uses a custom RAC `Select`
        trigger (text + a small "▾" glyph); production uses a native `<select>` with a browser
        chevron icon. Close in visual weight (border, padding, font) but not pixel-identical —
        expected for a from-scratch rebuild, not "obviously wrong," so recorded as a finding for
        4.3 rather than fixed here.
      - **Hazardous event Status field:** POC renders this as a `RadioGroup` (three visible radio
        options); production renders the same field as a native `<select>` dropdown
        ("Forecasted"/"Ongoing"/"Passed" as options, not visible radios). Design.md's create-page
        inventory table explicitly names `Select`/`RadioGroup` as interchangeable choices for enum
        fields, so this is not a design.md deviation — just a different widget pick for this one
        field, flagged as a finding for 4.3, not a defect.
      - **Date fields:** POC's segmented `DateField` (three-part mm/dd/yyyy spinbutton box) versus
        production's native `<input type="date">` — already flagged in task 3.5 (precision-handling
        simplification); visually the two are close (both show an mm/dd/yyyy placeholder pattern)
        and not "obviously wrong."

      No control was found unstyled or obviously broken relative to production — nothing met this
      task's "cheap and obviously wrong" bar for an inline fix, so no code changes were made for
      this task. All findings above are carried forward to 4.3.

- [x] 3.13 Manually verify the auth boundary: unauthenticated request redirects to login;
      authenticated-but-unpermitted request gets 403; no `countryAccountsId` in session redirects
      to select-instance.

      **Done:** verified with real HTTP requests/sessions (Playwright `chromium.launch()`) against
      `npx react-router dev --port 3000`, per-case with a dedicated temp user (created via direct
      SQL, deleted after, along with a temporary second `country_accounts` row created solely to
      produce the third case — see below — also deleted after):

      - **Unauthenticated:** a fresh browser context with no session cookie, navigating directly to
        `/en/poc-react-aria/hazardous-event/new`, was redirected to
        `/en/user/login?redirectTo=%2Fen%2Fpoc-react-aria%2Fhazardous-event%2Fnew` — confirmed by
        final URL and a screenshot of the real login page (not a stub).
      - **Authenticated, no `EditData` permission:** a temp `data-viewer`-role user (linked to
        "Account for India", which grants no `EditData` per `app/frontend/user/roles.ts`) logged in
        successfully, then navigating to the same URL returned a real HTTP 403 — confirmed via the
        navigation response's status code and a screenshot of the app's standard 403 error-boundary
        page (the same one production's `hasPermission` check throws into), not a POC-local stub.
      - **No `countryAccountsId` in session:** a user with literally zero `user_country_accounts`
        rows turned out to hit a **pre-existing, unrelated app bug** — not something this change
        introduced — where `/user/login` → `/` → `/hazardous-event` → `/user/select-instance` →
        `/user/login` loops indefinitely (`ERR_TOO_MANY_REDIRECTS`), because the app has no real
        supported "zero country accounts" state. Reproduced and confirmed via a manual redirect
        trace (raw `fetch` with `redirect: "manual"`, following each hop) before concluding this
        wasn't a bug in the POC route. Worked around by using the *intended* application path
        instead: linked the temp user to **two** country accounts (a temporary second
        `country_accounts` row was needed since this dev DB only has one real account; deleted
        afterward along with its `user_country_accounts` links). Logging in with 2+ accounts
        correctly lands on `/user/select-instance` without ever setting `countryAccountsId` in the
        session (this is production's own login logic, `app/routes/$lang+/user+/login.tsx`, not
        anything this POC touches) — then navigating to
        `/en/poc-react-aria/hazardous-event/new` independently redirected back to
        `/en/user/select-instance` (200), confirming the *route's own* check
        (`getCountryAccountsIdFromSession` → redirect), not just login's routing.

      No code changes were needed — all three boundaries already worked exactly as task 3.1
      described (copied verbatim from production's own auth sequence). The redirect-loop finding
      above is a pre-existing production gap (unsupported zero-country-account user state) outside
      this POC's scope; flagged here for visibility, not fixed, since fixing it would mean editing
      production login/select-instance logic, out of scope for this spike.

## 4. Wrap-up and recommendation

- [x] 4.0 `git status`/`git diff` shows no changes under
      `app/frontend/components/approval-workflow/`, `app/components/ContentRepeater/`, or any
      production Hazardous Event route/component — only new files under the POC route tree (plus
      `package.json`/lockfile for the new dependency).

      **Done:** `git status --porcelain` shows only: `app/routes/$lang+/_authenticated+/poc-react-aria+/hazardous-event+/new.tsx`
      (modified from placeholder), four new files in that same folder (`discardDialog.tsx`,
      `formFields.tsx`, `hazardClassificationField.tsx`, `saveSubmitDialog.tsx`), the `_public+`
      POC route tree from Section 2, `package.json`/`yarn.lock`, and this change's own OpenSpec
      artifacts. No file under `app/frontend/components/approval-workflow/`,
      `app/components/ContentRepeater/`, or any production Hazardous Event route is touched.

- [x] 4.1 `yarn tsc` — zero TypeScript errors.

      **Done:** `yarn tsc` clean, 0 errors, full repo.

- [x] 4.2 `yarn format:check` (run `yarn format` to fix) — Prettier clean.

      **Done:** all touched `.tsx` files were already clean; the four OpenSpec markdown artifacts
      (`design.md`, `proposal.md`, both `spec.md` files) needed one `prettier --write` pass
      (whitespace/emphasis-escaping only, no content change) — now clean, re-verified after adding
      the Recommendation section below.

- [x] 4.3 Write up the findings from tasks 2.6, 3.9, 3.11, 3.12 (and any others) into a short
      proceed / abandon / proceed-with-caveats recommendation. This recommendation is the actual
      deliverable of this spike — capture it wherever the team tracks this decision (e.g. an
      update to `_docs/refactoring-plan/design-system-unification-roadmap.md`); that document
      update is out of scope for this change and should be its own follow-up.

      **Done:** see the "Recommendation" section at the end of `design.md` — **PROCEED** (not
      abandon), with 5 caveat categories tracked as follow-up planning items (HazardPicker UX,
      `DateField` partial-precision, shared-component migration ordering, two unrelated
      pre-existing bugs found along the way, minor cosmetic gaps).

- [x] 4.4 If the recommendation is "abandon": delete the `poc-react-aria+` route folders and
      remove the `react-aria-components` dependency in the same follow-up, so the spike doesn't
      linger in the codebase.

      **Done — not applicable:** the recommendation is "proceed," not "abandon," so no cleanup
      deletion is performed here.

- [x] 4.5 Run `opsx:archive` on this branch before raising the PR.
