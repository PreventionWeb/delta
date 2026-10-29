# hazardous-event-repository-port Specification

## Purpose

Defines the Dependency Inversion boundary between the application layer and a future persistence
adapter for the `HazardousEvent` aggregate, including its child spatial observations, with an
explicit tenant-scoping contract on every method that reads, writes, or deletes a specific row.

## Requirements

### Requirement: IHazardousEventRepository interface compiles as a valid, framework-free TypeScript port

The file `app/domains/hazardous-events/application/ports/IHazardousEventRepository.ts` MUST export
an interface named `IHazardousEventRepository`. It MUST declare exactly the eleven methods
described below with the exact signatures shown (the original ten plus `countAll`). The file MUST
NOT import from any Drizzle, NestJS, or Remix module, **except** `app/db.server.ts`'s exported
`Tx` type, imported as
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

### Requirement: findAll is tenant-scoped and paginated

`findAll(tenantId: string, pagination: Pagination, filters?: HazardousEventRepositoryFilters):
Promise<HazardousEvent[]>` MUST be declared on the interface, scoping every returned entity to
`tenantId`. `filters` is optional; when omitted or empty, `findAll` MUST behave exactly as it did
before filter support existed (every tenant-scoped row, unfiltered).

#### Scenario: Method signature is present with correct arity

- **GIVEN** the `IHazardousEventRepository` interface
- **WHEN** a TypeScript class declares `implements IHazardousEventRepository` and omits
  `pagination` from `findAll`
- **THEN** `yarn tsc` MUST report a type error

#### Scenario: Omitting filters preserves the unfiltered result

- **GIVEN** three persisted `HazardousEvent`s for the same `tenantId`
- **WHEN** `findAll(tenantId, { page: 1, pageSize: 10 })` is called with no third argument
- **THEN** the resolved array MUST contain all three, exactly as if `filters: {}` had been passed

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

### Requirement: countAll is tenant-scoped and reflects the same filters as findAll

`countAll(tenantId: string, filters?: HazardousEventRepositoryFilters, tx?: Tx): Promise<number>` MUST
be declared on the interface. It MUST resolve the count of rows matching the exact same condition `findAll`
would apply for the identical `tenantId`/`filters` pair, built from one shared condition — an
implementation MUST NOT maintain `findAll`'s and `countAll`'s own filter-to-SQL translation as two
independently-written code paths that could silently diverge.

#### Scenario: countAll and findAll agree on a filtered query

- **GIVEN** five persisted `HazardousEvent`s for the same `tenantId`, three of which match a given
  `filters` value
- **WHEN** `countAll(tenantId, filters)` and `findAll(tenantId, { page: 1, pageSize: 10 }, filters)`
  are both called
- **THEN** `countAll`'s resolved number MUST equal the length of `findAll`'s resolved array

#### Scenario: Omitting filters counts every tenant-scoped row

- **GIVEN** three persisted `HazardousEvent`s for the same `tenantId`
- **WHEN** `countAll(tenantId)` is called with no `filters` argument
- **THEN** it MUST resolve `3`

### Requirement: Taxonomy filters (hazardTypeId, hazardClusterId, specificHazardId) match via the `specific_hazard` chain, not `hip_*` columns

When `filters.specificHazardId` is set, `findAll`/`countAll` MUST restrict to rows where
`hazardousEventTable.specificHazardId` equals that value. When `filters.hazardClusterId` is set,
MUST restrict to rows whose `specificHazardId` belongs to a `specific_hazard` row with that
`hazardClusterId`. When `filters.hazardTypeId` is set, MUST restrict to rows whose
`specificHazardId` belongs to a `specific_hazard` row whose `hazard_cluster` belongs to that
`hazardTypeId`. These MUST NOT be implemented via `hazardousEventTable.hipHazardId`/`hipClusterId`/
`hipTypeId`.

#### Scenario: specificHazardId matches directly

- **GIVEN** a `HazardousEvent` with `specificHazardId: "sh1"` and another with a different value
- **WHEN** `findAll(tenantId, pagination, { specificHazardId: "sh1" })` is called
- **THEN** the resolved array MUST contain only the first event

#### Scenario: hazardClusterId matches via the taxonomy join

- **GIVEN** a `HazardousEvent` whose `specificHazardId` belongs to `hazard_cluster` `"c1"`, and
  another event whose `specificHazardId` belongs to a different cluster
- **WHEN** `findAll(tenantId, pagination, { hazardClusterId: "c1" })` is called
- **THEN** the resolved array MUST contain only the first event

#### Scenario: hazardTypeId matches via the two-hop taxonomy join

- **GIVEN** a `HazardousEvent` whose `specificHazardId` belongs to a cluster belonging to
  `hazard_type` `"t1"`, and another event belonging to a different type
- **WHEN** `findAll(tenantId, pagination, { hazardTypeId: "t1" })` is called
- **THEN** the resolved array MUST contain only the first event

