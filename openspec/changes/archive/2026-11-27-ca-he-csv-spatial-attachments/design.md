# Design: ca-he-csv-spatial-attachments (roadmap 6d-2)

## UI governance and traceability metadata

```yaml
design-system:
  repository: https://github.com/unisdr/delta-design
  version-or-tag: v0.7.3
  commit: 9107103efc7b192c3aa898ba99a508da57988a09

feature-prototype:
  repository: https://github.com/unisdr/delta-feature-prototypes
  path: not-applicable
  commit: e24b8ad4dee319d5efa2a7c57fca30948f130bd0
  status: not-required
  exception-reason: "Explicitly approved human review exception (user, 2026-11-24, OD-13 of ca-he-csv-migration, approved for all of roadmap 6d): Hazardous Events keeps legacy styling until the HE UI upgrade (DEF-068, user decision option (b), 2026-11-26); no prototype in delta-feature-prototypes@e24b8ad covers HE or any CSV screen. The only visual changes are the removal of one notice line and five new translated row-error messages on the existing 6d-1 CSV page, and one new translated attachments field error on the existing 6c he-preview form (SA-1)"

ui-classification: legacy-exempt
```

Where these values come from:

- `design-system`: `_docs/design/tokens.css` line 1 reads "generated from tokens.json v0.7.3", and
  `_docs/design/README.md:3` names commit `9107103`. The sync commit is `a8f0f24b`. On 2026-11-26,
  `git ls-remote https://github.com/unisdr/delta-design` returned HEAD
  `9107103efc7b192c3aa898ba99a508da57988a09` and no tags. 6d-1's pin (`v0.7.2`/`a86cc3a`) is
  out of date since PR #848 and is not copied.
- `feature-prototype`: `git ls-remote` on 2026-11-26 still returns HEAD `e24b8ad…`, the commit
  6d-1 inspected. 6d-1 design.md records that no path there covers CSV, import, export or upload.
- `legacy-exempt`, not `non-visual`. `HazardousEventCsvImportPage.tsx` and the two locale files
  change. `scripts/check-design-system.ts:634-641` rejects a `non-visual` change that modifies a
  presentation file. Under the design-system-check skill, the page stays on the HE legacy-parity
  components from `app/design-system/components/` (`LegacyButton` etc.). The design-system
  `index.ts` components and `scripts/check-design-system.ts` are not touched.

## Context

See proposal.md "Why". This section records only what the design rests on.

### Readiness of the CA side (verified against code, 2026-11-26)

| Need                                                       | Status                       | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RecordSpatialObservationUseCase` runs in a caller `tx`    | **Exists, no change needed** | `RecordSpatialObservationCommand.tx` (`RecordSpatialObservation.ts:29`). It is threaded to `findById` (:87-91), `findValidDivisionIds` (:106-110), `findSpatialObservationByTime` (:112-118) and `saveSpatialObservation` (:151-157).                                                                                                                                                                                                                                                          |
| Create/Update delegate a bundled observation on their `tx` | **Exists**                   | `CreateHazardousEventCommand.spatialObservation` (`CreateHazardousEvent.ts:64-67`) is delegated with the inner `tx` (:282-290). The same holds for Update (`UpdateHazardousEvent.ts:356-365`). Both already run under the import's caller `tx` (6d-1 NOD-12). The import passes `spatialObservation` in the command; it never calls `RecordSpatialObservationUseCase` itself.                                                                                                                  |
| Tenant-scoped division check                               | **Exists**                   | `IDivisionRepository.findValidDivisionIds(ids, tenantId, tx?)` (5e), and `SpatialObservation.create` requires the valid set.                                                                                                                                                                                                                                                                                                                                                                   |
| Current-observation read                                   | **Exists**                   | `findCurrentSpatialObservation` (latest by `observationTime`, `DrizzleHazardousEventRepository.server.ts:926-958`). The import does not call it; the comparison uses the export projection (D6).                                                                                                                                                                                                                                                                                               |
| Link and existing-File attachment writes                   | **Exist**                    | `HazardousEventAttachmentInput` kinds `link` and `existingFile`; `resolveAttachmentsForWrite` carries an existing row forward by `fileKey` and throws `ValidationError` for an unknown one (`resolveAttachmentsForWrite.ts:62-81`).                                                                                                                                                                                                                                                            |
| Deferred file deletion under a caller `tx`                 | **Needs adding**             | Code-derived: `deleteAttachmentFiles` is called inside the `transactionRunner.run(…, command.tx)` callback (`UpdateHazardousEvent.ts:372-378`). Under a caller `tx` that callback runs inside a savepoint, so files are unlinked while the savepoint is still open, before the caller commits. A later failing row would roll the rows back after the files were gone. This is what the 6d-1 gate 10 review found. (The roadmap's line numbers `:364` and `:286-294` are now 372 and 294-302.) |
| Export projection of footprint and attachments             | **Needs adding**             | `findExportRows` (`:1263-1350`) has no footprint, attachment or legacy fallback fields (repository spec: "added by roadmap 6d-2").                                                                                                                                                                                                                                                                                                                                                             |
| Link URL scheme check                                      | **Partly exists**            | Only at render: `safeLinkHref` (`presentation/web/attachmentLink.ts:10-17`) accepts `new URL(url).protocol` in `http:`/`https:`. The domain (`HazardousEvent.ts` `validateAttachments`) and the he-preview form parser accept any string. The CSV check reuses the same predicate (D9).                                                                                                                                                                                                        |
| Per-geometry `title`                                       | **Not modelled**             | `SpatialObservation.geometries` is `unknown[]`. The `hazardous_event_spatial_observation_geom.title` column exists but the repository never writes it (`:1162-1175`). The 6c picker drops titles too (`parseHazardousEventFormData.server.ts:134-156`). See OD-7.                                                                                                                                                                                                                              |
| Geometry repair                                            | **Not done by CA**           | The CA save is `ST_GeomFromGeoJSON(…)` (`:1168`), with no `ST_MakeValid`. Legacy wraps `ST_MakeValid` (`event.ts`, `syncHazardousEventSpatialFootprint`). See OD-4.                                                                                                                                                                                                                                                                                                                            |

### Legacy behaviour observed live (2026-11-26)

Setup: dev server `http://localhost:3000`, logged in over HTTP as `test.admin@india.gov.in` (admin,
the only tenant `50c88fb1…`). The driver scripts and CSV files were in the session scratchpad,
never in the repo. Each case was its own one-row create file, with `hipHazardId=78424`,
`hipClusterId=1844`, `hipTypeId=1037`, this tenant's `countryAccountsId` and a
`recordOriginator` starting `CSV6D2-`. Division `694d72d0…` ("Test State Alpha") belongs to this
tenant.

Baseline before the run: 42 `hazardous_event`, 44 `event`, 39 `workflow_instance`, 0
`hazardous_event_geom`, 0 `hazardous_event_division`, 12 `hazardous_event_attachment`, 6
`hazardous_event_spatial_observation`, 0 `event_relationship`, 2 `hazardous_event_causality`, 76
`audit_logs`, 980 entries under `uploads/`.

**O** = observed live; **C** = derived from code only.

