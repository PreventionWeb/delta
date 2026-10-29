## 0. Pre-implementation verification (do this before any other task)

- [x] 0.1 Start a local dev server and log in as `test.admin@india.gov.in` (never
      `delta.admin@india.gov.in`). Open the real legacy `/en/hazardous-event` list page and capture, via
      browser DevTools (computed styles, not source guesswork — same discipline `6a`'s own history
      required): the filter bar's actual rendered spacing (grid column/row gaps, margin between the
      three rows and the actions row), the `<select>`/input's actual border-radius and padding, the
      checkbox's actual rendered size, and the combobox dropdown's actual positioning/z-index/shadow.
      Record any divergence from design.md's CSS-source-derived values (Decision 12's token table) as
      a design.md addendum before building the primitives — do not silently use the source-derived
      values if live DOM disagrees.
- [x] 0.2 Confirm with the human whether Open Decision 1 (data-viewer visibility fix), Open
      Decision 2 (`pendingMyAction` scope), Open Decision 3 (`recordingOrganization` match
      semantics — resolved to `ILIKE` partial match, the alternative, not the originally-recommended
      exact-match-parity default; corrected label), and Open Decision 4 (`REJECTED` option's exact label text) are approved as proposal.md's
      recommended defaults, or need a different resolution. Do not proceed past Task 5 until this is
      confirmed — each of those tasks implements the recommended default and must be adjusted first if
      the human picks an alternative.

  **All four confirmed:**
  - **Open Decision 1 — confirmed, recommended default.** Fix the data-viewer visibility gap now,
    in the use case.
  - **Open Decision 2 — confirmed, recommended default, with the checkbox label kept unchanged.**
    Implement branch 1 only (`REVISION_REQUESTED` + `submittedByUserId = me`); the second
    (assigned-validator) branch is deferred as `DEF-049`, to be scoped alongside Disaster Events'
    own validation-workflow planning (the Herbrand behavior-analysis branch may already cover
    this). The checkbox keeps the legacy "Pending my action" label as-is — not renamed to signal
    the narrower scope.
  - **Open Decision 3 — confirmed, the ALTERNATIVE, not the recommended default.** Switch to
    `ILIKE` partial match against `recordOriginator` (wrapping the value in wildcards), not
    literal legacy parity's exact match. This is a deliberate small UX improvement the human
    chose, not legacy parity — state it as such in the repository code comment and PR
    description, not as a port of existing behavior.
  - **Open Decision 4 — confirmed.** Label is "Rejected," reusing the existing `status.rejected`
    i18n key from `locales/en/hazardous-events.json` (already used by `workflowStatusDisplay.ts`'s
    `6a`-era detail/list status display) — no new i18n key is added for the filter dropdown
    option.

(Note: the row-count questions an earlier draft of this task list gated on a live-DB check are
already resolved by static proof in the HIPs migration SQL itself — design.md Decision 1 — so no
DB check is needed before Tasks 4/5.)

## 1. Design-system primitives — Checkbox

- [x] 1.1 Write a failing RTL/jsdom unit test at `tests/unit/design-system/components/Checkbox.test.tsx`
      (corrected location and tier — `app/design-system/components/**/*.test.tsx` is not in
      vitest's `include` glob; runs under `vitest.dom.config.ts`/`yarn test:dom`, not the main
      `renderToString`-only config — see design.md Decision 12's addendum): renders a
      native `<input type="checkbox">`, toggles on Space when focused, reports `aria-checked`
      correctly. Verify with `yarn vitest run --config vitest.dom.config.ts
tests/unit/design-system/components/Checkbox.test.tsx`.
- [x] 1.2 Implement `Checkbox.tsx` as a **plain native `<input type="checkbox">`, not React Aria**
      (corrected per design.md Decision 9 — an SSR-markup probe showed React Aria's `Checkbox`
      wraps the real input in a visually-hidden element, a structural divergence from legacy's own
      directly-styled native input), styled per design.md Decision 12's
      token values: `1.71rem` square, `appearance: none`, checked state `#004f91` background + tick
      icon via `background-image` reusing the existing `tick-white.svg` asset legacy already uses,
      hover/focus `box-shadow` glow matching `.dts-form-component input[type="checkbox"]:hover`/
      `:focus-visible` exactly. Verify the test from 1.1 passes.
- [x] 1.3 Add the new `@theme` tokens this primitive consumes to `app/styles/all.css` (checkbox
      size, checked-state color, hover/focus shadow color) per design.md Decision 12 — same inline
      block `6a` started, not a new file. Verify `yarn tsc` passes.

## 2. Design-system primitives — Select

- [x] 2.1 Write a failing RTL/jsdom unit test at `tests/unit/design-system/components/Select.test.tsx`
      (corrected location and tier, same reason as Task 1.1): closed-state trigger carries the legacy
      border/radius/padding/chevron styling (per design.md Decision 12's addendum, `Select`'s own
      padding is NOT the shared `0.4rem 0.57rem` token — assert its own distinct padding value);
      submits its selected value under its given `name` in a
      native GET form; reachable and operable via keyboard alone (Tab to focus, Enter/Space to open,
      arrow keys to choose, Enter to confirm). Verify with `yarn vitest run --config
vitest.dom.config.ts tests/unit/design-system/components/Select.test.tsx`.
- [x] 2.2 Implement `Select.tsx` (React Aria `Select`, closed-state trigger styled to match
      `.dts-form-component select` exactly: `border: 1px solid #cccccc`, `border-radius: 6px`,
      `padding: 5px 2.4rem 3px 0.57rem` — corrected per design.md Decision 12's addendum, not the
      shared `0.4rem 0.57rem` input-padding token, which would overlap the chevron — chevron
      background-image, hover/focus border `#004f91`). Verify 2.1's
      test passes.
- [x] 2.3 Add this primitive's new tokens to `app/styles/all.css` (input border color, input
      border-radius, input padding, `Select`'s own distinct padding (Decision 12's addendum), hover/focus border color — reusing `6a`'s existing hex values
      under new, form-input-scoped token names per design.md Decision 12, since the existing
      `--radius-dts-button` token is a different value for a different element family). Verify
      `yarn tsc` passes.

