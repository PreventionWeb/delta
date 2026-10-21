# workflow-repository-port Specification

## Purpose

Defines the Dependency Inversion boundary between the application layer and a future
persistence adapter for `WorkflowInstance`, including the batched lookup contract that
list views must use instead of an N+1 query or a direct reach into `workflowInstanceTable`.

## Requirements

### Requirement: IWorkflowRepository interface compiles as a valid, framework-free TypeScript port

The file `app/domains/validation-workflow/application/ports/IWorkflowRepository.ts` MUST
export an interface named `IWorkflowRepository`. It MUST declare exactly the five
methods described below with the exact signatures shown. The file MUST NOT import from
any Drizzle, NestJS, or Remix module, **except** `app/db.server.ts`'s exported `Tx` type,
imported as `import type { Tx } from "~/db.server"` — a type-only import, erased at compile
time, so this file never loads `db.server.ts`'s runtime `dr` connection or pool. `Tx` carries no
table-shape information (it is a union over "the module-level connection" and "an already-open
transaction handle"), unlike a Drizzle `$inferSelect`/`$inferInsert` row type — the distinction
this exception exists to preserve (design.md Decision 3; this spec's own earlier draft phrased
this as "does not violate the spirit of this import restriction," an implicit argument replaced
here with an explicit, checkable exception). `yarn tsc` MUST succeed with zero errors referencing
this file.

#### Scenario: TypeScript compilation succeeds

- **GIVEN** `IWorkflowRepository.ts` is written with the correct method signatures and no
  disallowed imports
- **WHEN** `yarn tsc` is run
- **THEN** it MUST exit with code 0 and zero type errors referencing this file

### Requirement: findByEntity performs a single polymorphic lookup and returns null rather than throwing when absent

`IWorkflowRepository.findByEntity(entityId: string, entityType: 'HE' | 'DE' | 'DR'):
Promise<WorkflowInstance | null>` MUST be declared on the interface. When no
`WorkflowInstance` exists for the given `entityId` + `entityType` pair, an implementation
MUST resolve to `null` — it MUST NOT throw `NotFoundError` and MUST NOT reject the
returned `Promise`. This deliberately diverges from `INoticeRepository.findById`'s
throw-based contract: a workflow instance may legitimately not exist yet for a given
entity.

#### Scenario: Method signature is present with correct arity

- **GIVEN** the `IWorkflowRepository` interface
- **WHEN** a TypeScript class declares `implements IWorkflowRepository` and omits
  `entityType` from `findByEntity`
- **THEN** `yarn tsc` MUST report a type error

#### Scenario: No matching instance resolves to null, not a thrown error

- **GIVEN** an implementation of `IWorkflowRepository`
- **WHEN** `findByEntity` is called with an `entityId` + `entityType` pair that has no
  corresponding row
- **THEN** it MUST resolve to `null`
- **AND** it MUST NOT throw or reject the `Promise`

### Requirement: findByEntityIds performs one batched lookup for list views, avoiding N+1 and direct cross-module table access

`IWorkflowRepository.findByEntityIds(entityIds: string[], entityType: 'HE' | 'DE' |
'DR'): Promise<WorkflowInstance[]>` MUST be declared on the interface. It MUST accept
multiple `entityId`s of the same `entityType` in a single call and MUST resolve to an
array containing only the `WorkflowInstance`s that exist for those ids — entities with no
instance yet are simply omitted from the result, not represented as `null` entries. This
is the only sanctioned way for a list-view consumer to obtain workflow status for many
entities at once; it exists specifically so that consumer never needs to call
`findByEntity` once per row (N+1) and never needs to query `workflowInstanceTable`
directly from outside `validation-workflow`.

#### Scenario: Method signature accepts an array of entityIds and returns an array

- **GIVEN** the `IWorkflowRepository` interface
- **WHEN** a TypeScript class declares `implements IWorkflowRepository` with
  `findByEntityIds` typed to accept a single `string` instead of `string[]`
- **THEN** `yarn tsc` MUST report a type error

#### Scenario: A batched call with a mix of existing and non-existing entityIds returns only the existing ones

- **GIVEN** an implementation of `IWorkflowRepository` and three `entityId`s of type
  `'HE'`, where instances exist for the first and third but not the second
- **WHEN** `findByEntityIds([id1, id2, id3], 'HE')` is called
- **THEN** it MUST resolve to an array containing exactly the two `WorkflowInstance`s for
  `id1` and `id3`
- **AND** it MUST NOT contain a `null` or `undefined` placeholder for `id2`

### Requirement: insert persists a brand-new WorkflowInstance

`IWorkflowRepository.insert(instance: WorkflowInstance, tx?: Tx): Promise<WorkflowInstance>`
MUST be declared on the interface. It MUST accept a `WorkflowInstance` domain entity that has
never been persisted before (no existing row for its `entityId`/`entityType`) and resolve
to a `WorkflowInstance` reflecting the persisted state. It MUST NOT silently update an
existing row — a caller with an existing row to transition MUST use `update()` instead. When
`tx` is supplied, the insert statement MUST execute against that same `tx`, not a separate
connection.

#### Scenario: Method signature is present

- **GIVEN** the `IWorkflowRepository` interface
- **WHEN** a TypeScript class omits the `insert` method
- **THEN** `yarn tsc` MUST report a type error for the missing implementation

#### Scenario: Called under a caller-supplied tx, the insert is visible to that same transaction before commit

- **GIVEN** an open, not-yet-committed transaction `tx`
- **WHEN** `insert(instance, tx)` is called, followed — still within that same `tx`, before
  commit — by `findByEntity(instance.entityId, instance.entityType)` executed against that
  same `tx`
- **THEN** that read MUST resolve the just-inserted instance — the insert MUST NOT be invisible
  to the outer transaction that is nesting this call

### Requirement: update persists a transition against a previously-read row, rejecting a stale write with ConcurrentModificationError

`IWorkflowRepository.update(instance: WorkflowInstance, expectedUpdatedAt: Date, tx?: Tx):
Promise<WorkflowInstance>` MUST be declared on the interface, with `expectedUpdatedAt` as
a required (non-optional) parameter and `tx` optional. It MUST only persist the write when the row currently
persisted for `instance.entityId`/`instance.entityType` has an `updatedAt` equal to
`expectedUpdatedAt` at the moment of the write — a conditional update, never an
unconditional overwrite and never an insert fallback.

When the persisted row's `updatedAt` no longer equals `expectedUpdatedAt` (another writer
already persisted a change since the caller's own read), or when no row exists at all for
that `entityId`/`entityType` (a concurrent `deleteByEntity()` already removed it), the call
MUST reject with `ConcurrentModificationError` (a subtype of `ConflictError`) and MUST NOT
write any change. The no-insert-fallback rule above is what prevents a stale `update()`
from resurrecting a deleted row: there is no row to conditionally update, so the only
failure mode this closes is `ConcurrentModificationError`, never a silent re-creation of
the deleted state.

When the persisted row exists, its `updatedAt` matches `expectedUpdatedAt`, but its
`entityId`/`entityType` does not match `instance`'s own (an `id` reused across a different
entity), the call MUST reject with `ConflictError` (not `ConcurrentModificationError`) —
the pre-existing identity-mismatch guard, unchanged in outcome from today.