| #   | Case                                                                                                  | UI result                                                     | DB / file-system result                                                                                                                                                                 | O/C                           |
| --- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| L1  | `Map coordinates` with a Point Feature, plus `Geographic level` with `geojson.properties.division_id` | imported                                                      | 1 geom `POINT(77.2 28.6)` with the item `title`; 1 division row                                                                                                                         | O (repeats S1)                |
| L2  | `Map coordinates` with a FeatureCollection (Point and LineString)                                     | imported                                                      | **one** geom row, a `GeometryCollection` of both                                                                                                                                        | O                             |
| L3  | `Map coordinates` with a bare Polygon geometry as `geojson`                                           | imported                                                      | 1 geom, Polygon unchanged                                                                                                                                                               | O                             |
| L4  | `Geographic level` with top-level `division_id` only (no `geojson`)                                   | imported                                                      | **no division row**: dropped silently                                                                                                                                                   | O                             |
| L5  | `Geographic level` naming an unknown, well-formed UUID                                                | imported                                                      | no division row: dropped silently                                                                                                                                                       | O                             |
| L6  | `Geographic level` naming `"abc"` (not a UUID)                                                        | "Imported or updated 0 records" / "Server error"              | nothing                                                                                                                                                                                 | O                             |
| L7  | `Map coordinates` geometry `{"type":"Point","coordinates":"x"}`                                       | "Server error"                                                | nothing                                                                                                                                                                                 | O                             |
| L8  | `spatialFootprint` is a JSON object, not an array                                                     | imported                                                      | no footprint: dropped silently                                                                                                                                                          | O                             |
| L9  | `spatialFootprint = []` on create                                                                     | imported                                                      | no footprint                                                                                                                                                                            | O                             |
| L10 | `spatialFootprint = {not json`                                                                        | 'The field "Spatial footprint" must be of type valid JSON. …' | nothing                                                                                                                                                                                 | O (repeats S3)                |
| L11 | Self-intersecting "bowtie" Polygon                                                                    | imported                                                      | stored **repaired** as a valid `MultiPolygon` (`ST_MakeValid`)                                                                                                                          | O                             |
| L12 | Item with an unknown `map_option`                                                                     | imported                                                      | nothing stored: dropped silently                                                                                                                                                        | O                             |
| L13 | Update with **no `spatialFootprint` column** of an event that has a footprint                         | "1 records"                                                   | **footprint wiped** (geom and division rows deleted): `syncHazardousEventSpatialFootprint` runs with `undefined`                                                                        | O                             |
| L14 | Update with a different footprint                                                                     | "1 records"                                                   | replaced                                                                                                                                                                                | O                             |
| L15 | Division of another tenant                                                                            | not run (one tenant only)                                     | existence check only, no tenant filter (`syncHazardousEventSpatialFootprint`)                                                                                                           | C (S5, DEF-005)               |
| A1  | Link `https://example.com/a` with tags                                                                | imported                                                      | jsonb stored as given                                                                                                                                                                   | O                             |
| A2  | Link `javascript:alert(1)`                                                                            | imported                                                      | **stored**                                                                                                                                                                              | O (repeats A1 of 6d-1)        |
| A3  | File item `file.name = "/uploads/temp/csv6d2-missing.pdf"`                                            | imported                                                      | rewritten to `/uploads/hazardous-event/<id>/csv6d2-missing.pdf`, **dangling**, no file moved; an empty untenanted directory created                                                     | O                             |
| A4  | JSON object instead of an array                                                                       | imported                                                      | `attachments: []`: dropped silently                                                                                                                                                     | O (repeats A2 of 6d-1)        |
| A5  | **Empty** `attachments` cell                                                                          | 'The field "Attachments" must be of type valid JSON. Got "".' | nothing                                                                                                                                                                                 | O                             |
| A6  | Link `data:text/html,<b>x</b>`                                                                        | imported                                                      | **stored**                                                                                                                                                                              | O                             |
| A7  | Item with no `file_option`                                                                            | imported                                                      | stored as given (neither Link nor File)                                                                                                                                                 | O                             |
| A8  | `attachments = {bad`                                                                                  | "must be of type valid JSON"                                  | nothing                                                                                                                                                                                 | O                             |
| A9  | Update with **no `attachments` column**                                                               | "1 records"                                                   | attachments kept                                                                                                                                                                        | O                             |
| A10 | Update with `attachments = []`                                                                        | "1 records"                                                   | jsonb cleared                                                                                                                                                                           | O                             |
| A11 | Tenant of the upload directory                                                                        | not run (would create a directory under a foreign tenant)     | `ContentRepeaterUploadFile.save` takes the tenant from `file.tenantPath` **or from a `tenant-<id>` segment in `file.name`** (`UploadFile.tsx:318-330`), then `mkdirSync`s it (:200)     | C (extends DEF-064)           |
| A12 | Files in the destination directory not named in the items                                             | not run                                                       | **unlinked** by `save` (`UploadFile.tsx:296-309`)                                                                                                                                       | C                             |
| A13 | Directories created per row                                                                           | —                                                             | 15 empty `uploads/hazardous-event/<id>` directories, one per **created** row. Rows rejected by validation or "Server error" created none this time                                      | O                             |
| X1  | Legacy example files `/en/api/hazardous-event/csv-import-example?import_type=create\|update\|upsert`  | 200                                                           | `spatialFootprint` and `attachments` cells are **empty** in every example row (legacy would reject them, A5/S2)                                                                         | O                             |
| E1  | Legacy export `/en/hazardous-event/csv-export`                                                        | 200 `text/csv`                                                | header has neither column                                                                                                                                                               | O (repeats E1/S6/A5 of 6d-1)  |
| P1  | PostGIS round trip `ST_AsGeoJSON(ST_GeomFromGeoJSON(x))` (PostGIS 3.5.2)                              | —                                                             | `77.123456789012345` → `77.123456789` (9 decimals); a Z ordinate is kept; SRID 4326; `ST_GeomFromGeoJSON` returns a bowtie Polygon unrepaired and `ST_IsValid` is false (no row stored) | O (read-only query)           |
| R1  | CA render of a `javascript:` Link                                                                     | —                                                             | `href` is dropped by `safeLinkHref`, label shown as text                                                                                                                                | C (`attachmentLink.ts:10-17`) |

Cleanup (2026-11-26):

- The 15 created rows (ids recorded in the session scratchpad) were deleted in one transaction by
  a guarded script. The guard aborted unless every id still had a `CSV6D2-` record originator and
  no `workflow_instance`. It deleted 3 `hazardous_event_geom` rows, then 15 `hazardous_event` and
  15 `event` rows. L13 had already removed L1's geometry and division rows.
- Only the 15 empty `uploads/hazardous-event/<id>` directories whose ids matched those rows, and
  which appeared in the before/after diff, were removed, with `rmdir`. No other file or directory
  was touched.
- Afterwards the counts were 42/44/39/0/0/12/6/0/2, 76 `audit_logs`, 0 orphan HE
  `workflow_instance` rows and 0 `CSV6D2-` rows. A full listing of `uploads/` was identical to the
  baseline.

### Legacy vs CA behaviour after this change

| Concern                        | Legacy (evidence)                                                                                | CA after 6d-2                                                                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Footprint storage              | legacy geom/division tables (L1)                                                                 | one CA spatial observation at import time (NOD-8)                                                                                  |
| Division tenant                | existence only (L15, DEF-005); unknown dropped (L5)                                              | `findValidDivisionIds` with the session tenant; unknown, other-tenant or non-UUID → `invalid_division` (D4)                        |
| FeatureCollection              | one GeometryCollection (L2)                                                                      | one geometry per feature (OD-5)                                                                                                    |
| Invalid geometry               | repaired (L11) or "Server error" (L7)                                                            | structural errors → `invalid_spatial_footprint`; OGC-invalid stored as given (OD-4)                                                |
| Silently dropped input         | object (L8, A4), unknown `map_option` (L12), top-level `division_id` (L4), no `file_option` (A7) | top-level `division_id` accepted (roadmap format); others are row errors (OD-3)                                                    |
| Absent column on update        | footprint **wiped** (L13); attachments kept (A9)                                                 | both unchanged (6d-1 "absent column leaves the field unchanged"); CA deliberately does not reproduce L13                           |
| Empty cell                     | row error (A5, S2)                                                                               | not supplied; only `[]` clears (OD-2)                                                                                              |
| `[]` on update                 | clears (S4, A10)                                                                                 | footprint: empty observation if the current one is non-empty (NOD-8); attachments: set cleared, files deleted after commit (NOD-7) |
| Link scheme                    | anything (A2, A6)                                                                                | http/https only → `invalid_attachment_url` (NOD-7)                                                                                 |
| File item                      | dangling path; directory created (A3, A13)                                                       | reference to the event's own file only, else `file_reference_not_supported`; no directory, no move (NOD-7)                         |
| Client-supplied path or tenant | trusted (A11)                                                                                    | never read; `IAttachmentStoragePort` with the session tenant                                                                       |
| File deletion                  | `save` unlinks unnamed files at once (A12)                                                       | after commit only (D7)                                                                                                             |
| Export                         | neither column (E1)                                                                              | both appended after `parent` (NOD-10), with fallbacks (OD-6)                                                                       |

