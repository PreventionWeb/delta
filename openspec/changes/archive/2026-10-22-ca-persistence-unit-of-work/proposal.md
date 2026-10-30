## Why

`CreateHazardousEventUseCase` (`4b`), `UpdateHazardousEventUseCase` (`4c`), and
`DeleteHazardousEventUseCase` (`4f`) each make two or three sequential, non-transactional
writes against separate ports with no atomicity between them (`DEF-026`). `DeleteHazardousEventUseCase`
additionally has a check-then-delete race: a dependent row inserted after its dependent-reference
counts pass but before the real adapter's `delete()` commits is silently cascaded away by the
live FK `CASCADE` (`DEF-033`, compounding `DEF-031`'s "HazardousEvent with no WorkflowInstance"
gap if `delete()` fails after `deleteByEntity()` succeeds). The roadmap's `5k` entry
(`_docs/refactoring-plan/hazardous-events-refactoring-roadmap.md`) is the authoritative,
user-approved scope for closing both: thread an optional `tx?: Tx` through every write/count
method these three use cases call, wrap each use case's full write sequence in one transaction,
and give `DeleteHazardousEventUseCase` a real row lock (`SELECT ... FOR UPDATE`) so a concurrent
FK-referencing insert blocks instead of racing past the dependent-count checks.

This proposal also corrects two assumptions in the roadmap's own intent text, found during this
change's Phase 0 code verification (not re-litigating the roadmap's five already-decided points,
which are treated as final):

1. **Not every target write method already opens its own `this.db.transaction(...)`.**
   `DrizzleHazardousEventRepository.insert()`/`update()`/`delete()` and
   `DrizzleCausalChainRepository.saveEdge()`/`replaceCauseEdge()` do. `DrizzleWorkflowRepository.insert()`/
   `update()`/`deleteByEntity()` and the three count methods
   (`countReferencingDisasterEvents`, `IEventCausalityRepository.countReferences`,
   `countEdgesTouching`) are all single Drizzle statements today, with no inner `.transaction()`
   call to convert. For these, threading `tx` means substituting the resolved executor
   (`tx ?? this.db`) directly as the query builder — no `(tx ?? this.db).transaction(...)` wrapping
   is needed or added.
2. **No code path exists today for a use case to open a transaction at all.**
   `CreateHazardousEventUseCase`/`UpdateHazardousEventUseCase`/`DeleteHazardousEventUseCase`'s
   constructors take only a logger and application-layer ports — none holds a Drizzle client or
   any `Tx`-typed value, and the existing `hazardous-event-repository-port`/
   `event-causality-repository-port` spec deltas explicitly forbid a port importing from Drizzle.
   The roadmap's own intent text (`dr.transaction(async (tx) => {...})`, written as if inside the
   use case) assumes this handle already exists; it doesn't. This was a genuine architectural gap,
   not covered by the five already-decided points, raised as blocking Task 0.1 and resolved
   2026-10-21: a new `ITransactionRunner` port (application-layer, framework-free) is injected
   into the three use cases instead, preserving this codebase's unbroken "use cases hold only
   ports" precedent — see design.md Decision 1.

## What Changes

