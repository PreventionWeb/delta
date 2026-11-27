## ADDED Requirements

### Requirement: A Link attachment with a non-http(s) URL is refused with a translated field error before any write

The he-preview create and edit actions (`new.tsx`, `edit.$id.tsx`) SHALL check every Link-type
attachment item parsed from the submitted form, using the same write-time URL-scheme rule as the
CSV import. The URL is accepted only when it is an absolute URL whose scheme is `http` or
`https`. The check SHALL run after the form is parsed and before any workflow guard that can
write, and before `CreateHazardousEventUseCase` or `UpdateHazardousEventUseCase` is called.

When any Link item fails, including one with an empty URL, the action MUST:

- return `{ success: false, fieldErrors: { attachments: [message] } }`, where `message` is the
  `hazardous-events` key `form.attachments_invalid_url` translated into the request's language
  (EN and FR provided);
- not call any use case, write any row, or promote or delete any file;
- not call `throwHazardousEventLoaderError`.

File-type items are not affected by this rule. The render-time check that drops a non-http(s)
`href` on the detail page SHALL stay in place as defence in depth.

#### Scenario: A `javascript:` link is refused on create

- **WHEN** an EditData user submits the create form with one Link attachment whose URL is
  `javascript:alert(1)`
- **THEN** the action returns `fieldErrors.attachments` holding the translated
  `form.attachments_invalid_url` message
- **AND** no hazardous event, workflow instance or attachment row is created

#### Scenario: A `data:` link is refused on edit and the event is unchanged

- **GIVEN** an existing editable event E
- **WHEN** the edit form is submitted for E with a Link attachment whose URL is
  `data:text/html,x`
- **THEN** the action returns `fieldErrors.attachments` with the translated message
- **AND** E's fields, `updated_at` and attachments are unchanged

#### Scenario: An empty link URL is refused

- **WHEN** the create form is submitted with a Link attachment whose URL is empty
- **THEN** the action returns `fieldErrors.attachments` with the translated message and nothing
  is written

#### Scenario: The French message is shown to a French user

- **WHEN** a user on `/fr/he-preview/new` submits a Link attachment with an `ftp://` URL
- **THEN** the field error is the French text of `form.attachments_invalid_url`

#### Scenario: An https link still saves

- **WHEN** the create form is submitted with a Link attachment `https://example.com/report`
- **THEN** the event is created with that Link attachment, as before

#### Scenario: Saving an event that already holds an unsafe link is refused until it is fixed

- **GIVEN** an event E whose stored attachments include a Link `ftp://example.com/f`, written
  before this rule existed
- **WHEN** the edit form is submitted for E with that attachment unchanged
- **THEN** the action returns `fieldErrors.attachments` with the translated message and E is
  unchanged

### Requirement: A malformed attachment tag is refused with a translated field error before any write

The he-preview create and edit actions SHALL refuse an attachment whose `tag` is a list with an
element that is not an object with string `id` and `name`, with
`{ success: false, fieldErrors: { attachments: [message] } }`, where `message` is the translated
`hazardous-events` key `form.attachments_invalid_tag`, before any use case is called. The URL and
tag rules come from the shared application rules, which `CreateHazardousEventUseCase` and
`UpdateHazardousEventUseCase` also enforce for every caller.

#### Scenario: A tampered tag is refused on edit

- **WHEN** the edit form is submitted with an attachment whose `tag` is `[null]`
- **THEN** the action returns `fieldErrors.attachments` with the translated tag message and the
  event is unchanged