### Layer ownership (ADR-009 "Decision")

- **Application, `application/csv/`** (pure, framework-free, Stryker-scoped):
  - `spatialFootprintCsv.ts`:
    - `parseSpatialFootprintCell(raw) → { geometries, divisionIds } | error`
    - `formatSpatialFootprintCell(geometries, divisionIds) → string`
    - `spatialFootprintEquals(a, b)` (canonical comparison)
  - `attachmentsCsv.ts`:
    - `parseAttachmentsCell(raw) → CsvAttachmentItem[] | error`
    - `formatAttachmentsCell(items, ctx) → string`
    - `attachmentsEqual(a, b)`
    - `toAttachmentInputs(items, existingFileKeys) → HazardousEventAttachmentInput[] | error`
- **Application, existing modules:** `hazardousEventCsvColumns.ts`, `mapCsvRowToCommand.ts`,
  `importRowPolicy.ts`, `exportRowCells.ts` and the use cases.
- **Infrastructure:** `findExportRows` SQL (current observation, attachments, legacy fallbacks).
- **Presentation:** the notice is removed and the five error codes get copy.

The he-preview form parser (`presentation/web/parseHazardousEventFormData.server.ts`) is **not**
reused. The application layer may not import presentation (ADR-009), and its rules differ on
purpose:

- it turns any File item with a `temp` path segment into `newFile`, which promotes a staged file;
- it has no URL scheme check;
- it normalises some malformed input instead of rejecting it.

The CSV module mirrors its accepted item shape (`{ id, title, tag, file_option, url?, file? }`)
but never emits `newFile`. Moving the form's parsing into the application layer to share it (the
`editPolicy` precedent of 6d-1 D5) would edit the 6c form path. It is not done here, because no
scope expansion was approved.

## Goals / Non-Goals

**Goals:**

- map both columns on import and export in the legacy formats;
- close DEF-005 and the DEF-064 attachment concerns on the CA CSV path;
- never delete a file for a rolled-back import;
- keep an exported file re-importable with every row `unchanged`;
- reject non-http(s) Link URLs on every CA write path, CSV and form (SA-1, D12);
- follow ADR-002, -003, -004, -007, -008 and -009.

**Non-Goals:**

- uploading file bytes through CSV;
- changing legacy routes or `UploadFile.tsx`;
- per-geometry titles in the CA model (OD-7);
- the Phase M backfill;
- DEF-068 (HE UI upgrade), DEF-053/6m, DEF-050/051, DEF-066/067;
- ADR-006 (unapproved draft, not used).

## Decisions

Items that change compatibility or behaviour beyond NOD-7 to NOD-10 were decided by the user on
2026-11-26 ("Resolved decisions" below).

### D1. Column contract

`spatialFootprint` and `attachments` move from "ignored" to "mapped" in every mode.
`NOT_YET_IMPORTED_COLUMNS`, `notYetImportedIndexes`, `hasNotYetImportedData` and
`skippedDataNotice` are removed.

- `EXPORT_HEADER` becomes `LEGACY_EXPORT_HEADER` + `parent`, `spatialFootprint`, `attachments`
  (NOD-10).
- The template header already contains both columns (`GetHazardousEventCsvTemplate.ts:19-20`).
  Its example row keeps them empty, which imports because an empty cell means not supplied
  (OD-2).

### D2. Footprint input format (roadmap "Formats"; legacy `extractGeojsonGeometry`, `event.ts:120-165`)

The cell is a JSON array of items:

- `map_option: "Map coordinates"` takes its geometry from `geojson`:
  - a `Feature` → its `geometry`;
  - a `FeatureCollection` → its features' geometries (one geometry per feature, OD-5);
  - a bare geometry object (L3).
- `map_option: "Geographic level"` takes its division id from `geojson.properties.division_id` or,
  as the legacy loader also writes it (`event.ts` `loadHazardousEventSpatialFootprint`),
  top-level `division_id` (L4 shows legacy sync ignored the latter).
- Other keys (`id`, `title`, `geographic_level`, `division_ids`, `name`, …) are ignored (OD-7).

Structural geometry rules follow RFC 7946:

- `type` is one of the seven geometry types;
- a position has at least two finite numbers (§3.1.1);
- a LineString has at least two positions;
- a linear ring is closed and has at least four positions (§3.1.6);
- a GeometryCollection holds geometries (§3.1.8).

Ring winding is **not** checked: "parsers SHOULD NOT reject Polygons that do not follow the
right-hand rule" (§3.1.6). Antimeridian cutting is not checked either (§3.1.9 is a SHOULD).

A structural failure is `invalid_spatial_footprint` (phase per D10). That makes L7's "Server error" a
specific row error, which is not a compatibility break. An OGC-invalid geometry, such as a
self-intersecting ring, is stored as given (OD-4).

Duplicate division ids within one cell are collapsed before the observation is built. The
entity rejects duplicates (`SpatialObservation.create`), and legacy's `Array.from(new Set(…))`
collapses them.

### D3. Footprint semantics on import (NOD-8)

- **Create, non-empty:** the Create command carries
  `spatialObservation: { geometries, divisionIds, observationTime: importTime }`.
- **Create, `[]`:** no observation is recorded.
- **Update, changed (D6):** the Update command carries the same. When the cell is `[]` and the
  exported footprint is non-empty, the observation is empty (`geometries: []`,
  `divisionIds: []`), which the domain allows (NOD-8).
