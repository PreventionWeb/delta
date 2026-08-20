## ADDED Requirements

### Requirement: Recalculate costs for a disaster event
`recalculateCostsForDisasterEvent(tx, disasterEventId)` SHALL recompute the four aggregate cost
fields (`repairCostsLocalCurrencyCalc`, `replacementCostsLocalCurrencyCalc`,
`rehabilitationCostsLocalCurrencyCalc`, `recoveryNeedsLocalCurrencyCalc`) on `disasterEventTable`
from the current state of all disaster records linked to that event, and SHALL persist the
recomputed values by updating the row identified by `disasterEventTable.id = disasterEventId`.

#### Scenario: Event with no linked disaster records
- **WHEN** `recalculateCostsForDisasterEvent` is called for a disaster event that has zero linked
  disaster records
- **THEN** all four `*Calc` columns SHALL be set to `"0"`

#### Scenario: Event with one linked disaster record
- **WHEN** `recalculateCostsForDisasterEvent` is called for a disaster event with one linked
  disaster record that has damages, disruption, and sector-relation data
- **THEN** each `*Calc` column SHALL equal the sum of that single record's contributing values,
  computed per the repair/replacement/rehabilitation/recovery rules below

#### Scenario: Event with multiple linked disaster records (aggregation)
- **WHEN** `recalculateCostsForDisasterEvent` is called for a disaster event linked to two or more
  disaster records, each with their own damages/disruption/sector-relation rows
- **THEN** each `*Calc` column SHALL equal the sum across **all** linked records' contributing
  values, not just one record

#### Scenario: Unknown disaster event id
- **WHEN** `recalculateCostsForDisasterEvent` is called with a `disasterEventId` that does not
  match any row in `disasterEventTable`
- **THEN** the underlying `UPDATE` SHALL affect zero rows and the function SHALL NOT throw

---

### Requirement: Recalculate costs for whatever event a disaster record is linked to
`recalculateCostsForDisasterRecord(tx, disasterRecordId)` SHALL resolve the disaster event linked
to the given disaster record and, if one exists, SHALL delegate to
`recalculateCostsForDisasterEvent` for that event. If the record exists but is not linked to any
disaster event, the function SHALL do nothing.

#### Scenario: Record linked to an event
- **WHEN** `recalculateCostsForDisasterRecord` is called with a `disasterRecordId` whose
  `disasterEventId` is set
- **THEN** the linked disaster event's four `*Calc` columns SHALL be recalculated exactly as
  `recalculateCostsForDisasterEvent` specifies

#### Scenario: Record not linked to any event
- **WHEN** `recalculateCostsForDisasterRecord` is called with a `disasterRecordId` whose
  `disasterEventId` is `null`
- **THEN** no `disasterEventTable` row SHALL be updated, and the function SHALL return without
  error

#### Scenario: Unknown disaster record id
- **WHEN** `recalculateCostsForDisasterRecord` is called with a `disasterRecordId` that does not
  match any row in `disasterRecordsTable`
- **THEN** the function SHALL throw an error indicating the record was not found

---

### Requirement: Repair and replacement cost calculation
The repair cost contribution of a disaster record SHALL be the sum of
`damagesTable.pdRepairCostTotal` across all `damagesTable` rows for that record, treating a
missing (`null`) value as `0`. The replacement cost contribution SHALL be the sum of
`damagesTable.tdReplacementCostTotal` across the same rows, treating a missing value as `0`.

#### Scenario: Multiple damages rows summed
- **WHEN** a disaster record has three `damagesTable` rows with `pdRepairCostTotal` values of
  `100`, `200`, and `null`
- **THEN** the record's repair cost contribution SHALL be `300`

---

### Requirement: Rehabilitation cost calculation
The rehabilitation cost contribution of a disaster record SHALL be the sum of
`disruptionTable.responseCost` across all `disruptionTable` rows for that record, treating a
missing value as `0`.

#### Scenario: Multiple disruption rows summed
- **WHEN** a disaster record has two `disruptionTable` rows with `responseCost` values of `50`
  and `null`
- **THEN** the record's rehabilitation cost contribution SHALL be `50`

---

### Requirement: Recovery cost calculation — two-level fallback per sector-relation row
The recovery cost contribution SHALL be computed by iterating every
`sectorDisasterRecordsRelationTable` row belonging to the event's linked disaster records. For
each such row: if `damageRecoveryCost` is set to a non-null value (including an explicit `0`),
that value SHALL be added to the total and `damagesTable` SHALL NOT be consulted for that row. If
`damageRecoveryCost` is `null`, the total SHALL instead be increased by the sum of
`damagesTable.totalRecovery` for every `damagesTable` row matching that row's exact
`(disasterRecordId, sectorId)` pair. A `damagesTable` row whose `(recordId, sectorId)` pair has no
corresponding `sectorDisasterRecordsRelationTable` row SHALL NOT contribute to the total.