- Every write/count method `CreateHazardousEventUseCase`, `UpdateHazardousEventUseCase`, and
  `DeleteHazardousEventUseCase` call gains an optional trailing `tx?: Tx` parameter (`Tx` from
  `app/db.server.ts`), defaulting to the module-level `dr` connection when omitted — the
  established convention already used across ~95 legacy files
  (`app/db/queries/`/`app/backend.server/models/`):
  - `IHazardousEventRepository.insert()`/`update()`/`delete()`/`countReferencingDisasterEvents()`
  - `IHazardousEventRepository.findById()`/`findSpatialObservationByTime()`/
    `saveSpatialObservation()` (design.md Decision 9, found during Task 9's own implementation —
    needed so `RecordSpatialObservationUseCase`'s delegated call never mixes connections with a
    caller's own open transaction)
  - `IHazardousEventRepository.findByIdForUpdate()` (**new** method — row-locking read, see below)
  - `IWorkflowRepository.insert()`/`update()`/`deleteByEntity()`
  - `ICausalChainRepository.saveEdge()`/`replaceCauseEdge()`/`countEdgesTouching()`
  - `IEventCausalityRepository.countReferences()`
  - `RecordSpatialObservationUseCase.execute()`, via an optional `tx` field on
    `RecordSpatialObservationCommand` (not a trailing parameter — `execute()`'s own signature is
    unchanged; this is the first use case in this codebase whose `execute()` participates in a
    caller's transaction, deliberately accepted per the roadmap's already-decided point 4)
- Adapter methods that already open their own internal `this.db.transaction(...)`
  (`DrizzleHazardousEventRepository.insert()`/`update()`/`delete()`,
  `DrizzleCausalChainRepository.saveEdge()`/`replaceCauseEdge()`) change to
  `(tx ?? this.db).transaction(async (innerTx) => {...})` — Drizzle's documented savepoint-nesting
  behavior (a `.transaction()` call on a handle already inside an open transaction becomes a
  `SAVEPOINT`, not a new `BEGIN`, on Postgres) makes this safe with no conditional-skip logic.
  Methods that are single statements today (`DrizzleWorkflowRepository.insert()`/`update()`/
  `deleteByEntity()`, `countReferencingDisasterEvents()`, `countReferences()`,
  `countEdgesTouching()`) instead substitute `tx ?? this.db` directly as the query executor — no
  `.transaction()` wrapping is added where none exists today.
- **New**: `IHazardousEventRepository.findByIdForUpdate(id, tenantId, tx)` — tenant-scoped,
  acquires a real `SELECT ... FOR UPDATE` row lock on the target `hazardous_event` row, throws
  `NotFoundError` on no match (matching `findById`'s existing contract). Unlike every other method
  in this proposal, its `tx` parameter is **required**, not optional — a `FOR UPDATE` lock taken
  outside the caller's own open transaction is released the instant the statement completes and
  provides no protection at all (design.md Decision 5).
- **New**: `ITransactionRunner` (`transaction-runner-port`, New Capabilities above) —
  `run<T>(fn: (tx: Tx) => Promise<T>): Promise<T>`, injected into `CreateHazardousEventUseCase`,
  `UpdateHazardousEventUseCase`, and `DeleteHazardousEventUseCase`'s constructors (design.md
  Decision 1).
- `CreateHazardousEventUseCase.execute()` and `UpdateHazardousEventUseCase.execute()` wrap their
  full multi-write sequence — including `UpdateHazardousEventUseCase`'s delegated
  `RecordSpatialObservationUseCase.execute()` call — in one `transactionRunner.run(...)` call,
  passing the resulting `tx` through every call inside it. Neither use case's own write order or
  error-propagation contract changes (`4b` design.md Decision 5, Decision 8) — this makes the
  existing sequence atomic, it does not reorder it.
- **BREAKING (behavior change)**: a failure partway through either use case's write sequence now
  rolls back every write already made in that same `execute()` call, including ones a prior
  requirement explicitly said would remain persisted. See "Behavior changes" below and the
  `create-hazardous-event`/`update-hazardous-event` spec deltas.
- `DeleteHazardousEventUseCase.execute()` is restructured: its existing, unlocked
  `IHazardousEventRepository.findById()` existence/tenant check runs first, unchanged, exactly as
  today. Then, inside one `transactionRunner.run(...)` call, it calls the new
  `findByIdForUpdate()` to acquire the row lock; a `NotFoundError` from _this_ call — which, since
  `findById()` already confirmed the row existed, can only mean a concurrent delete committed
  while this call waited for the lock — is caught and treated as a successful no-op (design.md
  Decision 8, Task 0.3, resolved 2026-10-21; preserves today's idempotent concurrent-delete
  contract, see "Behavior changes" below). Otherwise, it re-runs the three dependent-reference
  counts (now `tx`-aware) under that lock, throws `ConflictError` exactly as today if any is
  blocking (rolling back, releasing the lock with no writes), otherwise calls
  `IWorkflowRepository.deleteByEntity()` then `IHazardousEventRepository.delete()`, both with the
  same `tx`. A concurrent FK-referencing insert against the locked row takes an implicit
  `FOR KEY SHARE` lock that conflicts with our held `FOR UPDATE`, blocking until this transaction
  ends — closing `DEF-033`'s own check-then-act race via standard Postgres row-lock-mode
  semantics, not a custom mechanism.
- **Documented, benign side effect, no action needed**: `pg_advisory_xact_lock`
  (`DrizzleCausalChainRepository.saveEdge()`/`replaceCauseEdge()`) is tied to the real underlying
  Postgres transaction, not a savepoint. Once nested inside Create/Update's outer transaction, the
  lock is held for the whole operation, not released right after the single edge write as today —
  confirmed correct against Postgres 17 semantics (design.md Risks).
- Closes `_docs/refactoring-plan/deferred-items-register.md`'s `DEF-026` and `DEF-033`, and
  narrows `DEF-031`'s `DeleteHazardousEventUseCase` clause (implementation-time task, not touched
  by this proposal's own artifacts).

### Behavior changes (not just internal plumbing)

- **`CreateHazardousEventUseCase`**: today, a failure in `IWorkflowRepository.insert()` or
  `ICausalChainRepository.saveEdge()` leaves the already-persisted `HazardousEvent` in place (no
  compensating delete, `create-hazardous-event` spec's existing "no compensating delete" scenario).
  After this change, that same failure rolls back the `HazardousEvent` insert too — zero rows
  persisted for the whole operation. The spec delta below replaces that scenario.
- **`UpdateHazardousEventUseCase`**: today, a duplicate-time conflict from the delegated
  `RecordSpatialObservationUseCase` call leaves the `HazardousEvent`'s own field and causal-link
  changes already committed (`update-hazardous-event` spec's existing scenario says so
  explicitly). After this change, the whole update — field changes, causal-link change, and the
  failed spatial-observation attempt — rolls back together.
- **`DeleteHazardousEventUseCase`**: **not a breaking change** — today's "two concurrent deletes
  of the same event both resolve without throwing" contract is preserved exactly (design.md
  Decision 8, Task 0.3, resolved 2026-10-21). Under real `FOR UPDATE` locking, the second
  caller's transaction blocks until the first commits, then its own `findByIdForUpdate` re-reads
  a row that no longer exists and throws `NotFoundError`; `execute()` catches that specific
  `NotFoundError` (safe to catch only because its own preceding, unlocked `findById()` call
  already confirmed the row existed) and resolves as a no-op — no dependent counts, no writes,
  no log event for that call. A genuinely missing or foreign-tenant id still throws
  `NotFoundError` unconditionally via the unchanged, unlocked `findById()` check that runs first,
  exactly as today — this is the fix for a gap this document's own earlier draft had (catching
  every `NotFoundError` from a single, sole existence check would have also swallowed a bad id).