- **Update, unchanged:** no observation is recorded and the column does not count as changed.
- `importTime` is one `new Date()` taken once per file before the transaction opens, so every row
  of a file shares it. The legacy file has no time column (NOD-8: "observation time = import
  time; no new column"). It is an instant stored in TIMESTAMPTZ (ADR-002 "Three Categories of
  Timestamps": system instant).
- Two rows of one file never target the same event: duplicate `id`/`apiImportId` keys are already
  rejected in phase 1 (`mapCsvRowToCommand.ts:381-385`). So one file never records two
  observations at the same time for one event.

### D4. Division tenant check

Phase 1 collects every well-formed division id in the file and makes one
`IDivisionRepository.findValidDivisionIds(ids, tenantId)` call on the pool, before the
transaction opens. This follows the single taxonomy read of 6d-1 D4 step 1: no transaction is
open yet, so NOD-12 does not apply.

A non-UUID id, or an id not in the returned set (unknown, or another tenant's), gives
`invalid_division` (phase per D10) on column `spatialFootprint`, with the offending id echoed as `value`.
Another tenant's id and a missing id give the same answer, so nothing is disclosed (6d-1 D2).

`RecordSpatialObservationUseCase` re-checks inside the transaction and stays authoritative. A
division deleted between the two checks surfaces as the row code `validation` (D10).

### D5. Attachment input format and rules (NOD-7)

The cell is a JSON array of items `{ id?, title, tag?, file_option, url?, file?: { name,
content_type? } }`, the shape of the legacy jsonb and the CA widget (`mapAttachmentsToWidgetShape.ts`).

Per item:

- `title` must be a string;
- `tag` that is not a list is normalised to `null`, as the form does. A list must hold objects
  with string `id` and `name` (shared `isAllowedAttachmentTag`, review fix R6), otherwise
  `invalid_attachments`;
- `id` is ignored, because the repository mints row ids
  (`DrizzleHazardousEventRepository.server.ts:199-202`).

`file_option`:

- **`"Link"`:** `url` must parse with WHATWG `new URL()` and have protocol `http:` or `https:`.
  This is the shared `isAllowedAttachmentUrl` (D12), the same predicate as `safeLinkHref`, so
  what imports is what the page renders as a link. Anything else, including an empty string, `javascript:` (A2) and `data:` (A6), is
  `invalid_attachment_url` with `value` echoed (OWASP XSS Prevention: "Allow-list http and HTTPS
  URLs only"). The check runs in the phase D10 gives. The result is `{ kind: "link" }`.
- **`"File"`:** `file.name` must be a string. Its basename (`sanitizeBasename`, the shared
  attachments rule) is the candidate `fileKey`. The item is accepted only as
  `{ kind: "existingFile", fileKey }` when that key is a `fileKey` of a File attachment the
  target event holds in CA today.
- `file.tenantPath`, the directory part of `file.name`, and `content_type` are never used for any
  decision (OWASP File Upload: the server, not the user, determines stored names and locations).

`file_reference_not_supported` (column `attachments`, the basename echoed as `value`) applies to
a File item that:

- is on a row taking the create path, because a new event holds no files;
- has a `temp` path segment, i.e. a staged upload, which a CSV must never promote;
- names a key the event does not hold.

Where the check runs (D10):

- in phase 1 for create mode;
- deferred to phase 2, after the unchanged check, for update and upsert-match rows, including the `temp` case. It reads the event's CA attachments from
  the export projection read inside the transaction (D6), never with a separate read;
- for upsert rows that take the create path, in `checkCreatePathRow`.

`resolveAttachmentsForWrite`'s own `ValidationError` therefore stays unreachable from the CSV
path. If it ever fires, it maps to `validation` (D10).

**Replace semantics:** a present, non-empty cell (OD-2) replaces the event's whole set (NOD-7). On
update the command carries `attachments` only when the set changed (D6), so an unchanged cell
leaves the rows and files alone.

### D6. Change detection (NOD-4, NOD-8 "only when the content differs")

`changedColumns` compares the two cells semantically, against the **export projection**, not raw
text, because a user's JSON need not match the exporter's formatting. This is the 6d-1 rule that
rows equal to the export are skipped first.

- **Footprint.** Parse both sides to `{ geometries, divisionIds }`. Division ids compare as a set.
  Geometries compare as a multiset of canonical JSON strings (keys sorted, numbers normalised as
  in OD-8, see "PostGIS output rule" below). Geometry order has no meaning in an observation, and the repository reads children
  without `ORDER BY`.
- **Attachments.** Parse both sides to items normalised to
  `{ type, title, url | fileKey, staged, tag (null ≡ []) }`, compare as a multiset, and ignore
  `id`. `staged` (a `temp` path segment) makes a staged reference count as a change.
  Attachment rows are rewritten with new ids on every update and read without `ORDER BY`
  (`:256-261`), so order is not stable.

**PostGIS output rule (task 2.2, pinned in `DrizzleHazardousEventRepository.test.ts`).** Probed
on PGlite (PostGIS 3.6.2) and, read-only, on the dev server (PostGIS 3.5.2), with identical
results. `ST_AsGeoJSON(ST_GeomFromGeoJSON(x))`:

- prints a coordinate whose magnitude is at most `1e-8`, or at least `1e15`, unrounded;
- otherwise takes the shortest round-trip decimal text and rounds it to 9 decimals, ties to
  even (`2.0000000005` → `2`, `0.1234567895` → `0.12345679`). `toFixed(9)` rounds the binary
  value instead and disagrees on such ties, so the comparator implements the text rule;
- drops a fourth ordinate, `bbox`, `crs` and foreign members, and keeps Z.

The comparator mirrors all of this. A cell the strict parser rejects compares as key-sorted
JSON, then as text, so any exported cell equals itself.

A changed footprint or attachment column counts as a field change (`plan.fieldsChanged`). That
puts it under the status-aware edit rule (`not_editable`) and the `not_migrated` rule, as every
other field.

### D7. Deferred file deletion (roadmap "Deferred file deletion"; NOD-7 "deleting files after commit")

`UpdateHazardousEventUseCase`:

- **Without `tx`:** unchanged. Files are deleted as the last step inside its own transaction, and
  `fileKeysToDelete` in the result is `[]`.
- **With `tx`:** `deleteAttachmentFiles` is **not** called. The result carries
  `fileKeysToDelete: readonly string[]`, the keys `resolveAttachmentsForWrite` returned.

`UpdateHazardousEventResult` gains `fileKeysToDelete`. The only caller passing `tx` is the
import.

`ImportHazardousEventsCsvUseCase`:

- collects `{ ownerId, fileKeys }` from each Update result;
- only after `transactionRunner.run` resolves (the outer commit), calls the existing
  `deleteAttachmentFiles(attachmentStoragePort, logger, tenantId, ownerId, fileKeys)` per event;
- deletes nothing when the run rejects.

`deleteAttachmentFiles` logs and swallows per-file failures (its Decision 7 addendum): the import
has committed, so a failure can only leave an orphan file, never a dangling row. The import gains
an `attachmentStoragePort: Pick<IAttachmentStoragePort, "delete">` dependency (DI in
`HazardousEventsModule.server.ts`).

The import never calls `promote`, because File items are references only (D5). A rolled-back
import therefore changes no file at all.

### D8. Export values (NOD-9, NOD-10; OD-6 for the fallback scope)

`spatialFootprint`:

- Source: the CA current observation (latest by `observation_time`). Without one, the legacy
  `hazardous_event_geom`/`_division` rows (OD-6).
- A recorded empty observation exports `[]`, so a cleared footprint is not resurrected from
  legacy rows.
- Format: one item per geometry, then one item per division. Division geometry and names are
  left out (OD-7):

  ```text
  { "map_option": "Map coordinates", "geojson": { "type": "Feature", "geometry": g, "properties": {} } }
  { "map_option": "Geographic level", "division_id": d, "geojson": { "type": "Feature", "geometry": null, "properties": { "division_id": d } } }
  ```

- Geometries come from `ST_AsGeoJSON(geom)` (default 9 decimal places).
- Items are in a deterministic order: geometries by canonical text, divisions by id.

`attachments`:

- Source: CA `hazardous_event_attachment` rows. Fallback: the legacy jsonb (OD-6).
- Format per item, Link or File:

  ```text
  { "title": t, "tag": tags, "file_option": "Link", "url": u }
  { "title": t, "tag": tags, "file_option": "File", "file": { "name": "/uploads/tenant-<tenantId>/hazardous-event/<eventId>/<fileKey>", "content_type": fileType } }
  ```

  That is the legacy jsonb path shape (observed in this tenant's rows), without `tenantPath`, so
  the export never re-emits the client-trusted field of A11/DEF-064.

- Fallback jsonb items are projected through the same shape, which drops `tenantPath`, `view` and
  `id`.
- Items are in a deterministic order by `(file_option, title, url | fileKey)`.

No event has data → `[]`. Cells go through the existing formula guard (`serializeCsv`, 6d-1 D8).
A JSON array always starts with `[`, so the guard is a no-op for these cells.

### D9. Repository projection

`HazardousEventExportRow` gains plain fields (application type, not Drizzle):

- `currentObservation: { observationTime: Date; geometries: unknown[]; divisionIds: string[] } | null`.
  `observationTime` was added during implementation: OD-9 compares it with the import time, and
  this projection is the only read the import makes (D6);
- `attachments: { type: "File" | "Link"; title; url; tag; fileKey; fileType }[]`;
- `legacyGeometries: unknown[]`;
- `legacyDivisionIds: string[]`;
- `legacyAttachments: unknown` (raw jsonb).

`findExportRows` adds correlated subqueries in the same single statement, keeping the consistent
snapshot the spec requires:

- the latest observation (a correlated subquery, `ORDER BY observation_time DESC LIMIT 1`), with
  `json_agg(ST_AsGeoJSON(geom))` and `json_agg(division_id)`;
- `json_agg` of attachment rows;
- `json_agg(ST_AsGeoJSON(geom))` of legacy geom rows;
- `json_agg(division_id)` of legacy division rows;
- `hazardous_event.attachments`.

Every subquery is keyed by the event id of a row already filtered by
`country_accounts_id = tenantId`. The signature (`tenantId, tx?`) is unchanged. Projection cost is
checked with `EXPLAIN (ANALYZE, BUFFERS)` on a realistic seed (task 9.3; roadmap "Geometry").

### D10. Error codes and where each is produced (ADR-003 Rule 4; 6d-1 D6)

**Phase rule.** This follows the 6d-1 deferred-error rule (implementation notes N5/M3, and NOD-4
"rows equal to the export projection are skipped first"):

- **Create mode:** every check below runs in phase 1, before any write.
- **Update and upsert rows:** only JSON syntax (a cell that is not parseable JSON) is checked in
  phase 1. Every content rule (array and item shape, geometry structure, division validity, URL
  scheme, File reference) is a **deferred** error. It is reported in phase 2, only when the row
  is not unchanged.
- **Upsert rows that take the create path:** the deferred errors are reported by
  `checkCreatePathRow`.

Why: the CA export can write content the stricter rules reject. Examples are a non-http Link
stored through the he-preview form (which has no scheme check), a legacy jsonb item with no
`file_option` (A7) on an unmigrated row, and a legacy division row of another tenant (DEF-005).
Rejecting these in phase 1 would make an exported file fail to re-import, which breaks the
round-trip requirement. Deferring keeps unchanged rows importable and still blocks every change
that would write such content.

The single `findValidDivisionIds` read (D4) still runs before the transaction, over every row's
ids, and its result is used in whichever phase applies.

| Code                           | Column             | Create mode | Update / upsert rows                         | `value` echoed                   |
| ------------------------------ | ------------------ | ----------- | -------------------------------------------- | -------------------------------- |
| `invalid_spatial_footprint`    | `spatialFootprint` | phase 1     | phase 1 for JSON syntax only; else deferred  | no (cell can be huge)            |
| `invalid_division`             | `spatialFootprint` | phase 1     | deferred                                     | the division id                  |
| `invalid_attachments`          | `attachments`      | phase 1     | phase 1 for JSON syntax only; else deferred  | no                               |
| `invalid_attachment_url`       | `attachments`      | phase 1     | deferred                                     | the URL (≤100 chars, D6 of 6d-1) |
| `file_reference_not_supported` | `attachments`      | phase 1     | deferred (create path: `checkCreatePathRow`) | the basename                     |

Domain errors raised by the delegated writes keep the 6d-1 mapping:

- `ConflictError` from the observation-time unique constraint → `conflict`;
- `ValidationError` (a division removed between phases, a geometry PostGIS rejects) → `validation`.

These are row errors, so the file rolls back. Deferred errors follow the unchanged check (NOD-4):
an unchanged row whose stored footprint holds a division since deleted, or a non-http link, still re-imports.

Copy goes under `csv.error.<code>` in EN and FR (ADR-001 namespaced keys). Echoed values are shown
as written (ADR-008).

### D11. Logging (ADR-004 "Log at Boundaries")

- Unchanged: one `hazardous_events.csv_imported` per committed file and the per-event
  `hazardous_event.created`/`.updated` lines.
- Create and Update already log `spatial_observation.recorded` when they delegate.
- A failed after-commit deletion logs `hazardous_event_attachment.delete_failed` at `error`
  (existing helper).
- No log line carries cell content, geometry or URL.

### D12. One shared Link URL-scheme validator for CSV and form (SA-1, NOD-7)

New pure application module `app/domains/hazardous-events/application/attachmentInputPolicy.ts`,
exporting `isAllowedAttachmentUrl(url: string): boolean`. It returns true only when WHATWG
`new URL(url)` parses and `protocol` is `http:` or `https:`. That is the predicate `safeLinkHref`
already uses at render. Because it sits in the application layer, both adapters import it inward
(ADR-009):

- **CSV import:** `attachmentsCsv.ts` calls it for every Link item and gives
  `invalid_attachment_url` (phase per D10).
- **he-preview form** (`new.tsx`, `edit.$id.tsx`):
  - A presentation helper, `presentation/web/attachmentFieldError.ts`, checks every
    `kind: "link"` item of `parseHazardousEventFormData`'s result. It runs right after parsing,
    before any guard that can write and before any use case call.
  - On a failure the action returns `{ success: false, fieldErrors: { attachments: [message] } }`,
    the existing inline field-error shape. The form already renders `fieldErrors.attachments`
    (`HazardousEventFormPage.tsx:240`).
  - The message is the new key `hazardous-events:form.attachments_invalid_url` (EN/FR, sentence
    case, no em dash). The action translates it through the request's i18next instance
    (`getInstance(context)`), which both actions already load with the `hazardous-events`
    namespace.
  - The routes call the helper and keep no inline business logic (write-route-adapter spec).
- When the widget sends no URL, the parser gives the Link item an empty string
  (`parseHazardousEventFormData.server.ts:90`). That empty URL is now rejected the same way;
  before, the domain accepted any string.
- **Consequence for existing data:** an edit-form save of an event that already holds a
  non-http(s) Link is refused until the user fixes or removes that link. Such a link may have been
  stored through the form before this change, or migrated. This is intended: the form resends the
  whole list, so saving would otherwise store the unsafe URL again.
- `attachmentLink.ts`'s `safeLinkHref` is **not** changed. It stays as render-time defence in
  depth for rows written before this change or by legacy routes. OWASP: React's own
  `javascript:` blocking "does not replace application-specific URL validation". Likewise,
  validating at write time does not replace checking on output.
- The domain entity (`HazardousEvent.validateAttachments`) is not changed: moving the rule there
  would make existing rows fail to rehydrate.
- **Review fix (user decision, SOLID F2):** the rule is also enforced inside
  `CreateHazardousEventUseCase` and `UpdateHazardousEventUseCase`
  (`assertAttachmentInputsAllowed`), on the incoming command only, so every caller, including a
  future REST controller, gets it. The form helper (renamed `attachmentFieldError.ts`, it now also
  checks tags) and the CSV import keep their earlier checks only for the translated message or
  row code; all of them call the single `isAllowedAttachmentUrl` / `isAllowedAttachmentTag`.

## UI: reference source and ground-truth checklist (Gate 9)

Reference type: **(a) a real existing page**, the 6d-1 CSV import page
(`HazardousEventCsvImportPage.tsx`) as archived with its Gate 9 report
(`openspec/changes/archive/2026-11-26-ca-he-csv-migration/evidence/gate-9-report.md`). Legacy
`csvImportScreen` stays the original parity source of 6d-1. Nothing else on the page changes.

A second, smaller surface is the he-preview create/edit form (SA-1). Reference type **(a) a real
existing page**, `HazardousEventFormPage.tsx` as shipped by 6c. Its attachments field already
renders `fieldErrors.attachments` through `HazardousEventFormFieldErrors`. The only change is one
new message, shown under the attachments field after a refused save. The EN draft is "Attachment
links must start with http:// or https://"; the FR draft goes to translator review. No layout,
component or other field changes.

| #   | Item                                                   | Before (6d-1)                                                                                                               | After (6d-2)                                                                                                               |
| --- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 1   | Layout wrapper, title, form, back link, template links | as 6d-1 Gate 9                                                                                                              | unchanged                                                                                                                  |
| 2   | Success region                                         | counts line, then the notice "N rows had spatial footprint or attachment data that was not imported." when any row had data | counts line only; the notice is never rendered                                                                             |
| 3   | Ignored-columns line                                   | listed `spatialFootprint`, `attachments` when present                                                                       | no longer lists them (they are mapped); still lists the read-only columns                                                  |
| 4   | Failure list                                           | "Line L, column C: message"                                                                                                 | same format; five new messages (D10), EN and FR, sentence case, no em dash                                                 |
| 5   | States                                                 | initial, submitting, success, failure, error boundary                                                                       | unchanged                                                                                                                  |
| 6   | Navigation affordance                                  | none from the list (OD-12 of 6d-1)                                                                                          | unchanged                                                                                                                  |
| 7   | Components                                             | `MainContainer`, legacy-parity components from `app/design-system/components/`                                              | unchanged; no new component                                                                                                |
| 8   | he-preview form, attachments field                     | no URL error possible; a non-http link is saved                                                                             | a refused save shows `form.attachments_invalid_url` under the field (EN/FR); entered values kept as for other field errors |

Evidence for Gate 9 (task 10):

- **9a:** `yarn check:design-system --change ca-he-csv-spatial-attachments` and `--verify-spec`.
- **9b:** `runWcag22A11yCheck` on the success state and on a failure state showing the new codes,
  EN and FR, and on the form with the attachments field error.
- **9c:** screenshots of the success state (no notice), of a failure state with
  `invalid_attachment_url`, and of the he-preview form showing the attachments URL field error, desktop and 375 px, in
  `test-results/gate-9/ca-he-csv-spatial-attachments/`. The report goes in
  `openspec/changes/ca-he-csv-spatial-attachments/evidence/gate-9-report.md`, audited by a fresh
  `visual-parity-reviewer`.

No ambiguity in the source.

## Test infrastructure

- **Unit (Vitest, colocated as 6d-1):**
  - `spatialFootprintCsv.test.ts`: every L-row shape, each RFC 7946 structural rule, round trip
    `format → parse`, canonical equality, OD-4/5/8 outcomes;
  - `attachmentInputPolicy.test.ts`: http/https accepted (any case); `javascript:`, `data:`,
    `ftp:`, `mailto:`, relative, empty and unparsable URLs rejected;
  - `attachmentFieldError.test.ts`: the presentation helper's field-error shape;
  - `attachmentsCsv.test.ts`: Link schemes, File reference rules including `temp`, tag
    normalisation, multiset equality, format shape without `tenantPath`;
  - additions to `hazardousEventCsvColumns.test.ts`, `mapCsvRowToCommand.test.ts`,
    `importRowPolicy.test.ts` and `exportRowCells.test.ts`.
- **PGlite (`yarn test:run2`)**, which has PostGIS (`tests/integration/db/setup.ts:3-21`):
  - `ImportHazardousEventsCsvUseCase.test.ts`:
    - other-tenant division → `invalid_division`, nothing written;
    - unchanged footprint records no observation;
    - `[]` clears with one empty observation, and records nothing when already empty;
    - Link and File reference cases;
    - a rolled-back import deletes no file and calls no `promote` (a fake
      `IAttachmentStoragePort` records calls);
    - deletion happens only after commit;
    - the concurrent-callers scenario.
  - `UpdateHazardousEventUseCase.test.ts`: with `tx`, the result has `fileKeysToDelete` and the
    fake port saw no `delete`; without `tx`, unchanged.
  - `DrizzleHazardousEventRepository.test.ts` (`tests/integration/db/queries/`, `import "../setup"`):
    - the projection fields;
    - the latest observation chosen;
    - tenant scope;
    - legacy fallback fields;
    - a P1-style pin of `ST_AsGeoJSON` precision (OD-8 evidence).
  - `ExportHazardousEventsCsvUseCase.test.ts` and `HazardousEventCsvRoundTrip.test.ts`: header,
    formats, fallbacks per OD-6, export→import all `unchanged`.
  - Route tests `HazardousEventCsvImportRoute.test.ts` and `HazardousEventCsvExportRoute.test.ts`.
  - Form route tests `HazardousEventNewRoute.test.ts` and `HazardousEventEditRoute.test.ts`:
    - a `javascript:` Link URL and an empty one return `fieldErrors.attachments` with the
      translated message;
    - no use case is called and no row is written;
    - an https link still saves.
- **DOM (`yarn test:dom`):** `HazardousEventCsvImportPage.dom.test.tsx`: the notice tests are
  replaced by "never rendered", plus the new messages. `csvLocales.test.ts` checks the key set.
- **E2E (Playwright):** `tests/e2e/hazardous-events/he-preview-csv.spec.ts`:
  - a legacy-format file with a Point footprint, a tenant division and an https Link imports, and
    the he-preview detail page shows the footprint and the link;
  - in `he-preview-attachments.spec.ts`, saving the form with a `javascript:` link shows the
    attachments field error and writes nothing;
  - export then re-import gives all `unchanged`;
  - axe checks.
  - Cleanup goes through the CA delete action, then asserts no orphan `workflow_instance` or
    spatial observation.
- **Real Postgres (`test:run3`):** not available on this machine (6d-1 known limitation). The
  concurrent scenario is covered by its outcome-only PGlite form.
- **Stryker:** only the new pure mappers `spatialFootprintCsv.ts` and `attachmentsCsv.ts`, and the
  URL validator `attachmentUrlPolicy.ts` (user decision, 2026-11-26), since merged into
  `attachmentInputPolicy.ts`.
  `mapCsvRowToCommand.ts` stays excluded for the known Babel crash (6d-1). Tooling limits go in
  this design, not in the register.

## Implementation notes (2026-11-26)

Recorded during implementation. None changes a resolved decision.

- **Task order.** The Red tests of 4.1/4.2 (footprint projection and cell) and of 7.4
  (attachment projection and cell) were written before the Green steps 3.5 and 7.3. The import's
  unchanged check and File check read the export projection, so those Green steps had to build
  it. Each test was seen failing first.
- **Copy for two codes in stage A.** `csvLocales.test.ts` lists every row code exhaustively, so
  `invalid_spatial_footprint` and `invalid_division` got their EN/FR copy in stage A, not in task
  8.2. The FR copy of all five codes and of `form.attachments_invalid_url` still needs
  translator review.
- **Deferred errors are row-wide.** As the spec text says ("only when the row is not
  unchanged"), once any supplied cell of an update or upsert row differs, the footprint and
  attachment content rules apply to the whole row. For example, editing only `description` on
  an exported row that holds an `ftp:` link gives `invalid_attachment_url`. Tests pin this for a
  link and for a division that moved to another tenant.
- **Order of the phase-2 attachment checks.** On update rows, the URL and File-reference checks
  run after `checkUpdateRow` (so after `not_migrated`, `not_editable`, `parent_multiple_causes`,
  `status_not_permitted` and OD-9). They use the projection read inside the transaction (D5).
- **Echoed values.** The 100-character limit is one constant,
  `MAX_ECHOED_CSV_VALUE_LENGTH` in `HazardousEventCsvImportResult.ts`, used by the mapper and the
  row policy. (The 6d-1 limit on echoed header names in `ImportHazardousEventsCsv.ts` is a
  separate constant of the same value.)
- **Concurrency (review fix).** The import now passes the projection's `updatedAt` to Update as
  `expectedUpdatedAt`, and Update rejects with `ConcurrentModificationError` when the stored value
  differs. PGlite has one connection, so the race tests serve the second import only its stale
  snapshot (`findExportRows`); Update reads the event fresh, as it would under READ COMMITTED once
  the first import committed. Before the fix that interleaving committed both changes; now the
  second import fails with `concurrent_modification` and `K` is deleted once.
- **`yarn i18n:extractor`** writes `locales/app/en.json` for the legacy `ctx.t` messages only. It
  produced no diff, because this change's keys are in the `hazardous-events` namespace.
- **Mutation testing (task 10.11).** `attachmentUrlPolicy.ts` scored 100% (8/8) and
  `attachmentsCsv.ts` 80.2% (77/96). Tests were added for its real gaps: a File-shaped item with
  an unknown or missing `file_option`, distinct fallback comparison keys, null export values, and
  the order of malformed legacy items. `spatialFootprintCsv.ts` could not be measured. Stryker's
  instrumenter crashes on the TypeScript function type `(v: unknown) => boolean` (Babel 7 parser
  output printed by Babel 8's generator). This is the DEF-041 root cause with a new trigger, so it
  gets no new register row, and the code is not restructured for the tool. Its 84 unit tests and
  the PostGIS pin tests are the coverage.
- **Mutation re-run after the review fixes.** `attachmentsCsv.ts`: 87.7% (93 killed, 10
  survived, 3 no coverage; 131 rejected by the type checker). One survivor was a real gap (the URL
  inside the sort key) and got a test. `attachmentUrlPolicy.ts` was unchanged and not re-run.
  The other survivors are equivalent or unreachable:
  - the comparator's `0`/`1` branch, which V8's sort never distinguishes;
  - an `url` key set to `undefined`, which `JSON.stringify` drops;
  - `value !== null` in `isObject`, now masked by the parser's catch, with the same result;
  - the `textOf` and parser catch fallbacks, which JSON data cannot reach;
  - the module constant `STAGED_SEGMENT`, which is not re-evaluated under this setup.
- **Unlisted file.** `presentation/web/csv/serializeCsv.test.ts` pinned the 6d-1 header; its
  expectation now includes the two appended columns.

## Consolidation (user decision, 2026-11-27)

`attachmentUrlPolicy.ts`, `attachmentTagPolicy.ts` and `assertAttachmentInputsAllowed.ts` held
one concept with the same consumers, so they were merged by a pure move into
`application/attachmentInputPolicy.ts`, with their tests in `attachmentInputPolicy.test.ts`.
Exported names and behaviour are unchanged. The mutation scores above are per the old file names
and were not re-run after the move.

## Review fixes (user decisions, 2026-11-26)

Applied after Gates 5-10, TDD Red then Green for each:

- **R1 (Gate 10 #1):** geometry types are looked up in a `Map`, so inherited names (`valueOf`,
  `__proto__`, `toString`, `constructor`) are `invalid_spatial_footprint`, never a 500.
- **R2 (Gate 10 #2):** GeometryCollections may nest at most 8 levels (`MAX_COLLECTION_DEPTH`;
  RFC 7946 §3.1.8 discourages nesting). A `tag` must be a flat list of `{ id, name }` strings,
  which bounds its depth to 2. Both parsers turn any thrown error into `{ ok: false }`, and both
  comparators fall back to text when key-sorting overflows, so hostile input is a row error.
- **R3 (Gate 8 F3):** the comparator pads a 2D position with Z=0 when any position of the
  geometry, collection members included, has Z, as PostGIS stores it (pinned in the PGlite round
  trip test).
- **R4 (Gate 9 F1):** the attachments field drops `!mb-0` while it shows an error, so the error no
  longer sits on the "Record originator" label (existing classes only; asserted in the DOM and
  E2E tests).
- **R6 (Gate 8 F1):** `tag` elements must be `{ id: string, name: string }`: a CSV row error, a
  form field error (`form.attachments_invalid_tag`), and a use-case `ValidationError`. The rule is
  objects with string fields, not bare strings, because that is the stored and rendered shape.
- **Concurrency:** see the implementation note above (`expectedUpdatedAt`).
- **Gate 10 #3-#5:** a loop replaces the spread for large FeatureCollections; division ids are
  checked with one `uuid[]` array parameter (`findValidDivisionIds`, `assertDivisionIdsInTenant`)
  and division links are inserted in chunks of 10,000, so no count hits the 65,535 bind-parameter
  limit; legacy jsonb sort keys use a safe stringification (a `toString` key no longer throws).
- **Gate 8 F2, F8, F12:** attachments that tie on (file_option, title, url or file name) are
  ordered by their full content; `planCreatePathRow` returns the create-path inputs, removing the
  unreachable re-check in the import; an empty Link URL is not echoed.
- **SOLID F2:** see D12 above. **Copy:** the form message ends with a full stop (EN and FR).

Accepted without code change (user decisions):

- **Gate 9 F2:** the 3.99:1 contrast of the shared legacy `.dts-field-error-list` red is recorded
  on DEF-068 (HE UI upgrade); no CSS change here.
- **Gate 8 F4:** OD-9 compares observation times read through JS `Date` (milliseconds); a
  sub-millisecond later observation (only possible from non-JS writers such as a backfill using
  `now()`) reads as equal. See Risks.
- **Gate 8 F9:** the projection's JSON is decoded with unchecked casts; its shape is fixed by the
  `json_build_object` in the same statement. See Risks.
- **SOLID, accepted as-is:**
  - F1: the PostGIS canonical form lives in `spatialFootprintCsv.ts`.
  - F3: a caller `tx` decides whether Update deletes files or returns them.
  - F4: `cellEquals` is an `if` chain.
  - F5: `importRowPolicy.ts` and `mapCsvRowToCommand.ts` hold several concerns.
  - F6: the export file path writes the `hazardous-event` segment literally.
  - F7: small helpers are duplicated across the two mappers.
  - F8: `findExportRows` inlines its four subqueries.
- **FR copy:** the five new `csv.error.*` messages and both form messages need translator review
  (user follow-up).
- **Dev DB:** the two `audit_logs` rows from the Gate 9 import stay (append-only by design).

## Deferred register evaluation

| Row                                        | Outcome                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DEF-005                                    | **In scope for the CA CSV path** (D4). The row itself stays open: its close condition is the retirement of the legacy function at Phase 7. No register edit.                                                                                                                                                                    |
| DEF-061                                    | **Related, not resolved.** Export reads the legacy jsonb as a fallback (OD-6), but DEF-061 is about CA delete orphaning jsonb-only files, which this change does not touch. No register edit.                                                                                                                                   |
| DEF-064                                    | **CA side handled** (D5, D7: no client path, no `tenantPath`, after-commit deletion). **Appended 2026-11-26 (user approval, T-1.2):** A11 (the tenant is taken from a `tenant-<id>` segment of `file.name`), A12 (`save` unlinks unnamed files) and L13 (an update file with no `spatialFootprint` column wipes the footprint). |
| DEF-012                                    | Not affected: footprint and attachment subqueries are keyed by an event id already tenant-filtered; neither table can link two tenants.                                                                                                                                                                                         |
| DEF-062                                    | Not folded (HE focus ring, DEF-068 iteration). The page's links are unchanged.                                                                                                                                                                                                                                                  |
| DEF-068, DEF-053, DEF-050/051, DEF-066/067 | Not folded (user instruction).                                                                                                                                                                                                                                                                                                  |
| New?                                       | The he-preview **form** accepted any Link scheme on write (render is protected by `safeLinkHref`). **Folded in** by user decision SA-1 (D12); no register row is needed.                                                                                                                                                        |

## Scope and size

| Area                                                  | New                                                                            | Changed                                                                                              |
| ----------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Pure mappers and URL validator                        | 3 (`spatialFootprintCsv`, `attachmentsCsv`, `attachmentInputPolicy`) + 3 tests | 4 (`hazardousEventCsvColumns`, `mapCsvRowToCommand`, `importRowPolicy`, `exportRowCells`)            |
| DTOs                                                  | 0                                                                              | 2                                                                                                    |
| Use cases                                             | 0                                                                              | 2 (Import, Update)                                                                                   |
| Port doc, repository, module                          | 0                                                                              | 3                                                                                                    |
| Presentation (CSV page, form helper), routes, locales | 1 (`attachmentFieldError`) + 1 test                                            | 5 (CSV page, `new.tsx`, `edit.$id.tsx`, EN, FR)                                                      |
| Tests                                                 | 0                                                                              | about 17 (four unit, six PGlite CSV incl. two route, two form route, DOM, locales, two E2E, harness) |

That is about 8 new and 33 changed files (41 in all), about 76% of 6d-1's 54 by file count. Most
changes are additions to existing files; the new logic is concentrated in the two mappers and the
URL validator. The user decided to build it as one intent (OD-1).

## Resolved decisions (user, 2026-11-26)

| ID    | Decision                                 | Outcome                                                                                                                                                                                                                                                                                                                                                                          |
| ----- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OD-1  | Split 6d-2?                              | **Not split.** 6d-2 is built as one intent. Both halves change the same files (column contract, mapper, `importRowPolicy`, import use case, export projection, page notice, locales), every other decision is settled, and splitting would double the gates, archives and PRs. tasks.md keeps A (spatial footprint) and B (attachments) as sequential stages within this change. |
| OD-2  | Empty cell                               | As recommended: an empty cell, or an absent column, means not supplied. Only `[]` clears.                                                                                                                                                                                                                                                                                        |
| OD-3  | Input legacy dropped silently            | As recommended: each case is a row error (`invalid_spatial_footprint`/`invalid_attachments`). The top-level `division_id` (L4) is accepted.                                                                                                                                                                                                                                      |
| OD-4  | OGC-invalid, structurally valid geometry | As recommended: stored as given, with no `ST_MakeValid`.                                                                                                                                                                                                                                                                                                                         |
| OD-5  | FeatureCollection                        | As recommended: one geometry per feature.                                                                                                                                                                                                                                                                                                                                        |
| OD-6  | Export fallback scope (refines NOD-9)    | As recommended: the footprint falls back to legacy rows when the event has no CA observation at all; attachments fall back to the legacy jsonb only for unmigrated rows (null `specific_hazard_id`).                                                                                                                                                                             |
| OD-7  | Export item shape                        | As recommended: item titles are not kept or exported, and divisions are exported as the id only.                                                                                                                                                                                                                                                                                 |
| OD-8  | Precision of the unchanged check         | As recommended: coordinates compare at PostGIS output precision. A PGlite test pins the exact rounding before the comparator is written (task 2.2).                                                                                                                                                                                                                              |
| OD-9  | Current observation dated after import   | As recommended: row error `conflict` on `spatialFootprint`.                                                                                                                                                                                                                                                                                                                      |
| T-1.2 | DEF-064 append                           | Approved and done: A11, A12 and L13 appended to the DEF-064 row text.                                                                                                                                                                                                                                                                                                            |
| SA-1  | Scope addition: form Link-scheme gap     | **Approved scope addition.** One shared write-time URL-scheme validator (http/https only, NOD-7) is used by both the CSV import and the he-preview create/edit form save. The form returns a translated field error (EN/FR). Render-time `safeLinkHref` stays as defence in depth (D12).                                                                                         |

No open decisions remain.

## Risks / Trade-offs

- **[Cell size]** A large footprint can pass 32,767 characters and be truncated by Excel on
  save. → Re-import then fails `invalid_spatial_footprint`, never stores a truncated geometry;
  OD-7 keeps division items small.
- **[New compatibility breaks]** OD-2/OD-3/OD-4 outcomes and the `invalid_division`/URL/File rules
  reject rows legacy accepted. → Each is a specific row error with line and column; release notes
  at the Phase 7 cutover (6d-1 Risks).
- **[Long transactions]** Spatial writes add about 3-4 statements per row with a footprint (lookups,
  observation, children). → Same OD-15 bound as 6d-1; measured in task 9.3 (below).
- **[Export projection cost]** More correlated subqueries. → Measured in task 9.3 (below). The
  latest observation is a correlated scalar subquery (`ORDER BY observation_time DESC LIMIT 1`)
  rather than a `LATERAL`; the plan uses the existing indexes.
- **Task 9.3 measurements (2026-11-26).** Real PostgreSQL with PostGIS (the Playwright server),
  in a throwaway database created, migrated and dropped for the run. Seed: 3,000 events in one
  tenant, each with one observation holding a 201-vertex polygon and one division, and two Link
  attachments.
  - `findExportRows`: 674 ms for 3,000 rows. `EXPLAIN (ANALYZE, BUFFERS)`: 277.8 ms execution,
    0.7 ms planning, 39,069 shared buffer hits. The observation subquery runs an index scan
    backward on `hazardous_event_spatial_observation_event_id_time_unique`, and its children use
    the `..._geom_observation_id_idx` and `..._division_observation_id_idx` indexes (about
    0.05 ms per event).
  - Export use case, serialize and re-parse: 2.6 s, 19.6 MB.
  - Re-import of that export in update mode: 4.3 s, all 3,000 rows `unchanged`. This shows that
    real-driver `ST_AsGeoJSON` output compares equal to itself.
  - Import of 1,000 changed 200-vertex footprints in update mode: 30.9 s (about 31 ms per row,
    one transaction).
  - For comparison, the 6d-1 E2E large file (2,000 creates, no footprints) took 83 s, and the
    export of 2,004 rows took 1.2 s with the extended projection.
- **[After-commit deletion failure]** The process could stop between commit and deletion. → At
  worst an orphan file, the outcome `deleteAttachmentFiles` already accepts; never a dangling row.
- **[Concurrent imports]** Two imports changing one event: Update's check of the import's
  `expectedUpdatedAt`, then its optimistic lock, rejects the later one
  (`concurrent_modification`), and its files are not deleted. Two observations at the same instant
  hit the unique constraint (`conflict`).
- **[OD-9 precision]** Accepted: observation times are compared in milliseconds; see "Review
  fixes".
- **[Unchecked projection casts]** Accepted: the decoded JSON shape is fixed by the same SQL
  statement; a schema change there must update `toExportObservation`.
- **[Downstream consumers]** Two more trailing columns (NOD-10 residual, 6d-1 task 1.5) are still
  a human follow-up.

## Migration Plan

- No DB migration. Deploying changes the hidden he-preview CSV routes only; legacy routes are
  untouched.
- Rollback means reverting the change. Update's `fileKeysToDelete` is additive, and its no-`tx`
  path is unchanged.
- Live-run cleanup is recorded above.

## Sources

- RFC 7946, The GeoJSON Format (https://www.rfc-editor.org/rfc/rfc7946):
  - §3.1.1 positions: "two or more elements", longitude then latitude;
  - §3.1.6 linear ring: "closed LineString with four or more positions", and "parsers SHOULD NOT
    reject Polygons that do not follow the right-hand rule";
  - §3.1.8 GeometryCollection "SHOULD avoid nested", and Appendix B.2 "used sparingly";
  - §3.1.9 antimeridian;
  - §3.2 a Feature's geometry may be null;
  - §3.3 FeatureCollection;
  - §4 WGS 84;
  - §11.2 precision.
- PostGIS 3.5 `ST_AsGeoJSON` (https://postgis.net/docs/ST_AsGeoJSON.html): `maxdecimaldigits`
  default 9. `ST_GeomFromGeoJSON` (https://postgis.net/docs/ST_GeomFromGeoJSON.html): "works only
  for JSON Geometry fragments", SRID defaults to 4326 since 3.0, keeps Z. `ST_MakeValid`
  (https://postgis.net/docs/ST_MakeValid.html): "without losing any of the input vertices";
  "Single polygons may become multi-geometries". Installed version observed: PostGIS 3.5.2 (P1).
- OWASP Cross Site Scripting Prevention Cheat Sheet: "Allow-list http and HTTPS URLs only";
  "React 19 blocks `javascript:` URLs in `src` and `href`, but this does not replace
  application-specific URL validation".
  https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html
- OWASP File Upload Cheat Sheet: "Change the filename to something generated by the
  application"; "Character rules alone don't prevent traversal, so also check the final path".
  https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html
- WHATWG URL Standard (`new URL()` parsing and `protocol`): https://url.spec.whatwg.org/
- Microsoft, Excel specifications and limits: "Total number of characters that a cell can contain:
  32,767 characters".
  https://support.microsoft.com/en-us/office/excel-specifications-and-limits-1672b34d-7043-467e-8e27-269d656771c3
- 6d-1 design and specs: `openspec/changes/archive/2026-11-26-ca-he-csv-migration/design.md`
  (D3-D9, D15, NOD-4/7/8/9/10/12, S1-S6, A1-A5, Risks).
- Project ADRs:
  - ADR-002 "Three Categories of Timestamps";
  - ADR-003 "Layer 2 — Application Layer", "Error Response Envelope", "Rules" (Rule 4);
  - ADR-004 "Log Level Discipline", "Log at Boundaries", "Mandatory Fields in Every Log Line";
  - ADR-007 "Decision";
  - ADR-008 "Decision";
  - ADR-009 "Decision";
  - ADR-001 namespaced keys;
  - ADR-006 is not used (unapproved draft).
