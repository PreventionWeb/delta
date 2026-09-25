## Purpose

Defines `ICausalChainRepository`, the first persistence port for `hazardous_event_causality`:
a scoped read of edges reachable from one node, and a single-edge write. No whole-table load.

## ADDED Requirements

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
