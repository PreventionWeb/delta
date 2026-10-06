## Context

See proposal.md - Why for motivation and the ground-truth findings relative to this
intent's own shorthand. Ground truth read in full before writing this document:

- `app/domains/hazardous-events/application/ports/IHazardousEventRepository.ts` — real
  signature: `findAll(tenantId, pagination): Promise<HazardousEvent[]>` (line 28),
  tenant-scoped, paginated, plain array (no total-count envelope — `Pagination`'s own
  shape, `app/shared/types/Pagination.ts`, is `{ page: number; pageSize: number }` only).
  Reused unchanged; no new port method.
- `app/domains/validation-workflow/application/ports/IWorkflowRepository.ts` — real
  signature: `findByEntityIds(entityIds, entityType): Promise<WorkflowInstance[]>`
  (line 15), the port's own doc comment: "omits entities with no instance rather than
  returning nulls." No `tenantId` parameter (line 6: "caller's own repository scopes
  tenancy"). Confirmed, not merely documented: `IWorkflowRepository.test.ts` line 57,
  "findByEntityIds returns only the instances that exist, omitting a missing one in the
  middle" is a real, passing test against the port contract. Reused unchanged.
- `app/domains/hazardous-events/application/dto/HazardousEventDto.ts` — real signature:
  `toHazardousEventDto(event: HazardousEvent, workflowInstance: WorkflowInstance):
  HazardousEventDto`, mandatory non-null second parameter, `workflowStatus: Status`
  (mandatory, not nullable). Two real call sites (`CreateHazardousEvent.ts`,
  `UpdateHazardousEvent.ts`) — this change's own extraction (Decision 3) leaves both
  untouched, since `toHazardousEventDto`'s exported signature and behavior don't change.
- `app/domains/hazardous-events/application/dto/HazardousEventDto.test.ts` — exercises
  only the exported `toHazardousEventDto` function (three tests: full field mapping incl.
  `Status` passthrough, nullable-`Date`-field handling, non-hardcoded `workflowStatus`),
  never any internal implementation detail. This is this change's own regression proof for
  Decision 3's internal extraction — it is read but not modified by this change, and must
  still pass unchanged (task 1.2).
- `app/domains/hazardous-events/application/dto/HazardousEventDetailDto.ts` (`4d`) — the
  additive-DTO precedent this change otherwise follows: `interface ... extends
  HazardousEventDto`, mapper spreads `toHazardousEventDto`'s own output plus one new
  field. This change's own field (`workflowStatus`) is not new — it's an existing field
  that needs widening from mandatory to nullable, which this exact mechanical pattern
  cannot do (Decision 2).
- `app/domains/hazardous-events/application/use-cases/GetHazardousEventById.ts` (`4d`) —
  confirmed merged into this branch (`feature/he-ca-phase4`). Its Decision 2/3 are the
  direct precedent for (a) a `DomainError`-vocabulary judgment about a missing
  `WorkflowInstance` and (b) sequencing a tenant-scoped lookup before a lookup that has no
  `tenantId` parameter of its own. This change's own Decision 5 revisits (a) for a list
  shape, where the missing-instance case is data to return, not an error to throw.
- `app/domains/hazardous-events/application/use-cases/UpdateHazardousEvent.ts` — real
  precedent for `Omit<X, "field">` already existing in this codebase (line 50,
  `spatialObservation?: Omit<RecordSpatialObservationCommand, "tenantId" |
  "hazardousEventId">`), confirming `Omit` is an established pattern here, not a novel
  introduction.
- `app/domains/notices/application/use-cases/ListNotices.ts`/`.test.ts` — the only
  existing `ListX`-shaped use case in this codebase. Confirms: flat `{ tenantId, page,
  pageSize }` query shape, no pagination validation at this layer, `findAll` called with a
  `Pagination` object built from the query, mapped via the domain's own DTO mapper,
  `[]` for zero results (no special-casing), a single `logger.info` call naming `count`,
  and a "two concurrent calls for different tenants don't cross-contaminate" scenario —
  this change's own structural template.
