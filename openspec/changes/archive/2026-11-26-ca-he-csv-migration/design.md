# Design: ca-he-csv-migration (roadmap 6d-1)

## UI governance and traceability metadata

```yaml
design-system:
  repository: https://github.com/unisdr/delta-design
  version-or-tag: v0.7.2
  commit: a86cc3a62378871e93cbfa14aa69740201b8c556

feature-prototype:
  repository: https://github.com/unisdr/delta-feature-prototypes
  path: not-applicable
  commit: e24b8ad4dee319d5efa2a7c57fca30948f130bd0
  status: not-required
  exception-reason: "Explicitly approved human review exception (user, 2026-11-24, OD-13): Hazardous Events retains legacy styling by agreement (roadmap Phase 6 'Styling scope', 2026-11-23) until the HE UI upgrade iteration; no prototype in delta-feature-prototypes@e24b8ad covers HE or any CSV import/export/upload screen, so legacy csvImportScreen is the parity reference"

ui-classification: legacy-exempt
```

Where these values come from (none invented):

- `design-system`: `_docs/design/tokens.css` line 1 says "generated from tokens.json v0.7.2". That
  is the version synced into this repo, and the archived 6b design.md records it at `a86cc3a…`.
  `git ls-remote` on 2026-11-24 shows that `unisdr/delta-design` `main` has since moved to
  `9107103…` and that there are still no tag refs. The pin therefore stays at the commit the
  local files were synced from. Re-syncing is DEF-014's work, not this change's.
- `feature-prototype`: a shallow clone at `e24b8ad` (current `main`, 2026-11-24) lists
  `features/{access-management, api-keys, assets, disaster-events, emails, event-management,
geographic-levels, login, organization-management, profile, sectors, system-settings}`.
  `git ls-tree -r` finds no path containing csv, import, export or upload. The 6b approval of
  `not-required` covered 6b only; the user approved it for 6d on 2026-11-24 (OD-13).

## User context and resolved decisions (user, 2026-11-24)

DELTA mostly imports a tenant's existing records from another system that manages these events
locally, at the time that tenant is onboarded. Existing users have CSV files and templates, and
nothing may break them. That requirement drives the changed decisions below.

| ID    | Decision                                    | Outcome                                                                                                                                                                                                                                                                                                                                          |
| ----- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| OD-1  | Column schema                               | **Changed: backward compatible.** Accept the legacy `fieldsDefApi` column set, including `hipHazardId`/`hipClusterId`/`hipTypeId`, `parent`, `spatialFootprint`, `attachments` and `approvalStatus`, and resolve it to the CA model (D3, D13). `specificHazardId` is accepted as an optional additional column. An exported file must re-import. |
| OD-2  | `countryAccountsId` column                  | As recommended: ignore it and report it; the tenant is always forced from the session.                                                                                                                                                                                                                                                           |
| OD-3  | Imported record status                      | **Changed: do not ignore it.** Map legacy `approvalStatus` to the CA WorkflowInstance status, so a record published in the source system does not arrive as a draft (D12). Sub-choices are NOD-1 to NOD-4.                                                                                                                                       |
| OD-4  | Transactions                                | As recommended: all-or-nothing, one outer transaction, a savepoint per row (D4).                                                                                                                                                                                                                                                                 |
| OD-5  | `parent`, `spatialFootprint`, `attachments` | **Changed: in scope for 6d.** After the split (NOD-11), `parent` is in 6d-1 (D14); `spatialFootprint` and `attachments` are 6d-2 (roadmap), and 6d-1 accepts and ignores them (D15, RD-1).                                                                                                                                                       |
| OD-6  | Row-error shape                             | As recommended: a result DTO returned as action data (D6).                                                                                                                                                                                                                                                                                       |
| OD-7  | Status-aware edit rule                      | As recommended: moved to the application layer (D5).                                                                                                                                                                                                                                                                                             |
| OD-8  | Export read path                            | As recommended: a projection that keeps unmigrated rows (D9).                                                                                                                                                                                                                                                                                    |
| OD-9  | Data-viewer export                          | **Changed: match legacy.** Every role with ViewData exports every row of the tenant, drafts included (D9).                                                                                                                                                                                                                                       |
| OD-10 | Formula-injection protection                | As recommended: own guard over the full OWASP set (D8).                                                                                                                                                                                                                                                                                          |
| OD-11 | File format                                 | As recommended: no BOM, CRLF, `id` ascending. The filename is now `hazardous-event.csv`, as legacy, because of the backward-compatibility decision (D8).                                                                                                                                                                                         |
| OD-12 | Links from the list                         | As recommended: none.                                                                                                                                                                                                                                                                                                                            |
| OD-13 | UI                                          | As recommended: the prototype `not-required` exception is approved for 6d; default mode Create; label "Type".                                                                                                                                                                                                                                    |
| OD-14 | Legacy CSV routes                           | As recommended: keep them until Phase 7 and register their defects (DEF-064, registered).                                                                                                                                                                                                                                                        |
| OD-15 | Limits                                      | As recommended: 10,000,000 bytes; decide on a row cap after measuring.                                                                                                                                                                                                                                                                           |
| OD-16 | Updating unmigrated rows                    | As recommended: row error `not_migrated`.                                                                                                                                                                                                                                                                                                        |
| OD-17 | Template                                    | As recommended: header plus one importable example row.                                                                                                                                                                                                                                                                                          |

Housekeeping: the coordinator deleted the pre-existing orphan `workflow_instance` `4d5c99c5…`,
so the dev baseline is now 42 events and 39 workflow instances.

## Context

### Readiness verdict (coordinator findings, verified against code and the live system)

| Coordinator finding                                                                                          | Verdict                                                                                                                                                                                                                                                                                                                                                                                                                         | Evidence                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create/Update use cases exist and are used by `new.tsx`/`edit.$id.tsx`                                       | Confirmed                                                                                                                                                                                                                                                                                                                                                                                                                       | `he-preview+/new.tsx:150-181`, `CreateHazardousEvent.ts:108`, `UpdateHazardousEvent.ts:182`                                                                                                                 |
| `apiImportId` exists in the CA domain and DTO; uniqueness is per tenant                                      | Confirmed                                                                                                                                                                                                                                                                                                                                                                                                                       | `HazardousEvent.ts:36`, `HazardousEventDto.ts:35`, constraint `hazardous_event_api_import_id_tenant_unique` (`hazardousEventTable.ts:63-65`), mapped in `DrizzleHazardousEventRepository.server.ts:710-713` |
| No CA lookup by apiImportId                                                                                  | Confirmed, so this change adds `findIdByApiImportId`                                                                                                                                                                                                                                                                                                                                                                            | `IHazardousEventRepository.ts` (no such method)                                                                                                                                                             |
| (Additional finding, not a coordinator claim) whether `UpdateHazardousEventUseCase` can change `apiImportId` | It cannot: `buildUpdatedEventProps` copies `existingEvent.apiImportId` (`UpdateHazardousEvent.ts:165`)                                                                                                                                                                                                                                                                                                                          | Covered by the spec row error `api_import_id_immutable`                                                                                                                                                     |
| Use cases each own their transaction                                                                         | Confirmed, with an extra problem: the commands take no `tx`, and Update's `findById` and workflow read run **outside** the transaction (`UpdateHazardousEvent.ts:215-226`). One outer transaction for the whole file needs new plumbing (D4).                                                                                                                                                                                   | `ITransactionRunner.ts:4-7`, `DrizzleTransactionRunner.server.ts:10-12`                                                                                                                                     |
| Status-aware rules from 6c apply to updates                                                                  | Confirmed. **Correction:** the rule lives in presentation (`requireStatusAwareEditPermission`, `isStatusAwareEditBlocked.ts`), not in the use case, so a CSV path that calls the use case directly would skip it. Addressed by OD-7.                                                                                                                                                                                            | `edit.$id.tsx:39-70`                                                                                                                                                                                        |
| Legacy pieces as listed                                                                                      | Confirmed, plus: legacy `csv-export.ts` wraps `authLoaderWithPerm("ViewData")` twice (`csv-export.ts:8` and `csv_export.ts:11`), and the legacy HE list has **no** CSV links (`_public+/hazardous-event+/_index.tsx:82` `csvExportLinks={false}`)                                                                                                                                                                               | Observed live, see below                                                                                                                                                                                    |
| (Additional finding) export of legacy rows                                                                   | Besides the missing WorkflowInstance the coordinator noted, a null `specific_hazard_id` also blocks the CA read path: CA detail and edit return **422** for such rows (observed live), and `findAll` silently skips them (`DrizzleHazardousEventRepository.server.ts:572-590`) while `countAll` still counts them. Today 3 of the tenant's 42 rows have a null `specific_hazard_id`, and every legacy-CSV-created row does too. | OD-8                                                                                                                                                                                                        |
| Roadmap route paths `app/routes/$lang+/he-preview+/csv-*.tsx`                                                | **Wrong path.** Every he-preview route lives under `app/routes/$lang+/_authenticated+/he-preview+/`. Export has no UI, so it is a resource route `csv-export.ts`, not `.tsx`.                                                                                                                                                                                                                                                   | `ls app/routes/$lang+/_authenticated+/he-preview+/`                                                                                                                                                         |
| Phase M backfill status                                                                                      | **Not assumed.** What was seen: roadmap `Ma` is ⬜ "execution not started"; no `scripts/dts_database/migrate_*` file and no `feature/ca-he-migration-scripts` branch (local or remote-tracking). The status must be confirmed with the team member who owns Phase M (OD-8).                                                                                                                                                     | roadmap lines 882-945                                                                                                                                                                                       |

### Legacy behaviour observed live (2026-11-24)

Setup: dev server at `http://localhost:3000`, logged in over HTTP as `test.admin@india.gov.in`
(role admin, only tenant `50c88fb1…`; this dev DB has exactly one `country_accounts` row).
Before the run the DB held 42 `hazardous_event`, 44 `event` and 40 `workflow_instance` rows.
Every throwaway row used a `CSV6D-` record originator or a `csv6d-` apiImportId. The rows were
removed afterwards (see Migration Plan, "Live-run cleanup") and the counts returned to 42/44/40.
**O** = observed live; **C** = derived from code only.

