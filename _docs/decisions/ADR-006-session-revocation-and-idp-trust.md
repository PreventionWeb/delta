# ADR-006: Session Revocation and Identity Provider Trust Boundary

## Status
Proposed

## Date
2026-07-22

## Context

DELTA supports two authentication paths, distinguished by `userTable.authType`:
- `form` — username/password, used in dev and other non-production environments. DELTA is the
  identity source of truth.
- `sso_azure_b2c` — Azure AD B2C, used in production. Azure is the identity source of truth.

Both paths converge on the same session mechanism (`app/utils/session.ts`): on successful login,
`createUserSession()` writes a row to `sessionTable` and sets an opaque `sessionId` in an httpOnly
cookie. Every request re-validates the session by looking up that row (`resolveSession()`),
enforcing a 40-minute idle timeout (`sessionActivityTimeoutMinutes`) and a 1-hour absolute cookie
expiry (`cookieSessionExpiration`). Deleting the `sessionTable` row revokes access immediately on
the next request — this is already stronger than a stateless JWT's default revocation guarantee,
which is bounded only by token expiry.

Two gaps exist independent of that session mechanism:

1. **No suspension concept in DELTA's own data model.** `userTable` has no `status` /
   `isActive` column. An admin can only remove access by deleting the user row, and even that
   doesn't clean up the corresponding `sessionTable` row (existing `TODO` at `session.ts:176`).
   This affects both auth paths.
2. **No re-validation against Azure AD B2C after initial login.** The B2C token is decoded once
   at login (`ssoauzeb2c.ts`) purely to read login claims, then discarded — DELTA never checks
   back with Azure. If an account is suspended in Azure AD mid-session, DELTA has no way to find
   out; the user rides out the existing idle/absolute timeout regardless of the Azure-side change.
3. **SSO is hardcoded to one provider, globally.** `ssoauzeb2c.ts` and `config.ts` talk to Azure
   AD B2C directly, configured through a single set of global `SSO_AZURE_B2C_*` env vars
   (`countryAccountsTable` has no notion of "which IdP does this tenant use"). DELTA is deployed
   per-country (`countryAccountsTable` is already the tenant boundary used throughout the
   codebase), and different national deployments are expected to bring their own identity
   provider — Okta, Google, an already-hosted Keycloak, or Azure AD B2C — not necessarily the
   same one. A future move to Keycloak (as a broker in front of any of these, for tenants that
   want it) must not require touching session validation, login routes, or middleware — only
   adding one new adapter.

The goal is to close all three gaps using standard OIDC patterns, without introducing a new
identity provider (e.g. Keycloak) into the stack today — while making that swap, or a
per-tenant mix of providers, a matter of adding an adapter rather than rewriting call sites.

## Decision

### 1. `userTable.status` column

Add a `status` column (`'active' | 'suspended'`, default `'active'`) to `userTable`. `resolveSession()`
checks this alongside the existing session-row lookup and idle/expiry checks — a suspended user's
session is rejected on the very next request, regardless of auth path. This closes the gap for
`form`-authenticated users entirely, with no external dependency.

`form` (username/password) auth is DELTA's own credential check, not an external identity
provider — it is intentionally outside the `IIdentityProvider` port defined below.

### 2. `IIdentityProvider` port

Following the same ports-and-adapters convention already established for `ILogger`
(ADR-004) and `INoticeRepository`: SSO integration is defined as an interface in the shared
layer, with one adapter per external identity provider. Nothing outside the adapter and a small
resolution registry is allowed to know which concrete IdP a tenant uses.

```typescript
// app/shared/identity/IIdentityProvider.ts
export interface IdpTokenSet {
  idToken: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
}

export interface IdpIdentity {
  subject: string;       // stable IdP-assigned user id
  email: string;
  emailVerified: boolean;
  raw: Record<string, unknown>;
}

export interface IIdentityProvider {
  readonly providerType: string; // 'azure_b2c' | 'okta' | 'google' | 'keycloak'
  getAuthorizationUrl(params: { state: string; redirectUri: string }): string;
  exchangeCodeForTokens(params: { code: string; redirectUri: string }): Promise<IdpTokenSet>;
  decodeIdentity(idToken: string): IdpIdentity;
  // Rejects (IdpRefreshRejectedError) when the IdP has revoked/suspended the account.
  refreshTokens(refreshToken: string): Promise<IdpTokenSet>;
}
```

