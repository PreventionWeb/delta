# Spec Delta

## MODIFIED Requirements

### Requirement: SessionAuthGuard resolves tenantId and userId from the existing session cookie

`SessionAuthGuard` (`app/infrastructure/guards/SessionAuthGuard.server.ts`)
SHALL implement NestJS `CanActivate`. On a request carrying a valid `__session` cookie
resolving to an active, non-expired session with an associated `countryAccountsId`, the guard
SHALL set `request.tenantId` and `request.userId` and allow the request to proceed.

#### Scenario: Valid session populates tenantId and userId

- **WHEN** a request carries a `Cookie` header resolving to an active session for a user with
  a resolvable `countryAccountsId`
- **THEN** `canActivate()` returns `true`
- **AND** `request.tenantId` equals that session's `countryAccountsId`
- **AND** `request.userId` equals that session's user id
