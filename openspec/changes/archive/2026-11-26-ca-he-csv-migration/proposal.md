## Why

Hazardous Events CSV import and export still run on the legacy form framework, which has three
live tenant-isolation bugs pinned by the 0e characterization tests
(`tests/integration/db/models/hazardousEventCsvImportTenant.test.ts`):

- `csvCreate` drops the session tenant, so rows get `country_accounts_id = NULL`;
- a `countryAccountsId` column in the file is honoured;
- the upsert lookup has no tenant filter.

Two live runs on 2026-11-24 confirmed all three and found more (design.md legacy tables):

- `approvalStatus` is stored with no workflow instance;
- `parent` ignores time order on create;
- exported cells are not protected against formula injection;
- rows created this way cannot be opened in the CA he-preview pages.

DELTA mostly onboards a tenant by importing its records from another system, and existing users
have CSV files and templates that must keep working.

Roadmap intent 6d is split (user decision NOD-11). This change is **6d-1**. It moves import and
export onto the Clean Architecture use cases in the legacy file format: columns and HIP ids,
workflow status, `parent`, export, and the UI. **6d-2**, a roadmap entry that follows this
change, maps `spatialFootprint` and `attachments`.

## What Changes

- **Import use case.** New application use case `ImportHazardousEventsCsvUseCase`, with create,
  update and upsert modes. It calls `CreateHazardousEventUseCase` and
  `UpdateHazardousEventUseCase` row by row inside one transaction, all or nothing (OD-4). The
  tenant and user come only from the session, and `countryAccountsId` is ignored (OD-2).
- **Backward-compatible column contract (OD-1).**
  - Every legacy `fieldsDefApi` column is accepted.
  - The optional columns `specificHazardId`, `specificHazardLocalName` and
    `specificHazardNationalName` are new.
  - The legacy export header's read-only columns are accepted and ignored.
  - `spatialFootprint` and `attachments` are accepted and ignored, with a per-file notice, until
    6d-2 (RD-1).
  - Every row is validated before any write, and errors give the line and column (OD-6).
- **HIP mapping.** Legacy HIP ids resolve through the taxonomy's `UNIQUE` `source_ref_id`, using
  the new `ISpecificHazardTaxonomyRepository.findBySourceRefIds`. A contradictory chain is a row
  error (NOD-5). A row without a specific hazard is a row error (NOD-6). That is **the one
  accepted compatibility break**: the CA entity requires a specific hazard.
- **Workflow status (OD-3).** `approvalStatus` maps to the CA workflow status through
  `WorkflowInstance`'s own transitions, using the new `validation-workflow` use case
  `ApplyImportedWorkflowStatusUseCase`. It is admin-only for any non-draft status, records the
  importer as actor, and never notifies (NOD-1 to NOD-3). Re-imports of unchanged rows are
  skipped, so onboarding files can be re-run (NOD-4).
- **`parent`.** It maps to the CA cause link, with tenant, cycle and time-order checks.
- **Export use case.** New `ExportHazardousEventsCsvUseCase`:
  - reads a projection that keeps unmigrated rows (OD-8), with no role filter (legacy, OD-9);
  - writes the legacy header with `parent` appended (NOD-10);
  - uses legacy fallbacks for status, attribution, HIP ids and `parent` (NOD-9);
  - guards cells against formula injection (OD-10), and import reverses that guard (NOD-13).
- **Port changes:**
  - repository: `findIdByApiImportId` (tenant-scoped), and `findExportRows`;
  - Create/Update: an optional caller `tx` (their own `info` line is kept, user decision 2026-11-25);
  - `ITransactionRunner.run`: an optional outer `tx` (savepoint);
  - an optional `tx` on every pre-write read (taxonomy, crosswalk, causal chain, workflow lookup,
    `findByEntity`), so one import holds one connection (NOD-12).
