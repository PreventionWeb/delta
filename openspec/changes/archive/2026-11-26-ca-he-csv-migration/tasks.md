## 1. Blocking decisions (human, before any code)

- [x] 1.0 Round-1 decisions recorded in design.md "User context and resolved decisions"
      (user, 2026-11-24). Changed: OD-1, OD-3, OD-5, OD-9. Approved as recommended: OD-2, OD-4,
      OD-6 to OD-8, OD-10 to OD-17. Register updated (DEF-055; DEF-064 and DEF-065 added).
- [x] 1.1 Round-2 decisions (NOD-1 to NOD-13, user 2026-11-24) recorded in design.md
      "Resolved decisions, round 2". NOD-11 = split: this change narrowed to 6d-1; 6d-2
      (spatial footprint and attachments) recorded as its own roadmap entry, no second change
      folder. RD-1 (footprint/attachment columns accepted and ignored in 6d-1) resolved by
      default under the no-breakage rule. **Verify:** `openspec validate ca-he-csv-migration --strict`
      passes.
- [x] 1.2 Feature-prototype `not-required` exception approved for 6d (OD-13, user 2026-11-24)
      and recorded in design.md. **Verify:**
      `yarn check:design-system --verify-spec --change ca-he-csv-migration --base origin/dev` passes.
- [x] 1.3 (resolved by decision 2026-11-25: outcome-only PGlite versions; interleaving recorded as a known limitation in design.md) Real-Postgres tier ready. Interleaving scenarios cannot run on PGlite (design.md
      "Test infrastructure"), so tasks 3.4, 5.3 and 8.4 use
      `tests/integration-realdb/domains/hazardous-events/HazardousEventCsvConcurrency.test.ts`.
      Confirm `yarn test:run3` runs against `.env.test`; if it shows DEF-003-style
      `ECONNREFUSED` or hangs, stop and report. **Verify:** an existing
      `tests/integration-realdb/domains/hazardous-events` file passes.
- [x] 1.4 (acknowledged by the user 2026-11-25; follow-up owned by the human, recorded in design.md) Share the D12 status table and the D13 HIP rule with the Phase M (`Ma`) owner, so
      backfill and import produce the same status for the same legacy value. **Verify:** reply
      recorded in design.md.
- [x] 1.5 (acknowledged by the user 2026-11-25; follow-up owned by the human, recorded in design.md) NOD-10 residual check: confirm with existing CSV users (via the human) that no
      downstream importer of the HE export rejects extra trailing columns (`parent` now; 6d-2 adds
      two more). **Verify:** answer recorded in design.md Risks before the Phase 7 cutover; if a
      strict consumer exists, raise it before archiving.

## 2. Shared persistence and workflow repository (TDD, PGlite)

- [x] 2.1 Red: extend `tests/integration/db/DrizzleTransactionRunner.test.ts` and
      `tests/unit/shared/persistence/ITransactionRunner.test.ts` with the
      `specs/transaction-runner-port` scenarios. **Verify:** the new tests fail.
- [x] 2.2 Green: add `outerTx?: Tx` to `ITransactionRunner.run`; `DrizzleTransactionRunner` uses
      `outerTx.transaction(fn)` when it is given. **Verify:** 2.1 passes; `yarn tsc` is clean.
- [x] 2.3 Red then Green: in `tests/integration/domains/validation-workflow/DrizzleWorkflowRepository.test.ts`
      add the `specs/workflow-repository-port` `tx` scenario, then add `tx?: Tx` to `findByEntity`.
      **Verify:**
      `yarn vitest run tests/integration/domains/validation-workflow/DrizzleWorkflowRepository.test.ts`.
