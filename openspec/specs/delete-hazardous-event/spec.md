# delete-hazardous-event Specification

## Purpose

Tenant-scoped deletion of a `HazardousEvent`, blocked by one unified dependent-reference check
across the three mechanisms this check covers — a Disaster Event's `hazardousEventId`, an
`event_causality` row in either direction, and another `HazardousEvent`'s causal link on either
the cause or effect side — surfaced as a single `ConflictError` naming every blocking dependent
and how many (with a same-tenant/cross-tenant disclosure split for the `event_causality` source
specifically). A successful delete also cleans up the event's own `WorkflowInstance` row. The
legacy `event_relationship` table's own outgoing-link role is a known, separately tracked gap
(`DEF-035`) deliberately not covered by this check.

## Requirements

### Requirement: A hazardous event with no dependents is deleted

`DeleteHazardousEventUseCase.execute(command)` SHALL delete the `HazardousEvent` identified by
`command.id` within `command.tenantId` via `IHazardousEventRepository.delete` when all three
dependent-reference checks resolve no blocking dependent, after first cleaning up the event's
own `WorkflowInstance` row via `IWorkflowRepository.deleteByEntity`.

#### Scenario: Zero dependents deletes successfully

- **GIVEN** a `HazardousEvent` within `command.tenantId` with zero referencing Disaster
  Events, zero `event_causality` rows, and zero `hazardous_event_causality` edges
- **WHEN** `execute(command)` is called
- **THEN** `IWorkflowRepository.deleteByEntity` SHALL be called exactly once with `command.id`
  and `"HE"`
- **AND** `IHazardousEventRepository.delete` SHALL be called exactly once with `command.id`
  and `command.tenantId`
- **AND** `execute()` SHALL resolve without throwing

### Requirement: A missing or foreign-tenant event is rejected before any dependent check

`execute()` SHALL propagate `IHazardousEventRepository.findById`'s own `NotFoundError` when no
`HazardousEvent` exists for `command.id` within `command.tenantId`, and SHALL NOT call any of
the three dependent-reference counts, `IWorkflowRepository.deleteByEntity`, or
`IHazardousEventRepository.delete` in that case.

#### Scenario: findById throws NotFoundError

- **GIVEN** `IHazardousEventRepository.findById` rejects with `NotFoundError` for `command.id`
  and `command.tenantId`
- **WHEN** `execute(command)` is called
- **THEN** the same `NotFoundError` SHALL propagate from `execute()`
- **AND** none of `countReferencingDisasterEvents`, `IEventCausalityRepository.countReferences`,
  `ICausalChainRepository.countEdgesTouching`, `IWorkflowRepository.deleteByEntity`, or `delete`
  SHALL be called

### Requirement: A missing or non-string id, tenantId, or actingUserId is rejected before any lookup

`execute()` SHALL throw `ValidationError` when `command.id`, `command.tenantId`, or
`command.actingUserId` is an empty string, or a non-string value reachable only by a caller
bypassing the compile-time type. No repository call of any kind SHALL occur.

#### Scenario: Empty or non-string id, tenantId, or actingUserId

- **GIVEN** a command whose `id`, `tenantId`, or `actingUserId` is an empty string, or a
  non-string value reachable only by a caller bypassing the compile-time type
- **WHEN** `execute(command)` is called
- **THEN** it SHALL throw `ValidationError`
- **AND** `IHazardousEventRepository.findById` SHALL NOT be called

### Requirement: The ConflictError context has a fixed, observable shape, with a disclosure split for the event_causality source

Every `ConflictError` this use case throws SHALL carry a `context` of the shape
`{ hazardousEventId: string; dependents: Array<DisasterEventDependent |
EventCausalityDependent | CausalChainDependent> }`, where:

- `DisasterEventDependent` is `{ type: "DISASTER_EVENT"; count: number }`
- `EventCausalityDependent` is `{ type: "EVENT_CAUSALITY"; count: number;
  crossTenantReferenceExists: boolean }`, where `count` SHALL equal the same-tenant count only
  — it SHALL NEVER equal or be derived from the cross-tenant count
- `CausalChainDependent` is `{ type: "CAUSAL_CHAIN"; count: number }`

`hazardousEventId` SHALL equal `command.id`. `dependents` SHALL contain exactly one entry per
dependent source that resolved as blocking, each naming that source's own literal discriminator
— never an entry for a non-blocking source, and never more than one entry for the same source.

