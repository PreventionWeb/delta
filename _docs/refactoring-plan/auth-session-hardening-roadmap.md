# Auth & Session Hardening Roadmap

## Purpose

Implements [ADR-006](../decisions/ADR-006-session-revocation-and-idp-trust.md): close the two
session-revocation gaps in DELTA's login flow (no suspension concept in `userTable`, no
re-validation against the identity provider after initial login), and do it behind an
`IIdentityProvider` port so a future move to Keycloak — or a per-tenant mix of Azure AD B2C,
Okta, Google, or an already-hosted Keycloak — is an adapter addition, not a rewrite.

This work is **independent of the Notices pilot** (`notices-pilot-roadmap.md`). It touches the
login flow for every user in the app, not one domain. The Notices pilot's 5c (a short-lived
bearer token for direct API callers) is a separate, narrower concern that is minted off an
already-authenticated session — it does not depend on this roadmap, and this roadmap does not
depend on it.

---

## Reading This Document

Same conventions as the Notices pilot roadmap:

| Symbol | Meaning |
|--------|---------|
| 🔷 **OpenSpec Intent** | Invoke `/opsx:propose "<text>"` to generate spec artifacts; implement via `/opsx:apply` |
| ⬜ **Non-OpenSpec task** | Mechanical / unambiguous; create files or run commands directly |
| 🏁 **Phase gate** | Explicit "done" criteria before the next phase begins |

Each OpenSpec Intent lives on its own branch and its own PR to `dev`.
Branch naming: `feature/auth-<intent-slug>`.

---

## Phase 1 — Identity Provider Abstraction

### 🔷 1a — IIdentityProvider Port + Azure B2C Adapter

**Branch:** `feature/auth-identity-provider-port`

**Intent for `/opsx:propose`:**
```
Define IIdentityProvider port in app/shared/identity/IIdentityProvider.ts with methods
getAuthorizationUrl, exchangeCodeForTokens, decodeIdentity, refreshTokens, and types
IdpTokenSet / IdpIdentity — then refactor the existing Azure AD B2C login flow in
app/utils/ssoauzeb2c.ts into AzureB2CIdentityProvider in
app/infrastructure/identity/AzureB2CIdentityProvider.server.ts implementing this port,
with no behavior change to the existing login/redirect flow
```

**Files touched:**
- `app/shared/identity/IIdentityProvider.ts` (new)
- `app/infrastructure/identity/AzureB2CIdentityProvider.server.ts` (new)
- `app/utils/ssoauzeb2c.ts` (update — existing exports delegate to the adapter, or are removed
  once all call sites move to the port)
- Login routes calling `ssoauzeb2c.ts` directly (update to call the adapter through the port)

**Test tier:** Unit — `AzureB2CIdentityProvider` satisfies `IIdentityProvider`; existing
Azure login/redirect behavior is unchanged (covered by existing E2E login tests, which must
stay green).

**Why now:** Every later intent in this roadmap (per-tenant resolution, refresh-token
re-validation) is written against this port, not against Azure directly. Sequencing it last
would mean rework.

---

### 🔷 1b — Per-Tenant Identity Provider Resolution

**Branch:** `feature/auth-identity-provider-registry`
**Depends on:** 1a

**Intent for `/opsx:propose`:**
```
Add ssoProviderType ('azure_b2c' | 'okta' | 'google' | 'keycloak', nullable) and
ssoProviderConfigRef (text — a config/secrets-manager reference, never a raw secret) columns
to countryAccountsTable, then add IdentityProviderRegistry in
app/shared/identity/IdentityProviderRegistry.ts with a resolve(tenantId) method that reads
those columns and returns the matching IIdentityProvider adapter instance from a small factory
keyed on providerType — AzureB2CIdentityProvider is the only registered adapter for now
```

**Files touched:**
- `app/drizzle/schema/countryAccountsTable.ts` (update — add two columns)
- `app/drizzle/migrations/<timestamp>_add_sso_provider_columns.sql` (generated)
- `app/shared/identity/IdentityProviderRegistry.ts` (new)
- `app/shared/identity/IdentityProviderRegistry.test.ts` (new)

**Test tier:** PGlite integration — registry resolves the correct adapter for a tenant row;
throws a clear error for an unregistered `providerType`.

**Why now:** Establishes the seam Okta/Google/Keycloak adapters plug into later, and the seam
the refresh-token re-validation in Phase 3 calls through — without either of those needing to
know which provider a tenant uses.

---

### 🏁 Phase 1 Gate