- [x] 2.4 Red then Green (NOD-12): add the optional-`tx` scenarios to
      `tests/integration/db/queries/DrizzleHazardTaxonomyRepository.test.ts`,
      `tests/integration/domains/hazardous-events/DrizzleHipCrosswalkAdapter.test.ts`,
      `tests/integration/db/queries/DrizzleCausalChainRepository.test.ts` and
      `app/domains/validation-workflow/application/use-cases/GetWorkflowInstanceByEntity.test.ts`
      (specs `hazard-taxonomy-repository-port`, `hip-crosswalk-port`,
      `causal-chain-repository-port`, `get-workflow-instance-by-entity`), then add the parameter to
      each port, adapter and use case. **Verify:** those four files are green; `yarn tsc` is clean.

## 3. Create/Update: caller transaction and deferred logging (TDD, PGlite)

- [x] 3.1 Red: add the `specs/create-hazardous-event` scenarios to
      `tests/integration/domains/hazardous-events/CreateHazardousEventUseCase.test.ts`.
      **Verify:** they fail.
- [x] 3.2 Red: add the `specs/update-hazardous-event` scenarios to
      `UpdateHazardousEventUseCase.test.ts`. **Verify:** they fail.
- [x] 3.3 Green: add `tx?: Tx` to both commands; pass it to `transactionRunner.run(fn, tx)` and
      to every pre-write read listed in design.md D4 (NOD-12), including the case "A create with a
      cause inside a caller transaction does not deadlock on PGlite"; ~~skip the post-commit `info` lines when `tx` is given~~
      (superseded 2026-11-25 by user decision: the `info` lines are kept under `tx`, design.md D4 "Logging").
      **Verify:** 3.1 and 3.2 pass; `yarn vitest run tests/integration/domains/hazardous-events`
      is green.
- [x] 3.4 (resolved by decision 2026-11-25: outcome-only PGlite versions; interleaving recorded as a known limitation in design.md) Concurrency (`test:run3`): two outer transactions create the same `apiImportId`
      (exactly one commits, the other `ConflictError`); two update the same event (at most one
      commits, the other `ConcurrentModificationError`). **Verify:** passes under `yarn test:run3`.

## 4. Application: status rule and imported workflow status (TDD)

- [x] 4.1 Red then Green, unit: `application/editPolicy.test.ts` (ported from
      `presentation/web/isStatusAwareEditBlocked.test.ts`); move the function and re-export it
      (OD-7). **Verify:** both test files pass; list and edit route tests unchanged and green.
- [x] 4.2 Red: `tests/integration/domains/validation-workflow/ApplyImportedWorkflowStatusUseCase.test.ts`
      with every `specs/apply-imported-workflow-status` scenario. **Verify:** fails (module
      missing).
- [x] 4.3 Green: implement `ApplyImportedWorkflowStatusUseCase` with the domain transitions, the
      audit entry, the admin rule and no notification port dependency; wire it in the
      validation-workflow module. **Verify:** 4.2 passes.

## 5. Repository and taxonomy reads (TDD, PGlite)

- [x] 5.1 Red: add the `specs/hazardous-event-repository-port` scenarios (except the
      cross-connection ones) to `tests/integration/db/queries/DrizzleHazardousEventRepository.test.ts`,
      seeding the null-`specific_hazard_id`, null-tenant, other-tenant and legacy-fallback rows
      with direct inserts. **Verify:** they fail on the new tests only.
- [x] 5.2 Red: add the `specs/specific-hazard-taxonomy-repository-port` scenarios to
      `tests/integration/db/queries/DrizzleSpecificHazardTaxonomyRepository.test.ts`. **Verify:**
      they fail.
- [x] 5.3 (resolved by decision 2026-11-25: outcome-only PGlite versions; interleaving recorded as a known limitation in design.md) Concurrency (`test:run3`, same file as 3.4): `findExportRows` and
      `findIdByApiImportId` do not see another connection's uncommitted insert. **Verify:** passes
      under `yarn test:run3`.
- [x] 5.4 Green: implement `findIdByApiImportId`, `findExportRows` (D9, one statement) and
      `findBySourceRefIds` (D13, one query); add the `HazardousEventExportRow` DTO. **Verify:**
      5.1 and 5.2 pass; the existing `findAll` skip-on-rehydration test is unchanged and green.

## 6. Application: column contract and legacy-format mappers (TDD, unit)

