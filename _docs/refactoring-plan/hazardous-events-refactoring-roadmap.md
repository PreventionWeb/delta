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

## Phase M — Data Migration: Backfill, Validation, Rollback ✅ (Pass 3 breakdown complete, 2026-09-01 — execution not started)

**Named "M," not "2.5"** — deliberately not squeezed into the numeric sequence. Starts once Phase
2's schema exists; runs in **parallel** with Phase 3–6 (it only needs the target schema and the
existing production data, not the new domain/use-case/presentation layers being built alongside
it); must be **fully validated and signed off before Phase 7 begins** — cutover assumes the data
is already correct, not that migration happens as part of cutover itself. Genuinely new scope this
document hadn't addressed until now, not something quietly folded into Phase 2 or Phase 7 after
the fact.

### ⬜ Ma — Transformation Scripts

**Branch:** `feature/ca-he-migration-scripts` (non-OpenSpec — operational tooling, not a new
application capability)

**Scope:**

```
Idempotent, re-runnable (upsert semantics — safe to dry-run repeatedly while being
refined) backfill scripts, one per mapping: old hipHazardId/hipClusterId/hipTypeId →
new specific_hazard_id; the current geom/division snapshot (hazardousEventGeomTable/
hazardousEventDivisionTable) → one initial hazardous_event_spatial_observation row
per event, observationTime = the event's last-updated timestamp (no real history
exists to backfill, only a current snapshot); jsonb attachments → one
hazardous_event_attachment row per array element; HE's own eventRelationshipTable
rows → the new causality table; current approvalStatus (+ validated/published
attribution) → one initial WorkflowInstance row per event.
```

**Files touched:**

- `scripts/dts_database/migrate_hazardous_events_to_ca_schema.sql` (new — or split
  per mapping if any single script grows unwieldy; exact split is an implementation
  call for whoever writes it)

**Test tier:** PGlite integration — each transformation tested against fixture data
covering edge cases already known from Phase 0 (a HIP-less event blocked by
`NOT NULL` — 0a; the vestigial legacy `spatial_footprint` jsonb column found during
the `dev` sync, confirmed unrelated and untouched by this migration).

---

### ⬜ Mb — Migration Validator Agent

**Branch:** `feature/ca-migration-validator-agent` (non-OpenSpec — a Claude Code agent
definition, not application code)

**Scope:**

```
Add migration-validator.agent.md in BOTH .claude/agents/ and .github/agents/ —
byte-identical mirrors, matching this project's existing convention (confirmed:
bug-triage.agent.md is identical in both directories today). Frontmatter
name/description + trigger phrases, then a structured-analysis-only role — no
fixes, no code changes. Runs after Ma's scripts execute, before any human sign-off:
row-count parity between old and new tables (accounting for expected fan-out, e.g.
one event → N attachment rows); referential integrity on every new FK; a
field-by-field diff between each migrated record and its old-schema source, run
against the FULL dataset, not a sample. Produces a structured discrepancy report
(counts, affected record ids, a severity per discrepancy type) as its output — the
same audit-then-report shape as the existing bug-triage agent, not a pass/fail gate
it enforces unilaterally. A human still makes the actual sign-off call (the Phase M
gate below), informed by this report rather than reviewing the full dataset by
hand.
```

**Files touched:**