### Requirement: Record-status filter matches via an EXISTS subquery against workflow_instance, excluding rows with no instance

When `filters.recordStatus` is set, `findAll`/`countAll` MUST restrict to rows for which a
`workflow_instance` row exists with matching `entityId`/`entityType: "HE"` and `status` equal to
that value. A row with no `workflow_instance` at all MUST be excluded when this filter is set, and
MUST continue to be included when this filter is not set.

#### Scenario: recordStatus restricts to matching workflow_instance rows

- **GIVEN** a `HazardousEvent` with a `workflow_instance` row whose `status` is `"SUBMITTED"`, and
  another event with a `workflow_instance` row whose `status` is `"DRAFT"`
- **WHEN** `findAll(tenantId, pagination, { recordStatus: "SUBMITTED" })` is called
- **THEN** the resolved array MUST contain only the first event

#### Scenario: A row with no workflow_instance is excluded when recordStatus is set

- **GIVEN** a `HazardousEvent` with no `workflow_instance` row at all
- **WHEN** `findAll(tenantId, pagination, { recordStatus: "SUBMITTED" })` is called
- **THEN** the resolved array MUST NOT contain that event

#### Scenario: A row with no workflow_instance is included when recordStatus is not set

- **GIVEN** a `HazardousEvent` with no `workflow_instance` row at all
- **WHEN** `findAll(tenantId, pagination, {})` is called
- **THEN** the resolved array MUST contain that event

### Requirement: allowedStatuses restricts matching to a given set of statuses, independent of and composable with recordStatus

When `filters.allowedStatuses` is set, `findAll`/`countAll` MUST restrict to rows for which a
`workflow_instance` row exists with matching `entityId`/`entityType: "HE"` and `status` one of
the given set — a row with no `workflow_instance` at all MUST be excluded when this filter is set.
When both `filters.recordStatus` and `filters.allowedStatuses` are set, both conditions MUST
apply (a row must satisfy the exact `recordStatus` match AND have that status be a member of
`allowedStatuses`) — this field exists specifically to let a caller AND a forced restriction onto
an independently-supplied `recordStatus` value without one overwriting the other.

#### Scenario: allowedStatuses restricts to the given set

- **GIVEN** a `HazardousEvent` with a `workflow_instance` row whose `status` is `"APPROVED"`, and
  another event with a `workflow_instance` row whose `status` is `"DRAFT"`
- **WHEN** `findAll(tenantId, pagination, { allowedStatuses: ["APPROVED", "PUBLISHED"] })` is
  called
- **THEN** the resolved array MUST contain only the first event

#### Scenario: recordStatus and allowedStatuses combine as AND, not override

- **GIVEN** a `HazardousEvent` with a `workflow_instance` row whose `status` is `"DRAFT"`
- **WHEN** `findAll(tenantId, pagination, { recordStatus: "DRAFT", allowedStatuses: ["APPROVED",
"PUBLISHED"] })` is called
- **THEN** the resolved array MUST NOT contain that event (its status matches `recordStatus` but
  is not a member of `allowedStatuses`)

#### Scenario: A matching combination of recordStatus and allowedStatuses includes the row

- **GIVEN** a `HazardousEvent` with a `workflow_instance` row whose `status` is `"PUBLISHED"`
- **WHEN** `findAll(tenantId, pagination, { recordStatus: "PUBLISHED", allowedStatuses:
["APPROVED", "PUBLISHED"] })` is called
- **THEN** the resolved array MUST contain that event

### Requirement: viewMyRecords matches creation or any workflow action attributed to the given user

When `filters.viewMyRecords` is `true` and `filters.userId` is given, `findAll`/`countAll` MUST
restrict to rows where `hazardousEventTable.createdByUserId` equals `filters.userId`, OR a
`workflow_instance` row exists for that entity whose `validatedByUserId`, `approvedByUserId`, or
`publishedByUserId` equals `filters.userId`.

#### Scenario: Matches by creation

- **GIVEN** a `HazardousEvent` with `createdByUserId: "u1"`
- **WHEN** `findAll(tenantId, pagination, { viewMyRecords: true, userId: "u1" })` is called
- **THEN** the resolved array MUST contain that event

#### Scenario: Matches by a workflow_instance action, not creation

- **GIVEN** a `HazardousEvent` created by a different user, with a `workflow_instance` row whose
  `publishedByUserId` is `"u1"`
- **WHEN** `findAll(tenantId, pagination, { viewMyRecords: true, userId: "u1" })` is called
- **THEN** the resolved array MUST contain that event

#### Scenario: A record with no relation to the given user is excluded

- **GIVEN** a `HazardousEvent` created by a different user, with no `workflow_instance` action
  attributed to `"u1"`
- **WHEN** `findAll(tenantId, pagination, { viewMyRecords: true, userId: "u1" })` is called
- **THEN** the resolved array MUST NOT contain that event

### Requirement: pendingMyAction matches REVISION_REQUESTED status submitted by the given user

