# Gate 9 evidence report: `ca-he-csv-spatial-attachments` (6d-2)

Reviewer: visual-parity-reviewer (fresh audit), 2026-11-26. Report only; no app source was edited.

## 1. Governance and pinned references (from design.md, "UI governance and traceability metadata")

- `ui-classification`: `legacy-exempt`
- Design system: `https://github.com/unisdr/delta-design`, `v0.7.3`, commit
  `9107103efc7b192c3aa898ba99a508da57988a09`
- Feature prototype: `https://github.com/unisdr/delta-feature-prototypes`, commit
  `e24b8ad4dee319d5efa2a7c57fca30948f130bd0`, `status: not-required` (approved human review
  exception, OD-13 of 6d-1, extended to all of 6d; HE keeps legacy styling until DEF-068)
- Working tree: branch `feature/ca-he-csv-migration`, HEAD `da6d2bfd`, change uncommitted.

## 2. Subject, reference, data and environment

- Subject 1: `/{lang}/he-preview/csv-import`
  (`app/domains/hazardous-events/presentation/web/csv/HazardousEventCsvImportPage.tsx`).
  Reference: the same page as archived by 6d-1 (its Gate 9 report,
  `openspec/changes/archive/2026-11-26-ca-he-csv-migration/evidence/gate-9-report.md`) and the
  6d-1 source as shown by `git diff` (the only diff in the component is the removal of the
  `skippedDataNotice` paragraph, old lines 95-101).
- Subject 2: `/{lang}/he-preview/new`
  (`app/domains/hazardous-events/presentation/web/HazardousEventFormPage.tsx`, routes
  `he-preview+/new.tsx:117-123` and `edit.$id.tsx:136-142`). Reference: the 6c form. Route diff
  adds only the early `attachmentUrlFieldError` return; the component is unchanged.
- Dev server `http://localhost:3000` (already running, not restarted). Logged in as
  `test.admin@india.gov.in` (admin, tenant `50c88fb1…`). Chromium (Playwright), headless.
  Viewports: desktop 1280×900, mobile 375×812.
- Project root font-size is 14px (`public/assets/css/style-dts.css:18`), so 1rem = 14px below.
- Same-data comparison: the 6d-1 "before" success notice cannot be rendered any more (the code
  is gone), so items 2 and 3 are compared against the 6d-1 source and report. To make "no
  notice" meaningful, the success row carried data that would have triggered the 6d-1 notice: a
  Point `spatialFootprint` and one https Link in `attachments`, plus the read-only
  `countryAccountsId` column.
- **Not rendered in a browser: French success state.** The brief allows exactly one import, done
  on `/en/`. The French success copy is unchanged by this change (the only FR diff in `csv.*` is
  the removal of `skipped_data_notice_*` and five new error keys, `locales/fr/hazardous-events.json:393-397`);
  the 6d-1 re-check already rendered the FR plural success line.

## 3. Commands run

- 9a:
  - `yarn check:design-system --verify-spec --change ca-he-csv-spatial-attachments --base origin/dev`
    → `PASS: Gate 9a design-system and spec verification passed.`
  - `yarn check:design-system --change ca-he-csv-spatial-attachments`
    → `PASS: Gate 9a design-system and spec verification passed.`
- 9b/9c: one throwaway `tsx` script in the session scratchpad (deleted afterwards), run in three
  stages (no-write, success, delete). It drives Playwright `chromium`, runs axe with
  `WCAG_22_AA_TAGS` scoped to `main` (the same rule set and scope as `runWcag22A11yCheck`, called
  directly so the violation count could be recorded rather than thrown), and
  `assertNoHorizontalOverflow` (`tests/e2e/helpers/designSystemChecks.ts`). Screenshots were taken
  with `page.screenshot` (full page, pointer parked at (1,1)) and resized in place for 375 px, so
  the success import ran exactly once (`capturePrototypeStateScreenshots` re-navigates per
  viewport). A dialog handler that aborts the run was attached; no native dialog appeared.
- DB verification: read-only `pg` queries (`SET default_transaction_read_only = on`) against
  `DATABASE_URL` from `.env`.

## 4. Screenshots (`test-results/gate-9/ca-he-csv-spatial-attachments/`)

