# hip-hierarchy-schema Specification

## Purpose
Defines the persisted shape of the versioned HIP hierarchy —
`specific_hazard → hazard_cluster → hazard_type → hips_version` — that later replaces
today's flat `hip_hazard`/`hip_cluster`/`hip_class` chain as `hazardous_event`'s hazard
classification source. This spec covers schema-level observable behaviour only: what a
direct insert/query against these tables must accept or reject.

## Requirements

### Requirement: `hips_version` table shape and constraints

The `hips_version` table MUST persist one row per HIP document version, with columns `id`
(UUID primary key) and `version_no` (text, not null).

#### Scenario: Insert a version

- **WHEN** a row is inserted with `version_no = "HIPs 2025"`
- **THEN** the insert succeeds

#### Scenario: `version_no` is required

- **WHEN** a row is inserted with no `version_no`
- **THEN** the insert is rejected by a database-level not-null constraint

### Requirement: `hazard_type` table shape and constraints

The `hazard_type` table MUST persist one row per hazard type, with columns `id` (UUID
primary key), `name` (text, not null), and `hips_version_id` (UUID, not null, FK to
`hips_version.id`).

#### Scenario: Insert a hazard type under an existing version

- **WHEN** a row is inserted with a `hips_version_id` matching an existing `hips_version`
  row
- **THEN** the insert succeeds

#### Scenario: `hips_version_id` must reference an existing version

- **WHEN** a row is inserted with a `hips_version_id` that matches no row in
  `hips_version`
- **THEN** the insert is rejected by the foreign key constraint

#### Scenario: `hips_version_id` is required

- **WHEN** a row is inserted with `hips_version_id = NULL`
- **THEN** the insert is rejected by a database-level not-null constraint

### Requirement: `hazard_cluster` table shape and constraints

The `hazard_cluster` table MUST persist one row per hazard cluster, with columns `id`
(UUID primary key), `name` (text, not null), and `hazard_type_id` (UUID, not null, FK to
`hazard_type.id`).

#### Scenario: Insert a cluster under an existing type

- **WHEN** a row is inserted with a `hazard_type_id` matching an existing `hazard_type`
  row
- **THEN** the insert succeeds

#### Scenario: `hazard_type_id` must reference an existing type

- **WHEN** a row is inserted with a `hazard_type_id` that matches no row in `hazard_type`
- **THEN** the insert is rejected by the foreign key constraint

#### Scenario: `hazard_type_id` is required

- **WHEN** a row is inserted with `hazard_type_id = NULL`
- **THEN** the insert is rejected by a database-level not-null constraint

### Requirement: `specific_hazard` table shape and constraints

The `specific_hazard` table MUST persist one row per specific hazard, with columns `id`
(UUID primary key), `name` (text, not null), `code` (text, not null), and
`hazard_cluster_id` (UUID, not null, FK to `hazard_cluster.id`).

#### Scenario: Insert a specific hazard under an existing cluster

- **WHEN** a row is inserted with a `hazard_cluster_id` matching an existing
  `hazard_cluster` row
- **THEN** the insert succeeds

#### Scenario: `hazard_cluster_id` must reference an existing cluster

- **WHEN** a row is inserted with a `hazard_cluster_id` that matches no row in
  `hazard_cluster`
- **THEN** the insert is rejected by the foreign key constraint, orphaning the row is not
  possible

#### Scenario: `hazard_cluster_id` is required

- **WHEN** a row is inserted with `hazard_cluster_id = NULL`
- **THEN** the insert is rejected by a database-level not-null constraint

### Requirement: full chain integrity and reference-data delete protection

Deleting a row anywhere in `hips_version → hazard_type → hazard_cluster` MUST be rejected
by the foreign key constraint while a dependent row still references it (no cascade) —
reference data is not silently destroyed by a delete higher in the chain.

#### Scenario: Deleting a referenced hazard_cluster is rejected

- **WHEN** a `hazard_cluster` row is deleted while a `specific_hazard` row still
  references its `id`
- **THEN** the delete is rejected by the foreign key constraint

#### Scenario: Concurrent inserts referencing the same parent both succeed

- **WHEN** two callers concurrently insert two different `specific_hazard` rows that both
  reference the same existing `hazard_cluster_id`, before either transaction commits
- **THEN** both inserts succeed — the FK constraint validates each reference
  independently and does not serialize unrelated inserts against the same parent
