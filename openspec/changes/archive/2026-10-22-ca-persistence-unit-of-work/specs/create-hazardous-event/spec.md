## MODIFIED Requirements

### Requirement: An optional causeId links the new event as the effect of an existing cause

When `command.causeId` is present (a non-empty string — `undefined` or `""` both count as absent),
`execute(command)` SHALL validate the cause event exists via
`IHazardousEventRepository.findById(command.causeId, command.tenantId)` (same-tenant-only,
final for this change; see design.md Decision 4), load the edges reachable from the new event's generated id
via `ICausalChainRepository.findReachableEdgesFrom`, call
`assertCausalLinkDoesNotCreateCycle(edges, command.causeId, newId)`, persist the `HazardousEvent`,
initialize and persist its `WorkflowInstance`, and only then persist the new
`causeId -> effectId` edge via `ICausalChainRepository.saveEdge`. The order MUST be:
`IHazardousEventRepository.insert` -> `IWorkflowRepository.insert` -> `ICausalChainRepository.saveEdge`
(design.md Decision 5 — this order is kept for determinism and backward compatibility with the
pre-`5k` sequence; a failure at any step now rolls back every earlier write in the same call
regardless of position, since all three writes run inside the single transaction described in
"The full write sequence runs as one atomic transaction" below — ordering no longer affects which
partial state, if any, could be left behind).

#### Scenario: Happy path with a valid causeId persists the event, the workflow instance, then the edge

- **GIVEN** a valid `CreateHazardousEventCommand` with `causeId` set to an id that
  `IHazardousEventRepository.findById` resolves successfully
- **WHEN** `execute(command)` is called
- **THEN** `IHazardousEventRepository.insert` SHALL be called before `IWorkflowRepository.insert`,
  which SHALL be called before `ICausalChainRepository.saveEdge`
- **AND** `saveEdge` SHALL be called exactly once with `{ causeId: command.causeId, effectId:
<the newly-generated id> }` and `command.causalityExplanation` (or `null` if omitted)

#### Scenario: A failure after the HazardousEvent is saved propagates unmodified, with no compensating delete

- **GIVEN** a valid `CreateHazardousEventCommand` (with or without `causeId`), and a fake
  `IWorkflowRepository.insert` or `ICausalChainRepository.saveEdge` stubbed to reject with a generic
  `Error`
- **WHEN** `execute(command)` is called
- **THEN** the call SHALL reject with that same `Error`, unmodified
- **AND** the `HazardousEvent` already written earlier in this same call by
  `IHazardousEventRepository.insert` SHALL NOT exist afterward — the whole transaction rolls back,
  not just the failing write (`DEF-026`, closed by this change; supersedes this scenario's prior
  "no compensating delete, already persisted" framing — a caller that retries the same logical
  request after this rejection still creates a distinct `HazardousEvent` on the retry, since `id`
  is freshly generated per call, exactly as before)

#### Scenario: Missing cause propagates NotFoundError, no writes occur

- **GIVEN** a `CreateHazardousEventCommand` with `causeId` set to an id
  `IHazardousEventRepository.findById` does not find
- **WHEN** `execute(command)` is called
- **THEN** the call SHALL reject with the `NotFoundError` thrown by `findById`, unmodified
- **AND** `IHazardousEventRepository.insert`, `ICausalChainRepository.saveEdge`, and
  `IWorkflowRepository.insert` SHALL NOT be called

#### Scenario: A causeId belonging to a different tenant is rejected (same-tenant-only, final for this change — see design.md Decision 4)

- **GIVEN** a `CreateHazardousEventCommand` with `command.tenantId` set to `"tenant-1"` and
  `causeId` set to an id that only exists under a different tenant
- **WHEN** `execute(command)` is called
- **THEN** `IHazardousEventRepository.findById` SHALL be called with `(command.causeId,
command.tenantId)`, and the call SHALL reject with the resulting `NotFoundError`, unmodified,
  even though the cause event genuinely exists under another tenant