| #   | Case                                                                      | What the UI showed (`<p>` lines under the form)                                                                                                                                                                                                                                              | DB result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | O/C                    |
| --- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| E1  | Export `/en/hazardous-event/csv-export`                                   | `200`, `text/csv; charset=utf-8`, `attachment; filename="hazardous-event.csv"`, no BOM, LF line ends                                                                                                                                                                                         | Header = raw DB keys in table order: `updatedAt,createdAt,approvalStatus,createdByUserId,updatedByUserId,submittedByUserId,submittedAt,validatedByUserId,validatedAt,publishedByUserId,publishedAt,apiImportId,hipHazardId,hipClusterId,hipTypeId,id,countryAccountsId,specificHazardId,status,nationalSpecification,startDate,endDate,description,chainsExplanation,magnitude,recordOriginator,hazardousEventStatus,dataSource,specificHazardLocalName,specificHazardNationalName`. `spatialFootprint`/`attachments` are skipped (`csv_export.ts:36`). Rows are ordered by `id` ascending. Timestamps are ISO with `Z`, empty values are empty cells, and user UUIDs and the tenant id are exported. | O                      |
| E2  | Export, pre-refactor row with no `workflow_instance` (`2f310379…`)        | Looks the same as any other row. There is no workflow column, only legacy `approvalStatus`, and `specificHazardId` is empty.                                                                                                                                                                 | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | O                      |
| E3  | Export of a cell `=HYPERLINK("http://example.invalid")`                   | Exported as `"=HYPERLINK(""http://example.invalid"")"`, **not neutralised**                                                                                                                                                                                                                  | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | O                      |
| E4  | Export of a description with a comma and an embedded newline              | RFC 4180 quoted, round-trips                                                                                                                                                                                                                                                                 | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | O                      |
| E5  | Export of null-tenant rows created by legacy CSV                          | Absent (tenant filter); they are invisible everywhere                                                                                                                                                                                                                                        | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | O                      |
| E6  | Empty tenant                                                              | `200 text/plain` "No data for hazardous-event"                                                                                                                                                                                                                                               | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | C (`csv_export.ts:29`) |
| I1  | Create, 2 valid rows, no `countryAccountsId` column                       | "Imported or updated 2 records"                                                                                                                                                                                                                                                              | **`country_accounts_id = NULL`** (0e bug 1), `specific_hazard_id` NULL, `approvalStatus` draft, no `workflow_instance`, `created_by_user_id` NULL                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | O                      |
| I2  | Create, unknown `hipHazardId`                                             | "Imported or updated 0 records" / "Invalid reference for field 'hipHazardId'. Please check if the referenced value exists"                                                                                                                                                                   | nothing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | O                      |
| I3  | Create, `startDate=2025-13-45`                                            | "… 0 records" / 'The field "Start date" must be a valid date string (YYYY-MM-DD or YYYY-MM or YYYY). Got "2025-13-45".'                                                                                                                                                                      | nothing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | O                      |
| I4  | Create, empty `recordOriginator`; empty `startDate`                       | '… "Record originator" is required.' / '… "Start date" is required.'                                                                                                                                                                                                                         | nothing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | O                      |
| I5  | Create, mixed: good, bad hazard, good                                     | "… 0 records" / hip error, with **no line number**                                                                                                                                                                                                                                           | **nothing: all-or-nothing** (event count unchanged)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | O                      |
| I6  | Create, `countryAccountsId` = random non-existent UUID                    | "Database constraint failed: hazardous_event_country_accounts_id_country_accounts_id_fk" (raw constraint name)                                                                                                                                                                               | nothing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | O                      |
| I7  | Create, `countryAccountsId` = another real tenant                         | Not run: no second tenant exists, and creating one was out of bounds. 0e PGlite test proves the row is created in that tenant.                                                                                                                                                               | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | C (0e test)            |
| I8  | Create, unknown column                                                    | 'The field "unknownCol" is not recognized.'                                                                                                                                                                                                                                                  | nothing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | O                      |
| I9  | Header only                                                               | "Empty file"                                                                                                                                                                                                                                                                                 | nothing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | O                      |
| I10 | Create with own tenant column and `approvalStatus=published`              | "Imported or updated 1 records"                                                                                                                                                                                                                                                              | **`approvalStatus = published`, no `workflow_instance`**: workflow bypass                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | O                      |
| I11 | Duplicate `apiImportId` in the file / already in tenant                   | "Database constraint failed: hazardous_event_api_import_id_tenant_unique"                                                                                                                                                                                                                    | nothing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | O                      |
| I12 | Create with no HIP columns at all                                         | "1 records"                                                                                                                                                                                                                                                                                  | event with **no hazard at all**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | O                      |
| I13 | `hipHazardId` without `hipClusterId`                                      | "HIP cluster is required"                                                                                                                                                                                                                                                                    | nothing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | O                      |
| I14 | UTF-8 BOM file                                                            | imported; first column recognised (BOM stripped by `File.text()`)                                                                                                                                                                                                                            | ok                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | O                      |
| I15 | Latin-1 byte `0xE9`                                                       | imported; stored as `caf�` (**silent U+FFFD corruption**)                                                                                                                                                                                                                                    | corrupted value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | O                      |
| I16 | `;` delimiter                                                             | 'The field "startDate;endDate;recordOriginator" is not recognized.'                                                                                                                                                                                                                          | nothing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | O                      |
| I17 | Ragged row (fewer fields)                                                 | "Server error" (csv-parse throws, generic catch `csv_import.ts:165-175`)                                                                                                                                                                                                                     | nothing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | O                      |
| I18 | Unquoted field containing `"`                                             | "Server error"                                                                                                                                                                                                                                                                               | nothing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | O                      |
| I19 | 10.9 MB file                                                              | "Server error" after ~6.5 s; the same-shaped 9.8 MB file reaches row validation, so the limit is `maxFileSize: 10_000_000` (`csv_import.ts:76`) and gives **no specific message**                                                                                                            | nothing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | O                      |
| I20 | `import_type=bogus`                                                       | "Invalid import_type"                                                                                                                                                                                                                                                                        | nothing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | O                      |
| U1  | Update own row, no `countryAccountsId` column                             | "User has no country accounts."                                                                                                                                                                                                                                                              | nothing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | O                      |
| U2  | Update own row with own tenant column                                     | "1 records"                                                                                                                                                                                                                                                                                  | updated                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | O                      |
| U3  | Update unknown id / null-tenant orphan id                                 | "Record with id … does not exist"                                                                                                                                                                                                                                                            | nothing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | O                      |
| U4  | Update with no `id` column                                                | "Each item must be an object with a valid 'id' field."                                                                                                                                                                                                                                       | nothing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | O                      |
| U5  | Update `approvalStatus=draft` on a published row                          | "1 records"                                                                                                                                                                                                                                                                                  | **status changed directly**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | O                      |
| U6  | Update mixed: good row, then unknown id                                   | "Record with id … does not exist"                                                                                                                                                                                                                                                            | **good row not committed**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | O                      |
| U7  | Export file re-imported (update or upsert)                                | 'The field "updatedAt" is not recognized.' **No round trip.**                                                                                                                                                                                                                                | nothing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | O                      |
| P1  | Upsert existing own `apiImportId` / new id (own tenant column)            | "1 records" each                                                                                                                                                                                                                                                                             | updated / created                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | O                      |
| P2  | Upsert without tenant column, `apiImportId` matching a null-tenant orphan | "User has no country accounts." (lookup found the foreign/orphan row: 0e bug 3)                                                                                                                                                                                                              | nothing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | O                      |
| P3  | Upsert without tenant column, new `apiImportId`                           | "1 records"                                                                                                                                                                                                                                                                                  | **null-tenant orphan created**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | O                      |
| P4  | Upsert, empty `apiImportId`                                               | "When using upsert apiImportId is required on each object."                                                                                                                                                                                                                                  | nothing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | O                      |
| P5  | Upsert mixed: update, create, bad date                                    | date error                                                                                                                                                                                                                                                                                   | **nothing committed**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | O                      |
| X1  | Example files `/en/api/hazardous-event/csv-import-example?import_type=…`  | Headers `parent,hipHazardId,hipClusterId,hipTypeId,approvalStatus,…,spatialFootprint,attachments,recordOriginator,hazardousEventStatus,dataSource,countryAccountsId`; the example row is **not importable** (empty dates, fake parent UUID). It **advertises a `countryAccountsId` column.** | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | O                      |
| X2  | CA he-preview for legacy-CSV rows                                         | Rows with a tenant: detail and edit **422** "The request could not be processed". Null-tenant rows: 404. They cannot be deleted in the CA UI.                                                                                                                                                | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | O                      |
| X3  | Legacy HE list page                                                       | No CSV export/import buttons; the pages are reachable by direct URL only                                                                                                                                                                                                                     | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | O                      |

### Legacy behaviour observed live, round 2 (2026-11-24, new scope)

Rows S1-S6 and A1-A5 are evidence for 6d-2 and are summarised in its roadmap entry. They stay
here because 6d-1's D15 relies on S6/A5.

Same rules and setup as round 1. Baseline before the run: 42 `hazardous_event`, 44 `event`, 39
`workflow_instance`, 0 `event_relationship`, 0 `hazardous_event_geom`, 0
`hazardous_event_division`, 2 `hazardous_event_causality` and 12 `hazardous_event_attachment`
rows. Every row was created with this tenant's own `countryAccountsId` column, so the legacy
row-level checks that read it apply. **O** = observed, **C** = code only.

