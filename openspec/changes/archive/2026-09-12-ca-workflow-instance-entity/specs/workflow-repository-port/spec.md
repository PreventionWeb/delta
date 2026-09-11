## Purpose

Defines the Dependency Inversion boundary between the application layer and a future
persistence adapter for `WorkflowInstance`, including the batched lookup contract that
list views must use instead of an N+1 query or a direct reach into `workflowInstanceTable`.

## ADDED Requirements

### Requirement: IWorkflowRepository interface compiles as a valid, framework-free TypeScript port

The file `app/domains/validation-workflow/application/ports/IWorkflowRepository.ts` MUST
export an interface named `IWorkflowRepository`. It MUST declare exactly the three
methods described below with the exact signatures shown. The file MUST NOT import from
any Drizzle, NestJS, or Remix module — only from
`app/domains/validation-workflow/domain/WorkflowInstance.ts` and shared value types.
`yarn tsc` MUST succeed with zero errors referencing this file.

#### Scenario: TypeScript compilation succeeds

- **GIVEN** `IWorkflowRepository.ts` is written with the correct method signatures and no
  disallowed imports
- **WHEN** `yarn tsc` is run
- **THEN** it MUST exit with code 0 and zero type errors referencing this file

### Requirement: findByEntity performs a single polymorphic lookup and returns null rather than throwing when absent

`IWorkflowRepository.findByEntity(entityId: string, entityType: 'HE' | 'DE' | 'DR'):
Promise<WorkflowInstance | null>` MUST be declared on the interface. When no
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

### Requirement: findByEntityIds performs one batched lookup for list views, avoiding N+1 and direct cross-module table access

`IWorkflowRepository.findByEntityIds(entityIds: string[], entityType: 'HE' | 'DE' |
'DR'): Promise<WorkflowInstance[]>` MUST be declared on the interface. It MUST accept
multiple `entityId`s of the same `entityType` in a single call and MUST resolve to an
array containing only the `WorkflowInstance`s that exist for those ids — entities with no
instance yet are simply omitted from the result, not represented as `null` entries. This
is the only sanctioned way for a list-view consumer to obtain workflow status for many
entities at once; it exists specifically so that consumer never needs to call
`findByEntity` once per row (N+1) and never needs to query `workflowInstanceTable`
directly from outside `validation-workflow`.

#### Scenario: Method signature accepts an array of entityIds and returns an array

- **GIVEN** the `IWorkflowRepository` interface
- **WHEN** a TypeScript class declares `implements IWorkflowRepository` with
  `findByEntityIds` typed to accept a single `string` instead of `string[]`
- **THEN** `yarn tsc` MUST report a type error

#### Scenario: A batched call with a mix of existing and non-existing entityIds returns only the existing ones

- **GIVEN** an implementation of `IWorkflowRepository` and three `entityId`s of type
  `'HE'`, where instances exist for the first and third but not the second
- **WHEN** `findByEntityIds([id1, id2, id3], 'HE')` is called
- **THEN** it MUST resolve to an array containing exactly the two `WorkflowInstance`s for
  `id1` and `id3`
- **AND** it MUST NOT contain a `null` or `undefined` placeholder for `id2`

### Requirement: save persists a WorkflowInstance and returns the saved state

`IWorkflowRepository.save(instance: WorkflowInstance): Promise<WorkflowInstance>` MUST be
declared on the interface. It MUST accept a `WorkflowInstance` domain entity and resolve
to a `WorkflowInstance` reflecting the persisted state. An implementation MAY perform
either an INSERT or an UPDATE depending on whether an instance already exists for that
entity.

#### Scenario: Method signature is present

- **GIVEN** the `IWorkflowRepository` interface
- **WHEN** a TypeScript class omits the `save` method
- **THEN** `yarn tsc` MUST report a type error for the missing implementation

### Requirement: No method on IWorkflowRepository accepts a tenantId parameter

`findByEntity`, `findByEntityIds`, and `save` MUST NOT declare a `tenantId` parameter of
any kind. This matches `workflowInstanceTable`'s own deliberate omission of
`countryAccountsId` — tenant-ownership validation is the responsibility of the caller's
own aggregate repository before it reaches this port, not this port's own responsibility.

#### Scenario: No method signature includes tenantId

- **GIVEN** the `IWorkflowRepository` interface signature
- **WHEN** the full method list (`findByEntity`, `findByEntityIds`, `save`) is inspected
- **THEN** none of the three MUST declare a `tenantId` parameter