`test-results/` is git-ignored; these are local evidence. The reviewer opened the EN failure
desktop, EN success desktop, FR failure mobile, EN form error crop and EN form error mobile
images.

| Page       | State                                        | Desktop                                                                   | Mobile 375                                          |
| ---------- | -------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------- |
| CSV import | initial (en)                                 | `new-en-he-preview-csv-import--default--desktop.png`                      | -                                                   |
| CSV import | failure, five new codes (en)                 | `new-en-he-preview-csv-import--error--desktop.png`                        | `new-en-he-preview-csv-import--error--mobile.png`   |
| CSV import | failure, five new codes (fr)                 | `new-fr-he-preview-csv-import--error--desktop.png`                        | `new-fr-he-preview-csv-import--error--mobile.png`   |
| CSV import | success, no notice (en)                      | `new-en-he-preview-csv-import--success--desktop.png`                      | `new-en-he-preview-csv-import--success--mobile.png` |
| Form       | before save, javascript: Link row added (en) | `new-en-he-preview-new--default--desktop.png`                             | -                                                   |
| Form       | attachments field error (en)                 | `new-en-he-preview-new--error--desktop.png`, `…--error-crop--desktop.png` | `new-en-he-preview-new--error--mobile.png`          |
| Form       | before save (fr)                             | `new-fr-he-preview-new--default--desktop.png`                             | -                                                   |
| Form       | attachments field error (fr)                 | `new-fr-he-preview-new--error--desktop.png`, `…--error-crop--desktop.png` | `new-fr-he-preview-new--error--mobile.png`          |

## 5. Gate 9a: design-system items applicable to legacy-exempt code

| Item                                              | Result | Evidence                                                                                                                                                                |
| ------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `check:design-system` (both commands)             | PASS   | output above                                                                                                                                                            |
| No new component, class, icon, colour or px value | PASS   | the component diff is a pure deletion (`HazardousEventCsvImportPage.tsx`, 7 lines); the form component is untouched; routes add no markup                               |
| Sentence case, no em dash in new copy             | PASS   | five new `csv.error.*` keys and `form.attachments_invalid_url`, EN and FR (`locales/*/hazardous-events.json:65, 393-397`)                                               |
| `t()` for every new string                        | PASS   | CSV codes via `t(\`csv.error.${code}\`)` (`HazardousEventCsvImportPage.tsx:46`); form error via server `t()` (`attachmentUrlFieldError.ts:4-15`), FR rendered in French |

## 6. Gate 9b: accessibility (WCAG 2.2 AA, axe scoped to `main`)

| State                                                      | Violations                           | Notes                                                                                                                                                                                  |
| ---------------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CSV failure, five new codes (en)                           | **0**                                | focus moves to `role="alert"` (`document.activeElement` role `alert`)                                                                                                                  |
| CSV failure, five new codes (fr)                           | **0**                                | same                                                                                                                                                                                   |
| CSV success (en)                                           | **0**                                | `role="status"`; file input cleared (`files.length` 0)                                                                                                                                 |
| Form, attachments field error (en)                         | **1** (`color-contrast`, 1 node)     | the new `<li>Attachment links must start with http:// or https://</li>`: `#ff0000` on `#ffffff` = 3.99:1 < 4.5:1. See F2 (pre-existing class)                                          |
| Form, attachments field error (fr)                         | **1** (`color-contrast`, 1 node)     | same node, French text                                                                                                                                                                 |
| Form, before save (en), for comparison                     | 0                                    | baseline: the violation appears only once a field error renders                                                                                                                        |
| No horizontal scroll at 375, CSV failure en/fr, success en | PASS                                 | `assertNoHorizontalOverflow`                                                                                                                                                           |
| No horizontal scroll at 375, form error en/fr              | FAIL (pre-existing, not this change) | scrollWidth 451 > 375. Reproduced **before** saving, as soon as one Link row exists in the legacy attachments table (`DIV.content-repeater` right edge 451). With no row: PASS. See P1 |

## 7. Gate 9c: design.md ground-truth checklist (items 1-8)