Existing Azure AD B2C login/logout E2E tests pass unchanged. `yarn tsc` clean.
`IdentityProviderRegistry` resolves `AzureB2CIdentityProvider` for every existing tenant row
(all default to `azure_b2c` via migration backfill, matching today's single-provider behavior).

---

## Phase 2 — Suspension Enforcement

Independent of Phase 1 — can run in parallel.

### 🔷 2a — `userTable.status` Column

**Branch:** `feature/auth-user-status`

**Intent for `/opsx:propose`:**
```
Add status column ('active' | 'suspended', default 'active') to userTable, then update
resolveSession() in app/utils/session.ts to reject a session immediately when the user's
status is 'suspended' — checked alongside the existing session-row and idle/expiry checks
```

**Files touched:**
- `app/drizzle/schema/userTable.ts` (update — add `status` column)
- `app/drizzle/migrations/<timestamp>_add_user_status.sql` (generated)
- `app/utils/session.ts` (update — `resolveSession()` status check)
- `app/utils/session.test.ts` (update)

**Test tier:** PGlite integration — a session for a `suspended` user is rejected on the next
request even though the session row and idle timeout are both still otherwise valid.

**Why now:** Closes the `form`-auth (dev/password) revocation gap completely, with no
dependency on Phase 1. Also gives Phase 3 a template for how a rejection short-circuits
`resolveSession()`.

---

### 🏁 Phase 2 Gate

A suspended user is logged out on their very next request regardless of auth type.
`yarn test:run2` green.

---

## Phase 3 — Identity Provider Re-Validation

### 🔷 3a — Refresh-Token Re-Validation

**Branch:** `feature/auth-idp-revalidation`
**Depends on:** 1b, 2a

**Intent for `/opsx:propose`:**
```
Request the offline_access scope at login so the resolved IIdentityProvider issues a refresh
token alongside the ID token; store it against the sessionTable row (never sent to the
browser). On session renewal past a configurable re-validation interval, resolve the tenant's
IIdentityProvider via IdentityProviderRegistry and call refreshTokens(storedRefreshToken) —
a rejection immediately deletes the local session row. A provider-endpoint failure (network
error, timeout) must fail open to the existing idle/absolute timeout rather than blocking
the request.
```

**Files touched:**
- `app/utils/session.ts` (update — renewal path calls `IdentityProviderRegistry.resolve()`)
- `app/drizzle/schema/sessionTable.ts` (update — add encrypted `idpRefreshToken` column)
- `app/infrastructure/identity/AzureB2CIdentityProvider.server.ts` (update — implement
  `refreshTokens()` against Azure's token endpoint)
- `tests/integration/auth/idpRevalidation.test.ts` (new)

**Test tier:** PGlite + mocked IdP integration — a refresh rejection deletes the session row;
a provider-endpoint failure falls back to the existing timeout instead of blocking the request.

---

### 🔷 3b — Configurable Session Timeouts

**Branch:** `feature/auth-configurable-timeouts`
**Depends on:** 3a

**Intent for `/opsx:propose`:**
```
Make all three session timing values environment-configurable, each defaulting to today's
hardcoded value: SESSION_IDLE_TIMEOUT_MINUTES (default 40, replacing the
sessionActivityTimeoutMinutes constant), SESSION_MAX_AGE_SECONDS (default 3600, replacing the
inline cookieSessionExpiration in session.ts), and SESSION_AAD_REVALIDATION_MINUTES
(default 15, the interval introduced by 3a)
```

**Files touched:**
- `app/utils/session-activity-config.ts` (update)
- `app/utils/session.ts` (update — read `SESSION_MAX_AGE_SECONDS`)
- `.env.example` (update — document the three new vars)

**Test tier:** Unit — each config reads its env var when set, falls back to today's value
when unset (no behavior change by default).

---

### 🏁 Auth Hardening Complete Gate

- [ ] Suspended user (either auth path) is rejected on their next request
- [ ] Account suspended at the IdP is rejected within one re-validation interval, not the full
  idle/absolute timeout
- [ ] A second IdP (any of Okta/Google/Keycloak) can be added by writing one adapter class and
  setting two columns on a `countryAccountsTable` row — no changes to `session.ts`,
  middleware, or login routes
- [ ] All three timeouts are environment-configurable with unchanged defaults
- [ ] `yarn test:run2`, `yarn test:e2e`, `yarn tsc`, `yarn format:check` all green

---

## Dependency Graph

```
Phase 1:  1a (IIdentityProvider port + Azure adapter) ──► 1b (per-tenant registry)
Phase 2:  2a (userTable.status)                                    [parallel to Phase 1]
Phase 3:  1b + 2a ──► 3a (refresh-token re-validation) ──► 3b (configurable timeouts)
```

## All OpenSpec Intents at a Glance

| # | Intent | Branch | Test tier |
|---|--------|--------|-----------|
| 1a | IIdentityProvider port + Azure B2C adapter | `feature/auth-identity-provider-port` | Unit + existing E2E |
| 1b | Per-tenant identity provider resolution | `feature/auth-identity-provider-registry` | PGlite |
| 2a | userTable.status + resolveSession() check | `feature/auth-user-status` | PGlite |
| 3a | IdP refresh-token re-validation | `feature/auth-idp-revalidation` | PGlite + mocked IdP |
| 3b | Configurable session timeouts | `feature/auth-configurable-timeouts` | Unit |

## References
- [ADR-006](../decisions/ADR-006-session-revocation-and-idp-trust.md) — the decision this
  roadmap implements
- [ADR-004](../decisions/ADR-004-logging-and-traceability.md) — `ILogger` port precedent for
  the `IIdentityProvider` port's shape
- [Notices Pilot Roadmap](notices-pilot-roadmap.md) — independent; 5c's bearer-token issuance
  is unaffected by this roadmap
