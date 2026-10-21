## MODIFIED Requirements

### Requirement: A bundled spatial reading is delegated, not duplicated

When `command.spatialObservation` is present, `execute()` SHALL record it against the
just-updated event by delegating to `RecordSpatialObservationUseCase`, supplying `tenantId`,
`hazardousEventId`, and this call's own transaction handle (see "The full write sequence runs as
one atomic transaction" below) from the already-validated update itself (never from
caller-supplied values inside `command.spatialObservation` — `UpdateHazardousEventCommand.
spatialObservation`'s type excludes `tenantId`, `hazardousEventId`, and `tx` for this reason).
Any error the delegated call raises SHALL propagate to `execute()`'s own caller unmodified.

#### Scenario: A bundled spatial reading is recorded against the updated event

- **GIVEN** `command.spatialObservation` is present with valid geometries and division ids
- **WHEN** `execute()` is called
- **THEN** a spatial observation SHALL be recorded against `command.id` under `command.tenantId`
- **AND** the recorded observation's `hazardousEventId`/`tenantId` SHALL match `command.id`/
  `command.tenantId` regardless of any value present inside `command.spatialObservation`

#### Scenario: No spatialObservation means no spatial-reading call at all

- **GIVEN** `command.spatialObservation` is absent
- **WHEN** `execute()` is called
- **THEN** no spatial-observation read or write SHALL occur

#### Scenario: A duplicate-time conflict from the delegated call propagates unmodified

- **GIVEN** `command.spatialObservation` targets an `observationTime` that already has a recorded
  reading, and `command.spatialObservation.confirmReplace` is absent or `false`
- **WHEN** `execute()` is called
- **THEN** it SHALL throw `ConflictError`
- **AND** the `HazardousEvent`'s own field and causal-link changes from this same call SHALL NOT
  be persisted — the whole transaction, including the already-attempted field/causal-link
  writes earlier in this same `execute()` call, rolls back together (supersedes this scenario's
  prior "already persisted, not rolled back" framing, `DEF-026`, closed by this change)

## ADDED Requirements

### Requirement: The full write sequence runs as one atomic transaction, including the delegated spatial-observation call

`execute()`'s writes — `IHazardousEventRepository.update`, the causal-link change (when present,
via `ICausalChainRepository.replaceCauseEdge`), and the delegated
`RecordSpatialObservationUseCase.execute()` call (when `command.spatialObservation` is present) —
SHALL run inside a single transaction, with the resulting transaction handle passed to every one
of those calls. A rejection from any of them SHALL roll back every write already made earlier in
that same `execute()` call. The structured log event on success SHALL be emitted only after the
transaction has resolved successfully; it SHALL NOT be emitted when the transaction rolls back.
This does not change `execute()`'s own write order (unchanged from today) or its
`ConcurrentModificationError` propagation contract (unchanged — see "A stale read is rejected via
optimistic locking, not silently overwritten," unaffected by this change).

#### Scenario: A successful call with a causal-link change and a bundled spatial reading commits all three writes and logs exactly once

- **GIVEN** a valid `UpdateHazardousEventCommand` with a new `causeId` and a
  `spatialObservation`
- **WHEN** `execute(command)` resolves successfully
- **THEN** the updated `HazardousEvent`, its new causal edge, and the spatial observation SHALL
  all be persisted
- **AND** exactly one structured log event SHALL be emitted, and only after all writes have
  committed

#### Scenario: A rolled-back transaction leaves the HazardousEvent's prior field values and causal link intact, regardless of which write failed

- **GIVEN** a valid `UpdateHazardousEventCommand` with a changed `description` and a new
  `causeId`, and a fake `ICausalChainRepository.replaceCauseEdge` stubbed to reject with a
  generic `Error`
- **WHEN** `execute(command)` is called
- **THEN** the call SHALL reject with that same `Error`
- **AND** a subsequent `findById` for the same event SHALL resolve the event's prior
  `description` and prior causal link, unchanged — not the attempted new values
- **AND** no log event SHALL be emitted
