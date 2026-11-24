## ADDED Requirements

### Requirement: Read-by-id methods treat a malformed id as not found

`findById`, `findByIdForUpdate` and `delete` SHALL treat an `id` that is not a well-formed UUID
(hyphenated 8-4-4-4-12 hexadecimal, any letter case) exactly like an id that matches no row in the
tenant, and SHALL decide this before sending any query: `findById` and `findByIdForUpdate` SHALL
reject with `NotFoundError`, and `delete` SHALL resolve normally without deleting anything (its
existing no-throw-on-no-match contract, requirement "delete is tenant-scoped"). Because no query
is sent, a caller's open transaction SHALL stay usable. No raw driver error, SQL text or SQLSTATE
SHALL cross the port for this case. A Postgres `22P02` for a well-formed `id` (for example a
malformed `tenantId`) and any other driver failure SHALL propagate unchanged. Write-path mapping (`insert`/`update`, where `22P02` means malformed
column data and maps to `ValidationError`) is unchanged.

#### Scenario: findById with a malformed id

- **WHEN** `findById("not-a-uuid", tenantId)` is called
- **THEN** it SHALL reject with `NotFoundError`
- **AND** the rejection SHALL NOT be a driver error and SHALL NOT carry SQL text in its message

#### Scenario: findByIdForUpdate with a malformed id inside a transaction

- **GIVEN** an open transaction `tx`
- **WHEN** `findByIdForUpdate("not-a-uuid", tenantId, tx)` is called
- **THEN** it SHALL reject with `NotFoundError`
- **AND** a following query on the same `tx` SHALL succeed

#### Scenario: findById with a malformed id inside a transaction leaves it usable

- **GIVEN** an open transaction `tx`
- **WHEN** `findById("not-a-uuid", tenantId, tx)` rejects with `NotFoundError`
- **THEN** a following `findById` of an existing event on the same `tx` SHALL resolve it

#### Scenario: An uppercase id still resolves

- **WHEN** `findById` is called with an existing event's id written in uppercase
- **THEN** it SHALL resolve that event

#### Scenario: A malformed tenantId is not reported as not found

- **WHEN** `findById(<well-formed uuid>, "not-a-uuid")` or `delete(<existing id>, "not-a-uuid")` is called
- **THEN** it SHALL reject with the driver's `22P02` error, not `NotFoundError`
- **AND** nothing SHALL be deleted

#### Scenario: delete with a malformed id

- **GIVEN** a tenant with existing hazardous events
- **WHEN** `delete("not-a-uuid", tenantId)` is called
- **THEN** it SHALL resolve normally, the same as for a well-formed id with no matching row
- **AND** every existing hazardous event, `event_relationship` and `event` row SHALL remain

#### Scenario: Malformed id and missing id behave the same

- **WHEN** `findById` is called once with `"not-a-uuid"` and once with a well-formed UUID that matches no row in the tenant
- **THEN** both calls SHALL reject with `NotFoundError` with the same `code`

#### Scenario: A different driver failure still propagates

- **WHEN** `findById` is called with a well-formed id and the database query fails with any driver error
- **THEN** the original error SHALL propagate unchanged, not as `NotFoundError`

#### Scenario: Concurrent malformed lookups

- **WHEN** `findById("bad-1", tenantId)` and `findById("bad-2", tenantId)` run at the same time
- **THEN** each SHALL reject with its own `NotFoundError` and neither SHALL leave a connection or transaction in an aborted state for later queries
