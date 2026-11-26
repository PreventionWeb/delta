## MODIFIED Requirements

### Requirement: findByEntity performs a single polymorphic lookup and returns null rather than throwing when absent

`IWorkflowRepository.findByEntity(entityId: string, entityType: 'HE' | 'DE' | 'DR', tx?: Tx):
Promise<WorkflowInstance | null>` MUST be declared on the interface. When `tx` is given, the read
MUST run on that transaction, so an instance inserted earlier in the same uncommitted transaction
is found (needed by `ApplyImportedWorkflowStatusUseCase`, ca-he-csv-migration D12). Without
`tx`, behaviour is unchanged. When no
`WorkflowInstance` exists for the given `entityId` + `entityType` pair, an implementation
MUST resolve to `null` — it MUST NOT throw `NotFoundError` and MUST NOT reject the
returned `Promise`. This deliberately diverges from `INoticeRepository.findById`'s
throw-based contract: a workflow instance may legitimately not exist yet for a given
entity.

#### Scenario: Method signature is present with correct arity

- **GIVEN** the `IWorkflowRepository` interface
- **WHEN** a TypeScript class declares `implements IWorkflowRepository` and omits
  `entityType` from `findByEntity`
- **THEN** `yarn tsc` MUST report a type error

#### Scenario: No matching instance resolves to null, not a thrown error

- **GIVEN** an implementation of `IWorkflowRepository`
- **WHEN** `findByEntity` is called with an `entityId` + `entityType` pair that has no
  corresponding row
- **THEN** it MUST resolve to `null`
- **AND** it MUST NOT throw or reject the `Promise`

#### Scenario: An instance inserted in the same transaction is found with tx

- **GIVEN** a transaction `tx` in which a WorkflowInstance for entity E was inserted
- **WHEN** `findByEntity(E, "HE", tx)` is called before commit
- **THEN** it MUST resolve to that instance
