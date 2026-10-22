## MODIFIED Requirements

### Requirement: `findValidDivisionIds` resolves the subset of `ids` that exist under `tenantId`

`IDivisionRepository.findValidDivisionIds(ids, tenantId, tx?)` MUST resolve a `ReadonlySet<string>`
containing exactly the `ids` entries present in `division` under `tenantId`, and MUST resolve
(never reject) for a non-existent id or an empty `ids` array. It MUST accept an optional trailing
`tx?: Tx` parameter (`Tx` from `app/db.server.ts`), matching the convention established for every
other port in this codebase. When `tx` is supplied, the lookup MUST execute against that same `tx`,
not a separate connection, so a caller invoking this method from inside its own already-open
transaction (e.g. `RecordSpatialObservationUseCase`, when itself nested inside
`UpdateHazardousEventUseCase`'s open transaction) observes that transaction's own uncommitted
writes rather than a stale view from a different connection. When `tx` is omitted, behavior is
unchanged from before this parameter existed — the lookup executes against the module-level
connection.

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

#### Scenario: When called under a caller-supplied tx, the lookup reflects that transaction's own uncommitted writes

- **GIVEN** an open transaction handle `tx` under which a `division` row valid for the queried
  `tenantId` has been inserted but not yet committed
- **WHEN** `findValidDivisionIds([thatDivisionId], tenantId, tx)` is called
- **THEN** the resolved set MUST include that id — a read via a separate connection would not see
  it; this method MUST NOT use a separate connection when `tx` is supplied

#### Scenario: Omitting tx leaves existing behavior unchanged

- **GIVEN** no `tx` argument is supplied
- **WHEN** `findValidDivisionIds(ids, tenantId)` is called
- **THEN** the call behaves exactly as it did before this parameter was added, executing against
  the module-level connection
