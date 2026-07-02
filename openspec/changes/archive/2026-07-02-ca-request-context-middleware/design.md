## Context

`app/utils/requestContext.server.ts` provides `RequestContextStore` (currently `sessionCache` /
`sessionCachePromise` only), `withRequestContext(fn)`, and `getRequestContext()`, backed by
`node:async_hooks`'s `AsyncLocalStorage`. `getUserFromSession()` (`app/utils/session.ts`) reads
and writes `sessionCache` defensively — if `getRequestContext()` returns `undefined` (no active
scope), it falls back to the uncached DB path.

**Verified fact (not assumed):** `withRequestContext()` is called nowhere in `app/` today. Full
repo search (`*.tsx` and `app/`) confirms zero call sites outside
`tests/unit/utils/requestContext.test.ts`. This means the P1-14 memoization guarantee, though
implemented and unit-tested, is currently dormant for every real request — every
`getUserFromSession()` call in production hits the DB, even the double-call inside
`authLoaderWithPerm` (`requireUser` + `getUserRoleFromSession`) that P1-14 was built to
eliminate.

ADR-004 (`_docs/decisions/ADR-004-logging-and-traceability.md`) anticipates `traceId`, `tenantId`,
`userId` flowing through this same `AsyncLocalStorage` store, generated once per request and
available to every logger call and error response for that request's lifetime. The archived
P1-14 design (`openspec/changes/archive/2026-06-01-p1-14-session-memoization/design.md`, Open
Question Q1) explicitly deferred "wiring `withRequestContext()` into Express middleware or React
Router loaders" as future ADR-004 scope. This proposal is that follow-on work.

