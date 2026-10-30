## Context

See proposal.md - Why. This covers only what shapes the transaction-threading mechanism, the new
`findByIdForUpdate` method, and the correctness fixes found during this change's Phase 0 code
verification.

Ground truth read in full before writing this document:

- `app/db.server.ts` — `export type Tx = (Parameters<(typeof dr)["transaction"]>[0] extends (tx:
infer T) => any ? T : never) | Dr`, and `export type Dr = NodePgDatabase<typeof schema> &
{ $client: any }`. `Tx` is a thin union over Drizzle's own inferred transaction-callback
  parameter type and the module-level connection type — not a raw `$inferSelect`/`$inferInsert`
  row type.
- `app/domains/hazardous-events/infrastructure/DrizzleHazardousEventRepository.server.ts` —
  `insert()`/`update()`/`delete()` each already open `this.db.transaction(async (tx) => {...})`.
  `countReferencingDisasterEvents()` is a single `this.db.select()` statement, not wrapped in any
  transaction. `insert()`'s and `update()`'s own `loadChildCollections()` call runs with `this.db`
  **after** the `this.db.transaction(...)` promise has already resolved — correct only because,
  today, that transaction has fully committed by then. `update()`'s `diagnoseUpdateConflict()`
  (zero-row diagnostic re-read) also reads via `this.db`, outside the transaction.
- `app/domains/hazardous-events/infrastructure/DrizzleCausalChainRepository.server.ts` —
  `saveEdge()`/`replaceCauseEdge()` each already open `this.db.transaction(async (tx) => {...})`.
  `countEdgesTouching()` is a single raw-SQL `this.db.execute()` call, not wrapped in any
  transaction.
- `app/domains/validation-workflow/infrastructure/DrizzleWorkflowRepository.server.ts` —
  `insert()`, `update()`, and `deleteByEntity()` are each a single Drizzle statement (`this.db
.insert(...)`, `.update(...)`, `.delete(...)`) — none opens its own transaction.
  `update()`'s `diagnoseUpdateConflict()` reads via `this.db`.
- `app/domains/event-causality/infrastructure/DrizzleEventCausalityRepository.server.ts` —
  `countReferences()` is a single `this.db.select()` with joins — no transaction.
- `CreateHazardousEventUseCase`, `UpdateHazardousEventUseCase`, `DeleteHazardousEventUseCase`
  constructors (`CreateHazardousEvent.ts`, `UpdateHazardousEvent.ts`, `DeleteHazardousEvent.ts`) —
  each takes only `ILogger` plus application-layer ports (`IHazardousEventRepository`,
  `IWorkflowRepository`, `ICausalChainRepository`, `IEventCausalityRepository`,
  `IHazardTaxonomyRepository`, and, for Update, a `RecordSpatialObservationUseCase` pick-type).
  None holds a `Dr`/`Tx`-typed value or any Drizzle import.
- `openspec/specs/hazardous-event-repository-port/spec.md` and
  `openspec/specs/event-causality-repository-port/spec.md` — both carry a "No method accepts a
  raw Drizzle or infrastructure type" requirement with a "file MUST NOT import from any Drizzle...
  module" compilation requirement alongside it. `openspec/specs/causal-chain-repository-port/spec.md`
  and `openspec/specs/workflow-repository-port/spec.md` carry no such requirement.
- `openspec/specs/create-hazardous-event/spec.md`'s "A failure after the HazardousEvent is saved
  propagates unmodified, with no compensating delete" scenario and
  `openspec/specs/update-hazardous-event/spec.md`'s "A duplicate-time conflict from the delegated
  call propagates unmodified" scenario both explicitly assert today's non-atomic behavior (no
  rollback) as correct — both become false once this change ships; both have MODIFIED
  replacements in this change's own spec deltas.
- `app/domains/hazardous-events/application/use-cases/DeleteHazardousEvent.ts` — today calls
  `findById` (no lock) once, then `Promise.all`s the three dependent counts, then (if clean)
  `deleteByEntity` then `delete`, with **no transaction spanning any of it**.
- `openspec/changes/archive/2026-10-14-ca-he-causal-chain-taxonomy-repositories/` — `5i`'s own
  precedent for testing `pg_advisory_xact_lock` races against real PGlite: two concurrent
  `Promise`s invoking the real adapter method against the same in-memory PGlite instance, not a
  DB real/mocked split. Confirms PGlite supports the concurrency this change's own
  `findByIdForUpdate`/`FOR KEY SHARE` race and the advisory-lock-lifetime scenarios need.
