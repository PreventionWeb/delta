# hazard-taxonomy-repository-port Specification

## Purpose

Defines `IHazardTaxonomyRepository`, tenant-scoped membership lookups against `hazard_driver` and
`hazard_type_custom_field_definition`, feeding `HazardousEvent.create()`'s mandatory
`validHazardDriverIds`/`validCustomFieldDefinitionIds` parameters with a real, tenant-filtered set.

## Requirements

### Requirement: findValidHazardDriverIds resolves only the tenant-scoped subset of the given ids

`IHazardTaxonomyRepository.findValidHazardDriverIds(ids, tenantId)` SHALL resolve the subset of
`ids` that exist in `hazard_driver` with `countryAccountsId` equal to `tenantId`. An id belonging
to a different tenant MUST NOT be included, and an id not present in `hazard_driver` at all MUST
NOT be included.

#### Scenario: Only same-tenant ids are included

- **GIVEN** `hazard_driver` rows `{ id: "d1", countryAccountsId: "tenant-1" }` and
  `{ id: "d2", countryAccountsId: "tenant-2" }`
- **WHEN** `findValidHazardDriverIds(["d1", "d2"], "tenant-1")` is called
- **THEN** it SHALL resolve a set containing `"d1"` and MUST NOT contain `"d2"`

#### Scenario: A non-existent id is excluded, not an error

- **GIVEN** `hazard_driver` has no row with id `"d-missing"`
- **WHEN** `findValidHazardDriverIds(["d-missing"], "tenant-1")` is called
- **THEN** it SHALL resolve `new Set()`, and MUST NOT throw

#### Scenario: An empty ids array resolves an empty set without querying

- **GIVEN** `ids` is `[]`
- **WHEN** `findValidHazardDriverIds([], "tenant-1")` is called
- **THEN** it SHALL resolve `new Set()`

### Requirement: findValidCustomFieldDefinitionIds resolves only the tenant-scoped subset of the given ids

`IHazardTaxonomyRepository.findValidCustomFieldDefinitionIds(ids, tenantId)` SHALL resolve the
subset of `ids` that exist in `hazard_type_custom_field_definition` with `countryAccountsId` equal
to `tenantId`, following the same inclusion/exclusion rules as
`findValidHazardDriverIds`.

#### Scenario: Only same-tenant custom field definition ids are included

- **GIVEN** `hazard_type_custom_field_definition` rows `{ id: "f1", countryAccountsId: "tenant-1" }`
  and `{ id: "f2", countryAccountsId: "tenant-2" }`
- **WHEN** `findValidCustomFieldDefinitionIds(["f1", "f2"], "tenant-1")` is called
- **THEN** it SHALL resolve a set containing `"f1"` and MUST NOT contain `"f2"`

#### Scenario: A non-existent custom field definition id is excluded, not an error

- **GIVEN** `hazard_type_custom_field_definition` has no row with id `"f-missing"`
- **WHEN** `findValidCustomFieldDefinitionIds(["f-missing"], "tenant-1")` is called
- **THEN** it SHALL resolve `new Set()`, and MUST NOT throw

### Requirement: The valid-id reads accept an optional transaction

`IHazardTaxonomyRepository.findValidHazardDriverIds(ids, tenantId, tx?)` and
`findValidCustomFieldDefinitionIds(ids, tenantId, tx?)` SHALL accept an optional `tx`. When it is
given, the read MUST run on that transaction, so a caller holding an open transaction (the CSV
import, ca-he-csv-migration NOD-12) needs no second connection. Without `tx`, behaviour is
unchanged.

#### Scenario: A read inside an open transaction uses it

- **GIVEN** an open transaction `tx` on the PGlite test database
- **WHEN** `findValidHazardDriverIds([], T1, tx)` is called before `tx` commits
- **THEN** it resolves without waiting on another connection (no deadlock), with an empty set

#### Scenario: Concurrent callers without tx are unaffected

- **WHEN** two calls without `tx` run at the same time
- **THEN** both resolve to the same tenant-scoped set as before this change
