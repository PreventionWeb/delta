# hazardous-event-csv-import Specification

## Purpose

Lets an EditData user import hazardous events into the CA path from a CSV file on the hidden
`/he-preview` route, in create, update or upsert mode. Existing legacy CSV files and templates keep
importing; the tenant and acting user always come from the session; an import is all or nothing.

## Requirements

### Requirement: The tenant and acting user come only from the uploader's session

`ImportHazardousEventsCsvUseCase.execute` and the `he-preview` `csv-import` route action SHALL
take `tenantId` from `resolveTenantId` and `actingUserId` and `role` from the session only. A
`countryAccountsId` column MUST be ignored and MUST NOT influence which tenant any row is read
from or written to (OD-2). This reverses the three 0e characterization bugs on the CA path.

#### Scenario: A file with no tenant column creates events in the session tenant (0e bug 1, reversed)

- **GIVEN** an uploader whose session tenant is T1
- **WHEN** they import, in create mode, a valid one-row file with no `countryAccountsId` column
- **THEN** exactly one `hazardous_event` row is created with `country_accounts_id = T1`
- **AND** no row with a null `country_accounts_id` is created

#### Scenario: A foreign tenant id in the file is ignored (0e bug 2, reversed)

- **GIVEN** an uploader in tenant T1 and another tenant T2
- **WHEN** they import, in create mode, a valid row whose `countryAccountsId` cell is T2
- **THEN** the event is created with `country_accounts_id = T1`
- **AND** T2 gains no new row
- **AND** the result lists `countryAccountsId` among the ignored columns

#### Scenario: Update mode cannot reach another tenant's event (0e csvUpdate, reversed)

- **GIVEN** an event E2 in tenant T2 and an uploader in tenant T1
- **WHEN** they import, in update mode, a row with `id = E2`, a new `recordOriginator`, and
  `countryAccountsId = T2`
- **THEN** the import fails with a row error `not_found` for that line, the same as for an id
  that does not exist anywhere
- **AND** E2 is unchanged

#### Scenario: Upsert never matches another tenant's apiImportId (0e bug 3, reversed)

- **GIVEN** an event V in tenant T2 with `api_import_id = "SHARED-IMPORT-ID"`, and no event with
  that id in tenant T1
- **WHEN** an uploader in T1 imports, in upsert mode, a valid row with
  `apiImportId = "SHARED-IMPORT-ID"` and `countryAccountsId = T2`
- **THEN** a new event is created in T1 with that `api_import_id`
- **AND** V's fields and tenant are unchanged

### Requirement: Existing legacy CSV files and templates are accepted

The header SHALL be validated against the column contract in design.md D3. The import:

- SHALL accept every legacy `fieldsDefApi` column: `parent`, `hipHazardId`, `hipClusterId`,
  `hipTypeId`, `approvalStatus`, `nationalSpecification`, `startDate`, `endDate`, `description`,
  `chainsExplanation`, `magnitude`, `spatialFootprint`, `attachments`, `recordOriginator`,
  `hazardousEventStatus`, `dataSource`, `apiImportId` and `countryAccountsId`, plus `id` in update
  mode;
- SHALL accept the optional columns `specificHazardId`, `specificHazardLocalName` and
  `specificHazardNationalName`;
- SHALL accept and report as ignored the read-only columns of the legacy export header
  (`updatedAt`, `createdAt`, `createdByUserId`, `updatedByUserId`, `submittedByUserId`,
  `submittedAt`, `validatedByUserId`, `validatedAt`, `publishedByUserId`, `publishedAt`,
  `status`), as well as `countryAccountsId`, and `id` in upsert mode;
- MUST reject any other column, and `id` in create mode, with the file-level error
  `unknown_column` naming the column, before any write.

Header matching SHALL be exact and case-sensitive, with surrounding whitespace trimmed. A
duplicated header MUST give `duplicate_column`.

#### Scenario: A legacy template file imports unchanged

- **GIVEN** a file whose header is exactly the legacy create template header (design.md X1)
  and whose row has valid HIP ids, dates and record originator
- **WHEN** it is imported in create mode
- **THEN** one event is created and no file-level error is reported

#### Scenario: A legacy export file re-imports in update mode

- **GIVEN** a file produced by the legacy `/hazardous-event/csv-export` route (header E1)
- **WHEN** it is imported in update mode
- **THEN** the header passes validation (every E1 column is accepted or ignored)

#### Scenario: An unknown column rejects the file

