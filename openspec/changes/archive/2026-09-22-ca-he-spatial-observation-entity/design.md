## Context

See proposal.md - Why for motivation. This covers only what shapes the entity's design.

The sole source of truth for this entity's shape is the three real, already-shipped Phase 2
tables: `app/domains/hazardous-events/infrastructure/hazardousEventSpatialObservationTable.ts`
(parent row: `id`, `hazardousEventId`, `observationTime` `timestamptz` `.notNull()`, `note` plain
nullable `text`, `createdAt`/`updatedAt` both `timestamptz` `.notNull()` with a `CURRENT_TIMESTAMP`
default), `hazardousEventSpatialObservationGeomTable.ts` (one-to-many `geom`, untyped PostGIS
`geometry(Geometry,4326)`, no PostGIS TS library so typed `unknown`, matching the existing
`customType`'s own `$type<unknown>()`), and `hazardousEventSpatialObservationDivisionTable.ts`
(one-to-many `divisionId` FK, `unique(observation_id, division_id)` at the DB level). No field is
invented; this is the same field set `3b`'s provisional `SpatialObservationRecord`
(`IHazardousEventRepository.ts`) already declared, whose own doc comment names this change as its
successor.

`app/drizzle/schema/divisionTable.ts` is the other schema this design depends on:
`countryAccountsId: uuid("country_accounts_id").references(() => countryAccountsTable.id)` is
**nullable** — no `.notNull()`. Every real division query in the codebase
(`_docs/division/division_technical_implementation.md`, confirmed against the live queries it
documents, e.g. `findDivisionsIntersecting`, `findDivisionsContaining`,
`checkDuplicateImportId`/`checkDuplicateNationalId`) scopes with a strict
`eq(divisionTable.countryAccountsId, tenantContext)` — never an "or null" fallback for
tenant-agnostic/global divisions. This is the grounding for Decision 4 and the Open Question
below.

Today's live gap this change closes at the domain layer:
`app/backend.server/models/event.ts`'s `syncHazardousEventSpatialFootprint` (lines ~393-420)
validates a division id only via `inArray(divisionTable.id, divisionIds)` — confirmed by reading
the function directly, no `countryAccountsId` filter appears anywhere in it. This is `DEF-005`
(`_docs/refactoring-plan/deferred-items-register.md`), which names this change ("Phase 3d") as the
intent that closes it "by construction."

Existing precedent followed: `app/domains/hazardous-events/domain/HazardousEvent.ts` (private
constructor, single validated static `create()` factory, defensive `Date` cloning, the
`isInvalidDate`/`typeof` guard pair its own design.md Decisions 9-11 retrofitted after the fact —
applied here from the start, not retrofitted later) for the entity shape itself, and
`app/domains/validation-workflow/domain/WorkflowInstance.ts`'s `transition()` method (a
state-dependent guard that throws `ConflictError` for "operation disallowed given current state")
for the duplicate-`observationTime` conflict check — this is a genuine child entity with identity
and a state-dependent business rule, not a stateless domain service like `3c`'s `CausalChain.ts`.

Also read: `3b`'s archived design.md (`openspec/changes/archive/2026-09-17-ca-he-hazardous-event-entity/design.md`)
Decisions 5-7, which explicitly anticipated this change and deferred two things to it: the real
entity shape (Decision 5) and the concurrent-callers contract for
`findCurrentSpatialObservation` → `saveSpatialObservation` (Decision 7, "defers the actual
conflict-handling contract... to `3d`'s own design"). Both are addressed below (Decisions 1-2 and
7). The roadmap's `5e — Spatial Observation Persistence` (not yet proposed) is the future intent
that implements the real tenant-scoped division query and wires this entity into
`IHazardousEventRepository`'s adapter.

## Goals / Non-Goals

**Goals:**

- Define `SpatialObservation` as an immutable, framework-free domain entity matching
  `HazardousEvent`/`WorkflowInstance`'s established shape, grounded in the three real Phase 2
  tables' actual columns.
