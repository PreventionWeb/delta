# api-key-auth-guard Specification

## Purpose
Provides machine-to-machine and programmatic authentication for REST endpoints via the `X-Auth` header, resolving tenant and user identities from the database.

## Requirements

### Requirement: ApiKeyAuthGuard validates X-Auth header against apiKeyTable
`ApiKeyAuthGuard` SHALL implement NestJS `CanActivate`. On a request carrying a valid `X-Auth` header matching an active row in `apiKeyTable` with non-null `countryAccountsId` and `managedByUserId`, the guard SHALL populate `request.tenantId` and `request.userId` and allow the request to proceed.

#### Scenario: Valid API key allows request
- **WHEN** an HTTP request includes an `X-Auth` header matching a persisted API key secret with an associated tenant
- **THEN** `request.tenantId` is set to the key's `countryAccountsId`, `request.userId` is set to `managedByUserId`, and the guard returns `true`

### Requirement: ApiKeyAuthGuard rejects missing, invalid, or tenantless API keys
`ApiKeyAuthGuard` SHALL throw `UnauthorizedException` (HTTP 401) when the `X-Auth` header is omitted, does not match any row in `apiKeyTable`, or references an API key lacking a `countryAccountsId` or `managedByUserId`.

#### Scenario: Missing X-Auth header
- **WHEN** an HTTP request is made without an `X-Auth` header
- **THEN** the guard throws `UnauthorizedException` with status code 401

#### Scenario: Non-existent API key
- **WHEN** an HTTP request carries an `X-Auth` header value that does not exist in `apiKeyTable`
- **THEN** the guard throws `UnauthorizedException` with status code 401

#### Scenario: API key missing tenant association
- **WHEN** an HTTP request carries an `X-Auth` header whose database record has a null `countryAccountsId`
- **THEN** the guard throws `UnauthorizedException` with status code 401

### Requirement: ApiKeyAuthGuard populates request-context store
`ApiKeyAuthGuard` SHALL write the resolved `tenantId` and `userId` into the active `getRequestContext()` AsyncLocalStorage store when present, ensuring logger attribution per ADR-004.

#### Scenario: Request context attribution
- **WHEN** an HTTP request is successfully authenticated via `ApiKeyAuthGuard` within an active request context
- **THEN** the request context store holds `tenantId` and `userId` matching the API key record

### Requirement: ApiKeyAuthGuard populates request.role from userCountryAccountsTable
`ApiKeyAuthGuard` SHALL query `userCountryAccountsTable` by `userId` and `countryAccountsId` to look up the caller's role. If a role is found, it SHALL populate `request.role`.

#### Scenario: User with assigned tenant role
- **WHEN** an HTTP request is authenticated with an API key whose user has a role assigned in `userCountryAccountsTable` for that tenant
- **THEN** `request.role` is populated with the matching `RoleId`