- `app/domains/validation-workflow/infrastructure/WorkflowRepositoryToken.ts`,
  `NotificationPortToken.ts`, and `ValidationWorkflowModule.server.ts` — the codebase's own
  precedent for adding a new port + adapter + DI token: a `Symbol`-based
  `InjectionToken<TPort>` in its own small file ("kept out of the port file — domain types must
  not import `@nestjs/common`"), an adapter class decorated `@Injectable()`, and a `@Module`
  wiring `{ provide: TOKEN, useClass: Adapter }`. `app/domains/event-causality/infrastructure/
EventCausalityModule.server.ts` shows the same pattern for a port with "no use case of its own"
  — it provides and exports its token directly, for other domains to inject.
- `app/infrastructure/DrizzleProvider.server.ts` — the precedent for a _cross-cutting_,
  domain-agnostic Drizzle-backed provider (not owned by any one domain): `DRIZZLE_CLIENT`'s
  token lives in the same file as its `FactoryProvider`, under `app/infrastructure/`, not under
  any `app/domains/*/infrastructure/`. `app/shared/logging/ILogger.ts` is the matching precedent
  one layer up, for a cross-domain **port** (not an adapter): a framework-free interface used by
  every use case in the codebase, living under `app/shared/`, not under any one domain's
  `application/ports/`.
- `app/domains/hazardous-events/application/use-cases/CreateHazardousEvent.ts`,
  `UpdateHazardousEvent.ts`, `DeleteHazardousEvent.ts` — none is `@Injectable()`-decorated and
  none is referenced by any `@Module`, route, or DI wiring anywhere in the codebase today
  (confirmed by repo-wide grep). They are constructed directly, only inside their own test
  files, with plain fakes. There is no `HazardousEventsModule(.server)?.ts` file yet — the
  roadmap's own `5g` (`feature/ca-hazardous-events-module`, not yet started) is explicitly where
  that module is created and where all six Phase-4 use cases, including these three, are first
  wired into NestJS DI. This change does not create that module (see Decision 1 below).

## Goals / Non-Goals

**Goals:**

- Make `CreateHazardousEventUseCase`'s, `UpdateHazardousEventUseCase`'s, and
  `DeleteHazardousEventUseCase`'s own multi-write sequences atomic, closing `DEF-026`.
- Close `DEF-033`'s check-then-delete race via a real Postgres row lock, not just transaction
  wrapping (the roadmap's own already-decided point 3).
- Thread `tx?: Tx` through every port method these three use cases call, following the
  codebase's existing ~95-file convention — no novel abstraction at the port/adapter layer.
- Fix the executor-threading bug found during Phase 0 (Decision 2) so the mechanism is actually
  correct once nested inside an external transaction, not just correct in isolation.

**Non-Goals:**

- No change to any use case's write order or error-propagation contract beyond what atomicity
  itself implies (a failure now also undoes earlier writes in the same call; it does not
  reorder them or change which error surfaces).
- No change to `5e`'s own scope — `saveSpatialObservation()` stays an unimplemented stub; this
  change only widens the command/port signature that will eventually reach it.
- No change to `DEF-043`'s multi-edge-disjoint-cycle gap (per-edge advisory locking's own
  structural limitation) — out of scope, unaffected by nesting the existing lock in a bigger
  transaction.
- No change to `DEF-012`/`5n`'s cross-tenant causal-chain access control.

## Decisions

### Decision 1 (RESOLVED 2026-10-21 — Task 0.1): a use case obtains a transaction handle via a new `ITransactionRunner` port — Option A

**The problem:** none of the three use cases holds a Drizzle client today, and two of the four
ports this change touches explicitly forbid importing one (`hazardous-event-repository-port`,
`event-causality-repository-port`'s "MUST NOT import from any Drizzle... module"). The roadmap's
own intent text writes `dr.transaction(async (tx) => {...})` as if inside the use case, which
presumes a handle that doesn't exist. This was not one of the roadmap's five already-decided
points and was raised as blocking Task 0.1 in tasks.md. Two options were weighed:

**Option A — a new, thin transaction-runner port (CHOSEN).** `ITransactionRunner`
(application layer, framework-free: `run<T>(fn: (tx: Tx) => Promise<T>): Promise<T>`), with a
Drizzle-backed adapter injected into the three use cases. Preserves this codebase's existing
"use cases import no infrastructure" boundary (every other use case in this codebase, `4a`
through `4g` and all of Phase 5 so far, holds only ports, never a Drizzle/NestJS type) at the
cost of one new port + adapter + token — a new capability (proposal.md "New Capabilities").

- _For:_ no precedent broken; `Tx` itself never crosses into the application layer's own
  constructor dependencies, only into port method signatures (which already changes under this
  proposal regardless, per Decision 3 below).
- _Against:_ a new abstraction the roadmap's own "not a novel abstraction, apply the existing
  convention" framing explicitly wanted to avoid — though that framing was about the `tx?: Tx`
  threading mechanic at the port/adapter layer, not about how a use case opens the transaction in
  the first place, a question the roadmap's text never actually answers.

**Option B — inject the Drizzle client (`Dr`) directly into the three use cases (REJECTED).**
Same `@Inject(DRIZZLE_CLIENT) dr: Dr` pattern every `Drizzle*Repository.server.ts` adapter
already uses, added to the three use cases' constructors directly. Zero new ports or files;
matches the roadmap's own literal intent-text almost verbatim, and the cited legacy precedent
(`app/backend.server/models/event.ts:930`) also holds a Drizzle handle directly, not behind an
abstraction.

- _For:_ exactly what the roadmap's intent text describes; no new capability; smallest diff.
- _Against:_ breaks this codebase's own established Clean Architecture precedent — every use case
  built in this phase (`4a` through `4g`) has zero infrastructure imports; this would be the
  first exception, and a real Dependency-Inversion-boundary change, not a style nit.

**Decision, with reasoning (2026-10-21 user discussion):** Option A. The "use cases hold only
ports, never infrastructure" precedent — unbroken across every use case this codebase has built
so far — outweighs the roadmap's own intent-text wording. That wording (`dr.transaction(...)`
written as if inside the use case) is an informal sketch of the _mechanism_, not an
architecture-binding contract — the same category of informal-sketch-vs-binding-contract
correction already applied twice elsewhere within this same `5k` entry (the 2026-10-19 method-name
correction, and the 2026-10-19 widening to a user discussion in the first place). A one-off
exception for three use cases, taken now because option B was textually closer to the roadmap's
own sketch, would be a precedent every future multi-write use case could then cite — not a cost
worth taking to save one small file.

**What this adds:**

- **Port:** `app/shared/persistence/ITransactionRunner.ts` — `run<T>(fn: (tx: Tx) => Promise<T>):
Promise<T>`, importing `Tx` (type-only) from `~/db.server`. Placed under `app/shared/`, not
  under `app/domains/hazardous-events/application/ports/`, because it is a generic,
  business-free persistence concern with no hazardous-events-specific semantics — the same
  reasoning that already places `ILogger` (used by every domain's use cases) under
  `app/shared/logging/`, not under any one domain's own `application/ports/`. A future domain
  that needs its own multi-write unit-of-work (e.g. Disaster Events) reuses this same port
  without an unwanted dependency on the hazardous-events domain.
- **Adapter:** `app/infrastructure/DrizzleTransactionRunner.server.ts` — `@Injectable()`,
  constructor `@Inject(DRIZZLE_CLIENT) private readonly db: Dr`, `run(fn) { return
this.db.transaction(fn); }`. Placed under `app/infrastructure/`, mirroring
  `DrizzleProvider.server.ts`'s own placement for a cross-cutting, domain-agnostic Drizzle-backed
  provider — not under any domain's `infrastructure/` folder, since no single domain owns this
  concern (mirrors the `DrizzleProvider.server.ts`/`ILogger.ts` split described above: the port
  lives where cross-domain ports live, the Drizzle-backed adapter lives where cross-cutting
  Drizzle-backed adapters live).
- **Token:** `app/infrastructure/TransactionRunnerToken.ts` — `export const TRANSACTION_RUNNER:
InjectionToken<ITransactionRunner> = Symbol("TRANSACTION_RUNNER");`, in its own file, kept out
  of the port file for the same reason `WorkflowRepositoryToken.ts` is kept out of
  `IWorkflowRepository.ts` ("domain types must not import `@nestjs/common`") — mirroring that
  file's exact structure and comment.
- **Callback parameter type:** `Tx`, not a new, narrower type. `Tx` (`app/db.server.ts`) is
  already exactly "the inferred Drizzle transaction-callback parameter type, or `Dr`" — the same
  type every `tx?: Tx` port-method parameter this proposal touches already accepts. Reusing it
  means the value `run()`'s callback receives is directly passable, with no cast, to every
  `insert`/`update`/`delete`/`countX`/`findByIdForUpdate` call inside it. Introducing a second,
  narrower transaction-only type would still need to be assignable to `Tx` at every one of those
  call sites anyway, for no benefit. This is also what Decision 3's resolution (Task 0.2) assumes
  — `Tx` imported directly, not re-exported or aliased.

**No module wiring in this change.** No `HazardousEventsModule(.server)?.ts` exists yet (Context,
above) — the roadmap's own `5g` is where that module is created and where all six Phase-4 use
cases, including the three this change touches, are first wired into NestJS DI at all. This
change ships the port, the adapter, and the token only; `5g` is where `TRANSACTION_RUNNER` is
registered as a provider and injected into `CreateHazardousEventUseCase`/
`UpdateHazardousEventUseCase`/`DeleteHazardousEventUseCase` alongside their other dependencies,
the same way `5g`'s own intent text already plans to register `DrizzleHazardousEventRepository`,
`DrizzleCausalChainRepository`, etc. Until `5g` lands, these three use cases' constructors take
`ITransactionRunner` as a plain, directly-instantiated constructor parameter — exactly how they
already take every other dependency today (no `@Inject`, no `@Injectable()`, manually
constructed in tests with fakes). This proposal does not create `HazardousEventsModule` — doing
so is `5g`'s own, separately-scoped job.

### Decision 2 (fix, not an open question): every DB access reachable from a tx-accepting method must use the resolved executor, never a hard-coded `this.db`

**The bug, found during Phase 0:** `DrizzleHazardousEventRepository.insert()`/`update()` call
`loadChildCollections(ids)` — which always queries via `this.db` — **after** their own
`this.db.transaction(...)` (soon `(tx ?? this.db).transaction(...)`) callback has already
returned. `update()`'s `diagnoseUpdateConflict()` does the same for its zero-row diagnostic
re-read, as does `DrizzleWorkflowRepository.update()`'s own `diagnoseUpdateConflict()`. This is
harmless today, because when there is no external `tx`, the transaction that wrote the data has
fully committed by the time the follow-up read runs, and `this.db` (the module-level pooled
connection) can see it.

Once `tx` is supplied by an external caller, `(tx ?? this.db).transaction(...)` opens a
`SAVEPOINT` inside the caller's still-open outer transaction — not a real commit. A follow-up read
via `this.db` runs on a **different** pooled connection, which — correctly, per Postgres MVCC —
cannot see the outer transaction's uncommitted writes at all, savepoint or not. Against real
Postgres this leaves `insert()` called with an external `tx` returning an entity with empty child
collections, and `update()`'s zero-row diagnostic reaching a wrong conclusion.

**Confirmed empirically against PGlite** (temporarily reintroducing this exact bug and running the
Task 3.1 regression test, 2026-10-21): PGlite does not reproduce either of those symptoms. Instead,
the `this.db` read hangs indefinitely — the outer `dr.transaction(...)` the test opened never
resolves, because `this.db` and the already-open `tx` resolve to the same single underlying PGlite
connection, and PGlite serializes access to it. The test times out rather than failing its
assertion or passing silently. This is the one true description of the mechanism; the Risks
section's own entry on this topic is this same effect, not a separate one (see below).

**Fix:** every method reachable from a call that accepts `tx` — `loadChildCollections()` (both
call sites), `diagnoseUpdateConflict()` in both `DrizzleHazardousEventRepository` and
`DrizzleWorkflowRepository` — takes the resolved executor (`tx ?? this.db`) as an explicit
parameter instead of reading `this.db` directly, and is called with that same resolved executor,
consistently, whether or not an external `tx` was supplied. This is a correctness requirement
implied by Decision 1's own mechanism, not a new design choice with viable alternatives — it is
specified here so the implementer fixes it as part of this change rather than inheriting it as an
undiscovered bug. `insertChildCollections()` already takes `tx: Tx` as an explicit parameter and
needs no change.

### Decision 3 (RESOLVED 2026-10-21 — Task 0.2): the port purity requirement is narrowed, not removed, with an explicit, narrow carve-out — not an implicit argument

`hazardous-event-repository-port`'s, `event-causality-repository-port`'s, **and
`workflow-repository-port`'s** existing "MUST NOT import from any Drizzle... module"/"No method
accepts a raw Drizzle or infrastructure type" requirements were written to keep a port's
signatures and imports free of Drizzle's `$inferSelect`/`$inferInsert` row types — not to forbid
`Tx`, which is a thin union type (Context, above) describing "the module connection, or an
already-open transaction handle," carrying no table-shape information at all.

**Correction to this document's own earlier draft, found while finalizing Task 0.2:**
`causal-chain-repository-port` genuinely carries no such requirement (confirmed — its spec.md has
no "framework-free"/"no raw Drizzle type" requirement at all) and needs no carve-out.
**`workflow-repository-port` does carry this requirement** — this document previously claimed
otherwise; the port's own MODIFIED spec text already has an import-restriction requirement
("IWorkflowRepository interface compiles as a valid, framework-free TypeScript port"), and it
needs the same explicit carve-out as the other two, not the weaker "does not violate the spirit
of this import restriction" framing it had.

**Decided 2026-10-21:** every one of the three ports' purity requirements gets the same explicit,
narrow, checkable carve-out, not an implicit argument that `Tx` "doesn't technically count":

- The import-restriction sentence reads, verbatim in substance: "...MUST NOT import from any
  Drizzle, NestJS, or Remix module, except `app/db.server.ts`'s exported `Tx` type, imported as
  `import type { Tx } from "~/db.server"` — a type-only import, erased at compile time, so the
  port never loads `db.server.ts`'s runtime `dr` connection or pool." Naming `import type`
  explicitly, not just "the `Tx` type," is what makes the carve-out checkable by inspection
  rather than by trusting that a value import was never accidentally used — and it is what
  `ITransactionRunner.ts` itself must also do, since it is the one new port that genuinely needs
  `Tx` as a method's own parameter type, not just as a pass-through.
- The "no raw Drizzle/infrastructure type" sentence reads, verbatim in substance: "...never a
  Drizzle `$inferSelect`/`$inferInsert` row type from any table file — the optional trailing
  `tx?: Tx` parameter (required, not optional, on `findByIdForUpdate`) is explicitly permitted.
  This requirement has always been about row-shape types specifically — a type that carries a
  table's own column shape — not about an opaque connection or transaction handle, which `Tx` is."

Both requirements' MODIFIED specs (`hazardous-event-repository-port`, `event-causality-
repository-port`, `workflow-repository-port`) carry this exact narrow carve-out. `causal-chain-
repository-port` carries no such requirement and needs none.

### Decision 4: `findByIdForUpdate`'s row lock is required, not optional, and uses `FOR UPDATE`, not `FOR NO KEY UPDATE`

Every other method in this proposal makes `tx` optional, defaulting to the module-level
connection. `findByIdForUpdate(id: string, tenantId: string, tx: Tx): Promise<HazardousEvent>`
makes it **required** — a `SELECT ... FOR UPDATE` taken on a connection that isn't the caller's
own open transaction is released the instant that single statement finishes (Postgres wraps a
standalone statement in its own implicit transaction), providing no protection across the
counts-then-delete sequence this method exists to guard. A required `tx` makes that misuse a
compile-time error instead of a silent no-op lock.

`FOR UPDATE`, not the weaker `FOR NO KEY UPDATE`, because only `FOR UPDATE` conflicts with the
implicit `FOR KEY SHARE` a referencing `INSERT` (any of `disaster_event.hazardous_event_id`,
`event_causality.triggering/triggered_hazardous_event_id`,
`hazardous_event_causality.cause/effect_hazardous_event_id`) takes on the referenced row — this
is the specific lock-mode conflict `DEF-033`'s own mechanism (roadmap, point 3) depends on, and it
relies on this database's default `READ COMMITTED` isolation (unchanged by this proposal).

Tenant-scoped exactly like `findById` (`WHERE id = $id AND country_accounts_id = $tenantId`),
throwing `NotFoundError` on no match. It rehydrates the full entity via the existing
`loadChildCollections`/`rehydrate` path (using the same resolved-executor fix as Decision 2) —
not a lock-only existence probe — so a row that fails rehydration validation still throws
`ValidationError` exactly as `findById` does today; a row kept lockable-but-unreadable would be a
silent behavior change this proposal does not intend.

### Decision 5: `DeleteHazardousEventUseCase`'s lock-count-delete sequence runs once, inside one transaction — not a pre-check plus a recheck

The roadmap's own wording ("re-run the three dependent-count queries") could be read either as
(a) today's existing pre-transaction count check, left in place, plus a second recheck after the
lock, or (b) a single count pass that only ever runs under the lock, replacing today's
pre-transaction check outright. This proposal specifies (b): `execute()` opens one transaction,
calls `findByIdForUpdate()` (lock + existence + rehydration), then runs the three dependent counts
exactly once, under that same lock, inside that same transaction — there is no separate,
earlier, unlocked count pass to keep or remove. This is simpler, avoids doing the same query
twice on the common (no-dependents) path, and is the only reading under which the lock actually
does anything: a pre-transaction check followed by a locked recheck would make the first check
pure overhead, since only the locked recheck's result can be trusted against the race `DEF-033`
describes.

### Decision 6: logging happens after the transaction resolves

`create-hazardous-event`, `update-hazardous-event`, and `delete-hazardous-event`'s existing specs
each require exactly one log event on success and none on failure. Wrapping the write sequence in
a transaction does not change this: the `this.logger.info(...)` call in each `execute()` stays
positioned after the transaction's own `await` resolves successfully, so a rolled-back
transaction (which rejects the `await`) still short-circuits past the log call exactly as today.

**Addendum (RESOLVED 2026-10-21, Gate 10 finding):** `RecordSpatialObservationUseCase.execute()`
used to log `spatial_observation.recorded` itself, before returning. Once `UpdateHazardousEventUseCase`
began calling it from inside its own open `transactionRunner.run()`, that log fired before the
_outer_ transaction's own commit — a gap this Decision's own rule was meant to close but didn't
reach, since the rule only covered each use case's own top-level log call, not a delegated callee's.
`RecordSpatialObservationUseCase.execute()` no longer logs on its own; `UpdateHazardousEventUseCase`
— its only current caller — now emits `spatial_observation.recorded` itself, positioned after its
own `transactionRunner.run()` resolves, conditional on `command.spatialObservation` having been
present. When a future change gives `RecordSpatialObservationUseCase` a standalone caller (e.g.
`5e`), that change must add its own appropriately-positioned log then — this use case does not
reacquire one by default.

### Decision 7: `UpdateHazardousEventCommand.spatialObservation`'s `Omit<...>` gains `"tx"`

`RecordSpatialObservationCommand` gains an optional `tx` field (proposal.md). `
UpdateHazardousEventCommand.spatialObservation` is typed as `Omit<RecordSpatialObservationCommand,
"tenantId" | "hazardousEventId">` — without adding `"tx"` to that `Omit`, a caller of
`UpdateHazardousEventUseCase.execute()` could pass its own `tx` inside `command.spatialObservation`,
which `UpdateHazardousEventUseCase` would then silently ignore (it supplies its own `tx` when
calling `recordSpatialObservationUseCase.execute()`, per the same pattern it already uses for
`tenantId`/`hazardousEventId`). The widened `Omit` closes that confusing-but-harmless leak at the
type level, consistent with how `tenantId`/`hazardousEventId` are already excluded for the same
reason.

### Decision 8 (RESOLVED 2026-10-21 — Task 0.3): `DeleteHazardousEventUseCase` preserves today's idempotent-delete contract by catching `findByIdForUpdate`'s own `NotFoundError` — and keeps the pre-existing, unlocked `findById` check for genuinely missing/foreign-tenant ids

**The problem with the literal "replace `findById` with `findByIdForUpdate`" framing:** `findById`
and `findByIdForUpdate` throw the identical `NotFoundError` for three different causes a caller
cannot otherwise distinguish: (a) the id never existed, (b) the id exists but under a different
tenant, (c) the id existed moments ago but a concurrent transaction deleted and committed it
while this call was blocked waiting for the lock. Today, (a)/(b) throw `NotFoundError`
immediately and unconditionally (correct, and must stay correct) while (c) is a genuinely new
scenario this change's own locking introduces. If `execute()` caught every `NotFoundError` from a
single `findByIdForUpdate` call used as the _sole_ existence check (this document's own earlier
draft, and `tasks.md`'s own original Task 7.1 draft), a plain bad id would silently resolve as a
no-op instead of throwing — a real regression this change must not introduce, found while
finalizing Task 0.3, not part of the user's own decision text (which named the desired outcome —
preserve idempotent concurrent delete — without spelling out this specific collision).

**Resolution:** `execute()` keeps **two** existence checks, not one:

1. An unchanged, unlocked `IHazardousEventRepository.findById(command.id, command.tenantId)`
   call, in the same position it already runs today, **before** `ITransactionRunner.run()` is
   called at all. This is the check that throws `NotFoundError` for a genuinely missing or
   foreign-tenant id — unchanged from today, because nothing about this call's own behavior
   changes.
2. Inside the opened transaction, `IHazardousEventRepository.findByIdForUpdate(command.id,
command.tenantId, tx)` — acquiring the lock. Because step 1 has _already_ confirmed the row
   exists under this tenant, a `NotFoundError` from this specific call can only mean a concurrent
   transaction deleted and committed the row while this call waited for the lock (case (c) above,
   and only that case). `execute()` catches exactly `NotFoundError` from this one call, runs none
   of the three dependent counts, calls neither `deleteByEntity` nor `delete`, emits no log event,
   and resolves normally — preserving today's "two concurrent deletes of the same event both
   resolve without throwing" guarantee for any external caller. Any other error type from
   `findByIdForUpdate` (e.g. `ValidationError` from a failed rehydration) propagates unmodified.

This does not change `findByIdForUpdate()`'s own general-purpose contract (Decision 4) — it still
throws `NotFoundError` for every other port consumer, exactly as `findById` does; only this one
call site, inside this one use case, treats that specific, already-preceded-by-a-successful-
`findById`, specific `NotFoundError` as a no-op. A fully **sequential** second delete (the first
call's transaction has already committed before the second call's own `findById` even runs) is
unaffected and still throws `NotFoundError` from step 1, exactly as today — only two calls racing
concurrently, both past step 1 before either opens its transaction, reach the catch in step 2.

**Logging, decided:** the no-op path (step 2's caught `NotFoundError`) emits no log event — the
`hazardous_event.deleted` event would misdescribe a call that deleted nothing. This corrects the
original main spec's own pre-`5k` scenario, which logged once per concurrent call "the second of
which records a deletion that, against the real row, was actually a no-op" — a pre-existing
inaccuracy this change also fixes, not a new regression it introduces. See the
`delete-hazardous-event` spec delta's reworked "Two concurrent delete calls..." requirement
(verbatim header preserved from the main spec, per OpenSpec's header-based MODIFIED matching).

### Decision 9 (RESOLVED 2026-10-21 — found during Task 9 implementation): `findById` and `findSpatialObservationByTime` also gain optional `tx?: Tx`, not just `saveSpatialObservation`

**The problem:** the `record-spatial-observation` spec delta's own ADDED requirement (and
proposal.md's scenario text) requires `RecordSpatialObservationUseCase.execute()` to pass `tx` as
a trailing argument to `findById`, `findSpatialObservationByTime`, and `saveSpatialObservation` —
but this document's own earlier draft, and the `hazardous-event-repository-port` spec delta,
widened only `insert`/`update`/`delete`/`countReferencingDisasterEvents` (plus the new
`findByIdForUpdate`). `findById`/`findSpatialObservationByTime` had no `tx` parameter at all,
making the record-spatial-observation scenario a compile error as written — found during this
change's own implementation, not anticipated when Task 0's three questions were resolved.

**Why this can't be deferred:** `RecordSpatialObservationUseCase.execute()` is called by
`UpdateHazardousEventUseCase` from inside its own open transaction when a `spatialObservation` is
bundled (Section 7). If `findById`/`findSpatialObservationByTime` keep reading via `this.db` (the
module-level connection) while that outer transaction is still open, two problems follow: a
separate connection can't see the transaction's own uncommitted prior writes under `READ
COMMITTED`, and — confirmed empirically during this change's own PGlite test development — a
`this.db` query issued from inside a still-open transaction's own callback blocks behind that
transaction indefinitely (the same serialization behavior noted in the PGlite-lock-test Risk
below), a real deadlock risk once `5e` implements these methods for real, not just a style gap.

**Resolution:** `findById(id, tenantId, tx?)`, `findSpatialObservationByTime(hazardousEventId,
observationTime, tenantId, tx?)`, and `saveSpatialObservation(hazardousEventId, observation,
tenantId, tx?)` all gain an optional trailing `tx?: Tx`, matching the existing convention. The
real `findById` implementation threads `tx` through its own `loadChildCollections` read, the same
resolved-executor fix as Decision 2. `findSpatialObservationByTime`/`saveSpatialObservation`
remain `5e`'s own unimplemented stubs — this change only widens their signatures so `5e`'s future
implementer inherits a complete, already-correct contract rather than a gap. `findAll` and
`findCurrentSpatialObservation` are untouched — neither is called from inside an open transaction
by any use case this change touches.

## Risks / Trade-offs

- **[Risk]** `pg_advisory_xact_lock`'s lifetime extends to the whole outer transaction once nested
  (roadmap's already-decided point 2) → **Mitigation:** none needed — confirmed correct against
  Postgres 17 semantics; a more conservative hold time than today, not a correctness gap. Recorded
  here only because it is an observable change in lock duration a future reader of
  `DrizzleCausalChainRepository.server.ts` should not mistake for a regression.
- **[Risk]** `findByIdForUpdate`'s lock serializes every concurrent delete attempt against the
  same `hazardous_event` row, including two deletes that would both have found zero dependents →
  **Mitigation:** none needed structurally — this is the intended fix for `DEF-033`, and the
  serialization window is one row's lock, not a table-wide lock. The losing caller's outcome
  (no-op, via the Decision 8/Task 0.3 catch) is resolved and preserves today's idempotent-delete
  contract exactly — not a residual risk.
- **[Risk, avoided by Decision 1's choice]** Option B (rejected) would have made this the first
  use case in this codebase with a direct Drizzle/infrastructure constructor dependency, a real
  Dependency-Inversion-boundary break. Option A (chosen) avoids this entirely — the three use
  cases' own constructors gain only another application-layer port (`ITransactionRunner`),
  consistent with every other use case built in this phase. The residual item for
  `solid-reviewer` (tasks.md quality gate) is narrower: confirm `ITransactionRunner` itself and
  `DrizzleTransactionRunner.server.ts` are correctly layered (port in `app/shared/`, adapter in
  `app/infrastructure/`), not whether a use case should hold a Drizzle type at all.
- **[Risk]** A future change could reintroduce the Decision 2 executor bug (a hard-coded
  `this.db` read inside a method reachable from an already-open `tx`) → **Mitigation:** the Task
  3.1 regression test (`DrizzleHazardousEventRepository.test.ts`, "called with an
  externally-supplied, not-yet-committed tx...") already catches this class of regression against
  PGlite — confirmed empirically by temporarily reintroducing the bug and re-running that test
  (2026-10-21): it hangs and times out rather than passing silently, which is just as effective a
  signal as a clean assertion failure for catching the regression in CI. See Decision 2's own
  Context for the full empirical finding.
- **[Risk, found during implementation]** The PGlite "concurrent referencing insert blocks until
  the lock-holding transaction ends" tests (`findByIdForUpdate`, `DeleteHazardousEventUseCase`)
  cannot discriminate `FOR UPDATE` from no lock at all — confirmed empirically: an open
  `dr.transaction()` that takes no lock whatsoever still blocks a concurrent plain query the same
  way. This is the same limitation `DrizzleCausalChainRepository.realdb.test.ts` already documents
  for `pg_advisory_xact_lock` (PGlite serializes any plain query behind an open transaction
  regardless of lock mode) — not a new class of gap, the same one recurring at this proposal's own
  new lock. → **Mitigation:** none added in this change — the PGlite tests still prove the write
  correctly waits for the transaction to end (a real behavior the use case must have), just not
  that `FOR UPDATE` specifically is the mechanism; a `tests/integration-realdb/` counterpart
  mirroring that file's own pattern would be the genuine proof, matching the precedent, but is not
  in this proposal's own task list and was not added unilaterally (reported to the user instead).
- **[Risk, tooling limitation, not a code issue]** The `test-quality-auditor`'s mutation-testing
  pass could not run against any of this change's five Drizzle adapter files (each crashes
  `@stryker-mutator/instrumenter`'s bundled Babel generator with the same
  `TSExpressionWithTypeArguments` round-trip failure on the class's `implements` clause) →
  **Mitigation:** none needed — this is `DEF-041`, a pre-existing, environment-wide
  `@stryker-mutator/instrumenter`/`@babel/core` version mismatch already confirmed on an
  unrelated, already-merged file before this change started; not introduced by this change and
  not specific to it. No new deferred-register entry added for this, per the standing
  no-new-DEF-for-this-tooling-limitation rule — this note, plus `DEF-041`'s own existing row, is
  the complete record.

## Migration Plan

No schema change, no data migration. Deploy is a normal code release. No rollback concern beyond
the usual revert-the-PR path — no persisted state changes shape under this change.

## Open Questions

None. Task 0.1, 0.2, and 0.3 (tasks.md) were the three blocking items raised during this change's
own Phase 0 — all three are resolved per Decisions 1, 3, and 8 above, each dated 2026-10-21. A
fourth, narrower gap (Decision 9) surfaced during Task 9's own implementation, not Phase 0 — also
resolved 2026-10-21.
