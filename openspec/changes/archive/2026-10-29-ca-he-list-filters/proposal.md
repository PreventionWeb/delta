## Why

`6a` (`ca-he-route-adapter-read`, merged) shipped the first Clean Architecture presentation
surface for Hazardous Events (`/he-preview`) with no filtering at all — the legacy list page's
filter bar (`app/frontend/events/hazardevent-filters.tsx`, 594 lines, 11 distinct inputs) was
never scoped into `6a`'s own proposal/design/tasks (confirmed via grep during `6a`'s own manual
review: zero mentions anywhere). This was assessed by `6a`'s own implementer as too large to bolt
on reactively: `ListHazardousEventsUseCase.execute()` has no filter support anywhere in the
application or repository layer, and none of the needed design-system form primitives (select,
combobox, date-range picker, checkbox) exist yet in `app/design-system/components/`. This change
is that deferred work, scheduled immediately after `6a` per the roadmap.

**Phase 0 verification performed directly against the current repo** (not assumed from the
roadmap's own framing): confirmed `ListHazardousEventsUseCase`, `IHazardousEventRepository`,
`DrizzleHazardousEventRepository`, and `HazardousEventListPage.tsx` as they exist today
post-`6a`-merge carry genuinely zero filter support — no filter parameter on any method, no
filter UI in the page component. The change is still needed; nothing resolved it in the interim.

**This change is substantially larger than the roadmap's own framing suggests**, because the
legacy filter set maps onto a schema that has moved on since the legacy filters were written:
record status now lives in a separate bounded context's table (`workflow_instance`, owned by
`validation-workflow`, not a column on `hazardous_event`), and hazard type/cluster/specific-hazard
no longer have a reliable `hip_*`-column filter target for CA-created records (the CA write path
never populates `hip_*` — see Decision 1). Several legacy filter behaviors also have no direct CA
equivalent at all (see "Open decisions" below). These are flagged explicitly rather than guessed
at, per standing project convention.

## What Changes

- **New**: `ListHazardousEventsUseCase.execute()`'s query gains a typed `filters` object and a
  required `userId`, forwarded unchanged to `IHazardousEventRepository.findAll`/`countAll` — the
  use case does not interpret filter semantics itself (layering guidance, confirmed binding).
- **New**: `IHazardousEventRepository.findAll`/`countAll` gain a `filters` parameter.
  `DrizzleHazardousEventRepository` is the only layer that turns it into real `WHERE`/`JOIN`/
  `EXISTS` SQL, including two new cross-context reads inside its own adapter (consistent with its
  existing precedent of importing `disasterEventTable`/`divisionTable` directly): a join through
  `specific_hazard` → `hazard_cluster` → `hazard_type` for the taxonomy filters, and an `EXISTS`
  subquery against `workflow_instance` for the record-status/"mine"/"pending my action" filters.
