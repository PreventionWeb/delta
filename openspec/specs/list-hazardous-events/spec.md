# list-hazardous-events Specification

## Purpose

Fetches a tenant-scoped, paginated page of `HazardousEvent`s and enriches each row with
its current workflow status where determinable, returning a `HazardousEventListItemDto[]`
for a list view.

## Requirements

### Requirement: Fetch a paginated, tenant-scoped page of events

`ListHazardousEventsUseCase.execute(query)` SHALL retrieve the page of `HazardousEvent`s
within `query.tenantId` identified by `query.page`/`query.pageSize`, via
`IHazardousEventRepository.findAll()`, and return a `HazardousEventListItemDto` for each
row.

#### Scenario: Happy path — a page with multiple events

- **GIVEN** three existing `HazardousEvent`s within `query.tenantId`, each with an
  associated `WorkflowInstance`
- **WHEN** `execute(query)` is called with that tenant and a page containing all three
- **THEN** the resolved array SHALL contain one `HazardousEventListItemDto` per event
- **AND** each DTO's fields SHALL reflect its own event
- **AND** each DTO's `workflowStatus` SHALL equal its own `WorkflowInstance`'s current
  status

#### Scenario: Pagination is forwarded as given

- **WHEN** `execute({ tenantId, page: 2, pageSize: 10 })` is called
- **THEN** `IHazardousEventRepository.findAll` SHALL be called exactly once with
  `tenantId` and `{ page: 2, pageSize: 10 }`, unchanged

### Requirement: A missing or non-string tenantId is rejected before any lookup

`execute()` SHALL throw `ValidationError` when `query.tenantId` is an empty string, or a
non-string value reachable only by a caller bypassing the compile-time type. No
repository lookup of any kind SHALL occur.

#### Scenario: Empty or non-string tenantId

- **GIVEN** a query whose `tenantId` is an empty string, or a non-string value reachable
  only by a caller bypassing the compile-time type
- **WHEN** `execute(query)` is called
- **THEN** it SHALL throw `ValidationError`
- **AND** neither `IHazardousEventRepository.findAll` nor
  `IWorkflowRepository.findByEntityIds` SHALL be called

### Requirement: An out-of-bounds page or pageSize is rejected before any lookup

`execute()` SHALL throw `ValidationError` when `query.page` is not an integer `>= 1`, or
when `query.pageSize` is not an integer `>= 1` and `<= 100`. This is a use-case-level
business rule, enforced regardless of caller — not delegated to whichever
presentation-layer adapter happens to invoke this use case. No repository lookup of any
kind SHALL occur when this rejection fires.

#### Scenario: page less than 1 is rejected

- **GIVEN** a query with `page: 0` (or a negative or non-integer value)
- **WHEN** `execute(query)` is called
- **THEN** it SHALL throw `ValidationError`
- **AND** neither `IHazardousEventRepository.findAll` nor
  `IWorkflowRepository.findByEntityIds` SHALL be called

#### Scenario: pageSize less than 1 is rejected

- **GIVEN** a query with `pageSize: 0` (or a negative or non-integer value)
- **WHEN** `execute(query)` is called
- **THEN** it SHALL throw `ValidationError`
- **AND** neither `IHazardousEventRepository.findAll` nor
  `IWorkflowRepository.findByEntityIds` SHALL be called

#### Scenario: pageSize greater than 100 is rejected

- **GIVEN** a query with `pageSize: 101`
- **WHEN** `execute(query)` is called
- **THEN** it SHALL throw `ValidationError`
- **AND** neither `IHazardousEventRepository.findAll` nor
  `IWorkflowRepository.findByEntityIds` SHALL be called

#### Scenario: Boundary values are accepted

- **GIVEN** a query with `page: 1` and `pageSize: 100` (both at their own valid boundary)
- **WHEN** `execute(query)` is called
- **THEN** it SHALL NOT throw for this reason
- **AND** `IHazardousEventRepository.findAll` SHALL be called with `{ page: 1, pageSize:
100 }`, unchanged

### Requirement: A tenant with no events returns an empty array without a workflow lookup

`execute()` SHALL return `[]`, not throw, when `IHazardousEventRepository.findAll`
resolves zero events for `query.tenantId`/page, and SHALL NOT call
`IWorkflowRepository.findByEntityIds` in that case.

#### Scenario: Empty page

