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
is now detailed below. **Phase 0 (behavior audit) is now complete** (2026-08-31) — see below.
Phases 3–7 (domain layer, presentation) stay stubbed pending Pass 3's own intent breakdown; every
decision carried forward from Phase 0 is resolved (2026-09-01) and folded inline below and into
the Phase 3/4/6 stubs.

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

| Symbol                   | Meaning                                                                                 |
| ------------------------ | --------------------------------------------------------------------------------------- |
| 🔷 **OpenSpec Intent**   | Invoke `/opsx:propose "<text>"` to generate spec artifacts; implement via `/opsx:apply` |
| ⬜ **Non-OpenSpec task** | Mechanical / unambiguous; create files, write tests, or run commands directly           |
| 🏁 **Phase gate**        | Explicit "done" criteria before the next phase begins                                   |
| 🧱 **Stubbed**           | Not yet detailed — waiting on Phase 0's findings and/or remaining open decisions        |

Each OpenSpec Intent lives on its own branch and its own PR to `dev`, kept small enough for one
person to review — this is an explicit requirement for this migration, not a preference.
Branch naming: `feature/ca-he-<intent-slug>`. Non-OpenSpec tasks for a given phase are grouped
into a single branch per phase (this document's own branch, `feature/ca-hazardous-events-scaffold`,
is the first example).

---

## Two invariants governing every phase

### 1. Characterization-first

Before any schema change lands, HE's current behavior — including its quirks — must be pinned by
tests. This is the parity contract for "no end-user-visible behavior change." **Phase 0 is now
complete** (`hazardous-events-phase0-audit-findings.md`); the list below is the confirmed,
corrected version of what this section originally described from the Herbrand model refresh and
code reading alone — differences from the original are called out explicitly, not silently fixed:

- **Cycle detection on parent-linking is an app-layer recursive query capped at depth 10 — not an
  exhaustive graph traversal, and not a database-level guarantee.** Confirmed, and stronger than
  originally stated: 0b built a 20-node causal chain and closed a cycle across its full length —
  **the update succeeds and the cycle is persisted**, not merely "an untested edge case." Directly
  informs open decision #7 below.
