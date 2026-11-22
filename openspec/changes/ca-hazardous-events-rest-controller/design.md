# Design: Hazardous Events REST Controller (6f · #803)

## Context

Phase 6 Intent 6f (#803) delivers the REST API controller for the Hazardous Events domain at `/api/v2/hazardous-events`.

The domain's application use cases were completely implemented and wired into DI in Phase 5g (`HazardousEventsModule.server.ts`):

- `ListHazardousEventsUseCase`
- `GetHazardousEventByIdUseCase`
- `CreateHazardousEventUseCase`
- `UpdateHazardousEventUseCase`
- `DeleteHazardousEventUseCase`
- `RecordSpatialObservationUseCase`

In Phase 6e (#802), the authentication and authorization guards were refactored into modular subdomains and exported at `app/domains/hazardous-events/presentation/guards/` (`ApiKeyAuthGuard`, `SessionAuthGuard`, `ApiKeyOrSessionAuthGuard`, `PermissionsGuard`, `@RequirePermission`).

This design establishes `HazardousEventsController` in `app/domains/hazardous-events/presentation/` to expose the REST API endpoints, wire request DTOs with `nestjs-zod`, enforce RBAC permissions and tenant isolation, map status codes and errors cleanly, and publish OpenAPI schemas.

---

## Goals / Non-Goals

**Goals:**

- Implement `HazardousEventsController.server.ts` with twelve REST endpoints:
  - `GET /` — List events with pagination and filters
  - `GET /specific-hazards` — List all specific hazards available for selection
  - `GET /taxonomy` — Retrieve complete hazard taxonomy hierarchy (types, clusters, specific hazards)
  - `GET /:id` — Get single event details
  - `POST /` — Create an event
  - `PUT /:id` — Update an event
  - `DELETE /:id` — Delete an event (409 Conflict if dependents exist)
  - `POST /:id/spatial-observations` — Record spatial observation (409 Conflict if duplicate timestamp without replace)
  - `GET /:id/attachments` — List all attachments for a hazardous event
  - `POST /:id/attachments` — Save an attachment to a hazardous event in `hazardous_event_attachment` (supports `multipart/form-data` and `application/json`)
  - `DELETE /:id/attachments/:attachmentId` — Delete an attachment record and clean up its physical file
  - `GET /:id/attachments/:attachmentId/download` — Stream an attachment's physical binary file
- Protect all endpoints with `@UseGuards(ApiKeyOrSessionAuthGuard, PermissionsGuard)` and `@RequirePermission`.
- Strictly enforce multi-tenancy (`req.tenantId`) and user attribution (`req.userId`), discarding any client-supplied tenant IDs.
- Validate request parameters and bodies using `nestjs-zod` and return standard HTTP error codes: 400 Bad Request for invalid `:id` UUID, 422 Unprocessable Entity for invalid body payloads.
- Return plain resources on success without wrapping envelopes per ADR-007.
- Publish OpenAPI documentation at `/api/v2/docs` with `@nestjs/swagger` annotations.
- Verify through integration tests against PGlite with Supertest.

**Non-Goals:**

- Migrating or retiring legacy `/api+/hazardous-event+/` routes (legacy routes remain untouched until client deprecation/migration period concludes per roadmap migration note).
- Altering the Drizzle database schema (existing schema and tables already support all operations).
- Modifying the Form-CSV-API `fieldsDef` pipeline (controller interacts only with Clean Architecture use cases).

---

## Decisions

### Decision 1 — Controller Routing & Presentation Seam

`HazardousEventsController.server.ts` is placed in `app/domains/hazardous-events/presentation/`:

```typescript
@Controller("hazardous-events")
@UseGuards(ApiKeyOrSessionAuthGuard, PermissionsGuard)
@ApiSecurity("x-auth")
@ApiUnauthorizedResponse({ description: "Authentication required." })
@ApiForbiddenResponse({ description: "Insufficient permissions." })
export class HazardousEventsController { ... }
```

- **Global Prefix**: In `init.server.tsx`, the HTTP server sets `app.setGlobalPrefix("/api/v2")`. Thus, the controller routes resolve at `/api/v2/hazardous-events`.
- **Module Registration**: Registered in `HazardousEventsModule.server.ts` under `controllers: [HazardousEventsController]`. Because `CoreModule.server.ts` imports `HazardousEventsModule`, the controller is automatically registered in both the HTTP server and OpenAPI docs.

### Decision 2 — RBAC Permissions & Guard Pairing

Every endpoint is guarded with class-level `@UseGuards(ApiKeyOrSessionAuthGuard, PermissionsGuard)` and annotated with endpoint-specific `@RequirePermission`:

- `GET /` -> `@RequirePermission("ViewData")`
- `GET /specific-hazards` -> `@RequirePermission("ViewData")`
- `GET /taxonomy` -> `@RequirePermission("ViewData")`
- `GET /:id` -> `@RequirePermission("ViewData")`
- `GET /:id/attachments` -> `@RequirePermission("ViewData")`
- `GET /:id/attachments/:attachmentId/download` -> `@RequirePermission("ViewData")`
- `POST /` -> `@RequirePermission("EditData")`
- `PUT /:id` -> `@RequirePermission("EditData")`
- `DELETE /:id` -> `@RequirePermission("EditData")`
- `POST /:id/spatial-observations` -> `@RequirePermission("EditData")`
- `POST /:id/attachments` -> `@RequirePermission("EditData")`
- `DELETE /:id/attachments/:attachmentId` -> `@RequirePermission("EditData")`

- **Role Hydration**: `ApiKeyOrSessionAuthGuard` (from 6e) populates `req.tenantId`, `req.userId`, and `req.role`.
- **Role Forwarding to Use Case**: `req.role` is also forwarded to `ListHazardousEventsUseCase` (`role: req.role ?? null`) to enforce the `DATA_VIEWER_ALLOWED_STATUSES` restriction when a viewer queries the list.

### Decision 3 — Strict Multi-Tenancy & Attribution Scoping

- **No Tenant Spoofing**: `countryAccountsId` / `tenantId` is never read from client payloads. The controller passes `tenantId: req.tenantId` exclusively to use cases. If a caller submits a `tenantId` or `countryAccountsId` property in the JSON body, it is completely discarded.
- **Attribution**: `actingUserId` passed to mutating use cases (`CreateHazardousEventUseCase`, `UpdateHazardousEventUseCase`, `DeleteHazardousEventUseCase`) is taken directly from `req.userId`.

### Decision 4 — Validation Strategy: 400 for `:id` vs. 422 for Request Bodies

Following the precedent established in `NoticesController`:

- **Path Parameter (`:id`)**: Validated as UUID using `ZodValidationPipe(HazardousEventIdParam)`:
  - If invalid, NestJS throws `BadRequestException` (`400 Bad Request`).
- **Request Bodies**: Validated using `ZodBodyValidationPipe` created via `createZodValidationPipe`:

  ```typescript
  const ZodBodyValidationPipe = createZodValidationPipe({
  	createValidationException: (error) =>
  		new UnprocessableEntityException({
  			message: "Validation failed",
  			details: (error as z.ZodError).issues,
  		}),
  });
  ```

  - If schema validation fails, throws `UnprocessableEntityException` (`422 Unprocessable Entity`) with validation issues in `details`.

### Decision 5 — Error Mapping & Conflict Status Codes (409)

`DomainErrorFilter` already intercepts domain errors globally:

- `NotFoundError` -> HTTP 404 (thrown when event id does not exist in the caller's tenant).
- `ConflictError` -> HTTP 409:
  - `DELETE /:id`: When `DeleteHazardousEventUseCase` detects referencing disaster events, event causality links, or causal chain edges, it throws `ConflictError` containing `dependents`. `DomainErrorFilter` maps this to HTTP 409 with `details.dependents`.
  - `POST /:id/spatial-observations`: When `RecordSpatialObservationUseCase` detects an existing observation at the same `observationTime` and `confirmReplace` is not true, it throws `ConflictError`. `DomainErrorFilter` maps this to HTTP 409.
- `ValidationError` -> HTTP 422 (thrown if domain entities or use cases reject invalid parameters).

### Decision 6 — ADR-007 Plain Resource Response Contract

In accordance with ADR-007:

- Successful responses return plain resource representations with no wrapping `{ success: true, data: ... }` or `{ ok: true, res: [...] }` envelopes:
  - `GET /` -> HTTP 200 with `ListHazardousEventsResult` (`{ items: [...], totalCount, unfilteredTotalCount }`).
  - `GET /:id` -> HTTP 200 with `HazardousEventDetailDto`.
  - `POST /` -> HTTP 201 with `HazardousEventDto`.
  - `PUT /:id` -> HTTP 200 with `UpdateHazardousEventResult`.
  - `DELETE /:id` -> HTTP 204 with no content body.
  - `POST /:id/spatial-observations` -> HTTP 201 with `SpatialObservationDto`.

### Decision 7 — OpenAPI / Swagger Metadata

- Controller uses `@ApiSecurity("x-auth")`, `@ApiOkResponse`, `@ApiCreatedResponse`, `@ApiBadRequestResponse`, `@ApiNotFoundResponse`, `@ApiConflictResponse`, `@ApiUnprocessableEntityResponse`, `@ApiUnauthorizedResponse`, and `@ApiForbiddenResponse`.
- Swagger documentation is patched via `patchNestJsSwagger()` during bootstrap (`mountOpenApiDocs(app)`).
- DTO classes are created using `createZodDto` from `nestjs-zod`, ensuring schema definitions in `/api/v2/docs-json` accurately reflect validation rules, optionality, and formats.

### Decision 8 — Confirmation of DEF-031 Checkpoint

Roadmap Section 6f specifies a checkpoint before shipping `GET /:id` (`DEF-031`): confirm that `GetHazardousEventByIdUseCase` gracefully handles missing `WorkflowInstance` rows for pre-refactor events.

- **Verification**: `GetHazardousEventByIdUseCase.ts` was audited:
  ```typescript
  const workflowInstance =
  	await this.getWorkflowInstanceByEntityUseCase.execute({
  		entityId: event.id,
  		entityType: "HE",
  	});
  // null is ambiguous: a real data-integrity gap vs. a not-yet-backfilled legacy row --
  // indistinguishable from here (DEF-031; degrades gracefully rather than throwing).
  ```
  It returns `workflowStatus: workflowInstance?.status ?? null` without throwing `NotFoundError`. The checkpoint is satisfied.

---

## TypeScript Types & Interfaces Added or Changed

### New DTOs in `app/domains/hazardous-events/presentation/dto/`

1. **`HazardousEventIdParam.ts`**:
   - `hazardousEventIdParamSchema`: `z.object({ id: z.string().uuid() })`
   - `HazardousEventIdParam`: `createZodDto(hazardousEventIdParamSchema)`
   - `ApiHazardousEventIdParam`: Swagger decorator helper for `:id`.

2. **`CreateHazardousEventRequest.ts`**:
   - `createHazardousEventRequestSchema`:
     - `specificHazardId`: `z.string().uuid()`
     - `startDate`: `flexibleDateSchema` (validated with `isValidFlexibleDateFormat`: YYYY, YYYY-MM, or YYYY-MM-DD)
     - `endDate`: `flexibleDateSchema` (validated with `isValidFlexibleDateFormat` and ordered `>= startDate`)
     - `nationalSpecification`: `z.string().default("")`
     - `description`: `z.string().default("")`
     - `chainsExplanation`: `z.string().default("")`
     - `magnitude`: `z.string().default("")`
     - `recordOriginator`: `z.string().default("")`
     - `dataSource`: `z.string().default("")`
     - `hazardousEventStatus`: `z.enum(["forecasted", "ongoing", "passed"]).nullable().optional()`
     - `specificHazardLocalName`: `z.string().nullable().optional()`
     - `specificHazardNationalName`: `z.string().nullable().optional()`
     - `apiImportId`: `z.string().nullable().optional()`
     - `hazardDriverIds`: `z.array(z.string().uuid()).default([])`
     - `attachments`: `z.array(attachmentSchema).default([])`
     - `fieldValues`: `z.array(fieldValueSchema).default([])`
     - `customFieldValues`: `z.array(customFieldValueSchema).default([])`
     - `causeId`: `z.string().uuid().optional()`
     - `causalityExplanation`: `z.string().nullable().optional()`
   - `CreateHazardousEventRequest`: `createZodDto(createHazardousEventRequestSchema)`

3. **`UpdateHazardousEventRequest.ts`**:
   - `updateHazardousEventRequestSchema`:
     - Partial fields corresponding to `CreateHazardousEventRequest`, with optional updates.
     - `startDate`: `flexibleDateSchema.optional()`
     - `endDate`: `flexibleDateSchema.optional()` (ordered `>= startDate` when both present)
     - `causeId`: `z.string().uuid().nullable().optional()`
     - `causalityExplanation`: `z.string().nullable().optional()`
     - `spatialObservation`: optional observation payload.
   - `UpdateHazardousEventRequest`: `createZodDto(updateHazardousEventRequestSchema)`

4. **`RecordSpatialObservationRequest.ts`**:
   - `recordSpatialObservationRequestSchema`:
     - `observationTime`: `z.string().datetime().optional()` (ISO string parsed to Date)
     - `geometries`: `z.array(z.unknown()).default([])`
     - `divisionIds`: `z.array(z.string().uuid()).default([])`
     - `note`: `z.string().nullable().optional().default(null)`
     - `confirmReplace`: `z.boolean().optional().default(false)`
   - `RecordSpatialObservationRequest`: `createZodDto(recordSpatialObservationRequestSchema)`

5. **`HazardousEventAttachmentIdParam.ts`**:
   - `hazardousEventAttachmentIdParamSchema`: `z.object({ id: z.string().uuid(), attachmentId: z.string().uuid() })`
   - `HazardousEventAttachmentIdParam`: `createZodDto(hazardousEventAttachmentIdParamSchema)`
   - `ApiHazardousEventAttachmentIdParam`: Swagger decorator helper for `:id` and `:attachmentId`.

6. **`CreateHazardousEventAttachmentRequest.ts`**:
   - `createHazardousEventAttachmentRequestSchema`:
     - `id`: `z.string().uuid().optional()`
     - `title`: `z.string().min(1)`
     - `fileKey`: `z.string().min(1)`
     - `fileName`: `z.string().min(1)`
     - `fileType`: `z.string().min(1)`
     - `fileSize`: `z.number().int().nonnegative()`
   - `CreateHazardousEventAttachmentRequest`: `createZodDto(createHazardousEventAttachmentRequestSchema)`

7. **`HazardousEventResponseDto.ts`**:
   - `HazardousEventResponseSchema`: OpenAPI schema for `HazardousEventDto`.
   - `HazardousEventDetailResponseSchema`: OpenAPI schema for `HazardousEventDetailDto`.
   - `HazardousEventListResponseSchema`: OpenAPI schema for `ListHazardousEventsResult`.
   - `SpatialObservationResponseSchema`: OpenAPI schema for `SpatialObservationDto`.
   - `SpecificHazardOptionResponseSchema`: OpenAPI schema for `SpecificHazardOption`.
   - `HazardTaxonomyResponseSchema`: OpenAPI schema for `HazardTaxonomyOptions` (`types`, `clusters`, `specificHazards`).
   - `HazardousEventAttachmentResponseSchema`: OpenAPI schema for `HazardousEventAttachmentDto`.

---

## Drizzle Schema Changes

**None**. All database schemas and queries are handled by existing domain repositories (`DrizzleHazardousEventRepository`, `DrizzleDivisionRepository`, `DrizzleCausalChainRepository`, etc.).

---

## Testing Strategy

- **Test Framework**: Vitest with Supertest against in-memory PostgreSQL (`PGlite`) via `tests/integration/db/setup`.
- **Test File**: `tests/integration/domains/hazardous-events/HazardousEventsController.test.ts`.
- **Test Scenarios**:
  1. **Authentication**: 401 Unauthorized for missing or invalid API keys on all endpoints.
  2. **Authorization**: 403 Forbidden when caller role lacks `ViewData` for GET or `EditData` for mutating endpoints.
  3. **Multi-Tenancy**: Tenant ID in payload is ignored; caller can only read/mutate events in their own tenant.
  4. **GET /**: 200 OK listing events with pagination, filters, and viewer status restrictions.
  5. **GET /:id**: 200 OK single event detail; 400 Bad Request on non-UUID id; 404 Not Found on cross-tenant or nonexistent event.
  6. **POST /**: 201 Created with valid payload; 422 Unprocessable Entity on schema validation failure; user attribution recorded.
  7. **PUT /:id**: 200 OK partial update; 404 Not Found on nonexistent event; 422 on invalid payload.
  8. **DELETE /:id**: 204 No Content on successful deletion; 404 Not Found on nonexistent event; 409 Conflict with dependent details when dependents exist.
  9. **POST /:id/spatial-observations**: 201 Created on valid spatial observation; 409 Conflict on duplicate timestamp without `confirmReplace: true`; 201 Created on duplicate timestamp with `confirmReplace: true`.
  10. **OpenAPI**: Swagger schema at `/api/v2/docs-json` covers `/api/v2/hazardous-events` routes.
