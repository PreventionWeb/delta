## MODIFIED Requirements

### Requirement: findReachableEdgesFrom returns only edges reachable forward from the given node

`ICausalChainRepository.findReachableEdgesFrom(nodeId)` SHALL resolve the set of `CausalEdge`
records reachable by following `causeId -> effectId` edges forward, starting from `nodeId`, MUST
NOT load or return edges outside that reachable set, and MUST resolve an empty array (never throw,
never resolve `null`) when `nodeId` has no existing edges. The resolved set MUST be complete — an
implementation MUST NOT resolve a truncated partial set under its own internal query bound; if its
bound would be exceeded before the reachable set is fully determined, it MUST reject rather than
resolve a partial result (design.md Decision 2's "fail closed, not truncate" note). An
implementation MUST terminate against pre-existing cyclic stored data (data inserted outside this
port, since `hazardous_event_causality`'s own CHECK constraint only blocks the trivial 1-length
self-reference) rather than looping forever.

#### Scenario: A node with no existing edges resolves an empty array

- **GIVEN** a `nodeId` with no rows in `hazardous_event_causality` referencing it
- **WHEN** `findReachableEdgesFrom(nodeId)` is called
- **THEN** it SHALL resolve `[]`

#### Scenario: A node with existing outgoing edges resolves the edges reachable forward from it

- **GIVEN** edges `A -> B` and `B -> C` exist
- **WHEN** `findReachableEdgesFrom("A")` is called
- **THEN** it SHALL resolve a set including `A -> B` and `B -> C`

#### Scenario: An edge not reachable from the given node is excluded

- **GIVEN** edges `A -> B` and an unrelated edge `X -> Y` exist
- **WHEN** `findReachableEdgesFrom("A")` is called
- **THEN** the resolved set SHALL include `A -> B` and MUST NOT include `X -> Y`

#### Scenario: A bounded adapter rejects rather than truncates when its row bound would be exceeded

- **GIVEN** an adapter configured with a finite row bound, and a stored graph reachable from
  `nodeId` that would require visiting more rows than that bound before the reachable set is
  fully determined
- **WHEN** `findReachableEdgesFrom(nodeId)` is called
- **THEN** it SHALL reject with a `ValidationError`
- **AND** it MUST NOT resolve a partial or truncated edge list

#### Scenario: Pre-existing cyclic stored data does not cause an infinite loop

- **GIVEN** `hazardous_event_causality` already stores a multi-hop cycle (e.g. `A -> B` and
  `B -> A`), inserted directly rather than through this port
- **WHEN** `findReachableEdgesFrom("A")` is called
- **THEN** it SHALL terminate and resolve a set including both `A -> B` and `B -> A`
- **AND** it MUST NOT loop forever or exceed the configured row bound while doing so

### Requirement: saveEdge persists exactly one cause-effect edge

`ICausalChainRepository.saveEdge(edge, causalityExplanation)` SHALL insert exactly one row into
`hazardous_event_causality` with `causeHazardousEventId: edge.causeId`,
`effectHazardousEventId: edge.effectId`, and `causalityExplanation`. It relies on the table's own
FK and CHECK constraints as the authoritative guard against a dangling or self-referencing edge —
it MUST NOT re-implement that validation itself. When two concurrent calls would jointly close a
cycle between the same two nodes, at most one of them MUST succeed — the other MUST reject
rather than silently persist an edge that closes the cycle.

#### Scenario: A single edge is persisted with its explanation

- **GIVEN** a `CausalEdge` `{ causeId: "A", effectId: "B" }` and explanation `"upstream flooding"`
- **WHEN** `saveEdge(edge, "upstream flooding")` is called
- **THEN** exactly one row SHALL be persisted with `causeHazardousEventId: "A"`,
  `effectHazardousEventId: "B"`, `causalityExplanation: "upstream flooding"`

#### Scenario: A null explanation is persisted as null, not an empty string

- **GIVEN** a `CausalEdge` `{ causeId: "A", effectId: "B" }` and explanation `null`
- **WHEN** `saveEdge(edge, null)` is called
- **THEN** the persisted row's `causalityExplanation` SHALL be `null`

#### Scenario: Two concurrent saveEdge calls for different edges both persist independently

- **GIVEN** two concurrent `saveEdge` calls for two different, non-conflicting edges (`A -> B` and
  `C -> D`), both invoked before either resolves
- **WHEN** both calls resolve
- **THEN** both edges SHALL be persisted as independent rows
- **AND** neither call's write SHALL be lost or overwritten by the other's

#### Scenario: Two concurrent saveEdge calls that would jointly close a two-node cycle do not both succeed

- **GIVEN** no edge currently exists between nodes `"A"` and `"B"`
- **WHEN** two concurrent calls are made before either resolves: `saveEdge({ causeId: "A",
  effectId: "B" }, null)` and `saveEdge({ causeId: "B", effectId: "A" }, null)`
- **THEN** at most one of the two calls SHALL succeed
- **AND** the other SHALL reject with a `ConflictError` identifying a cycle, rather than silently
  persisting a second edge that closes a two-node cycle

## REMOVED Requirements

### Requirement: deleteCauseEdges removes every stored edge for which the given node is the effect

**Reason**: Superseded by `replaceCauseEdge`, which closes `DEF-030`'s second race (two concurrent
"replace this effect's cause" sequences landing duplicate cause-edge rows for one effect) by
making the delete-then-insert sequence a single atomic, lock-guarded transaction. A standalone
`deleteCauseEdges` method, called as a separate port call from a separate `saveEdge` call (as
`UpdateHazardousEventUseCase.applyCausalEdgeChange` did), cannot provide this guarantee no matter
how either individual method is implemented — confirmed via explicit interleaving trace in
design.md Decision 4.