- `.claude/agents/migration-validator.agent.md` (new)
- `.github/agents/migration-validator.agent.md` (new — exact mirror of the above,
  not a divergent copy; keep both in sync on any future edit, same as this
  project's existing agents)

**Test tier:** Manual verification — run the agent against a deliberately-corrupted
migration (e.g. one manually-broken FK, one manually-mismatched field) and confirm
it surfaces both; run against a clean migration and confirm a zero-discrepancy
report; diff the two agent files to confirm they're byte-identical.

---

### ⬜ Mc — Rollback Strategy

**Branch:** `feature/ca-he-migration-rollback` (non-OpenSpec)

**Scope:**

```
Document and script the rollback procedure — genuinely cheap here specifically
because of Invariant 2 (expand-only): Ma's scripts only ever INSERT into new
tables, never touch the old ones, so "rollback" is truncating the new tables and
re-running Ma once it's fixed, not a point-in-time restore. Provide a
truncate-and-reset script alongside Ma's own scripts, and state this property
explicitly in the migration's own documentation so a future reader doesn't
over-engineer a heavier rollback mechanism than the situation actually needs.
```

**Files touched:**

- `scripts/dts_database/rollback_hazardous_events_ca_migration.sql` (new)

**Test tier:** PGlite integration — run Ma, then Mc, then Ma again; confirm the
second run produces identical results to the first (idempotency + clean rollback
verified together).

---

### 🏁 Phase M Gate — Sign-off (prerequisite for Phase 7)

`migration-validator` reports zero unresolved discrepancies against the **full** production
dataset (not a sample) — any discrepancy the agent flags is either fixed and re-validated or
explicitly accepted by a human with a recorded reason, never silently ignored. A human (data
owner/PM) then signs off. Phase 7 does not begin until this gate is recorded as passed.

---

## Phase 3 — Domain Entity + Ports ✅ (Pass 3 breakdown complete, 2026-09-01 — execution not started)

Two separate intent tracks, per this document's own note that `validation-workflow` and
`hazardous-events` are independent from here on — Track A builds first since Track B depends on
its port. Every open decision this phase touches (#6, #7, #9) is folded directly into the intent
that owns it below, not left as a separate carried-forward list.

### Track A — `validation-workflow` (shared module, build first)

### 🔷 3a — WorkflowInstance Domain Entity + Ports

**Branch:** `feature/ca-workflow-instance-entity` (no `he-` prefix — this module isn't
HE-specific, matching how Notices dropped its own domain prefix for genuinely shared work like
`feature/ca-domain-error-hierarchy`)

**Intent for `/opsx:propose`:**

```
Create WorkflowInstance domain entity in
app/domains/validation-workflow/domain/WorkflowInstance.ts — polymorphic via entityId +
entityType ('HE'|'DE'|'DR'), status enum DRAFT|SUBMITTED|REVISION_REQUESTED|APPROVED|
REJECTED|PUBLISHED, with transition methods that reject invalid state changes. The
publish transition only backfills validatedByUserId/validatedAt from the publisher
when those fields are still empty (direct publish, auto-marked validated) — an
existing, separately-set validator's attribution is preserved, never overwritten
(resolved open decision #9, PM decision). Define IWorkflowRepository port
(findByEntity, findByEntityIds — batched lookup for list views, avoiding both an N+1
query and any other module reaching into this module's own table directly — save) in
application/ports/. Zero framework dependencies on the entity.
```

**Files touched:**

- `app/domains/validation-workflow/domain/WorkflowInstance.ts` (new)
- `app/domains/validation-workflow/domain/WorkflowInstance.test.ts` (new)
- `app/domains/validation-workflow/application/ports/IWorkflowRepository.ts` (new)

**Test tier:** Unit — invalid transitions rejected; publish backfill rule tested for both
branches (empty vs. already-set validator fields). Zero DB dependency.

---

### Track B — `hazardous-events` (depends on Track A's port)

### 🔷 3b — HazardousEvent Core Domain Entity + Port

**Branch:** `feature/ca-he-hazardous-event-entity`

**Intent for `/opsx:propose`:**

```
Create HazardousEvent domain entity in
app/domains/hazardous-events/domain/HazardousEvent.ts with private constructor and
static create() factory — validates tenant, specificHazardId, and dates are present.
Carries no approval-status field at all (status lives entirely in validation-workflow's
WorkflowInstance, queried via IWorkflowRepository by use cases that need it — resolved
design decision, avoids the two-sources-of-truth drift 0c found in today's system).
Carries no independent hipHazardId/hipClusterId/hipTypeId fields either — only
specificHazardId, since the new schema makes today's HIP-hierarchy consistency check
structurally unrepresentable (resolved open decision #6; getRequiredAndSetToNullHipFields
is not ported). User-attribution fields (createdByUserId, updatedByUserId,
submittedByUserId) are typed string | null, not non-nullable string — today's ""
vs. null crash (0a finding #7, 0c finding #2) is closed by construction, not a
per-field patch. Define IHazardousEventRepository port (findById, findAll, save,
delete, findCurrentSpatialObservation, findSpatialObservationByTime,
saveSpatialObservation) in application/ports/ — spatial observations are a child of
this aggregate, not their own aggregate root, so they're owned by this same port per
standard DDD practice (one repository per aggregate root), not a separate
ISpatialObservationRepository. Zero framework dependencies on the entity.
```

**Files touched:**

- `app/domains/hazardous-events/domain/HazardousEvent.ts` (new)
- `app/domains/hazardous-events/domain/HazardousEvent.test.ts` (new)
- `app/domains/hazardous-events/application/ports/IHazardousEventRepository.ts` (new)

**Test tier:** Unit — factory validates required fields, throws `ValidationError` on a
missing tenant/`specificHazardId`/dates; an empty-string attribution field is accepted as
a valid `null`-equivalent, not a crash. Zero DB dependency.

---

### 🔷 3c — Causal-Chain Domain Logic

**Branch:** `feature/ca-he-causal-chain-domain-logic`

**Intent for `/opsx:propose`:**

```
Add cycle-detection domain logic for HE's new causality table (cause/effect pairs,
Phase 2 Section D) — a real path-membership check (track visited node IDs in the
recursive query, stop on a repeat) rather than today's naive depth-10 cap, which 0b
proved silently persists a full-length cycle. Keep a high value (e.g. 500) only as a
runaway-query safety cap, never the detection mechanism (resolved open decision #7 —
app-layer, not a DB-level trigger). Throws a DomainError when linking would close a
cycle.
```

**Files touched:**

- `app/domains/hazardous-events/domain/CausalChain.ts` (new — domain service, not a
  method on `HazardousEvent` itself, since it reasons about the whole chain, not one
  entity's own state)
- `app/domains/hazardous-events/domain/CausalChain.test.ts` (new)

**Test tier:** Unit — a cycle of any length (including well beyond the old depth-10
cap) is correctly rejected; a valid acyclic chain of any length is accepted. In-memory
graph fixture, zero DB dependency.

---

### 🔷 3d — SpatialObservation Child Entity

**Branch:** `feature/ca-he-spatial-observation-entity`

**Intent for `/opsx:propose`:**

```
Create SpatialObservation domain entity in
app/domains/hazardous-events/domain/SpatialObservation.ts representing one dated
geom/division reading (observationTime, geometry, divisionIds) as a child of
HazardousEvent's aggregate. Division-validity checking is tenant-scoped from the
start (0d finding #1 — today's syncHazardousEventSpatialFootprint has no
countryAccountsId filter at all; this must not repeat that gap). Implements the
"current observation" rule (latest by observationTime, not insertion order — a
backfilled earlier observationTime must never become "current" just because it was
inserted last) and the duplicate-observationTime conflict rule (a second observation
at the same observationTime returns a domain-level conflict rather than silently
overwriting; replacing it requires an explicit confirmReplace intent) — resolved open
decision #8.
```

**Files touched:**

- `app/domains/hazardous-events/domain/SpatialObservation.ts` (new)
- `app/domains/hazardous-events/domain/SpatialObservation.test.ts` (new)

**Test tier:** Unit — "current" selection picks latest by `observationTime` regardless
of insertion order; duplicate `observationTime` without `confirmReplace` is rejected
with a conflict; with `confirmReplace`, replaces correctly; cross-tenant division id is
rejected.

---

### 🔷 3e — Remaining Aggregate Child Concerns

**Branch:** `feature/ca-he-aggregate-child-value-objects`

**Intent for `/opsx:propose`:**

```
Add value objects/child collections to the HazardousEvent aggregate for hazard
drivers (Phase 2 Section C), attachments (Section F), and hazard-type field values
(Section H) — grouped into one intent since none carries a business rule beyond
basic shape validation, unlike causality or spatial observations above. Each stays
entity-internal; no separate port at this stage.
```

**Files touched:**

- `app/domains/hazardous-events/domain/HazardousEvent.ts` (modified — add collections)
- `app/domains/hazardous-events/domain/HazardousEvent.test.ts` (modified)

**Test tier:** Unit — each collection's shape validation (required fields per hazard
driver / attachment / field value).

---

### 🏁 Phase 3 Gate

`yarn tsc` passes with all new files. Every entity/service above has zero DB and zero
NestJS/framework dependency — confirmed by the test tier itself (unit only, no PGlite
import) before Phase 5 wires real repositories against them.

---

## Phase 4 — Use Cases ✅ (Pass 3 breakdown complete, 2026-09-01 — execution not started)

Same two-track split as Phase 3. Track A's workflow-transition use case is built **once**,
generically, in `validation-workflow` — HE's own use cases call it, not reimplement it, learning
directly from 0c's finding that today's system already made this mistake twice independently.

### Track A — `validation-workflow`

### 🔷 4a — ProcessWorkflowAction Use Case

**Branch:** `feature/ca-process-workflow-action-use-case`

**Intent for `/opsx:propose`:**

```
Add ProcessWorkflowActionUseCase in
app/domains/validation-workflow/application/use-cases/ProcessWorkflowAction.ts —
accepts { entityId, entityType, action: 'submit-validation'|'validate'|'publish'|
'reject'|'return', actingUserId }, loads the WorkflowInstance via IWorkflowRepository,
calls its transition method (enforcing the publish backfill rule from 3a), persists,
and triggers a notification via INotificationPort. One implementation for every
entity type — replaces today's two independently-duplicated generic services
(handleApprovalWorkflowService, processApprovalStatusActionService) found in 0c.
```

**Files touched:**

- `app/domains/validation-workflow/application/use-cases/ProcessWorkflowAction.ts` (new)
- `app/domains/validation-workflow/application/use-cases/ProcessWorkflowAction.test.ts` (new)
- `app/domains/validation-workflow/application/ports/INotificationPort.ts` (new)

**Test tier:** Unit — mock repository + notification port. Each action transitions
correctly; an invalid transition (e.g. `submit-publish` on a still-`DRAFT` record, if
disallowed) propagates the entity's own rejection; notification is triggered exactly
once per successful transition.

---

### Track B — `hazardous-events`

### 🔷 4b — CreateHazardousEvent Use Case

**Branch:** `feature/ca-he-create-use-case`

**Intent for `/opsx:propose`:**

```
Add CreateHazardousEventUseCase — constructs a HazardousEvent via
HazardousEvent.create(), validates a supplied parent's existence and tenant match
(no cycle/temporal check at create time — a brand-new event cannot already be an
ancestor of anything, confirmed correct and not ported as a bug per 0b finding #5),
persists via IHazardousEventRepository, and initializes a WorkflowInstance at DRAFT
via IWorkflowRepository. Returns HazardousEventDto.
```

**Files touched:**

- `app/domains/hazardous-events/application/use-cases/CreateHazardousEvent.ts` (new)
- `app/domains/hazardous-events/application/use-cases/CreateHazardousEvent.test.ts` (new)
- `app/domains/hazardous-events/application/dto/HazardousEventDto.ts` (new)

**Test tier:** Unit — mock repositories. Happy path returns DTO with a `DRAFT` status;
`ValidationError` from the entity propagates; foreign-tenant parent is rejected.

---

### 🔷 4c — UpdateHazardousEvent Use Case

**Branch:** `feature/ca-he-update-use-case`

**Intent for `/opsx:propose`:**

```
Add UpdateHazardousEventUseCase — applies field changes to an existing
HazardousEvent; if the parent is being set/changed, runs CausalChain's cycle check
and the temporal-order check (both-dates-required, per 0b) before persisting; if a
new spatial reading is included in the same submission, calls
RecordSpatialObservationUseCase (4g) internally rather than duplicating its logic —
this is what keeps the web form's single "save" submission working exactly like
today even though spatial observations are their own use case underneath.
```

**Files touched:**

- `app/domains/hazardous-events/application/use-cases/UpdateHazardousEvent.ts` (new)
- `app/domains/hazardous-events/application/use-cases/UpdateHazardousEvent.test.ts` (new)

**Test tier:** Unit — mock repositories. A cycle-closing parent change is rejected; a
same-tenant, acyclic parent change succeeds; an included spatial reading delegates to
`RecordSpatialObservationUseCase` (verified via a mock, not a real call).

---

### 🔷 4d — GetHazardousEventById Use Case

**Branch:** `feature/ca-he-get-by-id-use-case`

**Intent for `/opsx:propose`:**

```
Add GetHazardousEventByIdUseCase — fetches the entity via
IHazardousEventRepository.findById(), enriches the returned DTO with current
workflow status (IWorkflowRepository) and the current spatial observation (latest by
observationTime, per 3d's rule), throws NotFoundError for a missing id or a
foreign-tenant match.
```

**Files touched:**

- `app/domains/hazardous-events/application/use-cases/GetHazardousEventById.ts` (new)
- `app/domains/hazardous-events/application/use-cases/GetHazardousEventById.test.ts` (new)

**Test tier:** Unit — mock repositories. Returns an enriched DTO (status +
current observation) for a valid id+tenant; throws `NotFoundError` for a
foreign-tenant id (tenant isolation enforced at the application layer, matching
Notices' precedent).

---

### 🔷 4e — ListHazardousEvents Use Case

**Branch:** `feature/ca-he-list-use-case`

**Intent for `/opsx:propose`:**

```
Add ListHazardousEventsUseCase — paginated, tenant-scoped list via
IHazardousEventRepository.findAll(), then one batched
IWorkflowRepository.findByEntityIds() call across every id on the page to attach
current status — never a per-row lookup (N+1) and never a repository reaching
across the module boundary into workflow_instance directly; the two repositories
are composed here, at the application layer. Returns an empty array, not an error,
for a tenant with no events.
```

**Files touched:**

- `app/domains/hazardous-events/application/use-cases/ListHazardousEvents.ts` (new)
- `app/domains/hazardous-events/application/use-cases/ListHazardousEvents.test.ts` (new)

**Test tier:** Unit — mock repositories. Returns mapped, status-enriched list;
`findByEntityIds` is called exactly once per page regardless of page size, not once
per row; empty array for zero results.

---

### 🔷 4f — DeleteHazardousEvent Use Case

**Branch:** `feature/ca-he-delete-use-case`

**Intent for `/opsx:propose`:**

```
Add DeleteHazardousEventUseCase — one unified dependent-check, no special cases:
blocks the delete if the event is referenced by (a) a Disaster Event's
hazardousEventId, (b) event_causality in either direction, or (c) another
HazardousEvent's parent/causal link. Throws a single DomainError
(HazardousEventHasDependentsError) whose context carries which dependents and how
many, for the presentation layer to render a useful message — not three different
error shapes for three different checks. This is a deliberate behavior change from
today for case (b) specifically (0a finding #8 / 0f: today cascades silently) — the
new implementation closes that gap by construction rather than porting it forward.
```

**Files touched:**

- `app/domains/hazardous-events/application/use-cases/DeleteHazardousEvent.ts` (new)
- `app/domains/hazardous-events/application/use-cases/DeleteHazardousEvent.test.ts` (new)

**Test tier:** Unit — mock repository, three separate dependent scenarios (DE link,
`event_causality` link, HE-parent link) each independently block the delete with a
populated `context`; an event with zero dependents deletes successfully.

---

### 🔷 4g — RecordSpatialObservation Use Case

**Branch:** `feature/ca-he-record-spatial-observation-use-case`

**Intent for `/opsx:propose`:**

```
Add RecordSpatialObservationUseCase — accepts { hazardousEventId, observationTime?,
geometry, divisionIds, confirmReplace? }; observationTime defaults to now() when
omitted. Composes SpatialObservation's (3d) current/conflict rules: a duplicate
observationTime without confirmReplace throws a domain-level conflict (surfaced as
HTTP 409 by the API adapter, per resolved open decision #8); with confirmReplace,
replaces it. Callable directly (API's optional observationTime field, historical
backfill) or internally from UpdateHazardousEvent (4c, UI's bundled submission).
```

**Files touched:**

- `app/domains/hazardous-events/application/use-cases/RecordSpatialObservation.ts` (new)
- `app/domains/hazardous-events/application/use-cases/RecordSpatialObservation.test.ts` (new)

**Test tier:** Unit — mock repository. No `observationTime` supplied defaults to now;
a duplicate `observationTime` without `confirmReplace` throws a conflict; with
`confirmReplace`, replaces the existing observation; a cross-tenant division id is
rejected (delegates to 3d's own tenant-scoping).

---

### 🏁 Phase 4 Gate

`yarn tsc` passes with all new files. Every use case above is tested against a **mock**
repository/port, zero PGlite/DB dependency — Phase 5 is where real, DB-backed
implementations get verified against these same use cases.

---

## Phase 5 — Repository + Module Wiring ✅ (Pass 3 breakdown complete, 2026-09-01 — execution not started)

Same two-track split. All repository implementations are PGlite-integration-tested — this is the
first phase where the domain/use-case layers built in Phase 3/4 actually touch a real (test) DB.

### Track A — `validation-workflow`

### 🔷 5a — DrizzleWorkflowRepository

**Branch:** `feature/ca-drizzle-workflow-repository`

**Intent for `/opsx:propose`:**

```
Implement DrizzleWorkflowRepository fulfilling IWorkflowRepository against
workflow_instance — findByEntity(entityId, entityType), findByEntityIds(entityIds[],
entityType) as one batched query (IN clause, not a loop), save(). Deliberately no
tenant filter of its own — this repository trusts the entityId it's given was already
tenant-validated by the caller's own aggregate repository (HazardousEventRepository/
DisasterEventRepository) before reaching here; workflow_instance has no
countryAccountsId column of its own by design (Phase 2, Section G).
```

**Files touched:**

- `app/domains/validation-workflow/infrastructure/DrizzleWorkflowRepository.ts` (new)
- `tests/integration/domains/validation-workflow/DrizzleWorkflowRepository.test.ts` (new)

**Test tier:** PGlite integration — `findByEntityIds` returns correct results for a
mixed batch of entity types in one query (confirmed via query count, not just
correctness); `save()` round-trips every status transition correctly.

---

### 🔷 5b — Notification Adapter

**Branch:** `feature/ca-workflow-notification-adapter`

**Intent for `/opsx:propose`:**

```
Implement an email-based INotificationPort adapter — sends the validator-assignment
notification on submit-validation and the status-change notification on
validate/publish/reject/return, matching today's actual email behavior found in 0c's
audit (assigns validators, emails them on submission). Injectable via NestJS DI so
ProcessWorkflowActionUseCase's tests can use a no-op double instead.
```

**Files touched:**

- `app/domains/validation-workflow/infrastructure/EmailNotificationAdapter.ts` (new)
- `app/domains/validation-workflow/infrastructure/EmailNotificationAdapter.test.ts` (new)

**Test tier:** Unit — mocked mail sender; correct recipients/template selected per
action type.

---

### 🔷 5c — ValidationWorkflowModule

**Branch:** `feature/ca-validation-workflow-module`

**Intent for `/opsx:propose`:**

```
Create ValidationWorkflowModule as a NestJS module registering
DrizzleWorkflowRepository as the IWorkflowRepository provider and
EmailNotificationAdapter as the INotificationPort provider, exporting
ProcessWorkflowActionUseCase — import into CoreModule so it's resolvable from the
application context and from HazardousEventsModule (5g) via its own import.
```

**Files touched:**

- `app/domains/validation-workflow/infrastructure/ValidationWorkflowModule.ts` (new)
- `app/infrastructure/CoreModule.server.ts` (update — add import)
- `tests/integration/domains/validation-workflow/ValidationWorkflowModule.test.ts` (new)

**Test tier:** Integration — `Test.createTestingModule([ValidationWorkflowModule])`
resolves `ProcessWorkflowActionUseCase` using PGlite.

---

### Track B — `hazardous-events`

### 🔷 5d — DrizzleHazardousEventRepository (core)

**Branch:** `feature/ca-he-drizzle-repository-core`

**Intent for `/opsx:propose`:**

```
Implement DrizzleHazardousEventRepository fulfilling IHazardousEventRepository's
core methods — findById, findAll (tenant-scoped, paginated), save, delete — plus the
grouped child value objects from 3e (hazard drivers, attachments, hazard-type field
values) persisted as part of the same save(). Every query scoped with
eq(hazardousEventTable.countryAccountsId, tenantId), matching Notices' precedent.
findById throws NotFoundError for a missing row or a foreign-tenant match.
```

**Files touched:**

- `app/domains/hazardous-events/infrastructure/DrizzleHazardousEventRepository.ts` (new)
- `tests/integration/domains/hazardous-events/DrizzleHazardousEventRepository.test.ts` (new)

**Test tier:** PGlite integration — CRUD with tenant isolation (an event created for
tenant A is not visible from tenant B); child value objects persist and round-trip
correctly.

---

### 🔷 5e — Spatial Observation Persistence

**Branch:** `feature/ca-he-spatial-observation-persistence`

**Intent for `/opsx:propose`:**

```
Implement IHazardousEventRepository's spatial-observation methods —
findCurrentSpatialObservation (latest by observationTime, not insertion order, per
3d), findSpatialObservationByTime (exact match, for the conflict check),
saveSpatialObservation — against hazardous_event_spatial_observation. Division
validity checks are tenant-scoped (0d finding #1 — this must not repeat that gap).
```

**Files touched:**

- `app/domains/hazardous-events/infrastructure/DrizzleHazardousEventRepository.ts`
  (modified — same file as 5d, this is the spatial-observation half of it)
- `tests/integration/domains/hazardous-events/DrizzleHazardousEventRepository.test.ts`
  (modified)

**Test tier:** PGlite integration — a backfilled earlier `observationTime` inserted
after a later one does not become "current"; a duplicate `observationTime` is
detectable via `findSpatialObservationByTime` before the use case decides to
conflict or replace; cross-tenant division id is rejected at the DB layer too, not
just the domain layer (defense in depth).

---

### 🔷 5f — Delete Dependent-Check Queries

**Branch:** `feature/ca-he-delete-dependent-check-queries`

**Intent for `/opsx:propose`:**

```
Implement the three dependent-reference queries backing DeleteHazardousEventUseCase
(4f)'s unified check — a Disaster Event referencing this event's hazardousEventId, an
event_causality row in either direction, or another HazardousEvent's parent/causal
link. Return enough detail (which table, how many rows) for the use case's
DomainError context, not just a boolean.
```

**Files touched:**

- `app/domains/hazardous-events/infrastructure/DrizzleHazardousEventRepository.ts`
  (modified — same file, delete-dependent-check half)
- `tests/integration/domains/hazardous-events/DrizzleHazardousEventRepository.test.ts`
  (modified)

**Test tier:** PGlite integration — three independent scenarios (0a's existing
`event_causality`-only test from Phase 0 is the direct precedent for one of them),
each correctly detected; zero dependents deletes cleanly.

---

### 🔷 5g — HazardousEventsModule

**Branch:** `feature/ca-hazardous-events-module`

**Intent for `/opsx:propose`:**

```
Create HazardousEventsModule as a NestJS module registering
DrizzleHazardousEventRepository as the IHazardousEventRepository provider, importing
ValidationWorkflowModule (5c) for the workflow port dependency, and exporting all six
use cases from Phase 4 (Create, Update, GetById, List, Delete,
RecordSpatialObservation) — import into CoreModule.
```

**Files touched:**

- `app/domains/hazardous-events/infrastructure/HazardousEventsModule.ts` (new)
- `app/infrastructure/CoreModule.server.ts` (update — add import)
- `tests/integration/domains/hazardous-events/HazardousEventsModule.test.ts` (new)

**Test tier:** Integration — `Test.createTestingModule([HazardousEventsModule])`
resolves all six use cases using PGlite, including their cross-module dependency on
`ValidationWorkflowModule`.

---

### ⬜ 5h — DE Legacy Fix: `event_causality` Tenant Check

**Branch:** `fix/de-event-causality-tenant-check` (non-OpenSpec — a small, direct patch
to existing legacy code, not a new capability; per this document's own "Non-OpenSpec
task" category)

**Carried from Phase 0 (0f), executed here so it doesn't get lost, not because it
structurally belongs to HE's repository layer.** Today's `event_causality` HE↔DE
linking has no tenant check at all, unlike the singular `disasterEventTable.hazardousEventId`
field which the same code explicitly guards. The fix is a small, standalone patch to
`syncLinkedHazardousEvents` in `app/routes/$lang+/disaster-event+/edit.$id.tsx` — it
does **not** require DE's own Clean Architecture domain module to exist first. If
Disaster Events gets its own Clean Architecture refactor before this phase executes,
this fix moves with it as a prerequisite for that effort's own causality-linking work
instead — whichever lands first.

**Files touched:**

- `app/routes/$lang+/disaster-event+/edit.$id.tsx` (modified — add same-tenant check
  to `syncLinkedHazardousEvents`, mirroring `disasterEventCreate`/`Update`'s existing
  `hazardous_event.cannot_reference_other_tenant` guard for the singular field)

**Test tier:** PGlite integration — a cross-tenant `linkedTriggeringHazardousEventIds`/
`linkedTriggeredHazardousEventIds` submission is rejected, extending the existing
`hazardousEventDisasterEventBoundary.test.ts` from Phase 0's 0f.

---

### 🏁 Phase 5 Gate

`yarn test:run2` fully green. `yarn tsc` clean. All PGlite integration tests for both
modules pass on `dev`, including cross-module resolution (`HazardousEventsModule`
successfully resolving a use case that depends on `ValidationWorkflowModule`'s port).

---

## Phase 6 — Presentation: New Hidden Route + CSV/API ✅ (Pass 3 breakdown complete, 2026-09-01 — execution not started)

Built fresh, not based on `feature/poc-react-aria-hazardous-event` (decided). Single-track — unlike
Phase 3–5, `validation-workflow` has no presentation surface of its own; it's only ever reached
through HE's own routes/controller via its port. Bigger in scope than Notices' equivalent phase
deliberately: Notices' pilot could defer create/edit/delete UI entirely (read-only pilot, no
existing production UI to eventually retire); HE has a real, currently-paused production UI that
Phase 7's cutover needs a full replacement for, not a partial one.

### 🔷 6a — Web Route Adapters: List + Detail

**Branch:** `feature/ca-he-route-adapter-read`

**Intent for `/opsx:propose`:**

```
Add React Router route files under a new, authenticated, direct-URL-only path (no
nav link, per Invariant 2) — list and detail — as thin adapters, matching Notices'
precedent exactly: loaders resolve ListHazardousEventsUseCase/
GetHazardousEventByIdUseCase from the NestJS application context via
getAppContext().get(...), wrap execution in withRequestContext, throw a structured
ErrorResponse (Response.json) for DomainError, return the use case's result directly
(ADR-007 — no envelope). Each route file stays thin; no business logic inline.
```

**Files touched:**

- `app/routes/$lang+/he-preview+/_index.tsx` (new — list; exact hidden path segment
  TBD at spec time, placeholder here)
- `app/routes/$lang+/he-preview+/$id.tsx` (new — detail)

**Test tier:** PGlite integration — call the exported `loader` directly with a mock
`Request`; verify response shape. E2E Playwright for the rendered pages.

---

### 🔷 6b — HazardousEventErrorBoundary

**Branch:** `feature/ca-he-error-boundary`

**Intent for `/opsx:propose`:**

```
Add HazardousEventErrorBoundary in
app/domains/hazardous-events/presentation/HazardousEventErrorBoundary.tsx — mirrors
NoticeErrorBoundary exactly: useRouteError(), narrows on isRouteErrorResponse first,
renders the DomainError message plus a copyable traceId, falls back to a generic
message for a non-Response error. Export as ErrorBoundary from every route in 6a/6c.
```

**Files touched:**

- `app/domains/hazardous-events/presentation/HazardousEventErrorBoundary.tsx` (new)
- route files from 6a/6c (update — add `export { ErrorBoundary }`)

**Test tier:** E2E Playwright — force a `DomainError`; verify the boundary renders
with a visible, copyable trace reference.

---

### 🔷 6c — Web Route Adapters: Create + Edit

**Branch:** `feature/ca-he-route-adapter-write`

**Intent for `/opsx:propose`:**

```
Add create and edit route files (same hidden path family as 6a) — actions resolve
CreateHazardousEventUseCase/UpdateHazardousEventUseCase, submitting the whole form
(including a spatial-footprint change, which UpdateHazardousEvent internally routes
to RecordSpatialObservationUseCase per 4c) as one request, matching today's actual
single-submission UX. Parent-linking UI reuses the picker's existing tenant-scoped
search (0f confirmed this part already works correctly) but now enforces the delete/
link guards via the use case, not ad hoc route logic.
```

**Files touched:**

- `app/routes/$lang+/he-preview+/new.tsx` (new)
- `app/routes/$lang+/he-preview+/edit.$id.tsx` (new)

**Test tier:** PGlite integration — call exported `action` directly for both create
and edit, including a cycle-closing parent (rejected) and a spatial-footprint change
(delegates to `RecordSpatialObservationUseCase`). E2E Playwright for the full form
submission flow.

---

### 🔷 6d — CSV Import/Export Migration

**Branch:** `feature/ca-he-csv-migration`

**Intent for `/opsx:propose`:**

```
Migrate CSV import/export onto CreateHazardousEventUseCase/UpdateHazardousEventUseCase
— countryAccountsId is forced server-side from the uploader's own session before any
use case call, exactly matching the pattern the existing JSON API routes
(add.ts/upsert.ts) already get right (0e's "confirmed safe by contrast" finding) —
not the pattern the legacy CSV handler gets wrong (a function-signature mismatch
that silently drops the session-derived tenant, 0e findings 1–2). No new
observationTime column — CSV always targets the current/latest spatial observation
(resolved open decision #8).
```

**Files touched:**

- `app/routes/$lang+/he-preview+/csv-import.tsx` (new)
- `app/routes/$lang+/he-preview+/csv-export.tsx` (new)

**Test tier:** PGlite integration — direct port of the 0e characterization tests'
attack scenarios (`hazardousEventCsvImportTenant.test.ts`), now asserting the
opposite outcome: a foreign-tenant `countryAccountsId` column in the CSV row is
ignored, not honored.

---

### 🔷 6e — ApiKeyAuthGuard

**Branch:** `feature/ca-he-api-key-auth-guard`

**Intent for `/opsx:propose`:**

```
Add ApiKeyAuthGuard implementing NestJS CanActivate in
app/domains/hazardous-events/presentation/guards/ApiKeyAuthGuard.server.ts —
mirrors SessionAuthGuard's shape (synthesizes a Fetch Request from the X-Auth
header, since apiAuth() expects one) but delegates to the now-fixed apiAuth()
(app/backend.server/models/api_key.ts — this phase's other deliverable, `if
(!key)` corrected to `if (key.length === 0)`) rather than session cookies. Throws
UnauthorizedException for a missing or invalid X-Auth header — both cases now
behave identically, unlike today where only the missing-header case worked.
```

**Files touched:**

- `app/domains/hazardous-events/presentation/guards/ApiKeyAuthGuard.server.ts` (new)
- `app/backend.server/models/api_key.ts` (modified — the `apiAuth` fix itself)

**Test tier:** Unit — a missing `X-Auth` header and an invalid one both reject with
`UnauthorizedException`; a valid one resolves the API key and populates
`countryAccountsId` on the request.

---

### 🔷 6f — `/api/v2/hazardous-events` REST Controller

**Branch:** `feature/ca-hazardous-events-rest-controller`

**Depends on:** 5g (`HazardousEventsModule` wired into DI), 6e (`ApiKeyAuthGuard`)

**Intent for `/opsx:propose`:**

```
Add HazardousEventsController as a NestJS @Controller('hazardous-events') guarded
by ApiKeyAuthGuard (6e) — six endpoints: GET / (ListHazardousEventsUseCase), GET
/:id (GetHazardousEventByIdUseCase), POST / (CreateHazardousEventUseCase), PUT /:id
(UpdateHazardousEventUseCase), DELETE /:id (DeleteHazardousEventUseCase — a
dependent-reference conflict maps to 409, per the unified check from 4f), and POST
/:id/spatial-observations (RecordSpatialObservationUseCase, the endpoint that
actually exposes the optional observationTime field for historical/backfill writes
— resolved open decision #8; a duplicate observationTime without confirmReplace
also maps to 409). countryAccountsId comes from the API key (6e), never the payload
— matching add.ts/upsert.ts's existing, correct pattern, not CSV's broken one.
zod + nestjs-zod for validation (DELTA's established library, matching Notices'
precedent, not class-validator), @nestjs/swagger + patchNestJsSwagger() for OpenAPI
at /api/v2/docs. Response shape per ADR-007 (plain resource on success, no
envelope) — the legacy `{ ok, res: [...] }` shape does not carry over.
```

**Files touched:**

- `app/domains/hazardous-events/presentation/HazardousEventsController.ts` (new)
- `app/domains/hazardous-events/presentation/dto/CreateHazardousEventRequest.ts` (new)
- `app/domains/hazardous-events/presentation/dto/UpdateHazardousEventRequest.ts` (new)
- `app/domains/hazardous-events/presentation/dto/RecordSpatialObservationRequest.ts` (new)
- `app/domains/hazardous-events/presentation/dto/HazardousEventIdParam.ts` (new)
- `app/domains/hazardous-events/infrastructure/HazardousEventsModule.ts` (update — add
  controller)
- `tests/integration/domains/hazardous-events/HazardousEventsController.test.ts` (new)

**Test tier:** Integration — NestJS supertest: each endpoint's happy path and status
code (200/201/204); a spoofed `countryAccountsId` in any payload is discarded, not
honored; `DELETE` on an event with dependents returns 409 with dependent details in
the body; `POST /:id/spatial-observations` with a duplicate `observationTime` and no
`confirmReplace` returns 409; a missing/invalid `X-Auth` header returns 401 for
every endpoint; `/api/v2/docs` serves a valid OpenAPI document.

> **Migration note, not a spec concern:** the known low-volume external customers on
> today's `/api+/hazardous-event+/` routes need advance notice of both the URL and
> response-shape change (resolved open decision #5) before this replaces those
> routes — a rollout/comms task, not part of this intent's own scope.

---

### 🏁 Phase 6 Gate

`yarn test:run2` fully green. `yarn tsc` clean. E2E Playwright passes for the full
web-route lifecycle (list → detail → create → edit). REST API integration tests pass
against PGlite. The new route is reachable only by direct URL, confirmed absent from
any nav component (Invariant 2).

---

## Phase 7 — Sign-off, Cutover, and Cleanup ✅ (Pass 3 breakdown complete, 2026-09-01 — execution not started)

**Depends on both Phase 6's gate and Phase M's sign-off gate** — cutover assumes the new
implementation works end-to-end _and_ the real data behind it is already validated, not that
either happens as part of this phase. Every deletion below follows this project's standing
file-deletion caution: confirm nothing else live still references a file before removing it, don't
assume from a grep alone.

### ⬜ 7a — Sign-off Gate Check

**Scope:** Verify Phase 6's gate (E2E green, REST API integration tests green, new route
confirmed absent from nav) and Phase M's gate (migration validator: zero unresolved
discrepancies on the full dataset, human sign-off recorded) have both actually passed — not
re-run them, just confirm the recorded state — before any irreversible step below proceeds.

---

### ⬜ 7b — Web/Nav Cutover

**Branch:** `feature/ca-he-web-cutover`

**Scope:**

```
Add the new route to primary navigation (it was direct-URL-only per Invariant 2
until now); retire the old web routes (hazardous-event+/edit.$id.tsx, $id.tsx,
new.tsx, csv-import.tsx, the old list page) after confirming no other live feature
imports them.
```

**Files touched:**

- `app/frontend/*` nav component (update — add new route's nav entry, remove old)
- Old `hazardous-event+/*` route files (deleted)

**Test tier:** E2E Playwright — the nav link reaches the new route; the old URLs
either redirect or 404 cleanly, not silently 500.

---

### ⬜ 7c — API Cutover

**Branch:** `feature/ca-he-api-cutover`

**Scope:**

```
Retire the old /api+/hazardous-event+/ routes — gated on confirmation that the
known low-volume external customers (flagged in Phase 6, resolved open decision
#5) have migrated to /api/v2/hazardous-events, not purely mechanical. Coordination
step, not a code change to schedule blindly.
```

**Files touched:**

- Old `api+/hazardous-event+/{add,update,upsert,list,fields,_index,csv-import-example}.ts`
  (deleted)

**Test tier:** Manual/coordination verification (customer confirmation), then a
final check that the old routes are actually gone, not just deprecated in docs.

---

### ⬜ 7d — Dead Code Removal

**Branch:** `feature/ca-he-dead-code-cleanup`

**Scope:**

```
Delete app/backend.server/models/event.ts (the old model layer, now fully
superseded) and app/backend.server/models/event/ (the orphaned split directory —
already confirmed unreachable since Phase 0's cross-cutting finding, this is the
"once the new domain module replaces event.ts itself" moment that finding
explicitly deferred to). Also delete: getRequiredAndSetToNullHipFields/
hip_hazard_picker.ts (resolved open decision #6 — dead once event.ts is gone);
hazardousEventUpdateApprovalStatus (confirmed dead, zero callers, in 0c);
validation_workflow.ts (confirmed dead, part of the same orphaned directory). Also
delete Phase 0's own characterization test files
(tests/integration/db/models/hazardousEvent*.test.ts, 7 files) — their job (pinning
old behavior precisely enough to inform this refactor) is complete; they'd fail to
even import once event.ts is gone, and every finding they produced is already
captured in this roadmap and the audit findings doc, not lost by removing the tests
themselves.
```

**Files touched:**

- `app/backend.server/models/event.ts` (deleted)
- `app/backend.server/models/event/` (deleted, entire directory)
- `app/backend.server/models/hip_hazard_picker.ts` (deleted)
- `app/backend.server/models/validation_workflow.ts` (deleted)
- `tests/integration/db/models/hazardousEvent*.test.ts` (deleted, 7 files)

**Test tier:** `yarn tsc` clean after deletion (confirms nothing else imports the
removed files); `yarn test:run2` green (confirms no other test depended on them).

---

### ⬜ 7e — Schema Cleanup (drops deferred under Invariant 2)

**Branch:** `feature/ca-he-schema-cleanup`

**Scope:**

```
Drop what's now superseded, following the same two-step shape as the disaster-event
assessment normalization precedent (migrate first, drop later, never combined):
hazardousEventTable's old hipHazardId/hipClusterId/hipTypeId columns (replaced by
specificHazardId); the vestigial spatial_footprint jsonb column (found during the
dev sync — already unused before this refactor, unrelated to Phase M's migration,
confirmed safe to drop here); hazardousEventGeomTable/hazardousEventDivisionTable
(replaced by hazardous_event_spatial_observation); the jsonb attachments column
(replaced by the new attachment table). HE's own rows in eventRelationshipTable —
verify no other consumer depends on this table before dropping it entirely, not
just HE's rows, since this check wasn't part of Phase 0's scope.
```

**Files touched:**

- `app/drizzle/migrations/<timestamp>_drop_legacy_hazardous_event_columns.sql` (new)

**Test tier:** `yarn tsc` clean (Drizzle schema types updated to match); PGlite
integration — new implementation's full test suite still green against the
post-drop schema.

---

### 🏁 Phase 7 Gate — Refactor Complete

Old implementation fully retired (web, API, model layer, dead code). Schema cleanup landed.
`yarn test:run2` fully green, `yarn tsc` clean, on `dev`. The new `/api/v2/hazardous-events` and
new web route are the only implementation — no dual-write, no hidden-route flag, Invariant 2's
"expand-only until cutover" constraint no longer applies because cutover has happened.

---

## Dependency graph (phase-level)

```
Phase 0 (behavior audit + characterization tests) ─────┐
Phase 1 (CA scaffold: hazardous-events                  │
         + validation-workflow modules, this branch) ───┼──► Phase 2 (schema — reviewed ✅)
                                                          │        │
                                                          │        ├─────────────────────┐
                                                          │        ▼                     ▼
                                                          └──► Phase 3 (domain      Phase M (data
                                                               entities + ports,     migration: backfill,
                                                               both modules)         validator agent,
                                                                   │                 rollback — runs in
                                                                   ▼                 parallel with 3–6)
                                                              Phase 4 (use cases,        │
                                                                   both modules)         │
                                                                   │                     │
                                                                   ▼                     │
                                                              Phase 5 (repository +      │
                                                                   module wiring)        │
                                                                   │                     │
                                                                   ▼                     │
                                                              Phase 6 (presentation:     │
                                                                   route + CSV/API)      │
                                                                   │                     │
                                                                   ▼                     ▼
                                                              Phase 7 (sign-off, cutover, cleanup)
                                                              — requires BOTH Phase 6 AND Phase M's
                                                                sign-off gate
```

Phase 0 is complete, Phase 2 is no longer blocked (ER diagram reviewed 2026-08-21), and every
decision carried forward from Phase 0 is now resolved (2026-09-01, see below). Phase 3 onward and
Phase M are both unblocked pending only the current PR (`feature/ca-hazardous-events-scaffold` →
`dev`) landing, and can proceed in parallel with each other once it does — Phase M needs only the
schema and existing production data, not Phase 3–6's own output. Pass 3 of this document replaced
each 🧱 stub with a Notices-style intent breakdown (branch, `/opsx:propose` text, files touched,
test tier) for Phases 3–6 and M — note `validation-workflow` and `hazardous-events` are two
separate intent tracks from Phase 3 onward, not one, and Phase M is its own, non-OpenSpec track
alongside both.

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
