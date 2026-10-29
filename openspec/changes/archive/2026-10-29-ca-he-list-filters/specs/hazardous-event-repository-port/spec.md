## MODIFIED Requirements

### Requirement: IHazardousEventRepository interface compiles as a valid, framework-free TypeScript port

The file `app/domains/hazardous-events/application/ports/IHazardousEventRepository.ts` MUST export
an interface named `IHazardousEventRepository`. It MUST declare exactly the eleven methods
described in this capability (the original ten plus `countAll`, added by a prior change and
documented here for the first time — a pre-existing spec gap, not introduced by this change) with
the exact signatures shown. The file MUST NOT import from any Drizzle, NestJS, or Remix module,
**except** `app/db.server.ts`'s exported `Tx` type, imported as `import type { Tx } from
"~/db.server"` — a type-only import, erased at compile time, so this file never loads
`db.server.ts`'s runtime `dr` connection or pool. `Tx` carries no table-shape information (it is a
union over "the module-level connection" and "an already-open transaction handle"), unlike a
Drizzle `$inferSelect`/`$inferInsert` row type — the distinction this exception exists to preserve
(design.md Decision 3).

#### Scenario: TypeScript compilation succeeds

- **GIVEN** `IHazardousEventRepository.ts` is written with the correct method signatures and no
  disallowed imports
- **WHEN** `yarn tsc` is run
- **THEN** it MUST exit with code 0 and zero type errors referencing this file

### Requirement: findAll is tenant-scoped and paginated

`findAll(tenantId: string, pagination: Pagination, filters?: HazardousEventRepositoryFilters):
Promise<HazardousEvent[]>` MUST be declared on the interface, scoping every returned entity to
`tenantId`. `filters` is optional; when omitted or empty, `findAll` MUST behave exactly as it did
before this capability's filter requirements existed (every tenant-scoped row, unfiltered).

#### Scenario: Method signature is present with correct arity

- **GIVEN** the `IHazardousEventRepository` interface
- **WHEN** a TypeScript class declares `implements IHazardousEventRepository` and omits
  `pagination` from `findAll`
- **THEN** `yarn tsc` MUST report a type error

#### Scenario: Omitting filters preserves the unfiltered result

- **GIVEN** three persisted `HazardousEvent`s for the same `tenantId`
- **WHEN** `findAll(tenantId, { page: 1, pageSize: 10 })` is called with no third argument
- **THEN** the resolved array MUST contain all three, exactly as if `filters: {}` had been passed

## ADDED Requirements

### Requirement: countAll is tenant-scoped and reflects the same filters as findAll

`countAll(tenantId: string, filters?: HazardousEventRepositoryFilters, tx?: Tx): Promise<number>` MUST
be declared on the interface (documented here for the first time — see the MODIFIED overview
requirement above). It MUST resolve the count of rows matching the exact same condition `findAll`
would apply for the identical `tenantId`/`filters` pair, built from one shared condition — an
implementation MUST NOT maintain `findAll`'s and `countAll`'s own filter-to-SQL translation as two
independently-written code paths that could silently diverge.

#### Scenario: countAll and findAll agree on a filtered query

- **GIVEN** five persisted `HazardousEvent`s for the same `tenantId`, three of which match a given
  `filters` value
- **WHEN** `countAll(tenantId, filters)` and `findAll(tenantId, { page: 1, pageSize: 10 }, filters)`
  are both called
- **THEN** `countAll`'s resolved number MUST equal the length of `findAll`'s resolved array

#### Scenario: Omitting filters counts every tenant-scoped row

- **GIVEN** three persisted `HazardousEvent`s for the same `tenantId`
- **WHEN** `countAll(tenantId)` is called with no `filters` argument
- **THEN** it MUST resolve `3`

### Requirement: Taxonomy filters (hazardTypeId, hazardClusterId, specificHazardId) match via the specific_hazard chain, not hip_* columns

When `filters.specificHazardId` is set, `findAll`/`countAll` MUST restrict to rows where
`hazardousEventTable.specificHazardId` equals that value. When `filters.hazardClusterId` is set,
MUST restrict to rows whose `specificHazardId` belongs to a `specific_hazard` row with that
`hazardClusterId`. When `filters.hazardTypeId` is set, MUST restrict to rows whose
`specificHazardId` belongs to a `specific_hazard` row whose `hazard_cluster` belongs to that
`hazardTypeId`. These MUST NOT be implemented via `hazardousEventTable.hipHazardId`/`hipClusterId`/
`hipTypeId`.

#### Scenario: specificHazardId matches directly

- **GIVEN** a `HazardousEvent` with `specificHazardId: "sh1"` and another with a different value
- **WHEN** `findAll(tenantId, pagination, { specificHazardId: "sh1" })` is called
- **THEN** the resolved array MUST contain only the first event

#### Scenario: hazardClusterId matches via the taxonomy join

- **GIVEN** a `HazardousEvent` whose `specificHazardId` belongs to `hazard_cluster` `"c1"`, and
  another event whose `specificHazardId` belongs to a different cluster
- **WHEN** `findAll(tenantId, pagination, { hazardClusterId: "c1" })` is called
- **THEN** the resolved array MUST contain only the first event

#### Scenario: hazardTypeId matches via the two-hop taxonomy join

- **GIVEN** a `HazardousEvent` whose `specificHazardId` belongs to a cluster belonging to
  `hazard_type` `"t1"`, and another event belonging to a different type
- **WHEN** `findAll(tenantId, pagination, { hazardTypeId: "t1" })` is called
- **THEN** the resolved array MUST contain only the first event

### Requirement: Record-status filter matches via an EXISTS subquery against workflow_instance, excluding rows with no instance

When `filters.recordStatus` is set, `findAll`/`countAll` MUST restrict to rows for which a
`workflow_instance` row exists with matching `entityId`/`entityType: "HE"` and `status` equal to
that value. A row with no `workflow_instance` at all MUST be excluded when this filter is set, and
MUST continue to be included when this filter is not set.

#### Scenario: recordStatus restricts to matching workflow_instance rows

- **GIVEN** a `HazardousEvent` with a `workflow_instance` row whose `status` is `"SUBMITTED"`, and
  another event with a `workflow_instance` row whose `status` is `"DRAFT"`
- **WHEN** `findAll(tenantId, pagination, { recordStatus: "SUBMITTED" })` is called
- **THEN** the resolved array MUST contain only the first event

#### Scenario: A row with no workflow_instance is excluded when recordStatus is set

- **GIVEN** a `HazardousEvent` with no `workflow_instance` row at all
- **WHEN** `findAll(tenantId, pagination, { recordStatus: "SUBMITTED" })` is called
- **THEN** the resolved array MUST NOT contain that event

#### Scenario: A row with no workflow_instance is included when recordStatus is not set

- **GIVEN** a `HazardousEvent` with no `workflow_instance` row at all
- **WHEN** `findAll(tenantId, pagination, {})` is called
- **THEN** the resolved array MUST contain that event

### Requirement: allowedStatuses restricts matching to a given set of statuses, independent of and composable with recordStatus

When `filters.allowedStatuses` is set, `findAll`/`countAll` MUST restrict to rows for which a
`workflow_instance` row exists with matching `entityId`/`entityType: "HE"` and `status` one of
the given set — a row with no `workflow_instance` at all MUST be excluded when this filter is set.
When both `filters.recordStatus` and `filters.allowedStatuses` are set, both conditions MUST
apply (a row must satisfy the exact `recordStatus` match AND have that status be a member of
`allowedStatuses`) — this field exists specifically to let a caller AND a forced restriction onto
an independently-supplied `recordStatus` value without one overwriting the other.

#### Scenario: allowedStatuses restricts to the given set

- **GIVEN** a `HazardousEvent` with a `workflow_instance` row whose `status` is `"APPROVED"`, and
  another event with a `workflow_instance` row whose `status` is `"DRAFT"`
- **WHEN** `findAll(tenantId, pagination, { allowedStatuses: ["APPROVED", "PUBLISHED"] })` is
  called
- **THEN** the resolved array MUST contain only the first event

#### Scenario: recordStatus and allowedStatuses combine as AND, not override

- **GIVEN** a `HazardousEvent` with a `workflow_instance` row whose `status` is `"DRAFT"`
- **WHEN** `findAll(tenantId, pagination, { recordStatus: "DRAFT", allowedStatuses: ["APPROVED",
  "PUBLISHED"] })` is called
- **THEN** the resolved array MUST NOT contain that event (its status matches `recordStatus` but
  is not a member of `allowedStatuses`)

#### Scenario: A matching combination of recordStatus and allowedStatuses includes the row

- **GIVEN** a `HazardousEvent` with a `workflow_instance` row whose `status` is `"PUBLISHED"`
- **WHEN** `findAll(tenantId, pagination, { recordStatus: "PUBLISHED", allowedStatuses:
  ["APPROVED", "PUBLISHED"] })` is called
- **THEN** the resolved array MUST contain that event

### Requirement: viewMyRecords matches creation or any workflow action attributed to the given user

When `filters.viewMyRecords` is `true` and `filters.userId` is given, `findAll`/`countAll` MUST
restrict to rows where `hazardousEventTable.createdByUserId` equals `filters.userId`, OR a
`workflow_instance` row exists for that entity whose `validatedByUserId`, `approvedByUserId`, or
`publishedByUserId` equals `filters.userId`.

#### Scenario: Matches by creation

- **GIVEN** a `HazardousEvent` with `createdByUserId: "u1"`
- **WHEN** `findAll(tenantId, pagination, { viewMyRecords: true, userId: "u1" })` is called
- **THEN** the resolved array MUST contain that event

#### Scenario: Matches by a workflow_instance action, not creation

- **GIVEN** a `HazardousEvent` created by a different user, with a `workflow_instance` row whose
  `publishedByUserId` is `"u1"`
- **WHEN** `findAll(tenantId, pagination, { viewMyRecords: true, userId: "u1" })` is called
- **THEN** the resolved array MUST contain that event

#### Scenario: A record with no relation to the given user is excluded

- **GIVEN** a `HazardousEvent` created by a different user, with no `workflow_instance` action
  attributed to `"u1"`
- **WHEN** `findAll(tenantId, pagination, { viewMyRecords: true, userId: "u1" })` is called
- **THEN** the resolved array MUST NOT contain that event

### Requirement: pendingMyAction matches REVISION_REQUESTED status submitted by the given user

When `filters.pendingMyAction` is `true` and `filters.userId` is given, `findAll`/`countAll` MUST
restrict to rows with a `workflow_instance` row whose `status` is `"REVISION_REQUESTED"` and whose
own `submittedByUserId` equals `filters.userId`.

#### Scenario: Matches a record awaiting revision from the given user

- **GIVEN** a `HazardousEvent` with a `workflow_instance` row whose `status` is
  `"REVISION_REQUESTED"` and `submittedByUserId` is `"u1"`
- **WHEN** `findAll(tenantId, pagination, { pendingMyAction: true, userId: "u1" })` is called
- **THEN** the resolved array MUST contain that event

#### Scenario: A different status is excluded even with a matching submitter

- **GIVEN** a `HazardousEvent` with a `workflow_instance` row whose `status` is `"SUBMITTED"` and
  `submittedByUserId` is `"u1"`
- **WHEN** `findAll(tenantId, pagination, { pendingMyAction: true, userId: "u1" })` is called
- **THEN** the resolved array MUST NOT contain that event

### Requirement: Date-range filters apply legacy's own partial-date comparison, excluding empty-string dates

When `filters.fromDate` is set, `findAll`/`countAll` MUST restrict to rows whose `startDate` is
non-empty and chronologically `>=` `filters.fromDate`, comparing at the finer of the two values'
own precision (year, year-month, or full date) exactly as the legacy comparison does. When
`filters.toDate` is set, the same applies to `endDate` with `<=`.

#### Scenario: fromDate excludes a row with an earlier startDate

- **GIVEN** a `HazardousEvent` with `startDate: "2023-01-01"` and another with
  `startDate: "2024-06-01"`
- **WHEN** `findAll(tenantId, pagination, { fromDate: "2024-01-01" })` is called
- **THEN** the resolved array MUST contain only the second event

#### Scenario: fromDate excludes a row with an empty startDate

- **GIVEN** a `HazardousEvent` with `startDate: ""`
- **WHEN** `findAll(tenantId, pagination, { fromDate: "2024-01-01" })` is called
- **THEN** the resolved array MUST NOT contain that event

#### Scenario: A year-only startDate compares at year precision

- **GIVEN** a `HazardousEvent` with `startDate: "2024"`
- **WHEN** `findAll(tenantId, pagination, { fromDate: "2024-01-01" })` is called
- **THEN** the resolved array MUST contain that event

### Requirement: recordingOrganization matches recordOriginator by case-insensitive partial match

When `filters.recordingOrganization` is set, `findAll`/`countAll` MUST restrict to rows where
`hazardousEventTable.recordOriginator` matches that value via a case-insensitive partial (`ILIKE`)
match — a deliberate UX improvement confirmed by the human (Open Decision 3 in proposal.md),
not a port of legacy's own exact-match query.

#### Scenario: Partial match qualifies

- **GIVEN** a `HazardousEvent` with `recordOriginator: "Ministry of Health"`
- **WHEN** `findAll(tenantId, pagination, { recordingOrganization: "Ministry" })` is called
- **THEN** the resolved array MUST contain that event

#### Scenario: Match is case-insensitive

- **GIVEN** a `HazardousEvent` with `recordOriginator: "Ministry of Health"`
- **WHEN** `findAll(tenantId, pagination, { recordingOrganization: "ministry" })` is called
- **THEN** the resolved array MUST contain that event

#### Scenario: A non-matching value excludes the row

- **GIVEN** a `HazardousEvent` with `recordOriginator: "Ministry of Health"`
- **WHEN** `findAll(tenantId, pagination, { recordingOrganization: "Ministry of Finance" })` is
  called
- **THEN** the resolved array MUST NOT contain that event

### Requirement: Multiple filter dimensions compose with AND

When more than one filter field is set, `findAll`/`countAll` MUST restrict to rows matching every
set dimension simultaneously, not any one of them.

#### Scenario: Two dimensions both narrow the result

- **GIVEN** a `HazardousEvent` matching `hazardTypeId: "t1"` but not `hazardousEventStatus:
  "ongoing"`, and another event matching both
- **WHEN** `findAll(tenantId, pagination, { hazardTypeId: "t1", hazardousEventStatus: "ongoing"
  })` is called
- **THEN** the resolved array MUST contain only the second event
