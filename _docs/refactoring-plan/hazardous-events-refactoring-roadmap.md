# Hazardous Events Refactoring Roadmap — Clean Architecture Migration (Pass 2)

## Purpose

This is the second domain migration after the Notices pilot proved the Clean Architecture +
DDD + NestJS Strangler Fig pattern end-to-end. Unlike Notices — a synthetic, zero-data domain —
Hazardous Events (HE) has live production data, live end users, and real behavioral quirks that
must be preserved exactly through the migration. The DB schema is also being deliberately
redesigned for resilience (event-relationship graph integrity, and reconsidering the
table-per-type `eventTable`/`hazardousEventTable`/`disasterEventTable` inheritance shape) — that
redesign is planned separately against an ER diagram not yet available, and folds into this
roadmap's schema phase once it lands.

**Pass 2 update (2026-08-21):** the target ER diagram has been reviewed (source: `draw.io`,
"Hazardous Event ER Diagram — Manage actual hazardous event not forecasted"). Phase 2 (schema)
is now detailed below. Phase 0 (behavior audit) remains fully detailed and ER-diagram-independent
(unchanged from Pass 1). Phases 3–7 (domain layer, presentation) stay stubbed pending Phase 0's
completion and a couple of remaining implementation-level decisions noted inline.

Shared Clean-Architecture infrastructure from the Notices pilot — NestJS application-context
bootstrap, `DomainError` hierarchy, `ILogger` + `AsyncLocalStorage` request context, the i18n
locale resolver — is already merged to `dev` (`app/infrastructure/`, `app/shared/`) and reusable
as-is. HE work starts directly at the domain layer; no foundational infra work is needed.

**One structural decision from the ER review changes the module map:** the diagram's validation
workflow (`workflow_instance`/`workflow_history`/`workflow_notification`) is explicitly
polymorphic — keyed by `entity_id` + `entity_type` (`'HE'`/`'DE'`/`'DR'`) — and confirmed to be
built generically now, not HE-scoped. That makes it its own bounded context, not a sub-concern of
Hazardous Events. It's scaffolded as a sibling domain module: `app/domains/validation-workflow/`,
alongside `app/domains/hazardous-events/`. HE's domain module depends on it through a port, the
same way any two bounded contexts talk to each other in this architecture — it does not own it.

---

## Reading this document

| Symbol | Meaning |
|--------|---------|
| 🔷 **OpenSpec Intent** | Invoke `/opsx:propose "<text>"` to generate spec artifacts; implement via `/opsx:apply` |
| ⬜ **Non-OpenSpec task** | Mechanical / unambiguous; create files, write tests, or run commands directly |
| 🏁 **Phase gate** | Explicit "done" criteria before the next phase begins |
| 🧱 **Stubbed** | Not yet detailed — waiting on Phase 0's findings and/or remaining open decisions |

Each OpenSpec Intent lives on its own branch and its own PR to `dev`, kept small enough for one
person to review — this is an explicit requirement for this migration, not a preference.
Branch naming: `feature/ca-he-<intent-slug>`. Non-OpenSpec tasks for a given phase are grouped
into a single branch per phase (this document's own branch, `feature/ca-hazardous-events-scaffold`,
is the first example).

---

## Two invariants governing every phase

### 1. Characterization-first

Before any schema change lands, HE's current behavior — including its quirks — must be pinned by
tests. This is the parity contract for "no end-user-visible behavior change." Known quirks to
preserve exactly (confirmed via the Herbrand model refresh and code reading; the Phase 0 audit
below will complete this list):

- Cycle detection on parent-linking is an app-layer recursive query capped at depth 10 — not an
  exhaustive graph traversal, and not a database-level guarantee.
- Delete's dependent-check is enforced two different ways for what the Herbrand model calls "the
  same kind of rule": disaster events that link to this hazardous event are pre-checked
  explicitly with a clear error; other hazardous events that list this one as their parent are
  only caught reactively via a foreign-key violation (`23503`) on the relationship table. Do not
  silently reconcile this during the refactor — decide explicitly, per item, whether to preserve
  or fix, the same way the cost-rollup change treated its own found bugs.
- The temporal-order check on parent-linking only fires when **both** events have a start date
  set — an undated event never blocks the link.
- HIP hierarchy consistency (hazard/cluster/type) is validated by a helper
  (`getRequiredAndSetToNullHipFields`) shared with disaster-record's own compose policy. Where
  this logic lives after the refactor (duplicated into the HE domain layer vs. kept as a shared
  legacy helper both domains call) is an open decision — Phase 0 output, not assumed here.