A second, currently-open proposal (`openspec/changes/ca-notices-route-adapter/`) had bundled a
similar-looking `RequestContextStore` extension inside itself, but its design (Decision 2/3)
calls `withRequestContext` **per-loader**, inside each Notices route file — not at an app-wide
interception point. That proposal's own Decision 3 documents the direct consequence: the parent
`_authenticated.tsx` loader and the child `notices/_index.tsx` loader would NOT share a store, so
they'd mint two different `traceId`s for what is, from the outside, a single request. That is the
exact per-route-opt-in failure mode this proposal exists to avoid. This proposal is being landed
first; the Notices proposal will be revised afterward to depend on this one instead of
duplicating the store extension (not this proposal's concern to edit).

**Runtime shape verified:** this app has no custom Express server file — `package.json`'s
`start` script is `react-router-serve ./build/server/index.js`, the framework's built-in
production server. `@react-router/express` and `express` are dependencies but unused for a
custom server entry point in this repo today. `app/entry.server.tsx` exists but only implements
the `handleRequest` streaming-render hook (bot vs. browser rendering) — it does not wrap
loader/action execution and is not a viable interception point for per-request ALS seeding.

**The correct interception point: React Router v7 middleware.** `react-router.config.ts` already
has `future.v8_middleware: true` set (confirmed by reading the file — not a new flag this
proposal introduces). React Router 7.16 ships the (backported, flag-gated) v8 stable middleware
API: a route module can export a `middleware: MiddlewareFunction[]` array; middleware nests
parent → child on the way in and child → parent on the way out, wrapping every loader/action for
every matched route in the tree for that request. A middleware exported from `app/root.tsx` runs
for **every** request in this flat-routes app, because `root` is the ancestor of every route.
This app has zero existing usage of the middleware API or `createContext`/`RouterContextProvider`
— this is a new pattern, introduced deliberately and narrowly for this one cross-cutting concern.

`_authenticated.tsx` was considered and rejected as the interception point: it wraps only
authenticated routes, so public routes (login, FAQ, etc.) would never get a `traceId`, which
contradicts ADR-004's "every log line" requirement.

## Goals / Non-Goals

**Goals:**
- Exactly one `withRequestContext` scope per HTTP request, opened before any route loader/action
  runs, closed after the full route tree (root → leaf) resolves.
- `traceId` present in that scope from the moment it opens (available to root's own loader, not
  just leaf loaders).
- `tenantId` / `userId` populated on a best-effort basis as soon as session data can be resolved,
  without blocking or failing the request if resolution fails.
- Zero changes to any existing route file's loader/action signature or behavior.
- `sessionCache` / `sessionCachePromise` semantics (P1-14) completely unchanged — same fields,
  same three-state contract, same fallback-when-no-scope behavior (now effectively dead code in
  production since a scope is now always active, but left in place: defensive code, and existing
  unit tests that call `getUserFromSession` outside any scope must keep passing).

**Non-Goals:**
- NestJS HTTP controller-side context propagation (Phase 5c REST controllers). Noted as a known,
  separate follow-up in the proposal's Impact section — not silently assumed to be covered here.
  When Phase 5c lands, `pino-http`-style middleware or a NestJS interceptor will need its own
  wiring into a *compatible* context (ideally the same `RequestContextStore`, decided then).
- Any change to `app/entry.server.tsx`'s streaming render logic.
- Introducing Pino or any logger (ADR-004's logging half) — this proposal is the tracing/context
  half only. `getContextualLogger()`-style consumption of these new fields is future work.
- Editing `openspec/changes/ca-notices-route-adapter/` — that proposal is revised separately,
  after this one lands, to depend on it.
- Changing `x-trace-id` response header wiring (ADR-004 also mentions this for frontend/Sentry
  correlation) — out of scope; this proposal only makes `traceId` available server-side via the
  store. Emitting it as a response header is a separate, follow-on concern.

## Decisions

### Decision 1: Extend `RequestContextStore` additively

```ts
// app/utils/requestContext.server.ts
export type RequestContextStore = {
  sessionCache: UserSession | null | undefined;
  sessionCachePromise: Promise<UserSession | null> | undefined;

  /** Generated once per request via crypto.randomUUID(); correlates all log lines
   *  and error responses for this request (ADR-003 / ADR-004). Always present —
   *  never undefined — because the middleware seeds it before any loader runs. */
  traceId: string;

  /** Tenant scoping the current request, resolved from the session cookie via
   *  getCountryAccountsIdFromSession(). null before resolution completes, or when
   *  the request has no tenant selected (public route, or authenticated but no
   *  country account chosen yet). */
  tenantId: string | null;

  /** Authenticated user id for the current request, resolved from the session via
   *  getUserFromSession(). null before resolution completes, or when unauthenticated. */
  userId: string | null;
};
```

No field is renamed, removed, or retyped. `sessionCache` / `sessionCachePromise` keep their
exact existing types and semantics — this is purely additive, matching the "additive to the
type" constraint.

### Decision 2: `withRequestContext` gains an optional `seed` parameter — for `traceId` only

```ts
export function withRequestContext<T>(
  fn: () => Promise<T>,
  seed?: { traceId?: string },
): Promise<T> {
  return als.run(
    {
      sessionCache: undefined,
      sessionCachePromise: undefined,
      traceId: seed?.traceId ?? crypto.randomUUID(),
      tenantId: null,
      userId: null,
    },
    fn,
  );
}
```

**Why a seed parameter for `traceId` but not for `tenantId`/`userId`:** `traceId` can be
generated from nothing (`crypto.randomUUID()`) at the exact moment `als.run()` is called — no
request-specific async work is required first. Seeding it at construction time guarantees it is
present for the *entire* scope, including the root loader itself, which runs immediately after
the scope opens. `tenantId` and `userId` are different in kind: they require an `await` on
`getCountryAccountsIdFromSession(request)` / `getUserFromSession(request)`, both of which must
execute *inside* the ALS scope (so `getUserFromSession`'s own `sessionCache` memoization applies
to that very lookup). There is no value available at `als.run()` call time to seed them with, so
they are populated via direct mutation on the live store returned by `getRequestContext()`,
exactly mirroring the pre-existing `sessionCache` mutation pattern (`ctx.sessionCache = result`)
— not a new pattern, an established one, reused.

**Why optional, not required:** the existing single-argument call sites — today, only in
`tests/unit/utils/requestContext.test.ts` — must keep compiling unchanged. `seed?: {...}` with
`seed?.traceId ?? crypto.randomUUID()` means `withRequestContext(fn)` (no second argument)
behaves exactly as it does today except that `traceId` is now always a generated UUID rather than
simply absent from the store (which is correct — `traceId: string` is non-optional in the type,
so every store, seeded or not, must have one).

**Alternative rejected — mutate-`traceId`-after-entry too (fully uniform with `tenantId`/
`userId`):** rejected because it reopens a real gap: code that runs at the very start of the
scope (e.g. the root loader, or a future "request started" log line emitted by the middleware
itself before calling `next()`) would observe `traceId` as unset for a brief window. A seed
parameter closes that window entirely — `traceId` is correct from `als.run()` onward, by
construction, with no ordering dependency on when a later mutation happens to run.

### Decision 3: The middleware calls `withRequestContext`, not the other way around

**Choice:** `app/middleware/requestContext.server.ts` exports one middleware function:

```ts
// app/middleware/requestContext.server.ts
import type { Route } from "../+types/root";
import { withRequestContext, getRequestContext } from "~/utils/requestContext.server";
import { getUserFromSession, getCountryAccountsIdFromSession } from "~/utils/session";

export const requestContextMiddleware: Route.MiddlewareFunction = ({ request }, next) => {
  const traceId = crypto.randomUUID();
  return withRequestContext(async () => {
    // Best-effort session resolution. Never throws past this point — an
    // unauthenticated or session-lookup-failure request must still be servable.
    const [user, tenantId] = await Promise.allSettled([
      getUserFromSession(request),
      getCountryAccountsIdFromSession(request),
    ]);
    const ctx = getRequestContext();
    if (ctx) {
      ctx.userId = user.status === "fulfilled" ? (user.value?.user.id ?? null) : null;
      ctx.tenantId = tenantId.status === "fulfilled" ? (tenantId.value ?? null) : null;
    }
    return next();
  }, { traceId });
};
```

`app/root.tsx` exports:
```ts
export const middleware: Route.MiddlewareFunction[] = [requestContextMiddleware];
```

**Why the middleware module is separate from `root.tsx`, not inlined:** `root.tsx` is already a
270+ line file mixing loader, document shell, and error boundary. Cross-cutting infra (ALS
seeding) is a distinct concern from "render the HTML document" — separating it into
`app/middleware/` (new directory; mirrors the existing `app/utils/`, `app/backend.server/`
directory-per-concern convention) keeps `root.tsx`'s diff to a two-line addition (import +
`middleware` export) and makes the new code independently unit-testable without importing
`root.tsx`'s React component tree.

**Why `Promise.allSettled`, not sequential `await`s with try/catch:** the two lookups
(`getUserFromSession`, `getCountryAccountsIdFromSession`) are independent reads of the same
session cookie; running them concurrently is strictly faster and matches the existing codebase
pattern of route loaders resolving independent data in parallel. `allSettled` (not `Promise.all`)
ensures that a failure in one lookup (e.g. a DB error resolving the session) does not prevent the
other from populating, and — critically — never rejects the middleware's own promise chain, so a
session-layer error can never turn into a 500 for a request that would otherwise have succeeded
as anonymous/unauthenticated.

**Why mutate the store instead of re-seeding via a second `als.run()`:** only one ALS scope may
exist per request (opening a second nested scope would create a *new*, different store for
everything downstream, defeating the purpose of one shared per-request store). `tenantId`/
`userId` must land on the *same* store instance that `traceId` was seeded into and that
`sessionCache` will be written to by `getUserFromSession()` itself (which is called by this same
middleware). Direct mutation via `getRequestContext()` inside the `als.run()` callback is the
only way to write into that single shared store.

**Note on `getUserFromSession` being called from inside the middleware AND later from `root.tsx`
loader / `authLoaderWithPerm`:** this is intentional and is precisely what P1-14's memoization
exists for. The middleware's own call is now the *first* call within the scope; every subsequent
call (from `root.tsx`'s loader, from `authLoaderWithPerm`, from any matched route loader) hits
the `ctx.sessionCache` fast path instead of re-querying the DB. This is a direct, positive
consequence of finally wiring `withRequestContext` app-wide — P1-14's guarantee becomes live in
production for the first time as a result of this change, not merely as a side effect to
tolerate.

### Decision 4: Concurrent callers of `tenantId` / `userId` writes — safety argument

Once this middleware wires a single request-level `withRequestContext` scope around the full
matched-route tree, `root.tsx`'s own loader and every matched child loader run *concurrently*
(React Router v7 runs matched loaders via `Promise.all`) inside that **same shared store** — this
is the scenario the archived P1-14 design and the (still-open) Notices proposal's Decision 3
correctly identified as *not yet real* under today's code, because no shared scope existed. This
proposal is what makes it real, so the concurrent-callers case must be specified and tested here,
not deferred again.

**Requirement:** `ctx.tenantId` and `ctx.userId` are written exactly once, by the middleware,
*before* `next()` is called — i.e. before any nested loader begins executing. No loader in this
codebase writes to `ctx.tenantId` / `ctx.userId` (only the new middleware does), so there is no
concurrent-write hazard on these two fields: they are write-once-by-a-single-writer,
read-many-by-concurrent-loaders. Concurrent loaders reading `ctx.tenantId` while the middleware's
`Promise.allSettled` is still in flight cannot occur, because `next()` — which is what causes
child loaders to run — is only called after that `await` resolves. This is different from (and
simpler than) the `sessionCachePromise` hazard, which exists because **multiple independent call
sites** (`getUserFromSession`, called from several places) can race to populate `sessionCache`
concurrently. `tenantId`/`userId` have exactly one writer by construction, so no
promise-coordination field analogous to `sessionCachePromise` is needed for them.

**What must still be tested:** the pre-existing `sessionCachePromise` concurrent-caller guarantee
(P1-14) continues to hold when the middleware itself is the first caller of
`getUserFromSession()` inside the scope, and root's loader / `authLoaderWithPerm` are subsequent
concurrent-or-sequential callers. This is exactly the regression scenario specified in
`specs/request-context-store/spec.md` below.

### Decision 5: Failure isolation — middleware must never turn a working route into a 500

**Choice:** all session-resolution work inside the middleware is wrapped in
`Promise.allSettled`, and `getRequestContext()` is checked for existence (`if (ctx)`) before any
mutation, mirroring the existing defensive-`ctx !== undefined` pattern already used throughout
`getUserFromSession()`. The middleware's own `withRequestContext` callback never throws — the
worst case is `tenantId: null, userId: null` (which is exactly the pre-existing default an
unauthenticated request already produces today).

**Rationale:** this is the single highest-risk decision in the proposal, directly addressing the
"app-wide blast radius" constraint. A middleware that can throw for reasons unrelated to a
route's own logic (e.g. a transient DB blip during session lookup) would turn *every* route,
including fully public/unauthenticated ones, into a 500 — a strictly worse failure mode than
today, where a session lookup failure inside `getUserFromSession()` at least stays scoped to
whichever single call site invoked it.

### Decision 6: Test approach — direct unit invocation of the middleware function

**Choice:** `requestContextMiddleware` is tested directly as a plain async function — construct a
mock `{ request: new Request("http://localhost/") }` args object and a `next` stub
(`async () => new Response()`), call `requestContextMiddleware(args, next)`, and assert
`getRequestContext()` state *inside* the `next` stub (since that's the only point during the call
where the ALS scope is guaranteed active and inspectable from the test). This avoids needing a
full React Router route-matching harness (`createRoutesStub`, a real route tree, or an E2E
Playwright run) for what is fundamentally a plain-function unit test — `Route.MiddlewareFunction`
is just a typed async function signature, not a React-rendering concern.

**Why not E2E:** `test:e2e` (Playwright) would prove the middleware is *wired up* (exported from
`root.tsx` and actually invoked by the router at request time), which unit tests calling the
function directly cannot prove by themselves. This is a real, acknowledged gap — see Risks below
— but the proposal's specified test tier is "Unit," and a full Playwright run is disproportionate
for validating field-population logic that has nothing to do with rendered HTML. The unit tests
cover the logic; the "is it actually wired into `root.tsx`" fact is instead covered by a narrow,
still-unit-level test that imports `root.tsx` and asserts its `middleware` export array contains
`requestContextMiddleware` by reference — cheap, fast, and directly falsifiable if someone later
removes the export by accident.

## Risks / Trade-offs

**[Risk] App-wide blast radius — `root.tsx` is matched by every request.**
Any defect in `requestContextMiddleware` (unhandled throw, hang, infinite loop around `next()`)
breaks every route, not just new code.
→ Mitigation: Decision 5's failure-isolation design (`Promise.allSettled`, defensive `ctx`
checks, no code path that can throw past the `withRequestContext` boundary). Regression test
plan explicitly includes at least one existing, unrelated route (see tasks.md) to prove normal
request handling is unaffected — not just new-code coverage.

**[Risk] First real production use of React Router v7's `middleware` API in this codebase.**
No prior usage to copy from internally; execution order (parent → child → parent, "onion" model)
and interaction with `next()` are new concepts for this codebase's contributors.
→ Mitigation: design.md documents the exact signature and execution model (verified against
React Router's own documentation, not guessed); Decision 6's direct-unit-test approach exercises
the function's actual logic; the `root.tsx`-export-reference test guards against silent
de-wiring.

**[Risk] `getUserFromSession` is now called earlier (from the middleware) than before, changing
*when* the `lastActiveAt` session-activity DB update fires relative to route-specific logic.**
→ Mitigation: this is the same function, same DB update, same "once per request" semantics P1-14
already established — only the *first caller* changes (middleware instead of whatever loader
happened to call it first before). No behavior change to the update itself; `sessionCache`
ensures it still fires exactly once per request regardless of caller count. Explicitly covered by
the regression scenario.

**[Risk] Test coverage gap: unit tests cannot, by themselves, prove the middleware is invoked by
the real router at request time (only that `root.tsx` exports it and that the function behaves
correctly in isolation).**
→ Mitigation: named explicitly rather than silently accepted (Decision 6). Full end-to-end
verification (confirming a real served request populates the store) is left as a manual
verification step during PR review / `/opsx:apply` (documented in tasks.md), not a fabricated
automated test tier beyond what was specified ("Unit").

**[Risk] NestJS HTTP controller path (Phase 5c) will need its own, currently-undesigned wiring to
share this same context.**
→ Mitigation: explicitly named as a Non-Goal and a known follow-up, not silently assumed covered.
No code in this proposal touches `CoreModule.server.ts` or any NestJS interceptor.

## Migration Plan

1. Extend `RequestContextStore` and `withRequestContext`'s signature in
   `app/utils/requestContext.server.ts` (additive; zero existing callers need to change).
2. Add `app/middleware/requestContext.server.ts` with `requestContextMiddleware`.
3. Wire `export const middleware = [requestContextMiddleware]` into `app/root.tsx` (two-line
   addition: one import, one export).
4. Unit tests: middleware population behavior, `root.tsx` export-reference check, P1-14
   regression (sessionCache memoization unaffected).
5. Manual verification: run `yarn dev`, hit any existing route (e.g. `/`), confirm no regression
   in normal page load (this is a smoke check, not a new automated test tier).

**Rollback:** revert the `root.tsx` two-line diff (middleware stops being invoked — app returns
to today's dormant-`withRequestContext` state), delete `app/middleware/requestContext.server.ts`,
revert the additive type/signature change in `requestContext.server.ts`. Zero schema, data, or
URL impact at any step.

## Open Questions

None outstanding. The archived P1-14 design's Q1 (whether `withRequestContext` gains a seed
parameter) is resolved by Decision 2. The "where does app-wide wiring happen" question left open
by both the archived change and the (still-open) Notices proposal is resolved by Decision 3
(root-level `middleware` export, not per-loader calls).
