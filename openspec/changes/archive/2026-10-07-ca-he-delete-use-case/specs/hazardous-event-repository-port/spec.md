## MODIFIED Requirements

### Requirement: IHazardousEventRepository interface compiles as a valid, framework-free TypeScript port

The file `app/domains/hazardous-events/application/ports/IHazardousEventRepository.ts` MUST export
an interface named `IHazardousEventRepository`. It MUST declare exactly the eight methods
described below with the exact signatures shown. The file MUST NOT import from any Drizzle,
NestJS, or Remix module — only from `app/domains/hazardous-events/domain/HazardousEvent.ts` and
shared value types.

#### Scenario: TypeScript compilation succeeds

- **GIVEN** `IHazardousEventRepository.ts` is written with the correct method signatures and no
  disallowed imports
- **WHEN** `yarn tsc` is run
- **THEN** it MUST exit with code 0 and zero type errors referencing this file

### Requirement: delete is tenant-scoped

`delete(id: string, tenantId: string): Promise<void>` MUST be declared on the interface,
deleting only a row matching both `id` and `tenantId`. When no row matches `id` and `tenantId`,
an implementation MUST resolve normally — it MUST NOT throw `NotFoundError` or any other error.

#### Scenario: Method signature is present with correct arity

- **GIVEN** the `IHazardousEventRepository` interface
- **WHEN** a TypeScript class declares `implements IHazardousEventRepository` and omits
  `tenantId` from `delete`
- **THEN** `yarn tsc` MUST report a type error

#### Scenario: Calling delete for an id with no matching row is a no-op, not an error

- **GIVEN** an implementation of `IHazardousEventRepository` and an `id`/`tenantId` pair with no
  matching `HazardousEvent`
- **WHEN** `delete(id, tenantId)` is called
- **THEN** it MUST resolve normally
- **AND** it MUST NOT throw or reject the `Promise`

## ADDED Requirements

### Requirement: countReferencingDisasterEvents counts Disaster Events referencing a hazardous event, not filtered by the referencing event's own tenant

`countReferencingDisasterEvents(hazardousEventId: string, tenantId: string): Promise<number>`
MUST be declared on the interface. It MUST resolve the count of `disaster_event` rows whose
`hazardousEventId` column equals the given `hazardousEventId`, regardless of which
`countryAccountsId` those `disaster_event` rows themselves belong to. `tenantId` scopes the
`HazardousEvent` side only — it MUST NOT be used to filter the counted `disaster_event` rows
by their own tenant, since a cross-tenant reference is still a real dependent that must be
counted, not silently excluded.

#### Scenario: Method signature is present with correct arity

- **GIVEN** the `IHazardousEventRepository` interface
- **WHEN** a TypeScript class declares `implements IHazardousEventRepository` and omits
  `tenantId` from `countReferencingDisasterEvents`
- **THEN** `yarn tsc` MUST report a type error

#### Scenario: Zero referencing Disaster Events resolves zero

- **GIVEN** an implementation of `IHazardousEventRepository` and a `hazardousEventId` with no
  `disaster_event` row referencing it
- **WHEN** `countReferencingDisasterEvents(hazardousEventId, tenantId)` is called
- **THEN** it MUST resolve `0`

#### Scenario: One or more referencing Disaster Events resolves their count

- **GIVEN** an implementation of `IHazardousEventRepository` and two `disaster_event` rows
  whose `hazardousEventId` column both equal a given `hazardousEventId`
- **WHEN** `countReferencingDisasterEvents(hazardousEventId, tenantId)` is called
- **THEN** it MUST resolve `2`

#### Scenario: A referencing Disaster Event belonging to a different tenant is still counted

- **GIVEN** an implementation of `IHazardousEventRepository` and one `disaster_event` row
  whose `hazardousEventId` column equals a given `hazardousEventId`, but whose own
  `countryAccountsId` differs from the `tenantId` argument passed to this method
- **WHEN** `countReferencingDisasterEvents(hazardousEventId, tenantId)` is called
- **THEN** it MUST resolve `1`, not `0` — the cross-tenant row MUST NOT be excluded