- `app/domains/notices/presentation/parsePagination.ts` — real, live code: clamps
  `page`/`pageSize` (default 1/20, `pageSize` capped at 100) from the URL, **before**
  `ListNoticesUseCase` is ever called. This is the only place any `page`/`pageSize` bound
  is enforced anywhere in Notices' own real code — `ListNoticesUseCase` itself trusts its
  caller entirely. Re-examined against Clean Architecture validation guidance rather than
  taken as settled precedent (Decision 6): this turns out to be a gap in Notices' own
  design (a use case with two real callers, each independently relying on the same
  presentation-layer helper to enforce a rule the use case itself never checks), not a
  pattern this change should copy forward. Confirmed at both of `ListNoticesUseCase`'s two real
  call sites, not just one: the React Router loader,
  `app/routes/$lang+/_authenticated+/notices+/_index.tsx` lines 6-18 (`parsePagination(new
  URL(request.url))`, then `getAppContext().get(ListNoticesUseCase)`), and the NestJS
  `GET /` handler, `app/domains/notices/presentation/NoticesController.server.ts` line 79
  (`list()`, same `parsePagination` import). Both call the identical shared function
  rather than each owning a separate clamp.
- `_docs/refactoring-plan/deferred-items-register.md` row `DEF-031` (line 58) — current
  text names only `GetHazardousEventByIdUseCase`'s defensive `NotFoundError`. No other row
  in the full table (DEF-001 through DEF-031, read in full) concerns `findAll` ordering,
  pagination bounds, or list views generally — this change's own finding is a genuine
  extension of `DEF-031`'s root cause, not a duplicate of any other row, and no other row
  needs folding in.
- `_docs/refactoring-plan/hazardous-events-refactoring-roadmap.md` line 1350-1374 (`4e`
  section) — read directly: "Returns an empty array, not an error, for a tenant with no
  events" and "`findByEntityIds` is called exactly once per page regardless of page size,
  not once per row; empty array for zero results." Decision 4 below states precisely where
  this change's own behavior diverges from that literal wording, and why.

## Goals / Non-Goals

**Goals:**

- One `ListHazardousEventsUseCase.execute(query)` that loads a tenant-scoped, paginated
  page of `HazardousEvent`s, attaches each row's current workflow status where
  determinable via exactly one batched lookup per non-empty page, and returns a
  `HazardousEventListItemDto[]` preserving `findAll`'s own row order — reusing every port
  method this change needs unchanged (no new port surface).
- Add `HazardousEventListItemDto`/`toHazardousEventListItemDto`, the one new DTO/mapper
  this change needs, additive over `HazardousEventDto` (Decision 2), sharing its field
  mapping with `toHazardousEventDto` via a small internal extraction inside
  `HazardousEventDto.ts` rather than duplicating it (Decision 3, human-reviewer decision).
- Widen `DEF-031`'s existing row to name this use case's own manifestation of the same
  root cause.
- `execute()` itself enforces `page`/`pageSize` bounds (positive integer; `pageSize` capped
  at 100) and throws `ValidationError` otherwise — a use-case-boundary business rule, not
  left solely to a future presentation-layer caller (Decision 6, corrected from this
  document's own earlier, uncritical adoption of Notices' precedent).

**Non-Goals:**

- No spatial-observation enrichment of any kind — `4d`'s own proposal.md Why already
  states the N+1 reasoning for why a list view must stay observation-free; this change
  does not reopen that.
- No causal-chain enrichment. `ICausalChainRepository` is not a dependency of this use
  case.
- No change to `IHazardousEventRepository` or `IWorkflowRepository` — both ports are
  consumed exactly as `4b`/`4c`/`4d`/`4g` already established, no new port method.
- No change to `toHazardousEventDto`'s own exported signature or behavior — it is called
  identically by its two existing call sites (`CreateHazardousEvent.ts`,
  `UpdateHazardousEvent.ts`) after this change as before (Decision 3). The internal
  reorganization inside `HazardousEventDto.ts` (extracting `mapHazardousEventFields`) is
  in scope; a change to what that file exports *publicly* or what any existing caller
  receives is not.