- **Delete's dependent-check is enforced three different ways, not two.** (a) Disaster events
  linked via `disasterEventTable.hazardousEventId` are pre-checked explicitly with a clear error —
  works correctly. (b) Other hazardous events listing this one as `parent` were intended to be
  caught reactively via a foreign-key violation (`23503`) on the relationship table, but 0a found
  the catch itself is dead code (`error?.code` is checked, but Drizzle nests the real code under
  `error.cause.code`) — in practice this path is **unchecked**, a raw uncaught error propagates
  instead of the intended message. (c) Disaster events linked via `event_causality` (the newer
  "linked triggering/triggered hazardous events" mechanism) are **never checked at all** — deleting
  a hazardous event referenced only this way succeeds silently and cascade-deletes the links with
  no warning (0a finding #8, reconfirmed from the DE-read side in 0f). Do not silently reconcile
  these during the refactor — decide explicitly, per item, whether to preserve or fix; note that
  (b) has no working intended behavior to "preserve" today, only a broken attempt at one.
- **The temporal-order check on parent-linking only fires when both events have a start date
  set** — an undated event never blocks the link. Confirmed exactly. One added nuance: dates at
  mixed granularity (e.g. a month-only date) normalize optimistically to the 1st of the period —
  worth naming if this rule's precision gets revisited.
- **HIP hierarchy consistency (hazard/cluster/type) is validated by a helper
  (`getRequiredAndSetToNullHipFields`) — corrected: this is not actually shared with
  disaster-record.** The original assumption was wrong; confirmed via callers that HE's helper is
  HE-only, and disaster-record has its own separate, internally-duplicated-twice implementation
  (see open decision #6's resolution below). HE's own helper is permissive on a fully-empty
  hierarchy in isolation (currently masked only by a DB-level `NOT NULL` constraint, not by the
  helper's own logic), and it **mutates its input object in place** as a side effect of computing
  its return value — moot going forward since the new schema eliminates the need for it in HE.
- **`validation_workflow.ts`'s HE-only question — resolved definitively, not just architecturally
  moot.** See the dedicated call-out immediately below.

**`validation_workflow.ts` is not HE-only in the live system, and hasn't been for a while.** The
dead file (`processValidationAssignmentWorkflow`, part of the orphaned, unreachable
`app/backend.server/models/event/` split — confirmed via import-resolution trace, 0a) genuinely
was hardcoded to `hazardousEventTable`. But its live replacement,
`handleApprovalWorkflowService` (`approvalWorkflowService.ts`), is **already generic and already
shared** — its own type is `EntityType = "hazardous_event" | "disaster_event" |
"disaster_records"`, and real call sites confirm it: `disaster-event+/edit.$id.tsx` and
`disaster-record+/edit.$id.tsx` already call it today, not just HE's edit routes. The same holds
for the second live path (0c found three parallel mechanisms exist today, not one — see the
findings doc) — `disaster-event+/$id.tsx` and `disaster-record+/$id.tsx` both call
`processApprovalStatusActionService`, the structural twin of what HE's own detail page calls. So
`app/domains/validation-workflow/` isn't introducing sharing where none existed — it's formalizing
sharing that already exists today, just spread across two independently-duplicated generic
services instead of one unified module.

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

## Phase 0 — Current-Behavior Audit + Characterization Tests ✅ (complete 2026-08-31)

**Complete.** All seven sub-tracks (0a–0g) landed on `feature/ca-he-behavior-audit`, now merged
into this branch (`feature/ca-hazardous-events-scaffold`). Full findings, confirmed bugs, quirks,
and open-decision inputs live in the companion doc:
`hazardous-events-phase0-audit-findings.md` — this section is kept as the historical scope
record, with a **Found:** line added under each sub-track below pulling forward only what changes
Phase 2 onward's plan. 74 characterization tests across 7 files, all green.

Structured as seven sub-tracks — six were read-only investigation over disjoint files, one (0g)
synthesized their findings and depended on the other six. All were **non-OpenSpec**: investigation
and test-writing against existing, unchanged behavior, not a new capability proposal.

**Decided (2026-08-21): solo execution, single branch.** Phase 0 is the quality gate the entire
refactor leans on — getting current behavior wrong here propagates into every later phase. Rather
than parallelizing 0a–0f across people (technically possible — they touch disjoint files), all six
were done by one person for tighter validation, on a single branch
(`feature/ca-he-behavior-audit`), with **one commit per completed track** rather than one PR per
track — each track's commit was reviewed with the same care as if it were its own PR. That branch
is now merged into this one. Parallelizing across the team starts at Phase 2 execution onward, now
that this foundation is solid.

**Gate this phase fed:** Phase 2 _execution_ (writing the actual schema/migrations) does not start
until every sub-track's characterization tests are green on `dev` (Invariant 1) — satisfied: 74
tests, all green, `tsc --noEmit` clean on this merged branch. Phase 2 _planning_ (this document)
didn't wait on it, and hadn't.

### 0a — Core CRUD

**Commit scope (on `feature/ca-he-behavior-audit`):** core CRUD
**Files:** `hazardous_event_create_update.ts`, `hazardous_event_get.ts`, `hazardous_event_delete.ts`
**Scope:** catalogue compose (create/update) and delete behavior — field validation, the two
dependent-guard styles on delete (explicit pre-check vs. reactive FK-violation catch), tenant
scoping. Write PGlite characterization tests pinning each path, including both delete-guard styles
as distinct, separately-asserted scenarios (Invariant 1 says don't silently reconcile them).
**Found:** the live code is `app/backend.server/models/event.ts`, not the orphaned split-file
directory every route actually imports past (confirmed via import-resolution trace, not assumed —
this correction propagated to 0a–0c retroactively). Three real bugs (dead reactive FK-catch;
`""`-instead-of-`null` crashes with a raw Postgres UUID error; delete leaves `event_causality`
links completely unchecked) plus 5 confirmed quirks, incl. wholesale (not merge) parent-link
replacement on update. 31 tests, all green.

### 0b — Causal chain

**Commit scope:** causal chain
**Files:** `cycles.ts`, `temporal.ts`, the parent-link path in `hazardous_event_create_update.ts`
**Scope:** catalogue `checkForCycle`'s exact depth-10-cap behavior, the temporal-order check's
both-dates-required condition, and tenant-isolation on linking. Write PGlite characterization
tests for: a cycle at exactly the cap boundary, one link with only one date set (must not block),
cross-tenant link attempt.
**Found:** the depth-10 cap is a real, empirically-reproduced data-integrity gap, not just a
theoretical incompleteness — a 20-node chain closing a cycle across its own full length succeeds
and gets persisted into `event_relationship`. Multi-hop detection under the cap, equal-date
boundary handling, and mixed-granularity date normalization all confirmed working as designed.
9 tests, all green.

### 0c — Approval / validation workflow

**Commit scope:** approval/validation workflow
**Files:** `hazardous_event_approval.ts`, `validation_workflow.ts`
**Scope:** catalogue every status transition and who can trigger it. Resolve the "is this
HE-only, with no DE/DR equivalent" question definitively (architecturally moot per the confirmed
target design, but Phase 0 still needs the exact current behavior for the parity tests). Write
PGlite characterization tests for each transition.
**Found:** three parallel mechanisms exist today for validation workflow, not one — see the
`validation_workflow.ts` resolution above. Also found: publishing silently overwrites the original
validator's attribution (`validatedByUserId`/`validatedAt` get replaced with the publisher's own)
— flagged for a PM decision (open decision #9 below), not fixed as part of this refactor. 6 tests,
all green.

### 0d — Attachments, HIP picker, spatial/division data

**Commit scope:** attachments/HIP/spatial
**Files:** `attachments.ts`, `hip_hazard_picker.ts`, `hazardousEventDivisionRepository.ts`,
`hazardousEventGeomTable` read/write paths
**Scope:** catalogue today's single-snapshot geom/division behavior precisely enough to answer
open decision #8 later (how it maps onto the new time-series `hazardous_event_spatial_observation`
model). Write PGlite characterization tests for attachment CRUD, HIP picker filtering, and
division/geom read/write.
**Found:** linking a "Geographic level" division via `spatialFootprint` has no tenant check at all
— same bug family as 0f's `event_causality` finding below, this time inside HE's own module (see
action item 5). A "Geographic level" item is never snapshotted, only referenced live against
`division_table` — directly answers open decision #8 (today's behavior is reference, not
snapshot). `hazardousEventCreate` always performs real, unconditional filesystem writes on save
with no injectable base path, even with zero attachments. 13 tests, all green.

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
**Found:** the most severe finding of Phase 0 — CSV import's tenant scoping is entirely broken by
a function-signature mismatch that silently drops the session-derived tenant, letting a CSV row's
own `countryAccountsId` column create or overwrite records in any tenant (action item 1). By
contrast, the three JSON API write routes (`add`/`update`/`upsert`) are correctly tenant-safe.
Also found, cross-cutting: `apiAuth`'s not-found guard is dead code (a JS truthiness gotcha on a
Drizzle `.select()` result), affecting every API-key-gated route across every domain, not just HE
(action item 2). The real-Postgres E2E tier proved too unstable in this environment to finish this
track's full scope — remaining presentation-layer characterization (delete-guard variants,
parent-linking via the UI, approval-transition variants) is **deferred, tracked, no fixed
deadline** (action item 3); what's covered here was validated at the PGlite layer instead.

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
**Found:** `event_causality` HE↔DE linking (the "linked triggering/triggered hazardous events"
picker) has no tenant check at all — unlike the singular `disasterEventTable.hazardousEventId`
field, which the same file (`event.ts`) explicitly guards with a dedicated
`hazardous_event.cannot_reference_other_tenant` error (action item 4). By contrast, the picker's
own search/list query (`getLinkableOptionsData`) and its `blockedHazardousIds` exclusion are both
correctly tenant-scoped. Also found a silent 200-record truncation with no search term and no
pagination — events beyond the cap are simply invisible with no indication. 6 tests, all green.