- **GIVEN** `IHazardousEventRepository.findAll` resolves `[]` for `query.tenantId`
- **WHEN** `execute(query)` is called
- **THEN** the resolved value SHALL be `[]`
- **AND** `IWorkflowRepository.findByEntityIds` SHALL NOT be called

### Requirement: Workflow status is attached via exactly one batched lookup per non-empty page, never per row

For a page containing one or more events, `execute()` SHALL call
`IWorkflowRepository.findByEntityIds` exactly once, passing every id on that page, and
SHALL NOT call any single-entity workflow lookup for any row.

#### Scenario: One batched call regardless of page size

- **GIVEN** five existing `HazardousEvent`s within `query.tenantId`
- **WHEN** `execute(query)` is called for a page containing all five
- **THEN** `IWorkflowRepository.findByEntityIds` SHALL be called exactly once
- **AND** it SHALL be called with an array containing exactly the five events' own ids
  and entity type `"HE"`
- **AND** `IWorkflowRepository.findByEntity` (the single-entity lookup) SHALL NOT be
  called at all

### Requirement: Rows are joined to workflow instances by id, not by position

`execute()` SHALL associate each returned row's `workflowStatus` with the
`WorkflowInstance` whose `entityId` matches that row's own id — not with whichever
`WorkflowInstance` occupies the same array position in `findByEntityIds`'s result, which
MAY omit entries and MAY return them in a different order than the page.

#### Scenario: findByEntityIds returns instances out of order with one omitted