## Capabilities

### New Capabilities

- `transaction-runner-port`: a new, thin, framework-free application-layer port,
  `ITransactionRunner` (`run<T>(fn: (tx: Tx) => Promise<T>): Promise<T>`), with a Drizzle-backed
  adapter, giving `CreateHazardousEventUseCase`, `UpdateHazardousEventUseCase`, and
  `DeleteHazardousEventUseCase` a way to open a transaction without holding a Drizzle client
  directly (design.md Decision 1, Task 0.1, resolved 2026-10-21). See the
  `transaction-runner-port` spec delta below for its full contract.

### Modified Capabilities

- `hazardous-event-repository-port`: `insert()`/`update()`/`delete()`/
  `countReferencingDisasterEvents()`/`findById()`/`findSpatialObservationByTime()`/
  `saveSpatialObservation()` gain an optional trailing `tx?: Tx` (the last three, design.md
  Decision 9, found during Task 9's own implementation); new required-`tx` `findByIdForUpdate()`
  method; the existing "no Drizzle/infrastructure type" requirement is narrowed to carve out the
  `Tx` parameter specifically (`Tx` is a thin union type, not a raw Drizzle
  `$inferSelect`/`$inferInsert` row type — the distinction the existing requirement is actually
  guarding).
- `causal-chain-repository-port`: `saveEdge()`/`replaceCauseEdge()`/`countEdgesTouching()` gain an
  optional trailing `tx?: Tx`. This port has no existing Drizzle-purity requirement, so no carve-out
  is needed here.
- `event-causality-repository-port`: `countReferences()` gains an optional trailing `tx?: Tx`; same
  purity-requirement carve-out as `hazardous-event-repository-port`.
- `workflow-repository-port`: `insert()`/`update()`/`deleteByEntity()` gain an optional trailing
  `tx?: Tx`. **Correction (design.md Decision 3, Task 0.2, resolved 2026-10-21):** this port
  _does_ carry an existing Drizzle-purity requirement (its "framework-free TypeScript port"
  requirement's own import restriction) — an earlier draft of this document claimed otherwise.
  It gets the same explicit, narrow `Tx` carve-out as `hazardous-event-repository-port` and
  `event-causality-repository-port`, not a weaker "doesn't violate the spirit" framing.
- `create-hazardous-event`: the full write sequence becomes one transaction; replaces the "no
  compensating delete" scenario with a "whole sequence rolls back" scenario.
- `update-hazardous-event`: the full write sequence, including the delegated spatial-observation
  call, becomes one transaction; replaces the "HE changes already persisted, not rolled back on a
  spatial conflict" scenario with a "whole sequence rolls back together" scenario.
- `delete-hazardous-event`: `execute()` keeps its existing, unlocked `findById()` call for the
  genuinely-missing/foreign-tenant case (unchanged); inside a newly-opened transaction, it also
  calls the new `findByIdForUpdate()` to acquire the row lock, whose own `NotFoundError` — which
  can now only mean a concurrent delete committed while this call waited for the lock, since
  `findById()` already confirmed the row's existence — is caught and treated as a successful
  no-op, preserving today's idempotent concurrent-delete contract exactly (design.md Decision 8,
  Task 0.3, resolved 2026-10-21). The three dependent-reference counts are run once, under that
  lock, inside the same transaction as the writes.
- `record-spatial-observation`: `execute()` accepts an optional `tx` on its command, threaded to
  `findById()`, `findSpatialObservationByTime()`, and `saveSpatialObservation()` (design.md
  Decision 9); no other behavior change.

## Impact

**Files touched:**

- `app/shared/persistence/ITransactionRunner.ts` (**new**) — `run<T>(fn: (tx: Tx) =>
Promise<T>): Promise<T>`, the new `transaction-runner-port` capability (design.md Decision 1).
- `tests/unit/shared/persistence/ITransactionRunner.test.ts` (**new**) — shape/arity
  assertions, matching `tests/unit/shared/logging/ILogger.test.ts`'s own location pattern for a
  cross-domain `app/shared/` port (not colocated under `app/shared/`, unlike this change's other,
  domain-owned port test files).
- `app/infrastructure/DrizzleTransactionRunner.server.ts` (**new**) — `@Injectable()`
  Drizzle-backed adapter, `run()` delegates to `this.db.transaction(fn)`.
- `tests/integration/db/DrizzleTransactionRunner.test.ts` (**new**, `import "./setup"`) — real
  PGlite integration test: commit returns `fn`'s resolved value; rejection rolls back and
  rethrows unmodified; two concurrent `run()` calls get distinct, non-interfering transactions.
  Placed directly under `tests/integration/db/` (matching `setup.ts`'s own location there), not
  under `queries/` or `domains/<domain>/`, since this adapter is not owned by one domain.
- `app/infrastructure/TransactionRunnerToken.ts` (**new**) — `TRANSACTION_RUNNER:
InjectionToken<ITransactionRunner>`, mirroring `WorkflowRepositoryToken.ts`'s structure. Not
  consumed by any `@Module` in this change — no `HazardousEventsModule(.server)?.ts` exists yet;
  the roadmap's `5g` is where it is registered (design.md Decision 1).
- `app/domains/hazardous-events/application/ports/IHazardousEventRepository.ts` — add `tx?: Tx`
  to `insert`/`update`/`delete`/`countReferencingDisasterEvents`/`findById`/
  `findSpatialObservationByTime`/`saveSpatialObservation`; add `findByIdForUpdate` (design.md
  Decision 9 for the last three, found during Task 9's own implementation).
- `app/domains/hazardous-events/application/ports/IHazardousEventRepository.test.ts` — update
  arity/shape assertions for the widened signatures; add assertions for the new method.
- `app/domains/hazardous-events/infrastructure/DrizzleHazardousEventRepository.server.ts` —
  thread `tx` through `insert`/`update`/`delete`/`countReferencingDisasterEvents`/`findById`;
  widen `findSpatialObservationByTime`/`saveSpatialObservation`'s signatures only (still `5e`'s
  own unimplemented stubs); implement `findByIdForUpdate`; fix the
  `loadChildCollections`/`diagnoseUpdateConflict` executor bug found during Phase 0 (design.md
  Decision 2).
- `app/domains/hazardous-events/application/ports/ICausalChainRepository.ts` — add `tx?: Tx` to
  `saveEdge`/`replaceCauseEdge`/`countEdgesTouching`.
- `app/domains/hazardous-events/application/ports/ICausalChainRepository.test.ts` — update
  shape assertions for the widened signatures.
- `app/domains/hazardous-events/infrastructure/DrizzleCausalChainRepository.server.ts` — thread
  `tx` through `saveEdge`/`replaceCauseEdge`/`countEdgesTouching`.
- `app/domains/event-causality/application/ports/IEventCausalityRepository.ts` — add `tx?: Tx`
  to `countReferences`.
- `app/domains/event-causality/application/ports/IEventCausalityRepository.test.ts` — update
  shape assertions.
- `app/domains/event-causality/infrastructure/DrizzleEventCausalityRepository.server.ts` —
  thread `tx` through `countReferences`.
- `app/domains/validation-workflow/application/ports/IWorkflowRepository.ts` — add `tx?: Tx` to
  `insert`/`update`/`deleteByEntity`.
- `app/domains/validation-workflow/application/ports/IWorkflowRepository.test.ts` — update
  shape assertions.
- `app/domains/validation-workflow/infrastructure/DrizzleWorkflowRepository.server.ts` — thread
  `tx` through `insert`/`update`/`deleteByEntity`; fix the `diagnoseUpdateConflict` executor bug
  (design.md Decision 2).
- `app/domains/hazardous-events/application/use-cases/CreateHazardousEvent.ts` — wrap the three
  writes in one `transactionRunner.run(...)` call; gains a new constructor dependency,
  `ITransactionRunner`.
- `app/domains/hazardous-events/application/use-cases/CreateHazardousEvent.test.ts` — add
  rollback-on-failure scenarios (via a fake `ITransactionRunner`); update the constructor
  fixture for the new dependency.
- `app/domains/hazardous-events/application/use-cases/UpdateHazardousEvent.ts` — wrap the writes
  (including the delegated spatial-observation call) in one `transactionRunner.run(...)` call;
  widen `UpdateHazardousEventCommand.spatialObservation`'s `Omit<...>` to also omit `"tx"`; gains
  the same new constructor dependency, `ITransactionRunner`. Also now emits its own
  `spatial_observation.recorded` log, after `transactionRunner.run()` resolves and conditional on
  `command.spatialObservation` being present (design.md Decision 6 addendum, found during Gate 10
  review, 2026-10-21 — moved here from `RecordSpatialObservationUseCase`, its only current caller).
- `app/domains/hazardous-events/application/use-cases/UpdateHazardousEvent.test.ts` — add
  rollback scenarios; update the constructor fixture; add the migrated
  `spatial_observation.recorded` post-commit logging scenarios.
- `app/domains/hazardous-events/application/use-cases/RecordSpatialObservation.ts` — add optional
  `tx` to `RecordSpatialObservationCommand`, threaded to `saveSpatialObservation()`. No new
  constructor dependency — this use case receives `tx` via its command, it does not open its own
  transaction. Also removes its own `this.logger.info(...)` call and the now-unused `ILogger`
  constructor dependency entirely (design.md Decision 6 addendum, found during Gate 10 review,
  2026-10-21) — logging moved to `UpdateHazardousEventUseCase`, this use case's only current
  caller, so it fires only after that caller's own outer transaction commits.
- `app/domains/hazardous-events/application/use-cases/RecordSpatialObservation.test.ts` — add a
  scenario asserting `tx` passes through to `saveSpatialObservation()` when present; remove the
  `FakeLogger`/logging scenarios (migrated to `UpdateHazardousEvent.test.ts`).
- `app/domains/hazardous-events/application/use-cases/DeleteHazardousEvent.ts` — keep the
  existing, unlocked `findById` existence check unchanged; inside a new
  `transactionRunner.run(...)` call, call `findByIdForUpdate`, catching its own `NotFoundError`
  as a no-op (design.md Decision 8); otherwise re-run the three dependent counts under the lock
  and wrap `deleteByEntity`/`delete` in the same transaction; gains the same new constructor
  dependency, `ITransactionRunner`.
- `app/domains/hazardous-events/application/use-cases/DeleteHazardousEvent.test.ts` — add
  lock/re-count/rollback/no-op scenarios; update the constructor fixture.
- No module-wiring file is touched by this change — see the new-files list above
  (`TransactionRunnerToken.ts`'s own note) and design.md Decision 1.
- `_docs/refactoring-plan/deferred-items-register.md` — close `DEF-026`/`DEF-033`, narrow
  `DEF-031`'s `DeleteHazardousEventUseCase` clause (implementation-time task per this proposal's
  own role boundary — not edited by this proposal's artifacts).

**DB migration required:** No. No schema or column change — this is a signature/behavior change
across existing application and infrastructure code only.

**Test approach:** PGlite integration tests (`yarn test:run2`) for every rollback-on-failure
scenario (a forced failure on the second or third write leaves zero rows persisted) and for the
`findByIdForUpdate`/dependent-recheck race — real PGlite, two concurrent `Promise`s racing against
the same in-memory instance, matching `5i`'s own precedent for testing `pg_advisory_xact_lock`
races (`DrizzleCausalChainRepository.test.ts`). Port-level shape/arity assertions stay unit tests
(no DB), matching every other port spec's existing test split.

**Security / multi-tenancy implications:** No change to tenant-scoping — `findByIdForUpdate`
scopes by `tenantId` exactly like `findById`; no query in this proposal removes or weakens a
`countryAccountsId` filter. `DeleteHazardousEventUseCase`'s dependent-reference checks are
unchanged in what they count, only in when (now inside the lock) and under what connection (now
`tx`-aware).
