## MODIFIED Requirements

### Requirement: IEventCausalityRepository interface compiles as a valid, framework-free TypeScript port

The file `app/domains/event-causality/application/ports/IEventCausalityRepository.ts` MUST
export an interface named `IEventCausalityRepository`. It MUST declare exactly the one method
described below with the exact signature shown. The file MUST NOT import from any Drizzle,
NestJS, or Remix module.

#### Scenario: TypeScript compilation succeeds

- **GIVEN** `IEventCausalityRepository.ts` is written with the correct method signature and no
  disallowed imports
- **WHEN** `yarn tsc` is run
- **THEN** it MUST exit with code 0 and zero type errors referencing this file

## ADDED Requirements

### Requirement: DrizzleEventCausalityRepository resolves counts against event_causality, classifying the other side's tenant via a join

`DrizzleEventCausalityRepository`, the first adapter fulfilling `IEventCausalityRepository`,
MUST resolve `countReferences(hazardousEventId, tenantId)` against the real, pre-existing
`event_causality` table. For each matching row, the row's *other side* (the side that is not
`hazardousEventId`) MUST be classified by its own tenant — read via a join to
`hazardousEventTable` when that side's `entity_type` is `'HE'`, or `disasterEventTable` when
`'DE'` — compared against the given `tenantId`. A row matching `hazardousEventId` on both its
triggering and triggered side simultaneously MUST still contribute exactly one count, not two.

#### Scenario: Zero rows resolves zero for both counts

- **GIVEN** no `event_causality` row references `hazardousEventId`
- **WHEN** `countReferences(hazardousEventId, tenantId)` is called
- **THEN** it resolves `{ sameTenantCount: 0, crossTenantCount: 0 }`

#### Scenario: A same-tenant reference with the hazardous event as the triggering side

- **GIVEN** an `event_causality` row whose `triggering_hazardous_event_id` is
  `hazardousEventId`, and whose triggered side belongs to `tenantId`
- **WHEN** `countReferences(hazardousEventId, tenantId)` is called
- **THEN** it resolves `{ sameTenantCount: 1, crossTenantCount: 0 }`

#### Scenario: A same-tenant reference with the hazardous event as the triggered side

- **GIVEN** an `event_causality` row whose `triggered_hazardous_event_id` is
  `hazardousEventId`, and whose triggering side belongs to `tenantId`
- **WHEN** `countReferences(hazardousEventId, tenantId)` is called
- **THEN** it resolves `{ sameTenantCount: 1, crossTenantCount: 0 }`

#### Scenario: A cross-tenant reference is counted, not excluded

- **GIVEN** an `event_causality` row referencing `hazardousEventId`, whose other side belongs
  to a different tenant than `tenantId`
- **WHEN** `countReferences(hazardousEventId, tenantId)` is called
- **THEN** it resolves `{ sameTenantCount: 0, crossTenantCount: 1 }`

#### Scenario: A same-tenant row and a cross-tenant row are both present

- **GIVEN** one `event_causality` row whose other side belongs to `tenantId`, and a second,
  distinct row whose other side belongs to a different tenant, both referencing
  `hazardousEventId`
- **WHEN** `countReferences(hazardousEventId, tenantId)` is called
- **THEN** it resolves `{ sameTenantCount: 1, crossTenantCount: 1 }`

#### Scenario: A row referencing the hazardous event on both its triggering and triggered side counts once

- **GIVEN** a single `event_causality` row whose `triggering_hazardous_event_id` and
  `triggered_hazardous_event_id` are both `hazardousEventId` (the same hazardous event on both
  sides — not blocked by any constraint on this table)
- **WHEN** `countReferences(hazardousEventId, tenantId)` is called
- **THEN** that row contributes exactly one count total, classified the same way any other row
  is classified — by comparing its "other side" (here, `hazardousEventId` itself) to `tenantId`
  — never zero counts and never two

#### Scenario: A row whose other side has no recorded tenant is still counted, never silently dropped

- **GIVEN** an `event_causality` row referencing `hazardousEventId`, whose other side resolves
  to a `hazardousEventTable` or `disasterEventTable` row whose own tenant column is `NULL`
- **WHEN** `countReferences(hazardousEventId, tenantId)` is called
- **THEN** the row is counted in exactly one of `sameTenantCount`/`crossTenantCount` — per the
  existing contract's own wording, `crossTenantCount` counts every matching row not already
  counted in `sameTenantCount` ("the remaining matching rows"), so a `NULL` other-side tenant,
  which can never equal `tenantId`, resolves to `crossTenantCount` — **never** excluded from
  both counts

#### Scenario: Both directions are counted — not just one

- **GIVEN** one `event_causality` row referencing `hazardousEventId` as the triggering side, and
  a second, distinct row referencing it as the triggered side
- **WHEN** `countReferences(hazardousEventId, tenantId)` is called
- **THEN** both rows are reflected in the result — neither direction is silently skipped

### Requirement: EventCausalityModule exposes the repository port directly, without a use case in front of it

`EventCausalityModule` MUST register `DrizzleEventCausalityRepository` under the
`EVENT_CAUSALITY_REPOSITORY` injection token and export that token from the module, so any other
NestJS module that imports `EventCausalityModule` can inject `IEventCausalityRepository`
directly — this context has no use case of its own to hide the port behind.

#### Scenario: A second module injects the repository port directly through NestJS DI

- **GIVEN** a NestJS module that imports `EventCausalityModule` and declares a provider
  depending on `EVENT_CAUSALITY_REPOSITORY`
- **WHEN** that module is compiled
- **THEN** compilation succeeds and the dependent provider resolves an instance of
  `IEventCausalityRepository`
- **AND** compilation would instead fail with a dependency-resolution error if
  `EVENT_CAUSALITY_REPOSITORY` were not present in `EventCausalityModule`'s own `exports` array