- **GIVEN** three existing `HazardousEvent`s, `A`, `B`, `C`, on one page, in that order
- **AND** `IWorkflowRepository.findByEntityIds` resolves `[WorkflowInstance for C,
WorkflowInstance for A]` (reordered, `B`'s own instance omitted)
- **WHEN** `execute(query)` is called
- **THEN** the resolved array SHALL be `[dto for A, dto for B, dto for C]`, in that order
  (`findAll`'s own order, not `findByEntityIds`'s)
- **AND** `dto for A`'s `workflowStatus` SHALL equal `A`'s own `WorkflowInstance`'s status
- **AND** `dto for C`'s `workflowStatus` SHALL equal `C`'s own `WorkflowInstance`'s status
- **AND** `dto for B`'s `workflowStatus` SHALL be `null`

### Requirement: A row with no corresponding WorkflowInstance is returned with workflowStatus null, not excluded and not an error

`execute()` SHALL NOT throw and SHALL NOT exclude a row when
`IWorkflowRepository.findByEntityIds` omits that row's own id from its result. Such a row
SHALL appear in the returned array with every other field populated from its
`HazardousEvent` and `workflowStatus: null`.

#### Scenario: One row among several has no WorkflowInstance

- **GIVEN** two existing `HazardousEvent`s, `A` and `B`, within `query.tenantId`
- **AND** `IWorkflowRepository.findByEntityIds` resolves only `A`'s own `WorkflowInstance`
  (`B`'s is omitted)
- **WHEN** `execute(query)` is called
- **THEN** the resolved array SHALL have length 2
- **AND** the entry for `B` SHALL have `workflowStatus: null` and every other field
  populated from `B`'s own `HazardousEvent`
- **AND** `execute()` SHALL NOT throw

### Requirement: A successful call is logged once, naming the count of rows missing a workflow status; a failed call is not logged

`execute()` SHALL emit exactly one structured log event per successful call, naming the
total row count and the count of rows whose `workflowStatus` resolved to `null`, and
SHALL NOT emit a log event when it throws or when either repository call rejects.

#### Scenario: Log event names both counts, including when some rows are missing a status

- **GIVEN** three existing `HazardousEvent`s, one of which has no `WorkflowInstance`
- **WHEN** `execute(query)` succeeds
- **THEN** a structured log event SHALL be emitted exactly once
- **AND** it SHALL report `count: 3`
- **AND** it SHALL report `missingWorkflowStatusCount: 1`

#### Scenario: Log event for an empty page reports zero for both counts

- **GIVEN** `IHazardousEventRepository.findAll` resolves `[]`
- **WHEN** `execute(query)` succeeds
- **THEN** a structured log event SHALL be emitted exactly once, reporting `count: 0` and
  `missingWorkflowStatusCount: 0`

#### Scenario: No log event on any failure

- **WHEN** `execute(query)` throws or either repository call rejects, for any reason
- **THEN** no log event SHALL be emitted

### Requirement: Repository errors propagate unmodified, with no partial logging

`execute()` SHALL NOT catch or wrap an error thrown by `IHazardousEventRepository.findAll`
or `IWorkflowRepository.findByEntityIds` — it SHALL propagate unmodified. A rejection from
`findAll` SHALL prevent `findByEntityIds` from ever being called.

#### Scenario: findAll rejects

- **GIVEN** `IHazardousEventRepository.findAll` rejects with an error
- **WHEN** `execute(query)` is called
- **THEN** the same error SHALL propagate from `execute()`
- **AND** `IWorkflowRepository.findByEntityIds` SHALL NOT be called

#### Scenario: findByEntityIds rejects

- **GIVEN** `IHazardousEventRepository.findAll` resolves one or more events, and
  `IWorkflowRepository.findByEntityIds` rejects with an error
- **WHEN** `execute(query)` is called
- **THEN** the same error SHALL propagate from `execute()`

### Requirement: Concurrent callers for different tenants resolve independently

Two simultaneous `execute()` calls for different tenants MUST each produce their own
correct result without cross-contamination — this use case holds no shared mutable state
of its own, and the batched workflow lookup for one tenant's page MUST only ever be given
that tenant's own events' ids.

#### Scenario: Two concurrent list calls for different tenants

- **GIVEN** tenant `T1` has two existing `HazardousEvent`s and tenant `T2` has one, each
  with its own `WorkflowInstance`
- **WHEN** `execute({ tenantId: "T1", page: 1, pageSize: 10 })` and `execute({ tenantId:
"T2", page: 1, pageSize: 10 })` are called concurrently, before either resolves
- **THEN** the `T1` call SHALL resolve with exactly `T1`'s own two rows, correctly
  status-enriched
- **AND** the `T2` call SHALL resolve with exactly `T2`'s own one row, correctly
  status-enriched
- **AND** the `IWorkflowRepository.findByEntityIds` call made on `T1`'s behalf SHALL be
  given only `T1`'s own events' ids, and likewise for `T2`, with no interference between
  the two calls' own arguments or results

### Requirement: Every filter value is forwarded to the repository without reinterpretation; the use case only augments, never translates

`ListHazardousEventsUseCase.execute(query)` SHALL pass every field of `query.filters` to
`IHazardousEventRepository.findAll`/`countAll` without reinterpreting or translating any filter
value (e.g. no status-string translation, no SQL construction — that belongs entirely to the
repository). The use case's own only additions to the object it passes are `query.userId` (merged
in so the repository can resolve `viewMyRecords`/`pendingMyAction` — see the dedicated requirement
below) and, for a `data-viewer` role, the forced record-status restriction (see the dedicated
requirement below) — the use case never changes the meaning of a value the caller already
supplied.

#### Scenario: A supplied filter value reaches the repository call unreinterpreted

- **WHEN** `execute({ tenantId, userId, role: null, page: 1, pageSize: 10, filters: { hazardTypeId: "t1" } })`
  is called
- **THEN** `IHazardousEventRepository.findAll` SHALL be called with a filters value whose
  `hazardTypeId` field is still exactly `"t1"`
- **AND** `IHazardousEventRepository.countAll` SHALL be called with the same `hazardTypeId` value

#### Scenario: An absent filters object is forwarded as an empty-equivalent object

- **WHEN** `execute({ tenantId, userId, role: null, page: 1, pageSize: 10 })` is called with no
  `filters` field
- **THEN** `IHazardousEventRepository.findAll` SHALL be called with a filters value equivalent to
  "no filter applied" for every dimension other than the use case's own additions above

### Requirement: A data-viewer role is always additionally restricted to validated-or-published records

`query.role` is required (`string | null`, never omitted) — see design.md Decision 4 for why
optional was rejected. When `query.role` is `"data-viewer"`, `execute()` SHALL set `allowedStatuses: ["APPROVED",
"PUBLISHED"]` on the filters object it passes to the repository — a field distinct from
`recordStatus` (see the `hazardous-event-repository-port` capability's own `allowedStatuses`
requirement for the exact AND-composition semantics), so this restriction always applies
alongside whatever `recordStatus` value `query.filters` already specifies, never replacing it — a
self-contradictory combination (e.g. a `data-viewer` explicitly requesting `recordStatus:
"DRAFT"`) SHALL resolve a correctly empty page via that AND-composition, not an error and not the
unrestricted result.

#### Scenario: data-viewer role is restricted even with no explicit recordStatus filter

- **WHEN** `execute({ tenantId, userId, role: "data-viewer", page: 1, pageSize: 10 })` is called
  with no `recordStatus` filter
- **THEN** `IHazardousEventRepository.findAll` SHALL be called with a filters value whose
  `allowedStatuses` is `["APPROVED", "PUBLISHED"]`

#### Scenario: data-viewer role combined with a contradictory explicit filter sets both fields

- **WHEN** `execute({ tenantId, userId, role: "data-viewer", page: 1, pageSize: 10, filters: {
recordStatus: "DRAFT" } })` is called
- **THEN** `IHazardousEventRepository.findAll` SHALL be called with a filters value whose
  `recordStatus` is `"DRAFT"` AND whose `allowedStatuses` is `["APPROVED", "PUBLISHED"]` (the
  repository's own AND-composition then yields zero matching rows)

#### Scenario: A non-data-viewer role sets no allowedStatuses

- **WHEN** `execute({ tenantId, userId, role: "data-admin", page: 1, pageSize: 10 })` is called
- **THEN** `IHazardousEventRepository.findAll` SHALL be called with no `allowedStatuses` field set

### Requirement: "View my records" and "pending my action" resolve against the calling user's own id

`query.userId` SHALL be required on every call. When `query.filters.viewMyRecords` is `true`,
the forwarded filter SHALL scope to records created by, or acted on (validated/approved/
published) by, `query.userId`. When `query.filters.pendingMyAction` is `true`, the forwarded
filter SHALL scope to records in `REVISION_REQUESTED` status whose submission is attributed to
`query.userId`.

#### Scenario: viewMyRecords scopes to the calling user

- **WHEN** `execute({ tenantId, userId: "u1", role: null, page: 1, pageSize: 10, filters: {
viewMyRecords: true } })` is called
- **THEN** `IHazardousEventRepository.findAll` SHALL be called with a filters value that scopes
  to user id `"u1"`

#### Scenario: A query with no userId is rejected before any repository call

- **GIVEN** a query object missing `userId`, reachable only by a caller bypassing the
  compile-time type
- **WHEN** `execute(query)` is called
- **THEN** it SHALL throw `ValidationError`
- **AND** neither `IHazardousEventRepository.findAll` nor `countAll` SHALL be called

### Requirement: The result carries two distinct totals — filtered and role-safe unfiltered (design.md Decision 13)

`execute()` SHALL resolve `totalCount` (the filtered total, from `countAll` called with the same
filters as `findAll`) and `unfilteredTotalCount` (a second `countAll` call with every field of
`query.filters` omitted) as two independent fields on its result. The second call SHALL still
carry `allowedStatuses` when `query.role` is `"data-viewer"` — never a truly empty filters object —
so the unfiltered total stays role-safe (Decision 4) rather than leaking a count of records the
role cannot see.

#### Scenario: The unfiltered count omits every user-chosen filter field

- **WHEN** `execute({ tenantId, userId, role: null, page: 1, pageSize: 10, filters: { hazardTypeId:
"t1", recordingOrganization: "Ministry" } })` is called
- **THEN** the second `countAll` call (the one producing `unfilteredTotalCount`) SHALL be called
  with a filters value that has neither `hazardTypeId` nor `recordingOrganization` set

#### Scenario: The unfiltered count still applies the data-viewer allowedStatuses restriction

- **WHEN** `execute({ tenantId, userId, role: "data-viewer", page: 1, pageSize: 10, filters: {
hazardTypeId: "t1" } })` is called
- **THEN** the second `countAll` call SHALL be called with a filters value whose `allowedStatuses`
  is `["APPROVED", "PUBLISHED"]`, with no other field set

#### Scenario: totalCount and unfilteredTotalCount resolve independently

- **GIVEN** the repository's `countAll` returns a different value for the filtered call than for
  the unfiltered one
- **WHEN** `execute()` resolves
- **THEN** `result.totalCount` SHALL equal the filtered call's own return value
- **AND** `result.unfilteredTotalCount` SHALL equal the unfiltered call's own return value, even
  though both values came from calls to the same `countAll` method
