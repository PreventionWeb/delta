## ADDED Requirements

### Requirement: IHipCrosswalkPort.resolve() derives legacy HIP ids from a specificHazardId

`IHipCrosswalkPort.resolve(specificHazardId)` SHALL return a `HipCrosswalkIds` object
(`hipHazardId`/`hipClusterId`/`hipTypeId`, each `string | null`) derived from the given specific
hazard's own `sourceRefId`, its ancestor hazard cluster's `sourceRefId`, and that cluster's ancestor
hazard type's `sourceRefId`. For each of the three levels, the resolved value SHALL be `null` when
that level's `sourceRefId` column is itself `null`, OR when the non-null `sourceRefId` value has no
matching row in the corresponding legacy table (`hip_hazard`/`hip_cluster`/`hip_class`
respectively) — `resolve()` SHALL NEVER return a value for a level that does not correspond to an
existing row in that level's legacy table.

#### Scenario: Every ancestor has a valid sourceRefId

- **GIVEN** a `specific_hazard` row whose own `sourceRefId`, whose cluster's `sourceRefId`, and
  whose cluster's type's `sourceRefId` are all non-null and each matches a live row in
  `hip_hazard`/`hip_cluster`/`hip_class` respectively
- **WHEN** `resolve(specificHazardId)` is called
- **THEN** the result SHALL have all three fields set to their respective matching legacy ids

#### Scenario: An ancestor's sourceRefId is null

- **GIVEN** a `specific_hazard` row whose cluster's `sourceRefId` is `null` (a taxonomy entry added
  after the original HIPs migration)
- **WHEN** `resolve(specificHazardId)` is called
- **THEN** the result's `hipClusterId` SHALL be `null`

#### Scenario: A sourceRefId is set but dangling (no matching legacy row)

- **GIVEN** a `specific_hazard` row whose own `sourceRefId` is a non-null value that does not match
  any row in `hip_hazard`
- **WHEN** `resolve(specificHazardId)` is called
- **THEN** the result's `hipHazardId` SHALL be `null`, not the dangling value

### Requirement: IHipCrosswalkPort.stamp() writes the three HIP columns inside the caller's transaction

`IHipCrosswalkPort.stamp(eventId, tenantId, ids, tx)` SHALL update the `hazardous_event` row
identified by `eventId` and scoped to `countryAccountsId = tenantId`, setting `hip_hazard_id`,
`hip_cluster_id`, and `hip_type_id` to `ids.hipHazardId`, `ids.hipClusterId`, and `ids.hipTypeId`
respectively — including writing an explicit `NULL` for any field that is `null` — using the given
`tx`, never a connection outside the caller's transaction.

#### Scenario: stamp() writes all three columns, including explicit nulls

- **GIVEN** `ids: { hipHazardId: "MH0004", hipClusterId: null, hipTypeId: "hip-type-1" }` for an
  existing, tenant-scoped event
- **WHEN** `stamp(eventId, tenantId, ids, tx)` is called and `tx` commits
- **THEN** the event's row SHALL have `hip_hazard_id = 'MH0004'`, `hip_cluster_id = NULL`, and
  `hip_type_id = 'hip-type-1'`

#### Scenario: stamp() is tenant-scoped

- **GIVEN** an event belonging to tenant `"tenant-A"`
- **WHEN** `stamp(eventId, "tenant-B", ids, tx)` is called
- **THEN** no row SHALL be updated
