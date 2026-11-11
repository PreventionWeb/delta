## ADDED Requirements

### Requirement: HE detail page renders attachments as a Title/Tags/File-URL table

`HazardousEventDetailPage` SHALL render a non-empty `data.attachments` collection as a table with
exactly three columns, in this order: Title, Tags, File/URL — built from the design-system
`Table`/`TableColumn`/`TableRow`/`TableCell` components, matching legacy's own equivalent
read-only view (`app/frontend/attachmentsView.tsx`) with the deviations stated below. This
replaces the previous title-only `<ul>`/`<li>` rendering. The existing empty-state branch
(`data.attachments.length === 0` renders `t("detail.attachments_none")`) SHALL be unchanged.

#### Scenario: A non-empty attachments collection renders as a table, not a list

- **GIVEN** a detail page rendered with one or more attachments
- **WHEN** the page renders
- **THEN** the attachments SHALL render inside a table with column headers for Title, Tags, and
  File/URL
- **AND** no bare `<ul>`/`<li>` attachments markup SHALL be present

#### Scenario: The empty-attachments state is unchanged

- **GIVEN** a detail page rendered with `data.attachments: []`
- **WHEN** the page renders
- **THEN** the translated string for `detail.attachments_none` SHALL be present
- **AND** no attachments table SHALL be rendered

### Requirement: An attachment's tags render joined by name, with a dash fallback

Each attachment row's Tags cell SHALL render `attachment.tag`'s entries joined by their `name`
field, comma-separated. When `attachment.tag` is `null` or an empty array, the cell SHALL render
`"—"`, matching this same page's own existing convention for a null nullable field (not legacy's
`"N/A"` string).

#### Scenario: An attachment with tags renders them joined by name

- **GIVEN** an attachment with `tag: [{id: "t1", name: "Flood"}, {id: "t2", name: "Urban"}]`
- **WHEN** the page renders
- **THEN** the attachment's Tags cell SHALL contain "Flood, Urban"

#### Scenario: An attachment with no tags renders a dash

- **GIVEN** an attachment with `tag: null`
- **WHEN** the page renders
- **THEN** the attachment's Tags cell SHALL contain "—"
- **AND** the cell SHALL NOT contain "N/A"

### Requirement: A File-type attachment renders a working download link using fileKey for the href and fileName for the display text

A `type: "File"` attachment's File/URL cell SHALL render an `<a>` element whose `href` resolves
to the existing `/hazardous-event/file-viewer` route with a `name` query value built from the
event's own `id` and the attachment's `fileKey` (the on-disk basename), and whose visible text
is `attachment.fileName` (the human-readable display name) — never the reverse. The link SHALL
carry `target="_blank" rel="noopener noreferrer"`.

#### Scenario: A File-type attachment's link targets fileKey and displays fileName

- **GIVEN** a detail page rendered for event id `"evt-1"` with an attachment
  `{type: "File", fileKey: "abc123__survey.jpg", fileName: "survey.jpg"}`
- **WHEN** the page renders
- **THEN** the rendered `<a>` element's `href` SHALL contain `evt-1/abc123__survey.jpg`
- **AND** the rendered `<a>` element's visible text SHALL be "survey.jpg"
- **AND** the `<a>` element SHALL have `target="_blank"` and `rel="noopener noreferrer"`

### Requirement: A Link-type attachment renders a working hyperlink to its URL

A `type: "Link"` attachment's File/URL cell SHALL render an `<a>` element whose `href` is
`attachment.url` and whose visible text is `attachment.url`, carrying
`target="_blank" rel="noopener noreferrer"`.

#### Scenario: A Link-type attachment's link targets its own url

- **GIVEN** an attachment `{type: "Link", url: "https://example.org/report"}`
- **WHEN** the page renders
- **THEN** the rendered `<a>` element's `href` SHALL be "https://example.org/report"
- **AND** the `<a>` element SHALL have `target="_blank"` and `rel="noopener noreferrer"`
