## ADDED Requirements

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