## 3. Design-system primitives — DateRangePicker

- [x] 3.1 Write a failing RTL/jsdom unit test at `tests/unit/design-system/components/DateRangePicker.test.tsx`
      (corrected location and tier, same reason as Task 1.1): renders exactly two
      `<input type="date">` elements with the given `fromName`/`toName`; setting only one does not
      require the other. Verify with `yarn vitest run --config vitest.dom.config.ts
tests/unit/design-system/components/DateRangePicker.test.tsx`.
- [x] 3.2 Implement `DateRangePicker.tsx` as **two independent plain `<input type="date">`
      elements** per design.md Decision 9 — explicitly not React Aria's own segmented
      `DateRangePicker`/`DateField`. Reuse `Select`/`Checkbox`'s own input styling tokens where
      applicable (border/radius/padding match `.dts-form-component input`). Verify 3.1's test passes.

## 4. Design-system primitives — Combobox

- [x] 4.1 Write a failing RTL/jsdom unit test at `tests/unit/design-system/components/Combobox.test.tsx`
      (corrected location and tier, same reason as Task 1.1): case-insensitive substring filter against
      option display text; list capped at 20 displayed options; typing non-matching free text and
      submitting does not include that text under the field's `name`; selecting an option submits
      that option's `id` under `name`; reachable via Tab, operable via arrow keys/Enter/Escape.
      Verify with `yarn vitest run --config vitest.dom.config.ts
tests/unit/design-system/components/Combobox.test.tsx`.
- [x] 4.2 Implement `Combobox.tsx` (React Aria `ComboBox`, `formValue="key"` so the selected
      option's id, not its display text, is submitted — design.md Decision 9). Accepts a full
      `options` array prop (confirmed full preload, no server search — design.md Decision 1) and
      filters client-side exactly like legacy's own `filteredHazards` logic (case-insensitive
      substring against name or `code`, capped at 20 displayed, nothing shown for an empty input). No
      debounce (synchronous, no network round-trip). Verify 4.1's test passes.

