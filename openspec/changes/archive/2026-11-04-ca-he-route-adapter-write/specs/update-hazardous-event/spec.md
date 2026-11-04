## ADDED Requirements

### Requirement: The event's legacy HIP columns are re-stamped on every update, unconditionally, inside the same transaction

`UpdateHazardousEventUseCase.execute()` SHALL call
`IHipCrosswalkPort.resolve(updatedEvent.specificHazardId)` — the merged, final `specificHazardId`
(the command's new value when provided, otherwise the existing event's own) — and, inside the same
`transactionRunner.run()` block, call `IHipCrosswalkPort.stamp(saved.id, command.tenantId, <the
resolved ids>, tx)` immediately after `IHazardousEventRepository.update()` succeeds. This SHALL run
on every successful update, regardless of whether `command.specificHazardId` was present or
different from the existing value — the HIP crosswalk is always re-derived fresh from whatever
`specificHazardId` the event holds after this update, never left stale.

#### Scenario: An update that does not change specificHazardId still re-stamps

- **GIVEN** an existing event with `specificHazardId: "sh-1"`, and an `UpdateHazardousEventCommand`
  that omits `specificHazardId` entirely (changes only `description`)
- **WHEN** `execute(command)` resolves successfully
- **THEN** `IHipCrosswalkPort.resolve` SHALL have been called with `"sh-1"`
- **AND** `IHipCrosswalkPort.stamp` SHALL have been called exactly once with the freshly-resolved ids

#### Scenario: An update that changes specificHazardId to one whose crosswalk is null clears the stale HIP columns

- **GIVEN** an existing event whose `hip_cluster_id` is currently non-null (from a prior stamp), and
  an `UpdateHazardousEventCommand` with `specificHazardId` set to a hazard whose cluster's
  `sourceRefId` is `null`
- **WHEN** `execute(command)` resolves successfully
- **THEN** `IHipCrosswalkPort.stamp` SHALL have been called with `hipClusterId: null`
- **AND** the event's `hip_cluster_id` column SHALL be `NULL` afterward — not the stale prior value

#### Scenario: The optimistic-lock loser in a concurrent update never stamps

- **GIVEN** two concurrent `execute()` calls against the same event, both reading the same
  `existingEvent.updatedAt`
- **WHEN** the first call's `IHazardousEventRepository.update()` commits, and the second call's
  `update()` is then attempted against the now-stale `expectedUpdatedAt`
- **THEN** the second call's `update()` SHALL reject with `ConcurrentModificationError`
- **AND** the second call's `IHipCrosswalkPort.stamp` SHALL NOT have been called — a row can never
  end up with one caller's content and a different caller's HIP ids

#### Scenario: A stamp() failure rolls back the whole transaction, including the update already applied

- **GIVEN** a valid `UpdateHazardousEventCommand` against an existing event, and a fake
  `IHipCrosswalkPort.stamp` stubbed to reject with a generic `Error`
- **WHEN** `execute(command)` is called
- **THEN** the call SHALL reject with that same `Error`
- **AND** the event's row SHALL be unchanged from before this call (the update itself rolls back too)
