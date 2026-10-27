## Why

Hazardous Events (HE) has no Clean Architecture web presentation layer today —
`app/domains/hazardous-events/presentation/` contains only `.gitkeep`. All list/detail
rendering still goes through the legacy, pre-refactor routes (`app/routes/$lang+/hazardous-event+/`,
`app/routes/$lang+/_public+/hazardous-event+/_index.tsx`). Phase 7's cutover cannot retire that
legacy path until a CA-based replacement exists, and this is the first presentation-layer intent
in the entire HE refactor (and the first new route-adapter work anywhere since the Notices pilot).

Separately, `DEF-031` (deferred-items register) is a correctness blocker: `GetHazardousEventByIdUseCase`
throws `NotFoundError` for any event with no `WorkflowInstance` row — true of every event created
before this refactor, until a separate team's Phase M backfill runs. Per the roadmap's own
phase-dependency graph, Phase 6 does not depend on Phase M, so this intent is the right place to
resolve it by making the affected use case(s) degrade gracefully instead, matching
`ListHazardousEventsUseCase`'s existing `workflowStatus: null` pattern.

## What Changes

- Add `ListHazardousEventsUseCase`/`GetHazardousEventByIdUseCase`-backed React Router loaders
  under a new, authenticated, direct-URL-only route family (list + detail), following Notices'
  route-adapter pattern for the _loader/action_ layer only (`getAppContext().get(...)`,
  `withRequestContext`, ADR-007 no-envelope) — independently verified against this project's own
  ADRs (see design.md "Notices precedent verification"). Notices' _UI/component_ layer
  (PrimeReact) is explicitly **not** followed — see next bullet.
- **Confirmed by the human — a DELTA-wide architectural mandate, not an HE- or `6a`-specific
  choice, recorded authoritatively in `hazardous-events-refactoring-roadmap.md`'s Phase 6 intro
  (2026-10-23) and `design-system-unification-roadmap.md`:** PrimeReact's open-source edition no
  longer receives updates/maintenance, so every CA-refactored module's presentation layer uses
  **React Aria** (`react-aria-components`) instead, going forward — `6a` is simply the first to
  reach this because it's the first presentation-layer work in the whole refactor. This supersedes
  `design-system-unification-roadmap.md`'s "Pass 1" PrimeReact-token-extraction plan for any
  module moving to React Aria (moot here, not merely deferred). React Aria ships unstyled; the new
  components are custom-styled to be **pixel/behavior-identical** to today's legacy
  hazardous-event list/detail UI (`app/frontend/events/hazardeventlist.tsx`, the legacy detail
  view) — not merely "visually similar," and not styled against PrimeReact's stock theme or
  Notices' own look (Notices predates this decision and stays PrimeReact-based; it remains the
  precedent for the _backend_ loader/action pattern only). Built fresh from React Aria's own
  library documentation — neither existing React Aria branch
  (`feature/poc-react-aria-hazardous-event`, `spike/react-aria-consumption`) is used as a
  reference, per explicit instruction.
- **These components are the first building blocks of a real, reusable DELTA design system**, not
  one-off page-local styling — built incrementally (this intent adds only what its own list/detail
  pages need) but with reuse by `6b`/`6c` and future domains' own presentation work in mind from
  the start. **CONFIRMED location**: a new top-level `app/design-system/components/` folder — see
  "Decisions confirmed by the human" #2 below and design.md Decision 7a.
- **CONFIRMED new scope item**: a minimal, `6a`-scoped Tailwind v4 `@theme` block (in
  `app/styles/all.css`) defining only the specific color/spacing tokens `6a`'s own components
  consume, extracted from the legacy `dts-*`/`mg-*` CSS being pixel-matched — not a `DEF-014`
  Pass-1 substitute. See "Decisions confirmed by the human" #4 below and design.md's new Decision.
- Add HE's own `presentation/` helpers (tenant resolution, error mapping, pagination parsing,
  list/detail page components) — kept local to `app/domains/hazardous-events/presentation/`
  per ADR-009, not imported from `app/domains/notices/presentation/`.
- **MODIFIED** `GetHazardousEventByIdUseCase`: no longer throws `NotFoundError` for a missing
  `WorkflowInstance`; returns `workflowStatus: null` instead (resolves `DEF-031` for this use case).