- Implement the "current observation" rule (latest by `observationTime`, order-independent) and
  the duplicate-`observationTime` conflict rule (`ConflictError` unless `confirmReplace: true`) —
  the roadmap's "resolved open decision #8."
- Close `DEF-005` by construction: make it structurally impossible to call
  `SpatialObservation.create()` without supplying a tenant-scoped `validDivisionIds` set, so a
  future adapter that forgets to scope it fails a type/behavior check rather than silently
  repeating today's gap.
- Zero DB/framework imports, verified by `yarn tsc` and the test tier itself (unit only, no PGlite
  import — Phase 3 Gate).

**Non-Goals:**

- No `IHazardousEventRepository` changes. The port's three spatial methods keep using
  `SpatialObservationRecord` until `5e` wires the real adapter and updates the port signatures —
  explicitly flagged as a follow-up in `3b`'s own design.md Decision 5, not silently left stale by
  this change.
- No real DB query for tenant-scoped division validity. `SpatialObservation.create()` receives
  `validDivisionIds` as a plain parameter; computing it correctly (a real, tenant-filtered
  `divisionTable` query) is `5e`'s job, same division of labor `3c`'s `CausalChain.ts` established
  for `existingEdges`.
- No use case, no NestJS module wiring, no route.
- No resolution of the nullable-`countryAccountsId` semantics for `5e`'s future query — flagged as
  an explicit Open Question below, not decided here, because it does not change this change's own
  code (see Decision 4).
- No per-element validation of `geometries`. Decision 8's `Array.isArray` guard validates only that
  the collection itself is an array, not that each entry is a well-formed geometry (e.g. non-null,
  a correctly-shaped PostGIS structure) — there is no PostGIS TS library to validate against (see
  Context), and this stays a framework-free domain layer either way.

## Decisions

### 1. Immutable entity: private constructor, single validated `create()` factory, two additional pure static methods

Matches `HazardousEvent`/`WorkflowInstance`. `SpatialObservationProps` fields are `readonly`;
`SpatialObservation.create(props, validDivisionIds)` is the only construction path. Beyond the
entity shape itself, two further static methods carry the business rules that only make sense
across more than one observation or against an existing one:

```ts
export interface SpatialObservationProps {
	readonly id: string;
	readonly hazardousEventId: string;
	readonly observationTime: Date;
	readonly note: string | null;
	readonly geometries: readonly unknown[];
	readonly divisionIds: readonly string[];
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

class SpatialObservation {
	static create(
		props: SpatialObservationProps,
		validDivisionIds: ReadonlySet<string>,
	): SpatialObservation;

	/** Latest-by-observationTime selection, order-independent. Returns null for an empty array. */
	static selectCurrent(
		observations: readonly SpatialObservation[],
	): SpatialObservation | null;

	/** @throws {ConflictError} when existingAtSameTime is non-null and confirmReplace is false. */
	static assertNoConflictingObservationTime(
		existingAtSameTime: SpatialObservation | null,
		confirmReplace: boolean,
	): void;
}
```

`selectCurrent` and `assertNoConflictingObservationTime` are static, not instance methods,
because both reason about a _set_ of observations (or one observation plus a candidate), not one
instance's own state — the same reasoning `CausalChain.ts`'s design.md Decision 1 used to justify
stateless functions, applied narrowly to just these two rules while the entity itself keeps
`HazardousEvent`'s class shape (this design's own framing above: a genuine child entity, not a
stateless service).

**Alternative considered:** fold the conflict check into `create()` itself (a third parameter,
`existingAtSameTime`). Rejected — `create()` is pure shape/reference validation (mirrors
`HazardousEvent.create()`'s own scope), while the conflict rule is a state-dependent business
decision (mirrors `WorkflowInstance.transition()`). Conflating them would mean a caller who only
wants to validate shape (e.g. deserializing a row already read from the DB, where no conflict
question applies) is forced to thread an irrelevant parameter through `create()`. Keeping them
separate also matches this file's own decision to split `HazardousEvent.ts`'s Decision 9 (Date
validity) from Decision 3 (date ordering) into two distinct checks with two distinct messages,
rather than one combined condition.

### 2. `create()` validates `id`/`hazardousEventId`/`observationTime` presence and shape; `isInvalidDate`/`typeof` guards applied from the start, not retrofitted

`HazardousEvent.ts`'s own design.md Decisions 9-11 record three gaps (raw `TypeError` instead of
`ValidationError` for a non-`Date` `createdAt`, a `NaN`-time `Date`, and a non-string required
field) that were found only after the fact and patched in three follow-up decisions. This design
applies the same two guards from the outset instead of repeating that discovery cycle:

