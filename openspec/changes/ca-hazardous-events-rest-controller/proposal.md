# Proposal: Hazardous Events REST Controller (6f · #803)

## Why

Phase 6 Intent **6f (Issue #803)** introduces the NestJS REST Controller for the Hazardous Events domain at `/api/v2/hazardous-events`, fulfilling the external REST API requirements established in the Clean Architecture refactoring roadmap (`_docs/refactoring-plan/hazardous-events-refactoring-roadmap.md`).

Currently, the legacy `/api+/hazardous-event+/` routes (`add.ts`, `upsert.ts`, `get.ts`, `delete.ts`) are tightly coupled to Express handlers, have disparate validation schemes, lack standard status codes, and return the legacy `{ ok, res: [...] }` envelope.

With the completion of **5g** (`HazardousEventsModule` wired with all application use cases) and **6e** (`ApiKeyAuthGuard`, `SessionAuthGuard`, `ApiKeyOrSessionAuthGuard`, and `PermissionsGuard` with `@RequirePermission`), the domain is fully prepared to expose its public REST API. This controller connects incoming HTTP requests to Clean Architecture application use cases while enforcing strict multi-tenancy (`req.tenantId`), caller attribution (`req.userId`), role permissions (`ViewData` / `EditData`), request validation via `nestjs-zod`, standard HTTP status codes (200, 201, 204, 400, 401, 403, 404, 409, 422), plain resource responses per ADR-007, and automatic OpenAPI documentation at `/api/v2/docs`.

---

## What Changes

- **NestJS Controller (`HazardousEventsController.server.ts`)**:
  - Mounted at `@Controller("hazardous-events")` (routable at `/api/v2/hazardous-events` under the global prefix).
  - Guarded at class level with `@UseGuards(ApiKeyOrSessionAuthGuard, PermissionsGuard)` and `@ApiSecurity("x-auth")`.
  - Exposes twelve REST endpoints:
    1. `GET /` — Lists events via `ListHazardousEventsUseCase` with pagination (`parsePagination`) and query filters (`parseHazardousEventListFilters`), guarded by `@RequirePermission("ViewData")`. Returns HTTP 200 with `ListHazardousEventsResult` (`{ items, totalCount, unfilteredTotalCount }`).
    2. `GET /specific-hazards` — Lists all specific hazards available for selection via `GetHazardTaxonomyOptionsUseCase`, guarded by `@RequirePermission("ViewData")`. Returns HTTP 200 with `SpecificHazardOption[]`.
    3. `GET /taxonomy` — Retrieves complete hazard taxonomy hierarchy (`types`, `clusters`, `specificHazards`) via `GetHazardTaxonomyOptionsUseCase`, guarded by `@RequirePermission("ViewData")`. Returns HTTP 200 with `HazardTaxonomyOptions`.
    4. `GET /:id` — Retrieves a single event detail via `GetHazardousEventByIdUseCase`, guarded by `@RequirePermission("ViewData")`. Returns HTTP 200 with `HazardousEventDetailDto`.
    5. `POST /` — Creates an event via `CreateHazardousEventUseCase`, guarded by `@RequirePermission("EditData")`. Returns HTTP 201 with `HazardousEventDto`.
    6. `PUT /:id` — Updates an existing event via `UpdateHazardousEventUseCase`, guarded by `@RequirePermission("EditData")`. Returns HTTP 200 with `UpdateHazardousEventResult`.
    7. `DELETE /:id` — Deletes an event via `DeleteHazardousEventUseCase`, guarded by `@RequirePermission("EditData")`. Returns HTTP 204 No Content. Returns HTTP 409 Conflict with dependent counts if dependent records exist.
    8. `POST /:id/spatial-observations` — Records a spatial observation via `RecordSpatialObservationUseCase`, guarded by `@RequirePermission("EditData")`. Supports optional `observationTime` for historical/backfill writes. Returns HTTP 201 with `SpatialObservationDto`. Returns HTTP 409 Conflict if an observation already exists at `observationTime` and `confirmReplace` is not true.
    9. `GET /:id/attachments` — Lists all attachments for a hazardous event via `ListHazardousEventAttachmentsUseCase`, guarded by `@RequirePermission("ViewData")`. Returns HTTP 200 with `HazardousEventAttachmentDto[]`.
    10. `POST /:id/attachments` — Saves an attachment to a hazardous event in `hazardous_event_attachment` via `AddHazardousEventAttachmentUseCase`, guarded by `@RequirePermission("EditData")`. Supports `multipart/form-data` and `application/json`. Returns HTTP 201 with `HazardousEventAttachmentDto`.
    11. `DELETE /:id/attachments/:attachmentId` — Deletes an attachment from `hazardous_event_attachment` and removes the physical file from disk via `DeleteHazardousEventAttachmentUseCase`, guarded by `@RequirePermission("EditData")`. Returns HTTP 204 No Content.
    12. `GET /:id/attachments/:attachmentId/download` — Streams the physical file binary content via `DownloadHazardousEventAttachmentUseCase`, guarded by `@RequirePermission("ViewData")`. Returns HTTP 200 with file stream.
- **Strict Multi-Tenancy & Attribution Enforcement**:
  - `tenantId` is strictly derived from the authenticated request (`req.tenantId`). Any `tenantId` or `countryAccountsId` in client request bodies is discarded, preventing cross-tenant spoofing.
  - `actingUserId` is strictly derived from `req.userId`.
  - `req.role` is forwarded to `ListHazardousEventsUseCase`, ensuring role-based visibility restrictions (such as `DATA_VIEWER_ALLOWED_STATUSES`) are respected.
- **Request Validation & Error Mapping**:
  - `ZodValidationPipe` on `:id` path parameters returns HTTP 400 Bad Request on invalid UUIDs.
  - `createZodValidationPipe` on request bodies returns HTTP 422 Unprocessable Entity on schema validation failure.
  - `DomainErrorFilter` maps `NotFoundError` to HTTP 404, `ConflictError` to HTTP 409, and `ValidationError` to HTTP 400.
  - Auth guards map missing/invalid credentials to HTTP 401 Unauthorized and unauthorized roles to HTTP 403 Forbidden.
- **OpenAPI / Swagger Documentation**:
  - Full OpenAPI metadata using `@nestjs/swagger` decorators on all endpoints, DTOs, query parameters, and path parameters, visible in Swagger UI at `/api/v2/docs` and schema at `/api/v2/docs-json`.
- **Security-Sensitive Change**: Touches public HTTP transport endpoints, authentication, authorization, and multi-tenant isolation boundaries.
- **Database Migration Required**: None. All underlying tables and repository methods already exist and are fully wired in `HazardousEventsModule`.
- **Test Approach**: Integration testing with Vitest and Supertest (`yarn test:run2`) using PGlite in `tests/integration/domains/hazardous-events/HazardousEventsController.test.ts`.

---

## Files Expected to Change

- `app/domains/hazardous-events/presentation/HazardousEventsController.server.ts`: New NestJS REST controller exposing the twelve endpoints.
- `app/domains/hazardous-events/presentation/dto/HazardousEventIdParam.ts`: New DTO for UUID validation on `:id` path parameters and Swagger decorator.
- `app/domains/hazardous-events/presentation/dto/HazardousEventAttachmentIdParam.ts`: New DTO for UUID validation on `:id` and `:attachmentId` path parameters and Swagger decorator.
- `app/domains/hazardous-events/presentation/dto/CreateHazardousEventRequest.ts`: New DTO validating request payload for creating an event.
- `app/domains/hazardous-events/presentation/dto/UpdateHazardousEventRequest.ts`: New DTO validating partial update payload for an event.
- `app/domains/hazardous-events/presentation/dto/RecordSpatialObservationRequest.ts`: New DTO validating payload for recording spatial observations.
- `app/domains/hazardous-events/presentation/dto/CreateHazardousEventAttachmentRequest.ts`: New DTO validating JSON attachment creation payloads.
- `app/domains/hazardous-events/presentation/dto/HazardousEventResponseDto.ts`: New DTO schemas providing typed Swagger response documentation.
- `app/domains/hazardous-events/application/ports/IHazardousEventAttachmentRepository.ts` & `IHazardousEventAttachmentStorageService.ts`: Attachment persistence and file storage ports.
- `app/domains/hazardous-events/application/use-cases/{Add,List,Delete,Download}HazardousEventAttachment.ts`: Attachment application use cases.
- `app/domains/hazardous-events/infrastructure/DrizzleHazardousEventAttachmentRepository.server.ts` & `DiskHazardousEventAttachmentStorageService.server.ts`: Drizzle attachment repository and disk storage service.
- `app/domains/hazardous-events/infrastructure/HazardousEventsModule.server.ts`: Update module definition to register `HazardousEventsController` and attachment providers/use cases.
- `tests/integration/domains/hazardous-events/HazardousEventsController.test.ts`: New comprehensive integration tests covering all happy paths, security, validation, multi-tenancy spoofing rejection, conflict status codes, and OpenAPI schema generation.
- `_docs/refactoring-plan/hazardous-events-refactoring-roadmap.md`: Update intent 6f status.

---

## Capabilities

### New Capabilities

- `hazardous-events-controller`: REST API controller exposing `/api/v2/hazardous-events` with full authentication, RBAC authorization, multi-tenant scoping, input validation, clean ADR-007 responses, and OpenAPI documentation.
