# hazardous-events-controller Specification

## Purpose

Exposes public REST endpoints for managing Hazardous Events at `/api/v2/hazardous-events` via NestJS, delegating to Clean Architecture application use cases while enforcing multi-tenant isolation, RBAC authorization, request validation, standard HTTP status codes, and OpenAPI documentation.

---

## Requirements

### Requirement: Authentication and Authorization Enforcement

`HazardousEventsController` (`app/domains/hazardous-events/presentation/HazardousEventsController.server.ts`) SHALL be guarded by `@UseGuards(ApiKeyOrSessionAuthGuard, PermissionsGuard)` and `@ApiSecurity("x-auth")`. Endpoints SHALL enforce RBAC permissions via `@RequirePermission`:

- `GET /` and `GET /:id` SHALL require `ViewData` permission.
- `POST /`, `PUT /:id`, `DELETE /:id`, and `POST /:id/spatial-observations` SHALL require `EditData` permission.

#### Scenario: Request without valid authentication is rejected

- **WHEN** an unauthenticated request (missing or invalid API key / session) hits any `/hazardous-events` endpoint
- **THEN** the response status is `401 Unauthorized`

#### Scenario: Caller with valid authentication but missing permission is rejected

- **WHEN** an authenticated caller lacking `ViewData` hits `GET /hazardous-events` or `GET /hazardous-events/:id`
- **OR** an authenticated caller lacking `EditData` hits a mutating endpoint (`POST`, `PUT`, `DELETE`, `POST .../spatial-observations`)
- **THEN** the response status is `403 Forbidden`

---

### Requirement: Strict Multi-Tenancy Scoping & User Attribution

`HazardousEventsController` SHALL source the tenant identifier strictly from `request.tenantId` and user identifier strictly from `request.userId`. Any `tenantId` or `countryAccountsId` provided in client request bodies SHALL be ignored and discarded.

#### Scenario: Payload tenant spoofing attempt is ignored

- **WHEN** an authenticated caller for tenant `A` submits a `POST` or `PUT` request with a payload containing `"tenantId": "tenant-B"` or `"countryAccountsId": "tenant-B"`
- **THEN** the event is created or updated strictly under tenant `A`
- **AND** the payload-supplied tenant ID is discarded

#### Scenario: Foreign tenant access returns 404

- **WHEN** an authenticated caller for tenant `A` attempts to access or mutate an event belonging to tenant `B` via `:id`
- **THEN** the response status is `404 Not Found`

---

### Requirement: GET /hazardous-events Lists Events with Pagination and Filters

`HazardousEventsController` SHALL expose `GET /hazardous-events`, delegating to `ListHazardousEventsUseCase` with `request.tenantId`, `request.userId`, `request.role`, pagination parsed via `parsePagination`, and filters parsed via `parseHazardousEventListFilters`. The endpoint SHALL return `200 OK` with the bare `ListHazardousEventsResult` (`{ items, totalCount, unfilteredTotalCount }`) directly per ADR-007.

#### Scenario: Listing events returns 200 with pagination result

- **WHEN** an authorized caller requests `GET /hazardous-events?page=1&pageSize=20`
- **THEN** the response status is `200 OK`
- **AND** the response body contains `items`, `totalCount`, and `unfilteredTotalCount` without a wrapping envelope

#### Scenario: Data-viewer caller receives only approved/published events

- **WHEN** an authenticated user whose role is data viewer queries `GET /hazardous-events`
- **THEN** only events in `APPROVED` or `PUBLISHED` status are returned in `items`

---

### Requirement: GET /hazardous-events/:id Retrieves Event Detail

`HazardousEventsController` SHALL expose `GET /hazardous-events/:id`, validating `:id` as a UUID via `HazardousEventIdParam` and delegating to `GetHazardousEventByIdUseCase` scoped by `request.tenantId`. It SHALL return `200 OK` with `HazardousEventDetailDto` directly per ADR-007.

#### Scenario: Existing event in caller tenant returns 200

- **WHEN** an authorized caller requests `GET /hazardous-events/:id` for an existing event in their tenant
- **THEN** the response status is `200 OK`
- **AND** the response body contains the complete `HazardousEventDetailDto`

#### Scenario: Malformed UUID returns 400 Bad Request

- **WHEN** a caller requests `GET /hazardous-events/not-a-uuid`
- **THEN** the response status is `400 Bad Request`

#### Scenario: Nonexistent or foreign event returns 404 Not Found

- **WHEN** a caller requests `GET /hazardous-events/:id` for an ID that does not exist or belongs to another tenant
- **THEN** the response status is `404 Not Found`

---

### Requirement: POST /hazardous-events Creates an Event

`HazardousEventsController` SHALL expose `POST /hazardous-events`, validating the body via `CreateHazardousEventRequest` and delegating to `CreateHazardousEventUseCase` with `request.tenantId` and `actingUserId: request.userId`. It SHALL return `201 Created` with `HazardousEventDto` directly per ADR-007.

