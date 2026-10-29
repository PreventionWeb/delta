## Context

See proposal.md "Why" for motivation and "Open decisions" for the four items needing human
confirmation before `/opsx:apply`. This document assumes the recommended defaults there unless
the human overrides them during review.

**Live-DOM verification not performed for this design pass.** `6a`'s own history shows several
rounds of its design being corrected only after live-DOM inspection (computed styles, DOM
structure) against the real legacy page — source-reading alone missed things (e.g. the `mg-grid
mg-grid__col-3` date-gap producer). This design pass is **source-read only**: no local dev server
was running when this change was drafted (checked directly, not assumed — `curl` to
`localhost:3000`/`localhost:4000` both failed to connect), and the spec-writer role does not run
`yarn dev`. Every CSS value below is taken directly from `public/assets/css/style-dts.css` and
`app/frontend/events/hazardevent-filters.tsx`'s own JSX, not guessed. **Tasks.md's own Task 0
requires the implementer to verify every layout/spacing value below against the real rendered
legacy filter bar before building the new one**, the same discipline `6a` eventually converged on.

`hazardevent-filters.tsx` (594 lines, read in full) and `hazardevent.ts` (the legacy loader/query
handler, read in full) are the two source-of-truth files for every behavior described below.

**Reference page (required per this project's own spec-writer agent definition for any change
touching `app/domains/*/presentation/` or a route's rendered output).** This change does not add a
new page or a new page-type — it adds filtering to the one list page `6a` already built
(`app/domains/hazardous-events/presentation/HazardousEventListPage.tsx`, rendered by
`app/routes/$lang+/_authenticated+/he-preview+/_index.tsx`). That same page is therefore its own
reference: (a) **layout wrapper** — `MainContainer`, per the `hazardous-event-route-adapter`
spec's existing "renders inside MainContainer" requirement, unchanged by this intent (no task in
this change touches the route file's `MainContainer` wrapping). (b) **Navigation affordance** — a
list page needs a way to reach its own detail page; `6a` already solved this (each row's UUID
cell and Actions-cell view-icon both link to `/he-preview/${id}`, per the `hazardous-event-route-
adapter` spec's "list page provides a way to reach each event's detail page" requirement) — this
change adds no new row content and does not touch that affordance.

## Goals / Non-Goals

**Goals:**

- Match the legacy filter bar's field set, layout, and interaction behavior closely enough that
  Gate 9 (visual/UX parity) passes without a reactive correction round — this change's primary
  mandate (see tasks.md's UI acceptance criteria for the concrete, checkable specification).
- Filter correctly against the CA schema as it actually exists today (taxonomy via
  `specific_hazard`, record status via `workflow_instance`), not the legacy `hip_*`/`approvalStatus`
  columns the CA write path doesn't populate.
- Keep the layering split: presentation parses/validates the URL into a typed object; the use
  case forwards it unchanged; the repository is the only layer producing real SQL.
- Add four new, logic-free, reusable design-system primitives, same reuse bar as `6a`'s five.

**Non-Goals:**

- `DEF-014` full Pass-1 token extraction (see proposal.md).
- A real "assigned validator" concept for `pendingMyAction`'s second branch (Open Decision 2,
  confirmed; deferred as `DEF-049`).
- Legacy parity for `recordingOrganization`'s match semantics — Open Decision 3 is confirmed as a
  deliberate `ILIKE` partial-match UX improvement over legacy's own exact-match behavior, not a
  bug-for-bug port (see Decision 5, rewritten).
- A visible `search` input, or an `ILIKE`-based free-text search over legacy's hidden
  multi-column `search` field — see Decision 9 (unrelated to `recordingOrganization`'s own,
  separately-confirmed `ILIKE` match above).
- Any change to the legacy `hazardevent-filters.tsx`/`hazardevent.ts` files themselves.

## Decisions

### Decision 1 — Taxonomy filters: `specificHazardId` chain, not `hip_*`; new URL param names

Legacy filters on `hazardousEventTable.hipTypeId`/`hipClusterId`/`hipHazardId` — columns that
still physically exist on the table (confirmed by reading `hazardousEventTable.ts`) but that the
CA write path **never populates** for a new (`6c`-created) record (confirmed: `HazardousEvent.ts`
and `DrizzleHazardousEventRepository.toRow()` carry no `hip*` field at all). Filtering on `hip_*`
would silently exclude every future CA-created event from any hazard-type/cluster/specific-hazard
filter result — not a rare edge case, a guaranteed-every-time gap, and the exact same reasoning
`6a`'s own Decision 7 already used to move hazard-_name resolution_ off the `hip_*` chain onto
`specificHazardId` → `specific_hazard` → `hazard_cluster` → `hazard_type`.

**This filter uses that same chain, not `hip_*`.** `specificHazardId` is a direct equality against
`hazardousEventTable.specificHazardId` (no join needed — the column already exists on the table).
`hazardClusterId`/`hazardTypeId` need a join/`EXISTS` through `specific_hazard` (and, for type, one
hop further through `hazard_cluster`), since `hazardousEventTable` has no direct column for either.

**New URL param names, not `hipTypeId`/`hipClusterId`/`hipHazardId`.** Those names' _values_ in the
new schema are `hazard_type`/`hazard_cluster`/`specific_hazard` UUIDs, not `hip_type`/`hip_cluster`/
`hip_hazard` ids — reusing the old names would be misleading to anyone reading a URL or the query
object. New names: `hazardTypeId`, `hazardClusterId`, `specificHazardId` (matching the DTO field
name already established by `6a`'s own `hazardLabel.ts`/DTOs).

**Combobox search matches `specific_hazard.code`, not `hazard.id`.** Legacy's own combobox
search also matches against `hazard.id` (the hip hazard's own primary key) as a fallback to
name-matching — meaningful there because legacy ids are short, human-assigned-looking codes.
Verified directly: in the new schema, `specific_hazard.id` is a UUID (`"No DB default: ids are
deterministic hashes of legacy source refs"` — `specificHazardTable.ts`'s own comment), not a
human-readable code; `specific_hazard.code` (a real `text` column, confirmed present) is the
correct analog of what legacy's `hazard.id` search was actually useful for. The new combobox
matches name OR `code`, substituting `code` for the old `id`-as-fallback-search behavior.

**New port method, not a new `IHazardousEventRepository` method, and full preload, not a search
endpoint — CONFIRMED, not open.** Legacy's own `dataForHazardPicker` preloads all three tables
(`hip_type`/`hip_cluster`/`hip_hazard`) in one shot, with every bit of cascading/filtering done
client-side. The equivalent CA decision (preload `hazard_type`/`hazard_cluster`/`specific_hazard`
in one shot vs. a real server-search endpoint) is settled by a fact already proven **in the
migration SQL itself**, not by querying a live DB: `20261009042834_migrate_hips_with_multi_
language_support_and_fixed_hipsUUID.sql` (read in full) contains a hard migration-time assertion —
`IF ... (SELECT count(*) FROM public.specific_hazard) <> (SELECT count(*) FROM public.hip_hazard)
... THEN RAISE EXCEPTION 'Migration validation failed: source/target counts differ.'` — proving
`specific_hazard`'s row count is, and is guaranteed to remain, **exactly** `hip_hazard`'s own row
count (the migration would have failed to apply otherwise, and the two tables only grow in lockstep
from this one migration, which is the sole populator of `specific_hazard`). Legacy's own
`dataForHazardPicker` already preloads the entire `hip_hazard` table today with no reported
performance concern; preloading its exact row-for-row equivalent carries the identical cost
profile. **This removes any row-count uncertainty — full preload is the confirmed design, not an
option gated on an implementation-time check.** The same migration also drops and recreates
`hips_version` from empty, inserting exactly one row (`'2025'`) — confirmed by reading the same
file (`DROP TABLE IF EXISTS public.hips_version` near the top, followed by a single-row insert
with its own "`RAISE EXCEPTION 'Expected exactly one HIPs version...'`" assertion) — so no
version-scoping logic is needed on the new preload method either.

Browse data for the cascading combobox belongs on `ISpecificHazardTaxonomyRepository` as a sibling
collaborator, mirroring `6a`'s own reasoning for why `findNamesByIds` isn't a method on
`IHazardousEventRepository`: adding it there would force every one of that port's existing fakes
to implement an unrelated browse concern. **One method, not three** — `listAll()`, shaped exactly
like legacy's own `HipDataForHazardPicker` return value, not a per-dimension
`listHazardTypes`/`listHazardClusters`/`searchSpecificHazards` split (an earlier draft of this
design proposed three separate methods under a server-search assumption that no longer applies;
one preload call needs one method):

```ts
// app/domains/hazardous-events/application/ports/ISpecificHazardTaxonomyRepository.ts (additions)
export interface HazardTypeOption {
	id: string;
	name: string;
}
export interface HazardClusterOption {
	id: string;
	typeId: string;
	name: string;
}
export interface SpecificHazardOption {
	id: string;
	clusterId: string;
	name: string;
	code: string;
}
export interface HazardTaxonomyOptions {
	types: HazardTypeOption[];
	clusters: HazardClusterOption[];
	specificHazards: SpecificHazardOption[];
}

export interface ISpecificHazardTaxonomyRepository {
	findNamesByIds(
		ids: readonly string[],
	): Promise<ReadonlyMap<string, SpecificHazardTaxonomyNames>>; // existing

	/** Every type/cluster/specific-hazard row, each sorted by name — mirrors legacy's own
	 * dataForHazardPicker exactly (one preload, all client-side filtering downstream). No tenant
	 * filter (global taxonomy, confirmed no countryAccountsId column on any of the three tables). */
	listAll(): Promise<HazardTaxonomyOptions>;
}
```

**New use case, called by the loader alongside `ListHazardousEventsUseCase`, not instead of it.**
Per the established thin-loader rule, the loader does not call a repository port directly —
`GetHazardTaxonomyOptionsUseCase.execute(): Promise<HazardTaxonomyOptions>` is a new, minimal use
case (no input, wraps `listAll()`, no tenant/auth logic of its own — the taxonomy is global, and
the loader's own existing `ViewData` check already gates the whole request) resolved via
`getAppContext().get(...)` exactly like the two use cases `6a` already calls. The list loader
calls both this and `ListHazardousEventsUseCase.execute(...)` (via `Promise.all`, same pattern
`ListHazardousEventsUseCase` itself already uses internally) and returns both in its own loader
data — see the `hazardous-event-route-adapter` spec delta's new return-shape requirement.

### Decision 2 — Record status: `workflow_instance` EXISTS subquery inside `DrizzleHazardousEventRepository`, legacy↔CA status mapping

Legacy's `recordStatus`/`approvalStatus` is a column on `hazardousEventTable` itself. In the CA
schema, the only status this DTO carries is `workflowStatus`, sourced from a **separate bounded
context's table**, `workflow_instance` (`validation-workflow` domain), joined via a polymorphic
`(entity_id, entity_type)` key, with no tenant column of its own (confirmed: schema comment says
"caller's own repository validates tenant ownership"). Filtering by record status, `viewMyRecords`,
or `pendingMyAction` therefore requires **SQL-level** access to `workflow_instance` from inside
the HE list query — post-fetch filtering (fetch a page, then drop rows in the application layer)
would silently break both pagination (`LIMIT`/`OFFSET` applied before the filter removes rows)
and the `countAll` total, so this must happen in the same `WHERE`.

**`DrizzleHazardousEventRepository` queries `workflow_instance` directly, via `EXISTS`, not a
`JOIN`.** This is a cross-bounded-context table reference from HE's own infrastructure adapter —
verified as **consistent with existing precedent in this exact file**: `DrizzleHazardousEventRepository.server.ts`
already imports and queries `disasterEventTable` (owned by the disaster-events context) and
`divisionTable` directly today (`countReferencingDisasterEvents`, `assertDivisionIdsInTenant`).
ADR-009's boundary is about `domain/`/`application/`/`presentation/` layering per context, not a
prohibition on infrastructure-layer Drizzle adapters reading another context's physical table —
grepped directly: no other domain's repository currently imports `workflowInstanceTable`, but the
_pattern_ of one domain's Drizzle adapter importing another's table is already established in
this file for two other tables, so this isn't a new category of coupling, just a new instance of
an already-accepted one.

**`EXISTS`, not `JOIN`, specifically because rows with no `workflow_instance` row must still
appear when no status-related filter is active** (matching today's behavior exactly — `6a`'s own
`ListHazardousEventsUseCase` already handles a missing `WorkflowInstance` gracefully,
`workflowStatus: null`). An `INNER JOIN` would silently exclude every such row from _every_ query
once added, not just filtered ones; `EXISTS` is only added to the condition tree when
`recordStatus`/`viewMyRecords`/`pendingMyAction` is actually requested, leaving the unfiltered
query's row set untouched.

```sql
-- recordStatus = "SUBMITTED" example
EXISTS (
  SELECT 1 FROM workflow_instance
  WHERE workflow_instance.entity_id = hazardous_event.id
    AND workflow_instance.entity_type = 'HE'
    AND workflow_instance.status = 'SUBMITTED'
)
```

**Status mapping: CA enum values in the URL/query, not legacy's kebab strings.** `getRecordStatusOptions()`'s
legacy values (`draft`, `waiting-for-validation`, `needs-revision`, `validated`, `published`) map
1:1 to CA's `Status` enum (`DRAFT`, `SUBMITTED`, `REVISION_REQUESTED`, `APPROVED`, `PUBLISHED`) —
_by meaning_, not by string equality; the two enums use different literal values for the same
concept (`WorkflowInstance.ts`'s own `STATUS_VALUES`). The new filter's URL param and internal
`HazardousEventListFilterInput.recordStatus` field use the CA enum values directly (`Status`), with the
dropdown's i18n labels staying legacy's own English text ("Waiting for validation" for
`SUBMITTED`, etc.) so the _visible_ UI is unchanged even though the underlying value differs.
`REJECTED` (a CA-only status, no legacy equivalent — confirmed by reading `STATUS_VALUES`) is
**included** as a sixth dropdown option, since excluding a real possible status from the filter
would make rejected records permanently unfilterable-to from this page with no stated reason.
**Its i18n label — "Rejected" — reuses the existing `status.rejected` key** from
`locales/en/hazardous-events.json` (Open Decision 4), the same key
`workflowStatusDisplay.ts` already uses (`labelKey: "rejected"`, added in `6a`) for the detail/list
status display — no new i18n key is invented for the filter dropdown option.

**Count semantics: `countAll` takes the identical filter object and shares one condition-builder
method with `findAll`**, closing the exact risk `6a`'s own `countAll` addition didn't yet have to
deal with (no filters existed then). `IHazardousEventRepository`'s positional-optional `tx?: Tx`
parameter on `countAll` is preserved after the new `filters` parameter is inserted — both
`findAll(tenantId, pagination, filters?)` and `countAll(tenantId, filters?, tx?)` — `filters`
defaults to `{}` (no filter) so every one of the port's eight existing fakes keeps compiling
without modification to their call sites, only their own internal `WHERE`-building logic (the
fakes that are real in-memory implementations, not pure stubs) needs the new filter param
threaded through. This `filters` parameter's type is `HazardousEventRepositoryFilters` — see the
naming note at the end of Decision 3 below for why this is a distinct type from the use-case-
facing one, not the same interface reused across both layers.

### Decision 3 — `viewMyRecords`/`pendingMyAction`: resolve against both tables; `workflow_instance`'s own `submittedByUserId`, not `hazardous_event`'s

Legacy's `viewMyRecords` is `createdByUserId = me OR validatedByUserId = me OR publishedByUserId =
me` — all three columns on the legacy `hazardousEventTable`. In the CA schema, `createdByUserId`
is still a direct column on `hazardousEventTable` (confirmed), but `validatedByUserId`/
`publishedByUserId` **moved to `workflow_instance`** (per-transition attribution, confirmed by
reading `workflowInstanceTable.ts`) — `hazardousEventTable` itself has no `validatedByUserId`/
`publishedByUserId` column at all in the CA schema. `workflow_instance` additionally has
`approvedByUserId`, a CA-only transition with no legacy equivalent (CA's workflow has an extra
`APPROVED` step between `validated` and `published`) — **included** in `viewMyRecords`'s OR-chain
for the same "don't make a real action invisible to its own actor" reasoning as Decision 2's
`REJECTED` inclusion.

```sql
-- viewMyRecords = true, userId = "u1"
hazardous_event.created_by_user_id = 'u1'
OR EXISTS (
  SELECT 1 FROM workflow_instance
  WHERE workflow_instance.entity_id = hazardous_event.id
    AND workflow_instance.entity_type = 'HE'
    AND (workflow_instance.validated_by_user_id = 'u1'
         OR workflow_instance.approved_by_user_id = 'u1'
         OR workflow_instance.published_by_user_id = 'u1')
)
```

**`pendingMyAction` (first branch only — Open Decision 2, second branch
deferred as `DEF-049`) uses `workflow_instance.submittedByUserId`,
not `hazardousEventTable.submittedByUserId`.** Both columns exist in the CA schema today (confirmed:
`hazardousEventTable` carries its own `submittedByUserId` per `DrizzleHazardousEventRepository.toRow()`;
`workflow_instance` carries its own, per-transition). These are two independent fields that could
in principle diverge (e.g. a future bulk-reassignment tool updating one but not the other) —
`workflow_instance.submittedByUserId` is the one actually written by the transition that sets
`status = REVISION_REQUESTED` (`WorkflowInstance.ts`'s own `REQUIRED_SET` pairing), making it the
semantically correct source for "who submitted the version currently awaiting revision," not
`hazardous_event.submittedByUserId`'s own, separately-maintained value.

```sql
-- pendingMyAction = true, userId = "u1" (first branch only, confirmed; second branch is DEF-049)
EXISTS (
  SELECT 1 FROM workflow_instance
  WHERE workflow_instance.entity_id = hazardous_event.id
    AND workflow_instance.entity_type = 'HE'
    AND workflow_instance.status = 'REVISION_REQUESTED'
    AND workflow_instance.submitted_by_user_id = 'u1'
)
```

**`ListHazardousEventsQuery` gains a required `userId: string`** (previously absent — the use case
had no need for it before this change), resolved by the loader from the already-`requireUser()`'d
session (Decision 2 of `6a`'s own design.md established this call exists on every request to this
route already). `viewMyRecords`/`pendingMyAction` are plain booleans on `ListHazardousEventsQuery.filters`, kept
separate from `query.userId` at the use-case-facing layer ("whose records" vs. "which records").

**Two distinct filter types, not one reused across layers.** An earlier draft of this design used
a single `HazardousEventListFilters` name for both the use-case-facing object and the repository-
facing one — wrong, since the two are genuinely different shapes owned by different layers, and a
shared name invites a presentation-layer file to import a type that actually lives in the
repository port (a real layering violation, not just a naming nit):

- **`HazardousEventListFilterInput`** — the use-case-facing type (`hazardTypeId?`,
  `hazardClusterId?`, `specificHazardId?`, `fromDate?`, `toDate?`, `recordingOrganization?`,
  `hazardousEventStatus?`, `recordStatus?: Status`, `viewMyRecords?: boolean`,
  `pendingMyAction?: boolean` — no `userId`, no `allowedStatuses`). **Defined in and exported from
  `ListHazardousEvents.ts`** (application layer), alongside `ListHazardousEventsQuery`. Imported
  by `parseHazardousEventListFilters.ts` (presentation imports from application — the only
  direction ADR-009 permits).
- **`HazardousEventRepositoryFilters`** — the repository-facing type: every field of
  `HazardousEventListFilterInput` **plus** `userId?: string` (needed to resolve `viewMyRecords`/
  `pendingMyAction`) **plus** `allowedStatuses?: readonly Status[]` (the data-viewer forced
  restriction's own field — see Decision 4's rewrite below; a plain `recordStatus` field cannot
  express "this value AND also restricted to this allowed set," so it needs its own field, not an
  overload of `recordStatus`). **Defined in and exported from `IHazardousEventRepository.ts`**
  (the port file) — `findAll(tenantId, pagination, filters?: HazardousEventRepositoryFilters)`,
  `countAll(tenantId, filters?: HazardousEventRepositoryFilters, tx?)`.

`ListHazardousEventsUseCase.execute()` is the only place these two types meet: it reads
`query.filters` (`HazardousEventListFilterInput`), and builds the `HazardousEventRepositoryFilters`
object it passes to the repository by spreading every field of `query.filters` unchanged and
adding `userId: query.userId` and, when `query.role === "data-viewer"`, `allowedStatuses:
["APPROVED", "PUBLISHED"]`.

Both types' `recordStatus`/`allowedStatuses` fields are typed `Status`/`readonly Status[]`, a
type-only import from `~/domains/validation-workflow/domain/WorkflowInstance` — this is not a new
category of cross-domain coupling: `app/domains/hazardous-events/presentation/workflowStatusDisplay.ts`
already carries the identical type-only `Status` import today, so `IHazardousEventRepository.ts`'s
own existing import restriction ("no Drizzle/NestJS/Remix import except the type-only `Tx`") is
unaffected — that rule is about framework imports specifically, not cross-domain type-only ones.

### Decision 4 — Data-viewer visibility rule lives in the use case, not the loader, via a dedicated `allowedStatuses` field (Open Decision 1)

`ListHazardousEventsUseCase.execute()` gains a `role: string | null` field
(required, still nullable) on its query (the loader already resolves this for the `ViewData`
permission check per `6a`'s own Decision 2 and can pass it through at zero extra cost). Required
rather than optional: optional-and-defaults-to-permissive is the exact foot-gun class this
decision exists to close — a future caller that forgets to pass `role` would silently skip the
data-viewer restriction instead of being forced to say "no role" explicitly via `null`. Every real
call site already has the role in hand by the time it calls the use case, so this costs nothing in
practice; it only forces fakes/tests to be explicit instead of omitting the field. When `role === "data-viewer"`, the use
case sets `allowedStatuses: ["APPROVED", "PUBLISHED"]` on the `HazardousEventRepositoryFilters`
object it builds (Decision 3's naming note) — a **separate field from `recordStatus`**, not an
override of it, specifically so the repository can express "this specific status AND also
restricted to this allowed set" as two independent SQL conditions ANDed together. The repository's
own requirement (see the `hazardous-event-repository-port` spec delta) is: when `recordStatus` is
set, match it exactly; when `allowedStatuses` is set, require `workflow_instance.status` to be one
of that set; when both are set, both conditions apply. A data-viewer explicitly requesting
`recordStatus=DRAFT` therefore gets a correctly-empty result (`status = 'DRAFT' AND status IN
('APPROVED','PUBLISHED')` can never match), exactly mirroring legacy's own behavior — its forced
condition is ANDed onto the end of the same `condition` tree the user-supplied `recordStatus`
filter also contributes to, with no special interaction case. Placed in the **use case**, not the
loader, so a request that reaches the use case through any future second entry point (REST API,
`6e`/`6f`) inherits the same rule automatically — consistent with Invariant 3 ("DB constraints are
defense-in-depth, not a substitute for domain-layer rules"; the inverse also holds — a role rule
enforced only at the presentation edge is bypassable by any other caller of the same use case).

**Legacy's own UI-level restriction is also replicated, not just the backend rule**: `getRecordStatusOptions(ctx)`
limits its returned options to `validated`/`published` for a `data-viewer` role (confirmed by
reading `hazardevent-filters.tsx` directly) — `HazardousEventFilterBar`'s record-status `Select`
applies the same role-based option restriction (see the `hazardous-event-list-filters` spec
delta's dedicated requirement and tasks.md Task 9.2), independently of the backend rule above —
a `data-viewer` should not see a dropdown option that the backend would silently zero-out anyway.

**`HazardousEventFilterBar` takes `role: string | null` as an explicit prop, not
`useViewContext()`** — unlike `DisasterRecordsFilter.tsx`'s
own `ctx.user?.role` precedent. Reasoning: `useViewContext()`'s `.lang`/`.t`
coupling is already a known project-wide untangling target (`project_useviewcontext_lang_coupling`),
not something to deepen; every other `6a`/`6h` presentation component already receives its data via
loader props. The loader resolves `role` from `requireViewDataPermission`'s own return value (see
the route-adapter wiring note below) and passes it to both `ListHazardousEventsUseCase.execute`
and `HazardousEventFilterBar`.

### Decision 5 — `recordingOrganization`: `ILIKE` partial match, a deliberate UX improvement, not legacy parity (Open Decision 3 — human picked the alternative)

The UI widget is a plain `<input type="text">` (not a `Select`/`Combobox` — the hardcoded
`organizations` list the legacy component declares in its props is never rendered in its own JSX
body, confirmed by reading the full file; building a dropdown for it now would be inventing UI
legacy itself doesn't have). This part of the original recommendation is unchanged.

**The match semantics are not legacy parity.** Legacy's own UI renders this field with placeholder
"Search organization..." but its backend query actually does an exact `eq()` match against
`recordOriginator` — a real mismatch between the placeholder's implied behavior and the query
legacy actually runs. The originally-recommended default was bug-for-bug parity (exact match,
reproducing that mismatch). **The human confirmed the alternative instead: `ILIKE` partial
match** —

```ts
ilike(hazardousEventTable.recordOriginator, `%${value}%`);
```

This is stated explicitly as a **deliberate small UX improvement the human chose**, not a port of
any legacy behavior — unlike every other filter dimension in this change, which is a mechanical
port of an existing query. A reviewer or future reader of this spec should not infer `ILIKE` here
from "matching the legacy filter set" (the phrase proposal.md's "Why" section uses for the rest of
this change); it's the one dimension where this change's own behavior diverges from legacy by
design.

### Decision 6 — Date range filters: port the exact partial-date CASE ladder; empty-string exclusion preserved

`fromDate` filters `startDate >= fromDate`, `toDate` filters `endDate <= toDate` — **not** a
single date-range check against both; these are two independent one-sided bounds against two
different columns, exactly as legacy implements them (confirmed: `hazardevent.ts` lines ~116-151).
**Both `startDate`/`endDate` are free-text columns** (confirmed: `zeroText()` pattern, not a real
`date` column) storing partial dates (`YYYY`, `YYYY-MM`, or `YYYY-MM-DD`) — legacy's own `CASE`
ladder (matching each of six regex shapes, falling back to a plain string comparison) is ported
verbatim into the new repository query; this is existing, working logic being relocated into a
new call site, not logic to redesign. **A row whose `startDate`/`endDate` is the empty string is
excluded from any `fromDate`/`toDate`-filtered result** (legacy's own `!= ''` guard, confirmed) —
this means an event with a start date but no end date (e.g. "ongoing") disappears from the result
set the instant a human sets `toDate`, matching legacy's exact (if surprising) behavior; not
flagged as an Open Decision since it's a direct, mechanical port rather than a new judgment call,
but named here so the PGlite test suite covers it as an explicit scenario, not an accidental gap.

### Decision 7 — Malformed filter values are dropped by the presentation layer, not passed through to raise a DB error

`specificHazardId`/`hazardClusterId`/`hazardTypeId` are `uuid`-typed columns — a non-UUID query
param value reaches Postgres as `22P02` (invalid input syntax), an unhandled 500, not a clean
empty-result or 400. `fromDate`/`toDate` feeding a malformed value into `TO_DATE(...)` inside the
`CASE` ladder has the same failure mode. **`parseHazardousEventListFilters.ts` validates each
value before it reaches the use case**: a UUID-shaped param is checked against a UUID regex; a
date param against `/^\d{4}(-\d{1,2}(-\d{1,2})?)?$/` (the exact shape legacy's own CASE ladder
already expects); an enum param (`hazardousEventStatus`, `recordStatus`) against its own known
value set. **A value that fails its check is treated as absent** (same as an empty string today),
not surfaced as a 400 — matching the existing pattern `parsePagination.ts` already established
for a malformed `page`/`pageSize` (`hazardous-event-route-adapter` spec: "malformed ... MUST
default to..."), rather than inventing a new error-response shape for this one filter bar. This
is a presentation-layer decision; `IHazardousEventRepository`'s own Drizzle implementation is
never reached with a malformed value and doesn't need its own defensive check, consistent with
"validate at the boundary once" rather than at every layer.

### Decision 8 — `search` stays a hidden passthrough field; no new visible search input or ILIKE query (confirmed, not open)

Legacy's own comment on this field is explicit: `{/* Hidden search field to maintain
compatibility */}` — it renders no visible input anywhere in `hazardevent-filters.tsx`'s own JSX,
yet the backend still runs a 10-column `ILIKE` scan whenever it's non-empty via some other,
unidentified caller (not this filter bar). This change's own scope is "matching the legacy filter
set in `hazardevent-filters.tsx`" — a field that component itself never lets a user set is not
part of that set. `HazardousEventFilterBar.tsx` renders no `search` input and
`parseHazardousEventListFilters.ts` does not read a `search` param at all; `ListHazardousEventsUseCase`
gains no text-search capability in this change. If a future intent needs free-text search, it
designs its own filter dimension rather than inheriting this one's hidden-field shape.

### Decision 8a — Filter bar placement, and the full zero-result render (summary line + legend + "No records found")

**Placement: the filter bar is a sibling rendered before `<section className="dts-page-section">`,
not inside it.** Verified by reading `hazardeventlist.tsx` directly: its JSX root is a plain
`<div>` containing `<HazardousEventFilters .../>` first, then a separate `<section className=
"dts-page-section">` holding the summary/legend/table. `6a`'s own `HazardousEventListPage` root is
that `<section>` itself (no outer wrapper). This change changes that root: `HazardousEventListPage`
returns a `<>...</>` fragment (or an outer `<div>`) containing `<HazardousEventFilterBar />` first,
then the existing `<section className="dts-page-section">` unchanged — not a filter bar rendered
_inside_ the section's own top, which would produce different spacing than legacy's sibling
placement (the section's own padding/margin would apply above the filter bar, which legacy's
sibling placement never has).

**Zero-result rendering is the full legacy treatment, not just the empty-state message.** `6a`'s
current `HazardousEventListPage` renders only `{t("list.empty")}` when `items.length === 0`,
skipping the summary line and legend entirely in that case — correct for `6a`'s own then-scope
(the roadmap's own Decision 9 pulled numbered pagination/summary/legend into `6a`, but zero-result
behavior specifically wasn't exercised by `6a`'s own tests, since filtering — the thing that makes
a zero-result page routine rather than rare — didn't exist yet). Legacy's own `hazardeventlist.tsx`
renders the summary line and `ListLegend` **unconditionally** (gated only on `!isPublic`, never on
`pagination.totalItems`), with only the _table_ swapped for "No records found" text when
`totalItems` is 0. This change restructures `HazardousEventListPage` to match: the summary line
and legend move outside the `items.length === 0` conditional (which now gates only the
table-vs-"no records" choice, matching legacy's own `pagination.totalItems ? <table> : <no
records text>` structure) — see the `hazardous-event-list-filters` spec delta's zero-result
requirement and tasks.md Task 9.3.

### Decision 9 — Design-system primitives: native elements where React Aria's own default shape would visibly diverge, React Aria where it wouldn't

Per-primitive, following `6a`'s own "golden rule" (pixel/behavior parity with legacy, React Aria
accepted only where its own unstyled shape doesn't force a structural divergence):

- **`Checkbox`** — **plain native `<input type="checkbox">`, no React Aria** — same category as
  `DateRangePicker` below ("native element where React Aria's own shape would diverge"), not the
  "pure styling wrapper"
  this bullet originally claimed. An SSR-markup probe of React Aria's own `Checkbox` (confirmed
  independently against `node_modules/react-aria-components/dist/private/Checkbox.js`) showed the
  real `<input type="checkbox">` is wrapped in `<VisuallyHidden elementType="span">` — not the
  visible element at all — so a consumer must render its own separate indicator element and style
  that instead. Legacy's CSS targets `input[type="checkbox"]` directly, with no indicator element
  in its DOM at all (confirmed: `public/assets/css/style-dts.css`'s `.dts-form-component
input[type="checkbox"]` rule). React Aria's `Checkbox` is therefore a real structural divergence
  here, not a styling-only wrapper — the same category of case Decision 9's own stated rule already
  routes to a native element. `Checkbox.tsx` is a plain `<input type="checkbox">` styled exactly
  per Decision 12's token values (`1.71rem` square, `appearance: none`, checked state `#004f91`
  background + `tick-white.svg` tick icon via `background-image`, hover/focus `box-shadow` glow
  matching `.dts-form-component input[type="checkbox"]:hover`/`:focus-visible` exactly) — full
  native Space/click toggle semantics for free, no indicator-element DOM to invent.
- **`Select`** — legacy's own `<select>` already has fully custom styling (`appearance: none`,
  a background-image chevron, no native OS dropdown look preserved). React Aria's `Select`
  renders a button that opens a popover listbox, not a native `<select>` element — this **is** a
  real structural divergence (no native OS select behavior, different DOM, different keyboard
  model) but one that, once styled, looks visually close to legacy's own already-custom look
  (both show a bordered box with a chevron and an overlaid options list on open). **Accepted
  deviation, named explicitly** (same treatment as `6a`'s own accepted `Table` grid-role keyboard
  deviation): React Aria's `Select`, styled to match legacy's `.dts-form-component select` CSS
  exactly for its closed-state trigger button (same border/radius/padding/chevron), with its own
  popover listbox styled to match `.dts-form-component select option`'s implied look as closely as
  a popover can. **Native GET form submission confirmed, not assumed**: `react-aria-components@1.22.1`'s
  `Select` renders a visually-hidden native `<select>` internally for exactly this purpose
  (confirmed: `node_modules/react-aria-components/dist/private/Select.js` contains a
  `HiddenSelect` implementation) — a plain `name` prop is sufficient, no extra wiring needed.
  `Combobox` uses the library's own documented `formValue="key"` prop (confirmed present on
  `ComboBoxProps` in the installed package's own type declarations) to submit the selected
  option's id rather than its displayed text. `6a`'s own page-size `<select>` (a plain native
  element, explicitly scoped as
  "minimal, not the final reusable primitive") is **not** migrated onto this new `Select` in this
  change — out of scope, a separate, low-risk follow-up once this primitive exists, not bundled in.
- **`DateRangePicker`** — legacy renders **two independent native `<input type="date">` elements**
  in separate grid cells (`fromDate`, `toDate`), not a single linked range control — confirmed by
  reading the JSX directly (Second Row, two separate `dts-form-component` divs). React Aria's own
  `DateRangePicker` is a single composite control (segmented day/month/year fields plus a shared
  calendar popover) — a different interaction model entirely, not a styling-only divergence.
  **This primitive is two independent native `<input type="date">` elements, not React Aria's
  `DateRangePicker` at all** — the name is kept for discoverability (two co-located date inputs,
  same component file) but the implementation is plain HTML, matching legacy exactly rather than
  accepting an unnecessary divergence. React Aria's `DateField`/`DateRangePicker` is not imported
  by this primitive.
- **`Combobox`** — no native HTML element has this shape at all (legacy's own implementation is
  entirely hand-rolled: a text `<input>` plus an absolutely-positioned `<ul>`). React Aria's
  `ComboBox` is the correct, intended-for-this-exact-case component — no native alternative to
  prefer over it. Behavior spec is Decision 10 below.

### Decision 10 — Combobox: replicate legacy's real behavior, including two confirmed bugs, with both named as accepted deviations once React Aria is the implementation

Legacy's cascading combobox (`hazardevent-filters.tsx` lines 138-194), read in full:

- Matching is case-insensitive substring, against name only in the UI's own visible list (legacy's
  `id` fallback becomes `code` per Decision 1).
- Results capped at 20 (`filteredHazards.slice(0, 20)`); nothing renders when `searchTerm` is
  empty (the dropdown's own guard: `showDropdown && searchTerm && filteredHazards.length > 0`).
- **No debounce, and none is needed** — every keystroke re-filters synchronously against the
  already-loaded array (no network round-trip exists in either implementation, since Decision 1
  confirmed full preload, not a server-search endpoint). This replaces an earlier draft of this
  design that discussed a debounced server-search alternative and cited `DisasterRecordsFilter.tsx`'s
  `handleSectorChange` as an existing debounce precedent to match — **that citation was wrong**,
  verified by re-reading the function directly: `handleSectorChange` calls `fetcher.load(...)`
  synchronously, on every change event, with no debounce of any kind. Removed rather than left as
  an unsupported claim; moot in any case once full preload was confirmed.
- Selecting a hazard fills cluster and type upward (`handleHazardSelect`'s own
  `relatedCluster`/`relatedType` lookups) — ported as-is.
- The initial display text on page load comes from the hazard's own name, resolved from the
  already-loaded `hip.hazards` array by matching `hipHazardId` — the CA equivalent resolves the
  initial text the identical way, by matching `HazardousEventListFilterInput.specificHazardId`
  against the already-loaded `taxonomyOptions.specificHazards` array (Decision 1's confirmed full
  preload), not via any single-id lookup call.
- Free text is never submitted as the filter value — only the hidden `hipHazardId`/
  `specificHazardId` field (bound to an actually-selected option) is a named form field; the
  visible text input has no `name` attribute. Ported as-is.

**Two confirmed bugs, each named as an accepted deviation rather than silently fixed or silently
kept:**

- **Stale hidden id after changing type/cluster.** Changing `hipTypeId`/`hipClusterId` resets
  `searchTerm` (the visible text) to `""` but does **not** reset `selectedHazardId` (the hidden
  submitted value) — a user who picks a hazard, then changes the type dropdown, sees an empty text
  box but would still submit the old hazard's id if they clicked Apply without re-selecting.
  **Fixed, not replicated**, because this is a straightforward, low-risk, 2-line consistency fix
  (clear the hidden id whenever type or cluster changes) with no plausible reason a human would
  want the bug kept, unlike Decision 5's `recordingOrganization` case, which has a real "don't
  silently change behavior out of scope" tension this one doesn't.
- **Hazard list filters by cluster only, never by type alone.** Legacy's `filteredHazards` checks
  `matchesCluster` (selected cluster) but has no equivalent `matchesType` check — selecting a type
  with no cluster selected does not narrow the hazard list at all; only cluster selection does.
  **Replicated as-is**, not fixed — `HazardousEventFilterBar`'s own client-side filter function
  (filtering the one preloaded `taxonomyOptions.specificHazards` array, mirroring legacy's
  `filteredHazards` exactly) checks `clusterId` only, with no equivalent type check, matching
  legacy's own logic line-for-line. Named here so a reviewer doesn't mistake this for an oversight,
  not silently carried over.

React Aria's `ComboBox` provides real keyboard navigation (arrow keys, Enter to select, Escape to
close) that legacy's hand-rolled version has none of — an **accepted, beneficial deviation**, same
treatment as `6a`'s own accepted `Table` grid-keyboard-model deviation; not a parity gap to close.

### Decision 11 — No shared filter-shell primitive; `HazardousEventFilterBar.tsx` composes its own grid, same choice legacy itself made

The roadmap's own research flagged that legacy "only half-commits" to `app/frontend/components/list-page-filters.tsx`'s
shared `Filters` shell — `hazardevent-filters.tsx` and `DisasterRecordsFilter.tsx` (read in full)
both roll their own `mg-grid`/`dts-form` structure instead of composing on it.

**Correction (implementation-time, Task 0 read): `list-page-disasterevents-filters.tsx` DOES
exist** at `app/frontend/components/list-page-disasterevents-filters.tsx` (294 lines) — an earlier
draft of this design claimed it didn't, based on a glob that was run against the wrong state or
location; confirmed here by reading the file directly. It is a **third** independent instance of
the identical `mg-grid`/`dts-form__actions--standalone`/checkbox-pair (gated by the same
`canAddNewRecord`)/`Clear`+`Apply` structure, also not composed on the shared `Filters` shell. This
weakens, but does not by itself overturn, the "no third filter bar in scope to validate the
abstraction against" reasoning below — a third real-world instance of the shape exists in the
repository, just not one this change's own scope touches. **Decision unchanged pending explicit
human confirmation** (flagged back to the human during `ca-he-list-filters` implementation):
extracting a shared shell is still a speculative generalization for a filter-bar
intent to take on unasked, and doing so would still require touching two other already-shipped
filter bars to prove the abstraction, which is out of this change's own scope regardless of how
many duplicated instances exist. **This change does not introduce a new logic-free
layout-shell primitive to the design system.** The three real precedents
(`hazardevent-filters.tsx`, `DisasterRecordsFilter.tsx`, `list-page-disasterevents-filters.tsx`)
show the _same_ `mg-grid`/`dts-form__actions--standalone`/
checkbox-pair/`Clear`+`Apply` structure duplicated three times already — a real shared-shell
opportunity exists, but extracting one now, on the one filter bar this change builds, with the generic
`Filters` shell already confirmed as the wrong shape (it renders its own "Filters" `<h3>` legacy HE
doesn't have, and a single generic `search` input legacy HE's own bar doesn't use that way), would
mean designing a second, different shared shape speculatively, for a reuse case this change alone
can't confirm against its own two other instances (that would mean touching their own already-shipped
pages, out of this change's scope).
`HazardousEventFilterBar.tsx` composes `mg-grid`/`dts-form` structure directly, HE-owned, matching
`DisasterRecordsFilter.tsx`'s own choice — a legitimate future refactor once a shared-shell
extraction is itself scoped as its own change, not introduced speculatively here.

### Decision 12 — No dedicated `@theme` file; stays inline in `app/styles/all.css`

The roadmap's own open question asked whether this change's new tokens cross the
threshold `6a`'s own Decision 8 named ("once the token set grows large enough to warrant its own
file"). `6a` shipped 7 tokens. This change's four new primitives add real tokens from the CSS
values read directly above: border color (`#cccccc`, reused for all four), hover/focus border
(`#004f91`, reused), border-radius (`6px`, distinct from `6a`'s own `--radius-dts-button: 0.57rem`
— legacy's **form inputs** use a different corner radius than its **buttons**, confirmed by
reading both rules directly, not assumed equal), input padding (`0.4rem 0.57rem`), checkbox size
(`1.71rem`), checkbox-checked color (`#004f91` — same hex as the hover/focus border, but a
semantically distinct token since the two could diverge independently later), disabled background
(`#f2f2f2` — same hex as `6a`'s own `--color-dts-table-header-bg`, reused as a token for the same
reason: one value, one name, referenced from both places once this exists), and the `mg-grid`
column/row gaps (`1.14rem`/`0.57rem`). That's roughly 9 new tokens (several reusing `6a`'s own
hex values under new, more accurately-scoped names) on top of `6a`'s 7 — **16 total, still a single,
readable block**, not yet the kind of size (dozens of tokens, multiple unrelated component
families) that would justify a second file-boundary decision purely for navigability. **Decision:
keep extending the same inline block in `app/styles/all.css`**, re-evaluate again whenever the
_next_ domain's presentation work adds its own primitives — if that pushes the block past roughly
25-30 tokens, that's the point a dedicated file earns its keep, not before.

**Task 0.1 live-DOM findings (Playwright `getComputedStyle` against the real
`/en/hazardous-event` page, logged in as `test.admin@india.gov.in`, not source-guessed):**

- The page's root font-size is `14px`, not the browser default `16px` — every `rem` value above
  converts against that base (confirmed: `.mg-grid` computed `column-gap`/`row-gap` are
  `15.96px`/`7.98px`, which is exactly `1.14rem`/`0.57rem` at a `14px` root, matching the values
  already stated above). No action needed — the token values above are already correct — but a
  future reader converting a computed pixel value back to `rem` by hand should use `14px`, not
  `16px`, or every conversion will be off by 8/7.
- **Confirmed exactly as stated above, no divergence:** `.mg-grid` gaps; text-input (`recordingOrganization`)
  and date-input (`fromDate`) padding — both computed `5.6px 7.98px`, i.e. exactly `0.4rem 0.57rem`;
  border `1px solid #cccccc` and `border-radius: 6px` on text/date inputs; checkbox size (computed
  `23.9375px` square = exactly `1.71rem`); checkbox checked background/icon (`#004f91` +
  `tick-white.svg`); combobox dropdown's inline-styled positioning (`position: absolute`,
  `margin-top: -10px`, `z-index: 1000`, `box-shadow: rgba(9,3,3,0.1) 0 2px 4px`, `max-height: 200px`)
  — these were already hardcoded inline styles in the source JSX, so the live read is purely
  confirmatory.
- **Divergence found — `<select>`'s own padding is NOT `0.4rem 0.57rem`.** The CSS source has a
  `select`-specific override the earlier source read missed:
  `.dts-form-component select { padding: 5px 2.4rem 3px 0.57rem; ... }` (confirmed by reading
  `public/assets/css/style-dts.css` directly, and cross-checked against the live computed style:
  `padding: 5px 33.6px 3px 7.98px`, i.e. literally `5px 2.4rem 3px 0.57rem` at the page's `14px`
  root). The generic `.dts-form-component input, textarea, select { padding: 0.4rem 0.57rem }` rule
  this design's earlier token table was based on is overridden for `select` specifically — the much
  larger right padding (`2.4rem`) makes room for the chevron `background-image`, and the top/bottom
  values (`5px`/`3px`) are raw pixels, not `rem`, and are not equal to each other. **This needs its
  own token** (e.g. `--spacing-dts-select-padding: 5px 2.4rem 3px 0.57rem` or the equivalent
  four-value form), not a reuse of the shared input-padding token Task 2.3 was going to add for
  `Select.tsx` — using the shared `0.4rem 0.57rem` value for `Select`'s trigger would visibly
  overlap its own text with the chevron icon. Border/border-radius/hover-focus-border for `select`
  are unaffected (still the shared `#cccccc`/`6px`/`#004f91` from the base rule).
- **New values captured, not previously stated as exact numbers:** checkbox hover/focus-visible
  `box-shadow: 0px 1px 8px 0px rgba(0, 79, 145, 0.41)` (same hex as the hover/focus border token,
  `41%` alpha); checkbox `border: 1px solid #cccccc` and `border-radius: 6px` are inherited from the
  shared base rule (the checkbox's own CSS block only overrides `appearance`/`cursor`/`width`/
  `height`/`margin`/`padding`/`flex-shrink`, not `border`/`border-radius`) — so an unchecked
  checkbox is a bordered, rounded-corner box, not a borderless one, confirmed both in the computed
  style and the captured screenshot.
- **Gate 9 reference screenshot captured**: the real legacy filter bar (with the specific-hazard
  combobox open against a `"a"` query, and "View my records" checked, to also capture the checked
  and dropdown-open states in one image) was screenshotted for later Gate 9 comparison.

**Human-confirmed (independently cross-checked `Checkbox.js` directly):**
`Checkbox.tsx` is a plain native `<input type="checkbox">`, not React Aria — Decision 9's Checkbox
bullet above is updated accordingly.

**CSS fixes against the real rendered page (human manual UI review in a real browser, root causes
verified via live DOM/CSS inspection, not visual impression alone), all CSS-only in
`app/styles/all.css`, no new tokens beyond what's already listed above, no inline styles, no pixel
hardcoding:**

- **Popover collapsed to content width.** `.dts-select-popover` never consumed RAC's own
  `--trigger-width` custom property (which RAC already sets inline on the popover for exactly this
  purpose) — fixed with `width: var(--trigger-width);`.
- **No option hover/keyboard-focus highlight.** Zero CSS targeted RAC's `data-hovered`/
  `data-focused` state attributes on `ListBoxItem`. The real legacy equivalent isn't in
  `style-dts.css` (checked, nothing there) but in `hazardevent-filters.tsx`'s own inline
  `onMouseEnter`/`onMouseLeave` handlers on its hazard-search dropdown (`background-color: #f5f5f5`
  on hover, no keyboard-nav support at all in that legacy widget). Added
  `.dts-select-popover [data-hovered], .dts-select-popover [data-focused] { background-color:
#f5f5f5; }` — applied to both states since RAC's `ListBoxItem`, unlike legacy's own unaccessible
  dropdown, supports real keyboard navigation too, and should get the same treatment.
- **Label-to-control gap was 0, not `0.57rem`.** Legacy's gap comes from
  `.dts-form-component label { display:grid; grid-template-rows:subgrid; gap:0.57rem; ... }`
  (`style-dts.css:1517-1523`), which only matches because legacy wraps the label text and control
  as children of one real `<label>`. RAC's `Select`/`ComboBox` render `<div class="react-aria-Select">`/
  `<div class="react-aria-ComboBox">`, not a `<label>`, so that selector never matches and the gap
  silently became 0. Fixed with an equivalent flex rule (not subgrid, since these aren't a real
  `<label>` participating in the ancestor's own row template) reusing the identical `0.57rem` value:
  `.dts-form-component .react-aria-Select, .dts-form-component .react-aria-ComboBox { display:flex;
flex-direction:column; gap:0.57rem; }`.
- **Select trigger shorter than other inputs by ~6px, not legacy's own ~1.4px.** Root cause:
  legacy's `.dts-form-component input, textarea, select { ... } input:not(...), select:not(...) {
line-height: 1.7 !important; }` (`style-dts.css:1550-1554`) boosts `input`/`textarea`/`select` —
  `button` isn't in that selector list, so our `<button>`-based trigger fell back to the browser's
  own much shorter default button line-height entirely uninfluenced by the page's typography. Fixed
  by adding `line-height: 1.7;` to `.dts-select-trigger` (same value, not a new one). Verified via
  live `getComputedStyle`: with this fix, trigger and input both compute `line-height: 23.8px` and
  `border: 1px` identically; the trigger is still ~3.2px shorter than Combobox/date inputs, but this
  remainder is now fully and only explained by the asymmetric chevron-clearance padding
  (`--spacing-dts-select-padding: 5px 2.4rem 3px 0.57rem`, total 8px top+bottom) versus the shared
  input padding (`0.4rem 0.57rem`, total 11.2px top+bottom) — a difference already locked in and
  confirmed correct by this same addendum's own Task 0.1 finding above, not touched by this fix.
  Legacy's own tighter ~1.4px gap is a native-`<select>`-specific OS rendering quirk (both legacy
  select and input use the _same_ symmetric padding per the base rule, yet still differ slightly) —
  that quirk has no equivalent for a `<button>`-based custom trigger and isn't closeable without
  reopening the already-confirmed padding token.
- Combobox search-and-narrow behavior itself re-verified working correctly during this review — no
  action needed, the one earlier-suspected false alarm was a genuinely-zero-match search term.

All four verified against the real `/en/he-preview` page (live dev server, `test.admin@india.gov.in`)
via Playwright `getComputedStyle`/`getBoundingClientRect`, not visual impression: popover width now
equals trigger width exactly (both `323.98px`); hover/focus background computes to
`rgb(245, 245, 245)`; label-to-control gap computes to `7.97px` for both Select and Combobox,
matching `0.57rem` at this page's `14px` root exactly.

**Further findings from the same human-manual-review discipline, same real-browser/live-DOM
verification standard:**

- **Fixed: "Clear" didn't reset the Select/Combobox/checkbox display values, even though it
  correctly cleared the URL and the underlying list data.** Root cause confirmed by reading the
  code: `HazardousEventFilterBar`'s `useState(currentFilters?.…)` initializers, each `Select`'s
  `defaultSelectedKey`, the `Combobox`'s own `useState(defaultOption?.name)`, and every
  `defaultValue`/`defaultChecked` are read-once-on-mount. `Clear` is a `Link` (client-side React
  Router navigation within the same route), so `HazardousEventFilterBar` never unmounts and none of
  that state re-syncs, even though the loader's own fresh data did arrive. Fixed in
  `HazardousEventListPage.tsx` with `key={JSON.stringify(currentFilters)}` on
  `<HazardousEventFilterBar>`, forcing a full remount whenever the actual filter state changes via
  navigation (Clear or Apply) — `page`/`pageSize` are deliberately excluded from the key so a
  pagination-only navigation doesn't force an unnecessary remount. Verified side-by-side against the
  real legacy page (`/en/hazardous-event`, confirmed via reading
  `app/routes/$lang+/_public+/hazardous-event+/_index.tsx` to still import the legacy
  `~/frontend/events/hazardeventlist` component, not this change's own): legacy's own "Clear" is a
  plain `<a href>` (`hazardevent-filters.tsx`), not a router `Link`, so it triggers a full page
  reload — legacy avoids this bug class by accident (full remount from a hard navigation), not by
  design; it has the exact same `useState(hipTypeId || "")`-with-no-resync pattern for its own
  `selectedTypeId`/`selectedClusterId`. The `key`-based remount is the correct client-side-SPA
  equivalent, not a workaround — confirmed empirically: both pages, after Apply then Clear, show the
  Hazard type control reset to its default/placeholder and the recording-organization/date inputs
  empty.
- **Fixed: listbox options had no padding, text flush against the popover edges.** Confirmed via
  grep: nothing targeted `[role="option"]` before this (only the hover/focus background rule from
  the previous round). Same legacy source as that rule (`hazardevent-filters.tsx`'s hand-rolled
  dropdown `<li>`, `padding: 5px 12px`) is the correct reference value, since this shared popover is
  now the one replacement for both legacy's native `<select>` dropdown and that hand-rolled one.
  Added `.dts-select-popover [role="option"] { padding: var(--spacing-dts-option-padding); }`,
  tokenized as `--spacing-dts-option-padding: 5px 12px` in `@theme` (and the prior round's
  `#f5f5f5` hover color retroactively tokenized too, as `--color-dts-option-hover`, for the same
  reason — a raw literal in a rule was an inconsistency with this file's own established
  `--spacing-dts-select-padding`-style precedent for legacy raw-px values). Scoped to the shared
  `.dts-select-popover` class, so this one rule covers every dropdown in the filter bar (Hazard
  type, Cluster, Specific hazard, Hazardous event status, Record status) automatically, not just the
  field that was screenshotted — verified directly: every option in all five dropdowns computes
  `padding: 5px 12px`.
- **The summary line's "X of Y" semantics** — see Decision 13 below for the current behavior and
  reasoning.

Legacy-vs-new side-by-side comparison (per this file's own Gate 9 process) uses the real
`/en/hazardous-event` page, not just the `/en/he-preview` page in isolation — running the same
set→Apply→Clear sequence on both and comparing screenshots and computed values directly, not
relying on a single page's own screenshot plus general visual impression.

**Test infrastructure for these four primitives (and `HazardousEventFilterBar`).** This repository
had no interactive-DOM test capability at all before
this change (vitest ran every file under `environment: "node"`; no jsdom/happy-dom/
`@testing-library/*` dependency existed; `6a`'s own only precedent, `Table.test.tsx`/
`Link.test.tsx`, used `renderToString` static-markup assertions only, which cannot exercise Space-
toggle, keyboard-open, typing, or arrow-key scenarios). **Human-confirmed: add real interaction-
level testing capability** rather than push all of it to the Playwright tier. New devDependencies
(zero production/runtime impact): `@testing-library/react`, `@testing-library/user-event`,
`@testing-library/dom` (peer of both), `jsdom`, and `@vitejs/plugin-react@5.2.0` (a plain JSX-
transform plugin, pinned for `vite@^7` compatibility — needed because the main `vite.config.ts`'s
`reactRouter()` plugin both rejects `.server.ts` imports under a jsdom-resolved module graph and
requires a dev-server "preamble" these isolated renders never get). A **new, separate config**,
`vitest.dom.config.ts` (mirrors the existing `vitest.integration-realdb.config.ts` one-file-per-
tier precedent, run via the new `yarn test:dom` script), carries `environment: "jsdom"` and no
`setupFiles`, scoped to an explicit file list (the four primitives' own tests plus
`HazardousEventFilterBar.test.tsx`) — not a `projects` split inside the main `vitest.config.ts`,
and not a per-file `@vitest-environment` pragma there, because the main config's shared
`setupFiles` (`tests/integration/db/setup.ts`, which imports `~/db.server`) fails under a
jsdom-resolved module graph regardless of pragma. `Table.test.tsx`/`Link.test.tsx` (and every other
existing design-system test) are unaffected — they keep running under the main config's
`renderToString`/node tier, which remains the right tool for markup-only assertions. This is a
correction to proposal.md's "Dependencies: none new" line (see that file) and to every task below
that assumed `renderToString`-only testing for these five files.

### Decision 13 — The summary line is "filtered total of role-safe unfiltered total", matching legacy's own displayed numbers

The summary line reads "Showing X of Y" where **X is the filtered total and Y is the role-safe
unfiltered total**, matching legacy's own displayed numbers exactly. This does not port legacy's
`totalCountRef` (`hazardeventlist.tsx` lines ~61-79) *mechanism* — a `useRef` that only ratchets
upward when an unfiltered view's own total exceeds its stored value, working around legacy's
pagination component re-deriving its total on every navigation in a way that could otherwise make
"of Y" visibly shrink. `6a`'s own `countAll(tenantId, filters)` (Decision 2) always reflects the
real total for the current query exactly, queried fresh on every request rather than cached
client-side, so there's no equivalent "total jumps around" problem to work around — only legacy's
end-user-visible *result* is matched, not its workaround. `ListHazardousEventsUseCase.execute()`
runs **two** `countAll` calls in parallel with `findAll`, not one:

- `totalCount` — the existing filtered count (same `filters` object as `findAll`), now the
  summary line's numerator instead of the page's own `items.length`.
- `unfilteredTotalCount` — a new second count, called with every user-chosen filter field omitted
  but the data-viewer `allowedStatuses` restriction still applied when `role === "data-viewer"`
  (the same dedicated field Decision 4 already introduced for exactly this AND-composable
  purpose — not a truly empty `{}` filter, which would leak how many DRAFT/SUBMITTED records exist
  to a role that Decision 4 exists specifically to hide that from). This is the summary line's new
  denominator.

`HazardousEventListPage.tsx` renders `t("list.showing_of_total", { filtered: totalCount, total:
unfilteredTotalCount })`. Pagination (`totalPages = Math.ceil(totalCount / pageSize)`) is
unaffected — it was already, and remains, based on the filtered count, which is the only count
that determines how many pages of filtered results actually exist.

## Risks / Trade-offs

- **[Resolved, not a residual risk] `specific_hazard`/`hips_version` row-count questions.** Both
  were open in an earlier draft of this design, pending a live-DB check this role's tools can't
  perform. Both are now resolved by **static proof from the migration SQL itself** (Decision 1):
  `specific_hazard`'s row count is guaranteed equal to `hip_hazard`'s own (a hard migration-time
  assertion would have failed otherwise), and `hips_version` is guaranteed to hold exactly one row
  (same migration, same assertion pattern). No implementation-time DB check is required.
- **[Resolved, not a residual risk] This change adds a security-relevant behavior change to
  already-merged `6a` code** (Decision 4 / Open Decision 1). The human approved fixing it now, in
  the use case, rather than deferring it to its own separate intent. →
  No further mitigation needed beyond what's already implemented: `allowedStatuses` is set by
  `ListHazardousEventsUseCase.execute()` whenever `role === "data-viewer"`, covered by the
  `list-hazardous-events` and `hazardous-event-repository-port` spec deltas' own requirements.
- **[Risk] `pendingMyAction`'s scope reduction (Open Decision 2) changes a legacy-visible checkbox's
  actual matched-record set once ported**, even though the checkbox's own label text is unchanged —
  a data-viewer-visible behavior narrowing, not purely internal. → Mitigation: named explicitly in
  proposal.md as Open Decision 2, not silently narrowed; the i18n label stays "Pending my action"
  either way (no user-visible text changes), but tasks.md's own acceptance criteria state the exact
  matched condition so a reviewer can confirm the narrowing is understood, not missed.
- **[Confirmed, accepted] `Select`/`ComboBox` React Aria popovers are a structural keyboard/DOM
  deviation from legacy's native `<select>`/hand-rolled dropdown** — same category of accepted
  deviation as `6a`'s own `Table` grid-role finding; named in Decision 9/10, not a parity gap.
- **[Risk] `EXISTS` subqueries against `workflow_instance` inside `DrizzleHazardousEventRepository.findAll`/
  `countAll` must stay inside the same condition tree `countAll` also uses** (Decision 2's shared
  condition-builder requirement) **or the summary line's "of Y" total and the actual filtered rows
  returned can silently disagree.** → Mitigation: one private `buildListConditions(tenantId,
filters)` method, called by both `findAll` and `countAll`, not two independently-maintained
  condition trees — named as its own task in tasks.md, with a dedicated test asserting `findAll`'s
  row count for a filtered query equals `countAll`'s own result for the identical filter.
- **Concurrent-callers rule**: this change introduces no new shared mutable state (no cache,
  counter, or in-memory store) — every new repository method is a stateless per-call read, same
  category `6a`'s own design.md already covered for the unfiltered case. No new "concurrent
  callers" scenario is required beyond what `list-hazardous-events`'s existing spec already
  carries forward (tenant-isolation concurrency), which this change's delta does not modify.

## Migration Plan

No DB migration. Every new query reads existing tables through new joins/`EXISTS` subqueries and
two new read-only repository methods; no schema change. Deploy is a pure code change (use case,
port, repository, two new presentation files, four new design-system primitives, one route file,
one page file, one CSS block addition). Rollback is a plain revert — no data written or shaped
differently by this change.
