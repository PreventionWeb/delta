## Why

`ICausalChainRepository` and `IHazardTaxonomyRepository` (interfaces built in `4b`, extended in
`4f`) are consumed today by three real use cases —
`CreateHazardousEventUseCase`/`UpdateHazardousEventUseCase`/`DeleteHazardousEventUseCase` — but
only against in-memory fakes (`ICausalChainRepository.test.ts`/`IHazardTaxonomyRepository.test.ts`).
No real Drizzle adapter exists anywhere in the codebase (confirmed by direct search). Any route
that wires these use cases against real Postgres today would have nothing to inject. This closes
`DEF-021` ("no adapter yet proves the [taxonomy] query correct against real schema") and
`DEF-030` (`ICausalChainRepository` TOCTOU race) **fully — both races** (human decision 2026-10-13,
see `design.md` Decision 4: Option 2, not the narrower Option 1 originally proposed).

## What Changes

- Add `DrizzleCausalChainRepository` (`app/domains/hazardous-events/infrastructure/
  DrizzleCausalChainRepository.server.ts`), fulfilling `ICausalChainRepository` against
  `hazardous_event_causality`:
  - `findReachableEdgesFrom`: a `WITH RECURSIVE` query using a visited-**path** guard (not a
    dedup-by-id set), so a node reached via two different edges is still caught by the cycle
    guard without silently dropping or duplicating an edge. Fails closed
    (`ValidationError`) rather than truncates when more than an injectable `ADAPTER_ROW_BOUND`
    (default `5000`) raw traversal rows would need to be visited before the reachable set is
    determined — this is the explicit fix for `app/backend.server/models/event/cycles.ts`'s
    `array_length(cc.path,1) < 10` bug, which stops silently and reports a normal (if wrong)
    result.
  - `saveEdge`: now runs inside a transaction holding Postgres advisory locks on both the
    `causeId` and `effectId` nodes (acquired in a fixed global order to avoid deadlock), and
    re-verifies no cycle would be introduced using the same path-guarded query, inside the same
    transaction, immediately before inserting — closing the mutual-two-node-cycle race (`DEF-030`
    Race 1).
  - `replaceCauseEdge` (new method, **replacing** `deleteCauseEdges` on the port — see below):
    atomically replaces every existing cause edge for one effect with a new cause (or clears it,
    when the new cause is `null`), reusing `saveEdge`'s same lock-and-recheck machinery as one
    transaction — closing `DEF-030`'s second race (two concurrent "replace this effect's cause"
    sequences landing duplicate cause-edge rows for one effect).
  - `countEdgesTouching`: a straightforward adapter method per the port's existing contract.
- **`ICausalChainRepository` itself changes** (confirmed necessary, not silently avoided):
  `deleteCauseEdges(effectId): Promise<void>` is **removed** and replaced by
  `replaceCauseEdge(effectId, newCause)` (above). Confirmed via full-codebase search that
  `deleteCauseEdges` has exactly one real caller (`UpdateHazardousEventUseCase.
  applyCausalEdgeChange`) — `CreateHazardousEvent.ts` only calls `saveEdge`,
  `DeleteHazardousEvent.ts` only calls `countEdgesTouching`. This is a **BREAKING** change to the
  port's interface, migrated in the same change (see Impact).
- **`UpdateHazardousEventUseCase.applyCausalEdgeChange`** (`application/use-cases/
  UpdateHazardousEvent.ts`) collapses from two port calls (`deleteCauseEdges` then `saveEdge`) to
  one (`replaceCauseEdge`) — see `design.md` Decision 4 for the full trace of why the two-call
  shape could never close Race 2 no matter how either individual method was locked.
- Add `DrizzleHazardTaxonomyRepository` (`app/domains/hazardous-events/infrastructure/
  DrizzleHazardTaxonomyRepository.server.ts`), fulfilling `IHazardTaxonomyRepository` against
  `hazard_driver`/`hazard_type_custom_field_definition`: plain tenant+id-membership queries, no
  recursion, no concurrency concern (stateless reads). An empty `ids` array resolves an empty
  set without issuing a query, per the port's existing spec.
- Update `_docs/refactoring-plan/deferred-items-register.md`: close `DEF-021`; **delete** the
  `DEF-030` row entirely (resolve-by-deletion convention — both races closed, no residual gap to
  describe).

