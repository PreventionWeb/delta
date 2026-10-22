## MODIFIED Requirements

### Requirement: findCurrentSpatialObservation returns the latest-by-observationTime reading or null

`findCurrentSpatialObservation(hazardousEventId: string, tenantId: string, tx?: Tx): Promise<SpatialObservationRecord | null>`
MUST be declared on the interface. It MUST resolve `null`, not throw, when the hazardous event has
no spatial observation recorded yet. An implementation MUST scope this read by `tenantId` —
`hazardous_event_spatial_observation` carries no tenant column of its own, so an implementation
MUST join to the parent `hazardous_event` row and filter on its tenant column — and MUST resolve
`null` (not throw, and not resolve an observation) when `hazardousEventId` belongs to a different
tenant than `tenantId`, even if observations exist for it under its own tenant. When multiple
observations exist, the resolved observation MUST be the one with the latest `observationTime`,
independent of the order rows were inserted in (an observation backfilled with an earlier
`observationTime` after a later one was already recorded MUST NOT become "current"). When `tx` is
supplied, the lookup MUST execute against that same `tx`, not a separate connection, mirroring its
two sibling spatial methods (same rationale as design.md Decision 9 of `ca-persistence-unit-of-work`);
when `tx` is omitted, behavior is unchanged — the lookup executes against the module-level
connection.

#### Scenario: No observations recorded resolves to null, not a thrown error

- **GIVEN** an implementation of `IHazardousEventRepository` and a `hazardousEventId` with no
  spatial observation rows
- **WHEN** `findCurrentSpatialObservation(hazardousEventId, tenantId)` is called
- **THEN** it MUST resolve to `null`
- **AND** it MUST NOT throw or reject the `Promise`

#### Scenario: A backfilled earlier observationTime inserted after a later one is not selected as current

- **GIVEN** an observation with `observationTime` `2026-03-01` already recorded for a
  `hazardousEventId`, under a given `tenantId`
- **WHEN** a second observation with `observationTime` `2026-01-15` (an earlier, backfilled time) is
  recorded afterward for the same `hazardousEventId`, and `findCurrentSpatialObservation(hazardousEventId,
  tenantId)` is then called
- **THEN** it MUST resolve the `2026-03-01` observation, not the one inserted most recently

#### Scenario: A hazardousEventId belonging to a different tenant resolves null

- **GIVEN** a `hazardousEventId` under `tenantId` "tenant-1" with at least one recorded spatial
  observation
- **WHEN** `findCurrentSpatialObservation(hazardousEventId, "tenant-2")` is called
- **THEN** it MUST resolve `null`, not the observation recorded under "tenant-1"

#### Scenario: When called under a caller-supplied tx, the lookup sees that transaction's own uncommitted observation row

- **GIVEN** an open transaction handle `tx` under which the caller has inserted a
  `hazardous_event_spatial_observation` row not yet committed
- **WHEN** `findCurrentSpatialObservation(hazardousEventId, tenantId, tx)` is called for that same,
  still-uncommitted `hazardousEventId`
- **THEN** the resolved result MUST reflect that uncommitted row — a read via a separate connection
  would not see it; this method MUST NOT use a separate connection when `tx` is supplied

### Requirement: findSpatialObservationByTime performs an exact observationTime lookup

`findSpatialObservationByTime(hazardousEventId: string, observationTime: Date, tenantId: string, tx?: Tx): Promise<SpatialObservationRecord | null>`
MUST be declared on the interface, resolving `null` when no observation exists at exactly that
`observationTime`. An implementation MUST scope this read by `tenantId` — joining to the parent
`hazardous_event` row, the same mechanism `findCurrentSpatialObservation` uses, since
`hazardous_event_spatial_observation` carries no tenant column of its own — and MUST resolve `null`
when `hazardousEventId` belongs to a different tenant than `tenantId`, even if an observation exists
at that exact `observationTime` under its own tenant. When `tx` is supplied, the lookup MUST execute
against that same `tx`, not a separate connection (needed so `RecordSpatialObservationUseCase`'s
delegated call, when nested inside a caller's own transaction, never mixes connections — design.md
Decision 9 of `ca-persistence-unit-of-work`).

#### Scenario: Method signature accepts a Date and returns a nullable record

