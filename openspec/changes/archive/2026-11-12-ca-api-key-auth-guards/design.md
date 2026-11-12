# Design: Clean Architecture API Key & Modular Authentication Guards

## Context

DELTA's v2 REST API runs on NestJS mounted within the unified Express server. Currently, `SessionAuthGuard` is located under `app/domains/notices/presentation/guards/` and only verifies cookie sessions (`__session`). Legacy Remix API endpoints (`/en/api/...`) use `apiAuth()` to verify `X-Auth` headers against `apiKeyTable`.

See `proposal.md` for motivation and `specs/` for behavioral requirements.

## Goals / Non-Goals

**Goals:**
- Provide a clean, modular guard architecture (`SessionAuthGuard`, `ApiKeyAuthGuard`, `ApiKeyOrSessionAuthGuard`) in `app/infrastructure/guards/`.
- Ensure `ApiKeyAuthGuard` securely verifies `X-Auth` tokens against `apiKeyTable`, strictly enforcing tenant association (`countryAccountsId`) per rule P1-22.
- Provide `ApiKeyOrSessionAuthGuard` implementing logical OR so dual-purpose endpoints can be consumed by both web clients and API key clients.
- Update Swagger / OpenAPI configuration in `app/init.server.tsx` and controllers so `X-Auth` is documented and testable in Swagger UI.
- Preserve backward compatibility for existing code importing from `app/domains/notices/presentation/guards/SessionAuthGuard.server.ts`.

**Non-Goals:**
- Scoped API key permissions or token expiration policies (deferred to an API key governance intent).
- Migrating legacy Remix `/en/api/...` endpoints to NestJS (out of scope).
- Modifying the Drizzle database schema (`apiKeyTable` is already sufficient).

## Decisions

### Decision 1 — Three-Guard Structure in `app/infrastructure/guards/`
- **Alternative considered**: Expanding `SessionAuthGuard` to handle both API keys and cookies directly.
  - *Rejected*: Violates Single Responsibility Principle and couples cookie handling with API key queries.
- **Alternative considered**: NestJS guard array `@UseGuards(ApiKeyAuthGuard, SessionAuthGuard)`.
  - *Rejected*: In NestJS, guard arrays are evaluated as logical AND (both guards must succeed).
- **Decision**: Create three distinct guards in `app/infrastructure/guards/`:
  1. `SessionAuthGuard`: verifies cookie session.
  2. `ApiKeyAuthGuard`: verifies `X-Auth` token.
  3. `ApiKeyOrSessionAuthGuard`: composite guard dispatching to `ApiKeyAuthGuard` if `X-Auth` is provided, falling back to `SessionAuthGuard` otherwise.

### Decision 2 — Tenant and User Hydration
- `ApiKeyAuthGuard` queries `apiKeyTable` using the injected `DRIZZLE_CLIENT` (`Dr`).
- Both `countryAccountsId` and `managedByUserId` MUST be non-null and non-empty. If either is missing, the guard throws `UnauthorizedException` (401), preventing unauthorized access across tenants.
- On success, `req.tenantId` is set to `key.countryAccountsId`, `req.userId` is set to `key.managedByUserId`, and `writeSessionIntoContext(ctx, { tenantId, userId })` syncs the active `RequestContext` ALS store.

### Decision 3 — Swagger UI OpenAPI Security Scheme Configuration
- In `app/init.server.tsx`, `DocumentBuilder` registers:
  ```typescript
  .addApiKey({ type: "apiKey", in: "header", name: "X-Auth" }, "x-auth")
  ```
- `.addCookieAuth()` is intentionally omitted from `DocumentBuilder` and `@ApiCookieAuth()` is removed from `NoticesController`. Asking users to paste ambient `httpOnly` session cookies into an interactive modal input is bad practice and confusing (since browser JS cannot set `Cookie` headers via fetch).
- Endpoints using `ApiKeyOrSessionAuthGuard` (like `NoticesController`) carry:
  ```typescript
  @ApiSecurity("x-auth")
  ```
  allowing Swagger UI users to authorize with their API key. Ambient browser cookie sessions continue to be accepted by `ApiKeyOrSessionAuthGuard` at the HTTP transport layer automatically when browsing logged in.

### Decision 4 — Backward Compatibility for Notices Domain
- `app/domains/notices/presentation/guards/SessionAuthGuard.server.ts` re-exports `SessionAuthGuard` and `AuthenticatedRequest` from `~/infrastructure/guards/`, ensuring existing imports across tests or domain files do not break.

### Decision 5 — Swagger UI API Key Presentation Masking
- **Alternative considered**: Use `requestInterceptor` to replace the `X-Auth` header value in flight.
  - *Rejected*: Modifying `req.headers['X-Auth']` in `requestInterceptor` alters the outgoing HTTP network request dispatched by `fetch`, causing valid API keys to fail authentication with 401.
- **Alternative considered**: Full CSS obscuration on the `.curl-command` block.
  - *Rejected*: Blurring or hiding the whole cURL block hides the URL, HTTP method, and other non-sensitive headers.
- **Decision**: Use `SwaggerCustomOptions` in `app/init.server.tsx`:
  1. **Authorize Modal Input Masking**: Use `customCss` and `customJsStr` to mask the `X-Auth` input field (`type="password"` and `-webkit-text-security: disc;`), ensuring the secret API key is never rendered in clear text when typed or pasted.
  2. **cURL Command Display Masking**: Use `customJsStr` with a lightweight `MutationObserver` listening to DOM changes in `.swagger-ui`. When a `.curl-command` code block is populated, it transforms `-H "X-Auth: ..."` / `-H 'X-Auth: ...'` into `-H "X-Auth: [DELTA API KEY]"` in the visible DOM node, keeping the raw secret off the interface while the underlying fetch request dispatches with the true credentials. Cookie session headers (`Cookie: __session=...`) are preserved intact.

## TypeScript Types and Interfaces Added / Changed

- `AuthenticatedRequest` (`app/infrastructure/guards/AuthenticatedRequest.ts`):
  ```typescript
  export interface AuthenticatedRequest {
    url: string;
    headers: {
      cookie?: string;
      "x-auth"?: string;
      "accept-language"?: string;
      [key: string]: string | undefined;
    };
    tenantId: string;
    userId: string;
  }
  ```
- No Drizzle schema changes: `apiKeyTable` in `app/drizzle/schema/apiKeyTable.ts` already contains `secret`, `managedByUserId`, and `countryAccountsId`.
- No impact on Form-CSV-API `fieldsDef` pipeline: authentication guards operate on the HTTP transport layer prior to use case execution.

## Testing Strategy

- **Test Framework**: Vitest with PGlite integration tests (`yarn test:run2`).
- **Rationale**: Authentication guards require database lookups (`sessionTable`, `apiKeyTable`) and request-context ALS store verification. PGlite provides an in-memory PostgreSQL engine without requiring an external database instance or Docker setup.

## Risks / Trade-offs

- **[Risk]** Client passes both `X-Auth` and `Cookie` headers with differing tenant contexts.
  - **Mitigation**: `ApiKeyOrSessionAuthGuard` checks for `X-Auth` first; explicit API key credentials take precedence over ambient browser cookies.
- **[Risk]** API key lacks tenant assignment (`countryAccountsId` is null).
  - **Mitigation**: `ApiKeyAuthGuard` strictly validates `countryAccountsId` and rejects with 401 if null or empty, preventing cross-tenant leakage.