When `filters.pendingMyAction` is `true` and `filters.userId` is given, `findAll`/`countAll` MUST
restrict to rows with a `workflow_instance` row whose `status` is `"REVISION_REQUESTED"` and whose
own `submittedByUserId` equals `filters.userId`.

#### Scenario: Matches a record awaiting revision from the given user

- **GIVEN** a `HazardousEvent` with a `workflow_instance` row whose `status` is
  `"REVISION_REQUESTED"` and `submittedByUserId` is `"u1"`
- **WHEN** `findAll(tenantId, pagination, { pendingMyAction: true, userId: "u1" })` is called
- **THEN** the resolved array MUST contain that event

#### Scenario: A different status is excluded even with a matching submitter

- **GIVEN** a `HazardousEvent` with a `workflow_instance` row whose `status` is `"SUBMITTED"` and
  `submittedByUserId` is `"u1"`
- **WHEN** `findAll(tenantId, pagination, { pendingMyAction: true, userId: "u1" })` is called
- **THEN** the resolved array MUST NOT contain that event

### Requirement: Date-range filters apply legacy's own partial-date comparison, excluding empty-string dates

When `filters.fromDate` is set, `findAll`/`countAll` MUST restrict to rows whose `startDate` is
non-empty and chronologically `>=` `filters.fromDate`, comparing at the finer of the two values'
own precision (year, year-month, or full date) exactly as the legacy comparison does. When
`filters.toDate` is set, the same applies to `endDate` with `<=`.

#### Scenario: fromDate excludes a row with an earlier startDate

- **GIVEN** a `HazardousEvent` with `startDate: "2023-01-01"` and another with
  `startDate: "2024-06-01"`
- **WHEN** `findAll(tenantId, pagination, { fromDate: "2024-01-01" })` is called
- **THEN** the resolved array MUST contain only the second event

#### Scenario: fromDate excludes a row with an empty startDate

- **GIVEN** a `HazardousEvent` with `startDate: ""`
- **WHEN** `findAll(tenantId, pagination, { fromDate: "2024-01-01" })` is called
- **THEN** the resolved array MUST NOT contain that event

#### Scenario: A year-only startDate compares at year precision

- **GIVEN** a `HazardousEvent` with `startDate: "2024"`
- **WHEN** `findAll(tenantId, pagination, { fromDate: "2024-01-01" })` is called
- **THEN** the resolved array MUST contain that event

### Requirement: recordingOrganization matches recordOriginator by case-insensitive partial match

When `filters.recordingOrganization` is set, `findAll`/`countAll` MUST restrict to rows where
`hazardousEventTable.recordOriginator` matches that value via a case-insensitive partial (`ILIKE`)
match — a deliberate UX improvement confirmed by the human, not a port of legacy's own exact-match
query.

#### Scenario: Partial match qualifies

- **GIVEN** a `HazardousEvent` with `recordOriginator: "Ministry of Health"`
- **WHEN** `findAll(tenantId, pagination, { recordingOrganization: "Ministry" })` is called
- **THEN** the resolved array MUST contain that event

#### Scenario: Match is case-insensitive

- **GIVEN** a `HazardousEvent` with `recordOriginator: "Ministry of Health"`
- **WHEN** `findAll(tenantId, pagination, { recordingOrganization: "ministry" })` is called
- **THEN** the resolved array MUST contain that event

#### Scenario: A non-matching value excludes the row

- **GIVEN** a `HazardousEvent` with `recordOriginator: "Ministry of Health"`
- **WHEN** `findAll(tenantId, pagination, { recordingOrganization: "Ministry of Finance" })` is
  called
- **THEN** the resolved array MUST NOT contain that event

### Requirement: Multiple filter dimensions compose with AND

When more than one filter field is set, `findAll`/`countAll` MUST restrict to rows matching every
set dimension simultaneously, not any one of them.

#### Scenario: Two dimensions both narrow the result

- **GIVEN** a `HazardousEvent` matching `hazardTypeId: "t1"` but not `hazardousEventStatus:
"ongoing"`, and another event matching both
- **WHEN** `findAll(tenantId, pagination, { hazardTypeId: "t1", hazardousEventStatus: "ongoing"
})` is called
- **THEN** the resolved array MUST contain only the second event

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
- **WHEN** a TypeScript class declares `implements IHazardousEventRepository` and omits `tenantId`
  from `delete`
- **THEN** `yarn tsc` MUST report a type error

#### Scenario: Calling delete for an id with no matching row is a no-op, not an error

- **GIVEN** an implementation of `IHazardousEventRepository` and an `id`/`tenantId` pair with no
  matching `HazardousEvent`
- **WHEN** `delete(id, tenantId)` is called
- **THEN** it MUST resolve normally
- **AND** it MUST NOT throw or reject the `Promise`

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
timestamp unchanged. When `observation.id` matches an existing row's id under a _different_
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
