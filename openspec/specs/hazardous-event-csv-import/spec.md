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
fallback values (NOD-9) compare equal too. The read-only columns are left out.

`spatialFootprint` and `attachments` compare by content, not text:

- a footprint compares its geometries as a multiset and its division ids as a set, at PostGIS
  output precision, with a 2D position padded with Z=0 when another position of the same geometry
  has Z (as PostGIS stores it);
- attachments compare as a multiset of `(type, title, url or file key, staged, tag)`, ignoring item ids
  and order;
- an empty cell, or an absent column, is not supplied, so it is never a change (design.md OD-2).

On a migrated event, the four hazard columns (`hipHazardId`, `hipClusterId`, `hipTypeId`,
`specificHazardId`) compare as one value: the row's resolved specific hazard against the stored
one, so empty or partial HIP cells are not a change. A row whose hazard cells fail to resolve is
a change when a supplied cell differs, so its error is reported. On an unmigrated event the
supplied hazard cells compare with the exported legacy values. On either, `hipClusterId`/
`hipTypeId` cells count only when a `hipHazardId` or `specificHazardId` cell is non-empty, since
they alone never change the hazard. Valid UUID cells (`id`, `parent`, `specificHazardId`)
compare in lower case. An unchanged `parent` is not re-sent, so the stored link and its
explanation stay as they are.

The check SHALL run **before** the `not_migrated`, status-aware, status-permission, HIP,
`parent`, footprint and attachment content rules (NOD-4). An unchanged row therefore never fails
those rules. Nothing SHALL be written for it: no `updated_at` change, no audit row, no new
spatial observation, no attachment rewrite and no file deletion.

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
  PUBLISHED event, an unmigrated row (null `specific_hazard_id`) with legacy footprint rows and
  a legacy `attachments` jsonb, a legacy-only parent, and an event with a CA footprint and
  attachments
- **WHEN** a non-admin EditData user imports it unchanged in update mode
- **THEN** every row is counted as `unchanged`, with no `not_migrated`, `status_not_permitted`,
  footprint or attachment error
- **AND** no observation is recorded and no file is deleted

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

### Requirement: `spatialFootprint` becomes a tenant-checked CA spatial observation

`ImportHazardousEventsCsvUseCase.execute` SHALL map a non-empty `spatialFootprint` cell, in every
mode, from the legacy footprint JSON: an array of items. Each item is one of:

- `map_option` `"Map coordinates"`, with `geojson` a GeoJSON Feature, FeatureCollection or bare
  geometry;
- `map_option` `"Geographic level"`, with the division id in `geojson.properties.division_id` or
  `division_id`.

The result SHALL be at most one new CA spatial observation per row. It is recorded through the
CA create or update path, inside the import's transaction, with the observation time equal to
the import time shared by every row of the file.

The import SHALL check every division id against the session tenant's divisions before any
write. A non-UUID, unknown or other-tenant division id MUST give row error `invalid_division` on
column `spatialFootprint`, with that id echoed.

Each of the following MUST give row error `invalid_spatial_footprint` on column
`spatialFootprint`:

- a cell that is not a JSON array;
- an item that is not an object, or whose `map_option` is missing or unknown;
- a `Map coordinates` item without a geometry;
- a `Geographic level` item without a division id;
- a geometry that breaks the RFC 7946 structure (geometry type, positions of two or more numbers,
  closed rings of four or more positions);
- a GeometryCollection nested more than 8 levels deep.

Any input, however malformed or hostile (for example a geometry `type` such as `valueOf`), MUST
give a row error, never a server error.

The rejection of input legacy dropped silently follows design.md OD-3; a structurally valid but
OGC-invalid geometry is stored as given (OD-4); a FeatureCollection becomes one geometry per
feature (OD-5); item titles are not kept (OD-7); geometries compare at PostGIS output precision
(OD-8). These were decided by the user on 2026-11-26.

In create mode every footprint rule SHALL be checked before any write. On update and upsert rows
only a cell that is not parseable JSON SHALL be rejected before any write; every other footprint
rule SHALL apply only when the row is not unchanged (the 6d-1 deferred-error rule), so an
unchanged exported row always re-imports.

On update and upsert-match rows, a new observation SHALL be recorded only when the cell's
geometries (as a multiset) or division ids (as a set) differ from the exported footprint. A cell
of `[]` on such a row SHALL record an empty observation only when the exported footprint is
non-empty. A cell of `[]` on the create path SHALL record no observation.

If the event's current observation is dated after the import time, a changed footprint MUST give
row error `conflict` on column `spatialFootprint` (design.md OD-9).

#### Scenario: A legacy footprint creates an observation