- `validation_workflow.ts` currently appears hardcoded to `hazardousEventTable` only, with no
  disaster-event equivalent found — Phase 0 should still catalogue its exact current behavior for
  the characterization tests, but this no longer decides architecture: the target design (ER
  diagram) is a shared, polymorphic workflow system regardless of what today's code does — see
  `app/domains/validation-workflow/` below.

### 2. Expand-only until cutover

The new implementation is exposed only via a new authenticated route reachable by direct URL
(no nav link) until sign-off — but CSV import/export and the existing `/api+/hazardous-event+/`
routes migrate onto the new implementation **in step with** that route, not deferred to final
cutover. That means old presentation code and the new implementation may both be writing the
same tables during the transition, and external CSV/API consumers will be touching the new
implementation before the UI fully cuts over.

Consequence: every schema change before sign-off must be additive/backward-compatible. Drops and
renames land only after the old implementation is retired. DELTA already has this pattern in its
own history — the disaster-event assessment normalization did "migrate to new tables" as one
commit series and "drop the old column" as a separate, later one. Follow that shape; don't invent
a new one.

---

## Non-goals

- No end-user-visible change to Hazardous Event behavior as a result of this refactor, until the
  deliberate, signed-off cutover replaces the old implementation.
- Unifying HE's new causality table with `eventCausalityTable` (used for Disaster-Event-side
  linking) — **decided: not in scope.** The ER diagram's new causality table (cause/effect pair
  with an explanation field) replaces `eventRelationshipTable` for HE's own causal chain only.
  `eventCausalityTable` for DE↔DE and DE↔HE linking is untouched by this refactor.
- Hazard-type-specific fields and hazard-type version management — explicitly deferred roughly
  3–4 months pending further business sessions. Not part of this roadmap at all; do not design
  toward it.
- Productionizing `feature/poc-react-aria-hazardous-event` — decided: the new presentation layer
  is built fresh. That branch is reference material only, not a base to build on.
- Re-modeling the Herbrand business-process decisions themselves — already refreshed and verified
  against current `dev` (see `processes/hazardous-events/` and the `disaster-events` additions
  committed 2026-08-21); this roadmap implements against that model, it doesn't revisit it.

---

## Phase 0 — Current-Behavior Audit + Characterization Tests

The first real work item. Fully unblocked. Structured as six sub-tracks — five are read-only
investigation over disjoint files, one synthesizes their findings and depends on the other five.
All are **non-OpenSpec**: investigation and test-writing against existing, unchanged behavior, not
a new capability proposal.

**Decided (2026-08-21): solo execution, single branch.** Phase 0 is the quality gate the entire
refactor leans on — getting current behavior wrong here propagates into every later phase. Rather
than parallelizing 0a–0f across people (technically possible — they touch disjoint files), all six
are done by one person (you) for tighter validation, on a single branch
(`feature/ca-he-behavior-audit`), with **one commit per completed track** rather than one PR per
track. Parallelizing across the team starts at Phase 2 execution onward, once this foundation is
solid. The "Branch:" line under each sub-track below is retained as the reviewable unit within
that one branch — treat each track's commit with the same care as if it were its own PR.

**Gate this phase feeds:** Phase 2 *execution* (writing the actual schema/migrations) does not
start until every sub-track's characterization tests are green on `dev` (Invariant 1). Phase 2
*planning* (this document) doesn't wait on it, and hasn't.

### 0a — Core CRUD

**Commit scope (on `feature/ca-he-behavior-audit`):** core CRUD
**Files:** `hazardous_event_create_update.ts`, `hazardous_event_get.ts`, `hazardous_event_delete.ts`
**Scope:** catalogue compose (create/update) and delete behavior — field validation, the two
dependent-guard styles on delete (explicit pre-check vs. reactive FK-violation catch), tenant
scoping. Write PGlite characterization tests pinning each path, including both delete-guard styles
as distinct, separately-asserted scenarios (Invariant 1 says don't silently reconcile them).

### 0b — Causal chain

**Commit scope:** causal chain
**Files:** `cycles.ts`, `temporal.ts`, the parent-link path in `hazardous_event_create_update.ts`
**Scope:** catalogue `checkForCycle`'s exact depth-10-cap behavior, the temporal-order check's
both-dates-required condition, and tenant-isolation on linking. Write PGlite characterization
tests for: a cycle at exactly the cap boundary, one link with only one date set (must not block),
cross-tenant link attempt.

### 0c — Approval / validation workflow

**Commit scope:** approval/validation workflow
**Files:** `hazardous_event_approval.ts`, `validation_workflow.ts`
**Scope:** catalogue every status transition and who can trigger it. Resolve the "is this
HE-only, with no DE/DR equivalent" question definitively (architecturally moot per the confirmed
target design, but Phase 0 still needs the exact current behavior for the parity tests). Write
PGlite characterization tests for each transition.