- **WHEN** a create-mode file has a column `unknownCol`
- **THEN** nothing is written and the result has `unknown_column` naming `unknownCol`

#### Scenario: A duplicated header rejects the file

- **WHEN** a file's header contains `recordOriginator` twice
- **THEN** nothing is written and the result has `duplicate_column` naming `recordOriginator`

### Requirement: Every row is validated before any write, and errors give line and column

The import SHALL map and validate every data row before the first write. That covers the mode
keys, required cells (design.md D3), the `YYYY`/`YYYY-MM`/`YYYY-MM-DD` date format (ADR-002),
the enums `hazardousEventStatus` and `approvalStatus`, the UUID format of `id`,
`specificHazardId` and `parent`, HIP resolution (D13), the role rule for non-draft statuses (D12), and duplicate keys within the file.

If any row fails, nothing SHALL be written, and the result SHALL list each failure as
`{ line, column?, code, value? }`. `line` is the 1-based physical line, so the header is line 1.
`value` is echoed only for user-supplied cells, untranslated (ADR-008), and truncated to 100
characters. An echoed `column` is also truncated to 100 characters. The result SHALL carry at
most 200 errors (file errors first, then row errors in line order) and `errorCount`, the total
found; the page summarises `errorCount` and says how many are not listed (`…and N more`).

#### Scenario: A file with more than 200 errors is bounded

- **WHEN** a create file has 250 rows, each with two errors
- **THEN** the result lists the first 200 errors, `errorCount` is 500, and the page reads
  `…and 300 more problems.`

#### Scenario: A bad date is reported with its line and column

- **WHEN** line 3 of a create-mode file has `startDate = "2025-13-45"`
- **THEN** nothing is written
- **AND** the result contains `{ line: 3, column: "startDate", code: "invalid_date" }`

#### Scenario: Several invalid rows are all reported

- **WHEN** line 2 lacks `recordOriginator` and line 4 has `hazardousEventStatus = "unknown"`
- **THEN** nothing is written and the result lists both errors, in line order

#### Scenario: A duplicated apiImportId within one file is rejected

- **WHEN** an upsert-mode file has `apiImportId = "A1"` on lines 2 and 5
- **THEN** nothing is written and the result contains `duplicate_key` for line 5, column
  `apiImportId`

### Requirement: Legacy HIP ids resolve to the CA taxonomy

`hipHazardId` SHALL resolve to the `specific_hazard` whose `source_ref_id` equals it, through
`ISpecificHazardTaxonomyRepository.findBySourceRefIds` (design.md D13). The following outcomes
apply:

- An unknown `hipHazardId` MUST give `not_found`.
- A `hipClusterId` or `hipTypeId` that is not an ancestor of the resolved hazard MUST give
  `hip_mismatch` (NOD-5).
- An optional `specificHazardId` SHALL be used directly. When HIP ids are also present they MUST
  resolve to the same entry, or the row gives `hip_mismatch`.
- A row with neither, or with only `hipTypeId`/`hipClusterId`, MUST give
  `specific_hazard_required` on the create path (NOD-6). On update, an absent hazard leaves the
  hazard unchanged.

#### Scenario: A HIP hazard id becomes the matching specific hazard

- **GIVEN** `hip_hazard` 78424 with `specific_hazard.source_ref_id = "78424"`
- **WHEN** a create-mode row has `hipTypeId=1037, hipClusterId=1844, hipHazardId=78424`
- **THEN** the event's `specificHazardId` is that `specific_hazard.id`

#### Scenario: A contradictory HIP chain is rejected

