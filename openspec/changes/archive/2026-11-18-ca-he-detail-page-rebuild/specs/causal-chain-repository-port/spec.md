## ADDED Requirements

### Requirement: findEffectEdges returns every direct effect edge for a given cause node

`ICausalChainRepository.findEffectEdges(causeId)` SHALL return every edge whose `causeId` equals
the given node, each with its own `causalityExplanation`, in no particular guaranteed order. Unlike
`findReachableEdgesFrom` (which traverses forward transitively, across every hop), this is a
single-hop lookup of direct children only — the inverse direction of `findCauseEdge`, which
resolves the single direct parent of a given effect node.

#### Scenario: A node with no outgoing edges resolves an empty array

- **GIVEN** a node that is never a `causeId` in any stored edge
- **WHEN** `findEffectEdges(nodeId)` is called
- **THEN** it resolves to an empty array, not an error

#### Scenario: A node with one direct effect resolves that one edge

- **GIVEN** a stored edge `A -> B` with a non-null `causalityExplanation`
- **WHEN** `findEffectEdges("A")` is called
- **THEN** it resolves an array containing exactly one entry for `B`, with that same
  `causalityExplanation`

#### Scenario: A node with multiple direct effects resolves every one of them

- **GIVEN** stored edges `A -> B` and `A -> C`
- **WHEN** `findEffectEdges("A")` is called
- **THEN** it resolves both `B` and `C`, each with its own stored `causalityExplanation`

#### Scenario: Only direct (one-hop) effects are returned, not transitively reachable ones

- **GIVEN** stored edges `A -> B` and `B -> C` (so `C` is reachable from `A` only via `B`)
- **WHEN** `findEffectEdges("A")` is called
- **THEN** the result includes `B` but excludes `C` — unlike `findReachableEdgesFrom("A")`, which
  would include both

#### Scenario: An edge where the node is only ever an effect, not a cause, is excluded

- **GIVEN** a stored edge `A -> B`
- **WHEN** `findEffectEdges("B")` is called
- **THEN** it resolves an empty array — `B` being someone else's effect does not make it a cause
  of anything

#### Scenario: Called under a caller-supplied tx, the result reflects that transaction's own
uncommitted writes

- **GIVEN** an edge inserted inside an open transaction, not yet committed
- **WHEN** `findEffectEdges(causeId, tx)` is called with that same transaction handle
- **THEN** the just-inserted edge is included in the result
