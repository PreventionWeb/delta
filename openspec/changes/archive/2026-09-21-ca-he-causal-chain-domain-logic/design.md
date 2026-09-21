## Context

`hazardous_event_causality` (`app/domains/hazardous-events/infrastructure/hazardousEventCausalityTable.ts`,
from `2e`) stores directed cause→effect edges between `hazardousEventTable` rows. Its only
existing safeguard is a DB CHECK rejecting `cause_hazardous_event_id = effect_hazardous_event_id`
(the trivial 1-length case) — the table's own comment states n-length cycle detection is
deliberately deferred to this intent, app-layer only (no DB trigger; resolved open decision #7).

No domain layer exists yet for this table. `3b` (merged) added `HazardousEvent.ts` (the aggregate
root) and `IHazardousEventRepository` but explicitly does not own causal-chain reasoning — the
roadmap places that in its own domain service because it reasons over the whole graph, not one
entity's own state. This intent adds that service only; it is not wired into any port, use case,
or route (expand-only rule — see proposal.md Impact).

The legacy precedent this design avoids repeating: `event.ts`'s inline `checkForCycle()` (see
proposal.md's Phase 0 correction) caps recursive-CTE path length at 10 and treats hitting the cap
as "safe" — no distinct "couldn't verify" outcome exists, so a chain longer than the cap silently
passes. This design's cap is deliberately not the same shape.

## Goals / Non-Goals

**Goals:**

- Correctly reject a cycle of any length beyond what a depth-10-style cap could ever catch.
- Make the safety cap and "cycle confirmed" outcomes structurally distinguishable — a caller must
  never be able to mistake "graph too large to safely verify" for "no cycle."
- Keep the service framework-free and DB-free, per the Unit test tier and files-touched scope.

**Non-Goals:**

- Wiring this service into any real create/update use case, port, or the existing `event.ts`
  cutover — later phase's job (Invariant 2).
- Cross-tenant access control on `hazardous_event_causality` (DEF-012) — explicitly out of scope
  per the roadmap's own `3c` text; a same-tenant filter is not this intent's concern, since the
  edge list this service receives is whatever the (future) caller decides to pass in.
- Persistence-layer race conditions on concurrent link creation — see Risks below.

## Decisions

**Decision 1 — Module shape: stateless exported functions, not a class.**
`HazardousEvent`/`WorkflowInstance` use a private-constructor class because they are entities with
identity and state that must be protected at construction. `CausalChain` has neither: it holds no
state between calls and constructs nothing. A private-constructor class here would have no
invariant to guard and nothing to instantiate, which is exactly the SRP/needless-ceremony pattern
Gate 5 (SOLID review) flags. This is the first domain-service (as opposed to domain-entity)
precedent in `app/domains/*/domain/`; the shape is stated explicitly here rather than inherited
from `HazardousEvent.ts`/`WorkflowInstance.ts`, which are a different kind of object.

```ts
export interface CausalEdge {
	readonly causeId: string;
	readonly effectId: string;
}

export const CAUSAL_CHAIN_TRAVERSAL_CAP = 500;

export function assertCausalLinkDoesNotCreateCycle(
	existingEdges: readonly CausalEdge[],
	causeId: string,
	effectId: string,
): void;
```

`assertCausalLinkDoesNotCreateCycle` throws (never returns a boolean) — matches the roadmap intent
text ("Throws a DomainError when linking would close a cycle") and the assert-style naming already
used for validation in this codebase (`ValidationError`-throwing `create()` methods).

**Decision 2 — Algorithm: reachability check from the proposed effect node, not a literal port of
the legacy recursive CTE.** The legacy query starts from the potential parent and walks up; here,
adding `causeId → effectId` closes a cycle exactly when `causeId` is already reachable by following
existing edges forward from `effectId` (i.e., effect can already get back to cause through some
existing chain). The service performs a DFS/BFS from `effectId`, following `causeId → effectId`
edges forward, maintaining a `Set<string>` of visited node IDs; a node already in the set is never
re-queued (this is the "track visited node IDs... stop on a repeat" mechanism the roadmap asks
for — it also handles a self-referencing subgraph without extra logic, since a revisit just halts
that branch rather than looping). If `causeId` is ever visited, the link would close a cycle.

**Decision 3 — Self-link (1-length) is in scope and checked first, before traversal.** `2e`'s own
text is explicit that the domain layer must implement the same rule as its CHECK constraint, not
rely on the constraint alone (Invariant 3). `causeId === effectId` is checked as an immediate,
zero-traversal cycle (a path of length zero from effect back to cause) before the general
traversal runs, so this scenario never depends on cap or graph-content edge cases.

**Decision 4 — Cap unit and exceeded-cap behavior (the collision the advisor flagged between "cap
at 500" and "any length is accepted").** The cap counts **distinct nodes visited across the entire
traversal** (`visited.size`), not recursion/path depth — the roadmap's "high value... only as a
runaway-query safety cap" is about bounding how far traversal can reach through the graph (V), not
about edge fan-out or duplicate edges (E) — a node with many outgoing or duplicate edges toward
already-visited nodes does not by itself grow `visited.size` (Gate 8 finding, round 2: this
parenthetical previously said "e.g., a node with many outgoing edges," which described bounding E,
not what the cap actually bounds). Reworded test-tier claim: **"a
valid acyclic chain of any length up to the traversal cap is accepted; a cycle of any length,
including one that would require visiting more nodes than the cap, is never silently passed as
acyclic."** Concretely:

- Traversal exhausts (no more reachable nodes) without ever visiting `causeId`, and without
  hitting the cap → **no cycle**, function returns normally.
- `causeId` is visited at any point → **cycle**, `ConflictError` thrown immediately (Decision 5)
  — a confirmed cycle is reported the instant it's found, cap or no cap.
- The cap (`visited.size` reaches `CAUSAL_CHAIN_TRAVERSAL_CAP`) is reached **before** either of the
  above resolves → traversal stops and the function throws (fails closed), using a **different**
  error type than the cycle case (Decision 5), so a caller can distinguish "confirmed cycle" from
  "could not verify within the safety limit." The function never returns normally in this branch —
  "couldn't verify" is never silently treated as "verified acyclic."

**Decision 5 — Error types: reuse existing `DomainError` subclasses, no new class.** Adding a new
subclass would touch `app/shared/errors/`, outside this intent's files-touched list.
`ValidationError` (422) and `ConflictError` (409) are the two candidates (`NotFoundError`/
`AuthorizationError` clearly don't fit either outcome). Checked against the base class's own
documented split (operational vs. programmer errors) and against `WorkflowInstance.transition()`'s
established convention in this codebase, not assumed:

- **Cycle confirmed → `ConflictError`.** `WorkflowInstance.transition()` already establishes the
  precedent: "operation disallowed given the current state" throws `ConflictError` (e.g.,
  `Cannot ${attemptedTransition} a WorkflowInstance from status ${status}`), while `create()`'s
  shape/field validation throws `ValidationError`. A cycle-closing link is structurally the same
  shape as `transition()`'s case: the inputs are individually well-formed IDs, but the _existing
  graph state_ makes this particular link disallowed. `ConflictError` also directly matches the
  roadmap intent text ("Throws a DomainError when linking would close a cycle" reads as "this
  request conflicts with existing state," not "this request is malformed").
- **Cap exceeded → `ValidationError`.** This is a different epistemic situation, not the same
  error with different wording: a conflict means the service _knows_ a cycle exists; a cap-exceeded
  result means the service could not determine that either way. Of the two remaining codes, this
  is closer to "the request as given cannot be processed/verified" (422) than to "conflicts with a
  known state" (409) — there is no confirmed conflicting state to report. Using a different class
  (not just a different message) lets a caller distinguish the two outcomes structurally, e.g. in a
  future use case that might retry or escalate a cap-exceeded case differently than a confirmed
  cycle.

**Decision 6 — Input shape: plain edge array, no port, no `Tx`.** The roadmap's "track visited node
IDs in the recursive query" describes the _algorithm_, not a requirement that this intent talk to
the DB. Files-touched lists only `CausalChain.ts`/`CausalChain.test.ts` — no
`IHazardousEventRepository` method addition, no new port file. The function receives
`existingEdges: readonly CausalEdge[]` as a plain parameter; a future use-case intent is
responsible for loading that array from `hazardous_event_causality` (via a repository method not
yet defined) and calling this function before persisting a new row. This intent's own test tier
("in-memory graph fixture, zero DB dependency") already implies this shape; stated explicitly here
so it isn't left for the implementer to infer.

## Risks / Trade-offs

- **[Risk] Cap value (500) is a judgment call, not derived from a real data ceiling.** →
  Mitigation: it is a named, exported constant (`CAUSAL_CHAIN_TRAVERSAL_CAP`), not a magic number
  inlined at the call site, so a future intent can revisit it with real production graph-size data
  without touching the algorithm itself.
- **[Risk] TOCTOU on concurrent link creation.** Two concurrent callers each checking a different
  proposed link against the same "existing edges" snapshot could each see their own link as
  acyclic, then both persist, jointly closing a cycle neither check observed alone. → Mitigation:
  out of scope for this intent — this service is a pure function with no shared mutable state of
  its own (the mandatory "concurrent callers" spec scenario for shared mutable state does not
  apply here: there is no cache/counter/store internal to `CausalChain.ts` for two callers to race
  on). The race is a property of whatever future use case loads edges and persists a new one
  around this check; it belongs in that intent's design, most naturally closed by a DB-level
  transaction/lock or a unique constraint check at insert time, not by this pure function.
- **[Risk] DEF-012 (cross-tenant causality) is a live, adjacent open question.** → Mitigation:
  confirmed out of scope for this intent (proposal.md Impact); flagged here only so a future reader
  doesn't assume its absence from this design means it was overlooked.
- **[Risk] `CAUSAL_CHAIN_TRAVERSAL_CAP` bounds BFS traversal reach, not the cost of reading
  `existingEdges` itself.** (Gate 10 finding, round 2.) `buildForwardAdjacency` iterates the full
  input array up front, before the cap is ever consulted — so an oversized `existingEdges` (e.g. an
  unscoped whole-table load) pays that cost regardless of how quickly the BFS itself would resolve.
  → Mitigation: out of scope for this intent — Decision 6 already assigns loading and scoping
  `existingEdges` to the future use-case intent that calls this function, not to this pure function;
  that intent's design should scope the edge list (e.g. to the relevant connected component/tenant)
  before calling this function, rather than this function taking on that responsibility itself.
