## ADDED Requirements

### Requirement: Attachment parsing accepts the real widget output shape

`parseHazardousEventFormData.server.ts`'s attachment parsing SHALL accept items shaped as the
`AttachmentsFormView`/`ContentRepeater` widget actually submits them — `{id, title, tag,
file_option: "File" | "Link", file: {name, tenantPath, content_type}, url}` — rather than
requiring the previously-assumed `{id, title, fileKey, fileName, fileType, fileSize}` shape that
the widget never produces. An item whose `file_option` is `"File"` SHALL be parsed using its
`file` sub-object; an item whose `file_option` is `"Link"` SHALL be parsed using its `url` field.

#### Scenario: A real File-type widget item is parsed, not dropped

- **WHEN** the submitted `attachments` field contains an item shaped `{id, title, tag,
  file_option: "File", file: {name, tenantPath, content_type}}`
- **THEN** the parsed result includes that attachment with its file metadata populated
- **AND** the attachment is not silently filtered out

#### Scenario: A real Link-type widget item is parsed, not dropped

- **WHEN** the submitted `attachments` field contains an item shaped `{id, title, tag,
  file_option: "Link", url}`
- **THEN** the parsed result includes that attachment with its `url` populated

### Requirement: Stale fields from a type switch are discarded, not persisted

Because the widget's File/Link type toggle does not clear the other type's field when the user
switches, parsing SHALL derive the persisted field set from the item's own `file_option` and
discard whichever field set does not match it, rather than persisting both.

#### Scenario: A Link-type item with a stale leftover file value does not persist file fields

- **WHEN** the submitted item has `file_option: "Link"`, a populated `url`, and a leftover
  `file` object from before the user switched the type
- **THEN** the parsed result for that attachment has its file-specific fields absent/null
- **AND** its `url` is populated

#### Scenario: A File-type item with a stale leftover url value does not persist url

- **WHEN** the submitted item has `file_option: "File"`, a populated `file` object, and a
  leftover `url` value from before the user switched the type
- **THEN** the parsed result for that attachment has `url` absent/null
- **AND** its file-specific fields are populated

### Requirement: The widget's client-supplied attachment id is not trusted as a persisted identity

The widget mints a new item's `id` client-side as a non-UUID string. Parsing SHALL NOT require or
rely on that value being a valid UUID, since the attachment's persisted identity is minted
server-side at write time (see `create-hazardous-event`/`update-hazardous-event`).

#### Scenario: A non-UUID client-supplied id does not cause the attachment to be rejected

- **WHEN** the submitted item's `id` is a non-UUID string (e.g. a millisecond timestamp)
- **THEN** the attachment is still parsed and included in the result
