## ADDED Requirements

### Requirement: Attachment rules are enforced for every caller before any write

`CreateHazardousEventUseCase.execute` SHALL reject the command with `ValidationError` (context
`field: "attachments"`) before any read or write when an item of `command.attachments`:

- is a Link whose URL is not an absolute `http` or `https` URL (the shared
  `isAllowedAttachmentUrl` rule), including an empty URL;
- has a `tag` that is neither `null` nor a list of objects whose `id` and `name` are strings (the
  shared `isAllowedAttachmentTag` rule).

The rule lives in the application layer, so every adapter (the he-preview form, the CSV import,
a future API) gets it. Adapters MAY check earlier to give a translated message.

#### Scenario: A javascript: link is rejected by the use case

- **WHEN** `execute` is called with a Link attachment whose URL is `javascript:alert(1)`
- **THEN** it rejects with `ValidationError` on `attachments` and nothing is written

#### Scenario: A malformed tag is rejected by the use case

- **WHEN** `execute` is called with an attachment whose `tag` is `[null]`
- **THEN** it rejects with `ValidationError` on `attachments` and nothing is written