## 5. ISpecificHazardTaxonomyRepository.listAll() and GetHazardTaxonomyOptionsUseCase

- [x] 5.1 Write failing PGlite integration tests (`tests/integration/db/queries/
DrizzleSpecificHazardTaxonomyRepository.test.ts`, extending the existing file) for `listAll()`
      (all three collections returned, each sorted by name; `specificHazards` entries carry `clusterId`
      and `code`) — one test per scenario in the `specific-hazard-taxonomy-repository-port` spec delta.
      Also add the test documenting `findNamesByIds`'s existing behavior if not already covered
      (closing the pre-existing spec gap). Verify each fails for the right reason (`yarn vitest run
tests/integration/db/queries/DrizzleSpecificHazardTaxonomyRepository.test.ts`).
- [x] 5.2 Add `listAll()` to `ISpecificHazardTaxonomyRepository.ts` and implement in
      `DrizzleSpecificHazardTaxonomyRepository.server.ts`. Verify 5.1's tests pass.
- [x] 5.3 Write a failing unit test for `GetHazardTaxonomyOptionsUseCase.execute()`: calls
      `ISpecificHazardTaxonomyRepository.listAll()` exactly once and returns its result unchanged, no
      input, no tenant/auth logic of its own. Verify with `yarn vitest run
app/domains/hazardous-events/application/use-cases/GetHazardTaxonomyOptionsUseCase.test.ts`.
- [x] 5.4 Implement `GetHazardTaxonomyOptionsUseCase.ts` and register it in
      `HazardousEventsModule.server.ts` alongside the use cases `6a` already wired. Verify 5.3's test
      passes and `yarn tsc` is clean.

## 6. HazardousEventListFilterInput type and URL parsing

- [x] 6.1 Write a failing unit test for `parseHazardousEventListFilters.ts` covering every
      scenario in the `hazardous-event-list-filters` spec delta (all params supplied, none supplied,
      malformed UUID dropped, malformed date dropped, valid date accepted, unrecognized enum dropped,
      recognized CA `Status` value accepted, checkbox `"on"` convention). Verify with `yarn vitest run
app/domains/hazardous-events/presentation/parseHazardousEventListFilters.test.ts`.
- [x] 6.2 Add `HazardousEventListFilterInput` (`hazardTypeId?`, `hazardClusterId?`,
      `specificHazardId?`, `fromDate?`, `toDate?`, `recordingOrganization?`, `hazardousEventStatus?`,
      `recordStatus?` (CA `Status`), `viewMyRecords?`, `pendingMyAction?` — no `userId`, no
      `allowedStatuses`) to `ListHazardousEvents.ts` itself (application layer, exported alongside
      `ListHazardousEventsQuery` — **not** defined in `parseHazardousEventListFilters.ts`, per
      design.md Decision 3's naming/layering note: presentation imports this type from the
      application layer, never the reverse). Implement `parseHazardousEventListFilters.ts` importing
      that type. Verify 6.1's tests pass and `yarn tsc` is clean.

## 7. IHazardousEventRepository — filters parameter

