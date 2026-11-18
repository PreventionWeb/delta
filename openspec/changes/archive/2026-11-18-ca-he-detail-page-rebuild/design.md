## Context

See proposal.md for motivation. This section is the live, section-by-section ground-truth capture
the roadmap's 6k entry requires ("not pre-resolved" — explicitly not to be assumed from a partial
read). It combines a full read of both components plus live Chrome verification against the
running dev server (`http://localhost:3000`), because reading `HazardousEventReviewStep.tsx` alone
already surfaced places where the rendered page differs from what the JSX literally says (i18n
overrides of fallback text; a data-shape mismatch in Attachments that only showed up by loading
the same record through both routes).

### Ground truth: legacy's `HazardousEventReviewStep.tsx` (904 lines, dev commit `3688c596`)

Read in full at `app/frontend/events/HazardousEventReviewStep.tsx`. Cards render top-to-bottom in
this exact order, each an independent PrimeReact `Card` (`rounded-2xl border border-slate-200
shadow-none`, body padding `18px 20px`):

1. **Basic information** (`pi-info-circle`, `text-blue-600`) — Record originator, Hazardous event
   Status (colored pill: amber=ongoing, emerald=passed, blue=forecasted/other), Magnitude, Data
   source, UUID, Created at, Updated at (only if present). 2-column grid.
2. **Hazard details** (`pi-map-marker`) — Hazard type, Hazard cluster, Specific hazard (name +
   `(code)` + `[nationalName]`, space-joined, filtered for blanks), Start date, End date, then
   conditionally: National specification, Description, Chains explanation (each only if non-empty,
   `whitespace-pre-line`).
3. **Location** (`pi-map-marker`) — always rendered (via `renderSectionCard`, not conditionally
   omitted like legacy's per-field pattern elsewhere). Shows: Geographic levels as pills (from
   `spatialFootprint` entries where `map_option === "Geographic level"`), a bullet list of other
   spatial-footprint titles, and `ReviewLocationMap` — a **live Leaflet map** that lazy-loads
   `leaflet@1.9.4` from unpkg (no local Leaflet dependency), colors geographic-level polygons by a
   fixed 5-color palette keyed by level rank (country=0, admin N, else insertion order), draws
   non-geographic footprints in blue, and fits bounds to all layers. **`ReviewLocationMap` itself
   renders `null` (no `<div>` at all) when there is no geojson data** — the "No location details
   available" empty state (controlled by `divisionPills`/`footprintItems` length, not by whether
   the map has layers) is what actually prints in that case; the two are evaluated independently.
4. **Attachments** (`pi-paperclip`) — a plain HTML `<table>` (not the design-system `Table`), via
   `parseAttachments(item.attachments, item.id, ctx, "event")` imported from
   `~/frontend/disaster-record/DisasterRecordReviewStep`. Columns: Title, Tags (badge pills),
   File/URL (external link with file-type icon + formatted size, or a link icon for URLs).
5. **Linked events** (`pi-link`) — two sub-sections inside one card: "Caused by" (parent,
   `item.parent`) and "Causing" (children, `item.children[]`), each a `LangLink` card to
   `/hazardous-event/:id`. Confirmed via `locales/app/en.json` that the live label text is
   literally **"Caused by"** / **"Causing"** (ids `hazardous_event.caused_by` /
   `hazardous_event.causing`) — this matches the JSX fallback text exactly. This directly
   contradicts the currently-committed `openspec/specs/hazardous-event-view/spec.md` Scenario 2,
   which documents these as "Triggering (caused by)" / "Triggered (causing)". That existing spec
   is stale relative to the live code and the live rendered page; flagged below as a
   to-be-decided item rather than silently corrected here (out of this change's declared
   capabilities).
6. **Audit log history** (`pi-history`) — rendered **only when `auditLogs.length > 0`** (no
   empty-state card at all, unlike every other section). Delegates entirely to
   `~/components/AuditLogHistory`.

No "Add hazardous event caused by this event" button and no raw title/id header exist in this new
component — that chrome lives one level up in `hazardeventform.tsx`, outside this rebuild's scope.

**Correction (2026-11-17, fresh manual-review round — see Decision 11 below):** the paragraph
above is accurate about `HazardousEventReviewStep.tsx` itself, but was effectively read, once CA's
own Edit/add-cause links were later added by a different change, as implying this chrome lived
somewhere else on legacy's page rather than being genuinely absent from the whole page. It is
genuinely absent: `hazardeventform.tsx:679-721`'s `HazardousEventView` wrapper deliberately passes
`hideEditButton={true}` (confirmed to unconditionally suppress Edit in the real `View.tsx:624`, not
the dead-code duplicate at `form/view_main_data_collection.tsx`, which doesn't honor the prop and
is not ground truth), and its own `extraInfo`/`extraActions` slots carry only the Back link, no
add-cause link anywhere. See Decision 11 for the full correction and its consequences for CA's own
page.

**Correction (confirmed during implementation, not assumed):** the original ground-truth capture
above missed the "Record status" pill (`workflowStatus`/DEF-031 approval status). It is not
rendered inside `HazardousEventReviewStep.tsx` at all — confirmed by reading `hazardeventform.tsx`
directly, it is rendered by `ViewComponentMainDataCollection`, the wrapper component one level
above `HazardousEventReviewStep.tsx`, via `approvalStatus={item.approvalStatus}` passed at
`hazardeventform.tsx:686`. It was missed because this design's ground-truth read was scoped to
`HazardousEventReviewStep.tsx` itself, not because the field is absent from legacy's chrome. CA's
current flat `HazardousEventDetailPage.tsx` already renders this field today (line 91, via the
existing `workflowStatusDisplay` helper) under the label "Record status" — distinct from
"Hazardous event status" (the `hazardousEventStatus` ongoing/passed/forecasted field, which *is*
rendered inside `HazardousEventReviewStep.tsx` and was already captured correctly above). The
Basic information Card's field list and `tasks.md` task 4.1 are corrected to include it; no new
helper is needed, since `workflowStatusDisplay` already exists and already works.

### Ground truth: `AuditLogHistory.tsx` (`app/components/AuditLogHistory.tsx`)

Props: `{ ctx: ViewContext; auditLogs: { id: string; action: string; by: string | null;
organization: string | null; timestamp: Date }[] }`. Renders a 5-column HTML table: Action taken,
By, Organisation, Date, Time.

- **`timestamp` must be a real `Date` object**, not a string — the component calls
  `.toDateString()` and `.toTimeString()` directly on it with no parsing/guarding.
- **`action` parsing is fragile and already inconsistent with what gets written today.**
  `translateAuditLogAction` splits on the first space (`"Create hazardous event"` →
  `rawAction="Create"`, `objType="hazardous event"`) and only has cases for `Create`/`Update`/
  `Delete` + a 3-way object-type switch (`disaster event` / `hazardous event` / `disaster
  record`); anything else falls through to returning the raw `action` string unchanged. Confirmed
  by reading the write-side callers on this same branch:
  - `CreateHazardousEvent.ts` writes `action: "Create hazardous event"` — parses correctly.
  - `UpdateHazardousEvent.ts` writes `action: "Update hazardous event"` — parses correctly.
  - `DeleteHazardousEvent.ts` writes `action: "delete"` (lowercase, no object) — does **not**
    match the `Create`/`Update`/`Delete` switch and falls through to the untranslated raw string.
  - `ProcessWorkflowAction.ts` writes the raw workflow action verbatim (`"submit-draft"`,
    `"validate"`, `"publish"`, `"return"`, `"submit-validation"`, `"direct-validate"`,
    `"direct-publish"`) — none of these match either, so they also render untranslated.
  Confirmed live (see below): a real record's audit history shows `"submit-draft"` printed as-is
  next to a correctly-translated `"Update hazardous event"` row.
- **`organization` is never populated.** Legacy's own read query
  (`createViewLoaderPublicApprovedWithAuditLog` in
  `app/backend.server/handlers/form/form.ts`) has the `organization: userTable.organization` line
  commented out — and `userTable` has no `organization` column at all (confirmed by reading
  `app/drizzle/schema/userTable.ts`). The Organisation column is always blank today, confirmed
  live (every row's Organisation cell was empty). This is dead/aspirational, not a column this
  change should try to populate.
- **`by` is `userTable.firstName` only** (not full name), confirmed live ("Test" for the
  `test.admin@india.gov.in` test account, whose first name is "Test").

### Live Chrome verification (record `afa94a20-6f47-4a18-be6a-24a18963d346`, seeded today with
record originator "Side-by-side audit verification - CA")

