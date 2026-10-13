## Context

`ICausalChainRepository` and `IHazardTaxonomyRepository` (`app/domains/hazardous-events/
application/ports/`) are real interfaces, each with a fake-conformance test
(`ICausalChainRepository.test.ts`, `IHazardTaxonomyRepository.test.ts`) and three real consumers
(`CreateHazardousEvent.ts`, `UpdateHazardousEvent.ts`, `DeleteHazardousEvent.ts`). No adapter
exists. All three target tables pre-exist with no schema change needed — see proposal.md Impact.

**Correction to the roadmap intent text, confirmed by direct read, not assumed:** the roadmap's
`5i` section (`_docs/refactoring-plan/hazardous-events-refactoring-roadmap.md` lines 1903-1992)
states that "`4b`'s own design.md documented this exact row-bound-vs-traversal-cap arithmetic...
(its Decision 12)." I read `4b`'s archived design.md in full
(`openspec/changes/archive/2026-09-25-ca-he-create-use-case/design.md`) — it has exactly 11
numbered decisions, none about `ADAPTER_ROW_BOUND` or row-bound arithmetic (Decision 2 only notes
that a future adapter "must fail closed, not truncate," with no arithmetic worked out). The only
"Decision 12" anywhere in the archive is in a different change
(`2026-09-07-ca-he-causality-schema`), about cross-tenant causality access (`DEF-012`) — unrelated.
**There is no prior row-bound arithmetic to carry forward; Decision 2 below derives it fresh.**
I'm flagging this explicitly rather than fabricating a citation, per this project's "never
guess or assume" standing instruction. The roadmap document itself may be worth correcting
separately — not done as part of this change, which only touches `openspec/changes/` and the
deferred-items register.

Grep across `app/` and `openspec/changes/archive/` confirms no existing precedent in this
codebase for Postgres advisory locks, `SERIALIZABLE` isolation, or multi-statement transactions
in any Clean-Architecture domain — Decision 4 (`DEF-030`) is genuinely novel, not an adaptation
of an existing pattern.

## Goals / Non-Goals

**Goals:**

- Real, PGlite-tested Drizzle adapters for both ports.
- Close `DEF-021` fully.
- Close `DEF-030` fully, both races — **confirmed by the human 2026-10-13: Option 2 (see
  Decision 4), not Option 1.** This requires an additive `ICausalChainRepository` signature
  change (`deleteCauseEdges` removed, `replaceCauseEdge` added) and a call-site change in
  `UpdateHazardousEventUseCase.ts` — both now explicitly in scope, superseding this task's
  original "adapters only" boundary for this one, human-approved reason.

**Non-Goals:**

