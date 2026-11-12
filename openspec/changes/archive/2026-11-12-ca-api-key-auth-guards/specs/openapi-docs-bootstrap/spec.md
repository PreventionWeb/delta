# Spec Delta

## MODIFIED Requirements

### Requirement: Every endpoint documents its path parameters, response schema, and auth requirement

`@nestjs/swagger` does not auto-document path parameters or response schemas — these need
explicit decorators regardless of validation library. `GET/PUT/DELETE /notices/:id` SHALL carry
`@ApiParam({ name: "id", type: String, format: "uuid" })`. Every endpoint SHALL carry an
explicit `@ApiOkResponse`/`@ApiCreatedResponse` naming its response schema, and SHALL document
supported authentication schemes paired with `DocumentBuilder.addApiKey()` for `X-Auth`.
Cookie sessions are handled transparently by the browser transport layer and SHALL NOT be exposed
as an interactive input in the Swagger Authorize modal.

#### Scenario: Path parameter is documented

- **WHEN** `paths["/notices/{id}"].get.parameters` is inspected
- **THEN** it includes an `id` entry, `in: "path"`, UUID-formatted

#### Scenario: Success response schema is documented, not empty

- **WHEN** `paths["/notices"].post.responses["201"]` is inspected
- **THEN** it has a non-empty schema reflecting the notice shape (`title`/`body`/`locale`, etc.)

#### Scenario: Authentication requirement is documented

- **WHEN** any `NoticesController` operation is inspected
- **THEN** it lists a `security` requirement referencing the `x-auth` scheme

#### Scenario: OpenAPI document lists X-Auth and session cookie security schemes

- **WHEN** `GET /api/v2/docs-json` is requested
- **THEN** the OpenAPI document components contain `x-auth` (apiKey in header)
- **AND** components do not expose `cookie` as an interactive input in the Authorize modal

## ADDED Requirements

### Requirement: Swagger UI masks API key values in UI display and cURL snippet

Swagger UI SHALL mask `X-Auth` API key secrets in the user interface to prevent cleartext credential
exposure during demonstrations, screen sharing, or recordings. The generated cURL snippet SHALL display
the placeholder `[DELTA API KEY]` instead of the raw secret while dispatching the real key over the wire.
Session cookies SHALL remain unmasked in the cURL snippet as requested. The Authorize modal input for
`X-Auth` SHALL mask the input text.

#### Scenario: Displayed cURL command masks X-Auth API key

- **WHEN** an endpoint is executed in Swagger UI with an `X-Auth` API key authorized
- **THEN** the displayed cURL command in the interface replaces the secret value with `[DELTA API KEY]`
- **AND** the actual network request is dispatched with the authentic key

#### Scenario: Displayed cURL command preserves session cookie

- **WHEN** an endpoint is executed in Swagger UI with session cookie authentication
- **THEN** the displayed cURL command displays the session cookie string without replacing it with `[DELTA API KEY]`

#### Scenario: Authorize modal masks X-Auth input

- **WHEN** the Swagger UI Authorize modal is opened
- **THEN** the input field for `X-Auth` masks user input to prevent cleartext credential visibility
