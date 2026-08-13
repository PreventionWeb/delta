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
      `<section>` both currently apply their own guessed `min-[1164px]:pr-[6.4rem]
      min-[1164px]:pl-[2.29rem]` padding, and neither actually lines up with
      `HazardousEventFilters`' real right/left edges — both are shifted left of where the filter
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

- [ ] 3.1 Replicate `new.tsx`'s exact loader auth pattern (manual `requireUser` →
      `getCountryAccountsIdFromSession` → `hasPermission(request, "EditData")`, with
      `argsWithSession` passed to `authLoaderGetUserForFrontend`) — do not substitute
      `authLoaderWithPerm`. After that check passes, replace the loader's `dataForHazardPicker`,
      `getUserCountryAccountsWithValidatorRole`/`getUserCountryAccountsWithAdminRole`, and
      `divisionTable` query calls with the static `hazardPickerData.ts`, `validatorUsers.ts`, and
      `divisionGeoJson.ts` fixtures (task 1.5) — no live DB read for reference/dropdown data. Keep
      the action on `authActionWithPerm` (real permission check, unchanged); per design.md Decision
      6 (revised), the action body itself no longer calls `hazardousEventCreate` or
      `handleApprovalWorkflowService` — see task 3.9a.
- [ ] 3.2 Read field metadata (labels, `required` flags, enum options) from
      `fieldsDefCommon(ctx)`/`fieldsDef(ctx)` in `app/frontend/events/hazardeventform.tsx` — do
      not modify that file or the fieldsDef contract itself.
- [ ] 3.3 Build the stepper's state model: a single controlled state object holding all field
      values, with only the active step's inputs mounted at a time (not CSS-hidden), so no
      `required` field on an inactive step can ever block native validation. Persist values across
      step navigation.
- [ ] 3.4 Build Step 1 (classification & linkage): hazard classification via the stubbed inline
      React Aria `ComboBox`/`Select` bound to `hip` loader data (replacing the popup-window
      `HazardPicker`), `parent`, `hazardousEventStatus`, `nationalSpecification`.
- [ ] 3.5 Build Step 2 (timing & characterization): `startDate`, `endDate`, `magnitude`,
      `description`, `chainsExplanation`, using React Aria `TextField`/`TextArea`/`DateField`.
- [ ] 3.6 Build Step 3 (location): reuse `SpatialFootprintFormView` unchanged.
- [ ] 3.7 Build Step 4 (evidence, provenance & review): reuse `AttachmentsFormView`
      (`app/frontend/attachmentsFormView.tsx`) as-is, unchanged, like `SpatialFootprintFormView` —
      do NOT rebuild it. Its real PrimeReact widget cluster lives in the shared, multi-domain
      `app/components/ContentRepeater/index.tsx` (also used by disaster-event/disaster-record);
      rebuilding that is out of scope for this spike. Also add `recordOriginator`, `dataSource`.
- [ ] 3.8 Rebuild the discard/exit-confirmation dialog using React Aria `Modal`/`Dialog` +
      `Button`. Confirmed inline/local to `hazardeventform.tsx` (not a shared component) — safe to
      reimplement freely in the new POC file.
- [ ] 3.9 Reimplement `SaveSubmitDialog` (save-as-draft / submit-for-validation, validator
      selection, checkbox) as a **new POC-local component** using React Aria `Modal`/`Dialog`,
      `Checkbox`, and `ListBox`/`ComboBox` for the multi-select. Do NOT edit
      `app/frontend/components/approval-workflow/SaveSubmitDialog.tsx` in place — it is also
      imported by `disastereventform.tsx`, `disaster-record/form.tsx`, and `DisasterEventForm.tsx`;
      editing it would change behavior for those domains, breaking this spike's isolation. If
      reaching acceptable parity in a new component cannot be done within the time-box, record that
      as a finding rather than extending the spike indefinitely.
- [ ] 3.9a Implement the mocked submit action (design.md Decision 6, revised): after
      `authActionWithPerm`'s real permission check passes, assemble the accumulated stepper state
      into the same shape `hazardousEventCreate` expects, `console.log` (or otherwise hold/display)
      that assembled payload, and return a simulated success result — do NOT call
      `hazardousEventCreate` or `handleApprovalWorkflowService`. Render a success/confirmation state
      on the page in place of production's redirect to `/hazardous-event/{id}` (there is no real
      `id`).
- [ ] 3.10 Wire per-step "Next" validation so a step cannot be left with its own required fields
      incomplete.
- [ ] 3.11 Manually verify the full mocked flow end to end: fill all 4 steps, choose save as draft
      and confirm the simulated success/confirmation state renders and the logged/assembled payload
      is complete and correctly shaped (matching `hazardousEventCreate`'s expected input) — no real
      DB row is asserted or expected; repeat and choose submit for validation with a validator
      selected (confirm the simulated success state renders); attempt submit-for-validation with no
      validator selected (confirm it's blocked before the mocked action runs).
- [ ] 3.12 Manually compare rendered control styling (buttons, inputs, colors, spacing) against
      the production create page (`/{lang}/hazardous-event/new`) — the reference page for this
      comparison. Confirm the stepper structure itself is not treated as a parity gap.
- [ ] 3.13 Manually verify the auth boundary: unauthenticated request redirects to login;
      authenticated-but-unpermitted request gets 403; no `countryAccountsId` in session redirects
      to select-instance.

## 4. Wrap-up and recommendation

- [ ] 4.0 `git status`/`git diff` shows no changes under
      `app/frontend/components/approval-workflow/`, `app/components/ContentRepeater/`, or any
      production Hazardous Event route/component — only new files under the POC route tree (plus
      `package.json`/lockfile for the new dependency).
- [ ] 4.1 `yarn tsc` — zero TypeScript errors.
- [ ] 4.2 `yarn format:check` (run `yarn format` to fix) — Prettier clean.
- [ ] 4.3 Write up the findings from tasks 2.6, 3.9, 3.11, 3.12 (and any others) into a short
      proceed / abandon / proceed-with-caveats recommendation. This recommendation is the actual
      deliverable of this spike — capture it wherever the team tracks this decision (e.g. an
      update to `_docs/refactoring-plan/design-system-unification-roadmap.md`); that document
      update is out of scope for this change and should be its own follow-up.
- [ ] 4.4 If the recommendation is "abandon": delete the `poc-react-aria+` route folders and
      remove the `react-aria-components` dependency in the same follow-up, so the spike doesn't
      linger in the codebase.
- [ ] 4.5 Run `opsx:archive` on this branch before raising the PR.
