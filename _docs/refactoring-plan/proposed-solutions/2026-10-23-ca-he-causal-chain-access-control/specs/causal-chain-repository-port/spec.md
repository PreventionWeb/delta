## ADDED Requirements

### Requirement: findVisibleEdgesTouching returns only direct edges a tenant is entitled to know about

`ICausalChainRepository.findVisibleEdgesTouching(nodeId, tenantId, tx?)` SHALL resolve the set of
direct `hazardous_event_causality` edges where `nodeId` equals either `causeId` or `effectId` —
the same direct-edge membership `countEdgesTouching` counts, not `findReachableEdgesFrom`'s
multi-hop forward traversal — filtered to only those edges whose own other side (the entity on
whichever side `nodeId` does not occupy) either belongs to `tenantId` or has an active
`hazardous_event_share` grant to `tenantId`. An edge whose other side belongs to a different
tenant with no active grant to `tenantId` MUST be excluded from the resolved set. This method is
the only grant-gated read on this port — `findReachableEdgesFrom`, `saveEdge`, `replaceCauseEdge`,
and `countEdgesTouching` are unaffected by this change and remain exactly as specified elsewhere
in this capability (design.md Decision 1). When an optional `tx` is supplied, the query MUST
execute against that same `tx`.

#### Scenario: A node with no existing edges resolves an empty array

- **GIVEN** a `nodeId` with no rows in `hazardous_event_causality` referencing it
- **WHEN** `findVisibleEdgesTouching(nodeId, tenantId)` is called
- **THEN** it SHALL resolve `[]`

#### Scenario: A same-tenant edge is always included, grant or no grant

- **GIVEN** an edge `{ causeId: "A", effectId: "B" }` exists, and `"B"`'s owning tenant is
  `tenantId`
- **WHEN** `findVisibleEdgesTouching("A", tenantId)` is called
- **THEN** the resolved set SHALL include `{ causeId: "A", effectId: "B" }`

#### Scenario: A cross-tenant edge with no grant is excluded

- **GIVEN** an edge `{ causeId: "A", effectId: "B" }` exists, `"A"`'s owning tenant is
  `tenantId`, and `"B"`'s owning tenant is a different tenant with no
  `hazardous_event_share` grant to `tenantId`
- **WHEN** `findVisibleEdgesTouching("A", tenantId)` is called
- **THEN** the resolved set MUST NOT include `{ causeId: "A", effectId: "B" }`

#### Scenario: A cross-tenant edge with an active grant is included

- **GIVEN** an edge `{ causeId: "A", effectId: "B" }` exists, `"A"`'s owning tenant is
  `tenantId`, `"B"`'s owning tenant is a different tenant, and a `hazardous_event_share` grant
  exists for `(hazardousEventId: "B", grantedToCountryAccountsId: tenantId)`
- **WHEN** `findVisibleEdgesTouching("A", tenantId)` is called
- **THEN** the resolved set SHALL include `{ causeId: "A", effectId: "B" }`

#### Scenario: Revoking the grant removes the edge from the visible set without deleting the edge itself

- **GIVEN** the previous scenario's grant and edge both exist, and `findVisibleEdgesTouching("A",
tenantId)` currently includes `{ causeId: "A", effectId: "B" }`
- **WHEN** the grant for `(hazardousEventId: "B", grantedToCountryAccountsId: tenantId)` is
  revoked, and `findVisibleEdgesTouching("A", tenantId)` is called again
- **THEN** the resolved set MUST NOT include `{ causeId: "A", effectId: "B" }`
- **AND** the underlying `hazardous_event_causality` edge SHALL still exist, unaffected by the
  revoke

#### Scenario: A node that is only ever an effect still has its visibility evaluated — not just forward-reachable nodes

- **GIVEN** an edge `{ causeId: "A", effectId: "B" }` exists, `"A"`'s owning tenant is a
  different tenant than `tenantId` with no grant to `tenantId`, and `"B"`'s owning tenant is
  `tenantId`
- **WHEN** `findVisibleEdgesTouching("B", tenantId)` is called
- **THEN** the resolved set MUST NOT include `{ causeId: "A", effectId: "B" }` — the edge's other
  side (`"A"`) is cross-tenant with no grant, independent of which role `"B"` plays

#### Scenario: A mix of visible and non-visible edges resolves only the visible ones

- **GIVEN** edges `{ causeId: "A", effectId: "B" }` (same-tenant) and `{ causeId: "A", effectId:
"C" }` (cross-tenant, no grant) both touch `"A"`, whose owning tenant is `tenantId`
- **WHEN** `findVisibleEdgesTouching("A", tenantId)` is called
- **THEN** the resolved set SHALL include `{ causeId: "A", effectId: "B" }` and MUST NOT include
  `{ causeId: "A", effectId: "C" }`

#### Scenario: This method does not traverse transitively beyond direct edges

- **GIVEN** edges `{ causeId: "A", effectId: "B" }` and `{ causeId: "B", effectId: "C" }` exist,
  all three belonging to `tenantId`
- **WHEN** `findVisibleEdgesTouching("A", tenantId)` is called
- **THEN** the resolved set SHALL include `{ causeId: "A", effectId: "B" }` and MUST NOT include
  `{ causeId: "B", effectId: "C" }` — that edge does not touch `"A"` directly

#### Scenario: When called under a caller-supplied tx, the result reflects that transaction's own uncommitted writes

- **GIVEN** an open transaction handle `tx` under which a `hazardous_event_share` grant has been
  inserted but not yet committed, making a previously-excluded cross-tenant edge now visible
- **WHEN** `findVisibleEdgesTouching(nodeId, tenantId, tx)` is called within that same `tx`
- **THEN** the resolved set MUST reflect that uncommitted grant — this method MUST NOT use a
  separate connection when `tx` is supplied

#### Scenario: Existing methods on this port are unaffected by grants

- **GIVEN** a cross-tenant edge exists with no `hazardous_event_share` grant covering either side
- **WHEN** `findReachableEdgesFrom`, `saveEdge`, `replaceCauseEdge`, or `countEdgesTouching` is
  called in a way that would otherwise observe or persist that edge
- **THEN** each of those methods MUST behave exactly as specified elsewhere in this capability,
  with no grant-based filtering applied