#### Scenario: A single blocking dependent produces a one-entry dependents array

- **GIVEN** exactly one of the three dependent-reference sources resolves as blocking
- **WHEN** `execute(command)` throws `ConflictError`
- **THEN** the error's `context.hazardousEventId` SHALL equal `command.id`
- **AND** `context.dependents` SHALL have exactly one entry, naming that one dependent type's
  own literal discriminator

### Requirement: A Disaster Event referencing the hazardous event blocks the delete

`execute()` SHALL throw `ConflictError` when
`IHazardousEventRepository.countReferencingDisasterEvents` resolves a count greater than zero,
and SHALL NOT call `IWorkflowRepository.deleteByEntity` or `delete` in that case. The thrown
error's `context.dependents` SHALL include an entry with `type: "DISASTER_EVENT"` and that
count.

#### Scenario: One referencing Disaster Event blocks the delete

- **GIVEN** `countReferencingDisasterEvents` resolves `1` for `command.id`
- **AND** the other two dependent-reference sources resolve non-blocking
- **WHEN** `execute(command)` is called
- **THEN** it SHALL throw `ConflictError`
- **AND** the error's `context.dependents` SHALL include `{ type: "DISASTER_EVENT", count: 1 }`
- **AND** neither `IWorkflowRepository.deleteByEntity` nor `IHazardousEventRepository.delete`
  SHALL be called

### Requirement: An event_causality reference in either direction blocks the delete, disclosing only a same-tenant count and a cross-tenant flag

`execute()` SHALL throw `ConflictError` when `IEventCausalityRepository.countReferences`
resolves a result whose `sameTenantCount` plus `crossTenantCount` is greater than zero, and
SHALL NOT call `IWorkflowRepository.deleteByEntity` or `delete` in that case. The thrown error's
`context.dependents` SHALL include an entry with `type: "EVENT_CAUSALITY"`, `count` equal to
`sameTenantCount`, and `crossTenantReferenceExists` equal to whether `crossTenantCount` is
greater than zero. This is a deliberate behavior change: today, deleting a `HazardousEvent`
referenced only via `event_causality` succeeds and silently cascades away the `event_causality`
row.

#### Scenario: One same-tenant event_causality reference blocks the delete, discloses its count, flags no cross-tenant reference

- **GIVEN** `IEventCausalityRepository.countReferences` resolves
  `{ sameTenantCount: 1, crossTenantCount: 0 }` for `command.id`
