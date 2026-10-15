## REMOVED Requirements

### Requirement: save persists a HazardousEvent via the entity's own tenant field

**Reason**: Split into `insert()`/`update()` to close `DEF-037` (no lost-update
protection), following `5j`'s identical split of `IWorkflowRepository.save()` — see
design.md Decision 1. A single `save()` could not express "I already read this row and
this is the value I expect it to still have" without an optional, skippable parameter,
which would silently reopen the same race for any caller that forgot to pass it.

**Migration**: Every caller of `save(entity)` becomes either `insert(entity)` (first-time
persistence — `CreateHazardousEventUseCase`) or `update(entity, expectedUpdatedAt)`
(persisting a change against a previously-read row — `UpdateHazardousEventUseCase`, using
the previously-read entity's own `updatedAt`). Every test fake implementing
`IHazardousEventRepository` is updated from a `save` method to `insert`/`update` methods.

#### Scenario: Method signature has no separate tenantId parameter

- **GIVEN** the `IHazardousEventRepository` interface's `save` method
- **WHEN** its parameter list is inspected
- **THEN** it MUST declare exactly one parameter, `entity: HazardousEvent`

## ADDED Requirements

### Requirement: insert persists a brand-new HazardousEvent and its four child collections

`insert(entity: HazardousEvent): Promise<HazardousEvent>` MUST be declared on the
interface. An implementation MUST persist the entity's own fields plus all four child
collections (`hazardDriverIds`, `attachments`, `fieldValues`, `customFieldValues`) as a
single atomic unit — a failure partway through MUST leave no partial row or partial child
collection persisted. It MUST NOT declare a separate `tenantId` parameter — the entity's
own `tenantId` property carries tenancy. A referential-integrity violation or malformed
input in the write itself (e.g. a child collection referencing a nonexistent id) MUST
reject with `ValidationError`, not an opaque database error.

#### Scenario: Method signature has exactly one parameter

- **GIVEN** the `IHazardousEventRepository` interface's `insert` method
- **WHEN** its parameter list is inspected
- **THEN** it MUST declare exactly one parameter, `entity: HazardousEvent`

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

### Requirement: update persists a change against a previously-read HazardousEvent, guarded by optimistic locking

`update(entity: HazardousEvent, expectedUpdatedAt: Date | null): Promise<HazardousEvent>`
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
opaque database error, and MUST leave every existing child collection unchanged.

#### Scenario: Method signature has exactly two parameters, the second required

- **GIVEN** the `IHazardousEventRepository` interface's `update` method
- **WHEN** its parameter list is inspected
- **THEN** it MUST declare exactly two parameters, `entity: HazardousEvent` and
  `expectedUpdatedAt: Date | null`, with no default value making the second optional

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

### Requirement: delete's tenant gate runs first and is RETURNING-checked, before any supertype or relationship cleanup

`delete(id: string, tenantId: string): Promise<void>` replicates the legacy transaction's
full cleanup scope (`DEF-035`): the `hazardous_event` row, incoming `event_relationship`
rows (this event as the `childId`/effect side), then the `event` supertype row, in that
order, within one transaction. The tenant-scoped `hazardous_event` deletion MUST be the
first statement and MUST be checked for a match (e.g. via `RETURNING`) before any further
cleanup runs — when it matches no row (missing `id`, or an `id` belonging to a different
`tenantId`), no further statement in this method MUST execute, and the method MUST still
resolve normally per its existing no-throw-on-no-match contract.

#### Scenario: A full delete removes the hazardous_event row, its incoming event_relationship rows, and the event supertype row

- **GIVEN** a persisted `HazardousEvent` within a given `tenantId`, with one incoming
  `event_relationship` row (this event as the effect/child side) from another event
- **WHEN** `delete(id, tenantId)` is called
- **THEN** the `hazardous_event` row MUST no longer exist
- **AND** the incoming `event_relationship` row MUST no longer exist
- **AND** the `event` supertype row for this id MUST no longer exist

#### Scenario: A foreign-tenant id touches nothing — not the hazardous_event row, not any event_relationship row, not the event row

- **GIVEN** a persisted `HazardousEvent` with `id` X under `tenantId` "tenant-1"
- **WHEN** `delete(X, "tenant-2")` is called (a different tenant)
- **THEN** the call MUST resolve normally, not throwing
- **AND** the `HazardousEvent` for `(X, "tenant-1")` MUST still be found by a subsequent
  `findById(X, "tenant-1")`
- **AND** no `event_relationship` row referencing X MUST be removed
- **AND** the `event` supertype row for X MUST still exist

#### Scenario: A pre-existing outgoing event_relationship row causes delete to reject with ConflictError, not an opaque database error

- **GIVEN** a persisted `HazardousEvent` with one outgoing `event_relationship` row (this
  event as the `parentId`/cause side — i.e., this event is recorded as the legacy cause of
  another event), and this scenario's own dependent-check layer has not itself blocked the
  delete (the legacy `event_relationship` outgoing role is not covered by
  `DeleteHazardousEventUseCase`'s own dependent checks — a known, separately tracked gap,
  design.md Decision 8)
- **WHEN** `delete(id, tenantId)` is called
- **THEN** the call MUST reject with `ConflictError`, not a raw/opaque database error
- **AND** the `hazardous_event` row, the `event_relationship` rows, and the `event` row
  MUST all remain exactly as they were before the call (the whole attempt rolls back)
- **AND** no incoming `event_relationship` row MUST have been removed either, since the
  whole transaction rolled back

#### Scenario: Two concurrent deletes of the same event, both reads before either write, both resolve without throwing

- **GIVEN** a `HazardousEvent` within a given `tenantId` with no event_relationship rows
  of either role
- **WHEN** `delete(id, tenantId)` is called twice, concurrently, before either resolves
- **THEN** both calls MUST resolve without throwing — the method's existing
  no-throw-on-no-match contract makes the second call's own zero-row match a normal,
  silent no-op, not a race condition either call needs to detect or recover from

### Requirement: findAll resolves tenant-scoped rows in a deterministic order, skipping any single row that fails rehydration

`findAll(tenantId: string, pagination: Pagination): Promise<HazardousEvent[]>`'s results
MUST be ordered deterministically (e.g. by a stable column such as `createdAt`, then `id`
as a tiebreaker) so that repeated calls with the same `pagination` against unchanged data
return the same rows in the same order, and so that paging through consecutive pages does
not skip or repeat a row. When a single stored row fails `HazardousEvent.create()`'s own
validation during rehydration, an implementation MUST skip that row (logging a warning
identifying its `id`) and continue assembling the rest of the page — it MUST NOT let one
invalid row reject the entire call.

#### Scenario: Repeated calls with the same pagination return the same rows in the same order

- **GIVEN** three persisted `HazardousEvent`s for the same `tenantId`, with no further
  writes in between
- **WHEN** `findAll(tenantId, { page: 1, pageSize: 10 })` is called twice
- **THEN** both calls MUST resolve the same three entities in the same order

#### Scenario: A row that fails rehydration validation is skipped, not thrown, and does not affect other rows on the page

- **GIVEN** two persisted rows for the same `tenantId`, one of which has a stored value
  that fails `HazardousEvent.create()`'s own validation (e.g. an empty required field)
- **WHEN** `findAll(tenantId, { page: 1, pageSize: 10 })` is called
- **THEN** the call MUST resolve successfully, not reject
- **AND** the resolved array MUST contain the other, validly-rehydrated row
- **AND** a warning SHALL be logged identifying the skipped row's id

### Requirement: findById propagates a rehydration failure unmodified

When the single stored row `findById` locates fails `HazardousEvent.create()`'s own
validation during rehydration, the method MUST let that `ValidationError` propagate
unmodified — it MUST NOT silently skip the row or convert the error to `NotFoundError`.

#### Scenario: A row that fails rehydration validation propagates ValidationError, not NotFoundError

- **GIVEN** a stored row for a given `id`/`tenantId` whose value fails
  `HazardousEvent.create()`'s own validation
- **WHEN** `findById(id, tenantId)` is called
- **THEN** the call MUST reject with `ValidationError`
- **AND** it MUST NOT reject with `NotFoundError`