When `tx` is supplied, the conditional `UPDATE` statement and the zero-row diagnostic
re-read used to classify a zero-row result MUST both execute against that same `tx`, not a
separate connection — a diagnostic read against a different connection than the one that just
attempted the write could reach a wrong conclusion about state that same transaction has
itself already changed.

#### Scenario: Method signature is present with a required expectedUpdatedAt parameter

- **GIVEN** the `IWorkflowRepository` interface
- **WHEN** a TypeScript class omits `update`, or declares `expectedUpdatedAt` as optional
- **THEN** `yarn tsc` MUST report a type error

#### Scenario: A normal single-writer update succeeds

- **GIVEN** a persisted `WorkflowInstance`, read by exactly one caller with no concurrent
  write to the same row
- **WHEN** that caller calls `update(transitionedInstance, theUpdatedAtItRead)`
- **THEN** the call MUST resolve successfully with the persisted state
- **AND** it MUST NOT throw `ConcurrentModificationError`

#### Scenario: A stale update loses to a concurrent winning update and is rejected, not silently overwritten

- **GIVEN** two callers read the same persisted `WorkflowInstance` and each computes a
  legal transition from the status they read
- **WHEN** both callers call `update(theirTransitionedInstance, theSameOriginalUpdatedAt)`,
  and one commits before the other
