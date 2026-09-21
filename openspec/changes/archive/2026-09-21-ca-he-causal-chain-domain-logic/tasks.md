## 1. Red — Failing Tests First

- [x] 1.1 Create `app/domains/hazardous-events/domain/CausalChain.test.ts` with tests for every
      scenario in `specs/hazardous-event-causal-chain/spec.md`: long acyclic chain accepted,
      20-node cycle rejected (0b-shape), branching-graph cycle rejected, disconnected edges
      accepted, self-cause (`causeId === effectId`) rejected, cap-boundary acyclic chain accepted,
      cap-exceeded traversal rejected with a distinct error from the cycle case, confirmed cycle
      found before cap is reached reports as a cycle not a cap error. Verify:
      `yarn vitest run app/domains/hazardous-events/domain/CausalChain.test.ts` fails because
      `CausalChain.ts` does not exist yet (import error), not because of a typo or bad assertion.

## 2. Green — Minimum Implementation

- [x] 2.1 Create `app/domains/hazardous-events/domain/CausalChain.ts` per design.md Decisions 1-2:
      export `CausalEdge` interface, `CAUSAL_CHAIN_TRAVERSAL_CAP` constant (500), and
      `assertCausalLinkDoesNotCreateCycle(existingEdges, causeId, effectId)`. Verify:
      `yarn vitest run app/domains/hazardous-events/domain/CausalChain.test.ts` passes.
- [x] 2.2 Implement Decision 3 (self-link checked first, before traversal, throws `ConflictError`
      immediately). Verify: the self-cause test from 1.1 passes.
- [x] 2.3 Implement Decision 2/4 (forward traversal from `effectId`, visited-node-ID set, cap at
      `CAUSAL_CHAIN_TRAVERSAL_CAP` distinct nodes visited). Verify: the long-chain, 20-node-cycle,
      branching-cycle, and disconnected-edges tests from 1.1 pass.
- [x] 2.4 Implement Decision 4/5's cap-exceeded path: throws `ValidationError`, distinct from the
      `ConflictError` thrown on a confirmed cycle, and never returns normally in this branch.
      Verify: the cap-boundary-accepted and cap-exceeded-rejected tests from 1.1 pass.

## 3. Refactor — Quality Gates

- [x] 3.1 Gate 1: `yarn vitest run app/domains/hazardous-events/domain/CausalChain.test.ts` — all
      tests green.
- [x] 3.2 Gate 2: `yarn tsc` — zero TypeScript errors.
- [x] 3.3 Gate 3: `yarn format:check` on the two new files — Prettier clean (`yarn format` scoped
      to these two files if not).
- [x] 3.4 Gate 4: Anti-pattern review against `.github/skills/anti-pattern-check/SKILL.md` —
      confirm no listed anti-pattern is reproduced (e.g. no `as any`, no silent fail-open on the
      cap path).
- [x] 3.5 Gate 5: SOLID review — invoke `solid-reviewer` agent on `CausalChain.ts`, focused on SRP
      (module does one thing: cycle detection) and DIP (no DB/framework dependency leaking in).
      Resolve any findings.
- [x] 3.6 Gate 6: Documentation review — comments explain WHY (e.g. why the cap is node-count not
      depth, why two error types) not WHAT; one full-diff sweep over both files by a fresh
      subagent immediately before the final report, not just this round's delta.
- [x] 3.7 Gate 7: Project conventions review against `.github/copilot-instructions.md`.
- [x] 3.8 Gate 8: Code review — run `.github/skills/code-review/SKILL.md` in full, via a fresh
      subagent. Resolve findings.
- [x] 3.9 Gate 9: Visual/UX parity review — **N/A, no presentation-layer or route file touched by
      this change**; mark N/A with this reason rather than skipping silently.
- [x] 3.10 Gate 10: Independent second-opinion review — Claude Code's built-in `code-review` at
      `high` effort, via a second, separate fresh subagent. Resolve findings before proceeding.
- [x] 3.11 Test-quality check (mandatory — this change adds a file under
      `app/domains/hazardous-events/domain/`): invoke `test-quality-auditor` scoped to
      `CausalChain.ts`, e.g.
      `yarn mutation -- --mutate "app/domains/hazardous-events/domain/CausalChain.ts"`. Resolve any
      real gap the mutation report surfaces (e.g. a surviving mutant on the cap-boundary `>=`/`>`
      comparison, or on the `ConflictError` vs. `ValidationError` branch selection).
      **Result (3 rounds):** round 1: 74.36% — 2 real gaps (a dropped second outgoing edge in
      `buildForwardAdjacency`; the BFS dedup guard's absence wasn't provably observable), both
      fixed with new tests. Round 2: 82.05% — those 2 gaps confirmed closed; 6 remaining survivors
      (message/`context` payload mutants on the 3 throw sites) were initially classified as
      "low-value, consistent with codebase convention of asserting error type only" — **that
      classification was checked against `HazardousEvent.test.ts` and found inaccurate**:
      `HazardousEvent.test.ts` consistently pairs `toThrow(ErrorType)` with a regex message
      assertion (`toThrow(/tenantId/)` etc.), so the real convention is to assert message content,
      not skip it. Fixed by adding regex message + `toMatchObject` context assertions to all 3
      throw-site tests (self-cause, primary confirmed-cycle, cap-exceeded), matching that
      established pattern. Round 3 (final): **97.44%** (38/39 valid mutants killed/timeout-killed).
      The 1 remaining survivor (`EqualityOperator` on `while (head < queue.length)` → `<=`) is a
      confirmed equivalent mutant — the extra iteration is an out-of-bounds no-op read — and is
      left undisturbed, not a gap.

## 4. Regression and Archive

- [x] 4.1 `yarn test:run2` (full PGlite suite) passes with no new failures. Any pre-existing
      failure is confirmed pre-existing by running the same suite on `dev`/the pre-change branch
      tip first, not assumed.
- [x] 4.2 Run `opsx:archive` on this branch (`feature/ca-he-causal-chain-domain-logic`) before
      raising the PR — merges the delta spec into `openspec/specs/hazardous-event-causal-chain/`
      and moves this change folder to `openspec/changes/archive/`. Confirmed with the human
      reviewer: PR targets `feature/he-ca-phase3` (the Phase 3 integration branch), matching
      `3a`/`3b`'s precedent.