### 0d — Attachments, HIP picker, spatial/division data

**Commit scope:** attachments/HIP/spatial
**Files:** `attachments.ts`, `hip_hazard_picker.ts`, `hazardousEventDivisionRepository.ts`,
`hazardousEventGeomTable` read/write paths
**Scope:** catalogue today's single-snapshot geom/division behavior precisely enough to answer
open decision #8 later (how it maps onto the new time-series `hazardous_event_spatial_observation`
model). Write PGlite characterization tests for attachment CRUD, HIP picker filtering, and
division/geom read/write.

### 0e — Presentation + CSV/API

**Commit scope:** presentation/CSV/API
**Files:** `hazardeventform.tsx`, `hazardeventlist.tsx`, the four API routes
(`add.ts`/`update.ts`/`upsert.ts`/`_index.tsx` under `api+/hazardous-event+/`), CSV import/export
wiring
**Scope:** catalogue the full request lifecycle for each route. Write Playwright E2E
characterization tests (per the P1-8 lesson from the Notices roadmap — request-lifecycle behavior
is only reliably verified end-to-end): compose, delete (both guard styles), link-parent
(cycle/temporal/tenant), approval transitions, CSV import/export round-trip, each existing API
route.

### 0f — Cross-boundary with Disaster Events

**Commit scope:** cross-boundary with Disaster Events
**Files:** `hazardousEventRepository.ts` (incl. `getLinkableOptionsData` and
`getDivisionNamesByHazardousEventIds`), the exact read path Disaster-Event's delete-dependent-check
uses (`disaster.event.linked.to.hazardous.event`), the `eventRelationshipTable` /
`eventCausalityTable` boundary
**Scope:** this is the track that most directly protects Disaster Events from breaking during the
HE refactor — catalogue every place DE-side code reads from HE's tables so Phase 2/5 know exactly
what must keep serving correct data through the transition. Write PGlite characterization tests
asserting DE's delete-check and linking picker still see correct data.

### 0g — Synthesis (depends on 0a–0f)

**Commit scope:** synthesis / audit note
**Scope:** produce the audit note — confirm or correct every quirk listed under Invariant 1,
resolve the `validation_workflow.ts` HE-only question with a definitive answer, and flag anything
0a–0f found that isn't already captured in this roadmap's open decisions list.

**Test tier (all sub-tracks):** PGlite integration for model/repository-level behavior; Playwright
E2E for anything request-lifecycle-shaped (0e is E2E-heavy, 0a–0d and 0f are primarily PGlite).

**Phase 0 sub-dependency graph:**

```
0a (core CRUD)         ─┐
0b (causal chain)       │
0c (workflow)           ├──► 0g (synthesis) ──► Phase 2 execution can begin
0d (attachments/spatial)│
0e (presentation/API)   │
0f (cross-boundary)    ─┘
```

0a–0f are file-disjoint and technically parallelizable, but done solo and sequentially by design
(see the decision above) — each still lands as its own commit on `feature/ca-he-behavior-audit`,
in whatever order makes sense as you work through them.

---

## Phase 1 — CA Directory Scaffolding ✅ (this branch)

**Branch:** `feature/ca-hazardous-events-scaffold` (this branch)

```
app/domains/hazardous-events/
  domain/
  application/
    use-cases/
    ports/
    dto/
  infrastructure/
  presentation/

app/domains/validation-workflow/
  domain/
  application/
    use-cases/
    ports/
    dto/
  infrastructure/
  presentation/
```

Both created with `.gitkeep` files — two sibling domain modules, not one nested inside the other
(see the Pass 2 note above on why validation workflow is its own bounded context). No NestJS
install needed — `@nestjs/core`, `reflect-metadata`, and the shared `CoreModule.server.ts` /
`DomainError` / `ILogger` / i18n-resolver infrastructure are already merged to `dev` from the
Notices pilot and reusable as-is.

Independent of Phase 0 — can proceed in parallel.

---

## Phase 2 — Schema ✅ (target model reviewed 2026-08-21, ⬜/🔷 breakdown still to come in Pass 3)

**Branch:** `feature/ca-he-schema` (or split further once Pass 3 breaks this into per-table
intents — likely, given the size below)

Source: `draw.io` ER diagram, "Hazardous Event ER Diagram (Manage actual hazardous event not
forecasted)". Two sections of that diagram — "Monitoring and measurement" and "Forecast,
monitoring and warning" — are explicitly marked not-yet-modeled by its author and are out of
scope here; the spatial-observation redesign below (Section D) looks like it's laying the
groundwork for them, without committing to them.

