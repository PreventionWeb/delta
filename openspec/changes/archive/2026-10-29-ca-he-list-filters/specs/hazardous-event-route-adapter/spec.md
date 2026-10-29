## MODIFIED Requirements

### Requirement: HE list loader reads pagination from the URL query string with safe defaults

The list loader SHALL parse `page` and `pageSize` from the request URL's query string. When
`page` is absent or not a positive integer, it MUST default to `1`. When `pageSize` is absent or
not a positive integer, it MUST default to `50` (corrected — a prior draft of this requirement
said `20`; `parsePagination.ts`'s own `DEFAULT_PAGE_SIZE` was changed to `50` during `ca-he-route-
adapter-read`'s own implementation, to match legacy's `pagination/api.server.ts` `DEFAULT_PAGE_SIZE`,
but this spec was never updated to match — a stale assertion, corrected here, not a new behavior
change). `pageSize` MUST be clamped to a maximum of `100` regardless of the requested value.

#### Scenario: No pagination query params supplied

- **WHEN** the request URL has no `page` or `pageSize` query parameter
- **THEN** `ListHazardousEventsUseCase.execute` MUST be called with `page: 1, pageSize: 50`

#### Scenario: Malformed pagination query params

- **WHEN** the request URL is `?page=abc&pageSize=xyz`
- **THEN** `ListHazardousEventsUseCase.execute` MUST be called with `page: 1, pageSize: 50`

#### Scenario: pageSize exceeds the maximum

- **WHEN** the request URL is `?pageSize=500`
- **THEN** `ListHazardousEventsUseCase.execute` MUST be called with `pageSize: 100`

### Requirement: HE list and detail loaders return plain data on success, with no envelope

When the resolved use case's `execute()` resolves, the loader SHALL return that value directly.
It MUST NOT wrap the result in a `{ success: true, data }` envelope or any other wrapper object
(ADR-007).

#### Scenario: Successful fetch from the list loader

- **WHEN** `ListHazardousEventsUseCase.execute()` resolves with `{ items: [...], totalCount: N,
  unfilteredTotalCount: M }` (`ca-he-route-adapter-read`'s own implementation returns
  `{ items, totalCount }` for the numbered-pagination/summary-line feature it pulled forward from
  this change's own original scope, not a bare array; `unfilteredTotalCount` is design.md
  Decision 13)
- **AND** `GetHazardTaxonomyOptionsUseCase.execute()` resolves with a `HazardTaxonomyOptions` value
- **THEN** the list loader's return value MUST be `{ items, totalCount, unfilteredTotalCount,
  taxonomyOptions, role }`, where `taxonomyOptions` is that same `HazardTaxonomyOptions` value
  (widened again by this change — see the new requirement below for how the loader obtains it) and
  `role` is `requireViewDataPermission`'s own resolved role (string or `undefined`), included so
  `HazardousEventFilterBar` can receive it as a prop without a second permission/role lookup
  (design.md's role-as-prop decision — corrected here, an earlier draft of this scenario omitted
  `role` from the return shape even though the filter bar genuinely needs it)
- **AND** the return value MUST NOT have a `success` property

#### Scenario: Successful fetch from the detail loader

- **WHEN** `GetHazardousEventByIdUseCase.execute()` resolves with a `HazardousEventDetailDto`
- **THEN** the detail loader's return value MUST be that same object
- **AND** the return value MUST NOT have a `success` property

## ADDED Requirements

### Requirement: HE list loader parses filter query params and forwards them to the use case

The list loader SHALL parse the filter query params described in the `hazardous-event-list-filters`
capability via `parseHazardousEventListFilters`, and pass the resulting object as
`ListHazardousEventsUseCase.execute`'s `filters` field, alongside the already-resolved
`tenantId`/`page`/`pageSize`/`userId`/`role`.

#### Scenario: Filter query params are forwarded to the use case

- **WHEN** the request URL is `?hazardTypeId=t1&recordStatus=SUBMITTED`
- **THEN** `ListHazardousEventsUseCase.execute` MUST be called with a `filters` field whose
  `hazardTypeId` is `"t1"` and whose `recordStatus` is `"SUBMITTED"`

#### Scenario: No filter query params supplied

- **WHEN** the request URL has no filter query params
- **THEN** `ListHazardousEventsUseCase.execute` MUST be called with a `filters` field equivalent
  to "no filter applied"

### Requirement: HE list loader resolves taxonomy options via a dedicated use case, not the repository directly

The list loader SHALL call `GetHazardTaxonomyOptionsUseCase.execute()` (alongside
`ListHazardousEventsUseCase.execute()`, both resolved via `getAppContext().get(...)`) to obtain
the data backing the filter bar's cascading combobox, rather than calling
`ISpecificHazardTaxonomyRepository` directly — preserving the thin-loader rule (no direct
repository access from a route file).

#### Scenario: List loader calls the taxonomy use case

- **WHEN** the list loader runs successfully
- **THEN** `GetHazardTaxonomyOptionsUseCase.execute` MUST be called exactly once
- **AND** its resolved value MUST be included in the loader's own return value as
  `taxonomyOptions`
