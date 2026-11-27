## MODIFIED Requirements

### Requirement: findExportRows returns a tenant-scoped projection without rehydrating the entity

`IHazardousEventRepository.findExportRows(tenantId: string, tx?: Tx): Promise<HazardousEventExportRow[]>`
SHALL return one plain projection object per event in `tenantId`, ordered by `id` ascending,
with no role or status filter (OD-9). Each object SHALL carry:

- the event's columns;
- the WorkflowInstance status and attribution pairs, or `null`;
- the taxonomy `source_ref_id` of its specific hazard, cluster and type, or `null`;
- the CA cause id, or `null` (the lowest cause id when migrated data holds several, so each
  event is still exactly one row);
- the number of CA cause links of the event (`causeCount`), so the import can refuse a `parent`
  change that would replace several causes;
- the event's current CA spatial observation (latest by observation time), as its observation
  time, its geometries in GeoJSON and its division ids, or `null` when the event has none;
- the event's CA attachment rows, each with type, title, URL, tag, file key and file type;
- for each of those, the legacy fallback value:
  - the stored `approvalStatus` and attribution columns;
  - the `hip_*` columns;
  - the `event_relationship` parent;
  - the legacy footprint geometries (GeoJSON) and division ids;
  - the legacy `attachments` jsonb.

It MUST NOT construct a `HazardousEvent` entity, so a row that would fail rehydration (for
example, one with a null `specific_hazard_id`) is still returned. It SHALL read with a single
statement, or inside one read transaction, so the result is a consistent snapshot.
`HazardousEventExportRow` MUST be a plain type declared in the application layer, not a Drizzle
row type. When `tx` is given, the read MUST run on it, so the import's unchanged check (NOD-4)
compares inside its own transaction without a second connection (NOD-12). Every footprint and
attachment value MUST belong to an event of `tenantId`.

#### Scenario: A row that findAll skips is returned

- **GIVEN** an event in T1 with `specific_hazard_id = NULL`
- **WHEN** `findExportRows(T1)` is called
- **THEN** the event is in the result with `specificHazardId: null`
- **AND** `findAll(T1, ...)` still skips it, unchanged

#### Scenario: Tenant scope and order

- **GIVEN** events in T1 and T2
- **WHEN** `findExportRows(T1)` is called
- **THEN** it returns only T1 events, sorted by `id` ascending

#### Scenario: Legacy fallback values are carried for an unmigrated row

- **GIVEN** an event in T1 with no WorkflowInstance, legacy `approvalStatus = "published"`, an
  `event_relationship` parent P, one legacy geometry row and a legacy `attachments` jsonb
- **WHEN** `findExportRows(T1)` is called
- **THEN** its projection has `workflowStatus: null` and carries the legacy status, P, the
  geometry and the jsonb as fallback values

#### Scenario: The current observation is the latest by observation time

- **GIVEN** an event in T1 with two spatial observations, the later-dated one inserted first
- **WHEN** `findExportRows(T1)` is called
- **THEN** the projection's current observation is the later-dated one, with its geometries and
  division ids

#### Scenario: Attachments of the event are carried

- **GIVEN** an event in T1 with one Link and one File attachment
- **WHEN** `findExportRows(T1)` is called
- **THEN** its projection lists both, with the Link's URL and the File's key and type

#### Scenario: Concurrent export reads during a write

- **GIVEN** an open, uncommitted transaction that has inserted an event in T1
- **WHEN** `findExportRows(T1)` runs at the same time on another connection
- **THEN** it does not return the uncommitted event
- **AND** it returns every committed event
