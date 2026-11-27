## Why

6d-1 (`ca-he-csv-migration`, archived 2026-11-26) moved Hazardous Events CSV import and export onto
the Clean Architecture use cases. It accepted the legacy `spatialFootprint` and `attachments`
columns but ignored them, with a notice (RD-1). Existing tenants onboard by importing records from
other systems, and those records carry footprints and attachment links. Until these columns are
mapped, an onboarding file loses that data on the CA path, and the CA export cannot round-trip it.

The legacy path also mishandles these columns. Live runs on 2026-11-24 and 2026-11-26 (design.md
"Legacy behaviour observed live"):

- divisions are linked with no tenant check (DEF-005); an unknown division is dropped silently;
- `javascript:` and `data:` links are stored;
- a File item naming a missing file is stored as a dangling path;
- an update with no `spatialFootprint` column wipes the footprint;
- several malformed inputs are silently dropped or give "Server error";
- export never writes either column.

The CA he-preview form has the same Link gap: it stores any URL scheme. Only the render-time
`safeLinkHref` check keeps it from becoming a live link.

This change is roadmap intent **6d-2**.

## What Changes

- **Import `spatialFootprint`** (NOD-8). The cell is legacy footprint JSON: `Map coordinates`
  items with a Feature, FeatureCollection or bare geometry, and `Geographic level` items naming a
  division.
  - It becomes one CA spatial observation, timed at the import, through the Create/Update
    delegation to `RecordSpatialObservationUseCase` inside the import transaction.
  - Divisions are checked against the session tenant (`IDivisionRepository.findValidDivisionIds`).
    An unknown or other-tenant division is the row error `invalid_division`.
  - `[]` on update clears the footprint by recording an empty observation, but only when the
    current footprint is non-empty.
  - An unchanged footprint records nothing.
- **Import `attachments`** (NOD-7):
  - Link items are http/https only, otherwise row error `invalid_attachment_url`. The check is
    the shared validator below.
  - File items are accepted only as references to a file the event already holds, otherwise
    `file_reference_not_supported`. A CSV never stages or promotes a file.
  - A present cell replaces the event's set.
- **Shared Link URL-scheme validator** (user-approved scope addition SA-1). One pure
  application rule (http/https only, NOD-7) is used by both the CSV import and the he-preview
  create/edit form save. On the form, a non-http(s) or empty Link URL returns a translated field
  error on the attachments field (EN/FR) before anything is written. Render-time `safeLinkHref`
  stays as defence in depth.
- **Deferred file deletion.** When a caller transaction is given, `UpdateHazardousEventUseCase`
  no longer deletes removed attachment files itself. It returns their keys, and the import deletes
  them only after its transaction commits. A rolled-back import deletes nothing.
- **Export** (NOD-9, NOD-10) appends `spatialFootprint` and `attachments` after `parent`, in the
  legacy JSON formats, from the CA data with legacy fallbacks. The footprint falls back when the event has no CA
  observation; attachments fall back only for unmigrated rows (OD-6).
- **New row error codes:** `invalid_spatial_footprint`, `invalid_division`, `invalid_attachments`,
  `invalid_attachment_url`, `file_reference_not_supported`.
- **No longer done:** the 6d-1 "accepted and ignored" behaviour, its per-file notice
  (`skippedDataNotice`) and its two locale keys are removed.
- **Changed from legacy** (decided by the user on 2026-11-26, design.md "Resolved decisions"):
  - footprint or attachment input that legacy dropped silently becomes a row error (OD-3);
  - a geometry that is structurally broken (legacy: "Server error") becomes a row error. One that
    is structurally valid but OGC-invalid is stored as given, not repaired with `ST_MakeValid`
    (OD-4);
  - a FeatureCollection becomes one geometry per feature, not one GeometryCollection (OD-5);
  - an empty cell means "not supplied" instead of legacy's row error (OD-2).
- **Not changed:**
  - the legacy CSV routes stay until Phase 7;
  - the HE pages keep legacy styling until DEF-068;
  - no legacy file is edited.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `hazardous-event-csv-import`: the "accepted and ignored in 6d-1" requirement is removed. The
  footprint and attachment mapping rules, division tenant check, unchanged comparison,
  after-commit file deletion and new row codes are added.
- `hazardous-event-csv-export`: the header requirement appends `spatialFootprint` and
  `attachments`. Their value and fallback rules are added.
- `update-hazardous-event`: the caller-transaction requirement now says removed attachment files
  are returned to the caller, not deleted, when `tx` is given.
- `hazardous-event-write-route-adapter`: the create and edit actions refuse a non-http(s) Link
  attachment with a translated field error, before any write.
- `update-hazardous-event` (second requirement): removed files are deleted by the use case only
  without a caller `tx`.
- `hazardous-event-repository-port`: `findExportRows` also returns the current spatial
  observation, CA attachments and the legacy footprint and attachment fallbacks.

## Impact

Files expected to change, one-line reason each:

- `app/domains/hazardous-events/application/csv/spatialFootprintCsv.ts` (new): pure legacy
  footprint JSON parsing to geometries and divisionIds, formatting for export, and canonical
  comparison.
