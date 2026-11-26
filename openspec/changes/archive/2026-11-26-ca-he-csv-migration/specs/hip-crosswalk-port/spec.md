## ADDED Requirements

### Requirement: resolve() accepts an optional transaction

`IHipCrosswalkPort.resolve(specificHazardId, tx?)` SHALL accept an optional `tx`. When it is
given, the lookup MUST run on that transaction (ca-he-csv-migration NOD-12). Without `tx`,
behaviour is unchanged. The port stays temporary scaffolding (DEF-055).

#### Scenario: resolve inside an open transaction uses it

- **GIVEN** an open transaction `tx` on the PGlite test database
- **WHEN** `resolve(S, tx)` is called before `tx` commits, for a specific hazard S with HIP
  source refs
- **THEN** it resolves with S's HIP ids without deadlocking

#### Scenario: Concurrent callers without tx are unaffected

- **WHEN** two `resolve(S)` calls without `tx` run at the same time
- **THEN** both resolve to equal results, as before this change
