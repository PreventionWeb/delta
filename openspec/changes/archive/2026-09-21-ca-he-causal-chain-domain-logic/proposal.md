## Why

`hazardous_event_causality` (`2e`, `hazardousEventCausalityTable.ts`) has a DB-level CHECK that
blocks only the trivial 1-length self-cause case; its own schema comment already says n-length
cycle detection stays app-layer, for `3c`. Today, no domain-layer cycle check exists at all for
this table. The precedent for what "naive" cycle detection costs is proven, not theoretical: the
legacy depth-10-capped recursive query on the older `event_relationship` table (Phase 0 sub-track
0b) let a 20-node cycle close and persist silently — the cap was mistaken for a detection
mechanism instead of a safety limit. `3c` builds real path-membership tracking for the new table
so the new causal-chain feature doesn't repeat that exact failure mode in new code.

**Phase 0 correction to the roadmap text (verified against source, not taken on faith):** the
roadmap's "today's naive depth-10 cap... called live from `hazardous_event_create_update.ts`"
describes the mechanism correctly but names the wrong file as live. `app/backend.server/models/event/cycles.ts`
and `app/backend.server/models/event/hazardous_event_create_update.ts` are both part of the
orphaned `event/` directory (DEF-001, dead code — no real route resolves to it). The actual live
depth-10-capped `checkForCycle()`, called from `app/backend.server/models/event.ts` (lines 886 and
1196), is a second, independently duplicated copy of the same recursive CTE defined inline in
`event.ts` itself (lines ~1333-1408) — not an import from `cycles.ts`. Both copies operate on
`event_relationship`, not `hazardous_event_causality`; neither is touched, called, or replaced by
this change (Invariant 2, expand-only until cutover — the actual cutover of real use cases onto
`CausalChain.ts` is a later phase's job, not this intent's).

## What Changes

- Add `CausalChain.ts`, a stateless domain service in `app/domains/hazardous-events/domain/`
  exposing a pure function that asserts whether linking a cause/effect pair would close a cycle
  in the existing causal graph, given the existing edges as a plain in-memory input (no DB, no
  port, no `Tx` — matches the Unit test tier and files-touched list; wiring a real repository feed
  into this function is a later use-case intent's job).
- Cycle detection is a real path-membership check: traverses the existing edges from the proposed
  effect node, tracking visited node IDs, and reports a cycle if the proposed cause node is
  reachable (i.e., linking cause→effect would close a path back to cause). A high safety cap
  (500 distinct nodes visited) guards only against runaway traversal on a pathologically large
  graph — it is never used as, or confused with, the detection mechanism itself. Exceeding the cap
  fails closed with a distinct error from "cycle confirmed" (an unresolved traversal is never
  reported as "no cycle").
- The trivial 1-length case (`causeId === effectId`) is included as an explicit, domain-layer
  invariant, not left to the DB CHECK alone (Invariant 3 — DB constraints are defense-in-depth,
  never a substitute for the domain-layer rule).
- No wiring into any use case, route, or the existing `checkForCycle()`/`event.ts` path. No schema
  change. No DB migration.

## Capabilities

### New Capabilities

- `hazardous-event-causal-chain`: cycle-detection domain logic for the `hazardous_event_causality`
  cause/effect graph — asserts a proposed causal link does not close a cycle, using real
  path-membership tracking bounded by a runaway-query safety cap.

### Modified Capabilities

(none — `hazardous-event-causality-schema` and `hazardous-event-entity` are unchanged by this
intent)

## Impact

- **Files added:** `app/domains/hazardous-events/domain/CausalChain.ts`,
  `app/domains/hazardous-events/domain/CausalChain.test.ts`. No other file changes.
- **DB migration:** none required. This intent adds pure domain logic only; the target table
  (`hazardous_event_causality`) and its CHECK constraint already exist from `2e`.
- **Test approach:** Unit (Vitest, `yarn vitest run`) — in-memory edge-list fixtures, zero DB
  dependency, zero PGlite/real-DB setup needed. Consistent with `3a`/`3b`'s domain-entity unit
  tests (`WorkflowInstance.test.ts`, `HazardousEvent.test.ts`), co-located next to the source file.
- **Security / multi-tenancy:** not applicable to this intent directly — `CausalChain.ts` takes a
  plain edge list and two IDs, with no tenant context or DB access at all. The register's
  DEF-012 (cross-tenant causality sharing — `hazardous_event_causality` deliberately allows
  cross-tenant cause/effect pairs with no access-control mechanism yet) was checked per this
  register's own "check at proposal time" instruction: it is **out of scope**, exactly as the
  roadmap's own `3c` text states ("Open question, not this intent's to solve... needs its own
  architecture decision... before `3c`/5 builds real access control"). Cycle detection and
  cross-tenant access control are orthogonal concerns; this intent does not touch or narrow
  DEF-012's scope.
- **Downstream consumers:** none yet. No use case or route calls `CausalChain.ts` as of this
  intent (expand-only rule — cutover of real create/update flows onto this logic, replacing
  `event.ts`'s own `checkForCycle()`, is a later phase's job, out of scope here).
