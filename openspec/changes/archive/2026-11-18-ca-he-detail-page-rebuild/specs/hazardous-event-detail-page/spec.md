## Purpose

Specifies the observable Card-sectioned structure and content of CA's Hazardous Event detail page
at `app/domains/hazardous-events/presentation/web/HazardousEventDetailPage.tsx`, replacing its
prior flat field-list structure and adding its audit-log history section (`DEF-058`, `DEF-059`).

## MODIFIED Requirements

### Requirement: The detail page renders six Card sections in a fixed order

`HazardousEventDetailPage` SHALL render its content as six independent sections, in this order:
Basic information, Hazard details, Location, Attachments, Linked events, Audit log history. The
page SHALL NOT render an "Edit" link or an "Add hazardous event caused by this event" link, for
any role or `workflowStatus`, matching legacy's real current `HazardousEventView` component
(`app/frontend/events/hazardeventform.tsx:679-721`), which has neither affordance on this page
(`hideEditButton={true}` at line 693, honored unconditionally by
`app/frontend/components/data-collection/View.tsx:624`; its `extraInfo`/`extraActions` slots carry
only the "Back to Hazardous events" link). Edit remains reachable from the Hazardous events list
page's own row actions; "Add hazardous event caused by this event" has no other entry point on
this page's redesign. The back-link to the Hazardous events list MUST render with the visible text
"Back to Hazardous events" (not the page's own title text), presented as a bordered, button-styled
control with a leading arrow icon — matching legacy's own real current rendering of this control —
and visually separated from the Basic information Card below it, not flush against it.

#### Scenario: Section order on a fully-populated record

- **WHEN** the page renders for a record with data in every section
- **THEN** the sections MUST appear top-to-bottom in exactly this order: Basic information,
  Hazard details, Location, Attachments, Linked events, Audit log history

#### Scenario: Consecutive Card sections render with even spacing between them

- **WHEN** the page renders for a record with data in every section
- **THEN** every two consecutive Card sections MUST be separated by this page's own established
  Card-to-Card spacing convention (the same convention already used to separate the back-link from
  the Basic information Card above it)
- **AND** no Card section MUST carry its own additional trailing gap that stacks with the next
  Card's own leading gap, producing an uneven or doubled gap between any pair

#### Scenario: Existing navigation chrome is unchanged

- **WHEN** the page renders
- **THEN** a link to the Hazardous events list MUST still render above the sectioned content (see
  the two scenarios below for its required text, appearance, and spacing)
- **AND** no link to `he-preview/edit/{id}` MUST render
- **AND** no link to `he-preview/new?parent={id}` MUST render

#### Scenario: The back-link renders as a button with an arrow icon and the corrected label text

- **WHEN** the page renders
- **THEN** the link to the Hazardous events list MUST display the visible text "Back to Hazardous
  events", not the page's own title text
- **AND** it MUST be visually presented as a bordered, padded, button-like control, not as a plain
  inline text link
- **AND** it MUST render a leading arrow icon before the text

#### Scenario: The back-link is visually separated from the Basic information Card below it

- **WHEN** the page renders
- **THEN** the back-link control MUST be separated from the Basic information Card below it by
  this page's own established Card-to-Card spacing convention
- **AND** it MUST NOT render flush against the Basic information Card's top edge

#### Scenario: An EditData role on an editable status still sees neither link

- **GIVEN** a role with `EditData` permission (e.g. `"admin"`) and a record with an editable
  `workflowStatus` (e.g. `"DRAFT"`)
- **WHEN** the page renders
- **THEN** no link to `he-preview/edit/{id}` MUST render
- **AND** no link to `he-preview/new?parent={id}` MUST render

### Requirement: Each Card section renders a header icon matching legacy's own icon set, sized and
    spaced to match its own legacy group

`HazardousEventDetailPage`, `HazardousEventAttachmentsCard`, `HazardousEventLinkedEventsCard`, and
`HazardousEventAuditLogCard` SHALL each render a leading icon in their Card's header, reproducing
legacy's own current icon for that section, alongside the section's title text. Each Card's title
text SHALL render at the size legacy uses for that Card's own group (Basic information and Hazard
details form one group; Location, Attachments, Linked events, and Audit log history form the
other), with the icon vertically centered against that title rather than against an unrelated,
taller line-box. Each Card's header row SHALL be visually separated from its own content by the
same gap legacy uses for that Card's group.

#### Scenario: Each of the six Cards renders its matching icon

