# update-hazardous-event Specification

## Purpose

Merges caller-supplied field changes into an existing, tenant-owned `HazardousEvent`, re-validates
a changed causal link (cycle and temporal order) before persisting, and optionally records a
bundled spatial reading against the same event in the same submission.

## Requirements

### Requirement: Update an existing event's fields via a partial-patch command

`UpdateHazardousEventUseCase.execute(command)` SHALL load the existing `HazardousEvent` identified
by `command.id` within `command.tenantId`, apply only the fields present in `command` (a field
absent from `command`, i.e. `undefined`, MUST leave the existing entity's stored value for that
field unchanged), re-validate the resulting merged entity, persist it, and resolve a
`HazardousEventDto` reflecting the merged, persisted state.

An explicit `null` on a nullable field (`hazardousEventStatus`, `specificHazardLocalName`,
`specificHazardNationalName`) MUST set that field to `null`, distinct from the field being absent
from `command` entirely.

A present collection field (`hazardDriverIds`, `attachments`, `fieldValues`,
`customFieldValues`) MUST fully replace the existing entity's stored collection for that field —
not merge per-element against it. A collection field absent from `command` MUST leave the
existing entity's stored collection for that field entirely unchanged.

#### Scenario: A present scalar field replaces the existing value

- **GIVEN** an existing `HazardousEvent` with `description: "Original"`
- **WHEN** `execute()` is called with `command.description: "Updated"` and every other field
  absent
- **THEN** the resolved `HazardousEventDto.description` SHALL equal `"Updated"`
- **AND** every other field SHALL equal the existing entity's stored value, unchanged

#### Scenario: An absent scalar field leaves the existing value unchanged

- **GIVEN** an existing `HazardousEvent` with `magnitude: "5.2"`
- **WHEN** `execute()` is called with `command.magnitude` absent (not present on the command
  object) and at least one other field present
- **THEN** the resolved `HazardousEventDto.magnitude` SHALL equal `"5.2"`, unchanged

#### Scenario: An explicit null on a nullable field sets it to null, distinct from absence

- **GIVEN** an existing `HazardousEvent` with `specificHazardLocalName: "Local name"`
- **WHEN** `execute()` is called with `command.specificHazardLocalName: null`
- **THEN** the resolved `HazardousEventDto.specificHazardLocalName` SHALL be `null`

#### Scenario: A present collection field fully replaces the existing collection

- **GIVEN** an existing `HazardousEvent` with `hazardDriverIds: ["driver-a", "driver-b"]`
- **WHEN** `execute()` is called with `command.hazardDriverIds: ["driver-c"]`, where `"driver-c"`
  is present in the tenant's valid hazard driver set
- **THEN** the resolved `HazardousEventDto.hazardDriverIds` SHALL equal exactly `["driver-c"]`,
  not a union with the prior collection

#### Scenario: A carried-over collection id is re-validated, not assumed still valid

- **GIVEN** an existing `HazardousEvent` with `hazardDriverIds: ["driver-a"]`, and `"driver-a"` has
  since been removed from the tenant's valid hazard driver set
- **WHEN** `execute()` is called with `command.hazardDriverIds` absent (carrying the existing
  collection over unchanged)
- **THEN** `execute()` SHALL throw `ValidationError`, the same as if `"driver-a"` had been newly
  submitted and found invalid

#### Scenario: Failure — the event does not exist under the caller's tenant

- **GIVEN** `command.id` does not correspond to any `HazardousEvent` within `command.tenantId`
  (either the id does not exist at all, or it exists under a different tenant)
- **WHEN** `execute()` is called
- **THEN** it SHALL throw `NotFoundError`
- **AND** no write of any kind SHALL occur

#### Scenario: A missing or non-string actingUserId is rejected before any write

- **GIVEN** a command whose `actingUserId` is an empty string, or a non-string value reachable only
  by a caller bypassing the compile-time type
- **WHEN** `execute()` is called
- **THEN** it SHALL throw `ValidationError`
- **AND** no write of any kind SHALL occur

### Requirement: A changed causal link is re-validated for cycles and temporal order before persisting

When `command.causeId` resolves to a non-empty string (a new or changed cause), `execute()` SHALL,
before persisting any change: verify the referenced cause event exists within `command.tenantId`;
reject the change if linking it would close a cycle in the existing causal graph; and reject the
change if the cause event's `startDate` is later than the (merged) updated event's own `startDate`.

#### Scenario: A cross-tenant or non-existent causeId is rejected

- **GIVEN** `command.causeId` does not correspond to any `HazardousEvent` within `command.tenantId`
- **WHEN** `execute()` is called
- **THEN** it SHALL throw `NotFoundError`
- **AND** no write of any kind SHALL occur

#### Scenario: A causeId that would close a cycle is rejected

