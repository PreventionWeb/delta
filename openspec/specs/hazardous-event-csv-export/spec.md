# hazardous-event-csv-export Specification

## Purpose

Lets a ViewData user export the session tenant's hazardous events as an RFC 4180 CSV file from the
hidden `/he-preview` route, keeping the legacy header (plus appended columns) so the file re-imports
and existing consumers keep working, with every cell protected against formula injection.

## Requirements

### Requirement: Export contains every event of the session tenant, for every ViewData role

The he-preview `csv-export` loader SHALL load namespaces, then run `requireUser`,
`resolveTenantId` and `requireViewDataPermission`, then call
`ExportHazardousEventsCsvUseCase.execute({ tenantId })`. Every event with
`country_accounts_id = tenantId` SHALL appear, whatever its workflow status and whatever the
caller's role. This is legacy behaviour (design.md W1, OD-9). Rows with a null or different
`country_accounts_id` MUST NOT appear.

#### Scenario: A data-viewer exports drafts too

- **GIVEN** one DRAFT and one PUBLISHED event in the tenant
- **WHEN** a data-viewer downloads the export
- **THEN** both events are in the file

#### Scenario: Another tenant's events are not exported

- **GIVEN** events in tenants T1 and T2
- **WHEN** a T1 user downloads the export
- **THEN** every data row's `id` belongs to T1

#### Scenario: A user without ViewData is refused

- **WHEN** a user whose role lacks ViewData requests the export
- **THEN** a 403 ADR-003 envelope is thrown and no file is returned

### Requirement: The export keeps the legacy header and appends three columns

The header SHALL be the legacy export header in its legacy order (design.md E1):

`updatedAt`, `createdAt`, `approvalStatus`, `createdByUserId`, `updatedByUserId`,
`submittedByUserId`, `submittedAt`, `validatedByUserId`, `validatedAt`, `publishedByUserId`,
`publishedAt`, `apiImportId`, `hipHazardId`, `hipClusterId`, `hipTypeId`, `id`,
`countryAccountsId`, `specificHazardId`, `status`, `nationalSpecification`, `startDate`,
`endDate`, `description`, `chainsExplanation`, `magnitude`, `recordOriginator`,
`hazardousEventStatus`, `dataSource`, `specificHazardLocalName`, `specificHazardNationalName`.

It SHALL be followed by `parent` (NOD-10). `spatialFootprint` and `attachments` MUST NOT be
emitted in 6d-1, matching legacy (design.md D15); roadmap 6d-2 appends them.

Rows SHALL be ordered by `id` ascending. Dates SHALL be written as stored. Timestamps SHALL be
UTC ISO 8601 with `Z` (ADR-002). An empty tenant SHALL produce a header-only file at 200.

#### Scenario: Header order

- **WHEN** any export is downloaded
- **THEN** its first line is exactly the legacy export header followed by `,parent`

#### Scenario: Empty tenant

- **GIVEN** a tenant with no events
- **WHEN** the export is downloaded
- **THEN** the body is the header line only and the status is 200

### Requirement: Values are taken from the CA model, falling back to legacy data for unmigrated rows

Export SHALL read through `IHazardousEventRepository.findExportRows` (no entity rehydration), and
SHALL write each value as follows (design.md D9):

- `approvalStatus` is mapped back from the WorkflowInstance status: DRAFT→`draft`,
  SUBMITTED→`waiting-for-validation`, REVISION_REQUESTED→`needs-revision`,
  APPROVED→`validated`, PUBLISHED→`published`, REJECTED→empty. Without a WorkflowInstance, the
  stored legacy value is used.
- The submitted, validated and published attribution comes from the WorkflowInstance when
  present, otherwise from the legacy columns.
- `hipHazardId`, `hipClusterId` and `hipTypeId` are the taxonomy `source_ref_id` values of the
  event's specific hazard. When `specific_hazard_id` is null, the stored `hip_*` values are used.
- `parent` is the CA cause (the lowest cause id when migrated data holds several, so each
  event is still one row). Only an unmigrated row (null `specific_hazard_id`) falls back to the
  legacy `event_relationship` parent (NOD-9); on a migrated row, no CA cause writes an empty cell.

#### Scenario: A pre-Phase-M row is exported in full