| #   | Item                                              | Verdict                                                       | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --- | ------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Layout wrapper, title, form, back link, templates | PASS                                                          | screenshots match the 6d-1 layout: header band, `mg-container flex flex-col gap-6` (`HazardousEventCsvImportPage.tsx:140`), file, Type (Create default), Import, outlined back link, "Example files" Create/Update/Upsert. No diff in these lines                                                                                                                                                                                                                                                                                                                                                                  |
| 2   | Success region                                    | PASS                                                          | DOM: `<div role="status"><p>1 event created, 0 updated, 0 unchanged.</p><p>Columns not imported: countryAccountsId</p></div>`. The row had footprint and Link data, so 6d-1 would have shown the notice; it is absent. Old notice keys are gone from both locales                                                                                                                                                                                                                                                                                                                                                  |
| 3   | Ignored-columns line                              | PASS                                                          | lists only `countryAccountsId` (success and failure, EN/FR); `spatialFootprint` and `attachments` are now mapped (`hazardousEventCsvColumns.ts` diff: `NOT_YET_IMPORTED_COLUMNS` removed, both added to `MAPPED_COLUMNS`)                                                                                                                                                                                                                                                                                                                                                                                          |
| 4   | Failure list, five new messages                   | PASS                                                          | EN: "Line 2, column spatialFootprint: This is not a valid spatial footprint…", "Line 3, column spatialFootprint: This division does not exist in your country instance. Value: 0000…", "Line 4, column attachments: These attachments are not valid…", "Line 5, column attachments: Attachment links must start with http:// or https://. Value: javascript:alert(1)", "Line 6, column attachments: A file can only be kept if this event already has it… Value: gate9.pdf". FR equivalents all rendered with "Ligne N, colonne C : … Valeur : …". Same `list-disc pl-6` format; long FR lines wrap cleanly at 375 |
| 5   | States                                            | PASS                                                          | initial, success and failure rendered; submitting and error boundary unchanged (no diff)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 6   | Navigation affordance                             | PASS                                                          | unchanged (no diff in list page or route)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 7   | Components                                        | PASS                                                          | no new component; imports unchanged                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 8   | Form attachments field error                      | PASS on content and behaviour, **with a layout finding (F1)** | after a javascript: Link save the URL stays `/en/he-preview/new`, one `.dts-field-error-list` renders inside the attachments `dts-form-component`, text EN "Attachment links must start with http:// or https://", FR "Les liens des pièces jointes doivent commencer par http:// ou https://". Entered values kept: dates 2026-01-01/2026-01-02, originator, specific hazard and the Link row. Nothing written (counts unchanged)                                                                                                                                                                                 |

## 8. Findings needing a human decision

- **F1, attachments error sits against the next field, not its own card (layout/proximity).**
  The error list renders 32px below the attachments card and 0px above the "Record originator"
  label, so it reads as belonging to Record originator (`new-en-he-preview-new--error-crop--desktop.png`,
  and the 375 screenshot). Traced: the field wrapper is `dts-form-component !mb-0`
  (`HazardousEventFormPage.tsx:237-242`), so its `margin-bottom: 1.43rem` (`style-dts.css:1422`)
  is removed; the gap above the error is the card's own `margin: 1.71rem 0` (24px,
  `app/components/ContentRepeater/assets/content-repeater.css:4`) plus the grid `gap: 0.57rem`
  (8px, `style-dts.css:1421`; measured 7.97px between wrapper bottom and list top). The `!mb-0`
  was right for 6c, where no error could render under this card; 6d-2 makes this error
  reachable for the first time. The spatial-footprint card has the same wrapper
  (`HazardousEventFormPage.tsx:226-235`) but passes its errors into the picker instead. Not in
  design.md item 8 ("No layout … changes"). Confirmed by screenshot and source.
- **F2, error text contrast 3.99:1 (WCAG 1.4.3), axe `color-contrast`.** `.dts-field-error-list li { color: var(--color-dts-error) }`
  (`app/styles/all.css:139-141`) with `--color-dts-error: red` (`all.css:116`). Pre-existing 6c
  class shared by every form field error, so not introduced here, but this change adds a new
  reachable instance and the 9b run on the error state fails because of it.
