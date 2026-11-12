# composite-auth-guard Specification

## Purpose
Enables dual-mode authentication for REST endpoints by combining API key and session cookie verification with logical OR semantics.

## Requirements

### Requirement: ApiKeyOrSessionAuthGuard authenticates via API key or session cookie
`ApiKeyOrSessionAuthGuard` SHALL implement NestJS `CanActivate`. When the request carries an `X-Auth` header, it SHALL delegate authentication to `ApiKeyAuthGuard`. When `X-Auth` is omitted, it SHALL delegate authentication to `SessionAuthGuard`.

#### Scenario: Request authenticated via X-Auth header
- **WHEN** a request with an `X-Auth` header matching a valid API key is processed
- **THEN** authentication succeeds via `ApiKeyAuthGuard` and the request proceeds

#### Scenario: Request authenticated via session cookie
- **WHEN** a request without `X-Auth` carries a valid `__session` cookie
- **THEN** authentication succeeds via `SessionAuthGuard` and the request proceeds

#### Scenario: Request rejected when neither credential is valid
- **WHEN** a request carries neither a valid `X-Auth` header nor a valid `__session` cookie
- **THEN** `UnauthorizedException` (HTTP 401) is thrown
