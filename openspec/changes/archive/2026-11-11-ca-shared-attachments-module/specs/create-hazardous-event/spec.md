## ADDED Requirements

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