- `id`, `hazardousEventId` go through the same required-string-field loop
  `HazardousEvent.create()` uses for `tenantId`/`specificHazardId`/`startDate`:
  `typeof value !== "string" || value.trim().length === 0` → `ValidationError` naming the field.
  Both are essential identity fields (an observation with no `hazardousEventId` belongs to no
  aggregate; an `id`-less observation cannot be referenced), unlike `note`, which is legitimately
  absent.
- `observationTime`, `createdAt`, `updatedAt` are all real, non-null `timestamptz` columns (unlike
  `HazardousEvent`'s own `updatedAt`, which is nullable at the DB level) — each is checked with the
  same `isInvalidDate` predicate (`!(value instanceof Date) || Number.isNaN(value.getTime())`),
  throwing `ValidationError` naming the field, before any other check runs. `isInvalidDate` is
  redefined locally in `SpatialObservation.ts`, not imported from `HazardousEvent.ts` or
  `WorkflowInstance.ts` — matches the module-boundary discipline `HazardousEvent.ts`'s own Decision
  9 already established (no shared import across files even within the same domain, to keep each
  entity file independently auditable).

### 3. `create()` rejects duplicate `divisionIds` within one observation — domain-layer mirror of the DB's own `unique(observation_id, division_id)` constraint

`hazardousEventSpatialObservationDivisionTable`'s
`unique("hazardous_event_spatial_observation_division_obs_div_unique")` constraint already
prevents this at the DB level. Per Invariant 3 (DB constraints are defense-in-depth, never a
substitute for the domain-layer rule — the same principle the table's sibling comment states
explicitly for the parent table's time-uniqueness constraint), `create()` throws `ValidationError`
when `props.divisionIds` contains a repeated value, checked via `new Set(props.divisionIds).size
!== props.divisionIds.length`, before the tenant-scoping check in Decision 4 runs (a duplicate is a
shape problem, independent of which set of ids is "valid"). This comparison itself assumes
`props.divisionIds` is already an array — Decision 8's array-shape guard runs first and guarantees
that.

### 4. `create()` validates every `divisionId` against a caller-supplied `validDivisionIds: ReadonlySet<string>` — closes DEF-005 by construction, without querying the DB itself

The entity has zero DB dependency (Phase 3 Gate), so it cannot itself run the tenant-scoped
`divisionTable` query DEF-005's fix ultimately requires. Instead, `create()`'s second parameter is
mandatory (not optional, no default) — a caller cannot construct a `SpatialObservation` without
supplying some `validDivisionIds` set, even an empty one. `create()` throws `ValidationError`
naming the first offending id when any `props.divisionIds` entry is absent from that set. This
mirrors `3c`'s `CausalChain.ts` Decision 6 (a plain `existingEdges` array, not a live DB read) and
directly satisfies the DEF-005 register entry's own text: "Fixed by construction if Phase 3d's
`SpatialObservation` entity scopes it from the start." The real query that populates
`validDivisionIds` correctly (tenant-filtered) is `5e`'s job — see Non-Goals and the Open Question
below for what "tenant-filtered" should mean once that query is written.

**Alternative considered:** accept a `tenantId: string` parameter directly and defer the "how do we
know a division belongs to this tenant" question entirely to `5e`. Rejected — this would leave
`SpatialObservation.ts` with no way to enforce anything about divisions at all until `5e` ships,
which is a bigger gap than `HazardousEvent.ts` ever had for its own required fields, and it would
make `DEF-005`'s "closed by construction" claim false: an adapter could trivially forget to check
tenancy and `create()` would have no way to catch it. Requiring an explicit `validDivisionIds` set
means the _shape_ of the check exists now, and a future adapter can only get it wrong by computing
the set incorrectly — not by skipping the check.

### 5. `selectCurrent()` — latest by `observationTime`, ties broken deterministically by array order, empty input returns `null`

Implemented as a single pass over the input array comparing
`candidate.observationTime.getTime()` against the running maximum, keeping the first-seen entry on
an exact tie. An exact `observationTime` tie should never occur in practice (the DB's own
`unique(hazardous_event_id, observation_time)` constraint and Decision 6's duplicate check both
prevent it), but `selectCurrent` is a pure function over whatever array it's given — it must not
crash or behave non-deterministically if one is ever passed defensively (e.g. a caller merging two
stale reads). This is the same "must not crash on a defensive/malformed input" discipline
`HazardousEvent.ts`'s Decision 9/10 established for `create()`, applied here to a different method.

### 6. Duplicate-`observationTime` conflict: `ConflictError`, not `ValidationError` — matches `WorkflowInstance.transition()`, not `HazardousEvent.create()`

Checked directly against this codebase's established split (`CausalChain.ts`'s design.md Decision
5 did the same lookup before choosing): `ValidationError` (422) is for malformed/incomplete input;
`ConflictError` (409) is for "well-formed input, but disallowed given existing state."
`assertNoConflictingObservationTime`'s candidate observation is already a valid, constructed
`SpatialObservation` (it passed `create()`) — the only reason to reject it is that another
observation already occupies the same `observationTime` and the caller didn't opt into replacing
it. That is a conflict with existing state, not a shape problem, and it is exactly the same
"operation disallowed given current state" shape `WorkflowInstance.transition()` already
established `ConflictError` for in this codebase.

### 7. Concurrent-callers contract for `findCurrentSpatialObservation`/`findSpatialObservationByTime` → `saveSpatialObservation` — resolving what `3b`'s design.md Decision 7 deferred here

This spec's own mandatory concurrent-callers rule applies once removed: `SpatialObservation.ts`
itself holds no shared mutable state (same reasoning as `CausalChain.ts`'s design.md Risks — a
pure entity/pure static functions have no internal cache/counter for two callers to race on). The
real hazard is one layer up, in whatever future adapter loads an existing observation, calls
`assertNoConflictingObservationTime`, and then persists — and `3b`'s design.md Decision 7
explicitly named this as the thing "deferred to `3d`'s own design." This design resolves the
_contract_, not the enforcement mechanism (which still has no adapter to live in until `5e`):

- Two callers, A and B, each independently call (the future adapter's)
  `findSpatialObservationByTime` for the same `hazardousEventId`/`observationTime`, both observe
  `null` (no existing observation yet), both pass `assertNoConflictingObservationTime(null, false)`
  without error, and both then call `saveSpatialObservation`.
- `hazardous_event_spatial_observation`'s `unique(hazardous_event_id, observation_time)` constraint
  (already shipped; its own comment: "DB-level defense-in-depth; the domain-layer conflict check
  (3d/5e) is authoritative") is what actually prevents both inserts from succeeding — not anything
  in this zero-DB entity.
- **The contract `5e`'s adapter MUST satisfy:** the caller that loses the race (its insert hits the
  unique-constraint violation) MUST surface to its own caller the same `ConflictError` shape that
  `assertNoConflictingObservationTime` throws for a synchronously-detected duplicate — mapped from
  the DB constraint violation, not left as a raw DB error. A caller of the eventual use case must
  not be able to tell, from the error alone, whether their conflict was detected via a
  synchronous pre-check or a losing race — both are "someone already recorded an observation at
  this exact time," and both require the same `confirmReplace` escape hatch to resolve.
- This change's specs/hazardous-event-spatial-observation/spec.md states this contract as a
  requirement precisely so `5e`'s design has an unambiguous target, the same way `3b`'s own
  design.md stated it for `3d`; it cannot be exercised by a zero-DB unit test, so it is documented
  as a contract, not asserted by `SpatialObservation.test.ts` itself.

### 8. `create()` validates `geometries` and `divisionIds` are arrays — extending Decision 2's "never a raw TypeError" principle to the two array-typed props it didn't cover

Added after a Gate 8 code review of the already-implemented `SpatialObservation.ts` found the gap:
Decision 2's raw-error-never convention was applied to every scalar prop (`id`, `hazardousEventId`,
`observationTime`, `createdAt`, `updatedAt`) but not to `geometries` or `divisionIds` — both
`readonly` array props on `SpatialObservationProps` (Decision 1), each backed by a real,
`.notNull()` DB column (`hazardousEventSpatialObservationGeomTable`/`...DivisionTable`, Context).
Concretely: `geometries: null`/`undefined` reached the private constructor's unguarded
`[...props.geometries]` and threw a raw `TypeError`; `divisionIds: null`/`undefined` reached
Decision 3's unguarded `new Set(props.divisionIds).size !== props.divisionIds.length` and threw the
same way; and a bare string for either — a non-array but iterable value — did not throw at all, and
was instead silently spread/iterated into its individual characters, producing a silently corrupted
entity rather than any error. This is a strictly worse failure mode than a raw crash, and it is
exactly the class of gap Decision 2 already exists to close for every other field.

`create()` now checks `Array.isArray(props.geometries)` and `Array.isArray(props.divisionIds)`,
throwing `ValidationError` naming the offending field on failure. Per Decision 2's own literal
"before any other check runs," these two guards run in their own pass immediately after the
`observationTime`/`createdAt`/`updatedAt` date guards and before the `id`/`hazardousEventId` string
guards — in all cases before Decision 3's duplicate-value check and before the constructor's own
array-copying of `geometries`/`divisionIds`. The ordering relative to Decision 3 is load-bearing,
not stylistic: Decision 3's
`new Set(props.divisionIds)` does not itself validate shape — it accepts a string and iterates it
into individual characters, so a non-array `divisionIds` could otherwise surface as the wrong
diagnosis (a "duplicate value" `ValidationError` for what is actually a shape problem), or, worse,
pass Decision 3's check entirely if those characters happen not to collide and then reach Decision
4's membership check as corrupted per-character entries. Running the array-shape guard first means
`divisionIds` is a real array everywhere downstream of it — Decision 3, Decision 4, and the
constructor's `[...props.divisionIds]` copy.

`geometries` has no duplicate-value or membership check of its own (Non-Goals — this design does
not validate individual geometry shapes, only that the collection itself is an array), so its
`Array.isArray` guard exists solely to protect the constructor's `[...props.geometries]` copy from
the same raw-error/silent-corruption failure mode.

**Alternative considered:** rely on the constructor's spread (`[...props.geometries]`,
`[...props.divisionIds]`) to fail naturally for a malformed value. Rejected — a spread throws a raw
`TypeError` for `null`/`undefined`/a number, which is exactly the failure mode Decision 2 exists to
prevent, and it does not throw at all for an iterable-but-wrong-shape value like a string; it
silently produces character-level `geometries`/`divisionIds` with no signal to the caller that
anything went wrong. Both outcomes are strictly worse than a named `ValidationError`.

