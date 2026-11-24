## MODIFIED Requirements

### Requirement: Notices list loader throws a structured error response for DomainError

The list loader SHALL throw `Response.json(errorResponse, { status: err.statusHint })` when
`ListNoticesUseCase.execute()` rejects with an instance of `DomainError`, where `errorResponse`
follows the ADR-003 envelope: `{ success: false, error: { code, message, details?, traceId,
timestamp } }`. `details` MUST be present only when `err` is a `ValidationError` whose `context`
has a string `field` property, and MUST then equal exactly `{ field }`; for every other
`DomainError` `details` MUST be absent. `traceId` MUST be `getRequestContext()?.traceId` when a
request-context store is active, or a freshly generated UUID otherwise.

#### Scenario: Use case throws NoticeNotFoundError-style DomainError

- **WHEN** `ListNoticesUseCase.execute()` rejects with a `DomainError` subclass whose
  `code` is `"NOT_FOUND"`, `statusHint` is `404`, and `context` is `undefined`
- **THEN** the loader MUST throw a `Response` with status `404`
- **AND** the thrown response body's `error.code` MUST equal `"NOT_FOUND"`
- **AND** the thrown response body MUST NOT have an `error.details` property

#### Scenario: Use case throws a DomainError with context

- **WHEN** `ListNoticesUseCase.execute()` rejects with a `DomainError` whose `context` is
  `{ entity: "Notice", id: "abc" }`
- **THEN** the thrown response body MUST NOT have an `error.details` property
- **AND** the body MUST NOT contain `"abc"`

#### Scenario: Use case throws a ValidationError with a field

- **WHEN** `ListNoticesUseCase.execute()` rejects with `new ValidationError("bad query", { field: "page" })`
- **THEN** the thrown response body's `error.details` MUST equal `{ field: "page" }`

#### Scenario: traceId is sourced from the active request context

- **WHEN** `ListNoticesUseCase.execute()` rejects with a `DomainError`
- **AND** `getRequestContext()` returns a store with `traceId: "trace-123"`
- **THEN** the thrown response body's `error.traceId` MUST equal `"trace-123"`
