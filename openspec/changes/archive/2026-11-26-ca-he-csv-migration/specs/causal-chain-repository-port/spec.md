## ADDED Requirements

### Requirement: findReachableEdgesFrom accepts an optional transaction

`ICausalChainRepository.findReachableEdgesFrom(nodeId, tx?)` SHALL accept an optional `tx`.
When it is given, the read MUST run on that transaction, and it SHALL see edges written earlier
in it (ca-he-csv-migration NOD-12). Without `tx`, behaviour is unchanged. The in-transaction
recheck in `replaceCauseEdge` stays authoritative.

#### Scenario: An edge written earlier in the same transaction is seen

- **GIVEN** a transaction `tx` in which edge A→B was saved
- **WHEN** `findReachableEdgesFrom("A", tx)` is called before commit
- **THEN** the result includes A→B

#### Scenario: Concurrent callers without tx are unaffected

- **WHEN** two calls without `tx` run at the same time
- **THEN** both resolve to the committed edges only, as before this change
