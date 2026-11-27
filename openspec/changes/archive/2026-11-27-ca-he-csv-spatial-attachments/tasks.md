## 1. Blocking decisions (human, before any code)

- [x] 1.1 (user, 2026-11-26) OD-1 to OD-9 resolved and recorded in design.md "Resolved
      decisions": OD-1 = one intent, not split; A (footprint) and B (attachments) are sequential
      stages of this change. OD-2 to OD-9 are approved as recommended, and the spec deltas match
      them. Scope addition SA-1 (shared Link URL-scheme validator for CSV and the he-preview form)
      approved. **Verify:** `openspec validate ca-he-csv-spatial-attachments --strict` passes.
- [x] 1.2 (user approval 2026-11-26; done) Register: A11 (tenant from a `tenant-<id>` segment of
      `file.name`), A12 (legacy save unlinks unnamed files) and L13 (an update file with no
      `spatialFootprint` column wipes the footprint) appended to the DEF-064 row text. The form
      Link-scheme gap is folded in (SA-1), so it gets no register row. **Verify:** diff of
      `_docs/refactoring-plan/deferred-items-register.md` reviewed.
- [x] 1.3 Gate 9 classification check: **Verify:**
      `yarn check:design-system --verify-spec --change ca-he-csv-spatial-attachments --base origin/dev`
      passes with `legacy-exempt`.

## 2. A: Footprint mapper (pure, TDD)

- [x] 2.1 Red: write `app/domains/hazardous-events/application/csv/spatialFootprintCsv.test.ts`
      covering:
  - parse of every live shape: L1 Feature, L2 FeatureCollection per OD-5, L3 bare geometry,
    L4 top-level `division_id`, `geojson.properties.division_id`;
  - the OD-3 rejections (L8 object, L12 unknown `map_option`, missing geometry, missing
    division id);
  - the RFC 7946 structural rules (position ≥2 finite numbers, LineString ≥2, ring closed and
    ≥4), with wrong winding accepted, and the OD-4 outcome for a bowtie;
  - duplicate division ids collapsed;
  - `formatSpatialFootprintCell` shape (D8, minimal division item, deterministic order);
  - `parse(format(x))` round trip;
  - `spatialFootprintEquals` (order-free, set and multiset semantics, the OD-8 precision
    rule).

  **Verify:** `yarn vitest run app/domains/hazardous-events/application/csv/spatialFootprintCsv.test.ts`
  fails for the right reason.

- [x] 2.2 Pin OD-8 evidence first: add a PGlite assertion in
      `tests/integration/db/queries/DrizzleHazardousEventRepository.test.ts` (`import "../setup"`)
      of `ST_AsGeoJSON(ST_GeomFromGeoJSON(x))` for a 10+-decimal coordinate. It records PostGIS's
      exact rounding, which the comparator must mirror. **Verify:** `yarn vitest run tests/integration/db/queries/DrizzleHazardousEventRepository.test.ts`.
- [x] 2.3 Green: implement `spatialFootprintCsv.ts`. **Verify:** 2.1 passes.
- [x] 2.4 Refactor: comments explain why; no presentation imports (ADR-009). **Verify:** 2.1
      still green; `yarn tsc`.

## 3. A: Footprint import wiring (TDD)

- [x] 3.1 Red: extend `hazardousEventCsvColumns.test.ts`:
  - `spatialFootprint` is mapped in all modes;
  - it is no longer reported as ignored;
  - `EXPORT_HEADER` ends `parent,spatialFootprint`, or `…,attachments` once section 7 lands.

  **Verify:** `yarn vitest run app/domains/hazardous-events/application/csv/hazardousEventCsvColumns.test.ts` fails.

- [x] 3.2 Red: extend `mapCsvRowToCommand.test.ts`:
  - `invalid_spatial_footprint` and its line/column;
  - collection of division ids for the phase-1 read;
  - `invalid_division` for a non-UUID id and for an id missing from the supplied valid set,
    with the value echoed;
  - empty cell per OD-2;
  - on update and upsert rows only JSON syntax is checked in phase 1; every other footprint
    rule, `invalid_division` included, is deferred until the row is not unchanged (D10, NOD-4).

  **Verify:** `yarn vitest run app/domains/hazardous-events/application/csv/mapCsvRowToCommand.test.ts` fails.

