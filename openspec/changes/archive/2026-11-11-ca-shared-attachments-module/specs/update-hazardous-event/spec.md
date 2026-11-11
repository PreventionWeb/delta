## ADDED Requirements

### Requirement: Newly-added File-type attachments are promoted on update

When `UpdateHazardousEventUseCase.execute(command)` is called with a present `attachments`
collection containing one or more new `File`-type items, each new item SHALL be promoted from
its staged (temp) location to permanent, tenant-scoped storage via the shared
attachments port as part of the same write, matching `create-hazardous-event`'s own
promotion behavior.

#### Scenario: A newly-added File-type attachment is promoted on update

- **GIVEN** an existing `HazardousEvent` with no attachments
- **WHEN** `execute(command)` is called with `command.attachments` containing one new
  `File`-type item referencing a file currently staged in temp storage
- **THEN** the file is moved to permanent storage before the use case resolves
- **AND** the persisted attachment row's `file_key` refers to the permanent location

### Requirement: File-type attachments removed by an update are deleted from disk

Because `attachments` is a full-replace collection field (see "Update an existing event's fields
via a partial-patch command"), any existing `File`-type attachment whose `file_key` is not
present in the new `command.attachments` collection SHALL have its on-disk file deleted via the
shared attachments port as part of the same write. `Link`-type attachments removed this
way require no file-storage call.

#### Scenario: Removing a File-type attachment deletes its on-disk file

- **GIVEN** an existing `HazardousEvent` with one `File`-type attachment already promoted to
  permanent storage
- **WHEN** `execute(command)` is called with `command.attachments` present and not containing
  that attachment
- **THEN** the attachment row is removed
- **AND** its on-disk file is deleted via the shared attachments port

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