### 0g — Synthesis (depends on 0a–0f)

**Commit scope:** synthesis / audit note
**Scope:** produce the audit note — confirm or correct every quirk listed under Invariant 1,
resolve the `validation_workflow.ts` HE-only question with a definitive answer, and flag anything
0a–0f found that isn't already captured in this roadmap's open decisions list.
**Found:** this reconciliation pass — Invariant 1 above and the `validation_workflow.ts`
resolution are 0g's direct output, folded in above rather than kept as a separate note. Open
decisions #6–8 below are strengthened with concrete findings; #9 is new.

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

0a–0f were file-disjoint and technically parallelizable, but done solo and sequentially by design
(see the decision above) — each landed as its own commit on `feature/ca-he-behavior-audit`, now
merged into this branch.

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

**Carried from Phase 0, fixed by construction — not separate tasks, just correctness requirements
on this phase's own implementation:**

- **Spatial-footprint division linking must be tenant-scoped from the start** (0d finding #1).
  Today's `syncHazardousEventSpatialFootprint` checks division validity with no
  `countryAccountsId` filter at all — the new domain entity's equivalent logic must scope it,
  matching the guard `parent`-linking already gets right today (`ErrCrossTenantReference`).
- **Type nullable fields as actually nullable.** `createdByUserId`/`updatedByUserId`/
  `submittedByUserId` and similar attribution fields are typed non-nullable `string` today but a
  real caller can pass `""`, which crashes on a raw Postgres UUID-parse error rather than a
  graceful validation error — found independently at two call sites (0a finding #7, 0c finding
  #2). Model these as `string | null` with boundary validation (per ADR-003's `DomainError`
  hierarchy) so this closes structurally instead of needing a per-field patch.
- **No HIP-hierarchy validation logic needed at all** (open decision #6, resolved). The
  `specific_hazard_id`-only schema (Phase 2, Section A) makes the old precondition structurally
  unrepresentable — don't port `getRequiredAndSetToNullHipFields` or reinvent it.
- **Cycle detection: real path-membership check, not a depth cap** (open decision #7, resolved).
  Track visited node IDs in the recursive query, stop on a repeat; keep a high value (e.g. 500) as
  a runaway-query safety cap only, not the detection mechanism. No DB-level trigger.
- **Publish transition: conditional validation backfill, not unconditional overwrite** (open
  decision #9, resolved, PM decision). In the shared `validation-workflow` module's publish
  transition: only backfill `validatedByUserId`/`validatedAt` from the publisher when those
  fields are empty (direct publish, auto-marked validated); preserve an existing, separately-set
  validator's attribution untouched otherwise.

## Phase 4 — Use Cases 🧱 (stubbed — depends on Phase 3)

**Carried from Phase 0, open decision #8 (resolved) — the spatial-observation read/write rule:**
one shared "current observation" query (latest by `observation_time`, not insertion order) backs
every default read — UI, CSV export, and the API's default read with no `observationTime`
supplied. Write-side: creating/replacing an observation at a duplicate `observationTime` returns a
domain-level conflict (surfaced as HTTP 409 by the API adapter) rather than silently overwriting;
an explicit `confirmReplace` flag on the use case's input is required to actually replace it.

## Phase 5 — Repository + Module Wiring 🧱 (stubbed — depends on Phase 2 + Phase 4)

**Carried from Phase 0 (0f), DE-side scope — whichever of these two phases owns the new "link
hazardous event to disaster event" use case:** today's `event_causality` HE↔DE linking has no
tenant check at all, unlike the singular `disasterEventTable.hazardousEventId` field which the
same code explicitly guards. Apply the same same-tenant check uniformly to both link mechanisms
in the new implementation instead of inheriting today's split.

## Phase 6 — Presentation: New Hidden Route + CSV/API 🧱 (stubbed — depends on Phase 5)

Built fresh, not based on `feature/poc-react-aria-hazardous-event` (decided). Covers: the new
authenticated, direct-URL-only route; CSV import/export migrating onto the new implementation in
step with the route (per Invariant 2); and a **new `/api/v2/hazardous-events` NestJS controller**
(open decision #5, resolved — not an in-place migration of the existing `/api+/hazardous-event+/`
routes).

**Carried from Phase 0, explicit deliverables for this phase:**

- **CSV import tenant-scoping, fixed by construction (0e findings 1–2).** The new CSV import must
  force `countryAccountsId` server-side before any create/update/upsert call, matching the pattern
  the existing JSON API routes (`add.ts`/`upsert.ts`) already get right — not the pattern the
  existing CSV import gets wrong (a function-signature mismatch that silently drops the
  session-derived tenant entirely).
- **`apiAuth`'s dead not-found guard, explicit deliverable, not automatic.** Unlike the item
  above, this does **not** get fixed just by HE's new routes existing — `apiAuth`
  (`app/backend.server/models/api_key.ts`) is shared infrastructure used by every API-key-gated
  route across every domain, and HE's new routes will most likely call the same shared function.
  Fix `if (!key)` → `if (key.length === 0)` (or equivalent) in `apiAuth` itself, verified against
  both a missing and an invalid `X-Auth` header.
- **`/api/v2/hazardous-events` gets full CRUD, not a 1:1 port** (open decision #5, resolved).
  Today's surface is `add`/`update`/`upsert`/`list`/`fields` only — no `getById`, no `delete` —
  confirmed via directory listing. The new controller adds both, and moves to the standard
  ADR-003/ADR-007 response shape (the legacy `{ ok, res: [...] }` shape does not carry over).
  Communicate both changes to the known low-volume external customers ahead of cutover.
- **API-only `observationTime` field; CSV stays current-only** (open decision #8, resolved). The
  `/api/v2/hazardous-events` payload gets an optional `observationTime` field for
  historical/backfill writes to `hazardous_event_spatial_observation`; CSV import/export does not
  gain a new column — it always targets the current/latest observation, matching Phase 4's shared
  read rule.

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

Phase 0 is complete, Phase 2 is no longer blocked (ER diagram reviewed 2026-08-21), and every
decision carried forward from Phase 0 is now resolved (2026-09-01, see below). Phase 3 onward is
unblocked pending only the current PR (`feature/ca-hazardous-events-scaffold` → `dev`) landing.
Pass 3 of this document will replace each 🧱 stub with a Notices-style intent breakdown (branch,
`/opsx:propose` text, files touched, test tier) — note `validation-workflow` and
`hazardous-events` are two separate intent tracks from Phase 3 onward, not one.

---

## Open decisions carried forward

**Resolved (2026-08-21, ER diagram review):**

1. ~~`eventRelationshipTable` → `eventCausalityTable` unification~~ — **decided: not in scope.**
   HE's new causality table replaces `eventRelationshipTable` only.
2. ~~Is `validation_workflow.ts` genuinely HE-only?~~ — **superseded, and independently confirmed
   by Phase 0 (0c/0g).** The dead file was HE-only; its live replacement,
   `handleApprovalWorkflowService`, is already generic and already called for `disaster_event` and
   `disaster_records` today — see the Invariant 1 call-out above. The target design formalizes
   existing sharing, not new sharing.
3. ~~Hazard-type vs. specific-hazard field-definition level~~ — **decided: hazard_type, settled,
   not to be re-opened.**
4. ~~Naming inconsistencies (casuality/hazard_event_hazard_driver/country_account_id/hazard_driver
   FK)~~ — **fixed at the source**, confirmed in the updated `.drawio`.

**Resolved (2026-09-01, engineering + PM decisions — closes every remaining open decision):**

5. ~~New `/api/v2/hazardous-events` REST surface vs. migrating the existing
   `/api+/hazardous-event+/` routes in place~~ — **decided: new `/api/v2/hazardous-events` NestJS
   controller**, matching Notices' pattern, not an in-place migration. The "few, rarely-used
   customers" reality changes the calculus the Notices precedent alone didn't settle — low
   migration cost, and it's the right moment to gain proper versioning, i18n, and traceability
   (ADR-004) that the legacy routes never had. Two things ride along with this, deliberately, not
   as afterthoughts: (a) the response shape moves to the standard ADR-003/ADR-007 convention
   (plain resource on success, enveloped only on error) — the legacy `{ ok, res: [...] }` shape
   confirmed in `add.ts` does **not** carry over; (b) today's surface is incomplete
   (`add`/`update`/`upsert`/`list`/`fields` only — **no `getById`, no `delete`**, confirmed via
   directory listing) — Phase 6 builds full CRUD, not a 1:1 port. Both changes get communicated to
   the known customers ahead of cutover.
6. ~~Where shared HIP-hierarchy validation logic lives post-refactor~~ — **decided: nowhere in the
   new HE domain module; the question's premise doesn't survive Phase 0's audit.**
   `getRequiredAndSetToNullHipFields` is **not actually shared with disaster-record** — confirmed
   its only callers are HE's own files. Disaster-record has its own, separate, and **internally
   duplicated twice** (`validate()` and `disasterRecordsUpdate` each have their own inline copy)
   implementation, which is also more thorough than HE's (it does live DB lookups to verify the
   hazard/cluster/type chain actually matches; HE's version only checks for gaps). None of this
   matters going forward: the new `specific_hazard_id`-only schema (Phase 2, Section A)
   structurally eliminates the precondition for HE. `getRequiredAndSetToNullHipFields` retires as
   dead code at cutover with zero disaster-record impact. Disaster-record's own duplication is
   filed as a discovered, out-of-scope finding for whenever DR's own refactor starts.
7. ~~DB-level cycle-prevention constraint vs. app-layer depth-10-capped check~~ — **decided:
   app-layer, but the algorithm itself gets fixed, in Phase 3.** A true DB-level cycle guarantee
   needs a write-time trigger running a recursive query — a genuinely new, more complex mechanism
   with no existing precedent anywhere in this codebase (the superficially-similar
   `eventCausalityTable` CHECK constraints are entity-type/FK-shape checks, not cycle prevention —
   corrected from this doc's earlier framing). 0b's proof that a full-length cycle silently
   persists today is a bug in the _algorithm_ (a naive depth cap instead of real path-membership
   detection), not proof the app layer is the wrong place. Fix: track visited node IDs in the
   recursive CTE and stop on a repeat, with the depth value repurposed as a high runaway-query
   safety cap (e.g. 500), not the detection mechanism itself. The one gap this doesn't close — two
   concurrent requests racing to create a cycle simultaneously — is accepted as low-probability
   given this isn't a high-concurrency write path.
8. ~~How CSV import/export and the existing API map onto the new time-series
   `hazardous_event_spatial_observation` model~~ — **decided: current/latest observation by
   `observation_time` (not insertion order) is the default read everywhere — UI, CSV export, and
   the API's default read with no `observationTime` supplied all share one query.** The API alone
   gets an **optional** `observationTime` field on write, for historical/backfill cases; CSV stays
   current-only (no new column) since nothing points to a real need there yet. A duplicate
   `observationTime` submitted via the API returns **409 Conflict** with the existing observation
   in the response body — not a silent overwrite — and requires an explicit `confirmReplace: true`
   resubmission to actually replace it, the same two-round-trip pattern HTTP's own `If-Match`
   optimistic-concurrency mechanism uses. Since CSV never supplies `observationTime`, it can never
   hit this conflict at all.
9. ~~Publishing silently overwrites the original validator's attribution~~ — **decided (PM):
   option (a), conditional backfill — direct publish stays allowed.**
   `hazardousEventUpdateApprovalStatusPublish`'s new equivalent only backfills
   `validatedByUserId`/`validatedAt` from the publisher **when those fields are still empty** (a
   record published directly, with no prior separate validation, is auto-marked validated using
   the publisher's own identity). When a record was already validated by a different user earlier,
   that original attribution is preserved, never overwritten by the publisher's. No state-transition
   guard is added blocking direct publish — that path is confirmed legitimate, not a bug to close
   off.

No open decisions remain blocking Pass 3. The next decision point is whatever Pass 3's own intent
breakdown surfaces once work on it starts.

---

## Architectural decisions informing this plan

Reused from the Notices pilot, not re-decided:

| ADR                                   | Decision most relevant here                                                      |
| ------------------------------------- | -------------------------------------------------------------------------------- |
| ADR-001 (multilingual strategy)       | JSONB i18n fields; locale resolution chain for the new API surface               |
| ADR-002 (timezone handling)           | All new timestamp columns declared `{ withTimezone: true }` inline               |
| ADR-003 (error handling architecture) | `DomainError` hierarchy; `ErrorResponse` envelope; per-domain `ErrorBoundary`    |
| ADR-004 (logging and traceability)    | `ILogger` port; `AsyncLocalStorage` request context; `traceId` in every log line |
