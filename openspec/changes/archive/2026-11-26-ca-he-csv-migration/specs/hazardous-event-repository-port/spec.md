## MODIFIED Requirements

### Requirement: IHazardousEventRepository interface compiles as a valid, framework-free TypeScript port

The file `app/domains/hazardous-events/application/ports/IHazardousEventRepository.ts` MUST export
an interface named `IHazardousEventRepository`. It MUST declare exactly the thirteen methods
described below with the exact signatures shown (the original ten plus `countAll`,
`findIdByApiImportId` and `findExportRows`). The file MUST
NOT import from any Drizzle, NestJS, or Remix module, **except** `app/db.server.ts`'s exported
`Tx` type, imported as
`import type { Tx } from "~/db.server"` — a type-only import, erased at compile time, so this
file never loads `db.server.ts`'s runtime `dr` connection or pool. `Tx` carries no table-shape
information (it is a union over "the module-level connection" and "an already-open transaction
handle"), unlike a Drizzle `$inferSelect`/`$inferInsert` row type — the distinction this
exception exists to preserve (design.md Decision 3).

#### Scenario: TypeScript compilation succeeds

- **GIVEN** `IHazardousEventRepository.ts` is written with the correct method signatures and no
  disallowed imports
- **WHEN** `yarn tsc` is run
- **THEN** it MUST exit with code 0 and zero type errors referencing this file

## ADDED Requirements

### Requirement: findIdByApiImportId is tenant-scoped

`IHazardousEventRepository.findIdByApiImportId(apiImportId: string, tenantId: string, tx?: Tx):
Promise<string | null>` SHALL return the id of the event in `tenantId` whose `api_import_id`
equals `apiImportId`, or `null` when there is none. It MUST NOT return a row with the same
`api_import_id` in another tenant, or a row with a null `country_accounts_id`. When `tx` is
given, the read MUST use it. An empty `apiImportId` SHALL resolve `null` and MUST NOT match rows
whose `api_import_id` is empty. On the CA path, this replaces the legacy
`hazardousEventIdByImportId`, which has no tenant filter (0e bug 3).

#### Scenario: Match in the tenant

- **GIVEN** an event in T1 with `api_import_id = "A1"`
- **WHEN** `findIdByApiImportId("A1", T1)` is called
- **THEN** it resolves with that event's id

#### Scenario: Same id in another tenant is not visible

- **GIVEN** an event in T2 with `api_import_id = "A1"` and none in T1
- **WHEN** `findIdByApiImportId("A1", T1)` is called
- **THEN** it resolves `null`

#### Scenario: A null-tenant legacy row is not visible

- **GIVEN** a legacy row with `api_import_id = "A1"` and `country_accounts_id = NULL`
- **WHEN** `findIdByApiImportId("A1", T1)` is called
- **THEN** it resolves `null`

#### Scenario: Uncommitted insert in the same transaction is visible

- **GIVEN** a transaction `tx` in which an event with `api_import_id = "A1"` was inserted for T1
- **WHEN** `findIdByApiImportId("A1", T1, tx)` is called before commit
- **THEN** it resolves with that event's id
- **AND** the same call without `tx`, made from another connection at that moment, resolves
  `null`

### Requirement: findExportRows returns a tenant-scoped projection without rehydrating the entity

`IHazardousEventRepository.findExportRows(tenantId: string, tx?: Tx): Promise<HazardousEventExportRow[]>`
SHALL return one plain projection object per event in `tenantId`, ordered by `id` ascending,
with no role or status filter (OD-9). Each object SHALL carry:

- the event's columns;
- the WorkflowInstance status and attribution pairs, or `null`;
- the taxonomy `source_ref_id` of its specific hazard, cluster and type, or `null`;
- the CA cause id, or `null` (the lowest cause id when migrated data holds several, so each
  event is still exactly one row);
- the number of CA cause links of the event (`causeCount`), so the import can refuse a `parent`
  change that would replace several causes;
- for each of those, the legacy fallback value: the stored `approvalStatus` and attribution
  columns, the `hip_*` columns, and the `event_relationship` parent. (Footprint and attachment
  fields are added by roadmap 6d-2.)

It MUST NOT construct a `HazardousEvent` entity, so a row that would fail rehydration (for
example, one with a null `specific_hazard_id`) is still returned. It SHALL read with a single
statement, or inside one read transaction, so the result is a consistent snapshot.
`HazardousEventExportRow` MUST be a plain type declared in the application layer, not a Drizzle
row type. When `tx` is given, the read MUST run on it, so the import's unchanged check (NOD-4)
compares inside its own transaction without a second connection (NOD-12).

#### Scenario: A row that findAll skips is returned

- **GIVEN** an event in T1 with `specific_hazard_id = NULL`
- **WHEN** `findExportRows(T1)` is called
- **THEN** the event is in the result with `specificHazardId: null`
- **AND** `findAll(T1, ...)` still skips it, unchanged

#### Scenario: Tenant scope and order

- **GIVEN** events in T1 and T2
- **WHEN** `findExportRows(T1)` is called
- **THEN** it returns only T1 events, sorted by `id` ascending

#### Scenario: Legacy fallback values are carried for an unmigrated row

- **GIVEN** an event in T1 with no WorkflowInstance, legacy `approvalStatus = "published"`, and an
  `event_relationship` parent P
- **WHEN** `findExportRows(T1)` is called
- **THEN** its projection has `workflowStatus: null` and carries the legacy status and P as
  fallback values

#### Scenario: Concurrent export reads during a write

- **GIVEN** an open, uncommitted transaction that has inserted an event in T1
- **WHEN** `findExportRows(T1)` runs at the same time on another connection
- **THEN** it does not return the uncommitted event
- **AND** it returns every committed event
