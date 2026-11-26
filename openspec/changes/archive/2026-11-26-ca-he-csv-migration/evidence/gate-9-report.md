# Gate 9 evidence report: `ca-he-csv-migration` (6d-1)

Reviewer: visual-parity-reviewer (fresh audit), 2026-11-24. Report only; no app source was edited.

## 1. Governance and pinned references (from design.md, "UI governance and traceability metadata")

- `ui-classification`: `legacy-exempt`
- Design system: `https://github.com/unisdr/delta-design`, `v0.7.2`, commit
  `a86cc3a62378871e93cbfa14aa69740201b8c556`
- Feature prototype: `https://github.com/unisdr/delta-feature-prototypes`, path `not-applicable`,
  commit `e24b8ad4dee319d5efa2a7c57fca30948f130bd0`, `status: not-required` (OD-13, approved human
  review exception; legacy `csvImportScreen` is the parity reference)
- Working tree: branch `feature/ca-he-csv-migration`, HEAD `7055352b`, change uncommitted.

## 2. Subject, reference, data and environment

- Subject: `/{lang}/he-preview/csv-import`
  (`app/routes/$lang+/_authenticated+/he-preview+/csv-import.tsx`,
  `app/domains/hazardous-events/presentation/web/csv/HazardousEventCsvImportPage.tsx`).
- Reference: `/en/hazardous-event/csv-import` (`app/frontend/csv_import.tsx:16-126`, route
  `app/routes/$lang+/hazardous-event+/csv-import.tsx`).
- Dev server `http://localhost:3000` (already running, not restarted). Logged in as
  `test.admin@india.gov.in` (admin, single tenant `50c88fb1…`). Chromium (Playwright 1.58.2),
  headless. Viewports: desktop 1280×900, mobile 375×812 (`BREAKPOINTS` in
  `tests/e2e/helpers/designSystemChecks.ts`).
- Project root font-size is 14px (`public/assets/css/style-dts.css:18`), so 1rem = 14px in every
  measurement below.
- Same-data comparison: the legacy and new initial and failure states were driven with equivalent
  inputs (a one-row file with `startDate=2025-13-45`, mode Create). The legacy success state was
  not captured, by instruction (it creates null-tenant orphans, design.md I1); the new success
  state is compared against legacy code (`csv_import.tsx:50`) only.

## 3. Commands run

- 9a: `yarn check:design-system --verify-spec --change ca-he-csv-migration --base origin/dev` →
  `PASS: Gate 9a design-system and spec verification passed.` (re-run by this reviewer).
- 9b/9c: throwaway `tsx` scripts in the session scratchpad (deleted afterwards) that drive
  Playwright `chromium` and call the repo helpers directly:
  `capturePrototypeStateScreenshots` (`tests/e2e/helpers/prototype-evidence.ts`),
  `runWcag22A11yCheck`, `verifyKeyboardSequence`, `assertTargetSizesAndLabels`
  (`tests/e2e/helpers/a11y.ts`), `assertNoHorizontalOverflow`
  (`tests/e2e/helpers/designSystemChecks.ts`). Success and pending-state screenshots were taken
  with `page.screenshot` into the same directory and naming scheme, so the success import ran
  exactly once (the helper re-navigates per viewport).
- DB verification: read-only `pg` queries (`SET default_transaction_read_only = on`) against
  `DATABASE_URL` from `.env`.

## 4. Screenshots (`test-results/gate-9/ca-he-csv-migration/`)

`test-results/` is in `.gitignore` (line 76), so these files are local evidence and are not
committed.

