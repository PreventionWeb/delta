## Context

See proposal.md - Why for motivation and the four corrections to this intent's own shorthand.
Ground truth read in full before writing this document:

- `app/domains/hazardous-events/domain/HazardousEvent.ts` — real signatures: `static
create(props, validHazardDriverIds, validCustomFieldDefinitionIds): HazardousEvent`, private
  constructor, no `update()` method of any kind. The existing ordering check (lines 292-298):
  `if (props.endDate != null && props.endDate.trim().length > 0 && props.startDate >
props.endDate) throw ValidationError(...)` — a raw string comparison, no format check at all
  today (`DEF-020`).
- `app/domains/hazardous-events/domain/CausalChain.ts` — real signatures:
  `assertCausalLinkDoesNotCreateCycle(existingEdges, causeId, effectId): void` (throws
  `ConflictError` for self-cause or a confirmed cycle, `ValidationError` for traversal-cap
  exceeded). No temporal-order function exists yet.
- `app/domains/hazardous-events/application/use-cases/CreateHazardousEvent.ts` (`4b`) — the
  precedent this change follows for constructor order, write order, error propagation, and the
  `causeId` tenant-scoping decision (its own Decision 4, reused unchanged here — see proposal.md
  Why). Its own comment on the cycle check: "Can never fire against a correct adapter (a fresh id
  has no edges) — kept as defense-in-depth so a future update use case reuses the same convention."
  **This change is that future update use case** — unlike `4b`, the cycle check here is real and
  can genuinely fail, because the event being updated already exists and may already have real
  outgoing edges (it may already be the cause of other events).
- `app/domains/hazardous-events/application/use-cases/RecordSpatialObservation.ts` (`4g`) — the
  collaborator this change injects. Its own `execute(command)` first calls
  `hazardousEventRepository.findById(command.hazardousEventId, command.tenantId)` — meaning this
  use case's own prior `findById` call for the same event is not reusable across the boundary
  (Decision 6).
- `app/domains/hazardous-events/application/ports/IHazardousEventRepository.ts` — `findById`
  (throws `NotFoundError`, same-tenant-scoped), `save` (insert-or-update, entity's own `tenantId`
  carries tenancy). No new method needed here.
- `app/domains/hazardous-events/application/ports/ICausalChainRepository.ts` —
  `findReachableEdgesFrom(nodeId)`, `saveEdge(edge, causalityExplanation)`. No read-current-cause
  method and no delete method exist. `app/domains/hazardous-events/infrastructure/
hazardousEventCausalityTable.ts` confirms there is **no `UNIQUE` constraint** on
  `effectHazardousEventId` (only non-null FKs + a cause≠effect `CHECK`) — the table itself permits
  multiple causes per effect; see Decision 5 for why this change still implements
  singular-replace semantics.
- `app/domains/hazardous-events/application/ports/IHazardTaxonomyRepository.ts` — unchanged,
  reused exactly as `4b` uses it, just fed the **merged** (not command-only) id collections
  (Decision 3).
- `app/domains/validation-workflow/application/ports/IWorkflowRepository.ts` —
  `findByEntity(entityId, entityType): Promise<WorkflowInstance | null>`. This use case needs this
  purely as a read, to satisfy `toHazardousEventDto(event, workflowInstance)`'s mandatory second
  parameter — this use case never writes to `IWorkflowRepository` (no workflow-status transition
  of any kind happens here, see Non-Goals).
