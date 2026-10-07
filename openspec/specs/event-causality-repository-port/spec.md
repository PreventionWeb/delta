# event-causality-repository-port Specification

## Purpose

Defines `IEventCausalityRepository`, the first port under the `app/domains/shared/` Shared
Kernel location (ADR-009): a single counting query over `event_causality`, the HE↔DE
causality-linking table that genuinely belongs to neither domain exclusively, split into
same-tenant and cross-tenant counts so a caller can shape what it discloses.

## Requirements

### Requirement: IEventCausalityRepository interface compiles as a valid, framework-free TypeScript port

The file `app/domains/shared/application/ports/IEventCausalityRepository.ts` MUST export an
interface named `IEventCausalityRepository`. It MUST declare exactly the one method described
below with the exact signature shown. The file MUST NOT import from any Drizzle, NestJS, or
Remix module.

#### Scenario: TypeScript compilation succeeds

- **GIVEN** `IEventCausalityRepository.ts` is written with the correct method signature and no
  disallowed imports
- **WHEN** `yarn tsc` is run
- **THEN** it MUST exit with code 0 and zero type errors referencing this file

### Requirement: countReferences counts event_causality rows referencing a hazardous event, split into same-tenant and cross-tenant counts

`countReferences(hazardousEventId: string, tenantId: string):
Promise<EventCausalityReferenceCounts>` MUST be declared on the interface, where
`EventCausalityReferenceCounts` is `{ sameTenantCount: number; crossTenantCount: number }`. It
MUST resolve counts of `event_causality` rows where `hazardousEventId` equals either the
`triggeringHazardousEventId` column or the `triggeredHazardousEventId` column, regardless of
direction. `sameTenantCount` MUST count only rows whose own other side (the entity on whichever
side `hazardousEventId` does not occupy) belongs to `tenantId`; `crossTenantCount` MUST count
the remaining matching rows, whose own other side belongs to a different tenant.

#### Scenario: Method signature is present with correct arity

- **GIVEN** the `IEventCausalityRepository` interface
- **WHEN** a TypeScript class declares `implements IEventCausalityRepository` and omits
  `tenantId` from `countReferences`
- **THEN** `yarn tsc` MUST report a type error

#### Scenario: A hazardous event with no event_causality rows resolves zero for both counts

- **GIVEN** an implementation of `IEventCausalityRepository` and a `hazardousEventId` with no
  matching `event_causality` row
- **WHEN** `countReferences(hazardousEventId, tenantId)` is called
- **THEN** it MUST resolve `{ sameTenantCount: 0, crossTenantCount: 0 }`

#### Scenario: A same-tenant reference, as the triggering party, is counted in sameTenantCount

- **GIVEN** an implementation of `IEventCausalityRepository` and an `event_causality` row
  whose `triggeringHazardousEventId` equals a given `hazardousEventId`, whose own other side
  belongs to `tenantId`
- **WHEN** `countReferences(hazardousEventId, tenantId)` is called
- **THEN** it MUST resolve `{ sameTenantCount: 1, crossTenantCount: 0 }`

#### Scenario: A same-tenant reference, as the triggered party, is counted in sameTenantCount

- **GIVEN** an implementation of `IEventCausalityRepository` and an `event_causality` row
  whose `triggeredHazardousEventId` equals a given `hazardousEventId`, whose own other side
  belongs to `tenantId`
- **WHEN** `countReferences(hazardousEventId, tenantId)` is called
- **THEN** it MUST resolve `{ sameTenantCount: 1, crossTenantCount: 0 }`

#### Scenario: A cross-tenant reference is counted in crossTenantCount, not sameTenantCount

- **GIVEN** an implementation of `IEventCausalityRepository` and an `event_causality` row
  referencing a given `hazardousEventId`, whose own other side belongs to a different tenant
  than `tenantId`
- **WHEN** `countReferences(hazardousEventId, tenantId)` is called
- **THEN** it MUST resolve `{ sameTenantCount: 0, crossTenantCount: 1 }` — the cross-tenant row
  MUST NOT be silently excluded or folded into `sameTenantCount`

#### Scenario: Same-tenant and cross-tenant rows are both present and counted independently

- **GIVEN** an implementation of `IEventCausalityRepository`, one same-tenant `event_causality`
  row and one cross-tenant `event_causality` row, both referencing a given `hazardousEventId`
- **WHEN** `countReferences(hazardousEventId, tenantId)` is called
- **THEN** it MUST resolve `{ sameTenantCount: 1, crossTenantCount: 1 }`

### Requirement: No method on IEventCausalityRepository accepts a raw Drizzle or infrastructure type

`countReferences`'s parameter and return types MUST be expressed only in terms of primitive
types and `EventCausalityReferenceCounts` — never a Drizzle `$inferSelect`/`$inferInsert` type
from `eventCausalityTable.ts`.

#### Scenario: No Drizzle type appears in the interface's method signature

- **GIVEN** the `IEventCausalityRepository` interface source
- **WHEN** its imports and method signature are inspected
- **THEN** none MUST reference `SelectEventCausality`, `InsertEventCausality`, or any other
  Drizzle-inferred type
