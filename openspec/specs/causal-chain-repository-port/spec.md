# causal-chain-repository-port Specification

## Purpose

Defines `ICausalChainRepository`, the first persistence port for `hazardous_event_causality`:
a scoped read of edges reachable from one node, and a single-edge write. No whole-table load.

## Requirements

### Requirement: findReachableEdgesFrom returns only edges reachable forward from the given node

`ICausalChainRepository.findReachableEdgesFrom(nodeId)` SHALL resolve the set of `CausalEdge`
records reachable by following `causeId -> effectId` edges forward, starting from `nodeId`, MUST
NOT load or return edges outside that reachable set, and MUST resolve an empty array (never throw,
never resolve `null`) when `nodeId` has no existing edges. The resolved set MUST be complete — an
implementation MUST NOT resolve a truncated partial set under its own internal query bound; if its
bound would be exceeded before the reachable set is fully determined, it MUST reject rather than
resolve a partial result (design.md Decision 2's "fail closed, not truncate" note).

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

### Requirement: saveEdge persists exactly one cause-effect edge

`ICausalChainRepository.saveEdge(edge, causalityExplanation)` SHALL insert exactly one row into
`hazardous_event_causality` with `causeHazardousEventId: edge.causeId`,
`effectHazardousEventId: edge.effectId`, and `causalityExplanation`. It relies on the table's own
FK and CHECK constraints as the authoritative guard against a dangling or self-referencing edge —
it MUST NOT re-implement that validation itself.

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

### Requirement: deleteCauseEdges removes every stored edge for which the given node is the effect

`ICausalChainRepository.deleteCauseEdges(effectId)` SHALL remove every row in
`hazardous_event_causality` whose `effectHazardousEventId` equals `effectId`. It MUST be
idempotent: calling it when no such row exists MUST resolve normally (not throw), with no effect.
It MUST NOT remove any row where `effectId` appears only as `causeHazardousEventId` (an edge where
the given node is itself a cause of some other effect MUST NOT be affected).

#### Scenario: An existing cause edge for the given effect is removed

- **GIVEN** an edge `{ causeId: "A", effectId: "B" }` exists
- **WHEN** `deleteCauseEdges("B")` is called
- **THEN** no edge with `effectId: "B"` SHALL remain

#### Scenario: Calling deleteCauseEdges for a node with no existing cause edge is a no-op

- **GIVEN** no edge exists with `effectId: "no-such-effect"`
- **WHEN** `deleteCauseEdges("no-such-effect")` is called
- **THEN** it SHALL resolve normally, without throwing

#### Scenario: An edge where the given node is the cause, not the effect, is unaffected

- **GIVEN** an edge `{ causeId: "B", effectId: "C" }` exists (`"B"` is a cause here, not an effect)
- **WHEN** `deleteCauseEdges("B")` is called
- **THEN** the edge `{ causeId: "B", effectId: "C" }` SHALL remain unaffected

#### Scenario: Only edges matching the given effectId are removed, not unrelated edges

- **GIVEN** edges `{ causeId: "A", effectId: "B" }` and `{ causeId: "X", effectId: "Y" }` both exist
- **WHEN** `deleteCauseEdges("B")` is called
- **THEN** the edge `{ causeId: "A", effectId: "B" }` SHALL be removed
- **AND** the edge `{ causeId: "X", effectId: "Y" }` SHALL remain unaffected

### Requirement: countEdgesTouching counts every edge where the given node is cause or effect, in either direction

`ICausalChainRepository.countEdgesTouching(nodeId)` SHALL resolve the count of every stored
`hazardous_event_causality` edge where `nodeId` equals either `causeId` or `effectId` — unlike
`findReachableEdgesFrom`'s forward-only reachability traversal, this answers "does any edge
touch this node at all," regardless of direction.

#### Scenario: A node with no existing edges resolves zero

- **GIVEN** a `nodeId` with no rows in `hazardous_event_causality` referencing it
- **WHEN** `countEdgesTouching(nodeId)` is called
- **THEN** it SHALL resolve `0`

#### Scenario: A node that is only ever a cause is counted

- **GIVEN** an edge `{ causeId: "A", effectId: "B" }` exists, and `"A"` appears as a cause in
  no other edge
- **WHEN** `countEdgesTouching("A")` is called
- **THEN** it SHALL resolve `1`

#### Scenario: A node that is only ever an effect is counted — not just forward-reachable nodes

- **GIVEN** an edge `{ causeId: "A", effectId: "B" }` exists, and `"B"` has no outgoing edge of
  its own (i.e. `"B"` is never a `causeId`)
- **WHEN** `countEdgesTouching("B")` is called
- **THEN** it SHALL resolve `1` — `findReachableEdgesFrom("B")` would resolve `[]` for this
  same node, but `countEdgesTouching` MUST still count the edge where `"B"` is the effect

#### Scenario: A node touched by multiple edges, as both cause and effect, resolves the total count

- **GIVEN** edges `{ causeId: "A", effectId: "B" }` and `{ causeId: "B", effectId: "C" }` both
  exist
- **WHEN** `countEdgesTouching("B")` is called
- **THEN** it SHALL resolve `2` — one edge where `"B"` is the effect, one where `"B"` is the
  cause

#### Scenario: An edge not touching the given node is excluded

- **GIVEN** edges `{ causeId: "A", effectId: "B" }` and an unrelated edge
  `{ causeId: "X", effectId: "Y" }` both exist
- **WHEN** `countEdgesTouching("A")` is called
- **THEN** it SHALL resolve `1`, not `2`