- **GIVEN** the `IHazardousEventRepository` interface
- **WHEN** a TypeScript class declares `implements IHazardousEventRepository` with
  `findSpatialObservationByTime`'s `observationTime` typed as `string` instead of `Date`
- **THEN** `yarn tsc` MUST report a type error

#### Scenario: An exact observationTime match resolves the full record, including geometries and divisionIds

- **GIVEN** an observation recorded with a specific `observationTime`, non-empty `geometries`, and
  non-empty `divisionIds`, under a given `hazardousEventId`/`tenantId`
- **WHEN** `findSpatialObservationByTime(hazardousEventId, thatExactObservationTime, tenantId)` is
  called
- **THEN** it MUST resolve a record whose `geometries` and `divisionIds` match what was recorded,
  not just its scalar fields

#### Scenario: A hazardousEventId belonging to a different tenant resolves null, not the foreign-tenant observation

- **GIVEN** an observation recorded at a given `observationTime` for a `hazardousEventId` under
  `tenantId` "tenant-1"
- **WHEN** `findSpatialObservationByTime(hazardousEventId, thatObservationTime, "tenant-2")` is
  called
- **THEN** it MUST resolve `null`

### Requirement: saveSpatialObservation is tenant-scoped by the parent hazardousEventId

`saveSpatialObservation(hazardousEventId: string, observation: SpatialObservationRecord, tenantId: string, tx?: Tx): Promise<SpatialObservationRecord>`
MUST be declared on the interface. An implementation MUST verify `hazardousEventId` belongs to
`tenantId` before writing any spatial row (DEF-005) — the underlying spatial tables have no
`country_accounts_id` column of their own, so this verification MUST join to or otherwise query the
parent `hazardous_event` row — and MUST reject with `NotFoundError` (the same error class
`findById` uses for a missing/foreign-tenant id) when `hazardousEventId` does not belong to
`tenantId`, without writing any row. An implementation MUST reject with `ValidationError` when
`observation.hazardousEventId` does not equal the `hazardousEventId` parameter, without writing any
row. An implementation MUST independently re-verify, at the DB layer, that every entry in
`observation.divisionIds` belongs to `tenantId` — a second, write-time gate, not a substitute for
whatever read-path division-validity check a caller already performed — and MUST reject with
`ValidationError` naming any entry that does not, without writing any row. This is an insert-or-
replace operation keyed by `observation.id`: when `observation.id` matches an existing row's id
under the same `hazardousEventId`, the call MUST replace that row's `observationTime`, `note`,
`geometries`, and `divisionIds` with the given values, and MUST leave that row's original creation
timestamp unchanged. When `observation.id` matches an existing row's id under a *different*
`hazardousEventId`, the call MUST reject with `ConflictError`, MUST NOT overwrite that row, and
MUST NOT write any new row. When `tx` is supplied, every statement this method issues — including
the tenant/ownership checks and any read needed to assemble the resolved return value — MUST
execute against that same `tx`, not a separate connection; this is the one method of the three
where `tx`-awareness is load-bearing for correctness, not just consistency: a caller nesting this
call inside its own open transaction (e.g. `UpdateHazardousEventUseCase`'s bundled spatial-
observation path) needs this write to roll back together with the rest of that transaction.

#### Scenario: Method signature includes an explicit tenantId

- **GIVEN** the `IHazardousEventRepository` interface
- **WHEN** a TypeScript class declares `implements IHazardousEventRepository` and omits `tenantId`
  from `saveSpatialObservation`
- **THEN** `yarn tsc` MUST report a type error

#### Scenario: A hazardousEventId not belonging to tenantId is rejected before any row is written

- **GIVEN** a `hazardousEventId` that either does not exist or belongs to a different tenant than
  `tenantId`
- **WHEN** `saveSpatialObservation(hazardousEventId, observation, tenantId)` is called
- **THEN** the call MUST reject with `NotFoundError`
- **AND** no `hazardous_event_spatial_observation` row MUST be created

#### Scenario: A mismatched observation.hazardousEventId is rejected

- **GIVEN** a valid `hazardousEventId`/`tenantId` pair and an `observation` whose own
  `hazardousEventId` field is a different id than the `hazardousEventId` parameter
