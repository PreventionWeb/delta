# record-spatial-observation Specification

## Purpose

Validates and persists one dated spatial reading (geometry + division footprint) against an
existing, tenant-owned `HazardousEvent`, enforcing that only one reading may exist per exact
`observationTime` unless the caller explicitly opts into replacing it.

## Requirements

### Requirement: `RecordSpatialObservationUseCase.execute()` requires the target event to exist under the caller's tenant

The use case MUST call `IHazardousEventRepository.findById(hazardousEventId, tenantId)` before
any spatial-observation read or write, and MUST propagate `NotFoundError` unmodified when the
event does not exist or exists only under a different tenant.

#### Scenario: Missing `hazardousEventId` is rejected

- **WHEN** `execute()` is called with a `hazardousEventId` that does not exist in any tenant
- **THEN** `NotFoundError` propagates and neither `findSpatialObservationByTime` nor
  `saveSpatialObservation` is ever called

#### Scenario: Cross-tenant `hazardousEventId` is rejected

- **WHEN** `execute()` is called with a `hazardousEventId` that exists only under a different
  `tenantId` than `command.tenantId`
- **THEN** `NotFoundError` propagates, identical to the missing-id case, and no
  spatial-observation read or write occurs

### Requirement: `observationTime` defaults to the current time when omitted, and is shape-validated before any conflict lookup

When `command.observationTime` is omitted, the use case MUST use a single internally-computed
current time. When `command.observationTime` is supplied, the use case MUST reject a value that
is not a valid `Date` instant with `ValidationError`, and MUST do so before calling
`findSpatialObservationByTime`.

#### Scenario: Omitted `observationTime` defaults to now

- **WHEN** `execute()` is called with no `observationTime`
- **THEN** the persisted observation's `observationTime` equals the time `execute()` was called,
  not a caller-supplied value

#### Scenario: A malformed `observationTime` is rejected before the conflict-lookup read

- **WHEN** `execute()` is called with an `observationTime` that is not a valid `Date` instant
  (a non-`Date` value, or a `Date` whose time is `NaN`)
- **THEN** `ValidationError` propagates and `findSpatialObservationByTime` is never called

### Requirement: A duplicate `observationTime` without `confirmReplace` is rejected as a conflict

The use case MUST look up any existing observation at the exact resolved `observationTime` via
`findSpatialObservationByTime`, and MUST call `SpatialObservation.assertNoConflictingObservationTime()`
against the result before constructing or persisting a new observation.

#### Scenario: No existing observation at this exact time succeeds

- **WHEN** `execute()` is called for an `observationTime` with no existing observation at that
  exact time
- **THEN** a new observation is constructed and persisted, and `confirmReplace` (present, absent,
  `true`, or `false`) has no effect on the outcome

#### Scenario: A duplicate `observationTime` without `confirmReplace` is rejected

- **WHEN** `execute()` is called for an `observationTime` that already has an observation
  recorded, and `command.confirmReplace` is omitted or `false`
- **THEN** `ConflictError` propagates and `saveSpatialObservation` is never called

#### Scenario: A duplicate `observationTime` with `confirmReplace: true` replaces the existing observation

- **WHEN** `execute()` is called for an `observationTime` that already has an observation
  recorded, with `command.confirmReplace: true`
- **THEN** the existing observation's `id` and `createdAt` are reused for the persisted
  replacement, `updatedAt` reflects the time `execute()` was called, and the replacement's
  `geometries`/`divisionIds`/`note` reflect exactly what this call supplied (not merged with the
  prior observation's values)

#### Scenario: A non-boolean `confirmReplace` is treated as absent

- **WHEN** `execute()` is called with a duplicate `observationTime` and a `confirmReplace` value
  that is present but not strictly `true`
- **THEN** the call is treated identically to `confirmReplace` being omitted, and `ConflictError`
  propagates

#### Scenario: A caller-omitted `note` on a replace does not carry the prior observation's note forward

- **WHEN** `execute()` replaces an existing observation (`confirmReplace: true`) and the command
  omits `note`
- **THEN** the persisted replacement's `note` is `null`, not the prior observation's `note`

#### Scenario: Concurrent callers racing for the same, previously-empty `observationTime` slot

- **WHEN** two callers, A and B, each independently call `execute()` for the same
  `hazardousEventId`/`observationTime` with no `confirmReplace`, and both observe no existing
  observation at that time before either has persisted one
- **THEN** the losing caller's `saveSpatialObservation` call MUST reject, and
  `RecordSpatialObservationUseCase.execute()` MUST propagate that rejection unmodified rather
  than treating it as success

### Requirement: `divisionIds` are validated against a tenant-scoped valid set before construction

The use case MUST resolve `validDivisionIds` via `IDivisionRepository.findValidDivisionIds()`
scoped to `command.tenantId`, and MUST let `SpatialObservation.create()`'s own membership check
reject any `divisionId` absent from that set.

#### Scenario: A cross-tenant or non-existent division id is rejected

- **WHEN** `execute()` is called with a `divisionIds` entry that does not exist, or exists only
  under a different tenant
- **THEN** `ValidationError` propagates and `saveSpatialObservation` is never called

#### Scenario: A same-tenant division id is accepted

- **WHEN** `execute()` is called with every `divisionIds` entry present under `command.tenantId`
- **THEN** the observation is constructed and persisted successfully

### Requirement: The persisted observation is returned as a `SpatialObservationDto`

`execute()` MUST return a `SpatialObservationDto` reflecting the values `saveSpatialObservation()`
resolved, with all `Date` fields serialised as ISO 8601 strings.

#### Scenario: Successful record returns a DTO with ISO date strings

- **WHEN** `execute()` completes successfully, whether a fresh insert or a replace
- **THEN** the returned value's `observationTime`, `createdAt`, and `updatedAt` are ISO 8601
  strings, and `id`/`hazardousEventId`/`note`/`geometries`/`divisionIds` reflect the persisted
  observation
