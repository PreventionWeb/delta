## 1. Extend RequestContextStore and withRequestContext (failing tests first)

- [x] 1.1 Add failing unit tests to `tests/unit/utils/requestContext.test.ts` covering: store
      includes `traceId` (non-empty string, auto-generated when no seed given), `tenantId: null`,
      `userId: null` by default; `withRequestContext(fn, { traceId: "abc-123" })` seeds that exact
      `traceId`; two sequential `withRequestContext` calls do not bleed `tenantId`/`userId`/
      `traceId` between them; mutating `tenantId`/`userId` inside a scope persists across nested
      calls within that same scope. Run `yarn vitest run tests/unit/utils/requestContext.test.ts`
      and confirm these new cases fail (type errors are an acceptable failure mode at this stage
      since the type doesn't exist yet).
- [x] 1.2 Extend `RequestContextStore` in `app/utils/requestContext.server.ts` with
      `traceId: string`, `tenantId: string | null`, `userId: string | null` (additive — do not
      modify `sessionCache` / `sessionCachePromise`).
- [x] 1.3 Add the optional `seed?: { traceId?: string }` parameter to `withRequestContext`,
      defaulting `traceId` to `crypto.randomUUID()` when `seed?.traceId` is not provided, and
      initialising `tenantId`/`userId` to `null` in the seeded store.
- [x] 1.4 Run `yarn vitest run tests/unit/utils/requestContext.test.ts` and confirm all cases
      (existing and new) pass.

## 2. Regression coverage for P1-14 memoization (failing test first)

- [x] 2.1 Add a failing regression test to `tests/unit/utils/session.test.ts` (or extend the
      existing P1-14 memoization test) asserting that `getUserFromSession()`'s existing
      three-state `sessionCache` contract — exactly one DB lookup per `withRequestContext` scope,
      both sequential-duplicate-call and concurrent-in-flight-call cases — is unaffected when the
      same store also carries non-default `traceId`/`tenantId`/`userId` values. Confirm it fails
      before step 1's type extension lands (or passes trivially and is only a true regression
      guard afterward — note which in the test comment).
- [x] 2.2 Confirm the test passes once section 1's changes are in place. Run
      `yarn vitest run tests/unit/utils/session.test.ts`.

## 3. requestContextMiddleware (failing tests first)

- [x] 3.1 Add failing unit tests in a new `tests/unit/middleware/requestContext.test.ts`
      (`import "../setup"` not required — this is a pure unit test, no DB) covering:
      calling `requestContextMiddleware({ request }, next)` makes `traceId`/`tenantId`/`userId`
      visible via `getRequestContext()` from inside the `next` stub; two separate invocations
      produce two different `traceId` values; an authenticated request (mock
      `getUserFromSession`/`getCountryAccountsIdFromSession` to resolve non-null) results in
      non-null `userId`/`tenantId` visible inside `next`; an unauthenticated request (mocks
      resolve to `undefined`/falsy) results in `userId: null`/`tenantId: null` and `next()` is
      still called; a rejected `getUserFromSession`/`getCountryAccountsIdFromSession` promise
      does not propagate/throw out of `requestContextMiddleware` and `next()` is still called
      with the corresponding field falling back to `null`.
- [x] 3.2 Create `app/middleware/requestContext.server.ts` exporting `requestContextMiddleware`
      per design.md Decision 3 (uses `withRequestContext` with a `traceId` seed,
      `Promise.allSettled` over `getUserFromSession`/`getCountryAccountsIdFromSession`, mutates
      `tenantId`/`userId` on the live store via `getRequestContext()` before calling `next()`).
- [x] 3.3 Run `yarn vitest run tests/unit/middleware/requestContext.test.ts` and confirm all
      cases pass.

## 4. Wire the middleware into root.tsx

