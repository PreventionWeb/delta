## ADDED Requirements

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