| Page   | State                                    | Desktop                                                                                                                                              | Mobile 375                                                  |
| ------ | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Legacy | initial                                  | `legacy-en-hazardous-event-csv-import--default--desktop.png`                                                                                         | `legacy-en-hazardous-event-csv-import--default--mobile.png` |
| Legacy | failure (bad date)                       | `legacy-en-hazardous-event-csv-import--error--desktop.png`                                                                                           | `legacy-en-hazardous-event-csv-import--error--mobile.png`   |
| New    | initial (en)                             | `new-en-he-preview-csv-import--default--desktop.png`                                                                                                 | `new-en-he-preview-csv-import--default--mobile.png`         |
| New    | failure (en)                             | `new-en-he-preview-csv-import--error--desktop.png`                                                                                                   | `new-en-he-preview-csv-import--error--mobile.png`           |
| New    | success (en)                             | `new-en-he-preview-csv-import--success--desktop.png`                                                                                                 | `new-en-he-preview-csv-import--success--mobile.png`         |
| New    | French initial                           | `new-fr-he-preview-csv-import--default--desktop.png`                                                                                                 | `new-fr-he-preview-csv-import--default--mobile.png`         |
| New    | French failure                           | `new-fr-he-preview-csv-import--error--desktop.png`                                                                                                   | `new-fr-he-preview-csv-import--error--mobile.png`           |
| New    | submitting (POST delayed 3 s)            | `new-en-he-preview-csv-import--loading--desktop.png`                                                                                                 | -                                                           |
| New    | Type popover open                        | `new-en-he-preview-csv-import--select-open--desktop.png`                                                                                             | -                                                           |
| New    | focus crops (unfocused / keyboard focus) | `focus/new-unfocused-{0..4}.png`, `focus/new-focus-{0..4}.png` (file, Type, Import, back link, Create template); `focus/new-failure-alert-focus.png` | -                                                           |

The reviewer opened every screenshot in the table except `new-unfocused-3.png` and
`new-unfocused-4.png`. A byte comparison (`cmp`) shows those two are identical to
`new-focus-3.png` and `new-focus-4.png`. `focus/new-focus-2.png` was retaken 700 ms after
focus, because the first crop caught the button's 0.3 s transition before the ring appeared.
Initial and failure screenshots were taken with the mouse parked at (1, 1) so that no hover
state shows. An earlier capture showed the
legacy Submit in its hover colour because the pointer was still over it; the computed values
are identical (`rgb(0, 79, 145)`, `.mg-button.mg-button-primary`, `style-dts.css:628-631`).

## 5. Gate 9a: design-system items applicable to legacy-exempt code

| Item                                                     | Result          | Evidence                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `check:design-system --verify-spec`                      | PASS            | command output above                                                                                                                                                                                                                                                            |
| No PrimeReact / primeicons in new code                   | PASS            | grep of the page component and route: no matches                                                                                                                                                                                                                                |
| Icons: Lucide only, `aria-hidden` on decorative          | PASS            | the new code adds no icons. `BackLink`'s hand-rolled SVG is existing 6b code (`BackLink.tsx:5-23`) and is `aria-hidden`                                                                                                                                                         |
| No hardcoded colours or pixel values in new code         | PASS            | new classes are scale utilities only (`flex flex-col gap-6`, `list-disc pl-6`, `min-h-6 py-0.5 text-dts-action underline`, `focus:outline-2 focus:outline-offset-2`). The arbitrary values `rounded-[6px] px-[1.09375rem] py-[0.65625rem]` belong to existing `BackLink.tsx:32` |
| Legacy classes and `app/design-system/components` reused | PASS            | `mg-container`, `dts-form`, `dts-form-component`, `mg-grid mg-grid__col-6`; `Button variant="system-primary"` renders `mg-button mg-button-primary`, matching legacy (`Button.tsx:40`)                                                                                          |
| Sentence case                                            | PASS            | "Hazardous events CSV import", "File upload", "Type", "Import", "Example files", "Back to hazardous events"                                                                                                                                                                     |
| No em dashes in UI copy                                  | PASS            | no `—` in the component or in `csv.*` in either locale                                                                                                                                                                                                                          |
| `t()` for all user-facing strings                        | PASS, with note | every string comes from `csv.*`. Note N4: the `": "` separator in `ErrorItem` is hard-coded (`HazardousEventCsvImportPage.tsx:38`)                                                                                                                                              |

## 6. Gate 9b: accessibility (WCAG 2.2 AA)