- **N1, punctuation differs between the two copies of the same rule.** Form
  `form.attachments_invalid_url` has no final period (`locales/en/hazardous-events.json:65`, FR
  `:65`), the CSV `csv.error.invalid_attachment_url` has one (`:396`, FR `:396`). Both are
  sentence-case and match their surroundings (other form errors vs. CSV sentences followed by
  "Value:"), so this may be intended; recorded for the copy review.
- **N2, the field error does not point at the offending row.** With several attachment rows,
  the message does not say which link is invalid; the table row still shows the raw
  `javascript:alert(1)` text. Behaviour as designed (D12), noted only for UX review.
- **P1 (pre-existing, not this change), horizontal overflow at 375 on the form once an
  attachment row exists.** The legacy attachments table pushes the page to 451px wide; it
  happens before any save, so it is independent of the new error.

## 9. Confirmed matching (spot-checked, not assumed)

- CSV page structure and spacing around the result region: identical to 6d-1 screenshots
  (result `<p>`s directly above "File upload", same as 6d-1's success state).
- Failure region: bold summary, bullet list, ignored line; focus on the alert after submit.
- Form layout other than the error line: unchanged between the before and after screenshots.

## 10. Data and cleanup

- Baseline before any run: `hazardous_event` 42, `event` 44, `workflow_instance` 39,
  `hazardous_event_spatial_observation` 6, `hazardous_event_attachment` 12, `audit_logs` 76,
  `text_content` 608, `hazardous_event_causality` 2; 0 rows with `api_import_id LIKE 'GATE9-6D2-%'`
  or `record_originator = 'GATE9-6D2'`. `uploads/` held 8 files.
- After all no-write runs (CSV failures EN/FR, run twice, form refused saves EN/FR, run three
  times): every count unchanged, 0 marked rows.
- The single success import (`apiImportId GATE9-6D2-OK-…`) added exactly 1 to `hazardous_event`,
  `event`, `workflow_instance`, `hazardous_event_spatial_observation`,
  `hazardous_event_attachment` and `audit_logs`. Event id `2d13e9f3-d870-4902-9d30-4dc8ef3103c3`.
- Deleted with POST `/en/he-preview/delete/2d13e9f3-…` → `302` to `/en/he-preview`.
- Final: `hazardous_event` 42, `event` 44, `workflow_instance` 39,
  `hazardous_event_spatial_observation` 6, `hazardous_event_attachment` 12, `text_content` 608,
  `hazardous_event_causality` 2, 0 marked rows. Lookup by id returns 0 in `hazardous_event`,
  `event`, `workflow_instance.entity_id`, `hazardous_event_spatial_observation.hazardous_event_id`,
  `hazardous_event_attachment.hazardous_event_id`, and both causality columns. `uploads/` file
  list identical to the baseline (diff empty).
- **Remaining, and in conflict with the brief:** 2 `audit_logs` rows with `record_id`
  `2d13e9f3-…` ("Create hazardous event" and "delete"), `audit_logs` 76 → 78. The audit trail
  is append-only and the brief allows only read-only SQL plus the CA delete, so they were not
  removed (same outcome as 6d-1, section 10). A human decides whether they should be.
- Scratchpad scripts, CSV bodies and logs were deleted.

## Re-check after the review fixes (2026-11-26)

- **F1 fixed (R4 in design.md):** the attachments field drops `!mb-0` while it shows an error
  (`HazardousEventFormPage.tsx`), so the field's own bottom margin separates the error from the
  "Record originator" label. The DOM test asserts the class switch. The E2E test
  `he-preview-attachments.spec.ts` asserts that the error ends above the next label (Playwright
  server on :4000).
- **F2 not changed:** the contrast of the shared `.dts-field-error-list` red is recorded on
  DEF-068 (user decision).
- **N1 fixed:** the form message now ends with a full stop, as the CSV message does.
- The :3000 dev server could not be used for this re-check. Its Vite dependency cache went stale
  (`504 Outdated Optimize Dep`) after the Playwright server rewrote the shared
  `node_modules/.vite` cache, and it needs a restart by its owner.
- Screenshots were not retained. `test-results/` is gitignored and is cleared by Playwright at
  the start of every run, so the 15 screenshots listed in section 4 and the re-check image are
  gone. The findings and measurements in this report stand.
