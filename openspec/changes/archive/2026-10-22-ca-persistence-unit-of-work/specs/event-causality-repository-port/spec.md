## MODIFIED Requirements

### Requirement: IEventCausalityRepository interface compiles as a valid, framework-free TypeScript port

The file `app/domains/event-causality/application/ports/IEventCausalityRepository.ts` MUST
export an interface named `IEventCausalityRepository`. It MUST declare exactly the one method
described below with the exact signature shown. The file MUST NOT import from any Drizzle,
NestJS, or Remix module, **except** `app/db.server.ts`'s exported `Tx` type, imported as
`import type { Tx } from "~/db.server"` — a type-only import, erased at compile time, so this
file never loads `db.server.ts`'s runtime `dr` connection or pool. `Tx` carries no table-shape
information, unlike a Drizzle `$inferSelect`/`$inferInsert` row type — the distinction this
exception exists to preserve (design.md Decision 3).

#### Scenario: TypeScript compilation succeeds

- **GIVEN** `IEventCausalityRepository.ts` is written with the correct method signature and no
  disallowed imports
- **WHEN** `yarn tsc` is run
- **THEN** it MUST exit with code 0 and zero type errors referencing this file

### Requirement: countReferences counts event_causality rows referencing a hazardous event, split into same-tenant and cross-tenant counts

`countReferences(hazardousEventId: string, tenantId: string, tx?: Tx):
Promise<EventCausalityReferenceCounts>` MUST be declared on the interface, where
`EventCausalityReferenceCounts` is `{ sameTenantCount: number; crossTenantCount: number }`. It
MUST resolve counts of `event_causality` rows where `hazardousEventId` equals either the
`triggeringHazardousEventId` column or the `triggeredHazardousEventId` column, regardless of
direction. `sameTenantCount` MUST count only rows whose own other side (the entity on whichever
side `hazardousEventId` does not occupy) belongs to `tenantId`; `crossTenantCount` MUST count
the remaining matching rows, whose own other side belongs to a different tenant. When `tx` is
supplied, the count query MUST execute against that same `tx`, not a separate connection, so a
caller nesting this call inside its own open transaction observes that transaction's own
uncommitted writes.

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

#### Scenario: When called under a caller-supplied tx, the counts reflect that transaction's own uncommitted writes

- **GIVEN** an open transaction handle `tx` under which an `event_causality` row referencing
  `hazardousEventId` has been inserted but not yet committed
- **WHEN** `countReferences(hazardousEventId, tenantId, tx)` is called
- **THEN** it MUST resolve counts that include that uncommitted row — this method MUST NOT use
  a separate connection when `tx` is supplied

### Requirement: No method on IEventCausalityRepository accepts a raw Drizzle or infrastructure type

`countReferences`'s parameter and return types MUST be expressed only in terms of primitive
types, `EventCausalityReferenceCounts`, or `Tx` — never a Drizzle `$inferSelect`/`$inferInsert`
row type from `eventCausalityTable.ts`. This requirement has always been about row-shape types
specifically, not about an opaque connection or transaction handle. The optional trailing
`tx?: Tx` parameter is explicitly permitted on that basis (design.md Decision 3).

#### Scenario: No Drizzle type appears in the interface's method signature

- **GIVEN** the `IEventCausalityRepository` interface source
- **WHEN** its imports and method signature are inspected
- **THEN** none MUST reference `SelectEventCausality`, `InsertEventCausality`, or any other
  Drizzle-inferred row type
- **AND** the presence of `Tx` on `countReferences` MUST NOT be treated as a violation of this
  requirement

### Requirement: DrizzleEventCausalityRepository resolves counts against event_causality, classifying the other side's tenant via a join

`DrizzleEventCausalityRepository`, the first adapter fulfilling `IEventCausalityRepository`,
MUST resolve `countReferences(hazardousEventId, tenantId, tx?)` against the real, pre-existing
`event_causality` table. For each matching row, the row's *other side* (the side that is not
`hazardousEventId`) MUST be classified by its own tenant — read via a join to
`hazardousEventTable` when that side's `entity_type` is `'HE'`, or `disasterEventTable` when
`'DE'` — compared against the given `tenantId`. A row matching `hazardousEventId` on both its
triggering and triggered side simultaneously MUST still contribute exactly one count, not two.
When `tx` is supplied, the adapter MUST execute its select (including both joins) against `tx`
directly — it MUST NOT fall back to the module-level connection when `tx` is present.

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

#### Scenario: Called under a caller-supplied tx, the join query executes against that same tx

- **GIVEN** an open, not-yet-committed transaction `tx` under which an `event_causality` row
  referencing `hazardousEventId` has been inserted
- **WHEN** `countReferences(hazardousEventId, tenantId, tx)` is called, still within that same
  `tx`, before commit
- **THEN** the resolved counts MUST include that uncommitted row