- **New**: `ISpecificHazardTaxonomyRepository` gains one new method, `listAll()`, preloading every
  hazard type/cluster/specific-hazard (mirroring legacy's own `dataForHazardPicker` exactly) to
  back the cascading combobox, entirely client-filtered — **confirmed as full preload, not a
  server-search endpoint**, proven by a hard row-count-equality assertion already present in the
  HIPs migration SQL itself (`specific_hazard`'s count is guaranteed equal to `hip_hazard`'s own —
  see design.md Decision 1 for the exact migration text). A new `GetHazardTaxonomyOptionsUseCase`
  wraps it for the loader to call. This change also documents `findNamesByIds`'s existing,
  previously-unspecified behavior (a pre-existing gap from `6a`, not introduced here, same pattern
  as `6a`'s own `update-hazardous-event` spec-gap fix).
- **New**: `app/design-system/components/` gains four primitives — `Select`, `Combobox` (searchable,
  cascading, client-filtered over a fully preloaded option set), `DateRangePicker` (two independent
  native date inputs, not React Aria's segmented `DateRangePicker` — see design.md Decision 9),
  `Checkbox` — same reusable-across-domains bar as `6a`'s own five primitives, not HE-owned.
- **New**: `app/domains/hazardous-events/presentation/parseHazardousEventListFilters.ts` (URL
  query → typed, validated filter object) and `HazardousEventFilterBar.tsx` (HE-owned composition
  of the new primitives, wired to the exact legacy field set) — HE-owned per ADR-009, mirroring
  `6a`'s own `parsePagination.ts` precedent.
- **Modified**: `he-preview+/_index.tsx` list loader parses filter query params, calls both
  `ListHazardousEventsUseCase` and the new `GetHazardTaxonomyOptionsUseCase` (via `Promise.all`),
  and returns `{ items, totalCount, taxonomyOptions }` from the list loader (widening the existing
  `{ items, totalCount }` return shape — still not an ADR-007 envelope).
- **Modified**: `HazardousEventListPage.tsx` renders the new filter bar as a sibling _before_ the
  existing `<section className="dts-page-section">` (matching legacy's own sibling placement, not
  nested inside the section — see design.md Decision 8a), and moves the summary line/legend
  outside the `items.length === 0` conditional so both still render on a zero-result page, matching
  legacy's own unconditional rendering (only the table itself swaps for "No records found").
- **Fixed, found during this change's own Phase 0 read, not a new scope item**: the
  `hazardous-event-route-adapter` spec still asserts the pre-`6a`-merge pagination default (`20`)
  and no-envelope return shape (`workflowStatus` array only) — both went stale when `6a`'s own
  manual-review rounds changed `parsePagination.ts`'s default to `50` and `ListHazardousEventsUseCase`
  to return `{ items, totalCount }`, without updating this spec file. Corrected here since this
  change already touches the same requirements to add filter-param parsing.
- **Not changed**: `app/frontend/events/hazardevent-filters.tsx` and the legacy list page/handler
  — untouched; this change only builds the CA-side equivalent. `DEF-014` full Pass-1 extraction
  stays out of scope (same precedent as `6a`'s own design.md Decision 8) — only the minimal
  `@theme` tokens the four new primitives actually consume are added.

## Open decisions — ALL RESOLVED, human-confirmed before `/opsx:apply`

Each originally had a recommended default so tasks.md wasn't blocked; these were judgment calls
about behavior change or scope, not pure engineering calls, and were deliberately not resolved
silently (per standing project convention: "no unilateral scope expansion," "flag assumptions").
All four are now confirmed; no decision remains open for this change.

1. **Data-viewer visibility — CONFIRMED, recommended default implemented.** Legacy's backend
   (`hazardevent.ts:219-225`) forces `recordStatus IN (validated, published)` for the
   `data-viewer` role server-side, regardless of any filter the UI sends. Verified directly:
   `ListHazardousEventsUseCase` as it exists today (post-`6a`) has **no equivalent role check at
   all** — a `data-viewer` hitting `/he-preview` today can see `DRAFT`/`SUBMITTED`/etc. records
   legacy already treats as access-controlled for that role. This is a pre-existing gap from `6a`
   (not introduced by this change), but since this change already adds the `workflow_instance`
   join needed for `recordStatus` filtering, the marginal cost of also enforcing this role rule is
   low, and leaving a known access-control gap unfixed while touching the exact code path that
   causes it is worse than fixing it now. **Confirmed: fix it, in the use case (not the
   loader), so a crafted `?recordStatus=DRAFT` query string can't bypass it** (Invariant 3:
   defense-in-depth belongs in the domain/application layer). A `data-viewer` query's
   `allowedStatuses` is restricted to `APPROVED`/`PUBLISHED`, matching legacy's own forced
   restriction for that role, and the UI-level record-status dropdown applies the same
   restriction (replicating legacy's own `getRecordStatusOptions`) — see design.md Decisions 3-4.
2. **`pendingMyAction`'s second branch has no CA equivalent — CONFIRMED, recommended
   default confirmed.** Legacy's `pendingMyAction` is `(status=needs-revision AND submittedBy=me)
OR (status=waiting-for-validation AND I'm the assigned validator via
entity_validation_assignment)`. Verified directly: the CA `validation-workflow` domain has no
   assignment-to-validator concept at all (grepped the whole domain for
   `assignedToUserId`/`entity_validation_assignment` — zero matches). This is **not** dead legacy
   code, though — `entity_validation_assignment` is a real, actively-wired, cross-domain feature
   (a submitter picks validators on submit, writes assignment rows, and emails them via
   `emailAssignedValidators`; used identically across `hazardous_event`/`disaster_event`/
   `disaster_records`), so for a `data-validator` user this branch is their actual review queue,
   not a minor detail. Inventing an assignment concept is still a new feature, correctly out of
   scope for a filter-bar intent. **Confirmed: implement only the first branch**
   (`REVISION_REQUESTED` status + `submittedByUserId = me`, using `workflow_instance`'s own
   per-transition `submittedByUserId`, not `hazardous_event`'s — see design.md Decision 3), **with
   the checkbox's label kept unchanged** ("Pending my action," not renamed to signal the narrower
   scope — the human's explicit call). The dropped second branch is tracked as `DEF-049` in the
   deferred-items register, to be scoped alongside Disaster Events' own validation-workflow
   planning (likely a shared concern, not HE-specific — the existing Herbrand behavior-analysis
   branch may already cover assignment).
3. **`recordingOrganization` — CONFIRMED, human picked the ALTERNATIVE, not the recommended
   default.** Legacy's own UI renders a free-text input with placeholder "Search organization..."
   but the backend does an exact `eq()` match against `recordOriginator`, not `ILIKE` — a real
   mismatch between the placeholder's implied behavior and the actual query, and the
   `organizations` dropdown-list prop the component declares is never rendered (dead code,
   confirmed by reading the full component body). The originally-recommended default was
   bug-for-bug legacy parity (plain text input, exact match). **Confirmed instead: `ILIKE`
   partial match** (wrapping the value in wildcards), a deliberate small UX improvement the human
   chose over literal parity, **not legacy parity** and not presented as if it were legacy's
   actual behavior. See design.md Decision 5 (rewritten, with the exact repository code) and the
   `hazardous-event-repository-port` spec delta's corrected requirement.
4. **`REJECTED` record-status option's label — CONFIRMED: "Rejected," reusing the existing i18n
   key.** `REJECTED` is a CA-only `Status` value (design.md Decision 2); it's added as a sixth
   record-status dropdown option so rejected records remain filterable. **Confirmed label:
   "Rejected," reusing the existing `status.rejected` i18n key** from
   `locales/en/hazardous-events.json` — already used by `workflowStatusDisplay.ts` for the
   detail/list status display added in `6a`. No new i18n key is invented for the filter dropdown
   option; the filter bar reuses that same key.

## Capabilities

### New Capabilities

- `hazardous-event-list-filters`: HE-owned parsing of the list route's URL query into a typed,
  validated filter object, and the presentation-layer composition of the filter bar from
  design-system primitives, wired to `ListHazardousEventsQuery`.
- `specific-hazard-taxonomy-repository-port`: `ISpecificHazardTaxonomyRepository`'s full contract
  — documents the existing `findNamesByIds` (previously unspecified, a `6a` gap) and adds the new
  `listAll()` preload method backing the cascading combobox.

### Modified Capabilities

- `design-system-components`: adds `Select`, `Combobox`, `DateRangePicker`, `Checkbox` — new
  requirements alongside the existing `Table`/`TableColumn`/`TableRow`/`TableCell`/`Link` ones,
  same capability (cross-cutting React Aria primitives), not a new capability per primitive.
- `list-hazardous-events`: `execute()`'s query gains `filters`/`userId`; new requirements for
  filter forwarding, AND-composition, the data-viewer visibility rule (Open Decision 1, confirmed),
  and validation of malformed filter values before any repository call.
- `hazardous-event-repository-port`: `findAll`/`countAll` signatures gain a `filters` parameter;
  new requirements describe the exact `WHERE`/`JOIN`/`EXISTS` semantics per filter dimension.
- `hazardous-event-route-adapter`: list loader requirement gains filter-query parsing and the
  widened `{ items, totalCount, taxonomyOptions }` return shape; also corrects two requirements
  that went stale during `6a`'s own post-proposal implementation rounds (default `pageSize`,
  no-envelope return shape — see "What Changes" above).

## Impact

**Files (new):**

- `app/domains/hazardous-events/presentation/parseHazardousEventListFilters.ts` — URL query →
  typed `HazardousEventListFilterInput` (defined in and imported from `ListHazardousEvents.ts`,
  not defined in this presentation file — see design.md Decision 3's naming note), with validation
  (malformed UUID/date/enum values dropped, not 500'd — see design.md Decision 7)
- `app/domains/hazardous-events/presentation/HazardousEventFilterBar.tsx` — HE-owned filter-bar
  composition
- `app/domains/hazardous-events/application/use-cases/GetHazardTaxonomyOptionsUseCase.ts` — new,
  minimal use case wrapping `ISpecificHazardTaxonomyRepository.listAll()` for the loader to call
  (design.md Decision 1)
- `app/design-system/components/Select.tsx`, `Combobox.tsx`, `DateRangePicker.tsx`, `Checkbox.tsx`
  — new reusable primitives
- RTL/jsdom interaction-level unit tests for the four new primitives and `HazardousEventFilterBar`
  (new `yarn test:dom` tier — see "Dependencies" and design.md Decision 12's addendum); PGlite
  integration tests for every filter dimension, AND-composition, and the new repository/use-case
  query shapes; Playwright E2E for the rendered filter bar

**Files (modified):**

- `app/domains/hazardous-events/application/use-cases/ListHazardousEvents.ts` — exports the new
  `HazardousEventListFilterInput` type; `filters`/`userId`/`role` on the query; data-viewer
  visibility rule via `allowedStatuses` (Open Decision 1, confirmed — design.md Decisions 3-4)
- `app/domains/hazardous-events/application/ports/IHazardousEventRepository.ts` — exports the new
  `HazardousEventRepositoryFilters` type (distinct from the use-case-facing one above — design.md
  Decision 3); `findAll`/`countAll` gain a `filters` parameter of that type
- `app/domains/hazardous-events/infrastructure/DrizzleHazardousEventRepository.server.ts` — the
  real `WHERE`/`JOIN`/`EXISTS` implementation (shared `buildListConditions` helper, design.md
  Decision 2); all existing test fakes of `IHazardousEventRepository` updated for the new
  parameter
- `app/domains/hazardous-events/application/ports/ISpecificHazardTaxonomyRepository.ts` and its
  Drizzle implementation — one new `listAll()` method
- `app/domains/hazardous-events/presentation/HazardousEventListPage.tsx` — renders the filter bar
  as a sibling before `<section className="dts-page-section">`; summary line/legend moved outside
  the empty-state branch so both render on a zero-result page too (design.md Decision 8a)
- `app/routes/$lang+/_authenticated+/he-preview+/_index.tsx` — loader parses filters, captures
  `requireUser`'s own return for `userId`, calls the
  new `GetHazardTaxonomyOptionsUseCase` alongside `ListHazardousEventsUseCase`, returns
  `{ items, totalCount, unfilteredTotalCount, taxonomyOptions, role }` (`unfilteredTotalCount` is
  design.md Decision 13)
- `app/domains/hazardous-events/presentation/requireViewDataPermission.server.ts` — returns the
  role it already fetches internally, instead of discarding it (the loader needs `role` for both
  the use case's data-viewer restriction and `HazardousEventFilterBar`'s own prop; avoids a second
  `getUserRoleFromSession` call — flagged and confirmed during implementation, additive to this
  change's own listed files)
- `app/domains/hazardous-events/infrastructure/HazardousEventsModule.server.ts` — wires
  `GetHazardTaxonomyOptionsUseCase` (new) into the existing module alongside the use cases `6a`
  already registered
- `app/styles/all.css` — new `@theme` tokens for the four new primitives (scope evaluated in
  design.md's "dedicated theme file" decision)
- `locales/en/hazardous-events.json`, `locales/fr/hazardous-events.json` — new filter-bar strings
- `openspec/specs/hazardous-event-route-adapter/spec.md` — stale-assertion correction (see above)

**Dependencies:** no new production/runtime dependency — reuses the existing
`react-aria-components@1.22.1` already added by `6a`. **New devDependencies, zero runtime impact**:
`@testing-library/react`, `@testing-library/user-event`,
`@testing-library/dom`, `jsdom`, `@vitejs/plugin-react@5.2.0`, added specifically to give the four
new design-system primitives genuine interaction-level unit tests (Space-toggle, keyboard-open,
typing, arrow-keys) via a new, separate `vitest.dom.config.ts`/`yarn test:dom` tier, rather than
pushing all of that to the Playwright tier — see design.md Decision 12's addendum for the full
reasoning and why a separate config was needed.

**DB migration:** none. Every new query reads existing tables (`specific_hazard`, `hazard_cluster`,
`hazard_type`, `workflow_instance`) through new joins/methods; no schema change.

**Multi-tenancy / security:** `specific_hazard`/`hazard_cluster`/`hazard_type` are global taxonomy
tables (no `countryAccountsId` — confirmed by reading their schema files), so the new `listAll()`
preload method carries no tenant filter, matching `findNamesByIds`'s existing precedent.
`workflow_instance` also carries no tenant column (by design, per its own schema comment) — the
new `EXISTS` subquery is always additionally scoped by `hazardousEventTable.countryAccountsId` on
the outer query, so it cannot leak a cross-tenant match. See Open Decision 1 (confirmed) for the
data-viewer role-visibility fix, originally flagged as security-relevant and now implemented in
`ListHazardousEventsUseCase`.

**Test approach:** PGlite integration (`yarn test:run2`) for every filter dimension individually,
AND-composition across dimensions, an empty result set, the new repository joins, and the new
`listAll()` taxonomy-repository method. RTL/jsdom interaction-level unit tests (new `yarn test:dom`
tier, no DB — see design.md Decision 12's addendum for why this diverges from `6a`'s own
`renderToString`-only precedent) for the four new design-system primitives and
`HazardousEventFilterBar`. Playwright E2E for the rendered filter bar (apply, clear, combobox
interaction) — required for any presentation-layer change per `project_ca_dual_layout_routes`.
