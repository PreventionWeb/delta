## ADDED Requirements

### Requirement: The lookup accepts an optional transaction

`GetWorkflowInstanceByEntityUseCase.execute({ entityId, entityType, tx? })` SHALL pass an
optional `tx` to `IWorkflowRepository.findByEntity`, so a caller inside an open transaction
sees an instance created earlier in it and needs no second connection (ca-he-csv-migration
NOD-12). Without `tx`, behaviour is unchanged. It still does not log.

#### Scenario: An instance inserted in the same transaction is returned

- **GIVEN** a transaction `tx` in which a DRAFT instance for entity E was inserted
- **WHEN** `execute({ entityId: E, entityType: "HE", tx })` is called before commit
- **THEN** it resolves with that instance

#### Scenario: Concurrent callers without tx are unaffected

- **WHEN** two calls without `tx` for the same entity run at the same time
- **THEN** each resolves independently, as the existing concurrency requirement states
