# Proposal: Modular Auth Guards (AuthN & AuthZ) and ApiKeyAuthGuard for Hazardous Events (6e · #802)

## Why

Hazardous Events refactoring intent **6e (Issue #802)** establishes the authentication guard foundation for the upcoming REST API (`/api/v2/hazardous-events`, ticket 6f / #803) and resolves legacy bug **DEF-002** in `app/backend.server/models/api_key.ts`.

While PR #820 (`feature/ca-api-key-auth-guards`) established core authentication guards (`ApiKeyAuthGuard`, `SessionAuthGuard`, `ApiKeyOrSessionAuthGuard`) in `app/infrastructure/guards/`, two major architectural gaps remain:

1. **Missing Role-Based Authorization (RBAC)**: Currently, all existing guards only handle **authentication (AuthN)** and tenant scoping (`tenantId`, `userId`). Neither guard validates user roles or permissions (`ViewData`, `EditData`, `ValidateData`). Without an authorization guard, any valid API key (even one assigned to a `data-viewer` user) could invoke mutating endpoints on REST controllers unless checked explicitly.
2. **Guard Organization Scalability**: As the guard system expands to cover authorization, request contracts, and future authentication schemes (e.g. JWT or token rotation), housing all guards in a single flat folder creates coupling and muddles the distinction between identity verification (AuthN) and permission enforcement (AuthZ).
3. **Unresolved Legacy Bug DEF-002**: In `app/backend.server/models/api_key.ts`, `apiAuth` uses `if (!key)`, which is dead code because Drizzle's `.select()` returns an array (`[]`), causing invalid API keys on legacy routes to crash with an unhandled 500 `TypeError` on `key[0]` instead of returning a clean 401 `Unauthorized` response.

This change restructures `app/infrastructure/guards/` into modular subdomains (`authn/`, `authz/`, `types/`, with a backward-compatible root facade `index.ts`), introduces a reusable `PermissionsGuard` and `@RequirePermission` decorator with request-level role hydration, re-exports these guards in `app/domains/hazardous-events/presentation/guards/`, and permanently fixes legacy `DEF-002`.

---

## What Changes

- **Modular Guard Subdomain Architecture**:
  - `app/infrastructure/guards/authn/`: Encapsulates authentication and tenant resolution (`ApiKeyAuthGuard`, `SessionAuthGuard`, `ApiKeyOrSessionAuthGuard`).
  - `app/infrastructure/guards/authz/`: Encapsulates authorization and RBAC enforcement (`PermissionsGuard`, `RequirePermission`).
  - `app/infrastructure/guards/types/`: Encapsulates request and context contracts (`AuthenticatedRequest`).
  - `app/infrastructure/guards/index.ts`: Public barrel export providing a unified facade preserving 100% backward compatibility for all existing imports.
- **Request Contract & Role Hydration**:
  - Enrich `AuthenticatedRequest` with `role?: RoleId`.
  - Update `SessionAuthGuard` to attach the caller's resolved role to `req.role` in-memory.
  - Update `ApiKeyAuthGuard` to resolve and attach the key owner's role to `req.role`.
- **Reusable `PermissionsGuard` and `@RequirePermission` Decorator**:
  - Implement `@RequirePermission(...permissions: PermissionId[])` custom metadata decorator.
  - Implement `PermissionsGuard` implementing NestJS `CanActivate`, evaluating `roleHasPermission(req.role, permission)` and throwing 403 `ForbiddenException` on unauthorized attempts.
- **Hazardous Events Presentation Seam**:
  - Provide `app/domains/hazardous-events/presentation/guards/index.ts` re-exporting the guards, satisfying Ticket 6e's contract and preparing Ticket 6f (`HazardousEventsController`) to use `@UseGuards(ApiKeyOrSessionAuthGuard, PermissionsGuard)`.
- **Legacy DEF-002 Bug Fix**:
  - Fix `if (!key)` in `app/backend.server/models/api_key.ts` to `if (!key || key.length === 0)` so invalid API keys return 401 instead of crashing with `TypeError`.
- **Security-Sensitive Change**: Touches authentication, authorization, and multi-tenancy boundaries.
- **No Database Migration**: Operates entirely with existing schema tables (`apiKeyTable`, `userTable`, `sessionTable`).
- **Test Approach**: Vitest unit tests for `apiAuth` (DEF-002) and PGlite integration tests (`yarn test:run2`) for modular guards.

---

## Files Expected to Change

- `app/infrastructure/guards/types/AuthenticatedRequest.ts`: Relocated request interface enriched with `role?: RoleId`.
- `app/infrastructure/guards/types/index.ts`: Barrel export for types.
- `app/infrastructure/guards/authn/ApiKeyAuthGuard.server.ts`: Relocated API key guard hydrating `req.tenantId`, `req.userId`, and `req.role`.
- `app/infrastructure/guards/authn/SessionAuthGuard.server.ts`: Relocated session guard hydrating `req.tenantId`, `req.userId`, and `req.role`.
- `app/infrastructure/guards/authn/ApiKeyOrSessionAuthGuard.server.ts`: Relocated composite OR guard.
- `app/infrastructure/guards/authn/index.ts`: Barrel export for authentication guards.
- `app/infrastructure/guards/authz/RequirePermission.ts`: Custom NestJS metadata decorator for declaring required permissions.
- `app/infrastructure/guards/authz/PermissionsGuard.server.ts`: NestJS guard enforcing RBAC permissions based on `req.role`.
- `app/infrastructure/guards/authz/index.ts`: Barrel export for authorization guards.
- `app/infrastructure/guards/index.ts`: Public facade re-exporting authn, authz, and types.
- `app/domains/hazardous-events/presentation/guards/index.ts`: Presentation re-export facade for the Hazardous Events domain.
- `app/backend.server/models/api_key.ts`: Fix for DEF-002 empty-array check in `apiAuth`.
- `tests/unit/backend.server/models/apiKeyAuth.test.ts`: Unit test for `apiAuth` (DEF-002 verification).
- `tests/integration/guards/PermissionsGuard.test.ts`: Integration test for `PermissionsGuard` and `@RequirePermission`.
- `tests/integration/guards/ApiKeyAuthGuard.test.ts`: Updated to verify `req.role` hydration alongside existing assertions.
- `tests/integration/guards/ApiKeyOrSessionAuthGuard.test.ts`: Updated import path references to ensure compatibility.
- `_docs/refactoring-plan/deferred-items-register.md`: Mark `DEF-002` resolved.
- `_docs/refactoring-plan/hazardous-events-refactoring-roadmap.md`: Update 6e status.

---

## Capabilities

### New Capabilities
- `modular-guards-structure`: Structural organization of guards into `authn/`, `authz/`, and `types/` with a public root facade.
- `permissions-guard`: Reusable NestJS authorization guard enforcing role permissions (`PermissionId`) via `@RequirePermission`.
- `hazardous-events-guards`: Domain presentation seam exposing auth guards for Hazardous Events controllers.
- `legacy-api-key-auth-fix`: Safe empty-array guard on `apiAuth` preventing unhandled 500 `TypeError` crashes on invalid API key credentials.

### Modified Capabilities
- `api-key-auth-guard`: Enriched to resolve and hydrate the key owner's `role` onto `AuthenticatedRequest`.
- `session-auth-guard`: Enriched to hydrate `req.role` onto `AuthenticatedRequest` from the validated session.

---

## Impact

- **Security & Authorization**: REST controllers gain fine-grained RBAC capabilities matching the web SSR layer (`requireViewDataPermission.server.ts`), preventing privilege escalation from `data-viewer` API keys or sessions.
- **APIs**: Legacy API routes (`/api+/*`) return clean 401s on invalid keys. Upcoming `/api/v2/hazardous-events` can enforce both dual-transport authentication and permission guards.
- **Backward Compatibility**: 100% preserved via `app/infrastructure/guards/index.ts` root facade.
- **Dependencies**: Zero new third-party dependencies added.
