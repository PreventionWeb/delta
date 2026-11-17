# modular-guards-structure Specification

## Purpose
Establishes a structured subfolder organization within `app/infrastructure/guards/` separating authentication (AuthN), authorization (AuthZ), and request contracts.

## Requirements

### Requirement: Guards directory subdomains
The guard infrastructure SHALL be organized into `authn/`, `authz/`, and `types/` subdirectories:
- `authn/`: Housing `ApiKeyAuthGuard`, `SessionAuthGuard`, and `ApiKeyOrSessionAuthGuard`.
- `authz/`: Housing `PermissionsGuard` and `RequirePermission`.
- `types/`: Housing `AuthenticatedRequest`.

#### Scenario: Subdomain imports
- **WHEN** consumer code imports directly from subdomains (`~/infrastructure/guards/authn`, `~/infrastructure/guards/authz`, or `~/infrastructure/guards/types`)
- **THEN** the corresponding guards, decorators, and interfaces resolve cleanly with no circular dependencies

### Requirement: AuthenticatedRequest includes caller role
`AuthenticatedRequest` SHALL declare an optional `role?: RoleId` field alongside `tenantId` and `userId`.

#### Scenario: Role contract
- **WHEN** an authenticated request object is inspected
- **THEN** it accepts and exposes a typed `role` property matching a valid `RoleId`

### Requirement: Root facade preserves backward compatibility
The root file `app/infrastructure/guards/index.ts` SHALL export all guards, decorators, and types from `authn/`, `authz/`, and `types/`.

#### Scenario: Existing root imports
- **WHEN** existing controllers or tests import `{ ApiKeyAuthGuard, SessionAuthGuard, ApiKeyOrSessionAuthGuard, AuthenticatedRequest }` from `~/infrastructure/guards`
- **THEN** all exports resolve identically without breaking existing call sites
