## ADDED Requirements

### Requirement: execute() accepts an optional tx and threads it to saveSpatialObservation, participating in a caller's own transaction

`RecordSpatialObservationCommand` gains an optional `tx?: Tx` field (`Tx` from
`app/db.server.ts`). When present, `RecordSpatialObservationUseCase.execute()` SHALL pass that
same `tx` through to every repository call it makes on `IHazardousEventRepository`
(`findById`, `findSpatialObservationByTime`, `saveSpatialObservation`), so the whole call
participates in the caller's own already-open transaction rather than opening or using a separate
connection. When `command.tx` is absent, `execute()`'s behavior is unchanged from before this
change — every repository call defaults to the module-level connection, exactly as today. This is
the first use case in this codebase whose own `execute()` method accepts a transaction handle on
its command, deliberately accepted (roadmap's already-decided point 4) since
`saveSpatialObservation()` remains an unimplemented `5e` stub regardless of this change.

#### Scenario: command.tx is threaded to every repository call this use case makes

- **GIVEN** an open transaction handle `tx`, and a `RecordSpatialObservationCommand` with
  `tx` set to that handle
- **WHEN** `execute(command)` is called
- **THEN** `IHazardousEventRepository.findById`, `findSpatialObservationByTime`, and
  `saveSpatialObservation` SHALL each be called with that same `tx` as their trailing argument

#### Scenario: command.tx absent leaves existing behavior unchanged

- **GIVEN** a `RecordSpatialObservationCommand` with `tx` omitted
- **WHEN** `execute(command)` is called
- **THEN** every repository call this use case makes SHALL be called with no `tx` argument (or
  `undefined`), matching this use case's existing behavior before this change

#### Scenario: A caller nesting this call inside its own open transaction sees a rejection roll back together with its own other writes

- **GIVEN** a caller (e.g. `UpdateHazardousEventUseCase`) has opened its own transaction `tx`,
  made an earlier write against it, and then calls
  `RecordSpatialObservationUseCase.execute({ ...command, tx })`
- **WHEN** the delegated call rejects (e.g. `ConflictError` from a duplicate-time conflict)
- **THEN** that rejection SHALL propagate to the caller unmodified
- **AND** the caller's own earlier write in the same `tx`, not yet committed, remains rollback-able
  by the caller exactly as any other write in that same transaction would be — this use case
  itself neither commits nor rolls back `tx` when `tx` is caller-supplied; only the caller that
  opened `tx` controls its commit/rollback
