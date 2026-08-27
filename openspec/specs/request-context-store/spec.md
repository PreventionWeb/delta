# request-context-store Specification

## Purpose
Defines the contract for the request-scoped `AsyncLocalStorage` store in
`app/utils/requestContext.server.ts`. The store is created once per request via
`withRequestContext()` and exposes a live mutable reference through `getRequestContext()`.
Its primary consumer is `getUserFromSession()`, which uses the store to memoize the session
DB lookup for the duration of a request. The store type (`RequestContextStore`) also carries
`traceId`, `tenantId`, and `userId` as live fields populated by the `request-context-middleware`
capability, which seeds `traceId` at store creation and resolves `tenantId`/`userId` from the
request's session before any route loader or action runs.
## Requirements
### Requirement: withRequestContext creates an isolated per-call store

`withRequestContext(fn, seed?)` in `app/utils/requestContext.server.ts` SHALL create a fresh,
isolated `RequestContextStore` for each invocation and run `fn` inside that store's async
context. The store MUST NOT be shared between concurrent or sequential calls to
`withRequestContext`. The store MUST include `traceId: string`, `tenantId: string | null`, and
`userId: string | null` in addition to the pre-existing `sessionCache` and `sessionCachePromise`
fields. When `seed?.traceId` is provided, the store's `traceId` MUST equal that value; when
omitted, `traceId` MUST be generated via `crypto.randomUUID()`. `tenantId` and `userId` MUST be
initialised to `null` regardless of `seed`.

#### Scenario: fn receives its own isolated store

- **WHEN** `withRequestContext` is called with an async function `fn` and no `seed`
- **THEN** `getRequestContext()` called inside `fn` MUST return a `RequestContextStore` object
- **AND** that object MUST have `sessionCache` equal to `undefined` (initial state)
- **AND** that object MUST have `tenantId` equal to `null` and `userId` equal to `null`
- **AND** that object MUST have a `traceId` that is a non-empty string
- **AND** the returned promise MUST resolve to the value returned by `fn`

#### Scenario: seed pre-populates traceId at store creation

- **WHEN** `withRequestContext(fn, { traceId: "abc-123" })` is called
- **THEN** `getRequestContext()` called inside `fn` MUST return a store with
  `traceId === "abc-123"`
- **AND** this value MUST be present from the very first statement executed inside `fn` (no
  window during which `traceId` is unset within the scope)

#### Scenario: omitted seed generates a traceId automatically

- **WHEN** `withRequestContext(fn)` is called with no second argument (existing one-argument
  call sites, e.g. current unit tests)
- **THEN** the call MUST continue to compile and run without modification
- **AND** `getRequestContext()` inside `fn` MUST return a store with a `traceId` that is a
  non-empty string generated via `crypto.randomUUID()`

#### Scenario: stores from separate withRequestContext calls do not bleed

- **WHEN** `withRequestContext` is called once and mutations (`context.sessionCache = value`,
  `context.tenantId = value`, `context.userId = value`) are made inside that scope
- **AND** a second `withRequestContext` call is made sequentially afterwards
- **THEN** `getRequestContext()` inside the second call MUST return a `RequestContextStore` with
  `sessionCache === undefined`, `tenantId === null`, `userId === null`, and a `traceId` different
  from the first call's `traceId` (the mutations and seed from the first call MUST NOT be visible)

#### Scenario: no store active outside withRequestContext

- **WHEN** `getRequestContext()` is called outside of any `withRequestContext` scope (i.e. no
  active `AsyncLocalStorage` run context)
- **THEN** it MUST return `undefined`

### Requirement: getRequestContext returns live mutable store reference

`getRequestContext()` SHALL return the live `RequestContextStore` object for the current async
context so that callers can read and write fields on it directly, including the new `tenantId`
and `userId` fields.

#### Scenario: mutation persists within the same scope

- **WHEN** `getRequestContext()` is called inside a `withRequestContext` scope and the returned
  store is mutated (e.g. `context.sessionCache = someValue`)
- **AND** `getRequestContext()` is called again later in the same async chain
- **THEN** the second call MUST return the same store object with the mutated value intact

#### Scenario: tenantId and userId mutations persist within the same scope

- **WHEN** `getRequestContext()` is called inside a `withRequestContext` scope and the returned
  store has `tenantId` and `userId` set (e.g. `context.tenantId = "acct-1"`,
  `context.userId = "user-1"`)
- **AND** `getRequestContext()` is called again later in the same async chain, including from
  code that did not perform the mutation itself (e.g. a nested loader call)
- **THEN** the second call MUST return the same store object with `tenantId === "acct-1"` and
  `userId === "user-1"` intact

### Requirement: sessionCache memoization is unaffected by the new fields

`getUserFromSession()`'s existing three-state `sessionCache` memoization contract (P1-14) SHALL
continue to hold unchanged: exactly one DB lookup per `withRequestContext` scope regardless of
how many times `getUserFromSession()` is called within it, regardless of the presence or values
of `traceId`, `tenantId`, or `userId` on the same store.

#### Scenario: memoization holds when the store also carries traceId/tenantId/userId

- **WHEN** `withRequestContext(fn, { traceId: "t-1" })` is called
- **AND** inside `fn`, `context.tenantId` and `context.userId` are set to non-null values before
  `getUserFromSession(request)` is called
- **AND** `getUserFromSession(request)` is called twice sequentially inside `fn`
- **THEN** the underlying DB lookup (e.g. `dr.query.sessionTable.findFirst`) MUST be invoked
  exactly once
- **AND** both calls to `getUserFromSession(request)` MUST resolve to the same `UserSession`
  value

#### Scenario: concurrent callers still coordinate on a single in-flight lookup

- **WHEN** `withRequestContext(fn)` is called
- **AND** inside `fn`, two concurrent (not yet resolved) calls to `getUserFromSession(request)`
  are made before either has resolved
- **THEN** exactly one DB lookup MUST fire (the second caller MUST await
  `context.sessionCachePromise` rather than issuing its own query)
- **AND** both callers MUST receive the same resolved `UserSession | undefined` value
- **AND** this behaviour MUST be identical regardless of whether `context.tenantId` /
  `context.userId` are set concurrently by another part of the same scope

