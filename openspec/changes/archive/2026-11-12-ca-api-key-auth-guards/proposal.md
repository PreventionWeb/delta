# Proposal: Clean Architecture API Key & Modular Authentication Guards

## Why

Currently, DELTA's v2 Clean Architecture REST API (`/api/v2/*`) and Swagger UI (`/api/v2/docs`) only support cookie-based authentication via `SessionAuthGuard`. Because web browsers forbid JavaScript `fetch`/`XHR` from setting the `Cookie` header, Swagger UI's "Authorize" dialog cannot authenticate requests after a browser logout, and external automation/CLI cannot access v2 endpoints using DELTA's standard `X-Auth: $DELTA_API_KEY` convention.

This change introduces a modular, Clean Architecture guard structure (`ApiKeyAuthGuard`, `SessionAuthGuard`, and composite `ApiKeyOrSessionAuthGuard`) in shared infrastructure, documents `X-Auth` in OpenAPI / Swagger UI, and updates the Notices v2 controller to support both API keys and session cookies.

## What Changes

- **Extract and Relocate Auth Guards**: Move `SessionAuthGuard` to shared infrastructure (`app/infrastructure/guards/`) with backward-compatible re-exports in the notices domain.
- **Introduce `ApiKeyAuthGuard`**: New NestJS guard that authenticates the `X-Auth` header against `apiKeyTable`, verifies non-null tenant `countryAccountsId` and `managedByUserId`, and hydrates `request.tenantId`, `request.userId`, and the `RequestContext` AsyncLocalStorage store.
- **Introduce `ApiKeyOrSessionAuthGuard`**: Composite guard implementing logical OR: dispatches to `ApiKeyAuthGuard` if `X-Auth` is provided, and falls back to `SessionAuthGuard` otherwise.
- **Swagger / OpenAPI Documentation**: Register `X-Auth` API key security scheme via `DocumentBuilder.addApiKey()` in `app/init.server.tsx`, and decorate `NoticesController` with `@ApiSecurity("x-auth")`.
- **Apply to Notices Controller**: Update `NoticesController` to use `ApiKeyOrSessionAuthGuard`, allowing seamless authentication from both browser UI sessions and CLI/Swagger API keys.
- **Security & Multi-Tenancy**: Mark as a security-sensitive change. Enforces rule P1-22 (strictly reject API keys with null/unresolved `countryAccountsId`).
- **No DB Migration**: Leverages existing `apiKeyTable` schema.
- **Test Approach**: PGlite integration tests (`yarn test:run2`) via NestJS testing module + supertest.

## Files Expected to Change

- `app/infrastructure/guards/AuthenticatedRequest.ts`: Shared request interface defining typed auth headers (`cookie`, `x-auth`), `tenantId`, and `userId`.
- `app/infrastructure/guards/ApiKeyAuthGuard.server.ts`: NestJS guard authenticating `X-Auth` against `apiKeyTable` with tenant scoping.
- `app/infrastructure/guards/SessionAuthGuard.server.ts`: Relocated session cookie auth guard in shared infrastructure.
- `app/infrastructure/guards/ApiKeyOrSessionAuthGuard.server.ts`: Composite NestJS guard dispatching to `ApiKeyAuthGuard` or `SessionAuthGuard`.
- `app/infrastructure/guards/index.ts`: Barrel export for auth guards and request types.
- `app/domains/notices/presentation/guards/SessionAuthGuard.server.ts`: Re-export from `~/infrastructure/guards` for backward compatibility.
- `app/domains/notices/presentation/NoticesController.server.ts`: Apply `@UseGuards(ApiKeyOrSessionAuthGuard)` and `@ApiSecurity("x-auth")`.
- `app/domains/notices/infrastructure/NoticesModule.server.ts`: Register `ApiKeyAuthGuard`, `SessionAuthGuard`, and `ApiKeyOrSessionAuthGuard` providers.
- `app/init.server.tsx`: Add `X-Auth` API key security definition to Swagger `DocumentBuilder`.
- `tests/integration/domains/notices/SessionAuthGuard.test.ts`: Verify session guard compatibility.
- `tests/integration/guards/ApiKeyAuthGuard.test.ts`: Integration tests for `ApiKeyAuthGuard` (valid key, invalid key, missing tenant, context sync).
- `tests/integration/guards/ApiKeyOrSessionAuthGuard.test.ts`: Integration tests for composite guard (X-Auth path, Cookie path, 401 fallback).
- `tests/integration/domains/notices/OpenApiDocs.test.ts`: Verify `x-auth` security scheme and operation-level requirements in generated OpenAPI doc.

## Capabilities

### New Capabilities
- `api-key-auth-guard`: Validates `X-Auth` request header against `apiKeyTable`, resolves `tenantId` and `userId`, enforces tenant presence, and writes to request context.
- `composite-auth-guard`: Composes `ApiKeyAuthGuard` and `SessionAuthGuard` with logical OR semantics for dual-purpose endpoints.

### Modified Capabilities
- `session-auth-guard`: Relocates guard to `app/infrastructure/guards/SessionAuthGuard.server.ts` while maintaining backward compatibility in notices domain.
- `openapi-docs-bootstrap`: Extends OpenAPI document builder with `X-Auth` API key security scheme alongside `__session` cookie auth.
- `notices-controller`: Updates controller authorization requirement to accept either API key or session cookie via composite guard.

## Impact

- **APIs**: `/api/v2/notices` accepts either `X-Auth: $KEY` or `Cookie: __session=...`.
- **Swagger UI**: `/api/v2/docs` gains an `X-Auth` authorization option that works for in-browser execution even when logged out.
- **Dependencies**: No external dependencies added.
- **Multi-Tenancy**: Preserves strict tenant isolation by mapping `apiKeyTable.countryAccountsId` directly to `req.tenantId`.