Loaded both `http://localhost:3000/en/hazardous-event/afa94a20-...` (legacy) and
`http://localhost:3000/en/he-preview/afa94a20-...` (CA's current flat page) for the same record,
logged in as `test.admin@india.gov.in`.

- Legacy's live Audit log history table (4 rows, newest first) actually showed:
  | Action taken | By | Organisation | Date | Time |
  |---|---|---|---|---|
  | submit-draft | Test | (blank) | Thu Nov 12 2026 | 22:01:40 GMT+0530 (India Standard Time) |
  | Update hazardous event | Test | (blank) | Thu Nov 12 2026 | 22:01:40 GMT+0530 (India Standard Time) |
  | submit-draft | Test | (blank) | Thu Nov 12 2026 | 22:00:55 GMT+0530 (India Standard Time) |
  | Create hazardous event | Test | (blank) | Thu Nov 12 2026 | 22:00:55 GMT+0530 (India Standard Time) |

  This confirms the "delete"/workflow-action untranslated-string problem above with a real
  `submit-draft` row, and confirms Date/Time are two separate columns using
  `toDateString()`/`toTimeString()` verbatim (including the full `GMT+0530 (India Standard
  Time)` suffix in Time) — not a formatted/localized date, and not `formatDate()` (the utility the
  rest of the page uses elsewhere).
- Legacy's "Linked events" and "Location" cards both rendered their empty states for this record
  ("No linked hazardous or disaster events selected yet" — confirmed via `locales/app/en.json` id
  `disaster_event.review.no_linked_events`, overriding the JSX fallback text "No linked events";
  "No location details available"). No record in the current dev DB (41 HE records, all `Draft`
  status, spot-checked via the list) had real spatial-footprint geojson, so **the populated-map
  rendering (colored polygons, bounds-fit, tile layer) was verified from code only, not
  live-rendered** — flagged as an open item below rather than assumed.
- **Attachments mismatch, confirmed live, not assumed:** CA's own flat page
  (`/en/he-preview/afa94a20-...`) showed one attachment ("Audit verification attachment",
  `https://example.com/audit-verification`) that legacy's page
  (`/en/hazardous-event/afa94a20-...`) did **not** show ("No attachments selected" on legacy, for
  the same record, loaded moments apart). Reading `app/backend.server/models/event.ts` confirms
  why: legacy still reads/writes attachments as a JSONB `attachments` column directly on
  `hazardous_event` (parsed by `parseAttachments`'s `att.file_option`/`att.tag`/`att.title` shape),
  while CA's attachment shown above comes from the separate shared-attachments-module data path
  (`ca-shared-attachments-module`, already merged on this branch). **These are two independent
  data stores that are out of sync for this record** — not a bug this change should fix (CA's
  attachments pipeline already works and is out of this change's declared scope), but confirms the
  roadmap's existing instruction: do not port legacy's `parseAttachments`/JSONB shape into CA's
  rebuild. Keep CA's existing attachments DTO/mapper; only change how it's visually grouped (into
  a Card, using the existing `Table`/`TableColumn`/`TableCell` components already used on this
  page today).

### Ground truth: CA's current `HazardousEventDetailPage.tsx` (211 lines)

Flat sequence of `<p>`/`<strong>` field rows inside a single `<form className="dts-form">`, no
Card sections at all: back link, Edit/Add-cause links (role-gated), heading, ID, Classification
heading (Type/Cluster/Hazard), Record status pill, National specification, Start/End date (3-col
grid), Description, Chains explanation, Magnitude, Spatial footprint (text only — observation time
+ note, no map), Attachments (already using the design-system `Table`/`TableColumn`/`TableCell` —
confirmed live, this already renders correctly for records that have shared-attachments-module
data), Record originator, Hazardous event status, Data source, Created at, Updated at.

**No "Linked events" section exists at all today**, confirmed by reading the full file and by
reading `HazardousEventDetailDto.ts`/`GetHazardousEventById.ts`: the DTO already carries a `cause`
field (parent only, via `ICausalChainRepository.findCauseEdge()`), but `HazardousEventDetailPage`
never renders it. `GetHazardousEventById` has no equivalent query for child/"causing" events
(legacy's `item.children`) — only `findCauseEdge` (singular, one direction) exists on the
repository port, as of this read. This change adds the missing direction (Decision 8).

### Ground truth: `app/domains/shared/audit-log/application/ports/IAuditLogPort.ts` (6j, already
merged on this branch)

Write-only today: `record(entry: AuditLogEntry, tx?: Tx): Promise<void>`. No read method exists.
`app/db/queries/auditLogsRepository.ts` (the old, non-Clean-Architecture model file) has a
commented-out draft of almost exactly the needed read query — `tableName` + `recordId` +
`countryAccountsId`, left-joined to `userTable`, ordered by `timestamp desc` — a useful shape
reference, not something to uncomment and reuse directly (it predates the port/adapter split and
the live `DrizzleAuditLogAdapter.server.ts`).

## Goals / Non-Goals

**Goals:**
- Rebuild `HazardousEventDetailPage.tsx` into legacy's current Card-sectioned information
  architecture (6 sections, in legacy's order), using this codebase's own design-system
  components, not legacy's PrimeReact markup.
- Add the Audit log history section via a new read-only, tenant-scoped query against the existing
  `audit_logs` table.
- Decide, explicitly and visibly (not silently), how to handle the real data-shape mismatches
  found above: the untranslated-action strings (Decision 4), and resolve the other two fully
  in-scope per user decision: add the missing children/"causing" query (Decision 8) and correct
  the stale existing `hazardous-event-view` spec text (Decision 9).

**Non-Goals:**
- `DEF-057` (spatial-footprint picker/editor widget) — out of scope, already tracked separately.
- Any new write path to `audit_logs` — 6j already covers every write caller.
- Normalizing every past/future audit action string to a translatable format — see Decision 4
  below for the scoped fix this change does make.
- Resolving transitively-reachable effects (grandchildren and beyond) for the Linked events card
  — `findEffectEdges` is deliberately single-hop (Decision 8), matching legacy's own
  `item.children` shape, which is also one level deep.

> **Revision (user decision, 2026-11-12):** the two items below were originally scoped out of
> this change (left as "Open Questions"/explicit gaps) and are now in scope, folded into this
> same change rather than split into separate changes:
> - Resolving "Causing" (child/effect events) for the Linked events card — now built here via a
>   new `findEffectEdges` method (Decision 8).
> - Correcting `hazardous-event-view`'s stale Linked-events label wording — now fixed here via
>   this change's own spec delta (Decision 9), not a separate housekeeping change.

## Decisions

### Decision 1 — New capability `hazardous-event-detail-page`, not a `hazardous-event-view` delta

`hazardous-event-view` specifies legacy's own route/component (confirmed: its Overview names
`app/routes/.../hazardous-event+/$id.tsx` and `HazardousEventView`/`hazardeventform.tsx`
explicitly). CA's page has never had its own capability spec. Rather than overload an
already-stale, legacy-describing spec, this change introduces `hazardous-event-detail-page` as the
spec of record for CA's rebuilt page, written from this design's live ground truth rather than
copied from the (confirmed inaccurate in one place) existing spec.

### Decision 2 — Read port: extend `IAuditLogPort`, not a new port

Add `findByRecord(tableName: string, recordId: string, countryAccountsId: string): Promise<{ id:
string; action: string; actorName: string; timestamp: Date }[]>` to the existing
`IAuditLogPort`/`DrizzleAuditLogAdapter`. Same module, same table, same tenancy rules as the
write side already established by `ca-shared-audit-log` — a second port for the same concern would
duplicate wiring in `SharedAuditLogModule.server.ts` for no benefit. `countryAccountsId` is a
required parameter (not optional), per project convention (every query scoped) and because
`audit_logs.country_accounts_id` is nullable in the schema only for rows written before tenancy was
threaded through (historic data) — the read side should never silently cross tenants even if a
legacy row happens to be null.

### Decision 3 — DTO field name: `auditLog`, shaped for the page, not a raw table mirror

`HazardousEventDetailDto.auditLog: { id: string; action: string; actorName: string; timestamp:
string }[]` — `timestamp` is an ISO string, not `Date` (corrected from this decision's own
original draft): every other date field on this DTO (`createdAt`/`updatedAt`/`submittedAt`) is
already `string`, and sorting happens in SQL (`ORDER BY timestamp DESC` on the real `timestamp
with time zone` column) before the port's result is ever mapped to this DTO, so a string here
costs nothing. `actorName` (not `by`) to avoid committing the DTO to `AuditLogHistory`'s existing
prop-shape quirk (first name only) by name — the page component maps DTO → `AuditLogHistory` props
at render time. No `organization` field on the DTO at all: since it is confirmed never populated
(no column exists), carrying a permanently-empty field through the DTO only invites a future reader
to wonder why it's always blank. The page passes `organization: null` directly to
`AuditLogHistory` without a DTO field for it.

### Decision 4 — Normalize untranslated action strings at the read-query boundary, not in
`AuditLogHistory`

`AuditLogHistory` is a shared component (also used by the disaster-event/disaster-record domains
per its `translateAuditLogAction` object-type switch) — changing its translation logic is a
cross-domain change outside this proposal's declared capabilities. Instead, the new
`GetHazardousEventById` mapping step title-cases/humanizes any action string that isn't already one
of the three `Create <object>`/`Update <object>`/`Delete <object>` forms the component already
handles (e.g. `"submit-draft"` → `"Submit draft"`, `"direct-publish"` → `"Direct publish"|`),
purely as a display fallback so the HE detail page never shows a raw kebab-case string. This does
not touch `DeleteHazardousEvent`'s `"delete"` or `ProcessWorkflowAction`'s write-side values (no
write-path change, matching the proposal's explicit "read-only" scope) and does not change
`AuditLogHistory` itself, so other domains reading the same table are unaffected until they choose
to adopt the same mapping.

### Decision 5 — Location card: live Leaflet map, loaded in the detail page same as legacy

Port `ReviewLocationMap`'s approach (lazy-load `leaflet@1.9.4` from unpkg via the existing
pattern, no new npm dependency) rather than reaching for a design-system map component (none
exists in this codebase today, confirmed by the lack of any map-related entry under
`app/design-system/components/`). This is a read-only view of `currentSpatialObservation`'s
geojson (singular, confirmed from `HazardousEventDetailDto.currentSpatialObservation`) — CA's DTO
already carries only the one current observation, not a full `spatialFootprint[]` history array
like legacy's `item.spatialFootprint`, so the new Location card renders at most one map layer
(today), not legacy's multi-layer/multi-level-color scheme. This is a narrower data shape than
legacy's, not a lesser decision — legacy's multi-layer coloring exists because legacy's model
carries full footprint history; CA's domain model (per `GetHazardousEventById.ts`) resolves only
the current observation. Flagged as an open item below since it means the new map will visually
look like legacy's single-polygon case, never legacy's multi-color case, until/unless CA's domain
model is extended to carry footprint history too (out of scope here).

### Decision 6 — Linked events card: design-system card/link, not PrimeReact

Render both "Caused by" (the existing `cause` DTO field) and "Causing" (the new `effects` DTO
field, Decision 8) using a `Link` (the design-system component CA's page already imports) to
`/he-preview/:id`, matching this page's own existing navigation pattern (not legacy's
`/hazardous-event/:id` route), one linked-event entry per resolved cause/effect. Each entry shows
`displayName` and, when present, `causalityExplanation` — the same fields legacy's own parent/child
cards show (hazard name, code, truncated id), reusing `causeDisplayName`'s existing fallback chain
(`specificHazardName → hazardClusterName → hazardTypeName → ""`) for both directions, since
`GetHazardousEventById` already resolves taxonomy names the same way for `cause` today (Decision 8
extends this to also cover every resolved effect).

### Decision 8 — `findEffectEdges`: a new, single-hop, symmetric method on the existing
causal-chain port

Investigated `ICausalChainRepository.ts` and its Drizzle adapter directly (not assumed). Today it
has: `findReachableEdgesFrom` (transitive, forward, used only for cycle-checks), `saveEdge`,
`replaceCauseEdge`, `countEdgesTouching`, and `findCauseEdge(effectId)` — a single-hop lookup of
the one direct parent edge for a given effect node (`hazardous_event_causality.effect_hazardous_event_id
= effectId`). There is no existing method for the inverse direction (given a node, find its direct
children) — `findReachableEdgesFrom` is the wrong tool because it transitively traverses every hop
forward (needed for cycle detection, not for "direct children only"), and would require filtering
reachable edges back down to depth-1 as a workaround rather than a real one-hop query.

Added `findEffectEdges(causeId: string, tx?: Tx): Promise<readonly { effectId: string;
causalityExplanation: string | null }[]>` — the direct structural inverse of `findCauseEdge`:
same table, same single-hop shape, swapped column (`cause_hazardous_event_id = causeId`), but
returning an array (a cause can have multiple direct effects, unlike `findCauseEdge`'s "at most
one row" invariant from `replaceCauseEdge`'s delete-then-insert shape — nothing enforces a
single-effect invariant on the cause side, nor should it, since one event can cause many).

Name: `findEffectEdges` (plural) mirrors `findCauseEdge` (singular) exactly, substituting the
`cause`/`effect` noun the same way the table's own two FK columns do
(`cause_hazardous_event_id`/`effect_hazardous_event_id`) and the same way `CausalEdge`'s own two
fields do (`causeId`/`effectId`) — not `findChildren`/`findEffectsByCauseId`, which would introduce
a new vocabulary ("children") this port and its domain model (`CausalChain.ts`) never use.

`GetHazardousEventByIdUseCase`'s constructor-injected `causalChainRepository` Pick type widens from
`"findCauseEdge"` to `"findCauseEdge" | "findEffectEdges"`, with both defaulted (`findCauseEdge:
async () => null, findEffectEdges: async () => []`) for the same reason the existing default
exists today — every pre-existing call site that doesn't care about causality keeps compiling
unchanged.

In `execute()`, after resolving `causeEdge`/`causeEvent` (unchanged), resolve `effectEdges =
await findEffectEdges(event.id)`, then resolve each `effectEdges[].effectId` via
`hazardousEventRepository.findById(effectId, tenantId)`, applying the exact same
`NotFoundError`-degrades-gracefully-others-rethrow pattern already used for `causeEvent` — per
record, not per batch, so one dangling effect edge doesn't fail every other resolved effect.
Taxonomy names are fetched for every resolved event's `specificHazardId` in one batched
`findNamesByIds` call (extending the existing array from `[event, cause?]` to `[event, cause?,
...effects]`), not one call per effect — same batching precedent the existing `cause` resolution
already established, just extended to more ids.

Test coverage mirrors `findCauseEdge`'s own existing coverage exactly (per explicit user
instruction): `ICausalChainRepository.test.ts`'s `FakeCausalChainRepository` gets a real
`findEffectEdges` implementation (filter stored edges by `causeId`, return all matches) plus its
own `describe("findEffectEdges")` block; `tests/integration/db/queries/DrizzleCausalChainRepository.test.ts`
gets the matching PGlite-backed `describe("findEffectEdges")` block. (`tests/integration-realdb/.../
DrizzleCausalChainRepository.realdb.test.ts` and `tests/integration/db/models/
hazardousEventCausalChain.test.ts` are not extended — the former is real-DB/`test:run3`, not this
project's primary suite; the latter tests older model-layer cycle/temporal logic unrelated to this
port's own read methods, confirmed by reading its `describe` blocks.)

### Decision 9 — `hazardous-event-view` spec correction folded into this change

Confirmed live (ground truth above) that the real Linked-events sub-labels are "Caused by"/
"Causing", contradicting the currently-committed spec's "Triggering (caused by)"/"Triggered
(causing)". Per explicit user decision, this is fixed here rather than deferred: a
`## MODIFIED Requirements` delta at this change's own `specs/hazardous-event-view/spec.md`,
merged into the main spec at archive time (never hand-edited directly).

One structural wrinkle, surfaced by actually attempting the delta rather than assumed away: the
base spec predates the Requirement/Scenario convention entirely — zero `### Requirement:` headers,
and its scenarios use 3-hash `### Scenario N` headers (the `specs` artifact instructions explicitly
call out 3-hash scenario headers as a silent-failure trap under strict parsing). A `MODIFIED
Requirements` delta has no existing Requirement header to anchor a surgical one-line fix against.
The delta therefore wraps the base spec's existing 4 scenarios, content otherwise unchanged, in one
named `### Requirement: Hazardous Event Harmonized View`, with each scenario promoted to a correct
4-hash header — fixing the label wording and the structural defect together, since fixing only the
wording while leaving the rest of the file unparseable under strict rules would be a half-fix.
Flagged as a task-list verification step (not assumed to merge cleanly): confirm after archive that
the main spec shows one corrected Scenario 2, not a duplicate.

### Decision 7 Addendum — New `app/design-system/components/Card.tsx`, and the Hazard-details dash ambiguity

No design-system `Card` component existed when this change began implementation (confirmed by
reading `app/design-system/components/`: only `Table`/`TableColumn`/`TableRow`/`TableCell`/`Link`/
etc. exist). Added `Card.tsx` there (not inside the hazardous-events domain) per the
design-system-unification-roadmap's explicit plan for HE's Phase 6 ("React Aria instead of
PrimeReact ... building a real reusable design system incrementally, component-by-component, as
each intent needs them") — a plain, accessible `<section>` with a `dts-heading-5`-styled `<h2>`,
Tailwind-utility-styled (`rounded-2xl border border-gray-200 ... shadow-none`) to visually
approximate legacy's PrimeReact `Card`, per this same Decision 7's own "content/structure parity,
not literal component-library parity" bar. Not PrimeReact's own `Card` (Decision 6 already rejects
PrimeReact for this rebuild). DE/DR's own future PrimeReact-`Card` migrations can reuse it.

Resolved during implementation: tasks.md's task 4.3 wording ("conditionally omitted when empty,
per the existing `orDash`/conditional pattern") was self-contradictory — legacy's own new behavior
omits National specification/Description/Chains explanation entirely when empty, while this
page's own existing (already-shipped, already-tested) behavior dashes them. Resolved in favor of
keeping this page's own dash convention: spec `hazardous-event-detail-page`'s "Basic information
and Hazard details sections preserve existing field content" requirement states the rebuild
"SHALL NOT drop any field currently shown on the flat page," which decides this without needing a
new human call — omitting the row when empty would be a literal drop, dashing it is not.

Also resolved: the old flat page's selective bold/plain field-label split (bold from "Record
status" through "Data source", everything else plain) was a human decision for a page with no
real visual grouping. Now that every field lives inside its own bordered Card, that split is
dropped in favor of a uniform `<strong>{label}:</strong> {value}` row for every field in every
Card — simpler, and no design.md decision requires preserving the old split. (Superseded for
Basic information and Hazard details by Decision 10's Fix 3, below, following a later Gate 9
finding that this inline row still diverges from legacy's own stacked block; Location's two
fields are unaffected and keep this uniform inline row.)

### Decision 7 Addendum 2 — Gate 9 live side-by-side result

Compared `/en/hazardous-event/afa94a20-...` (legacy) against `/en/he-preview/afa94a20-...` (CA,
same record) live, logged in as `test.admin@india.gov.in`, after seeding this record with a real
spatial observation (Polygon geojson, via a one-off Drizzle script, deleted after use) and a real
child/effect event (created through CA's own `/he-preview/new?parent=...` write path).

**Matches:** Card order (all 6, exact); Hazard details field set; Audit log 5 columns/newest-first
(including the one real `submit-draft` row, confirming Decision 4's humanizer fires only where
intended); Attachments' 3 columns.

**Fixed this pass (pure layout/emphasis gaps, Decision 7's own checklist items):** Basic
information and Hazard details both now use 2-column grids (`mg-grid mg-grid__col-2`: Basic
information as one grid; Hazard details as two separate grids, one for Type/Cluster and one for
Start/End date, with Specific hazard on its own row — **superseded by Decision 14: this
"Specific hazard on its own row" grouping is itself wrong; legacy's real first grid holds Type,
Cluster, and Specific hazard together, three fields not two. This is where that error was first
introduced, carried forward uncorrected by Decision 13 Fix 2, and only fixed at Decision 14.**) —
this also corrects Hazard details' own earlier `mg-grid__col-3`, which matched a legacy layout
this change's own reference page (the
rewritten `HazardousEventReviewStep.tsx`) had already replaced, so this reverses an earlier
human-verified choice because the reference itself changed, not because the earlier choice was
wrong at the time. Hazardous event status now renders as a colored pill (amber/emerald/blue for
ongoing/passed/other), ported verbatim from `HazardousEventReviewStep.tsx`'s own Tailwind classes,
distinct from the Record status pill.

**Confirmed-by-observation, not a bug:** legacy's Location/Attachments/Linked-events cards are
empty for this record because legacy reads separate data stores (JSONB `spatialFootprint`, JSONB
`attachments`, and its own parent/children linkage) that this change's own CA-side writes never
touch — the same independent-data-store pattern design.md's ground truth already documented for
Attachments, now confirmed live for Location and Linked events too.

**Intentional, spec-decided divergences (not reverted):** per-subsection Linked-events empty
states and the Audit-log-card's own empty-state message (vs. legacy's one combined message /
hidden-card) — spec `hazardous-event-detail-page`'s own Requirements, decided before this Gate;
dash-for-empty on National specification/Description/Chains explanation (vs. legacy's
omit-when-empty) — Decision 7 Addendum, above; Linked-event entries as plain `Link`s rather than
legacy's bordered card-per-entry, and no card header icons — Decision 7's own "content/structure
parity, not literal component-library parity" bar.

**Flagged, not fixed — needs a human call:**
- Legacy's Specific hazard field shows `name (code)` (e.g. "Thunderstorm (MH0103)"); CA's shows
  only the name. `HazardousEventDetailDto` carries no hazard-code field at all, and `hazardLabel()`
  (the shared helper also used by `HazardousEventFormPage`/`HazardousEventListPage`) has no concept
  of one — adding it would mean threading a new field through `GetHazardousEventById`'s taxonomy
  resolution and touching a helper shared by pages outside this change's declared scope. Not fixed
  here; worth its own follow-up.
- Legacy's empty-state copy ("No location details available", "No attachments selected") differs
  from this page's own, already-established, already-tested copy ("No spatial observation
  recorded", "No attachments") — both predate this rebuild. Decision 7's checklist lists exact
  empty-state copy as a parity item, but the two pages read genuinely different data stores for
  these sections (confirmed above), so copying legacy's wording verbatim for a conceptually
  different empty case was judged not worth reopening already-settled, already-tested text
  unilaterally. Flagged here rather than changed.
- The Basic information/Hazard details fields render as inline `Label: value` text, not legacy's
  stacked uppercase-micro-label-over-bold-value block. This predates this rebuild (already an
  established convention on this page, already tested) and is a markedly larger styling change
  than the grid/pill fixes above — flagged rather than undertaken unilaterally as part of this
  Gate.

### Decision 10 — Gate 9 follow-up corrections (2026-11-17, same change, not deferred)

Decision 7 Addendum 2 flagged three items as "needs a human call" rather than fixed in that Gate 9
pass. Per explicit user decision, all three are resolved here, in this same change, not split off
or deferred.

**Fix 1 — Specific hazard taxonomy code.** `specificHazardTable.code` (`specificHazardTable.ts:12`)
already exists and is `notNull()`, but `SpecificHazardTaxonomyNames`
(`ISpecificHazardTaxonomyRepository.ts:2-6`) — the type `findNamesByIds` returns, which
`GetHazardousEventById` actually uses for this page — carried no code field, distinct from
`SpecificHazardOption`, the picker/filter type, which already has `code: string`
(`ISpecificHazardTaxonomyRepository.ts:19-24`). Widened `SpecificHazardTaxonomyNames` with
`specificHazardCode: string` (not nullable — mirrors the DB column's own `notNull()`; a missing
taxonomy row is represented by the surrounding `Map` having no entry at all, same as the three
existing name fields). `DrizzleSpecificHazardTaxonomyRepository.server.ts`'s `findNamesByIds`
select (currently `:30-36`) now also selects `specificHazardTable.code`.
`HazardousEventDetailDto` gets `specificHazardCode: string | null` (null when no taxonomy match,
same pattern as `specificHazardName`/`hazardClusterName`/`hazardTypeName`), populated in
`toHazardousEventDetailDto` from the same `taxonomyNames` lookup already used for those three
fields — no new repository call.

Composition happens on the page, not inside `hazardLabel()` (`hazardLabel.ts`): that helper is
shared with `HazardousEventFormPage`/`HazardousEventListPage` (per its own doc comment, and per
Decision 7 Addendum 2's original flag), and widening its return shape for one caller would ripple
into pages this change does not touch. The page appends `(${code})` to whatever `hazard.text`
already is — local-name override, national-name override, or resolved taxonomy name, whichever
`hazardLabel()` picked — when `!hazard.isFallback && data.specificHazardCode` is truthy; an empty
string is excluded, matching legacy's own truthiness check
(`HazardousEventReviewStep.tsx:427`: `specificHazardCode ? `(${specificHazardCode})` : ""`), and
the raw-id fallback never appends a code, consistent with it already being a data-integrity-gap
display rather than a resolved name.

**Remaining, explicitly out of scope:** legacy also appends `[nationalName]` as a third,
always-present segment to this field (`HazardousEventReviewStep.tsx:428-430`); CA's
`hazardLabel()` already treats `specificHazardNationalName` as an override candidate rather than
a parallel display segment, and reconciling the two display strategies is a `hazardLabel()`-level
decision affecting the Form/List pages too — not undertaken here, flagged for a future pass
alongside `hazardLabel()` itself.

**Fix 2 — Linked-events empty-state wording.** Investigated further than the original Gate 9 flag
(which named only the Location/Attachments empty-copy divergence below, not this one): legacy does
have a per-direction empty state, not only the combined "No linked events" card-level message.
`HazardousEventReviewStep.tsx:848-853` (Caused by) and `:869-875` (Causing) both render
`ctx.t({ code: "common.none", msg: "None" })` when that one direction is empty but the other
direction has data; the combined, card-level "No linked events" message only renders when both
directions are empty (`hasLinkedEvents` false), and is a different message entirely. Confirmed via
`locales/app/en.json`: `common.none` → `"None"` (no live override — the JSX fallback is what
actually renders), while `disaster_event.review.no_linked_events` (the combined, both-empty
message) is overridden to `"No linked hazardous or disaster events selected yet"`.

Decision: keep CA's current wording unchanged — `linked_events.no_cause`: **"No cause recorded"**,
`linked_events.no_effects`: **"No effects recorded"** (`locales/en/hazardous-events.json`, already
present, already asserted by `HazardousEventDetailPage.test.tsx`'s existing `no_cause`/`no_effects`
assertions). A literal copy of legacy's bare "None" for both directions was considered and
rejected: every other empty-state message this page already ships
(`spatial_observation.none`: "No spatial observation recorded", the Attachments empty state,
`audit_log.empty`: "No audit log history recorded") is a full descriptive sentence, never a bare
"None" — introducing one generic word, distinguishable between directions only by its preceding
label, would be a one-off regression against that established tone for the sake of a literal (but
contextually generic) legacy match. This finalizes the previously-flagged gap by decision, backed
by the fuller legacy investigation above, not by a code change — no production or locale file
changes result from this fix; see `tasks.md`'s confirmation-only task.

**Fix 3 — Stacked label/value rendering.** `renderReviewItem` (`HazardousEventReviewStep.tsx:
303-312`) is a small, reusable helper — a `<div className="space-y-1">` with an
uppercase/tracked/small/slate-500 label `<p>` above a 14px/semibold/slate-800 value `<p>`
(`value || "-"` fallback) — not the "much bigger styling change" the original Gate 9 flag
characterized it as. Added a new `ReviewField.tsx` component to
`app/domains/hazardous-events/presentation/web/` (same directory/extraction precedent as
`orDash.ts`/`hazardousEventStatusBadgeClassName.ts`) replicating this exact pattern: `<div
className="space-y-1"><p className="text-[11px] font-semibold uppercase tracking-[0.08em]
text-slate-500">{label}</p><p className="text-[14px] leading-[18px] font-semibold
text-slate-800">{value}</p></div>`. `value` stays typed `ReactNode` (not `string`) — the Record
status/Hazardous event status pills and the raw-id fallback `<span>` are not strings — so
`orDash()` is still called at each plain-string call site exactly as it is today, not duplicated
or folded into the new component; `ReviewField` renders whatever `ReactNode` it is given,
including an already-dashed/pilled value.

Applied to every field in the Basic information and Hazard details Cards (replacing their calls
to the existing inline `Field` helper). **Not applied to the Location Card's two fields**
(Observation time, Note) — the Fix 3 instruction scoped this explicitly to Basic
information/Hazard details; Location keeps its existing inline `Field` rendering unchanged, a
deliberate scope boundary, not a silent omission. The existing `Field` function stays in the file
for Location's two fields only; its doc comment (which currently says this uniform inline row
applies to "every field in every Card") needs correcting during implementation, since it no
longer describes every Card once `ReviewField` ships for the other two.

This supersedes Decision 7 Addendum's "uniform `<strong>{label}:</strong> {value}` row for every
field in every Card" paragraph, for Basic information and Hazard details only.

**Test fallout (named so the red-first task doesn't rediscover it from scratch):**
`HazardousEventDetailPage.test.tsx`'s existing assertions that match literal
`<strong>{label}:</strong> value` HTML (e.g. `"Record originator:</strong> originator"`, the
dash-fallback regexes for Basic information/Hazard details fields, and the Type/Cluster and
Start/End-date 2-column-grid regexes, which scan up to the first `</div>` and will now close
immediately inside each field's own `ReviewField` wrapper div, before reaching the next field) all
assert markup `ReviewField` will not produce, and must be rewritten against the new stacked markup
as part of this fix's own red-first task, not left failing.

**Not reopened by this decision:** Decision 7 Addendum 2's other flagged item — legacy's differing
empty-state copy for Location ("No location details available") and Attachments ("No attachments
selected") vs. this page's own already-shipped, already-tested copy — is a separate divergence
from Fix 2 above (it concerns Location/Attachments, not Linked events) and remains flagged, not
fixed, exactly as Decision 7 Addendum 2 left it; the three fixes resolved by this Decision 10 are
the hazard code, the Linked-events wording, and the stacked field rendering only.

**Fix 4 (2026-11-17 amendment) — Embedded line breaks on National specification, Description, and
Chains explanation.** Confirmed by reading `HazardousEventReviewStep.tsx` directly: lines 622, 635,
and 648 each render these three fields' value as `<p className="text-[14px] leading-relaxed
text-slate-700 whitespace-pre-line">` — the one piece of this change's own ground-truth capture
(`## Context` above, line 23: "`whitespace-pre-line`") that Fix 3's `ReviewField` extraction never
carried over, since `ReviewField`'s value `<p>` has no `whitespace-pre-line` class at all and no
prop to add one. Flagged by Gate 8's code-review re-run (tasks.md 8.8) as a MEDIUM finding and
deferred to a spec delta rather than fixed unilaterally; this amendment is that delta.

Per explicit user decision, this is a per-field opt-in, not a global change to `ReviewField`'s
rendering — every other field using `ReviewField` (10+ call sites, already tested) keeps its
exact current markup and existing test assertions untouched.

Added a new optional prop, `preserveLineBreaks?: boolean` (default/absent `false`), to
`ReviewField`'s props. Name chosen over `preserveWhitespace` because the underlying class is
Tailwind's `whitespace-pre-line`, which preserves line breaks but still collapses runs of spaces
and tabs — `preserveWhitespace` would overstate the behavior (reads like `pre`/`pre-wrap`).
Applied conditionally, appended to the value `<p>`'s existing className only when the prop is
`true` (string concatenation, not a template literal with a trailing space or empty class, so the
`false`/absent case's className stays byte-identical to today's) — since `ReviewField.test.tsx`'s
existing first test asserts the exact serialized HTML including that exact className string.

Wired to `true` at exactly three call sites in `HazardousEventDetailPage.tsx`'s Hazard details
Card (lines 169-180 as of this amendment): National specification, Description, and Chains
explanation. No other call site in Basic information or Hazard details passes this prop.

**Font-weight/color extension (same-day follow-up, same user decision scope):** legacy's own
three `<p>`s for these fields (`HazardousEventReviewStep.tsx` lines 622/635/648) are
`leading-relaxed text-slate-700` with no `font-semibold` — a lighter, non-bold style, distinct
from `ReviewField`'s default value line (`leading-[18px] font-semibold text-slate-800`). Since
this applies to the exact same three fields and the exact same prop, `preserveLineBreaks` now
controls both the whitespace behavior and this styling together: when `true`, the value `<p>`'s
className is `text-[14px] leading-relaxed text-slate-700 whitespace-pre-line` in full (a ternary
over two complete literal strings, not an appended class), matching legacy byte-for-byte; the
`false`/absent case is untouched. No second prop was added. This closes the divergence noted in
the original revision of this amendment as flagged-not-fixed.

### Decision 7 — Reference-source checklist (per role instructions)

Reference-source type: (a) a real, existing, readable page of the same page-type — legacy's
`HazardousEventReviewStep.tsx`, now live at `/en/hazardous-event/:id`. Ground-truth checklist
(content-level, not just wrapper/nav) is the full "Ground truth" section above: Card order (6
cards), field/column sets and order within each, which fields are conditionally omitted vs. always
shown with a dash, the exact empty-state copy per card (sourced from the live locale file, not the
JSX fallback), the map's lazy-load/color/bounds behavior, the Attachments table's 3 columns and
link-vs-file rendering, and the Audit log history table's 5 columns and known blank/untranslated
cells.

Layout wrapper: CA's page already renders inside its own `MainContainer`-equivalent chrome
(confirmed live: `DELTA RESILIENCE` header, breadcrumb-style pink banner, "Back to Hazardous
events" link) — unchanged by this rebuild, matching `hazardous-event-route-adapter`'s existing
"HE route files render inside MainContainer" requirement. Navigation affordance: the existing
"Back to Hazardous events" link plus the role-gated Edit/Add-cause links already present on CA's
page are kept as-is; this change only restructures the content below them into Cards.

**Superseded for the Edit/Add-cause portion by Decision 11, below (2026-11-17):** a fresh
manual-review round found legacy's real current page has neither link; CA's own copies are removed
to match. The Back link and the Cards-restructuring statement in this paragraph remain accurate
and unchanged.

### Decision 11 — Edit and "Add hazardous event caused by this event" links removed from the
detail page (2026-11-17, fresh manual-review correction round)

A fresh, careful manual review (by the human user, not assumed) compared the real current legacy
detail page against CA's rebuild, side-by-side, for record
`afa94a20-6f47-4a18-be6a-24a18963d346` on both `/en/hazardous-event/:id` and `/en/he-preview/:id`,
and found that the earlier Gate 9 visual-parity pass (Decision 7 Addendum 2) was not rigorous
enough: it never re-checked whether legacy's own rebuilt page has an Edit/add-cause affordance at
all, and the original "## Context" ground-truth capture's own wording invited the wrong reading
(corrected above, at its original location).

Confirmed via code, not assumed: legacy's current `HazardousEventView` component
(`app/frontend/events/hazardeventform.tsx:679-721`) passes `hideEditButton={true}` to
`ViewComponentMainDataCollection` (line 693); the real `View.tsx` component this renders through
(`app/frontend/components/data-collection/View.tsx:624`) unconditionally suppresses its Edit link
whenever that prop is true — not the stale, unused duplicate at
`app/frontend/form/view_main_data_collection.tsx`, which does not honor the prop at all and is dead
code, not ground truth. `hazardeventform.tsx`'s own `extraInfo`/`extraActions` slots (the only two
slots `View.tsx` renders extra content through) carry only the "Back to Hazardous events" button —
no add-cause link anywhere on this page. Edit remains reachable from the list page's own row
actions (`hazardeventlist.tsx:238`, `DataCollectionActionLinks`) — it is not removed as a
capability, only from this one page. "Add hazardous event caused by this event" has no equivalent
entry point elsewhere on this page's redesign.

**On "design.md Decision 16":** the code/test comments this round touches
(`HazardousEventDetailPage.tsx`'s now-removed comment, `HazardousEventDetailPage.test.tsx`'s
now-removed describe block, `$id.tsx`'s loader comment) and the merged main spec
`hazardous-event-route-adapter`'s own prose all cite "design.md Decision 16." This change's own
design.md has never had a Decision 16 (confirmed via repo-wide grep: its own numbering runs 1-10,
with a duplicate/out-of-place "Decision 7 Addendum"/"Decision 7 Addendum 2" and no 16 at all). The
real Decision 16 belongs to a different, already-archived change —
`openspec/changes/archive/2026-11-04-ca-he-route-adapter-write/design.md` — which is where the
Edit/add-cause links were originally added. This Decision 11 supersedes that other change's
Decision 16 for this page specifically — the links it introduced are removed here, for the reasons
above — while leaving that other change's own design.md untouched (historical record of a decision
this round reverses, not a document this round edits).

**Scope boundary:** `app/routes/.../he-preview+/new.tsx`'s own `?parent=` query-param handling is
unchanged by this round and still functions if reached directly by URL — it simply has no in-app
link pointing to it from the detail page anymore. This is the intended effect of removing the
link, not an oversight requiring further investigation.

**Spec impact:** this round also reverses three Requirements in the already-merged main spec
`hazardous-event-route-adapter` ("HE detail loader resolves and returns the acting role," "HE
detail page renders an 'Edit' link...," "HE detail page renders an 'Add hazardous event caused by
this event' link...") via this change's own new `specs/hazardous-event-route-adapter/spec.md`
delta — discovered during this round's verification, not anticipated by the original proposal.
Without it, the main spec set would be self-contradictory at archive time: that spec would still
mandate the links while `hazardous-event-detail-page`'s own corrected requirement forbids them. See
`proposal.md`'s updated "Modified Capabilities."

### Decision 12 — Back-link corrected to legacy's real outlined-button rendering, text, and
spacing (2026-11-17, second correction round)

A fresh correction round, scoped by the human user to only the "Back to Hazardous events"
back-link (its text, visual style, and its spacing relative to the title above and the first Card
below — not icons/label mismatches elsewhere, which are later rounds), found via live Chrome
computed-style measurement on both pages for record `afa94a20-6f47-4a18-be6a-24a18963d346` that
Decision 7's original ground-truth capture never looked past "the Back link... [is] kept as-is";
it is not, visually, the same control on both pages today.

Legacy (`app/frontend/events/hazardeventform.tsx:696-710`) renders this as a real PrimeReact
`<Button outlined icon="pi pi-arrow-left" iconPos="left" label="Back to Hazardous events"
className="p-button-sm" .../>`, confirmed live as an outlined button: `display: inline-flex`,
`padding: 9.1875px 15.3125px`, `border: 0.8px solid rgb(59, 130, 246)` (Tailwind blue-500),
`border-radius: 6px`, `color: rgb(59, 130, 246)`, `background-color: transparent`, `font-size:
12.25px`, `font-weight: 400`, with a leading `pi-arrow-left` glyph (`font-size: 12.25px`,
`margin-right: 7px`). Its label text comes from locale code `hazardous_events.back_to_list`.
Measured gap from the button's own bottom edge to the Basic information Card's top edge: **14px**.

CA's current `HazardousEventDetailPage.tsx:44-47` (`<p><Link
href={ctx.url("/he-preview")}>{t("title")}</Link></p>`) renders a plain ghost-style `Link`
(`display: inline`, no padding, no border, `color: rgb(16, 108, 184)`, `font-size: 14px`) whose
text is `t("title")` — the page's own title string ("Hazardous events"), not "Back to Hazardous
events" wording at all. Measured gap to the Basic information Card: **2.6px** — confirming the
user's own complaint that this reads as cramped.

**New locale key: `detail.back_to_list`.** Added to both `locales/en/hazardous-events.json`
("Back to Hazardous events") and `locales/fr/hazardous-events.json` ("Retour aux événements
dangereux"), alongside the existing `detail.edit` key in the same `detail.*` namespace. Replaces
this one call site's use of `t("title")`; the top-level `title` key itself is untouched — still
used elsewhere (page title/breadcrumb chrome).

**New component: `app/domains/hazardous-events/presentation/web/BackLink.tsx`.** Extracted rather
than inlined, consistent with this change's own precedent of extracting small, portable
presentation helpers (`ReviewField.tsx`, `orDash.ts`, `hazardousEventStatusBadgeClassName.ts`).
Props: `{ href: string; label: string }`. Renders the design-system `Link` with a `className`
override — confirmed by reading `Link.tsx:21-41` that passing `className` fully replaces the
component's default ghost `style` rather than merging with it (`style={className ? undefined :
linkStyle}`), so no CSS fight with the design-system default is needed — plus a leading, hand-rolled
inline `<svg aria-hidden="true">` arrow icon. No icon library (lucide/heroicons/react-icons/
@fortawesome/etc.) exists anywhere in this codebase today, confirmed via repo-wide grep; adding one
for a single icon is out of proportion, so the icon is a small inline SVG, not a new dependency.

**Root font-size correction (2026-11-17, mid-task).** An initial drafting pass of this Decision
approximated several of these classes by assuming Tailwind's usual 16px-root rem math (e.g.
`text-xs`/`rounded-md`/`mb-3.5`/`px-4 py-2.5`, treating `0.875rem` as 14px, `0.375rem` as 6px,
etc.). That assumption is wrong for this app: `public/assets/css/style-dts.css:18` sets
`html { font-size: 14px; }` globally (loaded in `app/root.tsx` before every other stylesheet,
confirmed live on CA's own `/he-preview/:id` page too, not legacy-only), so every rem-based
Tailwind class in this codebase resolves at a 14px root, not 16px. Re-verified numerically against
`node_modules/tailwindcss/theme.css` (confirming Tailwind's own default `--radius-md: 0.375rem`,
not a literal px value) before finalizing the class list below — every value here is checked
against the real 14px root, not assumed:
- `rounded-[6px]` — **not** `rounded-md`: Tailwind's default `rounded-md` is `0.375rem`, which at
  this app's real 14px root computes to `5.25px`, not `6px` (confirmed against
  `node_modules/tailwindcss/theme.css:399`). Legacy's own source value is itself a literal
  `border-radius: 6px` (not rem, confirmed in `theme.css:2273` directly), so no rem-based Tailwind
  step can land on it at any root size — an arbitrary literal-px value is the only exact match.
- `border border-blue-500` and `text-blue-500` — Tailwind's default-theme blue-500 is
  `rgb(59, 130, 246)`, an exact match for the measured border/text color (colors are unitless, so
  root font-size is irrelevant here).
- `py-[0.65625rem] px-[1.09375rem]` — **not** `py-2.5 px-4`: legacy's own `.p-button-sm` padding
  source value is `0.65625rem 1.09375rem` (confirmed in `theme.css:2385`), which already resolves
  correctly against this app's shared 14px root to the measured `9.1875px`/`15.3125px` exactly,
  the same way it does on legacy's own page. Using the identical rem value (not a px-based
  approximation, and not the nearest standard spacing step, which doesn't land here) reproduces
  legacy's padding exactly and keeps tracking it if the shared root ever changes. No other
  standard Tailwind spacing step (`py-2.5`=8.75px, `px-4`=14px at this root) matches.
- `text-sm` — **not** `text-xs`: Tailwind's `text-sm` is `0.875rem`, which at this app's 14px root
  is `12.25px` exactly — an exact match for the measured font-size, not an approximation.
  `text-xs` (`0.75rem`) would render `10.5px` here, not `12.25px`.
- `font-normal` — exact match for the measured `font-weight: 400` (unitless, root-independent).
- `bg-transparent` — exact match for the measured `background-color: transparent` (also simply the
  unstyled default).
- `gap-2` between the icon and the label on the flex container — **not** an arbitrary value:
  Tailwind's `gap-2` is `0.5rem`, which at this app's 14px root is `7px` exactly, matching the
  measured `margin-right: 7px` on legacy's icon. No bracket needed once the real root is accounted
  for.
- Icon: `viewBox="0 0 16 16"`, a simple left-pointing arrow path, sized `h-3.5 w-3.5` (`0.875rem` =
  `12.25px` at this root, matching the measured icon font-size exactly — **not** `h-3 w-3`, which
  is `0.75rem` = `10.5px` here), `stroke="currentColor"` so it inherits `text-blue-500` —
  approximates PrimeIcons' `pi-arrow-left` glyph without the dependency.

**Spacing.** The gap between the back-link and the Basic information Card below it moves to
Tailwind's `mb-4` (`1rem`, which at this app's real 14px root is **14px exactly**), applied to the
back-link's own wrapper — replacing the current bare `<p>` wrapper, which produces the measured
~2.6px gap. **Not** `mb-3.5` (an earlier draft of this Decision picked `mb-3.5` by assuming a 16px
root, where `0.875rem` = 14px; at this app's real 14px root, `mb-3.5` renders `12.25px`, 1.75px
short of the target). Defended directly against the measurement, same method as this change's own
Decision 10 gap-6-vs-mg-grid analysis, now corrected for the real root: legacy's measured gap is
14px, and `mb-4` (`1rem`) is the standard-scale step that lands on it exactly at this app's actual
14px root — the adjacent standard steps, `mb-3`=10.5px and `mb-4.5`=15.75px (non-standard anyway),
are both off. No change to the spacing *above* the back-link — that gap is governed by
`MainContainer`, shared with every other page, and is explicitly out of scope for this correction.

**Wiring.** `HazardousEventDetailPage.tsx:44-47`'s existing block is replaced with a single
`<BackLink href={ctx.url("/he-preview")} label={t("detail.back_to_list")} />` call, removing the
now-unused inline `<p><Link>...</Link></p>` wrapper and its `t("title")` call site.

**Scope boundary:** this decision, and the correction round it documents, covers only the
back-link's text, visual style, and its own spacing relative to the title above and the first Card
below — per the human user's explicit scoping. Icon correctness elsewhere on the page, other
label/text mismatches, and any other visual-parity gap are out of scope here and are expected in a
later correction round.

**Element type — kept as a link, not a literal `<button>` (confirmed with the user, 2026-11-17).**
Legacy's real element is a `<button type="button">` with an `onClick` that does
`document.location.href = ctx.url(route)` — a full page reload, not even a client-side navigation,
and not an anchor tag at all. `BackLink` matches legacy's *visual* styling above but renders through
the design-system `Link` (a real `<a href>`, confirmed live), not a `<button>`. This was flagged as
an undocumented implicit choice and then confirmed deliberately: an `<a href>` is the semantically
correct element for a pure navigation action (supports right-click/"open in new tab", shows the
destination on hover, and gets React Router's proper client-side transition instead of a full
reload) — legacy's `<button>` + manual `location.href` reads as its own technical debt, not a
pattern worth replicating. No code change from this note; `BackLink.tsx` already renders this way.

### Decision 13 — Third correction round: card header icons, field-grid spacing, Hazard details
field labels (2026-11-18)

A fresh, careful manual review (by the human user, not assumed) compared the real current legacy
detail page against CA's rebuild, side-by-side, for record
`afa94a20-6f47-4a18-be6a-24a18963d346` on both `/en/hazardous-event/:id` and `/en/he-preview/:id`,
and found three further, independent, already-well-understood gaps, bundled into one round since
no further investigation is needed. All three confirmed against this app's real 14px root
(`public/assets/css/style-dts.css:18`, `html { font-size: 14px; }`), per Decision 12's own method —
cited by literal Tailwind class name wherever possible, never assumed against a 16px root.

**Fix 1 — Card header icons.** Confirmed via literal className reads of
`app/frontend/events/HazardousEventReviewStep.tsx` (not computed styles) that every one of its six
Card headers renders a leading PrimeIcon in the same wrapper shape: `<div className="flex
items-center gap-2 text-slate-800"><i className="pi pi-xxx text-blue-600" />` followed by the
`<h4>` title — Basic information `pi-info-circle` (line 506), Hazard details `pi-map-marker` (line
579), Location `pi-map-marker` (line 662, the same icon reused), Attachments `pi-paperclip` (line
730), Linked events `pi-link` (line 831), Audit log history `pi-history` (line 890). CA's
`app/design-system/components/Card.tsx` has no icon slot at all today (confirmed by reading it: a
plain `<h2>{title}</h2>`, no wrapper, no icon prop) — and confirmed via repo-wide grep that `Card`
has exactly four importers today, all within this same change
(`HazardousEventDetailPage.tsx`, `HazardousEventAttachmentsCard.tsx`,
`HazardousEventLinkedEventsCard.tsx`, `HazardousEventAuditLogCard.tsx`), so widening its props is
safe — no other domain's usage to keep compiling.

Decision already made with the user: reuse PrimeIcons' own CSS classes directly
(`<i className="pi pi-xxx text-blue-600">`), not hand-rolled SVGs — PrimeIcons' font/CSS is already
loaded app-wide (`app/root.tsx:32`, `import "primeicons/primeicons.css"`, confirmed), so this adds
no new dependency and guarantees an exact visual match; redrawing five decorative glyphs by hand
would be unnecessary risk for no benefit. This is a different call from `BackLink`'s own
hand-rolled SVG arrow (Decision 12) — that was a single icon in a brand-new standalone component
with no existing PrimeIcons usage to leverage at that call site's narrower scope; the two decisions
were made independently, at different times, with different information, and are not an
inconsistency to reconcile.

`Card.tsx`'s props widen to `{ title: string; icon?: string; children: ReactNode }`, where `icon`
is the `pi-xxx` suffix (e.g. `"pi-info-circle"`), rendered as `pi ${icon} text-blue-600`. When
`icon` is present, the header renders legacy's exact wrapper (`<div className="flex items-center
gap-2 text-slate-800">` containing the `<i>` then the existing `<h2 id={headingId}
className="dts-heading-5">` title); when absent, the header renders exactly as it does today (bare
`<h2>`, no wrapper) — so `icon` is opt-in and no existing call site's markup changes unless it
passes one. One addition beyond legacy's own markup: the `<i>` gets `aria-hidden="true"` (legacy's
own `<i>` has none) — a decorative glyph next to a text title that already conveys the same
information should not be exposed to assistive tech as unlabelled content; this follows the same
reasoning already applied to `BackLink`'s own decorative SVG (Decision 12), not an unexamined
addition.

Wired at all six render sites: the three Cards rendered directly in
`HazardousEventDetailPage.tsx` (Basic information → `"pi-info-circle"`, Hazard details →
`"pi-map-marker"`, Location → `"pi-map-marker"`) and the three Cards owned by their own extracted
components (confirmed by reading each file: all three — `HazardousEventAttachmentsCard.tsx`,
`HazardousEventLinkedEventsCard.tsx`, `HazardousEventAuditLogCard.tsx` — already render through the
same shared `Card`, none rolls its own header) — Attachments → `"pi-paperclip"`, Linked events →
`"pi-link"`, Audit log history → `"pi-history"`.

**Fix 2 — Field-grid spacing.** Confirmed via literal className reads that legacy's field-grid
wrapper is, at all three of its occurrences in `HazardousEventReviewStep.tsx` (line 514, Basic
information; line 587, Hazard details' first grid; line 604, Hazard details' Start/End-date
pair), the identical literal Tailwind utility string `grid grid-cols-1 gap-6 md:grid-cols-2` —
**correction, Decision 14:** this paragraph's own "Type/Cluster pair" label for line 587's grid
was imprecise, carrying forward the same two-field miscount this round fixes — legacy's line 587
grid actually holds three fields (Type, Cluster, Specific hazard), confirmed by Decision 14's own
re-read. The literal class-string finding itself is unaffected: the same wrapper class applies
regardless of whether that grid holds two fields or three — not
something requiring a custom/ad hoc approximation, contrary to the two existing code comments
directly above CA's Basic information and Hazard details Cards in `HazardousEventDetailPage.tsx`
("Legacy's 2-column grid for this Card; not approximable with ad hoc flex/margin spacing" and
"Legacy pairs these fields in a 2-column grid; not approximable with ad hoc flex/margin spacing" —
both now factually wrong and to be removed, not reworded, since no trade-off remains to explain
once the literal class list is used).

CA's current equivalent, at all three of the same three wrapper divs, is `mg-grid mg-grid__col-2`
— the older, pre-rebuild shared grid system (`public/assets/css/style-dts.css:1738-1770`), whose
`.dts-form .mg-grid` row-gap is `0.57rem` (`7.98px` at this app's real 14px root) and column-gap
`1.14rem` (`15.96px`), both tighter than legacy's `gap-6` (`1.5rem` = `21px` at this app's real
14px root, and not row/column-asymmetric). Fix: replace `mg-grid mg-grid__col-2` with the literal
`grid grid-cols-1 gap-6 md:grid-cols-2` at all three wrapper divs (not two — Hazard details has two
separate paired-field wrappers, Type/Cluster and Start/End date, both affected), and delete the two
stale comments above the Basic information and Hazard details Cards.

**Fix 3 — Hazard details field labels.** CA's Hazard details Card currently labels its Type,
Cluster, and Specific hazard fields from `detail.classification.type`/`cluster`/`hazard`
(`"Type"`/`"Cluster"`/`"Hazard"`) — a leftover namespace from before this page's Card rebuild, under
a different namespace than every other field on this page (`detail.fields.*`). Legacy's current
live-rendered labels for the same three fields are "HAZARD TYPE", "HAZARD CLUSTER", "SPECIFIC
HAZARD" (confirmed live; rendered uppercase by `ReviewField`'s own label styling, same as every
other field on this page — the label strings themselves are the normal-case values below, per
every other field's existing convention on this page). All other field labels on this page already
match legacy and are unaffected.

New keys added under the existing `detail.fields.*` namespace (consistent with every other field on
this page, replacing the `detail.classification.*` call sites): `hazard_type: "Hazard type"`,
`hazard_cluster: "Hazard cluster"`, `specific_hazard: "Specific hazard"` — chosen to reuse this
file's own existing `form.fields.hazard_type`/`hazard_cluster`/`specific_hazard` key names and
English values verbatim (`locales/en/hazardous-events.json:82-84`, already present, already used
by `HazardousEventHazardPicker.tsx`), rather than inventing new wording for the same concept twice
in the same file. For French, the new `detail.fields.*` values reuse the existing
`form.fields.hazard_type`/`hazard_cluster`/`specific_hazard` French translations verbatim
(`locales/fr/hazardous-events.json:82-84`: "Type de danger" / "Groupe de risques" / "Risque
spécifique") for the same reason — consistent wording for the same concept within one locale file,
not a fresh translation.

`detail.classification.type`/`cluster`/`hazard` become unused once the three `ReviewField` call
sites in `HazardousEventDetailPage.tsx`'s Hazard details Card switch to the new keys — confirmed
via repo-wide grep that these three specific keys have no other call site (`detail.classification
.heading` is a separate key, still used by `HazardousEventHazardPicker.tsx:57`, and is not touched).
All three unused keys are removed from both locale files, consistent with this change's own
precedent (task 6a.8 removed `detail.add_cause` the same way, after the same grep-confirmation
step) — not left as dead weight.

**Record status field — confirmed kept, not re-litigated.** The human user was asked during this
round whether CA's "Record status" field (which legacy's current page does not show) should be
removed for parity; confirmed as a deliberate kept CA addition, not a parity bug. No change results
from this question; noted here for the record only.

### Decision 14 — Fourth correction round: Specific-hazard grid placement, per-card content
    spacing, and three further parity gaps (2026-11-18), fixing 6c's own mistake

A real live-Chrome screenshot side-by-side comparison (not DOM/text inspection) against record
`afa94a20-6f47-4a18-be6a-24a18963d346` caught a genuine defect in 6c's own work: zero spacing
between a Card's direct content blocks wherever a Card has more than one, and a Hazard details
field miscount that traces back further than 6c — see the "superseded by Decision 14" notes at
Decision 7 Addendum 2 and Decision 13 Fix 2, above. This is also why a real screenshot comparison,
not just DOM/computed-style inspection, is now a standing project tool investment: Decision 7
Addendum 2's own Gate 9 pass and 6c's own build both read the markup and the computed styles
correctly, and still missed this, because the defect is about which elements are *siblings*
relative to each other, not about any one element's own styling.

**Root cause 1 — the "wrap Card.tsx's children in one shared `space-y-6`" idea from this round's
first draft is wrong.** Confirmed by reading all six of legacy's own Card bodies directly, not
assumed from the two already-documented in Decision 13: legacy does **not** use one uniform
wrapper value.
- **Group A — Basic information (`HazardousEventReviewStep.tsx:498` outer, `:504` inner) and
  Hazard details (`:577`)** each inline their own markup, wrapping the icon/title row and every
  content block together in one `<div className="space-y-6">` (`1.5rem` = `21px` at this app's
  real 14px root, Decision 12's method).
- **Group B — Location (`:657`), Attachments (`:728`), and Linked events (`:826`)** all render
  through the same shared `renderSectionCard` helper (`:314-337`), which wraps the icon/title row
  and content in `<div className="space-y-4">` (`1rem` = `14px`) and, only when the section has
  items, further wraps the content itself in an inner `<div className="space-y-5">` (`1.25rem` =
  `17.5px`) for item-to-item spacing.
- **Audit log history (`:882-901`)** inlines its own markup (not via `renderSectionCard`) but uses
  the same `space-y-4` (`14px`) between the icon/title row and its one child, the
  `AuditLogHistory` table.

A single Card.tsx-level `space-y-6` would overshoot Group B's and Audit log's icon-to-content and
item-to-item spacing (21px where legacy uses 14px/17.5px), and would not reproduce Linked events'
real structure at all (see Root cause 2, below). **Reversed: no change to
`app/design-system/components/Card.tsx` in this round.** Each affected Card gets its own,
locally-scoped fix instead, matching the value its own legacy counterpart actually uses.

- **Basic information: not affected, no fix needed.** Confirmed by reading
  `HazardousEventDetailPage.tsx`'s current markup: this Card has exactly one top-level child (the
  field grid) — there is no sibling pair to space apart. The original draft of this round
  mistakenly listed it as affected; it is not.
- **Hazard details: fix is a local `space-y-6` wrapper around this Card's own content**, written
  directly in `HazardousEventDetailPage.tsx` (not at `Card.tsx`), matching legacy's Group A value.
  After the grid-placement fix below, this Card has five top-level content blocks (grid 1, grid 2,
  and the three conditionally-rendered standalone fields) that need even 21px spacing between
  every consecutive pair.
- **Location: fix is a local `space-y-5` wrapper, applied only in the populated branch**, around
  this Card's three top-level content elements (Observation time `Field`, Note `Field`, map),
  written directly in `HazardousEventDetailPage.tsx`, matching legacy's Group B item-to-item value.
  The empty branch (a single `<p>`) is unaffected, matching legacy's own single-child empty branch.
- **Attachments and Audit log: not affected, no fix needed.** Confirmed by reading both
  `HazardousEventAttachmentsCard.tsx` and `HazardousEventAuditLogCard.tsx`: each renders exactly
  one top-level child in every branch of its own ternary (a single `Table`/`AuditLogHistory`, or a
  single empty-state `<p>`) — there is no sibling pair to space apart in either.
- **Linked events: needs its own internal restructuring, not a spacing wrapper.** See Root cause
  2 and the "Linked events rebuild" sub-decision, below.

**Header-to-content gap — flagged, not fixed, this round.** Legacy's own icon/title-row-to-content
gap is produced by the *same* wrapper that also spaces its content (21px for Group A, 14px for
Group B/Audit log — not one uniform value, same finding as above). CA's `Card.tsx` renders its
header and `{children}` as separate siblings with nothing between them in markup; the only gap
today comes from `.dts-heading-5`'s own `margin-bottom: 0.86rem` (`12.04px` at this app's real
14px root, confirmed in `public/assets/css/style-dts.css:3265-3271`) — roughly 9px short of
Group A's 21px target and roughly 2px short of Group B's 14px target. Both residual gaps are
real, but neither was named by the screenshot comparison that triggered this round, and there is
no single Card.tsx-level value that corrects both groups at once (the same problem as Root cause
1). Left open for a future round or a Gate 9 judgment call on whether either gap is visible enough
to matter; not undertaken unilaterally here.

**CSS-cascade verification note.** `space-y-6`/`space-y-5` are new mechanisms on this page's
multi-item siblings (Hazard details, Location); `space-y-1` is already proven here —
`ReviewField`'s own historical Gate 9 result (tasks.md 8.9) measured its `space-y-1` gap via a
real `getBoundingClientRect` read and confirmed `.dts-form`'s own `p` margins do not override it.
No `.dts-form p` margin rule exists in `style-dts.css` (confirmed by repo-wide grep), so the same
cascade outcome is expected for `space-y-6`/`space-y-5`. Still, this is a new value on this page,
not yet live-verified — Gate 9 for this round must re-confirm it with a real DOM measurement, not
only the new unit-test HTML assertions below.

**Root cause 2 — the Specific-hazard grid miscount (the original brief).** Legacy's real first
Hazard-details grid (`HazardousEventReviewStep.tsx:587-603`) holds **three** fields — Hazard type,
Hazard cluster, and Specific hazard — in one `grid grid-cols-1 gap-6 md:grid-cols-2`. 6c's own
brief described this as a 2-field "Type/Cluster pair" (an error traced back further, to Decision 7
Addendum 2 — see that Decision's own superseded-by note, above), so 6c's implementation pulled
Specific hazard out as a disconnected standalone field between the two grids — with no spacing
around it at all once Root cause 1's zero-gap defect is also accounted for, compounding into the
cramped gap the screenshot comparison caught.

**Fix:** move the Specific-hazard `ReviewField` back into the first grid div, as the third item
after Hazard cluster, matching legacy's exact structure. CSS grid auto-placement handles the
resulting 3-items-in-2-columns layout the same way legacy's own grid does (row 1: Type, Cluster;
row 2: Specific hazard, alone) — no extra markup needed for the uneven row.

### Linked events rebuild (Findings 4-6 below are presentation/DTO gaps found during this same
    round's deeper legacy read, folded in here per explicit instruction rather than split off)

**Finding 6 — bordered "linked record" card, not a bare inline link.** Legacy's
`renderLinkedCard` (`HazardousEventReviewStep.tsx:460-495`) renders each resolved cause/effect as
its own small card: a bordered `<div className="flex items-center justify-between rounded-xl
border border-slate-200 bg-white p-4 shadow-none">` containing a bold blue title link and a
subtitle line composed as `"HIP: {code}" • "{description, only when it differs from the title}" •
"UUID: {first 8 chars}"`, joined with `" • "`, empty parts omitted. Title fallback chain: resolved
hazard name → raw description → `"Hazardous Event: {id8}"`.

**Checked for a hard data gap, per explicit instruction — found none.** `GetHazardousEventById.ts`
already resolves everything this subtitle needs, in memory, at the exact point `cause`/`effects`
are constructed (`:152-171`): `taxonomyNames.get(causeEvent.specificHazardId)?.specificHazardCode`
/ `...effectEvent...` (the same batched `findNamesByIds` lookup Decision 10 Fix 1 already widened
with `specificHazardCode`, just not yet read here) and `causeEvent.description` /
`effectEvent.description` (both full `HazardousEvent` domain objects already carry a `description`
getter, `HazardousEvent.ts:404`). No new repository call, no new query — this is DTO widening plus
page-side composition, the same low-risk pattern as Decision 10 Fix 1 itself, not the "real,
additional backend scope" it could have been.

**Fix:** add `specificHazardCode: string | null` and `description: string` to both `cause` and
`effects` on `HazardousEventDetailDto` (parallel fields, same two objects, no new top-level DTO
field), and populate them at `GetHazardousEventById.ts:152-171` from the values already in scope
there. `HazardousEventLinkedEventsCard.tsx` composes, per entry: a title (`displayName ||
description || `${t("detail.linked_events.unresolved_event")}: ${id.slice(0, 8)}`)`) and a
subtitle built the same way legacy's own `.filter(Boolean).join(" • ")` does, from up to three
parts — `HIP: {specificHazardCode}` (omitted when null/empty), `description` (omitted when it
equals the title, i.e. when `displayName` was empty and `description` became the title instead —
mirrors legacy's own `evDesc && evHazard` condition), and `UUID: {id.slice(0, 8)}` (always
present) — each rendered inside the new bordered-card wrapper. **New locale keys**, not legacy's
own raw, untranslated `"HIP: "`/`"UUID: "` prefixes (confirmed in legacy's own source: plain
template-literal string concatenation, never through `ctx.t()`) — this page's own established
convention routes every visible string through `t()` (every other field/label on this page does),
so literal-copying legacy's one unconverted spot would be a one-off inconsistency, not a deliberate
match worth keeping. New keys: `detail.linked_events.hip_label` ("HIP"), `.uuid_label` ("UUID"),
`.unresolved_event` ("Hazardous event") — en/fr, added alongside the existing
`detail.linked_events.*` keys. `causalityExplanation` (CA's own addition; legacy's card has no
concept of it) renders as its own line beneath the subtitle, inside the same bordered card, not
appended into the subtitle string — kept visually distinguishable as CA's own addition, not folded
into the legacy-matching subtitle recipe. The existing `<ul>`/`<li>` wrapper for multiple effects
stays (an existing test guard, `HazardousEventDetailPage.test.tsx:798-799`, already asserts this
Card legitimately renders a `<ul>`) — only each `<li>`'s/the `cause` entry's own inner markup
changes, from a bare `Link` to the new bordered-card markup.

**Internal grouping/spacing, folded in here since it's the same component.** Legacy's own Linked
events content (`:836-878`) is **not** a flat list of siblings: it is `<div
className="space-y-4">` containing two `<div className="space-y-2">` groups, one for "Caused by" +
its value, one for "Causing" + its value(s) — each group's own label stays tightly bound to its
own content (`7px`), with a wider gap only between the two groups (`14px`). CA's current
`HazardousEventLinkedEventsCard.tsx` renders 3 flat `<p>`/`<p>`/`{<p>|<ul>}` siblings with no such
grouping — restructure it into the same two nested groups (wrap "Caused by" + its rendered entry
in one `<div>`, "Causing" + its rendered entry/entries in another, with the narrower gap inside
each group and the wider gap between the two groups), rather than relying on any outer uniform
wrapper (Root cause 1 already rejects that approach generically). The existing `<ul>` wrapper for
multiple effects also carries `space-y-2`, matching legacy's own item-to-item gap for the "Causing"
group (a review finding against the first draft, which left multiple effect cards flush).

**Test fallout, named so the red-first tasks don't rediscover it from scratch.** `cause: {...}`/
`effects: [{...}]` object literals missing the two new fields will fail `tsc` once they become
required (mirroring Decision 10 Fix 1's own precedent): confirmed at
`GetHazardousEventById.test.ts` (4 literal sites, ~lines 761-762, 792-793, 922-923, 998),
`HazardousEventDetailDto.test.ts` (2 literal sites, ~lines 186-187, 210-211), and
`HazardousEventDetailPage.test.tsx` (2 literal sites, ~lines 949-952, 984-993 — `makeDetail`'s own
`cause: null, effects: []` defaults at ~lines 162-163 are unaffected, since `null`/`[]` need no new
fields). `HazardousEventDetailPage.test.tsx`'s existing "renders a link to the cause event's own
detail page..." and "renders one link per resolved effect..." tests (~lines 944-1007) assert a
bare `<a href=...>` and `toContain` on `displayName`/`causalityExplanation` text — these still pass
structurally once the new bordered-card markup wraps the same `<a>`/text (the assertions are
substring/regex checks, not full-markup matches), but must be re-run and re-confirmed, not assumed,
once the restructuring lands; new assertions are needed for the bordered-card wrapper, the
subtitle, and the title fallback specifically, since nothing today checks for those.

**Finding 4 — Attachment tags render as plain text, not styled pills.** Legacy
(`HazardousEventReviewStep.tsx:761-774`) renders each tag as its own `<span className="inline-flex
items-center rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">{tag}</span>`,
in a `flex flex-wrap gap-1.5` container; falls back to a plain dash `<span>` when there are no
tags. CA's `HazardousEventAttachmentsCard.tsx` currently does `attachment.tag.map(t =>
t.name).join(", ")` — plain comma-joined text. **No data gap**: `attachment.tag` (`{id, name}[] |
null`) is the exact same field CA already consumes, just rendered differently. Fix: render each
`tag.name` as its own pill span, matching legacy's exact classes; keep CA's own existing `"—"`
empty-tags fallback (not legacy's `"-"`) — consistent with this page's own established em-dash
convention elsewhere (`orDash.ts`), not a reason to introduce a second, inconsistent dash style for
one cell.

**Finding 5 — Attachment File/URL column has no type icon or file size.** Legacy
(`:776-807`, helpers `getFileIconClass`/`formatFileSize` at `:261-292`) renders, for a link: the
URL text plus a trailing `pi-external-link` icon; for a file: a leading extension-keyed icon
(`pi-file-pdf`/`pi-file-word`/`pi-file-excel`/`pi-file`/`pi-image`/`pi-volume-up`/`pi-video`,
default `pi-file`), the file name, and — only when `fileSize > 0` — a trailing `"(123 KB)"`-style
suffix. **No data gap**: `HazardousEventAttachmentProps` already carries `type: "File" | "Link"`,
`fileSize: number | null`, and `fileName`/`url` (`HazardousEvent.ts:54-64`), and
`HazardousEventAttachmentsCard.tsx` already has the full `attachment` object in scope when mapping
each row (not just `attachmentLink`'s narrower `{href, label}`). Fix: two new small, local,
CA-side helpers — `getFileIconClass`-equivalent (extension → PrimeIcon class, same seven buckets)
and `formatFileSize`-equivalent (byte count → "123 KB"-style string, same binary-unit logic) —
each with its own unit test, not imported from `app/frontend/...` (this change's own established
boundary: small presentation helpers get a local CA equivalent, e.g. `ReviewField`/`BackLink`/
`hazardousEventStatusBadgeClassName`, never a cross-boundary import from legacy frontend code).
Explicitly **not** touching the Link branch's URL text itself: legacy's `displayUrl` is computed
inside `parseAttachments` (the legacy JSONB attachment parser this change has never ported, per
the ground-truth section above and Decision 6's own boundary) — CA's existing, already-shipped,
already-tested `attachmentLink.ts` already supplies the Link-branch label as the raw `url`, and
that stays unchanged; only the trailing external-link icon is new for that branch. `fileSize:
null` (not just `<= 0`) must also render no size suffix — `formatFileSize`'s "0 B"-on-non-positive
fallback is for legacy's own `number`-typed field; CA's `fileSize` is `number | null`, so the
call site guards `typeof fileSize === "number" && fileSize > 0` before calling the helper at all,
rather than passing `null` into a function typed to expect a number. The File/Link anchor also
carries `inline-flex items-center gap-2` (File) / `gap-1.5` (Link), matching legacy's own anchor
classes — a review finding against the first draft, which left the icon/filename/size touching
with no gap.

**Refactor-phase extractions (SOLID review finding, not a behaviour change).** `GetHazardousEventById.ts`'s
near-duplicate `cause`/`effects` object construction was collapsed into one private
`toLinkedEventSummary` helper; `HazardousEventAttachmentsCard.tsx`'s growing File/Link branching
was extracted into a module-level `AttachmentLinkCellContent` component. Both are the same
recipe as before, just named and de-duplicated.

Not acted on: the existing, still-open Decision 7 Addendum 2 item (Location/Attachments empty-state
copy differing from legacy's own wording) — not reopened by this Decision. The header-to-content
gap named here is closed by Decision 15, Fix 1 Part B.

**Mutation testing (6d.25) — skipped per a standing user decision, not a tooling judgment call.**
Skipped per a standing user decision for the whole `ca-he-detail-page-rebuild` change (relayed by
the coordinator 2026-11-18; not previously recorded in this change's artifacts before now) — 6d is
not a special case. Two earlier attempts this round were aborted before producing a mutation
report; no score exists. Rely on the Vitest coverage recorded in tasks.md 6d.1-6d.24 instead -- not
all of it was RED-first in the strict sense (6d.3/6d.5 were confirmed red only by reverting after
implementation, and 6d.7's new assertions never went red at runtime, since the DTO already passed
`cause`/`effects` through unchanged before the type widened).

### Decision 15 — Fifth correction round (6e): icon alignment, Card shadow, Record-status field
    order, Linked-events label wording, attachment link styling, a shared "cozy" table-padding
    convention, and the Audit log table rebuild (2026-11-18)

A large, bundled round, independently investigated and verified by the orchestrator against real
source code and live DOM measurements before hand-off to this spec-writing pass — findings taken
as given, not re-derived; this Decision records the resulting design choices and the two points
genuinely left open for human sign-off (Fix 1's header-to-content gap restoration, and Fix 8's
Date/Time format pick).

**Fix 1 — Card header icon vertical alignment, in two parts.**

*Part A (the literal brief): title size.* `Card.tsx`'s title currently renders through the shared
`dts-heading-5` class, whose `line-height` becomes `1.75` at ≥1164px (`public/assets/css/
style-dts.css:3265-3278`, confirmed by direct read) — a line-box tall enough that, inside the
header's `flex items-center` row, the icon (a tight, single-line glyph) no longer centers visually
against it. Legacy never uses `dts-heading-5` for any Card title (confirmed: every one of its six
Card titles is a literal, non-`dts-*` Tailwind string) — it uses two fixed groups, the same two
groups Decision 14 already established for content spacing: Basic information (`:506-513`) and
Hazard details (`:579-586`) use `text-[16px] leading-[16px] font-semibold`; Location (via
`renderSectionCard`, `:328`), Attachments (`:328`, same helper), Linked events (`:328`, same
helper), and Audit log history (`:891`) use `text-[18px] leading-[24px] font-semibold`.

Fix: widen `CardProps` with `titleSize?: "sm" | "lg"` (default `"lg"` — the more common group, 4 of
6 cards). `"sm"` renders `text-[16px] leading-[16px] font-semibold`; `"lg"` renders
`text-[18px] leading-[24px] font-semibold`. This fully retires `dts-heading-5` from `Card.tsx` —
even the default case no longer uses it, since every real caller will explicitly set `titleSize`
and no other importer exists today (confirmed: `Card` has exactly four importers, all within this
change). Wired: Basic information and Hazard details get `titleSize="sm"`; Location,
`HazardousEventAttachmentsCard`, `HazardousEventLinkedEventsCard`, and `HazardousEventAuditLogCard`
get `titleSize="lg"`.

*Part B (a consequence the brief doesn't mention, flagged for human sign-off before this part is
built): the header-to-content gap.* `dts-heading-5`'s `margin-bottom: 0.86rem` (`12.04px` at this
app's real 14px root) is, today, the *only* spacing between a Card's header row and its content —
Decision 14 already found this and left it explicitly open ("Left open for a future round or a
Gate 9 judgment call"). Part A's fix removes that class entirely, which also removes that margin —
without a replacement, every Card's header would render flush against its content (a `0px` gap),
a visible regression nobody asked for and worse than today's imperfect-but-nonzero gap.

Recommended default (implemented by this round's tasks, pending human confirmation at this
round's own Gate 9 pass): bind the header-to-content gap to the same `titleSize` groups Decision 14
already measured for content-to-content spacing — `"sm"` (Basic information/Hazard details) gets
legacy's `21px` (`mb-6`, `1.5rem` at this app's real 14px root), `"lg"` (the other four) gets
legacy's `14px` (`mb-4`, `1rem`) — both exactly the same scale Decision 14 already used for
`space-y-6`/`space-y-4`, and the same root-font method Decision 12 established (`mb-4` = `14px`
exactly, already proven live by the back-link). This closes Decision 14's long-open item as a side
effect, using values already verified rather than new ones. Applied as a `margin-bottom` utility on
the header wrapper (the icon+title row, since every real caller passes `icon`); the bare,
no-`icon`, no-wrapper branch is unused by any current caller and is left untouched to avoid
widening scope into unexercised code. **Resolved (human sign-off, 2026-11-18): accepted as specified above** — Part B is built per the
recommended default; Decision 14's own "header-to-content gap" open item is closed by this, not
left open.

**Fix 2 — Card missing depth/shadow.** Legacy's `Card` is PrimeReact's own component; `.p-card`'s
real `box-shadow` (`public/assets/themes/lara-light-blue/theme.css:4438-4443`:
`0 2px 1px -1px rgba(0,0,0,0.2), 0 1px 1px 0 rgba(0,0,0,0.14), 0 1px 3px 0 rgba(0,0,0,0.12)`) wins
over legacy's own `shadow-none` Tailwind class in practice (confirmed live) — the same
cascade-order effect this change has already relied on elsewhere (Decision 13's own citation of
source-order between the theme `<link>` and Tailwind's utility layer). CA's `Card.tsx` is a plain
`<section>`, no PrimeReact import, so its own `shadow-none` has real, undefeated effect — no shadow
at all today. Fix: replace `shadow-none` in `Card.tsx`'s className with
`shadow-[0_2px_1px_-1px_rgba(0,0,0,0.2),0_1px_1px_0_rgba(0,0,0,0.14),0_1px_3px_0_rgba(0,0,0,0.12)]`,
reproducing the same box-shadow exactly. Scoped to `Card.tsx` only — the Linked events entry's own
`shadow-none` (`HazardousEventLinkedEventsCard.tsx`'s bordered-card wrapper) is correct as-is and
untouched: legacy's own `renderLinkedCard` wrapper is a plain `<div>`, never a PrimeReact `Card`,
so it never had a theme box-shadow to lose in the first place.

**Fix 3 — "Record status" field position.** CA's Basic information Card inserts "Record status"
(a deliberate, user-confirmed CA-only addition — not a parity bug, per Decision 13's own
"confirmed kept, not re-litigated" note) as the 3rd field of 8
(`HazardousEventDetailPage.tsx:77-89`, between Hazardous event status and Magnitude). In the
2-column grid, every field from Magnitude onward therefore lands in a different grid cell than
legacy's own 7-field layout (confirmed live via `getBoundingClientRect`: legacy's row 2 is
Magnitude\|Data source; CA's row 2 is Record status\|Magnitude). Fix: move the "Record status"
`ReviewField` block to the end of the sequence, after Updated at — a pure reorder of the existing
JSX blocks within the same grid `<div>`, no markup change. **Correction:** Basic information has 8
fields (the 7 legacy fields plus Record status), not 9 — the reorder places Record status beside
Updated at (row 4, column 2), not alone in its own final row; the other seven fields land in
legacy's exact grid cells, which is the parity property this fix actually delivers. The main spec's
"Basic information and Hazard
details sections preserve existing field content" Requirement (not previously touched by this
change's own delta, only by the main spec) is amended in this change's own spec delta to reflect
the corrected order.

**Fix 4 — "Caused by"/"Causing" label styling.** `HazardousEventLinkedEventsCard.tsx` currently
renders `<p><strong>{label}:</strong></p>` — a colon, bold via a generic `<strong>`. Legacy
(`HazardousEventReviewStep.tsx:839-844`, `:859-864`) renders
`<p className="text-[13px] font-semibold text-slate-700">{label}</p>` — no colon, a specific
text-size/color pairing, not a generic `<strong>`. Fix: match legacy's exact label markup for both
"Caused by" and "Causing", inside the same two-group structure Decision 14 already built (this
fix only touches the label `<p>`, not the grouping/spacing Decision 14 already resolved). **Not
reopened by this fix:** legacy's own empty-state text under each label uses a different style
still (`text-[13px] italic text-slate-400`, vs. this page's own established empty-state styling) —
flagged, consistent with Decision 10's own closing note on empty-state copy, not fixed here.

**Fix 5 — Attachment link styling.** `AttachmentLinkCellContent`'s two `<a>` tags
(`HazardousEventAttachmentsCard.tsx`) carry only layout classes (`inline-flex items-center
gap-1.5`/`gap-2`) — no text styling. Legacy (`HazardousEventReviewStep.tsx:782-799`) uses
`text-sm font-medium text-blue-700 hover:text-blue-800 hover:underline` on both anchor variants.
Fix: append these four classes to both anchors' existing `className`, alongside their existing
layout classes (not replacing them).

**Fix 6 — `attachmentLink.ts` scheme allowlist (defense in depth, Gate 10 LOW finding).**
`attachmentLink.ts`'s Link-type branch passes a user-entered `attachment.url` straight into
`href`. React 19.2.7 (confirmed in `package.json`) already blocks `javascript:` hrefs at render,
so severity is low, but since this file is already touched this round (Fix 5 is adjacent), add a
minimal allowlist. Scoped to the Link branch only — the File branch's `href` is always built from
`urlFn()` + the record's own `fileKey`, an app-controlled path, never user input, and is left
untouched.

`AttachmentLink.href` widens from `string` to `string | undefined`. A new local helper resolves the
Link branch's `href`: parse `attachment.url` with `new URL(...)` (catching a thrown error for a
relative or malformed string, which is never a valid absolute attachment URL) and accept only
`http:`/`https:` protocols (case-insensitively, since `URL.protocol` is already lower-cased by the
URL parser); anything else resolves to `undefined`. The attachment's `label` (the raw URL text)
still renders unchanged either way, so the user can see what was entered even when it isn't
rendered as a live link — only the `href` is withheld. `AttachmentLinkCellContent`'s Link-branch
anchor renders `href={link.href}` as before; when `undefined`, React omits the attribute entirely
(the "omitting the href" option named in the brief), which is simpler and safer than inventing a
synthetic non-navigating href value like `"#"` (which would still navigate to the top of the
current page). The File branch's `AttachmentLink` construction is unaffected by the type
widening — it always supplies a real string.

**Fix 7 — Shared "cozy" padding convention for Attachments and the new Audit log table.** Read
`TableCell.tsx`/`TableColumn.tsx`/`Table.tsx` directly before deciding: both `TableCell` and
`TableColumn` apply their padding via an inline `style` object (`padding: "var(--spacing-dts-
cell-padding)"`, `0.57rem` = `7.98px`), not a `className`. A plain `px-3 py-2` `className` cannot
override this: inline styles always win over stylesheet rules regardless of specificity or source
order, and — independently — this app's own `.dts-table th, .dts-table td { padding: 0.57rem; ...
}` rule (`public/assets/css/style-dts.css:3139-3143`, unlayered, applied via `Table.tsx`'s own
`dts-table` className on every table) has higher specificity (`0,1,1`, one class + one type
selector) than a bare utility class (`0,1,0`) in any case — the same cascade-order hazard this
change has already hit twice (legacy's own `shadow-none`, this Decision's own Fix 2). A `className`
escape hatch genuinely cannot express this fix; a new style-based variant is required, not merely
preferred.

Added `padding?: "token" | "cozy"` to both `TableCellProps` and `TableColumnProps`. `"token"`
(the default) keeps today's exact style object, byte-identical for every existing caller —
confirmed via repo-wide grep that `TableCell`/`TableColumn` have exactly two real callers today,
`HazardousEventAttachmentsCard.tsx` and `HazardousEventListPage.tsx`, so this default-preserving
requirement is a real backward-compatibility constraint, not a formality. `"cozy"` renders
`padding: "0.5rem 0.75rem"` (the literal rem values of Tailwind's `py-2`/`px-3` — chosen over a
px-literal specifically because the earlier root-font-size correction (Decision 12) showed
rem-based values track this app's real 14px root automatically, which a px literal would not) and
`height: "auto"` (the same mechanism `compact`'s existing `height: "auto"` override already uses,
for the same reason: `.dts-table th/td`'s own `height: 3.86rem` rule is equally unlayered and must
be beaten the same way). `"cozy"` is independent of the existing `compact` prop (which only
concerns row height) — callers should pass `padding="cozy"` alone; passing both is harmless (both
set the same `height: "auto"`) but redundant, and this round's own call sites never combine them.

Wired at every `TableColumn`/`TableCell` in `HazardousEventAttachmentsCard.tsx` (replacing
`compact`) and at every one in the new Audit log table built below (Fix 8) — one shared mechanism,
not two independently-styled tables, per explicit user instruction.

**Fix 8 — Audit log table rebuild: CA's own table, no longer `~/components/AuditLogHistory`.**
`HazardousEventAuditLogCard.tsx` currently imports the cross-domain `AuditLogHistory` (also used by
legacy's own HE page and by DE/DR — confirmed via repo-wide grep of its four importers). Per
explicit user decision, this one card stops using it, rendering its own table on the same
`Table`/`TableColumn`/`TableRow`/`TableCell` design, `padding="cozy"` (Fix 7), with the same 5
columns (Action taken, By, Organisation, Date, Time — already spec'd) and the same empty-state
behavior (unchanged). `app/components/AuditLogHistory.tsx` itself is not touched — DE/DR's own
future use is unaffected.

*The critical functional-preservation requirement.* `AuditLogHistory.tsx` does two things, not
just rendering: it also translates `Create <object>`/`Update <object>`/`Delete <object>`-shaped
action strings via its own `translateAuditLogAction` (e.g. `"Create hazardous event"` → the
French-translated form, via `ctx.t()`). `humanizeAuditAction.ts`'s own doc comment confirms CA's
current pipeline is deliberately built assuming this: it leaves exactly these three shapes
*verbatim* (untranslated English) specifically so `AuditLogHistory`'s own switch could translate
them downstream. Dropping `AuditLogHistory` without replacing this would silently break French
translation for the two action strings this domain actually writes (`CreateHazardousEvent.ts:235`:
`"Create hazardous event"`; `UpdateHazardousEvent.ts:321`: `"Update hazardous event"` — confirmed
by reading both write sites directly; `DeleteHazardousEvent.ts:154` writes bare `"delete"`, which
`humanizeAuditAction` already turns into `"Delete"` before this translation step would ever see
it, so no live `"Delete hazardous event"` string exists today — the Delete case is still ported,
for symmetry with the existing regex/switch and in case the write-side value ever changes to
match, not because it is observed live).

`humanizeAuditAction.ts` is application-layer (`app/domains/hazardous-events/application/`), run
server-side inside `GetHazardousEventById`, with no access to `react-i18next` — it cannot host a
`t()`-based translation step, and must not gain one (a Clean Architecture boundary, not a style
preference). The translation therefore belongs in a new presentation-layer helper,
`app/domains/hazardous-events/presentation/web/translateAuditLogAction.ts`, exporting
`translateAuditLogAction(action: string, t: TFunction<"hazardous-events">): string`: if `action`
matches `/^(Create|Update|Delete) hazardous event$/`, return
`t(`detail.audit_log.actions.${create|update|delete}`, { obj: t("detail.audit_log
.object_hazardous_event") })`; otherwise return `action` unchanged (covers both the already-
humanized fallback strings like `"Submit draft"` and the as-yet-unmatched `"Delete"` case above).
Called once per row inside `HazardousEventAuditLogCard.tsx`, which already has its own
`useTranslation("hazardous-events")`.

**New locale keys**, confirmed via grep that no equivalent react-i18next namespace already carries
this translation (only the legacy `ctx.t()` system, `locales/app/{en,fr}.json`, has it) — reusing
*that* system's own existing values verbatim rather than inventing new wording, the same precedent
as Decision 13's `detail.fields.*` reuse of `form.fields.*`:

| New key | en (from legacy `audit_log.*`) | fr (from legacy `audit_log.*`) |
|---|---|---|
| `detail.audit_log.columns.action_taken` | "Action taken" | "Mesures prises" |
| `detail.audit_log.columns.by` | "By" | "Par" |
| `detail.audit_log.columns.organisation` | "Organisation" | "Organisation" |
| `detail.audit_log.columns.date` | "Date" | "Date" |
| `detail.audit_log.columns.time` | "Time" | "L'heure" |
| `detail.audit_log.actions.create` | "Create {{obj}}" | "Créer {{obj}}" |
| `detail.audit_log.actions.update` | "Update {{obj}}" | "Mise à jour {{obj}}" |
| `detail.audit_log.actions.delete` | "Delete {{obj}}" | "Supprimer {{obj}}" |
| `detail.audit_log.object_hazardous_event` | "hazardous event" | "événement dangereux" |

(`{{obj}}`, i18next's own interpolation syntax, replacing legacy's `{obj}`; the object key is
stored already-lowercased, matching legacy's own `.toLowerCase()` call at the one call site that
needs it, rather than re-deriving it from the already-capitalized `hazardous_event` key at
runtime.) `detail.audit_log.columns.*` are new table-header strings, independent of
`detail.audit_log.empty` (kept, unchanged).

*Flagged for human confirmation, not decided here — Date/Time rendering.* `AuditLogHistory` renders
`timestamp.toDateString()`/`.toTimeString()` verbatim (confirmed live, e.g. `"Thu Nov 12 2026"` /
`"22:01:40 GMT+0530 (India Standard Time)"`) — English-only, fixed-format, and dependent on the
rendering host's own time zone (a real SSR/hydration mismatch risk, since server and client can
differ). This page's own established date convention, `formatDate()` (`app/utils/date.ts`), is
different in kind, not just format: it returns a bare ISO date string (`"2026-11-12"`) with *no*
time component at all — there is no existing `formatTime()`-equivalent anywhere in this codebase
to pair with it for the Time column. Adopting `formatDate()` for Date would therefore require
inventing a new time-formatting function from scratch, not simply swapping a call. This is a real,
visible-output decision, not a style nit — explicitly not decided here, per the same "flag rather
than decide silently" standard this change has already applied to Decision 10's Fix 2 and Decision
7's empty-state-copy items.

**Resolved (human sign-off, 2026-11-18): keep `toDateString()`/`toTimeString()` as-is**, the
lower-risk provisional default this round's tasks were already written against — a zero-visible-
change carry-over, and the existing test assertions already assert exactly this output.

**Pre-existing `fr` gap, fixed as part of this round.** `locales/fr/hazardous-events.json` had no
`detail.attachments_table.*` key at all (`en` had it; `fr` jumped from `linked_events` straight to
`audit_log`) — confirmed by reading both files directly, and predating this round and this change.
Per explicit human resolution, fixed here rather than left flagged: added, reusing legacy's own
established terms rather than inventing new wording (confirmed via `locales/app/fr.json`) —
`Fichier/URL` from `attachments.file_or_url`, and `Tags` (kept as the English loanword, not
"Étiquettes") from `common.tags`; `Titre` for the title column follows this app's own existing
generic usage (`locales/fr/notices.json`'s `title`), since legacy has no attachments-specific
"Title" translation to reuse.

**Stale cross-references corrected (documentation only, no behavior change).**
`humanizeAuditAction.ts`'s doc comment ("Already-translatable by AuditLogHistory's own
translateAuditLogAction -- left verbatim so its existing Create/Update/Delete-object switch still
applies") and `HazardousEventDetailDto.ts`'s `auditLog` field doc comment both describe a
downstream dependency on `AuditLogHistory` that no longer exists once this Card stops importing
it; both corrected to point at the new `translateAuditLogAction.ts` instead.
`HazardousEventDetailPage.test.tsx:9`'s comment ("AuditLogHistory also reads it via ctx.t") is
corrected the same way. **Decisions 3 and 4, above, are superseded by this Decision** for the one
specific claim that the DTO's `auditLog.action` value is left untranslated "so `AuditLogHistory`'s
own translation still applies" — that downstream consumer no longer exists; `humanizeAuditAction`
itself is otherwise unchanged (still the read-side, locale-agnostic fallback humanizer), and
Decision 4's own scope boundary (no write-path change) is unaffected.

## Risks / Trade-offs

- [Risk] A future reviewer expects pixel-identical parity with legacy's PrimeReact `Card` styling
  → Mitigation: Decision 7's checklist plus the roadmap's own explicit instruction (reuse
  design-system `Table`/`TableColumn`/`TableCell`, not legacy's markup verbatim) is the agreed
  parity bar — content and structure parity, not literal component-library parity. Gate 9 checks
  against this checklist, not a legacy screenshot diff.
- [Risk] The populated-map case (multiple colored geographic-level polygons) was never
  live-verified (no such record exists in the current dev DB) → Mitigation: flagged as an open
  item; implementer should construct one fixture/manual record with real geojson before Gate 9
  sign-off, specifically to verify the single-layer case this change actually ships (Decision 5).
- [Risk] `findByRecord`'s humanized-action fallback (Decision 4) could drift from
  `AuditLogHistory`'s own translation logic if that component is later extended to handle more
  action types, producing double-humanization or inconsistent casing → Mitigation: the mapping
  only fires for strings that don't already match `AuditLogHistory`'s known
  `Create/Update/Delete <object>` forms; if `AuditLogHistory` later adds workflow-action cases,
  this mapping becomes a no-op for those strings rather than conflicting, since both would need to
  agree on the same literal string to collide.
- [Risk] `userTable.firstName`-only "By" column was a legacy quirk, not a deliberate design choice
  → Mitigation: kept as-is for Gate 9 parity (Decision 3); not something this change decides to
  "fix" unilaterally, since it would diverge from the named reference source without the human
  having asked for that specific change.
- [Risk] Resolving each effect event one-by-one (Decision 8) is an N+1 query pattern when a record
  has many direct effects → Mitigation: matches the existing `cause` resolution's own pattern
  exactly (one `findById` per resolved edge); causal chains are capped and small in practice
  (`CAUSAL_CHAIN_TRAVERSAL_CAP = 500` bounds the whole graph, and direct effects of one node are
  typically far fewer); not a new pattern this change introduces, just extended from one call to
  a small, bounded loop of calls.

## Migration Plan

No DB migration. Deploy is a normal presentation + read-query change: the new `findByRecord`
method ships alongside the existing `record()` on the same adapter/module; `GetHazardousEventById`
starts calling it; the page starts rendering the new Card. Rollback is a plain revert — no data
written, no schema touched.

### Decision 16 — Sixth correction round (6f): Card-to-Card gap, Card inner padding (2026-11-18)

Two further, narrow gaps already found and flagged by Decision 15's own Gate 9 pass (task 8.9,
"real, pre-existing structural-parity gaps found, flagged, not fixed" — neither one of Decision
15's own 8 fixes) — resolved here, already confirmed via source read and live screenshot by the
orchestrator before this round's own spec-writing pass, not re-derived.

**Fix 1 — Card-to-Card gap.** Legacy wraps all six Cards in one outer `<div
className="space-y-6">` (`HazardousEventReviewStep.tsx:498`, `1.5rem` = `21px` at this app's real
14px root, Decision 12's method). CA's `HazardousEventDetailPage.tsx` has no such wrapper; each
Card instead carries only `Card.tsx`'s own `mb-4` (`1rem` = `14px`) margin-bottom — about 7px
short of legacy's real value, confirmed by Decision 15's own Gate 9 finding.

Fix: wrap the six Card-rendering elements (the three `<Card>` usages directly in
`HazardousEventDetailPage.tsx` — Basic information, Hazard details, Location — plus the three
Card-owning extracted components, `HazardousEventAttachmentsCard`/`HazardousEventLinkedEventsCard`/
`HazardousEventAuditLogCard`) in a new `<div className="space-y-6">`, placed immediately below the
existing, separate back-link `<div className="mb-4">` wrapper (Decision 12). That back-link
wrapper is untouched by this fix — it governs only the back-link-to-first-Card gap, a distinct,
already-correct 14px gap from an earlier round, not the Card-to-Card gap this fix addresses.

**The `mb-4`/`space-y-6` interaction, resolved: remove `Card.tsx`'s own `mb-4` entirely, don't let
it coexist with the new wrapper.** Tailwind's `space-y-6` sets `margin-top: 1.5rem` on every child
but the first (via a `> * + *` sibling selector) — it does not touch `margin-bottom` on any
child. If `Card.tsx`'s own `mb-4` (`margin-bottom`) stayed in place alongside the new wrapper, two
problems would follow, not one: every middle gap would carry both an earlier Card's trailing
`margin-bottom` and a later Card's leading `margin-top` from the wrapper — two block-level
sibling margins, which collapse per ordinary CSS margin-collapsing rules rather than literally
summing, so the visible gap would likely still read as the larger single value (`21px`) rather
than `35px`; but depending on margin-collapsing to silently absorb a leftover, no-longer-needed
authored margin is exactly the kind of fragile, unintended-cancellation styling Decision 14 (Root
cause 1) already rejected once, for a different pair of values, and should not be relied on here
either — and the last Card (Audit log history) would keep a trailing `mb-4` with no sibling below
it to collapse against at all, a real, visible trailing gap with no purpose. Resolution:
`Card.tsx`'s `mb-4` is removed outright from its `<section>` className. The new outer `space-y-6`
wrapper becomes the single, sole source of Card-to-Card spacing; `Card.tsx` itself carries no
margin of its own, so there is nothing left to stack or collapse against.

This fix is kept at the page level (`HazardousEventDetailPage.tsx`'s own new wrapper), not pushed
into `Card.tsx` itself, even though legacy's own value is uniform across all six Cards (confirmed
at `HazardousEventReviewStep.tsx:498`, one `space-y-6` wrapping all six — unlike Decision 14's Root
cause 1, which rejected a shared `Card.tsx`-level wrapper specifically because legacy uses
*different* values per Card group there). The reason is the same one that already put the
back-link's own `mb-4` wrapper at the page level in Decision 12: `Card.tsx` has no way to know
whether a future caller (DE/DR's own planned PrimeReact-`Card` migrations, per Decision 7's
addendum) wants this specific page's six-Card sequencing baked into the component itself. The page,
which already owns the six-Card sequence and the back-link's own separate wrapper, is the correct
owner of this spacing decision too.

Confirmed safe to remove `mb-4` from `Card.tsx` outright, not merely superseded in this one case,
by re-checking Decision 13's own importer count: `Card` has exactly four importers today, all
within this same change (`HazardousEventDetailPage.tsx` and the three Card-owning extracted
components) — no call site outside this change depends on `Card.tsx`'s own margin.

**Fix 2 — Card inner padding.** `Card.tsx` uses a uniform `p-5` (`1.25rem` = `17.5px` at this
app's real 14px root) on all four sides. Legacy's own inline body-padding override is `padding:
"18px 20px"` (`HazardousEventReviewStep.tsx:502`, `:575`, and every other legacy Card usage) —
asymmetric, and literal pixel values, not rem-based, so this app's real-14px-vs-assumed-16px-root
distinction (which the rest of this change has had to correct for repeatedly since Decision 12)
does not apply here at all: `18px`/`20px` mean exactly that, regardless of root font-size.

~~Fix: replace `p-5` with `px-[20px] py-[18px]` (Tailwind arbitrary-value utilities) on `Card.tsx`'s
`<section>` className — `20px` left/right, `18px` top/bottom, matching legacy's literal values
exactly.~~ **Superseded below (6g correction) — `.p-card-body`'s inline override is not the only
padding layer; the value above is wrong.**

**6g correction (2026-11-18): the `padding: "18px 20px"` read above was incomplete, not wrong in
kind but wrong in total.** Found by this round's own Gate 9 pass (task 8.9's 6f entry) and already
fully investigated and confirmed there before this correction was written — not re-derived here.
Legacy's `.p-card-body` (the element carrying the inline `padding: "18px 20px"` override cited
above) nests `.p-card-content` inside it (`.p-card > .p-card-body > .p-card-content > {children}`),
and `.p-card-content` carries its own, unconditional PrimeReact theme-default padding — `padding:
1.25rem 0` (confirmed directly in `public/assets/themes/lara-light-blue/theme.css:4457-4459`;
`1.25rem` = `17.5px` top/bottom only, `0` left/right). These two layers stack, they do not override
each other, so legacy's real total rendered padding is the sum of both layers per axis, not
`.p-card-body`'s inline value alone. Confirmed live via `getBoundingClientRect` on record
`6dd4e2db-b429-4a95-ab4e-28309269edcd`: **~20px horizontal** (20px body + 0px content) and
**~35.5-36px vertical** (18px body + 17.5px content) — the opposite asymmetry from what Decision 16
originally specified and this round's code currently renders (more horizontal than vertical); the
real legacy total is more vertical than horizontal.

**Corrected fix:** replace `p-5` with `px-[20px] py-[36px]` (Tailwind arbitrary-value utilities) on
`Card.tsx`'s `<section>` className — `20px` left/right (unaffected by this correction — the
horizontal stack was already right: `20px` + `0px` = `20px`), `36px` top/bottom (the real stacked
vertical total, `35.5px` rounded to a clean value, per user decision 2026-11-18). This follows this
change's own established precedent for an exact, non-scale-step legacy value expressed as a literal
arbitrary-value class rather than approximated by the nearest standard spacing step, the same choice
already made for `ReviewField.tsx`'s `text-[14px]`/`text-[11px]` and `BackLink.tsx`'s
`rounded-[6px]` (Decision 12).

**Scope boundary.** Neither fix touches the header-to-content gap (the icon wrapper's own
`mb-6`/`mb-4`, Decision 15 Fix 1 Part B, already resolved and unaffected — a different element's
margin from the `<section>`-level `mb-4` Fix 1 removes here) or either affected Card's own internal
content-to-content spacing (Decision 14's `space-y-6`/`space-y-5` wrappers inside Hazard
details/Location, both independent of, and unaffected by, the new outer Card-to-Card wrapper or
the padding change). Neither fix changes `Card.tsx`'s shadow (Decision 15 Fix 2) or title-size
classes (Decision 15 Fix 1 Part A).

## Open Questions

None remaining that would change the specs, approach, or task breakdown. Both items originally
raised here (the `hazardous-event-view` wording correction, and whether to resolve "Causing") were
resolved by explicit user decision on 2026-11-12 and are now built into Decisions 8/9 above and
into Non-Goals' revision note, not deferred.
