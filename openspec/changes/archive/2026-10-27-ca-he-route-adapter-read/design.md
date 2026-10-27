## Context

See proposal.md "Why"/"What Changes" for motivation. This document covers how the new routes are
built and how `DEF-031` is resolved at the application layer.

HE's application layer (Phases 2–5) already ships `ListHazardousEventsUseCase`,
`GetHazardousEventByIdUseCase`, and `UpdateHazardousEventUseCase`, wired through
`HazardousEventsModule.server.ts` (imported, but deliberately **not exported**, from the root
`CoreModule` — "`ca-hazardous-events-module` design.md Decision 3"). `app/domains/hazardous-events/presentation/`
is empty (`.gitkeep` only) — this is the first intent to populate it.

The only existing precedent for this exact shape (loader → `getAppContext().get(UseCase)` →
`withRequestContext` → `DomainError` → `ErrorResponse`) is Notices
(`app/routes/$lang+/_authenticated+/notices+/{_index,$id}.tsx`). Per standing session guidance,
Notices is a strong starting reference, not gospel — every pattern borrowed from it below is
independently checked against this project's own ADRs, not copied because "Notices did it." This
applies with particular force to the UI: Notices' component layer is PrimeReact-based, but `6a`
is confirmed (human decision, 2026-10-23, superseding the roadmap's prior text) to use React Aria
instead, styled to pixel/behavior-match the _legacy_ hazardous-event UI, not Notices' look — see
Decision 7.

## Goals / Non-Goals

**Goals:**

- Thin loaders only — no business logic inline, matching the roadmap's own instruction.
- Resolve `DEF-031` at the application layer for both affected use cases, with test coverage for
  both the "has WorkflowInstance" and "missing WorkflowInstance" states.
- Keep HE's presentation layer self-contained inside its own `presentation/` folder (ADR-009),
  with no import from `app/domains/notices/presentation/`.
- Build the first components of a reusable, cross-cutting React Aria design system (not HE-owned),
  usable by `6b`/`6c` and future domains, styled to pixel/behavior-match the current legacy HE UI.

**Non-Goals:**

- `HazardousEventErrorBoundary` (`6b`), create/edit routes (`6c`), CSV (`6d`), REST controller/API
  key guard (`6e`/`6f`) — not touched here.
- The _full_ `DEF-014` Pass 1 (an app-wide token-extraction intent covering every library/domain,
  as its own separately-scoped prerequisite) — explicitly rejected by the human as a prerequisite
  for this intent (not deferred for later review; already decided). What IS in scope, confirmed by
  the human and distinct from full Pass 1: a minimal, `6a`-scoped Tailwind `@theme` block covering
  only the tokens `6a`'s own components consume — see Decision 8.
- Any reliance on PrimeReact or Notices' own visual/component layer as a styling reference. Notices'
  precedent is backend/loader-pattern only (Decision 5–6 below); its UI is PrimeReact-based and not
  applicable to `6a`, which uses React Aria.
- Any change to `CreateHazardousEventUseCase` or the base `HazardousEventDto`/`toHazardousEventDto`
  — Create's guarantee that a freshly created event always has a real `WorkflowInstance` is a true
  domain invariant (not a legacy-data gap) and is deliberately left untouched.

## Decisions

### Decision 1 — Route placement: `app/routes/$lang+/_authenticated+/he-preview+/{_index,$id}.tsx`

The roadmap's own placeholder path (`app/routes/$lang+/he-preview+/...`) sits **outside**
`_authenticated+`, which would make the route unauthenticated as literally written — the roadmap
itself flagged the exact segment as "TBD at spec time." Nesting under `_authenticated+` (matching
Notices exactly) is the correct resolution: it's the only CA-established auth layout in this
codebase, and the legacy `hazardous-event+`/`_public+/hazardous-event+` segments are already taken
by unrelated routes, confirmed via directory listing — `he-preview+` does not collide with any of
them. This path is binding for `6b` (ErrorBoundary export) and `6c`/`6d` (`new.tsx`, `edit.$id.tsx`,
`csv-import.tsx`, `csv-export.tsx` all join this same segment).

**Important correctness note, not a design choice to hedge on**: per the `project_ca_dual_layout_routes`
memory (P1-8, 2026-05-16), React Router's matched-route loaders run in parallel
(`Promise.all`-like) — the `_authenticated+` layout's `requireUser` call does **not** gate this
child loader's own execution or the response it can produce. Notices' loaders get away with
relying on it only because `resolveTenantId` incidentally requires a resolvable `tenantId`
(itself keyed off the session) before calling any use case — a request with no valid session
never has a `tenantId` and is redirected before any data is touched. This intent's HE-local
`resolveTenantId.server.ts` reproduces the identical guarantee. Decision 2's confirmed `ViewData`
permission check **must** call `requireUser()` directly inside this route's own loader for exactly
this reason — it cannot assume the parent layout already ran it.

### Decision 2 — Permission check: CONFIRMED, replicate legacy's `ViewData` check

**Confirmed by the human** (see proposal.md "Decisions confirmed by the human" #1). Two options
were weighed:

- Option A (Notices-parity): no permission check beyond `resolveTenantId`'s implicit gate.
  Simplest, matches the one CA precedent that exists, but would be a real access-control
  regression — HE's preview route exposes non-public/DRAFT-status records that legacy already
  gates behind `ViewData`, unlike Notices' own content.
- **Option B (legacy-parity) — the confirmed choice**: an explicit `ViewData` permission check,
  called directly inside each loader. Implementation: `requireUser()` for the session (from
  `~/utils/auth`), then a plain `roleHasPermission(role, "ViewData")` check (from
  `~/frontend/user/roles` — corrected 2026-10-23, verified directly against the real exports;
  an earlier draft said both came from `~/utils/auth`) —
  **not** the legacy `authLoaderWithPerm` HOC wrapper, which injects `userSession` via an `as any`
  cast this project's own standing rule forbids writing new instances of. Per Decision 1's
  parallel-loader correctness note, this check cannot rely on the parent `_authenticated+` layout
  having already run `requireUser` — it must call it directly itself. A session without `ViewData`
  is rejected with the same `AuthorizationError`/`FORBIDDEN` (403) shape `DomainError` already
  defines, thrown as a structured `ErrorResponse` like any other `DomainError` from this loader.

### Decision 3 — DEF-031 mechanism: application-layer fix, DTO-local override (not the base DTO)

A route-layer accommodation (catching `NotFoundError` in the loader and rendering a degraded
state) is not viable: `GetHazardousEventByIdUseCase.execute()` throws _before_ it fetches the
current spatial observation, so a route-layer catch would have to re-fetch and re-assemble the DTO
itself — duplicating use-case logic in the presentation layer, which the roadmap's own thin-loader
instruction forbids. The fix belongs in the two use cases themselves, exactly as the roadmap's
readiness-check note directs.

**Type-level approach**: widen only the Detail/Update-side DTOs, not the shared base `HazardousEventDto`:

- `HazardousEventDto.workflowStatus: Status` (non-null) stays exactly as-is. `CreateHazardousEventUseCase`
  always calls `InitializeWorkflowInstanceUseCase` first and genuinely always has a real
  `WorkflowInstance` — that's a domain truth, not a legacy-data gap, and weakening its return
  type to accommodate a problem Create never has would be the wrong trade.
- `HazardousEventDetailDto` (currently `extends HazardousEventDto`) changes shape to match
  `HazardousEventListItemDto`'s already-established pattern exactly: `Omit<HazardousEventDto, "workflowStatus"> & { workflowStatus: Status | null }`,
  built from `mapHazardousEventFields(event)` instead of `toHazardousEventDto(event, workflowInstance)`.
  `toHazardousEventDetailDto`'s `workflowInstance` parameter becomes `WorkflowInstance | null`.
- `UpdateHazardousEventUseCase` gets its own equally-shaped local result type (same
  `Omit<HazardousEventDto, "workflowStatus"> & { workflowStatus: Status | null }` override,
  defined in `UpdateHazardousEvent.ts` itself) rather than reusing `HazardousEventDetailDto`
  (Update has no `currentSpatialObservation` concept) or `HazardousEventListItemDto` (wrong
  semantic — not a list row). This repeats the same three-line override pattern a third time
  rather than introducing a shared generic helper — consistent with how `HazardousEventListItemDto`
  already duplicates rather than generalizing; introducing a generic now would be an unrelated
  refactor of already-shipped Phase 4 code.
- Neither use case calls `InitializeWorkflowInstanceUseCase` to backfill the missing row on the
  fly — that would race the other team's Phase M backfill (two independent writers racing to
  create the same entity's first `WorkflowInstance`) and is explicitly out of scope.
- The existing comment in `GetHazardousEventById.ts` ("a null here means either a real
  data-integrity gap or a not-yet-backfilled legacy row — indistinguishable from here") stays
  accurate and is kept, downgraded from a thrown error to a logged signal: both use cases add a
  boolean field to their existing `logger.info` call (e.g. `workflowStatusMissing: true`),
  mirroring `ListHazardousEventsUseCase`'s own `missingWorkflowStatusCount` field — this keeps the
  gap observable in logs without blocking the read.

**Pre-existing spec/test gap found during this design pass, not introduced by it**: `update-hazardous-event/spec.md`
never documented the missing-`WorkflowInstance`-throws-`NotFoundError` behavior as its own
requirement at all, even though `UpdateHazardousEvent.ts` (line ~197) and
`UpdateHazardousEvent.test.ts` ("throws NotFoundError for a missing WorkflowInstance before any
merge/validation work runs") both enforce/assert it today. The spec delta for `update-hazardous-event`
therefore **adds** a new requirement describing the corrected behavior directly, rather than
modifying a requirement that was never written.

### Decision 4 — HE-local presentation helpers, not imports from `app/domains/notices/presentation/`

ADR-009 states every presentation adapter lives inside its own context's `presentation/` folder,
and its own Trade-offs section is explicit that genuinely shared logic must be deliberately placed
in `app/infrastructure/`/`app/shared/`, "rather than naturally falling out of a shared layer
folder" — i.e. reaching into another bounded context's `presentation/` folder directly is exactly
the coupling ADR-009 is designed to prevent. `resolveTenantId`, a `throwHazardousEventLoaderError`
equivalent, and `parsePagination` are therefore HE-local copies
(`app/domains/hazardous-events/presentation/*.server.ts`), textually identical to Notices' own
versions today. This is a small amount of duplication (three tiny, stable functions) in exchange
for not coupling two bounded contexts; promoting them to `app/shared/` is a legitimate future
refactor once a third domain needs the same helpers, but is out of scope here (scope expansion
into already-shipped Notices files is excluded per standing session rules).

### Decision 5 — `withRequestContext`: no route-level call needed (correction to the roadmap's intent text)

Verified directly against `app/middleware/requestContext.server.ts` and `app/root.tsx`:
`withRequestContext` is opened exactly once, at the root `middleware` export, for every request —
Notices' own loaders never call it. The roadmap's intent-text paraphrase ("wrap execution in
`withRequestContext`") describes behavior that already exists at the framework-middleware layer,
not something this intent's route files need to invoke themselves. No action needed beyond
confirming (via the PGlite tests, which already exercise `getRequestContext()`/`withRequestContext`
in the Notices precedent tests this intent's own tests are modeled on) that the context is live by
the time the loader runs.

### Decision 6 — New OpenSpec capability name: `hazardous-event-route-adapter`

`openspec/specs/hazardous-event-list-page` already exists but covers the unrelated legacy
component `app/frontend/events/hazardeventlist.tsx`. This intent's new capability is named
`hazardous-event-route-adapter` (singular "hazardous-event," matching the existing
`get-hazardous-event-by-id`/`update-hazardous-event` naming convention, and mirroring Notices' own
`notices-route-adapter` capability shape) to avoid any collision or confusion with the pre-existing
legacy spec.

### Decision 7a — Design-system component location: CONFIRMED, `app/design-system/components/`

**Corrected scope, 2026-10-23**: this is not an HE-specific or `6a`-specific styling choice. Per
the updated `hazardous-events-refactoring-roadmap.md` Phase 6 intro and
`design-system-unification-roadmap.md`, PrimeReact's open-source edition is unmaintained and
**every** CA-refactored module's presentation layer moves to React Aria going forward — `6a` is
simply the first to reach this. The human's own framing: these components should become "a real,
reusable DELTA design system," built incrementally (component-by-component, only what each intent
needs) but with reuse by later Phase 6 intents and future domains in mind from the start — not
one-off page-local styling thrown away per domain.

That reuse requirement rules out the otherwise-natural `app/domains/hazardous-events/presentation/`
location: ADR-009 is explicit that a context's own `presentation/` folder is for that context's own
adapters, and genuinely shared logic belongs placed deliberately elsewhere, not left to fall out of
one domain's folder. Two existing folders were considered and rejected:

- `app/frontend/components/` and `app/components/` — both pre-existing, both confirmed (by listing)
  to be mixed bags of generic and feature-specific **legacy** components (PrimeReact, plain HTML,
  pre-CA). Dropping new CA React Aria primitives into either would blur the line this whole
  refactor otherwise maintains between new CA code and legacy code awaiting Strangler Fig
  retirement — a new reader couldn't tell which components are the forward path and which are
  legacy-to-be-deleted.
- `app/shared/` — ADR-009 characterizes this folder's existing content (`DomainError`, `ILogger`,
  i18n resolvers) as technical infrastructure, not UI. Forcing UI primitives in here would overload
  an established, narrowly-scoped folder's meaning.

**CONFIRMED by the human**: a new top-level `app/design-system/components/` folder, parallel to
`app/domains/`, `app/infrastructure/`, and `app/shared/` — not nested inside any domain, not mixed
into the legacy component folders. This mirrors ADR-009's own precedent for exactly this situation:
when "Shared Kernel" (business logic genuinely shared across contexts) didn't fit any existing
category, ADR-009 introduced a new named top-level concept (`app/domains/shared/`) rather than
overloading `app/shared/`'s existing technical-infrastructure meaning. A reusable _UI_ layer is the
same shape of problem one level up the stack — new named top-level folder, not a forced fit.

This sets a precedent every future domain's own Phase 6-equivalent work will follow, not just this
intent's own convenience — all file paths in this design and in tasks.md use this location.

### Decision 7 — Presentation components: React Aria, styled to pixel-match the legacy HE UI (NOT Notices/PrimeReact)

**Superseded by explicit human correction, 2026-10-23**: an earlier draft of this design pointed
at Notices' `NoticeListPage`/`NoticeDetailPage` (PrimeReact `DataTable`) as the component-level
reference. That is now explicitly wrong for `6a`'s UI layer and is corrected here. Notices remains
the reference for the _loader/route_ pattern only (Decisions 1, 3, 5, 6) — its PrimeReact-based
component layer is not a precedent for this intent.

**Library: `react-aria-components` (new dependency, first use in this codebase).** React Aria is
the confirmed, required library for `6a` onward, superseding the roadmap's prior "built fresh, not
based on `feature/poc-react-aria-hazardous-event`" framing, which itself is now moot since neither
existing React Aria branch (`feature/poc-react-aria-hazardous-event`, `spike/react-aria-consumption`)
is used as a reference — `6a`'s components are built fresh from React Aria's own library
documentation. `react-aria-components` (Adobe's higher-level, unstyled, composable component
package built on the `@react-aria`/`@react-stately` hooks) is the right package for this job
specifically because it ships with zero visual opinion — every pixel of styling comes from the
classes/CSS this intent writes, which is exactly what pixel-parity with the legacy UI requires. A
lower-level `@react-aria/*` hooks-only approach would mean re-building interaction logic (listbox
navigation, focus management) that `react-aria-components` already provides as composable
primitives (`Table`, `Row`, `Cell`, `Link`, `Button`) — no reason to hand-roll that here.

**Golden rule — pixel/behavior parity with today's actual legacy HE UI, not a redesign and not
Notices' look.** Styling source of truth is the legacy hazardous-event list page itself
(`app/frontend/events/hazardeventlist.tsx`) and its CSS classes, confirmed by reading the file
directly:

- The list renders a plain semantic `<table className="dts-table width-override-data-collection">`
  (not a PrimeReact `DataTable` — the legacy page itself is plain HTML + `dts-*` classes from
  `style-dts.css`, which is actually a closer structural match to React Aria's own unstyled
  `Table`/`Row`/`Cell` primitives than to PrimeReact's component model).
- Row-status indicator: `<span className="dts-status dts-status--{status}">` (lowercased status
  as a CSS modifier class).
- Actions column: `className="dts-table__actions"`; centered header cells use
  `dts-table__cell-centered`.
- Pagination: a dedicated `dts-pagination` block with `mg-button mg-button--small mg-button-ghost`
  buttons (`app/frontend/pagination/view.tsx`) — not a PrimeReact paginator, not a from-scratch
  design.
- Section wrapper: `<section className="dts-page-section">`, heading text in `dts-heading-4`.

**Two layers, matching Decision 7a's split**: the generic, reusable primitives (`Table`, `TableColumn`,
`TableRow`, `TableCell`, a styled `Link`) are built once in `app/design-system/components/`,
wrapping React Aria's own `Table`/`Row`/`Column`/`Cell`/`Link` components with the `dts-*`/`mg-*`
classes baked in as each primitive's default styling — these carry no HE-specific knowledge
(no `HazardousEventListItemDto` import) and are what `6b`/`6c` and future domains reuse.
`HazardousEventListPage`/`HazardousEventDetailPage` (in HE's own `presentation/`, correctly
domain-owned per ADR-009) are thin compositions of those primitives bound to HE's own DTOs — the
HE-specific column choices, link targets, and null-`workflowStatus` treatment described below live
here, not in the shared primitives. The detail page's exact markup is read from the legacy
detail-rendering chain (`app/frontend/form/view_base.tsx` and whatever field-level renderers it
delegates to) as an explicit task step at implementation time (tasks.md) — this design commits to
the _principle_ (plain semantic HTML, legacy `dts-*`/`mg-*` classes, zero PrimeReact, zero new
theme/token system) rather than hand-transcribing the entire generic form-renderer here, since that
renderer is shared across every domain, not HE-specific.

**No Pass 1 token-extraction prerequisite (human-confirmed).** Styling is built incrementally,
component-by-component, directly against the legacy CSS classes above, together with the minimal
`6a`-scoped `@theme` token block Decision 8 (below) introduces for the specific values these
components consume — not against the full, app-wide `DEF-014` Pass-1 token layer. This is a
deliberate, explicit rejection of blocking `6a` on `design-system-unification-roadmap.md`'s Pass 1,
not a silent skip: see proposal.md "Open decisions #2" for the full record of this decision.
(Corrected 2026-10-23: an earlier draft of this paragraph said "zero new theme/token system,"
written before Decision 8 — the `6a`-scoped `@theme` block — was confirmed; Decision 8 is the
later, authoritative one.)

**Navigation affordance**: a React Aria `Link` (not PrimeReact's `Button`+`LangLink` wrapper
Notices uses) in the actions cell routes to `/he-preview/${event.id}`, styled to match the legacy
list's own `DataCollectionActionLinks`/view-icon affordance as closely as this read-only preview's
simpler action set allows (view only — no edit/delete actions, since those are `6c`'s scope).

**Reversed, 2026-10-26: hazard name is now resolved, not left as a raw-id fallback.** The paragraph
below originally scoped `ListHazardousEventsUseCase`/`GetHazardousEventByIdUseCase` to leave
hazard-name resolution out, on the basis that it was a rare edge case. Verification against real
tenant data during review showed this was wrong: `specificHazardLocalName`/`specificHazardNationalName`
are null for every real (legacy-created) record in this tenant, so the "fallback" was in practice
the default for 100% of rows, not a rare case. Root cause: the new `specific_hazard` taxonomy table
(`specificHazardId`'s own FK target, populated for every real record) was never joined by the CA
read path at all — unlike `specificHazardLocalName`/`NationalName`, which are real, populated-when-set
override fields, just empty for this tenant's data.

**Fix, by explicit human decision**: resolve the name via `specificHazardId` → `specific_hazard` →
`text_content.originalText` — not legacy's own `hipHazard`/`hipCluster`/`hipType` chain. Both chains
resolve correctly for this tenant's historical data (verified: 25/25 real rows), but only the
`specific_hazard` chain is the one the CA write path (`HazardousEvent.create()`) actually populates
going forward — `hazardousEventTable.ts`'s own schema comment notes the CA entity never writes
`hip_*`, so a future `6c`-created record would resolve nothing via that chain. New port
`ISpecificHazardTaxonomyRepository` (`findNamesByIds`), implemented by
`DrizzleSpecificHazardTaxonomyRepository`, injected into both use cases as a sibling collaborator
(same pattern as `ListWorkflowInstancesByEntityIdsUseCase` — not a new method on
`IHazardousEventRepository`, to avoid forcing all eight existing fakes of that port to implement an
unrelated display concern).

**Revised priority** (`hazardLabel.ts`): `specificHazardLocalName ?? specificHazardNationalName ??
specificHazardName ?? specificHazardId` — the two user-override fields still rank above the resolved
taxonomy name (an explicit local-language override should win), and the raw-id, visually-distinguished
fallback (`isFallback`) now triggers only when the taxonomy join itself finds no match — not observed
in this tenant's real data, but kept as a genuine defensive path (e.g. a dangling/invalid FK).

**Column choice, reversed a second time, 2026-10-26: legacy's exact 5 columns, not a narrower set.**
The "narrower column set... not a visual regression" framing below was itself overridden by the
human — not signed off as-is. List columns are now exactly legacy's own `hazardeventlist.tsx`
header: `hazardLabel()`'s resolved text (labeled "Hazard type"), the `workflowStatus`-driven
"Record status" column (same `workflowStatusDisplay`-rendered status dot + label the detail page
already uses — reused, not rebuilt), the event's own `id.slice(0, 5)` rendered as a link to its
detail page (labeled "Hazardous event UUID", matching legacy's own `LangLink` truncation/link
treatment exactly), `createdAt` (labeled "Created"), `updatedAt` (labeled "Updated"), plus the
existing Actions column (view icon). **Only `hazardousEventStatus` ("Event status") is dropped
from the list** — `workflowStatus` is kept on both the list (as "Record status") and the detail
page (still `DEF-031`'s own payload). An initial pass at this same fix wrongly dropped
`workflowStatus`/"Record status" from the list too, misreading an ambiguous instruction; corrected
after the human re-checked the code directly and confirmed only `hazardousEventStatus` was ever
meant to go.

**Sort order, reversed, 2026-10-26**: `DrizzleHazardousEventRepository.findAll`'s `orderBy` now
matches legacy's own `hazardevent.ts:244` (`desc(hazardousEventTable.updatedAt)`,
most-recently-updated first) instead of `asc(createdAt)` — a real, confirmed divergence the human
caught via direct comparison, not a data artifact. `asc(id)` stays as the deterministic-pagination
tiebreaker.

**Minimal page-size selector, new scope item, 2026-10-26**: `HazardousEventListPage` now has a
functional `<select>` mirroring legacy's own `pagination/view.tsx` `PAGE_SIZE_OPTIONS`
(`[10, 20, 30, 40, 50]`), not blocked on `6h`'s more general design-system `Select` primitive —
human's explicit decision to build this now, minimally, rather than wait. `6h` may later
generalize/relocate this into the shared design system; this is explicitly a `6a`-scoped minimal
version, not the final reusable primitive. Default `pageSize` is `50`, matching legacy's own
`pagination/api.server.ts` `DEFAULT_PAGE_SIZE` (was `20`, an unconfirmed value this intent had
picked without checking legacy).

**Detail page, also reversed**: the detail page's single "Hazard" line is now preceded by a "Hazard
classification" subsection with `hazardTypeName`/`hazardClusterName` (resolved via the same join,
one hop further up `specific_hazard.hazard_cluster_id` → `hazard_cluster` →
`hazard_cluster.hazard_type_id` → `hazard_type`, each with its own `nameTextContentId`), matching
legacy's own three-level Type/Cluster/Hazard grouping instead of a single flattened line. Every
field label on the detail page is now wrapped `<strong>{label}:</strong>`, matching legacy's own
`view_field.tsx` treatment exactly (was plain text).

**No paginator total count**: per ADR-007, `ListHazardousEventsUseCase` returns a bare array with
no total count — unlike the legacy page's own `Pagination` component, which does show a total
(`pagination.totalItems`, sourced from a dedicated count query the CA use case doesn't have yet).
`HazardousEventListPage` reproduces the legacy `dts-pagination`/`mg-button` visual treatment but
functionally limited to prev/next (disable "next" when the returned page has fewer than `pageSize`
rows), with no "page X of Y" total — a known, named gap, not a silent omission (ADR-007's own
"Pagination metadata is deferred, not silently dropped" consequence already covers this).

**i18n namespace**: HE is the first CA domain to need its own namespace, `hazardous-events.json`
(`locales/en/`, `locales/fr/`) — DEF-015 (client-side-nav resource-bundle gap) does not bite here:
this is a direct-URL SSR entry point (not a client-side nav transition from another namespace) and
both the list and detail route load the same single namespace, exactly matching the condition
DEF-015 names as "confirmed harmless."

### Decision 8 — A minimal, `6a`-scoped Tailwind v4 `@theme` block (CONFIRMED new scope item)

**Confirmed by the human, not a `DEF-014` full-Pass-1 substitute.** Verified directly:
`app/styles/all.css` imports Tailwind completely bare (`@import "tailwindcss";`), zero `@theme`
customization anywhere in the codebase today. Without a shared token layer, every component in
`app/design-system/components/` would hardcode its own color/spacing values locally, and the next
domain to contribute a component to that same folder would inherit the identical unresolved
question — except now with `6a`'s own hardcoded values already sitting there as de facto (but
undocumented, unenforced) precedent. A minimal, scoped `@theme` block means every component `6a`
builds already consumes real shared tokens from day one, giving the next contributor something
concrete (`var(--color-dts-...)`) to extend rather than a blank slate or someone else's inline hex
values to reverse-engineer.

**Scope, deliberately narrow**: only the tokens `6a`'s own components actually consume, extracted
from the exact legacy CSS rules being pixel-matched (`public/assets/css/style-dts.css`, read for
reference only — never edited). Not an app-wide extraction, not a resolution of the two-blues
inconsistency `design-system-unification-roadmap.md` already named (`#004f91` primary vs. `#106cb8`
ghost/link) — `6a`'s own component set is view-only with no primary-action button, so it never
needs the `#004f91` primary-button token at all, and that inconsistency is left for whenever full
Pass 1 (or a future intent that does need a primary button) actually requires resolving it.

Token values extracted (verified directly from `style-dts.css`); table corrected 2026-10-26
(Gate 8 finding) to list only tokens `6a`'s own components actually consume via `var(...)` — the
six known `WorkflowInstance` statuses (`DRAFT`/`SUBMITTED`/`REVISION_REQUESTED`/`APPROVED`/
`REJECTED`/`PUBLISHED`) render via the legacy `dts-status--{key}` CSS classes directly (already
the correct color, unchanged), not via a token; only the new `null` state has no such class to
reuse, hence `--color-dts-status-missing` is the only status token that exists. An earlier draft
declared a full token per legacy status plus `--color-dts-action-hover-bg`, none of which any
component actually referenced — removed rather than left as unused, contradicting this section's
own "deliberately narrow" scope:

| Token                         | Value                        | Source rule                                                                                                                          |
| ----------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `--color-dts-table-border`    | `#f2f2f2`                    | `.dts-table th, .dts-table td` (`border-bottom`)                                                                                     |
| `--color-dts-table-header-bg` | `#f2f2f2`                    | `.dts-table th`                                                                                                                      |
| `--color-dts-action`          | `#106cb8`                    | `.mg-button.mg-button-ghost`                                                                                                         |
| `--color-dts-status-missing`  | _new — no legacy equivalent_ | `DEF-031`'s new `null`-`workflowStatus` state; a muted neutral grey, picked at implementation time, distinct from every status above |
| `--spacing-dts-cell-padding`  | `0.57rem`                    | `.dts-table th, .dts-table td`                                                                                                       |
| `--spacing-dts-row-height`    | `3.86rem`                    | `.dts-table th, .dts-table td`                                                                                                       |
| `--radius-dts-button`         | `0.57rem`                    | `.mg-button`                                                                                                                         |

`--color-dts-status-missing` is the one token with no legacy source — it represents `DEF-031`'s own
new, previously-nonexistent state (a `null` workflow status), so by definition nothing in the
legacy stylesheet already renders it. It still belongs in the shared `@theme` block, not hardcoded
in a component, for the same reuse reasoning as every other token here.

**Alternatives considered**:

- **Plain CSS custom properties outside Tailwind's `@theme` mechanism** (e.g. a hand-written
  `:root { --dts-table-border: #f2f2f2; }` block) — rejected: Tailwind v4's `@theme` block is the
  project's own chosen CSS framework's native token mechanism (already imported, already the
  build's CSS pipeline), and `@theme` tokens are automatically available both as CSS variables
  (`var(--color-dts-action)`) and as generated utility classes — plain custom properties would get
  only the former, for no benefit over using the mechanism Tailwind already provides.
- **A separate new CSS file just for these tokens** (e.g. `app/styles/design-system-theme.css`) —
  considered, rejected for this intent: `app/styles/all.css` is already the single, existing
  entry point that imports Tailwind and every other global stylesheet concern; adding a second
  parallel entry point for one `@theme` block would be a new convention to introduce for marginal
  separation benefit. A dedicated file is a reasonable future refactor once the token set grows
  large enough to warrant its own file — not needed at today's scope of 7 tokens.
- **Full `DEF-014` Pass 1 right now** — rejected by explicit human decision (see proposal.md item
  3); would resolve the two-blues inconsistency and cover every library/domain, but blocks `6a` on
  work with a much larger, cross-cutting scope than this intent needs.

**Where it lives**: `app/styles/all.css`, as a new `@theme { ... }` block placed immediately after
the existing `@import "tailwindcss";` line — the file's own existing entry point for Tailwind
configuration, Tailwind v4's own convention for colocating `@theme` with the import it configures.
Legacy code (`style-dts.css`, the raw hex values in it) is read, never edited, and never references
these new tokens — only `app/design-system/components/` consumes them.

### Decision 9 — Detail page field order/bold pattern, total-count query, numbered pagination, summary line, legend (human decisions, 2026-10-27)

**Detail page, rebuilt to the exact legacy order and bold pattern**, captured directly from the
real legacy page field-by-field (not approximated): ID → Hazard classification (Type/Cluster/
Hazard) → Record status → National specification → Start date/End date (same row) → Description →
Composite event - chains explanation → Magnitude → Spatial footprint → Attachments → Record
originator → Hazardous event Status (capital S, relabeled and repositioned — was "Event status"
right after the classification block) → Data source → Created at → Updated at. Bold (`<strong>`,
matching legacy's `view_field.tsx`) starts at Record status and ends after Data source; ID, the
classification block, and Created at/Updated at stay plain, matching legacy exactly. "Spatial
footprint"/"Attachments" are bold field labels (not `<h3>` section headers as an earlier round had
them) — legacy's own form-definition array (`hazardeventform.tsx`) interleaves `spatialFootprint`/
`attachments` with every other plain field, so `view_field.tsx`'s generic `<strong>{label}:</strong>`
treatment applies to them too.

**`workflowStatus` (DEF-031) has no legacy field at all.** Legacy's own "Record status" is backed
by `approvalStatus`, a field the CA domain doesn't carry — `workflowStatus` is the only status data
this DTO has, so it's shown as "Record status" itself, not as a second, separate row. Flagged here
per the human's own instruction, since this reuses a legacy label for non-identical underlying
data (my own judgment call on the exact resolution, not independently re-confirmed against a real
legacy screenshot the way every other field in this list was).

**Total-count query, new scope item.** `ListHazardousEventsUseCase` now runs a second, cheap
`countAll` query alongside `findAll` (`Promise.all`), returning `{ items, totalCount }` instead of
a bare array. **Not an ADR-007 envelope violation**: ADR-007 prohibits the generic `{success, data}`
wrapper around every response; `totalCount` is real list data the page actually renders (the
summary line, numbered pagination), not a success/error wrapper — human's own explicit framing.
`IHazardousEventRepository` gains `countAll(tenantId, tx?)`, implemented identically to the
existing `countReferencingDisasterEvents` pattern (`count(*)::int`, PGlite/Postgres bigint-string
gotcha noted inline).

**Numbered pagination, summary line, and legend — pulled into `6a` now, not deferred to `6h`.**
Human's explicit decision, since `6a` now owns the total-count query these all depend on. Roadmap
updated separately (not by this change) to narrow `6h` to just the filter-bar inputs.

- Pagination: `HazardousEventListPage`'s own `paginationWindow()` ports legacy's
  `pagination/view.tsx` `getPaginationWindow()` exactly (`delta=2`, condenses with `"..."`,
  current page rendered as a non-link `<span aria-current="true">`) — read directly, not guessed.
- Summary line: `list.showing_of_total` ("Showing {{filtered}} of {{total}} hazardous event(s)"),
  sourced from `hazardeventlist.tsx`'s own `hazardous_events.showing_filtered_of_total` i18n key
  text, not retyped from memory.
- Legend: reuses `workflowStatusDisplay`'s own dot-color mapping (not rebuilt) for legacy's own
  five statuses (Draft/Waiting for validation/Needs revision/Validated/Published) in legacy's own
  `ListLegend.tsx` order — the `null`/"Not yet determined" `DEF-031` state has no legacy entry and
  is deliberately left out of the legend (it still renders per-row, same as before).

### Decision 10 — Detail page: dash-for-empty, capitalized enum label, unified heading treatment, date grid (human decisions, 2026-10-27/28)

Four further fixes, each verified against legacy's live DOM (computed styles, not source
guesswork):

- Every empty string field renders `-` (`orDash()` helper), matching legacy's own empty-value
  display, instead of rendering nothing after the colon.
- `hazardousEventStatus` renders its capitalized i18n label (`detail.hazardous_event_status_values.*`
  — "Forecasted"/"Ongoing"/"Passed"), not the raw lowercase enum string.
- Start date/End date are wrapped in legacy's own `mg-grid mg-grid__col-3` utility class (confirmed
  present in `style-dts.css`, reused rather than recreated) — the real producer of the gap between
  them, not approximable with ad hoc flex/margin spacing.
- **Both in-content headings ("Hazardous events" and "Hazard classification") render as
  `<h5 className="dts-heading-5">`, unified.** Two earlier attempts preceded this: first, matching
  legacy's own literal (bare, unstyled `<h2>`/`<h5>`) markup exactly; then a unified
  `<h3 className="dts-heading-3">` once the human decided legacy's own inconsistency wasn't worth
  replicating. `dts-heading-3` read too large by eye, so the final choice is the smaller
  `dts-heading-5` (confirmed in `style-dts.css`: `font-size: 1rem`/`1.14rem` at ≥1164px,
  `font-weight: 700`, `margin-bottom: 0.86rem`), same unified-styling principle, smaller class.

**Spacing is Tailwind utility classes, not inline `style={{...}}`** (human's explicit instruction —
this project has Tailwind v4 configured, an inline style bypasses it). `mt-[0.86rem]` on the first
heading (the breadcrumb-to-heading gap) and `mb-[0.86rem]` on the ID paragraph and the Hazard
paragraph (the two group-boundary gaps below, see next) all reuse `dts-heading-5`'s own confirmed
`0.86rem` scale rather than inventing a new value — Tailwind's arbitrary-value syntax, a legitimate
utility, not a bypass.

**Three logical groups, new structural decision (no legacy precedent, human's own UX call):**
(1) the page heading + ID, (2) the classification block (heading + Type/Cluster/Hazard), (3)
everything else (Record status through Updated at). The boundary margins above carry this — live
measured: all three inter-group gaps are a uniform ~12px (`0.86rem` at this site's own 14px root
font-size), confirming the Tailwind classes compile and apply correctly, not purged.

## Risks / Trade-offs

- **[Risk] Flipping two already-shipped, already-passing Phase 4/5 tests** (`GetHazardousEventById.test.ts`
  line ~331, `UpdateHazardousEvent.test.ts` line ~891, and any PGlite-level duplicate in
  `tests/integration/domains/hazardous-events/UpdateHazardousEventUseCase.test.ts`) **could mask a
  real regression if done carelessly.** → Mitigation: tasks.md requires updating these specific
  assertions as a named, reviewed step (not a side effect of a broader refactor), and the
  TDD-red step for `DEF-031` is written against the _new_ expected behavior before the use-case
  change lands, so the test suite only ever asserts one behavior at a time.
- **[Risk] Permission check implemented inconsistently or omitted by accident**, since it's an
  addition on top of the Notices precedent rather than something copied wholesale from it — easy
  to forget if an implementer leans too hard on "just follow Notices." → Mitigation: Decision 2 is
  confirmed (Option B, `ViewData`), spec'd as its own requirement with explicit scenarios
  ("Each loader requires the ViewData permission..." in the `hazardous-event-route-adapter` spec),
  and tasks.md Section 6 has a named, independently-verifiable task and test for it — not left
  implicit in the loader's general structure.
- **[Risk] First-ever use of React Aria in this codebase, with a hard pixel/behavior-parity bar
  against legacy CSS it wasn't designed to reproduce.** Unlike PrimeReact (used by Notices, ships
  its own theme), `react-aria-components` provides zero default styling — every `dts-*`/`mg-*`
  visual detail (hover/focus states, spacing, the exact status-dot rendering) must be hand-built
  and verified, not inherited from a library default. → Mitigation: Gate 9 (visual/UX parity
  review) is mandatory in tasks.md and explicitly compares the rendered React Aria page against
  the actual legacy `hazardous-event` list/detail pages (screenshot or DOM/class diff), not against
  Notices or any abstract design system; any divergence is a finding to fix before archiving, not
  a deferred item.
- **[Confirmed, accepted] `Table`'s WAI-ARIA grid pattern changes keyboard navigation vs. the
  legacy plain `<table>`.** Verified by a scripted Tab/ArrowRight trace against the real rendered
  page (not assumed): `role="grid"` (not `"table"`), and Tab reaches a whole row (roving
  tabindex), not an individual link — `ArrowRight` then moves cell-by-cell. Fully keyboard-operable,
  just not the legacy table's per-element Tab-stop model; not overridable without abandoning
  `react-aria-components`' `Table`, so accepted alongside that library choice. Pinned by `Table.tsx`'s
  own comment and both a unit test and an E2E test.
- **[Confirmed, fixed, design-system-wide implication] `TableCell`'s `focusMode="child"` traps
  keyboard focus if applied to more than one interactive cell per row.** Discovered 2026-10-26
  adding the list page's second interactive column (the UUID link): a scripted ArrowRight trace
  showed that once real DOM focus lands on a non-terminal cell's child, `ArrowRight` never moves
  focus to a later cell — the Actions column became keyboard-unreachable. Root cause: React Aria's
  own cell-navigation handling tracks which *cell* is active; moving DOM focus straight to a child
  (`focusMode="child"`) desyncs that from the grid's own navigation state for any cell after it.
  **Fixed** by making `focusMode="child"` opt-in via a new `TableCell` prop (`focusChild`, default
  off) — only `HazardousEventListPage`'s own terminal Actions cell sets it now; the UUID cell
  relies on the grid's own default (cell itself gets focus; `Enter` drills into the child link),
  verified fixed by the same trace script. **For future `TableCell` callers**: never set
  `focusChild` on any but a row's last interactive cell.
- **[Risk] Malformed (non-UUID) `id` param on the detail route.** `IHazardousEventRepository.findById`
  is a Drizzle-backed lookup against a `uuid` column — a non-UUID string input raises a raw
  Postgres `22P02` (invalid input syntax for type uuid) error, which is **not** a `DomainError` and
  would propagate as an unhandled 500, not a clean 404. This is existing behavior in the use case
  (not introduced here) but the route-level test suite covers it explicitly as its own scenario
  (expect a 500, not silently assume 404) rather than leaving it untested — confirm against actual
  `DrizzleHazardousEventRepository.server.ts` behavior at test-writing time rather than assuming.
- **Concurrent-callers rule does not apply to this intent's own new code**: the route loaders
  introduce no new shared mutable state (no cache, counter, or in-memory store) — they are stateless
  per-request reads. `list-hazardous-events`/`get-hazardous-event-by-id`'s own existing specs
  already carry their "concurrent callers resolve independently" requirements from Phase 4/5; this
  intent does not need a new one.
- **[Resolved, local data only] `dts_development`'s own seeded `workflow_instance` rows were
  under-seeded, not a Phase M backfill defect.** Every non-`DRAFT` row (20 of 25) had
  `submitted_at`/`submitted_by_user_id` null, violating `WorkflowInstance.create()`'s own
  `REQUIRED_SET` invariant and triggering `findByEntityIds`/`findByEntity`'s graceful-skip for
  (almost) every real record, not a rare case. Confirmed not a Phase M defect by reading the
  legacy `hazardous_event` table itself: it has the same columns null, so there is no
  "copy from legacy" shortcut — the local seed script itself never populated them. Corrected via a
  one-off, documented local `UPDATE` (not a migration), scoped to `dts_development` only: for
  each non-`DRAFT` row, `submitted_by_user_id`/`submitted_at` set to `created_at` and
  `test.admin@india.gov.in`'s own id; `APPROVED` additionally sets `approved_*` at `updated_at`;
  `PUBLISHED` additionally sets `validated_*`/`approved_*` staged evenly between `created_at` and
  `updated_at`, `published_*` at `updated_at` — i.e. exactly `REQUIRED_SET`'s own per-status table
  (`WorkflowInstance.ts`), nothing left null that a real status requires set. **For Phase M's own
  developer**: this is the expected shape a real backfill must also produce — every non-`DRAFT`
  row needs its status's own `REQUIRED_SET` pairs populated, not just the `status` column itself;
  validate the real backfill script against `WorkflowInstance.create()`'s own invariant (it will
  throw `ValidationError` on construction if a pair is missing), not just against the `status`
  column being present.

## Migration Plan

No DB migration. Deploy is a pure code change: new route files + two modified use cases. Rollback
is a plain revert (no data written or shaped differently by this change; `WorkflowInstance` rows
are read, never written, by the modified code paths).
