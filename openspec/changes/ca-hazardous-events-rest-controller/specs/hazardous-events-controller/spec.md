# hazardous-events-controller Specification

## Purpose

Exposes public REST endpoints for managing Hazardous Events at `/api/v2/hazardous-events` via NestJS, delegating to Clean Architecture application use cases while enforcing multi-tenant isolation, RBAC authorization, request validation, standard HTTP status codes, and OpenAPI documentation.

---

## Requirements

### Requirement: Authentication and Authorization Enforcement

`HazardousEventsController` (`app/domains/hazardous-events/presentation/HazardousEventsController.server.ts`) SHALL be guarded by `@UseGuards(ApiKeyOrSessionAuthGuard, PermissionsGuard)` and `@ApiSecurity("x-auth")`. Endpoints SHALL enforce RBAC permissions via `@RequirePermission`:

- `GET /`, `GET /:id`, `GET /specific-hazards`, `GET /taxonomy`, `GET /:id/attachments`, and `GET /:id/attachments/:attachmentId/download` SHALL require `ViewData` permission.
- `POST /`, `PUT /:id`, `DELETE /:id`, `POST /:id/spatial-observations`, `POST /:id/attachments`, and `DELETE /:id/attachments/:attachmentId` SHALL require `EditData` permission.

#### Scenario: Request without valid authentication is rejected

- **WHEN** an unauthenticated request (missing or invalid API key / session) hits any `/hazardous-events` endpoint
- **THEN** the response status is `401 Unauthorized`

#### Scenario: Caller with valid authentication but missing permission is rejected

- **WHEN** an authenticated caller lacking `ViewData` hits `GET /hazardous-events`, `GET /hazardous-events/:id`, `GET /hazardous-events/specific-hazards`, `GET /hazardous-events/taxonomy`, `GET /hazardous-events/:id/attachments`, or `GET /hazardous-events/:id/attachments/:attachmentId/download`
- **OR** an authenticated caller lacking `EditData` hits a mutating endpoint (`POST`, `PUT`, `DELETE`, `POST .../spatial-observations`, `POST .../attachments`, `DELETE .../attachments/:attachmentId`)
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

### Requirement: GET /hazardous-events/specific-hazards Lists Specific Hazards

`HazardousEventsController` SHALL expose `GET /hazardous-events/specific-hazards`, delegating to `GetHazardTaxonomyOptionsUseCase.execute()` to retrieve all specific hazards. It SHALL return `200 OK` with an array of `SpecificHazardOption` objects (`[{ id, clusterId, name, code }]`) per ADR-007.

#### Scenario: Listing specific hazards returns 200 with specific hazard options

- **WHEN** an authorized caller requests `GET /hazardous-events/specific-hazards`
- **THEN** the response status is `200 OK`
- **AND** the response body contains an array of specific hazard options with `id`, `clusterId`, `name`, and `code`

#### Scenario: Unauthenticated request to specific hazards is rejected

- **WHEN** an unauthenticated request hits `GET /hazardous-events/specific-hazards`
- **THEN** the response status is `401 Unauthorized`

---

### Requirement: GET /hazardous-events/taxonomy Retrieves Complete Hazard Taxonomy

`HazardousEventsController` SHALL expose `GET /hazardous-events/taxonomy`, delegating to `GetHazardTaxonomyOptionsUseCase.execute()`. It SHALL return `200 OK` with the complete `HazardTaxonomyOptions` (`{ types, clusters, specificHazards }`) per ADR-007.

#### Scenario: Retrieving taxonomy returns 200 with complete hierarchy

- **WHEN** an authorized caller requests `GET /hazardous-events/taxonomy`
- **THEN** the response status is `200 OK`
- **AND** the response body contains `types`, `clusters`, and `specificHazards`

#### Scenario: Unauthenticated request to taxonomy is rejected

- **WHEN** an unauthenticated request hits `GET /hazardous-events/taxonomy`
- **THEN** the response status is `401 Unauthorized`

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

### Requirement: POST /hazardous-events/:id/attachments Saves an Attachment

`HazardousEventsController` SHALL expose `POST /hazardous-events/:id/attachments`, validating `:id` via `HazardousEventIdParam` and supporting both `multipart/form-data` (physical binary file upload) and `application/json` (pre-uploaded file metadata), delegating to `AddHazardousEventAttachmentUseCase`. It SHALL verify that the parent hazardous event belongs to the caller's tenant (returning `404 Not Found` if nonexistent or in a foreign tenant). For `multipart/form-data`, it SHALL validate the file extension and maximum file size (10MB), store the file on disk under `uploads/tenant-{tenantId}/hazardous-event/{id}/`, and record the attachment in `hazardous_event_attachment`. It SHALL persist the attachment in `hazardous_event_attachment` and return `201 Created` with `HazardousEventAttachmentResponseSchema` per ADR-007.

#### Scenario: Valid attachment creation via JSON returns 201 Created

- **WHEN** an authorized caller posts a valid attachment JSON payload to `POST /hazardous-events/:id/attachments`
- **THEN** the response status is `201 Created`
- **AND** the attachment is persisted in `hazardous_event_attachment` with `hazardous_event_id = :id`
- **AND** the response body contains `id`, `hazardousEventId`, `title`, `fileKey`, `fileName`, `fileType`, `fileSize`, `createdAt`, and `updatedAt`

#### Scenario: Valid physical file upload via multipart/form-data returns 201 Created

- **WHEN** an authorized caller posts a physical binary file using `multipart/form-data` with form field `file` (and optional `title`)
- **THEN** the response status is `201 Created`
- **AND** the file is stored on disk under `uploads/tenant-{tenantId}/hazardous-event/{id}/`
- **AND** the attachment record is created in `hazardous_event_attachment` with computed `fileName`, `fileType`, `fileSize`, and `fileKey`
- **AND** `title` defaults to the original filename if not explicitly provided