- [x] 3.3 Red: extend `importRowPolicy.test.ts`:
  - `changedColumns` uses the footprint semantics (D6);
  - `[]` against an empty export is no change;
  - `toCreateCommand`/`toUpdateCommand` add `spatialObservation` with `importTime` only when
    non-empty or changed;
  - `[]` on update yields an empty observation;
  - the OD-9 rule.

  **Verify:** `yarn vitest run app/domains/hazardous-events/application/csv/importRowPolicy.test.ts` fails.

- [x] 3.4 Red (PGlite): in `tests/integration/domains/hazardous-events/ImportHazardousEventsCsvUseCase.test.ts`:
  - a legacy footprint creates one observation at the import time;
  - another tenant's division (seed tenant T2 with a division) gives `invalid_division` and
    nothing is written;
  - an unchanged re-import records no observation;
  - `[]` clears once, then is unchanged;
  - a changed footprint on a PUBLISHED event gives `not_editable`;
  - the update-without-columns scenario (no L13 wipe).

  **Verify:** `yarn vitest run tests/integration/domains/hazardous-events/ImportHazardousEventsCsvUseCase.test.ts` fails.

- [x] 3.5 Green: implement in `hazardousEventCsvColumns.ts`, `mapCsvRowToCommand.ts`,
      `importRowPolicy.ts`, `HazardousEventCsvImportResult.ts` (the two codes) and
      `ImportHazardousEventsCsv.ts`:
  - one `findValidDivisionIds` call before the transaction;
  - one `importTime` per file;
  - `IDivisionRepository` added to the constructor and to
    `HazardousEventsModule.server.ts` wiring.

  **Verify:** 3.1-3.4 pass.

- [x] 3.6 Refactor. **Verify:** 3.1-3.4 green; `yarn tsc`.

## 4. A: Footprint export (TDD)

- [x] 4.1 Red (PGlite): `DrizzleHazardousEventRepository.test.ts`:
  - `currentObservation` is the latest by observation time when the later one is inserted
    first;
  - `null` without an observation;
  - legacy geometry and division fallback fields;
  - tenant scope.

  **Verify:** `yarn vitest run tests/integration/db/queries/DrizzleHazardousEventRepository.test.ts` fails.

- [x] 4.2 Red: `exportRowCells.test.ts`:
  - the `spatialFootprint` cell from the CA observation;
  - `[]` for an empty observation, with no legacy resurrection;
  - legacy fallback per OD-6;
  - deterministic order.

  **Verify:** `yarn vitest run app/domains/hazardous-events/application/csv/exportRowCells.test.ts` fails.

- [x] 4.3 Green: `HazardousEventExportRow.ts` fields, the `findExportRows` SQL (D9), the
      `exportRowCells.ts` cell, and the `IHazardousEventRepository.ts` doc. **Verify:** 4.1-4.2
      pass.
- [x] 4.4 Red then Green (PGlite): `ExportHazardousEventsCsvUseCase.test.ts` and
      `HazardousEventCsvRoundTrip.test.ts`: footprint export and re-import all `unchanged`.
      **Verify:** `yarn vitest run tests/integration/domains/hazardous-events/ExportHazardousEventsCsvUseCase.test.ts tests/integration/domains/hazardous-events/HazardousEventCsvRoundTrip.test.ts`.

## 5. B: Shared URL validator and attachment mapper (pure, TDD)

- [x] 5.0a Red: write `app/domains/hazardous-events/application/attachmentUrlPolicy.test.ts` (since merged into `attachmentInputPolicy.test.ts`) for
      `isAllowedAttachmentUrl` (D12):
  - `http` and `https` accepted, in any letter case;
  - `javascript:`, `data:`, `ftp:` and `mailto:` rejected;
  - relative, empty, whitespace-only and unparsable URLs rejected.

  **Verify:** `yarn vitest run app/domains/hazardous-events/application/attachmentUrlPolicy.test.ts` fails (now `attachmentInputPolicy.test.ts`).

- [x] 5.0b Green: implement `attachmentUrlPolicy.ts` (since merged into `attachmentInputPolicy.ts`; pure, no presentation import, ADR-009).
      **Verify:** 5.0a passes.
- [x] 5.1 Red: write `app/domains/hazardous-events/application/csv/attachmentsCsv.test.ts`
      covering:
  - Link http/https accepted;
  - `javascript:`, `data:`, `ftp:`, relative and empty URLs give `invalid_attachment_url`;
  - the File reference rules: basename match against the supplied keys, the `temp` segment,
    the create path, unknown keys;
  - `tenantPath` and the path directory ignored;
  - tag normalisation;
  - the OD-3 rejections (object, missing or unknown `file_option`, non-string `title`, File
    without `file.name`);
  - the format shape (no `tenantPath`, deterministic order);
  - multiset equality ignoring ids and order.

  **Verify:** `yarn vitest run app/domains/hazardous-events/application/csv/attachmentsCsv.test.ts` fails.

