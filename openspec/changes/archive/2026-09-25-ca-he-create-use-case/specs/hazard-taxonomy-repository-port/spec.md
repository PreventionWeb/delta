## Purpose

Defines `IHazardTaxonomyRepository`, tenant-scoped membership lookups against `hazard_driver` and
`hazard_type_custom_field_definition`, feeding `HazardousEvent.create()`'s mandatory
`validHazardDriverIds`/`validCustomFieldDefinitionIds` parameters with a real, tenant-filtered set.

## ADDED Requirements

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