- [x] 4.1 Add a failing (or trivially-passing-until-wired) unit test asserting
      `app/root.tsx`'s exported `middleware` array includes `requestContextMiddleware` by
      reference (per design.md Decision 6 / the spec's "root.tsx exports the middleware for every
      route" scenario). (`tests/unit/middleware/rootMiddlewareWiring.test.ts`)
- [x] 4.2 Add `import { requestContextMiddleware } from "~/middleware/requestContext.server";`
      and `export const middleware: Route.MiddlewareFunction[] = [requestContextMiddleware];` to
      `app/root.tsx`. No other change to `root.tsx`'s existing loader, component, or
      `ErrorBoundary`.
- [x] 4.3 Run the test from 4.1 and confirm it passes.

## 5. Manual regression verification (existing, unrelated route unaffected)

- [x] 5.1 Run `yarn dev`, request an existing, unrelated route unaffected by this proposal (e.g.
      `/en/` or another already-shipped route not touched by this change), and confirm the
      response renders identically to pre-change behaviour (no new errors in server console, no
      change to page content). Record which route was checked in the PR description.
      Verified: `react-router dev --port 3000` (equivalent to `yarn dev` minus the `yarn install`/
      `yarn dbsync` steps, to avoid an unlisted migration run), requested `GET http://localhost:3000/`
      twice — both returned `200 OK` with the expected HTML/CSP headers, no server-console errors.
- [x] 5.2 While the dev server is running, confirm via a temporary `console.log` or debugger
      breakpoint (removed before commit) that `getRequestContext()` inside that route's loader
      now returns a defined store with a `traceId` — proving the middleware is actually invoked
      by the real router, not just correct in isolated unit tests (closes the gap named in
      design.md Decision 6 / Risks).
      Verified: temporary `console.log` in `app/root.tsx`'s loader printed a defined store on both
      requests, e.g. `{ sessionCache: null, sessionCachePromise: undefined, traceId:
      '5a49515f-a187-4c66-917b-63547018c0d9', tenantId: null, userId: null }` and a second request
      with a different `traceId` (`f49596ca-...`) — confirming per-request isolation and that
      `sessionCache` was already populated (memoized) by the middleware's own earlier
      `getUserFromSession` call within the same scope. Debug log removed before proceeding.

## 6. Quality gates

- [x] 6.1 `yarn vitest run tests/unit/utils/requestContext.test.ts tests/unit/utils/session.test.ts tests/unit/middleware/requestContext.test.ts` — all tests green.
- [x] 6.2 `yarn tsc` — zero TypeScript errors.
- [x] 6.3 `yarn format:check` — Prettier clean (run `yarn format` first if not).
- [x] 6.4 Anti-pattern review — check `.github/skills/anti-pattern-check/SKILL.md` against all
      changed files.
- [x] 6.5 SOLID review — invoke `solid-reviewer` agent against `app/middleware/requestContext.server.ts`
      and the `requestContext.server.ts` diff.
- [x] 6.6 Documentation review — comments in all changed files explain WHY (e.g. why
      `Promise.allSettled`, why a seed parameter only for `traceId`), not WHAT.
- [x] 6.7 Project conventions review — check `.github/copilot-instructions.md` (server-only
      `.server.ts` suffix, `~/*` path alias, no `console.log` outside the already-accepted
      temporary debug step in 5.2, which must be removed).
- [x] 6.8 Code review — run `.github/skills/code-review/SKILL.md` in full against the complete
      diff.

## 7. Regression suite and archive

- [x] 7.1 Run `yarn test:run2` (full PGlite suite). Confirm no new failures versus a baseline run
      on the base branch (`feature/ca-request-context-middleware`'s parent) — any pre-existing
      failure must be independently confirmed as pre-existing, not assumed.
      Verified: baseline (HEAD `386b097f`, before any change) first run showed 4 failed tests / 4
      failed files (`tests/integration/nestjs/DomainErrorFilter.test.ts`,
      `tests/integration/nestjs/HttpServerBootstrap.test.ts`,
      `tests/unit/services/approvalStatusWorkflowService.test.ts`,
      `tests/integration/db/queries/entityValidationAssignmentRepository.test.ts` ×2 assertions).
      Independently re-ran the baseline a second time (via `git stash` + `git stash pop`, same
      commit, before restoring implementation files) and got only 3 failed tests / 2 failed files —
      `DomainErrorFilter.test.ts`/`HttpServerBootstrap.test.ts` passed on the second baseline run,
      proving those two are pre-existing flaky tests (real NestJS HTTP server bootstrap under
      full-suite resource contention — both pass in isolation on both branches), not something
      introduced or fixed by this change. The remaining 3 failures
      (`approvalStatusWorkflowService.test.ts`, `entityValidationAssignmentRepository.test.ts` ×2)
      are deterministic pre-existing baseline failures, confirmed on both baseline runs. Post-
      implementation `yarn test:run2` run: 27 files / 259 tests (up from 25/247 — the 2 new test
      files and their cases), 3 failed tests / 2 failed files — exactly the deterministic
      pre-existing set, zero new failures. No regression.
- [x] 7.2 Run `opsx:archive` on this branch before raising the PR. NOT RUN — archive/PR tasks are
      user-controlled per sdd-implementer scope; stopping here for human review as instructed.