- [x] 6.1 Red: `application/csv/hazardousEventCsvColumns.test.ts` covers every D3 row: accepted,
      ignored and rejected columns per mode; the legacy template headers (X1) and the legacy
      export header (E1) pass. **Verify:** fails.
- [x] 6.2 Red: `application/csv/approvalStatusMapping.test.ts` covers both directions of the D12
      table: REJECTED → empty, unknown → error. **Verify:** fails.
- [x] 6.3 Red: `application/csv/mapCsvRowToCommand.test.ts` covers every row code,
      empty-versus-absent semantics (including empty JSON cells), the `""`/`null` rules,
      duplicate keys, line numbers from `firstDataLine`, value truncation, the formula-guard
      reversal (NOD-13, every guarded character and a cell that merely starts with `'`), and
      the HIP rules of D13 against a stubbed lookup result. **Verify:** fails.
- [x] 6.4 Green: implement 6.1 to 6.3. **Verify:** 6.1 to 6.3 pass.

## 7. Application: import use case, core (TDD, PGlite)

- [x] 7.1 Red: `tests/integration/domains/hazardous-events/ImportHazardousEventsCsvUseCase.test.ts`
      covers every `specs/hazardous-event-csv-import` scenario for: tenant (the four 0e
      reversals, each titled "reverses 0e: <original title>"); the legacy header acceptance; row
      validation; HIP mapping; status mapping (admin and non-admin; no `workflow_notification`);
      idempotent re-import; `parent`; modes; all-or-nothing (with event, `event`,
      `workflow_instance`, causality and `audit_logs` counts unchanged); the status-aware rule
      and `not_migrated`; the non-DomainError path; logging; and the outcome-only part of the
      race. **Verify:** fails.
- [x] 7.2 Green: implement `ImportHazardousEventsCsvUseCase` (D1, D2, D4, D5, D6, D12, D13, D14)
      and register it. **Verify:** 7.1 passes.
- [x] 7.3 Confirm `tests/integration/db/models/hazardousEventCsvImportTenant.test.ts` (0e,
      legacy) is unchanged and still green. **Verify:**
      `yarn vitest run tests/integration/db/models/hazardousEventCsvImportTenant.test.ts`.

## 8. Application: export use case and round trip (TDD, PGlite)

- [x] 8.1 Red: `tests/integration/domains/hazardous-events/ExportHazardousEventsCsvUseCase.test.ts`
      with every `specs/hazardous-event-csv-export` scenario except the route and concurrency
      ones. **Verify:** fails.
- [x] 8.2 Green: implement `ExportHazardousEventsCsvUseCase` (D9) and register it. **Verify:** 8.1
      passes.
- [x] 8.3 Round trip: export a seeded tenant, including a PUBLISHED event, an unmigrated row, a
      legacy-only parent, a CA cause, and a `magnitude` of `-5`. Re-import the file in update mode as a **non-admin** EditData user, and
      in upsert mode as an admin. Assert every row is `unchanged` and no table changed. **Verify:**
      passes.
- [x] 8.4 (resolved by decision 2026-11-25: outcome-only PGlite versions; interleaving recorded as a known limitation in design.md) Concurrency (`test:run3`): two imports upsert the same new `apiImportId` at the same
      time (one event, one `conflict`); an export during an uncommitted import contains none of
      its rows. **Verify:** passes under `yarn test:run3`.

## 9. Presentation: upload, serialization, routes, page (TDD)

- [x] 9.1 Red, unit: `presentation/web/csv/parseCsvUpload.server.test.ts` (size, missing file,
      encoding, BOM, ragged row, quote, CRLF/LF, multi-line cells, trimming) and
      `serializeCsv.test.ts` (RFC 4180, CRLF, formula guard per OWASP character, system
      columns unguarded (superseded by gate 10: every column is guarded), no BOM). **Verify:** fail.