- No URL query-string *parsing* or *defaulting* at this layer (e.g. turning a missing
  `page` parameter into `1`) — that stays presentation-layer work, same as Notices'
  `parsePagination.ts` (Decision 6). This change's own use-case-level guard is a bounds
  check on already-typed numbers, not a reimplementation of that parsing/defaulting logic.
- No Drizzle adapter for anything. Both repository ports stay interface-only (Phase 5).
- No resolution of the Phase-M-backfill interaction this change's own findings extend —
  `DEF-031`'s widened text continues to target "whichever future intent first wires a real
  adapter and route," not this change.
- No locale/presentation concerns — a future route/loader (Phase 6) owns rendering.

## Decisions

### 1. Query shape and no-op path: flat `ListHazardousEventsQuery`, matching `ListNoticesQuery` exactly; skip the workflow call entirely for an empty page

```ts
export interface ListHazardousEventsQuery {
	tenantId: string;
	page: number;
	pageSize: number;
}
```

`execute()`:

```
1. assertNonEmptyString(query.tenantId, "tenantId")
2. assertValidPagination(query.page, query.pageSize)
   -- Decision 6: Number.isInteger(page) && page >= 1, and
      Number.isInteger(pageSize) && pageSize >= 1 && pageSize <= 100.
      Throws ValidationError otherwise. Zero repository calls happen if this throws.
3. events = await hazardousEventRepository.findAll(query.tenantId,
     { page: query.page, pageSize: query.pageSize })
4. dtos = []
5. IF events.length > 0:
     -- No findByEntityIds call at all for an empty page (Decision 4).
     ids = events.map(e => e.id)
     workflowInstances = await workflowRepository.findByEntityIds(ids, "HE")
     -- Exactly one call, for a non-empty page only.
     byId = new Map(workflowInstances.map(wi => [wi.entityId, wi]))
     dtos = events.map(e => toHazardousEventListItemDto(e, byId.get(e.id) ?? null))
     -- Preserves findAll's own order (map over events, not over workflowInstances).
6. missingWorkflowStatusCount = dtos.filter(d => d.workflowStatus === null).length
7. logger.info({ msg: "hazardous_events.listed", tenantId: query.tenantId,
     count: dtos.length, missingWorkflowStatusCount })
   -- One log call site for both the empty-page and non-empty-page paths.
8. RETURN dtos
```