- **GIVEN** a tenant T1 with division D1
- **WHEN** a create-mode row has `spatialFootprint` =
  `[{"map_option":"Map coordinates","geojson":{"type":"Feature","geometry":{"type":"Point","coordinates":[77.2,28.6]},"properties":{}}},{"map_option":"Geographic level","geojson":{"properties":{"division_id":"D1"}}}]`
- **THEN** the event is created with one spatial observation whose geometries are the Point and
  whose division ids are `[D1]`
- **AND** its observation time equals the import time

#### Scenario: A bare geometry and a top-level division id are accepted

- **WHEN** a create-mode row's items are `{"map_option":"Map coordinates","geojson":{"type":"Polygon","coordinates":[[[77,28],[78,28],[78,29],[77,28]]]}}`
  and `{"map_option":"Geographic level","division_id":"D1"}`
- **THEN** the observation holds that Polygon and division D1

#### Scenario: Another tenant's division is rejected

- **GIVEN** a division D2 that belongs to tenant T2
- **WHEN** a T1 uploader imports a row naming D2 in a `Geographic level` item
- **THEN** nothing is written and the result contains `invalid_division` on `spatialFootprint`
  with value D2
- **AND** the same code is returned for a division id that exists nowhere

#### Scenario: A malformed footprint is rejected before any write

- **WHEN** line 3 has `spatialFootprint = {not json` and line 4 has a Point whose `coordinates`
  is `"x"`
- **THEN** nothing is written and the result lists `invalid_spatial_footprint` for lines 3 and 4

#### Scenario: An unchanged footprint records nothing

- **GIVEN** an event E whose current observation holds one Point, and its exported row
- **WHEN** that exported row is re-imported in update mode, with the footprint JSON reformatted
  and its items reordered
- **THEN** the row counts as `unchanged` and E gains no observation

#### Scenario: `[]` clears a non-empty footprint once

- **GIVEN** an event E with a non-empty current observation
- **WHEN** an update row for E has `spatialFootprint = []`
- **THEN** E gains exactly one observation with no geometries and no division ids
- **AND** re-importing the same row then counts it as `unchanged` and records nothing

#### Scenario: A changed footprint on a published event is not editable

- **GIVEN** a PUBLISHED event E and a data-collector uploader
- **WHEN** an update row changes only E's `spatialFootprint`
- **THEN** nothing is written and the result contains `not_editable`

### Requirement: `attachments` become CA attachments, http(s) links and the event's own files only

The import SHALL map a non-empty `attachments` cell, in every mode, from the legacy attachment
JSON: an array of items `{ title, tag?, file_option, url?, file? }`. Item `id` SHALL be ignored.

- A `"Link"` item's `url` MUST be an absolute URL whose scheme is `http` or `https`. Otherwise
  the row error is `invalid_attachment_url` on `attachments`, with the URL echoed unless it is
  empty.
- A `"File"` item SHALL be accepted only as a reference to a file the target event already holds
  in CA, matched by the basename of `file.name`. Any other File item MUST give
  `file_reference_not_supported` on `attachments` with the basename echoed, and MUST NOT stage,
  move, promote or create any file or directory. That covers a File item:
  - on a row that takes the create path;
  - whose `file.name` names a staged (`temp`) upload;
  - that names a key the event does not hold.
- `file.tenantPath`, the directory part of `file.name` and `content_type` MUST NOT influence any
  storage location or decision.
- A cell that is not a JSON array, or an item that is not an object, has a non-string `title`, a
  missing or unknown `file_option`, a File item without `file.name`, or a `tag` list whose
  elements are not objects with string `id` and `name`, MUST give `invalid_attachments` on
  `attachments` (design.md OD-3). A `tag` that is not a list is read as `null`.

In create mode every attachment rule SHALL be checked before any write. On update and upsert rows
only a cell that is not parseable JSON SHALL be rejected before any write; every other attachment
rule SHALL apply only when the row is not unchanged, so an unchanged exported row holding, for
example, a non-http link stored through the form still re-imports.

A present, non-empty cell SHALL replace the event's whole attachment set. On update and
upsert-match rows, the set SHALL be written only when it differs from the exported set. The two
sets are compared as multisets of `(type, title, url or file key, staged, tag)`, ignoring item ids and
order.

#### Scenario: A legacy file with an https link creates a Link attachment

- **WHEN** a create-mode row has `attachments` =
  `[{"id":"1","title":"Report","tag":[{"id":"t","name":"Tag"}],"file_option":"Link","url":"https://example.com/a"}]`
- **THEN** the event has one Link attachment with that title, tag and URL

#### Scenario: Dangerous link schemes are rejected

- **WHEN** a row has a Link item with `url` `javascript:alert(1)`, and another row one with
  `data:text/html,x`
- **THEN** nothing is written and each line has `invalid_attachment_url`

#### Scenario: A File item on create is not supported