- [x] 9.2 Green: implement both (D7, D8). **Verify:** 9.1 passes.
- [x] 9.3 Red: route tests `HazardousEventCsvImportRoute.test.ts`,
      `HazardousEventCsvExportRoute.test.ts` and `HazardousEventCsvTemplateRoute.test.ts` under
      `tests/integration/domains/hazardous-events/routes/`. They cover guard order, a 403 for
      data-viewer import, data-viewer export allowed with all rows, headers
      (`hazardous-event.csv`), multipart success data, an ignored foreign `countryAccountsId`,
      size, the 500 envelope, `ErrorBoundary` exported, and templates per mode importing
      cleanly. **Verify:** fail.
- [x] 9.4 Green: add `app/routes/$lang+/_authenticated+/he-preview+/csv-import.tsx`,
      `csv-export.ts` and `csv-template.ts` (D10). **Verify:** 9.3 passes; `yarn tsc` is clean.
- [x] 9.5 Add the `csv.*` keys to `locales/{en,fr}/hazardous-events.json` (one
      `csv.error.<code>` per D1 code). **Verify:** a unit test asserts every code has a key in
      both locales, non-empty, with no em dash.
- [x] 9.6 Red then Green, DOM: `HazardousEventCsvImportPage.dom.test.tsx` covers ground-truth
      items 1-11, the created/updated/unchanged counts, ignored columns, the error summary
      (`role="alert"`, focus), the submitting state, echoed values as text, French copy, and no
      "0 records" on failure; then implement the page on `app/design-system/components/`
      (default mode Create, label "Type"). Do not touch `app/design-system/ui/`. **Verify:**
      passes.

## 10. End-to-end (Playwright)

- [x] 10.1 `tests/e2e/hazardous-events/he-preview-csv.spec.ts` covers:
  - export download (headers, first line);
  - a legacy-format file (HIP columns, `approvalStatus=published` as admin, `parent`, and
    non-empty `spatialFootprint`/`attachments` cells) that imports, shows as published on the
    detail page, and reports the footprint/attachment notice;
  - a mixed file showing line-numbered errors and no new rows;
  - template download and import;
  - French copy.

  Delete every created event through the CA delete action, and assert there are no orphan
  `workflow_instance` or causality rows. Measure a large create file's import time
  (OD-15) and the export query plan (design.md Risks). **Verify:**
  `yarn test:e2e tests/e2e/hazardous-events/he-preview-csv.spec.ts` passes (PORT=4000,
  `PLAYWRIGHT_DATABASE_URL`).

- [x] 10.2 (2026-11-25: all pass except he-preview.spec.ts:105, which fails identically on base 7055352b, proven pre-existing) Run the existing `tests/e2e/hazardous-events/he-preview*.spec.ts`. **Verify:** all
      pass.

## 11. Verification (quality gates, in order)

- [x] 11.1 (2026-11-25: final run 50 files, 1371 tests green after N4, round-3 F1, SOLID and gate 10 fixes; `test:run3` not
      available, known limitation in design.md) Quality gate 1 of 10: `yarn vitest run <test-file>` for every test file touched in
      groups 2-9, plus `yarn test:run3` for the concurrency file; all green.
- [x] 11.2 Quality gate 2 of 10: `yarn tsc`; zero errors.
- [x] 11.3 Quality gate 3 of 10: Prettier clean, scoped with
      `npx prettier --check <changed files>`. Never run repo-wide `yarn format`; preview any
      `--write` on a copy first.
- [x] 11.4 Quality gate 4 of 10: anti-pattern review against
      `.github/skills/anti-pattern-check/SKILL.md`.
- [x] 11.5 (2026-11-25: no blocking/major; 3 minor + 1 nit reported to the human) Quality gate 5 of 10: SOLID review. Invoke `solid-reviewer` on the diff and report
      findings to the human with reasoning.
- [x] 11.6 Quality gate 6 of 10: documentation review by a fresh subagent. Comments explain WHY
      not WHAT, tersely; one full-diff sweep.
- [x] 11.7 Quality gate 7 of 10: project conventions review against
      `.github/copilot-instructions.md`.
