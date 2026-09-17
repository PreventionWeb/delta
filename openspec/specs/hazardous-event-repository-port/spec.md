# hazardous-event-repository-port Specification

## Purpose

Defines the Dependency Inversion boundary between the application layer and a future persistence
adapter for the `HazardousEvent` aggregate, including its child spatial observations, with an
explicit tenant-scoping contract on every method that reads, writes, or deletes a specific row.

## Requirements

### Requirement: IHazardousEventRepository interface compiles as a valid, framework-free TypeScript port

The file `app/domains/hazardous-events/application/ports/IHazardousEventRepository.ts` MUST export
an interface named `IHazardousEventRepository`. It MUST declare exactly the seven methods
described below with the exact signatures shown. The file MUST NOT import from any Drizzle,
NestJS, or Remix module — only from `app/domains/hazardous-events/domain/HazardousEvent.ts` and
shared value types.

#### Scenario: TypeScript compilation succeeds

- **GIVEN** `IHazardousEventRepository.ts` is written with the correct method signatures and no
  disallowed imports
- **WHEN** `yarn tsc` is run
- **THEN** it MUST exit with code 0 and zero type errors referencing this file

### Requirement: findById is tenant-scoped and throws NotFoundError when absent

`findById(id: string, tenantId: string): Promise<HazardousEvent>` MUST be declared on the
interface. An implementation MUST throw `NotFoundError` (from `app/shared/errors/`) when no
`HazardousEvent` exists for the given `id` within `tenantId` — it MUST NOT resolve `null`.

#### Scenario: Method signature is present with correct arity

- **GIVEN** the `IHazardousEventRepository` interface
- **WHEN** a TypeScript class declares `implements IHazardousEventRepository` and omits `tenantId`
  from `findById`
- **THEN** `yarn tsc` MUST report a type error

### Requirement: findAll is tenant-scoped and paginated

`findAll(tenantId: string, pagination: Pagination): Promise<HazardousEvent[]>` MUST be declared on
the interface, scoping every returned entity to `tenantId`.

#### Scenario: Method signature is present with correct arity

- **GIVEN** the `IHazardousEventRepository` interface
- **WHEN** a TypeScript class declares `implements IHazardousEventRepository` and omits
  `pagination` from `findAll`
- **THEN** `yarn tsc` MUST report a type error

### Requirement: save persists a HazardousEvent via the entity's own tenant field

`save(entity: HazardousEvent): Promise<HazardousEvent>` MUST be declared on the interface. It MUST
NOT declare a separate `tenantId` parameter — the entity's own `tenantId` property carries tenancy.
An implementation MAY perform either an INSERT or an UPDATE depending on whether the entity already
exists.

#### Scenario: Method signature has no separate tenantId parameter

- **GIVEN** the `IHazardousEventRepository` interface's `save` method
- **WHEN** its parameter list is inspected
- **THEN** it MUST declare exactly one parameter, `entity: HazardousEvent`

### Requirement: delete is tenant-scoped

`delete(id: string, tenantId: string): Promise<void>` MUST be declared on the interface, deleting
only a row matching both `id` and `tenantId`.

#### Scenario: Method signature is present with correct arity

- **GIVEN** the `IHazardousEventRepository` interface
- **WHEN** a TypeScript class declares `implements IHazardousEventRepository` and omits `tenantId`
  from `delete`
- **THEN** `yarn tsc` MUST report a type error

### Requirement: findCurrentSpatialObservation returns the latest-by-observationTime reading or null

`findCurrentSpatialObservation(hazardousEventId: string, tenantId: string): Promise<SpatialObservationRecord | null>`
MUST be declared on the interface. It MUST resolve `null`, not throw, when the hazardous event has
no spatial observation recorded yet.

#### Scenario: No observations recorded resolves to null, not a thrown error

- **GIVEN** an implementation of `IHazardousEventRepository` and a `hazardousEventId` with no
  spatial observation rows
- **WHEN** `findCurrentSpatialObservation(hazardousEventId, tenantId)` is called
- **THEN** it MUST resolve to `null`
- **AND** it MUST NOT throw or reject the `Promise`

### Requirement: findSpatialObservationByTime performs an exact observationTime lookup

`findSpatialObservationByTime(hazardousEventId: string, observationTime: Date, tenantId: string): Promise<SpatialObservationRecord | null>`
MUST be declared on the interface, resolving `null` when no observation exists at exactly that
`observationTime`.

#### Scenario: Method signature accepts a Date and returns a nullable record

- **GIVEN** the `IHazardousEventRepository` interface
- **WHEN** a TypeScript class declares `implements IHazardousEventRepository` with
  `findSpatialObservationByTime`'s `observationTime` typed as `string` instead of `Date`
- **THEN** `yarn tsc` MUST report a type error

### Requirement: saveSpatialObservation is tenant-scoped by the parent hazardousEventId

`saveSpatialObservation(hazardousEventId: string, observation: SpatialObservationRecord, tenantId: string): Promise<SpatialObservationRecord>`
MUST be declared on the interface. `tenantId` exists specifically so an implementation can verify
`hazardousEventId` belongs to `tenantId` before writing any spatial row (DEF-005) — the port
signature carries this even though the underlying spatial tables have no `country_accounts_id`
column of their own.

#### Scenario: Method signature includes an explicit tenantId

- **GIVEN** the `IHazardousEventRepository` interface
- **WHEN** a TypeScript class declares `implements IHazardousEventRepository` and omits `tenantId`
  from `saveSpatialObservation`
- **THEN** `yarn tsc` MUST report a type error

### Requirement: Concurrent saveSpatialObservation calls at the same observationTime do not silently create two conflicting rows

Two callers that each resolve `findCurrentSpatialObservation` (or `findSpatialObservationByTime`)
to "no conflict" and then both call `saveSpatialObservation` for the same `hazardousEventId` and
`observationTime` before either write completes MUST NOT both succeed in creating two distinct
rows for that pair. The real `hazardous_event_spatial_observation` table's own
`UNIQUE(hazardous_event_id, observation_time)` constraint is the authoritative guard for this —
not a check this zero-DB-dependency port definition can itself perform. The exact contract for the
losing caller (thrown error vs. merged result vs. an explicit `confirmReplace` intent) is deferred
to Phase 3d's `SpatialObservation` design, matching how `3a`'s `IWorkflowRepository.save()` deferred
its own concurrent-write contract to its future adapter proposal.

#### Scenario: Two concurrent saves for the same hazardousEventId and observationTime do not both silently succeed as independent rows

- **GIVEN** no spatial observation exists yet for a given `hazardousEventId` and `observationTime`
- **WHEN** two callers each call `saveSpatialObservation` with that same `hazardousEventId` and
  `observationTime` concurrently, before either call resolves
- **THEN** at most one row for that `hazardousEventId` + `observationTime` pair MUST exist once
  both calls have resolved or rejected
- **AND** the exact behavior of the losing caller (error thrown, or a defined conflict result) is
  Phase 3d's design responsibility, not this port's

### Requirement: No method on IHazardousEventRepository accepts a raw Drizzle or infrastructure type

Every method's parameter and return types MUST be expressed in terms of `HazardousEvent`,
`SpatialObservationRecord`, primitive types, or `Pagination` — never a Drizzle `$inferSelect`/
`$inferInsert` type from any table file.

#### Scenario: No Drizzle type appears in the interface's method signatures

- **GIVEN** the `IHazardousEventRepository` interface source
- **WHEN** its imports and method signatures are inspected
- **THEN** none MUST reference `SelectHazardousEvent`, `InsertHazardousEvent`, or any other
  Drizzle-inferred type
