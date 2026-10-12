## REMOVED Requirements

### Requirement: save persists a WorkflowInstance and returns the saved state

**Reason**: `save()`'s insert-or-update ambiguity let a caller silently reuse the
unguarded upsert path and reopen `DEF-024` (no compile-time signal distinguishes "this
caller knows it's inserting" from "this caller knows it's updating"). Replaced by two
explicit methods, each only able to do one thing.

**Migration**: a caller persisting a `WorkflowInstance` for the first time (no existing
row for its `entityId`/`entityType`) now calls `insert(instance)`. A caller persisting a
transition against a row it already read now calls `update(instance, expectedUpdatedAt)`,
passing the `updatedAt` value it read before computing the transition. See the `insert`
and `update` requirements below.

### Requirement: DrizzleWorkflowRepository's save performs an insert-or-update keyed on the instance's own id, persisting its given updatedAt as-is

**Reason**: split into a plain `insert()` (unconditional `INSERT`, unchanged behavior) and
a conditional `update()` (guarded `UPDATE`, new behavior) — the combined upsert is what
allowed a stale write to silently win. This requirement's own "concurrent callers
updating the same existing row — last write wins, neither call errors" scenario is the
exact behavior this change closes (`DEF-024`); it does not carry forward.

**Migration**: see the `DrizzleWorkflowRepository's insert ...` and `DrizzleWorkflowRepository's
update ...` requirements below, which together cover every scenario this requirement
previously described except the now-fixed last-write-wins one.

### Requirement: DrizzleWorkflowRepository's save never corrupts identity when an id collides across different entities

**Reason**: folded into the `DrizzleWorkflowRepository's update ...` requirement below —
the identity-mismatch guard is now one of three causes the post-zero-row diagnostic
re-read distinguishes, alongside the two new concurrency causes, rather than a separately
specified guard.

**Migration**: no behavior change for this specific case — an id reused for a different
entity still rejects with `ConflictError` and the original row's identity is still
preserved. See the `DrizzleWorkflowRepository's update ...` requirement's own
identity-mismatch scenario.

### Requirement: DrizzleWorkflowRepository's save round-trips every real status transition exactly, including null-clearing

**Reason**: renamed — every scenario's persistence calls are now a mix of `insert()`
(first write) and `update()` (every subsequent transition), since `save()` no longer
exists. No scenario's asserted outcome changes.

**Migration**: see the "DrizzleWorkflowRepository's update round-trips every real status
transition exactly, including null-clearing" requirement under `ADDED Requirements`
below.

## MODIFIED Requirements

### Requirement: deleteByEntity removes the WorkflowInstance for a given entity, idempotently

`IWorkflowRepository.deleteByEntity(entityId: string, entityType: 'HE' | 'DE' | 'DR'):
Promise<void>` MUST be declared on the interface. It MUST remove the `WorkflowInstance`
matching `entityId` and `entityType`, if one exists. When no such instance exists, it MUST
resolve normally — it MUST NOT throw `NotFoundError` or any other error, matching this
port's existing idempotent-write posture (`insert`'s own straightforward one-shot write)
and `IHazardousEventRepository.delete`'s own established no-op-on-missing-row contract.

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

## ADDED Requirements

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

### Requirement: insert persists a brand-new WorkflowInstance

`IWorkflowRepository.insert(instance: WorkflowInstance): Promise<WorkflowInstance>` MUST
be declared on the interface. It MUST accept a `WorkflowInstance` domain entity that has
never been persisted before (no existing row for its `entityId`/`entityType`) and resolve
to a `WorkflowInstance` reflecting the persisted state. It MUST NOT silently update an
existing row — a caller with an existing row to transition MUST use `update()` instead.

#### Scenario: Method signature is present

- **GIVEN** the `IWorkflowRepository` interface
- **WHEN** a TypeScript class omits the `insert` method
- **THEN** `yarn tsc` MUST report a type error for the missing implementation

### Requirement: update persists a transition against a previously-read row, rejecting a stale write with ConcurrentModificationError

`IWorkflowRepository.update(instance: WorkflowInstance, expectedUpdatedAt: Date):
Promise<WorkflowInstance>` MUST be declared on the interface, with `expectedUpdatedAt` as
a required (non-optional) parameter. It MUST only persist the write when the row currently
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

`DrizzleWorkflowRepository.update(instance, expectedUpdatedAt)` MUST issue a conditional
`UPDATE ... WHERE id = instance.id AND entity_id = instance.entityId AND entity_type =
instance.entityType AND updated_at = expectedUpdatedAt` (comparing `updated_at` at
millisecond precision, to tolerate any sub-millisecond component already present in a
stored value without that alone causing a false conflict). `entity_id`, `entity_type`, and
`created_at` MUST NOT be altered. The persisted `updated_at` column MUST equal
`instance.updatedAt` exactly as given on a successful write.

When this conditional `UPDATE` affects zero rows, the adapter MUST issue a separate
diagnostic read by `id` to distinguish three causes before throwing:

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