Matches `ListNoticesUseCase`'s own shape (Context) with three additions: the `page`/
`pageSize` bounds guard (Decision 6, corrected from this document's own earlier default of
matching Notices' unvalidated pass-through), the batched workflow-status join, and
`missingWorkflowStatusCount` in the log (Decision 7). An earlier draft of this pseudocode
had two separate log-call steps (one for the empty-page return, one for the normal path);
the implementation unifies these into the one call site shown above — same event shape,
same values in both cases, no change to the batched-call skip Decision 4 requires.

### 2. `HazardousEventListItemDto`: `interface ... extends Omit<HazardousEventDto, "workflowStatus">` — keeps `4d`'s interface-extends style, widens via `Omit` first

```ts
export interface HazardousEventListItemDto
	extends Omit<HazardousEventDto, "workflowStatus"> {
	workflowStatus: Status | null;
}
```

**Why not `interface HazardousEventListItemDto extends HazardousEventDto` directly,
`4d`'s own literal pattern:** TypeScript does not allow an extending interface to
redeclare an inherited property with an incompatible (wider) type — `workflowStatus:
Status | null` is not assignable to the parent's `workflowStatus: Status`, so extending
`HazardousEventDto` itself is a compile error, not a style choice. This is a genuine
structural difference from `4d`'s own case (proposal.md): `4d` only ever *added* a field
(`currentSpatialObservation` never existed on `HazardousEventDto`); this change needs to
*widen* a field that already exists there.

**Why `extends Omit<HazardousEventDto, "workflowStatus">`, not a plain intersection type
(`Omit<...> & {...}`):** extending an `Omit<>` of the conflicting property first removes
it from the base before the new, wider declaration is added — no conflict remains, so
`extends` compiles. This keeps `4d`'s own `interface ... extends` style (Decision 4
there: "the simplest shape that stays automatically in sync with `HazardousEventDto`'s own
fields as they evolve") rather than switching to an intersection type, while still
achieving the widening `extends HazardousEventDto` alone cannot. `Omit<...>` itself already
has a precedent in this codebase (`UpdateHazardousEvent.ts` line 50, Context) — not a novel
introduction.

**Alternatives considered:**

- A plain intersection type, `Omit<HazardousEventDto, "workflowStatus"> & { workflowStatus:
  Status | null }`, with no `interface`/`extends` at all. Equivalent at the type level, but
  diverges from `4d`'s own stated style preference for an `interface`/`extends` declaration
  for this exact kind of additive DTO without a stated reason to diverge — rejected in
  favor of matching that precedent.
- A fully standalone interface, hand-duplicating every `HazardousEventDto` field with
  `workflowStatus` typed correctly from the start. Rejected — identical drift risk to the
  one `4d`'s own Decision 4 already rejected this for: a future field added to
  `HazardousEventDto` would silently not reach this type. The `extends Omit<>` shape stays
  automatically in sync with every field except the one being deliberately widened.

### 3. `toHazardousEventListItemDto`: shares a new, internal `mapHazardousEventFields(event)` helper extracted inside `HazardousEventDto.ts` — resolved by the human reviewer, not a field-by-field duplication

**Why `toHazardousEventDto` cannot be called directly for the null-`WorkflowInstance`
case, unlike `4d`'s spread:** `toHazardousEventDto(event, workflowInstance)` requires a
non-null `WorkflowInstance` as its second parameter (Context) — there is no value that can
be passed for a row `findByEntityIds` omitted. `4d`'s own mapper spreads
`toHazardousEventDto`'s *output*, which presupposes that output can always be produced;
this change's own null case cannot produce it at all. Fabricating a placeholder
`WorkflowInstance` just to call the mapper and then overriding `workflowStatus` to `null`
was considered and rejected — that is exactly the "fabricated status" the user's own
chosen design (proposal.md) rejects in substance, even though the fabricated value would
never be read; it manufactures a well-formed `WorkflowInstance` for a row that has none,
which is misleading at the call site and brittle if `toHazardousEventDto` ever reads a
second field off it.

**Resolved (human-reviewer decision, overriding this document's own earlier default of a
field-by-field duplication + parity test):** extract the field-mapping logic
`toHazardousEventDto` already has into a small, internal helper inside
`HazardousEventDto.ts` itself, and have both `toHazardousEventDto` and
`toHazardousEventListItemDto` call it — rather than duplicating that logic in the new
file.

```ts
// app/domains/hazardous-events/application/dto/HazardousEventDto.ts

/** Internal field-mapping core shared by every HazardousEventDto-shaped mapper in this
 * module (currently toHazardousEventDto and, cross-file, toHazardousEventListItemDto).
 * Exported for that cross-file reuse, but not part of this module's stable, documented
 * DTO surface — callers outside this domain's own additive-DTO mappers should use
 * toHazardousEventDto/toHazardousEventDetailDto/toHazardousEventListItemDto instead. */
export function mapHazardousEventFields(
	event: HazardousEvent,
): Omit<HazardousEventDto, "workflowStatus"> {
	return {
		id: event.id,
		tenantId: event.tenantId,
		specificHazardId: event.specificHazardId,
		startDate: event.startDate,
		endDate: event.endDate,
		nationalSpecification: event.nationalSpecification,
		description: event.description,
		chainsExplanation: event.chainsExplanation,
		magnitude: event.magnitude,
		recordOriginator: event.recordOriginator,
		dataSource: event.dataSource,
		hazardousEventStatus: event.hazardousEventStatus,
		specificHazardLocalName: event.specificHazardLocalName,
		specificHazardNationalName: event.specificHazardNationalName,
		apiImportId: event.apiImportId,
		createdByUserId: event.createdByUserId,
		updatedByUserId: event.updatedByUserId,
		submittedByUserId: event.submittedByUserId,
		submittedAt: event.submittedAt?.toISOString() ?? null,
		createdAt: event.createdAt.toISOString(),
		updatedAt: event.updatedAt?.toISOString() ?? null,
		hazardDriverIds: event.hazardDriverIds,
		attachments: event.attachments,
		fieldValues: event.fieldValues,
		customFieldValues: event.customFieldValues,
	};
}

export function toHazardousEventDto(
	event: HazardousEvent,
	workflowInstance: WorkflowInstance,
): HazardousEventDto {
	return {
		...mapHazardousEventFields(event),
		workflowStatus: workflowInstance.status,
	};
}
```

```ts
// app/domains/hazardous-events/application/dto/HazardousEventListItemDto.ts
import { mapHazardousEventFields } from "./HazardousEventDto";

export function toHazardousEventListItemDto(
	event: HazardousEvent,
	workflowInstance: WorkflowInstance | null,
): HazardousEventListItemDto {
	return {
		...mapHazardousEventFields(event),
		workflowStatus: workflowInstance?.status ?? null,
	};
}
```

**On "non-exported":** TypeScript requires the `export` keyword for a function to be
importable from another file, so `mapHazardousEventFields` is a real module export — it
cannot be literally non-exported and still be callable from
`HazardousEventListItemDto.ts`. What the human reviewer's framing captures is that it is
not part of this module's *stable, documented, public* DTO surface (which remains
`HazardousEventDto`/`toHazardousEventDto`, unchanged) — the same spirit as other shared
internal helpers already in this codebase (e.g. `assertNonEmptyString.ts`, Context: a
exported utility function, not a domain concept, used only by sibling use-case files
within the same domain). The doc comment above states this explicitly so a future reader
doesn't mistake it for a second blessed public mapper.

