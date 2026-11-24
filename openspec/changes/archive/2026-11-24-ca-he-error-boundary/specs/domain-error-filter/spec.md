## REMOVED Requirements

### Requirement: DomainErrorFilter includes context details when present

**Reason**: ADR-003 limits `error.details` to field-level validation details and forbids exposing
internal error details (Rule 4). Copying `DomainError.context` wholesale sent internal values such
as `{ entity, id }` and, for conflicts, tenant ids to API clients (ca-he-error-boundary design.md
D8, OD-7).

**Migration**: Replaced by "DomainErrorFilter includes only field-level validation details for a
DomainError". API clients that read `error.details` on a not-found or conflict response receive no
`details`; validation `details` from `HttpException` payloads are unchanged.

## ADDED Requirements

### Requirement: DomainErrorFilter includes only field-level validation details for a DomainError

When the thrown `DomainError` is a `ValidationError` whose `context` has a string `field`
property, the filter MUST set `error.details` to exactly `{ field }`. For every other
`DomainError`, including a `ValidationError` without a string `field`, the `details` field MUST be
omitted from the response body (not set to `null`), and no `context` value MAY be copied into the
body as data (in particular no id). The filter MAY still use `context` server-side as translation
interpolation arguments, so a translated `message` may name the entity type. Non-DomainError branches (`HttpException` structured payloads, `InvalidLocaleTagError`)
are not affected by this requirement.

#### Scenario: NotFoundError omits details

- **GIVEN** a controller action throws `new NotFoundError('Notice', 'abc-123')`
- **WHEN** the HTTP request is processed
- **THEN** the response status SHALL be 404
- **AND** the response body SHALL NOT contain an `error.details` field
- **AND** the response body SHALL NOT contain `abc-123`

#### Scenario: ValidationError with a field includes only that field

- **GIVEN** a controller action throws `new ValidationError('bad', { field: 'title', tenantId: 't-1' })`
- **WHEN** the HTTP request is processed
- **THEN** the response body SHALL include `error.details = { field: 'title' }`
- **AND** the response body SHALL NOT contain `t-1`

#### Scenario: Error without context omits details from response

- **GIVEN** a controller action throws `new ValidationError('Title must not be empty')` with
  no `context` argument
- **WHEN** the HTTP request is processed
- **THEN** the response body SHALL NOT contain an `error.details` field

#### Scenario: HttpException validation details are unchanged

- **GIVEN** a controller body fails Zod validation and the pipe throws an
  `UnprocessableEntityException` with a structured `details` payload
- **WHEN** the HTTP request is processed
- **THEN** `error.details` SHALL contain that structured payload exactly as before

#### Scenario: Concurrent requests do not share details

- **WHEN** two requests fail at the same time, one with a `ValidationError` carrying `{ field: 'a' }` and one with a `NotFoundError`
- **THEN** the first response SHALL carry `details = { field: 'a' }` and the second SHALL carry no `details`
