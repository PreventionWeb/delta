## ADDED Requirements

### Requirement: findBySourceRefIds resolves legacy HIP ids to CA taxonomy entries

`ISpecificHazardTaxonomyRepository.findBySourceRefIds(refs: { hazardRefs: readonly string[];
clusterRefs: readonly string[]; typeRefs: readonly string[]; specificHazardIds?: readonly string[] })`
SHALL resolve each given legacy HIP id through the `source_ref_id` column of `specific_hazard`,
`hazard_cluster` and `hazard_type` respectively. It SHALL return four maps (`hazards`,
`clusters`, `types`, `specificHazards`) giving, per resolved ref, the CA id and that entry's
ancestor ids: for a hazard, its cluster and type; for a cluster, its type. The optional
`specificHazardIds` are CA ids resolved to their own ancestors in `specificHazards`, so the
import checks D13 rule 2 (existence, and agreement with HIP ids) in the same single read. Refs that match no
row SHALL be absent from the result; the method MUST NOT throw for them. It SHALL use one query
per call, whatever the number of refs, and is a pure read (no `tx`), the same as the port's
other reads.

The mapping is unambiguous because `source_ref_id` is `UNIQUE` on all three tables (migration
`20261009042834`).

#### Scenario: A hazard ref resolves with its ancestors

- **GIVEN** `specific_hazard` S with `source_ref_id = "78424"` under cluster C (`source_ref_id`
  "1844") and type T ("1037")
- **WHEN** `findBySourceRefIds({ hazardRefs: ["78424"], clusterRefs: [], typeRefs: [] })` is
  called
- **THEN** `result.hazards` maps "78424" to `{ specificHazardId: S, hazardClusterId: C, hazardTypeId: T }`

#### Scenario: An unknown ref is absent, not an error

- **WHEN** it is called with `hazardRefs: ["99999999"]`
- **THEN** the call resolves and "99999999" is not in the result

#### Scenario: Many refs use one query

- **WHEN** it is called with 500 hazard refs
- **THEN** exactly one database query is issued

#### Scenario: Concurrent callers get the same answer

- **WHEN** two calls with the same refs run at the same time
- **THEN** both resolve to equal results (read-only; taxonomy rows do not change at request time)
