## ADDED Requirements

### Requirement: DomainErrorFilter maps each DomainError subtype to the correct HTTP status code

`DomainErrorFilter` in `app/infrastructure/DomainErrorFilter.server.ts` SHALL be a NestJS
`ExceptionFilter` decorated with `@Catch()` (catch-all, not `@Catch(DomainError)`) so it
intercepts both `DomainError` subtypes and unknown exceptions from a single filter. When a
`DomainError` is thrown by a controller or its dependencies, the filter MUST write an HTTP
response with the status code equal to `err.statusHint` and the `ErrorResponse` body shape
defined in ADR-003. The filter MUST NOT re-throw the exception after writing the response.

#### Scenario: NotFoundError maps to 404

- **GIVEN** a controller action throws `new NotFoundError('Notice', 'abc-123')`
- **WHEN** the HTTP request is processed by the NestJS HTTP app
- **THEN** the response status SHALL be 404
- **AND** the response body SHALL match `{ success: false, error: { code: "NOT_FOUND", message: "Notice not found", traceId: <string>, timestamp: <iso8601> } }`

#### Scenario: ValidationError maps to 422

- **GIVEN** a controller action throws `new ValidationError('Title must not be empty')`
- **WHEN** the HTTP request is processed by the NestJS HTTP app
- **THEN** the response status SHALL be 422
- **AND** the response body SHALL match `{ success: false, error: { code: "VALIDATION_ERROR", message: "Title must not be empty", traceId: <string>, timestamp: <iso8601> } }`

#### Scenario: AuthorizationError maps to 403

- **GIVEN** a controller action throws `new AuthorizationError('Insufficient permissions')`
- **WHEN** the HTTP request is processed by the NestJS HTTP app
- **THEN** the response status SHALL be 403
- **AND** the response body SHALL match `{ success: false, error: { code: "FORBIDDEN", message: "Insufficient permissions", traceId: <string>, timestamp: <iso8601> } }`

#### Scenario: ConflictError maps to 409

- **GIVEN** a controller action throws `new ConflictError('Notice already exists')`
- **WHEN** the HTTP request is processed by the NestJS HTTP app
- **THEN** the response status SHALL be 409
- **AND** the response body SHALL match `{ success: false, error: { code: "CONFLICT", message: "Notice already exists", traceId: <string>, timestamp: <iso8601> } }`

### Requirement: DomainErrorFilter includes context details when present

When the thrown `DomainError` has a non-empty `context` property, the filter MUST include
that value as `error.details` in the `ErrorResponse` body. When `context` is `undefined`,
the `details` field SHALL be omitted from the response body (not set to `null`).

#### Scenario: Error with context includes details in response

- **GIVEN** a controller action throws `new NotFoundError('Notice', 'abc-123')` which sets
  `context = { entity: 'Notice', id: 'abc-123' }`
- **WHEN** the HTTP request is processed
- **THEN** the response body SHALL include `error.details = { entity: 'Notice', id: 'abc-123' }`

#### Scenario: Error without context omits details from response

- **GIVEN** a controller action throws `new ValidationError('Title must not be empty')` with
  no `context` argument
- **WHEN** the HTTP request is processed
- **THEN** the response body SHALL NOT contain an `error.details` field

### Requirement: DomainErrorFilter response includes traceId and timestamp on every error

Every `ErrorResponse` produced by `DomainErrorFilter` MUST include a `traceId` field
containing a UUID-format string generated at filter invocation time, and a `timestamp` field
containing the UTC ISO 8601 datetime at which the error was processed.

#### Scenario: traceId is a valid UUID

- **GIVEN** a controller action throws any `DomainError`
- **WHEN** the filter writes the response
- **THEN** `error.traceId` SHALL match the UUID v4 pattern `/^[0-9a-f-]{36}$/i`

#### Scenario: timestamp is UTC ISO 8601

- **GIVEN** a controller action throws any `DomainError`
- **WHEN** the filter writes the response
- **THEN** `error.timestamp` SHALL be parseable by `new Date()` without returning `Invalid Date`

### Requirement: DomainErrorFilter is registered globally via APP_FILTER in CoreModule

`CoreModule` in `app/infrastructure/CoreModule.server.ts` MUST register `DomainErrorFilter`
as a global filter using the `APP_FILTER` token from `@nestjs/core` in the `providers` array,
so that the filter applies to every controller registered in the HTTP application without
requiring per-controller decoration.

#### Scenario: Filter applies to all controllers without explicit decoration

- **GIVEN** `DomainErrorFilter` is registered via `APP_FILTER` in `CoreModule`
- **AND** a new controller is added to any module imported by `CoreModule` without any filter decoration
- **WHEN** that controller throws a `DomainError`
- **THEN** the response SHALL still be the correct `ErrorResponse` envelope with the correct status code

