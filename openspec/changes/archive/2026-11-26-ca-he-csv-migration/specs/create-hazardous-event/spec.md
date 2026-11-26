## ADDED Requirements

### Requirement: An optional caller transaction lets a batch caller own the commit

`CreateHazardousEventCommand` SHALL accept an optional `tx?: Tx`. When `tx` is given,
`CreateHazardousEventUseCase.execute` MUST run its whole write sequence through
`ITransactionRunner.run(fn, tx)`, which is a savepoint on the caller's transaction, instead of
opening its own top-level transaction. Every pre-write read SHALL also use `tx`, so the call
never needs a second connection while the caller's transaction is open (NOD-12). That covers
the taxonomy valid-id reads, the cause `findById`, `findReachableEdgesFrom` and
`hipCrosswalkPort.resolve`. Every other existing requirement still applies inside
that savepoint: the DRAFT workflow instance, the audit row, the HIP stamp, the optional cause and
the optional spatial observation. When `tx` is given, the use case SHALL still log
`hazardous_event.created` (and `spatial_observation.recorded`) once, as without `tx` (user
decision, 2026-11-25); the line is written at savepoint release, before the caller commits.
Without `tx`, behaviour and logging are unchanged.

#### Scenario: A create inside a caller transaction is undone by the caller's rollback

- **GIVEN** a caller transaction `outer`
- **WHEN** `execute({ ...validCommand, tx: outer })` resolves and the caller then rolls back
  `outer`
- **THEN** no `hazardous_event`, `event`, `workflow_instance` or `audit_logs` row for the new id
  exists

#### Scenario: A create with a cause inside a caller transaction does not deadlock on PGlite

- **GIVEN** a caller transaction `outer` on the PGlite test database and an existing event C
- **WHEN** `execute({ ...validCommand, causeId: C, tx: outer })` is called
- **THEN** it resolves, because every read ran on `outer`

#### Scenario: The success log is still written when a caller transaction is given

- **WHEN** `execute({ ...validCommand, tx: outer })` resolves
- **THEN** one `hazardous_event.created` line is logged for the new id

#### Scenario: Without a caller transaction nothing changes

- **WHEN** `execute(validCommand)` resolves with no `tx`
- **THEN** the event is committed and `hazardous_event.created` is logged once, as today

#### Scenario: Two callers creating the same apiImportId in separate transactions

- **GIVEN** two caller transactions in the same tenant, each about to create an event with
  `apiImportId = "RACE-1"`
- **WHEN** both call `execute` concurrently and then try to commit
- **THEN** exactly one commits
- **AND** the other's `execute`, or its commit, rejects with `ConflictError` ("HazardousEvent
  apiImportId already exists for this tenant")
