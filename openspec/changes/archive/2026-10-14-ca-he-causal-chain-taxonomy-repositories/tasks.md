## 1. Port change (human-approved 2026-10-13 — Option 2, design.md Decision 4)

- [x] 1.1 In `app/domains/hazardous-events/application/ports/ICausalChainRepository.ts`, remove
      `deleteCauseEdges(effectId: string): Promise<void>` and add `replaceCauseEdge(effectId:
      string, newCause: { causeId: string; causalityExplanation: string | null } | null):
      Promise<void>` with a doc comment explaining the atomicity guarantee (single transaction,
      lock-guarded, closes `DEF-030` both races; `newCause: null` is the "clear" case; a caller's
      own prior cycle check is advisory only). Verify: `yarn tsc` now fails at every call site
      that references the removed method (expected — fixed by the remaining tasks below).
- [x] 1.2 In `app/domains/hazardous-events/application/ports/ICausalChainRepository.test.ts`,
      remove the `describe("deleteCauseEdges")` block and its `_deleteCauseEdgesArity` assertion;
      add a `describe("replaceCauseEdge")` block covering: atomic swap of an existing edge for a
      new one, clearing on `newCause: null`, and a clean no-op/insert when no prior edge exists
      for the given effect (delta spec's three non-concurrent scenarios) plus a new
      `_replaceCauseEdgeArity` assertion. Verify: `yarn vitest run
      app/domains/hazardous-events/application/ports/ICausalChainRepository.test.ts`.

## 2. DrizzleHazardTaxonomyRepository (simpler — no recursion, no concurrency concern)

- [x] 2.1 Write failing PGlite tests in
      `tests/integration/db/queries/DrizzleHazardTaxonomyRepository.test.ts`
      (`import "../setup"`) covering: same-tenant ids included, cross-tenant ids excluded, a
      non-existent id excluded without throwing, and an empty `ids` array resolving an empty set
      **without issuing a query** (assert via a query-count/spy mechanism consistent with this
      test suite's existing conventions) — for both `findValidHazardDriverIds` and
      `findValidCustomFieldDefinitionIds`. Verify red: `yarn vitest run
      tests/integration/db/queries/DrizzleHazardTaxonomyRepository.test.ts`.
- [x] 2.2 Implement `DrizzleHazardTaxonomyRepository` in
      `app/domains/hazardous-events/infrastructure/DrizzleHazardTaxonomyRepository.server.ts`
      (design.md Decision 3) and verify green: `yarn vitest run
      tests/integration/db/queries/DrizzleHazardTaxonomyRepository.test.ts`.
- [x] 2.3 Refactor for clarity/duplication between the two methods if warranted, keeping both
      tests green.

## 3. DrizzleCausalChainRepository — findReachableEdgesFrom (design.md Decision 2)

- [x] 3.1 Write failing PGlite tests in
      `tests/integration/db/queries/DrizzleCausalChainRepository.test.ts` (`import "../setup"`)
      covering: empty array for a node with no edges; edges reachable forward from a node
      (`A->B`, `B->C`); an unrelated edge excluded; a pre-existing multi-hop cycle (`A->B`,
      `B->A`, seeded via direct insert, bypassing the port) resolving both edges without hanging
      — per the delta spec's "Pre-existing cyclic stored data does not cause an infinite loop"
      scenario. Verify red: `yarn vitest run
      tests/integration/db/queries/DrizzleCausalChainRepository.test.ts`.
- [x] 3.2 Add a failing test for the `adapterRowBound` boundary case: construct the repository
      with a small injected bound (e.g. `3`), seed a handful of edges whose raw traversal row
      count exceeds it, and assert `findReachableEdgesFrom` rejects with `ValidationError`
      rather than resolving a truncated result — per the delta spec's "A bounded adapter rejects
      rather than truncates" scenario.
- [x] 3.3 Implement `findReachableEdgesFrom` as the path-array `WITH RECURSIVE` query from
      design.md Decision 2 (`is_revisit` guard, `LIMIT adapterRowBound + 1`, JS-side bound check
      before dedup) and verify green: `yarn vitest run
      tests/integration/db/queries/DrizzleCausalChainRepository.test.ts`.
- [x] 3.4 Refactor: extract the recursive query into a private method parameterized by a
      transaction handle (needed by Tasks 4 and 5's in-transaction re-checks), keeping all tests
      green.

## 4. DrizzleCausalChainRepository — saveEdge with Race 1 locking (design.md Decision 4)

- [x] 4.1 Write a failing test for the benign case: two concurrent `saveEdge` calls for
      different, non-conflicting edges both persist independently (delta spec scenario). Verify
      red: `yarn vitest run tests/integration/db/queries/DrizzleCausalChainRepository.test.ts`.
- [x] 4.2 Write a failing **mandatory concurrent-callers** test for Race 1: two concurrent
      `saveEdge` calls, `{causeId: "A", effectId: "B"}` and `{causeId: "B", effectId: "A"}`,
      invoked before either resolves — assert at most one succeeds and the other rejects with
      `ConflictError` (delta spec's "Two concurrent saveEdge calls that would jointly close a
      two-node cycle do not both succeed" scenario). This test MUST fail before Task 4.3's
      implementation (no locking yet) — confirm the race actually reproduces (both calls
      succeeding) before implementing the fix, not just that the test compiles.
- [x] 4.3 Implement `saveEdge`'s transaction: two `pg_advisory_xact_lock` acquisitions (sorted
      node ids, fixed global order) wrapping an in-transaction re-run of Task 3's reachability
      query against `effectId`, throwing `ConflictError` on a detected cycle, else inserting
      (design.md Decision 4). Verify green: `yarn vitest run
      tests/integration/db/queries/DrizzleCausalChainRepository.test.ts`.
- [x] 4.4 Refactor: extract the sorted-lock-pair acquisition into a named private helper, shared
      with Task 5's `replaceCauseEdge` implementation. Keep all tests green.

## 5. DrizzleCausalChainRepository — replaceCauseEdge, closing DEF-030 Race 2 (design.md Decision 4)

- [x] 5.1 Write a failing test: an existing cause edge for an effect is atomically swapped for a
      new one (delta spec's "An existing cause edge is atomically swapped for a new one"
      scenario). Verify red.
- [x] 5.2 Write a failing test: `replaceCauseEdge(effectId, null)` clears the existing cause edge
      with no replacement (delta spec's "A null newCause clears..." scenario). Verify red.
- [x] 5.3 Write a failing test: `replaceCauseEdge` for an effect with no existing cause edge is a
      clean no-op (`null`) or plain insert (non-`null`) (delta spec's "clean no-op or a plain
      insert" scenario). Verify red.
- [x] 5.4 Write a failing **mandatory concurrent-callers** test for Race 2 — the real PGlite
      proof, not just the fake-level one: two concurrent `replaceCauseEdge` calls for the *same*
      `effectId` with two *different* new causes, invoked before either resolves; assert that
      after both resolve, exactly one edge row exists for that effect (never two) — delta spec's
      "Two concurrent replaceCauseEdge calls for the same effect leave exactly one cause edge,
      never two" scenario. This test MUST fail before Task 5.5's implementation (no locking yet)
      — confirm the race actually reproduces (two surviving rows) before implementing the fix.
- [x] 5.5 Implement `replaceCauseEdge`: reuse Task 4.4's lock-acquisition helper (both `effectId`
      and `newCause.causeId` when `newCause` is not `null`; `effectId` alone when clearing), as
      one transaction that deletes existing rows for `effectId`, re-runs Task 3's reachability
      check (skipped when clearing), and inserts if a cause was given (design.md Decision 4,
      point 2). Verify green: `yarn vitest run
      tests/integration/db/queries/DrizzleCausalChainRepository.test.ts`.
- [x] 5.6 Refactor, keeping all tests green.

## 5b. Real-Postgres lock proof for Race 1/Race 2 (gate 9.11 test-quality-auditor finding, human-approved 2026-10-14)

PGlite cannot prove `acquireSortedLocks`'s `pg_advisory_xact_lock` calls are load-bearing: PGlite's
own `db.transaction()` holds a single instance-wide mutex for the whole callback, so the Race
1/Race 2 PGlite tests (Tasks 4.2/5.4) pass identically whether or not the lock calls are present —
confirmed by temporarily deleting them and re-running those tests. Real Postgres gives each
concurrent call its own connection, so only there does the lock do the actual work.

- [x] 5b.1 Add `tests/integration-realdb/domains/hazardous-events/DrizzleCausalChainRepository.realdb.test.ts`
      (under the existing `yarn test:run3` real-Postgres tier), duplicating Race 1 (`saveEdge`)
      and Race 2 (`replaceCauseEdge`) exactly as scenario, against real Postgres instead of PGlite.
- [x] 5b.2 Verify discriminating: temporarily comment out the `acquireSortedLocks` call inside
      `saveEdge`, confirm the Race 1 real-DB test fails (both calls succeed); do the same for
      `replaceCauseEdge` and the Race 2 real-DB test (confirm two rows survive). Required adding a
      `warmUpPool()` helper to the test file first — without it, the two concurrent transactions
      didn't actually overlap at all (establishing a second physical Postgres connection took
      longer than the whole first transaction, so the second call's own transaction didn't even
      begin until the first had already committed; confirmed via temporary timing instrumentation,
      removed afterward). Restore `acquireSortedLocks` in both methods and confirm both tests pass
      again, repeated across multiple runs to rule out timing flakiness in either direction.
- [x] 5b.3 Update `proposal.md`'s Impact/Test approach section and this file's own task list to
      record the real-Postgres addition (this group) — the original scope was PGlite-only.

## 6. DrizzleCausalChainRepository — countEdgesTouching

- [x] 6.1 Write failing tests for `countEdgesTouching`: zero for an untouched node; counts a
      node that is only ever a cause; counts a node that is only ever an effect (contrasted
      explicitly with `findReachableEdgesFrom`'s forward-only result for the same node); counts
      the total for a node touched as both cause and effect; excludes an unrelated edge. Verify
      red.
- [x] 6.2 Implement `countEdgesTouching` per the existing (unmodified) port spec and verify
      green: `yarn vitest run tests/integration/db/queries/DrizzleCausalChainRepository.test.ts`.
- [x] 6.3 Refactor, keeping all tests green.

## 7. UpdateHazardousEventUseCase call-site change (design.md Decision 4, point 3)

- [x] 7.1 In `app/domains/hazardous-events/application/use-cases/UpdateHazardousEvent.ts`,
      collapse `applyCausalEdgeChange` from its current two port calls
      (`deleteCauseEdges`+`saveEdge`) into one `replaceCauseEdge` call, per design.md Decision 4's
      exact method body. `validateCauseIfSet` stays unchanged in code (still the only place
      `NotFoundError`/the temporal check happen) — add a one-line comment noting its cycle-check
      half is now advisory only, not authoritative.
- [x] 7.2 In `app/domains/hazardous-events/application/use-cases/UpdateHazardousEvent.test.ts`:
      - Add a `replaceCauseEdgeCalls` tracking array and a `replaceCauseEdge` method to
        `FakeCausalChainRepository` (delete-then-insert against its own in-memory `edges` array);
        remove `deleteCauseEdgesCalls`/`deleteCauseEdges`. `saveEdge` stays implemented on the
        fake (still required by the interface) but no assertion should expect it to be called by
        `UpdateHazardousEventUseCase` anymore.
      - Rewrite every existing assertion against `deleteCauseEdgesCalls`/`saveEdgeCalls` (21
        occurrences, confirmed by direct read) to assert against `replaceCauseEdgeCalls` instead,
        including the clear-on-`null`/empty-string tests, the swap-with-canonical-id test, and
        the "propagates a generic Error from deleteCauseEdges" test (renamed to reference
        `replaceCauseEdge`).
      - Remove the test **"propagates a generic Error from saveEdge, leaving the prior edge
        already deleted"** — it exercises a two-step partial-failure shape that `replaceCauseEdge`
        removes entirely from this use case's observable behavior (found during this change's
        design revision, not a mechanical rename — confirm no other test covers this scenario
        before deleting it).
      - Add a new sibling test under `describe("concurrent callers racing to set each other's
        causeId")`: two concurrent `execute()` calls on the *same* effect (`"event-A"`) with two
        *different* `causeId`s, asserting `replaceCauseEdgeCalls` has exactly one entry per
        `execute()` call and that exactly one edge survives for that effect afterward. Leave the
        existing barrier-driven Race-1 test exactly as-is (it documents the fake's own
        non-locking behavior for contrast and references no removed/renamed property).
      - Verify green: `yarn vitest run
        app/domains/hazardous-events/application/use-cases/UpdateHazardousEvent.test.ts`.
- [x] 7.3 In `app/domains/hazardous-events/application/use-cases/CreateHazardousEvent.test.ts` and
      `DeleteHazardousEvent.test.ts`, mechanically rename each file's own local
      `FakeCausalChainRepository`'s throwaway `deleteCauseEdges` stub to a throwaway
      `replaceCauseEdge` stub (confirmed no assertion in either file references it). Verify:
      `yarn vitest run
      app/domains/hazardous-events/application/use-cases/CreateHazardousEvent.test.ts
      app/domains/hazardous-events/application/use-cases/DeleteHazardousEvent.test.ts`.

## 8. Deferred-items register update

- [x] 8.1 Delete the `DEF-021` row from `_docs/refactoring-plan/deferred-items-register.md`
      (closed — a real adapter now proves the taxonomy query correct against real schema).
- [x] 8.2 Delete the `DEF-030` row (resolve-by-deletion convention) — both races are closed by
      this change, no residual gap to describe (unlike the originally-drafted Option 1 outcome).

## 9. Quality gates

- [x] 9.1 `yarn vitest run tests/integration/db/queries/DrizzleCausalChainRepository.test.ts
      tests/integration/db/queries/DrizzleHazardTaxonomyRepository.test.ts
      app/domains/hazardous-events/application/ports/ICausalChainRepository.test.ts
      app/domains/hazardous-events/application/use-cases/UpdateHazardousEvent.test.ts
      app/domains/hazardous-events/application/use-cases/CreateHazardousEvent.test.ts
      app/domains/hazardous-events/application/use-cases/DeleteHazardousEvent.test.ts` — all
      tests green.
- [x] 9.2 `yarn tsc` — zero TypeScript errors (this is the hard gate that catches any missed
      reference to the removed `deleteCauseEdges`/`deleteCauseEdgesCalls`).
- [x] 9.3 `npx prettier --check` scoped to every file touched in sections 1-7 above — Prettier
      clean (never a bulk `yarn format`).
- [x] 9.4 Anti-pattern review against `.github/skills/anti-pattern-check/SKILL.md`.
- [x] 9.5 SOLID review — invoke `solid-reviewer` agent against both new adapter files and the
      `UpdateHazardousEvent.ts` call-site change.
- [x] 9.6 Documentation review — comments explain WHY not WHAT (e.g. why the `is_revisit` guard
      exists, why two advisory locks in sorted order, why the row bound applies to raw not
      deduped rows, why `replaceCauseEdge` replaced `deleteCauseEdges`, why the pre-check in
      `validateCauseIfSet` is now advisory only), compacted without losing meaning; one full-diff
      sweep before the final report, done by a fresh subagent, not self-review.
- [x] 9.7 Project conventions review against `.github/copilot-instructions.md`.
- [x] 9.8 Code review — run `.github/skills/code-review/SKILL.md` in full, via a fresh subagent.
- [x] 9.9 Visual/UX parity review — **skipped**: this change touches no file under
      `app/domains/*/presentation/` or `app/routes/`.
- [x] 9.10 Independent second-opinion review — Claude Code's built-in `code-review` at `high`
      effort via a second, separate fresh subagent; resolve findings before archiving.
- [x] 9.11 Test quality audit — invoke `test-quality-auditor` scoped to
      `DrizzleCausalChainRepository.server.ts`, `DrizzleHazardTaxonomyRepository.server.ts`, and
      the `UpdateHazardousEvent.ts` call-site change (all contain real implementation logic);
      resolve any real gap found, in particular around the `adapterRowBound` boundary and both
      Race 1/Race 2 concurrent tests.

## 10. Regression and archive

- [x] 10.1 `yarn test:run2` (full PGlite suite) passes with no new failures. If any failure is
      found, confirm it is pre-existing by running the same suite against the branch's base
      (`feature/he-ca-phase5` tip) before attributing it elsewhere — do not assume. **Result:**
      branch run showed 3 timeout failures (`HttpServerBootstrap.test.ts`,
      `countryAccountService.clone.test.ts`, `NoticesController.test.ts`); verified via a
      git-worktree baseline run at the current HEAD tip (`9c083213`) — the baseline run showed 4
      *different* timeout failures in entirely different files
      (`hazardousEventDisasterEventBoundary.test.ts`, `NoticesController.test.ts` x2,
      `checkI18nMissingKeys.test.ts`), zero overlap in the specific failing tests between the two
      runs of identical code. This is the signature of system-load/timeout flakiness, not a
      regression — none of the failing files are in this change's scope. `yarn tsc` and Prettier
      (scoped to touched files) both clean; also ran `yarn test:run3` for this change's own new
      real-Postgres test (18/18 PGlite + 2/2 real-Postgres green) — see `tasks.md` section 5b;
      did not attempt full `test:run3` suite parity, since the sandbox's disposable test database
      lacks the pre-seeded reference data (sectors, built-in assets) unrelated existing
      route-level real-DB tests depend on — a pre-existing environment-setup gap, not something
      this change introduced or is in scope to fix.
- [x] 10.2 Run `opsx:archive` on this branch before raising the PR.