**Not in scope** (adjacent, explicitly deferred per the roadmap and this change's own instructions):
- NestJS provider registration in `HazardousEventsModule` — that is `5g`.
- `DEF-012` (cross-tenant causality access control) — that is `5n`, runs after this change.
- `DEF-011` (relocating `hazard_driver`/`hazard_type_custom_field_definition` to shared infra) —
  owned by Disaster Events' own future migration.
- `IHazardTaxonomyRepository`'s method signatures (unchanged) — only `ICausalChainRepository`
  changes, and only as described above (human-approved 2026-10-13, see `design.md` Decision 4).
- A general-purpose Unit-of-Work/transaction abstraction — `5k`'s territory; this change's
  locking is specific to `ICausalChainRepository`'s own two methods.

## Capabilities

### New Capabilities

(none — both ports already have capability specs from `4b`/`4f`; see Modified Capabilities)

### Modified Capabilities

- `causal-chain-repository-port`: adds the `ADAPTER_ROW_BOUND` fail-closed requirement for
  `findReachableEdgesFrom`, a cyclic-stored-data termination requirement (provable only against
  a real adapter, not a fake), and a mandatory concurrent-callers requirement for `saveEdge`
  (the mutual-cycle race, `DEF-030` Race 1). Additionally **removes** the `deleteCauseEdges`
  requirement and **adds** a `replaceCauseEdge` requirement (atomic swap/clear, plus its own
  mandatory concurrent-callers scenario closing `DEF-030` Race 2) — human-approved port signature
  change, 2026-10-13. `hazard-taxonomy-repository-port`'s existing spec already fully describes
  the behavior this change's adapter must satisfy — no requirement changes there.

## Impact

- **Files added:**
  - `app/domains/hazardous-events/infrastructure/DrizzleCausalChainRepository.server.ts`
  - `app/domains/hazardous-events/infrastructure/DrizzleHazardTaxonomyRepository.server.ts`
  - `tests/integration/db/queries/DrizzleCausalChainRepository.test.ts`
  - `tests/integration/db/queries/DrizzleHazardTaxonomyRepository.test.ts`
  - `tests/integration-realdb/domains/hazardous-events/DrizzleCausalChainRepository.realdb.test.ts`
    (added 2026-10-14, gate 9.11 finding — see Test approach below)
- **Files modified** (expanded from "adapters only" per the human-approved Option 2 decision,
  `design.md` Decision 4):
  - `_docs/refactoring-plan/deferred-items-register.md` (close/delete `DEF-021` and `DEF-030`)
  - `app/domains/hazardous-events/application/ports/ICausalChainRepository.ts` — remove
    `deleteCauseEdges`, add `replaceCauseEdge` (**BREAKING** interface change)
  - `app/domains/hazardous-events/application/ports/ICausalChainRepository.test.ts` — replace the
    `deleteCauseEdges` conformance block with a `replaceCauseEdge` one
  - `app/domains/hazardous-events/application/use-cases/UpdateHazardousEvent.ts` —
    `applyCausalEdgeChange` collapses two port calls into one
  - `app/domains/hazardous-events/application/use-cases/UpdateHazardousEvent.test.ts` — largest
    single piece of this change's test impact: fake gains `replaceCauseEdge`, 21 existing
    assertions rewritten, one test removed/merged (no longer an observable two-step failure
    shape), one new concurrent-callers sibling test added (design.md Decision 4 point 4)
  - `app/domains/hazardous-events/application/use-cases/CreateHazardousEvent.test.ts` and
    `DeleteHazardousEvent.test.ts` — mechanical rename of each file's own throwaway
    `deleteCauseEdges` stub to `replaceCauseEdge` (no assertions reference either; confirmed by
    direct read)
- **DB migration:** none — `hazardous_event_causality`, `hazard_driver`, and
  `hazard_type_custom_field_definition` all pre-exist with no column changes needed (confirmed by
  direct read of all three table files).
- **Test approach:** PGlite integration (`yarn test:run2`), under
  `tests/integration/db/queries/`, plus Vitest unit-level rewrites to the existing use-case/port
  fake-conformance tests listed above. No E2E — no route wiring exists yet (that's `5g`/later).
  **Expanded 2026-10-14** (gate 9.11, test-quality-auditor, human-approved): PGlite cannot prove
  `saveEdge`/`replaceCauseEdge`'s advisory locks are load-bearing — PGlite's own `db.transaction()`
  holds one instance-wide mutex for the whole callback, so the Race 1/Race 2 PGlite tests pass
  identically with or without the `pg_advisory_xact_lock` calls present (confirmed empirically by
  temporarily deleting them). A real-Postgres duplicate of both mandatory concurrent-callers
  scenarios now also runs under the existing `yarn test:run3` tier
  (`tests/integration-realdb/domains/hazardous-events/DrizzleCausalChainRepository.realdb.test.ts`),
  where each concurrent call gets its own connection and the advisory lock is genuinely what
  serializes them — confirmed discriminating the same way (fails with the locks removed, passes
  with them restored, stable across repeated runs). See `tasks.md` section 5b for the full trace.
- **Security/multi-tenancy:** `DrizzleCausalChainRepository` is deliberately **not**
  tenant-scoped, matching `ICausalChainRepository`'s existing contract (`hazardous_event_causality`
  has no tenant column of its own — `DEF-012`, out of scope here).
  `DrizzleHazardTaxonomyRepository` is tenant-scoped on every query
  (`country_accounts_id = tenantId`), matching `IHazardTaxonomyRepository`'s existing contract.
  `saveEdge`/`replaceCauseEdge`'s advisory-lock-based concurrency fix is itself a
  security-adjacent change (closing two data-integrity races, `DEF-030` both parts) — see
  `design.md` Decision 4 for the full design, now resolved.