- NestJS provider registration (`5g`).
- Any schema change to the three target tables.
- `DEF-012` cross-tenant access control (`5n`).
- A general-purpose locking/Unit-of-Work abstraction (`5k`'s `DEF-026`/`DEF-033` territory) — the
  locking scheme here is specific to `ICausalChainRepository`, not a reusable primitive.

## Decisions

### Decision 1 — Types

No new types. Both adapters implement their existing ports exactly:

```ts
// app/domains/hazardous-events/infrastructure/DrizzleCausalChainRepository.server.ts
@Injectable()
export class DrizzleCausalChainRepository implements ICausalChainRepository {
	constructor(
		@Inject(DRIZZLE_CLIENT) private readonly db: Dr,
		private readonly adapterRowBound: number = DEFAULT_ADAPTER_ROW_BOUND, // 5000
	) {}
	// findReachableEdgesFrom, saveEdge, replaceCauseEdge, countEdgesTouching
}

export const DEFAULT_ADAPTER_ROW_BOUND = 5000;
```

```ts
// app/domains/hazardous-events/infrastructure/DrizzleHazardTaxonomyRepository.server.ts
@Injectable()
export class DrizzleHazardTaxonomyRepository implements IHazardTaxonomyRepository {
	constructor(@Inject(DRIZZLE_CLIENT) private readonly db: Dr) {}
	// findValidHazardDriverIds, findValidCustomFieldDefinitionIds
}
```

`@Injectable()`/`@Inject(DRIZZLE_CLIENT)` match `DrizzleWorkflowRepository.server.ts`'s and
`DrizzleEventCausalityRepository.server.ts`'s existing convention — decorated for when `5g`
registers it, but **no module/provider file is added in this change** (out of scope, per
proposal.md). `adapterRowBound` is a constructor parameter (not a module-level constant) so
`tests/integration/db/queries/DrizzleCausalChainRepository.test.ts` can inject a small bound (e.g.
`3`) and seed a handful of rows rather than `5000` real ones, matching
`CAUSAL_CHAIN_TRAVERSAL_CAP`'s own exported-for-testability precedent (`domain/CausalChain.ts`).

### Decision 2 — `findReachableEdgesFrom`: path-array `WITH RECURSIVE`, row-bound on raw (pre-distinct) traversal rows

**Chosen shape** (`cause_id`/`effect_id` below are shorthand for
`hazardous_event_causality.cause_hazardous_event_id`/`effect_hazardous_event_id`):

```sql
WITH RECURSIVE reachable(cause_id, effect_id, path, is_revisit) AS (
	SELECT cause_id, effect_id, ARRAY[$nodeId, effect_id], false
	FROM hazardous_event_causality
	WHERE cause_id = $nodeId

	UNION ALL

	SELECT c.cause_id, c.effect_id, r.path || c.effect_id,
	       c.effect_id = ANY(r.path)
	FROM hazardous_event_causality c
	JOIN reachable r ON c.cause_id = r.effect_id
	WHERE r.is_revisit = false
)
SELECT cause_id, effect_id FROM reachable
LIMIT $adapterRowBound + 1
```

Then in application code:

```ts
if (rawRows.length > adapterRowBound) {
	throw new ValidationError(
		"Causal chain traversal exceeded the adapter's row bound before it could be resolved",
		{ nodeId, adapterRowBound },
	);
}
return dedupeByCauseEffectPair(rawRows); // Map keyed by `${causeId}:${effectId}`
```

**Why a path array, not a dedup-by-id set (this codebase's own established precedent,
`app/db/queries/eventCausalityRepository.ts`'s `getDescendantDisasterEventIds`/
`getAncestorDisasterEventIds`, is insufficient here):** that precedent's plain `UNION` dedups on a
single `id` column because it only needs reachable *node ids*. `findReachableEdgesFrom` must
return distinct *edges*: a node reached a second time via a different edge still needs that edge
captured (`ICausalChainRepository.test.ts`'s own "terminates against pre-existing cyclic data"
test expects **both** `{A,B}` and `{B,A}` from a 2-cycle, not just the node ids `{A,B}`). The
`is_revisit` flag — computed once, at the moment a row is created, as "does this row's own
`effect_id` already appear earlier in its own path" — lets a row that closes a cycle still be
*emitted* (it's already a row in the CTE), while excluding it from being used as a join source
(`r`) for the *next* recursion level. Traced against the exact 2-cycle fixture
(`A→B`, `B→A`): level 0 emits `{A,B}` with `path=[A,B]`, `is_revisit=false`; level 1 emits
`{B,A}` with `path=[A,B,A]`, `is_revisit=true` (A was already in `[A,B]`); level 2 has no
`is_revisit=false` row left to expand from, so recursion terminates with exactly `{A,B}`, `{B,A}`
— matching the test's expected result exactly, with no depth cap and no silent truncation.

**Row bound applies to raw, pre-distinct rows, not the final deduped edge count — a deliberate,
documented trade-off (Risks):** a diamond-shaped non-cyclic graph (e.g. `A→B`, `A→C`, `B→D`,
`C→D`) reaches `D` via two different paths, each of which is `is_revisit=false` (first visit to
`D` down each path) and so each continues expanding — if `D→E` exists, `{D,E}` is produced twice
in the raw output before the final dedupe step. This means raw-row growth can be combinatorial in
fan-in-heavy graphs even when the final distinct-edge answer is small, and the bound is checked
against the larger raw count, not the smaller deduped one. This is intentional (fail closed on
query *cost*, not on answer *size*) but means a legitimate, non-cyclic, heavily-converging
causal graph could hit `ADAPTER_ROW_BOUND` before a cyclic one would — flagged in Risks, not
silently accepted.

**The off-by-one the (incorrectly cited) roadmap text was pointing at, resolved:** `LIMIT
$adapterRowBound + 1`, not `LIMIT $adapterRowBound`. Fetching exactly `adapterRowBound` rows
cannot distinguish "exactly at the bound, complete" (no more rows exist) from "over the bound,
truncated" (more rows exist but we stopped pulling them) — both look identical as an
`adapterRowBound`-length result. Fetching one extra row removes the ambiguity: if the true result
has `≤ adapterRowBound` rows, the `LIMIT` never binds and `rawRows.length ≤ adapterRowBound`
(no throw); if the true result has `> adapterRowBound` rows, exactly `adapterRowBound + 1` come
back (the sentinel row), and `rawRows.length > adapterRowBound` triggers the throw.

**Alternatives considered:**

1. **Depth cap (`array_length(path,1) < N`), matching the legacy `cycles.ts` pattern.** Rejected
   — this is the exact bug being fixed (silently stops and returns a "normal" but incomplete
   result past the cap, per `3c`'s own design.md Context).
2. **Dedup node ids only (`eventCausalityRepository.ts`'s own precedent).** Rejected — loses
   edges reached a second time via a different path, confirmed insufficient against this port's
   own fake-conformance test (above).

### Decision 3 — `IHazardTaxonomyRepository`: plain tenant+id queries, no new design needed

```ts
async findValidHazardDriverIds(
	ids: readonly string[],
	tenantId: string,
): Promise<ReadonlySet<string>> {
	if (ids.length === 0) return new Set(); // no query issued — matches the port's existing spec
	const rows = await this.db
		.select({ id: hazardDriverTable.id })
		.from(hazardDriverTable)
		.where(and(eq(hazardDriverTable.countryAccountsId, tenantId), inArray(hazardDriverTable.id, ids)));
	return new Set(rows.map((r) => r.id));
}
```

Same shape for `findValidCustomFieldDefinitionIds` against `hazard_type_custom_field_definition`.
Both tables already have a `country_accounts_id` index (confirmed — proposal.md Impact). No
recursion, no cycle risk, no concurrent-callers scenario needed: these are stateless reads with
no shared mutable state between callers (the "concurrent callers" spec-quality rule applies to
caches/counters/queues — a plain `SELECT` has nothing to race on). Don't over-design this one.

### Decision 4 — `DEF-030` locking strategy — **resolved 2026-10-13: Option 2, fully closes both races**

**The race, precisely, in two parts** (both named in the `DEF-030` register entry):

- **Race 1 (mutual two-node cycle):** two concurrent `saveEdge` calls, `{causeId: A, effectId:
  B}` and `{causeId: B, effectId: A}`, each reads the pre-write edge state via
  `findReachableEdgesFrom` and finds no cycle (because neither write has committed yet), so both
  pass their cycle check and both insert — leaving a 2-node cycle in `hazardous_event_causality`.
- **Race 2 (duplicate cause edges for one effect):** `UpdateHazardousEventUseCase.
  applyCausalEdgeChange` called `deleteCauseEdges(effectId)` then `saveEdge(...)` as two
  **separate, non-transactional port calls**. Two concurrent "replace this effect's cause"
  sequences (`T1`: delete(E), save(X→E); `T2`: delete(E), save(Y→E)) could interleave as:
  `T1.delete(E)` commits, `T2.delete(E)` commits (both succeed, idempotent), `T1.save(X→E)`
  commits, `T2.save(Y→E)` commits — leaving **two** cause-edge rows for effect `E` (no `UNIQUE`
  constraint on the effect column blocks this at the DB level).

**An adapter-only fix (holding a lock inside `saveEdge` alone) closes Race 1 but structurally
cannot close Race 2** — traced explicitly during this change's first draft, not assumed: whatever
lock `deleteCauseEdges(E)` and `saveEdge(_→E)` each acquire, they are **separate transactions**
that each acquire and release their lock **before the use case's next awaited call begins**. By
the time `T2.save(Y→E)` acquires its lock (after `T1.save(X→E)` already committed and released),
there is no remaining trace that `T1` ever deleted or re-inserted for the same effect — `T2`'s
in-transaction re-check only re-verifies the *cycle* condition (is `Y` reachable from `E`?),
unaffected by `X→E` existing, so `T2` finds no cycle and commits too, leaving both rows persisted.
This is a structural consequence of `deleteCauseEdges` and `saveEdge` being two independent port
calls with no shared transaction, not a flaw in any particular lock scheme.

**Human decision 2026-10-13: Option 2 — fully close `DEF-030` now,** rather than ship the above
residual gap. This requires (confirmed by the human, re-verified independently by re-reading the
current port/use-case/test files before drafting this revision — not taken on trust from the
instruction alone):

1. **`ICausalChainRepository`: remove `deleteCauseEdges(effectId): Promise<void>`, add**
   ```ts
   /**
    * Atomically replaces every existing cause edge for `effectId` with `newCause` (or with
    * nothing, when `newCause` is `null` — the "clear" case): delete the prior cause edge(s),
    * re-verify no cycle would result, then insert `newCause` if given — all as one transaction.
    * This is the authoritative guard against DEF-030's two races; a caller's own prior cycle
    * check (e.g. for a NotFoundError or a temporal-ordering check) is advisory only.
    */
   replaceCauseEdge(
       effectId: string,
       newCause: { causeId: string; causalityExplanation: string | null } | null,
   ): Promise<void>;
   ```
   **Confirmed, not assumed, that `deleteCauseEdges` has exactly one real caller:** re-grepped the
   whole `app/` tree (not just the three use-case files) for `deleteCauseEdges` — six matches:
   `UpdateHazardousEventUseCase`/`.test.ts` (real caller), `ICausalChainRepository.ts`/`.test.ts`
   (the port itself), and `CreateHazardousEvent.test.ts`/`DeleteHazardousEvent.test.ts` (each has
   its own local `FakeCausalChainRepository` with a throwaway no-op `deleteCauseEdges` stub,
   required only to satisfy the interface — neither file's assertions ever reference it, and
   `CreateHazardousEvent.ts`/`DeleteHazardousEvent.ts` themselves only call `saveEdge`/
   `findReachableEdgesFrom` and `countEdgesTouching` respectively, confirmed by direct grep of
   both files). Removing `deleteCauseEdges` orphans nothing.

2. **`DrizzleCausalChainRepository.server.ts`'s `replaceCauseEdge`** reuses `saveEdge`'s own
   lock-and-recheck machinery from this same decision: acquire the same two single-key advisory
   locks (`effectId`, and `newCause.causeId` when `newCause` is not `null`), in the same sorted
   global order as `saveEdge`, as one transaction that then `DELETE`s existing rows for
   `effectId`, re-runs Decision 2's path-guarded reachability query (skipped entirely when
   `newCause` is `null` — nothing to check a clear against), and inserts if a cause was given.
   When `newCause` is `null`, only the single `effectId` lock is acquired (no second node to pair
   with). Traced against Race 2: `T1` (`replaceCauseEdge(E, {causeId: X})`) and `T2`
   (`replaceCauseEdge(E, {causeId: Y})`) both need the lock on `E` (shared key in each call's own
   sorted pair), so they serialize. Whichever runs second starts its own transaction only after
   the first's has fully committed — its `DELETE WHERE effect = E` removes the first call's own
   just-committed row before inserting its own. **Exactly one row survives for `E`, never two.**
   Traced against Race 1 the same way as before: two calls touching the same unordered `{A,B}`
   pair (in either role, via `saveEdge` or `replaceCauseEdge`) always lock the same two keys in
   the same order, so the second one's in-transaction recheck sees the first's committed edge and
   rejects the cycle.

   **Addendum (code review, 2026-10-13):** the in-transaction recheck routes through the domain's
   own `assertCausalLinkDoesNotCreateCycle` (`domain/CausalChain.ts`) against the
   `queryReachableEdges`-returned set, rather than a separate hand-rolled membership check —
   one cycle rule/error message, not two. This also closes a pre-existing inconsistency, not
   merely a style unification: the hand-rolled check had no node-count cap of its own, while the
   use case's upstream pre-check already applied `CAUSAL_CHAIN_TRAVERSAL_CAP` (500 distinct
   nodes) on top of the adapter's own `adapterRowBound` (raw-row cap, Decision 2). Both the
   pre-check and this recheck are now governed by the same node cap.

3. **`UpdateHazardousEventUseCase.applyCausalEdgeChange` collapses from two port calls to one:**
   ```ts
   private async applyCausalEdgeChange(
       causeAction: CauseAction,
       cause: HazardousEvent | undefined,
       effectId: string,
       causalityExplanation: string | null,
   ): Promise<void> {
       if (causeAction.kind === "unchanged") {
           return;
       }
       const newCause =
           causeAction.kind === "set" && cause !== undefined
               ? { causeId: cause.id, causalityExplanation }
               : null;
       await this.causalChainRepository.replaceCauseEdge(effectId, newCause);
   }
   ```
   `validateCauseIfSet`'s existing pre-check (`findReachableEdgesFrom` +
   `assertCausalLinkDoesNotCreateCycle`, plus `assertCauseStartsNoLaterThanEffect`) **stays
   unchanged in code**, but its cycle-check half is now explicitly **advisory, not
   authoritative** — `replaceCauseEdge`'s own in-transaction recheck is what's actually enforced
   against concurrent writers. The pre-check still does real, non-redundant work: it's the only
   place `NotFoundError` (missing/cross-tenant `causeId`) and the temporal
   (`assertCauseStartsNoLaterThanEffect`) check happen, and it gives a fast, specific rejection
   for the common *sequential* case before any write is attempted.
   **Known, pre-existing, out-of-scope wrinkle (flagged, not fixed here):**
   `hazardousEventRepository.save(updatedEvent)` already runs *before* `applyCausalEdgeChange` in
   `execute()`'s existing order (unchanged by this decision) — so a `replaceCauseEdge` rejection
   (a genuine concurrent cycle) still leaves the event's other field changes already committed.
   This is the same class of gap as `DEF-026`/`DEF-033` (no transactional boundary spanning
   `UpdateHazardousEventUseCase`'s multiple writes), owned by `5k`'s Unit-of-Work work, not
   something `DEF-030` or this change fixes.

4. **Test impact — the largest cost of this decision, scoped precisely by re-reading each file,
   not estimated:**
   - **`ICausalChainRepository.test.ts`** (port fake-conformance test): remove the
     `describe("deleteCauseEdges")` block and its `_deleteCauseEdgesArity` assertion; add a
     `describe("replaceCauseEdge")` block (atomic swap, clear-on-`null`, clean no-op/insert with
     no prior edge) plus a new `_replaceCauseEdgeArity` assertion. No concurrency scenario at this
     level — a plain in-memory fake can't meaningfully prove transactional atomicity; that proof
     belongs to `DrizzleCausalChainRepository.test.ts` (real PGlite) and the delta spec's own
     Race-2 scenario (contract-level, provable only against the real adapter).
   - **`UpdateHazardousEvent.test.ts`**: `FakeCausalChainRepository` gains a `replaceCauseEdgeCalls`
     tracking array and a `replaceCauseEdge` method (delete-then-insert against its own in-memory
     `edges` array, same shape as today's fake `saveEdge`/`deleteCauseEdges` combined); loses
     `deleteCauseEdgesCalls`/`deleteCauseEdges`. Re-read the full file: **21 existing assertions**
     reference `deleteCauseEdgesCalls` or `saveEdgeCalls` to observe `UpdateHazardousEventUseCase`'s
     own behavior and must be rewritten against `replaceCauseEdgeCalls` (`saveEdge` itself stays
     in the interface — `FakeCausalChainRepository` must still implement it to satisfy the type —
     but `UpdateHazardousEventUseCase` no longer calls it, so no assertion should reference
     `saveEdgeCalls` afterward). One test, **"propagates a generic Error from saveEdge, leaving
     the prior edge already deleted,"** has no equivalent under the new design — it exercises a
     two-step partial-failure shape (delete succeeds, then a separate save fails) that
     `replaceCauseEdge`'s atomicity removes entirely from the use case's observable behavior (the
     adapter's own transaction either fully commits or fully rolls back; there is no "prior edge
     already deleted" intermediate state visible above the port anymore). This test is removed,
     folded into the adjacent **"propagates a generic Error from deleteCauseEdges, after the
     HazardousEvent save already happened"** test, renamed to reference `replaceCauseEdge` — found
     during this revision's own re-verification pass, not explicitly named in the original
     instruction, flagged here so it's a deliberate removal, not an oversight. A **new sibling
     test** is added to the existing `describe("concurrent callers racing to set each other's
     causeId")` block: two concurrent `execute()` calls targeting the *same* effect
     (`"event-A"`) with two *different* `causeId`s — asserts `replaceCauseEdgeCalls` has exactly
     one entry per `execute()` call (never a separate delete+save pair) and that exactly one edge
     survives for that effect afterward (proving the call-shape is now atomic-from-the-port's-
     perspective; real lock/transaction behavior is only provable against the real adapter). The
     existing Race-1 barrier-driven test stays exactly as-is (still documents the fake's own
     non-locking behavior for contrast, and its assertions never reference the removed/renamed
     call-tracking arrays).
   - **`CreateHazardousEvent.test.ts`/`DeleteHazardousEvent.test.ts`**: each has a local
     `FakeCausalChainRepository` with a throwaway `deleteCauseEdges` stub (no assertions
     reference it — confirmed above); mechanically renamed to a throwaway `replaceCauseEdge` stub
     to satisfy the updated interface. No behavioral test changes.

This fully closes `DEF-030` (both races) — the register entry is **deleted**, per this project's
resolve-by-deletion convention, not narrowed.

## Risks / Trade-offs

- **[Risk] Diamond-shaped fan-in graphs can exhaust `ADAPTER_ROW_BOUND` on raw traversal rows
  even when the final distinct-edge answer is small** (Decision 2). → Mitigation: the bound is
  injectable per adapter instance; a real operational hit would be diagnosed via the thrown
  `ValidationError`'s `{ nodeId, adapterRowBound }` context, and the fix is raising the bound,
  not changing the query shape. Accepted as the cost of "fail closed, not truncate."
- **[Risk] `UpdateHazardousEvent.test.ts`'s rewrite (21 assertions, one test removed/merged) is
  this change's largest single source of mechanical-but-error-prone work** (Decision 4). →
  Mitigation: tasks.md enumerates the rewrite explicitly rather than leaving it to be discovered
  mid-implementation; `yarn tsc` is a hard gate that catches any missed reference to the removed
  `deleteCauseEdgesCalls`/`saveEdgeCalls` fake properties.
- **[Risk] The pre-existing `hazardousEventRepository.save()`-before-causal-edge-write ordering
  means a `replaceCauseEdge` rejection still leaves other field changes already committed**
  (Decision 4, point 3). → Not fixed here — pre-existing, same class as `DEF-026`/`DEF-033`,
  explicitly owned by `5k`. Flagged, not silently absorbed into this change's "fixed" claim.
- **[Risk] `pg_advisory_xact_lock(hashtext(id)::int)` collapses a UUID to a 32-bit hash — a
  collision would serialize two unrelated node pairs unnecessarily.** → Accepted: this only costs
  extra (benign) lock contention between unrelated nodes, never incorrectness (no false
  negative on a real conflict) — `hashtext`'s int4 space makes this exceedingly rare for this
  table's realistic row counts, and a spurious serialization is a performance cost, not a
  correctness bug.
- **[Trade-off] This design deviates from the roadmap's own suggested mechanisms ("SERIALIZABLE
  isolation, or a row lock on the effect side") by using advisory locks plus an in-transaction
  re-check instead.** → Advisory locks avoid `SERIALIZABLE`'s retry-on-serialization-failure
  handling (no precedent for that in this codebase either) while still giving the same
  correctness guarantee for Race 1; called out explicitly as a deviation, per this project's
  standing instruction to flag roadmap deviations rather than silently substitute.
- **[Risk] Per-edge locking only serializes the exact node pair each call locks — it does not
  close a larger cycle assembled from two fully disjoint concurrent edge writes** (e.g. existing
  `B→C`/`D→A`, concurrent `saveEdge(A→B)`/`saveEdge(C→D)` sharing no lock key). Tracked as
  `DEF-043`, not fixed here — a structural limitation of any per-edge locking scheme, not specific
  to this implementation.

## Migration Plan

No DB migration (`yarn dbsync`) — no schema changes (proposal.md Impact). Deployment is additive:
both adapter files and their tests can land independently of any route or DI wiring (`5g`), so
there is no reasonable partial-rollout concern. Rollback is a plain revert; no persisted data
shape changes.

## Open Questions

None remaining. The one open question this design previously carried (`DEF-030`'s locking
strategy, Option 1 vs. Option 2) was resolved by the human 2026-10-13 — see Decision 4.