- **WHEN** a row has `hipHazardId=78424` and `hipClusterId=1743` (78424's cluster is 1844)
- **THEN** nothing is written and the result contains `hip_mismatch` for that line

#### Scenario: A row without a specific hazard is rejected

- **WHEN** a create-mode row has only `hipTypeId` and `hipClusterId`
- **THEN** nothing is written and the result contains `specific_hazard_required`

### Requirement: Legacy approval status maps to the CA workflow status

On the create path, `approvalStatus` SHALL map as follows. An empty value or `draft` gives DRAFT
with no transition. Otherwise `ApplyImportedWorkflowStatusUseCase` runs inside the import
transaction:

- `waiting-for-validation` gives SUBMITTED;
- `needs-revision` gives REVISION_REQUESTED;
- `validated` gives APPROVED;
- `published` gives PUBLISHED.

Any other value MUST give `invalid_enum`. A non-draft value from a user who is not an admin MUST
give `status_not_permitted` in the validation phase (NOD-2). The import MUST NOT send any
notification or create any validator assignment (NOD-3). The importing user and the import time
SHALL be recorded as the actor and time of every attribution pair the status requires (NOD-1).

On an existing event, the status rules of NOD-4 apply (design.md D12).

#### Scenario: A published source record arrives published

- **GIVEN** an admin uploader
- **WHEN** a create-mode row has `approvalStatus = "published"`
- **THEN** the new event's `workflow_instance.status` is `PUBLISHED`
- **AND** `validated_by_user_id` and `published_by_user_id` are the uploader, with the import
  time
- **AND** no `workflow_notification` row is created

#### Scenario: A non-admin cannot import a published record

- **GIVEN** a data-collector uploader
- **WHEN** a create-mode row has `approvalStatus = "published"`
- **THEN** nothing is written and the result contains `status_not_permitted` for that line

#### Scenario: An empty status becomes a draft

- **WHEN** a create-mode row has an empty `approvalStatus`
- **THEN** the event's workflow status is `DRAFT`

#### Scenario: Changing a published event's fields is refused

- **GIVEN** an event E whose workflow status is `PUBLISHED`
- **WHEN** an update row for E changes `description` (status cell unchanged)
- **THEN** nothing is written and the result contains `not_editable` for E's line

#### Scenario: Moving a published event back to draft is not supported

- **GIVEN** an event E whose workflow status is `PUBLISHED`, and an admin uploader
- **WHEN** an update row for E changes only `approvalStatus` to `draft`
- **THEN** nothing is written and the result contains `status_change_not_supported` for E's line

#### Scenario: An admin can move a draft forward by CSV

- **GIVEN** an event E whose workflow status is `DRAFT`, and an admin uploader
- **WHEN** an update row for E changes only `approvalStatus` to `published`
- **THEN** E's workflow status is `PUBLISHED` and no notification is sent

### Requirement: Re-importing unchanged data is idempotent

On update and on an upsert match, a row SHALL be skipped and counted as `unchanged` when every
supplied cell equals the value the `csv-export` route would write for that event today. That
comparison uses the export projection (`findExportRows`) with the same formatting, so legacy
fallback values (NOD-9) compare equal too. Ignored cells (`spatialFootprint`, `attachments`, the
read-only columns) are left out. On a migrated event, the four hazard columns (`hipHazardId`,
`hipClusterId`, `hipTypeId`, `specificHazardId`) compare as one value: the row's resolved specific
hazard against the stored one, so empty or partial HIP cells are not a change; a row whose hazard
cells fail to resolve is a change when a supplied cell differs, so its error is reported. On an
unmigrated event the supplied hazard cells compare with the exported legacy values. On either,
`hipClusterId`/`hipTypeId` cells count only when a `hipHazardId` or `specificHazardId` cell is
non-empty, since they alone never change the hazard. Valid UUID
cells (`id`, `parent`, `specificHazardId`) compare in lower case. An unchanged `parent` is not
re-sent, so the stored link and its explanation stay as they are. The check SHALL run **before** the `not_migrated`,
status-aware, status-permission, HIP and `parent` rules (NOD-4). An unchanged
row therefore never fails those rules. Nothing SHALL be written for it: no `updated_at` change, no
audit row, no new spatial observation.

Before any comparison or mapping, one leading `'` SHALL be removed from a cell whose remainder
starts with zero or more `'` and then a formula-guarded character (`=`, `+`, `-`, `@`, tab, CR,
LF, or full-width `＝ ＋ － ＠`). This reverses the export guard (NOD-13), which also guards
cells that start with such a quote run, so the strip always removes exactly one guard.

#### Scenario: Re-running the onboarding file changes nothing

- **GIVEN** a file that was imported in upsert mode, with some rows published
- **WHEN** the same file is imported again in upsert mode
- **THEN** the result reports `created: 0, updated: 0` and every row `unchanged`
- **AND** no `hazardous_event.updated_at` changes

#### Scenario: Cluster and type cells alone do not change a hazard

- **GIVEN** a published, migrated event and a non-admin uploader
- **WHEN** an update row supplies only `id` and a different `hipTypeId`/`hipClusterId`
- **THEN** the row is `unchanged` and nothing is written

#### Scenario: A file exported by 6d re-imports with no change

- **GIVEN** a file produced by the he-preview `csv-export` route for a tenant that has a
  PUBLISHED event, an unmigrated row (null `specific_hazard_id`) and a legacy-only parent
- **WHEN** a non-admin EditData user imports it unchanged in update mode
- **THEN** every row is counted as `unchanged`, with no `not_migrated` or `status_not_permitted`
  error

#### Scenario: A guarded cell round-trips to its stored value

- **GIVEN** an event whose `magnitude` is `-5` and whose `apiImportId` is `=A1`
- **WHEN** its exported row (`'-5`, `'=A1`) is imported in upsert mode
- **THEN** the row matches the event by `apiImportId = "=A1"` and is counted as `unchanged`

### Requirement: `parent` becomes the CA cause link with the CA causality rules

A non-empty `parent` SHALL become `causeId` for `CreateHazardousEventUseCase` or
`UpdateHazardousEventUseCase`, and is written to `hazardous_event_causality` (design.md D14). The
following rules apply:

- An unknown or other-tenant parent MUST give `not_found`.
- A cycle, including a self-reference, MUST give `conflict`.
- A parent that starts after the event MUST give `cause_after_effect`, on create and on update.
- An empty `parent` on update SHALL clear the link. An absent column leaves the link unchanged.
- A `parent` that differs from the exported value, on an event with more than one cause link,
  MUST give `parent_multiple_causes` on column `parent`, and no cause link is changed. An
  unchanged `parent` on such an event is not an error.

#### Scenario: A parent from the same tenant links the event

- **GIVEN** an existing event P in the tenant that starts before the new row
- **WHEN** a create-mode row has `parent = P`
- **THEN** a `hazardous_event_causality` row (cause P, effect the new event) exists

#### Scenario: A later-starting parent is rejected on create

- **WHEN** a create-mode row's `parent` starts after the row's `startDate`
- **THEN** nothing is written and the result contains `cause_after_effect` (legacy accepted this,
  P3)

#### Scenario: A cycle is rejected

- **GIVEN** events A and B where A is B's cause
- **WHEN** an update row for A sets `parent = B`
- **THEN** nothing is written and the result contains `conflict` on column `parent`

#### Scenario: A parent change on an event with several causes is rejected

- **GIVEN** an event E with two cause links, A and B, and an export where E's `parent` shows A
- **WHEN** an update row for E sets `parent` to another event, or to empty
- **THEN** nothing is written, the result contains `parent_multiple_causes` on column `parent`,
  and both cause links A and B still exist

### Requirement: `spatialFootprint` and `attachments` are accepted and ignored in 6d-1

The import SHALL accept the `spatialFootprint` and `attachments` columns in every mode and
MUST NOT parse, validate or store their cells (design.md D15, RD-1). The result SHALL list both
columns as ignored, and SHALL carry a notice with the number of rows that had a non-empty cell in
either column. On update and upsert, the event's existing spatial observations and attachments
MUST stay unchanged. Mapping these columns is roadmap 6d-2.

#### Scenario: A legacy file with footprint and attachment data imports

- **WHEN** a create-mode file has valid rows whose `spatialFootprint` and `attachments` cells hold
  legacy JSON, and one row whose `spatialFootprint` is `{not json`
- **THEN** every event is created, with no spatial observation and no attachments
- **AND** the result lists `spatialFootprint` and `attachments` as ignored, with a notice counting
  the rows that had data in them

#### Scenario: Existing footprint and attachments are preserved on update

- **GIVEN** an event E with a current spatial observation and one attachment
- **WHEN** an update-mode row for E has `spatialFootprint = []` and `attachments = []`, and a new
  `description`
- **THEN** E's description changes, and its spatial observation and attachment content are
  unchanged (the repository rewrites child rows on every update, so attachment row ids may change)
- **AND** no attachment file is deleted

### Requirement: Create, update and upsert modes have defined semantics

The import SHALL support the modes `create`, `update` and `upsert`. Any other value MUST give
`invalid_mode`.

- **Update:** each row MUST have `id`. Only the columns present in the header are changed. An
  absent column leaves the field unchanged. A present but empty optional cell clears the field. A
  present but empty required cell gives `required`. A present `apiImportId` that differs from the
  stored one gives `api_import_id_immutable`.
- **Upsert:** each row MUST have `apiImportId`. The import looks it up with
  `IHazardousEventRepository.findIdByApiImportId(apiImportId, tenantId, tx)`. A match is updated;
  otherwise a new event is created.

#### Scenario: Update leaves absent columns unchanged

- **GIVEN** an event E with `description = "d1"` and `magnitude = "m1"`
- **WHEN** an update-mode file with header `id,description` sets `description = "d2"` for E
- **THEN** E has `description = "d2"` and `magnitude = "m1"`

#### Scenario: Upsert updates a match and creates a miss

- **GIVEN** an event in the session tenant with `apiImportId = "A1"`
- **WHEN** an upsert-mode file has valid, changed rows for `A1` and `A2`
- **THEN** the `A1` event is updated, a new event `A2` is created, and the result reports one
  updated and one created

#### Scenario: An invalid mode is rejected

- **WHEN** the form posts `import_type = "bogus"`
- **THEN** nothing is written and the result has `invalid_mode`

### Requirement: An import is all or nothing

All writes of one import SHALL run inside one transaction opened by
`ImportHazardousEventsCsvUseCase`, and rows SHALL be processed one after another (OD-4). If any
row fails, the transaction MUST roll back every earlier row's writes. That includes events,
`event` supertype rows, workflow instances and their status changes, causal edges, audit rows
and HIP stamps. The result SHALL report the failing
line.

A `DomainError` maps to a row error. Any other error propagates as an ADR-003 500 envelope.

#### Scenario: One failing row rolls back the rows before it

- **GIVEN** a create-mode file where lines 2 and 4 are valid, and line 3 has a `parent` that does
  not exist
- **WHEN** it is imported
- **THEN** no `hazardous_event`, `event`, `workflow_instance`, `hazardous_event_causality` or
  `audit_logs` row is created
- **AND** the result reports the error on line 3

#### Scenario: An existing apiImportId in the tenant fails a create

- **GIVEN** an event with `apiImportId = "A1"` in the session tenant
- **WHEN** a create-mode row has `apiImportId = "A1"`
- **THEN** nothing is written and that line's error is `conflict` on `apiImportId`

#### Scenario: An unexpected error rolls back and surfaces as a 500 envelope

- **GIVEN** a repository failure that is not a `DomainError`, on the second row
- **WHEN** the import runs
- **THEN** nothing is written and the action throws an `INTERNAL_ERROR` 500 envelope with the
  request `traceId`

### Requirement: Concurrent imports never create a duplicate or a lost update

Two imports that run at the same time in one tenant and upsert the same new `apiImportId` SHALL
end with exactly one event for it. The import whose insert loses MUST roll back all its writes
and report `conflict`. Two imports that change the same event SHALL commit at most one change;
the other reports `concurrent_modification` and writes nothing.

#### Scenario: Two simultaneous upserts of the same new apiImportId

- **GIVEN** no event in T1 with `apiImportId = "RACE-1"`
- **WHEN** two upsert-mode imports, each containing a valid `RACE-1` row plus one other distinct
  valid row, run at the same time before either commits
- **THEN** exactly one event with `apiImportId = "RACE-1"` exists in T1
- **AND** one import reports success, and the other reports `conflict` with none of its rows
  written

#### Scenario: Two simultaneous updates of the same event

- **GIVEN** an event E in T1
- **WHEN** two update-mode imports that both change E run at the same time
- **THEN** at most one commits its change to E
- **AND** the other reports `concurrent_modification` and writes nothing

### Requirement: Update and upsert obey the status-aware edit rule

Before changing any field other than `approvalStatus` on an existing event, the import SHALL
apply the edit route's rule (`isStatusAwareEditBlocked`, moved to the application layer, OD-7).
A SUBMITTED, APPROVED or PUBLISHED event MUST give `not_editable` and roll back the file. A row
that changes only `approvalStatus` is governed by the status rules of "Legacy approval status
maps to the CA workflow status" instead. An unchanged row is skipped first (see "Re-importing
unchanged data is idempotent"). An event with no WorkflowInstance SHALL be
editable. An event with a null `specific_hazard_id` MUST give `not_migrated` (OD-16).

#### Scenario: A submitted event cannot be changed by CSV

- **GIVEN** an event E whose workflow status is `SUBMITTED`
- **WHEN** an update-mode row changes E's `description`
- **THEN** nothing is written and the result reports `not_editable` on E's line

#### Scenario: An unmigrated event cannot be updated

- **GIVEN** an event E with `specific_hazard_id = NULL`
- **WHEN** an update-mode row changes E
- **THEN** nothing is written and the result reports `not_migrated`

### Requirement: The upload is limited and decoded strictly

The `csv-import` action SHALL parse multipart data with a single-file limit of 10,000,000 bytes
(OD-15). A larger file MUST give `file_too_large` before any CSV parsing. The file MUST be
decoded as UTF-8: a leading BOM SHALL be ignored, and invalid UTF-8 MUST give `invalid_encoding`.
Records SHALL follow RFC 4180 with CRLF or LF. A ragged row or an unterminated quote MUST give
`malformed_csv` with the line. A header without data rows MUST give `no_data`. A request that is
not `multipart/form-data` (matched case-sensitively, as the multipart parser does, so a request never
falls back to unbounded native form parsing), or whose multipart body is malformed, MUST give
`missing_file` rather than a server error. The whole request body SHALL be bounded at the file
limit plus 64 KiB: a declared `Content-Length` above it, or a body that grows past it (for example
through extra form fields), MUST give `file_too_large`. Fields other than `file` and
`import_type` are ignored. The file name and its Content-Type are not trusted.

#### Scenario: An oversized file is rejected without parsing

- **WHEN** a 10,500,000-byte file is uploaded
- **THEN** nothing is written and the result has `file_too_large`

#### Scenario: A mixed-case multipart header is not parsed

- **WHEN** a request sends `Content-Type: Multipart/form-data; boundary=…`
- **THEN** nothing is parsed or written and the result has `missing_file`

#### Scenario: Extra form fields cannot exceed the limit

- **WHEN** a small CSV file is posted with three extra 4,000,000-byte text fields
- **THEN** nothing is written and the result has `file_too_large`

#### Scenario: A NUL character in a cell is a row error

- **WHEN** a cell of a mapped column contains U+0000 (Postgres text cannot store it)
- **THEN** nothing is written, no query receives the value, and the result has
  `invalid_character` with the line and column (no echoed value)

#### Scenario: A Latin-1 file is rejected

- **WHEN** a file contains the byte `0xE9` outside a valid UTF-8 sequence
- **THEN** nothing is written and the result has `invalid_encoding`

#### Scenario: A ragged row is a file-level error with its line

- **WHEN** line 2 has fewer fields than the header
- **THEN** nothing is written and the result has `malformed_csv` with `line: 2`

### Requirement: Only EditData users can import

The `csv-import` loader and action, and the `csv-template` loader, SHALL load the
`hazardous-events` and `common` namespaces, then run `requireUser`, `resolveTenantId` and
`requireEditDataPermission`, in that order.

#### Scenario: A data-viewer cannot import

- **WHEN** a data-viewer posts a file
- **THEN** the action throws a 403 ADR-003 envelope and nothing is written

#### Scenario: An unauthenticated request is redirected

- **WHEN** a request has no session
- **THEN** it is redirected to login and nothing is written

### Requirement: The import page shows a localized result

`HazardousEventCsvImportPage` SHALL render inside `MainContainer`. On success it SHALL show the
created, updated and unchanged counts. On failure it SHALL show a summary and each error with
its line, column and translated message. It SHALL also list any ignored columns. Static copy
SHALL come from the `csv.*` keys (ADR-001). Echoed values SHALL be rendered as text.

#### Scenario: French result copy

- **WHEN** a French user's import fails on line 3
- **THEN** the summary and message are in French, and the echoed value is shown exactly as in
  the file

#### Scenario: A failed import never claims records were imported

- **WHEN** an import fails
- **THEN** the page shows no "imported N records" line

### Requirement: The import logs one outcome line after commit

On success, the import SHALL log exactly one `info` line `hazardous_events.csv_imported` after
commit. It carries `tenantId`, `mode`, and the `created`, `updated` and `unchanged` counts, and no
cell values. The per-event `hazardous_event.created`/`.updated` lines of Create and Update are
still written (user decision, 2026-11-25), before commit, so only `hazardous_events.csv_imported`
marks a committed file. A rejected import SHALL log at most one `info` line `hazardous_events.csv_import_rejected`.

#### Scenario: A rolled-back import leaves no success log

- **WHEN** an import fails on its third row
- **THEN** no `hazardous_events.csv_imported` line is logged; the `hazardous_event.created`
  lines of the two earlier rows were logged before the rollback

### Requirement: A template file is available for each mode

The `csv-template` route SHALL return, for `?mode=create|update|upsert`, the legacy column set
for that mode (design.md D3, without `countryAccountsId`, plus `specificHazardId`), followed by
one example row (OD-17). The create and upsert example rows SHALL import cleanly; the update
example row carries a placeholder `id` that the user replaces. An unknown mode MUST return 404.

#### Scenario: Create template is importable

- **WHEN** an EditData user downloads `csv-template?mode=create` and imports it unchanged in
  create mode
- **THEN** one event is created in the session tenant