#### Scenario: Multipart upload with invalid file extension returns 422 Unprocessable Entity

- **WHEN** an authorized caller uploads a file with an unsupported extension (e.g. `.exe`)
- **THEN** the response status is `422 Unprocessable Entity`

#### Scenario: Multipart request missing file field returns 422 Unprocessable Entity

- **WHEN** an authorized caller sends a `multipart/form-data` request without a `file` field
- **THEN** the response status is `422 Unprocessable Entity`

#### Scenario: Missing fields in JSON payload return 422 Unprocessable Entity

- **WHEN** an authorized caller posts an attachment JSON body missing required fields
- **THEN** the response status is `422 Unprocessable Entity`

#### Scenario: Attachment on nonexistent or cross-tenant event returns 404

- **WHEN** an authorized caller posts an attachment to an event that does not exist or belongs to another tenant
- **THEN** the response status is `404 Not Found`

---

### Requirement: GET /hazardous-events/:id/attachments Lists Event Attachments

`HazardousEventsController` SHALL expose `GET /hazardous-events/:id/attachments`, validating `:id` via `HazardousEventIdParam` and delegating to `ListHazardousEventAttachmentsUseCase`. It SHALL verify that the parent hazardous event belongs to the caller's tenant. It SHALL return `200 OK` with an array of attachment objects from `hazardous_event_attachment` per ADR-007.

#### Scenario: Listing attachments returns 200 with attachment array

- **WHEN** an authorized caller requests `GET /hazardous-events/:id/attachments`
- **THEN** the response status is `200 OK`
- **AND** the response body contains the array of attachments for that event

#### Scenario: Listing attachments on nonexistent or cross-tenant event returns 404

- **WHEN** an authorized caller requests attachments for an event that does not exist or belongs to another tenant
- **THEN** the response status is `404 Not Found`

---

### Requirement: DELETE /hazardous-events/:id/attachments/:attachmentId Deletes an Attachment

`HazardousEventsController` SHALL expose `DELETE /hazardous-events/:id/attachments/:attachmentId`, validating `:id` and `:attachmentId` via `HazardousEventAttachmentIdParam` and delegating to `DeleteHazardousEventAttachmentUseCase`. It SHALL verify that the parent hazardous event belongs to the caller's tenant. It SHALL delete the attachment from `hazardous_event_attachment` and return `204 No Content` on success. If the event does not exist, belongs to another tenant, or the attachment is not found on that event, it SHALL return `404 Not Found`.

#### Scenario: Deleting attachment returns 204 No Content

- **WHEN** an authorized caller deletes an attachment via `DELETE /hazardous-events/:id/attachments/:attachmentId`
- **THEN** the response status is `204 No Content`
- **AND** the attachment is removed from `hazardous_event_attachment`

#### Scenario: Deleting nonexistent attachment returns 404

- **WHEN** an authorized caller attempts to delete an attachment ID that does not exist on the event
- **THEN** the response status is `404 Not Found`

#### Scenario: Deleting attachment on foreign tenant event returns 404

- **WHEN** an authorized caller attempts to delete an attachment on an event owned by another tenant
- **THEN** the response status is `404 Not Found`

---

### Requirement: GET /hazardous-events/:id/attachments/:attachmentId/download Streams an Attachment File

`HazardousEventsController` SHALL expose `GET /hazardous-events/:id/attachments/:attachmentId/download`, validating `:id` and `:attachmentId` via `HazardousEventAttachmentIdParam` and delegating to `DownloadHazardousEventAttachmentUseCase`. It SHALL verify that the parent hazardous event belongs to the caller's tenant. It SHALL retrieve the attachment record from `hazardous_event_attachment` and stream the physical binary file from storage with HTTP 200, setting `Content-Type` to the attachment's `fileType` and `Content-Disposition` to `attachment; filename="<fileName>"`. If the event does not exist, belongs to another tenant, the attachment does not exist, or the file is missing from storage, it SHALL return `404 Not Found`.

#### Scenario: Downloading attachment returns 200 with binary stream

- **WHEN** an authorized caller requests `GET /hazardous-events/:id/attachments/:attachmentId/download`
- **THEN** the response status is `200 OK`
- **AND** the response body contains the physical file binary stream
- **AND** the headers include matching `Content-Type` and `Content-Disposition`

#### Scenario: Downloading nonexistent or cross-tenant attachment returns 404

- **WHEN** an authorized caller requests download of an attachment that does not exist or belongs to another tenant
- **THEN** the response status is `404 Not Found`

---

### Requirement: OpenAPI Documentation Registration

`HazardousEventsController` SHALL be decorated with `@ApiSecurity("x-auth")` and standard `@nestjs/swagger` annotations. All twelve endpoints and their DTO models SHALL appear in the OpenAPI document served at `/api/v2/docs-json`.

#### Scenario: OpenAPI document contains Hazardous Events routes

- **WHEN** `GET /api/v2/docs-json` is requested
- **THEN** the OpenAPI paths include `/api/v2/hazardous-events`, `/api/v2/hazardous-events/specific-hazards`, `/api/v2/hazardous-events/taxonomy`, `/api/v2/hazardous-events/{id}`, `/api/v2/hazardous-events/{id}/spatial-observations`, `/api/v2/hazardous-events/{id}/attachments`, `/api/v2/hazardous-events/{id}/attachments/{attachmentId}`, and `/api/v2/hazardous-events/{id}/attachments/{attachmentId}/download`
- **AND** the operations require `x-auth` security