- **WHEN** `saveSpatialObservation(hazardousEventId, observation, tenantId)` is called
- **THEN** the call MUST reject with `ValidationError`
- **AND** no row MUST be written

#### Scenario: A divisionId belonging to a different tenant is rejected at the DB layer, not just whatever the caller already checked

- **GIVEN** a valid `hazardousEventId`/`tenantId` pair and an `observation.divisionIds` entry that
  belongs to a `division` row under a different tenant
- **WHEN** `saveSpatialObservation(hazardousEventId, observation, tenantId)` is called
- **THEN** the call MUST reject with `ValidationError`
- **AND** no row MUST be written — not the parent observation row, and not any geometry or
  division child row

#### Scenario: A new observation with non-empty geometries and divisionIds persists all three tables and round-trips via a subsequent read

- **GIVEN** a valid `hazardousEventId`/`tenantId` pair, a fresh `observation.id`, non-empty
  `geometries`, and non-empty `divisionIds` all valid for `tenantId`
- **WHEN** `saveSpatialObservation(hazardousEventId, observation, tenantId)` is called
- **THEN** the call MUST resolve a record matching the input's `observationTime`, `note`,
  `geometries`, and `divisionIds`
- **AND** a subsequent `findSpatialObservationByTime` for that same `hazardousEventId`/
  `observationTime`/`tenantId` MUST resolve a record whose `geometries` and `divisionIds` match,
  element-for-element (set equality, not array-position equality)

#### Scenario: Replacing an existing observation by id updates its fields and preserves its original creation time

- **GIVEN** a persisted observation with a known `id` and `createdAt`
- **WHEN** `saveSpatialObservation` is called again with `observation.id` equal to that same id, a
  changed `note` and `geometries`, under the same `hazardousEventId`/`tenantId`
- **THEN** the call MUST resolve a record with the changed `note` and `geometries`
- **AND** the resolved record's `createdAt` MUST equal the original `createdAt`, unchanged

#### Scenario: Replacing an existing observation's geometries and divisionIds removes the prior child rows, not merges with them

- **GIVEN** a persisted observation with two `geometries` elements and one `divisionId`
- **WHEN** `saveSpatialObservation` is called again with the same `observation.id`, one different
  `geometries` element, and zero `divisionIds`
- **THEN** a subsequent read MUST resolve exactly the one new `geometries` element and zero
  `divisionIds` — not a union of the old and new values

#### Scenario: An id already used by a different hazardousEventId is rejected as a conflict, not silently overwritten

- **GIVEN** a persisted observation with a given `id` under `hazardousEventId` A
- **WHEN** `saveSpatialObservation` is called with that same `observation.id`, but with the
  `hazardousEventId` parameter and `observation.hazardousEventId` both set to a different,
  valid-for-tenant `hazardousEventId` B
- **THEN** the call MUST reject with `ConflictError`
- **AND** the original observation under `hazardousEventId` A MUST remain unchanged

#### Scenario: When called under a caller-supplied tx, the write and its ownership/division checks execute against that same tx

- **GIVEN** an open transaction handle `tx` under which the caller has already inserted a
  `hazardous_event` row not yet committed
- **WHEN** `saveSpatialObservation(hazardousEventId, observation, tenantId, tx)` is called for that
  same, still-uncommitted `hazardousEventId`
- **THEN** the ownership check MUST see that transaction's own uncommitted `hazardous_event` row —
  not reject with `NotFoundError` because a separate connection can't see it yet — and the write
  itself MUST execute against that same `tx`

### Requirement: Concurrent saveSpatialObservation calls at the same observationTime do not silently create two conflicting rows