- **WHEN** the page renders for any record
- **THEN** the Basic information Card header MUST render the "pi-info-circle" icon
- **AND** the Hazard details Card header MUST render the "pi-map-marker" icon
- **AND** the Location Card header MUST render the "pi-map-marker" icon
- **AND** the Attachments Card header MUST render the "pi-paperclip" icon
- **AND** the Linked events Card header MUST render the "pi-link" icon
- **AND** the Audit log history Card header MUST render the "pi-history" icon

#### Scenario: The icon renders alongside the title, in legacy's accent color, not replacing it

- **WHEN** any Card header renders its icon
- **THEN** the icon MUST render in legacy's blue accent color
- **AND** the Card's title text MUST still render alongside the icon

#### Scenario: The icon vertically aligns with its title text, not with an oversized line-box

- **WHEN** any Card header renders its icon alongside its title
- **THEN** the icon and the title text MUST appear vertically centered against each other
- **AND** the title MUST NOT render inside a line-box so tall that the icon reads as misaligned
  against it

#### Scenario: Basic information and Hazard details render their titles at legacy's tighter size

- **WHEN** the Basic information Card or the Hazard details Card renders its header
- **THEN** its title text MUST render at legacy's tighter title size for this group, distinct from
  the other four Cards' title size

#### Scenario: Location, Attachments, Linked events, and Audit log history render their titles at
    legacy's other size

- **WHEN** the Location, Attachments, Linked events, or Audit log history Card renders its header
- **THEN** its title text MUST render at legacy's title size for this group, distinct from Basic
  information's and Hazard details' title size

#### Scenario: Each Card's header is separated from its content by its own group's legacy gap

- **WHEN** any of the six Cards renders its header above its content
- **THEN** the header row MUST be visually separated from the content below it by a gap, not render
  flush against it

### Requirement: Basic information and Hazard details field grids match legacy's spacing

`HazardousEventDetailPage`'s Basic information Card and Hazard details Card SHALL lay out their
paired fields using legacy's own two-column grid spacing, not the page's older, tighter shared
grid system.

#### Scenario: Basic information's fields render in legacy's wider two-column grid

- **WHEN** the Basic information Card renders on a medium-or-wider viewport
- **THEN** its fields MUST render in two columns with the same, wider inter-field spacing legacy
  uses for this Card, not the narrower spacing of the page's older shared grid system

#### Scenario: Hazard details' first grid groups Hazard type, Hazard cluster, and Specific hazard

- **WHEN** the Hazard details Card renders on a medium-or-wider viewport
- **THEN** the Hazard type, Hazard cluster, and Specific hazard fields MUST render together in one
  two-column grid, using the same wider inter-field spacing as Basic information
- **AND** the Start date/End date field pair MUST render in a second, separate two-column grid,
  using the same wider inter-field spacing as Basic information

### Requirement: Hazard details field labels match legacy's current wording

The Hazard details Card SHALL label its Type, Cluster, and Specific hazard fields with legacy's
current rendered label text, not an older, differently-worded label set.

#### Scenario: Hazard details renders legacy's current field labels

- **WHEN** the Hazard details Card renders
- **THEN** the hazard-type field MUST be labeled "Hazard type"
- **AND** the hazard-cluster field MUST be labeled "Hazard cluster"
- **AND** the specific-hazard field MUST be labeled "Specific hazard"

### Requirement: Attachments section keeps CA's existing attachment data source

