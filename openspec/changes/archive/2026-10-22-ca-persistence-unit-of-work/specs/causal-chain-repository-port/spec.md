## MODIFIED Requirements

### Requirement: saveEdge persists exactly one cause-effect edge

`ICausalChainRepository.saveEdge(edge, causalityExplanation, tx?)` SHALL insert exactly one row
into `hazardous_event_causality` with `causeHazardousEventId: edge.causeId`,
`effectHazardousEventId: edge.effectId`, and `causalityExplanation`. It relies on the table's own
FK and CHECK constraints as the authoritative guard against a dangling or self-referencing edge —
it MUST NOT re-implement that validation itself. When two concurrent calls would jointly close a
cycle between the same two nodes, at most one of them MUST succeed — the other MUST reject
rather than silently persist an edge that closes the cycle. When an optional `tx` is supplied,
every statement this method issues (the advisory lock acquisition, the cycle recheck, and the
insert itself) MUST execute against that same `tx` — if `tx` is itself already inside an open
transaction, this method's own internal transaction MUST nest as a `SAVEPOINT`, not open a new
one, and `pg_advisory_xact_lock`'s own lifetime then extends to that outer transaction, not just
this method's own call (design.md Risks).

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

#### Scenario: Called with a tx already inside an open outer transaction, the write is visible to that same outer transaction before it commits

- **GIVEN** an open, not-yet-committed transaction `tx`
- **WHEN** `saveEdge(edge, causalityExplanation, tx)` is called, followed — still within that
  same `tx`, before commit — by `findReachableEdgesFrom` executed against that same `tx`
- **THEN** the reachable-edges read MUST include the just-saved edge — the insert MUST NOT be
  invisible to the outer transaction that is nesting this call

### Requirement: replaceCauseEdge atomically replaces every existing cause edge for one effect

`ICausalChainRepository.replaceCauseEdge(effectId, newCause, tx?)` SHALL, as a single atomic
operation, remove every existing row in `hazardous_event_causality` whose `effectHazardousEventId`
equals `effectId`, then — if `newCause` is not `null` — insert exactly one new row with
`causeHazardousEventId: newCause.causeId`, `effectHazardousEventId: effectId`, and
`causalityExplanation: newCause.causalityExplanation`. A `null` `newCause` MUST leave `effectId`
with no cause edge (the "clear" case). The operation MUST be atomic with respect to any other
concurrent `replaceCauseEdge` (or `saveEdge`) call touching the same `effectId` or the same
`causeId`: when two concurrent calls target the same `effectId` with different causes, the
effect MUST end up with exactly one cause edge afterward, never two, and when a concurrent call
would close a cycle against the result, it MUST reject rather than silently persist it. When an
optional `tx` is supplied, the same nested-transaction and lock-lifetime behavior described for
`saveEdge` applies.

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

### Requirement: countEdgesTouching counts every edge where the given node is cause or effect, in either direction

`ICausalChainRepository.countEdgesTouching(nodeId, tx?)` SHALL resolve the count of every stored
`hazardous_event_causality` edge where `nodeId` equals either `causeId` or `effectId` — unlike
`findReachableEdgesFrom`'s forward-only reachability traversal, this answers "does any edge
touch this node at all," regardless of direction. When an optional `tx` is supplied, the count
query MUST execute against that same `tx`, not a separate connection.

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

#### Scenario: When called under a caller-supplied tx, the count reflects that transaction's own uncommitted writes

- **GIVEN** an open transaction handle `tx` under which an edge touching `nodeId` has been
  inserted but not yet committed
- **WHEN** `countEdgesTouching(nodeId, tx)` is called
- **THEN** it MUST resolve a count that includes that uncommitted edge — this method MUST NOT
  use a separate connection when `tx` is supplied