`AzureB2CIdentityProvider` (`app/infrastructure/identity/AzureB2CIdentityProvider.server.ts`) is
the first adapter — a refactor of the existing `ssoauzeb2c.ts` logic behind this interface, not a
behavior change. `OktaIdentityProvider`, `GoogleIdentityProvider`, and `KeycloakIdentityProvider`
are added later as pure adapters satisfying the same port; none of them touch
`resolveSession()`, login routes, or middleware.

**Per-tenant resolution.** `countryAccountsTable` gains two columns: `ssoProviderType`
(`'azure_b2c' | 'okta' | 'google' | 'keycloak'`, nullable — null means `form`-only) and
`ssoProviderConfigRef` (a config *reference*, e.g. an env-var prefix or secrets-manager key name
— never the raw client secret itself, consistent with how `SESSION_SECRET` and
`SSO_AZURE_B2C_CLIENT_SECRET` are already sourced from the environment rather than the database).
An `IdentityProviderRegistry.resolve(tenantId)` reads those two columns and returns the matching
adapter instance from a small factory keyed on `providerType`. Login routes and session code call
`registry.resolve(tenantId)` and program only against `IIdentityProvider` — they never reference
Azure, Okta, or Keycloak by name.

### 3. Azure AD B2C refresh-token re-validation

For SSO-authenticated users, request the `offline_access` scope at login so the IdP issues a
refresh token alongside the ID token. Store that refresh token server-side against the
`sessionTable` row (never exposed to the browser). On session renewal — i.e. whenever a request
would otherwise reset the idle timer past a configurable re-validation interval — resolve the
tenant's `IIdentityProvider` via the registry and call `.refreshTokens(storedRefreshToken)`. A
rejection (account suspended/disabled at the IdP) immediately deletes the local session row.

This bounds the exposure window for an IdP-side suspension to the re-validation interval, not
the full idle/absolute timeout — and works identically regardless of which provider a given
tenant uses.

### 4. Configurable timeouts

All three timing values become environment-configurable, each with today's value as the default —
no behavior change until explicitly tuned:

| Config | Env var | Default |
|--------|---------|---------|
| Idle timeout | `SESSION_IDLE_TIMEOUT_MINUTES` | 40 |
| Absolute cookie expiry | `SESSION_MAX_AGE_SECONDS` | 3600 (1 hour) |
| AAD re-validation interval | `SESSION_AAD_REVALIDATION_MINUTES` | 15 |

### Out of scope

Bearer-token issuance for direct API access (mobile clients, service-to-service calls with no
browser cookie) is a separate, narrower concern — tracked under the Notices pilot's REST API
intent (5c) — and is not part of this ADR. That token is minted off an already-authenticated
session and does not change the browser login flow this ADR governs.

## Consequences

**Positive:**
- Closes all three identified gaps using only the IdP's existing OIDC capabilities — no new
  identity infrastructure required today.
- Adding a new IdP (Keycloak, Okta, Google) — for one tenant or all of them — means writing one
  adapter class and setting `ssoProviderType`/`ssoProviderConfigRef` on the relevant
  `countryAccountsTable` rows. Zero changes to session validation, middleware, or login route
  logic.
- Different national deployments can run different providers simultaneously (e.g. one tenant on
  Azure AD B2C, another on a self-hosted Keycloak) without branching logic anywhere outside the
  registry's factory.
- Session-table revocation (already stronger than stateless JWT) is preserved rather than
  discarded.
- Timeout values move from hardcoded to configurable, enabling per-environment tuning without
  code changes.

**Trade-offs:**
- Refresh-token storage adds a sensitive value to `sessionTable` requiring the same handling
  rigor as the session id itself (never logged, never sent to the client).
- The IdP re-validation round-trip adds latency to whichever request triggers it and a new
  failure mode (IdP endpoint unreachable) that must fail safe — falling back to the existing
  idle/absolute timeout rather than blocking the request outright.
- The registry adds one more indirection to the login/refresh path (resolve tenant → provider
  type → adapter instance). Acceptable since it only runs on login/renewal, not every request.
- `sessionTable` cleanup on user deletion (the existing `TODO`) should be fixed alongside this
  work since both touch the same lookup path, even though it is a distinct bug.

## References
- [ADR-004](ADR-004-logging-and-traceability.md) — `traceId`/request-context infrastructure the
  re-validation call should log through.
- [Notices Pilot Roadmap](../refactoring-plan/notices-pilot-roadmap.md) — 5c's bearer-token
  issuance is a related but independent concern.
- [Auth & Session Hardening Roadmap](../refactoring-plan/auth-session-hardening-roadmap.md) —
  implementation sequence for this ADR.