**A. HIP hierarchy, restructured and versioned** — `specific_hazard → hazard_cluster →
hazard_type → hips_version` (new). `hazardous_event` now needs only `specific_hazard_id`;
cluster/type are derived through the chain instead of three independent FK columns
(`hipHazardId`/`hipClusterId`/`hipTypeId`) like today. **Likely consequence, to confirm during
Phase 3 domain-entity design:** today's app-layer "HIP hierarchy consistency" precondition may
become structurally impossible to violate (nothing independently settable to go inconsistent) —
if so, that's a precondition that disappears rather than one that needs porting; verify against
Phase 0's characterization tests before assuming.

**B. Source catalog** — new `source_catalog` (tenant-scoped) replaces today's free-text
`data_source` column with a proper reference table.

**C. Hazard drivers** — new `hazard_driver` (tenant-scoped) and a join table linking it to
`hazardous_event`. No equivalent exists in today's schema; this is new business capability, not
a restructuring of something existing.

**D. Causality** — a new cause/effect table (with an explanation field) replaces
`eventRelationshipTable` for HE's own causal chain. **Decided:** does not absorb
`eventCausalityTable` (DE-side linking) — that mechanism is untouched. The diagram doesn't show a
DB-level cycle-prevention constraint (unlike `eventCausalityTable`'s CHECK constraints) — confirm
during Phase 3 whether cycle detection stays app-layer (matching today's depth-10-capped
behavior, per the characterization tests) or gets a DB-level guarantee added.

**E. Spatial data, restructured to time-series** — today, `hazardousEventGeomTable` and
`hazardousEventDivisionTable` attach directly to the event (one snapshot). The new model inserts
a `hazardous_event_spatial_observation` entity in between, each with its own `observation_time`,
divisions, and geometry — meaning one event can carry multiple dated observations. This is a real
capability upgrade; confirm during Phase 3 how CSV import/export and the existing API (which
today assume a single geom/division set) map onto "the current/latest observation" vs. requiring
API consumers to specify one.

**F. Attachments** — new dedicated `hazardous_event_attachment` table (id, hazardous_event_id,
title, file_key, file_name, file_type, file_size, timestamps), replacing today's `jsonb` column —
matches Disaster Event's newer attachment-table pattern.

**G. Validation workflow — shared, not HE-owned** — `workflow_instance` (entity_id + entity_type
`'HE'|'DE'|'DR'`, status `DRAFT|SUBMITTED|REVISION_REQUESTED|APPROVED|REJECTED|PUBLISHED`),
`workflow_history`, `workflow_notification`. Lives in `app/domains/validation-workflow/`, not
under Hazardous Events (see Pass 2 note above). Built generically now per your decision, even
though only HE consumes it initially.

**H. Hazard-type field definitions (two subsystems)** — a global one
(`hazard_type_field_definition`, keyed by `hazard_type`) and a tenant-custom one
(`hazard_type_custom_field_definition`, same shape + `country_accounts_id`), both feeding
`hazardous_event_field_value`. Keyed by `hazard_type`, not `specific_hazard` — confirmed settled
despite the diagram's own note flagging a HIPs-2025-document tension; do not re-open in Phase 3.
This is the hazard-type-specific-fields capability originally flagged as 3–4 months out — it's
being brought forward because it's already in the target schema, not because the deferred
business-session work is being skipped.

**Naming cleanup — done (2026-08-21):** the four inconsistencies flagged in the initial review
were fixed at the source. Confirmed in the updated `.drawio`: `hazardous_event_causality` /
`causality_explanation` (was `casuality`), `hazardous_event_hazard_driver` (was
`hazard_event_hazard_driver`), the driver join table's `hazard_driver_id` FK (was `hazard_driver`),
and `country_accounts_id` consistent everywhere including `division` (was `country_account_id`).

**Invariant reminder:** every change here must be additive/backward-compatible until sign-off
(Invariant 2) — old and new HE, plus migrated CSV/API, write the same tables during the
transition.

---

## Phase 3 — Domain Entity + Ports 🧱 (stubbed — depends on Phase 0 + Phase 2)

Includes the `validation-workflow` domain module's own entity/ports (built generically, ahead of
DE/DR needing it), and HE's domain entity consuming it through a port — HE does not implement
workflow logic itself.

## Phase 4 — Use Cases 🧱 (stubbed — depends on Phase 3)

## Phase 5 — Repository + Module Wiring 🧱 (stubbed — depends on Phase 2 + Phase 4)

