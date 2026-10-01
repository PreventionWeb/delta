## Context

See proposal.md - Why for motivation and the two corrections to this intent's own shorthand.
Ground truth read in full before writing this document:

- `app/domains/hazardous-events/domain/SpatialObservation.ts` — real signatures, contradicting
  this intent's own briefing:
  - `static create(props: SpatialObservationProps, validDivisionIds: ReadonlySet<string>):
SpatialObservation` — mandatory `validDivisionIds`, closes `DEF-005` by construction (same
    pattern `HazardousEvent.create()`/`3e`'s hazard-driver sets use). Date guards run first
    (`isInvalidDate`), then array-shape guards (`Array.isArray`), then required-string guards,
    then the divisionIds-duplicate check, then divisionIds-membership. Throws `ValidationError`
    naming the first offending field/id.
  - `static selectCurrent(observations: readonly SpatialObservation[]): SpatialObservation |
null` — latest-by-`observationTime`, ties broken by first-seen. **Not used by this change**
    (see Non-Goals) — it answers "what is the current reading," a different question from
    "does a reading already exist at this exact time."
  - `static assertNoConflictingObservationTime(existingAtSameTime: SpatialObservation | null,
confirmReplace: boolean): void` — no-ops when `existingAtSameTime === null` or
    `confirmReplace === true`; otherwise throws `ConflictError` with `{ hazardousEventId,
observationTime, confirmReplace }` context. **This use case's entire conflict-handling job
    is: fetch `existingAtSameTime`, call this function, and act on whether it threw.** It does
    not reimplement the rule.
- `app/domains/hazardous-events/application/ports/IHazardousEventRepository.ts` — real
  signatures: `findById(id, tenantId): Promise<HazardousEvent>` (throws `NotFoundError`,
  tenant-scoped — the same method `4b` used for `causeId`), plus the three spatial methods:
  `findCurrentSpatialObservation(hazardousEventId, tenantId): Promise<SpatialObservationRecord |
null>` (latest-by-time; **not called by this change**, see Non-Goals),
  `findSpatialObservationByTime(hazardousEventId, observationTime, tenantId):
Promise<SpatialObservationRecord | null>` (exact-time lookup — this change's actual read),
  `saveSpatialObservation(hazardousEventId, observation: SpatialObservationRecord, tenantId):
Promise<SpatialObservationRecord>` (insert-or-update; its own doc comment: "the real
  `UNIQUE(hazardous_event_id, observation_time)` constraint is the authoritative conflict
  guard; the losing caller's contract is deferred to Phase 3d (design.md Decision 7)").
- `openspec/changes/archive/2026-09-22-ca-he-spatial-observation-entity/design.md` (`3d`) — read
  in full, and it resolves several things this change would otherwise have had to leave open:
  - **Non-Goals, verbatim:** "No `IHazardousEventRepository` changes. The port's three spatial
    methods keep using `SpatialObservationRecord` until `5e` wires the real adapter and updates
    the port signatures — explicitly flagged as a follow-up in `3b`'s own design.md Decision 5,
    not silently left stale by this change." **This settles the `SpatialObservationRecord` vs.
    `SpatialObservation` type-reconciliation question for this change: the retype is `5e`'s job,
    not `4g`'s.** This use case maps between the two shapes at its own boundary (Decision 3) —
    it does not touch the port's types.
  - **Decision 7, verbatim contract:** "the caller that loses the race (its insert hits the
    unique-constraint violation) MUST surface to its own caller the same `ConflictError` shape
    that `assertNoConflictingObservationTime` throws for a synchronously-detected duplicate —
    mapped from the DB constraint violation, not left as a raw DB error." This is `5e`'s
    contract to fulfil once a real adapter exists; this change's own job is narrower —
    propagate whatever `saveSpatialObservation` throws unmodified, and prove via a fake that
    doing so doesn't accidentally swallow a losing-race error (Decision 6).
  - **Risks, verbatim:** "No lost-update protection for two concurrent `confirmReplace: true`
    callers racing to replace the same observation... out of scope for this change (same class
    of risk `3a`'s and `3b`'s design.md already flagged for their own `save()` methods, with no
    optimistic-locking mechanism to live in yet)." This risk is inherited, not newly discovered
    by `4g` — cross-referenced in this document's own Risks section, not duplicated as a new
    register item.
  - **Open Questions, confirmed by the user 2026-09-21:** a `division` row with
    `countryAccountsId IS NULL` is **not valid for any tenant's `validDivisionIds` set**. Already
    a settled decision before this change started; `IDivisionRepository`'s query implements it,
    it does not re-decide it.
- `app/drizzle/schema/divisionTable.ts` — `countryAccountsId` is a nullable `uuid` FK. Every
  real legacy query against this table (`app/backend.server/models/division.ts`, ~20 call sites
  grepped directly) scopes with a strict `eq(divisionTable.countryAccountsId, countryAccountsId)`
  — never an `isNull(...)`/`or(...)` fallback for a "global" division. This is independent
  confirmation (not just citation of `3d`'s design.md) that excluding null-tenant rows matches
  every other query this codebase already runs against this table.
- `app/domains/hazardous-events/infrastructure/hazardousEventSpatialObservationTable.ts` — real
  constraints: `id` primary key (`ourRandomUUID()`), `unique(hazardous_event_id,
observation_time)`. Confirms Decision 4 below is not optional: a replace that generated a
  fresh `id` would attempt an `INSERT` and collide with this exact constraint; reusing the
  existing row's `id` is what makes "replace" actually an update.
- `app/domains/hazardous-events/application/use-cases/CreateHazardousEvent.ts` (`4b`) — the
  Command/UseCase/DTO precedent this change follows: `id`/timestamps generated internally,
  errors from entity/repository propagate unmodified, constructor parameter order matches
  first-use order, one structured `ILogger.info()` call on success, a private
  `toSafeStringArray()` helper duplicated locally rather than imported (matches
  `SpatialObservation.ts`'s own "redefined locally... independently auditable" convention).
- `app/domains/hazardous-events/application/ports/IHazardTaxonomyRepository.ts` (`4b`) — the
  exact port shape `IDivisionRepository` (below) copies: `findValid*Ids(ids: readonly string[],
tenantId: string): Promise<ReadonlySet<string>>`, interface-only, fake-conformance-tested only.
- `_docs/refactoring-plan/deferred-items-register.md` — `DEF-005` ("Spatial-footprint
  'Geographic level' division linking has no tenant check... `3d`'s `SpatialObservation.create()`
  now closes this by construction... full closure... is still `5e`'s job") and `DEF-024`
  ("`IWorkflowRepository.save()` has no lost-update protection... Needs optimistic locking...
  `5j` designs this from scratch") are both directly relevant precedent for this change's own
  Risks section. Next free id at time of writing: `DEF-027`.

## Goals / Non-Goals

**Goals:**

- One `RecordSpatialObservationUseCase.execute(command)` that validates `hazardousEventId`
  belongs to `command.tenantId`, resolves a tenant-scoped `validDivisionIds` set, defaults
  `observationTime` to `now()`, enforces `SpatialObservation`'s own current/duplicate-time
  conflict rule by calling its real static methods (not reimplementing them), persists via
  `IHazardousEventRepository.saveSpatialObservation()`, and returns a `SpatialObservationDto`.
- Define `IDivisionRepository` as the new port this use case needs, matching `4b`'s
  `IHazardTaxonomyRepository` precedent exactly (interface + fake-conformance test, no adapter).
- Reconcile, not paper over, the `SpatialObservationRecord`/`SpatialObservation` type mismatch
  at this use case's own boundary — `3d`'s design.md already assigned the real retype to `5e`
  (Context); this change's job is to map between the two shapes correctly in the meantime.

**Non-Goals:**

- No `IHazardousEventRepository` signature change. Confirmed by `3d`'s own Non-Goals (Context) —
  not this change's decision to make, and not reopened here.
- No Drizzle adapter for `IHazardousEventRepository` or the new `IDivisionRepository` — both
  stay interface-only, matching every Phase 4 intent's own split. A real adapter for both is
  `5e`'s job (the roadmap's own already-named intent for spatial-observation persistence).
- No use of `SpatialObservation.selectCurrent()`. This use case never needs "the current
  reading" — it needs "does a reading exist at this exact `observationTime`," which
  `findSpatialObservationByTime` (an exact-match lookup) answers directly. `selectCurrent()`'s
  own future caller is `4d` (`GetHazardousEventByIdUseCase`, per the roadmap's own text:
  "current spatial observation (latest by `observationTime`, per `3d`'s rule)").
  `RecordSpatialObservationUseCase` never resolves "latest," so it has no reason to load every
  observation for the event, and does not call `findCurrentSpatialObservation()` either.
- No route, no `authActionWithPerm` wiring, no NestJS module wiring. Application-tier only,
  matching `4b`'s own scope.
- No `4c` (`UpdateHazardousEvent`) delegation logic. This change only builds the callee; `4c`'s
  own future design decides how it calls `execute()` from within a bundled submission.
- No resolution of the concurrent-`confirmReplace` lost-update race, or of the
  losing-race-surfaces-`ConflictError` contract's actual enforcement. Both are named,
  cross-referenced accepted risks inherited from `3d` (Context) — this change's own test proves
  its _propagation_ doesn't swallow either failure mode, not that either race is prevented.
- No per-element validation of `geometries` — same Non-Goal `3d`'s own design.md already stated
  for `SpatialObservation.create()` itself; this use case passes `command.geometries` through
  unchanged.

## Decisions

### 1. `RecordSpatialObservationCommand` shape — corrects the roadmap's shorthand against the real entity and every real port signature

```ts
export interface RecordSpatialObservationCommand {
	tenantId: string;
	hazardousEventId: string;
	/** Defaults to `now()` (a single internally-computed value) when omitted. A `Date`, not a
	 * string — `observationTime` is a real `timestamptz` column (SpatialObservation.ts Decision
	 * 2), unlike HazardousEvent's own plain-text `startDate`/`endDate` (DEF-020). Parsing an
	 * ISO string is a future API-adapter's job, not this command's. */
	observationTime?: Date;
	/** Renamed from the roadmap's singular `geometry` to match
	 * `SpatialObservationProps.geometries: readonly unknown[]` exactly — see proposal.md Why. */
	geometries: readonly unknown[];
	divisionIds: readonly string[];
	/** Not in the roadmap's shorthand; `SpatialObservationProps.note` is a mandatory (non-null)
	 * constructor field. Defaults to `null` when omitted — see Decision 5 for why this default
	 * applies even on a replace (an omitted `note` resets to `null`, it does not carry the prior
	 * observation's note forward). */
	note?: string | null;
	confirmReplace?: boolean;
}
```

No `actingUserId` — unlike `HazardousEventProps`/`WorkflowInstance`, `SpatialObservationProps`
has no attribution fields (`createdByUserId`, etc.) to feed; adding one here would be inventing
a field the entity has no slot for.

### 2. Validation and write order

```
0. assertNonEmptyString(command.tenantId, "tenantId")
   assertNonEmptyString(command.hazardousEventId, "hazardousEventId")
   -- Malformed runtime input (bypassing TypeScript) must fail with ValidationError, not an
      unhandled TypeError from inside step 1's repository call. Shared helper, also added to
      `4b`'s CreateHazardousEventUseCase for tenantId -- resolved by direct user decision,
      2026-09-30, not deferred.
1. event = await hazardousEventRepository.findById(command.hazardousEventId, command.tenantId)
   -- NotFoundError propagates for a missing id or a foreign-tenant hazardousEventId (same
      same-tenant-only pattern `4b` Decision 4 established for causeId). `event` itself is
      otherwise unused -- this call exists purely to enforce tenant membership before any
      spatial-observation read/write, closing the gap the roadmap's own shorthand test-tier
      list omitted (proposal.md Security section).
2. observationTime = command.observationTime === undefined ? now : command.observationTime
   -- `now` is one internally-computed `new Date()`, read once, matching `4b`'s own "single
      internal now" convention. Only `undefined` counts as omitted -- an explicit non-Date
      value (including `null`) must fail step 3's shape guard, not silently become `now`.
3. IF command.observationTime is not `undefined`, validate its shape (isInvalidDate, duplicated
   locally from SpatialObservation.ts's own guard -- see Decision 7) and throw ValidationError
   immediately if invalid. This runs BEFORE step 4's repository read: a malformed
   observationTime must never reach findSpatialObservationByTime, and a ValidationError must
   never be shadowed by a ConflictError computed from garbage input (mirrors
   SpatialObservation.create()'s own "date guards run first" ordering, Decision 2 there).
4. validDivisionIds = await divisionRepository.findValidDivisionIds(
     toSafeStringArray(command.divisionIds), command.tenantId)
5. existingRecord = await hazardousEventRepository.findSpatialObservationByTime(
     command.hazardousEventId, observationTime, command.tenantId)
   -- SpatialObservationRecord | null
6. existingEntity = existingRecord === null
     ? null
     : SpatialObservation.create(existingRecord, new Set(existingRecord.divisionIds))
   -- Decision 3: reconstructs the stored record as a real entity purely so
      assertNoConflictingObservationTime can read its .hazardousEventId/.observationTime: the
      validDivisionIds set passed here is the record's OWN divisionIds, not step 4's set --
      see Decision 3 for why this can never spuriously fail.
7. newObservation = SpatialObservation.create({
     id: existingEntity?.id ?? crypto.randomUUID(),
     hazardousEventId: command.hazardousEventId,
     observationTime,
     note: command.note ?? null,
     geometries: command.geometries,
     divisionIds: command.divisionIds,
     createdAt: existingEntity?.createdAt ?? now,
     updatedAt: now,
   }, validDivisionIds)
   -- ValidationError propagates for a cross-tenant/malformed divisionId, a duplicate
      divisionId, or a malformed geometries/divisionIds shape (delegates entirely to 3d's own
      create() -- Decision 4). Built BEFORE step 8's conflict check (swapped from the original
      design, resolved by direct user decision, 2026-09-30) so a malformed divisionIds/geometries
      always surfaces even when observationTime is also a duplicate (Decision 7).
8. SpatialObservation.assertNoConflictingObservationTime(
     existingEntity, command.confirmReplace === true)
   -- ConflictError propagates when existingEntity !== null and confirmReplace !== true.
9. savedRecord = await hazardousEventRepository.saveSpatialObservation(
     command.hazardousEventId, toSpatialObservationRecord(newObservation), command.tenantId)
10. logger.info({ msg: "spatial_observation.recorded", hazardousEventId: command.hazardousEventId,
      tenantId: command.tenantId, observationTime: observationTime.toISOString(),
      replaced: existingEntity !== null })
11. return toSpatialObservationDto(savedRecord)
```

Step 0 (shape-guards runtime input) and step 1 run first because every later step is meaningless
against malformed ids or an event that doesn't exist under this tenant. Steps 3 (shape) before 5
(existence-conflict read) is load-bearing, not stylistic (Decision 7) — as is step 7 (shape) now
running before step 8 (conflict), the same principle applied to `divisionIds`/`geometries`. Step
7's `id`/`createdAt` reuse on a replace is Decision 4. There is exactly one write (step 9) —
unlike `4b`'s three-write sequence, this use case has no multi-aggregate composition to order, so
`4b`'s own Decision 5 (write ordering under partial failure) does not apply here; the only failure
mode is step 9 itself throwing, which propagates unmodified with nothing left partially written.

### 3. `SpatialObservationRecord` ↔ `SpatialObservation` mapping — reconciles the type mismatch at this use case's own boundary, per `3d`'s explicit hand-off (Context)

`3d`'s design.md Non-Goals already assigns the real port retype to `5e` — this change does not
touch `IHazardousEventRepository.ts`. Instead, `RecordSpatialObservation.ts` defines one small,
pure, local mapping function for the write direction (the read direction reuses
`SpatialObservation.create()` directly, no separate function needed — see below):

```ts
function toSpatialObservationRecord(
	observation: SpatialObservation,
): SpatialObservationRecord {
	return {
		id: observation.id,
		hazardousEventId: observation.hazardousEventId,
		observationTime: observation.observationTime,
		note: observation.note,
		geometries: observation.geometries,
		divisionIds: observation.divisionIds,
		createdAt: observation.createdAt,
		updatedAt: observation.updatedAt,
	};
}
```

(The reverse direction — reading a `SpatialObservationRecord` back into a `SpatialObservation` —
is `SpatialObservation.create(record, validDivisionIds)` directly, no separate function needed;
`SpatialObservationRecord`'s field set is structurally identical to `SpatialObservationProps`
today, confirmed by comparing both interfaces directly, Context.)

**Why this is a real mapping function and not just a cast:** the two types are field-identical
today, so this function currently does no actual transformation — but it exists as a named,
single seam so that if `5e`'s adapter work ever changes `SpatialObservationRecord`'s shape
before retyping the port (e.g. an intermediate step), exactly one function in this file needs
to change, not every call site. This is the same reasoning `toHazardousEventDto` establishes for
DTO boundaries, applied here to a port-boundary mapping instead of a presentation-boundary one.

**Alternatives considered:**

1. **Retype `IHazardousEventRepository`'s three spatial methods to use `SpatialObservation`
   directly, deleting `SpatialObservationRecord`.** Rejected for this change specifically —
   `3d`'s own design.md Non-Goals already assigned this exact retype to `5e`, explicitly and by
   name ("not silently left stale by this change" — of `3d` itself). Redoing that hand-off here
   would mean two different OpenSpec changes both claim ownership of the same port-signature
   decision, and would touch an already-shipped, tested file (`IHazardousEventRepository.ts` +
   its own arity-assertion test) outside this change's minimal footprint, for a benefit (removing
   a currently-zero-cost duplication) that only becomes real once `5e`'s adapter exists to prove
   the new shape against actual schema.
2. **Skip the mapping function, pass `SpatialObservationRecord`-shaped object literals inline at
   each call site.** Rejected — two call sites (read-reconstruction, write-serialization) would
   each hand-roll the same field list, and a future `5e` change updating the shape would have to
   find both instead of one named function.
3. **Chosen: one small pure mapper, `SpatialObservation.create()` reused directly for the read
   direction.** Minimal, named, single seam, no port change.

Tracked as new register entry `DEF-027` (proposal.md Impact) — not because this change leaves a
new gap, but because `3b`/`3d`'s own design docs already named this hand-off in prose and no
register row previously made it discoverable without reading those two archived files directly.

### 4. Replace semantics: reuse the existing observation's `id` and `createdAt`; full-collection replace, not a merge

Confirmed against `hazardousEventSpatialObservationTable.ts`'s own constraints (Context): `id`
is the primary key, and `unique(hazardous_event_id, observation_time)` is the DB-level conflict
guard `saveSpatialObservation`'s own doc comment names as authoritative. If a replace generated
a fresh `crypto.randomUUID()` for `id`, a future real adapter's `saveSpatialObservation` would
attempt an `INSERT` with a brand-new `id` at the same `(hazardousEventId, observationTime)` pair
and collide with that exact unique constraint — "replace" would not actually replace anything,
it would fail. Reusing `existingEntity.id` (step 8) is what makes "replace" a real update
against the same row.

`createdAt` is likewise carried over from the existing observation (`existingEntity.createdAt`)
rather than reset to `now` — a replace corrects/updates an existing reading, it does not create
a new one; `updatedAt: now` is the only timestamp that changes. This is the same
"preserve-creation, refresh-update" convention every other entity in this codebase would use had
an update use case for it already shipped (no direct precedent exists yet — `HazardousEvent`'s
own update use case is `4c`, not yet built — so this is this change's own decision, not a
borrowed one, stated explicitly rather than left for a reviewer to wonder whether it was an
oversight).

**Full-collection replace, not a merge:** `command.geometries`/`command.divisionIds` on a
replace are the new observation's _complete_ collections, not a delta to apply against the
existing one. This follows directly from `SpatialObservation.create()`'s own shape — it
constructs a whole entity from a whole `props` object, never a partial patch — and from
`hazardousEventSpatialObservationDivisionTable`'s/`..._geomTable`'s own child-row design: a
future real `saveSpatialObservation` adapter is expected to delete-and-reinsert (or equivalent)
every child row for the observation's `id`, not diff old vs. new. Stated explicitly here so a
future `5e` adapter doesn't independently invent merge semantics that this use case's own
contract never intended.

### 5. `note` defaults to `null`, not "keep the existing value" — a replace's `note` is fully caller-supplied, matching Decision 4's "full-collection replace, not a merge" principle

A caller submitting `confirmReplace: true` without a `note` gets `note: null` on the replacement
— _not_ the existing observation's prior note carried forward. This is a direct consequence of
Decision 4 (replace is a full-collection swap, not a merge) applied to the one scalar field a
merge-minded caller might otherwise expect to be "sticky." Naming this explicitly here (rather
than letting it fall out silently from Decision 4's more general principle) matters because
`note` is the one field where "preserve unless told otherwise" is at least plausible as an
alternative reading — stated so a future caller/reviewer doesn't assume it and lose data
silently.

### 6. Errors propagate unmodified; the concurrent-callers scenario proves propagation, not prevention

Matches `4b`'s own "errors from entity/repository propagate unmodified" precedent (ADR-003, no
new error class). This use case's own mandatory concurrent-callers scenario (project standing
rule for shared mutable state) is: two callers, A and B, both call
`findSpatialObservationByTime` for the same `hazardousEventId`/`observationTime` before either
writes, both observe `null`, both pass `assertNoConflictingObservationTime(null, false)`, both
proceed to `saveSpatialObservation`. `3d`'s own design.md Decision 7 already specifies the
_contract_ the real DB/adapter must satisfy once one exists (Context: the losing insert's
constraint violation must surface as the same `ConflictError` shape, "mapped from the DB
constraint violation, not left as a raw DB error") — that enforcement mechanism has no adapter
to live in yet (`5e`, Non-Goals). What this change's own test proves, one level down from that
contract, is narrower and fully testable today: a fake `IHazardousEventRepository` whose
`saveSpatialObservation` simulates the real constraint (throws `ConflictError` for a second call
targeting an already-occupied `(hazardousEventId, observationTime)` slot with `confirmReplace`
not set) demonstrates that `RecordSpatialObservationUseCase.execute()` does not catch, swallow,
or transform that error — it propagates to the losing caller exactly as thrown. This is the same
"hand-off resolved one layer at a time" pattern `3d` itself used for `3b`'s own deferred
decision (Context) — this change resolves "does the use case get in the way of the eventual
adapter's guarantee," not "does the guarantee exist yet."

The `confirmReplace: true` racing case (two callers both replacing the same existing
observation) is a real, already-named risk (Risks below, cross-referencing `3d`'s own Risks
bullet) — not re-litigated or re-tested here as a new scenario, since `3d` already established
that no optimistic-locking mechanism exists in this codebase for this shape of race
(`DEF-024`'s own sibling gap for `IWorkflowRepository.save()`).

### 7. Shape/validation errors always win over `ConflictError` — for `observationTime` via an early guard, for everything else via ordering

A locally-duplicated `isInvalidDate` guard (same predicate as `SpatialObservation.ts`'s own:
`!(value instanceof Date) || Number.isNaN(value.getTime())`, redefined here rather than
imported — matches that file's own "keep each entity/use-case file independently auditable"
convention) runs immediately after `observationTime` is resolved (step 2/3 in Decision 2's
ordering), before `findSpatialObservationByTime` is ever called. This guarantees a caller
passing a non-`Date`/`NaN`-time `observationTime` always gets `ValidationError`, never a
`ConflictError` computed from a garbage lookup key.

For `divisionIds`/`geometries`, the same guarantee is achieved by ordering rather than an early
guard: `newObservation` (`SpatialObservation.create()`, which does the membership/shape check) is
now built **before** `assertNoConflictingObservationTime` is called (Decision 2 steps 8/9,
swapped from the original design) — resolved by direct user decision, 2026-09-30, closing what
was an open question in an earlier draft of this document. A duplicate `observationTime` with
`confirmReplace` unset and a malformed `divisionIds` now yields `ValidationError`, not
`ConflictError` — a caller fixing one error at a time sees every shape problem before the
state-dependent one, matching `SpatialObservation.create()`'s own Decision 2 precedent for
`create()` itself, applied here one layer up.

### 8. `IDivisionRepository`: tenant-scoped membership lookup, one method, matching `4b`'s `IHazardTaxonomyRepository` shape exactly

```ts
// application/ports/IDivisionRepository.ts
export interface IDivisionRepository {
	/** Subset of `ids` present in `division` under `tenantId` — feeds
	 * `SpatialObservation.create()`'s mandatory `validDivisionIds` parameter (narrows `DEF-005`,
	 * matching `4b`'s `IHazardTaxonomyRepository` precedent for `DEF-021`). A `division` row
	 * whose `countryAccountsId` is `null` MUST NOT be included in any tenant's resolved set —
	 * confirmed by direct user decision, `3d` design.md Open Questions, 2026-09-21; this
	 * contract implements that decision, it does not re-decide it. */
	findValidDivisionIds(
		ids: readonly string[],
		tenantId: string,
	): Promise<ReadonlySet<string>>;
}
```

One method, one port — matches `IHazardTaxonomyRepository`'s own two-methods-because-two-tables
reasoning in reverse: there is only one table (`division`) and one query shape here, so a single
method is the complete port, not an arbitrary subset of a larger one.

**Placement note (not a new decision, citing existing precedent):** `division` is not
HE-owned reference data — it is shared across HE, DE, DR, damages, losses, and disruption
(confirmed by grep: `damagesDivisionRepository.ts`, `disasterEventDivisionRepository.ts`, etc.
all query the same table). Placing `IDivisionRepository` under
`hazardous-events/application/ports/` anyway follows the exact precedent `DEF-011` already
registers for HE's own taxonomy tables ("HIP hierarchy / `source_catalog` / hazard-type-field
tables... currently live in HE's own `infrastructure/`, but DE/DR also consume [them]... Disaster
Events' own CA migration, schema phase" is DEF-011's own named resolution point). No new
register row is added for this — `DEF-011`'s existing text already generically covers "a
domain-specific port sitting on top of genuinely shared reference data, revisited at DE's CA
migration" and this port is one more instance of that same, already-tracked situation.

**No adapter in this change.** Matches every other Phase 4 port. The fake-conformance test
(`IDivisionRepository.test.ts`) is this change's only proof the contract is implementable —
same test-tier and same "excludes a non-existent id without throwing, empty `ids` resolves an
empty set" scenarios `IHazardTaxonomyRepository.test.ts` already established, plus the one
scenario that port didn't need: a same-id row with `tenantId: null` is excluded even when the
queried `tenantId` matches every other row.

### 9. `SpatialObservationDto`: flat shape, ISO 8601 date strings

```ts
// application/dto/SpatialObservationDto.ts
export interface SpatialObservationDto {
	id: string;
	hazardousEventId: string;
	observationTime: string;
	note: string | null;
	geometries: readonly unknown[];
	divisionIds: readonly string[];
	createdAt: string;
	updatedAt: string;
}

export function toSpatialObservationDto(
	record: SpatialObservationRecord,
): SpatialObservationDto;
```

Matches `HazardousEventDto`'s own "Date values as ISO 8601 strings" convention. Takes the
`saveSpatialObservation()`-resolved `SpatialObservationRecord` directly (the repository may
enrich on write, same rationale `4b`'s own DTO mapper cites) — no separate `SpatialObservation`
entity parameter needed, unlike `toHazardousEventDto`'s two-parameter shape, because this DTO
has no second aggregate's status to fold in.

### 10. Constructor parameter order and logging

`constructor(private readonly logger: ILogger, private readonly hazardousEventRepository:
IHazardousEventRepository, private readonly divisionRepository: IDivisionRepository) {}` —
matches `4b`'s "logger first, then ports in first-use order" convention (Decision 2's step 1
uses `hazardousEventRepository` first, step 4 uses `divisionRepository` second).

One structured `this.logger.info({ msg: "spatial_observation.recorded", hazardousEventId,
tenantId, observationTime: observationTime.toISOString(), replaced: existingEntity !== null })`
call after step 9 succeeds, success path only — matches `4b`'s own single-success-log shape.
`replaced` (not `hasCause`-style boolean reuse) is computed once from `existingEntity !== null`,
the same value step 7/8 already derived, so it can't drift from what the write actually did.

## Risks / Trade-offs

- **[Risk] `DEF-005` — narrowed, not closed, by this change**: `IDivisionRepository` gives
  `SpatialObservation.create()`'s mandatory `validDivisionIds` parameter a real computation path
  and a real caller for the first time, but no adapter exists in this change to prove the query
  correct against real schema. → Mitigation: the fake-conformance test
  (`IDivisionRepository.test.ts`) proves the interface's contract is implementable; `5e` is
  responsible for the real-schema verification and for closing this register row (same shape as
  `4b`'s own narrowing of `DEF-021`).
- **[Risk, inherited from `3d`, not new] No lost-update protection for two concurrent
  `confirmReplace: true` callers racing to replace the same observation** — both observe the
  same existing row, both pass the conflict check (since `confirmReplace` short-circuits it
  regardless of a race), both write; the second write simply wins with no signal to the first
  caller that its replace was itself overwritten. → Mitigation: `3d`'s own design.md already
  named this exact risk for this exact port method and explicitly deferred it (no
  optimistic-locking mechanism exists anywhere in this codebase yet, same class as `DEF-024`);
  not re-registered as a new item, cross-referenced here so this change's own reviewer doesn't
  mistake the absence of a new register row for an oversight.
- **[Risk, inherited from `3d`, not new] The losing-race `ConflictError` contract (Decision 7 of
  `3d`) has no adapter to enforce it yet.** This change's own test proves propagation only (its
  fake simulates the future contract) — it cannot prove a real Postgres unique-violation actually
  gets mapped to `ConflictError` by an adapter that doesn't exist. → Mitigation: `5e`'s own
  PGlite integration tests are where that mapping must be proven for real, per `3d`'s own
  hand-off framing (Context).
- **[Risk] `DEF-027` (`SpatialObservationRecord`/`SpatialObservation` duplication) stays open
  after this change.** The two types are field-identical today, so the mapping function this
  change adds (Decision 3) is currently a zero-transformation pass-through — a future schema
  change to either type without updating the other would only be caught by `yarn tsc` failing at
  the mapper's own call sites, not by any test asserting the two shapes must match. → Mitigation:
  accepted for this change (retyping the port is explicitly `5e`'s job, Decision 3); the mapper
  function is the single seam a future change edits, not every call site.
- **[Risk] Placement of `IDivisionRepository` inside `hazardous-events`, despite `division` being
  shared reference data (Decision 8).** A future DE/DR use case needing the same lookup would
  either duplicate this port or import across a domain boundary that today's codebase has no
  precedent for outside `validation-workflow` (which was deliberately designed as a shared
  bounded context, `4b`'s own design.md Decision 11 — `division` was not). → Mitigation:
  accepted, matching `DEF-011`'s own already-registered "revisit at DE's CA migration" resolution
  point for the structurally identical taxonomy-table situation; no new register row needed
  (Decision 8).

## Migration Plan

None. Application-layer TypeScript only (one new port interface, one new use case, one new DTO)
— no schema change, no data migration, no feature flag, no infrastructure-layer adapter in this
change. Inert until a future route/handler intent, or `4c`'s own delegation, calls
`RecordSpatialObservationUseCase`, exactly as `4b`'s `CreateHazardousEventUseCase` remains inert
until its own future caller exists.

## Open Questions

None remaining for this change. Two questions the SOLID/independent-code-review pass raised were
resolved by direct user decision, 2026-09-30, not deferred:

- **`ValidationError`-before-`ConflictError` ordering, extended to `divisionIds`/`geometries`.**
  Fixed — see Decision 7's current text. `newObservation` (and its membership check) is now built
  before the conflict check, not after.
- **`tenantId`/`hazardousEventId` had no runtime shape guard**, unlike every other command field.
  Fixed — a shared `assertNonEmptyString()` helper
  (`application/assertNonEmptyString.ts`, matching `HazardousEvent.ts`'s own private helper of the
  same name and rule) now guards both fields at the top of `execute()`, and was also added to
  `4b`'s `CreateHazardousEventUseCase` for `tenantId` — the same gap existed there, confirmed
  before fixing, not assumed. Reusable by any future entity-type use case with the same shape.

Every other question this change's own scope raises is already answered:

- **`SpatialObservationRecord` vs. `SpatialObservation` retyping** — settled by `3d`'s own
  design.md Non-Goals: `5e`'s job, not this change's (Decision 3).
- **Nullable `division.countryAccountsId` semantics** — settled by direct user decision, `3d`
  design.md Open Questions, 2026-09-21: excluded from every tenant's valid set (Decision 8).
- **Concurrent-`confirmReplace` lost-update protection** — settled as an accepted, inherited risk
  from `3d`'s own design.md Risks, not a new decision this change must make (Decision 6, Risks).