- **GIVEN** a stored causal chain where the event being updated is already reachable, through one
  or more existing edges, as a cause of `command.causeId` (so linking `command.causeId` as this
  event's own cause would close a cycle)
- **WHEN** `execute()` is called with that `command.causeId`
- **THEN** it SHALL throw `ConflictError`
- **AND** no write of any kind SHALL occur

#### Scenario: A causeId whose startDate is later than the updated event's startDate is rejected

- **GIVEN** the referenced cause event's `startDate` is later than the (merged) updated event's
  own `startDate`, both in valid zero-padded format
- **WHEN** `execute()` is called with that `command.causeId`
- **THEN** it SHALL throw `ConflictError`
- **AND** no write of any kind SHALL occur

#### Scenario: A causeId whose startDate equals the updated event's startDate is accepted

- **GIVEN** the referenced cause event's `startDate` exactly equals the (merged) updated event's
  own `startDate`
- **WHEN** `execute()` is called with that `command.causeId`
- **THEN** `execute()` SHALL NOT throw for this reason, and the causal link SHALL be persisted

#### Scenario: A malformed startDate on either side skips the temporal check without blocking

- **GIVEN** the referenced cause event's `startDate`, the updated event's own `startDate`, or both,
  do not match the zero-padded `YYYY`/`YYYY-MM`/`YYYY-MM-DD` format
- **WHEN** `execute()` is called with a `command.causeId` that passes the cycle check
- **THEN** `execute()` SHALL NOT throw for the temporal reason, and the causal link SHALL be
  persisted (subject to every other check)

#### Scenario: An unchanged event's own startDate edit does not re-trigger checks against an omitted causeId

- **GIVEN** an existing `HazardousEvent` that already has a stored `causeId`
- **WHEN** `execute()` is called with `command.startDate` present (changed) and `command.causeId`
  absent
- **THEN** `execute()` SHALL NOT perform the cycle or temporal check, and SHALL NOT alter the
  existing causal link

### Requirement: An omitted causeId leaves the existing causal link untouched; null or empty string clears it

`execute()` SHALL treat `command.causeId` as a tri-state field: absent (`undefined`) MUST leave
any existing causal link for this event completely unchanged (no read or write against the causal
chain of any kind); `null` or `""` MUST remove any existing causal link for this event with no
replacement; a non-empty string MUST replace any existing causal link with one from the given
cause to this event.

#### Scenario: Omitted causeId performs no causal-chain read or write

- **GIVEN** an existing `HazardousEvent` with an existing causal link
- **WHEN** `execute()` is called with `command.causeId` absent
- **THEN** the existing causal link SHALL remain exactly as it was
- **AND** no cycle check, temporal check, or causal-chain write SHALL occur

#### Scenario: Explicit null clears an existing causal link with no replacement

- **GIVEN** an existing `HazardousEvent` with an existing causal link to some cause event
- **WHEN** `execute()` is called with `command.causeId: null`
- **THEN** the existing causal link SHALL be removed
- **AND** no new causal link SHALL be created

#### Scenario: Empty string clears an existing causal link, same as null

- **GIVEN** an existing `HazardousEvent` with an existing causal link to some cause event
- **WHEN** `execute()` is called with `command.causeId: ""`
- **THEN** the existing causal link SHALL be removed
- **AND** no new causal link SHALL be created

#### Scenario: A non-empty causeId replaces any existing causal link

- **GIVEN** an existing `HazardousEvent` with an existing causal link to cause event `X`
- **WHEN** `execute()` is called with `command.causeId` set to a different, valid cause event `Y`
- **THEN** the event's causal link SHALL reference `Y`, and SHALL NOT also reference `X`

### Requirement: A bundled spatial reading is delegated, not duplicated

When `command.spatialObservation` is present, `execute()` SHALL record it against the
just-updated event by delegating to `RecordSpatialObservationUseCase`, supplying `tenantId` and
`hazardousEventId` from the already-validated update itself (never from caller-supplied values
inside `command.spatialObservation`). Any error the delegated call raises SHALL propagate to
`execute()`'s own caller unmodified.

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
- **AND** the `HazardousEvent`'s own field and causal-link changes from this same call SHALL
  already be persisted (not rolled back)

### Requirement: Concurrent callers racing to set each other's causeId can jointly write a cycle

Two concurrent `execute()` calls, each reading the causal graph before the other's write resolves,
MAY each independently pass the cycle check against a stale snapshot and both persist, resulting
in a real cycle written to storage. This is a known, accepted limitation (design.md Risks), not
prevented by this requirement — the system SHALL NOT silently and incorrectly report "no cycle"
to either caller; each caller's own cycle check SHALL still evaluate correctly against the
snapshot it read.

#### Scenario: Two concurrent updates each setting the other as their cause can both succeed

- **GIVEN** two existing events `A` and `B` with no existing causal link between them
- **WHEN** two concurrent `execute()` calls are made — one setting `A`'s `causeId` to `B`, the
  other setting `B`'s `causeId` to `A` — such that each call's cycle check reads the causal graph
  before the other call's write resolves
- **THEN** each individual call's own cycle check SHALL evaluate correctly against the snapshot it
  read (neither call is itself buggy in isolation)
- **AND** the two calls' writes, taken together, MAY result in a stored cycle (`A` causes `B` and
  `B` causes `A`) — a documented, accepted race (design.md Risks), not silently prevented by this
  change
