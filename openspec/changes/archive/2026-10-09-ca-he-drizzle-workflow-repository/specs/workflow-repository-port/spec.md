## ADDED Requirements

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

### Requirement: DrizzleWorkflowRepository's save performs an insert-or-update keyed on the instance's own id, persisting its given updatedAt as-is

`DrizzleWorkflowRepository.save(instance)` MUST insert a new row when no row with that `id`
exists, or update the existing row with that `id` otherwise (`ON CONFLICT (id) DO UPDATE`). The
persisted `updated_at` column MUST equal `instance.updatedAt` exactly as given — the adapter MUST
NOT substitute a database-generated timestamp. `entity_id`, `entity_type`, and `created_at` MUST
NOT be altered by an update. It MUST resolve to a `WorkflowInstance` reflecting the row as
persisted. A Postgres `foreign_key_violation` (`23503`) — an attribution user id
(`submittedByUserId`/`validatedByUserId`/`approvedByUserId`/`publishedByUserId`) referencing a
nonexistent user — or an `invalid_text_representation` (`22P02`) — malformed input reaching a
typed column, e.g. a non-UUID `entityId` — MUST surface as `ValidationError`, not an unhandled
database error and not `ConflictError`.

#### Scenario: First save of a new instance inserts a row

- **GIVEN** no `workflow_instance` row exists for a given `id`
- **WHEN** `save(instance)` is called with that `id`, `status: 'DRAFT'`
- **THEN** a new row exists with that `id` and `status = 'DRAFT'`
- **AND** the resolved `WorkflowInstance` reflects the same field values passed in

#### Scenario: A subsequent save of an already-persisted id updates the existing row

- **GIVEN** a `workflow_instance` row exists with `id = X`, `status = 'DRAFT'`
- **WHEN** `save(instance)` is called with `id = X`, `status: 'SUBMITTED'`, and a later
  `updatedAt`
- **THEN** the row with `id = X` now has `status = 'SUBMITTED'`
- **AND** `updated_at` equals the `updatedAt` passed on the instance, not a server-generated
  timestamp
- **AND** no second row was created

#### Scenario: An update does not alter entityId, entityType, or createdAt

- **GIVEN** a `workflow_instance` row exists with `entity_id = X`, `entity_type = 'HE'`,
  `created_at = T0`
- **WHEN** `save(instance)` is called with `id` matching that row, transitioning its status
- **THEN** the row's `entity_id`, `entity_type`, and `created_at` remain `X`, `'HE'`, `T0`

#### Scenario: A unique-constraint violation on (entityId, entityType) during insert surfaces as ConflictError

- **GIVEN** a `workflow_instance` row already exists with `entity_id = X`, `entity_type = 'HE'`
- **WHEN** `save(instance)` is called with a different, never-before-used `id`, but the same
  `entityId = X` and `entityType = 'HE'`
- **THEN** the call rejects with `ConflictError`, not an unhandled database error
- **AND** exactly one row exists for `entity_id = X`, `entity_type = 'HE'` afterward — the
  conflicting insert did not partially apply

#### Scenario: A foreign-key violation on an attribution user id surfaces as ValidationError, not ConflictError

- **GIVEN** no `user` row exists for a given user id
- **WHEN** `save(instance)` is called with that id as `instance.submittedByUserId` (and
  `status: 'SUBMITTED'`, which requires that pair be set)
- **THEN** the call rejects with `ValidationError`, not `ConflictError` and not an unhandled
  database error

#### Scenario: Malformed input reaching a typed column surfaces as ValidationError, not ConflictError

- **GIVEN** `save(instance)` is called with an `entityId` that is a non-empty string but not a
  valid UUID (passes `WorkflowInstance.create()`'s own non-empty-string check, since that check
  does not validate UUID format)
- **WHEN** the insert reaches the database
- **THEN** the call rejects with `ValidationError`, not `ConflictError` and not an unhandled
  database error

#### Scenario: Concurrent callers racing the first insert for the same entity — exactly one row, one ConflictError

- **GIVEN** no `workflow_instance` row exists yet for `entityId = X`, `entityType = 'HE'`
- **WHEN** two `save()` calls are made concurrently, each with a distinct `id` but both with
  `entityId = X`, `entityType = 'HE'`
- **THEN** exactly one call resolves successfully and the other rejects with `ConflictError`
- **AND** exactly one `workflow_instance` row exists afterward for `entityId = X`,
  `entityType = 'HE'`

#### Scenario: Concurrent callers updating the same existing row — last write wins, neither call errors

- **GIVEN** a `workflow_instance` row exists with `id = X`, `status = 'SUBMITTED'`
- **WHEN** two `save()` calls are made concurrently, both with `id = X`, each setting a different
  `status` and a different `updatedAt`, with the second call's write committing after the first's
- **THEN** both calls resolve successfully, neither rejecting
- **AND** the row with `id = X` reflects the second call's `status` and `updatedAt`, not the
  first's (characterizes the accepted, not-yet-fixed lost-update gap tracked for a future
  optimistic-locking change — this scenario pins current behavior, not a requirement that it stay
  this way forever)

### Requirement: DrizzleWorkflowRepository's save never corrupts identity when an id collides across different entities

