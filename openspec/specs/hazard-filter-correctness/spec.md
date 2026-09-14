# hazard-filter-correctness Specification

## Purpose
TBD - created by archiving change ca-he-hazard-filter-fixes. Update Purpose after archive.

## Requirements

### Requirement: `applyHazardFilters` internal naming must not collide with the `2i` schema column

`applyHazardFilters` (`app/backend.server/utils/hazardFilters.ts`) MUST derive its internal
filter value for the legacy HIP-hierarchy hazard filter from `filters.specificHazardId` without
naming that internal value `specificHazardId`, so that it cannot be textually confused with
`hazardousEventTable.specificHazardId` (the `2i` schema column referencing
`specificHazardTable`, an unrelated concept). The function MUST continue to accept its input
via the `filters.specificHazardId` object property unchanged, and MUST produce byte-for-byte
identical query conditions and logged output compared to its pre-rename behavior.

#### Scenario: internal variable renamed away from the colliding name

- **GIVEN** `applyHazardFilters` is called with `filters.specificHazardId` set to a valid
  `hipHazardTable.id`
- **WHEN** the function executes
- **THEN** the source of `app/backend.server/utils/hazardFilters.ts` MUST NOT declare a local
  binding named `specificHazardId`
- **AND** the function MUST still read its input from `filters.specificHazardId` unchanged

#### Scenario: query conditions are unchanged by the rename

- **GIVEN** a seeded `hipType` -> `hipCluster` -> `hipHazard` chain and
  `filters.specificHazardId` set to the seeded `hipHazardId`
- **WHEN** `applyHazardFilters` is called before the rename and again after the rename
- **THEN** the resulting `baseConditions` array MUST contain an equivalent
  `eq(hazardousEventTable.hipHazardId, <value>)` condition in both cases
- **AND** the two `baseConditions` arrays MUST be equivalent (same conditions, same rendered SQL)

#### Scenario: logged output is unchanged by the rename

- **GIVEN** the same seeded `hipHazardId` filter input as above
- **WHEN** `applyHazardFilters` is called before the rename and again after the rename
- **THEN** every `logger.debug`/`logger.info`/`logger.warn` call MUST emit a payload keyed
  `specificHazardId` (not `hipHazardIdFilter` or any other renamed identifier) with an identical
  value in both cases
- **AND** this MUST hold across all seven shorthand (`{ specificHazardId }`) log sites in the
  function: the "Applied specific hazard filter" debug log, the "Starting specific hazard
  validation" debug log, the "Hazard cluster mismatch detected" warn log, the "Hazard type
  mismatch detected" warn log, the "Specific hazard validation completed" info log, the
  "Specific hazard not found in hierarchy" warn log, and the hierarchy-validation `catch` block's
  error log

#### Scenario: hierarchical validation still runs against the correct table

- **GIVEN** `filters.specificHazardId` set to a seeded `hipHazardTable.id`
- **WHEN** `applyHazardFilters` executes its non-blocking hierarchical validation block
- **THEN** it MUST query `hipHazardTable` (joined to `hipClusterTable` and `hipTypeTable`) using
  the renamed internal value, identically to its pre-rename behavior

#### Scenario: callers of `applyHazardFilters` are unaffected

- **GIVEN** `mostDamagingEvents.ts` or `geographicImpact.ts` calling `applyHazardFilters` with an
  object literal `{ hazardTypeId, hazardClusterId, specificHazardId: params.specificHazardId }`
- **WHEN** the rename lands in `hazardFilters.ts`
- **THEN** neither caller requires any code change, since the object property name
  `specificHazardId` passed into `applyHazardFilters` is untouched