## Risks / Trade-offs

- **[Risk] Immutability of `geometries` is shallow, not deep.** The constructor and getter both
  copy the array itself (`[...props.geometries]`), but the individual elements are the same object
  references the caller supplied — a caller holding a reference into one of those `unknown`
  geometry objects can mutate it in place, undermining the immutability guarantee `cloneDate`
  otherwise defends for the Date fields. → Mitigation: accepted, not fixed — `geometries` is
  untyped `unknown` with no PostGIS TS library to deep-clone against (Context), so a structural
  deep copy isn't practical here. Flagged explicitly (Gate 10 finding) so a future reader doesn't
  assume full immutability where only the array wrapper is actually protected.
- **[Risk] `validDivisionIds` closes DEF-005's shape but not its substance until `5e` ships.** A
  future adapter could still compute `validDivisionIds` incorrectly (e.g. forgetting the tenant
  filter, effectively passing "all divisions") and `create()` would have no way to detect that —
  it only enforces that _some_ set was supplied and every `divisionId` is a member of it. →
  Mitigation: this is the same trade-off `3b`'s own design.md Decision 6 accepted for the port's
  `tenantId` parameter ("fixes the shape but not the actual check... DEF-005 remains open until a
  real adapter implements the verification"); `5e`'s own spec/tests are where the real query's
  correctness must be verified (PGlite integration tier, per the roadmap's own `5e` test-tier
  text: "cross-tenant division id is rejected at the DB layer too").
- **[Risk] Nullable `divisionTable.countryAccountsId` semantics are unresolved (see Open
  Questions).** → Mitigation: does not block this change — `SpatialObservation.create()` treats
  `validDivisionIds` as an opaque set regardless of how it was computed. It does block `5e` from
  starting with a correct query; flagged explicitly rather than silently deferred.
- **[Risk] The concurrent-callers contract (Decision 7) cannot be exercised by this change's own
  unit tests.** A zero-DB entity cannot simulate a real DB unique-constraint violation. →
  Mitigation: the contract is specified now (this design, and the spec's own concurrent-callers
  requirement) so `5e`'s PGlite integration tests have an unambiguous behavior to assert against,
  the same hand-off pattern `3a`'s design.md used for `IWorkflowRepository.save()`'s own deferred
  lost-update race.
- **[Risk] No lost-update protection for two concurrent `confirmReplace: true` callers racing to
  replace the same observation.** If both A and B observe an existing observation at the same
  time, both pass `confirmReplace: true`, and both proceed to save — the DB's unique constraint
  does not reject either (both target the same existing row via an upsert), so the second write
  simply wins with no signal to the first caller that its "replace" was itself overwritten. →
  Mitigation: out of scope for this change (same class of risk `3a`'s and `3b`'s design.md already
  flagged for their own `save()` methods, with no optimistic-locking mechanism to live in yet);
  noted here explicitly so `5e` doesn't treat `confirmReplace` alone as a complete answer to
  concurrent replacement.

## Migration Plan

None. This change adds one new TypeScript file (plus its test) with no runtime side effects until
a future adapter (`5e`) and use case call it. No DB schema change, no data migration, no feature
flag.

## Open Questions

**What does `divisionTable.countryAccountsId === null` mean for tenant-scoped division validity —
global/shared reference data usable by any tenant, or an un-owned record no tenant's
`SpatialObservation` should ever reference?** Surfaced during Phase 0 validation for this change,
not resolved anywhere in the roadmap or `3b`'s design.md. The column is nullable at the DB level,
so both readings are representable in real data today.

- **Recommended answer, not yet confirmed:** reject it — a `null`-tenant division should be treated
  as **not valid for any tenant's `validDivisionIds` set**, the same way `3b`'s design.md Decision 2
  treated `HazardousEvent`'s own nullable-at-the-DB-level `tenantId`/`specificHazardId` columns as
  required-in-practice rather than trusting the schema's own looseness. Grounding: every real
  division query already in this codebase (`_docs/division/division_technical_implementation.md`,
  confirmed against the live queries it documents) scopes with a strict
  `eq(divisionTable.countryAccountsId, tenantContext)` — none use an "or null" fallback for a
  tenant-agnostic division. There is no existing evidence in this codebase that `null` was ever
  meant to signal "global reference data" as a deliberate feature; it looks like the same class of
  DB-level looseness `3b` found and tightened for `hazardous_event`'s own columns, not an
  intentional design.
- **Why this doesn't block this change:** `SpatialObservation.create()` only consumes
  `validDivisionIds` as an opaque, caller-supplied set (Decision 4) — it has no opinion on how that
  set was computed. This question only has to be answered before `5e` writes the real query.
- **Confirmed by the user, 2026-09-21:** reject a `null`-tenant division — it is not valid for any
  tenant's `validDivisionIds` set. The recommended answer above is now the decided one. This
  doesn't change this change's own implementation (`create()` still only consumes an
  already-computed `validDivisionIds` set as an opaque input), but `5e`'s future query must exclude
  `countryAccountsId IS NULL` divisions rather than treat them as globally valid.