| Check                                                                                                      | Result                         | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `runWcag22A11yCheck`, `main` scope: initial, failure, success, French initial, French failure              | PASS (0 violations, all five)  | script output                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `runWcag22A11yCheck` with `fullPage: true`, initial                                                        | FAIL (pre-existing, page-wide) | `document-title`: `document.title` is `""`. It is also `""` on legacy `/en/hazardous-event/csv-import`, `/en/he-preview` and `/en/he-preview/new`. The new route has no `meta` export, like its siblings. See P2                                                                                                                                                                                                                                   |
| `assertTargetSizesAndLabels`: initial, failure, success, French (desktop); initial, failure, success (375) | PASS                           | rendered sizes: file input 939.80×35.16, Type 143.33×33.80, Import 77.69×42.02, back link 202.77×37.88, template links 44.6×24.50                                                                                                                                                                                                                                                                                                                  |
| Template-link 24 px target, traced to source                                                               | PASS (0.5 px margin)           | `min-h-6` = 1.5rem = 21px at the 14px root, plus `py-0.5` = 2×1.75px, gives 24.5px (`HazardousEventCsvImportPage.tsx:161`). The legacy anchors are 17px tall and fail axe `target-size` (3 nodes) and the helper (informational run on legacy)                                                                                                                                                                                                     |
| `verifyKeyboardSequence`, initial: file → Type → Import → back link → Create → Update → Upsert             | PASS                           | also Shift+Tab reverse (6 steps): PASS                                                                                                                                                                                                                                                                                                                                                                                                             |
| Failure: focus moves to the summary; Tab continues file → Type → Import → back → Create                    | PASS                           | `document.activeElement` has `role="alert"` after submit; sequence PASS                                                                                                                                                                                                                                                                                                                                                                            |
| Type popover keyboard                                                                                      | PASS                           | Enter opens it with focus on the selected "Create"; options in order Update, Create, Upsert; ArrowDown moves to "Upsert"; Escape closes it, returns focus to the trigger and keeps "Create"                                                                                                                                                                                                                                                        |
| Accessible name of Type                                                                                    | PASS                           | `aria-labelledby` resolves to "Create Type". The visible label "Type" is contained (2.5.3)                                                                                                                                                                                                                                                                                                                                                         |
| Error text carries line and column                                                                         | PASS                           | "Line 2, column startDate: Enter a date as YYYY, YYYY-MM or YYYY-MM-DD. Value: 2025-13-45"                                                                                                                                                                                                                                                                                                                                                         |
| Success region `role="status"`, failure region `role="alert"`                                              | PASS                           | DOM after submit                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Visible focus (2.4.7), file input                                                                          | PASS (weak)                    | `focus/new-focus-0.png` vs `new-unfocused-0.png`: the "Choose File" border changes from grey to dark blue. The outline is removed by `style-dts.css:1563-1567`. The border change comes from no project rule (no `file-selector-button` rule in `style-dts.css` or `all.css`), so it is Chromium's own focus styling of the selector button and is not guaranteed in other browsers. A legacy crop taken the same way looks the same               |
| Visible focus, Type trigger                                                                                | PASS (weak)                    | the 1px border changes from `#cccccc` to `#004f91` (`all.css:193-197`), matching legacy's native select (`style-dts.css:1569-1573`)                                                                                                                                                                                                                                                                                                                |
| Visible focus, Import                                                                                      | PASS                           | `box-shadow: 0 0 0 2px #106cb8` (`style-dts.css:638-641`), reached after the 0.3s transition. Same as legacy                                                                                                                                                                                                                                                                                                                                       |
| Visible focus, back link and the three template links                                                      | **FAIL (known, DEF-062)**      | `focus/new-focus-3.png` and `new-focus-4.png` are byte-identical (`cmp`) to the unfocused crops. `*:focus-visible { outline: 2px solid var(--focus-ring) }` (`app/styles/all.css:64-69`) is invalidated by `--focus-ring: 0 0 0 0.2rem #bfdbfe` from `public/assets/themes/lara-light-blue/theme.css:47`, which is loaded after it. The computed `--focus-ring` on this page is that box-shadow value. Legacy links also have no indicator. See F1 |
| No horizontal scroll at 375                                                                                | PASS                           | `assertNoHorizontalOverflow`: initial, failure, success and French all pass (legacy also passes)                                                                                                                                                                                                                                                                                                                                                   |
| Focus not obscured (2.4.11)                                                                                | PASS                           | `assertFocusNotObscured` runs on every `verifyKeyboardSequence` step                                                                                                                                                                                                                                                                                                                                                                               |

## 7. Gate 9c: design.md ground-truth checklist (items 1-11)