- [x] 5.2 Green: implement `attachmentsCsv.ts`. It calls `isAllowedAttachmentUrl` for every Link
      item and never produces `newFile`. **Verify:** 5.1 passes.
- [x] 5.3 Refactor. **Verify:** 5.1 green; `yarn tsc`.

## 6. B: Deferred file deletion in Update (TDD)

- [x] 6.1 Red (PGlite): `tests/integration/domains/hazardous-events/UpdateHazardousEventUseCase.test.ts`:
  - with `tx`, removing File K returns `fileKeysToDelete: [K]` and a recording fake storage
    port sees no `delete`;
  - rolling back `outer` leaves K listed;
  - without `tx`, K is deleted and `fileKeysToDelete` is `[]`.

  **Verify:** `yarn vitest run tests/integration/domains/hazardous-events/UpdateHazardousEventUseCase.test.ts` fails.

- [x] 6.2 Green: `UpdateHazardousEvent.ts`: skip `deleteAttachmentFiles` under `command.tx` and
      add `fileKeysToDelete` to `UpdateHazardousEventResult`. **Verify:** 6.1 passes, and the
      existing Update and edit-route tests stay green
      (`yarn vitest run tests/integration/domains/hazardous-events/routes/HazardousEventEditRoute.test.ts`).

## 7. B: Attachment import and export wiring (TDD)

- [x] 7.1 Red: extend `hazardousEventCsvColumns.test.ts`, `mapCsvRowToCommand.test.ts`
      (`invalid_attachments`, `invalid_attachment_url`, and `file_reference_not_supported` in
      phase 1 in create mode; on update and upsert rows only JSON syntax in phase 1, all other
      rules deferred, including `temp` paths, D10) and `importRowPolicy.test.ts`:
  - attachment change detection;
  - the deferred File check against the projection's attachments;
  - the File check in `checkCreatePathRow`;
  - commands carry `attachments` only when changed.

  **Verify:** the three unit files fail.

- [x] 7.2 Red (PGlite): in `ImportHazardousEventsCsvUseCase.test.ts`, with a recording fake
      `IAttachmentStoragePort`:
  - an https Link creates a Link attachment;
  - a dangerous scheme is rejected;
  - a File item on create gives `file_reference_not_supported`, with no `promote` and no
    directory;
  - an own-file reference keeps K;
  - another event's file is rejected;
  - an unchanged set is not rewritten;
  - an unchanged exported row holding a non-http link (stored via the form) re-imports as
    `unchanged`, and changing that row gives `invalid_attachment_url`;
  - **a rolled-back import deletes no file and calls no `promote`**;
  - **deletion happens only after commit, exactly once**;
  - a `delete` failure after commit keeps `ok: true` and logs `delete_failed`;
  - **concurrent callers:** two imports racing on one event's attachments, and on its
    footprint. Outcome-only form (PGlite cannot interleave sessions, 6d-1 known limitation):
    at most one commits, the other fails with `concurrent_modification`/`conflict`, and K is
    deleted at most once.

  **Verify:** `yarn vitest run tests/integration/domains/hazardous-events/ImportHazardousEventsCsvUseCase.test.ts` fails.

- [x] 7.3 Green: wire it into `mapCsvRowToCommand.ts`, `importRowPolicy.ts`,
      `HazardousEventCsvImportResult.ts` (three codes) and `ImportHazardousEventsCsv.ts` (collect
      `fileKeysToDelete`; call `deleteAttachmentFiles` after `transactionRunner.run` resolves).
      Add the `attachmentStoragePort: Pick<IAttachmentStoragePort, "delete">` DI in
      `HazardousEventsModule.server.ts`. **Verify:** 7.1-7.2 pass.
- [x] 7.4 Red then Green: attachment export:
  - the projection's `attachments` and `legacyAttachments` (repository test);
  - the `attachments` cell with the OD-6 fallback and no `tenantPath` (`exportRowCells.test.ts`);
  - `EXPORT_HEADER` ends `parent,spatialFootprint,attachments`;
  - the export use case and the round trip.

  **Verify:** `yarn vitest run tests/integration/db/queries/DrizzleHazardousEventRepository.test.ts app/domains/hazardous-events/application/csv/exportRowCells.test.ts tests/integration/domains/hazardous-events/HazardousEventCsvRoundTrip.test.ts`.

