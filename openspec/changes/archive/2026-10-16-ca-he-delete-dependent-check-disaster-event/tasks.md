## 1. DrizzleHazardousEventRepository.countReferencingDisasterEvents (TDD)

- [x] 1.1 In `tests/integration/db/queries/DrizzleHazardousEventRepository.test.ts`, add a
      `describe("countReferencingDisasterEvents")` block (new, alongside the existing
      `describe` blocks for the file's other methods) with failing tests covering:
      - Zero `disaster_event` rows reference the given `hazardousEventId` → resolves `0`.
      - Two `disaster_event` rows reference the given `hazardousEventId` → resolves `2`.
      - One `disaster_event` row references a *different* `hazardousEventId` (seeded
        alongside the target event) → resolves `0` for the target — this is the
        discriminating case that catches a missing/wrong `WHERE` clause; the zero-rows
        case alone cannot, since it would also pass under an unconditional `COUNT(*)`
        across the whole table only when the table is otherwise empty.
      - A referencing `disaster_event` row whose own `countryAccountsId` differs from
        the `tenantId` argument passed to the method (seed a second tenant via
        `seedCountryAccount()`) → resolves `1`, not `0` (the cross-tenant-inclusion
        scenario; `0a`'s existing `event_causality`-only test is the direct precedent
        for this assertion shape, per the roadmap's own `5f` section).
      - A referencing `disaster_event` row with a `null` `countryAccountsId` (plausible
        for legacy rows, per direct read of the schema's nullable column) → still
        counted, same reasoning as the cross-tenant case.
      - The `tenantId` argument does not match the target `HazardousEvent`'s own tenant
        at all (pass an arbitrary/different tenant id as the method's `tenantId`
        argument, independent of which tenant seeded the `HazardousEvent` or the
        `disaster_event` rows) → the count is unaffected, proving `tenantId` is
        genuinely not used as a filter (design.md Context).
      Seed `disaster_event` rows the same way the existing delete() test at line ~1247
      already does: insert into `eventTable` first (empty `values({})`), then
      `disasterEventTable` with `{ id: <that event's id>, hazardousEventId, [[
      countryAccountsId]] }`. Verify red: `yarn vitest run
      tests/integration/db/queries/DrizzleHazardousEventRepository.test.ts`.
- [x] 1.2 In `app/domains/hazardous-events/infrastructure/
      DrizzleHazardousEventRepository.server.ts`, add a `disasterEventTable` import and
      implement `countReferencingDisasterEvents` per design.md's Context/Decisions:
      query-builder style (`.select({ count: sql<number>\`count(*)::int\` })
      .from(disasterEventTable).where(eq(disasterEventTable.hazardousEventId,
      hazardousEventId))`), second parameter renamed `_tenantId` (unused, matching the
      port fake's own convention — required by `noUnusedParameters: true`), with a
      one-line inline comment on the parameter matching the port fake's own comment
      verbatim (design.md's Context/Risks traces the fake-conformance test and the use
      case's prior `findById` call; the code comment itself stays short). Remove the
      throwing stub and its "separate
      later intent" comment line for this method only (the `findCurrentSpatialObservation`
      /`findSpatialObservationByTime`/`saveSpatialObservation` stubs and their own
      comment stay untouched — `5e`'s scope). Verify green: `yarn vitest run
      tests/integration/db/queries/DrizzleHazardousEventRepository.test.ts`.
- [x] 1.3 Refactor for clarity if warranted (e.g. doc-comment wording), keeping all
      tests in the file green: `yarn vitest run
      tests/integration/db/queries/DrizzleHazardousEventRepository.test.ts`.

## 2. Quality gates

- [x] 2.1 `yarn vitest run tests/integration/db/queries/DrizzleHazardousEventRepository.test.ts`
      — all tests green, including the file's pre-existing tests for the other five
      methods (confirms no regression from the new import/method).
- [x] 2.2 `yarn tsc` — zero TypeScript errors.
- [x] 2.3 `npx prettier --check` scoped to the two files touched in section 1 — Prettier
      clean (never a bulk `yarn format`).
- [x] 2.4 Anti-pattern review against `.github/skills/anti-pattern-check/SKILL.md`.
- [x] 2.5 SOLID review — invoke `solid-reviewer` agent against the adapter change.
- [x] 2.6 Documentation review — comments explain WHY not WHAT (e.g. why `_tenantId` is
      unused, why `count(*)::int` not a bare `count(*)`, why query-builder style was
      chosen over `DrizzleCausalChainRepository`'s raw-`sql` precedent), compacted
      without losing meaning; one full-diff sweep before the final report, done by a
      fresh subagent, not self-review.
- [x] 2.7 Project conventions review against `.github/copilot-instructions.md`.
- [x] 2.8 Code review — run `.github/skills/code-review/SKILL.md` in full, via a fresh
      subagent.
- [x] 2.9 Visual/UX parity review — **skipped**: this change touches no file under
      `app/domains/*/presentation/` or `app/routes/` (pure backend/infrastructure read).
- [x] 2.10 Independent second-opinion review — Claude Code's built-in `code-review` at
      `high` effort via a second, separate fresh subagent; resolve findings before
      archiving.
- [x] 2.11 Test quality audit — invoke `test-quality-auditor` scoped to
      `DrizzleHazardousEventRepository.server.ts`'s `countReferencingDisasterEvents`
      method and its new tests. Note up front: `DEF-041` means Stryker cannot run
      mutation analysis on this class at all (any class with an `implements` clause) —
      this gate is structural review only, same limitation already accepted for every
      other adapter class in this domain since `5i`. Resolve any real structural gap
      found (e.g. a test that would pass under a wrong implementation).

## 3. Regression and archive

- [x] 3.1 `yarn test:run2` (full PGlite suite) passes with no new failures. If any
      failure appears, confirm it is pre-existing by running the same suite against the
      branch's base (`feature/he-ca-phase5` tip) before attributing it elsewhere — do
      not assume. Confirmed via isolated git worktree at base commit `8ae6ef4a`: 3
      separate `yarn test:run2` runs (1 baseline, 2 on this branch) each produced a
      different, unrelated timeout-based flake (`countryAccountService.clone`,
      `NoticesController`, `HttpServerBootstrap`) — never the same test twice, never
      touching `DrizzleHazardousEventRepository` or `disaster_event`. Pre-existing
      suite flakiness, not a regression from this change.
- [x] 3.2 Run `opsx:archive` on this branch before raising the PR.