- **AND** `IHazardousEventRepository.insert`, `ICausalChainRepository.saveEdge`, and
  `IWorkflowRepository.insert` SHALL NOT be called

#### Scenario: findReachableEdgesFrom is called with the newly-generated id, not causeId

- **GIVEN** any valid `CreateHazardousEventCommand` with `causeId` present
- **WHEN** `execute(command)` is called
- **THEN** `ICausalChainRepository.findReachableEdgesFrom` SHALL be called with the newly-generated
  id (not `command.causeId`)
- **AND** `assertCausalLinkDoesNotCreateCycle` SHALL be called with that id as `effectId` and
  `command.causeId` as `causeId`
- **AND**, with a fake `ICausalChainRepository` returning the edges a real adapter would return for
  a brand-new id (`[]`), execution MUST proceed to persist the edge — a freshly-generated id has no
  existing edges and cannot equal `command.causeId`

#### Scenario: A cycle rejection from a contrived edge set propagates and blocks every write

- **GIVEN** a `CreateHazardousEventCommand` with `causeId` present, and a fake
  `ICausalChainRepository.findReachableEdgesFrom` stubbed to resolve
  `[{ causeId: <the newly-generated id>, effectId: command.causeId }]` (a contrived edge set — not
  reachable through a real adapter, per design.md Decision 1)
- **WHEN** `execute(command)` is called
- **THEN** the call SHALL reject with the `ConflictError` `assertCausalLinkDoesNotCreateCycle`
  throws, unmodified
- **AND** `IHazardousEventRepository.insert`, `ICausalChainRepository.saveEdge`, and
  `IWorkflowRepository.insert` SHALL NOT be called

#### Scenario: Two concurrent creates with the same causeId both succeed, producing two distinct edges

- **GIVEN** two concurrent `execute()` calls, each with a different `CreateHazardousEventCommand`
  but the same `causeId`, both invoked before either resolves
- **WHEN** both calls resolve
- **THEN** each SHALL persist its own distinct, newly-generated `effectId`
- **AND** `ICausalChainRepository.saveEdge` SHALL be called twice, once per call, each with the
  shared `causeId` and a different `effectId`
- **AND** neither call's cycle check SHALL be affected by the other's in-flight write, because
  each call's own `effectId` is unique to that call and did not exist before it — there is no
  edge either call could observe that involves the other call's `effectId`

## ADDED Requirements

### Requirement: The full write sequence runs as one atomic transaction

`execute()`'s three writes (`IHazardousEventRepository.insert`, `IWorkflowRepository.insert`, and
— when a cause is present — `ICausalChainRepository.saveEdge`) SHALL run inside a single
transaction, with the resulting transaction handle passed to every one of those calls. A
rejection from any write SHALL roll back every write already made earlier in that same `execute()`
call — no partial state (e.g. a `HazardousEvent` with no `WorkflowInstance`) SHALL be observable
afterward. The structured log event on success SHALL be emitted only after the transaction has
resolved successfully; it SHALL NOT be emitted when the transaction rolls back.

#### Scenario: A successful call commits all writes and logs exactly once, after the transaction resolves

- **GIVEN** a valid `CreateHazardousEventCommand` with `causeId` present
- **WHEN** `execute(command)` resolves successfully
- **THEN** the `HazardousEvent`, its `WorkflowInstance`, and the causal edge SHALL all be
  persisted
- **AND** exactly one structured log event SHALL be emitted, and only after all three writes have
  committed

#### Scenario: A rolled-back transaction leaves zero rows persisted, regardless of which write failed

- **GIVEN** a valid `CreateHazardousEventCommand` with `causeId` present, and a fake
  `ICausalChainRepository.saveEdge` stubbed to reject with a generic `Error`
- **WHEN** `execute(command)` is called
- **THEN** the call SHALL reject with that same `Error`
- **AND** no `HazardousEvent`, no `WorkflowInstance`, and no causal edge from this call SHALL
  exist afterward
- **AND** no log event SHALL be emitted