| #   | Item                     | Verdict                                                                                                          | Evidence                                                                                                                                                                                                                                                                                                                                                                                                          |
| --- | ------------------------ | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Layout wrapper           | PASS                                                                                                             | `MainContainer` (`app/frontend/container.tsx:11-30`), h1 `dts-heading-1` "Hazardous events CSV import"; the same header band in the screenshots. French: "Importation CSV des événements dangereux"                                                                                                                                                                                                               |
| 2   | Container                | PASS, with a structural note                                                                                     | `div.mg-container > form.dts-form[enctype=multipart/form-data]`. The new code adds `flex flex-col gap-6` to the inner `mg-container` (`HazardousEventCsvImportPage.tsx:122`) in place of legacy's `<br>` spacers (`csv_import.tsx:81,88`). Traced: the form ends at y=446.78 in both pages and the next block starts at 467.78 in both (21px = one 14px×1.5 line in legacy, `gap-6` = 1.5rem in new). Same rhythm |
| 3   | Result area              | DEVIATION, approved (OD-6)                                                                                       | on success: "1 events created, 0 updated, 0 unchanged." plus the ignored-columns line, in `role="status"`. On failure: a bold summary, a list of errors with line and column, and the ignored-columns line, in `role="alert"`. There is no false "0 records" line. Two unapproved details, N1 and N2, are below                                                                                                   |
| 4   | Field 1 (file)           | DEVIATION, approved                                                                                              | `label` wraps `input[type=file][name=file][accept=".csv,text/csv"]`; looks the same as legacy                                                                                                                                                                                                                                                                                                                     |
| 5   | Field 2 (Type)           | PASS on label, options and default (Create, OD-13); **structural deviation not recorded in this design.md** (F2) | options Update, Create, Upsert; default Create. The control is a React Aria `Select` (a button plus a listbox popover, with a hidden native `select[name=import_type]` that submits). Its label is a `<span>`, not a `<label>` wrapping the control (`Select.tsx:44-47`). It looks the same as legacy: 143.33×33.80, same border, radius, padding and chevron                                                     |
| 6   | Submit                   | DEVIATION, approved                                                                                              | design-system `Button` → `button.mg-button.mg-button-primary` with label "Import", the same computed style as legacy's `input.mg-button.mg-button-primary` (bg `rgb(0,79,145)`, padding 12.04/15.96, radius 7.98, 42.02px tall). While submitting it is disabled and reads "Importing…" (`loading` screenshot). See N3 on focus                                                                                   |
| 7   | Back link                | PASS (parity of affordance)                                                                                      | `BackLink` → `/en/he-preview`, outlined, "Back to hazardous events", where legacy has an unstyled black "Back to List" link. This matches the 6b convention. No visible focus (F1)                                                                                                                                                                                                                                |
| 8   | Templates                | PASS (order Create, Update, Upsert per OD-17)                                                                    | `h3` "Example files" (14px, normal weight in both, after the preflight reset), with links to `csv-template?mode=`. The template downloads return 200 `text/csv` with `attachment; filename="hazardous-event-{mode}.csv"`. The visual style differs from legacy (F3)                                                                                                                                               |
| 9   | Ignored columns          | DEVIATION, approved                                                                                              | "Columns not imported: spatialFootprint, attachments" appears in both the success and failure states (English and French)                                                                                                                                                                                                                                                                                         |
| 10  | Empty / loading / error  | PASS                                                                                                             | initial state is the form only. Submitting disables the button and shows "Importing…". The unexpected-error boundary is exported (`csv-import.tsx`, `export { HazardousEventErrorBoundary as ErrorBoundary }`); it was not exercised here because the 6b E2E covers it                                                                                                                                            |
| 11  | Navigation into the page | PASS                                                                                                             | `grep csv-import` over `HazardousEventListPage.tsx` and `he-preview+/_index.tsx` finds no matches                                                                                                                                                                                                                                                                                                                 |
| -   | Responsive (375)         | PASS                                                                                                             | single-column form at 375 in both pages. Type stretches to full width in both (`mg-grid__col-6` behaves the same). No overflow                                                                                                                                                                                                                                                                                    |
| -   | French                   | PASS, with notes N4 and N6                                                                                       | `html[lang=fr]`; every label is translated; the hidden select keeps the `update/create/upsert` values                                                                                                                                                                                                                                                                                                             |

## 8. Findings needing a human decision (not covered by design.md)