- [x] 11.8 (2026-11-25: two passes, no blocking/major; test gaps, D4 order and comment nits fixed; N4 upsert-path integration test skipped as optional) Quality gate 8 of 10: code review. Run `.github/skills/code-review/SKILL.md` in full
      via a fresh subagent and report findings to the human.
- [x] 11.9 (2026-11-25: 9a PASS; narrow re-check of the small fixes all PASS, gate-9-report.md section 11; NR1 later fixed with gate 10, DOM-tested) Quality gate 9 of 10 (required; `ui-classification: legacy-exempt`):
  - Gate 9a: `yarn check:design-system --verify-spec --change ca-he-csv-migration --base origin/dev`,
    plus the design-system-check skill items that apply to legacy-exempt code.
  - Gate 9b: `runWcag22A11yCheck` on the initial, success, failure and French states;
    `verifyKeyboardSequence`; 24 × 24 px targets; visible focus.
  - Gate 9c: legacy parity against the ground-truth checklist, with screenshots of legacy
    `/en/hazardous-event/csv-import` and the new page at desktop and 375 px in
    `test-results/gate-9/ca-he-csv-migration/`. Report in
    `openspec/changes/ca-he-csv-migration/evidence/gate-9-report.md`, audited by a fresh
    `visual-parity-reviewer`.
- [x] 11.10 (2026-11-25: 1 major + 2 minor + 4 nits; user decisions applied with TDD: upload bound, NUL row error, query-error log redaction, bounded errors, guard every export cell, NR1 plurals; 5-7 recorded; focused re-review: no blocking/major) Quality gate 10 of 10 (Claude Code only): built-in `code-review` at `high` effort via
      a second, separate fresh subagent. Report findings to the human before archiving.
- [x] 11.11 (2026-11-25: unit 91.49% then gaps closed, changedColumns/exportRowCells 100%; ApplyImportedWorkflowStatus 76.92% then 84.62% after the REJECTED test was tightened; mapCsvRowToCommand excluded, Babel generator crash, design.md) Test quality: `test-quality-auditor` (Stryker) scoped to the pure rule-heavy modules
      only (user decision, 2026-11-24):
  - `application/csv/*.ts` (columns, HIP and status mapping, `mapCsvRowToCommand`);
  - the formula-injection guard and its import-side reversal (`serializeCsv.ts` and wherever the
    strip lives);
  - `editPolicy.ts`;
  - `ApplyImportedWorkflowStatus.ts`.

  Excluded, because integration tests cover them: the import and export orchestration use cases,
  the Create/Update plumbing, the repository and taxonomy methods, and `parseCsvUpload.server.ts`.
  Run Stryker detached and never concurrently with vitest. A Stryker tooling limitation is noted
  in design.md, not registered.

- [x] 11.12 (2026-11-25 final: same 7 failures as base 7055352b, none new; design.md) Regression: `yarn test:run2` passes with no new failures. Any failure claimed as
      pre-existing is proven on the base branch (`feature/he-ca-phase6`).

## 12. Docs, human approval and archive

- [x] 12.1 (2026-11-25: 6d-1 marked Complete; 6d-2 entry accurate, gate-10 file-deletion note added; DEF-055/064/065 match what shipped; DEF-012 note appended) Roadmap 6d-1: set the status to Complete (the split and the path correction are
      already recorded); confirm 6d-2 is still accurate. Re-check DEF-055, DEF-064 and
      DEF-065 against what shipped. **Verify:** reviewed in the diff.
- [x] 12.2 Present the final state to the human (diff summary, gate results, Gate 9 report,
      deferred findings) and get explicit approval to archive. **Verify:** the approval is
      recorded in chat.
- [x] 12.3 Tick every checkbox in this file, including 12.4, before archiving. **Verify:** no
      unchecked boxes remain.
- [x] 12.4 Run `opsx:archive` for `ca-he-csv-migration` on this branch before raising the PR
      (it targets `feature/he-ca-phase6`). **Verify:** the change is moved under
      `openspec/changes/archive/` and the specs are synced.
