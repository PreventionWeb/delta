## ADDED Requirements

### Requirement: /api/v2/docs serves an interactive Swagger UI; /api/v2/docs-json serves the raw OpenAPI document

The NestJS HTTP application bootstrap (`app/init.server.tsx`'s `bootstrapHttpServer()`) SHALL
mount an OpenAPI document, generated via `@nestjs/swagger`'s `SwaggerModule.createDocument()`
and post-processed with `nestjs-zod`'s `cleanupOpenApiDoc()`, via `SwaggerModule.setup()` at
`GET /api/v2/docs` — the interactive HTML explorer, `SwaggerModule.setup()`'s default UI, for
humans exploring the API by hand. The raw document is served separately at the conventional
sibling path `GET /api/v2/docs-json` (`SwaggerModule.setup()`'s default `jsonDocumentUrl`
suffix, not overridden) for machine consumption.

#### Scenario: /api/v2/docs returns the interactive Swagger UI

- **WHEN** `GET /api/v2/docs` is requested
- **THEN** the response status is `200`
- **AND** the response `Content-Type` is `text/html`

#### Scenario: /api/v2/docs-json returns a valid OpenAPI document

- **WHEN** `GET /api/v2/docs-json` is requested
- **THEN** the response status is `200`
- **AND** the response body is a well-formed OpenAPI document (valid `openapi` version field
  and a `paths` object)

#### Scenario: The document covers all five Notices endpoints

- **WHEN** the OpenAPI document served at `/api/v2/docs-json` is inspected
- **THEN** its `paths` object includes entries for `GET /notices`, `GET /notices/{id}`, `POST
/notices`, `PUT /notices/{id}`, and `DELETE /notices/{id}`

### Requirement: The OpenAPI document is generated from the same zod schemas that validate requests

`CreateNoticeRequest`, `UpdateNoticeRequest`, and `NoticeIdParam` SHALL each be defined via
`nestjs-zod`'s `createZodDto()`, so the same schema instance drives both runtime
`ZodValidationPipe` validation and the generated OpenAPI schema — no second, hand-maintained
OpenAPI schema definition is introduced for these DTOs.

#### Scenario: A required field in the zod schema appears as required in the OpenAPI schema

- **WHEN** `CreateNoticeRequest`'s zod schema marks `title` as required
- **THEN** the OpenAPI document's schema for the `POST /notices` request body lists `title`
  in its `required` array
- **AND** the test reads the actual generated `paths["/notices"].post.requestBody` content
  directly, not just checks the key exists — this scenario existed before manual testing caught
  the schema being empty

### Requirement: Every endpoint documents its path parameters, response schema, and auth requirement

`@nestjs/swagger` does not auto-document path parameters or response schemas — these need
explicit decorators regardless of validation library. `GET/PUT/DELETE /notices/:id` SHALL carry
`@ApiParam({ name: "id", type: String, format: "uuid" })`. Every endpoint SHALL carry an
explicit `@ApiOkResponse`/`@ApiCreatedResponse` naming its response schema, and SHALL be marked
`@ApiCookieAuth()`, paired with `DocumentBuilder.addCookieAuth()`.

#### Scenario: Path parameter is documented
- **WHEN** `paths["/notices/{id}"].get.parameters` is inspected
- **THEN** it includes an `id` entry, `in: "path"`, UUID-formatted

#### Scenario: Success response schema is documented, not empty
- **WHEN** `paths["/notices"].post.responses["201"]` is inspected
- **THEN** it has a non-empty schema reflecting the notice shape (`title`/`body`/`locale`, etc.)

#### Scenario: Authentication requirement is documented
- **WHEN** any `NoticesController` operation is inspected
- **THEN** it lists a `security` requirement referencing the cookie auth scheme

> `@ApiCookieAuth()` documents the requirement but can't make "Try it out" accept a pasted
> token — the session cookie is `httpOnly`, and browsers block JS from setting `Cookie`
> directly. "Try it out" only works with an already-active browser session. Not fixable within
> cookie auth; a bearer-token model (ADR-006 draft) would allow it — deferred, not this change.

### Requirement: Every endpoint documents the error responses it actually produces

Found in a second independent review — the generated doc only showed success statuses. Every
`NoticesController` operation SHALL document `401` (guard); `getById`/`update`/`remove` SHALL
also document `404`; `create`/`update` SHALL also document `422`. `400` (malformed `:id`) applies
to `getById`/`update`/`remove` only — content is no longer locale-resolved (ADR-008), so a
malformed `Accept-Language` header's effect on error-message localization (via `nestjs-i18n`,
Decision 19) should be verified empirically, not assumed to still produce a `400` on every
operation the way content-locale resolution used to. Description-only — no typed schema.

#### Scenario: Every operation documents its 401 response
- **WHEN** any `NoticesController` operation's `responses` is inspected
- **THEN** it includes a `401` entry

#### Scenario: getById/update/remove document their 404 response
- **WHEN** `paths["/notices/{id}"].get/put/delete.responses` is inspected
- **THEN** each includes a `404` entry

#### Scenario: create/update document their 422 response
- **WHEN** `paths["/notices"].post.responses` and `paths["/notices/{id}"].put.responses` are
  inspected
- **THEN** each includes a `422` entry

### Requirement: GET /notices documents its page/pageSize query parameters

`list()` reads `page`/`pageSize` off the query string (Decision 12) but the generated doc showed
no query parameters at all. `GET /notices` SHALL document both as optional query parameters via
`@ApiQuery`.

#### Scenario: page and pageSize are documented as optional query parameters
- **WHEN** `paths["/notices"].get.parameters` is inspected
- **THEN** it includes `page` and `pageSize` entries, both `in: "query"`, both not required