- **F1, visible focus on links (WCAG 2.4.7). Known root cause: DEF-062.** The back link and the
  three new template links show no focus indicator. Root cause: `--focus-ring` is overridden by
  `lara-light-blue/theme.css:47`, which invalidates `all.css:66`. This is not a regression
  (legacy links have none either), but the template links are new instances on a new page. They
  are already covered by DEF-062's app-wide scope; the reviewer suggests noting them there.
  Confirmed by screenshot crops and by a computed-rule trace.
- **F2, Type control structure.** design.md item 5 says "same" and the Accessibility list says
  "labels wrap their controls". The new page uses the React Aria `Select`, so the label is a
  `<span>` linked by `aria-labelledby`, not a wrapping `<label>`. Clicking the label was not
  tested. The accessible name, keyboard behaviour and axe all pass. This
  is the shared component's accepted deviation (comment at `Select.tsx:26-27`, citing another
  change's design), but this change's design.md does not record it. To decide: amend item 5 and
  the Accessibility bullet, or use a native `select`.
- **F3, template link styling.** Legacy anchors are black, not underlined and 17px tall
  (`csv_import.tsx:92-118`, no class). The new anchors are `text-dts-action underline`, 24.5px
  tall (`HazardousEventCsvImportPage.tsx:161`). This improves 1.4.1 and 2.5.8, but design.md
  item 8 records only order and content. To decide: record it as an approved deviation.
- **N1, success copy plural.** The success line reads "1 events created". `csv.success` has no
  `_one`/`_other` forms (`locales/en/hazardous-events.json:336`). The French key has the same
  shape (`{{created}} événements créés`); a French success was not rendered. design.md item 3 also words it "N events created, M updated", without
  "unchanged".
- **N2, failure summary focus outline.** The `role="alert"` box gets a 2px black
  (`currentColor`) outline whenever it is focused, including after a mouse submit, because it
  uses `focus:` rather than `focus-visible:` (`HazardousEventCsvImportPage.tsx:99`). This heavy
  black frame is visible in every failure screenshot and has no legacy counterpart. The colour
  is not a semantic token. To decide: keep it (it marks where focus moved), or use
  `focus-visible:` with the focus token.
- **N3, focus after submit and on success.** `Button` gets `disabled={submitting}`
  (`HazardousEventCsvImportPage.tsx:145`), so pressing Import moves focus to `<body>`. On
  success it stays there; on failure it moves to the alert. `Button` already offers
  `pending`, which "stays focusable" (`Button.tsx:20-21`). Separately, the `role="status"`
  region is mounted together with its text, which some screen readers do not announce.
- **N4, French separator.** `ErrorItem` hard-codes `{location}: ` (`:38`), so French shows
  "colonne startDate: Saisissez…" while the translated `csv.value` uses "Valeur :". This is a
  copy-review item for the translator.
- **N5, file stays selected after success.** Legacy reloads the document and clears the file
  input; the new page uses a client `Form`, so `success.csv` stays selected (success
  screenshot). A second press of Import in Create mode would import the same rows again. This
  was not exercised, because it would create data. It is in the spirit of DEF-063 and design.md
  item 6's "prevents double submit".
- **N6, native file-input text is not translated.** On `/fr/...` the file input still reads
  "Choose File / No file chosen". That text comes from the browser locale, not the page, and
  legacy behaves the same. A translated custom picker would be its own change.
- **P2, no document `<title>` (axe `document-title`, Level A 2.4.2).** `document.title` is
  empty on this route, on legacy csv-import, on `/en/he-preview` and on `/en/he-preview/new`.
  Like its siblings, the new route has no `meta` export. The human decides whether this
  change should add one.

## 9. Approved deviations (design.md items 3, 4, 6, 9; default mode Create, OD-13)

All were observed as designed: items 3, 4, 6 and 9 in section 7, and the Create default in
item 5. The back link affordance (item 7) and the template order (item 8, OD-17) match the
design.

## 10. Data and cleanup

- Marker `GATE9-CSV-1795544516284` (the earlier "GATE9-" audit rows belong to a previous run
  and were not touched).
- Baseline before the run: `hazardous_event` 42 (0 with a null tenant), `event` 44,
  `workflow_instance` 39, `audit_logs` 70, `text_content` 608, `hazardous_event_causality` 2,
  `event_relationship` 0.
