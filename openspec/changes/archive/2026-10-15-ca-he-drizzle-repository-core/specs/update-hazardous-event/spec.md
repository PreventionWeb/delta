## ADDED Requirements

### Requirement: A stale read is rejected via optimistic locking, not silently overwritten

`UpdateHazardousEventUseCase.execute(command)` SHALL persist the merged entity via
`IHazardousEventRepository.update(mergedEntity, existingEvent.updatedAt)` —
`existingEvent.updatedAt` is the value read earlier in the same `execute()` call via
`findById`, before any merge or re-validation. `execute()` SHALL NOT catch
`ConcurrentModificationError` thrown by `update()` — it SHALL propagate unmodified to
`execute()`'s own caller, matching `5j`'s identical "propagate unmodified, no retry loop"
precedent for `ProcessWorkflowActionUseCase` (design.md Decision 6 there).

#### Scenario: update() is called with the previously-read updatedAt, not a freshly-computed one

- **GIVEN** an existing `HazardousEvent` whose stored `updatedAt` is read via `findById`
  at the start of `execute()`
- **WHEN** `execute()` persists the merged entity
- **THEN** `IHazardousEventRepository.update` SHALL be called with that exact
  previously-read `updatedAt` value as its second argument, not any value computed later
  in the same call

#### Scenario: A ConcurrentModificationError from update() propagates unmodified, no retry

- **GIVEN** a fake `IHazardousEventRepository.update` stubbed to reject with
  `ConcurrentModificationError`
- **WHEN** `execute(command)` is called
- **THEN** the call SHALL reject with that same `ConcurrentModificationError`, unmodified
- **AND** `IHazardousEventRepository.update` SHALL have been called exactly once — no
  retry of any kind SHALL be attempted

#### Scenario: Concurrent callers updating the same event, each reading before either writes — the losing call is rejected

- **GIVEN** an existing `HazardousEvent`, and two concurrent `execute()` calls for the
  same `command.id`/`command.tenantId`, each with a different field change, both calling
  `findById` (and so reading the same `updatedAt`) before either call's own `update()`
  resolves
- **WHEN** both calls' `update()` invocations race against the real adapter
- **THEN** exactly one call SHALL resolve successfully
- **AND** the other call SHALL reject with `ConcurrentModificationError`, unmodified,
  from `execute()` itself
- **AND** the final persisted state SHALL reflect only the winning call's change, with no
  silent last-write-wins merge of the two calls' distinct field changes