Two callers that each resolve `findCurrentSpatialObservation` (or `findSpatialObservationByTime`)
to "no conflict" and then both call `saveSpatialObservation` with distinct, freshly-generated
`observation.id` values for the same `hazardousEventId` and `observationTime`, before either write
completes, MUST NOT both succeed in creating two distinct rows for that pair. The real
`hazardous_event_spatial_observation` table's own `UNIQUE(hazardous_event_id, observation_time)`
constraint is the authoritative guard for this. The caller whose write loses this race MUST reject
with the same `ConflictError` shape `SpatialObservation.assertNoConflictingObservationTime` throws
for a synchronously-detected duplicate (`hazardous-event-spatial-observation`'s own "Concurrent
callers" requirement) — mapped from the underlying DB constraint violation by this implementation,
never surfaced as a raw, unmapped database error. This resolves what this requirement previously
deferred to Phase 3d's `SpatialObservation` design; that design has since specified the contract,
and this implementation satisfies it.

#### Scenario: Two concurrent saves for the same hazardousEventId and observationTime do not both silently succeed as independent rows

- **GIVEN** no spatial observation exists yet for a given `hazardousEventId` and `observationTime`
- **WHEN** two callers each call `saveSpatialObservation` with that same `hazardousEventId` and
  `observationTime`, but distinct, freshly-generated `observation.id` values, concurrently, before
  either call resolves
- **THEN** exactly one call MUST resolve successfully
- **AND** the other call MUST reject with `ConflictError` — the same shape
  `SpatialObservation.assertNoConflictingObservationTime` throws for a synchronously-detected
  duplicate, not a raw, unmapped database error
- **AND** exactly one `hazardous_event_spatial_observation` row MUST exist for that
  `hazardousEventId`/`observationTime` pair once both calls have settled

#### Scenario: A malformed geometries element is rejected with ValidationError, no row written

- **GIVEN** a valid `hazardousEventId`/`tenantId` pair and an `observation.geometries` entry that is
  not a well-formed GeoJSON geometry object (e.g. missing `coordinates`)
- **WHEN** `saveSpatialObservation(hazardousEventId, observation, tenantId)` is called
- **THEN** the call MUST reject with `ValidationError`, not a raw, unmapped database error
- **AND** no row MUST be written — not the parent observation row, and not any geometry or
  division child row

### Requirement: No method on IHazardousEventRepository accepts a raw Drizzle or infrastructure type

Every method's parameter and return types MUST be expressed in terms of `HazardousEvent`,
`SpatialObservationRecord`, primitive types, `Pagination`, or `Tx` — never a Drizzle
`$inferSelect`/`$inferInsert` row type from any table file. This requirement has always been
about row-shape types specifically — a type that carries a table's own column shape — not about
an opaque connection or transaction handle. The optional trailing `tx?: Tx` parameter on
`insert`/`update`/`delete`/`countReferencingDisasterEvents`/`findById`/
`findCurrentSpatialObservation`/`findSpatialObservationByTime`/`saveSpatialObservation`, and the
required `tx: Tx` parameter on `findByIdForUpdate`, are explicitly permitted on that basis
(design.md Decision 3 and, for the tx-threaded spatial methods, Decision 9 of
`ca-persistence-unit-of-work`).

#### Scenario: No Drizzle type appears in the interface's method signatures

- **GIVEN** the `IHazardousEventRepository` interface source
- **WHEN** its imports and method signatures are inspected
- **THEN** none MUST reference `SelectHazardousEvent`, `InsertHazardousEvent`, or any other
  Drizzle-inferred row type
- **AND** the presence of `Tx` on `insert`, `update`, `delete`, `countReferencingDisasterEvents`,
  `findById`, `findCurrentSpatialObservation`, `findSpatialObservationByTime`,
  `saveSpatialObservation`, or `findByIdForUpdate` MUST NOT be treated as a violation of this
  requirement

## ADDED Requirements

### Requirement: SpatialObservationRecord is a type alias of SpatialObservation's own SpatialObservationProps

`SpatialObservationRecord`, as used throughout this interface, MUST be declared as `export type
SpatialObservationRecord = SpatialObservationProps;`, importing `SpatialObservationProps` (type-
only) from the `SpatialObservation` domain entity's own module — not as an independently-declared
interface that merely happens to share the same fields. This closes `DEF-027`: a future field added
to `SpatialObservationProps` and not mirrored here (or vice versa) is now a single edit, not two
that could silently diverge undetected by `tsc`.

#### Scenario: SpatialObservationRecord is declared as a type alias, not a separate interface

- **GIVEN** `IHazardousEventRepository.ts`'s source
- **WHEN** its declaration of `SpatialObservationRecord` is inspected
- **THEN** it MUST be a `type` alias assigned directly to `SpatialObservationProps` (imported from
  `SpatialObservation.ts`), not an `interface SpatialObservationRecord { ... }` declaration with its
  own, independently-listed fields
