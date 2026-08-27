# notices-controller Specification

## Purpose

TBD - created by archiving change notices-rest-controller. Update Purpose after archive.

## Requirements

### Requirement: GET /notices lists notices for the authenticated tenant

`NoticesController` (`app/domains/notices/presentation/NoticesController.server.ts`) SHALL
expose `GET /notices`, delegating to `ListNoticesUseCase` scoped by `request.tenantId`, and
return `200` with the bare `NoticeDto[]` array directly — no `{ success, data }` envelope (see
ADR-007). Each `NoticeDto`'s `title`/`body` are returned exactly as authored, with no per-request
resolution.

#### Scenario: Authenticated tenant receives its own notices

- **WHEN** an authenticated request hits `GET /notices`
- **THEN** the response status is `200`
- **AND** the response body is the array directly, not wrapped in a `data` field
- **AND** each returned notice's `title`/`body`/`locale` match what was stored, unmodified

#### Scenario: Tenant with zero notices receives an empty array, not an error

- **WHEN** an authenticated tenant with no notices hits `GET /notices`
- **THEN** the response status is `200` with an empty array body (`[]`), not an error

### Requirement: GET /notices supports page/pageSize query parameters

`NoticesController` SHALL parse `page`/`pageSize` from the request's query string via the
existing `parsePagination()` utility (`app/domains/notices/presentation/parsePagination.ts`,
already used by the 5a web-channel route) rather than a hardcoded page/pageSize, and pass the
result to `ListNoticesUseCase`.

#### Scenario: No query params uses parsePagination's defaults

- **WHEN** `GET /notices` is requested with no `page`/`pageSize` query params
- **THEN** `ListNoticesUseCase` is invoked with `parsePagination()`'s default `page`/`pageSize`

#### Scenario: Explicit page and pageSize are honored

- **WHEN** `GET /notices?page=2&pageSize=5` is requested
- **THEN** `ListNoticesUseCase` is invoked with `page: 2, pageSize: 5`

#### Scenario: pageSize above the cap is clamped

- **WHEN** `GET /notices?pageSize=500` is requested
- **THEN** `ListNoticesUseCase` is invoked with `pageSize` clamped to `parsePagination()`'s cap
  (`100`), not `500`

### Requirement: GET /notices/:id retrieves a single notice by id

`NoticesController` SHALL expose `GET /notices/:id`, validating `:id` as a UUID via
`NoticeIdParam` + `ZodValidationPipe`, delegating to `GetNoticeByIdUseCase` scoped by
`request.tenantId`, and return `200` with the bare `NoticeDto` directly — no envelope (ADR-007).

#### Scenario: Valid id within the caller's tenant returns 200

- **WHEN** an authenticated request hits `GET /notices/:id` for a notice belonging to its own
  tenant
- **THEN** the response status is `200` with the notice as the response body directly

#### Scenario: Non-UUID id returns 400

- **WHEN** a request hits `GET /notices/not-a-uuid`
- **THEN** the response status is `400`, not `500` or `422`

#### Scenario: Id belonging to another tenant returns 404

- **WHEN** an authenticated request hits `GET /notices/:id` for a notice that exists but
  belongs to a different tenant
- **THEN** the response status is `404`

### Requirement: POST /notices creates a new notice

`NoticesController` SHALL expose `POST /notices`, validating the body via `CreateNoticeRequest`
(`{ title, body, locale, isPublished }`) + a `ZodValidationPipe` configured to return `422` on
failure, delegating to `CreateNoticeUseCase` with `tenantId` from `request.tenantId` (never from
the request body), and return `201` with the created `NoticeDto` directly — no envelope
(ADR-007).

#### Scenario: Valid body creates a notice and returns 201

- **WHEN** an authenticated request posts `{ title, body, locale, isPublished }` to
  `POST /notices`
- **THEN** the response status is `201` with the created notice, including the `locale` it was
  authored in

#### Scenario: Invalid body returns 422

- **WHEN** an authenticated request posts a body missing `title` to `POST /notices`
- **THEN** the response status is `422`, not `400`

#### Scenario: An unsupported locale value is rejected

- **WHEN** an authenticated request posts a body with `locale: "xx"` (not in `VALID_LANGUAGES`)
- **THEN** the response status is `422`

#### Scenario: tenantId in the request body is ignored

- **WHEN** an authenticated request posts a body containing a `tenantId` field different from
  `request.tenantId`
- **THEN** the created notice's `tenantId` equals `request.tenantId`, not the body's value

### Requirement: PUT /notices/:id updates an existing notice

`NoticesController` SHALL expose `PUT /notices/:id`, validating `:id` as a UUID (400 on
failure) and the body via `UpdateNoticeRequest` (`{ title?, body?, locale?, isPublished? }`) +
a `422`-configured `ZodValidationPipe`, delegating to `UpdateNoticeUseCase` scoped by
`request.tenantId`, and return `200` with the updated `NoticeDto` directly — no envelope
(ADR-007).

