## Context

See proposal.md - Why for motivation and the two ground-truth corrections to this
intent's own shorthand. Ground truth read in full before writing this document:

- `app/domains/hazardous-events/application/ports/IHazardousEventRepository.ts` — real
  signatures: `findById(id, tenantId): Promise<HazardousEvent>` (line 25, throws
  `NotFoundError` for a missing or foreign-tenant id, same-tenant-only by the port's own
  contract — not a separate check this use case needs to add);
  `findCurrentSpatialObservation(hazardousEventId, tenantId):
  Promise<SpatialObservationRecord | null>` (lines 36-40, "latest-by-`observationTime`
  reading, or `null` if none recorded yet — resolves `null`, never throws"). Both reused
  unchanged; no new port method.
- `app/domains/validation-workflow/application/ports/IWorkflowRepository.ts` — real
  signature: `findByEntity(entityId, entityType): Promise<WorkflowInstance | null>`
  (resolves `null`, never throws, when no instance exists — "diverges from
  `INoticeRepository.findById`", the port's own doc comment). No `tenantId` parameter at
  all (the port's own doc comment: "workflowInstanceTable has no countryAccountsId —
  caller's own repository scopes tenancy"), confirmed directly, not assumed secondhand —
  see Decision 3 for why this makes call ordering a real security point, not just a
  convenience.
- `app/domains/hazardous-events/application/use-cases/UpdateHazardousEvent.ts` (`4c`),
  lines 184-191 — the direct precedent for the defensive `WorkflowInstance`
  `NotFoundError`: `const existingWorkflow = await this.workflowRepository.findByEntity(
  existingEvent.id, "HE"); if (existingWorkflow === null) { throw new
  NotFoundError("WorkflowInstance", existingEvent.id); }`, with the comment "Defensive: a
  correctly-created event always has a `WorkflowInstance`." `4c`'s own design.md (Context)
  further notes this is "can never fire against a correct adapter... kept as
  defense-in-depth" — a write-path judgment this design revisits for a read path in
  Decision 2 below, not silently inherited.
- `app/domains/hazardous-events/application/use-cases/CreateHazardousEvent.ts` (`4b`) —
  the precedent this change otherwise follows for constructor order (`logger`, then
  repositories) and for trusting `findById`'s own tenant-scoping contract without a
  second, redundant equality check (unlike Notices' own `GetNoticeById.ts`, which performs
  its own defense-in-depth tenant check — a decision specific to that domain, not
  reopened here per `4b`/`4c`'s own already-settled convention; see Decision 1).
- `app/domains/hazardous-events/application/dto/HazardousEventDto.ts` — real signature:
  `toHazardousEventDto(event: HazardousEvent, workflowInstance: WorkflowInstance):
  HazardousEventDto`. No field for a spatial observation. Its own doc comment on
  `workflowStatus` ("this DTO shape is reused for any Status (`4d`)") confirms `4d` was
  always expected to reuse this mapper for workflow-status purposes — but not to extend it
  with a spatial-observation field, which the user-confirmed decision (proposal.md) keeps
  out of this file entirely.
- `app/domains/hazardous-events/application/dto/SpatialObservationDto.ts` — real
  signature: `toSpatialObservationDto(record: SpatialObservationRecord):
  SpatialObservationDto`, a pure mapper, already shipped and reused by `4g`. Reused
  unchanged here as the one new field's own mapping function.
- `app/domains/notices/application/use-cases/GetNoticeById.ts` — the only existing
  `GetXById`-shaped use case in this codebase. Confirms the `Query` naming convention
  (`GetNoticeByIdQuery { id, tenantId }`, `execute(query)`) this change follows for its own
  `GetHazardousEventByIdQuery`. Diverges from it in two ways, both deliberate: (a) no
  `XNotFoundError` subclass — the hazardous-events domain's own more recent use cases
  (`4b`/`4c`/`4g`) throw plain `NotFoundError`/`ConflictError`/`ValidationError` directly,
  never a per-entity subclass, and this change follows that more recent, now-established
  domain convention instead of Notices' own older one; (b) no independent
  tenant-equality check on the returned entity (Decision 1).
- `app/shared/errors/DomainError.ts` — real `DomainError` hierarchy: `NotFoundError(entity,
  id)` → `statusHint: 404`; `ValidationError` → 422; `AuthorizationError` → 403;
  `ConflictError` → 409. No fifth category for "the referenced related record is itself
  missing due to a data-integrity gap, not a real not-found" — the hierarchy's own `code`/
  `statusHint` pair for that situation is `NotFoundError`'s, the same one `4c` already uses
  for an identical defensive case (Decision 2).
- `_docs/refactoring-plan/hazardous-events-refactoring-roadmap.md`, "Phase M — Data
  Migration: Backfill, Validation, Rollback" (line 880, marked "execution not started")
  and, specifically, `Ma`'s own Scope text (lines 898-907): "**current approvalStatus (+
  validated/published attribution) → one initial WorkflowInstance row per event**" (line
  905-906) — read directly, not assumed from the section header alone. This confirms
  `workflow_instance`'s own backfill is genuinely planned (not merely implied by the
  section's general existence) and not yet executed. This is the real, planned mechanism
  that backfills `workflow_instance` rows for legacy `hazardous_event` rows that predate
  the new Clean-Architecture `WorkflowInstance` concept entirely (legacy's own
  `hazardousEventUpdateApprovalStatus*` functions, confirmed in `event.ts`, write an
  `approvalStatus` column directly on the `hazardous_event`/`disaster_record` row itself —
  there was never a separate workflow-instance table in the legacy model). No adapter for
  `IHazardousEventRepository` exists yet either (Phase 5, not yet built), and no route
  exists yet (Phase 6, not yet built) — so this exact gap is latent, not reachable, for as
  long as this use case stays unit-tested-only and uncalled by any real caller, exactly
  like `4b`/`4c`/`4g` before their own first real callers existed.
- `_docs/refactoring-plan/deferred-items-register.md` — no existing row names this
  interaction. Next free id at time of writing: `DEF-031`.

## Goals / Non-Goals

**Goals:**

- One `GetHazardousEventByIdUseCase.execute(query)` that loads a tenant-owned
  `HazardousEvent`, enriches it with its current `WorkflowInstance` status and current
  spatial observation (or `null`), and returns a `HazardousEventDetailDto` — reusing every
  port method and mapper this change needs unchanged (no new port surface).
- Add `HazardousEventDetailDto`/`toHazardousEventDetailDto`, the one new DTO/mapper this
  change needs, additive over `HazardousEventDto` per the user-confirmed decision.

**Non-Goals:**

- No causal-chain enrichment of any kind. The roadmap's own `4d` intent text names only
  workflow status and current spatial observation — not the event's cause/effect
  relationships. `ICausalChainRepository` is not a dependency of this use case.
- No change to `IHazardousEventRepository`, `IWorkflowRepository`, `HazardousEventDto`, or
  `toHazardousEventDto`. All four are consumed exactly as `4b`/`4c`/`4g` already
  established.
- No Drizzle adapter for anything. Both repository ports stay interface-only (their real
  adapters are Phase 5, not yet proposed), matching every Phase 4 intent's own split.
- No resolution of the Phase-M-backfill/defensive-`NotFoundError` interaction named in
  proposal.md Why and Decision 2/Risks below — flagged via `DEF-031` for a joint decision
  at (or before) whichever future intent wires a real adapter and route to this use case,
  not decided unilaterally here.
- No locale/presentation concerns of any kind — this is an application-layer use case
  returning a DTO; a future route/loader (Phase 6, per the roadmap's own routing intent)
  owns rendering.

## Decisions

### 1. No independent tenant-equality check on the returned entity — trust `findById`'s own contract, matching `4b`/`4c`, not Notices' own `GetNoticeById.ts`

**Chosen:** call `hazardousEventRepository.findById(query.id, query.tenantId)` and use its
result directly. No second check of `event.tenantId === query.tenantId`.

`IHazardousEventRepository.findById`'s own doc comment is unambiguous: "`@throws
NotFoundError` when no `HazardousEvent` exists for `id` within `tenantId`" — same-tenant
isolation is the port's own contract, not an invariant the caller must re-verify.
`4b`/`4c` both already call this same method and trust it without a second check (Context)
— this change follows that same, now-established hazardous-events-domain convention.

**Alternative considered:** add a defense-in-depth `if (event.tenantId !==
query.tenantId) throw new NotFoundError(...)` equality check, matching
`GetNoticeById.ts`'s own precedent (Context). Rejected — that defensive check was Notices'
own domain decision (`get-notice-by-id-use-case` design.md Decision, "guards against a
misconfigured or future repository adapter"), made before `4b`/`4c` established the
hazardous-events domain's own (different) convention of trusting the port's documented
contract directly. Introducing it here would mix two different trust conventions across
one domain's own use cases for no stated reason — `4b`/`4c`'s own precedent is the one
this change follows, not Notices'.

### 2. A missing `WorkflowInstance` is a defensive `NotFoundError`, mirroring `4c` unchanged — but this is a read path, and the mirror is flagged, not silently inherited

**Chosen:** `const workflowInstance = await this.workflowRepository.findByEntity(event.id,
"HE"); if (workflowInstance === null) { throw new NotFoundError("WorkflowInstance",
event.id); }` — identical in shape to `4c`'s own code (Context).

**Why this is the only implementable choice within this change's own stated boundary, not
merely the path of least resistance:** `toHazardousEventDto(event, workflowInstance)`
requires a non-`null` `WorkflowInstance` as its second parameter (Context) — there is no
way to call it with a `null`. The user-confirmed decision (proposal.md) rules out widening
`HazardousEventDto`/`toHazardousEventDto` to accept `workflowInstance: WorkflowInstance |
null` and emit `workflowStatus: Status | null` — that would require editing
`HazardousEventDto.ts` and would ripple into `CreateHazardousEvent.ts`/
`UpdateHazardousEvent.ts`'s own call sites' type expectations, the exact blast radius the
user-confirmed decision exists to avoid. Given that constraint, the `DomainError` hierarchy
(Context) offers exactly one category whose semantics fit "a required related record is
absent": `NotFoundError`. There is no "data-integrity defect" or "internal" category in
this codebase's error vocabulary (ADR-003's own two-category split is "operational"
(`DomainError` subclasses) vs. "programmer error" (a plain, uncaught `Error`) — and a plain
`Error` here would be a worse outcome, an unhandled 500 with no structured `code`/
`statusHint`/`i18nKey` for the presentation layer to render, for a condition this use case
can at least name precisely).

**Why this is flagged, not simply accepted:** `4c`'s own "can never fire against a correct
adapter" reasoning is sound for *its own write path* — `4b` always creates a
`WorkflowInstance` atomically alongside any event `4c` could later update, so a correctly
operating system never reaches `4c`'s own null branch. **This use case is different: once
a real adapter exists, it will also be the read path for every event that predates the new
`WorkflowInstance` concept entirely** — i.e., every row created before the Clean
Architecture migration, which the roadmap's own "Phase M" (Context, "execution not
started") exists specifically to backfill. For those rows, `findByEntity` resolving `null`
is not a defect at all — it is the expected, common state of an as-yet-unmigrated legacy
row. Mirroring `4c`'s "defensive, can-never-fire" framing onto this use case's own doc
comment would misdescribe a real, reachable production path as unreachable.

**Resolution for this change:** implement the mirrored behavior above (no other option is
available without reopening the DTO boundary decision), but do not carry over `4c`'s own
"can never fire" comment — this use case's own doc comment instead says plainly that a
`null` here currently means either (a) a genuine data-integrity defect, or (b) a
not-yet-backfilled legacy row, and that these two cases are indistinguishable from inside
this use case today. **`DEF-031` records this for the human reviewer** (proposal.md
Impact): the register entry names that this interaction must be resolved — one way or the
other — before any real route exposes this use case to end users serving pre-migration
data, not before this change itself is merged (this change stays inert, uncalled by any
real caller, exactly like `4b`/`4c`/`4g` before their own first real callers existed).

**Alternatives considered and rejected for this change's own scope (not foreclosed for a
future change, once the user decides):**

1. **Widen `HazardousEventDto`/`toHazardousEventDto` to accept a nullable
   `WorkflowInstance`.** Rejected — directly conflicts with the user-confirmed "zero
   changes to `HazardousEventDto.ts`" decision (proposal.md). Would need to be revisited
   together with that decision, not unilaterally here.
2. **Return a sentinel/degraded DTO (e.g. `workflowStatus: null`) via
   `HazardousEventDetailDto` only, bypassing `toHazardousEventDto` entirely for this one
   field.** Rejected — `HazardousEventDetailDto` is additive *over* `toHazardousEventDto`'s
   own output (proposal.md's own stated shape); re-deriving `workflowStatus` independently
   inside `toHazardousEventDetailDto` would duplicate `toHazardousEventDto`'s field-mapping
   responsibility for one field, the exact duplication the additive-DTO decision exists to
   avoid.
3. **Throw a plain, uncaught `Error` instead of `NotFoundError`.** Rejected — loses the
   structured `code`/`statusHint`/`i18nKey` every other `DomainError` subclass gives the
   presentation layer, for no benefit; ADR-003's "programmer error" category is for
   genuinely unexpected bugs, not a named, anticipated gap this design document now
   documents precisely.

### 3. Sequential reads, not `Promise.all` — `findById` first, every later call keyed off `event.id`, not `query.id`

```
1. assertNonEmptyString(query.tenantId, "tenantId")
   assertNonEmptyString(query.id, "id")
2. event = await hazardousEventRepository.findById(query.id, query.tenantId)
   -- NotFoundError propagates for a missing or foreign-tenant id (Decision 1). Zero
      further repository calls happen if this throws.
3. workflowInstance = await workflowRepository.findByEntity(event.id, "HE")
   -- IF null: throw NotFoundError("WorkflowInstance", event.id) (Decision 2)
4. currentObservation = await hazardousEventRepository.findCurrentSpatialObservation(
     event.id, query.tenantId)
   -- null or a SpatialObservationRecord; never throws
5. logger.info({ msg: "hazardous_event.fetched", hazardousEventId: event.id,
     tenantId: query.tenantId, hasCurrentSpatialObservation: currentObservation !== null })
6. return toHazardousEventDetailDto(event, workflowInstance, currentObservation)
```

Three real repository calls, run sequentially (not `Promise.all`), each keyed off
`event.id` (the id `findById` itself resolved) rather than the raw `query.id` input from
step 2 onward. Two reasons, both load-bearing, not merely stylistic:

- **Fail-fast with a deterministic "zero further calls" guarantee — this is the actual
  security/correctness property, and it comes from sequencing, not from which id is
  passed.** Running the three calls sequentially, with `findById` first, means a missing
  or cross-tenant `query.id` throws before `findByEntity`/`findCurrentSpatialObservation`
  ever run — a property the spec's own failure scenario asserts via call-count assertions
  on the fakes, matching `4c`'s own "zero writes of any kind" precedent applied here to
  "zero further reads." `Promise.all` would start all three calls concurrently, making
  this guarantee non-deterministic (a slower `findById` wouldn't prevent the other two
  from having already been dispatched) — this is the real reason `Promise.all` is
  rejected, independent of which id each call is given. `IWorkflowRepository` has no
  `tenantId` parameter of any kind (Context) — `findByEntity`'s own tenant isolation
  depends entirely on only ever being called after `findById` has already confirmed
  `query.id` belongs to `query.tenantId`; this change's sequential ordering is what
  provides that, not the specific id value passed once that check has already passed.
- **Canonical id, not a security measure in itself.** Using `event.id` (the entity
  `findById` itself resolved) rather than echoing back the raw `query.id` string follows
  `4b`'s own established precedent ("captures the fetched entity's own id, so a cause
  whose canonical stored form differs cosmetically from the caller's input still links
  correctly") — by the time `event.id` is available, `query.id` has already been validated
  against `query.tenantId` by the preceding `findById` call, so this choice is about using
  the canonical, already-resolved identifier consistently, not an additional security
  control.

### 4. `HazardousEventDetailDto`: an additive wrapper, not a retrofit — spreads `toHazardousEventDto`'s own output

```ts
// app/domains/hazardous-events/application/dto/HazardousEventDetailDto.ts
import type { HazardousEvent } from "../../domain/HazardousEvent";
import type { WorkflowInstance } from "~/domains/validation-workflow/domain/WorkflowInstance";
import type { SpatialObservationRecord } from "../ports/IHazardousEventRepository";
import type { HazardousEventDto } from "./HazardousEventDto";
import { toHazardousEventDto } from "./HazardousEventDto";
import type { SpatialObservationDto } from "./SpatialObservationDto";
import { toSpatialObservationDto } from "./SpatialObservationDto";

/**
 * HazardousEventDto plus the current spatial observation, for the single-event detail
 * view (4d). A separate, additive type rather than a field added to HazardousEventDto
 * itself -- CreateHazardousEvent.ts/UpdateHazardousEvent.ts never need this field, and a
 * future list use case (4e) must stay observation-free to avoid an N+1 per row
 * (proposal.md Why).
 */
export interface HazardousEventDetailDto extends HazardousEventDto {
	currentSpatialObservation: SpatialObservationDto | null;
}

/** Pure mapper -- wraps toHazardousEventDto's own output rather than duplicating its
 * field-mapping logic; adds the one field toHazardousEventDto was never given. */
export function toHazardousEventDetailDto(
	event: HazardousEvent,
	workflowInstance: WorkflowInstance,
	currentObservation: SpatialObservationRecord | null,
): HazardousEventDetailDto {
	return {
		...toHazardousEventDto(event, workflowInstance),
		currentSpatialObservation:
			currentObservation === null
				? null
				: toSpatialObservationDto(currentObservation),
	};
}
```

`interface HazardousEventDetailDto extends HazardousEventDto` (not an intersection type,
not a hand-duplicated field list) — the simplest shape that stays automatically in sync
with `HazardousEventDto`'s own fields as they evolve, and reads directly as "everything
`HazardousEventDto` has, plus one more field," matching the proposal's own stated intent.

**Alternatives considered:**

- **Add `currentSpatialObservation` directly to `HazardousEventDto`,
  `toHazardousEventDto` taking a third parameter.** Rejected — the user-confirmed decision
  (proposal.md) rules this out explicitly: it would force `CreateHazardousEvent.ts`/
  `UpdateHazardousEvent.ts` to pass a value (or widen the parameter to optional/nullable)
  for a field neither use case has or needs, and would saddle a future `4e`
  (`ListHazardousEvents`) with the same field on every paginated row.
- **A standalone, fully independent interface (no `extends`), hand-duplicating every
  `HazardousEventDto` field.** Rejected — the "wrap, don't duplicate" instruction
  (proposal.md) is specifically about the *mapper's* logic, but duplicating the *type's*
  field list would carry the identical drift risk one layer up (a future field added to
  `HazardousEventDto` silently not reaching `HazardousEventDetailDto`'s own declared
  shape) for no benefit over `extends`.

## Risks / Trade-offs

- **[Risk] The Phase-M-backfill/defensive-`NotFoundError` interaction named in Decision
  2.** A missing `WorkflowInstance` throws `NotFoundError` (404-shaped) for an event that
  genuinely exists, once this use case is wired to a real adapter and route serving
  pre-migration data. → Mitigation: not fixed in this change (Decision 2's own
  alternatives-considered list explains why no in-scope fix exists without reopening the
  user-confirmed DTO-boundary decision). `DEF-031` names this concretely, targeted at
  whichever future intent first wires a real `IHazardousEventRepository` adapter and route
  to this use case — that intent must either confirm Phase M's backfill has already run
  for all tenants by then, or revisit this error-handling decision before going live, not
  silently inherit today's convention.
- **[Risk] Inherent read skew across three independent, non-atomic reads — no shared
  mutable state this use case itself owns, so the project's "concurrent callers" rule for
  caches/counters/queues does not literally apply, but a related consistency gap exists.**
  A concurrent write (e.g. a `RecordSpatialObservationUseCase` call, or an
  `UpdateHazardousEventUseCase` call bundling one) landing between this use case's own
  step 2 (`findById`) and step 4 (`findCurrentSpatialObservation`) can produce a returned
  `HazardousEventDetailDto` whose `HazardousEvent` fields reflect the state *before* that
  write and whose `currentSpatialObservation` reflects the state *after* it (or
  vice-versa). → Mitigation: accepted, not prevented — this is an inherent property of
  composing independent reads with no whole-call transaction (no port in this codebase
  offers one), the same class of risk `4c`'s own Decision 6 already accepts for composing
  an independent *write* call; not tracked as a new register row, since no use case built
  so far in this domain provides cross-call read consistency and this change does not
  regress that baseline. This use case holds no class-level or module-level mutable state
  of its own — the mandatory "concurrent callers" spec scenario below instead proves two
  concurrent `execute()` calls for *different* ids do not cross-contaminate (no shared
  state leaks between them), matching `GetNoticeById.ts`'s own analogous scenario
  (Context), rather than a check-then-act race this use case's pure-read shape does not
  have.

## Migration Plan

None. Application-layer TypeScript only (one new use case, one new DTO/mapper) — no
schema change, no data migration, no feature flag, no infrastructure-layer adapter in this
change. Inert until a future route/handler intent (Phase 6, per the roadmap) calls
`GetHazardousEventByIdUseCase`, exactly as `4b`/`4c`/`4g`'s own use cases remain inert
until their own future callers exist.
