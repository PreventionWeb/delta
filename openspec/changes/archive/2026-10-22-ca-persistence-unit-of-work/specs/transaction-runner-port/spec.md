## ADDED Requirements

### Requirement: ITransactionRunner interface compiles as a valid, framework-free TypeScript port

The file `app/shared/persistence/ITransactionRunner.ts` MUST export an interface named
`ITransactionRunner`. It MUST declare exactly the one method described below with the exact
signature shown. The file MUST NOT import from any Drizzle, NestJS, or Remix module, except
`app/db.server.ts`'s exported `Tx` type, imported as `import type { Tx } from "~/db.server"` — a
type-only import, erased at compile time, so this file never loads `db.server.ts`'s runtime `dr`
connection or pool. This is the same narrow, explicit carve-out `hazardous-event-repository-port`,
`event-causality-repository-port`, and `workflow-repository-port` each carry for the same reason
(design.md Decision 3) — and is especially load-bearing here, since this is the one port whose
own method signature genuinely needs `Tx`, not just a pass-through parameter.

This port is placed under `app/shared/`, not under any one domain's own
`application/ports/` folder, because it carries no business semantics specific to any domain —
the same placement already used for `ILogger` (`app/shared/logging/ILogger.ts`), a port every
domain's use cases depend on.

#### Scenario: TypeScript compilation succeeds

- **GIVEN** `ITransactionRunner.ts` is written with the correct method signature and no
  disallowed imports
- **WHEN** `yarn tsc` is run
- **THEN** it MUST exit with code 0 and zero type errors referencing this file

#### Scenario: No Drizzle runtime import appears in the interface source

- **GIVEN** the `ITransactionRunner` interface source
- **WHEN** its imports are inspected
- **THEN** the only import from `app/db.server.ts` MUST be a type-only import of `Tx`
- **AND** no import of `dr`, `Dr`, `initDB`, or any other runtime export of `app/db.server.ts`
  MUST be present

### Requirement: run() executes a callback inside a real transaction, committing its result or rolling back on rejection

`ITransactionRunner.run<T>(fn: (tx: Tx) => Promise<T>): Promise<T>` MUST be declared on the
interface. An implementation MUST open a real database transaction, invoke `fn` with that
transaction's own handle as `tx`, and:

- when `fn` resolves, commit the transaction and resolve `run()` with `fn`'s own resolved value,
  unmodified;
- when `fn` rejects, roll back the transaction — undoing every write `fn` made via `tx` — and
  reject `run()` with that same error, unmodified, not wrapped or replaced.

The `tx` handle passed to `fn` MUST be directly usable, with no cast, as the `tx` parameter of
every `IHazardousEventRepository`/`IWorkflowRepository`/`ICausalChainRepository`/
`IEventCausalityRepository` method this change threads `tx` through.

#### Scenario: A successful callback commits and resolves with its own return value

- **GIVEN** a callback `fn` that performs one or more writes via `tx` and resolves with a value
  `V`
- **WHEN** `run(fn)` is called
- **THEN** it MUST resolve with `V`
- **AND** every write `fn` made via `tx` MUST be visible to a read made after `run()` resolves,
  via a separate connection

#### Scenario: A rejecting callback rolls back every write it made, and the same error propagates unmodified

- **GIVEN** a callback `fn` that performs one write via `tx`, then rejects with an `Error` `E`
- **WHEN** `run(fn)` is called
- **THEN** it MUST reject with that same `E`, unmodified — not wrapped, not replaced
- **AND** the write `fn` made via `tx` before rejecting MUST NOT be visible to any read made
  after `run()` rejects — it MUST be rolled back, not partially committed

#### Scenario: The tx handle passed to fn is usable, with no cast, by every Tx-accepting port method

- **GIVEN** a callback `fn` that calls `IHazardousEventRepository.insert(entity, tx)` using the
  `tx` `run()` passed it
- **WHEN** `run(fn)` is called
- **THEN** the call MUST type-check with no cast and MUST execute against that same transaction
  — a subsequent read via that same `tx`, before `run()` resolves, MUST see the inserted entity

#### Scenario: Two concurrent run() calls use independent transactions — neither sees the other's uncommitted writes, and one's rollback does not affect the other's commit

- **GIVEN** two concurrent `run()` calls, each with its own callback performing an unrelated
  write, invoked before either resolves
- **WHEN** one callback resolves successfully and the other rejects
- **THEN** the resolving call's own write MUST commit, regardless of the other call's outcome
- **AND** the rejecting call's own write MUST roll back, regardless of the other call's outcome
- **AND** at no point does either call's own in-progress, uncommitted write become visible to a
  read made through the other call's own `tx`

### Requirement: DrizzleTransactionRunner fulfills ITransactionRunner via the module-level Drizzle client

`DrizzleTransactionRunner` (`app/infrastructure/DrizzleTransactionRunner.server.ts`), the first
adapter fulfilling `ITransactionRunner`, MUST be `@Injectable()` and MUST receive the
module-level Drizzle client via `@Inject(DRIZZLE_CLIENT) private readonly db: Dr`, matching every
other `Drizzle*Repository.server.ts` adapter's own constructor pattern
(`app/infrastructure/DrizzleProvider.server.ts`). `run(fn)` MUST delegate directly to
`this.db.transaction(fn)` — Drizzle's own `.transaction()` call already provides the commit/
rollback semantics this port's contract requires; this adapter MUST NOT re-implement them.

#### Scenario: run() delegates to the Drizzle client's own transaction method

- **GIVEN** a `DrizzleTransactionRunner` constructed with the module-level Drizzle client
- **WHEN** `run(fn)` is called
- **THEN** `fn` MUST be invoked with the real transaction handle `this.db.transaction()` itself
  passes to its own callback — not a wrapped or adapted value
