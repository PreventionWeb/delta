## MODIFIED Requirements

### Requirement: An optional caller transaction lets a batch caller own the commit

`UpdateHazardousEventCommand` SHALL accept an optional `tx?: Tx`. When `tx` is given,
`UpdateHazardousEventUseCase.execute` MUST:

- run every pre-write read on `tx` (NOD-12): the existing event `findById`, the workflow lookup
  (`GetWorkflowInstanceByEntityUseCase` with `tx`), the taxonomy valid-id reads,
  `hipCrosswalkPort.resolve`, and the cause `findById` and `findReachableEdgesFrom`. That way an
  event written earlier in the same caller transaction is visible, and no second connection is
  needed;
- run its write sequence through `ITransactionRunner.run(fn, tx)`;
- still log `hazardous_event.updated` (and `spatial_observation.recorded`) once, as without `tx`
  (user decision, 2026-11-25), at savepoint release, before the caller commits;
- **not** delete the on-disk files of File-type attachments that this update removes. It MUST
  return their file keys in the result as `fileKeysToDelete`, so the caller deletes them only
  after its own transaction commits (roadmap 6d-2, NOD-7). Deleting them inside the savepoint
  would remove the files before the caller commits, so a later rollback would leave rows that
  point at deleted files.

Without `tx`, behaviour and logging are unchanged: removed files are deleted as the last step of
the use case's own transaction, and `fileKeysToDelete` is empty.

Optimistic locking, the audit row, the HIP re-stamp and the attachment promotion rules still
apply. A rejection still throws. It never returns an `ok: false` value that a caller could commit
past (the DEF-047 confirmation).

#### Scenario: An update inside a caller transaction is undone by the caller's rollback

- **GIVEN** an existing event E and a caller transaction `outer`
- **WHEN** `execute({ id: E, description: "new", tx: outer, ... })` resolves and the caller then
  rolls back `outer`
- **THEN** E's `description` and `updated_at` are unchanged
- **AND** no new audit row exists for E

#### Scenario: The success log is still written when a caller transaction is given

- **WHEN** `execute({ id: E, description: "new", tx: outer, ... })` resolves
- **THEN** one `hazardous_event.updated` line is logged for E

#### Scenario: A rejected update throws inside the caller transaction

- **GIVEN** a caller transaction `outer`
- **WHEN** `execute({ id: E, startDate: "2026-06-01", endDate: "2026-01-01", tx: outer, ... })`
  is called (the entity rejects a start after the end; a malformed date is caught earlier, by
  the CSV mapper)
- **THEN** it rejects with `ValidationError`
- **AND** `outer` is still usable for further statements

#### Scenario: Two caller transactions updating the same event

- **GIVEN** event E and two caller transactions that both read E before either writes
- **WHEN** both call `execute` for E concurrently
- **THEN** at most one update to E commits
- **AND** the other rejects with `ConcurrentModificationError` (the existing optimistic lock)

#### Scenario: Removed files are returned, not deleted, under a caller transaction

- **GIVEN** an event E with a promoted File-type attachment K, a storage port that records its
  calls, and a caller transaction `outer`
- **WHEN** `execute({ id: E, attachments: [], tx: outer, ... })` resolves
- **THEN** the result's `fileKeysToDelete` is `[K]`
- **AND** the storage port recorded no `delete` call
- **AND** when the caller then rolls back `outer`, E still lists K and file K still exists

#### Scenario: Without a caller transaction removed files are still deleted

- **GIVEN** an event E with a promoted File-type attachment K
- **WHEN** `execute({ id: E, attachments: [], ... })` resolves without `tx`
- **THEN** file K is deleted through the storage port, and `fileKeysToDelete` is `[]`

### Requirement: File-type attachments removed by an update are deleted from disk

Because `attachments` is a full-replace collection field (see "Update an existing event's fields
via a partial-patch command"), any existing `File`-type attachment whose `file_key` is not
present in the new `command.attachments` collection SHALL have its on-disk file deleted via the
shared attachments port. Without a caller `tx` this happens as part of the same write, as its
last step. With a caller `tx` the use case does not delete the file. It returns the key in
`fileKeysToDelete`, and the caller deletes it after its own commit (see "An optional caller
transaction lets a batch caller own the commit"). `Link`-type attachments removed this way
require no file-storage call.

#### Scenario: Removing a File-type attachment deletes its on-disk file

- **GIVEN** an existing `HazardousEvent` with one `File`-type attachment already promoted to
  permanent storage
- **WHEN** `execute(command)` is called without `tx`, with `command.attachments` present and not
  containing that attachment
- **THEN** the attachment row is removed
- **AND** its on-disk file is deleted via the shared attachments port

#### Scenario: Under a caller transaction the removed file is returned, not deleted

- **GIVEN** an existing `HazardousEvent` with one promoted `File`-type attachment K
- **WHEN** `execute(command)` is called with a caller `tx` and `command.attachments` not
  containing K
- **THEN** the attachment row is removed within `tx`
- **AND** no file-storage delete operation is invoked, and the result's `fileKeysToDelete` is `[K]`

#### Scenario: Removing a Link-type attachment requires no file-storage call

- **GIVEN** an existing `HazardousEvent` with one `Link`-type attachment
- **WHEN** `execute(command)` is called with `command.attachments` present and not containing
  that attachment
- **THEN** the attachment row is removed
- **AND** no file-storage delete operation is invoked

#### Scenario: An absent attachments field leaves existing files untouched

- **GIVEN** an existing `HazardousEvent` with one `File`-type attachment already promoted to
  permanent storage
- **WHEN** `execute(command)` is called with `command.attachments` absent (`undefined`)
- **THEN** the existing attachment row and its on-disk file are both left unchanged

## ADDED Requirements

### Requirement: Attachment rules are enforced for every caller before any write

When `command.attachments` is present, `UpdateHazardousEventUseCase.execute` SHALL reject the
command with `ValidationError` (context `field: "attachments"`) before any read or write when an
item is a Link with a URL that is not absolute `http`/`https`, or has a `tag` that is neither
`null` nor a list of objects whose `id` and `name` are strings. An absent `attachments` field
leaves stored attachments untouched and is not checked, so existing rows still rehydrate.

#### Scenario: A data: link is rejected by the use case

- **WHEN** `execute` is called with a Link attachment `data:text/html,x`
- **THEN** it rejects with `ValidationError` on `attachments` and nothing is written

### Requirement: An optional expected version rejects a change based on a stale read

`UpdateHazardousEventCommand` SHALL accept an optional `expectedUpdatedAt: Date | null`, the
`updatedAt` the caller based its change on. When it is given and differs from the stored
`updatedAt` (to the millisecond, `null` included), `execute` MUST reject with
`ConcurrentModificationError` before any write. Without it, the existing optimistic lock against
the use case's own read is unchanged. The CSV import passes the export projection's `updatedAt`,
so two overlapping imports cannot both commit a change to one event.

#### Scenario: A change based on an older read is rejected

- **GIVEN** an event E whose `updatedAt` is T2
- **WHEN** `execute` is called for E with `expectedUpdatedAt` T1 (earlier than T2)
- **THEN** it rejects with `ConcurrentModificationError` and nothing is written