**Why this is a materially narrower "touch" than the "zero changes to
`HazardousEventDto.ts`" constraint (proposal.md) was actually protecting against, per the
human reviewer's review of this document:** that constraint was stated in `4d`'s context
to avoid forcing `CreateHazardousEvent.ts`/`UpdateHazardousEvent.ts` to adapt to a
*changed external contract* (a different parameter list or return shape on
`toHazardousEventDto`) for a field neither call site needs. This refactor changes neither:
`toHazardousEventDto`'s exported signature, parameter types, and return shape are
byte-for-byte identical before and after extraction — only its own internal
implementation is reorganized. `HazardousEventDto.test.ts` (Context), which exercises only
the exported `toHazardousEventDto` function as a black box, is the regression proof: it is
not modified by this change (task 1.2) and must still pass unchanged afterward, which it
can only do if the exported contract truly didn't move.

**Correcting this document's own earlier "independent field mappings" analogy, per the
human reviewer:** the original default (a standalone, duplicated field-by-field mapper in
the new file) was justified above by analogy to "this codebase already accepts
`CreateHazardousEvent.ts`'s/`UpdateHazardousEvent.ts`'s own independent field mappings
rather than sharing one." That analogy does not hold: `4b` and `4c` both already call the
*same* `toHazardousEventDto` mapper (Context) — they do not each maintain their own
duplicate of its field-mapping logic. The real precedent in this codebase is sharing one
mapper across call sites, not duplicating it — which points toward this extraction, not
away from it. The field-by-field-duplication-plus-parity-test approach this document
previously defaulted to was, on reflection, the one divergence from that precedent, not
the one in keeping with it.