- **GIVEN** an event with `specific_hazard_id = NULL`, `hip_hazard_id = 78568`, no
  WorkflowInstance, legacy `approvalStatus = "validated"`, and an `event_relationship` parent P
- **WHEN** it is exported
- **THEN** its row has `hipHazardId = 78568`, `approvalStatus = validated`, `parent = P` and an
  empty `specificHazardId`

#### Scenario: A CA-created published event shows its CA status and HIP ids

- **GIVEN** an event created through the CA path, PUBLISHED, with specific hazard S
  (`source_ref_id` 78424, cluster 1844, type 1037)
- **WHEN** it is exported
- **THEN** its row has `approvalStatus = published`, `hipHazardId = 78424`,
  `hipClusterId = 1844` and `hipTypeId = 1037`

#### Scenario: An exported file re-imports unchanged

- **GIVEN** an export file of the tenant
- **WHEN** it is imported in update mode
- **THEN** the header is accepted and every row is counted as `unchanged`

### Requirement: The file is RFC 4180 CSV in UTF-8

The response SHALL be `200`, with `Content-Type: text/csv; charset=utf-8; header=present`,
`Content-Disposition: attachment; filename="hazardous-event.csv"` (legacy name) and
`Cache-Control: no-store`. The body SHALL be UTF-8 without a BOM, and records SHALL end with
CRLF. A field containing a comma, double quote, CR or LF, or starting or ending with
whitespace, SHALL be quoted, with inner quotes doubled (RFC 4180 §2), so the trimming import
parser keeps the value exactly. User text SHALL be exported as stored (ADR-008), apart from the formula
guard.

#### Scenario: Comma, quote and newline survive a round trip

- **GIVEN** an event whose `description` is `a, "b"`, a line break, then `c`
- **WHEN** it is exported and parsed by an RFC 4180 parser
- **THEN** the parsed `description` equals the stored value

#### Scenario: Non-ASCII text is preserved

- **GIVEN** an event whose `recordOriginator` is `Météo-France`
- **WHEN** it is exported
- **THEN** the cell decodes from UTF-8 as `Météo-France`

### Requirement: Exported cells are protected against formula injection

Every exported cell, in every column, that starts with `=`, `+`, `-`, `@`, tab, CR, LF, or
full-width `＝ ＋ － ＠` SHALL be prefixed with `'` and then quoted (OWASP CSV Injection, OD-10).
Status columns have no database constraint, so no column is exempt (gate 10, user decision
2026-11-25). Well-formed ids, UUIDs, statuses, timestamps and HIP ids never start with a guarded
character, so they are written unchanged.

#### Scenario: A formula-like value is neutralised

- **GIVEN** an event whose `recordOriginator` is `=HYPERLINK("http://example.invalid")`
- **WHEN** it is exported
- **THEN** the cell is written as `"'=HYPERLINK(""http://example.invalid"")"`

#### Scenario: A negative-looking magnitude is also prefixed

- **GIVEN** an event whose `magnitude` is `-5`
- **WHEN** it is exported
- **THEN** the cell value is `'-5`

#### Scenario: A status column is guarded too

- **GIVEN** an event whose stored `status` is `=cmd`
- **WHEN** it is exported
- **THEN** the cell value is `'=cmd`

### Requirement: Concurrent exports and an export during an import see consistent data

Export SHALL read with one statement, or in one read transaction, so it never contains part of
an uncommitted import. Two simultaneous exports with no writes in between SHALL be byte-identical.

#### Scenario: Export while an import is in flight

- **GIVEN** a create-mode import of 3 rows that has written 2 rows but not committed
- **WHEN** an export is downloaded at that moment
- **THEN** the file contains none of the 3 new events
- **AND** an export after the commit contains all 3

#### Scenario: Two simultaneous exports

- **WHEN** two exports for the same tenant run at the same time with no writes in between
- **THEN** both files are byte-identical

### Requirement: Export logs one info line

`ExportHazardousEventsCsvUseCase` SHALL log one `info` line `hazardous_events.csv_exported`, with
`tenantId` and `count` and no cell values (ADR-004). An unexpected failure SHALL become a 500
envelope via `throwHazardousEventLoaderError`.

#### Scenario: Export is logged once

- **WHEN** an export of 12 rows succeeds
- **THEN** exactly one `hazardous_events.csv_exported` line with `count: 12` is logged
