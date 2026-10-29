## ADDED Requirements

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