The Attachments section SHALL continue to render from CA's existing attachment DTO/mapper
(unrelated to legacy's JSONB `attachments` column), using the existing design-system
`Table`/`TableColumn`/`TableCell` components.

#### Scenario: A record with attachments

- **WHEN** the record has one or more attachments resolved via CA's existing attachments pipeline
- **THEN** the Attachments section MUST render a table with Title, Tags, and File/URL columns,
  unchanged from the current page's existing attachment rendering logic

#### Scenario: A record with no attachments

- **WHEN** the record has no attachments
- **THEN** the Attachments section MUST render an empty-state message

#### Scenario: An attachment with one or more tags renders each tag as a distinct visual pill

- **WHEN** an attachment has one or more tags
- **THEN** the Tags column MUST render each tag as its own visually distinct pill, not as a single
  comma-joined text string

#### Scenario: A file-type attachment's link indicates its file type and, when known, its size

- **WHEN** an attachment is a file (not a URL link) and the resolved link is rendered
- **THEN** the File/URL column MUST render a leading icon indicating the file's type
- **AND** it MUST render a trailing file-size indicator when the file's size is a known, positive
  value
- **AND** it MUST render neither a file-size indicator nor a misleading one when the size is not a
  known positive value

#### Scenario: A link-type attachment's rendering is unaffected by the file-type icon/size change

- **WHEN** an attachment is a URL link (not a file)
- **THEN** the File/URL column's existing link rendering (its URL text and href) MUST remain
  unchanged

#### Scenario: An attachment link renders with legacy's own link styling

- **WHEN** either a file-type or a link-type attachment's anchor renders
- **THEN** it MUST render with legacy's own link text color, weight, and hover-state styling, not
  with layout-only styling that reads as plain, unstyled text

#### Scenario: Attachments table cells use the same comfortable padding convention as the Audit
    log history table

- **WHEN** the Attachments table renders
- **THEN** its cells MUST use the same, more spacious padding convention as the Audit log history
  table's own cells, rather than each table defining its own separate padding

#### Scenario: A link-type attachment with an unsafe URL scheme does not render as a navigable link

- **GIVEN** a link-type attachment whose URL does not use the `http` or `https` scheme, or whose
  URL cannot be parsed as a valid URL
- **WHEN** that attachment's row renders
- **THEN** its anchor MUST NOT navigate anywhere (it MUST render with no `href`, or another
  non-navigating fallback), rather than passing the unsafe value through to a real navigation
  target
- **AND** this MUST NOT affect any other, safely-schemed attachment link on the same page

### Requirement: Basic information and Hazard details sections preserve existing field content

The rebuild SHALL NOT drop any field currently shown on the flat page; it SHALL regroup them into
the Basic information and Hazard details sections.

#### Scenario: All current fields remain present

- **WHEN** the page renders for a record with every optional field populated
- **THEN** Record originator, Hazardous event status, Magnitude, Data source, UUID, Created at,
  Updated at, and Record status MUST appear in Basic information, in that order (Record status is
  the `workflowStatus`/DEF-031 approval-status pill rendered via `workflowStatusDisplay` — distinct
  from Hazardous event status's ongoing/passed/forecasted value — rendered in legacy by a wrapper
  component one level above `HazardousEventReviewStep.tsx`, confirmed at
  `hazardeventform.tsx:686`, not by the Card itself; it is a deliberate CA-only addition, not a
  parity gap, and now renders last rather than third so the other seven fields keep legacy's exact
  two-column grid alignment)
- **AND** Hazard type, Hazard cluster, Specific hazard, Start date, End date, National
  specification, Description, and Chains explanation MUST appear in Hazard details

### Requirement: Audit log history section renders tenant-scoped audit rows for this record

The detail page SHALL render an Audit log history section populated from the audit-log read query
scoped to this record and the current tenant, newest first, using the same table design and
comfortable cell-padding convention as the Attachments section.

#### Scenario: A record with audit history

- **WHEN** one or more `audit_logs` rows exist for this record's `table_name`/`record_id` within
  the current `countryAccountsId`
- **THEN** the Audit log history section MUST render a table with Action taken, By, Organisation,
  Date, and Time columns, ordered newest-first

#### Scenario: A record with no audit history

- **WHEN** no `audit_logs` rows exist for this record
- **THEN** the Audit log history section MUST render an empty-state message rather than an empty
  table

#### Scenario: An audit action string outside the known Create/Update/Delete-object forms

- **WHEN** an audit row's `action` value is not one of the `Create <object>`/`Update <object>`/
  `Delete <object>` forms this page already translates (for example a workflow-transition action
  such as `submit-draft`)
- **THEN** the Action taken cell MUST render a humanized form of the raw action string rather than
  the raw kebab/lowercase value verbatim

#### Scenario: A Create/Update/Delete-with-object action renders in the viewer's own language

- **WHEN** an audit row's `action` value is one of the `Create <object>`/`Update <object>`/
  `Delete <object>` forms
- **THEN** the Action taken cell MUST render that action translated into the viewer's current
  language, not the literal, untranslated English value, matching the translation behavior this
  page's audit log has always had

### Requirement: Linked events section renders both resolved cause and effect relationships

The Linked events section SHALL render the record's resolved `cause` (parent) relationship under
a "Caused by" entry, and its resolved `effects` (children) relationship under a "Causing" entry,
matching legacy's real two-direction behavior.

#### Scenario: A record with a resolved cause

- **WHEN** `cause` is non-null
- **THEN** the Linked events section MUST render a "Caused by" entry linking to the cause event's
  own detail page

#### Scenario: A record with no resolved cause

- **WHEN** `cause` is null
- **THEN** the "Caused by" entry MUST render the literal text "No cause recorded"

#### Scenario: A record with one or more resolved effects

- **WHEN** `effects` is a non-empty array
- **THEN** the "Causing" entry MUST render one linked-event entry per resolved effect, each
  linking to that effect event's own detail page

#### Scenario: A record with no resolved effects

- **WHEN** `effects` is an empty array
- **THEN** the "Causing" entry MUST render the literal text "No effects recorded"

#### Scenario: An effect edge whose target event cannot be resolved is omitted, not fatal

- **GIVEN** an effect edge exists but its target event cannot be found (e.g. a dangling reference)
- **WHEN** the page's data is resolved
- **THEN** that one effect MUST be omitted from the "Causing" entry rather than failing the whole
  page load, mirroring how an unresolvable `cause` already degrades to `null` rather than
  throwing

#### Scenario: Each linked-event entry renders as its own bordered card, not a bare inline link

- **WHEN** a "Caused by" or "Causing" entry renders a resolved linked event
- **THEN** that entry MUST render as its own visually bordered block, containing a title and, when
  available, a subtitle line, not as a bare inline text link with no visual boundary

#### Scenario: A linked-event entry's subtitle surfaces its taxonomy code and short identifier

- **WHEN** a linked-event entry's underlying event has a resolved specific-hazard code
- **THEN** the entry's subtitle MUST include that code
- **AND** the subtitle MUST include a short form of the linked event's own identifier
- **AND** when CA's own `causalityExplanation` is present for that entry, it MUST still render
  somewhere on the entry, not be dropped

#### Scenario: A linked-event entry with no resolved display name falls back to its identifier

- **WHEN** a linked-event entry's underlying event has no resolved display name
- **THEN** the entry's title MUST render a fallback built from that event's own identifier, rather
  than rendering empty

#### Scenario: The "Caused by" and "Causing" entries are grouped and spaced distinctly

- **WHEN** the Linked events section renders
- **THEN** each of the "Caused by" and "Causing" entries MUST render its own label tightly bound to
  its own content, not separated from its content by the same gap used between the two entries
- **AND** the "Caused by" group and the "Causing" group MUST be evenly spaced from each other

#### Scenario: The "Caused by" and "Causing" group labels render without a trailing colon

- **WHEN** the Linked events section renders its "Caused by" and "Causing" group labels
- **THEN** each label MUST render as its own styled text, matching legacy's own label styling for
  this section
- **AND** neither label MUST render with a trailing colon

## ADDED Requirements

### Requirement: Card sections render with visible depth

Every rendered Card section SHALL present a visible shadow/elevation effect beneath it, matching
legacy's own Card depth, rather than appearing perfectly flat against the page background.

#### Scenario: A Card section renders with a visible shadow

- **WHEN** any of the six Card sections renders
- **THEN** it MUST render with a visible drop-shadow/elevation effect, not with no shadow at all

### Requirement: Hazard details' standalone content blocks render with even, legacy-matching
    spacing

The Hazard details Card SHALL space its two field grids and its standalone fields (National
specification, Description, Chains explanation, when populated) evenly from one another, using
the same wide spacing scale as its own two-column field grids, rather than some of these blocks
rendering flush against their neighbors with no gap.

#### Scenario: Hazard details' standalone fields are evenly spaced from the grids and each other

- **WHEN** the Hazard details Card renders for a record with National specification, Description,
  and Chains explanation all populated
- **THEN** the first field grid, the second field grid, and each of the three standalone fields
  below them MUST render with even vertical spacing between every consecutive pair

### Requirement: A populated Location Card evenly spaces its content elements

The Location Card SHALL, when it has a resolved spatial observation to show, space its content
elements evenly from one another, rather than rendering them flush against each other with no gap.

#### Scenario: A populated Location Card evenly spaces its two fields and the map

- **WHEN** the Location Card renders for a record with a non-null `currentSpatialObservation`
- **THEN** the Observation time field, the Note field, and the map MUST render with even vertical
  spacing between every consecutive pair

### Requirement: Card sections render with legacy's own asymmetric inner padding

Every rendered Card section SHALL use legacy's own distinct top/bottom and left/right inner
padding values, not a single uniform padding value applied equally on all four sides.

#### Scenario: A Card section's content sits inside legacy's non-uniform padding

- **WHEN** any of the six Card sections renders
- **THEN** its top and bottom inner padding MUST match legacy's own value
- **AND** its left and right inner padding MUST match legacy's own value, distinct from the
  top/bottom value