- **AND** the other two dependent-reference sources resolve non-blocking
- **WHEN** `execute(command)` is called
- **THEN** it SHALL throw `ConflictError`
- **AND** the error's `context.dependents` SHALL include `{ type: "EVENT_CAUSALITY", count: 1,
  crossTenantReferenceExists: false }`
- **AND** neither `IWorkflowRepository.deleteByEntity` nor `IHazardousEventRepository.delete`
  SHALL be called

#### Scenario: A cross-tenant-only event_causality reference still blocks the delete, disclosing a zero count and a true flag, never the cross-tenant count itself

- **GIVEN** `IEventCausalityRepository.countReferences` resolves
  `{ sameTenantCount: 0, crossTenantCount: 1 }` for `command.id`
- **AND** the other two dependent-reference sources resolve non-blocking
- **WHEN** `execute(command)` is called
- **THEN** it SHALL throw `ConflictError`
- **AND** the error's `context.dependents` SHALL include `{ type: "EVENT_CAUSALITY", count: 0,
  crossTenantReferenceExists: true }`
- **AND** the error's `context` SHALL NOT contain the number `1` (the cross-tenant count)
  anywhere under the `EVENT_CAUSALITY` entry
- **AND** neither `IWorkflowRepository.deleteByEntity` nor `IHazardousEventRepository.delete`
  SHALL be called

#### Scenario: Both same-tenant and cross-tenant event_causality references are present

- **GIVEN** `IEventCausalityRepository.countReferences` resolves
  `{ sameTenantCount: 2, crossTenantCount: 3 }` for `command.id`
- **AND** the other two dependent-reference sources resolve non-blocking
- **WHEN** `execute(command)` is called
- **THEN** it SHALL throw `ConflictError`
- **AND** the error's `context.dependents` SHALL include `{ type: "EVENT_CAUSALITY", count: 2,
  crossTenantReferenceExists: true }`
- **AND** the error's `context` SHALL NOT contain the number `3` (the cross-tenant count)
  anywhere under the `EVENT_CAUSALITY` entry

### Requirement: A causal-chain link on either the cause or the effect side blocks the delete

`execute()` SHALL throw `ConflictError` when `ICausalChainRepository.countEdgesTouching`
resolves a count greater than zero, and SHALL NOT call `IWorkflowRepository.deleteByEntity` or
`delete` in that case. The thrown error's `context.dependents` SHALL include an entry with
`type: "CAUSAL_CHAIN"` and that count. This check SHALL block the delete whether the event is
the cause or the effect side of the edge — an event that is itself an effect, with no outgoing
edge of its own, SHALL still be blocked.

#### Scenario: The event is the cause side of an edge

- **GIVEN** `ICausalChainRepository.countEdgesTouching` resolves `1` for `command.id` because
  it is the cause of some other event
- **AND** the other two dependent-reference sources resolve non-blocking
- **WHEN** `execute(command)` is called
- **THEN** it SHALL throw `ConflictError`
- **AND** the error's `context.dependents` SHALL include `{ type: "CAUSAL_CHAIN", count: 1 }`
- **AND** neither `IWorkflowRepository.deleteByEntity` nor `IHazardousEventRepository.delete`
  SHALL be called

#### Scenario: The event is the effect side of an edge, with no outgoing edge of its own

- **GIVEN** `ICausalChainRepository.countEdgesTouching` resolves `1` for `command.id` because
  it is the effect of some other event's cause, and this event causes nothing itself
- **AND** the other two dependent-reference sources resolve non-blocking
- **WHEN** `execute(command)` is called
- **THEN** it SHALL throw `ConflictError`
- **AND** the error's `context.dependents` SHALL include `{ type: "CAUSAL_CHAIN", count: 1 }`
- **AND** neither `IWorkflowRepository.deleteByEntity` nor `IHazardousEventRepository.delete`
  SHALL be called

### Requirement: All three dependent-reference checks run before any is thrown, and the error names every blocking dependent, not just the first found

`execute()` SHALL resolve all three dependent-reference checks before throwing — it SHALL NOT
stop at the first blocking result. When more than one source is blocking, the single thrown
`ConflictError`'s `context.dependents` SHALL name every blocking source, not only one of them.

#### Scenario: Two dependent sources are both blocking

- **GIVEN** `countReferencingDisasterEvents` resolves `2`
- **AND** `ICausalChainRepository.countEdgesTouching` resolves `1`
- **AND** `IEventCausalityRepository.countReferences` resolves
  `{ sameTenantCount: 0, crossTenantCount: 0 }`
- **WHEN** `execute(command)` is called
- **THEN** all three dependent-reference sources SHALL have been called before `execute()`
  throws
- **AND** it SHALL throw exactly one `ConflictError`
- **AND** that error's `context.dependents` SHALL include `{ type: "DISASTER_EVENT", count: 2 }`
  and `{ type: "CAUSAL_CHAIN", count: 1 }`, and SHALL NOT include an entry for
  `"EVENT_CAUSALITY"`
- **AND** neither `IWorkflowRepository.deleteByEntity` nor `IHazardousEventRepository.delete`
  SHALL be called

### Requirement: The event's WorkflowInstance is deleted after the dependent-check passes, before the main delete

`execute()` SHALL call `IWorkflowRepository.deleteByEntity(command.id, "HE", tx)` after all three
dependent-reference checks resolve non-blocking, and before calling
`IHazardousEventRepository.delete(command.id, command.tenantId, tx)`, both against the same
transaction handle `tx` opened for this call (see "The dependent-reference checks and both
deletes run under one row lock, inside one transaction," below). A rejection from `deleteByEntity`
SHALL propagate from `execute()` unmodified, `IHazardousEventRepository.delete` SHALL NOT be
called in that case, and the whole transaction — including the row lock and any state this call
itself has not yet written — SHALL roll back.

#### Scenario: deleteByEntity is called before delete, in that order

- **GIVEN** all three dependent-reference checks resolve non-blocking
- **WHEN** `execute(command)` is called
- **THEN** `IWorkflowRepository.deleteByEntity` SHALL be called before
  `IHazardousEventRepository.delete`
- **AND** both calls SHALL receive the same transaction handle opened for this `execute()` call

#### Scenario: deleteByEntity rejects, the main delete is never reached

- **GIVEN** all three dependent-reference checks resolve non-blocking
- **AND** `IWorkflowRepository.deleteByEntity` rejects with a generic `Error`
- **WHEN** `execute(command)` is called
- **THEN** the same error SHALL propagate from `execute()`
- **AND** `IHazardousEventRepository.delete` SHALL NOT be called
- **AND** no log event SHALL be emitted
- **AND** the `HazardousEvent` row SHALL still exist afterward — the whole transaction, including
  the row lock, rolls back

### Requirement: A successful delete is logged once; a blocked or failed delete is not

`execute()` SHALL emit exactly one structured log event when the delete succeeds, naming
`command.id`, `command.tenantId`, and `command.actingUserId`, and SHALL NOT emit a log event
when it throws `NotFoundError`, `ValidationError`, or `ConflictError`, or when any repository
call rejects.

#### Scenario: Successful delete is logged once

- **GIVEN** all three dependent-reference checks resolve non-blocking
- **AND** `IWorkflowRepository.deleteByEntity` resolves successfully
- **WHEN** `execute(command)` succeeds
- **THEN** a structured log event SHALL be emitted exactly once, naming `command.id`,
  `command.tenantId`, and `command.actingUserId`

#### Scenario: No log event when blocked by a dependent

- **WHEN** `execute(command)` throws `ConflictError` for any dependent
- **THEN** no log event SHALL be emitted

#### Scenario: No log event on any other failure

- **WHEN** `execute(command)` throws `NotFoundError` or `ValidationError`, or any repository
  call rejects with an error
- **THEN** no log event SHALL be emitted

### Requirement: Repository errors propagate unmodified

`execute()` SHALL NOT catch or wrap an error rejected by `IHazardousEventRepository.findById`,
`countReferencingDisasterEvents`, `IEventCausalityRepository.countReferences`,
`ICausalChainRepository.countEdgesTouching`, `IWorkflowRepository.deleteByEntity`, or
`IHazardousEventRepository.delete` — each SHALL propagate unmodified. The one deliberate
exception is `IHazardousEventRepository.findByIdForUpdate`'s own `NotFoundError`, and only when
it occurs after this same call's own earlier `findById` has already resolved successfully — see
"execute() treats a post-findById NotFoundError from findByIdForUpdate as a successful no-op,"
below. Every other error `findByIdForUpdate` rejects with (e.g. `ValidationError` from a failed
rehydration) still propagates unmodified, and `findByIdForUpdate`'s own `NotFoundError` still
propagates unmodified in every case where it is this call's *first* existence check to reject —
it cannot be, since `execute()`'s own earlier `findById` call already would have rejected first
in that case.

#### Scenario: A dependent-reference check rejects

- **GIVEN** `findById` resolves an existing event
- **AND** `ICausalChainRepository.countEdgesTouching` rejects with a generic `Error`
- **WHEN** `execute(command)` is called
- **THEN** the same error SHALL propagate from `execute()`
- **AND** neither `IWorkflowRepository.deleteByEntity` nor `IHazardousEventRepository.delete`
  SHALL be called

#### Scenario: delete itself rejects

- **GIVEN** all three dependent-reference checks resolve non-blocking
- **AND** `IWorkflowRepository.deleteByEntity` resolves successfully
- **AND** `IHazardousEventRepository.delete` rejects with a generic `Error`
- **WHEN** `execute(command)` is called
- **THEN** the same error SHALL propagate from `execute()`
- **AND** no log event SHALL be emitted

#### Scenario: findByIdForUpdate rejects with ValidationError, which still propagates unmodified

- **GIVEN** `findById` resolves an existing event
- **AND** `findByIdForUpdate`, called inside the opened transaction, rejects with
  `ValidationError` (a row that fails rehydration)
- **WHEN** `execute(command)` is called
- **THEN** the same `ValidationError` SHALL propagate from `execute()`, unmodified — it SHALL NOT
  be caught or treated as a no-op, unlike `NotFoundError` from the same call

### Requirement: Two concurrent delete calls for the same event each run to completion without either call itself throwing from shared state

Two simultaneous `execute()` calls for the **same** `id`/`tenantId`, both resolving zero
dependents, where both calls' own unlocked `findById` resolves successfully before either call's
own transaction is opened, MUST each complete without throwing. The mechanism changes under this
change (closing `DEF-033`'s own check-then-delete race requires a real lock, not reliance on
`deleteByEntity`'s/`delete`'s own idempotent no-op contracts racing past an unlocked check), but
the externally-observable outcome — both calls resolve without throwing — does not: each call
opens its own transaction and calls `findByIdForUpdate(command.id, command.tenantId, tx)` to
acquire the row lock; the second call's own `findByIdForUpdate` blocks until the first call's
transaction commits or rolls back. Once unblocked, the second call's `findByIdForUpdate` —
re-reading a row the first call has just deleted — rejects with `NotFoundError`; `execute()`
catches that specific `NotFoundError` (see "execute() treats a post-findById NotFoundError from
findByIdForUpdate as a successful no-op," below) and resolves normally, without running any
dependent-reference count and without calling `deleteByEntity` or `delete` for that call. Unlike
this requirement's own prior scenario, only the call whose writes actually ran emits a log event
— the losing call performed no write, so it logging a "deletion" would misdescribe what happened
(design.md Decision 8).

#### Scenario: Two concurrent deletes of the same zero-dependent event, both reads before either write, both succeed

- **GIVEN** a `HazardousEvent` within `command.tenantId` with zero dependents
- **WHEN** `execute(command)` is called twice, concurrently, for the identical `command`, such
  that both calls' own `findById` resolves successfully before either call's own
  `transactionRunner.run(...)` is invoked, and the second call's own `findByIdForUpdate` blocks
  on the first call's held row lock
- **THEN** both calls SHALL resolve without throwing
- **AND** exactly one of the two calls SHALL actually delete the `HazardousEvent` and its
  `WorkflowInstance` — the other call's own `findByIdForUpdate` SHALL reject with `NotFoundError`
  internally, caught by `execute()` as a no-op
- **AND** exactly one structured log event SHALL be emitted, for the call that actually deleted —
  not two, and not for the no-op call
- **AND** this scenario does NOT establish that a dependent cannot be inserted between either
  call's own unlocked `findById` and its own `findByIdForUpdate` lock acquisition — that gap is
  closed separately, by the lock itself, once acquired (see "The acquired lock blocks a
  concurrent referencing insert until this transaction ends," below), not by this scenario

### Requirement: Concurrent callers for different tenants' events resolve independently

Two simultaneous `execute()` calls for different tenants' events MUST each produce their own
correct result without cross-contamination — each call's own dependent-reference checks MUST
only ever reflect its own `command.id`. Each call's own row lock is scoped to its own
`hazardous_event` row, so neither call's lock blocks the other's.

#### Scenario: Two concurrent delete calls for different tenants

- **GIVEN** tenant `T1` has a `HazardousEvent` with zero dependents, and tenant `T2` has a
  `HazardousEvent` with one blocking `event_causality` reference
- **WHEN** `execute({ id: eventT1, tenantId: "T1", ... })` and
  `execute({ id: eventT2, tenantId: "T2", ... })` are called concurrently, before either
  resolves
- **THEN** the `T1` call SHALL resolve successfully, with `delete` called for `eventT1`
- **AND** the `T2` call SHALL throw `ConflictError`, with `delete` never called for `eventT2`
- **AND** neither call's own dependent-reference checks SHALL be affected by the other call's
  own id or result
- **AND** neither call blocks on the other's row lock, since each targets a different row

### Requirement: execute() treats a post-findById NotFoundError from findByIdForUpdate as a successful no-op

`execute()` keeps its existing, unlocked `IHazardousEventRepository.findById(command.id,
command.tenantId)` call, in the same position it runs today, before opening any transaction —
this is what still rejects with `NotFoundError` for a genuinely missing or foreign-tenant id,
unconditionally, exactly as before this change (design.md Decision 8). Only once that call has
already resolved successfully does `execute()` open a transaction and call `findByIdForUpdate`
to acquire the lock. A `NotFoundError` from *that* specific call — which can only mean a
concurrent transaction deleted and committed the row while this call waited for the lock, since
the preceding `findById` already confirmed the row existed — SHALL be caught by `execute()`.
When caught, `execute()` SHALL run none of the three dependent-reference counts, SHALL call
neither `IWorkflowRepository.deleteByEntity` nor `IHazardousEventRepository.delete`, SHALL emit
no log event, and SHALL resolve normally (not throw). This does not alter
`findByIdForUpdate`'s own general-purpose contract — it still throws `NotFoundError` for every
other caller and every other scenario (e.g. a bad id passed directly to `findByIdForUpdate` by
some other future consumer); only this one call site, immediately following this same call's own
successful `findById`, treats this specific `NotFoundError` as a no-op.

#### Scenario: findById still rejects unconditionally for a genuinely missing or foreign-tenant id

- **GIVEN** no `HazardousEvent` exists for `command.id`/`command.tenantId` (or it exists only
  under a different tenant)
- **WHEN** `execute(command)` is called
- **THEN** `IHazardousEventRepository.findById` SHALL reject with `NotFoundError`
- **AND** that same `NotFoundError` SHALL propagate from `execute()` unmodified
- **AND** `findByIdForUpdate`, every dependent-reference count, `deleteByEntity`, and `delete`
  SHALL NOT be called

#### Scenario: A NotFoundError from findByIdForUpdate, after findById already succeeded, resolves as a no-op

- **GIVEN** `findById` resolves the event successfully
- **AND** `findByIdForUpdate`, called inside the transaction `execute()` then opens, rejects with
  `NotFoundError`
- **WHEN** `execute(command)` is called
- **THEN** `execute()` SHALL resolve without throwing
- **AND** none of `countReferencingDisasterEvents`, `IEventCausalityRepository.countReferences`,
  `ICausalChainRepository.countEdgesTouching`, `IWorkflowRepository.deleteByEntity`, or
  `IHazardousEventRepository.delete` SHALL be called
- **AND** no log event SHALL be emitted

#### Scenario: A fully sequential second delete still throws NotFoundError, unaffected by this change

- **GIVEN** a first `execute()` call for an event has already fully committed its delete — its
  own `transactionRunner.run(...)` call has resolved — before a second `execute()` call for the
  same `id`/`tenantId` is made
- **WHEN** the second `execute(command)` call is made
- **THEN** its own `findById` call SHALL reject with `NotFoundError`, exactly as today
- **AND** that same `NotFoundError` SHALL propagate from `execute()` unmodified — `
findByIdForUpdate` SHALL NOT be reached for this call at all

### Requirement: The dependent-reference checks and both deletes run under one row lock, inside one transaction

`execute()` SHALL open a single transaction, via `ITransactionRunner.run(...)`, for the whole
call (after its own earlier, unlocked `findById` call has already resolved successfully). Within
it, `execute()` SHALL call `IHazardousEventRepository.findByIdForUpdate(command.id,
command.tenantId, tx)` — acquiring a `SELECT ... FOR UPDATE` lock on the target row — before
running any of the three dependent-reference counts, and SHALL run all three counts
(`countReferencingDisasterEvents`, `IEventCausalityRepository.countReferences`,
`ICausalChainRepository.countEdgesTouching`) against that same `tx`, after the lock is held, not
before. There is exactly one count pass per `execute()` call — the counts are not run once
unlocked and then rechecked again under the lock (design.md Decision 5). A concurrent `INSERT`
into any of the three dependent tables, attempted on a separate connection after the lock is
acquired, blocks until this transaction commits or rolls back — closing `DEF-033`'s own
check-then-delete race.

#### Scenario: A concurrent referencing insert, attempted after the lock is acquired, blocks until this transaction ends

- **GIVEN** a `HazardousEvent` with zero dependents, and `execute(command)` has acquired its row
  lock via `findByIdForUpdate` but has not yet committed
- **WHEN** a concurrent `INSERT` into `disaster_event` referencing this same `hazardousEventId`
  is attempted on a separate connection, before `execute(command)`'s own transaction commits
- **THEN** that concurrent `INSERT` MUST block until `execute(command)`'s transaction commits or
  rolls back
- **AND** once `execute(command)` commits the delete, the blocked `INSERT` MUST then fail with a
  foreign-key violation (the referenced row no longer exists) rather than silently succeeding
  against a row that was concurrently deleted out from under it

#### Scenario: A dependent inserted and committed before the lock is acquired is counted, blocking the delete exactly as today

- **GIVEN** a `disaster_event` row referencing `hazardousEventId` is inserted and committed on a
  separate connection, before `execute(command)` is called
- **WHEN** `execute(command)` is called
- **THEN** `countReferencingDisasterEvents`, executed under the lock, MUST resolve a count
  reflecting that already-committed row
- **AND** `execute()` MUST throw `ConflictError`, exactly as it would without this change's own
  locking mechanism