- `app/domains/hazardous-events/application/dto/HazardousEventDto.ts` — reused as-is, no change.
  `toHazardousEventDto(event, workflowInstance)` already accepts any `WorkflowInstance`, not just a
  freshly-created DRAFT one (its own doc comment: "this DTO shape is reused for any Status
  (`4d`)").
- `app/backend.server/models/event.ts:785-1009` (`hazardousEventUpdate`) — read in full, not
  assumed, for three real behaviors this change ports deliberately:
  - `fields: Partial<HazardousEventFields>` — genuine partial-patch, not full-resubmit (Decision 2).
  - `fields.parent !== undefined` gates the entire parent-handling block (self-ref, tenant, cycle,
    temporal, relationship-table write) — `undefined` means "don't touch the causal link at all,"
    not merely "keep the same value" (Decision 2/4).
  - Lines 937-956: `fields.parent !== undefined` always deletes the existing
    `event_relationship` row first, then re-inserts only `if (fields.parent)` — i.e. `null` clears
    with no replacement. This is the direct precedent for `causeId`'s tri-state contract
    (Decision 4) and for `deleteCauseEdges` always running before any replacement insert
    (Decision 5).
- `app/backend.server/models/event.ts:1425-1506` (`validateTemporalCausality`) and
  `app/backend.server/utils/dateFilters.ts:9-42` (`parseFlexibleDate`) — read in full for the
  exact rule this change ports (Decision 1/2): only `startDate` on both sides, equality allowed,
  no-op when either date fails format validation, and the format rule's own precise asymmetry
  (the 1900-2100 year-range check applies **only** to a bare `YYYY` string — `parseFlexibleDate`
  does not apply any range check to `YYYY-MM` or `YYYY-MM-DD` inputs; confirmed by reading the
  function's branching directly, not inferred).
- **Correction (post-review, 2026-10-01): `event.ts:1513-1537` (`normalizeDateForComparison`) —
  re-read in full after a reviewer found a real bug in this document's own prior Decision 7.**
  `validateTemporalCausality` (above) does not compare `parentStartDate`/`childStartDate` as raw
  strings — it calls `normalizeDateForComparison` on **both** first (`event.ts:1481-1485`), which
  floor-pads `YYYY` → `YYYY-01-01` and `YYYY-MM` → `YYYY-MM-01` before comparing. A raw-string
  comparison of two zero-padded dates is **not** equivalent to this whenever one side is a
  longer, more-precise string that is a literal prefix-extension of the other (e.g.
  `"2020-01-01"` vs `"2020"`: raw compare says `>` and would wrongly throw; legacy's own
  normalized compare says equal). Confirmed by direct enumeration (82,369 valid-pair
  combinations swept in Node, `sweep.js`, 2026-10-01), not asserted from prose: floor-padding
  both sides before comparing produces **zero** divergences from `normalizeDateForComparison`
  across the full sweep. Decision 7 below is corrected to floor-pad, replacing the prior
  (wrong) "provably equivalent raw lexical compare" claim.
- `app/backend.server/utils/dateFilters.ts:50-106` (`createDateCondition`), specifically
  **lines 60-75** — the directional padding this change ports for Decision 8's intra-event
  check: floor (`gte`/lower-bound) pads to the earliest point of the period, ceiling
  (`lte`/upper-bound) pads to the **actual last day of that month** via
  `new Date(year, month, 0).getDate()` (correctly handles Feb/leap years for realistic years;
  Decision 8's own worked examples below). `HazardousEvent.create()`'s own `startDate`/`endDate`
  check is the same shape one level down (a lower bound and an upper bound of one event, not a
  DB range filter), so the same directional logic applies, not `normalizeDateForComparison`'s
  floor-only rule (which is only correct when both operands are startDates, as they are in
  Decision 7 — `endDate` here is a genuine upper bound and needs the ceiling, not the floor).
- `_docs/refactoring-plan/hazardous-events-phase0-audit-findings.md` — finding 0b#5 (create never
  runs cycle/temporal checks, confirmed correct and not ported to `4b`), finding 4 under 0a ("only
  blocks when both... have a `startDate` set" — consistent with Decision 1's no-op rule), finding
  5 under 0a (parent-link replace-wholesale behavior — Decision 4's direct precedent).
- `_docs/decisions/ADR-002-timezone-handling.md`, "Partial and Uncertain Dates" (lines 100-110,
  re-read in full for this update, not cited from memory) — **now the authoritative, PM-confirmed
  source for the date format this change enforces**, not merely an inference from legacy code:
  "**Accepted input string format (confirmed with PM/team, 2026-10-01):** `YYYY-MM-DD`,
  zero-padded, with `YYYY-MM` or `YYYY` accepted for partial precision... `\"2026-9-1\"` is **not**
  a valid input... This matches `app/backend.server/utils/dateFilters.ts`'s existing
  `parseFlexibleDate` validation, which already enforces exactly this rule." This confirms, from
  the PM/team decision itself rather than only from reading `parseFlexibleDate`'s own code, that
  porting `parseFlexibleDate`'s exact format rule (Decision 1) is the *correct* format to enforce
  here, not merely a convenient one to copy. ADR-002 also names the real fix this change does
  **not** attempt: "a raw, unvalidated string comparison... is not sufficient on its own" is
  resolved for `hazardous_event` only by the full `TIMESTAMPTZ` + precision-enum migration
  (`DEF-028`) — this change's own format-gated, floor/ceiling-normalized comparison (Decision 8)
  is an interim, narrower correctness fix within the existing `TEXT` column, not a substitute for
  that migration.
- `_docs/refactoring-plan/deferred-items-register.md` — `DEF-012` (cross-tenant causality
  sharing, reused unchanged from `4b`, not reopened), `DEF-020` (closed narrowly by this change,
  per its own already-recorded text), `DEF-026` (`4b`'s own non-transactional multi-write risk —
  this change extends the same class, Decision 6/Risks), `DEF-028` (ADR-002 precision-enum
  migration, confirmed out of scope — this change reuses `parseFlexibleDate`'s existing format
  rule, not the future `TIMESTAMPTZ` model). Next free id at time of writing: `DEF-029`.
- Empirically confirmed in this session (not assumed) via a direct Node check of `new Date(...)`
  on the exact inputs `parseFlexibleDate` validates:
  - `"2026-02-30"` → `2026-03-02T00:00:00.000Z` (rolls over, **not** `Invalid Date`).
  - `"2026-04-31"` → rolls over to `2026-05-01`, same pattern.
  - `"2026-13-01"` / `"2026-00-01"` (out-of-range month) → `Invalid Date`, correctly rejected.
  - `"1899-12-31"` / `"2101-01-01"` (full-date form, outside the 1900-2100 band) → **valid**,
    confirming the year-range check does not apply to the full-date form.
  `parseFlexibleDate` itself discards the parsed `Date` and returns the original string unchanged
  once `isNaN(date.getTime())` is `false` — so a day-overflow string like `"2026-02-30"` is
  accepted as "valid format" and compared **as the literal string**, never silently corrected to
  `"2026-03-02"`. This change's shared predicate must replicate this exact permissiveness, not a
  "more correct" version of it — see Decision 1.

## Goals / Non-Goals

**Goals:**

- One `UpdateHazardousEventUseCase.execute(command)` that merges a partial-patch command over an
  existing, tenant-owned `HazardousEvent`, re-validates it via `HazardousEvent.create()`,
  conditionally re-validates a changed causal link (cycle + temporal order), persists, applies the
  causal-link change, optionally delegates a bundled spatial reading to
  `RecordSpatialObservationUseCase`, and returns a `HazardousEventDto`.
- Add the temporal-order domain check (`CausalChain.ts`) and the shared format predicate
  (`flexibleDateFormat.ts`), and apply the same format predicate to `HazardousEvent.create()`'s
  existing ordering check, closing `DEF-020` narrowly.
- Add `ICausalChainRepository.deleteCauseEdges(effectId)`, the one new port method this change
  needs.

**Non-Goals:**

- No workflow-status transition. This use case never calls `IWorkflowRepository.save()` — it reads
  the existing `WorkflowInstance` once, purely to satisfy `toHazardousEventDto`'s required second
  parameter. Whether an event in a given workflow status may be field-edited at all (e.g. after
  `APPROVED`) is a different concern, not addressed by this change or named anywhere in the
  roadmap's own intent for `4c`.
- No re-validation of the temporal invariant for events this one **causes** (i.e. where this event
  is the cause/parent of some other effect). Confirmed from legacy: `hazardousEventUpdate`'s
  temporal check only ever validates the event being updated against **its own** `causeId`, never
  against any event it is itself the cause of. Moving this event's `startDate` later than a
  downstream effect's `startDate` is not checked by legacy and is not checked here — not a new gap
  this change introduces.
- No support for a caller re-triggering the cycle/temporal re-check against an **unchanged**
  existing `causeId` purely because `startDate` changed. A command that omits `causeId` entirely
  is "leave the causal link untouched" (Decision 2), full stop — matching the partial-patch
  contract applied uniformly, not a special case for this one field. A caller that wants the
  temporal invariant re-verified on every resave must resupply the current `causeId` value
  explicitly, exactly as legacy's own real caller (the web form, which resends the full current
  state on every save) already does in practice.
- No new `IHazardousEventRepository` or `IHazardTaxonomyRepository` methods, and no change to
  `HazardousEventDto`. All three are consumed exactly as `4b`/`4g` already established.
- No Drizzle adapter for anything. `ICausalChainRepository` stays interface-only (its real adapter
  is `5i`, not yet proposed), matching every Phase 4 intent's own split.
- No resolution of the `ICausalChainRepository` TOCTOU race this change's own concurrent-callers
  test documents (Risks) — proving propagation, not prevention, matching `4g`'s own precedent for
  its analogous race (`3d`'s inherited risk, `4g` design.md Decision 6).
- No multi-cause (more than one simultaneous `causeId` per effect) support of any kind. See
  Decision 5.

## Decisions

### 1. `flexibleDateFormat.ts`: one shared predicate plus two normalizers, as a Shared Kernel under `app/domains/shared/`, not per-domain — a deliberate departure from this codebase's usual convention

**Location correction (post-review, 2026-10-01, superseding an earlier draft of this same
correction):** the file lives at `app/domains/shared/domain/flexibleDateFormat.ts`, not nested
under `app/domains/hazardous-events/domain/`, and **not** under `app/shared/` either.
`app/shared/` (per ADR-009) is reserved for genuinely technical cross-cutting infrastructure —
`DomainError`, `ILogger`, i18n resolvers, generic types — swappable per-implementation concerns.
The date-format/precision rule is not that: it is a DDD "Shared Kernel" case — a domain/business
rule (ADR-002's own precision model) deliberately shared across multiple bounded contexts (HE now,
Disaster Records/Disaster Events later per `DEF-029`), which carries a different governance
expectation (changes need every dependent domain's agreement, not one domain's unilateral PR) than
swapping a logger implementation. `app/domains/shared/domain/` places this pseudo-context under
the identical per-context layering ADR-009 already establishes for `hazardous-events`/`notices`/
`validation-workflow` (`domain/`, `application/` if ever needed, confirmed real directories for
all three existing contexts), rather than a flat grab-bag. `CausalChain.ts` and `HazardousEvent.ts`
import this module as `~/domains/shared/domain/flexibleDateFormat` (`~/*` → `app/*`, confirmed
from `tsconfig.json`). ADR-009 has been amended, outside this change's own implementation, to
record this new `app/domains/shared/` convention and its distinct governance rule.

```ts
// app/domains/shared/domain/flexibleDateFormat.ts
export function isValidFlexibleDateFormat(value: string): boolean {
	if (/^\d{4}$/.test(value)) {
		const year = Number(value);
		return year >= 1900 && year <= 2100;
	}
	if (/^\d{4}-\d{2}$/.test(value) || /^\d{4}-\d{2}-\d{2}$/.test(value)) {
		return !Number.isNaN(new Date(value).getTime());
	}
	return false;
}

/**
 * Floor-pads to the earliest point of the period a flexible date string represents:
 * `YYYY` -> `YYYY-01-01`, `YYYY-MM` -> `YYYY-MM-01`, `YYYY-MM-DD` unchanged. Ports legacy's own
 * `normalizeDateForComparison` (`event.ts:1513-1537`) exactly. Assumes the caller has already
 * confirmed `isValidFlexibleDateFormat(value)` is true (same precondition pattern as that
 * predicate's own two consumers) -- undefined behavior on an unvalidated input is not guarded
 * against here, matching this codebase's existing precondition convention elsewhere.
 */
export function normalizeFlexibleDateFloor(value: string): string {
	if (/^\d{4}$/.test(value)) return `${value}-01-01`;
	if (/^\d{4}-\d{2}$/.test(value)) return `${value}-01`;
	return value;
}

/**
 * Ceiling-pads to the latest point of the period a flexible date string represents:
 * `YYYY` -> `YYYY-12-31`, `YYYY-MM` -> the real last day of that month (leap-year aware via
 * `new Date(year, month, 0).getDate()`), `YYYY-MM-DD` unchanged. Ports the directional-padding
 * half of `createDateCondition`'s own `lte` branch (`dateFilters.ts:60-75`) exactly. Same
 * precondition as `normalizeFlexibleDateFloor`.
 */
export function normalizeFlexibleDateCeiling(value: string): string {
	if (/^\d{4}$/.test(value)) return `${value}-12-31`;
	if (/^\d{4}-\d{2}$/.test(value)) {
		const year = parseInt(value.substring(0, 4), 10);
		const month = parseInt(value.substring(5, 7), 10);
		const lastDay = new Date(year, month, 0).getDate();
		return `${value}-${String(lastDay).padStart(2, "0")}`;
	}
	return value;
}
```

`isValidFlexibleDateFormat` ports `parseFlexibleDate`'s exact rule (Context), now also the
PM/team-confirmed accepted format per ADR-002's "Partial and Uncertain Dates" (Context —
`YYYY-MM-DD`/`YYYY-MM`/`YYYY`, zero-padded, confirmed 2026-10-01) as a boolean predicate: the
three regex shapes, the year-range check applied **only** to the bare-`YYYY` branch (not to
`YYYY-MM`/`YYYY-MM-DD` — confirmed asymmetry, Context), and the same `new Date(value)` validity
gate for the other two branches, which **accepts** a day-overflow string like `"2026-02-30"`
(rolls over internally but the function only checks `isNaN`, discarding the rolled-over value)
rather than rejecting it. This exact permissiveness is preserved deliberately, not "fixed" —
`DEF-020`'s own scope is the comparison-correctness bug, not a general tightening of what counts
as a valid date string; a stricter version here would silently reject legacy data this change has
no mandate to touch.

`normalizeFlexibleDateFloor`/`normalizeFlexibleDateCeiling` port `normalizeDateForComparison`/
`createDateCondition`'s own directional-padding logic (Context) — added in this revision to fix a
real correctness bug in this document's own prior Decision 7 and to replace Decision 8's prior
raw, unnormalized comparison. See Decisions 7/8 for each one's own worked examples and the direct
enumeration sweep confirming equivalence to legacy.

One edge case ported unchanged, not newly introduced: `normalizeFlexibleDateCeiling` on a
`YYYY-MM` string whose year is reinterpreted by JS's own two/three-digit-year `Date` constructor
rule (years `0`-`99` map to `1900`-`1999`, e.g. `"0000-02"` → `new Date(0, 2, 0)` → Feb 1900, 28
days, not the proleptic-Gregorian 29 a year `0000` would really have) inherits this quirk directly
from `createDateCondition`'s own identical `new Date(year, month, 0)` call — not a new bug this
port introduces, and out of scope to fix here (such a year is already outside the realistic range
this system models; `isValidFlexibleDateFormat`'s own 1900-2100 range check does not apply to the
`YYYY-MM`/`YYYY-MM-DD` branches at all, Context).

This codebase's established convention for a single-line predicate (e.g. `isInvalidDate`,
duplicated per file in both `HazardousEvent.ts` and `SpatialObservation.ts`, "redefined locally...
to keep each entity/use-case file independently auditable") is deliberately **not** followed here.
Two real reasons:

1. **The logic is not trivial** — three regex branches plus an asymmetric range check, not a
   one-line `instanceof`/`NaN` test. Duplicating it risks the exact failure mode the proposal's own
   ground truth explicitly warns against: "one consistent format rule applied in both places, not
   two different ad hoc rules." A future edit to one copy (e.g. widening the year range) silently
   not reaching the other copy is a real, likely drift, not a hypothetical one.
2. **Both consumers (`HazardousEvent.ts`'s ordering check, `CausalChain.ts`'s new temporal check)
   need to agree on exactly the same answer for the same input** — unlike `isInvalidDate`, where
   each file's own local copy only ever needs to agree with itself.

**Alternatives considered:**

- **Duplicate the predicate in both files**, matching `isInvalidDate`'s precedent exactly.
  Rejected for the two reasons above — this is a correctness-risk trade-off the trivial-predicate
  convention doesn't carry.
- **Import `app/backend.server/utils/dateFilters.ts`'s real `parseFlexibleDate` directly.**
  Rejected — that file lives in `app/backend.server/`, outside any Clean Architecture domain
  boundary; importing it from `app/domains/shared/domain/` would be a direct layering violation
  this refactor exists to eliminate, not reintroduce. `flexibleDateFormat.ts` ports the *rule*,
  not the *file*.
- **Keep it nested under `app/domains/hazardous-events/domain/`** (this document's own prior
  location). Rejected on review — both current consumers are HE-domain files, but the rule itself
  is domain-agnostic (a generic partial-date format), and `DEF-029` names a real second domain
  (Disaster Records) that needs the identical rule today, under its own non-conforming regex. A
  domain-nested location would force that future migration to either duplicate the rule or import
  across a domain boundary.
- **Place it under `app/shared/` (technical infrastructure), alongside `~/shared/errors`/
  `~/shared/i18n`.** Rejected on further review — this rule is a shared *domain/business* concept
  (ADR-002's own precision model), not a swappable technical implementation detail; `app/shared/`'s
  own governance (per ADR-009) doesn't fit a rule that multiple bounded contexts must agree on
  changing together. `app/domains/shared/domain/` is the DDD "Shared Kernel" placement instead.

### 2. `UpdateHazardousEventCommand`: partial-patch, `undefined` means unchanged — confirmed from the real legacy signature, not assumed

```ts
export interface UpdateHazardousEventCommand {
	id: string;
	tenantId: string;
	actingUserId: string;
	specificHazardId?: string;
	startDate?: string;
	endDate?: string;
	nationalSpecification?: string;
	description?: string;
	chainsExplanation?: string;
	magnitude?: string;
	recordOriginator?: string;
	dataSource?: string;
	hazardousEventStatus?: HazardousEventStatus | null;
	specificHazardLocalName?: string | null;
	specificHazardNationalName?: string | null;
	hazardDriverIds?: readonly string[];
	attachments?: readonly HazardousEventAttachmentProps[];
	fieldValues?: readonly HazardousEventFieldValueProps[];
	customFieldValues?: readonly HazardousEventCustomFieldValueProps[];
	/** Tri-state: `undefined` (key omitted) = leave the causal link unchanged; `null` or `""` =
	 * clear it; a non-empty string = set/replace it. See Decision 4. */
	causeId?: string | null;
	/** Only meaningful when `causeId` resolves to "set" — matches `4b`'s own doc comment for the
	 * identical field, ignored otherwise. */
	causalityExplanation?: string | null;
	/** Bundled spatial reading for this same submission. `tenantId`/`hazardousEventId` are always
	 * supplied by this use case itself (Decision 6), never by the caller. */
	spatialObservation?: Omit<
		RecordSpatialObservationCommand,
		"tenantId" | "hazardousEventId"
	>;
}
```

No `apiImportId`, `id` (duplicated as the top-level `id`), `createdAt`, `createdByUserId`,
`submittedByUserId`, `submittedAt` — these are never settable via this command (Decision 3). Every
other scalar/collection field is optional; `command.field === undefined` means "leave the existing
entity's value for this field unchanged," matching `hazardousEventUpdate`'s own
`Partial<HazardousEventFields>` contract exactly (Context). An explicit `null` on a nullable field
(`hazardousEventStatus`, `specificHazardLocalName`, `specificHazardNationalName`) is a real,
distinct value — "set this field to null" — not "leave unchanged"; only the literal absence of the
key (`undefined`) means unchanged. This is the direct, confirmed answer to this intent's own first
open design question (full-replace vs. partial-patch): **partial-patch**, because that is what the
real system this change replaces already does, and because the roadmap's own stated goal ("keeps
the web form's single save submission working exactly like today") is best served by matching the
contract the form's real caller already relies on, not inventing a stricter one.

Each present collection field (`hazardDriverIds`, `attachments`, `fieldValues`,
`customFieldValues`) is, when present, a **full replacement of that one collection** — not a
per-element merge against the existing collection. This is `4g`'s own "full-collection replace,
not a merge" principle (its Decision 4), applied here one level down: at the per-*field*
granularity (a field is either entirely carried over or entirely replaced), not at the
per-*element* granularity within a replaced collection.

### 3. Merge, re-validate, reconstruct — `apiImportId`/`id`/`tenantId`/`createdAt`/`createdByUserId`/`submittedByUserId`/`submittedAt` always carried from the existing entity

```
1. assertNonEmptyString(command.tenantId, "tenantId")
   assertNonEmptyString(command.id, "id")
   assertNonEmptyString(command.actingUserId, "actingUserId")
2. existingEvent = await hazardousEventRepository.findById(command.id, command.tenantId)
   -- NotFoundError propagates for a missing or foreign-tenant id (same-tenant-only, matching 4b
      Decision 4's own causeId precedent, applied here to the event being updated itself).
3. existingWorkflow = await workflowRepository.findByEntity(existingEvent.id, "HE")
   -- IF null: throw NotFoundError("WorkflowInstance", existingEvent.id) -- defensive, can never
      fire against a correct adapter since 4b always creates one atomically alongside the event
      (same "kept as defense-in-depth" convention 4b's own comment uses for its cycle check).
      Run here, before any merge/validation work, so a data-integrity defect fails fast with
      zero partial writes -- not discovered only when building the return value at the end.
4. causeAction = resolveCauseAction(command)  -- see Decision 4
5. mergedHazardDriverIds = command.hazardDriverIds !== undefined
     ? command.hazardDriverIds : existingEvent.hazardDriverIds
   mergedCustomFieldValues = command.customFieldValues !== undefined
     ? command.customFieldValues : existingEvent.customFieldValues
   customFieldDefinitionIds = extractCustomFieldDefinitionIds(mergedCustomFieldValues)
6. validHazardDriverIds = await taxonomyRepository.findValidHazardDriverIds(
     toSafeStringArray(mergedHazardDriverIds), command.tenantId)
   validCustomFieldDefinitionIds = await taxonomyRepository.findValidCustomFieldDefinitionIds(
     customFieldDefinitionIds, command.tenantId)
   -- Fed the MERGED collections, not command.hazardDriverIds/customFieldValues alone: an id
      carried over unchanged from the existing entity is re-checked for validity exactly like a
      newly-submitted one. The existing entity's own cached ids are never assumed still valid
      (proposal.md Correction 1) -- a hazard driver or custom field definition could have been
      deactivated/removed from the tenant's taxonomy between the original create and this update.
7. now = new Date()
   updatedEvent = HazardousEvent.create({
     id: existingEvent.id,
     tenantId: existingEvent.tenantId,
     specificHazardId: command.specificHazardId !== undefined
       ? command.specificHazardId : existingEvent.specificHazardId,
     startDate: command.startDate !== undefined
       ? command.startDate : existingEvent.startDate,
     endDate: command.endDate ?? existingEvent.endDate,
     nationalSpecification: command.nationalSpecification ?? existingEvent.nationalSpecification,
     description: command.description ?? existingEvent.description,
     chainsExplanation: command.chainsExplanation ?? existingEvent.chainsExplanation,
     magnitude: command.magnitude ?? existingEvent.magnitude,
     recordOriginator: command.recordOriginator ?? existingEvent.recordOriginator,
     dataSource: command.dataSource ?? existingEvent.dataSource,
     hazardousEventStatus: command.hazardousEventStatus !== undefined
       ? command.hazardousEventStatus : existingEvent.hazardousEventStatus,
     specificHazardLocalName: command.specificHazardLocalName !== undefined
       ? command.specificHazardLocalName : existingEvent.specificHazardLocalName,
     specificHazardNationalName: command.specificHazardNationalName !== undefined
       ? command.specificHazardNationalName : existingEvent.specificHazardNationalName,
     apiImportId: existingEvent.apiImportId,
     createdByUserId: existingEvent.createdByUserId,
     updatedByUserId: command.actingUserId,
     submittedByUserId: existingEvent.submittedByUserId,
     submittedAt: existingEvent.submittedAt,
     createdAt: existingEvent.createdAt,
     updatedAt: now,
     hazardDriverIds: mergedHazardDriverIds,
     attachments: command.attachments !== undefined
       ? command.attachments : existingEvent.attachments,
     fieldValues: command.fieldValues !== undefined
       ? command.fieldValues : existingEvent.fieldValues,
     customFieldValues: mergedCustomFieldValues,
   }, validHazardDriverIds, validCustomFieldDefinitionIds)
   -- ValidationError propagates for any shape/ordering violation on the MERGED props, exactly
      the same factory 4b/4g already call.
8. IF causeAction.kind === "set":
     cause = await hazardousEventRepository.findById(causeAction.causeId, command.tenantId)
       -- NotFoundError, same-tenant-only (4b Decision 4, unchanged)
     edges = await causalChainRepository.findReachableEdgesFrom(updatedEvent.id)
       -- UNLIKE 4b, this can be genuinely non-empty: updatedEvent.id already exists and may
          already be the cause of other events (Context).
     assertCausalLinkDoesNotCreateCycle(edges, cause.id, updatedEvent.id)
       -- ConflictError (self-cause or real cycle) / ValidationError (traversal cap) propagate
     assertCauseStartsNoLaterThanEffect(cause.startDate, updatedEvent.startDate)
       -- ConflictError propagates (Decision 2's new function)
9. saved = await hazardousEventRepository.save(updatedEvent)
10. IF causeAction.kind === "clear": await causalChainRepository.deleteCauseEdges(saved.id)
    IF causeAction.kind === "set":
      await causalChainRepository.deleteCauseEdges(saved.id)
      await causalChainRepository.saveEdge(
        { causeId: cause.id, effectId: saved.id },
        command.causalityExplanation ?? null)
    IF causeAction.kind === "unchanged": no causality-table write of any kind
11. IF command.spatialObservation !== undefined:
      await recordSpatialObservationUseCase.execute({
        ...command.spatialObservation,
        tenantId: command.tenantId,
        hazardousEventId: saved.id,
      })
      -- Errors from this call (ValidationError/ConflictError/NotFoundError) propagate unmodified
         -- see Decision 6 for why this can surface AFTER saved is already committed.
12. logger.info({ msg: "hazardous_event.updated", hazardousEventId: saved.id,
      tenantId: command.tenantId, causeAction: causeAction.kind,
      spatialObservationIncluded: command.spatialObservation !== undefined })
13. return toHazardousEventDto(saved, existingWorkflow)
```

Steps 1-3 run first and read-only, so a malformed id, a missing/cross-tenant event, or a missing
`WorkflowInstance` is caught before any merge/validation work. Steps 5-7 build and validate the
full merged entity **before** any causal-link check (step 8) or any write (steps 9-11) — matching
`4b`'s own "construct/validate fully, then check cause-specific rules, then write" ordering.
`updatedEvent.id` in step 8 is `existingEvent.id` (unchanged) — the cycle/temporal checks run
against the **real, potentially non-empty** edge set for this already-existing node, which is the
central way this change's cycle check differs from `4b`'s (Context).

**Correction (post-review): step 10 now saves the edge with `cause.id` (the entity `findById`
resolved in step 8), not the raw `causeAction.causeId` input** — matching `4b`'s own precedent
("uses the fetched cause entity's own id for the saved edge, not the raw causeId input"). Step 11
now spreads `command.spatialObservation` first, with `tenantId`/`hazardousEventId` applied after —
so those two fields always win even if a caller smuggles same-named keys past the command's
compile-time-only `Omit` type, matching this decision's own stated intent below.

### 4. `causeId` tri-state: `undefined` = unchanged, `null`/`""` = clear, a string = set — direct precedent from legacy's own `fields.parent` handling

```ts
type CauseAction =
	| { kind: "unchanged" }
	| { kind: "clear" }
	| { kind: "set"; causeId: string };

function resolveCauseAction(command: UpdateHazardousEventCommand): CauseAction {
	const { causeId } = command;
	if (causeId === undefined) {
		return { kind: "unchanged" };
	}
	if (causeId === null || causeId === "") {
		return { kind: "clear" };
	}
	if (typeof causeId !== "string") {
		throw new ValidationError("causeId must be a string or null when present");
	}
	return { kind: "set", causeId };
}
```

Three states, not two — this is the direct, confirmed answer to this intent's other open design
question (does update support removing an existing cause). Legacy's own
`hazardousEventUpdate` (Context) proves removal is already supported today: `fields.parent !==
undefined` gates the whole block, and inside it, `fields.parent` falsy (specifically `null` in
legacy's own type) deletes the existing `event_relationship` row with no re-insert. Porting this
behavior is required by Invariant 2 (no silent behavior change) — omitting removal support here
would be a real regression against the system this change replaces, not a neutral scope
narrowing.

`""` is treated identically to `null` (both resolve to `"clear"`), reinterpreting `4b`'s own
`resolveCauseId` convention (where `""` and `undefined` are both "absent, no cause") for the
three-state model this update needs: `undefined` is reserved exclusively for "key omitted /
unchanged," so `""` — a caller explicitly submitting an empty value — cannot mean the same thing
here. The only two readings left for an explicit empty string are "clear" or "error"; "clear"
matches `null`'s own meaning and avoids forcing every caller to know the `null`-vs-`""` distinction
precisely, consistent with `4b`'s own precedent of folding `""` into the "no value" bucket rather
than rejecting it.

### 5. `ICausalChainRepository.deleteCauseEdges(effectId)`: singular-replace semantics, confirmed as this codebase's current scope, not assumed

```ts
/** Deletes every edge where `effectId` is the effect. Idempotent -- a no-op, not an error, when
 * none exist. Every use case built so far (4b's CreateHazardousEventCommand, this change's
 * UpdateHazardousEventCommand) carries exactly one causeId field -- this method implements
 * singular-cause-per-effect replacement under that same scope, not arbitrary multi-cause
 * deletion. A future multi-cause feature needs different port semantics, not this method
 * (DEF-012's own "leading candidate," per-record sharing grants, is the closest named precedent
 * for where that would be designed). */
deleteCauseEdges(effectId: string): Promise<void>;
```

`hazardousEventCausalityTable.ts` has **no `UNIQUE` constraint** on `effectHazardousEventId`
(Context) — the table itself can hold more than one cause row per effect. This method deletes
**every** matching row regardless, rather than assuming exactly one exists and targeting it more
narrowly (e.g. a hypothetical `findCauseId`-then-`deleteEdge(causeId, effectId)` pair) — this is
simpler, and correct under this codebase's own current scope: no use case built so far (`4b`'s
create, or this change's update) ever writes more than one cause edge for a given effect, so at
most one row should ever exist for a correctly-operating system, and defensively deleting "every"
row costs nothing extra when there is at most one.

**Alternatives considered:**

1. **Add `findCauseIds(effectId): Promise<readonly string[]>` and a narrower
   `deleteEdge(causeId, effectId)`.** Rejected — this would let `UpdateHazardousEventUseCase`
   decide whether to re-run the temporal check against an *unchanged* existing cause when only
   `startDate` moves (the design question Decision 2's Non-Goals explicitly declines to solve).
   Adding this read capability without a stated consumer for it would be speculative port surface,
   not something this change's own scope needs.
2. **Enforce `UNIQUE(effectHazardousEventId)` at the schema level**, closing the gap between the
   table's real capability and this codebase's singular-use assumption. Rejected — a schema change
   is outside this change's own scope (no migration proposed here), and `DEF-012`'s own register
   text already treats multi-cause-per-effect as a genuine, if not-yet-designed, future need (the
   transboundary-hazard case) — adding a `UNIQUE` constraint now would foreclose that future
   design, not merely tidy up an unused capability.
3. **Chosen: `deleteCauseEdges(effectId)`, delete-all, no read.** Minimal port surface matching
   this change's actual need (Decision 2's execute() flow never needs to know what the prior
   cause was, only to remove it), and does not foreclose a future multi-cause port addition.

### 6. Use-case-to-use-case composition: constructor injection, not a lower-level domain/port function — this codebase's first instance, named explicitly

**Chosen: inject `RecordSpatialObservationUseCase` itself as a constructor-level collaborator**,
exactly as every other dependency (`ILogger`, the three repositories) is injected — `execute()`
calls `this.recordSpatialObservationUseCase.execute({ ...command.spatialObservation,
tenantId: command.tenantId, hazardousEventId: saved.id })` — spread first, so the two
fields supplied by this use case itself always win over same-named keys a caller smuggles
into `command.spatialObservation` past its compile-time-only `Omit` type.

**Why not expose a lower-level domain/port function instead:** `RecordSpatialObservationUseCase`'s
own job (`4g`'s design.md Decision 2) is itself an orchestration — tenant/existence check, default
`observationTime`, conflict detection via `SpatialObservation`'s own static methods, persistence —
not a single pure domain function this change could call directly without re-deriving that
orchestration. The roadmap's own explicit requirement is "calls `RecordSpatialObservationUseCase`
(`4g`) internally rather than duplicating its logic" — splitting `4g` into a validate-only phase
and a persist-only phase (so this change could call just the validation half before its own writes,
see below) would mean changing `4g`'s own shipped, tested file to serve a caller that didn't exist
when it was built, for a benefit only this one new caller needs. Constructor injection needs zero
changes to `RecordSpatialObservation.ts` and is directly testable via a fake/mock collaborator
(the roadmap's own stated test-tier requirement: "verified via a mock, not a real call").

**Real costs of this choice, named explicitly, not glossed over:**

- **`tenantId`/`hazardousEventId` must be supplied by this use case, not the caller** —
  `UpdateHazardousEventCommand.spatialObservation` is typed as
  `Omit<RecordSpatialObservationCommand, "tenantId" | "hazardousEventId">` specifically so a
  caller cannot accidentally (or deliberately) target a different event or tenant than the one
  this command is itself updating.
- **`findById(id, tenantId)` runs twice** — once in this use case's own step 2, once again inside
  `RecordSpatialObservationUseCase.execute()`'s own first step. Accepted as the direct cost of
  reusing `4g` unmodified rather than duplicating its tenant-check logic — an extra read, not an
  extra write, and not a correctness risk (both reads are against the same now-already-saved row).
- **No whole-call transaction; write order matters and is chosen to minimize the worse partial
  outcome, the same reasoning `4b`'s own Decision 5 used for its three-write sequence.** This
  change's own writes are ordered: `HazardousEvent.save()` → causality-table change → delegated
  `RecordSpatialObservationUseCase.execute()` (which does its own internal
  `saveSpatialObservation()` write). If the delegated call throws — most commonly
  `ConflictError` for a duplicate `observationTime` without `confirmReplace`, the normal
  interactive-retry case `4g`'s own design already expects — **the `HazardousEvent`'s own field
  changes and any causal-link change are already committed.** The caller/UI must retry with
  `confirmReplace: true` on the spatial portion only; the field changes do not need to be, and are
  not, resent. The alternative order (delegate first, save `HazardousEvent` second) was rejected:
  it would let a spatial reading be recorded against field values that then fail to persist (a
  worse, harder-to-explain orphan than "the fields saved, the spatial reading needs one more
  click"). This is the same class of risk `4b`'s own `DEF-026` already names for its own
  non-transactional three-write sequence — this change's own writes extend that same accepted
  risk one step further, now also crossing a use-case-composition boundary rather than only a
  repository-call boundary. **Flagged for a joint decision in Risks below, not resolved
  unilaterally**: whether `DEF-026`'s register text should be widened to name this change's writes
  too, or a new row added.
- **The whole-call error-ordering guarantee is boundary-scoped, not call-wide monotonic.** `4g`'s
  own design.md Decision 7 guarantees shape errors (`ValidationError`) always surface before
  state-dependent errors (`ConflictError`) *within* `RecordSpatialObservationUseCase.execute()`
  itself. `HazardousEvent.create()`'s own validation similarly guarantees shape-before-conflict
  *within* this use case's own HE-only portion (steps 5-9 above). But across the whole combined
  call, a spatial-side `ValidationError` can surface *after* the HE-level write is already
  committed, because the HE write (step 9) unavoidably precedes the delegate call (step 11) —
  reordering them would mean validating the spatial command's shape before the event it reads even
  reflects this update's own changes, which is not meaningful. A caller/reviewer must not assume
  the same whole-call monotonic ordering `4g` provides internally extends across this
  composition boundary — it does not, and this is accepted, not fixed, for the reasons above.

### 7. `assertCauseStartsNoLaterThanEffect`: `ConflictError`, not `ValidationError` — matches the cycle check's own categorization

**Correction (post-review, 2026-10-01): this document's prior version of this function compared
`causeStartDate > effectStartDate` as raw strings and claimed that was "provably equivalent" to
legacy's own normalized comparison. That claim was false.** A reviewer found the counterexample:
`causeStartDate = "2020-01-01"`, `effectStartDate = "2020"` — raw compare says
`"2020-01-01" > "2020"` is `true` (wrongly throws); legacy's own `normalizeDateForComparison`-based
compare says `"2020-01-01" > "2020-01-01"` is `false` (correctly does not throw, satisfying the
spec's own "equality MUST be accepted" requirement for a real, reachable case — an event recorded
at only year or year-month precision, the entire reason ADR-002's partial-precision model exists,
set as the effect, with a precisely-dated cause falling exactly on that effect's period start). The
error was isolated to the specific shape "the longer string is an exact extension of the shorter
one" — 18 of 3,969 mixed-precision pairs in the reviewer's own first sweep, confirmed again here
across a wider 82,369-pair sweep (`sweep.js`, 2026-10-01): zero divergences remain once both sides
are floor-padded before comparing.

```ts
export function assertCauseStartsNoLaterThanEffect(
	causeStartDate: string,
	effectStartDate: string,
): void {
	if (
		!isValidFlexibleDateFormat(causeStartDate) ||
		!isValidFlexibleDateFormat(effectStartDate)
	) {
		return; // don't block if either date isn't in the validated format (Context)
	}
	if (
		normalizeFlexibleDateFloor(causeStartDate) >
		normalizeFlexibleDateFloor(effectStartDate)
	) {
		throw new ConflictError(
			"The cause event must not start later than the effect event",
			{ causeStartDate, effectStartDate },
		);
	}
}
```

`ConflictError`, not `ValidationError` — matches `assertCausalLinkDoesNotCreateCycle`'s own
categorization for its structurally identical situation (a rule violation *relative to other
data*, not a malformed-shape problem; `ValidationError` there is reserved for the unrelated
traversal-cap case). Both operands here are always `startDate`s (cause's `startDate` vs. effect's
`startDate` — `validateTemporalCausality` confirms `endDate` is fetched but never used in this
comparison, Context) — no start/end asymmetry applies to this one function, so floor-padding
*both* sides (not a directional floor/ceiling split, which Decision 8's genuinely asymmetric
start/end case needs) is the correct and complete port of `normalizeDateForComparison`.

**Worked examples**, confirmed via the sweep above, not asserted from prose alone:

- `causeStartDate: "2020-01-01"`, `effectStartDate: "2020"` — floor("2020-01-01") = "2020-01-01" >
  floor("2020") = "2020-01-01" is `false` — does **not** throw (the bug this correction closes).
- `causeStartDate: "2020-06-15"`, `effectStartDate: "2020"` — floor("2020-06-15") = "2020-06-15" >
  floor("2020") = "2020-01-01" is `true` — **does** throw. A cause falling partway through a
  coarser effect's period, genuinely after that period's start, is correctly still rejected — this
  is intended legacy behavior (the floor only normalizes the effect's *start*; it does not grant a
  cause starting anywhere "within" the effect's year a free pass), not a gap this correction
  reopens.

Only `startDate` on both sides is compared — `endDate` plays no role, matching legacy exactly
(Context: "`endDate` is fetched... but never used in the comparison at all").

### 8. `HazardousEvent.create()`'s ordering check: format-gated AND directionally normalized (floor/ceiling), not a raw comparison

**Correction (post-review, 2026-10-01, user-approved to fix now rather than defer): this
document's prior version of this check was format-gated but still compared raw, unpadded strings,
and explicitly deferred "end-of-period semantics for `endDate`" to the future `DEF-028`/ADR-002
migration. The user pointed out, and this document confirms, that this codebase already has the
correct convention for this elsewhere** —
`app/backend.server/utils/dateFilters.ts:50-106`'s `createDateCondition`, used for disaster-date
**range filtering** (a different call site, same underlying problem), already pads a bound
**directionally**: floor to the earliest point for a lower (`gte`) bound, ceiling to the actual
last day of the month (leap-year aware) for an upper (`lte`) bound (lines 60-75). This check is the
same shape one level down — `startDate` is a lower bound, `endDate` is an upper bound, of one
event rather than a DB range filter — so the same directional logic applies, ported now rather
than deferred, since the existing in-repo precedent makes it cheap and consistent.

```ts
// was: props.startDate > props.endDate (raw, unnormalized)
if (
	props.endDate != null &&
	props.endDate.trim().length > 0 &&
	isValidFlexibleDateFormat(props.startDate) &&
	isValidFlexibleDateFormat(props.endDate) &&
	normalizeFlexibleDateFloor(props.startDate) >
		normalizeFlexibleDateCeiling(props.endDate)
) {
	throw new ValidationError("startDate must not be later than endDate");
}
```

A malformed (non-zero-padded) `startDate` or `endDate` still **skips** the ordering comparison
entirely rather than participating in a raw (and sometimes wrong) string comparison — the same
"don't block if dates aren't in the expected format" principle `validateTemporalCausality` already
applies cross-event, applied here intra-event. This is the primary reason the fix is
*skip-on-unparseable*, not *reject-on-unparseable*: `HazardousEvent.create()` is also how a future
real adapter (Phase 5+) will reconstruct an existing persisted row via `findById()`. Legacy data
may already contain non-zero-padded `startDate`/`endDate` values (the `zeroText` column has never
enforced any format) — if `create()` instead *threw* for a malformed value, every such existing
row would become permanently unloadable once a real adapter calls `create()` to hydrate it, a far
worse regression than the comparison bug `DEF-020` itself names. Skip-on-unparseable closes
`DEF-020`'s own narrow scope (the comparison is now *correct* whenever it runs) without
introducing this new failure mode.

**This is a genuine behavior improvement beyond `DEF-020`'s original narrow scope** (which only
added the format *gate*, not normalization) — approved by the user directly, given
`createDateCondition`'s existing precedent, rather than deferred to `DEF-028`. A direct
enumeration sweep (`sweep.js`, 2026-10-01, every candidate pair across a spread of years/months/
days) confirms the new check never rejects a pair the old raw check accepted — strictly more
permissive, never stricter, matching the "skip/accept when in doubt, don't newly reject legacy
data" principle this decision already commits to above.

**Worked examples**, confirmed via the sweep, not asserted from prose alone:

- `startDate: "2020-06"`, `endDate: "2020"` — floor("2020-06") = "2020-06-01" <=
  ceiling("2020") = "2020-12-31" — does **not** throw. (This document's prior version claimed
  this exact pair was, and should remain, rejected by legacy's own raw comparison — that claim is
  now corrected: `endDate` genuinely represents the whole of 2020 as an upper bound, and a
  `startDate` of June of that same year is not "later than" it.)
- `startDate: "2026-05-10"`, `endDate: "2026-05"` — floor("2026-05-10") = "2026-05-10" <=
  ceiling("2026-05") = "2026-05-31" — does **not** throw (flips from the prior version's own
  stated outcome for this exact example, which is the point of this correction).
- `startDate: "2020-07-01"`, `endDate: "2020-06"` — floor("2020-07-01") = "2020-07-01" <=
  ceiling("2020-06") = "2020-06-30" is `false` — **does** throw. A `startDate` genuinely after the
  end of the coarser `endDate`'s own period is still correctly rejected.

## Risks / Trade-offs

- **[Risk] Real, previously-only-abstract TOCTOU race on `ICausalChainRepository`, now concretely
  exercised for the first time.** `3c`'s own design.md (Context) already named this precisely:
  "the mandatory 'concurrent callers' spec scenario... does not apply [to `CausalChain.ts` itself]
  ... The race is a property of whatever future use case loads edges and persists a new one." Two
  concurrent `UpdateHazardousEventUseCase.execute()` calls — one setting `A.causeId = B`, the
  other concurrently setting `B.causeId = A` — can each read the *other* edge's pre-write state,
  each pass `assertCausalLinkDoesNotCreateCycle` against that stale snapshot, and both persist,
  jointly writing a real two-node cycle that neither call observed alone. → Mitigation: this
  change's own mandatory concurrent-callers test (specs' own requirement) proves this use case
  does not itself introduce additional corruption beyond the race `3c` already named and
  deferred — it does not prevent the race (no optimistic-locking mechanism exists anywhere in this
  codebase for this shape). **Resolved: a new register row, `DEF-030`, names this concretely —
  not a `DEF-024` widening.** `5j` (`DEF-024`'s own target) is narrowly scoped to
  `IWorkflowRepository.save()`'s version-column/conditional-UPDATE pattern, a mechanically
  different fix than this graph-level check-then-act race needs; `DEF-030` targets `5i`
  (`ICausalChainRepository`'s real adapter) instead, where the actual concurrency mechanism
  (serializable transaction boundary, row/graph locking, etc.) would need to be designed anyway.
  Distinct from the entity-level `IHazardousEventRepository.save()` race below, which is a genuine
  `DEF-024` widening.
- **[Risk] Extends `4b`'s own `DEF-026` (no transactional guarantee across multiple writes) one
  step further, now across a use-case-composition boundary.** See Decision 6's write-order
  analysis: a delegated `RecordSpatialObservationUseCase` failure (most commonly an expected
  `ConflictError` for an un-confirmed replace) leaves the `HazardousEvent`'s own field/causal-link
  changes already committed. → Mitigation: write order is chosen so the recoverable half (retry
  the spatial portion with `confirmReplace: true`) is what's left outstanding, never the
  unrecoverable half. The same class of risk exists one level down, within a single call: if
  `applyCausalEdgeChange`'s `deleteCauseEdges` succeeds but the following `saveEdge` then throws,
  the event is left with no causal link at all, not its prior one (tested, not fixed, same
  accepted non-transactional-write class). **Resolved: `DEF-026`'s register text is widened to name
  both this change's own longer write sequence and the `deleteCauseEdges`/`saveEdge` partial-failure
  window specifically, still targeted at `5k` — not a new row.**
- **[Risk] `deleteCauseEdges` deletes every row for `effectId`, not a targeted single row.** Under
  this codebase's current singular-cause-per-effect scope (Decision 5) this is equivalent to a
  targeted delete in every real scenario this change's own tests cover — but the underlying table
  has no constraint enforcing that scope, so a future bug elsewhere that wrote a second cause edge
  for the same effect would have both silently removed by this method with no signal that more
  than one existed. → Mitigation: accepted — a single correctly-operating call never writes a
  second cause edge for an existing effect; a future multi-cause feature redesigns this port
  method's contract deliberately (Decision 5), it does not silently rely on today's single-row
  assumption.
- **[Risk, found in review] Two concurrent `execute()` calls setting *different* new causes on the
  *same* effect can jointly write two cause edges for one effect — a distinct failure mode from the
  A→B/B→A cycle race above, surfaced because `applyCausalEdgeChange`'s delete-then-insert is two
  separate, non-atomic writes.** If both calls' `deleteCauseEdges` run before either call's
  `saveEdge`, both inserts land, leaving two rows for one effect — the exact scenario the
  mitigation above assumes a single correct call never produces, but says nothing about two
  concurrent ones. Same root cause and same unresolved class as the race above (no optimistic
  locking anywhere in this codebase for `ICausalChainRepository`). → Not fixed here, same as the
  A→B/B→A race. **Resolved: covered by the same new `DEF-030` row above, not a second, separate
  decision.**
- **[Risk] `isValidFlexibleDateFormat`'s day-overflow permissiveness (e.g. `"2026-02-30"` treated
  as a valid, comparable string) is preserved, not fixed, by this change.** A real-world
  data-entry typo of this shape passes format validation and participates in both the ordering and
  temporal comparisons as a literal (non-rolled-over) string. → Mitigation: accepted — this exact
  permissiveness is legacy's own existing behavior (Context, empirically confirmed), and `DEF-020`'s
  own scope is the comparison-correctness bug, not a general tightening of date-string validity;
  introducing stricter calendar validation here would be an unscoped, unapproved behavior change.
- **[Risk, found in review] No optimistic concurrency control on `IHazardousEventRepository.save()`
  itself — a distinct lost-update race from the `ICausalChainRepository` ones above.** Two
  concurrent `execute()` calls against the *same* event editing *different* fields each read the
  same pre-update snapshot, merge independently, and whichever `save()` lands last silently
  overwrites the other's change. Same root cause (no version/ETag check anywhere in
  `IHazardousEventRepository`, same class as `DEF-024`'s own `IWorkflowRepository` finding) applied
  to a different port. → Not fixed here (optimistic locking is out of this change's own scope).
  **Resolved: `DEF-024`'s register text is widened to name `IHazardousEventRepository.save()` as a
  second instance of the same lost-update gap, still targeted at `5j` — not a new row.**
- **[Risk, found in review, resolved] `command.actingUserId` was never validated before being
  written to `updatedByUserId`.** `tenantId` and `id` are both guarded by `assertNonEmptyString`;
  `actingUserId` was not, despite being equally mandatory on the command. An empty-string
  `actingUserId` (reachable by a caller bypassing the compile-time type) was silently normalized to
  `null` by `HazardousEvent.ts`'s own `normalizeAttribution`, corrupting the audit trail ("who made
  this change") to "nobody" instead of failing loudly. The identical gap existed for
  `createdByUserId` in `CreateHazardousEventUseCase` — confirmed **not** legacy/pre-existing
  (`4b` has never reached `dev`: `git merge-base --is-ancestor feature/he-ca-phase4 origin/dev`
  returns false, `git log dev -- .../CreateHazardousEvent.ts` is empty), so this is this project's
  own in-flight gap, not an inherited one. **Resolved: fixed now in both use cases** —
  `assertNonEmptyString(command.actingUserId, "actingUserId")` added alongside each use case's
  existing `tenantId`/`id` guards, before the value is written to `createdByUserId`/
  `updatedByUserId` respectively.

## Migration Plan

None. Application/domain-layer TypeScript only (one new use case, one new domain function, one new
shared helper file, one modified existing domain check, one new port method) — no schema change,
no data migration, no feature flag, no infrastructure-layer adapter in this change. Inert until a
future route/handler intent calls `UpdateHazardousEventUseCase`, exactly as `4b`'s and `4g`'s own
use cases remain inert until their own future callers exist.

## Open Questions

Both open design questions the roadmap/briefing originally posed are resolved above, from real
evidence, not left open:

- **Full-replace vs. partial-patch command shape** — resolved: partial-patch, confirmed directly
  from `hazardousEventUpdate`'s own `Partial<HazardousEventFields>` signature (Decision 2).
- **Does `causeId` handling need to support removal** — resolved: yes, a tri-state contract,
  confirmed directly from `hazardousEventUpdate`'s own parent-clearing behavior and Phase 0 audit
  finding 0a#5 (Decision 4).

No items remain open. Every question raised during review is now resolved, each restated here for
visibility:

- The `ICausalChainRepository` TOCTOU race (both the original A→B/B→A cycle case and the
  same-effect-node double-insert case found in review) gets its own new register row, `DEF-030`,
  targeted at `5i` (`ICausalChainRepository`'s real adapter) — not a `DEF-024` widening. `5j`
  (`DEF-024`'s own target) is narrowly scoped to `IWorkflowRepository.save()`'s own
  version-column/conditional-UPDATE pattern, a mechanically different fix than this graph-level
  check-then-act race needs (Risks).
- `DEF-026` is widened to name this change's own longer write sequence and the
  `deleteCauseEdges`/`saveEdge` partial-failure window, still targeted at `5k` — not a new row
  (Risks).
- The entity-level `IHazardousEventRepository.save()` lost-update race is folded into `DEF-024` as
  a second instance of the same gap, still targeted at `5j` — not a new row (Risks).
- The unvalidated `actingUserId`/`createdByUserId` attribution gap, confirmed not legacy (this
  project's own in-flight work, not yet on `dev`), is fixed now in both `CreateHazardousEventUseCase`
  and `UpdateHazardousEventUseCase` (Risks, Decision 3 addendum below).
- `buildUpdatedEventProps`'s merge is tightened from `??` to `!== undefined` only for the four
  fields where `HazardousEvent.create()` actually validates a bypassing-TypeScript runtime `null`
  (`specificHazardId`, `startDate`, `attachments`, `fieldValues`, plus the `hazardDriverIds`/
  `customFieldValues` merge locals). The other six scalar fields and `endDate` stay on `??`,
  confirmed-correct per a second review pass that found `HazardousEvent.create()` has no type/shape
  check at all on those six — tightening them would have let a bypassing `null` reach the entity
  with no error raised, worse than the original gap (Decision 3 addendum below).

### Decision 3 addendum: `actingUserId` validation and the `??` → `!== undefined` merge tightening

Both found during review, both resolved by fixing now rather than deferring:

```ts
assertNonEmptyString(command.tenantId, "tenantId");
assertNonEmptyString(command.id, "id");
assertNonEmptyString(command.actingUserId, "actingUserId");
```

`CreateHazardousEventUseCase` gets the identical addition for its own `command.actingUserId`,
before it is written to `createdByUserId` — the same gap, same fix, in the sibling use case it was
found to share.

`buildUpdatedEventProps`'s merge for `specificHazardId`, `startDate`, `attachments`, and
`fieldValues` changes from `command.field ?? existingEvent.field` to `command.field !== undefined ?
command.field : existingEvent.field` — identical in shape to the three already-nullable fields' own
merge. `hazardDriverIds` and `customFieldValues` (computed once into `mergedHazardDriverIds`/
`mergedCustomFieldValues` before the taxonomy lookups) get the same tightening. All six of these are
safe: `HazardousEvent.create()` genuinely rejects a `null` on each (the required-field check for the
first two, `assertIsArray` for the other four).

**`nationalSpecification`, `description`, `chainsExplanation`, `magnitude`, `recordOriginator`,
`dataSource`, and `endDate` stay on `??`, not tightened — a second review pass found
`HazardousEvent.create()` has no type/shape check at all on the first six** (confirmed by reading
the whole file; nothing else references them), and `endDate` already tolerates a `null` by design
(Decision 2/11). Tightening any of these seven would have let a bypassing-TypeScript runtime `null`
reach the constructed entity with no error raised at all — worse than the original "silently
treated as unchanged" gap, since it would only surface later as a raw, unhandled database
constraint violation once a real adapter exists. This mirrors `DEF-009`'s own already-accepted
`zeroText()`/`NOT NULL DEFAULT ''` tension one layer up; `DEF-009`'s register row is cross-referenced
to this finding rather than opening a new row or expanding its scope now.
