# specific-hazard-taxonomy-repository-port Specification

## Purpose

Defines the full contract of `ISpecificHazardTaxonomyRepository`: resolving display names for a
set of `specific_hazard` ids (existing, previously undocumented — a `6a` gap, fixed here), plus a
full-preload method over the `specific_hazard`/`hazard_cluster`/`hazard_type` taxonomy backing the
list filter bar's cascading combobox (client-filtered, not server-searched — the row-count parity
with legacy's own `hip_hazard` table, proven by the HIPs migration's own assertion, is what makes
full preload the correct choice; see design.md Decision 1).

## Requirements

### Requirement: findNamesByIds resolves specific-hazard, cluster, and type names for a set of ids

`findNamesByIds(ids: readonly string[]): Promise<ReadonlyMap<string, SpecificHazardTaxonomyNames>>`
SHALL resolve a map keyed by each input id that has a matching `specific_hazard` row, with each
value containing that row's own resolved name together with its ancestor `hazard_cluster` and
`hazard_type` names. An id with no matching row SHALL be omitted from the result, not errored.
An empty `ids` array SHALL resolve an empty map without querying.

#### Scenario: Known ids resolve their own and ancestor names

- **GIVEN** a `specific_hazard` row belonging to a known `hazard_cluster`, itself belonging to a
  known `hazard_type`
- **WHEN** `findNamesByIds([thatRow.id])` is called
- **THEN** the resolved map SHALL contain that id, with `specificHazardName`, `hazardClusterName`,
  and `hazardTypeName` matching the real taxonomy chain

#### Scenario: An id with no matching row is omitted

- **GIVEN** an id that does not exist in `specific_hazard`
- **WHEN** `findNamesByIds([thatId])` is called
- **THEN** the resolved map SHALL NOT contain that id
- **AND** the call SHALL NOT throw

#### Scenario: An empty ids array resolves an empty map without querying

- **WHEN** `findNamesByIds([])` is called
- **THEN** it SHALL resolve an empty map

### Requirement: listAll resolves every hazard type, cluster, and specific hazard in one call

`listAll(): Promise<HazardTaxonomyOptions>` SHALL resolve `{ types, clusters, specificHazards }`,
each sorted by name: every `hazard_type` row's `id` and resolved name; every `hazard_cluster`
row's `id`, `typeId`, and resolved name; every `specific_hazard` row's `id`, `clusterId`, resolved
name, and `code`. No tenant filter (the taxonomy is global, not tenant-scoped) and no pagination
(the full set is always returned, mirroring legacy's own `dataForHazardPicker`).

#### Scenario: All three collections are returned, each sorted by name

- **GIVEN** `hazard_type`, `hazard_cluster`, and `specific_hazard` rows forming a taxonomy with
  more than one entry at each level
- **WHEN** `listAll()` is called
- **THEN** the resolved `types`, `clusters`, and `specificHazards` arrays SHALL each contain every
  row of their own table, each sorted by name

#### Scenario: specificHazards carries both clusterId and code

- **GIVEN** a `specific_hazard` row with a known `hazardClusterId` and `code`
- **WHEN** `listAll()` is called
- **THEN** the resolved `specificHazards` array SHALL contain an entry for that row whose
  `clusterId` and `code` match exactly