- **WHEN** a create-mode row has a File item with `file.name` `/uploads/temp/report.pdf`
- **THEN** nothing is written, the result has `file_reference_not_supported` with value
  `report.pdf`, and no file or directory is created or moved

#### Scenario: A File item naming the event's own file keeps it

- **GIVEN** an event E with a File attachment whose file key is K
- **WHEN** an update row for E lists a File item whose `file.name` ends in `/K`, with a new
  title, and drops E's Link attachment
- **THEN** E has exactly one attachment: the File K, with the new title and its stored file
  metadata
- **AND** file K is not deleted

#### Scenario: A File item naming another event's file is rejected

- **GIVEN** events E1 holding file key K1 and E2 holding none
- **WHEN** an update row for E2 lists a File item naming K1
- **THEN** nothing is written and the result has `file_reference_not_supported` for that line

#### Scenario: An object instead of an array is rejected

- **WHEN** a row's `attachments` cell is a JSON object
- **THEN** nothing is written and the result has `invalid_attachments`

#### Scenario: An unchanged row holding a non-http link re-imports

- **GIVEN** an event E whose CA attachments include a Link `ftp://example.com/f`, stored through
  the he-preview form, and E's exported row
- **WHEN** the exported row is re-imported unchanged in update mode
- **THEN** the row counts as `unchanged` and no `invalid_attachment_url` is reported
- **AND** an update row that changes E's attachments while keeping that link is rejected with
  `invalid_attachment_url`

#### Scenario: An unchanged attachment set is not rewritten

- **GIVEN** an event E with two attachments and its exported row
- **WHEN** the row is re-imported with the two items in the other order and without ids
- **THEN** the row counts as `unchanged`

### Requirement: An empty footprint or attachments cell means not supplied

An empty `spatialFootprint` or `attachments` cell SHALL be treated as not supplied (design.md
OD-2). On the create path no observation or attachment is created. On update the
event's footprint and attachments stay unchanged, and no file is deleted. Only `[]` clears. An
absent column SHALL behave the same way. The CA path MUST NOT reproduce legacy's wipe of the
footprint on an update without the column (design.md L13).

#### Scenario: The template's empty cells still import

- **WHEN** the create template, whose `spatialFootprint` and `attachments` cells are empty, is
  imported unchanged
- **THEN** one event is created with no observation and no attachments

#### Scenario: An update without the columns keeps footprint and attachments

- **GIVEN** an event E with a current observation and one File attachment
- **WHEN** an update file with header `id,description` changes E's description
- **THEN** E's observation count, current footprint, attachments and files are unchanged

### Requirement: Removed attachment files are deleted only after the import commits

The import SHALL collect the file keys that update rows remove from an event's attachment set.
It SHALL delete them through the shared attachment storage port, with the session tenant and the
event as owner, only after the import's transaction has committed. When the import is rolled
back for any reason, no file SHALL be deleted, and the import SHALL never promote a file. A
failure to delete a file after commit SHALL be logged and MUST NOT change the import's
successful result.

#### Scenario: A rolled-back import deletes no file

- **GIVEN** an event E with File attachment K, and a storage port that records its calls
- **WHEN** an update file removes K on line 2 and fails with a row error on line 3
- **THEN** the result is `ok: false`, E still lists K, and the port recorded no `delete` and no
  `promote`

#### Scenario: Files are deleted after commit

- **GIVEN** an event E with File attachment K
- **WHEN** an update file whose only row sets E's `attachments` to `[]` succeeds
- **THEN** E has no attachments, and the port's `delete` for K is called after the transaction
  committed, exactly once

#### Scenario: A deletion failure after commit keeps the import successful

- **GIVEN** a storage port whose `delete` rejects
- **WHEN** a committed import removed file K
- **THEN** the result is `ok: true`, and one `error` line `hazardous_event_attachment.delete_failed`
  names K

### Requirement: Concurrent imports changing one event's footprint or attachments

When two imports change the same event's footprint or attachments at the same time, at most one
of their changes to that event SHALL commit. The other import SHALL fail as a whole with a row
error, and SHALL delete no file.

#### Scenario: Two imports race on one event's attachments

- **GIVEN** an event E with File attachment K, and two imports that both read E before either
  writes. Import 1 sets `attachments` to `[]`; import 2 changes the attachment titles
- **WHEN** both run concurrently
- **THEN** exactly one import commits its change to E. The other fails with
  `concurrent_modification` and nothing of it is written
- **AND** K is deleted only if import 1 committed, and then exactly once

#### Scenario: Two imports race on one event's footprint

- **GIVEN** an event E and two imports that both change E's footprint
- **WHEN** both run concurrently
- **THEN** at most one new observation from them is committed for E, and the other import fails
  with `concurrent_modification` or `conflict`
