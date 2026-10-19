## ADDED Requirements

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