- **MODIFIED** `HazardousEventDetailDto`/`toHazardousEventDetailDto`: `workflowStatus` becomes
  `Status | null` (the base `HazardousEventDto` used by `CreateHazardousEventUseCase` is
  deliberately left untouched — see design.md Decision).
- **MODIFIED** `UpdateHazardousEventUseCase`: same graceful-degradation treatment for a missing
  `WorkflowInstance` on the existing event (resolves `DEF-031` for this use case too, per the
  roadmap's readiness-check note, even though the write-facing route that calls it ships in `6c`,
  not this intent).
- Flips two already-passing Phase 4/5 tests that currently assert the opposite (throwing)
  behavior — see design.md Risks.
- `DEF-031` is closed (deleted from the register) once this ships.
- No new nav link anywhere (Invariant 2) — verified no existing nav component references the new
  route segment.

**Not changed by this intent (explicitly out of scope):**

- `HazardousEventErrorBoundary` — `6b`'s own scope. These routes export no `ErrorBoundary`.
- Create/Edit routes, CSV import/export, REST controller, `ApiKeyAuthGuard` — `6c`–`6f`.
- `DEF-008`, `DEF-014`, `DEF-047` — tracked elsewhere, not touched here (`DEF-014`'s scope question
  for _this_ intent specifically is resolved — see "Decisions confirmed by the human" #3 below).
- The legacy `hazardous-event-list-page` OpenSpec capability (`app/frontend/events/hazardeventlist.tsx`)
  — an unrelated, pre-existing legacy component; this intent's new capability uses a distinct name
  to avoid any collision.

## Decisions confirmed by the human (recorded for traceability, not open anymore)

All three items previously flagged as open in this section have now been confirmed directly by
the human. None of the three block `/opsx:apply`; tasks.md implements all three as stated.

1. **Permission level — CONFIRMED: replicate legacy HE's `ViewData` permission, not Notices'
   bare-tenant-gate.** Legacy HE's own view routes (`picker.tsx`) already gate on
   `authLoaderWithPerm("ViewData", ...)`; Notices' CA precedent gates only on `_authenticated+`'s
   `requireUser` (no permission check at all), but HE's preview route exposes non-public/DRAFT-status
   records that legacy already treats as access-controlled — Notices' own gate would have been a
   real regression here. The check is called explicitly inside each loader (not via the legacy
   `authLoaderWithPerm` HOC wrapper, which injects `userSession` via an `as any` cast this
   project's standing rules forbid writing new instances of) — `requireUser()` for the session,
   then a plain `roleHasPermission(role, "ViewData")` check — `requireUser` exported from
   `~/utils/auth`, `roleHasPermission` from `~/frontend/user/roles` (corrected 2026-10-23: an
   earlier draft said both came from `~/utils/auth`; verified directly against the real exports at
   implementation time). This is required precisely because of the parallel-loader lesson (design.md
   Decision 1): the check cannot rely on the parent `_authenticated+` layout having already run.
   See tasks.md Section 6 for the concrete implementation/test tasks.

2. **Design-system component location — CONFIRMED: new top-level `app/design-system/components/`.**
   Rejected alternatives (HE's own `presentation/` folder — wrong owner for reusable, cross-domain
   primitives; the two existing legacy component folders `app/components/`/`app/frontend/components/`
   — would blur the new-CA-vs-legacy line this refactor otherwise maintains) are recorded in
   design.md Decision 7a. This is an architectural precedent every future domain's own
   presentation-layer work will follow, not just `6a`'s own convenience.

3. **Design-system token gap (`DEF-014`) — RESOLVED by explicit human decision, recorded here for
   traceability, not re-opened.** `design-system-unification-roadmap.md`'s full Pass 1 (extraction
   covering every token the whole app uses, across PrimeReact and legacy CSS both, as its own
   cross-cutting prerequisite intent) is **not applicable** to this intent: `6a` does not use
   PrimeReact at all (see React Aria decision above), so Pass 1's actual trigger condition ("a new
   PrimeReact `DataTable`/`Card`/etc. would render in PrimeReact's own blue... unless remapped")
   doesn't arise here. The human has explicitly rejected doing the _full_ Pass 1 as a prerequisite.
   This also resolves the `DEF-014`-vs-roadmap-doc sequencing inconsistency noted during readiness
   check: moot for `6a` specifically, since the PrimeReact-specific trigger doesn't apply. The
   broader, full-Pass-1 question (needed once the app actually has a token system spanning every
   library/domain) remains tracked under `DEF-014` for whenever that's next relevant. A much
   narrower, `6a`-scoped token layer is in scope instead — see item 4.

4. **New scope item, confirmed by the human — a minimal, `6a`-scoped Tailwind v4 `@theme` block.**
   Not a `DEF-014` Pass-1 substitute (far narrower: only the specific colors/spacing `6a`'s own
   components actually consume, extracted from the exact legacy `dts-*`/`mg-*` CSS rules being
   pixel-matched, not an app-wide extraction). `app/styles/all.css` currently imports Tailwind
   completely bare (`@import "tailwindcss";`, zero `@theme` customization, verified directly).
   Without this, every component `6a` builds would hardcode its own color/spacing values locally
   with nothing shared underneath, and the next domain to contribute to
   `app/design-system/components/` would inherit the same unresolved question with `6a`'s own
   hardcoded values already baked in as inconsistent precedent. See design.md's new Decision for
   the specific token values extracted and the alternatives considered (e.g. CSS custom properties
   outside Tailwind's `@theme` mechanism, which was rejected).

## Capabilities

### New Capabilities

- `hazardous-event-route-adapter`: React Router loaders for the new HE list/detail preview
  routes — use-case resolution via `getAppContext().get(...)`, tenant resolution, structured
  `DomainError` → `ErrorResponse` mapping, ADR-007 no-envelope success shape. Mirrors Notices'
  own `notices-route-adapter` capability shape, naming distinguished from the pre-existing
  legacy `hazardous-event-list-page` capability.
- `design-system-components`: the first reusable React Aria primitives (table/row/column/cell/
  link), custom-styled to match the legacy hazardous-event UI's actual markup/CSS exactly —
  cross-cutting, not owned by HE, intended for reuse by `6b`/`6c` and future domains' own
  presentation work. A top-level, non-domain capability, same pattern as this refactor's existing
  `authenticated-layout-route`/`public-layout-route` cross-cutting specs.

### Modified Capabilities

- `get-hazardous-event-by-id`: "A missing WorkflowInstance for an otherwise-valid event is
  rejected" becomes "...degrades gracefully" — `workflowStatus: null` instead of `NotFoundError`.
- `update-hazardous-event`: adds the previously-undocumented missing-`WorkflowInstance` behavior
  (coded and tested today via `NotFoundError`, but never captured in this spec file at all — a
  pre-existing spec/test gap, not introduced by this intent) as a new requirement describing the
  corrected graceful-degradation behavior directly, since there is no prior spec text to modify.

## Impact

**Files (new):**

- `app/routes/$lang+/_authenticated+/he-preview+/_index.tsx` — list route loader
- `app/routes/$lang+/_authenticated+/he-preview+/$id.tsx` — detail route loader
- `app/domains/hazardous-events/presentation/resolveTenantId.server.ts`
- `app/domains/hazardous-events/presentation/throwHazardousEventLoaderError.server.ts`
- `app/domains/hazardous-events/presentation/parsePagination.ts`
- `app/design-system/components/*.tsx` (CONFIRMED location) — reusable, cross-cutting React Aria
  primitives (e.g. `Table.tsx`, `TableColumn.tsx`, `TableRow.tsx`, `TableCell.tsx`, a styled
  `Link.tsx`), each custom-styled to match the legacy hazardous-event UI's actual `dts-*`/`mg-*`
  markup/CSS exactly — not HE-owned, intended for `6b`/`6c` and future domains to consume; styled
  via the new `@theme` tokens below rather than hardcoded values
- `app/domains/hazardous-events/presentation/HazardousEventListPage.tsx` — HE-specific composition
  of the `app/design-system/` primitives, bound to `HazardousEventListItemDto`
- `app/domains/hazardous-events/presentation/HazardousEventDetailPage.tsx` — same, bound to
  `HazardousEventDetailDto`
- `locales/en/hazardous-events.json`, `locales/fr/hazardous-events.json` — new i18n namespace
- Route-level PGlite integration tests + Playwright E2E tests (see tasks.md)

**Dependencies (new):** `react-aria-components` added to `package.json` — the first use of React
Aria anywhere in this codebase. No other CA domain (Notices) uses it; PrimeReact remains in place
for Notices and legacy code, untouched by this intent.

**Files (modified, new scope item):**

- `app/styles/all.css` — adds a minimal `@theme { ... }` block (Tailwind v4) immediately alongside
  the existing bare `@import "tailwindcss";`, defining only the specific color/spacing/radius
  tokens `app/design-system/components/` actually consumes (table border/header colors, a
  workflow-status-indicator color set including a new "missing" state, link/action color, cell
  padding, row height, button border-radius) — values extracted from the exact legacy
  `dts-table`/`dts-status`/`mg-button` CSS rules being pixel-matched, not an app-wide extraction.
  `public/assets/css/style-dts.css` (the legacy stylesheet) is read for reference only, never
  edited. See design.md's new Decision for the full token list and values.

**Files (modified):**

- `app/domains/hazardous-events/application/use-cases/GetHazardousEventById.ts` — degrade
  gracefully instead of throwing on a missing `WorkflowInstance`
- `app/domains/hazardous-events/application/use-cases/UpdateHazardousEvent.ts` — same
- `app/domains/hazardous-events/application/dto/HazardousEventDetailDto.ts` — nullable
  `workflowStatus`
- `app/domains/hazardous-events/application/use-cases/GetHazardousEventById.test.ts` — flip
  the existing "throws NotFoundError ... no WorkflowInstance" assertion
- `app/domains/hazardous-events/application/use-cases/UpdateHazardousEvent.test.ts` — same
- `tests/integration/domains/hazardous-events/UpdateHazardousEventUseCase.test.ts` — same, if it
  duplicates the assertion (to confirm at implementation time)

**Scope addition, confirmed by the human during implementation (2026-10-26):** Gate 9's live-DB
verification surfaced `DrizzleWorkflowRepository.findByEntity` (singular, used by HE's own Get/
Update use cases) throwing instead of gracefully skipping an invariant-invalid `WorkflowInstance`
row — `findByEntityIds` (plural, used by List) already had this handling, `findByEntity` didn't.
Fixed to match, by explicit approval, since it directly blocked this intent's own routes from
rendering real Phase-M-backfilled data:

- `app/domains/validation-workflow/infrastructure/DrizzleWorkflowRepository.server.ts` —
  `findByEntity` now matches `findByEntityIds`'s own catch/WARN-log/return-null pattern
- `tests/integration/domains/validation-workflow/DrizzleWorkflowRepository.test.ts` — flips the
  existing throwing-behavior assertion, adds a WARN-log test and a non-`ValidationError`
  propagation test, mirroring `findByEntityIds`'s own three

**Scope addition #2, confirmed by the human during implementation (2026-10-26):** Gate 10's manual
second-opinion review found an open redirect in `resolveTenantId.server.ts` — an unvalidated
`lang` route param interpolated directly into a `redirect()` target, which browsers follow
cross-origin when `lang` starts with `/`. Fixed in both this intent's own HE copy and the
byte-identical Notices original it was copied from (ADR-009), by explicit approval, via TDD:
both now validate `lang` through `~/utils/lang.backend.ts`'s `getLanguageAllowDefault`, falling
back to `DEFAULT_LANGUAGE` for an invalid value, instead of concatenating the raw param.

- `app/domains/hazardous-events/presentation/resolveTenantId.server.ts`,
  `app/domains/hazardous-events/presentation/resolveTenantId.server.test.ts` (new)
- `app/domains/notices/presentation/resolveTenantId.server.ts`,
  `app/domains/notices/presentation/resolveTenantId.server.test.ts` (new)

**Scope addition #3, confirmed by the human during implementation (2026-10-26), reversing a
scoped-out decision:** the human's own independent browser comparison against the real legacy
pages found hazard names rendering as raw UUIDs for virtually every real row — see design.md
Decision 7's "Reversed, 2026-10-26" note for the full root-cause/fix writeup. Summary:

- New port `app/domains/hazardous-events/application/ports/ISpecificHazardTaxonomyRepository.ts`
  and `app/domains/hazardous-events/infrastructure/DrizzleSpecificHazardTaxonomyRepository.server.ts`
  — resolves `specificHazardId` → `specific_hazard` → `text_content` (name), plus the ancestor
  `hazard_cluster`/`hazard_type` names, for `HazardousEventListItemDto.specificHazardName` and
  `HazardousEventDetailDto.{specificHazardName,hazardClusterName,hazardTypeName}`.
- `ListHazardousEventsUseCase`/`GetHazardousEventByIdUseCase` and their DTOs/mappers take this as a
  new sibling collaborator (same pattern as the workflow-instance lookup), injected via
  `HazardousEventsModule.server.ts`.
- `hazardLabel.ts`'s priority becomes `specificHazardLocalName ?? specificHazardNationalName ??
specificHazardName ?? specificHazardId` — the raw-id fallback now triggers only when the taxonomy
  join itself finds no match, not as the default path.
- `HazardousEventDetailPage.tsx` gains a "Hazard classification" subsection (Type/Cluster/Hazard,
  matching legacy's own three-level grouping instead of one flattened line), an Attachments section
  (filenames only, no download link — wiring a working download through the CA stack is its own
  follow-up, not silently done here), a Current spatial observation section (the DTO's own
  `currentSpatialObservation`, not a literal re-creation of legacy's raw `spatialFootprint` jsonb
  field — a distinct CA concept, labeled accordingly), and the `chains_explanation` label corrected
  to legacy's own "Composite event - chains explanation" wording.
- `dts_development`'s own under-seeded `workflow_instance` mock data (not a Phase M defect — see
  design.md's Risks section) was corrected via a one-off local `UPDATE`, documented there for
  Phase M's own developer to validate their real backfill against.

**Disclosed, not implemented — tracked as the next intent after this one:** the human's review also
found the legacy list page's filter bar (hazard/cluster/date-range/organization/status/"mine"
checkboxes), total-count summary line, and record-status legend entirely absent from `6a`'s own
scope — missed during design, not a disclosed cut (confirmed: zero "filter" mentions anywhere in
this change's own artifacts before this note). Assessed as too large to fold into `6a` (new
use-case query params, new repository filter/join logic, several new design-system form
primitives that don't exist yet) — needs its own design pass, not an ad hoc addition here.

**Scope addition #4, confirmed by the human during implementation (2026-10-26), reversing two
more signed-off decisions:** a second independent browser re-validation against real legacy pages
found four further divergences — see design.md's updated Decision 7 section for the full writeup.

- `DrizzleHazardousEventRepository.findAll`'s `orderBy` now matches legacy's own
  `hazardevent.ts:244` (`desc(updatedAt)`, most-recently-updated first) — was `asc(createdAt)`, a
  real, confirmed divergence.
- `HazardousEventListPage.tsx`'s columns are now legacy's own exact set (Hazard type / Record
  status — reusing the detail page's own `workflowStatusDisplay` rendering, not rebuilt / Hazardous
  event UUID — the event's own id truncated/linked exactly like legacy's `LangLink` / Created /
  Updated / Actions) — reverses this same proposal's earlier "narrower column set... not a visual
  regression" framing, which the human had not actually signed off on. Only `hazardousEventStatus`
  is dropped from the list; `workflowStatus` is kept (as "Record status") on both the list and the
  detail page. An initial pass wrongly dropped `workflowStatus`/"Record status" too, misreading an
  ambiguous instruction — corrected after the human re-checked the code directly. Adding the
  second interactive (UUID) column surfaced a real, design-system-wide `TableCell` keyboard-trap
  bug (fixed; see design.md Risks) — `app/design-system/components/TableCell.tsx` gains an opt-in
  `focusChild` prop, set only on the row's terminal Actions cell now.
- `HazardousEventDetailPage.tsx`'s field labels are now wrapped `<strong>{label}:</strong>`,
  matching legacy's own `view_field.tsx` treatment (was plain text).
- `parsePagination.ts`'s default `pageSize` is now `50`, matching legacy's own
  `pagination/api.server.ts` `DEFAULT_PAGE_SIZE` (was `20`, never checked against legacy).
  `HazardousEventListPage.tsx` also gains a minimal, functional page-size `<select>`
  (`PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50]`, matching legacy's own `pagination/view.tsx`), not
  blocked on `6h`'s more general design-system `Select` primitive — see design.md Decision 7 for
  the explicit "minimal, 6a-scoped, not the final reusable primitive" framing.

**Scope addition #5, confirmed by the human during implementation (2026-10-27), pulling `6h` scope
forward:** a third independent browser re-validation (field-by-field against the real Dengue
record) found the detail page's field order/bold pattern wrong in several places, and the list
page missing legacy's numbered pagination, total-count summary line, and record-status legend
entirely. See design.md's new Decision 9 for the full writeup. Summary:

- `HazardousEventDetailPage.tsx` rebuilt to the exact legacy field order and bold pattern (ID and
  the classification block stay plain; bold starts at Record status and ends after Data source);
  `hazardousEventStatus` relabeled "Hazardous event Status" and repositioned between Record
  originator and Data source; "Spatial footprint"/"Attachments" changed from `<h3>` headings to
  bold field labels, matching legacy's own field-list treatment.
- `IHazardousEventRepository` gains `countAll(tenantId, tx?)`; `ListHazardousEventsUseCase.execute()`
  now returns `{ items, totalCount }` instead of a bare array (not an ADR-007 envelope — real list
  data, not a generic wrapper). Both the real `DrizzleHazardousEventRepository` and all eight
  existing test fakes implementing the port were updated.
- `HazardousEventListPage.tsx` gains real numbered pagination (porting legacy's own
  `pagination/view.tsx` condensing algorithm exactly), the "Showing X of Y hazardous event(s)"
  summary line (legacy's own i18n key text), and the record-status color legend (reusing
  `workflowStatusDisplay`, not rebuilt) — all three previously scoped to `6h`, pulled into `6a` now
  since `6a` owns the total-count query they depend on. The roadmap's own `6h` scope note is
  updated separately, not by this change.

**Scope addition #6, confirmed by the human during implementation (2026-10-27/28):** a fourth
browser re-validation, this time against legacy's live DOM computed styles (not source
guesswork), found four more detail-page divergences; see design.md's new Decision 10 for the full
writeup. Summary: empty string fields now render `-` (matching legacy); `hazardousEventStatus`
renders its capitalized label, not the raw enum string; Start/End date reuse legacy's own
`mg-grid mg-grid__col-3` utility class (the real source of the gap between them); both in-content
headings unify on a real heading treatment — a deliberate deviation from legacy's own inconsistent
bare-h2/bare-h5 markup.

**Scope addition #7, confirmed by the human during implementation (2026-10-28):** two further
corrections to #6's own heading work, plus one new structural decision, all human's own calls, no
legacy precedent to match:

- The unified heading class switched from `dts-heading-3` down to `dts-heading-5` — `dts-heading-3`
  read too large by eye.
- All spacing (the breadcrumb-to-heading gap, and the two new group-boundary gaps below) is now
  Tailwind arbitrary-value utility classes (`mt-[0.86rem]`/`mb-[0.86rem]`), not inline
  `style={{...}}` — explicit instruction to stay within the project's own Tailwind v4 setup rather
  than bypass it.
- New structural grouping with no legacy precedent: the detail page's fields are now visually
  separated into three groups (heading+ID / classification block / everything else), live-measured
  at a uniform ~12px gap between each.

**DB migration:** None authored by this intent. A separate, corrective migration
(`20261026185058_revert_workflow_instance_validated_rename.sql`) was written and applied outside
this change's own scope, fixing a Phase M migration that had deviated from the authoritative ER
diagram — see tasks.md Section 7 for the full resolution history.

**Multi-tenancy / security:** Every loader resolves `tenantId` before calling any use case
(HE-local `resolveTenantId`, mirroring Notices' pattern) and redirects to `/{lang}/user/select-instance`
when none can be resolved. Per the known parallel-loader lesson (`project_ca_dual_layout_routes`
memory), the parent `_authenticated+` layout's `requireUser` does not gate this child loader's
execution — the tenant-presence check is this route's own real access gate, same as Notices.
Additionally (CONFIRMED, see "Decisions confirmed by the human" #1 above), each loader calls
`requireUser()` directly and checks `roleHasPermission(role, "ViewData")` before calling its use
case, replicating legacy HE's own permission gate rather than Notices' bare-tenant-only gate.

**Test approach:** PGlite integration (`yarn test:run2`) calling the exported `loader` directly
with a mock `Request`, seeding `WorkflowInstance` rows both present and absent to cover `DEF-031`'s
two states regardless of Phase M's real-world backfill timing. Playwright E2E for the rendered
pages (required for any routing/auth change, per `project_ca_dual_layout_routes` memory).