- [x] 7.1 Write failing PGlite integration tests for `DrizzleHazardousEventRepository.findAll`/
      `countAll` covering every scenario in the `hazardous-event-repository-port` spec delta:
      `specificHazardId` direct match, `hazardClusterId`/`hazardTypeId` via the taxonomy join,
      `recordStatus` via the `workflow_instance` EXISTS (including the "no instance, excluded when
      filtered / included when not" pair), `allowedStatuses` (restriction, and AND-composition with
      `recordStatus` — both the "contradictory combination excludes" and "matching combination
      includes" scenarios), `viewMyRecords` (creation match, workflow-action match, no-match
      exclusion), `pendingMyAction` (status+submitter match, wrong-status exclusion), `fromDate`/
      `toDate` (including empty-string exclusion and partial-date precision), `recordingOrganization`
      `ILIKE` partial match (Open Decision 3, confirmed: a case-insensitive substring qualifies,
      e.g. `"health"` matching `"Ministry of Health"`; a non-matching value still excludes),
      AND-composition across two
      dimensions, and `countAll`/`findAll` agreement on a filtered query. Verify each fails for the
      right reason (`yarn vitest run tests/integration/db/queries/
DrizzleHazardousEventRepository.test.ts` — corrected path: `tests/integration/domains/hazardous-
events/DrizzleHazardousEventRepository.test.ts` does not exist; the real, existing file to extend
      is `tests/integration/db/queries/DrizzleHazardousEventRepository.test.ts`, confirmed by
      directory listing).
- [x] 7.2 Add `HazardousEventRepositoryFilters` (every field of `HazardousEventListFilterInput`
      plus `userId?: string` plus `allowedStatuses?: readonly Status[]`), **defined in and exported
      from `IHazardousEventRepository.ts`** (the port file — not the same type/file as Task 6.2's
      use-case-facing one, per design.md Decision 3), as the new `filters?:
HazardousEventRepositoryFilters` parameter on `findAll`/`countAll`. Update all seven existing
      fakes of the port so they continue to compile (corrected count: a grep for `implements
      IHazardousEventRepository` outside `.stryker-tmp/` finds eight matches, one of which is
      `DrizzleHazardousEventRepository.server.ts` itself, the real implementation, not a fake —
      seven fakes, threading the new parameter through; fakes that
      are pure stubs need no new logic, only a type-compatible signature). Verify `yarn tsc` passes.
