## REMOVED Requirements

### Requirement: HE list and detail loaders log and rethrow non-DomainError failures

**Reason**: ADR-003 Layer 4 requires a programmer error to reach the client as a generic 500
error envelope carrying the request `traceId`, so the user can quote an error reference. A raw
rethrow reaches the browser sanitized and without any trace reference (ca-he-error-boundary
design.md D4, OD-4).

**Migration**: Replaced by "HE route loaders and actions turn a non-DomainError failure into a
generic 500 error envelope". Tests asserting that the same `Error` instance is rethrown are updated
to assert the 500 envelope.

## ADDED Requirements

### Requirement: HE route loaders and actions turn a non-DomainError failure into a generic 500 error envelope

When a he-preview loader or action (list, detail, create, edit, picker, and the delete action's
unexpected-error path) handles a failure that is not an instance of `DomainError` and not a thrown
`Response`, it SHALL log the failure at `error` level with the error and the request URL, and
SHALL then throw an HTTP 500 response whose body is the ADR-003 envelope
`{ success: false, error: { code: "INTERNAL_ERROR", message, traceId, timestamp } }`. `message`
SHALL be a fixed generic text that contains nothing from the original error. `details` SHALL be
absent. `traceId` SHALL be the active request context's `traceId` when one exists, or a freshly
generated UUID otherwise. A thrown `Response` (for example a redirect) SHALL propagate unchanged.

#### Scenario: Use case throws a plain Error

- **WHEN** the detail loader's use case rejects with `new Error("DB connection lost")`
- **THEN** the error logger SHALL be called exactly once with that error and the request URL
- **AND** the loader SHALL throw a Response with status 500
- **AND** the body's `error.code` SHALL equal `"INTERNAL_ERROR"`
- **AND** the body SHALL NOT contain "DB connection lost" anywhere
- **AND** the body SHALL NOT have a `details` property

#### Scenario: traceId comes from the request context

- **WHEN** a loader's use case rejects with a plain `Error`
- **AND** the active request context has `traceId: "trace-500"`
- **THEN** the thrown body's `error.traceId` SHALL equal `"trace-500"`
- **AND** the logged record SHALL carry the same `traceId`

#### Scenario: A thrown redirect is not converted

- **WHEN** the value handled is a `Response` with status 302
- **THEN** that same `Response` SHALL propagate unchanged and nothing SHALL be logged at `error`

#### Scenario: Concurrent failing requests keep their own trace ids

- **WHEN** two requests with request-context trace ids "trace-a" and "trace-b" fail with plain errors at the same time
- **THEN** the response for the first SHALL carry "trace-a" and the response for the second "trace-b"

### Requirement: HE UI route loaders load their translation namespaces before any check can fail

The list, detail, create, edit and picker loaders, and the create and edit actions, SHALL load the
`hazardous-events` and `common` translation namespaces for the request language before running
any authentication, tenant, permission or use-case step that can throw, so that an error state
rendered for that request is fully translated.

#### Scenario: Permission failure still has translations loaded

- **GIVEN** a signed-in user whose role lacks ViewData
- **WHEN** the detail loader runs for `/fr/he-preview/<uuid>`
- **THEN** it SHALL throw a 403 error response
- **AND** the request's i18n instance SHALL already have the French `hazardous-events` namespace loaded

#### Scenario: Not-found on edit still has translations loaded

- **WHEN** the edit loader runs for a UUID with no event in the user's tenant
- **THEN** it SHALL throw a 404 error response
- **AND** the request's i18n instance SHALL already have the `hazardous-events` namespace loaded

#### Scenario: Unauthenticated request still redirects

- **WHEN** any of these loaders runs without a signed-in session
- **THEN** it SHALL redirect to the login page exactly as before

## MODIFIED Requirements

### Requirement: HE list and detail loaders throw a structured error response for a DomainError

Each loader SHALL throw `Response.json(errorResponse, { status: err.statusHint })` when its
resolved use case's `execute()` rejects with an instance of `DomainError`, where `errorResponse`
follows the ADR-003 envelope: `{ success: false, error: { code, message, details?, traceId,
timestamp } }`. `details` MUST be present only when `err` is a `ValidationError` whose `context`
has a string `field` property, and MUST then equal exactly `{ field }`; for every other
`DomainError`, and for a `ValidationError` without a string `field`, `details` MUST be absent, and
no `context` property other than `field` MAY be copied into the body. `message` is the error's own
message and is not affected by this requirement. `traceId` MUST be
`getRequestContext()?.traceId` when a request-context store is active, or a freshly generated UUID
otherwise.

#### Scenario: Detail loader — unknown or cross-tenant id

- **WHEN** `GetHazardousEventByIdUseCase.execute()` rejects with `NotFoundError` for an id that
  does not exist, or exists under a different tenant
- **THEN** the detail loader MUST throw a `Response` with status `404`
- **AND** the thrown response body's `error.code` MUST equal `"NOT_FOUND"`
- **AND** the thrown response body MUST NOT have an `error.details` property
- **AND** the body MUST NOT contain the requested id

#### Scenario: List loader — a DomainError with context

- **WHEN** `ListHazardousEventsUseCase.execute()` rejects with `new ValidationError("bad query", { field: "page" })`
- **THEN** the thrown response body's `error.details` MUST equal `{ field: "page" }`

#### Scenario: Extra context keys on a ValidationError are dropped

- **WHEN** a loader's use case rejects with `new ValidationError("bad", { field: "page", tenantId: "t-1", sql: "select 1" })`
- **THEN** `error.details` MUST equal `{ field: "page" }`
- **AND** the body MUST NOT contain `"t-1"` or `"select 1"`

#### Scenario: Conflict context is never sent

- **WHEN** a loader or action handles `new ConflictError("x", { id: "he-1", tenantId: "t-1", reason: "OTHER" })`
- **THEN** the thrown response body MUST NOT have an `error.details` property

#### Scenario: traceId is sourced from the active request context

- **WHEN** either loader's use case rejects with a `DomainError`
- **AND** `getRequestContext()` returns a store with `traceId: "trace-123"`
- **THEN** the thrown response body's `error.traceId` MUST equal `"trace-123"`
