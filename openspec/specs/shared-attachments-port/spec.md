# shared-attachments-port Specification

## Purpose

Defines a domain-agnostic, cross-domain port for staging, promoting, deleting, and retrieving
attachment files on disk, and the local-disk adapter implementing it, so that Hazardous Events
(now) and future CA domains (Disaster Events/Disaster Records) share one file-storage mechanism
instead of each reimplementing it.

## Requirements

### Requirement: `promote()` moves a staged file into permanent, tenant-scoped storage

`IAttachmentStoragePort.promote(descriptor, staged)` SHALL move the file identified by `staged`
from its staged (temp) location into a permanent location scoped by `descriptor.tenantId`,
`descriptor.ownerType`, and `descriptor.ownerId`, and SHALL return a `fileKey` that uniquely
identifies the file at its new, permanent location. The resulting path MUST be derived solely
from `descriptor` (server-controlled values) and a sanitized basename — never from a
client-supplied path fragment.

#### Scenario: Promoting a staged file succeeds

- **WHEN** `promote()` is called with a `descriptor` for an existing tenant/owner and a `staged`
  reference to a file that exists at its staged location
- **THEN** the file is moved to the permanent, tenant-scoped location for that owner
- **AND** the returned `fileKey` can be used by `retrieve()` to read the same file back

#### Scenario: A client-supplied path fragment cannot escape the tenant's own directory

- **WHEN** `promote()` is called with a `staged.name` or `descriptor.fileName` containing path
  traversal segments (e.g. `../../other-tenant/secret.pdf`)
- **THEN** the resulting permanent file location MUST remain within the calling tenant's own
  directory tree
- **AND** the operation MUST NOT read or write any path outside that tree

### Requirement: `delete()` removes a promoted file from permanent storage

`IAttachmentStoragePort.delete(descriptor, fileKey)` SHALL remove the file identified by
`fileKey` from permanent storage. Deleting a `fileKey` that does not exist on disk SHALL NOT
throw — it is treated as already-deleted (idempotent).

#### Scenario: Deleting an existing file removes it

- **WHEN** `delete()` is called with a `fileKey` referring to a file that exists in permanent
  storage
- **THEN** the file no longer exists at that location afterward
- **AND** `retrieve()` for the same `fileKey` afterward fails with a not-found error

#### Scenario: Deleting a non-existent file is a no-op, not an error

- **WHEN** `delete()` is called with a `fileKey` that does not correspond to any file on disk
- **THEN** the call resolves successfully without throwing

#### Scenario: `delete()` never removes files outside the identified file's own path

- **WHEN** `delete()` is called for one `fileKey` belonging to an owner directory containing
  other, unrelated promoted files
- **THEN** only the file identified by that `fileKey` is removed
- **AND** every other file in the same owner directory remains present afterward

### Requirement: Concurrent callers promoting different files for the same owner do not interfere

Because `promote()`/`delete()` operate on a shared, owner-scoped directory that more than one
async caller can touch before either resolves (e.g. two attachments being promoted for the same
`HazardousEvent` within the same request, or two overlapping save requests), the adapter MUST NOT
perform directory-wide cleanup that removes files it was not explicitly asked to remove.

#### Scenario: Two concurrent promotes for the same owner both succeed independently

- **WHEN** `promote()` is called twice, concurrently, for two different staged files under the
  same `descriptor.ownerType`/`descriptor.ownerId`, before either call resolves
- **THEN** both calls resolve successfully with distinct `fileKey` values
- **AND** both promoted files are present and retrievable afterward
- **AND** neither call's completion removes the file the other call just promoted

#### Scenario: A concurrent promote and delete for the same owner do not corrupt each other's result

- **WHEN** `promote()` for one file and `delete()` for a different, already-promoted file under
  the same owner are called concurrently, before either resolves
- **THEN** the newly promoted file is present and retrievable afterward
- **AND** the deleted file is absent afterward
- **AND** no other file under that owner is affected

### Requirement: `stage()` and `retrieve()` are implemented for interface completeness

`IAttachmentStoragePort.stage()` SHALL write an uploaded file to a temporary, tenant-scoped
location and return a reference usable by a later `promote()` call. `IAttachmentStoragePort
.retrieve()` SHALL return the file content for a given `fileKey`. Both are implemented by the
adapter and covered by this capability's own tests; no production route calls either in this
change (Hazardous Events' existing upload/view routes remain legacy and unchanged) — a future
CA-native upload/view route, or a future domain adopting this port, is the first real caller.

#### Scenario: A staged file can be promoted using the reference `stage()` returned

- **WHEN** `stage()` is called with file content, and the returned reference is passed to
  `promote()`
- **THEN** `promote()` succeeds and the promoted file's content matches what was staged

#### Scenario: Retrieving a promoted file returns its original content

- **WHEN** `retrieve()` is called with the `fileKey` returned by a prior `promote()` call
- **THEN** the returned content is byte-identical to the file that was promoted
