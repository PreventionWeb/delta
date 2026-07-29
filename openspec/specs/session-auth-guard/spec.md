# session-auth-guard Specification

## Purpose
TBD - created by archiving change notices-rest-controller. Update Purpose after archive.
## Requirements
### Requirement: SessionAuthGuard resolves tenantId and userId from the existing session cookie
`SessionAuthGuard` (`app/domains/notices/presentation/guards/SessionAuthGuard.server.ts`)
SHALL implement NestJS `CanActivate`. On a request carrying a valid `__session` cookie
resolving to an active, non-expired session with an associated `countryAccountsId`, the guard
SHALL set `request.tenantId` and `request.userId` and allow the request to proceed.

#### Scenario: Valid session populates tenantId and userId
- **WHEN** a request carries a `Cookie` header resolving to an active session for a user with
  a resolvable `countryAccountsId`
- **THEN** `canActivate()` returns `true`
- **AND** `request.tenantId` equals that session's `countryAccountsId`
- **AND** `request.userId` equals that session's user id

### Requirement: SessionAuthGuard rejects requests with no valid session
`SessionAuthGuard` SHALL throw `UnauthorizedException` (HTTP 401) when the request has no
`Cookie` header, an expired session, or a session with no resolvable `countryAccountsId`.

#### Scenario: Missing cookie is rejected
- **WHEN** a request carries no `Cookie` header
- **THEN** `canActivate()` throws `UnauthorizedException`

#### Scenario: Expired session is rejected
- **WHEN** a request's session cookie resolves to a session whose last-activity timeout has
  elapsed (per `sessionActivityTimeoutMinutes`)
- **THEN** `canActivate()` throws `UnauthorizedException`

#### Scenario: Session with no resolvable tenant is rejected
- **WHEN** a request's session is valid but no `countryAccountsId` can be resolved for it
- **THEN** `canActivate()` throws `UnauthorizedException`

### Requirement: SessionAuthGuard writes the resolved tenantId and userId into the request-context store
`SessionAuthGuard` SHALL, in addition to setting `request.tenantId`/`request.userId`, write the
same values into the active `getRequestContext()` store (`app/utils/requestContext.server.ts`)
when one is present, mirroring the "resolve then mutate the live store" pattern the root
`requestContextMiddleware` already uses. `PinoLogger`'s `contextMixin()` reads exclusively from
this store to attribute `tenantId`/`userId` on every log line per ADR-004 — without this, every
log line emitted while handling a Notices API request carries `tenantId: null, userId: null`
regardless of what `request.tenantId` holds.

#### Scenario: A successful canActivate() populates the request-context store
- **WHEN** `canActivate()` resolves a valid session with a resolvable `countryAccountsId`
- **THEN** `getRequestContext()?.tenantId` equals that session's `countryAccountsId`
- **AND** `getRequestContext()?.userId` equals that session's user id

#### Scenario: A log line emitted during an authenticated request carries tenantId and userId
- **WHEN** an authenticated request to any `NoticesController` route triggers a use case that
  calls `ILogger.info()`
- **THEN** the resulting log line's `tenantId` and `userId` fields match the request's
  authenticated session — neither is `null`

### Requirement: SessionAuthGuard reuses existing session helpers rather than re-parsing cookies
`SessionAuthGuard` SHALL resolve the session by constructing a Fetch API `Request` from the
Express request's `Cookie` header and passing it to the existing
`getUserFromSession()`/`getCountryAccountsIdFromSession()` functions
(`app/utils/session.ts`) unchanged. It MUST NOT reimplement cookie parsing or session-row
lookup.

#### Scenario: Guard delegates to getUserFromSession
- **WHEN** `canActivate()` runs on a request with a valid session cookie
- **THEN** the resolved user matches exactly what `getUserFromSession()` would return for an
  equivalent Fetch `Request` carrying the same `Cookie` header