- **THEN** exactly one call MUST resolve successfully, persisting its transition
- **AND** the other MUST reject with `ConcurrentModificationError`
- **AND** the persisted row MUST reflect only the winning caller's transition

#### Scenario: A stale update racing behind a concurrent delete is rejected, not resurrected

- **GIVEN** a persisted `WorkflowInstance`, read by a caller that computes a legal
  transition from the status it read
- **WHEN** a concurrent `deleteByEntity()` call for the same `entityId`/`entityType`
  completes first, and the caller's own `update(transitionedInstance,
originalUpdatedAt)` call completes after it
- **THEN** the `update()` call MUST reject with `ConcurrentModificationError`
- **AND** no row MUST exist for that `entityId`/`entityType` afterward — the deleted state
  MUST NOT be resurrected

#### Scenario: An id reused for a different entity is rejected with the pre-existing identity-mismatch error, not ConcurrentModificationError

- **GIVEN** a persisted `WorkflowInstance` with id `X` belonging to entity `A`
- **WHEN** `update()` is called with an instance whose `id` is also `X` but whose
  `entityId`/`entityType` identifies a different entity `B`
- **THEN** the call MUST reject with `ConflictError` (not `ConcurrentModificationError`)
- **AND** entity `A`'s persisted row MUST remain unchanged

#### Scenario: Called under a caller-supplied tx, a zero-row diagnostic reflects that transaction's own uncommitted state

- **GIVEN** an open, not-yet-committed transaction `tx` under which this same transaction has
  already deleted the row `update()` is about to target (e.g. via a prior
  `deleteByEntity(entityId, entityType, tx)` call earlier in the same `tx`)
- **WHEN** `update(instance, expectedUpdatedAt, tx)` is called
- **THEN** the zero-row diagnostic read MUST execute against that same `tx` and correctly
  classify the result as `ConcurrentModificationError` (no row exists), reflecting this
  transaction's own prior write — not a stale view from a separate connection that still sees
  the pre-delete row

### Requirement: deleteByEntity removes the WorkflowInstance for a given entity, idempotently

`IWorkflowRepository.deleteByEntity(entityId: string, entityType: 'HE' | 'DE' | 'DR', tx?: Tx):
Promise<void>` MUST be declared on the interface. It MUST remove the `WorkflowInstance`
matching `entityId` and `entityType`, if one exists. When no such instance exists, it MUST
resolve normally — it MUST NOT throw `NotFoundError` or any other error, matching this
port's existing idempotent-write posture (`insert`'s own straightforward one-shot write)
and `IHazardousEventRepository.delete`'s own established no-op-on-missing-row contract. When
`tx` is supplied, the delete statement MUST execute against that same `tx`, not a separate
connection.

#### Scenario: Method signature is present with correct arity

- **GIVEN** the `IWorkflowRepository` interface
- **WHEN** a TypeScript class declares `implements IWorkflowRepository` and omits
  `entityType` from `deleteByEntity`
- **THEN** `yarn tsc` MUST report a type error

#### Scenario: An existing WorkflowInstance is removed

- **GIVEN** an implementation of `IWorkflowRepository` with a persisted `WorkflowInstance`
  for a given `entityId`/`entityType`
- **WHEN** `deleteByEntity(entityId, entityType)` is called
- **THEN** `findByEntity(entityId, entityType)` MUST subsequently resolve `null`

#### Scenario: Calling deleteByEntity for an entity with no existing instance is a no-op, not an error

- **GIVEN** an implementation of `IWorkflowRepository` and an `entityId`/`entityType` pair with
  no persisted `WorkflowInstance`
- **WHEN** `deleteByEntity(entityId, entityType)` is called
- **THEN** it MUST resolve normally
- **AND** it MUST NOT throw or reject the `Promise`

#### Scenario: Calling deleteByEntity twice for the same entity is idempotent

- **GIVEN** an implementation of `IWorkflowRepository` with a persisted `WorkflowInstance` for a
  given `entityId`/`entityType`
- **WHEN** `deleteByEntity(entityId, entityType)` is called twice in sequence
- **THEN** neither call MUST throw
- **AND** `findByEntity(entityId, entityType)` MUST resolve `null` after both calls

#### Scenario: Called under a caller-supplied tx, the delete is visible to that same transaction before commit

- **GIVEN** an open, not-yet-committed transaction `tx`, and a persisted `WorkflowInstance`
  for a given `entityId`/`entityType`
- **WHEN** `deleteByEntity(entityId, entityType, tx)` is called, followed — still within
  that same `tx`, before commit — by `findByEntity(entityId, entityType)` executed against
  that same `tx`
- **THEN** that read MUST resolve `null` — the delete MUST NOT be invisible to the outer
  transaction that is nesting this call

### Requirement: No method on IWorkflowRepository accepts a tenantId parameter

`findByEntity`, `findByEntityIds`, `insert`, `update`, and `deleteByEntity` MUST NOT
declare a `tenantId` parameter of any kind. This matches `workflowInstanceTable`'s own
deliberate omission of `countryAccountsId` — tenant-ownership validation is the
responsibility of the caller's own aggregate repository before it reaches this port, not
this port's own responsibility.

#### Scenario: No method signature includes tenantId

- **GIVEN** the `IWorkflowRepository` interface signature
- **WHEN** the full method list (`findByEntity`, `findByEntityIds`, `insert`, `update`,
  `deleteByEntity`) is inspected
- **THEN** none of the five MUST declare a `tenantId` parameter

### Requirement: DrizzleWorkflowRepository resolves findByEntity scoped by both entityId and entityType

`DrizzleWorkflowRepository`, the first adapter fulfilling `IWorkflowRepository`, MUST resolve
`findByEntity(entityId, entityType)` against the real `workflow_instance` table with
`WHERE entity_id = $entityId AND entity_type = $entityType`. It MUST map a matching row to a
`WorkflowInstance` via `WorkflowInstance.create()` and resolve it. A row that fails
`WorkflowInstance.create()`'s own invariant validation MUST propagate that error — unlike
`findByEntityIds` (below), a single direct lookup failing loudly is correct here.

#### Scenario: Happy path — instance found

- **GIVEN** a `workflow_instance` row exists with `entity_id = X`, `entity_type = 'HE'`
- **WHEN** `findByEntity(X, 'HE')` is called
- **THEN** it resolves a `WorkflowInstance` whose `entityId` is `X` and `entityType` is `'HE'`,
  with every other field matching the persisted row

#### Scenario: No row for this entityId at all

- **GIVEN** no `workflow_instance` row exists with `entity_id = X`
- **WHEN** `findByEntity(X, 'HE')` is called
- **THEN** it resolves `null`, not throw or reject

#### Scenario: entityType isolation — a row exists for the same entityId but a different entityType

- **GIVEN** a `workflow_instance` row exists with `entity_id = X`, `entity_type = 'DE'`, and no
  row exists with `entity_id = X`, `entity_type = 'HE'`
- **WHEN** `findByEntity(X, 'HE')` is called
- **THEN** it resolves `null` — the `'DE'` row MUST NOT be returned in its place

#### Scenario: A row that fails domain-invariant validation propagates the error

- **GIVEN** a `workflow_instance` row exists whose persisted attribution columns violate
  `WorkflowInstance.create()`'s own required-set/required-null invariant for its `status`
- **WHEN** `findByEntity` is called for that row's `entityId`/`entityType`
- **THEN** the call rejects with the `ValidationError` `WorkflowInstance.create()` throws — it
  does not resolve `null` and does not silently substitute a partial entity

### Requirement: DrizzleWorkflowRepository's findByEntityIds performs exactly one batched query, treating an invariant-violating row the same as a missing one

`DrizzleWorkflowRepository.findByEntityIds(entityIds, entityType)` MUST issue exactly one SQL
statement regardless of batch size, filtering by `entity_id` membership in the given list (e.g.
Drizzle's `inArray`, which compiles to `entity_id IN (...)`) combined with `entity_type =
$entityType`. A row that fails `WorkflowInstance.create()`'s own invariant validation MUST be
skipped from the result (logged, not thrown) — treated the same as an `entityId` with no row at
all, consistent with this port's own existing contract that a missing instance is simply omitted,
never represented as `null` or as a thrown error. One malformed row MUST NOT cause the whole
batched call to fail. Result order is not contractually significant.

**Rationale (resolved, not an open question):** `ListHazardousEventsUseCase` (the sole consumer
of this method) already tolerates a *missing* `WorkflowInstance` for a given event by surfacing
`workflowStatus: null` for that row rather than failing the whole page (`DEF-031`). A row that
exists but fails its own domain validation is the same category of incomplete data from that
consumer's perspective — both mean "this event's workflow status cannot be reported right now" —
so omitting it is consistent with existing, already-accepted precedent, not a new carve-out.

#### Scenario: Mixed existing/missing ids in one batch resolve in a single query

- **GIVEN** `workflow_instance` rows exist for `entityId`s `A` and `C` (both `'HE'`), and no row
  exists for `entityId` `B`
- **WHEN** `findByEntityIds([A, B, C], 'HE')` is called
- **THEN** it resolves an array containing exactly the two instances for `A` and `C`
- **AND** the underlying DB client's query method was invoked exactly once for this call

#### Scenario: entityType isolation in a batched call

- **GIVEN** a `workflow_instance` row exists with `entity_id = X`, `entity_type = 'DE'`, and the
  batch is queried with `entityType = 'HE'`
- **WHEN** `findByEntityIds([X], 'HE')` is called
- **THEN** the resolved array does not contain `X`'s `'DE'` instance

#### Scenario: Empty id array resolves to an empty array without querying

- **GIVEN** any state of `workflow_instance`
- **WHEN** `findByEntityIds([], 'HE')` is called
- **THEN** it resolves `[]`
- **AND** the underlying DB client's query method was not invoked

#### Scenario: An invariant-violating row is skipped and logged, not thrown, and does not affect the other rows in the batch

- **GIVEN** `workflow_instance` rows exist for `entityId`s `A` and `B` (both `'HE'`), where `A`'s
  row satisfies `WorkflowInstance.create()`'s own invariants and `B`'s row does not (e.g. its
  `status` requires an attribution pair the row leaves unset)
- **WHEN** `findByEntityIds([A, B], 'HE')` is called
- **THEN** it resolves an array containing exactly the valid instance for `A`
- **AND** the call does not reject or throw
- **AND** a structured log entry is emitted recording the skipped `entityId` (`B`) and
  `entityType`, so the anomaly is observable rather than silent

### Requirement: DrizzleWorkflowRepository's insert persists a new row, mapping constraint violations the same way the former save() did

`DrizzleWorkflowRepository.insert(instance)` MUST insert a new row for `instance`. The
persisted `updated_at`/`created_at` columns MUST equal `instance.updatedAt`/
`instance.createdAt` exactly as given — the adapter MUST NOT substitute a
database-generated timestamp. A Postgres `unique_violation` (`23505`) on
`(entity_id, entity_type)` MUST surface as `ConflictError`. A `foreign_key_violation`
(`23503`) — an attribution user id referencing a nonexistent user — or an
`invalid_text_representation` (`22P02`) — malformed input reaching a typed column, e.g. a
non-UUID `entityId` — MUST surface as `ValidationError`, not an unhandled database error
and not `ConflictError`.

#### Scenario: First insert of a new instance creates a row

- **GIVEN** no `workflow_instance` row exists for a given `id`
- **WHEN** `insert(instance)` is called with that `id`, `status: 'DRAFT'`
- **THEN** a new row exists with that `id` and `status = 'DRAFT'`
- **AND** the resolved `WorkflowInstance` reflects the same field values passed in

#### Scenario: A unique-constraint violation on (entityId, entityType) surfaces as ConflictError

- **GIVEN** a `workflow_instance` row already exists with `entity_id = X`, `entity_type = 'HE'`
- **WHEN** `insert(instance)` is called with a different, never-before-used `id`, but the same
  `entityId = X` and `entityType = 'HE'`
- **THEN** the call rejects with `ConflictError`, not an unhandled database error
- **AND** exactly one row exists for `entity_id = X`, `entity_type = 'HE'` afterward — the
  conflicting insert did not partially apply

#### Scenario: A foreign-key violation on an attribution user id surfaces as ValidationError, not ConflictError

- **GIVEN** no `user` row exists for a given user id
- **WHEN** `insert(instance)` is called with that id as `instance.submittedByUserId` (and
  `status: 'SUBMITTED'`, which requires that pair be set)
- **THEN** the call rejects with `ValidationError`, not `ConflictError` and not an unhandled
  database error

#### Scenario: Malformed input reaching a typed column surfaces as ValidationError, not ConflictError

- **GIVEN** `insert(instance)` is called with an `entityId` that is a non-empty string but not a
  valid UUID (passes `WorkflowInstance.create()`'s own non-empty-string check, since that check
  does not validate UUID format)
- **WHEN** the insert reaches the database
- **THEN** the call rejects with `ValidationError`, not `ConflictError` and not an unhandled
  database error

#### Scenario: Concurrent callers racing the first insert for the same entity — exactly one row, one ConflictError

- **GIVEN** no `workflow_instance` row exists yet for `entityId = X`, `entityType = 'HE'`
- **WHEN** two `insert()` calls are made concurrently, each with a distinct `id` but both with
  `entityId = X`, `entityType = 'HE'`
- **THEN** exactly one call resolves successfully and the other rejects with `ConflictError`
- **AND** exactly one `workflow_instance` row exists afterward for `entityId = X`,
  `entityType = 'HE'`

### Requirement: DrizzleWorkflowRepository's update performs a conditional UPDATE guarded on updatedAt, diagnosing a zero-row result before throwing

`DrizzleWorkflowRepository.update(instance, expectedUpdatedAt, tx?)` MUST issue a conditional
`UPDATE ... WHERE id = instance.id AND entity_id = instance.entityId AND entity_type =
instance.entityType AND updated_at = expectedUpdatedAt` (comparing `updated_at` at
millisecond precision, to tolerate any sub-millisecond component already present in a
stored value without that alone causing a false conflict). `entity_id`, `entity_type`, and
`created_at` MUST NOT be altered. The persisted `updated_at` column MUST equal
`instance.updatedAt` exactly as given on a successful write. When `tx` is supplied, this
statement MUST execute against `tx` directly, not the module-level connection.

When this conditional `UPDATE` affects zero rows, the adapter MUST issue a separate
diagnostic read by `id` — against `tx` when supplied, never a separate connection — to
distinguish three causes before throwing:

1. No row exists for that `id` at all — throw `ConcurrentModificationError` (the row was
   deleted since the caller's read).
2. A row exists for that `id` but its `entity_id`/`entity_type` does not match
   `instance`'s own — throw `ConflictError` (the pre-existing identity-mismatch guard).
3. A row exists for that `id`, its `entity_id`/`entity_type` matches, but its `updated_at`
   does not equal `expectedUpdatedAt` — throw `ConcurrentModificationError` (another writer
   already persisted a change since the caller's read).

#### Scenario: A subsequent update of an already-persisted row succeeds when updatedAt matches

- **GIVEN** a `workflow_instance` row exists with `id = X`, `status = 'DRAFT'`, and a known
  `updated_at`
- **WHEN** `update(instance, thatKnownUpdatedAt)` is called with `id = X`, `status:
'SUBMITTED'`, and a later `updatedAt`
- **THEN** the row with `id = X` now has `status = 'SUBMITTED'`
- **AND** `updated_at` equals the new `updatedAt` passed on the instance, not a
  server-generated timestamp
- **AND** no second row was created

#### Scenario: An update does not alter entityId, entityType, or createdAt

- **GIVEN** a `workflow_instance` row exists with `entity_id = X`, `entity_type = 'HE'`,
  `created_at = T0`, and a known `updated_at`
- **WHEN** `update(instance, thatKnownUpdatedAt)` is called with `id` matching that row,
  transitioning its status
- **THEN** the row's `entity_id`, `entity_type`, and `created_at` remain `X`, `'HE'`, `T0`

#### Scenario: Concurrent callers updating the same existing row — the losing write is rejected, not silently overwritten (fixes DEF-024's save/save race)

- **GIVEN** a `workflow_instance` row exists with `id = X`, `status = 'SUBMITTED'`, and a
  known `updated_at`
- **WHEN** two `update()` calls are made concurrently, both with `id = X` and
  `expectedUpdatedAt` equal to that same known `updated_at`, each setting a different
  `status`, with the second call's write committing after the first's
- **THEN** the first-committing call resolves successfully, persisting its `status`
- **AND** the second call rejects with `ConcurrentModificationError`
- **AND** the row with `id = X` reflects only the first-committing call's `status` — not
  the losing caller's attempted value

#### Scenario: A stale update racing behind a deleteByEntity for the same row is rejected, not resurrected (fixes DEF-024's delete/save race)

- **GIVEN** a `workflow_instance` row exists with `id = X`, `entity_id = Y`,
  `entity_type = 'HE'`, and a known `updated_at`
- **WHEN** `deleteByEntity(Y, 'HE')` completes first, removing the row, and a caller's own
  `update(instance, thatKnownUpdatedAt)` call for `id = X` completes after it
- **THEN** the `update()` call rejects with `ConcurrentModificationError`
- **AND** no `workflow_instance` row exists for `entity_id = Y`, `entity_type = 'HE'`
  afterward

#### Scenario: An id reused for a different entity is rejected, the original row's identity is preserved

- **GIVEN** a `workflow_instance` row exists with `id = R`, `entity_id = X`, `entity_type = 'HE'`,
  and a known `updated_at`
- **WHEN** `update(instance, thatKnownUpdatedAt)` is called with `id = R` but
  `entityId = Y` (`Y !== X`), `entityType = 'HE'`
- **THEN** the call rejects with `ConflictError` (not `ConcurrentModificationError`)
- **AND** the row with `id = R` still has `entity_id = X` afterward, unchanged

#### Scenario: Called under a caller-supplied tx that already deleted the target row earlier in the same transaction, the diagnostic read sees that same transaction's own delete

- **GIVEN** an open, not-yet-committed transaction `tx` under which `deleteByEntity(Y, 'HE', tx)`
  has already run earlier in the same `tx`, removing the row for `entity_id = Y`
- **WHEN** `update(instance, expectedUpdatedAt, tx)` is called for that same row, still within
  that same `tx`
- **THEN** the conditional `UPDATE` MUST affect zero rows, and the diagnostic read — executed
  against `tx` — MUST classify this as `ConcurrentModificationError` ("no row exists"),
  reflecting this transaction's own earlier delete, not a stale pre-delete view from a
  separate connection

### Requirement: DrizzleWorkflowRepository's update round-trips every real status transition exactly, including null-clearing

`DrizzleWorkflowRepository.update(instance, expectedUpdatedAt)` MUST persist every field
of a domain-transitioned `WorkflowInstance` exactly as the entity computed it, including a
transition that clears a previously-set attribution pair back to `null` (e.g. `submit()`
from `REVISION_REQUESTED` clears `validatedByUserId`/`validatedAt`). A subsequent
`findByEntity` reflects every field of what was persisted, not a stale or
partially-updated value. The first write for any given instance is always an `insert()`
(see that requirement); every scenario below persists its first state via `insert()` and
every subsequent transition via `update()` with the `updatedAt` value most recently read.

#### Scenario: DRAFT to SUBMITTED persists submittedByUserId/submittedAt, leaves the rest null

- **GIVEN** a freshly-created `DRAFT` `WorkflowInstance` has been inserted
- **WHEN** `existing.submit({ userId, now })`'s result is persisted via
  `update(result, existing.updatedAt)`, then re-read via `findByEntity`
- **THEN** the re-read instance has `status: 'SUBMITTED'`, `submittedByUserId`/`submittedAt` set
  to the given values, and `validatedByUserId`/`validatedAt`/`approvedByUserId`/`approvedAt`/
  `publishedByUserId`/`publishedAt` all still `null`

#### Scenario: validate-only stays SUBMITTED with the validator set, approval fields still null

- **GIVEN** a `SUBMITTED` `WorkflowInstance` has been persisted
- **WHEN** `existing.validate({ userId, now })`'s result is persisted via
  `update(result, existing.updatedAt)`, then re-read
- **THEN** the re-read instance has `status: 'SUBMITTED'` (unchanged), `validatedByUserId`/
  `validatedAt` set, and `approvedByUserId`/`approvedAt`/`publishedByUserId`/`publishedAt` still
  `null`

#### Scenario: SUBMITTED to APPROVED persists approvedByUserId/approvedAt

- **GIVEN** a `SUBMITTED` `WorkflowInstance` has been persisted
- **WHEN** `existing.approve({ userId, now })`'s result is persisted via
  `update(result, existing.updatedAt)`, then re-read
- **THEN** the re-read instance has `status: 'APPROVED'` and `approvedByUserId`/`approvedAt` set
  to the given values

#### Scenario: A revision round trip clears the validator back to null, not merely leaves it stale

- **GIVEN** a `SUBMITTED` `WorkflowInstance` with `validatedByUserId`/`validatedAt` already set has
  been persisted (i.e. `validate()` already ran and was persisted)
- **WHEN** `existing.requestRevision({ now })`'s result is persisted via `update()` (status
  becomes `REVISION_REQUESTED`), then `existing.submit({ userId, now })` is applied to that
  result and persisted via `update()` again (each `update()` call using the `updatedAt` most
  recently read), then re-read
- **THEN** the re-read instance has `status: 'SUBMITTED'`
- **AND** `validatedByUserId`/`validatedAt` are both `null` — the previously-persisted validator
  attribution does not survive in the database

#### Scenario: APPROVED to PUBLISHED backfills the validator only when it was not already set

- **GIVEN** an `APPROVED` `WorkflowInstance` with `validatedByUserId`/`validatedAt` both `null`
  (direct-publish path) has been persisted
- **WHEN** `existing.publish({ userId, now })`'s result is persisted via
  `update(result, existing.updatedAt)`, then re-read
- **THEN** the re-read instance has `status: 'PUBLISHED'`, `publishedByUserId`/`publishedAt` set,
  and `validatedByUserId`/`validatedAt` backfilled to the publisher's own `userId`/`now`

#### Scenario: APPROVED to PUBLISHED preserves an already-set validator's attribution

- **GIVEN** an `APPROVED` `WorkflowInstance` with `validatedByUserId`/`validatedAt` already set to
  a different user/time than the eventual publisher has been persisted
- **WHEN** `existing.publish({ userId, now })`'s result is persisted via
  `update(result, existing.updatedAt)`, then re-read
- **THEN** the re-read instance's `validatedByUserId`/`validatedAt` remain the original
  validator's values, not the publisher's

### Requirement: DrizzleWorkflowRepository's deleteByEntity removes the row scoped by both entityId and entityType, idempotently

`DrizzleWorkflowRepository.deleteByEntity(entityId, entityType)` MUST delete the
`workflow_instance` row matching both `entity_id` and `entity_type`, if one exists. It resolves
normally — never throws — whether or not a matching row existed.

#### Scenario: Deletes the matching row

- **GIVEN** a `workflow_instance` row exists with `entity_id = X`, `entity_type = 'HE'`
- **WHEN** `deleteByEntity(X, 'HE')` is called
- **THEN** no `workflow_instance` row with `entity_id = X`, `entity_type = 'HE'` exists afterward
- **AND** a subsequent `findByEntity(X, 'HE')` resolves `null`

#### Scenario: entityType isolation — deleting one entityType leaves the other's row intact

- **GIVEN** `workflow_instance` rows exist with `entity_id = X` for both `entity_type = 'HE'` and
  `entity_type = 'DE'`
- **WHEN** `deleteByEntity(X, 'HE')` is called
- **THEN** the `'HE'` row is removed
- **AND** the `'DE'` row for the same `entity_id` remains, unaffected

#### Scenario: Deleting an entity with no existing row is a no-op

- **GIVEN** no `workflow_instance` row exists for `entity_id = X`, `entity_type = 'HE'`
- **WHEN** `deleteByEntity(X, 'HE')` is called
- **THEN** it resolves normally, not throw

#### Scenario: Concurrent deletes of the same existing row both resolve

- **GIVEN** a `workflow_instance` row exists with `entity_id = X`, `entity_type = 'HE'`
- **WHEN** two `deleteByEntity(X, 'HE')` calls are made concurrently
- **THEN** both calls resolve successfully, neither throwing
- **AND** no `workflow_instance` row with `entity_id = X`, `entity_type = 'HE'` exists afterward

### Requirement: DrizzleWorkflowRepository's queries MUST NOT filter or group by countryAccountsId

None of `DrizzleWorkflowRepository`'s `findByEntity`, `findByEntityIds`, `insert`,
`update`, or `deleteByEntity` SQL MUST reference a `country_accounts_id` column or any
tenant-scoping predicate — `workflow_instance` has no such column, and tenant-ownership
validation is the responsibility of the caller's own aggregate repository before reaching
this adapter.

#### Scenario: A row is returned regardless of which tenant's aggregate created the referenced entity

- **GIVEN** a `workflow_instance` row exists for `entity_id = X`, where `X` is a
  `hazardous_event.id` belonging to a specific tenant (seeded via the real
  `hazardousEventTable`/`countryAccountsTable`)
- **WHEN** `findByEntity(X, 'HE')` is called with no tenant context supplied anywhere in the call
- **THEN** the row is returned — this adapter performs no tenant check of its own, by design
