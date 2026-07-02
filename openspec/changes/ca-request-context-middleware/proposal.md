## Why

`app/utils/requestContext.server.ts` exposes `withRequestContext(fn)` / `getRequestContext()`
backed by `AsyncLocalStorage`, but `withRequestContext()` is called nowhere in production code
today (confirmed by repo-wide search). `getUserFromSession()` calls `getRequestContext()`
defensively and silently falls back to the uncached DB path whenever no scope is active — which
is every real request right now. This means the P1-14 session memoization guarantee is dormant
in production, and ADR-004's mandatory per-request `traceId`/`tenantId`/`userId` fields (required
on every log line and in every error response per ADR-003) have no mechanism to populate them.
Today, any future consumer (e.g. the Notices route adapter) would have to remember to open its
own `withRequestContext` scope by hand, per loader — exactly the kind of thing that gets forgotten
route by route, and which does not actually give every route the same `traceId` for a single
request (parent layout loader and child loader would each mint their own). This proposal wires
`withRequestContext` into the one true app-wide interception point so every route benefits
automatically, without any per-route opt-in.

## What Changes

- Extend `RequestContextStore` (`app/utils/requestContext.server.ts`) with three additive fields:
  `traceId: string`, `tenantId: string | null`, `userId: string | null` — existing
  `sessionCache` / `sessionCachePromise` fields and their semantics are unchanged.
- Add an optional `seed` parameter to `withRequestContext(fn, seed?)` so `traceId` can be
  supplied at store-creation time (defaulting to `crypto.randomUUID()` when omitted). Existing
  one-argument call sites (`withRequestContext(fn)`, used today only in
  `tests/unit/utils/requestContext.test.ts`) keep compiling and behave identically.
  `tenantId` / `userId` are not part of the seed — they are populated via direct mutation on the
  live store, mirroring the existing `sessionCache` mutation pattern, because they are only
  knowable after an async session lookup that must happen inside the ALS scope.
- Add a new root-level React Router v7 `middleware` (exported from `app/root.tsx`, or a
  dedicated `app/middleware/requestContext.server.ts` module re-exported from `root.tsx` —
  decided in design.md) that runs once per request, before any loader/action in the matched
  route tree, and:
  1. Generates a `traceId` via `crypto.randomUUID()`.
  2. Calls `withRequestContext(() => next(), { traceId })` to open the ALS scope for the
     remainder of the request (all nested loaders/actions execute inside this single scope).
  3. Inside that scope, resolves `tenantId` (via `getCountryAccountsIdFromSession`) and `userId`
     (via `getUserFromSession`) and writes them onto the live store — best-effort, never blocking
     or failing the request if session resolution fails or the user is unauthenticated.
- This is the first use of React Router v7's stable `middleware` API in this codebase. The
  `future.v8_middleware` flag is already enabled in `react-router.config.ts` — no build
  configuration change is required.
- No changes to any existing loader, action, or route file. No changes to
  `getUserFromSession()`'s existing `sessionCache` logic.

## Capabilities

### New Capabilities
- `request-context-middleware`: defines the app-wide middleware that seeds `traceId`,
  `tenantId`, and `userId` into the `RequestContextStore` for every request, before any route
  loader or action runs.

### Modified Capabilities
- `request-context-store` (`openspec/specs/request-context-store/spec.md`): the store type gains
  `traceId` / `tenantId` / `userId` fields and `withRequestContext` gains an optional `seed`
  parameter. Existing isolation and live-mutation requirements for `sessionCache` /
  `sessionCachePromise` are unchanged and re-verified, not altered.

## Impact

**Files to change:**
- `app/utils/requestContext.server.ts` — extend `RequestContextStore` type; add `seed` parameter
  to `withRequestContext`.
- `app/root.tsx` — export a root-level `middleware` array so the wiring applies to every matched
  route (root is matched by 100% of requests in this flat-routes app).
- Possibly a new `app/middleware/requestContext.server.ts` (or similar) — houses the middleware
  function itself, kept out of `root.tsx` to keep that file focused on document rendering
  (final placement decided in design.md).
- `openspec/specs/request-context-store/spec.md` — delta spec for the type/signature change.
- New: `openspec/changes/ca-request-context-middleware/specs/request-context-middleware/spec.md`
  — new capability spec for the middleware behaviour.

**No DB migration required** — this is purely an in-process `AsyncLocalStorage` change; no
schema, table, or column is touched.

**Test approach:** Unit tests (Vitest, no PGlite/real DB needed) in `tests/unit/utils/`:
1. A test simulating the middleware's seeding behavior asserts that `traceId`/`tenantId`/
   `userId` are visible via `getRequestContext()` inside a nested async call (proxy for "inside
   a loader").
2. A regression test re-running the existing P1-14 memoization scenario (two sequential/
   concurrent `getUserFromSession()` calls inside one scope trigger exactly one DB lookup)
   unchanged, proving the new fields do not disturb existing `sessionCache` semantics.
3. Given React Router's `middleware` array executes as part of the route tree, a lightweight
   test exercising the actual exported middleware function directly (calling it with a mock
   `{ request, context }` and a `next` stub) is preferred over a full E2E render, to keep this
   tier at "Unit" as specified. If direct unit-level exercise of the middleware function proves
   impractical without significant RR7 test scaffolding, design.md documents the fallback
   (documented, not silently skipped).

**Security / multi-tenancy implications:** `tenantId` is read via the existing, already-audited
`getCountryAccountsIdFromSession` — no new session-reading code path is introduced. The
middleware does not enforce authentication or tenant scoping itself (that remains
`authLoaderWithPerm`'s job) — it only *observes* and records the already-resolved session data
for logging/tracing purposes. A missing or invalid session results in `tenantId: null` /
`userId: null`, never a thrown error, so this change cannot itself introduce an auth bypass or a
new failure mode for existing routes.

**Blast radius (primary risk):** `app/root.tsx` is matched by every route in this application
(flat-routes with a single top-level `root`). Any defect in the new middleware — an unhandled
throw, an infinite `next()` loop, a hang on session resolution — affects every page, not just
new code. This is called out explicitly as the primary risk in design.md, with a mitigation plan
and an explicit regression scenario covering at least one existing, unrelated route.

**Explicitly out of scope:** NestJS HTTP controller-side context propagation (Phase 5c, once
REST controllers exist) is a known, separate follow-up — not assumed to be covered by this
change, since only the React Router loader/action path is a live HTTP surface today.
