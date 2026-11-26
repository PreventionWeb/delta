## ADDED Requirements

### Requirement: An optional caller transaction lets a batch caller own the commit

`UpdateHazardousEventCommand` SHALL accept an optional `tx?: Tx`. When `tx` is given,
`UpdateHazardousEventUseCase.execute` MUST:

- run every pre-write read on `tx` (NOD-12): the existing event `findById`, the workflow lookup
  (`GetWorkflowInstanceByEntityUseCase` with `tx`), the taxonomy valid-id reads,
  `hipCrosswalkPort.resolve`, and the cause `findById` and `findReachableEdgesFrom`. That way an
  event written earlier in the same caller transaction is visible, and no second connection is
  needed;
- run its write sequence through `ITransactionRunner.run(fn, tx)`;
- still log `hazardous_event.updated` (and `spatial_observation.recorded`) once, as without `tx`
  (user decision, 2026-11-25), at savepoint release, before the caller commits.

Optimistic locking, the audit row, the HIP re-stamp and the attachment rules still apply. A
rejection still throws. It never returns an `ok: false` value that a caller could commit past
(the DEF-047 confirmation). Without `tx`, behaviour and logging are unchanged.

#### Scenario: An update inside a caller transaction is undone by the caller's rollback

- **GIVEN** an existing event E and a caller transaction `outer`
- **WHEN** `execute({ id: E, description: "new", tx: outer, ... })` resolves and the caller then
  rolls back `outer`
- **THEN** E's `description` and `updated_at` are unchanged
- **AND** no new audit row exists for E

#### Scenario: The success log is still written when a caller transaction is given

- **WHEN** `execute({ id: E, description: "new", tx: outer, ... })` resolves
- **THEN** one `hazardous_event.updated` line is logged for E

#### Scenario: A rejected update throws inside the caller transaction

- **GIVEN** a caller transaction `outer`
- **WHEN** `execute({ id: E, startDate: "2026-06-01", endDate: "2026-01-01", tx: outer, ... })`
  is called (the entity rejects a start after the end; a malformed date is caught earlier, by
  the CSV mapper)
- **THEN** it rejects with `ValidationError`
- **AND** `outer` is still usable for further statements

#### Scenario: Two caller transactions updating the same event

- **GIVEN** event E and two caller transactions that both read E before either writes
- **WHEN** both call `execute` for E concurrently
- **THEN** at most one update to E commits
- **AND** the other rejects with `ConcurrentModificationError` (the existing optimistic lock)
