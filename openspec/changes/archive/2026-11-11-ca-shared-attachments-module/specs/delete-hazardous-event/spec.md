## ADDED Requirements

### Requirement: Deleting a HazardousEvent deletes its File-type attachments' on-disk files

When `DeleteHazardousEventUseCase.execute(command)` proceeds to delete a `HazardousEvent` (i.e.
no blocking dependent exists), every `File`-type attachment belonging to that event SHALL have
its on-disk file deleted via the shared attachments port, in addition to the cascade
deletion of the `hazardous_event_attachment` rows themselves. `Link`-type attachments require no
file-storage call.

#### Scenario: Deleting an event with File-type attachments deletes their files

- **GIVEN** a `HazardousEvent` with one `File`-type attachment already promoted to permanent
  storage, and no blocking dependents
- **WHEN** `execute(command)` is called
- **THEN** the `HazardousEvent` and its attachment row are deleted
- **AND** the attachment's on-disk file is deleted via the shared attachments port

#### Scenario: Deleting an event with only Link-type attachments requires no file-storage call

- **GIVEN** a `HazardousEvent` with one `Link`-type attachment, and no blocking dependents
- **WHEN** `execute(command)` is called
- **THEN** the `HazardousEvent` and its attachment row are deleted
- **AND** no file-storage delete operation is invoked

#### Scenario: A blocked delete (dependents exist) does not delete any attachment file

- **GIVEN** a `HazardousEvent` with one `File`-type attachment and at least one blocking
  dependent (e.g. a referencing Disaster Event)
- **WHEN** `execute(command)` is called
- **THEN** the call rejects with `ConflictError`
- **AND** the attachment row and its on-disk file both remain untouched
