# create-hazardous-event Specification

## Purpose

Defines `CreateHazardousEventUseCase`, the single entry point that constructs and persists a new
`HazardousEvent`, optionally links it as the effect of an existing cause event, initializes its
`WorkflowInstance` at `DRAFT`, and returns a `HazardousEventDto`.

## Requirements

### Requirement: CreateHazardousEventUseCase constructs and persists a HazardousEvent with no causeId

`CreateHazardousEventUseCase.execute(command)` SHALL generate a new id internally, compute
`validHazardDriverIds`/`validCustomFieldDefinitionIds` via `IHazardTaxonomyRepository` scoped to
`command.tenantId`, construct a `HazardousEvent` via `HazardousEvent.create()`, and persist it via
`IHazardousEventRepository.insert()`. When `command.causeId` is absent, no cause lookup and no
`ICausalChainRepository` call of any kind SHALL be made.

`execute(command)` SHALL validate that `command.actingUserId` is present (neither `undefined`/`null`
nor an empty or whitespace-only string after trimming) before any write, and MUST throw
`ValidationError` referencing `actingUserId` otherwise, with no write of any kind.

#### Scenario: Happy path with no causeId persists the HazardousEvent and no causal edge

- **GIVEN** a valid `CreateHazardousEventCommand` with `causeId` omitted
- **WHEN** `execute(command)` is called
- **THEN** `IHazardousEventRepository.insert` SHALL be called exactly once with a `HazardousEvent`
  whose fields match the command
- **AND** `ICausalChainRepository.findReachableEdgesFrom` and `ICausalChainRepository.saveEdge`
  SHALL NOT be called

#### Scenario: ValidationError from HazardousEvent.create() propagates unmodified

- **GIVEN** a `CreateHazardousEventCommand` whose `hazardDriverIds` includes an id not present in
  the tenant-scoped set `IHazardTaxonomyRepository.findValidHazardDriverIds` resolves
- **WHEN** `execute(command)` is called
- **THEN** the call SHALL reject with the `ValidationError` thrown by `HazardousEvent.create()`,
  unmodified
- **AND** `IHazardousEventRepository.insert` SHALL NOT be called

#### Scenario: An empty-string causeId is treated as absent, same as omitted

- **GIVEN** a valid `CreateHazardousEventCommand` with `causeId: ""`
- **WHEN** `execute(command)` is called
- **THEN** `IHazardousEventRepository.findById` SHALL NOT be called
- **AND** `ICausalChainRepository.findReachableEdgesFrom` and `ICausalChainRepository.saveEdge`
  SHALL NOT be called
- **AND** the `hazardous_event.created` log line's `hasCause` field SHALL be `false`

#### Scenario: A failure from the HazardousEvent save propagates unmodified, no later step runs

- **GIVEN** a valid `CreateHazardousEventCommand`, and a fake `IHazardousEventRepository.insert`
  stubbed to reject with a generic `Error`
- **WHEN** `execute(command)` is called
- **THEN** the call SHALL reject with that same `Error`, unmodified
- **AND** `IWorkflowRepository.insert` and `ICausalChainRepository.saveEdge` SHALL NOT be called

#### Scenario: A missing or non-string actingUserId is rejected before any write

- **GIVEN** a `CreateHazardousEventCommand` whose `actingUserId` is an empty string, or a non-string
  value reachable only by a caller bypassing the compile-time type
- **WHEN** `execute(command)` is called
- **THEN** the call SHALL reject with `ValidationError`
- **AND** `IHazardousEventRepository.insert` SHALL NOT be called

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

### Requirement: WorkflowInstance is initialized at DRAFT for every newly-created HazardousEvent

`execute(command)` SHALL, after persisting the `HazardousEvent` and before persisting any causal
edge (design.md Decision 5), construct a `WorkflowInstance` via `WorkflowInstance.create()` with
`entityId` equal to the saved `HazardousEvent`'s id, `entityType: "HE"`, `status: "DRAFT"`, and
every attribution field `null`, and persist it via `IWorkflowRepository.insert()` — this is always
a first-time persistence for a freshly-generated `entityId`, never a transition against an
existing row, so `insert()` (not `update()`) is the correct method here.

#### Scenario: A DRAFT WorkflowInstance is created and persisted alongside every new event