`DrizzleWorkflowRepository.save(instance)` MUST NOT allow an `id` collision to silently reassign
an existing row's `entityId`/`entityType` to a different entity. When the `id` passed already
belongs to a row for a *different* `(entityId, entityType)` pair than the one on `instance`, the
call rejects with `ConflictError`, and the existing row's own identity remains unchanged.

#### Scenario: An id reused for a different entity is rejected, the original row's identity is preserved

- **GIVEN** a `workflow_instance` row exists with `id = R`, `entity_id = X`, `entity_type = 'HE'`
- **WHEN** `save(instance)` is called with `id = R` but `entityId = Y` (`Y !== X`),
  `entityType = 'HE'`
- **THEN** the call rejects with `ConflictError`
- **AND** the row with `id = R` still has `entity_id = X` afterward, unchanged

### Requirement: DrizzleWorkflowRepository's save round-trips every real status transition exactly, including null-clearing

`DrizzleWorkflowRepository.save(instance)` MUST persist every field of a domain-transitioned
`WorkflowInstance` exactly as the entity computed it, including a transition that clears a
previously-set attribution pair back to `null` (e.g. `submit()` from `REVISION_REQUESTED` clears
`validatedByUserId`/`validatedAt`). A subsequent `findByEntity` reflects every field of what was
saved, not a stale or partially-updated value.

#### Scenario: DRAFT to SUBMITTED persists submittedByUserId/submittedAt, leaves the rest null

- **GIVEN** a freshly-created `DRAFT` `WorkflowInstance` has been saved
- **WHEN** `existing.submit({ userId, now })`'s result is saved, then re-read via `findByEntity`
- **THEN** the re-read instance has `status: 'SUBMITTED'`, `submittedByUserId`/`submittedAt` set
  to the given values, and `validatedByUserId`/`validatedAt`/`approvedByUserId`/`approvedAt`/
  `publishedByUserId`/`publishedAt` all still `null`

#### Scenario: validate-only stays SUBMITTED with the validator set, approval fields still null

- **GIVEN** a `SUBMITTED` `WorkflowInstance` has been saved
- **WHEN** `existing.validate({ userId, now })`'s result is saved, then re-read
- **THEN** the re-read instance has `status: 'SUBMITTED'` (unchanged), `validatedByUserId`/
  `validatedAt` set, and `approvedByUserId`/`approvedAt`/`publishedByUserId`/`publishedAt` still
  `null`

#### Scenario: SUBMITTED to APPROVED persists approvedByUserId/approvedAt

- **GIVEN** a `SUBMITTED` `WorkflowInstance` has been saved
- **WHEN** `existing.approve({ userId, now })`'s result is saved, then re-read
- **THEN** the re-read instance has `status: 'APPROVED'` and `approvedByUserId`/`approvedAt` set
  to the given values

#### Scenario: A revision round trip clears the validator back to null, not merely leaves it stale

- **GIVEN** a `SUBMITTED` `WorkflowInstance` with `validatedByUserId`/`validatedAt` already set has
  been saved (i.e. `validate()` already ran and was persisted)
- **WHEN** `existing.requestRevision({ now })`'s result is saved (status becomes
  `REVISION_REQUESTED`), then `existing.submit({ userId, now })` is applied to that result and
  saved again, then re-read
- **THEN** the re-read instance has `status: 'SUBMITTED'`
- **AND** `validatedByUserId`/`validatedAt` are both `null` — the previously-persisted validator
  attribution does not survive in the database

#### Scenario: APPROVED to PUBLISHED backfills the validator only when it was not already set

- **GIVEN** an `APPROVED` `WorkflowInstance` with `validatedByUserId`/`validatedAt` both `null`
  (direct-publish path) has been saved
- **WHEN** `existing.publish({ userId, now })`'s result is saved, then re-read
- **THEN** the re-read instance has `status: 'PUBLISHED'`, `publishedByUserId`/`publishedAt` set,
  and `validatedByUserId`/`validatedAt` backfilled to the publisher's own `userId`/`now`

#### Scenario: APPROVED to PUBLISHED preserves an already-set validator's attribution

- **GIVEN** an `APPROVED` `WorkflowInstance` with `validatedByUserId`/`validatedAt` already set to
  a different user/time than the eventual publisher has been saved
- **WHEN** `existing.publish({ userId, now })`'s result is saved, then re-read
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

None of `DrizzleWorkflowRepository`'s `findByEntity`, `findByEntityIds`, `save`, or
`deleteByEntity` SQL MUST reference a `country_accounts_id` column or any tenant-scoping
predicate — `workflow_instance` has no such column, and tenant-ownership validation is the
responsibility of the caller's own aggregate repository before reaching this adapter.

#### Scenario: A row is returned regardless of which tenant's aggregate created the referenced entity

- **GIVEN** a `workflow_instance` row exists for `entity_id = X`, where `X` is a
  `hazardous_event.id` belonging to a specific tenant (seeded via the real
  `hazardousEventTable`/`countryAccountsTable`)
- **WHEN** `findByEntity(X, 'HE')` is called with no tenant context supplied anywhere in the call
- **THEN** the row is returned — this adapter performs no tenant check of its own, by design
