# Design: Modular Auth Guards (AuthN & AuthZ) and ApiKeyAuthGuard for Hazardous Events (6e · #802)

## Context

DELTA's v2 REST API runs on NestJS mounted within the unified Express server. PR #820 (`feature/ca-api-key-auth-guards`) introduced flat infrastructure guards in `app/infrastructure/guards/` (`ApiKeyAuthGuard`, `SessionAuthGuard`, and `ApiKeyOrSessionAuthGuard`).

Hazardous Events refactoring intent 6e (#802) requires establishing the authentication and authorization guards for `/api/v2/hazardous-events` (intent 6f / #803) and resolving legacy bug **DEF-002** in `app/backend.server/models/api_key.ts`.

---

## Goals / Non-Goals

**Goals:**
- Reorganize `app/infrastructure/guards/` into `authn/`, `authz/`, `types/`, and a top-level facade `index.ts`.
- Hydrate `req.role` in `AuthenticatedRequest` during authentication so downstream authorization guards run in-memory without redundant database round-trips.
- Implement `@RequirePermission(...permissions: PermissionId[])` decorator and `PermissionsGuard` in `app/infrastructure/guards/authz/`.
- Provide `app/domains/hazardous-events/presentation/guards/index.ts` re-exporting the facade for Hazardous Events controllers.
- Fix legacy bug `DEF-002` in `app/backend.server/models/api_key.ts` to return 401 on empty array results from Drizzle queries.
- Maintain 100% backward compatibility for all existing imports from `~/infrastructure/guards`.

**Non-Goals:**
- Scoping or altering the Drizzle database schema (`apiKeyTable`, `userTable`, and `sessionTable` are already sufficient).
- Implementing the full `HazardousEventsController` (deferred to ticket 6f / #803).
- Altering the Form-CSV-API `fieldsDef` pipeline (guards operate exclusively at the HTTP transport and controller layer).

---

## Decisions

### Decision 1 — Three-Subdomain Folder Structure with Root Facade

```
app/infrastructure/guards/
├── authn/                                # Authentication: Identity & Tenant Resolution
│   ├── ApiKeyAuthGuard.server.ts
│   ├── SessionAuthGuard.server.ts
│   ├── ApiKeyOrSessionAuthGuard.server.ts
│   └── index.ts
│
├── authz/                                # Authorization: Role & Permission Enforcement
│   ├── PermissionsGuard.server.ts
│   ├── RequirePermission.ts
│   └── index.ts
│
├── types/                                # Request & Context Contracts
│   ├── AuthenticatedRequest.ts
│   └── index.ts
│
└── index.ts                              # Public barrel export (Facade for all guards)
```

- **Rationale**: Keeps authentication distinct from authorization. Future guards (such as `JwtAuthGuard` or `RateLimitGuard`) slot cleanly into `authn/` without cluttering the directory.
- **Root Facade**: The root `app/infrastructure/guards/index.ts` re-exports everything from `authn/`, `authz/`, and `types/`, ensuring that existing callers (`NoticesController`, `NoticesModule`, and tests) do not break.

### Decision 2 — Request Contract & Role Hydration on `AuthenticatedRequest`

Update `AuthenticatedRequest`:
```typescript
import type { RoleId } from "~/frontend/user/roles";

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
	role?: RoleId;
}
```

- In `SessionAuthGuard`:
  Calls `getUserRoleFromSession(fetchRequest)` and assigns `req.role = userRole`.
- In `ApiKeyAuthGuard`:
  Queries the `role` from `userTable` for `key.managedByUserId` and assigns `req.role = user.role`.
- **Benefit**: `PermissionsGuard` checks `req.role` directly. This eliminates duplicate DB calls across the guard chain for a single request.

### Decision 3 — `@RequirePermission` and `PermissionsGuard` Implementation

1. **Decorator (`RequirePermission.ts`)**:
   Uses NestJS `SetMetadata` with metadata key `"required_permissions"`:
   ```typescript
   export const PERMISSIONS_KEY = "required_permissions";
   export const RequirePermission = (...permissions: PermissionId[]) =>
       SetMetadata(PERMISSIONS_KEY, permissions);
   ```
2. **Guard (`PermissionsGuard.server.ts`)**:
   - Injects `Reflector`.
   - Extracts permissions from handler and class level:
     ```typescript
     const requiredPermissions = this.reflector.getAllAndOverride<PermissionId[]>(
         PERMISSIONS_KEY,
         [context.getHandler(), context.getClass()]
     );
     ```
   - If no permissions are specified, allows the request (returns `true`).
   - If permissions are specified, verifies that `req.role` has every required permission using `roleHasPermission(req.role, perm)` from `~/frontend/user/roles`.
   - If unauthorized, throws `ForbiddenException` (HTTP 403).

### Decision 4 — Resolving Legacy DEF-002

In `app/backend.server/models/api_key.ts:25`:
- Drizzle's `.select()` returns an array. When no key matches the secret, `ApiKeyRepository.getBySecret()` returns `[]`.
- In JavaScript, `[]` is truthy, so `if (!key)` evaluates to `false`. Execution proceeds to `return key[0]`, which returns `undefined`.
- Callers accessing `apiKey.countryAccountsId` subsequently throw an unhandled 500 `TypeError`.
- **Fix**: Update the guard condition:
  ```typescript
  if (!key || key.length === 0) {
      throw new Response("Unauthorized", { status: 401 });
  }
  ```

---

## Types and Interfaces Added / Changed

- `AuthenticatedRequest`: Updated to include optional `role?: RoleId`.
- `PERMISSIONS_KEY`: String constant exported from `RequirePermission.ts`.
- `RequirePermission`: Function decorator type accepting `...permissions: PermissionId[]`.

---

## Testing Strategy

- **Test Framework**: Vitest with PGlite integration tests (`yarn test:run2`).
- **Unit Tests**:
  - `tests/unit/backend.server/models/apiKeyAuth.test.ts`: Tests `apiAuth()` handling of missing header, invalid key (empty array from repository), and valid key return.
- **Integration Tests**:
  - `tests/integration/guards/PermissionsGuard.test.ts`: NestJS stub controller guarded by `ApiKeyOrSessionAuthGuard` and `PermissionsGuard`, asserting 200 for permitted roles and 403 for unauthorized roles.
  - `tests/integration/guards/ApiKeyAuthGuard.test.ts`: Verifies `req.role` is populated on successful authentication.
  - `tests/integration/guards/ApiKeyOrSessionAuthGuard.test.ts`: Regression verification of existing composite guard tests.

---

## Risks and Trade-offs

- **[Risk]** Missing user record for an API key.
  - *Mitigation*: If `userTable` lookup for `managedByUserId` returns null, `ApiKeyAuthGuard` rejects with 401 `UnauthorizedException`, preventing orphaned API keys from authenticating.
- **[Risk]** Unauthenticated requests reaching `PermissionsGuard`.
  - *Mitigation*: If `req.role` is undefined when permissions are required, `PermissionsGuard` throws `ForbiddenException` (403), ensuring that missing auth context always fails safe.