- **Routes.** New hidden routes under `app/routes/$lang+/_authenticated+/he-preview+/` (the
  roadmap's path without `_authenticated+` is wrong): `csv-import.tsx`, `csv-export.ts` and
  `csv-template.ts`. Import and the template require EditData; export requires ViewData. Errors
  use 6b's helper and boundary.
- **UI.** The import page is `legacy-exempt`, on `app/design-system/components/`, with the
  prototype exception approved (OD-13). EN/FR `csv.*` keys are added.
- **Docs.**
  - Register: DEF-055 is updated, and DEF-064 and DEF-065 are added.
  - Roadmap: 6d is split into 6d-1 and 6d-2, with 6d-2 carrying the footprint and attachment
    findings and decisions.
- **Not changed:** the legacy CSV routes stay as they are until Phase 7 (OD-14).
- **Row rules stricter than legacy,** each a row error with a clear message:
  - no specific hazard (the accepted break);
  - a contradictory HIP chain;
  - a `parent` that starts after the event;
  - a status change on an event that is not editable.

## Capabilities

### New Capabilities

- `hazardous-event-csv-import`: uploading a CSV to create, update or upsert hazardous events for
  the session tenant. Covers the legacy-compatible column contract, HIP mapping, status mapping,
  cause link, the ignored footprint and attachment columns, validation, all-or-nothing behaviour,
  idempotent re-import, limits and the result page.
- `hazardous-event-csv-export`: downloading the tenant's events in the legacy header format plus
  `parent`. Covers value sources and fallbacks, encoding and formula-injection protection.
- `apply-imported-workflow-status`: moving a newly created WorkflowInstance to an imported status
  through the domain's transitions. Admin only, with no notification and a caller transaction.

### Modified Capabilities

- `hazardous-event-repository-port`: adds `findIdByApiImportId` and `findExportRows` (method
  count 11 → 13).
- `create-hazardous-event`, `update-hazardous-event`: an optional caller transaction for writes
  and every pre-read; their `info` line is kept.
- `transaction-runner-port`: `run` accepts an optional outer transaction (savepoint).
- `workflow-repository-port`: `findByEntity` accepts an optional `tx`.
- `specific-hazard-taxonomy-repository-port`: adds `findBySourceRefIds`.
- `hazard-taxonomy-repository-port`, `hip-crosswalk-port`, `causal-chain-repository-port`,
  `get-workflow-instance-by-entity`: an optional `tx` on their reads (NOD-12).

## Impact

Files expected to change, one-line reason each:

- `app/domains/hazardous-events/application/use-cases/ImportHazardousEventsCsv.ts` (new):
  orchestration in one transaction.
- `app/domains/hazardous-events/application/use-cases/ExportHazardousEventsCsv.ts` (new): the
  export projection and value mapping.
- `app/domains/hazardous-events/application/csv/hazardousEventCsvColumns.ts` (new): the D3
  column contract.
- `app/domains/hazardous-events/application/csv/mapCsvRowToCommand.ts` (new): the pure
  row-to-command mapping and guard reversal.
- `app/domains/hazardous-events/application/csv/approvalStatusMapping.ts` (new): the D12 table,
  in both directions.
- `app/domains/hazardous-events/application/dto/HazardousEventCsvImportResult.ts` and
  `HazardousEventExportRow.ts` (new).
- `app/domains/hazardous-events/application/editPolicy.ts` (new): the status-aware rule (OD-7).
- `app/domains/hazardous-events/application/ports/IHazardousEventRepository.ts`,
  `ISpecificHazardTaxonomyRepository.ts`, `IHazardTaxonomyRepository.ts`,
  `ICausalChainRepository.ts`, `IHipCrosswalkPort.ts`, and their Drizzle adapters: the new
  methods and the optional `tx`.
- `app/domains/hazardous-events/application/use-cases/CreateHazardousEvent.ts` and
  `UpdateHazardousEvent.ts`: the optional `tx`.
- `app/domains/validation-workflow/application/use-cases/ApplyImportedWorkflowStatus.ts` (new),
  plus `GetWorkflowInstanceByEntity.ts`, `IWorkflowRepository.ts`, `DrizzleWorkflowRepository`
  (`tx`) and the module wiring.
- `app/shared/persistence/ITransactionRunner.ts` and
  `app/infrastructure/DrizzleTransactionRunner.server.ts`: the outer `tx`.
- `app/domains/hazardous-events/infrastructure/HazardousEventsModule.server.ts`: DI wiring.
- `app/domains/hazardous-events/presentation/web/csv/` (new): `parseCsvUpload.server.ts`,
  `serializeCsv.ts` and `HazardousEventCsvImportPage.tsx`.
- `app/routes/$lang+/_authenticated+/he-preview+/csv-import.tsx`, `csv-export.ts` and
  `csv-template.ts` (new).
- `locales/en/hazardous-events.json` and `locales/fr/hazardous-events.json`: the `csv.*` keys.
- Tests: unit, PGlite, `test:run3` (concurrency), DOM and Playwright (design.md "Test
  infrastructure").
- Docs: `_docs/refactoring-plan/deferred-items-register.md` (done) and
  `_docs/refactoring-plan/hazardous-events-refactoring-roadmap.md` (6d split, done). The 6d-1
  status update comes at archive.

Scope: roughly 26 new and 28 changed source and test files, about twice the size of 6c
(design.md "Scope and size (6d-1)").

DB migration: **none**.

Test approach:

- unit (Vitest) for the pure mappings, column contract and CSV serializer;
- PGlite (`yarn test:run2`) for the use cases, ports, routes, the ported 0e scenarios and the
  round trip;
- real Postgres (`yarn test:run3`) for the interleaving concurrency scenarios;
- DOM (`yarn test:dom`) for the page;
- Playwright (`yarn test:e2e`) for upload and download;
- Stryker scoped to the changed `app/domains/**` logic files.

Security / multi-tenancy: **security-sensitive.**

- It closes the 0e tenant bugs on the new path.
- Non-draft statuses require the admin role and send no notifications.
- Exported cells are guarded against formula injection, columns are allow-listed and the upload
  is size-limited.
- The legacy routes stay vulnerable until Phase 7 (DEF-064).
- The attachment-path concern recorded in DEF-064 is outside 6d-1, which never touches files.

UI classification: `legacy-exempt`; the feature-prototype `not-required` exception is approved
for 6d (OD-13, 2026-11-24).