- [x] 7.5 Refactor. Remove `NOT_YET_IMPORTED_COLUMNS`, `notYetImportedIndexes`,
      `hasNotYetImportedData` and `skippedDataNotice`. Update the 6d-1 test asserting
      `skippedDataNotice`. **Verify:** all files of sections 2-7 green; `yarn tsc`.

## 8. Presentation, copy and routes (TDD)

- [x] 8.1 Red: `HazardousEventCsvImportPage.dom.test.tsx`:
  - the notice is never rendered;
  - the five new `csv.error.*` messages render with line and column in EN and FR.

  Also `csvLocales.test.ts`: the key set, with no `csv.skipped_data_notice_*`.

  **Verify:** `yarn test:dom app/domains/hazardous-events/presentation/web/csv/HazardousEventCsvImportPage.dom.test.tsx`
  and `yarn vitest run app/domains/hazardous-events/presentation/web/csv/csvLocales.test.ts`
  fail.

- [x] 8.2 Green: `HazardousEventCsvImportPage.tsx` (remove the notice) and
      `locales/{en,fr}/hazardous-events.json`:
  - add five keys, sentence case, no em dash;
  - flag the FR copy for translator review;
  - remove two keys;
  - run `yarn i18n:extractor`.

  **Verify:** 8.1 passes.

- [x] 8.3 Route tests: in `tests/integration/domains/hazardous-events/routes/HazardousEventCsvImportRoute.test.ts`
      and `HazardousEventCsvExportRoute.test.ts`:
  - the action imports a footprint and a link end-to-end with a session tenant;
  - the export loader's header and cells.

  **Verify:** `yarn vitest run tests/integration/domains/hazardous-events/routes/HazardousEventCsvImportRoute.test.ts tests/integration/domains/hazardous-events/routes/HazardousEventCsvExportRoute.test.ts`.

- [x] 8.4 B: form Link-scheme check, Red (SA-1, D12):
  - write `app/domains/hazardous-events/presentation/web/attachmentFieldError.test.ts`: no
    error for https Links and for File items; an error naming the `attachments` field for a
    `javascript:` or an empty Link URL;
  - extend `tests/integration/domains/hazardous-events/routes/HazardousEventNewRoute.test.ts` and
    `HazardousEventEditRoute.test.ts`, per the write-route-adapter spec delta:
    - `javascript:`, `data:` and empty Link URLs return `fieldErrors.attachments` with the
      translated `form.attachments_invalid_url` message (EN, and FR for a `/fr/` request);
    - no use case is called and no row is written;
    - an edit of an event already holding an `ftp:` link is refused;
    - an https link still saves.

  **Verify:** `yarn vitest run app/domains/hazardous-events/presentation/web/attachmentFieldError.test.ts tests/integration/domains/hazardous-events/routes/HazardousEventNewRoute.test.ts tests/integration/domains/hazardous-events/routes/HazardousEventEditRoute.test.ts`
  fails.

- [x] 8.5 B: form Link-scheme check, Green:
  - implement `attachmentFieldError.ts` on top of `isAllowedAttachmentUrl`;
  - call it in `new.tsx` and `edit.$id.tsx` right after `parseHazardousEventFormData`, before
    any guard that can write and before any use case;
  - add `form.attachments_invalid_url` to `locales/{en,fr}/hazardous-events.json` (sentence case,
    no em dash, FR flagged for translator review);
  - leave `attachmentLink.ts`'s `safeLinkHref` unchanged (defence in depth).

  **Verify:** 8.4 passes, and the existing form route and DOM tests stay green.

## 9. E2E and performance

- [x] 9.1 Playwright: extend `tests/e2e/hazardous-events/he-preview-csv.spec.ts`:
  - a legacy-format file with a Point footprint, a tenant division and an https Link imports;
  - the he-preview detail page shows the footprint and the link;
  - export then re-import gives all `unchanged`;
  - axe checks via `tests/e2e/helpers/a11y.ts`;
  - cleanup through the CA delete action, asserting no orphan `workflow_instance` or spatial
    observation.

  Also extend `tests/e2e/hazardous-events/he-preview-attachments.spec.ts`: saving the create
  form with a `javascript:` Link shows the attachments field error, and no event is created.

  **Verify:** `yarn test:e2e tests/e2e/hazardous-events/he-preview-csv.spec.ts tests/e2e/hazardous-events/he-preview-attachments.spec.ts`.