## Phase 6 — Presentation: New Hidden Route + CSV/API 🧱 (stubbed — depends on Phase 5)

Built fresh, not based on `feature/poc-react-aria-hazardous-event` (decided). Covers: the new
authenticated, direct-URL-only route; CSV import/export migrating onto the new implementation in
step with the route (per Invariant 2); the existing `/api+/hazardous-event+/` REST routes
migrating in step as well, versus a new `/api/v2/hazardous-events` surface matching the Notices
5c pattern — open decision #4 below, to be settled in Pass 3.

## Phase 7 — Sign-off, Cutover, and Cleanup 🧱 (stubbed — depends on Phase 6)

Sign-off gate → old implementation retired → dead code removed without impacting any other live
feature (per the project's file-deletion caution) → drop/rename schema changes that were deferred
under the expand-only invariant now land.

---

## Dependency graph (phase-level)

```
Phase 0 (behavior audit + characterization tests) ─────┐
Phase 1 (CA scaffold: hazardous-events                  │
         + validation-workflow modules, this branch) ───┼──► Phase 2 (schema — reviewed ✅)
                                                          │        │
                                                          │        ▼
                                                          └──► Phase 3 (domain entities + ports,
                                                                   both modules)
                                                                   │
                                                                   ▼
                                                              Phase 4 (use cases, both modules)
                                                                   │
                                                                   ▼
                                                              Phase 5 (repository + module wiring)
                                                                   │
                                                                   ▼
                                                     Phase 6 (presentation: route + CSV/API)
                                                                   │
                                                                   ▼
                                                      Phase 7 (sign-off, cutover, cleanup)
```

Phase 0 and Phase 1 can run fully in parallel — two different people could start today. Phase 2 is
no longer blocked (ER diagram reviewed 2026-08-21). Phase 3 onward still needs Phase 0's
characterization tests to land first, plus the still-open decisions listed above. Pass 3 of this
document will replace each 🧱 stub with a Notices-style intent breakdown (branch, `/opsx:propose`
text, files touched, test tier) once Phase 0 completes and the remaining open decisions are
settled — note `validation-workflow` and `hazardous-events` are two separate intent tracks from
Phase 3 onward, not one.

---

## Open decisions carried forward

**Resolved (2026-08-21, ER diagram review):**

1. ~~`eventRelationshipTable` → `eventCausalityTable` unification~~ — **decided: not in scope.**
   HE's new causality table replaces `eventRelationshipTable` only.
2. ~~Is `validation_workflow.ts` genuinely HE-only?~~ — **superseded.** Regardless of what
   today's code does, the target design is a shared, polymorphic workflow system
   (`app/domains/validation-workflow/`), built generically now per your decision — not owned by
   HE's domain module.
3. ~~Hazard-type vs. specific-hazard field-definition level~~ — **decided: hazard_type, settled,
   not to be re-opened.**
4. ~~Naming inconsistencies (casuality/hazard_event_hazard_driver/country_account_id/hazard_driver
   FK)~~ — **fixed at the source**, confirmed in the updated `.drawio`.

**Still open:**

5. New `/api/v2/hazardous-events` REST surface (Notices 5c pattern) vs. migrating the existing
   `/api+/hazardous-event+/` routes in place — relevant now that CSV/API migrate in step with the
   new implementation (Invariant 2), not deferred to cutover. Decide once Phase 5/6 are detailed.
6. Where shared HIP-hierarchy validation logic lives post-refactor (duplicated into HE's domain
   layer vs. a shared helper both HE and disaster-record call) — Phase 0 output; may be partly
   resolved by Phase 2's finding that the new schema might not need this check at all (see
   Phase 2, Section A).
7. Whether HE's new causality table gets a DB-level cycle-prevention constraint or keeps today's
   app-layer depth-10-capped check — Phase 3, informed by Phase 0's characterization tests.
8. How CSV import/export and the existing API — which assume one geom/division set per event —
   map onto the new time-series `hazardous_event_spatial_observation` model (current/latest
   observation, or must callers specify one) — Phase 2/6.

---

## Architectural decisions informing this plan

Reused from the Notices pilot, not re-decided:

| ADR | Decision most relevant here |
|-----|------------------------------|
| ADR-001 (multilingual strategy) | JSONB i18n fields; locale resolution chain for the new API surface |
| ADR-002 (timezone handling) | All new timestamp columns declared `{ withTimezone: true }` inline |
| ADR-003 (error handling architecture) | `DomainError` hierarchy; `ErrorResponse` envelope; per-domain `ErrorBoundary` |
| ADR-004 (logging and traceability) | `ILogger` port; `AsyncLocalStorage` request context; `traceId` in every log line |
