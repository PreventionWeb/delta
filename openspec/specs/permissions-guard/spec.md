# permissions-guard Specification

## Purpose
Provides role-based access control (RBAC) for NestJS controllers by evaluating the caller's role against required operation permissions.

## Requirements

### Requirement: PermissionsGuard enforces required permissions
`PermissionsGuard` SHALL implement NestJS `CanActivate`. When an endpoint or controller is decorated with `@RequirePermission(...)`, the guard SHALL check the caller's role against every specified permission using `roleHasPermission`. If the caller lacks any required permission, the guard SHALL throw `ForbiddenException` (HTTP 403).

#### Scenario: User with required permission is allowed
- **GIVEN** an endpoint requiring permission `ViewData`
- **WHEN** an authenticated request with `role = "data-viewer"` is evaluated by `PermissionsGuard`
- **THEN** the guard returns `true` and the request proceeds

#### Scenario: User without required permission is rejected
- **GIVEN** an endpoint requiring permission `EditData`
- **WHEN** an authenticated request with `role = "data-viewer"` is evaluated by `PermissionsGuard`
- **THEN** the guard throws `ForbiddenException` with HTTP status 403

#### Scenario: Request without role is rejected
- **GIVEN** an endpoint requiring permission `ViewData`
- **WHEN** a request arrives where `request.role` is undefined
- **THEN** the guard throws `ForbiddenException` with HTTP status 403

### Requirement: PermissionsGuard allows unannotated endpoints
When neither the handler nor the controller class has the `@RequirePermission` metadata set, `PermissionsGuard` SHALL return `true`.

#### Scenario: No permission annotations
- **GIVEN** an endpoint with no `@RequirePermission` decorator
- **WHEN** any request is evaluated by `PermissionsGuard`
- **THEN** the guard returns `true`

### Requirement: RequirePermission decorator declares required permissions
The `@RequirePermission(...permissions: PermissionId[])` decorator SHALL associate the provided permission identifiers with the handler or class under metadata key `required_permissions`.

#### Scenario: Handler metadata inspection
- **WHEN** a handler is decorated with `@RequirePermission("EditData", "ValidateData")`
- **THEN** `Reflector.get("required_permissions", handler)` returns `["EditData", "ValidateData"]`
