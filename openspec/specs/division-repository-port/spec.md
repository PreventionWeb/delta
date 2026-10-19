# division-repository-port Specification

## Purpose

Provides a tenant-scoped membership lookup against the shared `division` reference table,
feeding `SpatialObservation.create()`'s mandatory `validDivisionIds` parameter with a real,
tenant-filtered set instead of an empty or unverified one.

## Requirements

### Requirement: `findValidDivisionIds` resolves the subset of `ids` that exist under `tenantId`

`IDivisionRepository.findValidDivisionIds(ids, tenantId)` MUST resolve a `ReadonlySet<string>`
containing exactly the `ids` entries present in `division` under `tenantId`, and MUST resolve
(never reject) for a non-existent id or an empty `ids` array.

#### Scenario: Includes only same-tenant division ids

- **WHEN** `findValidDivisionIds` is called with ids belonging to a mix of the queried tenant and
  other tenants
- **THEN** the resolved set contains only the ids belonging to the queried tenant

#### Scenario: A non-existent id is excluded without throwing

- **WHEN** `findValidDivisionIds` is called with an id that does not exist in `division` at all
- **THEN** the call resolves successfully and the resolved set excludes that id

#### Scenario: An empty `ids` array resolves an empty set

- **WHEN** `findValidDivisionIds` is called with an empty `ids` array
- **THEN** the call resolves an empty set without querying for membership

### Requirement: A `division` row with a `null` `countryAccountsId` is never valid for any tenant

`findValidDivisionIds` MUST exclude any `division` row whose `countryAccountsId` is `null` from
the resolved set, regardless of which `tenantId` is queried.

#### Scenario: A null-tenant division id is excluded for every tenant

- **WHEN** `findValidDivisionIds` is called with an id belonging to a `division` row whose
  `countryAccountsId` is `null`, for any queried `tenantId`
- **THEN** the resolved set excludes that id