| #   | Case                                                                                                                                           | What the UI showed                                                                                                                                                                                                                                                                          | DB / file-system result                                                                                                                                                                                                                                                                                                                                                                                         | O/C         |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| H1  | `hipTypeId` + `hipClusterId`, no `hipHazardId`                                                                                                 | "Imported or updated 1 records"                                                                                                                                                                                                                                                             | row with `hip_cluster_id`, no hazard, no `specific_hazard_id`                                                                                                                                                                                                                                                                                                                                                   | O           |
| H2  | `hipHazardId=78424` with `hipClusterId=1743` (78424's real cluster is 1844)                                                                    | "1 records"                                                                                                                                                                                                                                                                                 | stored as given, **mismatched chain**                                                                                                                                                                                                                                                                                                                                                                           | O           |
| H3  | Mapping data                                                                                                                                   | —                                                                                                                                                                                                                                                                                           | `specific_hazard`, `hazard_cluster` and `hazard_type` each have `source_ref_id text UNIQUE`; IDs are `md5('delta:hips:'‖version‖':specific_hazard:'‖hip_id)::uuid`, "identical across instances"; the seed asserts 8 types, 38 clusters, 281 hazards (`20261009042834_…fixed_hipsUUID.sql:116-129, 150-185`). Dev DB: 281/281 `hip_hazard` rows map, 0 duplicates. Both migrations are in `meta/_journal.json`. | O + C       |
| P1  | `parent` = own existing event                                                                                                                  | "1 records"                                                                                                                                                                                                                                                                                 | `event_relationship` row `caused_by` (legacy table), **no** `hazardous_event_causality` row                                                                                                                                                                                                                                                                                                                     | O           |
| P2  | `parent` = unknown UUID                                                                                                                        | "Parent event not found"                                                                                                                                                                                                                                                                    | nothing                                                                                                                                                                                                                                                                                                                                                                                                         | O           |
| P3  | `parent` whose start date is **after** the child's                                                                                             | "1 records"                                                                                                                                                                                                                                                                                 | linked: legacy create has no time-order check                                                                                                                                                                                                                                                                                                                                                                   | O           |
| P4  | Update `parent` to own child (cycle)                                                                                                           | "Cannot set 'Event 4f75cdc0' as the cause of 'Event afc1f909' because it would create a circular relationship…"                                                                                                                                                                             | nothing                                                                                                                                                                                                                                                                                                                                                                                                         | O           |
| P5  | Update `parent` = self                                                                                                                         | "Cannot set an event as its own parent"                                                                                                                                                                                                                                                     | nothing                                                                                                                                                                                                                                                                                                                                                                                                         | O           |
| P6  | Update with `id,parent` only                                                                                                                   | "Field is required." (start date / originator required once `parent` is present)                                                                                                                                                                                                            | nothing                                                                                                                                                                                                                                                                                                                                                                                                         | O           |
| P7  | Export                                                                                                                                         | `parent` is not exported at all (not a `hazardous_event` column)                                                                                                                                                                                                                            | —                                                                                                                                                                                                                                                                                                                                                                                                               | O (E1)      |
| S1  | `spatialFootprint` = legacy JSON array: one `Map coordinates` Point Feature, one `Geographic level` item with `geojson.properties.division_id` | "1 records"                                                                                                                                                                                                                                                                                 | 1 `hazardous_event_geom` (`POINT(77.2 28.6)`), 1 `hazardous_event_division`; no `hazardous_event_spatial_observation`                                                                                                                                                                                                                                                                                           | O           |
| S2  | `spatialFootprint` column present but empty                                                                                                    | 'The field "Spatial footprint" must be of type valid JSON. Got "".'                                                                                                                                                                                                                         | nothing                                                                                                                                                                                                                                                                                                                                                                                                         | O           |
| S3  | `spatialFootprint` = `{not json`                                                                                                               | same message, `Got "{not json"`                                                                                                                                                                                                                                                             | nothing                                                                                                                                                                                                                                                                                                                                                                                                         | O           |
| S4  | Update `spatialFootprint` = `[]`                                                                                                               | "1 records"                                                                                                                                                                                                                                                                                 | geom and division rows **deleted** (footprint cleared)                                                                                                                                                                                                                                                                                                                                                          | O           |
| S5  | Division of another tenant                                                                                                                     | not run (one tenant only); `syncHazardousEventSpatialFootprint` checks existence only (`event.ts:351-420`)                                                                                                                                                                                  | —                                                                                                                                                                                                                                                                                                                                                                                                               | C (DEF-005) |
| S6  | Export                                                                                                                                         | `spatialFootprint` is skipped (`csv_export.ts:36`)                                                                                                                                                                                                                                          | —                                                                                                                                                                                                                                                                                                                                                                                                               | O (E1)      |
| A1  | `attachments` = JSON array: Link `https://…` with tags; Link `javascript:alert(1)`; File `{name:"/uploads/temp/csv6d-does-not-exist.pdf"}`     | "1 records"                                                                                                                                                                                                                                                                                 | stored in legacy `hazardous_event.attachments` jsonb as given, including the **`javascript:` URL**; the File item rewritten to `/uploads/hazardous-event/<id>/csv6d-does-not-exist.pdf`, **a dangling path** (no file moved); nothing in `hazardous_event_attachment`                                                                                                                                           | O           |
| A2  | `attachments` = a JSON object, not an array                                                                                                    | "1 records"                                                                                                                                                                                                                                                                                 | `attachments: []`, **silently dropped**                                                                                                                                                                                                                                                                                                                                                                         | O           |
| A3  | Any create, with or without attachments                                                                                                        | —                                                                                                                                                                                                                                                                                           | an **empty directory `uploads/hazardous-event/<id>` with no tenant segment** per row, including rows of files that were rolled back (3 found for round-1 mixed files)                                                                                                                                                                                                                                           | O           |
| A4  | Tenant of the upload directory                                                                                                                 | —                                                                                                                                                                                                                                                                                           | taken from the client-supplied `item.file.tenantPath` because `processAndSaveAttachments` passes none (`event.ts:2416-2433`, `UploadFile.tsx:185-186, 223-228, 318+`); not exploited                                                                                                                                                                                                                            | C (DEF-064) |
| A5  | Export                                                                                                                                         | `attachments` is skipped (`csv_export.ts:36`)                                                                                                                                                                                                                                               | —                                                                                                                                                                                                                                                                                                                                                                                                               | O (E1)      |
| W1  | Export for each role                                                                                                                           | `authLoaderWithPerm("ViewData")` with no role filter (`csv-export.ts:8-21`, `csv_export.ts:11`): every role with ViewData (`roles.ts:339-364`: data-viewer, data-collector, data-validator, admin) gets every row of the tenant, every `approvalStatus`. Not observable as test admin only. | —                                                                                                                                                                                                                                                                                                                                                                                                               | C           |

Cleanup of round 2: 6 rows deleted by exact id with the same marker guard, plus their 2
`event_relationship` rows; geometry and division rows had already been cleared by S4. 16 empty
upload directories for my round-1 and round-2 ids were removed, plus 3 empty directories of
rolled-back round-1 rows. For those 3, I confirmed the ids were absent from `event` and the
directory times matched my run; 4 empty directories from earlier that day were left alone. After
cleanup: 42/44/39, 0 `event_relationship`, 0 geometry/division rows, 2 causality and 12
attachment rows, 0 orphan workflow instances, 0 marked rows.

### Legacy vs CA behaviour after this change

| Concern                    | Legacy (evidence)                                                                                 | CA after 6d (spec)                                                                                                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tenant on create           | session tenant dropped, row is NULL-tenant (I1; `form_csv.ts:76-81` vs `event.ts:601-605`)        | session tenant always                                                                                                                                                                    |
| `countryAccountsId` column | honoured (0e; I6)                                                                                 | ignored and reported (OD-2)                                                                                                                                                              |
| Upsert lookup              | no tenant filter (`event.ts:1560-1570`; P2)                                                       | `findIdByApiImportId` tenant-scoped                                                                                                                                                      |
| Transaction                | one transaction per file (`form_csv.ts:61,134,224`; I5/U6/P5)                                     | one transaction per file (OD-4)                                                                                                                                                          |
| Columns accepted           | `fieldsDefApi` set (X1)                                                                           | the same set, plus optional `specificHazardId`, `specificHazardLocalName`, `specificHazardNationalName`; read-only legacy export columns ignored (D3)                                    |
| Hazard                     | HIP ids, any combination, mismatches stored, none at all accepted (I12, H1, H2)                   | HIP ids resolved through `source_ref_id`; a contradiction or a missing hazard is a row error (D13, NOD-5, NOD-6)                                                                         |
| Workflow status            | `approvalStatus` stored directly, no WorkflowInstance (I10, U5)                                   | mapped to a WorkflowInstance through the domain's own transitions, admin only for non-draft, no notifications (D12)                                                                      |
| Status-aware edit          | none                                                                                              | same rule as the edit route; an unchanged re-import is skipped, not rejected (D5, NOD-4)                                                                                                 |
| `parent`                   | `event_relationship`; cycle and self checks on update only; no time-order check on create (P1-P5) | CA cause link (`hazardous_event_causality`), tenant-scoped, cycle and time-order checks on create and update (D14)                                                                       |
| `spatialFootprint`         | legacy geom/division tables, divisions not tenant-checked, `[]` clears (S1-S5)                    | 6d-1: accepted and ignored with a notice (D15). 6d-2: tenant-checked CA spatial observation                                                                                              |
| `attachments`              | jsonb stored unvalidated; dangling File paths; `javascript:` links kept (A1-A4)                   | 6d-1: accepted and ignored with a notice (D15). 6d-2: CA attachment rows, http(s) links only, own-file references only                                                                   |
| Errors                     | first error only, no line, raw constraint names, "Server error" for parse/size (I5, I6, I17, I19) | every validation error with line and column; specific file-level codes (OD-6)                                                                                                            |
| Encoding                   | BOM ok, invalid UTF-8 silently replaced (I14, I15)                                                | BOM ok, invalid UTF-8 rejected                                                                                                                                                           |
| Export columns             | raw table columns (E1); no `parent`/`spatialFootprint`/`attachments`                              | legacy export header unchanged plus `parent` (6d-1); `spatialFootprint`/`attachments` appended in 6d-2 (D9, NOD-10)                                                                      |
| Export roles               | every ViewData role, every row (W1)                                                               | the same (OD-9)                                                                                                                                                                          |
| Export formula injection   | none (E3)                                                                                         | guarded (OD-10)                                                                                                                                                                          |
| Round trip                 | fails on the header (U7)                                                                          | an exported file re-imports in update mode, and in upsert mode for rows with an `apiImportId`; rows equal to the export projection are skipped before any other rule (D3, NOD-4, NOD-13) |

### Layer ownership (Clean Architecture/DDD, ADR-009 "Decision")

- **Application** (`app/domains/hazardous-events/application/`):
  - `ImportHazardousEventsCsvUseCase`: orchestration, one transaction, status rule, logging.
  - `ExportHazardousEventsCsvUseCase`: read, role restriction, logging.
  - `csv/hazardousEventCsvColumns.ts`: the column contract.
  - `csv/mapCsvRowToCommand.ts`: pure mapping and validation of rows already parsed to
    `string[][]`.
  - DTOs `HazardousEventCsvImportResult`, `HazardousEventCsvRowError` and
    `HazardousEventExportRow`.
- **Application, `validation-workflow`:** `ApplyImportedWorkflowStatusUseCase` (D12).
- **Infrastructure:** the two new repository methods, the taxonomy reverse lookup
  `findBySourceRefIds` (D13), and the `DrizzleTransactionRunner` savepoint.
- **Presentation** (`presentation/web/csv/`):
  - `parseCsvUpload.server.ts`: multipart, size limit, strict UTF-8 decoding and csv-parse. These
    are transport and file-format concerns, so they stay out of the use case.
  - `serializeCsv.ts`: RFC 4180 writer and formula guard. These are output-format concerns.
  - `HazardousEventCsvImportPage.tsx` and the route modules.
- **Shared** (`app/shared/persistence/`): the `ITransactionRunner` signature.

The use cases receive `string[][]` and return or produce plain rows. They never see `File`,
bytes or HTTP. This keeps them testable in PGlite without multipart machinery, the same
reasoning the 0e test file header gives.

## Goals / Non-Goals

**Goals:** close 0e bugs 1-3 on the CA path; keep legacy's all-or-nothing behaviour; give
usable errors; make export safe (tenant, role, formula injection) and complete (unmigrated
rows); keep every existing CSV file and template importable (OD-1) and make an exported file re-import (D3, NOD-4); honour the source system's workflow status (D12); carry `parent` (D14) and accept, without breaking, files that contain `spatialFootprint`/`attachments` (D15); follow ADR-001/002/003/004/007/008/009.

**Non-Goals:**

- Retiring or patching the legacy CSV routes. That is Phase 7 (OD-14 asks whether to disable
  them sooner).
- Phase M data backfill.
- REST API CSV (that is 6f).
- Mapping `spatialFootprint` and `attachments` (roadmap 6d-2, follows this change).
- Translating taxonomy names (DEF-050).
- ADR-006 (unapproved draft, not used).

## Decisions

### D1. Two use cases plus pure column and mapping modules, in the HE application layer (ADR-009)

Import and export are HE use cases because they enforce HE business rules: the tenant, the
status-aware edit rule, the DRAFT start state and the role restriction. The CSV byte format is
presentation. Notices was checked and has no CSV, so there is no precedent to follow or deviate
from.

New types:

- `ImportHazardousEventsCsvCommand { tenantId; actingUserId; role: string | null; mode: "create" | "update" | "upsert"; header: readonly string[]; rows: readonly (readonly string[])[]; firstDataLine: number }`.
  `firstDataLine` is the physical line number of `rows[0]`, which the parser reports, so line
  numbers stay correct when a quoted cell spans lines.
- `HazardousEventCsvImportResult = { ok: true; mode; created: number; updated: number; unchanged: number; ignoredColumns: string[]; skippedDataNotice?: { rows: number } } | { ok: false; mode; fileErrors: HazardousEventCsvFileError[]; rowErrors: HazardousEventCsvRowError[]; errorCount: number; ignoredColumns: string[] }` (at most 200 listed errors; `errorCount` is the total, gate 10).
- `HazardousEventCsvFileError { code: "unknown_column" | "duplicate_column" | "missing_required_column" | "invalid_mode" | "no_data" | "file_too_large" | "invalid_encoding" | "malformed_csv" | "missing_file"; column?: string; line?: number }`.
- `HazardousEventCsvRowError { line: number; column?: string; code: "required" | "invalid_date" | "invalid_enum" | "invalid_id" | "duplicate_key" | "not_found" | "conflict" | "not_editable" | "not_migrated" | "concurrent_modification" | "api_import_id_immutable" | "hip_mismatch" | "specific_hazard_required" | "status_not_permitted" | "status_change_not_supported" | "cause_after_effect" | "parent_multiple_causes" | "invalid_character" | "validation"; value?: string }`.
- `ExportHazardousEventsCsvQuery { tenantId }` (no role parameter: OD-9 keeps legacy's no-filter rule), which returns
  `{ header: readonly string[]; rows: string[][]; count }`. The rows are already formatted
  strings: dates as stored, timestamps as UTC ISO `Z`. Formula guarding is **not** applied here.
  It is an output-format concern applied by `serializeCsv` (D8).
- `HazardousEventExportRow`: a plain projection with the D3 export fields, the WorkflowInstance
  status and attribution (or `null`), the three taxonomy `source_ref_id`s, the cause id, and the
  legacy fallback values of D9 (NOD-9).

The use case returns a result DTO. It does not throw for user-correctable file or row problems:
those are expected business outcomes, not exceptions to the request (ADR-004 "Expected business
outcomes are not error"). Inside the use case, row-level `DomainError`s that the CA use cases
throw are caught **only** to stop processing and record the line, and then the transaction
is rolled back (D4). Anything else propagates (ADR-003 Rule 4).

### D2. Tenant and user only from the session; ignored, never honoured (closes 0e bugs 1-3)

The route action passes `tenantId` from `resolveTenantId(request, lang)` and `actingUserId`
from `requireUser`, in the same order as `new.tsx:97-100`. The column contract has no tenant
field, so a `countryAccountsId` cell has nowhere to go. It is accepted only because it is in
the ignored set (OD-2), which keeps old files and legacy example files from failing. The upsert
lookup is `findIdByApiImportId(apiImportId, tenantId, tx)`. Update goes through
`findById(id, tenantId, tx)`, which is tenant-scoped, so a foreign id reads as `NotFoundError`
and becomes the row error `not_found` (the same answer as a missing id, so nothing is
disclosed). Port of the 0e scenarios: spec "The tenant and acting user come only from the
uploader's session".

### D3. Column contract: legacy-compatible (OD-1 decided)

Import accepts the legacy `fieldsDefApi` keys (`hazardeventform.tsx:191-222`, observed in the
example files, X1), in any order. It also accepts three optional CA columns. Export writes the
legacy export header (E1) unchanged and appends `parent` (NOD-10; 6d-2 later appends
`spatialFootprint` and `attachments`). Every export column is either accepted or ignored by import, so a file exported by
6d re-imports.

| Column                                                                                                                                                                               | create                                                                                        | update                                | upsert                      | export                                            | Notes                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- | ------------------------------------- | --------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                                                                                                                                                                 | rejected (`unknown_column`; legacy also rejects it, because `id` is not in `fieldsDefApi`, C) | **required**                          | ignored                     | yes (E1 position)                                 | UUID format checked before any write                                                                                                               |
| `apiImportId`                                                                                                                                                                        | optional                                                                                      | optional, must equal the stored value | **required**                | yes                                               | tenant-scoped uniqueness                                                                                                                           |
| `hipHazardId`, `hipClusterId`, `hipTypeId`                                                                                                                                           | hazard source (D13)                                                                           | optional; present → re-resolved       | as create/update            | yes, from the taxonomy `source_ref_id` chain (D9) | legacy column names kept                                                                                                                           |
| `specificHazardId`                                                                                                                                                                   | optional (new; alternative to `hipHazardId`)                                                  | optional                              | optional                    | yes (already in E1)                               | must agree with the HIP ids if both are given (D13)                                                                                                |
| `approvalStatus`                                                                                                                                                                     | optional, default `draft`                                                                     | optional (NOD-4)                      | as create/update            | yes, mapped back from the WorkflowInstance (D12)  | `draft`, `waiting-for-validation`, `needs-revision`, `validated`, `published`                                                                      |
| `parent`                                                                                                                                                                             | optional                                                                                      | optional; empty clears                | as create/update            | yes (appended)                                    | D14                                                                                                                                                |
| `spatialFootprint`                                                                                                                                                                   | accepted, ignored with a notice (D15)                                                         | same                                  | same                        | not in 6d-1                                       | mapped in 6d-2                                                                                                                                     |
| `attachments`                                                                                                                                                                        | accepted, ignored with a notice (D15)                                                         | same                                  | same                        | not in 6d-1                                       | mapped in 6d-2                                                                                                                                     |
| `startDate`, `endDate`                                                                                                                                                               | **required**                                                                                  | optional                              | required on the create path | yes                                               | `YYYY`, `YYYY-MM`, `YYYY-MM-DD` (ADR-002); both required in legacy `fieldsDefCommon` and in the CA form (`HazardousEventFlexibleDateField.tsx:77`) |
| `recordOriginator`                                                                                                                                                                   | **required**                                                                                  | optional                              | required on the create path | yes                                               | legacy required (I4); CA form required (`HazardousEventFormPage.tsx:257-265`)                                                                      |
| `hazardousEventStatus`                                                                                                                                                               | optional                                                                                      | optional                              | optional                    | yes                                               | `forecasted`/`ongoing`/`passed`. This is the event's own lifecycle, **not** the workflow status, and it maps 1:1 to CA `hazardousEventStatus`      |
| `nationalSpecification`, `description`, `chainsExplanation`, `magnitude`, `dataSource`                                                                                               | optional                                                                                      | optional                              | optional                    | yes                                               | empty becomes `""`, never `null` (DEF-009 zeroText)                                                                                                |
| `specificHazardLocalName`, `specificHazardNationalName`                                                                                                                              | optional (new)                                                                                | optional                              | optional                    | yes (already in E1)                               | empty becomes `null`                                                                                                                               |
| `countryAccountsId`                                                                                                                                                                  | ignored                                                                                       | ignored                               | ignored                     | yes (E1)                                          | OD-2; never read                                                                                                                                   |
| `updatedAt`, `createdAt`, `createdByUserId`, `updatedByUserId`, `submittedByUserId`, `submittedAt`, `validatedByUserId`, `validatedAt`, `publishedByUserId`, `publishedAt`, `status` | ignored                                                                                       | ignored                               | ignored                     | yes (E1)                                          | read-only; NOD-1 decides whether the source timestamps are honoured                                                                                |
| any other                                                                                                                                                                            | rejected (`unknown_column`)                                                                   | same                                  | same                        | —                                                 | allow-list (OWASP Input Validation), same as legacy (I8)                                                                                           |

`spatialFootprint` and `attachments` cells are not parsed in 6d-1 (D15), so neither an empty
cell (legacy error, S2) nor malformed JSON (S3) fails a row.

**DEF-055 interaction.** The CA CSV path now depends on HIP ids again. It reads and writes them
only through the taxonomy tables' `source_ref_id`, never through `hazardous_event.hip_*` or
`IHipCrosswalkPort`, except as the D9 export fallback for unmigrated rows. The DEF-055 row was
updated accordingly.

### D4. All-or-nothing with one outer transaction and savepoints (recommended option of OD-4)

`ImportHazardousEventsCsvUseCase` runs in these phases:

1. Header check and full row mapping or validation, before any transaction is opened. The only
   DB access here is one taxonomy read (`findBySourceRefIds`, D13) on the pool. Create-mode rows
   are checked against the non-draft status permission here (NOD-2). Every error is collected. If
   any error exists, it returns `ok:false`.
2. `transactionRunner.run(async (tx) => { for each row in order: … })`. Each row calls
   `create.execute({ ...cmd, tx })` or `update.execute({ ...cmd, tx })`. Upsert first calls
   `findIdByApiImportId(…, tx)`. Update and upsert-match rows then run, in order: the unchanged
   check against the export projection (NOD-4), which skips the row; then `not_migrated`, the
   deferred HIP/required errors (N5), `api_import_id_immutable`, the status-aware check
   (`not_editable`, OD-7), `parent_multiple_causes` (N4) and the status permission
   (`status_not_permitted`, NOD-2); then the write. A failure at this stage still rolls
   back the whole file, so nothing is written.
3. On the first row `DomainError`, the use case records the row error with its line and
   throws a private `CsvRowRejected` sentinel out of the callback. That makes
   `transactionRunner.run` roll back everything. The use case catches only that sentinel and
   returns `ok:false`.
4. After commit, it logs `hazardous_events.csv_imported` once.

Why not per-row commit: the legacy behaviour (all-or-nothing in all three modes) was observed
live and users rely on it. A partially-applied file is also hard to recover from: re-running
it in create mode would duplicate the rows that already committed.

Why savepoints: Create and Update already open their own transaction through
`ITransactionRunner`. Adding `outerTx` (SAVEPOINT via Drizzle's nested `tx.transaction()`; the
repository's `insert` already nests this way, `DrizzleHazardousEventRepository.server.ts:615`)
keeps each use case's own atomicity and lets the import own the outer commit.

Why every pre-read must take `tx` (NOD-12). Today Create and Update run these reads on the pool,
before their own transaction opens:

- the taxonomy valid-id reads (`CreateHazardousEvent.ts:150-158`, `UpdateHazardousEvent.ts:244-252`);
- the cause `findById` and `findReachableEdgesFrom` (`CreateHazardousEvent.ts:164-171`,
  `UpdateHazardousEvent.ts:412-416`);
- `hipCrosswalkPort.resolve` (`CreateHazardousEvent.ts:177`, `UpdateHazardousEvent.ts:269`);
- Update's `findById` and workflow read (`UpdateHazardousEvent.ts:215-226`).

`RecordSpatialObservationUseCase` already threads `tx` (`RecordSpatialObservation.ts:87-118`).
Under D4 those reads would run while the import holds its transaction open. On PGlite that
deadlocks (`DrizzleTransactionRunner.test.ts:90-91`); on Postgres each import would hold two
pool connections, so concurrent imports could exhaust the pool. When a caller `tx` is given,
every one of them therefore runs on it. That needs an optional `tx` on
`IHazardTaxonomyRepository`'s two reads, `IHipCrosswalkPort.resolve`,
`ICausalChainRepository.findReachableEdgesFrom`, `GetWorkflowInstanceByEntityUseCase` and
`IWorkflowRepository.findByEntity` (specs added). This is the extra cost of OD-4's single
transaction.

Why rows are sequential: one Postgres transaction cannot run statements in parallel (spec
transaction-runner-port).

Logging (revised by user override, 2026-11-25; the original plan skipped the line under `tx`):
Create and Update log their usual `hazardous_event.created`/`.updated` `info` line once per event
also when `tx` is given — "info shouldn't be suppressed". With a caller `tx` the line is written
at savepoint release, before the caller commits, so after a rolled-back import it names an event
that does not exist. Only `hazardous_events.csv_imported` marks a committed file.

DEF-047 confirmation: on the CA path every rejection is a thrown `DomainError`
(`HazardousEvent.create`, the repository's `mapWriteError`, `assertCausalLinkDoesNotCreateCycle`).
Nothing returns `ok:false` that could be committed past. Legacy `formSave`'s
commit-on-return gap therefore does not apply here.

Lock and time cost: a 10 MB file can hold tens of thousands of rows in one transaction. Each
row does about 6-10 statements (insert event, insert hazardous_event, children, audit, HIP
stamp, workflow insert). The import holds row locks until commit. Whether a row cap is needed
is OD-15.

### D5. Status-aware rule for update rows (recommended option of OD-7)

`isStatusAwareEditBlocked(role, workflowStatus)` moves to
`application/editPolicy.ts` as a pure function. `presentation/web/isStatusAwareEditBlocked.ts`
re-exports it, so the list page and `requireStatusAwareEditPermission` are unchanged and their
tests keep passing. The import calls it per update row with the workflow status from
`GetWorkflowInstanceByEntityUseCase`. If it is blocked, the row error is `not_editable`, unless every supplied value equals the stored
one, in which case the row is skipped and counted as unchanged (NOD-4). Role
`data-viewer` never reaches the import because the route requires EditData.

### D6. Row and file errors are action data, not a thrown envelope (recommended option of OD-6)

The route returns `HazardousEventCsvImportResult` as action data (ADR-007: return the result
directly). This is the same pattern `new.tsx:185-201` uses for `fieldErrors`. The ADR-003
envelope is still used, via `throwHazardousEventLoaderError`, for:

- authentication and authorization failures (403);
- `resolveTenantId` failures;
- unexpected errors (500 with `traceId`, rendered by 6b's `HazardousEventErrorBoundary`, which
  is exported from `csv-import.tsx`).

`toErrorResponseDetails` stays `{ field }`-only, so Notices and the shared REST filter are
untouched.

Messages are translated in the page from `csv.error.<code>` keys with `{line, column}`
interpolation. They are never taken from `DomainError.message`.

`value` is echoed for the cell-level codes `invalid_date`, `invalid_enum`, `invalid_id` and
`duplicate_key` only, truncated to 100 characters and rendered as React text. It is the
uploader's own content (ADR-008: shown as written).

Domain errors map to row codes as follows:

- `NotFoundError` → `not_found`
- `ConflictError` → `conflict`
- `ConcurrentModificationError` → `concurrent_modification`
- `ValidationError` with `field` → `validation`, with `column` set to that field if it is a CSV
  column
- `ValidationError` raised while rehydrating the existing event (an unmigrated row) →
  `not_migrated`. This is detected by catching it around the `findById` step only.

### D7. Upload parsing (presentation)

`parseCsvUpload.server.ts` runs these steps:

1. `parseFormData(request, { maxFiles: 1, maxFileSize: 10_000_000 })` from
   `@mjackson/form-data-parser@0.9.1`, the version installed and already used by legacy.
   `MaxFileSizeExceededError` maps to `file_too_large`.
2. Get the `file` field. A missing or non-`File` value gives `missing_file`.
3. Read `arrayBuffer()` and decode it with
   `new TextDecoder("utf-8", { fatal: true, ignoreBOM: false })`. A `TypeError` gives
   `invalid_encoding`. The BOM is stripped by the decoder's default.
4. Parse with `csv-parse@6.1.0`, using `{ bom: true, relax_column_count: false, trim: true, info: true }`.
   A `CsvError` gives `malformed_csv` with the parser's line number. Legacy trims every field
   (`app/utils/csv.ts:13`); `trim: true` keeps that.

The filename and Content-Type are not used for any decision (OWASP File Upload: "don't trust
the Content-Type header"). The file is not stored anywhere.

### D8. Export serialization (presentation)

`serializeCsv(header, rows)` uses `csv-stringify@6.6.0` with
`record_delimiter: "windows"` and `quoted_match` for `"`, `,`, CR and LF (RFC 4180), for guarded
cells (OWASP) and for cells with leading or trailing whitespace, which the trimming import parser
would otherwise drop (review M4). Before stringifying, every cell
in every column passes through `guardFormulaCell` (gate 10: status columns have no CHECK, so none is exempt), which prefixes `'` when the first
character is in the OWASP set `= + - @ \t \r \n ＝ ＋ － ＠`.

csv-stringify's own `escape_formulas` covers `= + - @ \t \r` only, which misses LF and the
full-width forms that OWASP lists. That is why the guard is our own function (OD-10).

Response headers:

- `Content-Type: text/csv; charset=utf-8; header=present` (RFC 4180 §3)
- `Content-Disposition: attachment; filename="hazardous-event.csv"` (OD-11, legacy name, E1)
- `Cache-Control: no-store`, so tenant data is not cached by shared caches (legacy already sends
  this globally; observed E1)

### D9. Export read path and values (OD-8, OD-9, NOD-9, NOD-10)

`findExportRows(tenantId)` is one SQL statement over `hazardous_event` that left-joins the
following:

- `workflow_instance` (entity type `HE`);
- `specific_hazard` → `hazard_cluster` → `hazard_type`, for the three `source_ref_id` values;
- the CA cause (`hazardous_event_causality.effect = id`), as the lowest cause id through a
  scalar subquery, so an effect with several causes (possible in migrated data) is still one row
  (review M2);
- the legacy `event_relationship` parent, used by the export only for unmigrated rows (null
  `specific_hazard_id`), because on a migrated row no CA cause means it was cleared (NOD-9,
  review M5). The footprint and attachment joins come with 6d-2.

It is scoped by `WHERE country_accounts_id = $tenant` and ordered `ORDER BY id`. It does not
rehydrate the entity, so rows with a null `specific_hazard_id` still export. There is **no role
filter**: every ViewData role gets every row of the tenant, which is legacy behaviour (W1,
OD-9). The `allowedStatuses` option from the first draft is dropped.

Values written:

- **`approvalStatus`**: mapped back from the WorkflowInstance status (D12 table, reverse
  direction). `REJECTED` has no legacy value and is unreachable (DEF-022), so it is written as an
  empty cell. Without a WorkflowInstance, the stored legacy `approvalStatus` is used.
- **`submittedByUserId`/`At`, `validatedByUserId`/`At`, `publishedByUserId`/`At`**: from the
  WorkflowInstance when present, otherwise from the legacy columns.
- **HIP ids**: from the taxonomy chain. When `specific_hazard_id` is null, the stored
  `hazardous_event.hip_*` values are used.
- **`parent`**: the CA cause or the legacy fallback (D14). `spatialFootprint` and
  `attachments` are not emitted in 6d-1 (D15).
- **Timestamps**: UTC ISO 8601 `Z` (ADR-002).

### D10. Routes (fixes the roadmap path)

All three routes sit under `app/routes/$lang+/_authenticated+/he-preview+/`. They are hidden
(no nav link) and use the same family as 6a/6c.

| Route file        | URL                                     | Loader                                                                                                                        | Action                                                                              | Default export                                   | ErrorBoundary                 |
| ----------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------ | ----------------------------- |
| `csv-import.tsx`  | `/{lang}/he-preview/csv-import`         | namespaces → `requireUser` → `resolveTenantId` → `requireEditDataPermission`; returns `{}`                                    | same guards → `parseCsvUpload` → `ImportHazardousEventsCsvUseCase` → result as data | `HazardousEventCsvImportPage` in `MainContainer` | `HazardousEventErrorBoundary` |
| `csv-export.ts`   | `/{lang}/he-preview/csv-export`         | namespaces → `requireUser` → `resolveTenantId` → `requireViewDataPermission` → export use case → `new Response(csv, headers)` | —                                                                                   | none (resource route)                            | n/a (thrown envelope only)    |
| `csv-template.ts` | `/{lang}/he-preview/csv-template?mode=` | EditData guards; unknown mode → 404 envelope                                                                                  | —                                                                                   | none                                             | n/a                           |

Each loader and action resolves its use case with `getAppContext().get(...)` and runs inside the
existing request context, so the `traceId` reaches logs and envelopes (ADR-004 "Request Context
via AsyncLocalStorage").

### D11. i18n (ADR-001, ADR-008)

New keys go under `csv.*` in `locales/{en,fr}/hazardous-events.json`:

- the page title;
- the labels;
- the three mode names;
- the submit and submitting labels;
- the success line, with separate counts;
- the failure summary;
- the ignored-columns line;
- one `csv.error.<code>` per file and row code;
- the template link labels and the back link.

French copy is drafted in the same task, and the reviewer flags it for translator review. No
em dashes, sentence case. Cell values are never translated (ADR-008).

### D12. Imported workflow status (OD-3, NOD-1 to NOD-4 decided)

`approvalStatus` maps to a CA `Status` through the existing transitions in
`WorkflowInstance.ts`. The mapping follows the meaning pairing already used by
`workflowStatusDisplay.ts:14-44` (6a design Decision 8):

| Legacy `approvalStatus`  | CA `Status`          | Path from the DRAFT that `CreateHazardousEventUseCase` initializes | Attribution required (`REQUIRED_SET`, `WorkflowInstance.ts:71-78`) |
| ------------------------ | -------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| empty, `draft`           | `DRAFT`              | none                                                               | none                                                               |
| `waiting-for-validation` | `SUBMITTED`          | `submit`                                                           | submitted pair                                                     |
| `needs-revision`         | `REVISION_REQUESTED` | `submit`, then `requestRevision`                                   | submitted pair                                                     |
| `validated`              | `APPROVED`           | `directValidate`                                                   | validated pair (`directValidate` sets it)                          |
| `published`              | `PUBLISHED`          | `directPublish`                                                    | validated and published pairs (`directPublish` sets both)          |
| anything else            | —                    | row error `invalid_enum`                                           | —                                                                  |

No legacy value maps to `REJECTED` (DEF-022: it is unreachable in CA too). The legacy enum has
exactly these five values (`app/utils/drizzleUtil.ts:51-61`).

New application use case, in the `validation-workflow` context because it is a workflow concern
and works for any entity type: `ApplyImportedWorkflowStatusUseCase.execute({ entityId,
entityType, tenantId, targetStatus, actingUserId, actingUserRole, tx })`. It behaves as follows:

- It reads the instance with `tx`. `IWorkflowRepository.findByEntity` has no `tx` today
  (`IWorkflowRepository.ts:16-19`), so it gains an optional one; otherwise it could not see the
  DRAFT instance Create just inserted in the same uncommitted transaction (spec
  `workflow-repository-port`). It then walks the path above using the domain's own transition
  methods, so `REQUIRED_SET`/`REQUIRED_NULL` hold by construction.
- It saves the result with `tx` and writes one audit entry ("Workflow status imported",
  `countryAccountsId = tenantId`) with `IAuditLogPort.record(entry, tx)`. A failure rejects.
  This deliberately differs from `ProcessWorkflowActionUseCase.recordAuditEntry`, which records
  without `tx` and tolerates failure (`ProcessWorkflowAction.ts:219-250`), because an import must
  not commit a status change with no audit trail.
- It **never** calls `INotificationPort`. Direct-validate and direct-publish already never
  notify (`ProcessWorkflowAction.ts:74-91`), and a bulk onboarding must not email validators.
- It does not log its own success; the import logs once (ADR-004).
- It requires `isWorkflowActionAuthorized("direct-publish", role)` (admin only,
  `isWorkflowActionAuthorized.ts`) for any non-DRAFT target, enforced inside the use case and
  never by a second literal, the same precedent as direct-validate/direct-publish. The import checks
  the role in its validation phase too, so a non-admin file fails with a row error before any
  write (NOD-2).

The actor is the importing user and the time is the import time (NOD-1, recommended).
`ProcessWorkflowActionUseCase` is not reused because it notifies on `submit`/`requestRevision`
and opens its own write path.

**DEF-010** (direct-publish policy): import uses the existing admin-only `directPublish`. It does
not widen that policy, so the PM question stays open. **DEF-049**: an imported `SUBMITTED` event
has no validator assignment, because CA has no such concept yet. **DEF-063**: still not
triggered. Its subject is the he-preview create route's post-commit workflow step; the import
applies status inside its single transaction.

### D13. HIP to CA taxonomy mapping (OD-1, NOD-5, NOD-6 decided)

There is a new read method on the existing taxonomy port:
`ISpecificHazardTaxonomyRepository.findBySourceRefIds({ hazardRefs, clusterRefs, typeRefs })`.
It returns, for each given HIP id, the CA id and that entry's ancestor ids. There is one batched
query per import, made in the validation phase.

Why the mapping is reliable in every environment, not just this DB (H3):

- `source_ref_id` is `UNIQUE` on all three taxonomy tables.
- The CA ids are a fixed md5 formula of the HIPs version and the legacy id, documented as
  "identical across instances".
- The seed aborts unless it finds exactly 8 types, 38 clusters and 281 hazards.
- Every `hip_hazard` row becomes a `specific_hazard` row.
- Both migrations are in the drizzle journal, so `yarn dbsync` applies them everywhere.

Limit: an entry added after that migration has a null `source_ref_id` (DEF-055 residual), so it
can only be imported by `specificHazardId`. That is one reason the optional `specificHazardId`
column exists.

Row rules:

1. `hipHazardId` given: resolve it. If it is unknown, the row error is `not_found` on
   `hipHazardId` (legacy also failed, I2). If `hipClusterId` or `hipTypeId` are also given and
   are not that hazard's ancestors, the row error is `hip_mismatch` (NOD-5; legacy stored the
   contradiction, H2).
2. `specificHazardId` given: it must exist (otherwise `not_found`). If HIP ids are also given,
   they must resolve to the same entry (otherwise `hip_mismatch`).
3. Neither given, or only type/cluster given: the row error is `specific_hazard_required`
   (NOD-6). The CA entity requires `specificHazardId` (`HazardousEvent.ts:306-320`). Legacy
   accepted such rows (I12, H1). This is the one unavoidable incompatibility unless the entity
   invariant changes, which is out of scope.

### D14. `parent` → CA cause link (OD-5, NOD-9 decided)

`parent` maps to `causeId` on `CreateHazardousEventCommand`/`UpdateHazardousEventCommand`:

- Empty on create means no cause. Empty on update clears the link, the existing `""` semantics
  in `UpdateHazardousEvent.ts:84-96`.
- The existing rules apply, now on create too:
  - a tenant-scoped `findById`, so an unknown or other-tenant id gives `not_found`, the same
    answer as legacy's "Parent event not found" (P2);
  - the cycle check gives `conflict`; legacy checked this on update only (P4);
  - a self-reference is a cycle;
  - time order is checked: the cause must not start after the effect, otherwise the row error
    is `cause_after_effect`. Legacy create skipped this (P3), so this is stricter, by the 4c/5i
    CA invariant.
- Writes go to `hazardous_event_causality`, not legacy `event_relationship`. CA writes keep one
  cause per effect (`replaceCauseEdge`); migrated data can hold several, so a `parent` change on
  such an effect is rejected with `parent_multiple_causes` (N4, user decision 2026-11-25).
- `parent` is sent to Update only when it differs from the exported value, so an unchanged link
  keeps its `causality_explanation` (review M1).
- `parent` can only name an existing event, never one created earlier in the same file. Its id
  is generated by the server, so the file cannot know it.
- Export writes the CA cause (the lowest id when there are several), or, for an unmigrated row
  only, the legacy `event_relationship` parent (NOD-9, review M2/M5).

### D15. `spatialFootprint` and `attachments` in 6d-1 (RD-1, resolved by default)

These two columns are mapped in **6d-2** (roadmap entry "6d-2"). It carries the round-2
findings S1-S6 and A1-A5, the approved NOD-7/NOD-8/NOD-9 rules, and the deferred file-deletion
design.

In 6d-1:

- **Import:** both columns are accepted and **ignored**. The result lists them under ignored
  columns, plus a per-file notice: "N rows had spatial footprint or attachment data that was not
  imported". Their cells are not parsed, so malformed JSON in them is not an error. On update and
  upsert, the event's existing footprint and attachments stay as they are. Ignored cells are left
  out of the unchanged check (NOD-4).
- **Export:** the two columns are **not emitted**. That matches legacy, whose export never had
  them (`csv_export.ts:36`, S6, A5). 6d-2 appends them after `parent`.

Why this is compatible with the no-breakage rule:

- No existing file fails because of these columns; legacy example files and exports with or
  without them import.
- The notice makes the skipped data visible; it is never dropped silently.
- 6d-1 ships on the hidden he-preview route. Users keep the legacy CSV routes until the Phase 7
  cutover (OD-14), and 6d-2 lands before that cutover.
- Re-running the same onboarding file in upsert mode after 6d-2 fills the footprints and
  attachments in, because the other rows are skipped as unchanged.

Evidence for dropping the Update "delete files after commit" change from 6d-1: with no
`attachments` in the command, Update resolves `fileKeysToDelete: []`
(`UpdateHazardousEvent.ts:286-294`), so `deleteAttachmentFiles` (`:364`) is a no-op. 6d-1 never
passes attachments, so nothing can dangle on rollback. The deferral moves to 6d-2.

No spatial observation is recorded by 6d-1 either, so `RecordSpatialObservationUseCase` is not
called.

### Test infrastructure

- **Unit (Vitest):**
  - `hazardousEventCsvColumns`;
  - `mapCsvRowToCommand`, covering every row code, empty-versus-absent semantics, and the
    `""`-not-`null` rule for zeroText fields;
  - `guardFormulaCell`, `serializeCsv` and `parseCsvUpload`, using a constructed `Request` with
    multipart bodies for the size, encoding, BOM, ragged-row and quote cases.
- **PGlite (`yarn test:run2`)**, under `tests/integration/domains/hazardous-events/`:
  - `ImportHazardousEventsCsvUseCase.test.ts`: the 0e ports, all-or-nothing, status rule, DRAFT
    workflow and logging;
  - `ExportHazardousEventsCsvUseCase.test.ts`: tenant, every ViewData role gets every row
    (OD-9), a null-`specific_hazard_id` row, a no-workflow row, the reverse status mapping, HIP
    ids from the taxonomy chain, and the legacy fallbacks of NOD-9;
  - `ApplyImportedWorkflowStatusUseCase.test.ts`
    (`tests/integration/domains/validation-workflow/`): each D12 row, REQUIRED_SET/NULL hold, no
    notification port call, admin-only, audit entry, rollback with the caller `tx`;
  - the mapping cases of D13-D15: HIP resolution and mismatch, `parent` rules, and
    `spatialFootprint`/`attachments` accepted, ignored and counted in the notice;
  - an export-then-import round-trip test: an unchanged file re-imports with every row
    `unchanged`;
  - repository tests for `findIdByApiImportId` and `findExportRows`, and the taxonomy
    `findBySourceRefIds`;
  - `DrizzleTransactionRunner` savepoint tests;
  - Create and Update `tx` tests;
  - route tests `HazardousEventCsvImportRoute.test.ts` and `HazardousEventCsvExportRoute.test.ts`.
    These call the exported `loader`/`action` directly, the 6a/6c pattern.

  Rows that need a null `specific_hazard_id` or a null tenant are seeded with direct inserts,
  as `hazardousEventTestHelpers` does.

  Scenarios that need two transactions to interleave go to **`test:run3`** (real Postgres,
  `vitest.integration-realdb.config.ts`, `tests/integration-realdb/domains/hazardous-events/`,
  `.env.test` present). Those scenarios are two upserts racing on one `apiImportId`, two updates
  of one event, an export during an uncommitted import, and an uncommitted insert being invisible
  from another connection. This is a fact from existing code, not a guess:
  `tests/integration/db/DrizzleTransactionRunner.test.ts:90-91` records that a cross-session read
  during an open transaction deadlocks PGlite's single-instance model. That file's own
  "two concurrent calls" test (`:102-123`) only checks the final outcomes, not interleaving. The
  outcome-only parts (for example, exactly one event exists afterwards) stay in PGlite.
  DEF-003 (real-Postgres E2E instability) concerns 0e's remaining E2E characterization, not this
  integration tier. If the `test:run3` files hit the same `ECONNREFUSED` or hangs, report it
  rather than dropping the scenarios.

- **0e characterization file:** unchanged. The legacy bugs stay as they are until Phase 7. The
  new file asserts the opposite outcomes on the CA path. Each test title cites the 0e test it
  reverses.
- **DOM (`yarn test:dom`):** `HazardousEventCsvImportPage.dom.test.tsx`, covering the success,
  failure and ignored-columns states, French copy, the error-summary focus and announcement, and
  the submitting state.
- **E2E (Playwright, `PLAYWRIGHT_DATABASE_URL` from `.env.playwright`):**
  `tests/e2e/hazardous-events/he-preview-csv.spec.ts`. It covers: export download headers and
  first line; a legacy-format file (HIP columns, `approvalStatus=published` as admin, `parent`,
  and non-empty `spatialFootprint`/`attachments` cells that are reported as not imported) that imports and shows as published on the he-preview
  detail page; a create-mode upload that shows the success counts; a mixed file that shows the
  line-numbered errors and leaves no rows; a template download; and axe checks via
  `tests/e2e/helpers/a11y.ts`. Every created row is deleted through the CA delete action, and
  the test asserts there are no orphan `workflow_instance` rows. CA-created rows have a
  specific hazard, so CA delete works for them, with one exception found in the run: a PUBLISHED
  event linked as a cause or effect cannot be deleted through CA (delete is blocked by the causal
  link, and removing the link is blocked by the status-aware edit rule), so the spec removes those
  two rows directly.
- **Stryker:** only the pure rule-heavy modules (user decision, 2026-11-24): `csv/*.ts`, the
  formula guard and its reversal, `editPolicy.ts` and `ApplyImportedWorkflowStatus.ts`. The
  orchestration use cases, Create/Update plumbing, repository and taxonomy methods, and
  `parseCsvUpload.server.ts` are left out. Their behaviour is DB- and transaction-bound, and the
  PGlite integration tests already cover it.

### UI: reference source and ground-truth checklist (Gate 9c)

Reference type: **(a) a real existing page**, legacy `csvImportScreen`
(`app/frontend/csv_import.tsx:16-126`) at `/en/hazardous-event/csv-import`. It was read as code
and its rendered HTML was fetched live on 2026-11-24. It is not a list, detail or form page of
its own kind. The closest he-preview page for the wrapper is `new.tsx`.

| #   | Item                            | Legacy (observed)                                                                                                 | 6d target                                                                                                                           | Parity or deviation                                                       |
| --- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 1   | Layout wrapper                  | `MainContainer` with title "Hazardous events CSV Import" (h1 `dts-heading-1`)                                     | `MainContainer`, title `csv.title` ("Hazardous events CSV import")                                                                  | parity (the sentence-case copy rule changes "Import" to "import")         |
| 2   | Container                       | `div.mg-container` > `form.dts-form` `multipart/form-data`                                                        | same classes                                                                                                                        | parity                                                                    |
| 3   | Result area                     | `<p>` lines at the top of the form: "Imported or updated N records" (shown even on failure), then the first error | at the top of the form: on success, "N events created, M updated"; on failure, a summary then a list of "Line L, column C: message" | **deviation** (OD-6): all errors, line numbers, no false "0 records" line |
| 4   | Field 1                         | label "File upload" wrapping `input[type=file][name=file]`, no `accept`                                           | same, `accept=".csv,text/csv"` as a picker hint only                                                                                | deviation (UX hint, not a control)                                        |
| 5   | Field 2                         | label "Type" wrapping `select[name=import_type]`; options in order Update, Create, Upsert; default **Update**     | label "Type", same options; default **Create** (OD-13)                                                                              | deviation on the default only                                             |
| 6   | Submit                          | `input.mg-button.mg-button-primary` "Submit"; no pending state                                                    | `Button` from `app/design-system/components/` with the same primary look, "Import", disabled with "Importing…" while submitting     | deviation (prevents double submit, which matters in DEF-063's spirit)     |
| 7   | Back link                       | `LangLink` "Back to List" → `/hazardous-event`                                                                    | `BackLink` (6b, existing) → `/{lang}/he-preview`                                                                                    | parity of affordance (BackLink is the he-preview convention)              |
| 8   | Templates                       | h3 "Example files", then links Upsert, Create, Update to `/api/hazardous-event/csv-import-example`                | h3 `csv.templates.title`, links Create, Update, Upsert to `csv-template?mode=`                                                      | parity of affordance; order and header-only content per OD-17             |
| 9   | Ignored columns                 | not shown                                                                                                         | one line listing ignored columns                                                                                                    | new (transparency for OD-2/OD-3)                                          |
| 10  | Empty, loading and error states | none, none, root boundary                                                                                         | initial state: form only; submitting: button disabled; unexpected error: `HazardousEventErrorBoundary`                              | —                                                                         |
| 11  | Navigation into the page        | none (legacy list has no CSV buttons, X3)                                                                         | none (OD-12, recommended)                                                                                                           | parity                                                                    |

Accessibility (WCAG 2.2 AA):

- labels wrap their controls;
- the result region is `role="status"` on success; on failure it is `role="alert"`, and the
  summary receives focus after submit;
- tab order is file, mode, submit, back link, template links;
- targets are at least 24 × 24 px;
- the icon-free button has a visible name;
- error messages include the line and column in text, not only by position.

The page is not responsive-specific; it follows legacy's single-column form at 375 px.

### Documented deviations needing approval

Items 3, 4, 6 and 9 above (UI items approved with OD-13); the appended `parent` export column
(NOD-10); the formula prefix (OD-10); `invalid_encoding` rejection where legacy silently replaced
bytes (I15); and the stricter row rules of D13-D14 (`hip_mismatch`, `specific_hazard_required`,
`cause_after_effect`), each recorded in Resolved decisions.

### Expected Gate 9 evidence

- 9a: `yarn check:design-system --verify-spec --change ca-he-csv-migration --base origin/dev`,
  plus the skill items that apply to legacy-exempt code (no PrimeReact, Lucide only, no em
  dashes, sentence case).
- 9b: `runWcag22A11yCheck` on the initial, success, failure and French states; a keyboard
  sequence.
- 9c: `capturePrototypeStateScreenshots` for the legacy page and the new page, in the same
  states, at desktop and 375 px, into `test-results/gate-9/ca-he-csv-migration/`. The report
  goes to `openspec/changes/ca-he-csv-migration/evidence/gate-9-report.md` and is audited by a
  fresh `visual-parity-reviewer`.

## Resolved decisions, round 2 (user, 2026-11-24)

| ID     | Decision                                             | Outcome                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------ | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NOD-1  | Actor and time for an imported non-draft status      | As recommended: the importing user and the import time for every required pair.                                                                                                                                                                                                                                                                                                                             |
| NOD-2  | Who may import a non-draft status                    | As recommended: admin only (`isWorkflowActionAuthorized("direct-publish", role)`); others get `status_not_permitted`.                                                                                                                                                                                                                                                                                       |
| NOD-3  | Notifications on import                              | As recommended: none. Imported `SUBMITTED` events have no assigned validator (DEF-049).                                                                                                                                                                                                                                                                                                                     |
| NOD-4  | Status and edit rule on existing events              | As recommended: equal status is a no-op; forward only from DRAFT/REVISION_REQUESTED, by an admin; otherwise `status_change_not_supported`. Rows equal to the export projection are skipped first.                                                                                                                                                                                                           |
| NOD-5  | Contradictory HIP chain                              | As recommended: row error `hip_mismatch`.                                                                                                                                                                                                                                                                                                                                                                   |
| NOD-6  | Row without a specific hazard                        | Option (a): row error `specific_hazard_required`. **This is the one accepted compatibility break.** The CA entity requires `specificHazardId` (`HazardousEvent.ts:306-320`), a Phase 3 domain invariant. Relaxing it to allow type- or cluster-level events would change the entity and every CA read path, so it would be its own intent if a source system needs it. Legacy accepted such rows (I12, H1). |
| NOD-7  | Attachment rules                                     | As recommended: http/https links only; File items only as references to files already on that event; replace the set on update, deleting files after commit. **Applies in 6d-2** (roadmap).                                                                                                                                                                                                                 |
| NOD-8  | Spatial footprint rules                              | As recommended: `[]` clears (as legacy); a new observation only on change; import time. **Applies in 6d-2.**                                                                                                                                                                                                                                                                                                |
| NOD-9  | Export of unmigrated rows                            | As recommended: fall back to legacy data. In 6d-1 that covers status, attribution, HIP ids and `parent`; the footprint and attachment fallbacks come in 6d-2.                                                                                                                                                                                                                                               |
| NOD-10 | Export header                                        | As recommended: the legacy header unchanged, then appended columns. In 6d-1 only `parent` is appended; 6d-2 appends `spatialFootprint` and `attachments`. Residual check, tracked as task 1.5 and in Risks, not as an open decision: confirm with existing users that no downstream importer rejects extra trailing columns.                                                                                |
| NOD-11 | Split                                                | **Split.** This change is 6d-1. 6d-2 (spatial footprint and attachments) is a roadmap entry that follows 6d-1. It carries the round-2 findings and the approved NOD-7/NOD-8/NOD-9 decisions, and gets its own OpenSpec change only after this one is archived.                                                                                                                                              |
| NOD-12 | Pre-reads inside the import transaction              | As recommended: an optional `tx` on every pre-write read.                                                                                                                                                                                                                                                                                                                                                   |
| NOD-13 | Formula guard on re-import                           | As recommended: strip one leading `'` when the rest starts with a guarded character.                                                                                                                                                                                                                                                                                                                        |
| RD-1   | `spatialFootprint` and `attachments` columns in 6d-1 | **Resolved by default (no-breakage rule; human may override):** accepted and ignored, with a notice (D15).                                                                                                                                                                                                                                                                                                  |

No open decisions remain.

## Implementation notes (6d-1, sdd-implementer, 2026-11-24)

These refine the decisions above where the code had to pick a detail the design left open. None
reverses a resolved decision; each is reported to the human for review.

- **`findExportRows(tenantId, tx?)`** (D4, D9, NOD-12). The unchanged check runs inside the
  import transaction (D4 step 2), and NOD-12 requires every pre-write read to take `tx`, so the
  projection read takes an optional `tx`. The import reads it once per file, at the start of the
  transaction; every matched row pre-exists the file (D14), so one read is enough. The repository
  spec delta is updated.
- **`findBySourceRefIds` also takes optional `specificHazardIds`** (D13 rule 2). Checking that a
  `specificHazardId` exists and agrees with any HIP ids needs its ancestors, so the same single
  query resolves them. The result is four maps (`hazards`, `clusters`, `types`,
  `specificHazards`). The taxonomy spec delta is updated.
- **Rule errors on update and upsert rows are deferred** (NOD-4). The HIP rules and the
  `required` check on empty `startDate`/`endDate`/`recordOriginator` cells run only after the
  unchanged check, so an unchanged legacy row whose HIP id has no `source_ref_id` still
  re-imports. They are reported in phase 2, one row at a time, like the other phase-2 errors.
- **Workflow status for the edit rule** is read per changed row with
  `GetWorkflowInstanceByEntityUseCase` inside the import transaction (D5), not taken from the
  start-of-file snapshot, so an event published during a long import is not edited by a
  non-admin (review M7). There is no row lock, so a publish committed between that read and the
  write is still possible; Update's optimistic lock covers only the event row.
- **`not_found` does not echo `value`.** D6 limits the echo to `invalid_date`, `invalid_enum`,
  `invalid_id` and `duplicate_key`.
- **Line numbers.** The parser returns each row's physical start line (`lineNumbers`), exact past
  blank lines and quoted cells that span lines; `firstDataLine + index` stays as the fallback
  of D1 (review m5).
- **Invalid mode.** The command takes the posted mode as a string; the result's `mode` is `null`
  when the posted value is not a mode.
- **`serializeCsv(header, rows)`** replaces the `{ bom }` option of D8 (there
  is never a BOM); every column is guarded (gate 10). Guarded cells are also quoted, as OWASP recommends.
- **Template** (OD-17). The header is the legacy X1 set without `countryAccountsId` (OD-2: never
  advertise it) and with `specificHazardId`, which the example row fills with a hazard of this
  instance. Create and upsert templates import as-is. The update example row carries a
  placeholder `id` and fails with `not_found` until the user puts a real id in.
- **Upload parsing** (D7). `skip_empty_lines` is on; a zero-byte file, a form-data parse error or
  a malformed multipart body (other than the size limit) gives `missing_file`. Upload rejections
  are logged like every other rejection, through `ImportHazardousEventsCsvUseCase.rejectUpload`.
- **Attachments on update** keep their content, but the repository rewrites child rows on every
  update (existing behaviour), so attachment row ids change. The import spec scenario wording is
  updated to "content".
- **Template links** on the import page are plain anchors: the design-system `Link` navigates
  client-side, which cannot download a resource route.

Review fixes (user decisions, 2026-11-25):

- **Unchanged check compares the resolved hazard** (review M3). On a migrated row, the four
  hazard columns are one value: the row's resolved `specificHazardId` against the stored one, so
  empty or partial HIP cells are not a change. An unmigrated row has no CA hazard to resolve
  against, so its supplied hazard cells compare with the exported legacy values.
- **`parent` is sent to Update only when it changed** (review M1), so an unchanged cause keeps its
  `causality_explanation`.
- **Export `parent` fallback** (NOD-9 refinement, review M5): the legacy `event_relationship`
  parent is used only for unmigrated rows (null `specific_hazard_id`). On a migrated row, no CA
  cause means the cause was cleared.
- **One export row per event** (review M2): the cause is the lowest cause id through a scalar
  subquery; migrated data can hold several causes per effect.
- **Matched upsert rows** get the same deferred `required` check as update rows (review M6).
- **Edge whitespace round-trips** (review M4): the export quotes cells with leading or trailing
  whitespace (D8), so the trimming import parser keeps them.
- **A failed hazard edit is never silently unchanged** (gate 8 round 2, N1): when a migrated row's
  hazard cells fail to resolve, a supplied cell that differs from the export counts as a change, so
  the deferred `not_found`/`invalid_id`/`hip_mismatch` is reported.
- **Gate 5 round 2 (user decisions, 2026-11-25):** `createPathErrors` moved to the row-rules
  module (now `importRowPolicy.ts`),
  and one `requiredCellErrors` helper serves both paths (an absent column is missing only on the
  create path, as before); `STATUS_CHANGE_NOT_SUPPORTED` moved to
  `validation-workflow/application/errors/`; Create/Update keep their `info` line under `tx`
  (D4 "Logging").
- **Gate 10 (user decisions, 2026-11-25):**
  - Upload bound: the multipart check is case-sensitive like the parser's, so a request never
    falls back to native `formData()`. The whole body is capped at the file limit plus 64 KiB, by
    a declared `Content-Length` and by a counting stream. Other fields are ignored.
  - A NUL character (U+0000) in a mapped cell is row error `invalid_character`, found in phase 1
    and left out of the taxonomy lookup, so no query sees it.
  - Logs: the base Pino `err` serializer (`app/infrastructure/logging/PinoLogger.server.ts`)
    turns a `DrizzleQueryError`, at any depth of the cause chain, into its SQLSTATE `code`,
    `constraint`, `table` and `routine`. Message, params, stack text, `detail` and `where` can carry
    cell values, so they are dropped.
  - The result lists at most 200 errors, plus `errorCount`. An echoed `column` is cut to 100
    characters, and the page says "…and N more".
  - Every export cell passes the formula guard; `EXPORT_SYSTEM_COLUMNS` is removed.
  - NR1: the success line is three plural keys, so French counts agree (0 and 1 singular).
- **Gate 10 re-review (user decisions, 2026-11-25):**
  - m3: invalid UTF-8 in a part header or text field (the parser's fatal decoder,
    `ERR_ENCODING_INVALID_ENCODED_DATA`) gives `missing_file`, not a 500.
  - m4: the `csv.location.*` calls skip i18next escaping, so a header such as `R&D` renders
    literally; React still escapes the text.
  - m5, **user-approved scope addition** outside 6d-1's file list:
    `app/middleware/requestContext.server.ts` no longer logs a session-lookup rejection under a
    second `reason` key, only under `err`, which passes the redacting serializer.
  - NR2 is appended to DEF-062.
  - The `mapCsvRowToCommand.ts` Stryker exclusion is accepted.
- **Gate 8 round 3, F1 — user-approved fix (2026-11-25):** `hipClusterId`/`hipTypeId` cells
  count as a hazard change only beside a non-empty `hipHazardId` or `specificHazardId` cell. Same
  class as M3: re-running an onboarding file must not fail on cells that change nothing.
- **Rule order** (N5): `not_migrated` is checked before deferred HIP/required errors, matching D4.
- **Non-multipart requests** (N2) give `missing_file`, not a 500.
- **An upsert match missing from the snapshot** (another import committed it) reports `conflict`
  on `apiImportId` (review m3).
- **Formula guard inverse** (NOD-13 refinement, review m1): the export also guards a value that
  starts with a run of `'` before a guarded character, and the import strips one `'` from such a
  run, so a stored `'=x` round-trips. The import spec's NOD-13 wording is updated.
- **Upper-case UUID cells** (`id`, `parent`, `specificHazardId`) are lower-cased after validation
  (review m2). Taxonomy ref lists bind as one array parameter each (review m6).
- **Structure** (SOLID SF-1, SF-2, N1-N6): the apiImportId conflict is told apart by
  `API_IMPORT_ID_CONFLICT` on the port, cause conflicts by the shared `causalConflictKind`
  predicate (also used by the form). Everything decided about one mapped row is one pure module,
  `application/csv/importRowPolicy.ts`, in pipeline order:
  - change detection (`changedColumns`);
  - the update and create-path rule chains (`planUpdateRow`, `checkUpdateRow`,
    `checkCreatePathRow`, `createPathErrors`, `requiredCellErrors`);
  - the error-to-code mapping (`rowErrorForDomainError`);
  - the command builders (`toCreateCommand`, `toUpdateCommand`).

  These were four modules until a user-decided consolidation on 2026-11-25. The template builder
  (`templateHeader`, `templateExampleRow`) lives in `GetHazardousEventCsvTemplate.ts`, the use
  case over `findAnySpecificHazardId()`, its only consumer. Both were pure moves with no behaviour
  change. `canImportNonDraftStatus` lives in `editPolicy.ts`.

- **Gate 9:** F1 (no visible focus on the back and template links) is DEF-062 and is noted there.
  F2 (Type is a React Aria Select with a linked label, not a `<label>` wrapping a native select)
  and F3 (template links styled as action links, 24 px tall) are accepted deviations. The
  pre-existing em dash in `hazard_id_fallback_title` (not a `csv.*` key) is left as is.

- **`parent` change on a multi-cause effect is rejected** (gate 8 round 2, N4; user decision
  2026-11-25, option b). `replaceCauseEdge` deletes every cause edge of the effect, while the
  export shows only the lowest, so a `parent` that differs from the export on an effect with more
  than one cause edge gives row error `parent_multiple_causes` (column `parent`) and Update is not
  called; the user changes those causes in the app. `findExportRows` returns `causeCount`, read in
  the import transaction with the rest of the projection. The rule runs after `not_editable` and
  before `status_not_permitted`. An unchanged `parent` is unaffected (M1).

Stryker (task 11.11, 2026-11-25, narrowed scope, `vitest` runner with temporary configs). The
per-file results below were taken before the 2026-11-25 consolidation. `changedColumns`,
`rowRules`, `rowErrorForDomainError` and `csvRowCommands` were then merged into
`importRowPolicy.ts`, and the template builder into `GetHazardousEventCsvTemplate.ts`. Those were
pure moves with no logic change, so Stryker was not re-run:

- Unit run, 11 files, 573 mutants: 91.49% overall. After the missing scenarios were added,
  `changedColumns.ts` and `exportRowCells.ts` both reached 100%. The remaining survivors:
  - `rowErrorForDomainError.ts:60`: equivalent, because the `NotFoundError` constructor always sets
    `context.id` (a string), so `undefined === undefined` never occurs;
  - `hazardousEventCsvTemplate.ts`: the example row is covered by
    `GetHazardousEventCsvTemplate.test.ts` and the template route tests, which are outside the
    unit include. The 13 no-coverage mutants come from that.
- `ApplyImportedWorkflowStatus.ts`: integration run against PGlite, 76.92% (20 killed, 5
  survived, 1 no coverage). The real gap was the runtime `REJECTED` guard, whose test only
  asserted "rejects"; it now asserts `ValidationError`. The rest are error-message strings and the
  unmapped-entity-type branch, which the CSV import never reaches (it only passes `HE`). A rerun
  after the tightening gave 84.62% (22 killed, 3 survived, all message strings, 1 no coverage).
- Tooling limitations (no DEF):
  - Stryker's Babel generator crashes on a TypeScript function-type annotation
    (`keep: (v: string) => boolean` in `mapCsvRowToCommand.ts`), so that file is left out rather
    than restructured for the tool. Its unit and PGlite tests are its coverage.
  - Module-level constants are not mutated in this setup.

Regression (task 11.12, final run 2026-11-25, after the gate 10 fixes): `yarn test:run2` gave 7 failed /
4033 passed / 3 skipped / 1 todo (271 files). The 7 failures are the same tests, by name, as the base
run of 2026-11-24 17:23 at `7055352b` (7 failed / 3269 passed, no CSV test files present):
`HazardousEventDivisionListDialog` tree fetch, `access-management` invite dialog,
`settingsService.languagePersistence` zh, two `HttpServerBootstrap` tests,
`UnifiedSinglePortServer`, `checkDesignSystem` evidence paths and `countryAccountService.clone`.
No new failure.

Known limitation (user decision, 2026-11-25, tasks 1.3, 3.4, 5.3, 8.4): the real-Postgres tier
(`yarn test:run3`) is not available here: `.env.test` targets a Unix socket and a `testdb1`
database that do not exist on this machine. The interleaving scenarios (two transactions racing
on one `apiImportId`, two updates of one event, an export during an uncommitted import, an
uncommitted insert read from another connection) are therefore covered only by their
outcome-only PGlite versions. They need the real-Postgres tier when it is set up.

Task 10.2 evidence (2026-11-25): on this branch, `he-preview*.spec.ts` gave 51 passed, 1 flaky
(`he-preview-attachments.spec.ts:112`, passed on retry) and 1 failed: `he-preview.spec.ts:105`
("list page renders the seeded events…"), `getByText('E2E hazard', { exact: true })` not
visible. The same spec run alone in a temporary worktree at base `7055352b` (removed afterwards)
gave 7 passed and the same test failed with the same assertion, so it is pre-existing and not
caused by this change.

Follow-ups owned by the human, recorded so archive is not blocked:

- **Task 1.4 (Phase M alignment):** share the D12 status table and the D13 HIP rule with the
  Phase M (`Ma`) owner, so backfill and import produce the same status and hazard for the same
  legacy value; record the reply here.
- **Task 1.5 (CSV users check, NOD-10 residual):** confirm with existing CSV users that no
  downstream importer rejects the appended trailing `parent` column (6d-2 adds two more) before
  the Phase 7 cutover.

## Deferred register evaluation

| Row                         | Outcome                                                                                                                                                                                        |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DEF-055                     | **Updated** (decision): CSV now keeps HIP columns, but via taxonomy `source_ref_id`, not the crosswalk; `source_ref_id` must stay while the legacy columns are supported.                      |
| DEF-064                     | **New, registered** (OD-14): legacy CSV routes' defects until Phase 7, including the code-derived `tenantPath` file-path concern (shared with the legacy form; needs its own security triage). |
| DEF-065                     | **New, registered**: rows with NULL `specific_hazard_id` (unopenable in CA; legacy keeps producing them; Phase M must re-run the mapping).                                                     |
| (dropped)                   | "CA CSV without spatial/attachments/cause": superseded by the 6d-1/6d-2 split; 6d-2 is a roadmap entry, not a DEF row.                                                                         |
| DEF-063                     | Not triggered (D12).                                                                                                                                                                           |
| DEF-047                     | Confirmed: the CA write path throws on rejection (update spec).                                                                                                                                |
| DEF-005                     | Legacy only. 6d-2 checks the division tenant on the CA path.                                                                                                                                   |
| DEF-010                     | Unchanged: import reuses admin-only `directPublish` (D12).                                                                                                                                     |
| DEF-022                     | No legacy value maps to `REJECTED`; export writes it as empty (D9).                                                                                                                            |
| DEF-049                     | Imported `SUBMITTED` events have no validator assignment (NOD-3).                                                                                                                              |
| DEF-061                     | 6d-2: export falls back to the legacy `attachments` jsonb (NOD-9). Not touched by 6d-1.                                                                                                        |
| DEF-009, 019, 028, 050, 003 | As in round 1: no change.                                                                                                                                                                      |
| DEF-053, 014, 062           | Not folded.                                                                                                                                                                                    |

## Scope and size (6d-1)

| Area                                                                                                   | New files  | Changed files                         | Main risk                              |
| ------------------------------------------------------------------------------------------------------ | ---------- | ------------------------------------- | -------------------------------------- |
| Shared persistence (savepoint)                                                                         | 0          | 2                                     | low                                    |
| Optional `tx` on pre-reads (NOD-12): taxonomy, crosswalk, causal chain, workflow lookup and repository | 0          | about 8 ports, adapters and use cases | low-medium (wide but mechanical)       |
| Create/Update optional `tx`, deferred logging                                                          | 0          | 2                                     | medium (touches the 6c write path)     |
| Workflow status import (`validation-workflow`)                                                         | 1 use case | 1-2 (module wiring)                   | medium (status invariants, admin rule) |
| Taxonomy reverse lookup                                                                                | 0          | 2                                     | low                                    |
| Repository (`findIdByApiImportId`, `findExportRows` with status/attribution/HIP/parent fallbacks)      | 1 DTO      | 2                                     | medium                                 |
| Import use case, column contract, row mapping (HIP, status, `parent`, guard reversal)                  | 4          | 1 (module)                            | high (most rules)                      |
| Export use case                                                                                        | 1          | 0                                     | medium                                 |
| Presentation (upload parse, CSV writer, page, 3 routes, locales)                                       | 7          | 2                                     | medium                                 |
| Tests (unit, PGlite, `test:run3` concurrency, DOM, E2E)                                                | about 12   | about 10                              | —                                      |

That is roughly 26 new and 28 changed source and test files, about twice the size of 6c. 6d-2
(roadmap) then adds the two legacy-JSON mappers, the spatial and attachment wiring, the
deferred file deletion and its security review: about 8 new and 6 changed files.

## Risks / Trade-offs

- **Import throughput (OD-15, measured 2026-11-24/25):** about 15-20 ms per row (2000 rows in
  27-41 s through the page; the export of 2004 rows took about 200 ms). A full 10 MB file (about
  55,000 rows) would hold one transaction and the request for roughly 15 minutes. No row cap is
  added, because a cap would break existing large files; the 10 MB limit stays (user decision,
  2026-11-25). Background import is DEF-066.
- **Long transaction on a large file.** Row locks are held for the whole import. Mitigation:
  phase 1 rejects bad files before any write. Further mitigation is OD-15.
- **Savepoint per row.** Overhead is about 2 statements per row. Accepted for atomicity.
- **Log redaction scope (gate 10).** The `err` serializer covers every Pino log, CA and legacy,
  through `getPinoLogger()`. It does not cover `console.error` (`DomainErrorFilter.server.ts:124`,
  the REST filter), errors logged under another key, or `AggregateError.errors`; those paths are
  unchanged (the request-context middleware's duplicate `reason` key was removed, m5).
- **`ApplyImportedWorkflowStatus` has no tenant filter** (gate 10, deferred by decision). Its
  `findByEntity` and `update` are keyed by entity id only. That is safe today, because the id
  always comes from a tenant-scoped read or a row just created; a tenant check would be defence
  in depth.
- **Behaviour changes for existing CSV users** are limited to the stricter row rules (D13, D14,
  NOD-5, NOD-6), the formula prefix (OD-10) and the appended `parent` export column (NOD-10). The
  column set and the export header are otherwise unchanged. Rows without a specific hazard
  (NOD-6) are the one case an existing file can no longer import. These need release notes at the
  Phase 7 cutover. During Phase 6 the routes are hidden.
- **Downstream consumers of the export** (NOD-10 residual): appended trailing columns may break a
  strict downstream importer; confirm with existing users (task 1.5) before the Phase 7 cutover.
- **Footprint and attachment data in onboarding files** is not imported until 6d-2 (D15); the
  notice says so, and an upsert re-run after 6d-2 fills it in.
- **Large export projection.** `findExportRows` joins about ten tables; it needs an
  EXPLAIN check on realistic data in the E2E/perf task.
- **Interleaving tests need real Postgres** (`test:run3`); PGlite deadlocks on cross-session reads (Test infrastructure).
- **Memory on export** for very large tenants. The same as legacy; streaming is deferred.
- **HIP mapping coverage** is guaranteed by the taxonomy seed's UNIQUE `source_ref_id` and its
  8/38/281 assertion (D13). Entries added later without a `source_ref_id` import only by
  `specificHazardId`.

## Migration Plan

- No DB migration. Deploying adds hidden routes; legacy routes are untouched. Rollback means
  removing the routes. The use-case `tx` addition is backward compatible (optional).
- Live-run cleanup (2026-11-24): the 10 throwaway rows could not be deleted through the CA UI
  (422/404, X2). They were deleted by exact id with a guarded script. The guard aborted unless
  every id still had a `CSV6D-` or `=HYPERLINK` record originator. It deleted the child tables
  first, then `hazardous_event`, then `event`, in one transaction.
  - First batch ids: `302d1196`, `5d79d160`, `8e1e8645`, `4f44f334`, `83f92c1c`, `185fef13`,
    `a8072893`, `761bb3cc`, `679156e6`.
  - Second batch id: `2b82e035`.
  - Afterwards: 42/44/40 counts, 0 leftover marked rows, and 0 `audit_logs` rows referencing
    those ids.
  - One orphan HE `workflow_instance` existed: `4d5c99c5…` → entity `defb909f…`, DRAFT,
    created 2026-11-06. It predated this run, was left untouched, and was later deleted by the
    coordinator.
  - No row was created in any other tenant.
- Round 2 cleanup (new scope): see "Legacy behaviour observed live, round 2". 6 rows and 2
  `event_relationship` rows deleted by guarded script (ids `4e259de3`, `99594b5c`, `afc1f909`,
  `4f75cdc0`, `56996cca`, `534a2fce`). 19 empty upload directories that the legacy import created
  for this session's rows were removed (A3). Final state: 42/44/39, 0 orphan instances.
- Phase M coordination: D12's status mapping and D13's HIP mapping are the same mappings
  Phase M `Ma` lists ("current approvalStatus → one initial WorkflowInstance row per event";
  "hipHazardId → specific_hazard_id"). Share the D12 table with the Phase M owner so both paths
  produce the same status for the same legacy value.

## Sources

- RFC 4180, "Common Format and MIME Type for CSV Files", §2 (CRLF; optional header; fields
  containing CRLF, double quotes or commas enclosed in double quotes; double quotes escaped by
  doubling; "Each line should contain the same number of fields") and §3 (`text/csv`, optional
  `charset` and `header=present|absent`). https://www.rfc-editor.org/rfc/rfc4180
- OWASP, CSV Injection: dangerous leading characters `=`, `+`, `-`, `@`, tab, CR, LF and
  full-width variants; prefix with `'`, quote and double inner quotes; Excel may strip quotes
  when re-saving. https://owasp.org/www-community/attacks/CSV_Injection (served from
  https://community.owasp.org/attacks/CSV_Injection)
- OWASP File Upload Cheat Sheet: allow-list extensions; "don't trust the Content-Type header";
  size limits; no CSV-specific guidance.
  https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html
- OWASP Input Validation Cheat Sheet, "Allowlist vs Denylist": "Define what the application
  accepts and reject values outside those rules."
  https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html
- React Router, File Uploads: `multipart/form-data` and a form-data parser in the action.
  https://reactrouter.com/how-to/file-uploads. The docs use `@remix-run/form-data-parser`; this
  repo has `@mjackson/form-data-parser@0.9.1` (same parser lineage; the mjackson repo is
  archived as of 2025-10-08). Moving packages is not in scope.
- form-data-parser README: `maxFileSize`, `maxFiles`, `MaxFileSizeExceededError`,
  `MaxFilesExceededError`.
  https://github.com/mjackson/remix-the-web/tree/main/packages/form-data-parser. The installed
  0.9.1 typings export `MaxFileSizeExceededError` (`dist/form-data-parser.d.ts:3`).
- csv-parse options: `bom` (default false; "recommended to always activate … with UTF-8"),
  `relax_column_count` (default false; an error is thrown on inconsistent field counts).
  https://csv.js.org/parse/options/bom/, https://csv.js.org/parse/options/relax_column_count/
- csv-stringify options: `escape_formulas` (= + - @ \t \r), `quoted`, `quoted_match`,
  `record_delimiter`, `bom`. https://csv.js.org/stringify/options/. Installed version 6.6.0
  typings include `escape_formulas`.
- WHATWG Encoding, UTF-8 decode, error mode "replacement" pushes U+FFFD, which explains I15.
  `TextDecoder` `fatal: true` makes it throw instead. https://encoding.spec.whatwg.org/#utf-8-decode
  The BOM-strip step was read second-hand; I14 confirms it empirically.
- MDN, `Blob.text()` always decodes as UTF-8.
  https://developer.mozilla.org/en-US/docs/Web/API/Blob/text
- MDN, Content-Disposition: `filename` / `filename*` (RFC 5987); include both for non-ASCII
  names. https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Disposition
- Project ADRs:
  - ADR-001 "Library — Frontend" and "File Structure" (namespaced keys);
  - ADR-002 "Three Categories of Timestamps" and "Partial and Uncertain Dates";
  - ADR-003 "Error Response Envelope", "Layer 4 — Presentation Layer" and Rules 2-4;
  - ADR-004 "Log Level Discipline", "Error Handling Rules", "Mandatory Fields" and "Log at
    Boundaries";
  - ADR-007 "Decision";
  - ADR-008 "Decision";
  - ADR-009 "Decision" (context-first, `presentation/web/`, test location).
  - ADR-006 is not used (unapproved draft).
