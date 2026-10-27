## 1. Decisions locked (confirmed by the human, recorded for traceability)

All three items below were previously open decisions; all three are now confirmed and are not
gates — they're recorded here so the rest of this task list can be read without cross-referencing
proposal.md each time.

- [x] 1.1 Permission level — CONFIRMED: replicate legacy's `ViewData` check, called explicitly
      inside each loader (not inherited from the parent layout). See design.md Decision 2;
      implemented in Section 6.
- [x] 1.2 Design-system component location — CONFIRMED: `app/design-system/components/` (new
      top-level folder). See design.md Decision 7a; used consistently throughout Section 5.
- [x] 1.3 Minimal `6a`-scoped Tailwind `@theme` block — CONFIRMED new scope item, not a `DEF-014`
      Pass-1 substitute. See design.md Decision 8; implemented in Section 5.

## 2. DEF-031 — GetHazardousEventByIdUseCase degrades gracefully (TDD)

- [x] 2.1 RED: update the existing test in `app/domains/hazardous-events/application/use-cases/GetHazardousEventById.test.ts`
      ("throws NotFoundError and performs no spatial-observation lookup when no WorkflowInstance
      exists...") to assert the new behavior instead: `execute()` resolves (does not throw),
      `result.workflowStatus` is `null`, and the spatial-observation lookup IS performed. Verify
      it now fails: `yarn vitest run app/domains/hazardous-events/application/use-cases/GetHazardousEventById.test.ts`
- [x] 2.2 GREEN: update `app/domains/hazardous-events/application/dto/HazardousEventDetailDto.ts` —
      `workflowStatus: Status | null` (Omit-and-override, matching `HazardousEventListItemDto`'s
      existing pattern), build from `mapHazardousEventFields(event)` instead of `toHazardousEventDto`,
      `toHazardousEventDetailDto`'s `workflowInstance` param becomes `WorkflowInstance | null`.
      Update `app/domains/hazardous-events/application/use-cases/GetHazardousEventById.ts` to remove
      the `NotFoundError` throw for a missing `WorkflowInstance`, pass it through as `null` instead,
      and add a `workflowStatusMissing: true` field to the existing success `logger.info` call when
      it's null. Verify 2.1's test now passes.
- [x] 2.3 Update `app/domains/hazardous-events/application/dto/HazardousEventDetailDto.test.ts` to
      cover the nullable-`workflowStatus` construction path explicitly. Verify:
      `yarn vitest run app/domains/hazardous-events/application/dto/HazardousEventDetailDto.test.ts`
- [x] 2.4 Add a log-assertion test for the `workflowStatusMissing: true` field (spec:
      "Log event flags a missing WorkflowInstance without throwing"), and update the existing
      "No log event on any failure" test to drop "missing WorkflowInstance" from its failure-reason
      list (it's no longer a failure). Verify both in the same test run as 2.1.

## 3. DEF-031 — UpdateHazardousEventUseCase degrades gracefully (TDD)

- [x] 3.1 RED: update the existing test in `app/domains/hazardous-events/application/use-cases/UpdateHazardousEvent.test.ts`
      ("throws NotFoundError for a missing WorkflowInstance before any merge/validation work runs")
      to assert graceful degradation instead (update succeeds, resolved `workflowStatus` is `null`).
      Verify it now fails: `yarn vitest run app/domains/hazardous-events/application/use-cases/UpdateHazardousEvent.test.ts`
- [x] 3.2 Grep `tests/integration/domains/hazardous-events/UpdateHazardousEventUseCase.test.ts` for
      the same "missing WorkflowInstance" assertion; if present, flip it the same way as 3.1 and seed
      a PGlite event with no `WorkflowInstance` row to cover it. (Verified: no such assertion exists
      in this file today — all three of its own scenarios seed a real `WorkflowInstance`. No-op.)
- [x] 3.3 GREEN: in `app/domains/hazardous-events/application/use-cases/UpdateHazardousEvent.ts`,
      define a local result type (`Omit<HazardousEventDto, "workflowStatus"> & { workflowStatus: Status | null }`,
      per design.md Decision 3 — do not reuse `HazardousEventDetailDto` or `HazardousEventListItemDto`,
      wrong semantics for both), remove the `NotFoundError` throw for `existingWorkflow`, map
      `workflowStatus` via `existingWorkflow?.status ?? null`, and change `execute()`'s return type
      and final `toHazardousEventDto(...)` call accordingly. Verify 3.1/3.2 now pass.
- [x] 3.4 Run `yarn tsc` and confirm zero new errors from the changed return type (only
      `UpdateHazardousEvent.ts` and its two test files reference it today — verified during spec
      research; re-confirm at implementation time in case anything changed).

## 4. HE-local presentation helpers (not imported from Notices — ADR-009)

- [x] 4.1 Create `app/domains/hazardous-events/presentation/resolveTenantId.server.ts`,
      `throwHazardousEventLoaderError.server.ts`, and `parsePagination.ts`, each mirroring the
      corresponding file in `app/domains/notices/presentation/` (textually, with HE-appropriate
      naming/imports) per design.md Decision 4. Verify by diffing against the Notices originals —
      same logic, no cross-domain import.

## 5. Design tokens + React Aria presentation components, styled for pixel/behavior parity with the legacy HE UI

- [x] 5.1 Add `react-aria-components` to `package.json` at a pinned, current version (not `latest`);
      run `yarn install`; verify `yarn tsc` still passes with the new dependency present.
      (Pinned `^1.22.1`, the current published version at implementation time; `yarn tsc` clean.)
- [x] 5.2 Read `app/frontend/events/hazardeventlist.tsx` and its referenced CSS classes
      (`dts-table`, `dts-status`/`dts-status--{status}`, `dts-table__actions`,
      `dts-table__cell-centered`, `dts-page-section`, `dts-heading-4`) plus
      `app/frontend/pagination/view.tsx`'s `dts-pagination`/`mg-button mg-button--small mg-button-ghost`
      markup, in `public/assets/css/style-dts.css`, as the styling source of truth. Do NOT read
      either `feature/poc-react-aria-hazardous-event` or `spike/react-aria-consumption` — build
      fresh from React Aria's own documentation.
- [x] 5.3 Read the legacy detail-rendering chain (`app/frontend/form/view_base.tsx` and whatever
      field-level renderers it delegates to for a hazardous-event's own fields) for the detail
      page's markup/CSS source of truth. Real shell: `ViewComponentMainDataCollection`
      (`app/frontend/form/view_main_data_collection.tsx`), reached via `HazardousEventView`
      (`app/frontend/events/hazardeventform.tsx`) — `view_base.tsx` is only a generic dispatcher.
- [x] 5.4 Add the minimal `@theme { ... }` block to `app/styles/all.css`, immediately after the
      existing `@import "tailwindcss";` line, defining the 7 tokens listed in design.md Decision 8
      (`--color-dts-table-border`, `--color-dts-table-header-bg`, `--color-dts-action`,
      `--color-dts-status-missing`, `--spacing-dts-cell-padding`, `--spacing-dts-row-height`,
      `--radius-dts-button`). Re-verify each value against the live `public/assets/css/style-dts.css`
      at implementation time. This is additive-only — verify no existing page's rendering changes.
      Token count corrected from an initial over-broad draft (Gate 8 finding) — see final report.
- [x] 5.5 Build the reusable, domain-agnostic primitives at `app/design-system/components/`:
      `Table.tsx`, `TableColumn.tsx`, `TableRow.tsx`, `TableCell.tsx`, `Link.tsx` — thin wrappers
      over React Aria's own `Table`/`Row`/`Column`/`Cell`/`Link` components, styled via the
      `@theme` tokens from 5.4 (`var(--color-dts-action)`, etc.) — not hardcoded hex/rem values —
      plus the structural `dts-*`/`mg-*` classes from 5.2. These MUST NOT import `primereact` or
      anything from `app/domains/*` (`design-system-components` spec). Verify with the spec's own
      import-check scenarios.
- [x] 5.6 Add unit tests for the primitives in 5.5 asserting the rendered classes
      (`dts-table`, `dts-table__cell-centered`, etc.) and that their computed/inline styles resolve
      to the `@theme` token values from 5.4 (not literal hardcoded hex). `Link`'s own
      keyboard-activation scenario is covered by the Section 7 E2E spec, not a unit test (Gate 8
      finding — no `jsdom`/`@testing-library/react` in this project's test setup) — see final report.
- [x] 5.7 Build `app/domains/hazardous-events/presentation/HazardousEventListPage.tsx`
      (`PageProps<HazardousEventListItemDto[]>`) as a thin composition of the Section 5.5
      primitives. Columns per design.md Decision 7:
      `specificHazardLocalName ?? specificHazardNationalName ?? specificHazardId`,
      `hazardousEventStatus`, `workflowStatus` (distinct "—"/muted treatment when `null`, using the
      `--color-dts-status-missing` token), `startDate`, `updatedAt`, plus a view-only action link
      per row (using the shared `Link`) to `/he-preview/${id}`. Prev/next-only pagination (no
      total — ADR-007), styled per 5.2's `dts-pagination`/`mg-button` classes.
- [x] 5.8 Build `app/domains/hazardous-events/presentation/HazardousEventDetailPage.tsx`
      (`PageProps<HazardousEventDetailDto>`) matching the legacy detail view's markup/CSS from 5.3,
      including a distinct indicator when `workflowStatus` is `null`.
- [x] 5.9 Add presentation-layer tests for both HE page components (render with stub data, assert
      the row→detail link target, assert the null-`workflowStatus` indicator renders distinctly)
      per the `hazardous-event-route-adapter` spec's "list page provides a way to reach each
      event's detail page" and "a missing workflow status is visibly indicated" requirements.
- [x] 5.10 Create `locales/en/hazardous-events.json` and `locales/fr/hazardous-events.json`; run
      `yarn i18n:extractor` and verify it reports no missing keys for the new namespace. No en/fr
      keys missing; other locales match the pre-existing `notices` namespace's own gap pattern.

## 6. Route files

- [x] 6.1 RED: write `tests/integration/domains/hazardous-events/routes/HazardousEventListRoute.test.ts`
      (`import "../../../db/setup"`), modeled directly on
      `tests/integration/domains/notices/routes/NoticesIndexRoute.test.ts` (same `vi.mock("~/init.server")`
      / `Test.createTestingModule({ imports: [HazardousEventsModule] })` pattern), covering: default
      pagination, explicit pagination, no-envelope success shape, tenant-resolution redirect, the
      `DomainError`/non-`DomainError` error-mapping scenarios, and (per the confirmed Decision 2 —
      not conditional) a session with no `ViewData` permission is rejected with a 403
      `FORBIDDEN` `ErrorResponse` and `ListHazardousEventsUseCase.execute` is NOT called. Seed at
      least one event WITH a `WorkflowInstance` (via `CreateHazardousEventUseCase`) and one WITHOUT
      (direct Drizzle insert, no workflow-instance row) to cover `DEF-031`'s two states. Verify the
      test file fails to run (route module doesn't exist yet).
- [x] 6.2 RED: write `tests/integration/domains/hazardous-events/routes/HazardousEventDetailRoute.test.ts`,
      modeled on `NoticeDetailRoute.test.ts`, covering: known id, unknown id (404), cross-tenant id
      (404, not the other tenant's data), tenant-resolution redirect, the two `WorkflowInstance`
      states, and the same `ViewData`-permission-rejection scenario as 6.1. Add one scenario
      Notices' precedent doesn't need: a malformed non-UUID `id` param — confirm against the real
      `DrizzleHazardousEventRepository.server.ts` behavior whether this surfaces as a 500 (raw
      Postgres `22P02`) or a clean 404, and assert whichever it actually does, not an assumption.
      Verify the test file fails to run.
- [x] 6.3 GREEN: implement the `ViewData` permission check itself — `requireUser()` plus
      `roleHasPermission(role, "ViewData")`, called directly inside each loader (design.md
      Decision 2; NOT the legacy `authLoaderWithPerm` HOC — no `as any` cast). On failure, throw the
      same `Response.json(errorResponse, { status: 403 })` shape as any other `DomainError`
      (`AuthorizationError`/`FORBIDDEN`), via the shared `throwHazardousEventLoaderError` helper
      from Section 4. Verify the 403 scenarios from 6.1/6.2 now pass in isolation (test only this
      check, e.g. by temporarily stubbing the use case call) before wiring the rest of the loader.
- [x] 6.4 GREEN: implement `app/routes/$lang+/_authenticated+/he-preview+/_index.tsx` and
      `app/routes/$lang+/_authenticated+/he-preview+/$id.tsx` per design.md Decisions 1–2 and the
      `hazardous-event-route-adapter` spec — tenant resolution, the 6.3 permission check, use-case
      resolution via `getAppContext().get(...)`, error mapping — wrapping the Section 5 page
      components in `MainContainer` with a translated title. No `ErrorBoundary` export (that's
      `6b`'s scope).
- [x] 6.5 Verify: `yarn vitest run tests/integration/domains/hazardous-events/routes/HazardousEventListRoute.test.ts tests/integration/domains/hazardous-events/routes/HazardousEventDetailRoute.test.ts`
      — all green, including both `ViewData`-rejection scenarios.
- [x] 6.6 Invariant 2 check: grep `app/components/RegularMenuBar.tsx` and `app/utils/paths.ts` for
      the literal string `he-preview`; verify zero matches.

## 7. End-to-end coverage

- [x] 7.1 Add Playwright E2E tests under `tests/e2e/hazardous-events/` covering: direct-URL
      navigation to the list and detail pages while authenticated, the list→detail link actually
      navigating, and a basic keyboard/interaction check (tab order, link activation via keyboard)
      verified against the _legacy_ `/hazardous-event` list page's own actual behavior — not
      React Aria's own default demo behavior (design.md Risk). Spec file:
      `tests/e2e/hazardous-events/he-preview.spec.ts`, 6 scenarios.

      Final result: 6 of 6 scenarios pass against real data. Along the way this surfaced and
      resolved three real, pre-existing issues outside this intent's own original file list (a
      schema-drift bug fixed by a separate corrective migration, a `DrizzleWorkflowRepository.findByEntity`
      gap fixed by explicit approval, and a confirmed keyboard-navigation divergence in `Table`
      now documented in design.md's Risks) plus an environmental port conflict — see final report
      for the full resolution history; proposal.md's "Scope addition" note covers the file-level
      change, design.md's Risks section covers the `Table` keyboard finding.

## 8. Quality gates

- [x] 8.1 Gate 1: `yarn vitest run` on every test file touched in Sections 2–7 — all green.
      28 files / 510 tests passing (re-verified after every Gate 5/6/8 fix).
- [x] 8.2 Gate 2: `yarn tsc` — zero TypeScript errors (re-verified after every fix).
- [x] 8.3 Gate 3: `npx prettier --check <changed files>` scoped to this change's own files only
      (including the OpenSpec `.md` artifacts) — all clean. See final report for detail.
- [x] 8.4 Gate 4: anti-pattern review against `.github/skills/anti-pattern-check/SKILL.md` — no
      findings.
- [x] 8.5 Gate 5: `solid-reviewer` agent on the changed use cases, DTOs, and presentation files.
      Two findings fixed directly (`parsePagination` signature, duplicated `hazardLabel` logic
      extracted); two deferred observations left as-is per the reviewer's own classification —
      see final report.
- [x] 8.6 Gate 6: documentation review by a fresh subagent, full-diff sweep — applied its
      recommended compactions, left genuinely non-trivial comments untouched — see final report.
- [x] 8.7 Gate 7: project-conventions review against `.github/copilot-instructions.md`. Two
      pre-confirmed design.md deviations, both compliant with the Notices precedent; one stale-doc
      finding out of scope — see final report.
- [x] 8.8 Gate 8: `.github/skills/code-review/SKILL.md` in full, via a fresh subagent. 10 findings,
      9 fixed (including a real pixel-parity bug in `Link` and the `@theme` token-count
      overstatement), 1 informational/no-fix — see final report.
- [x] 8.9 Gate 9 (required — this change touches `app/domains/*/presentation/` and `app/routes/`):
      visual/UX parity review against the real legacy HE list/detail pages, done for real via
      `yarn dev` + Playwright screenshots against real data, logged in as `test.admin@india.gov.in`.
      Two findings fixed (date format, UUID-fallback visibility); known/accepted divergences
      already named in design.md confirmed unchanged — see final report.
- [x] 8.10 Gate 10: manual second-opinion review (the built-in `/code-review` slash command is
      structurally unreachable in this environment — a same-named project skill shadows it, see
      final report), scoped to generic correctness/security concerns outside Gate 8's checklist.
      One finding (open-redirect in `resolveTenantId.server.ts`, inherited unchanged from Notices):
      fixed in both the HE and Notices copies, by explicit human decision, via TDD — see final
      report.

## 9. Test quality, regression, and archive

- [x] 9.1 Invoke `test-quality-auditor` scoped to `GetHazardousEventById.ts`, `UpdateHazardousEvent.ts`,
      and `HazardousEventDetailDto.ts`; resolve any real gap found. Two gaps found and fixed,
      independently re-verified by direct file read rather than taken on trust from an unverified
      relay — see final report for the provenance detail.
- [x] 9.2 Run `yarn test:run2` (full PGlite suite) — no new failures vs. the base-branch baseline
      (131 files / 1690 tests / 0 failures). Post-change runs show intermittent full-suite-load
      flakiness in 5 unrelated pre-existing files, confirmed not a regression (isolation re-runs
      all pass) — see final report.
- [x] 9.3 Update `_docs/refactoring-plan/deferred-items-register.md`: delete the `DEF-031` row
      (resolved, not annotated in place). Done — row removed.

## 10. Post-review fixes (human's own live-page comparison against real legacy data)

- [x] 10.1 Fix hazard-name resolution (was a raw-id fallback for virtually every real row) — new
      `ISpecificHazardTaxonomyRepository`/`DrizzleSpecificHazardTaxonomyRepository`, wired into
      `ListHazardousEventsUseCase`/`GetHazardousEventByIdUseCase`; `hazardLabel.ts` priority
      updated. Full TDD; design.md Decision 7 and proposal.md's "Scope addition #3" document the
      reversed decision — see final report.
- [x] 10.2 Add the detail page's "Hazard classification" (Type/Cluster/Hazard) subsection, reusing
      10.1's join. TDD; see final report.
- [x] 10.3 Add the detail page's Attachments and Current spatial observation sections (both already
      in the DTO, previously unrendered); fix the `chains_explanation` locale label to match legacy's
      own wording. TDD; see final report.
- [x] 10.4 Correct `dts_development`'s own under-seeded `workflow_instance` mock data (not a Phase M
      defect) so real/varying record statuses render instead of "Not yet determined" for nearly
      every row. One-off local `UPDATE`, not a migration; documented in design.md's Risks section
      for Phase M's own developer — see final report.
- [x] 10.5 Live-verify 10.1–10.4 against the real `dts_development` DB (resolved hazard names, real
      statuses, Hazard classification/Attachments/spatial-observation sections all rendering) —
      see final report.

## 11. Second round of post-review fixes (human's own further live-page re-validation)

- [x] 11.1 Fix `findAll`'s sort order to match legacy's own `hazardevent.ts:244`
      (`desc(updatedAt)`, was `asc(createdAt)`). TDD; see final report.
- [x] 11.2 Revert the list page's columns to legacy's own exact set (Hazard type / Record status —
      reusing the detail page's own `workflowStatusDisplay` rendering / Hazardous event UUID —
      linked/truncated like legacy's own `LangLink` / Created / Updated / Actions); drop only
      `hazardousEventStatus` from the list (`workflowStatus`/"Record status" stays on both the list
      and the detail page). TDD; design.md Decision 7 and proposal.md's "Scope addition #4" document
      the reversed decision, including a correction after an initial pass wrongly dropped
      `workflowStatus` too. Surfaced and fixed a real `TableCell` keyboard-trap bug from the second
      interactive column — design.md Risks has the full writeup — see final report.
- [x] 11.3 Bold every detail-page field label (`<strong>{label}:</strong>`), matching legacy's own
      `view_field.tsx`. TDD; see final report.
- [x] 11.4 Fix `parsePagination.ts`'s default `pageSize` to `50`, matching legacy's own
      `pagination/api.server.ts` `DEFAULT_PAGE_SIZE`. TDD; see final report.
- [x] 11.5 Add a minimal, `6a`-scoped page-size `<select>` (`PAGE_SIZE_OPTIONS = [10, 20, 30, 40,
    50]`, matching legacy's own `pagination/view.tsx`), not blocked on `6h`'s shared `Select`
      primitive. TDD; see final report.
- [x] 11.6 Live-verify 11.1–11.5 against the real `dts_development` DB, screenshot-compared against
      the real legacy list/detail pages — see final report.

## 12. Third round of post-review fixes (human's field-by-field re-validation against a real record)

- [x] 12.1 Rebuild `HazardousEventDetailPage.tsx` to the exact legacy field order and bold
      pattern captured directly from the real page; relabel/reposition `hazardousEventStatus` to
      "Hazardous event Status"; change Spatial footprint/Attachments from `<h3>` headings to bold
      field labels. TDD; design.md Decision 9 and proposal.md's "Scope addition #5" document the
      decision, including the `workflowStatus`-as-"Record status" judgment call — see final report.
- [x] 12.2 Add `IHazardousEventRepository.countAll`; `ListHazardousEventsUseCase.execute()` returns
      `{ items, totalCount }`. Updated the real repository and all eight existing test fakes. TDD;
      see final report.
- [x] 12.3 Add real numbered pagination to `HazardousEventListPage.tsx`, porting legacy's own
      `pagination/view.tsx` condensing algorithm exactly. TDD; see final report.
- [x] 12.4 Add the "Showing X of Y hazardous event(s)" summary line and the record-status color
      legend (reusing `workflowStatusDisplay`), matching legacy's own text/structure exactly. TDD;
      see final report.
- [x] 12.5 Live-verify 12.1–12.4 against the real `dts_development` DB, field-by-field
      screenshot-compared against the real legacy detail page for the same real record — see final
      report.

## 13. Fourth round of post-review fixes (human's live-DOM computed-style verification)

- [x] 13.1 Render `-` for every empty string field, matching legacy. TDD; see final report.
- [x] 13.2 Render `hazardousEventStatus`'s capitalized label (Forecasted/Ongoing/Passed), not the
      raw enum string. TDD; see final report.
- [x] 13.3 Wrap Start date/End date in legacy's own `mg-grid mg-grid__col-3` utility class (the
      real source of the gap between them). TDD; see final report.
- [x] 13.4 Unify both in-content headings on a real heading treatment (deliberate deviation from
      legacy's own inconsistent bare-h2/bare-h5 markup, reversing an intermediate exact-match
      attempt); add spacing between the breadcrumb link and the first heading. TDD; design.md
      Decision 10 and proposal.md's "Scope addition #6" document the decision — see final report.
- [x] 13.5 Live-verify 13.1–13.4 against the real `dts_development` DB via computed-style
      inspection (not a screenshot glance) — see final report.

## 14. Fifth round of post-review fixes (human's own UX/implementation-style corrections)

- [x] 14.1 Switch the unified heading class from `dts-heading-3` to `dts-heading-5` (too large by
      eye). TDD; see final report.
- [x] 14.2 Replace inline `style={{...}}` spacing with Tailwind arbitrary-value utility classes
      (`mt-[0.86rem]`/`mb-[0.86rem]`), reusing `dts-heading-5`'s own confirmed scale. TDD; see
      final report.
- [x] 14.3 Add spacing between three logical field groups (heading+ID / classification block /
      everything else) — new structural decision, no legacy precedent. TDD; design.md Decision 10
      and proposal.md's "Scope addition #7" document the decision — see final report.
- [x] 14.4 Live-verify 14.1–14.3 via computed-style inspection (heading font-size/class, all three
      group gaps' actual pixel measurements) — see final report.

- [x] 9.4 Run `opsx:archive` on this branch before raising the PR.
