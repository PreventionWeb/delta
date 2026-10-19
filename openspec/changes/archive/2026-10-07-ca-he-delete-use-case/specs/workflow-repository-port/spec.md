## MODIFIED Requirements

### Requirement: IWorkflowRepository interface compiles as a valid, framework-free TypeScript port

The file `app/domains/validation-workflow/application/ports/IWorkflowRepository.ts` MUST
export an interface named `IWorkflowRepository`. It MUST declare exactly the four
methods described below with the exact signatures shown. The file MUST NOT import from
any Drizzle, NestJS, or Remix module — only from
`app/domains/validation-workflow/domain/WorkflowInstance.ts` and shared value types.
`yarn tsc` MUST succeed with zero errors referencing this file.

#### Scenario: TypeScript compilation succeeds

- **GIVEN** `IWorkflowRepository.ts` is written with the correct method signatures and no
  disallowed imports
- **WHEN** `yarn tsc` is run
- **THEN** it MUST exit with code 0 and zero type errors referencing this file

## ADDED Requirements

### Requirement: deleteByEntity removes the WorkflowInstance for a given entity, idempotently

`IWorkflowRepository.deleteByEntity(entityId: string, entityType: 'HE' | 'DE' | 'DR'):
Promise<void>` MUST be declared on the interface. It MUST remove the `WorkflowInstance`
matching `entityId` and `entityType`, if one exists. When no such instance exists, it MUST
resolve normally — it MUST NOT throw `NotFoundError` or any other error, matching this port's
existing idempotent-write posture (`save`'s own insert-or-update tolerance) and
`IHazardousEventRepository.delete`'s own established no-op-on-missing-row contract.

#### Scenario: Method signature is present with correct arity

- **GIVEN** the `IWorkflowRepository` interface
- **WHEN** a TypeScript class declares `implements IWorkflowRepository` and omits
  `entityType` from `deleteByEntity`
- **THEN** `yarn tsc` MUST report a type error

#### Scenario: An existing WorkflowInstance is removed

- **GIVEN** an implementation of `IWorkflowRepository` with a saved `WorkflowInstance` for a
  given `entityId`/`entityType`
- **WHEN** `deleteByEntity(entityId, entityType)` is called
- **THEN** `findByEntity(entityId, entityType)` MUST subsequently resolve `null`

#### Scenario: Calling deleteByEntity for an entity with no existing instance is a no-op, not an error

- **GIVEN** an implementation of `IWorkflowRepository` and an `entityId`/`entityType` pair with
  no saved `WorkflowInstance`
- **WHEN** `deleteByEntity(entityId, entityType)` is called
- **THEN** it MUST resolve normally
- **AND** it MUST NOT throw or reject the `Promise`

#### Scenario: Calling deleteByEntity twice for the same entity is idempotent

- **GIVEN** an implementation of `IWorkflowRepository` with a saved `WorkflowInstance` for a
  given `entityId`/`entityType`
- **WHEN** `deleteByEntity(entityId, entityType)` is called twice in sequence
- **THEN** neither call MUST throw
- **AND** `findByEntity(entityId, entityType)` MUST resolve `null` after both calls

### Requirement: deleteByEntity does not accept a tenantId parameter

`deleteByEntity` MUST NOT declare a `tenantId` parameter of any kind, matching every other
method on this port (`findByEntity`, `findByEntityIds`, `save`) and `workflow_instance`'s own
lack of a tenant column.

#### Scenario: No method signature includes tenantId

- **GIVEN** the `IWorkflowRepository` interface signature
- **WHEN** the full method list (`findByEntity`, `findByEntityIds`, `save`, `deleteByEntity`)
  is inspected
- **THEN** none of the four MUST declare a `tenantId` parameter
