## MODIFIED Requirements

### Requirement: IHazardousEventRepository interface compiles as a valid, framework-free TypeScript port

The file `app/domains/hazardous-events/application/ports/IHazardousEventRepository.ts` MUST export
an interface named `IHazardousEventRepository`. It MUST declare exactly the ten methods
described below with the exact signatures shown. The file MUST NOT import from any Drizzle,
NestJS, or Remix module, **except** `app/db.server.ts`'s exported `Tx` type, imported as
`import type { Tx } from "~/db.server"` — a type-only import, erased at compile time, so this
file never loads `db.server.ts`'s runtime `dr` connection or pool. `Tx` carries no table-shape
information (it is a union over "the module-level connection" and "an already-open transaction
handle"), unlike a Drizzle `$inferSelect`/`$inferInsert` row type — the distinction this
exception exists to preserve (design.md Decision 3).

#### Scenario: TypeScript compilation succeeds

- **GIVEN** `IHazardousEventRepository.ts` is written with the correct method signatures and no
  disallowed imports
- **WHEN** `yarn tsc` is run
- **THEN** it MUST exit with code 0 and zero type errors referencing this file

### Requirement: insert persists a brand-new HazardousEvent and its four child collections

`insert(entity: HazardousEvent, tx?: Tx): Promise<HazardousEvent>` MUST be declared on the
interface. An implementation MUST persist the entity's own fields plus all four child
collections (`hazardDriverIds`, `attachments`, `fieldValues`, `customFieldValues`) as a
single atomic unit — a failure partway through MUST leave no partial row or partial child
collection persisted. It MUST NOT declare a separate `tenantId` parameter — the entity's
own `tenantId` property carries tenancy. A referential-integrity violation or malformed
input in the write itself (e.g. a child collection referencing a nonexistent id) MUST
reject with `ValidationError`, not an opaque database error. When `tx` is supplied, every
statement this method issues — including any read needed to assemble the resolved return
value — MUST execute against that same `tx`, not a separate connection, so a caller
nesting this call inside its own open transaction observes this method's own writes.

#### Scenario: Method signature has exactly two parameters, the second optional

- **GIVEN** the `IHazardousEventRepository` interface's `insert` method
- **WHEN** its parameter list is inspected
- **THEN** it MUST declare exactly two parameters, `entity: HazardousEvent` and an optional
  `tx?: Tx`

#### Scenario: A brand-new entity and its child collections are persisted together

- **GIVEN** a `HazardousEvent` with a non-empty `hazardDriverIds`, `attachments`,
  `fieldValues`, and `customFieldValues`, not yet persisted
- **WHEN** `insert(entity)` is called
- **THEN** the resolved entity's scalar fields and all four child collections MUST match
  the input entity's own values
- **AND** a subsequent `findById` for the same id and tenantId MUST resolve an entity
  whose four child collections match exactly

#### Scenario: An id collision on insert is rejected, not silently overwritten

- **GIVEN** an already-persisted `HazardousEvent` with a given `id`
- **WHEN** `insert(entity)` is called with a different entity sharing that same `id`
- **THEN** the call MUST reject, and MUST NOT silently overwrite the existing row

#### Scenario: A caller-supplied tx sees this method's own writes within the same transaction

- **GIVEN** an open transaction handle `tx`, obtained by a caller that has not yet committed it
- **WHEN** `insert(entity, tx)` is called, followed — still within the same `tx`, before
  commit — by a read of the inserted entity's child collections via that same `tx`
- **THEN** that read MUST reflect the full entity, including all four child collections,
  exactly as `insert()` itself resolved them — not an empty or partial result caused by
  reading through a different connection than `tx`

### Requirement: update persists a change against a previously-read HazardousEvent, guarded by optimistic locking

`update(entity: HazardousEvent, expectedUpdatedAt: Date | null, tx?: Tx): Promise<HazardousEvent>`
MUST be declared on the interface. `expectedUpdatedAt` is the `updatedAt` value the caller
read before computing `entity`'s new state — it is `null` when the entity being updated has
never been updated since its own `insert()` (matching `HazardousEvent.updatedAt`'s own
`Date | null` type — this interface deliberately differs from `IWorkflowRepository.
update()`'s non-nullable `Date` token, since `WorkflowInstance.updatedAt` is never null
while `HazardousEvent.updatedAt` genuinely is until a first update; design.md Decision 2).
An implementation MUST perform a conditional update that only succeeds when the stored
row's current `updatedAt` still matches `expectedUpdatedAt` — it MUST NOT silently insert a
row when no matching row exists (no upsert fallback). It MUST atomically replace all four
child collections (`hazardDriverIds`, `attachments`, `fieldValues`, `customFieldValues`)
with `entity`'s own current values as part of the same guarded operation — a rejected
update (stale token, or no matching row) MUST leave every existing child collection
unchanged. A referential-integrity violation or malformed input in the write itself (e.g. a
child collection referencing a nonexistent id) MUST reject with `ValidationError`, not an
opaque database error, and MUST leave every existing child collection unchanged. When `tx`
is supplied, every statement this method issues — including the zero-row diagnostic
re-read and the child-collection read needed to assemble the resolved return value — MUST
execute against that same `tx`, not a separate connection.

#### Scenario: Method signature has exactly three parameters, the third optional

- **GIVEN** the `IHazardousEventRepository` interface's `update` method
- **WHEN** its parameter list is inspected
- **THEN** it MUST declare exactly three parameters: `entity: HazardousEvent` and
  `expectedUpdatedAt: Date | null`, both required with no default, and an optional `tx?: Tx`

#### Scenario: A matching expectedUpdatedAt persists the change and replaces all four child collections

- **GIVEN** a persisted `HazardousEvent` whose stored `updatedAt` equals a caller's
  previously-read value, and a changed entity with a different `hazardDriverIds` set
- **WHEN** `update(changedEntity, thatPreviouslyReadValue)` is called
- **THEN** the call MUST resolve with the persisted, updated entity
- **AND** a subsequent `findById` MUST resolve `hazardDriverIds` matching exactly the
  changed entity's set, not a union with the prior set

#### Scenario: An expectedUpdatedAt of null matches a row that has never been updated

- **GIVEN** a `HazardousEvent` persisted via `insert()` and never since updated (stored
  `updatedAt` is `null`)
- **WHEN** `update(changedEntity, null)` is called
- **THEN** the call MUST resolve with the persisted, updated entity — a `null` token MUST
  NOT be treated as "no token supplied" or rejected outright

#### Scenario: A stale expectedUpdatedAt is rejected with ConcurrentModificationError, no child collection touched

- **GIVEN** a persisted `HazardousEvent` whose stored `updatedAt` no longer matches a
  caller's previously-read value (another write committed in between)
- **WHEN** `update(changedEntity, thatStaleValue)` is called
- **THEN** the call MUST reject with `ConcurrentModificationError`
- **AND** a subsequent `findById` MUST resolve every one of the four child collections
  exactly as they were before this call, unchanged

#### Scenario: update() never resurrects a concurrently-deleted row

- **GIVEN** a `HazardousEvent` that `delete()` has already fully removed
- **WHEN** `update(changedEntity, thatRow'sLastKnownUpdatedAt)` is called for the same id
- **THEN** the call MUST reject with `ConcurrentModificationError`
- **AND** no row MUST exist for that id afterward — the rejected `update()` MUST NOT
  insert one

#### Scenario: Concurrent callers updating the same row — the losing write is rejected, the winning write and its child collections persist cleanly

- **GIVEN** a persisted `HazardousEvent` with a known `updatedAt`, and two callers that
  both read it and compute their own distinct changed entity before either writes
- **WHEN** both callers call `update()` with their own changed entity and the same
  previously-read `expectedUpdatedAt`, concurrently, before either resolves
- **THEN** exactly one call MUST resolve successfully
- **AND** the other call MUST reject with `ConcurrentModificationError`
- **AND** the final persisted state (scalar fields and all four child collections) MUST
  match exactly the winning call's entity, with no interleaving of the two calls' values

#### Scenario: A caller-supplied tx's zero-row diagnostic reads within the same transaction

- **GIVEN** an open transaction handle `tx` under which this method's conditional UPDATE
  matches zero rows
- **WHEN** `update(entity, expectedUpdatedAt, tx)` resolves or rejects
- **THEN** the diagnostic re-read that classifies the zero-row result MUST execute against
  that same `tx`, not a separate connection, so it reflects state as this transaction
  itself sees it

### Requirement: delete is tenant-scoped

`delete(id: string, tenantId: string, tx?: Tx): Promise<void>` MUST be declared on the
interface, deleting only a row matching both `id` and `tenantId`. When no row matches `id` and
`tenantId`, an implementation MUST resolve normally — it MUST NOT throw `NotFoundError` or any
other error.

#### Scenario: Method signature is present with correct arity

- **GIVEN** the `IHazardousEventRepository` interface
- **WHEN** a TypeScript class declares `implements IHazardousEventRepository` and omits
  `tenantId` from `delete`
- **THEN** `yarn tsc` MUST report a type error

#### Scenario: Calling delete for an id with no matching row is a no-op, not an error

- **GIVEN** an implementation of `IHazardousEventRepository` and an `id`/`tenantId` pair with no
  matching `HazardousEvent`
- **WHEN** `delete(id, tenantId)` is called
- **THEN** it MUST resolve normally
- **AND** it MUST NOT throw or reject the `Promise`

### Requirement: countReferencingDisasterEvents counts Disaster Events referencing a hazardous event, not filtered by the referencing event's own tenant

`countReferencingDisasterEvents(hazardousEventId: string, tenantId: string, tx?: Tx):
Promise<number>` MUST be declared on the interface. It MUST resolve the count of `disaster_event`
rows whose `hazardousEventId` column equals the given `hazardousEventId`, regardless of which
`countryAccountsId` those `disaster_event` rows themselves belong to. `tenantId` scopes the
`HazardousEvent` side only — it MUST NOT be used to filter the counted `disaster_event` rows
by their own tenant, since a cross-tenant reference is still a real dependent that must be
counted, not silently excluded. When `tx` is supplied, the count query MUST execute against that
same `tx`, not a separate connection.

#### Scenario: Method signature is present with correct arity

- **GIVEN** the `IHazardousEventRepository` interface
- **WHEN** a TypeScript class declares `implements IHazardousEventRepository` and omits
  `tenantId` from `countReferencingDisasterEvents`
- **THEN** `yarn tsc` MUST report a type error

#### Scenario: Zero referencing Disaster Events resolves zero

- **GIVEN** an implementation of `IHazardousEventRepository` and a `hazardousEventId` with no
  `disaster_event` row referencing it
- **WHEN** `countReferencingDisasterEvents(hazardousEventId, tenantId)` is called
- **THEN** it MUST resolve `0`

#### Scenario: One or more referencing Disaster Events resolves their count

- **GIVEN** an implementation of `IHazardousEventRepository` and two `disaster_event` rows
  whose `hazardousEventId` column both equal a given `hazardousEventId`
- **WHEN** `countReferencingDisasterEvents(hazardousEventId, tenantId)` is called
- **THEN** it MUST resolve `2`

#### Scenario: A referencing Disaster Event belonging to a different tenant is still counted

- **GIVEN** an implementation of `IHazardousEventRepository` and one `disaster_event` row
  whose `hazardousEventId` column equals a given `hazardousEventId`, but whose own
  `countryAccountsId` differs from the `tenantId` argument passed to this method
- **WHEN** `countReferencingDisasterEvents(hazardousEventId, tenantId)` is called
- **THEN** it MUST resolve `1`, not `0` — the cross-tenant row MUST NOT be excluded

#### Scenario: When called under a caller-supplied tx, the count reflects that transaction's own uncommitted writes

- **GIVEN** an open transaction handle `tx` under which a `disaster_event` row referencing
  `hazardousEventId` has been inserted but not yet committed
- **WHEN** `countReferencingDisasterEvents(hazardousEventId, tenantId, tx)` is called
- **THEN** it MUST resolve a count that includes that uncommitted row — a read via a
  separate connection would not see it; this method MUST NOT use a separate connection
  when `tx` is supplied

### Requirement: findById is tenant-scoped and throws NotFoundError when absent

`findById(id: string, tenantId: string, tx?: Tx): Promise<HazardousEvent>` MUST be declared on
the interface. An implementation MUST throw `NotFoundError` (from `app/shared/errors/`) when no
`HazardousEvent` exists for the given `id` within `tenantId` — it MUST NOT resolve `null`. When
`tx` is supplied (found during Task 9's own implementation — `RecordSpatialObservationUseCase`
calls this method while participating in a caller's own open transaction), every statement this
method issues, including its own `loadChildCollections` rehydration read, MUST execute against
that same `tx`, not a separate connection.

#### Scenario: Method signature is present with correct arity

- **GIVEN** the `IHazardousEventRepository` interface
- **WHEN** a TypeScript class declares `implements IHazardousEventRepository` and omits `tenantId`
  from `findById`
- **THEN** `yarn tsc` MUST report a type error

#### Scenario: Called under a caller-supplied tx, the read (including child collections) executes against that same tx

- **GIVEN** an open, not-yet-committed transaction `tx` under which this same transaction has
  already written a change to the target row
- **WHEN** `findById(id, tenantId, tx)` is called
- **THEN** the resolved entity, including its four child collections, MUST reflect that same
  transaction's own uncommitted write — not a separate connection's stale view

### Requirement: findSpatialObservationByTime performs an exact observationTime lookup

`findSpatialObservationByTime(hazardousEventId: string, observationTime: Date, tenantId: string, tx?: Tx): Promise<SpatialObservationRecord | null>`
MUST be declared on the interface, resolving `null` when no observation exists at exactly that
`observationTime`. When `tx` is supplied, the lookup MUST execute against that same `tx`, not a
separate connection (needed so `RecordSpatialObservationUseCase`'s delegated call, when nested
inside a caller's own transaction, never mixes connections — design.md Decision 9).

#### Scenario: Method signature accepts a Date and returns a nullable record

- **GIVEN** the `IHazardousEventRepository` interface
- **WHEN** a TypeScript class declares `implements IHazardousEventRepository` with
  `findSpatialObservationByTime`'s `observationTime` typed as `string` instead of `Date`
- **THEN** `yarn tsc` MUST report a type error

### Requirement: saveSpatialObservation is tenant-scoped by the parent hazardousEventId

`saveSpatialObservation(hazardousEventId: string, observation: SpatialObservationRecord, tenantId: string, tx?: Tx): Promise<SpatialObservationRecord>`
MUST be declared on the interface. `tenantId` exists specifically so an implementation can verify
`hazardousEventId` belongs to `tenantId` before writing any spatial row (DEF-005) — the port
signature carries this even though the underlying spatial tables have no `country_accounts_id`
column of their own. When `tx` is supplied, the write MUST execute against that same `tx` — this
is the one method of the three Task 9 touches where `tx`-awareness is load-bearing for
correctness, not just consistency: a caller nesting this call inside its own open transaction
(e.g. `UpdateHazardousEventUseCase`'s bundled spatial-observation path) needs this write to roll
back together with the rest of that transaction (design.md Decision 9).

#### Scenario: Method signature includes an explicit tenantId

- **GIVEN** the `IHazardousEventRepository` interface
- **WHEN** a TypeScript class declares `implements IHazardousEventRepository` and omits `tenantId`
  from `saveSpatialObservation`
- **THEN** `yarn tsc` MUST report a type error

### Requirement: No method on IHazardousEventRepository accepts a raw Drizzle or infrastructure type

Every method's parameter and return types MUST be expressed in terms of `HazardousEvent`,
`SpatialObservationRecord`, primitive types, `Pagination`, or `Tx` — never a Drizzle
`$inferSelect`/`$inferInsert` row type from any table file. This requirement has always been
about row-shape types specifically — a type that carries a table's own column shape — not about
an opaque connection or transaction handle. The optional trailing `tx?: Tx` parameter on
`insert`/`update`/`delete`/`countReferencingDisasterEvents`/`findById`/
`findSpatialObservationByTime`/`saveSpatialObservation`, and the required `tx: Tx` parameter on
`findByIdForUpdate`, are explicitly permitted on that basis (design.md Decision 3 and, for the
last three, Decision 9).

#### Scenario: No Drizzle type appears in the interface's method signatures

- **GIVEN** the `IHazardousEventRepository` interface source
- **WHEN** its imports and method signatures are inspected
- **THEN** none MUST reference `SelectHazardousEvent`, `InsertHazardousEvent`, or any other
  Drizzle-inferred row type
- **AND** the presence of `Tx` on `insert`, `update`, `delete`, `countReferencingDisasterEvents`,
  `findById`, `findSpatialObservationByTime`, `saveSpatialObservation`, or `findByIdForUpdate`
  MUST NOT be treated as a violation of this requirement

## ADDED Requirements

### Requirement: findByIdForUpdate acquires a real row lock, tenant-scoped, requiring an already-open transaction

`findByIdForUpdate(id: string, tenantId: string, tx: Tx): Promise<HazardousEvent>` MUST be
declared on the interface, with `tx` **required**, not optional — unlike every other method on
this interface. An implementation MUST issue a `SELECT ... FOR UPDATE` (not `FOR NO KEY UPDATE`
or any weaker lock mode) against the `hazardous_event` row matching both `id` and `tenantId`,
executed against the given `tx`, and MUST throw `NotFoundError` when no row matches — the same
contract as `findById`. The resolved entity MUST include its four child collections, rehydrated
the same way `findById` rehydrates them; a row that fails rehydration's own validation MUST
propagate `ValidationError` unmodified, exactly as `findById` does, not resolve a partial entity.

#### Scenario: Method signature requires id, tenantId, and a non-optional tx

- **GIVEN** the `IHazardousEventRepository` interface's `findByIdForUpdate` method
- **WHEN** its parameter list is inspected
- **THEN** it MUST declare exactly three required parameters: `id: string`, `tenantId: string`,
  and `tx: Tx` — `tx` MUST NOT be optional or carry a default value

#### Scenario: A matching row is locked and resolved with its child collections

- **GIVEN** a persisted `HazardousEvent` within a given `tenantId`, with non-empty
  `hazardDriverIds`
- **WHEN** `findByIdForUpdate(id, tenantId, tx)` is called within an open transaction `tx`
- **THEN** it MUST resolve the entity with its child collections populated, matching `findById`'s
  own resolved shape for the same row

#### Scenario: No matching row throws NotFoundError, same as findById

- **GIVEN** no `HazardousEvent` exists for a given `id`/`tenantId` pair
- **WHEN** `findByIdForUpdate(id, tenantId, tx)` is called
- **THEN** it MUST reject with `NotFoundError`

#### Scenario: A foreign-tenant id is rejected with NotFoundError, same as findById

- **GIVEN** a persisted `HazardousEvent` with `id` X under `tenantId` "tenant-1"
- **WHEN** `findByIdForUpdate(X, "tenant-2", tx)` is called
- **THEN** it MUST reject with `NotFoundError`, even though the row exists under a different
  tenant

#### Scenario: The acquired lock blocks a concurrent referencing insert until this transaction ends

- **GIVEN** `findByIdForUpdate(id, tenantId, tx)` has resolved inside an open, not-yet-committed
  transaction `tx`
- **WHEN** a concurrent `INSERT` into `disaster_event` (or `event_causality`, or
  `hazardous_event_causality`) referencing that same `hazardousEventId` is attempted on a
  separate connection, before `tx` commits or rolls back
- **THEN** that concurrent `INSERT` MUST block until `tx` commits or rolls back — the implicit
  `FOR KEY SHARE` lock the insert takes on the referenced row conflicts with the held
  `FOR UPDATE` lock

#### Scenario: A row that fails rehydration validation propagates ValidationError, not NotFoundError, same as findById

- **GIVEN** a stored row for a given `id`/`tenantId` whose value fails
  `HazardousEvent.create()`'s own validation during rehydration
- **WHEN** `findByIdForUpdate(id, tenantId, tx)` is called
- **THEN** the call MUST reject with `ValidationError`
- **AND** it MUST NOT reject with `NotFoundError`