- **GIVEN** any valid `CreateHazardousEventCommand`
- **WHEN** `execute(command)` resolves successfully
- **THEN** `IWorkflowRepository.insert` SHALL have been called exactly once with a `WorkflowInstance`
  whose `entityId` equals the saved `HazardousEvent`'s `id`, `entityType` is `"HE"`, `status` is
  `"DRAFT"`, and every attribution field is `null`

### Requirement: The returned HazardousEventDto reflects the saved event and its DRAFT workflow status

`execute(command)` SHALL return a `HazardousEventDto` derived from `IHazardousEventRepository.insert()`'s
resolved value and `IWorkflowRepository.insert()`'s resolved value — never the pre-insert
`HazardousEvent`/`WorkflowInstance` instances. Date fields MUST be serialized as ISO 8601 strings.

#### Scenario: Returned DTO has status DRAFT and matches the saved event's fields

- **GIVEN** any valid `CreateHazardousEventCommand`
- **WHEN** `execute(command)` resolves
- **THEN** the returned `HazardousEventDto.workflowStatus` SHALL be `"DRAFT"`
- **AND** the DTO's `id` SHALL equal `IHazardousEventRepository.insert()`'s resolved `id`
- **AND** `createdAt` SHALL be an ISO 8601 string equal to the saved event's `createdAt`

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

### Requirement: An optional spatialObservation is recorded inside the same transaction as the create