**Migration**: Any caller that previously called `deleteCauseEdges(effectId)` to clear a causal
link with no replacement now calls `replaceCauseEdge(effectId, null)`. Confirmed via full-codebase
search that `deleteCauseEdges` had exactly one real caller, `UpdateHazardousEventUseCase.
applyCausalEdgeChange` (`CreateHazardousEvent.ts` only calls `saveEdge`; `DeleteHazardousEvent.ts`
only calls `countEdgesTouching`) — migrated as part of this same change.

## ADDED Requirements

### Requirement: replaceCauseEdge atomically replaces every existing cause edge for one effect

`ICausalChainRepository.replaceCauseEdge(effectId, newCause)` SHALL, as a single atomic
operation, remove every existing row in `hazardous_event_causality` whose `effectHazardousEventId`
equals `effectId`, then — if `newCause` is not `null` — insert exactly one new row with
`causeHazardousEventId: newCause.causeId`, `effectHazardousEventId: effectId`, and
`causalityExplanation: newCause.causalityExplanation`. A `null` `newCause` MUST leave `effectId`
with no cause edge (the "clear" case). The operation MUST be atomic with respect to any other
concurrent `replaceCauseEdge` (or `saveEdge`) call touching the same `effectId` or the same
`causeId`: when two concurrent calls target the same `effectId` with different causes, the
effect MUST end up with exactly one cause edge afterward, never two, and when a concurrent call
would close a cycle against the result, it MUST reject rather than silently persist it.

#### Scenario: An existing cause edge is atomically swapped for a new one

- **GIVEN** an edge `{ causeId: "cause-1", effectId: "event-A" }` exists
- **WHEN** `replaceCauseEdge("event-A", { causeId: "cause-2", causalityExplanation: null })` is
  called
- **THEN** the edge `{ causeId: "cause-1", effectId: "event-A" }` SHALL no longer exist
- **AND** exactly one edge `{ causeId: "cause-2", effectId: "event-A" }` SHALL exist

#### Scenario: A null newCause clears the existing cause edge with no replacement

- **GIVEN** an edge `{ causeId: "cause-1", effectId: "event-A" }` exists
- **WHEN** `replaceCauseEdge("event-A", null)` is called
- **THEN** no edge with `effectId: "event-A"` SHALL remain

#### Scenario: Calling replaceCauseEdge for an effect with no existing cause edge is a clean no-op or a plain insert

- **GIVEN** no edge exists with `effectId: "event-A"`
- **WHEN** `replaceCauseEdge("event-A", null)` is called
- **THEN** it SHALL resolve normally, without throwing, and no edge SHALL exist for `"event-A"`
- **WHEN** instead `replaceCauseEdge("event-A", { causeId: "cause-1", causalityExplanation: null })`
  is called
- **THEN** exactly one edge `{ causeId: "cause-1", effectId: "event-A" }` SHALL exist

#### Scenario: Two concurrent replaceCauseEdge calls for the same effect leave exactly one cause edge, never two

- **GIVEN** no edge currently exists for `effectId: "event-A"`
- **WHEN** two concurrent calls are made before either resolves: `replaceCauseEdge("event-A", {
  causeId: "cause-X", causalityExplanation: null })` and `replaceCauseEdge("event-A", { causeId:
  "cause-Y", causalityExplanation: null })`
- **THEN** after both resolve, exactly one edge SHALL exist with `effectId: "event-A"`
- **AND** no state SHALL exist in which both `cause-X` and `cause-Y` are simultaneously
  persisted as causes of `event-A`
