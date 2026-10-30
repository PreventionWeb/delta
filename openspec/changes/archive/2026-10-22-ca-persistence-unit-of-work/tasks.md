## 0. Open design questions — resolved 2026-10-21 (user discussion)

- [x] 0.1 **How the three use cases obtain a transaction handle** (design.md Decision 1,
      RESOLVED 2026-10-21): **Option A** — a new `ITransactionRunner` port
      (`app/shared/persistence/ITransactionRunner.ts`) with a Drizzle-backed adapter
      (`app/infrastructure/DrizzleTransactionRunner.server.ts`) and its own DI token
      (`app/infrastructure/TransactionRunnerToken.ts`), injected into
      `CreateHazardousEventUseCase`'s, `UpdateHazardousEventUseCase`'s, and
      `DeleteHazardousEventUseCase`'s constructors. Chosen over Option B (inject the Drizzle
      client directly) because the "use cases hold only ports, never infrastructure" precedent —
      unbroken across every use case built so far — outweighs the roadmap's own informal
      intent-text sketch. Sections 1-9 below are written against Option A.
- [x] 0.2 **The port-purity-requirement carve-out** (design.md Decision 3, RESOLVED 2026-10-21):
      narrowed, not removed, with an explicit, checkable exception — `import type { Tx } from
    "~/db.server"` is permitted (a type-only import, erased at compile time); a Drizzle
      `$inferSelect`/`$inferInsert` row type is still never permitted. **Correction found while
      finalizing this task:** `workflow-repository-port` _does_ carry this purity requirement
      (an earlier draft of this change's own documents claimed otherwise) — it gets the same
      explicit carve-out as `hazardous-event-repository-port` and `event-causality-repository-
    port`, replacing its own weaker "does not violate the spirit of this import restriction"
      wording. `causal-chain-repository-port` carries no such requirement and needs none.
- [x] 0.3 **The concurrent-delete contract** (design.md Decision 8, RESOLVED 2026-10-21):
      **preserved, not changed** — today's "two concurrent deletes of the same event both
      resolve without throwing" guarantee continues to hold. `DeleteHazardousEventUseCase.
    execute()` keeps its existing, unlocked `findById()` call first (unchanged — this is what
      still throws `NotFoundError` for a genuinely missing or foreign-tenant id). Only after that
      succeeds does it open a transaction and call the new `findByIdForUpdate()` to acquire the
      lock; a `NotFoundError` from _that_ specific call can only mean a concurrent delete
      committed while this call waited for the lock, so `execute()` catches it and resolves as a
      no-op (no counts, no writes, no log event). **Gap found and fixed while finalizing this
      task, not part of the user's own decision text:** the original framing ("findByIdForUpdate
      replaces findById entirely," this document's own earlier draft) would have caught every
      `NotFoundError` — including a genuinely bad id's — as a no-op, silently regressing today's
      "bad id throws" behavior. Keeping the unlocked `findById()` call first is what prevents
      that collision; see design.md Decision 8 for the full reasoning.

## 1. ITransactionRunner — new port, adapter, and token (new capability: `transaction-runner-port`)

- [x] 1.1 Write failing shape/arity tests in
      `tests/unit/shared/persistence/ITransactionRunner.test.ts` (new file; location mirrors
      `tests/unit/shared/logging/ILogger.test.ts`'s own pattern for a cross-domain `app/shared/`
      port — not colocated under `app/shared/`): `ITransactionRunner` declares exactly one
      method, `run<T>(fn: (tx: Tx) => Promise<T>): Promise<T>`. Verify: fails to compile (the
      file doesn't exist yet).
- [x] 1.2 Create `app/shared/persistence/ITransactionRunner.ts`: export the interface per Task
      1.1; `import type { Tx } from "~/db.server"` (type-only, per design.md Decision 3's
      carve-out); no other import. Verify: Task 1.1's test passes; `yarn tsc` clean for this
      file.
- [x] 1.3 Write a failing PGlite integration test in `tests/integration/db/
DrizzleTransactionRunner.test.ts` (new file, `import "./setup";` — placed directly under
      `tests/integration/db/`, matching `setup.ts`'s own location there, not under `queries/` or
      `domains/<domain>/`, since this adapter belongs to no single domain): `run(fn)` where `fn`
      resolves commits the write and resolves with `fn`'s own value, visible to a read via a
      separate connection afterward; `run(fn)` where `fn` rejects rolls back the write (not
      visible afterward) and rejects with the same error, unmodified; a value written via the
      `tx` `run()` passes to `fn` is usable, with no cast, as the `tx` parameter of
      `IHazardousEventRepository.insert`; two concurrent `run()` calls, one resolving and one
      rejecting, each produce their own correct, non-interfering outcome. Verify: fails (the
      adapter doesn't exist yet).
- [x] 1.4 Implement `DrizzleTransactionRunner` in
      `app/infrastructure/DrizzleTransactionRunner.server.ts`: `@Injectable()`, constructor
      `@Inject(DRIZZLE_CLIENT) private readonly db: Dr` (same pattern as every
      `Drizzle*Repository.server.ts` adapter), `run(fn) { return this.db.transaction(fn); }`.
      Verify: Task 1.3's test passes; `yarn tsc` clean.
- [x] 1.5 Create `app/infrastructure/TransactionRunnerToken.ts`: `export const
    TRANSACTION_RUNNER: InjectionToken<ITransactionRunner> =
    Symbol("TRANSACTION_RUNNER");`, with the same "kept out of the port file — domain types
      must not import `@nestjs/common`" comment `WorkflowRepositoryToken.ts` carries. **No
      `@Module` registers this token in this change** — no `HazardousEventsModule(.server)?.ts`
      exists yet (confirmed by repo-wide grep); the roadmap's own `5g` is where that module is
      created and where `TRANSACTION_RUNNER` is registered as a provider alongside the other
      Phase-4 use-case dependencies (design.md Decision 1). Verify: `yarn tsc` clean; no test
      needed (a bare `Symbol` constant, matching `WorkflowRepositoryToken.ts`'s own lack of a
      test file).

## 2. IHazardousEventRepository — widen signatures, add findByIdForUpdate

- [x] 2.1 Update `app/domains/hazardous-events/application/ports/IHazardousEventRepository.test.ts`:
      add/update "Method signature" arity assertions for `insert`/`update`/`delete`/
      `countReferencingDisasterEvents`'s new optional trailing `tx?: Tx`; add assertions for the
      new `findByIdForUpdate(id, tenantId, tx)` method, including that `tx` is NOT optional
      there (per the `hazardous-event-repository-port` spec delta's ADDED requirement). Verify:
      `yarn vitest run app/domains/hazardous-events/application/ports/IHazardousEventRepository.test.ts`
      fails to compile (the interface doesn't have the new method/params yet).
- [x] 2.2 Update `app/domains/hazardous-events/application/ports/IHazardousEventRepository.ts`:
      add `tx?: Tx` to `insert`/`update`/`delete`/`countReferencingDisasterEvents`; add
      `findByIdForUpdate(id: string, tenantId: string, tx: Tx): Promise<HazardousEvent>`;
      `import type { Tx } from "~/db.server"` (design.md Decision 3's explicit carve-out); update
      the file's own doc comment and the purity note. Verify: Task 2.1's test passes; `yarn tsc`
      clean for this file.

## 3. DrizzleHazardousEventRepository — thread tx, fix the executor bug, implement findByIdForUpdate

- [x] 3.1 Write failing tests in
      `tests/integration/db/queries/DrizzleHazardousEventRepository.test.ts` (existing file,
      `import "../setup";` — confirmed via repo search; this is **not**
      `app/domains/hazardous-events/infrastructure/DrizzleHazardousEventRepository.test.ts`, no
      such colocated file exists for this adapter) for: `insert(entity, tx)` called with an
      externally-supplied, not-yet-committed `tx` — a subsequent read via that same `tx` (before
      commit) sees the full entity including all four child collections (the
      `hazardous-event-repository-port` spec delta's own scenario). This is the regression test
      for the Decision 2 executor bug — it MUST fail against today's `loadChildCollections()`,
      which always reads via `this.db`. Verify: the test fails for the right reason (empty/partial
      child collections when read through `tx`, not a compile error).
- [x] 3.2 Fix `loadChildCollections()` and `update()`'s `diagnoseUpdateConflict()` to accept and
      use the resolved executor (`tx ?? this.db`) instead of a hard-coded `this.db` (design.md
      Decision 2); change `insert()`/`update()`/`delete()` to
      `(tx ?? this.db).transaction(async (innerTx) => {...})`; thread `tx` through
      `countReferencingDisasterEvents()` as the query executor (no `.transaction()` wrapping — it
      is a single statement, design.md Context). Verify: Task 3.1's test passes; existing
      `DrizzleHazardousEventRepository.test.ts` scenarios for `insert`/`update`/`delete` still
      pass unchanged (no external `tx` — default-to-`this.db` behavior is unchanged).
- [x] 3.3 Write failing tests for `findByIdForUpdate` in the same file as Task 3.1: tenant-scoped
      match resolves with child collections populated; no match throws `NotFoundError`;
      foreign-tenant id throws `NotFoundError`; a row failing rehydration throws
      `ValidationError`; a concurrent `INSERT` into `disaster_event` referencing the locked row,
      attempted on a separate connection before the lock-holding transaction commits, blocks
      until it does (real PGlite, two concurrent `Promise`s, matching `5i`'s own advisory-lock-race
      test precedent). Verify: tests fail (method doesn't exist yet).
- [x] 3.4 Implement `findByIdForUpdate(id, tenantId, tx)`: `SELECT ... FOR UPDATE` scoped by
      `id`/`countryAccountsId` against `tx` directly (required parameter, no `tx ?? this.db`
      fallback); throw `NotFoundError` on no match; rehydrate via the existing
      `loadChildCollections`/`rehydrate` path using `tx` as the executor (Task 3.2's fix).
      Verify: Task 3.3's tests pass.

## 4. ICausalChainRepository / DrizzleCausalChainRepository — thread tx

- [x] 4.1 Update `app/domains/hazardous-events/application/ports/ICausalChainRepository.test.ts`:
      add shape assertions for `saveEdge`/`replaceCauseEdge`/`countEdgesTouching`'s new optional
      trailing `tx?: Tx`. Verify: fails to compile.
- [x] 4.2 Update `app/domains/hazardous-events/application/ports/ICausalChainRepository.ts`: add
      `tx?: Tx` to `saveEdge`/`replaceCauseEdge`/`countEdgesTouching`; `import type { Tx } from
    "~/db.server"` (no purity carve-out needed on this port — it has no "framework-free"
      import-restriction requirement today, design.md Decision 3). Verify: Task 4.1's test
      passes.
- [x] 4.3 Write failing tests in
      `tests/integration/db/queries/DrizzleCausalChainRepository.test.ts` (existing file,
      `import "../setup";`) for: `saveEdge`/`replaceCauseEdge` called with an externally-supplied
      `tx` nest as a `SAVEPOINT` (a write made via `tx` before commit is visible to a
      `findReachableEdgesFrom` read against that same `tx`); `countEdgesTouching(nodeId, tx)`
      reflects that same transaction's own uncommitted writes. Verify: tests fail (methods don't
      accept `tx` yet).
- [x] 4.4 Change `saveEdge()`/`replaceCauseEdge()` to `(tx ?? this.db).transaction(async
    (innerTx) => {...})`; thread `tx` through `countEdgesTouching()` as the query executor (no
      `.transaction()` wrapping — single statement). Verify: Task 4.3's tests pass; existing
      scenarios (including `5i`'s advisory-lock-race tests) still pass unchanged.

## 5. IEventCausalityRepository / DrizzleEventCausalityRepository — thread tx

- [x] 5.1 Update `app/domains/event-causality/application/ports/IEventCausalityRepository.test.ts`:
      add a shape assertion for `countReferences`'s new optional trailing `tx?: Tx`. Verify:
      fails to compile.
- [x] 5.2 Update `app/domains/event-causality/application/ports/IEventCausalityRepository.ts`:
      add `tx?: Tx` to `countReferences`; `import type { Tx } from "~/db.server"`; update the
      file's own doc comment/purity note to the explicit, narrow carve-out wording (design.md
      Decision 3): "...MUST NOT import from any Drizzle, NestJS, or Remix module, except
      `app/db.server.ts`'s exported `Tx` type, imported as `import type { Tx } from
    "~/db.server"`..." — this port does carry the purity requirement and does get the
      carve-out (unlike `causal-chain-repository-port`, which carries no such requirement at
      all). Verify: Task 5.1's test passes; matches the `event-causality-repository-port` spec
      delta's own wording.
- [x] 5.3 Write a failing test in
      `tests/integration/domains/event-causality/DrizzleEventCausalityRepository.test.ts`
      (existing file, `import "../../db/setup";` — confirmed via repo search; **not**
      `app/domains/event-causality/infrastructure/DrizzleEventCausalityRepository.test.ts`, which
      does not exist):
      `countReferences(hazardousEventId, tenantId, tx)` called with an externally-supplied `tx`
      reflects that same transaction's own uncommitted `event_causality` insert. Verify: fails
      (method doesn't accept `tx` yet).
- [x] 5.4 Thread `tx` through `countReferences()` as the query executor for both joins. Verify:
      Task 5.3's test passes; existing scenarios unchanged.

## 6. IWorkflowRepository / DrizzleWorkflowRepository — thread tx

- [x] 6.1 Update `app/domains/validation-workflow/application/ports/IWorkflowRepository.test.ts`:
      add shape assertions for `insert`/`update`/`deleteByEntity`'s new optional trailing
      `tx?: Tx`. Verify: fails to compile.
- [x] 6.2 Update `app/domains/validation-workflow/application/ports/IWorkflowRepository.ts`: add
      `tx?: Tx` to `insert`/`update`/`deleteByEntity`; `import type { Tx } from "~/db.server"`.
      **Correction (design.md Decision 3, Task 0.2):** this port's own "framework-free TypeScript
      port" requirement _does_ carry an import-purity restriction — update its doc comment to
      the same explicit, narrow carve-out wording as `hazardous-event-repository-port`
      ("...MUST NOT import from any Drizzle, NestJS, or Remix module, except...`Tx`..., imported
      as `import type { Tx } from "~/db.server"`..."), replacing its own prior "does not violate
      the spirit of this import restriction" phrasing. Verify: Task 6.1's test passes; matches
      the `workflow-repository-port` spec delta's own wording.
- [x] 6.3 Write failing tests in
      `tests/integration/domains/validation-workflow/DrizzleWorkflowRepository.test.ts`
      (existing file, `import "../../db/setup";` — confirmed via repo search; **not**
      `app/domains/validation-workflow/infrastructure/DrizzleWorkflowRepository.test.ts`, which
      does not exist) for: `insert(instance, tx)`/`deleteByEntity(entityId, entityType, tx)`
      called with an externally-supplied `tx` are visible to a `findByEntity` read against that
      same `tx` before commit; `update()`'s zero-row diagnostic re-read, when `tx` is supplied,
      reflects that same transaction's own prior write (e.g. an earlier `deleteByEntity(..., tx)`
      in the same `tx`) rather than a stale view from `this.db`. Verify: tests fail (methods
      don't accept `tx` yet, or `diagnoseUpdateConflict` still reads via `this.db`).
- [x] 6.4 Thread `tx` through `insert()`/`update()`/`deleteByEntity()` as the query executor (no
      `.transaction()` wrapping — all three are single statements, design.md Context); fix
      `update()`'s `diagnoseUpdateConflict()` to read via `tx ?? this.db` (design.md Decision 2).
      Verify: Task 6.3's tests pass; existing scenarios unchanged.

## 7. CreateHazardousEventUseCase / UpdateHazardousEventUseCase — one transaction per call

- [x] 7.1 Add `private readonly transactionRunner: ITransactionRunner` as a new constructor
      dependency to `CreateHazardousEventUseCase`, `UpdateHazardousEventUseCase`, and (Section 8)
      `DeleteHazardousEventUseCase` (design.md Decision 1 — Option A). Update their existing unit
      -test constructor fixtures in
      `CreateHazardousEvent.test.ts`/`UpdateHazardousEvent.test.ts`/`DeleteHazardousEvent.test.ts`
      with a `FakeTransactionRunner` whose `run(fn)` simply calls `fn(fakeTx)` directly (no real
      transaction semantics — matching this codebase's own inline-fake convention for every other
      port these use cases already fake, e.g. `FakeCausalChainRepository` in
      `CreateHazardousEvent.test.ts`; a reusable `NoOpTransactionRunner`/shared fake class is not
      needed, consistent with no other port in these test files having one either). Verify:
      `yarn tsc` clean; existing tests for all three still construct and pass with the added
      dependency faked.
- [x] 7.2 Write failing **unit** tests (fakes, `CreateHazardousEvent.test.ts`) asserting
      call-order/argument-threading only — `transactionRunner.run` is called exactly once;
      `IHazardousEventRepository.insert`, `IWorkflowRepository.insert`, and (when a cause is
      present) `ICausalChainRepository.saveEdge` are each called with the same `tx` the fake
      `run()` handed its callback; the structured log call happens only after `run()`'s own
      `Promise` resolves, not before. Verify: tests fail (no transaction wrapping yet).
- [x] 7.3 Wrap `CreateHazardousEventUseCase.execute()`'s three writes in one
      `this.transactionRunner.run(async (tx) => {...})` call, passing the resulting `tx` to
      `IHazardousEventRepository.insert`, `IWorkflowRepository.insert`, and (when a cause is
      present) `ICausalChainRepository.saveEdge`; move the structured log call to after `run()`
      resolves successfully. Verify: Task 7.2's tests pass; every other existing
      `CreateHazardousEvent.test.ts` scenario (order, cycle rejection, tenant isolation, concurrent
      creates) still passes unchanged.
- [x] 7.4 Write a failing **PGlite integration** test (new test in
      `tests/integration/db/queries/DrizzleHazardousEventRepository.test.ts` or a new,
      dedicated `tests/integration/domains/hazardous-events/CreateHazardousEventUseCase.test.ts`
      — the chosen path, matching this codebase's `tests/integration/domains/<domain>/` CA-domain
      test-location convention already used by `event-causality`/`validation-workflow`, not the
      bare `tests/integration/db/` root this file was first drafted at — implementer's choice
      — construct `CreateHazardousEventUseCase` with the real `DrizzleTransactionRunner` and real
      `DrizzleHazardousEventRepository`/`DrizzleWorkflowRepository`/`DrizzleCausalChainRepository`
      adapters, not fakes): a stubbed rejection on the second or third write (e.g. a
      `vi.spyOn(realWorkflowRepository, "insert").mockRejectedValueOnce(...)`) leaves **zero**
      rows persisted for the whole operation afterward — the `HazardousEvent` inserted earlier in
      the same call no longer exists, confirmed via a real, separate-connection read after the
      rejected call. This is the assertion a unit test with fakes cannot make meaningfully (a
      fake has no real rollback semantics to exercise) — this is why it moves to a real-DB
      integration test rather than staying in `CreateHazardousEvent.test.ts`. Verify: fails
      today (no transaction, so the first write survives).
- [x] 7.5 Write failing **unit** tests in `UpdateHazardousEvent.test.ts` (fakes) for:
      `transactionRunner.run` is called exactly once; `IHazardousEventRepository.update`,
      `ICausalChainRepository.replaceCauseEdge` (when present), and the delegated
      `RecordSpatialObservationUseCase.execute()` call (when present) are each called with the
      same `tx`; a rejection from the delegated call (e.g. `ConflictError`) propagates from
      `execute()` unmodified; the log call happens only after `run()` resolves. Verify: tests
      fail.
- [x] 7.6 Wrap `UpdateHazardousEventUseCase.execute()`'s writes — `IHazardousEventRepository.
    update`, `ICausalChainRepository.replaceCauseEdge` (when present), and the delegated
      `RecordSpatialObservationUseCase.execute()` call (when present) — in one
      `this.transactionRunner.run(async (tx) => {...})` call; widen
      `UpdateHazardousEventCommand.spatialObservation`'s `Omit<RecordSpatialObservationCommand,
    "tenantId" | "hazardousEventId">` to also omit `"tx"` (design.md Decision 7); pass `tx` to
      the delegated call via `command.spatialObservation`'s own new `tx` field (Section 9).
      Verify: Task 7.5's tests pass; every other existing `UpdateHazardousEvent.test.ts` scenario
      (merge semantics, cycle/temporal checks, optimistic locking, concurrent updates) still
      passes unchanged.
- [x] 7.7 Write a failing **PGlite integration** test (same new-file choice as Task 7.4) for
      `UpdateHazardousEventUseCase`, constructed with real adapters: a stubbed rejection from the
      delegated `RecordSpatialObservationUseCase.execute()` call (e.g. a duplicate-time
      `ConflictError`) leaves the `HazardousEvent`'s prior field values and causal link intact —
      confirmed via a real, separate-connection `findById` read after the rejected call, not the
      attempted new values. Verify: fails today (no transaction, so the field/causal-link changes
      survive).

## 8. DeleteHazardousEventUseCase — findById, then lock-count-delete once inside one transaction, catching a post-lock NotFoundError as a no-op

- [x] 8.1 Write failing **unit** tests (fakes) in `DeleteHazardousEvent.test.ts` for the
      `delete-hazardous-event` spec delta's new/modified scenarios: the existing, unlocked
      `findById` call still runs first and still throws `NotFoundError` unconditionally for a
      missing/foreign-tenant id, with `findByIdForUpdate` never reached (design.md Decision 8);
      once `findById` succeeds, `transactionRunner.run` is called exactly once, and inside it
      `findByIdForUpdate` is called with the same `tx`; all three dependent counts are called
      with that same `tx`; `deleteByEntity`/`delete` are both called with that same `tx`; a
      `deleteByEntity` rejection propagates unmodified with no log event. Verify: tests fail
      (method still calls plain `findById` only, no `findByIdForUpdate`, no transaction).
- [x] 8.2 Write a failing **unit** test (fakes) asserting the no-op catch specifically: when the
      fake `findById` resolves successfully but the fake `findByIdForUpdate` (invoked inside the
      fake `transactionRunner.run`'s callback) rejects with `NotFoundError`, `execute()` resolves
      without throwing, none of the three dependent counts or either delete call is made, and no
      log event is emitted; a `ValidationError` from the same `findByIdForUpdate` call, by
      contrast, still propagates unmodified (not caught). Verify: fails (no catch exists yet).
- [x] 8.3 Restructure `DeleteHazardousEventUseCase.execute()`: keep the existing, unlocked
      `IHazardousEventRepository.findById(command.id, command.tenantId)` call first, unchanged;
      then call `this.transactionRunner.run(async (tx) => {...})`, and inside it: call
      `findByIdForUpdate(command.id, command.tenantId, tx)` wrapped in a `try/catch` that, on
      `NotFoundError` specifically, returns a sentinel (e.g. `{ deleted: false }`) with no further
      calls — any other error rethrows; otherwise run the three dependent counts
      (`countReferencingDisasterEvents`, `countReferences`, `countEdgesTouching`) against that
      same `tx`, exactly once (design.md Decision 5 — no separate unlocked pre-check beyond the
      Task 8.1 `findById` existence check, which is not a dependent-count pre-check); on a
      blocking dependent, let `ConflictError` propagate (rolling back, releasing the lock, no
      writes); otherwise call `IWorkflowRepository.deleteByEntity(command.id, "HE", tx)` then
      `IHazardousEventRepository.delete(command.id, command.tenantId, tx)`, returning `{ deleted:
    true }`. After `run()` resolves, emit the structured log call only when the resolved
      sentinel is `{ deleted: true }`. Verify: Tasks 8.1 and 8.2's tests pass; every other
      existing `DeleteHazardousEvent.test.ts` scenario (dependent-shape assertions, tenant
      isolation) still passes unchanged.
- [x] 8.4 Write a failing **PGlite integration** test (new or extended integration test under
      `tests/integration/db/` or `tests/integration/domains/hazardous-events/`, implementer's
      choice, matching `5i`'s own precedent for real-PGlite concurrency tests, constructed with
      real adapters and the real `DrizzleTransactionRunner`): two concurrent `execute()` calls
      for the same zero-dependent event, both starting after both calls' own `findById` has
      already resolved — the first commits a successful delete and emits one log event; the
      second's `findByIdForUpdate` blocks on the lock, then (once the first commits) rejects with
      `NotFoundError`, caught internally, resolving without throwing and without a log event.
      Also add: a `disaster_event` row inserted and committed on a separate connection _before_
      the lock is acquired is counted and blocks the delete with `ConflictError`, exactly as
      today; a concurrent `INSERT` attempted _after_ the lock is acquired blocks until the
      transaction ends, then fails with a foreign-key violation once the row is actually gone
      (not a silent cascade); a sequential second `execute()` call, made only after the first
      call's transaction has already fully committed, still throws `NotFoundError` from its own
      `findById` call, with `findByIdForUpdate` never reached. Verify: tests fail (no lock
      exists yet).

## 9. RecordSpatialObservationUseCase — optional tx on the command

- [x] 9.1 Write failing tests in `RecordSpatialObservation.test.ts` for the
      `record-spatial-observation` spec delta: `command.tx`, when present, is passed as the
      trailing argument to `findById`, `findSpatialObservationByTime`, and
      `saveSpatialObservation`; `command.tx` absent leaves every call's trailing argument
      absent/`undefined`, matching today's behavior. Verify: tests fail (command has no `tx`
      field yet, or it isn't threaded).
- [x] 9.2 Add an optional `tx?: Tx` field to `RecordSpatialObservationCommand`; thread it through
      every `IHazardousEventRepository` call `execute()` makes. No constructor change — this use
      case does not open its own transaction. Verify: Task 9.1's tests pass; every other existing
      `RecordSpatialObservation.test.ts` scenario still passes unchanged.

## 10. Full-suite verification

- [x] 10.1 Run `yarn tsc` across the whole repo and confirm zero errors (closes out every call
      site touched in Sections 1-9).
- [x] 10.2 Run `npx prettier --check` scoped to every file touched in Sections 1-9 (do not run a
      bare `yarn format` — it reformats unrelated files in this repo) and fix any formatting
      drift with a scoped `npx prettier --write` on the same file list, previewing the diff first.
- [x] 10.3 Anti-pattern review: check the touched files against
      `.github/skills/anti-pattern-check/SKILL.md`; resolve any match found.
- [x] 10.4 SOLID review: invoke the `solid-reviewer` agent against the touched files. Since
      design.md Decision 1 chose Option A, this is not a first-of-its-kind infrastructure
      dependency in a use case — the review's specific focus is instead whether
      `ITransactionRunner` (`app/shared/persistence/`) and `DrizzleTransactionRunner.server.ts`
      (`app/infrastructure/`) are themselves correctly layered, and whether the three use cases'
      own constructors still depend only on application-layer ports. Resolve any violation found
      (fix-vs-defer is a joint call with the user — report findings with reasoning, don't
      unilaterally defer).
- [x] 10.5 Documentation review: one full-diff sweep (not per-round, by a fresh subagent)
      confirming every new comment explains WHY, not WHAT, and is as terse as it can be without
      losing meaning.
- [x] 10.6 Project-conventions review: check the touched files against
      `.github/copilot-instructions.md`. No violations found: `.server.ts` suffixing correct
      throughout (including the token file's own deliberate lack of the suffix, matching
      `WorkflowRepositoryToken.ts`'s precedent); `findByIdForUpdate` and every other touched
      method tenant-scopes via `countryAccountsId`/`tenantId`; no `drizzle-kit push`; no new
      `node:test` usage; all new tests live under `tests/` using Vitest; `yarn tsc`/
      `npx prettier --check` both clean project-wide.
- [x] 10.7 Test-quality-auditor: invoke `test-quality-auditor` scoped to every touched file under
      `app/domains/**`/`app/shared/**`/`app/infrastructure/**` containing real implementation
      logic — `DrizzleHazardousEventRepository.server.ts`, `DrizzleCausalChainRepository.server.ts`,
      `DrizzleEventCausalityRepository.server.ts`, `DrizzleWorkflowRepository.server.ts`,
      `DrizzleTransactionRunner.server.ts`, `CreateHazardousEvent.ts`, `UpdateHazardousEvent.ts`,
      `DeleteHazardousEvent.ts`, `RecordSpatialObservation.ts` (the port `.ts` files, including
      `ITransactionRunner.ts`, are type-only interfaces, excluded per the auditor's own scope).
      Resolve any real gap it finds. The 4 real gaps found in `UpdateHazardousEvent.ts` (message/
      field-name pinning) are fixed in its test file; the DEF-041 Babel/`implements`-clause
      instrumenter crash on the 5 adapter files is a pre-existing tooling limitation, noted in
      design.md's Risks section per the standing no-new-DEF-for-this rule, not a new register entry.
      Re-run confirmed: `UpdateHazardousEvent.ts` scores 97.96%, all 3 target locations killed,
      only the already-assessed equivalent mutant at line 313 survives (no action). A separate
      dry-run artifact ("87 mutants errored," tied to `DrizzleHazardousEventRepository.test.ts`'s
      own integration/DB-harness setup in that run, not this file's mutants) is noted for
      visibility only, not filed — `yarn test:run2` already confirms that suite passes for real.
- [x] 10.8 Code review: run `.github/skills/code-review/SKILL.md` in full, via a fresh subagent,
      against the complete diff for this change. All blocking (1-4) and non-blocking (5-11)
      findings resolved; findings 12/14/15 explicitly left as-is per user decision (dead barrier
      code, implicit-scheduling flakiness risk, minor variable shadowing — none load-bearing).
- [x] 10.9 Visual/UX parity review: **not applicable** — this change touches no
      `app/domains/*/presentation/` or `app/routes/` file. State this explicitly rather than
      silently skipping.
- [x] 10.10 Independent second-opinion review: invoke Claude Code's built-in `code-review` at
      `high` effort via a second, separate fresh subagent; resolve findings before archiving.
      Two findings, both resolved: (1) nitpick — `DrizzleHazardousEventRepository.test.ts` still
      had its own duplicate `seedSpecificHazard()` after the Finding-13 dedupe pass; fixed, now
      imports the shared helper like the other four files. (2) architectural — `RecordSpatialObservationUseCase`
      logged `spatial_observation.recorded` before its own `execute()` returned, which (when
      called from inside `UpdateHazardousEventUseCase`'s open `transactionRunner.run()`) was
      before the _outer_ transaction's own commit. User decision: Option A — the log call moved
      out of `RecordSpatialObservationUseCase` entirely into `UpdateHazardousEventUseCase` (its
      only current caller), emitted after `transactionRunner.run()` resolves, conditional on
      `command.spatialObservation` being present (design.md Decision 6 addendum, 2026-10-21).

## 11. Regression gate and deferred-items housekeeping

- [x] 11.1 Run `yarn test:run2` (full PGlite suite) and confirm it passes with no new failures.
      If any failure is suspected pre-existing, confirm this by running the same suite against
      the base branch (`feature/he-ca-phase5`) before this change's commits, per the
      no-assumptions-certainty rule — do not label a failure "pre-existing" without that
      comparison. Result: 2 failures in the full-suite run (`HttpServerBootstrap.test.ts`,
      `countryAccountService.clone.test.ts`), both confirmed non-regressions by running each in
      isolation (both pass standalone) — `HttpServerBootstrap.test.ts` failed identically in this
      change's own pre-implementation baseline run; `countryAccountService.clone.test.ts` matches
      the documented, previously-confirmed recurring full-suite-load flake. 1598 passed, 1 todo.
- [x] 11.2 Update `_docs/refactoring-plan/deferred-items-register.md`: delete the `DEF-026` and
      `DEF-033` rows (resolved by this change, per the register's own "delete the row for
      anything this change resolves" convention); narrow `DEF-031`'s row to remove its
      `DeleteHazardousEventUseCase` clause (re-read the row's current exact wording before
      editing it — it covers more than just `DeleteHazardousEventUseCase`, only that one clause
      is resolved here). Done — both rows deleted, DEF-031 narrowed.

## 12. Archive

- [x] 12.1 Confirm Task 0.1's, 0.2's, and 0.3's resolutions are recorded in design.md with the
      date decided (2026-10-21 — Decisions 1, 3, and 8). Confirmed — all three carry explicit
      "RESOLVED 2026-10-21" headers; Decision 9 (found during Task 9's own implementation, not
      Phase 0) also carries the same date.
- [ ] 12.2 Run `opsx:archive` on this change, on this branch
      (`feature/ca-persistence-unit-of-work`), before raising the PR.