`CreateHazardousEventCommand` SHALL accept an optional `spatialObservation` field, with the same
shape as `UpdateHazardousEventCommand`'s own `spatialObservation` field (`Omit<RecordSpatialObservationCommand,
"tenantId" | "hazardousEventId" | "tx">`). When present, `execute()` SHALL call
`RecordSpatialObservationUseCase.execute({ ...command.spatialObservation, tenantId: command.tenantId,
hazardousEventId: <the saved event's id>, tx })` inside the same `transactionRunner.run()` block
that persists the `HazardousEvent` and its `WorkflowInstance` — mirroring
`UpdateHazardousEventUseCase`'s own composition of `RecordSpatialObservationUseCase` exactly. When
absent, no spatial-observation write of any kind SHALL occur.

#### Scenario: A command with spatialObservation records it inside the create's own transaction

- **GIVEN** a valid `CreateHazardousEventCommand` with `spatialObservation` present
- **WHEN** `execute(command)` resolves successfully
- **THEN** `RecordSpatialObservationUseCase.execute` SHALL have been called exactly once, with
  `hazardousEventId` equal to the newly-created event's id and the same `tx` used for the
  `HazardousEvent`/`WorkflowInstance` writes
- **AND** the structured success log SHALL be emitted only after this call (and every other write
  in the transaction) has committed

#### Scenario: A command with no spatialObservation performs no spatial-observation write

- **GIVEN** a valid `CreateHazardousEventCommand` with `spatialObservation` omitted
- **WHEN** `execute(command)` is called
- **THEN** `RecordSpatialObservationUseCase.execute` SHALL NOT be called

#### Scenario: A spatial-observation failure rolls back the whole transaction, including the already-inserted event

- **GIVEN** a valid `CreateHazardousEventCommand` with `spatialObservation` present, and a fake
  `RecordSpatialObservationUseCase.execute` stubbed to reject with a generic `Error`
- **WHEN** `execute(command)` is called
- **THEN** the call SHALL reject with that same `Error`
- **AND** no `HazardousEvent`, no `WorkflowInstance`, and no spatial observation from this call
  SHALL exist afterward — the same whole-transaction-rolls-back guarantee
  "The full write sequence runs as one atomic transaction" already specifies for the other two
  writes now extends to this third, conditional one

### Requirement: An optional cause must not start after the new event, same guard Update already enforces

When `command.causeId` is present, `execute()` SHALL call
`assertCauseStartsNoLaterThanEffect(cause.startDate, newEvent.startDate)` immediately after the
existing `assertCausalLinkDoesNotCreateCycle` check, and before any write. A cause whose `startDate`
is later than the new event's `startDate` SHALL cause `execute()` to reject with the `ConflictError`
`assertCauseStartsNoLaterThanEffect` throws, with no write of any kind performed.

#### Scenario: A cause starting after the new event is rejected before any write

- **GIVEN** a `CreateHazardousEventCommand` with `causeId` set to an existing event whose
  `startDate` is later than `command.startDate`
- **WHEN** `execute(command)` is called
- **THEN** the call SHALL reject with the `ConflictError` thrown by
  `assertCauseStartsNoLaterThanEffect`
- **AND** `IHazardousEventRepository.insert`, `IWorkflowRepository.insert`, and
  `ICausalChainRepository.saveEdge` SHALL NOT be called

#### Scenario: A cause starting no later than the new event passes the check

- **GIVEN** a `CreateHazardousEventCommand` with `causeId` set to an existing event whose
  `startDate` is equal to or earlier than `command.startDate`
- **WHEN** `execute(command)` is called
- **THEN** execution SHALL proceed to persist the event, its workflow instance, and the causal edge

#### Scenario: A malformed startDate on either event skips the check, same as Update's own behavior

- **GIVEN** a `CreateHazardousEventCommand` with `causeId` present, where either the cause's or the
  new event's `startDate` is not a validly-formatted flexible date
- **WHEN** `execute(command)` is called
- **THEN** `assertCauseStartsNoLaterThanEffect` SHALL NOT reject the call on that basis — the
  temporal-order check is skipped, matching `assertCauseStartsNoLaterThanEffect`'s own documented
  behavior (a malformed date skips the check rather than failing closed)

### Requirement: The new event's legacy HIP columns are populated via the anti-corruption layer, inside the same transaction

`execute()` SHALL call `IHipCrosswalkPort.resolve(command.specificHazardId)` and, inside the same
`transactionRunner.run()` block that inserts the `HazardousEvent`, call
`IHipCrosswalkPort.stamp(saved.id, command.tenantId, <the resolved ids>, tx)` immediately after the
`HazardousEvent` insert succeeds.

#### Scenario: A successful create stamps the resolved HIP ids inside its own transaction

- **GIVEN** a valid `CreateHazardousEventCommand` whose `specificHazardId` resolves to a non-null
  `hipHazardId`/`hipClusterId`/`hipTypeId` crosswalk
- **WHEN** `execute(command)` resolves successfully
- **THEN** `IHipCrosswalkPort.stamp` SHALL have been called exactly once, with the newly-created
  event's id, `command.tenantId`, the resolved ids, and the same `tx` used for the `HazardousEvent`/
  `WorkflowInstance` writes

#### Scenario: A stamp() failure rolls back the whole transaction, including the already-inserted event

- **GIVEN** a valid `CreateHazardousEventCommand`, and a fake `IHipCrosswalkPort.stamp` stubbed to
  reject with a generic `Error`
- **WHEN** `execute(command)` is called
- **THEN** the call SHALL reject with that same `Error`
- **AND** no `HazardousEvent` and no `WorkflowInstance` from this call SHALL exist afterward

### Requirement: File-type attachments are promoted from temp to permanent storage on create

When `CreateHazardousEventUseCase.execute(command)` is called with one or more `File`-type
attachments, each one SHALL be promoted from its staged (temp) location to permanent,
tenant-scoped storage via the shared attachments port as part of the same write, and the
persisted attachment row SHALL carry the resulting permanent `file_key`, not a reference to the
temp location. `Link`-type attachments are not staged files and SHALL be persisted as submitted,
with no storage-port call.

#### Scenario: A File-type attachment is promoted on create

- **GIVEN** a `CreateHazardousEventCommand` whose `attachments` includes one `File`-type item
  referencing a file currently staged in temp storage
- **WHEN** `execute(command)` is called
- **THEN** the file is moved to permanent storage before the use case resolves
- **AND** the persisted attachment row's `file_key` refers to the permanent location, not the
  temp location

#### Scenario: A Link-type attachment requires no file promotion

- **GIVEN** a `CreateHazardousEventCommand` whose `attachments` includes one `Link`-type item
- **WHEN** `execute(command)` is called
- **THEN** the persisted attachment row's `url` matches the submitted value
- **AND** no file-storage promote operation is invoked for that item

#### Scenario: A promotion failure prevents the event from being created with a dangling attachment

- **GIVEN** a `CreateHazardousEventCommand` whose `attachments` includes one `File`-type item
  whose staged file cannot be promoted (e.g. the staged file is missing)
- **WHEN** `execute(command)` is called
- **THEN** the use case rejects
- **AND** no `HazardousEvent` row, `WorkflowInstance` row, or attachment row from this call is
  left persisted