#### Scenario: Valid update returns 200 with the updated notice

- **WHEN** an authenticated request puts a valid partial body to `PUT /notices/:id` for a
  notice in its own tenant
- **THEN** the response status is `200` with the updated `NoticeDto`

#### Scenario: Invalid body on PUT returns 422

- **WHEN** an authenticated request puts an invalid body to `PUT /notices/:id`
- **THEN** the response status is `422`

#### Scenario: Non-UUID id on PUT returns 400

- **WHEN** a request hits `PUT /notices/not-a-uuid`
- **THEN** the response status is `400`

#### Scenario: Updating a notice in another tenant returns 404

- **WHEN** an authenticated request puts a valid body to `PUT /notices/:id` for a notice
  belonging to a different tenant
- **THEN** the response status is `404`

### Requirement: DELETE /notices/:id removes an existing notice

`NoticesController` SHALL expose `DELETE /notices/:id`, validating `:id` as a UUID (400 on
failure), delegating to `DeleteNoticeUseCase` scoped by `request.tenantId`, and return `204`
with an empty body on success.

#### Scenario: Valid delete returns 204

- **WHEN** an authenticated request deletes a notice in its own tenant via `DELETE
/notices/:id`
- **THEN** the response status is `204` with no response body
- **AND** a subsequent `GET /notices/:id` for the same id returns `404`

#### Scenario: Non-UUID id on DELETE returns 400

- **WHEN** a request hits `DELETE /notices/not-a-uuid`
- **THEN** the response status is `400`

#### Scenario: Deleting a notice in another tenant returns 404

- **WHEN** an authenticated request deletes an id belonging to a different tenant
- **THEN** the response status is `404`

### Requirement: All five endpoints require authentication

Every `NoticesController` route SHALL be guarded by `SessionAuthGuard`. Requests without a
valid session MUST receive `401` before any use case executes.

#### Scenario: Unauthenticated request to any endpoint returns 401

- **WHEN** a request with no valid session cookie hits any of `GET /notices`, `GET
/notices/:id`, `POST /notices`, `PUT /notices/:id`, or `DELETE /notices/:id`
- **THEN** the response status is `401`
- **AND** the corresponding use case is never invoked

### Requirement: DomainError and HttpException handling is delegated to DomainErrorFilter

`NoticesController` methods SHALL NOT catch `DomainError` or `HttpException` themselves — they
let both propagate to the globally-registered `DomainErrorFilter`.

#### Scenario: A NotFoundError thrown by a use case reaches the client via DomainErrorFilter's envelope

- **WHEN** `GetNoticeByIdUseCase` throws `NoticeNotFoundError` for a request to `GET
/notices/:id`
- **THEN** the HTTP response body matches the ADR-003 `ErrorResponse` envelope with `code:
"NOT_FOUND"` and a `traceId`
- **AND** no try/catch inside `NoticesController` produced that response

### Requirement: Error messages are localized via nestjs-i18n, not hardcoded English

Activates ADR-001's deferred `nestjs-i18n` clause (design.md Decision 19). `DomainErrorFilter`
and `SessionAuthGuard` SHALL resolve their `message` strings through `I18nService`, reading from
the same `locales/{{lng}}/{{ns}}.json` files the web UI already uses — not a duplicated
translation source.

#### Scenario: An error message is returned in the resolved locale

- **WHEN** a request with `Accept-Language: fr` triggers a 401 (missing session)
- **THEN** the `error.message` field is the French string for that key, not hardcoded English

#### Scenario: No Accept-Language falls back to the existing chain, not hardcoded English

- **WHEN** a request with no `Accept-Language` header triggers an error
- **THEN** the `error.message` is resolved via the same fallback chain `resolveLocale()` already
  implements (tenant default → `"en"`), not a string literal in the filter/guard

### Requirement: An unmatched-route 404 includes a documentation link

An invalid path under `/api/v2/*` returns a bare `404` today with no hint of the real routes.
`DomainErrorFilter`'s `HttpException` branch SHALL add a `documentationUrl` (built from the
request's own protocol/host, not hardcoded) pointing at `/api/v2/docs` when the exception is a
`404` reaching that branch — resource-not-found cases (`NoticeNotFoundError`, etc.) are
`DomainError`s handled by the other branch, so this only fires for genuinely unmatched routes.
Mirrors GitHub's REST API convention of a `documentation_url` on every error.

#### Scenario: An unmatched route's 404 includes a documentation link

- **WHEN** a request hits any path under `/api/v2` that matches no registered route
- **THEN** the response status is `404`
- **AND** the response body includes `documentationUrl` pointing at `<same host>/api/v2/docs`

#### Scenario: A resource-not-found 404 does not need a documentation link

- **WHEN** `GetNoticeByIdUseCase` throws `NoticeNotFoundError` for a request to `GET
/notices/:id`
- **THEN** the response body is the standard ADR-003 `ErrorResponse` envelope — no
  `documentationUrl` field is added for this case