#### Scenario: Explicit override present
- **WHEN** a sector-relation row has `damageRecoveryCost = 500`
- **THEN** `500` SHALL be added to the recovery cost total
- **AND** `damagesTable.totalRecovery` for that record+sector pair SHALL NOT be added

#### Scenario: Explicit zero override is still an override, not a fallback trigger
- **WHEN** a sector-relation row has `damageRecoveryCost` explicitly set to `0`
- **THEN** `0` SHALL be added to the recovery cost total
- **AND** `damagesTable.totalRecovery` for that record+sector pair SHALL NOT be added, even if
  non-zero damages rows exist for that exact pair

#### Scenario: No override — fallback to damages sum
- **WHEN** a sector-relation row has `damageRecoveryCost = null` and two `damagesTable` rows exist
  for that exact `(disasterRecordId, sectorId)` pair with `totalRecovery` values of `100` and `50`
- **THEN** `150` SHALL be added to the recovery cost total

#### Scenario: No override and no matching damages rows
- **WHEN** a sector-relation row has `damageRecoveryCost = null` and no `damagesTable` row matches
  that row's exact `(disasterRecordId, sectorId)` pair
- **THEN** that sector-relation row SHALL contribute `0` to the recovery cost total

#### Scenario: Damages row with no corresponding sector-relation row is excluded
- **WHEN** a disaster record has a `damagesTable` row for a `(recordId, sectorId)` pair that has
  no corresponding `sectorDisasterRecordsRelationTable` row
- **THEN** that `damagesTable` row's `totalRecovery` SHALL NOT be included in the recovery cost
  total under any circumstance

---

### Requirement: Recalculation is triggered on create, update, and delete of contributing data
Every create, update, and delete operation on `damagesTable`, `disruptionTable`, or
`sectorDisasterRecordsRelationTable` rows, and every update of `disasterRecordsTable.disasterEventId`
(but not creation of a new disaster record), SHALL trigger a call to
`recalculateCostsForDisasterRecord` for the affected record, so that the linked disaster event's
cached cost totals never remain stale after a change to their contributing data.

#### Scenario: Deleting a damages row triggers recalculation
- **WHEN** a `damagesTable` row belonging to a disaster record that is linked to a disaster event
  is deleted (via `damagesDeleteById` or `damagesDeleteBySectorId`)
- **THEN** `recalculateCostsForDisasterRecord` SHALL be called for that row's `recordId` after
  the delete completes

#### Scenario: Deleting a disruption row triggers recalculation
- **WHEN** a `disruptionTable` row belonging to a disaster record that is linked to a disaster
  event is deleted (via `disruptionDeleteById` or `disruptionDeleteBySectorId`)
- **THEN** `recalculateCostsForDisasterRecord` SHALL be called for that row's `recordId` after
  the delete completes

#### Scenario: Deleting a sector-relation row triggers recalculation
- **WHEN** a `sectorDisasterRecordsRelationTable` row belonging to a disaster record that is
  linked to a disaster event is deleted (via `disRecSectorsDeleteById` or
  `deleteRecordsDeleteById`)
- **THEN** `recalculateCostsForDisasterRecord` SHALL be called for that row's
  `disasterRecordId` after the delete completes

#### Scenario: Creating a new disaster record does not trigger recalculation
- **WHEN** a new `disasterRecordsTable` row is created (`disasterRecordsCreate`)
- **THEN** `recalculateCostsForDisasterRecord` SHALL NOT be called, since a newly created record
  has no breakdown data yet to roll up

---

### Requirement: Concurrent recalculation of the same disaster event
Because the four `*Calc` columns are shared mutable state recomputed and overwritten (not
incremented) by every triggering write, and no locking or shared transaction ties a triggering
write to its recalculation, two callers that trigger recalculation for the **same**
`disasterEventId` at overlapping times SHALL each independently query the current database state
and persist their own full recomputation. The system SHALL NOT guarantee that the recalculation
which was **triggered** later is also the one that **persists** last — the final persisted value
SHALL be whichever recalculation's `UPDATE` commits last, which MAY reflect a database snapshot
taken before the other caller's write became visible.

#### Scenario: Two concurrent callers recalculating the same event
- **WHEN** two callers each trigger `recalculateCostsForDisasterEvent` for the same
  `disasterEventId` at overlapping times, following two different underlying writes to that
  event's contributing data
- **THEN** two independent `SELECT`-then-aggregate-then-`UPDATE` cycles SHALL occur (no
  deduplication or coalescing of concurrent recalculation requests for the same event)
- **AND** the disaster event's `*Calc` columns after both complete SHALL equal whichever
  recalculation's `UPDATE` was applied last, by commit order, not by trigger order — this is a
  known, pre-existing limitation carried forward unchanged by this extraction, not a guarantee of
  eventual consistency with the very latest write