- [x] 7.3 Implement a private `buildListConditions(tenantId, filters)` method in
      `DrizzleHazardousEventRepository.server.ts`, shared by `findAll` and `countAll` (design.md
      Decision 2's shared-condition-builder requirement — this is the mitigation for the "`findAll`/
      `countAll` silently disagree" risk named in design.md's Risks section). Implement each filter
      dimension per Decisions 1-6, including `allowedStatuses` as its own, separately-ANDed condition
      from `recordStatus` (Decision 4's rewrite — do not implement it as an override of `recordStatus`).
      Verify 7.1's tests pass.

## 8. ListHazardousEventsUseCase — filters, userId, role

- [x] 8.1 Write failing unit tests for `ListHazardousEventsUseCase.execute()` covering every
      scenario in the `list-hazardous-events` spec delta: filter values forwarded unreinterpreted,
      absent `userId` rejected before any repository call, the data-viewer `allowedStatuses`
      AND-composition (not override) behavior, and the `viewMyRecords`/`pendingMyAction` user-id
      scoping. Verify with `yarn vitest run
app/domains/hazardous-events/application/use-cases/ListHazardousEvents.test.ts`.
- [x] 8.2 Add `userId: string`, `role: string | null` (required, design.md
      Decision 4), and `filters?: HazardousEventListFilterInput`
      (Task 6.2's use-case-facing type) to `ListHazardousEventsQuery`. Implement `execute()` building
      the `HazardousEventRepositoryFilters` object it passes to `findAll`/`countAll` by spreading
      `query.filters` and adding `userId: query.userId` plus, when `query.role === "data-viewer"`,
      `allowedStatuses: ["APPROVED", "PUBLISHED"]` (Task 0.2 confirmed Open Decision 1). Verify 8.1's
      tests pass.

## 9. HazardousEventFilterBar and route/loader wiring

- [x] 9.1 Write a failing RTL/jsdom unit test (`vitest.dom.config.ts`/`yarn test:dom` tier — see
      design.md Decision 12's addendum) at
      `app/domains/hazardous-events/presentation/HazardousEventFilterBar.test.tsx` covering every scenario in the `hazardous-event-list-filters` spec
      delta's rendering requirements: exact field count/order across the three rows plus actions row,
      "mine" checkboxes hidden for a role that cannot add records, "mine" checkboxes present for a
      role that can, record-status options restricted to Approved/Published for a `data-viewer` role
      and unrestricted otherwise, a hidden `pageSize` input carrying the current view's value and no
      `page` field at all, and the "Clear" link's target having no query string. Pass `role` directly
      as a prop in each test case (no `useViewContext()`/root-loader mocking needed — design.md's
      role-as-prop decision). Verify with `yarn
vitest run --config vitest.dom.config.ts app/domains/hazardous-events/presentation/HazardousEventFilterBar.test.tsx`.
- [x] 9.2 Implement `HazardousEventFilterBar.tsx` using the field set, grouping, and copy table
      below (verbatim from `hazardevent-filters.tsx`, corrected only for the taxonomy field names per
      design.md Decision 1). It receives `taxonomyOptions: HazardTaxonomyOptions` (Task 5's new type,
      the full preloaded `{ types, clusters, specificHazards }`) and `role: string | null` (explicit
      prop, not `useViewContext()` — design.md decision) as props, and does all
      type→cluster→hazard cascading/filtering client-side against that one preloaded object — no
      per-keystroke network call:

  **Row 1** (`mg-grid mg-grid__col-3`): Hazard type `Select` (`name="hazardTypeId"`, label
  "Hazard type", first option "All hazard types", options from `taxonomyOptions.types`) → Cluster
  `Select` (`name="hazardClusterId"`, label "Cluster", first option "All clusters", options from
  `taxonomyOptions.clusters` filtered to the selected type) → Specific hazard `Combobox` (`name=
"specificHazardId"`, label "Specific hazard", placeholder "Enter hazard name or HIPS ID ...",
  options from `taxonomyOptions.specificHazards` filtered to the selected cluster). Selecting a
  type resets the cluster selection and the combobox's own text/selection (stale-id bug fixed per
  design.md Decision 10). Selecting a cluster resets only the combobox's text/selection.

  **Row 2** (`mg-grid mg-grid__col-3`): From-date `DateRangePicker`'s first input
  (`name="fromDate"`, label "From") → To-date `DateRangePicker`'s second input (`name="toDate"`,
  label "To") → Recording organization plain text `<input>` (`name="recordingOrganization"`,
  label "Recording organization", placeholder "Search organization...", no dropdown, no
  `organizations` prop — per Open Decision 3, confirmed: the widget is still a plain text input,
  but its match semantics are `ILIKE` partial match, not legacy's exact-match parity; implemented
  in the repository layer, Task 7.3, not in this component).

  **Row 3** (`mg-grid mg-grid__col-2`): Hazardous event status `Select` (`name=
"hazardousEventStatus"`, label "Hazardous event status", first option "All event statuses",
  options Forecasted/Ongoing/Passed) → Record status `Select` (`name="recordStatus"`, label
  "Record status", first option "All record statuses", options Draft/"Waiting for
  validation"/"Needs revision"/Validated/Published/"Rejected" (the `REJECTED` option's label,
  Open Decision 4 confirmed: reuse the existing `status.rejected` i18n key, not a new string —
  see Task 9.4), **restricted to only the Validated/Published options when the current role is
  `data-viewer`**
  per design.md Decision 4's UI-level restriction.

  **Actions row** (`dts-form__actions dts-form__actions--standalone`, `justify-content:
space-between`): left side, `gap: 2rem` — "View my records" `Checkbox` (`name=
"viewMyRecords"`) then "Pending my action" `Checkbox` (`name="pendingMyAction"`), both hidden
  (not just disabled) when `canAddNewRecord(role)` is false; right side, `gap: 0.8rem` — "Clear"
  (`mg-button mg-button-outline mg-button--small`, links to the list route's bare base path, no
  query string at all) then "Apply filters" (`mg-button mg-button--small mg-button-primary`,
  submit button).

  Also include a hidden `<input type="hidden" name="pageSize" value={currentPageSize} />` (no
  `page` field) so submission preserves `pageSize` while implicitly resetting to page 1 — spec
  requirement "Applying filters resets pagination to page 1 while preserving pageSize via a
  hidden field."

  No "Filters" `<h3>` heading anywhere (legacy HE's own bar has none, unlike the generic
  `Filters` shell). Verify 9.1's test passes.

- [x] 9.3 Wire `HazardousEventFilterBar` into `HazardousEventListPage.tsx` as a **sibling before**
      the existing `<section className="dts-page-section">` (not nested inside it — design.md
      Decision 8a), passing it `taxonomyOptions` and `role` (both from loader data — design.md's
      role-as-prop decision). Move the summary line and legend
      outside the `items.length === 0` conditional so both render unconditionally (matching legacy);
      that conditional now gates only the table-vs-"No records found" choice. Update
      `he-preview+/_index.tsx`'s loader to capture `requireUser`'s own return for `userId`
      (`userSession.user.id` — matches the existing pattern in, e.g.,
      `app/routes/$lang+/_authenticated+/hazardous-event+/new.tsx`; currently discarded), change
      `requireViewDataPermission.server.ts` to return the `role` it already fetches internally via
      `getUserRoleFromSession` (instead of discarding it) and capture that return in the loader —
      not a second `getUserRoleFromSession` call, call `parseHazardousEventListFilters`, call
      `ListHazardousEventsUseCase.execute` and `GetHazardTaxonomyOptionsUseCase.execute` via
      `Promise.all`, and return `{ items, totalCount, taxonomyOptions }`. Verify with a PGlite
      integration test (corrected path: extend the real, existing
      `tests/integration/domains/hazardous-events/routes/HazardousEventListRoute.test.ts` — the
      file `tests/integration/routes/he-preview.test.ts` named in an earlier draft of this task does
      not exist) asserting a filtered query string narrows the rendered rows, and an RTL/jsdom test
      (`vitest.dom.config.ts` tier) asserting the filter bar
      is not a descendant of the page section and that the
      summary line/legend render on a zero-result page.
- [x] 9.4 Add filter-bar i18n strings to `locales/en/hazardous-events.json` and
      `locales/fr/hazardous-events.json`, copied verbatim from `hazardevent-filters.tsx`'s own `ctx.t`
      calls (English source text) with a French translation for each. The `REJECTED` record-status
      option (Open Decision 4, confirmed) reuses the existing `status.rejected` key already present
      in both locale files (used by `workflowStatusDisplay.ts` since `6a`) — do **not** add a new
      key for it. Run `yarn i18n:extractor` and verify no missing-key CI check failure.
- [x] 9.5 Playwright E2E coverage for the rendered filter bar, per proposal.md's own stated "Test
      approach" (required — this behaviour is only verifiable via a real client-side router
      navigation, which Vitest/jsdom component tests cannot exercise): apply persists the displayed
      value; Clear resets every field's displayed value, not just the URL/loader data (the regression
      guard for the Gate 9 "Clear" bug); a single-character combobox search opens the suggestion
      list (regression guard for the synthetic-ArrowDown fix); the summary line reads the filtered
      total of the role-safe unfiltered total against real seeded `hazardous_event` rows (regression
      guard for Decision 13). New spec file `tests/e2e/hazardous-events/he-preview-filters.spec.ts`,
      following `he-preview.spec.ts`'s own seeding conventions. Red/green verified for the
      Clear-reset test (fails without the `key` fix, passes with it). 4/4 scenarios pass against the
      real dev server.