**Alternative considered and rejected (this document's own earlier default, now
superseded):** a field-by-field reimplementation of `toHazardousEventDto`'s own mapping
logic directly inside `HazardousEventListItemDto.ts`, pinned against drift by a parity
test comparing its output field-by-field to `toHazardousEventDto`'s own output. Rejected
now that the "zero changes to `HazardousEventDto.ts`" constraint is understood to permit a
signature/behavior-preserving internal extraction (above) — the parity test was a
mitigation for a duplication this extraction removes at the source; maintaining both the
duplication and a test to guard it is strictly worse than not duplicating at all.

### 4. Skip the batched workflow lookup entirely for an empty page — a deliberate, justified deviation from the roadmap's own literal wording

The roadmap's own `4e` test-tier text (Context) says `findByEntityIds` is called "exactly
once per page regardless of page size." This change calls it **zero times** when
`findAll` itself returns zero rows, not once with an empty array. Reasons:

- `IWorkflowRepository.findByEntityIds`'s own contract does not define behavior for an
  empty `entityIds` array — no existing test (`IWorkflowRepository.test.ts`, Context)
  exercises this input. A future real adapter's `WHERE entity_id IN ()` is
  driver-dependent (some drivers reject an empty `IN` list outright); calling the port
  with an empty array for no reason is a needless, untested edge this change can simply
  avoid by construction.
- There is no row to enrich — the call's entire purpose (attach workflow status to each
  row on the page) is vacuous when the page has no rows.

Both cases are specified precisely in the spec: zero rows → zero calls, `[]`, one log
event with `count: 0`; one or more rows → exactly one call. This satisfies the roadmap's
own real intent (never a per-row lookup, one batched call for the page) without taking its
"regardless of page size" wording to the literal, untested extreme of `pageSize === 0`
rows.

### 5. A missing `WorkflowInstance` for a list row is data (`workflowStatus: null`), not an error — a list-shaped resolution of the same question `4d`'s Decision 2 answered differently for a single row

`4d`'s own `GetHazardousEventByIdUseCase` throws a defensive `NotFoundError` when
`findByEntity` resolves `null` for a single, already-resolved event (its own Decision 2).
This change does not mirror that for a list: the proposal's own user-confirmed decision
rejects both "exclude the row" and "fail the whole page," leaving "return the row with
`workflowStatus: null`" as the only remaining, already-settled option — this is a
restatement for context, not a decision made in this document (proposal.md owns it).
What this design document adds: the DTO-boundary mechanics (Decisions 2-3) and the
`missingWorkflowStatusCount` log field (Decision 7) that make the resulting
data-integrity gap observable in aggregate, matching the proposal's own stated
migration-visibility goal.

### 6. `execute()` itself enforces page/pageSize bounds — Notices' own precedent checked against Clean Architecture guidance, not copied uncritically, and found to be a gap, not a pattern

**This document previously stated "no pagination validation at this layer — matches
`ListNoticesUseCase`."** That description of the Notices precedent was accurate
(`ListNoticesUseCase` really does pass `page`/`pageSize` straight through unvalidated;
`parsePagination.ts`, Notices' own presentation layer, really is the only place any
clamping happens, Context) — but, per the project's own "Notices precedent isn't gospel"
standing rule, the precedent itself was re-checked against Clean Architecture guidance
rather than copied on authority alone, and it does not hold up:

- A use case must validate its own input and never trust its caller, precisely because a
  use case can have more than one caller/adapter — any input validity rule the use case
  itself depends on belongs at the use-case boundary, not solely in whichever
  presentation-layer adapter happens to call it first. (See e.g. "Where to put validation
  in Clean Architecture so it's obvious, fast, and never leaks,"
  <https://medium.com/@michaelmaurice410/where-to-put-validation-in-clean-architecture-so-its-obvious-fast-and-never-leaks-161bfd62f1dc>;
  <https://ikenox.info/blog/where-to-put-validation-in-clean-architecture/>.) One source
  addresses the pagination case specifically: "Pagination depth limits (maximum offsets)
  can be declared as business rules in the service but applied by the controller. The
  recommended approach is to move validation to the use case, where the controller passes
  raw page/page_size values, and the use case constructs the Pagination with its limits"
  (<https://github.com/michaelcoll/arcane-exchange/issues/414>).
- Notices itself already demonstrates the gap this creates, not just in theory: it has
  **two** real callers of `ListNoticesUseCase` (Context) — the React Router loader and the
  NestJS controller — each separately calling `parsePagination()` before invoking the use
  case. The bounds-checking is already duplicated at the presentation layer across both
  callers, with nothing inside the use case itself catching an out-of-bounds value if a
  future third caller (or a bug in either existing one) skips that step. This is a real,
  already-latent gap in Notices' own design, not a deliberately chosen pattern worth
  propagating to a new domain.

**The resolving distinction, and what stays unchanged:** *parsing* (a raw URL
query-string value → a typed number, with an HTTP-specific default when the parameter is
absent) is legitimately presentation-layer work — `parsePagination.ts` keeps doing exactly
that, unchanged, no complaint with it. *Enforcing the actual bounds* (page must be a
positive integer; pageSize must be a positive integer, capped at some sane maximum) is a
business rule, and belongs at the use-case boundary — the same defensive-input philosophy
this exact domain already applies to every other field this change and its predecessors
touch (`assertNonEmptyString` for `tenantId`/`id` in `4b`/`4c`/`4d` and this change's own
tenantId check, Context).

**Chosen:** `ListHazardousEventsUseCase.execute()` asserts, before calling `findAll()`:
`query.page` is an integer `>= 1`, and `query.pageSize` is an integer `>= 1` and `<= 100`
— throwing `ValidationError` otherwise. `100` is not a new number invented for this
change: it is the same cap `parsePagination.ts` already enforces (Context), chosen
specifically so the two layers agree on one bound rather than each asserting its own.
`query.page`/`query.pageSize` arrive at `execute()` already as numbers (the
`ListHazardousEventsQuery` shape, Decision 1) — this is a numeric bounds guard on values
already parsed, not a reimplementation of `parsePagination.ts`'s own string-parsing/
defaulting logic, which stays exactly where it is.

**What does not change:** `parsePagination.ts` itself is not touched by this change (it
belongs to the Notices domain and is out of this change's own scope regardless); a future
hazardous-events route (Phase 6, not yet built) still needs its own equivalent
parsing/defaulting helper for turning URL query-string values into numbers before calling
this use case (Context: both the React Router loader and `HazardousEventsController`'s own
future `GET /`, roadmap line ~2026) — this change's own bounds guard does not remove the
need for that presentation-layer parsing step, it adds a second, use-case-level
enforcement behind it, matching the Clean Architecture guidance above (controller
parses/passes raw values; use case enforces the actual business-rule bounds).

**Alternative considered and rejected:** leave validation solely in a future
hazardous-events presentation-layer helper, matching Notices' own precedent literally.
Rejected per the above — this is exactly the gap Notices' own two-caller reality already
exposes, and this domain's own established convention (defensive input assertions inside
`execute()` itself, not deferred to the caller) argues against repeating it here.

### 7. Log a `missingWorkflowStatusCount`, not per-row ids

`logger.info({ msg: "hazardous_events.listed", tenantId, count, missingWorkflowStatusCount
})` — the aggregate count directly serves the proposal's own stated reason for choosing
`workflowStatus: null` over silent exclusion (visibility into migration progress), without
logging individual event ids (no operational need established for that, and it would bloat
a per-request log line for a large page).

**Naming note:** `"hazardous_events.listed"` (plural domain prefix) follows
`ListNoticesUseCase`'s own `"notices.listed"` naming for a *list*-shaped log event
(Context) — a deliberate, scoped divergence from this domain's own singular
per-entity convention (`"hazardous_event.created"`, `"hazardous_event.fetched"`), which
names a single resolved entity, not a result set. Both conventions already coexist in this
codebase (Notices' plural-list vs. hazardous-events' singular-entity logs); this change
follows the one that matches its own shape (a list), not the one that matches its own
domain name.

## Risks / Trade-offs

- **[Risk] `mapHazardousEventFields` is a second, cross-file-reachable export out of
  `HazardousEventDto.ts` with a narrower intended audience than its visibility enforces
  (Decision 3).** TypeScript's `export` keyword is all-or-nothing per consumer — nothing
  stops a future file outside this domain's own additive-DTO mappers from importing
  `mapHazardousEventFields` directly, bypassing `toHazardousEventDto`/
  `toHazardousEventListItemDto` entirely and reintroducing the "scattered field mapping"
  problem this extraction exists to avoid. → Mitigation: the doc comment on
  `mapHazardousEventFields` itself states plainly that it is not part of this module's
  public DTO surface; no stronger enforcement (e.g. a lint rule restricting cross-file
  imports) exists in this codebase today (DEF-025, Context: no ESLint config exists at
  all) to make this structural, not just documented. Not a new risk class for this
  codebase — every other "internal, shared-by-convention-only" helper here (e.g.
  `assertNonEmptyString.ts`) already relies on the same doc-comment-only convention.
- **[Risk] Extends `DEF-031`'s own named production-readiness gap to a new caller.** Once
  a real adapter and route exist, every page containing a pre-migration legacy event will
  show `workflowStatus: null` for that row — and, per `4d`'s own unresolved Decision 2,
  that same event's *detail* view will throw a 404 via `GetHazardousEventByIdUseCase`'s
  defensive `NotFoundError` until Phase M's backfill runs. A future Phase 6 list-to-detail
  navigation (roadmap line ~1878) would let a user click into a row the list itself
  successfully rendered and hit a 404. → Mitigation: not fixed in this change (same
  reasoning as `4d`'s own Decision 2 — no in-scope fix exists without reopening the
  `HazardousEventDto.ts` boundary decision for `4d` too, not just this change). `DEF-031`'s
  widened text (proposal.md Impact) names this list/detail inconsistency explicitly, so
  whichever future intent resolves it sees the full shape of the problem, not just `4d`'s
  half.
- **[Risk] Non-atomic read across `findAll` and `findByEntityIds` — same class of read
  skew `4d`'s own Risks already accepts, not a new regression.** A concurrent write
  landing between the two calls can attach a workflow status reflecting a state slightly
  newer or older than the `HazardousEvent` fields on that row. → Mitigation: accepted, not
  prevented — no port in this codebase offers a cross-call transaction boundary (same
  baseline `4d`'s own Risks already established); not tracked as a new register row. The
  mandatory "concurrent callers" spec scenario instead proves two concurrent `execute()`
  calls for *different tenants* do not cross-contaminate (each tenant's own `findAll`/
  `findByEntityIds` pair stays isolated to that tenant's own ids), matching
  `ListNoticesUseCase`'s own analogous scenario (Context).

## Open Questions

None. The one genuinely open question this document previously carried here — field-by-
field mapper + parity test vs. an internal shared-helper extraction inside
`HazardousEventDto.ts` — has been resolved by the human reviewer (Decision 3): extract
`mapHazardousEventFields(event)` inside `HazardousEventDto.ts`, exported for cross-file
reuse but documented as not part of that module's stable public DTO surface, and have both
`toHazardousEventDto` and `toHazardousEventListItemDto` call it. `toHazardousEventDto`'s
own exported signature and behavior are unchanged; `HazardousEventDto.test.ts` is the
regression proof and is itself unchanged by this decision (task 1.2 verifies it still
passes). See Decision 3 for the full reasoning, including the corrected "shared mapper,
not duplicated" precedent from `4b`/`4c`.

## Migration Plan

None. Application-layer TypeScript only (one new use case, one new DTO/mapper, one
existing register row widened) — no schema change, no data migration, no feature flag, no
infrastructure-layer adapter in this change. Inert until a future route/handler intent
(Phase 6, per the roadmap) calls `ListHazardousEventsUseCase`, exactly as `4b`/`4c`/`4d`/
`4g`'s own use cases remain inert until their own future callers exist.