#### Scenario: Valid creation returns 201 Created

- **WHEN** an authorized caller posts a valid `CreateHazardousEventRequest`
- **THEN** the response status is `201 Created`
- **AND** the response body contains the created `HazardousEventDto` with `id`, `tenantId`, and `workflowStatus: "DRAFT"`

#### Scenario: Invalid body returns 422 Unprocessable Entity

- **WHEN** a caller posts a body missing required fields or failing zod schema validation
- **THEN** the response status is `422 Unprocessable Entity`
- **AND** the response body contains `details` with validation error issues

---

### Requirement: PUT /hazardous-events/:id Updates an Event

`HazardousEventsController` SHALL expose `PUT /hazardous-events/:id`, validating `:id` via `HazardousEventIdParam` and the body via `UpdateHazardousEventRequest`, and delegating to `UpdateHazardousEventUseCase`. It SHALL return `200 OK` with `UpdateHazardousEventResult` directly per ADR-007.

#### Scenario: Valid update returns 200 OK

- **WHEN** an authorized caller puts a valid `UpdateHazardousEventRequest` for an existing event
- **THEN** the response status is `200 OK`
- **AND** the response body contains the updated event representation

#### Scenario: Invalid UUID returns 400 Bad Request

- **WHEN** a caller puts to `/hazardous-events/not-a-uuid`
- **THEN** the response status is `400 Bad Request`

#### Scenario: Nonexistent event returns 404 Not Found

- **WHEN** a caller puts to an event ID that does not exist in their tenant
- **THEN** the response status is `404 Not Found`

#### Scenario: Invalid body returns 422 Unprocessable Entity

- **WHEN** a caller puts an invalid payload failing zod schema validation
- **THEN** the response status is `422 Unprocessable Entity`

---

### Requirement: DELETE /hazardous-events/:id Deletes an Event or Reports Conflict

`HazardousEventsController` SHALL expose `DELETE /hazardous-events/:id`, validating `:id` via `HazardousEventIdParam` and delegating to `DeleteHazardousEventUseCase`. If deletion succeeds, it SHALL return `204 No Content` with an empty body. If the event has dependent disaster events, causality records, or causal chain edges, it SHALL return `409 Conflict`.

#### Scenario: Successful deletion returns 204 No Content

- **WHEN** an authorized caller deletes an event that has no dependents
- **THEN** the response status is `204 No Content`
- **AND** the response body is empty

#### Scenario: Event with dependents returns 409 Conflict

- **WHEN** an authorized caller deletes an event that is referenced by disaster events, event causality, or causal chains
- **THEN** the response status is `409 Conflict`
- **AND** the response body contains `error.code: "CONFLICT"` and `details.dependents` listing the dependent counts

#### Scenario: Nonexistent event returns 404 Not Found

- **WHEN** a caller deletes an event ID that does not exist in their tenant
- **THEN** the response status is `404 Not Found`

---

### Requirement: POST /hazardous-events/:id/spatial-observations Records Spatial Observation

`HazardousEventsController` SHALL expose `POST /hazardous-events/:id/spatial-observations`, validating `:id` via `HazardousEventIdParam` and the body via `RecordSpatialObservationRequest`, and delegating to `RecordSpatialObservationUseCase`. It SHALL return `201 Created` with `SpatialObservationDto`. If an observation already exists at the specified `observationTime` and `confirmReplace` is not true, it SHALL return `409 Conflict`.

#### Scenario: Valid spatial observation returns 201 Created

- **WHEN** an authorized caller posts a valid spatial observation
- **THEN** the response status is `201 Created`
- **AND** the response body contains the created `SpatialObservationDto`

#### Scenario: Duplicate observationTime without confirmReplace returns 409 Conflict

- **WHEN** an authorized caller posts a spatial observation with a timestamp matching an existing observation and `confirmReplace` is omitted or false
- **THEN** the response status is `409 Conflict`

#### Scenario: Duplicate observationTime with confirmReplace: true returns 201 Created

- **WHEN** an authorized caller posts a spatial observation with a timestamp matching an existing observation and `confirmReplace: true`
- **THEN** the existing observation is replaced
- **AND** the response status is `201 Created`

---

### Requirement: OpenAPI Documentation Registration

`HazardousEventsController` SHALL be decorated with `@ApiSecurity("x-auth")` and standard `@nestjs/swagger` annotations. All six endpoints and their DTO models SHALL appear in the OpenAPI document served at `/api/v2/docs-json`.

#### Scenario: OpenAPI document contains Hazardous Events routes

- **WHEN** `GET /api/v2/docs-json` is requested
- **THEN** the OpenAPI paths include `/api/v2/hazardous-events`, `/api/v2/hazardous-events/{id}`, and `/api/v2/hazardous-events/{id}/spatial-observations`
- **AND** the operations require `x-auth` security