- [x] 9.6 Decision 13 reversal (see design.md Decision 13): `ListHazardousEventsUseCase.execute()`
      runs a second `countAll` in parallel with the existing filtered one, carrying only the
      data-viewer `allowedStatuses` restriction (never a truly empty filter), and returns it as
      `unfilteredTotalCount` alongside the existing `totalCount`. Threaded through the route loader
      and `HazardousEventListPage.tsx`'s summary line
      (`filtered: totalCount, total: unfilteredTotalCount`, not `items.length`/`totalCount`).
      Pagination's own `totalPages` calc is unaffected — stays on the filtered `totalCount`. New
      unit tests in `ListHazardousEvents.test.ts`
      (second `countAll` call's filters, role-safe denominator, the two counts resolving
      independently); updated `HazardousEventListPage.test.tsx` fixture/summary-line test to exercise
      three distinct values (page count, filtered total, unfiltered total). Updated
      `list-hazardous-events`/`hazardous-event-route-adapter` spec deltas for the new two-count
      return shape.

## 10. Correct the stale `hazardous-event-route-adapter` spec text

- [x] 10.1 Confirm (already captured in this change's spec delta) that `app/routes/$lang+/
_authenticated+/he-preview+/_index.tsx` and `parsePagination.ts` as they exist today already
      match the corrected (default `50`, `{items, totalCount}`) requirement text — this task is a
      verification-only check, no code change, since the drift was in the spec file, not the code.
      Verify by reading both files directly and comparing against the corrected spec text.

## 11. Quality gates (run in this order; each gates the next)

- [x] 11.1 `yarn vitest run` across every new/modified test file from Tasks 1-9, plus `yarn
test:dom` for the five RTL/jsdom-tier files (Checkbox/Select/DateRangePicker/Combobox/
      HazardousEventFilterBar — `vitest.dom.config.ts`) — all green.
- [x] 11.2 `yarn tsc` — zero TypeScript errors.
- [x] 11.3 `npx prettier --check <changed files>`, scoped to exactly this change's own files —
      never `yarn format`/`yarn format:check` with no file scope, which reformats hundreds of
      unrelated files in this repo (standing project rule).
- [x] 11.4 Anti-pattern review against `.github/skills/anti-pattern-check/SKILL.md`.
- [x] 11.5 SOLID review — invoke the `solid-reviewer` agent, scoped to this change's diff.
- [x] 11.6 Documentation review — comments explain WHY not WHAT, one full-diff sweep, via a fresh
      subagent (not self-review).
- [x] 11.7 Project conventions review against `.github/copilot-instructions.md`.
- [x] 11.8 Code review — run `.github/skills/code-review/SKILL.md` in full, via a fresh subagent.
- [x] 11.9 Visual/UX parity review (required — this change touches `app/domains/hazardous-events/
presentation/` and `app/routes/`): render the new filter bar against the real legacy
      `/en/hazardous-event` filter bar captured in Task 0.1 — compare layout grouping, spacing,
      checkbox/select/combobox appearance, button placement. Any divergence from Task 0.1's captured
      values or this document's stated acceptance criteria is a finding to fix before archiving.
      A human manual UI review (root causes verified via live DOM/CSS, not visual impression) found
      further real bugs the initial automated pass missed: popover width collapse, missing option
      hover/focus highlight, 0 label-to-control gap on Select/Combobox, Select trigger height
      shortfall, "Clear" not resetting the displayed Select/Combobox/checkbox values, and listbox
      options having no padding. All fixed in `app/styles/all.css` (CSS-only, no new tokens beyond
      what's listed in design.md Decision 12, no inline styles, no hardcoded pixels) plus
      `key={JSON.stringify(currentFilters)}` on `HazardousEventFilterBar` in
      `HazardousEventListPage.tsx` for the Clear-reset fix, and re-verified live via Playwright
      `getComputedStyle`/`getBoundingClientRect` against `/en/he-preview` — see design.md's own
      findings (end of Decision 12) for full root-cause detail and verified numbers. The summary
      line's own "X of Y" semantics were also raised in this review and directly contradicted this
      document's own original Decision 13 — resolved by reversing that decision (see Decision 13,
      rewritten in place, not left as a contradicting addendum). Verification is side-by-side
      against the real legacy `/en/hazardous-event` page (confirmed via its route file to still
      serve the legacy component), not `/en/he-preview` screenshots alone.
- [x] 11.10 Independent second-opinion review — Claude Code's built-in `/code-review` at `high`
      effort, via a second, separate fresh subagent. Resolve findings before archiving. Findings
      resolved: Select.tsx `String(null)` guard, `.github/copilot-instructions.md` CI-footnote
      accuracy, `_docs/code-structure/testing.md` tier doc, missing `validatedByUserId` coverage.
      `role` required-vs-optional flagged for human decision (design.md deviation); human sided
      with the reviewer — `role` is now required (still nullable); see Decision 4.
- [x] 11.11 Test quality audit — invoke `test-quality-auditor` scoped to every changed file under
      `app/domains/hazardous-events/**` and `app/design-system/components/**` with real implementation
      logic (Tasks 1-9's repository/use-case/primitive files; excludes type-only port additions).
      Resolve any real gap found. 7 of 11 target files couldn't be mutated at all (Stryker's bundled
      Babel instrumenter crashes on `implements`/`extends`/generics/function-type interface
      properties — corroborates DEF-041's existing scope, no new deferred-items entry per standing
      instruction); those were manually reviewed instead. `ListHazardousEvents.ts` 97.83%,
      `HazardousEvent.ts` 95.45%; `requireViewDataPermission.server.ts`'s 2 survivors are
      error-message wording only, no action needed. 7 real gaps found, all pure test additions
      (zero production code change), all written and passing: HazardousEventFilterBar's Type→Cluster
      and Cluster→Hazard narrowing (2 tests), hazardousEventStatus option-content assertions (2
      tests), DrizzleHazardousEventRepository's fromDate/toDate exact-boundary inclusion (2 tests),
      pendingMyAction wrong-submitter exclusion (1 test), escapeLikePattern literal `%` (1 test),
      parseHazardousEventListFilters recordingOrganization whitespace trim/all-whitespace (2 tests).

## 12. Regression and archive

- [x] 12.1 `yarn test:run2` (full PGlite suite) and `yarn test:dom` (new RTL/jsdom tier) — no new
      failures. Pre-implementation baseline on this branch, before any `app/` change: `yarn test:run2`
      run twice, consistently 1815 passing, with 2-5 _different_ unrelated tests timing out each run
      (`HttpServerBootstrap`, `approvalStatusWorkflowService`, `countryAccountService.clone`,
      `NoticesController` — none touch hazardous-events/filters code), confirming resource-contention
      flakiness (a dev server + Playwright were also running), not a deterministic pre-existing
      failure set.

      **Standing operational note:** a leftover dev server or orphaned Playwright `test-server`
      process (invisible to `ps aux`, visible via `tasklist`/`Get-CimInstance`) reliably contaminates
      this run — duration spikes by an order of magnitude and/or a worker fails to spawn for an
      unrelated file. Always check `Get-CimInstance Win32_Process -Filter "Name='node.exe'"` for
      stray processes and get explicit confirmation before killing any that aren't your own, before
      trusting a `test:run2` result. This environment's auto-mode classifier blocks bulk multi-PID
      `Stop-Process` calls, so kill stray PIDs one at a time.

      Genuinely clean final result, after Decision 13's reversal (Task 9.6) added its own 3 new
      unit tests: `yarn test:run2` 146/146 files, 1890 passed + 1 todo (1891), zero failures, zero
      unhandled errors; `yarn test:dom` 5/5 files, 31/31 passed. No regressions — the test-count
      increase vs. the 1815 baseline is this change's own added tests. (One intermediate run, with
      only the contamination described above and none of this change's own work in play, hit
      exactly the 4 pre-existing flaky files the baseline above already named, all pure timeouts —
      confirms the flaky set is stable and unrelated to this change, not a new concern.)

- [x] 12.2 Run `opsx:archive` on this branch (`feature/ca-he-list-filters`) before raising the PR.