- The first batch of failure uploads (5 new-page and 2 legacy, all bad dates) wrote nothing.
  After them, `hazardous_event`, `event`, `workflow_instance` and `audit_logs` were each up by
  exactly 1, all from the single success import, and there were 0 null-tenant rows. A second
  batch, which retook the screenshots with the pointer parked (4 new-page and 2 legacy bad-date
  uploads), ran after the delete. Counts after it were unchanged (below).
- No native JS dialog appeared during any run (a handler that aborts the run was attached).
- The success import created 1 `hazardous_event` (`0557a691-1fbf-451d-a7b8-dc540806c91e`,
  tenant `50c88fb1…`), 1 `event`, 1 `workflow_instance` and 1 audit row.
- It was deleted with POST `/en/he-preview/delete/0557a691-…`, which returned `302` to
  `/en/he-preview`.
- Final state, after the delete and the second batch: `hazardous_event` 42 (0 null-tenant),
  `event` 44, `workflow_instance` 39 (0 orphan HE instances), `text_content` 608,
  `hazardous_event_causality` 2, `event_relationship` 0, and 0 marked rows. A lookup by id
  `0557a691-…` returns 0 rows in `event`, `hazardous_event`, `workflow_instance` and
  `hazardous_event_causality`. The `uploads/` directory tree was unchanged between the baseline
  and the delete (diff: empty). It was not re-listed after the second batch, which had only
  failing uploads.
- **Remaining by design:** 2 `audit_logs` rows carry the marker ("Create hazardous event" and
  "delete", `record_id` `0557a691-…`), which brings `audit_logs` from 70 to 72. The audit trail
  is append-only, so they were not removed.
- Scratchpad: all throwaway scripts, CSV files and the session `state.json` were deleted. The
  reviewer also removed a `pw-out/` folder from an aborted `playwright test` attempt whose
  `outputDir` pointed there. Its ownership was not confirmed before removal: the scratchpad
  folder already held other files (not touched).

## 11. Re-check after the small fixes (2026-11-25)

A fresh `visual-parity-reviewer` re-checked the user-approved Gate 9 small fixes on the dev
server (:3000, test.admin, headless Chromium 1280×900, plus 375 px for the success line).
Screenshots are in `test-results/gate-9/ca-he-csv-migration/recheck/`. 9a was re-run:
`PASS: Gate 9a design-system and spec verification passed.`

| Item                                            | Result | Evidence                                                                                                     |
| ----------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------ |
| N1 plural (EN and FR `_one`/`_other`)           | PASS   | "1 event created, 0 updated, 0 unchanged." / "1 événement créé, …"; no overflow at 375 px                    |
| Error summary `focus-visible`, focus on failure | PASS   | no ring on a mouse submit, 2px `dts-action` ring on a keyboard submit; `runWcag22A11yCheck` passes (failure) |
| Submit `pending`, not `disabled`                | PASS   | `data-pending="true"`, still focusable, "Importing…"                                                         |
| Localised separator (`csv.error_item`)          | PASS   | FR "Ligne 2, colonne startDate : …"                                                                          |
| File input cleared after success                | PASS   | `files.length` 1 → 0, "No file chosen"                                                                       |
| `parent_multiple_causes` copy (EN/FR)           | PASS   | non-empty, no em or en dash                                                                                  |

New observations: **NR1** (nit, French copy): only `count` (created) drove the plural, so
French showed "1 inchangés". **Fixed after the gate 10 decisions (2026-11-25):** the success line
now composes three plural keys (`csv.success_parts.*`), and DOM tests assert "0 événement créé, 1 mis
à jour, 0 inchangé." and "…, 2 inchangés.". The page also gained the "…and N more" line (gate 10
finding 3, EN/FR, DOM-tested); neither change was re-checked in a browser. **NR2**: the keyboard-focused
pending button shows no visible ring, the same root cause as F1 (DEF-062), not introduced here.

Cleanup: marker `GATE9RC-1795589413784`; 2 events created and deleted through the CA delete
action (`8b9e7b92-…`, `ced7b6a3-…`). Final counts: `hazardous_event` 42 (0 null-tenant),
`event` 44, `workflow_instance` 39 (0 orphan HE instances); 4 append-only audit rows remain
(72 → 76).