- [x] 9.2 Re-run the rest of the he-preview E2E specs. Any failure claimed as pre-existing must be
      proven on the base branch. **Verify:** `yarn test:e2e tests/e2e/hazardous-events/`.
- [x] 9.3 Run `EXPLAIN (ANALYZE, BUFFERS)` of the extended `findExportRows`, and time an import
      with footprints, on a realistic seed (thousands of events, multi-vertex polygons). Record
      the numbers in design.md Risks. **Verify:** numbers recorded.

## 10. Quality gates (sdd-implementer runs them one at a time)

- [x] 10.1 Quality gate 1 of 10: `yarn vitest run <each test file above>`: tests still green
      after refactor.
- [x] 10.2 Quality gate 2 of 10: `yarn tsc`: zero TypeScript errors.
- [x] 10.3 Quality gate 3 of 10: `yarn format:check` scoped as `npx prettier --check <changed files>`
      (never repo-wide `yarn format`; preview any `--write` on a copy first).
- [x] 10.4 Quality gate 4 of 10: anti-pattern review against
      `.github/skills/anti-pattern-check/SKILL.md`.
- [x] 10.5 Quality gate 5 of 10: SOLID review: invoke the `solid-reviewer` agent. Report findings
      to the human with reasoning; fix-or-defer is a joint decision.
- [x] 10.6 Quality gate 6 of 10: documentation review, by a fresh subagent, one full-diff sweep.
      Comments explain why, not what, and are compacted without losing meaning.
- [x] 10.7 Quality gate 7 of 10: project conventions review against
      `.github/copilot-instructions.md`.
- [x] 10.8 Quality gate 8 of 10: code review: run `.github/skills/code-review/SKILL.md` in full
      via a fresh subagent; report findings to the human.
- [x] 10.9 Quality gate 9 of 10 (required; `ui-classification: legacy-exempt`):
  - Gate 9a: `yarn check:design-system --verify-spec --change ca-he-csv-spatial-attachments --base origin/dev`
    plus `yarn check:design-system --change ca-he-csv-spatial-attachments`, and the
    design-system-check skill items that apply to legacy-exempt code (no PrimeReact, sentence
    case, no em dashes). The design-system `index.ts` components and
    `scripts/check-design-system.ts` are not touched.
  - Gate 9b: `runWcag22A11yCheck` on the success state and on a failure state with the new codes,
    in EN and FR, and on the he-preview form showing the attachments field error.
  - Gate 9c: against design.md "UI: reference source and ground-truth checklist", with
    screenshots at desktop and 375 px (CSV page success and failure states, and the form's
    attachments field error) in `test-results/gate-9/ca-he-csv-spatial-attachments/`.
    The report goes in `openspec/changes/ca-he-csv-spatial-attachments/evidence/gate-9-report.md`,
    audited by a fresh `visual-parity-reviewer`.
- [x] 10.10 Quality gate 10 of 10 (Claude Code only): built-in `code-review` at `high` effort via
      a second, separate fresh subagent. Report findings to the human before archiving.
- [x] 10.11 Test quality: run `test-quality-auditor` (Stryker), scoped **only** to the new pure
      mappers `spatialFootprintCsv.ts` and `attachmentsCsv.ts` and the URL validator
      `attachmentUrlPolicy.ts`, now in `attachmentInputPolicy.ts` (user decision, 2026-11-26). Do not restructure code for Stryker. Record a
      tooling limitation in design.md, never as a DEF. Run it detached, never concurrently with
      vitest.
- [x] 10.12 Regression: `yarn test:run2` (full PGlite suite) passes with no new failures. Any
      failure claimed as pre-existing is proven by a base-branch run (`feature/he-ca-phase6` at
      da6d2bfd) and compared by test name.

## 11. Docs, human approval and archive

- [x] 11.1 Roadmap 6d-2: set the status and record what shipped, including SA-1 (the form check). Re-check
      DEF-005, DEF-061 and DEF-064 against what shipped. **Verify:** reviewed in the diff.
- [x] 11.2 Present the final state to the human (diff summary, gate results, Gate 9 report,
      deferred findings) and get explicit approval to archive. **Verify:** the approval is
      recorded in chat.
- [x] 11.3 Tick every checkbox in this file, including 11.4, before archiving. **Verify:** no
      unchecked boxes remain.
- [x] 11.4 Run `opsx:archive` for `ca-he-csv-spatial-attachments` on this branch before raising
      the PR. **Verify:** the change is moved under `openspec/changes/archive/` and the specs are
      synced.