- `app/domains/hazardous-events/application/csv/attachmentsCsv.ts` (new): pure legacy attachment
  JSON parsing to `HazardousEventAttachmentInput` (never `newFile`), formatting for export, and
  canonical comparison.
- `app/domains/hazardous-events/application/attachmentInputPolicy.ts` (new): the shared pure attachment rules.
  - `isAllowedAttachmentUrl` (http/https only), used by CSV and the form.
  - `isAllowedAttachmentTag` (`null` or a list of `{ id, name }` strings, review fix).
  - `assertAttachmentInputsAllowed`, both rules as a `ValidationError`, called by
    `CreateHazardousEvent.ts` and `UpdateHazardousEvent.ts` so every caller gets them (review fix).
- `app/domains/hazardous-events/presentation/web/attachmentFieldError.ts` (new): maps a
  failed Link URL or tag on the parsed form to the attachments field error.
- `app/domains/hazardous-events/presentation/web/HazardousEventFormPage.tsx` (review fix): the
  attachments field keeps its bottom margin while it shows an error.
- `app/domains/hazardous-events/infrastructure/DrizzleDivisionRepository.server.ts` (review fix):
  division ids bound as one array parameter, so a large file never hits the bind-parameter
  limit.
- `app/routes/$lang+/_authenticated+/he-preview+/new.tsx` and `edit.$id.tsx`: call the helper
  right after parsing.
- `app/domains/hazardous-events/application/csv/hazardousEventCsvColumns.ts`: the two columns
  become mapped; `EXPORT_HEADER` appends them; `NOT_YET_IMPORTED_COLUMNS` is removed.
- `app/domains/hazardous-events/application/csv/mapCsvRowToCommand.ts`: phase-1 parsing, the
  division-id collection and the new row codes.
- `app/domains/hazardous-events/application/csv/importRowPolicy.ts`: semantic change detection
  for the two columns, File-reference check, and command building with `spatialObservation` and
  `attachments`.
- `app/domains/hazardous-events/application/csv/exportRowCells.ts`: the two appended cells.
- `app/domains/hazardous-events/application/dto/HazardousEventExportRow.ts`: footprint,
  attachment and fallback fields.
- `app/domains/hazardous-events/application/dto/HazardousEventCsvImportResult.ts`: new codes;
  `skippedDataNotice` removed.
- `app/domains/hazardous-events/application/use-cases/ImportHazardousEventsCsv.ts`: the phase-1
  division read, import time, and after-commit deletion.
- `app/domains/hazardous-events/application/use-cases/UpdateHazardousEvent.ts`: under a caller
  `tx`, returns `fileKeysToDelete` instead of deleting.
- `app/domains/hazardous-events/application/ports/IHazardousEventRepository.ts`: the
  `findExportRows` doc comment only (the signature is unchanged).
- `app/domains/hazardous-events/infrastructure/DrizzleHazardousEventRepository.server.ts`:
  `findExportRows` reads the current observation, attachments and legacy fallbacks.
- `app/domains/hazardous-events/infrastructure/HazardousEventsModule.server.ts`: wires the
  division repository and attachment storage port into the import.
- `app/domains/hazardous-events/presentation/web/csv/HazardousEventCsvImportPage.tsx`: the notice
  is removed.
- `locales/en/hazardous-events.json`, `locales/fr/hazardous-events.json`: the five new
  `csv.error.*` keys and `form.attachments_invalid_url`; the two `csv.skipped_data_notice_*` keys
  are removed.
- Tests: unit, PGlite, DOM and Playwright (design.md "Test infrastructure").

DB migration: **none**. Every table used already exists: the `hazardous_event_spatial_observation*`
tables, `hazardous_event_attachment`, legacy `hazardous_event_geom`/`_division`, and the
`hazardous_event.attachments` jsonb.

Test approach:

- unit (Vitest) for the two pure mappers in both directions, the URL validator, the form helper
  and the row policy;
- PGlite (`yarn test:run2`) for the import and export use cases, Update's deferred deletion, the
  repository projection, the CSV routes and the create/edit form routes;
- DOM (`yarn test:dom`) for the notice removal;
- Playwright (`yarn test:e2e`) for a legacy file with a footprint and a Link attachment, and the
  export round trip, and for the form's field error;
- Stryker scoped to the two new pure mappers and the URL validator only.

Security / multi-tenancy: **security-sensitive.**

- Division ids are checked against the session tenant (closes DEF-005 for the CA CSV path).
- Link URLs are allow-listed to http/https on every CA write path, CSV and form (OWASP XSS
  Prevention).
- File items can only name a file the event already holds. No client path, `tenantPath` or temp
  file is ever used; promote and delete go through `IAttachmentStoragePort` with the
  session-derived tenant.
- Files are deleted only after the import commits.

UI classification: `legacy-exempt`. The visual changes are:

- the 6d-1 notice no longer appears on the CSV page;
- the CSV page gains five translated row-error messages;
- the he-preview form can show one new translated attachments field error.

The feature-prototype
`not-required` exception was approved for 6d (OD-13).

Size: about 8 new and 33 changed source and test files (41 in all), about 76% of 6d-1 by file
count. Most changes are additions to existing files. The user decided to build it as one intent,
with tasks in two sequential stages, A (footprint) and B (attachments) (OD-1).