> **Test requirement:** This scenario MUST have a dedicated `it()` block that creates a second
> stub controller in a nested module (no explicit filter decorator) and asserts the filter
> still intercepts its errors. Implicit coverage by other tests is insufficient — a change from
> `APP_FILTER` to `useGlobalFilters()` would make all other tests pass while breaking this requirement.

### Requirement: DomainErrorFilter returns a generic 500 for unhandled exceptions

When an exception that is NOT a `DomainError` subtype reaches the filter's catch boundary
(i.e. an unhandled programmer error), the filter MUST return HTTP status 500 with an
`ErrorResponse` body whose `error.code` is `"INTERNAL_ERROR"` and whose `error.message`
is a safe generic string. Internal error details and stack traces MUST NOT be included in
the response body.

Note: `DomainErrorFilter` is decorated with `@Catch()` (catch-all) and internally discriminates
between `DomainError` subtypes and all other exception types. If it were decorated with
`@Catch(DomainError)` instead, unknown exceptions would fall through to NestJS's built-in
`DefaultExceptionFilter`, which returns a response shape that violates the ADR-003 contract.

#### Scenario: Unknown exception returns 500 with generic message

- **GIVEN** a controller action throws `new Error('Database connection lost')`
- **WHEN** the HTTP request is processed
- **THEN** the response status SHALL be 500
- **AND** the response body SHALL match `{ success: false, error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred. Please try again later.", traceId: <string>, timestamp: <iso8601> } }`
- **AND** the response body SHALL NOT contain "Database connection lost" or any stack trace fragment

#### Scenario: NestJS HttpException passes through its own status code wrapped in ErrorResponse

- **GIVEN** a controller action throws `new NotFoundException()` from `@nestjs/common`
- **WHEN** the HTTP request is processed
- **THEN** the response status SHALL be 404 (the HttpException's own status — not 500)
- **AND** the response body SHALL match `{ success: false, error: { code: "HTTP_ERROR", message: <string>, traceId: <string>, timestamp: <iso8601> } }`

> **Rationale:** NestJS throws `HttpException` subtypes for infrastructure conditions such as
> unmatched routes (NotFoundException → 404) and ValidationPipe failures (BadRequestException → 400).
> Mapping these to 500 produces incorrect HTTP semantics. The filter passes through the framework
> status code while still enforcing the ADR-003 ErrorResponse envelope.

#### Scenario: HttpException with structured payload preserves field-level details in response

- **GIVEN** a controller action throws `new BadRequestException({ message: ['title must not be empty'], error: 'Bad Request', statusCode: 400 })`
- **WHEN** the HTTP request is processed
- **THEN** the response status SHALL be 400
- **AND** `error.code` SHALL be `"HTTP_ERROR"`
- **AND** `error.details` SHALL contain the full structured payload from `exception.getResponse()`

> **Implementation note:** The filter MUST use `exception.getResponse()` (not `exception.message`)
> to extract the payload. If `getResponse()` returns an object, `error.message` is set to
> `exception.message` (the human-readable summary) and the full object is surfaced as
> `error.details`. If `getResponse()` returns a plain string, it is used as `error.message`
> with no `details` field. This preserves field-level validation errors from ValidationPipe
> (5c) while remaining backward-compatible with string-only HttpExceptions.

### Requirement: DomainErrorFilter logs unhandled exceptions server-side with the traceId

When an unknown exception reaches the filter (not a `DomainError` and not an `HttpException`),
the filter MUST log the exception server-side before writing the 500 response, using the same
`traceId` that appears in the response body. The log entry SHALL include the `traceId` and the
original exception so that the client-facing traceId can be correlated with the server-side
stack trace. The exception MUST NOT be surfaced in the HTTP response body.

#### Scenario: Unknown exception is logged server-side with traceId

- **GIVEN** a controller action throws `new Error('Database connection lost')`
- **WHEN** the filter catches it
- **THEN** a server-side log entry SHALL be emitted containing the `traceId` and the original exception
- **AND** the HTTP response body SHALL NOT contain "Database connection lost" or any stack trace fragment

### Requirement: Concurrent callers receive independent traceIds

When two HTTP requests trigger `DomainErrorFilter` simultaneously, each response MUST contain
a distinct `traceId`. A single shared `traceId` across requests would make log correlation
ambiguous.

#### Scenario: Two concurrent requests receive different traceIds

- **GIVEN** two concurrent HTTP requests each cause a `DomainError` to be thrown
- **WHEN** both responses are received
- **THEN** `response1.error.traceId` SHALL NOT equal `response2.error.traceId`
