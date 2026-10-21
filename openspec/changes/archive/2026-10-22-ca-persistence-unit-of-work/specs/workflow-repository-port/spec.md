## MODIFIED Requirements

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
