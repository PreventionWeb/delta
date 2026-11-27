## REMOVED Requirements

### Requirement: `spatialFootprint` and `attachments` are accepted and ignored in 6d-1

**Reason**: Roadmap 6d-2 maps both columns. The 6d-1 placeholder behaviour, in which cells were
not parsed, both columns were listed as ignored, and a per-file notice counted rows with data,
is replaced by the requirements added below.

**Migration**: Files that carried data in these columns now import it. Re-running an onboarding
file in upsert mode fills in footprints and attachments; every other unchanged row is skipped
(6d-1 D15). The `skippedDataNotice` result field and the `csv.skipped_data_notice_*` copy are
removed.

## ADDED Requirements

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

## MODIFIED Requirements

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
