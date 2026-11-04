## 1. Route scaffolding: permission checks and tenant resolution

- [x] 1.1 RED: write `tests/integration/domains/hazardous-events/routes/HazardousEventNewRoute.test.ts`
      (`import "../../../db/setup"`), modeled on `6a`'s `HazardousEventListRoute.test.ts` pattern,
      covering: a session without `EditData` is rejected with a 403 `FORBIDDEN` `ErrorResponse` and
      `CreateHazardousEventUseCase.execute` is NOT called; no-tenant-resolvable redirects to
      `/${lang}/user/select-instance`. Verify the test file fails to run (route module doesn't exist
      yet).
- [x] 1.2 RED: write `tests/integration/domains/hazardous-events/routes/HazardousEventEditRoute.test.ts`,
      the same two scenarios against `edit.$id.tsx`, plus the status-aware gate: `data-viewer` blocked
      regardless of status; every other role blocked when `workflowStatus` is
      `SUBMITTED`/`APPROVED`/`PUBLISHED`; `DRAFT`/`REVISION_REQUESTED`/`null` editable. Verify the
      test file fails to run.
- [x] 1.3 GREEN: implement `new.tsx`'s and `edit.$id.tsx`'s permission checks (`requireUser()` +
      `roleHasPermission(role, "EditData")`, HE-local `throwHazardousEventLoaderError` from `6a`'s
      Section 4) and tenant resolution (`resolveTenantId`, also from `6a`). `edit.$id.tsx` additionally
      implements the status-aware gate (design.md Decision 2) after the flat `EditData` check. No
      use-case composition or form rendering yet. Verify 1.1/1.2 pass.
- [x] 1.4 Verify: `yarn vitest run tests/integration/domains/hazardous-events/routes/HazardousEventNewRoute.test.ts tests/integration/domains/hazardous-events/routes/HazardousEventEditRoute.test.ts`
      — green for the scenarios written so far.
- [x] 1.5 Invariant 2 check: grep `app/components/RegularMenuBar.tsx` and `app/utils/paths.ts` for the
      literal strings `he-preview` (new/edit/picker segments); verify no nav-link reference was added.

## 2. CreateHazardousEventUseCase: spatialObservation and the cause-order guard

- [x] 2.1 RED: extend `app/domains/hazardous-events/application/use-cases/CreateHazardousEvent.test.ts`
      with the three `create-hazardous-event` spec scenarios for `spatialObservation` (records inside
      the same transaction; no call when absent; a failure rolls back the whole transaction including
      the already-inserted event). Verify they fail.
- [x] 2.2 GREEN: add the optional `spatialObservation` field to `CreateHazardousEventCommand`; inside
      the existing `transactionRunner.run()` block, conditionally call
      `RecordSpatialObservationUseCase.execute({ ...command.spatialObservation, tenantId,
      hazardousEventId: saved.id, tx })`, mirroring `UpdateHazardousEvent.ts:272-281`. Verify 2.1
      passes.
- [x] 2.3 RED: extend the same test file with the `assertCauseStartsNoLaterThanEffect` scenarios (a
      later-starting cause is rejected before any write; an on-time-or-earlier cause passes; a
      malformed `startDate` on either side skips the check). Verify they fail.
- [x] 2.4 GREEN: call `assertCauseStartsNoLaterThanEffect(cause.startDate, newEvent.startDate)`
      immediately after the existing `assertCausalLinkDoesNotCreateCycle` check, only when `causeId`
      is present. Verify 2.3 passes.
- [x] 2.5 Verify: `yarn vitest run app/domains/hazardous-events/application/use-cases/CreateHazardousEvent.test.ts`
      — all green, including every pre-existing scenario (no regression).
- [x] 2.6 Sync `openspec/changes/ca-he-route-adapter-write/specs/create-hazardous-event/spec.md`'s two
      new requirements against the implementation at archive time (standard OpenSpec sync step).

## 3. WorkflowInstance: resetToDraft, directValidate, directPublish, and the REQUIRED_SET relaxation

- [x] 3.1 RED: extend `app/domains/validation-workflow/domain/WorkflowInstance.test.ts` with
      `resetToDraft`'s scenarios (callable from every status including `DRAFT` itself; clears all
      four attribution pairs; does not mutate the original). Verify they fail (method doesn't exist).
- [x] 3.2 GREEN: implement `resetToDraft({ userId, now })` — see design.md Decision 5/6 for the exact
      method body (no `allowedFrom` restriction; patches `status: 'DRAFT'` and all four pairs `null`).
      Verify 3.1 passes.
- [x] 3.3 RED: extend the test file with `directValidate`'s scenarios (happy path from `DRAFT` and
      from `REVISION_REQUESTED` — the latter preserving carried-over `submittedByUserId`/`At`;
      `ConflictError` from `SUBMITTED`/`APPROVED`/`REJECTED`/`PUBLISHED`). Verify they fail.
- [x] 3.4 GREEN: implement `directValidate({ userId, now })` per design.md's exact method body. Verify
      3.3 passes.
- [x] 3.5 RED: extend the test file with `directPublish`'s equivalent scenarios (happy path from
      `DRAFT` and `REVISION_REQUESTED`; `ConflictError` from the other four statuses). Verify they
      fail.
- [x] 3.6 GREEN: implement `directPublish({ userId, now })` per design.md's exact method body. Verify
      3.5 passes.
- [x] 3.7 RED: extend the test file with the shared cross-cutting scenarios for all three new methods
      (stamps `updatedAt` from `now`; rejects an invalid `now` with `ValidationError` before the status
      guard; `ConflictError.context.attemptedTransition` names the method; pure/non-mutating). Verify
      they fail where not already covered by 3.1/3.3/3.5.
- [x] 3.8 GREEN: fill in any remaining shared-scenario gaps (most of this falls out of 3.2/3.4/3.6's
      implementation via the existing private `transition()` helper, which already stamps
      `updatedAt`/validates `now`/throws `ConflictError` with context — confirm this at implementation
      time rather than re-deriving it). Verify 3.7 passes.
- [x] 3.9 RED: add the `WorkflowInstance.create()` reconstitution scenarios from the
      `workflow-instance-entity` spec delta — `APPROVED` with only `validatedByUserId`/`At` set no
      longer throws; `APPROVED` with the normal flow's fuller shape still doesn't throw; `PUBLISHED`
      with only `validated`+`published` pairs set no longer throws; `PUBLISHED` missing `validated`
      still throws (the narrowed requirement is still enforced). Verify the "no longer throws"
      scenarios fail against the current `REQUIRED_SET` table.
- [x] 3.10 GREEN: apply design.md Decision 5/6's exact `REQUIRED_SET` table change — `APPROVED:
      ["submitted", "approved"]` → `APPROVED: []`; `PUBLISHED: ["submitted", "validated", "approved",
      "published"]` → `PUBLISHED: ["validated", "published"]`. Leave `REQUIRED_NULL` and every other
      status's `REQUIRED_SET` entry unchanged. Verify 3.9 passes.
- [x] 3.11 Verify: `yarn vitest run app/domains/validation-workflow/domain/WorkflowInstance.test.ts`
      — all green, including every pre-existing scenario (the relaxation must not break any existing
      `APPROVED`/`PUBLISHED`-shape test).
- [x] 3.12 Run `yarn tsc` and confirm zero new errors from the three new public methods and the
      `REQUIRED_SET` table edit.

## 4. ProcessWorkflowActionUseCase: three new action variants, mapped and notification-silent

- [x] 4.1 RED: extend `app/domains/validation-workflow/application/use-cases/ProcessWorkflowAction.test.ts`
      with the `process-workflow-action` spec delta's scenarios: `submit-draft` calls `resetToDraft`
      from any status; `direct-validate` calls `directValidate` from `DRAFT`; `direct-publish` calls
      `directPublish` from `REVISION_REQUESTED`; `direct-validate` from a disallowed status propagates
      `ConflictError`. Verify they fail (new action members don't exist on the command union yet).
- [x] 4.2 GREEN: add `'submit-draft' | 'direct-validate' | 'direct-publish'` to
      `ProcessWorkflowActionCommand`'s union (base fields only, no extra payload); extend
      `applyTransition()`'s switch with the three new cases, calling the matching new entity method.
      Verify 4.1 passes.
- [x] 4.3 RED: extend the test file with the no-notify scenarios for all three new actions, plus the
      "still logs one INFO line" scenario. Verify they fail (the new actions currently fall through to
      whatever default `buildNotification()` produces, or fail the exhaustiveness `never` check at
      compile time — confirm which at implementation time).
- [x] 4.4 GREEN: in `execute()`, skip the `notificationPort.notify()` call entirely for these three
      actions (an early return/guard before the existing notify call, not a `buildNotification()`
      branch that returns an empty-ish payload — the requirement is "never call `notify`", not "call
      it with nothing"). Verify 4.3 passes.
- [x] 4.5 RED: extend `app/domains/validation-workflow/infrastructure/EmailNotificationAdapter.test.ts`
      to cover the three new `WorkflowActionNotification` union members reaching the adapter's own
      `notify()` switch with a no-op case each (needed only if `WorkflowActionNotification`'s type
      itself grows a corresponding variant for type-checking purposes — confirm against 4.4's actual
      shape at implementation time; if `notify()` is never called for these three actions per 4.4, this
      task may reduce to a compile-time exhaustiveness check only, not a runtime scenario — verify
      which applies before writing a test that can't actually execute).
- [x] 4.6 GREEN: resolve whatever 4.5 found — either a new no-op `case` in
      `EmailNotificationAdapter.server.ts`'s switch (if the union gained new members) or confirmation
      that no change is needed there (if `notify()` structurally can't be called with these actions).
      Verify `yarn tsc` is clean either way.
- [x] 4.7 Verify: `yarn vitest run app/domains/validation-workflow/application/use-cases/ProcessWorkflowAction.test.ts app/domains/validation-workflow/infrastructure/EmailNotificationAdapter.test.ts`
      — all green, including every pre-existing scenario.

## 5. IValidatorCandidateRepository: new port and Drizzle adapter

- [x] 5.1 RED: write `app/domains/validation-workflow/application/ports/IValidatorCandidateRepository.test.ts`
      with a fake implementation exercising the `validator-candidate-repository-port` spec's four
      scenarios (tenant-scoped exclusion; no cross-tenant leakage; admin fallback with exclusion; empty
      result when both lists are empty). This is a port/type test (same style as
      `IWorkflowRepository.test.ts`) — verify it fails only insofar as the type doesn't exist yet.
- [x] 5.2 GREEN: define `IValidatorCandidateRepository`/`ValidatorCandidate` per design.md Decision 8's
      exact shape. Verify 5.1 passes against a fake.
- [x] 5.3 RED: write `tests/integration/domains/validation-workflow/DrizzleValidatorCandidateRepository.test.ts`
      (`import "../../db/setup"`), seeding tenant-scoped validator-role and admin-role users, covering
      the same four scenarios against the real Drizzle adapter + PGlite. Verify it fails (adapter
      doesn't exist).
- [x] 5.4 GREEN: implement `DrizzleValidatorCandidateRepository.server.ts`, querying the same
      underlying tables `getUserCountryAccountsWithValidatorRole`/`getUserCountryAccountsWithAdminRole`
      already query, scoped by `tenantId`, reproducing the exclusion/fallback logic exactly. Wire it
      into `ValidationWorkflowModule.server.ts`. Verify 5.3 passes.
- [x] 5.5 Verify: `yarn vitest run app/domains/validation-workflow/application/ports/IValidatorCandidateRepository.test.ts tests/integration/domains/validation-workflow/DrizzleValidatorCandidateRepository.test.ts`

## 6. Create route: full action composition, role-gating, empty-validator rejection, partial-success response

- [x] 6.1 RED: extend `HazardousEventNewRoute.test.ts` with: a plain draft submission (no `tempAction`)
      calls `CreateHazardousEventUseCase.execute` exactly once and does NOT call
      `ProcessWorkflowActionUseCase.execute`. Verify it fails.
- [x] 6.2 GREEN: implement the create `action`'s form-data parsing into `CreateHazardousEventCommand`
      (now including `spatialObservation` when the submitted spatial-footprint data is present) and
      the `CreateHazardousEventUseCase.execute` call. Verify 6.1 passes.
- [x] 6.3 RED: extend the test file with: `tempAction: "submit-validation"` + non-empty
      `tempValidatorUserIds` composes both use cases in order, with `recordDisplayName`/`recordDate`
      derived per design.md Decision 9 (`recordDate` = `startDate` + `" to " + endDate` when they
      differ; `recordDisplayName` = `specificHazardName || hazardClusterName || hazardTypeName` via
      `ISpecificHazardTaxonomyRepository.findNamesByIds()`); `tempAction` mapping to `direct-publish`
      by an admin session composes both use cases with `action: "direct-publish"`. Verify both fail.
- [x] 6.4 GREEN: implement the conditional `ProcessWorkflowActionUseCase.execute` call for all four
      mapped actions (`submit-draft`, `direct-validate`, `direct-publish`, `submit-validation`),
      including the `recordDisplayName`/`recordDate` derivation. Verify 6.3 passes.
- [x] 6.5 RED: extend the test file with the server-side role-gating scenario (a non-admin session
      submitting `tempAction` mapping to `direct-validate`/`direct-publish` gets a 403, and
      `ProcessWorkflowActionUseCase.execute` is never called) and the empty-validator-list scenario
      (`submit-validation` with an empty `tempValidatorUserIds` is rejected with a validation error,
      `ProcessWorkflowActionUseCase.execute` never called, but `CreateHazardousEventUseCase.execute`
      still is). Verify both fail.
- [x] 6.6 GREEN: implement the `role === "admin"` check before calling
      `ProcessWorkflowActionUseCase.execute` with `direct-validate`/`direct-publish`, and the
      `validatorUserIds.length > 0` check before calling it with `submit-validation`. Verify 6.5
      passes.
- [x] 6.6a RED→GREEN (follow-up round, write-then-reject gap fixed — design.md Risks, resolved):
      strengthened 6.5's two scenarios to assert `CreateHazardousEventUseCase.execute` is NOT called
      (previously asserted it still ran) and that no row is persisted (`repository.countAll`
      unchanged); extracted the shared `requireWorkflowActionAuthorized` guard and call it at the top
      of the create action, before `CreateHazardousEventUseCase.execute`. Verified RED against the
      pre-fix route (temporarily reverted, confirmed 403/422 still thrown but with the use case
      called), then GREEN after the fix.
- [x] 6.7 RED: extend the test file with the partial-success scenario (`CreateHazardousEventUseCase.execute`
      resolves successfully, the follow-up `ProcessWorkflowActionUseCase.execute` is stubbed to
      reject; assert the action returns a partial-success response, not a 500, and
      `GetHazardousEventByIdUseCase.execute` for the new event's id still resolves with
      `workflowStatus: "DRAFT"`). Verify it fails.
- [x] 6.8 GREEN: implement the partial-success response path per design.md Decision 3. Verify 6.7
      passes.
- [x] 6.9 Verify: `yarn vitest run tests/integration/domains/hazardous-events/routes/HazardousEventNewRoute.test.ts`
      — all scenarios from Sections 1 and 6 green.

## 7. Edit route: full action composition, status-aware gate, role-gating, partial-success response

- [x] 7.1 RED: extend `HazardousEventEditRoute.test.ts` with the plain-update-only scenario (no
      `tempAction` calls only `UpdateHazardousEventUseCase.execute`). Verify it fails.
- [x] 7.2 GREEN: implement the edit `action`'s form-data parsing into `UpdateHazardousEventCommand`
      (including `spatialObservation`, already supported since Phase 4/5) and the
      `UpdateHazardousEventUseCase.execute` call. Verify 7.1 passes.
- [x] 7.3 RED: extend the test file with the four composition scenarios mirroring Section 6's create
      scenarios (`submit-draft`, `direct-validate`, `direct-publish` admin-only, `submit-validation`
      with `recordDisplayName`/`recordDate` derivation) — each against an existing event rather than a
      freshly-created one, and each exercising a `DRAFT`/`REVISION_REQUESTED` starting status (the
      only statuses the status-aware edit gate from Section 1 ever lets this action reach in the first
      place). Verify they fail.
- [x] 7.4 GREEN: implement the same conditional `ProcessWorkflowActionUseCase.execute` composition as
      Section 6's create action, parameterized by the existing event's id. Verify 7.3 passes.
- [x] 7.5 RED: extend the test file with the edit-specific role-gating and empty-validator-list
      scenarios (same shape as 6.5), and the partial-success scenario (update succeeds, the follow-up
      transition fails; assert partial-success response and that `workflowStatus` remains whatever it
      was before this submission). Verify they fail.
- [x] 7.6 GREEN: implement the matching checks/response path, reusing the same logic Section 6 built
      where possible (factor into a shared helper if the duplication is more than trivial — SOLID
      review in Section 10 will flag it either way). Verify 7.5 passes.
- [x] 7.6a RED→GREEN (follow-up round, same write-then-reject gap and process as 6.6a): strengthened
      7.5's role-gating/empty-validator scenarios to assert `UpdateHazardousEventUseCase.execute` is
      NOT called and the event's content/`updatedAt` are unchanged; the edit action now calls the
      same shared `requireWorkflowActionAuthorized` guard before it.
- [x] 7.7 Verify: `yarn vitest run tests/integration/domains/hazardous-events/routes/HazardousEventEditRoute.test.ts`
      — all scenarios from Sections 1 and 7 green.

## 8. Parent-picker route

- [x] 8.1 RED: write `tests/integration/domains/hazardous-events/routes/HazardousEventPickerRoute.test.ts`
      covering: tenant-scoped results (same `resolveTenantId` rule); `EditData`-gated (same as
      new.tsx/edit.$id.tsx — the picker is only reachable from the create/edit form). Verify it fails.
- [x] 8.2 GREEN: implement `app/routes/$lang+/_authenticated+/he-preview+/picker.tsx`'s `loader`,
      reusing `ListHazardousEventsUseCase` (same as `6a`'s list route) with the tenant/permission
      checks from Section 1. Verify 8.1 passes.
- [x] 8.3 Build the picker page component: reuses `6a`/`6h`'s list/filter design-system components,
      adds a "Select" action column per row. Selecting a row calls `window.opener.postMessage` with
      the selected event's data, then `window.close()` — same mechanism as legacy's `picker.tsx`.
      Write a presentation-layer test asserting both calls fire on select.
- [x] 8.4 Wire the create/edit form's `parent` field (Section 9.1) to open this route (`window.open`)
      instead of legacy's `/hazardous-event/picker`, and to listen for the `postMessage` the same way
      legacy's `HazardousEventForm` does (`hazardeventform.tsx` lines 422-432).
- [x] 8.5 Verify: `yarn vitest run tests/integration/domains/hazardous-events/routes/HazardousEventPickerRoute.test.ts`

## 9. Create/edit form UI (design.md Decision 9's ground-truth checklist)

- [x] 9.1 Build the `parent` field: a link to the linked parent event (reusing `6a`'s detail-page link
      styling) plus "Change"/"Unset" controls, wired to Section 8's new picker route per 8.4. Verify
      against design.md Decision 9's table row 1 (no `required` marker, hidden `parent` input carries
      the selected id).
- [x] 9.2 Build the `hipHazardId`/`hipClusterId`/`hipTypeId` hazard-classification picker group: a
      cascading hazard/cluster/type selector, label literally `"Hazard classification *"` (hardcoded
      suffix). Verify the field is genuinely required (native `required`-equivalent) and that
      `hipClusterId`/`hipTypeId` render no separate label/row of their own.
- [x] 9.3 Build the read-only approval-status display field (disabled display + hidden input carrying
      the real value) — no label suffix, not required, not user-editable.
- [x] 9.4 Build the plain-text/textarea field group: `nationalSpecification`, `description`,
      `chainsExplanation` (label exactly "Composite event - chains explanation"), `magnitude`,
      `dataSource` — none required, each its own row per design.md Decision 9's table (rows 6, 9, 10,
      11, 16).
- [x] 9.5 Build the `startDate`/`endDate` row: both required, sharing one row, both using the
      flexible-precision date control (confirm the exact precision-selection UI against
      `app/frontend/form/input.tsx`'s own `date_optional_precision` branch at implementation time).
- [x] 9.6 ~~Build the `spatialFootprint` section: map + division picker, starts its own new row, no
      required marker. Wire its value into the create/edit action's `spatialObservation` field
      (Sections 2/6/7).~~ **Deferred — tracked as `DEF-057`** (a static placeholder shipped instead;
      the real map/division-tree picker is an explicit immediate follow-up intent, not part of `6c`'s
      shipped scope — see design.md Decision 9's "Conditional visibility" correction and `DEF-057`).
- [x] 9.7 ~~Build the `attachments` section: file upload, starts its own new row, no required
      marker.~~ **Deferred — tracked as `DEF-054`** (the reused `AttachmentsFormView` widget's output
      shape doesn't match the real table's columns, so every attachment is silently dropped on save —
      a real data-loss bug, not a missing-feature gap; fixing it is an explicit immediate follow-up
      intent, not part of `6c`'s shipped scope — see `DEF-054`).
- [x] 9.8 Build the `recordOriginator` (text, required, shares a row) and `hazardousEventStatus` (enum
      select — `forecasted`/`ongoing`/`passed`, capitalized labels, starts a new row) pair, per
      design.md Decision 9's table rows 14-15.
- [x] 9.9 **Client-side validation layer**: every field marked required above MUST render a real,
      native `required`-equivalent state, and the form's submit path MUST block submission on an
      invalid required field client-side (native validation indicator, not a custom banner) before
      reaching the server. Write a Playwright E2E scenario asserting a submission with a required
      field empty does NOT navigate away and DOES show a native validation indicator.
- [x] 9.10 **Server-side error-display layer**: implement a per-field inline error renderer — one
      visible error message per field, positioned directly below that field's own control, driven by
      the action's returned per-field error map. Write a PGlite test asserting the action's error
      response shape carries a per-field breakdown, and a presentation-layer test asserting each field
      built in 9.2-9.8 renders its own error list when its key is present in that map.
- [x] 9.11 Build the "Save or submit" modal: one option card per action — `submit-draft` (every role,
      default-selected), the admin-only direct-validate/direct-publish card (a nested "Publish to
      UNDRR instance" checkbox switches which of the two is sent), and `submit-validation`
      (`data-validator`/`data-collector`/`admin`, with a required validator-selection control
      populated from Section 5's new port, submit disabled until at least one candidate is selected).
      Write a presentation-layer test asserting card visibility per role matches design.md Decision
      9's table exactly.
- [x] 9.12 Build the discard-confirmation modal: "Save as draft" (maps to `submit-draft`) / "Discard
      work and exit" (navigates away without saving), triggered by a separate "Discard" button.
- [x] 9.13 **Styling/layout parity pass, its own task.** Using `yarn dev` and a real rendered
      comparison against the live legacy `new.tsx`/`edit.$id.tsx` pages: verify row/column grouping
      matches design.md Decision 9's table exactly, verify the required-marker convention (literal
      `" *"` suffix), and verify no unintended section heading was introduced.
- [x] 9.14 Add Playwright E2E tests under `tests/e2e/hazardous-events/` covering the full create and
      edit submission flows: a plain draft save, a `submit-validation` save with a validator selected,
      an admin direct-publish save, and the parent-picker flow end to end (open picker, select,
      confirm the parent field updates) — each verified against real rendered output.
- [x] 9.15 (Found via a second, independent live-browser comparison — 9.13's own Gate 9 pass missed
      these.) Build `HazardousEventFlexibleDateField`, porting legacy's `date_optional_precision`
      control (design.md Decision 9 rows 7/8) in full: the three-option "Format" selector, the
      conditional date/year/month value control(s), the hidden input, and native `pattern` validation
      for the year inputs. TDD: `flexiblePrecisionDate.test.ts` (pure parse/format round-trip) and
      `HazardousEventFlexibleDateField.dom.test.tsx`.
- [x] 9.16 Port legacy's hazard-name filter box and its non-strict-cascade derivation (design.md
      Decision 9 rows 2-4) into `HazardousEventHazardPicker`: the filter input, `filterHazardTaxonomy`
      (ported from `hazardpicker.tsx` lines 95-120), the never-disabled cluster/hazard selects, the
      hazard-picks-back-fill-cluster-and-type behavior, and the single-surviving-type
      no-placeholder quirk. TDD: `filterHazardTaxonomy.test.ts` (pure) and
      `HazardousEventHazardPicker.dom.test.tsx`.
- [x] 9.17 Add the three PrimeIcons circular badges to `HazardousEventSaveSubmitModal`'s option cards
      (design.md Decision 9's "Interaction" section): `pi-save`/`pi-shield`/`pi-send`, radio-then-badge
      -then-text order. TDD: extended `HazardousEventSaveSubmitModal.dom.test.tsx`.
- [x] 9.18 Implement Decision 14's `hazardousEventStatus` default (`"ongoing"` on create, never
      overriding an existing edit value) and add i18n keys for 9.15-9.17 to both `locales/en` and
      `locales/fr/hazardous-events.json`. TDD: `HazardousEventFormPage.dom.test.tsx`. Re-ran
      `tests/e2e/hazardous-events/he-preview-form.spec.ts` in full after 9.15/9.16 (both change the
      date fields and the type→cluster→hazard walk that spec exercises) — passed unchanged, no
      selector updates needed.

## 9a. List page: "Add new event" button and top-of-page count header (design.md Decision 15 — found live, 2026-11-02; count question resolved with the human — build both, nothing blocked)

**Placement correctness, load-bearing** (full rationale: design.md Decision 15's "Decision, button
only" paragraph — the picker-popup bug this placement avoids): the new link is built as its own
component (`HazardousEventListActions`), rendered only by the main list route (`_index.tsx`) — never
inside `HazardousEventListPage` itself, which the `EditData`-gated picker route (`picker.tsx` →
`HazardousEventPickerPage`, Decision 13) also reuses.

- [x] 9a.1 RED: write `app/domains/hazardous-events/presentation/web/HazardousEventListActions.test.ts`
      with scenarios: (a) `role: "data-collector"` (or `"data-validator"`/`"admin"`) renders an
      "Add new event" link whose `href` resolves to `/en/he-preview/new` (via `ctx.url`); (b)
      `role: "data-viewer"` renders no such link; (c) `role: null`/`undefined` renders no such link.
      Verify all three fail (the component doesn't exist yet).
- [x] 9a.2 GREEN: create `HazardousEventListActions.tsx` per design.md Decision 15 exactly — a
      `<div className="dts-page-intro"><div className="dts-additional-actions
      width-override-data-collection" role="navigation" aria-label={t("list.resource_actions")}>`
      wrapping a `RouterLink` to `ctx.url("/he-preview/new")` with `className="mg-button
      mg-button--small mg-button-primary"`, text from `t("list.add_new_event")`, rendered only when
      `roleHasPermission(role, "EditData")` is true. Verify 9a.1 passes.
- [x] 9a.2a Wire `HazardousEventListActions` into `app/routes/$lang+/_authenticated+/he-preview+/_index.tsx`'s
      default export only, as a sibling immediately before `<HazardousEventListPage data={data} />`,
      passing `data.role`. Do NOT modify `HazardousEventListPage.tsx` itself, and do NOT wire it into
      `picker.tsx`/`HazardousEventPickerPage.tsx`.
- [x] 9a.2b RED→GREEN: write a negative-regression test on the picker side confirming the fix actually
      holds — extend (or add, matching existing picker test conventions) a test asserting
      `HazardousEventPickerRoute`'s rendered output contains no link to `/en/he-preview/new` even when
      the resolved `role` is `"admin"`. This must be written and failing *if* the link were (wrongly)
      added inside `HazardousEventListPage`, then pass once 9a.2/9a.2a's actual placement is in. If
      writing it against the real route rendering path is impractical in this tier, assert instead,
      directly on `HazardousEventPickerPage.tsx`'s source/render tree, that `HazardousEventListActions`
      is never imported/rendered there.
- [x] 9a.3 Add `list.add_new_event` ("Add new event") and `list.resource_actions` ("Resource actions")
      keys to `locales/en/hazardous-events.json` and their French equivalents to
      `locales/fr/hazardous-events.json`.
- [x] 9a.4 Verify: `yarn vitest run app/domains/hazardous-events/presentation/web/HazardousEventListActions.test.ts`
      — all scenarios green. Also re-run the existing
      `tests/integration/domains/hazardous-events/routes/HazardousEventPickerRoute.test.ts` and
      `HazardousEventListPage.test.tsx` suites — no regression (neither file is modified by this
      section, so this is a confirmation, not expected to need changes).
- [x] 9a.4a Sync `openspec/changes/ca-he-route-adapter-write/specs/hazardous-event-list-filters/spec.md`'s
      new "Add new event" requirement against the implementation at archive time (standard OpenSpec
      sync step, same as task 2.6).
**Top-of-page count header — resolved with the human, build now.** Decision: add a second block
replicating legacy's `HazardEventHeader` exactly, keeping `6h`'s existing `list.showing_of_total`
line below the filter bar unchanged (design.md Decision 15). The two blocks answer different
questions (always-unfiltered total vs. filtered-of-unfiltered) and are not a duplicate. Reuses the
loader's existing `unfilteredTotalCount` value — no second query against
`ListHazardousEventsUseCase`.

- [x] 9a.5 RED: write `app/domains/hazardous-events/presentation/web/HazardousEventListHeader.test.ts`
      with scenarios: (a) given `totalCount: 42`/`instanceName: "Example Country Instance"`, the
      rendered output contains "42 hazardous event(s) in Example Country Instance"; (b) the count
      renders unconditionally regardless of role (including `role: null`/no role prop at all, since
      this component takes no role prop). Verify both fail (the component doesn't exist yet).
- [x] 9a.6 GREEN: create `HazardousEventListHeader.tsx` per design.md Decision 15 exactly — a
      `<div className="dts-page-intro"><h2 className="mg-u-margin-bottom--sm">` rendering
      `t("list.count_in_instance", { count: totalCount, instance: instanceName })`. No role gate.
      Verify 9a.5 passes.
- [x] 9a.7 RED→GREEN: extend `HazardousEventNewRoute`/`HazardousEventListRoute`'s existing loader
      test (`tests/integration/domains/hazardous-events/routes/HazardousEventListRoute.test.ts`) with
      a scenario asserting the loader calls `getCountrySettingsFromSession(request)` and returns
      `instanceName: settings.websiteName` when set, and `instanceName: "DELTA Resilience"` when
      `settings`/`settings.websiteName` is absent. Verify RED (the loader doesn't call it yet), then
      implement the one-line addition to `_index.tsx`'s loader and verify GREEN.
- [x] 9a.8 Wire `HazardousEventListHeader` into `app/routes/$lang+/_authenticated+/he-preview+/_index.tsx`'s
      default export, as the first child — before `HazardousEventListActions` (9a.2a) and
      `HazardousEventListPage` — passing `totalCount={data.unfilteredTotalCount}` and
      `instanceName={data.instanceName}`. Do NOT wire it into `picker.tsx`.
- [x] 9a.9 Add `list.count_in_instance` ("{{count}} hazardous event(s) in {{instance}}") to
      `locales/en/hazardous-events.json` and its French equivalent to
      `locales/fr/hazardous-events.json`.
- [x] 9a.10 Verify: `yarn vitest run app/domains/hazardous-events/presentation/web/HazardousEventListHeader.test.ts tests/integration/domains/hazardous-events/routes/HazardousEventListRoute.test.ts`
      — all green, including every pre-existing scenario. Also confirm (manually inspecting
      `picker.tsx`, no test regression expected since it's untouched) that `HazardousEventListHeader`
      is not imported there.
- [x] 9a.11 Sync `openspec/changes/ca-he-route-adapter-write/specs/hazardous-event-list-filters/spec.md`'s
      new "top-of-page count header" requirement against the implementation at archive time (same
      sync step as 9a.4a/2.6).

## 9b. Detail page: "Edit" and "Add hazardous event caused by this event" links (design.md Decision 16 — found live, 2026-11-02)

- [x] 9b.1 RED: extend `tests/integration/domains/hazardous-events/routes/HazardousEventDetailRoute.test.ts`
      (create if it does not already exist, modeled on `6a`'s own detail-route test) with a scenario
      asserting the loader's return value includes `role` (currently discarded —
      `app/routes/$lang+/_authenticated+/he-preview+/$id.tsx` calls `await
      requireViewDataPermission({ request })` and ignores the result). Verify it fails.

      File already existed (created by `6a`). Added a scenario using role `"data-collector"`
      (not `makeArgs`'s own `"data-viewer"` default) so a hardcoded/wrong-role passthrough
      couldn't accidentally satisfy the assertion. Confirmed RED.
- [x] 9b.2 GREEN: capture the return value (`const role = await requireViewDataPermission({ request
      });`) and include `role` in the loader's return value alongside the detail DTO. Verify 9b.1
      passes.
- [x] 9b.3 RED: write `app/domains/hazardous-events/presentation/web/HazardousEventDetailPage.test.ts`
      (extend if a presentation-layer test for this component already exists) with the
      `hazardous-event-route-adapter` spec delta's scenarios: a role with `EditData` sees the Edit
      link (`he-preview/edit/{id}`) regardless of `workflowStatus`; `data-viewer` never sees it;
      `role: null` never sees it; the same three scenarios for the add-cause link
      (`he-preview/new?parent={id}`). Verify all fail (the component takes no `role` prop yet, and
      neither link exists).

      File already existed as `.test.tsx` (RTL `renderToString`, not `.ts`) — extended it directly.
      Confirmed RED: 3 new assertions failed for the right reason; the two "never shows" negative
      scenarios passed trivially (neither link existed yet).
- [x] 9b.4 GREEN: add a `role` prop to `HazardousEventDetailPage`; render both links inside a
      right-aligned block placed after the existing back-link and before the `<h5>` heading (design.md
      Decision 16's exact placement/order), each gated by `roleHasPermission(role, "EditData")`. Wire
      `$id.tsx`'s default export to pass `data.role` through. Add `detail.edit`/`detail.add_cause`
      keys to `locales/en/hazardous-events.json` and `locales/fr/hazardous-events.json`. Verify 9b.3
      passes.

      **Superseded by the correction below** — the Edit link's gate is no longer role-only; see
      9b.5's resolution.
- [x] 9b.5 Verify: `yarn vitest run tests/integration/domains/hazardous-events/routes/HazardousEventDetailRoute.test.ts app/domains/hazardous-events/presentation/web/HazardousEventDetailPage.test.ts`
      — all green, including every pre-existing scenario.

      **RESOLVED — Gate 9 found Decision 16's Edit-link gating claim was wrong (cited the wrong
      legacy file, root cause in design.md Decision 16's own "Correction" paragraph); coordinator
      approved option (a): fix the citation and make the Edit link status-aware, reusing Decision
      2's existing predicate.**

      **Fix, TDD'd**: extracted the shared boolean logic out of
      `requireStatusAwareEditPermission.server.ts` into a new isomorphic
      `app/domains/hazardous-events/presentation/web/isStatusAwareEditBlocked.ts`
      (`isStatusAwareEditBlocked(role, workflowStatus): boolean`) — not `.server.ts`-suffixed, so
      `HazardousEventDetailPage.tsx` can call it too. `requireStatusAwareEditPermission` now just
      calls it and throws; its own existing 7 tests re-ran unmodified, all green (pure refactor,
      no behavior change there). New `isStatusAwareEditBlocked.test.ts` (8 scenarios). RED: added
      `it.each(["SUBMITTED","APPROVED","PUBLISHED"])("hides the Edit link for a locked status...")`
      to `HazardousEventDetailPage.test.tsx`, confirmed it failed against the pre-fix code (3
      failures, the other 32 pre-existing/new scenarios unaffected) — also updated the two tests
      that previously asserted "Edit shows regardless of status" using `PUBLISHED` to use `DRAFT`/
      `REVISION_REQUESTED` instead (an editable status), since that claim is now specifically
      false. GREEN: `HazardousEventDetailPage.tsx`'s `canEdit` split into `canAddCause` (role-only,
      still gates the whole right-aligned block + the add-cause link) and `canEditNow`
      (`canAddCause && !isStatusAwareEditBlocked(role, data.workflowStatus)`, gates the Edit link
      specifically) — so the add-cause link still shows alone when Edit is status-blocked but the
      role check passes. All 35 tests in `HazardousEventDetailPage.test.tsx` green, all 50 across
      the 3 touched test files green. `yarn tsc` clean, `npx prettier --check` clean.

      **design.md Decision 16 updated** (corrected citation, corrected conclusion, corrected Risks
      entry) and **`specs/hazardous-event-route-adapter/spec.md` updated directly** (not deferred
      to archive — artifact-drift rule: the old requirement text directly contradicted the
      corrected design.md) — the Edit-link requirement now states the status-aware gate and its
      scenarios, with the locked-status scenario added; the add-cause requirement is unchanged
      (confirmed still correct — unaffected by this fix).

      **Gate 9 re-run on this one spot**: live browser, `test.admin@india.gov.in`, the same
      `waiting-for-validation` Cholera event used for the original finding. CA's
      `/en/he-preview/{id}` now shows no Edit link (only the add-cause link), matching legacy's
      `/en/hazardous-event/{id}` exactly — confirmed by screenshot comparison of both.
- [x] 9b.6 Sync `openspec/changes/ca-he-route-adapter-write/specs/hazardous-event-route-adapter/spec.md`'s
      three new requirements against the implementation at archive time (standard OpenSpec sync step,
      same as task 2.6). Content is already consistent (fixed directly above, ahead of archive) —
      this remaining checkbox is just the formal archive-time reconciliation pass, same as every
      other deferred sync task in this file.

## 9c. Discard modal: button order/emphasis fix (design.md Decision 9 addendum — found live, 2026-11-02)

- [x] 9c.1 RED: extend `HazardousEventDiscardModal`'s existing DOM test (find it under
      `app/domains/hazardous-events/presentation/web/`) with assertions on the footer's structure:
      the container uses a vertical stack (`flex-col`), "Save as draft" renders first with
      `mg-button-primary`, and "Discard work and exit" renders second with `mg-button-outline`.
      Verify these specific assertions fail against the current side-by-side,
      reversed-emphasis markup.

      Correction: no DOM test for this component existed yet (grepped the whole repo for
      `HazardousEventDiscardModal` in any `*.test.*` file — only the component's own source and
      its one usage site in `HazardousEventFormPage.tsx` matched). Created
      `HazardousEventDiscardModal.dom.test.tsx` from scratch, following this directory's own
      `.dom.test.tsx` naming convention for RTL-rendered component tests (e.g.
      `HazardousEventSaveSubmitModal.dom.test.tsx`). Confirmed RED: all 3 new assertions failed
      against the pre-fix side-by-side/reversed-emphasis markup for the right reason (wrong
      container class, wrong button classNames).
- [x] 9c.2 GREEN: in `HazardousEventDiscardModal.tsx`, change the footer's container class from
      `flex gap-3` to `flex flex-col gap-3`, reorder the two `Button` elements ("Save as draft" first),
      and swap their `className`s (`mg-button-primary` on Save as draft, `mg-button-outline` on
      Discard work and exit). No change to either `onClick` callback or to the modal's own
      `visible`/`onHide` props. Verify 9c.1 passes.
- [x] 9c.3 Verify: `yarn vitest run` scoped to `HazardousEventDiscardModal`'s test file — all green,
      including every pre-existing scenario (the two button labels/callbacks are unchanged, only
      order/class/container direction). Also re-ran `HazardousEventFormPage.dom.test.tsx` (its own
      consumer) — unaffected, still green.

## 9d. HIP legacy anti-corruption layer (design.md Decision 17 — found live + via code research, 2026-11-02)

**Load-bearing ordering note**: 9d.1-9d.4 build the port and its adapter in isolation; 9d.5-9d.8 wire
it into `CreateHazardousEventUseCase`; 9d.9-9d.12 wire it into `UpdateHazardousEventUseCase`
(including the mandatory concurrent-callers scenario); 9d.13 is the end-to-end verification against
the real, untouched `linkedHazardousEventOptions` consumer; 9d.14 is DI wiring.

- [x] 9d.1 RED: write `app/domains/hazardous-events/application/ports/IHipCrosswalkPort.test.ts`
      with a fake implementation exercising the `hip-crosswalk-port` spec's `resolve()` scenarios
      (every ancestor has a valid `sourceRefId`; an ancestor's `sourceRefId` is null; a `sourceRefId`
      is set but dangling). Port/type test, same style as `IValidatorCandidateRepository.test.ts` —
      verify it fails only insofar as the type doesn't exist yet.
- [x] 9d.2 GREEN: define `IHipCrosswalkPort`/`HipCrosswalkIds` per design.md Decision 17's exact
      shape (`resolve(specificHazardId): Promise<HipCrosswalkIds>`,
      `stamp(eventId, tenantId, ids, tx): Promise<void>`), with the file-header comment marking it
      explicitly temporary (DEF-055, cite it). Verify 9d.1 passes against a fake.
- [x] 9d.3 RED: write `tests/integration/domains/hazardous-events/DrizzleHipCrosswalkAdapter.test.ts`
      (`import "../../db/setup"`), seeding `specific_hazard`/`hazard_cluster`/`hazard_type` rows with
      varying `sourceRefId` states (all valid; cluster-level null; hazard-level dangling — a
      `sourceRefId` with no matching `hip_hazard` row) against real `hip_hazard`/`hip_cluster`/
      `hip_class` fixture rows, covering the same three `resolve()` scenarios against the real
      Drizzle adapter + PGlite, plus `stamp()`'s two scenarios (writes all three columns including
      explicit nulls; tenant-scoped — no row updated for a mismatched tenant). Verify it fails
      (adapter doesn't exist).

      Added `seedSpecificHazardWithHipCrosswalk()` and an optional `sourceRefIds` parameter on the
      existing `seedSpecificHazard()` (default unchanged) to `hazardousEventTestHelpers.ts` to seed
      the real `hip_hazard`/`hip_cluster`/`hip_class` fixture rows plus a CA taxonomy chain pointing
      at them.
- [x] 9d.4 GREEN: implement `DrizzleHipCrosswalkAdapter.server.ts` — `resolve()` as one query joining
      `specific_hazard` → `hazard_cluster` → `hazard_type` for their three `source_ref_id` values,
      each existence-checked (left join, null on no match) against `hip_hazard`/`hip_cluster`/
      `hip_class`; `stamp()` as a direct tenant-scoped `UPDATE hazardous_event SET hip_hazard_id = ?,
      hip_cluster_id = ?, hip_type_id = ? WHERE id = ? AND country_accounts_id = ?` against the given
      `tx`. Verify 9d.3 passes.

      All 5 scenarios passed on the first run against the real adapter + PGlite.
- [x] 9d.5 RED: extend `CreateHazardousEvent.test.ts` with a scenario asserting `execute()` calls
      `IHipCrosswalkPort.resolve` with `command.specificHazardId`, and — inside the same
      `transactionRunner.run()` block, after the `HazardousEvent` insert — calls
      `IHipCrosswalkPort.stamp` with the saved event's id, `command.tenantId`, the resolved ids, and
      the same `tx`. Verify it fails (the use case has no `IHipCrosswalkPort` dependency yet).

      Also updated 4 pre-existing exact-`callLog`-sequence assertions in this file to include the
      new `hipCrosswalkPort.resolve`/`hipCrosswalkPort.stamp` entries at their new positions.
- [x] 9d.6 GREEN: add `hipCrosswalkPort: IHipCrosswalkPort` as a new constructor dependency on
      `CreateHazardousEventUseCase`; call `resolve(command.specificHazardId)` before
      `transactionRunner.run()` (alongside the existing pre-transaction taxonomy-validation calls);
      call `stamp(saved.id, command.tenantId, hipCrosswalkIds, tx)` inside the transaction,
      immediately after the `HazardousEvent` insert. Verify 9d.5 passes.

      **Minor placement refinement, confirmed with the advisor, not a design.md decision
      deviation**: `resolve()` is called after `HazardousEvent.create()` and the cause checks,
      immediately before `transactionRunner.run()` — not literally adjacent to the pre-transaction
      taxonomy calls as the task text suggests. Reason: `specific_hazard.id` is a uuid column;
      resolving a malformed `command.specificHazardId` before domain validation risks a raw
      Postgres error replacing today's `ValidationError` path. This still satisfies design.md's
      only actual constraint ("before `transactionRunner.run()`") and mirrors Update's own
      placement ("right after `updatedEvent` is built", i.e. after domain validation there too).
      Added as the new last constructor parameter (position wasn't specified in design.md); updated
      the module factory and all 4 other construction sites (1 unit test, 3 integration test files).
- [x] 9d.7 RED: extend the same test file with the rollback scenario — a fake `stamp()` stubbed to
      reject with a generic `Error` — asserting `execute()` rejects with that error and no
      `HazardousEvent`/`WorkflowInstance` from the call exists afterward. Verify it fails against the
      pre-9d.6 code (trivially — the call doesn't exist), then confirm it still fails appropriately if
      `stamp()` were (wrongly) called outside the transaction, before finalizing 9d.6's placement.

      The fake-level test (mirroring every other "a write inside the transaction rejects" test in
      this file) checks only that the error propagates and nothing is logged —
      `FakeTransactionRunner` has no rollback semantics, same precedent already documented inline
      in this file for the pre-existing workflow-insert/edge-save rollback tests. The real "no row
      survives" proof was added as a new PGlite-level test in
      `tests/integration/domains/hazardous-events/CreateHazardousEventUseCase.test.ts` (that file's
      own DEF-026 rollback-proof suite) — confirmed it rolls back the HazardousEvent + WorkflowInstance
      insert.
- [x] 9d.8 Verify: `yarn vitest run app/domains/hazardous-events/application/use-cases/CreateHazardousEvent.test.ts`
      — all green, including every pre-existing scenario (no regression to Decisions 3/4's own
      spatial-observation/cause-order scenarios). 44/44 passed.
- [x] 9d.9 RED: extend `UpdateHazardousEvent.test.ts` with the `update-hazardous-event` spec delta's
      scenarios: an update that omits `specificHazardId` still re-stamps using the existing event's
      own value; an update that changes `specificHazardId` to a hazard whose crosswalk is partially
      null writes that `null` through `stamp()` (clearing a previously-stamped non-null column, not
      leaving it stale); a `stamp()` failure rolls back the whole transaction including the update
      already applied. Verify all fail (no `IHipCrosswalkPort` dependency yet).

      Also updated 2 pre-existing exact-`callLog`-sequence assertions. Confirmed RED: 7 failures,
      all for the right reason (constructor arity mismatch / resolve-not-called).
- [x] 9d.10 GREEN: add the same `hipCrosswalkPort: IHipCrosswalkPort` constructor dependency to
      `UpdateHazardousEventUseCase`; call `resolve(updatedEvent.specificHazardId)` — the merged, final
      value — before `transactionRunner.run()`; call `stamp(saved.id, command.tenantId,
      hipCrosswalkIds, tx)` inside the transaction, immediately after
      `IHazardousEventRepository.update()` succeeds. Verify 9d.9 passes.

      Implemented exactly as specified (unlike Create, this placement — right after `updatedEvent`
      is built, i.e. already after domain validation — needed no refinement). Updated the module
      factory and all 4 other construction sites (1 unit test, 3 integration test files).
- [x] 9d.11 RED: extend the test file with the mandatory concurrent-callers scenario — two
      `execute()` calls against the same event with the same stale-by-the-second-call
      `expectedUpdatedAt`; the second call's `update()` rejects with `ConcurrentModificationError`;
      assert the second call's `IHipCrosswalkPort.stamp` is never called (a spy on the fake port).
      Verify it fails appropriately against the pre-9d.10 code before confirming GREEN needs no
      further change (this scenario should already pass once 9d.10's placement — `stamp()` strictly
      after a successful `update()` — is correct; if it does not pass, 9d.10's placement is wrong and
      must be fixed here, not deferred).

      Passed immediately once 9d.10 landed — confirms the placement is correct (stamp's own call
      count across both racing callers is exactly 1).
- [x] 9d.12 Verify: `yarn vitest run app/domains/hazardous-events/application/use-cases/UpdateHazardousEvent.test.ts`
      — all green, including every pre-existing scenario (no regression to the existing cause/
      spatial-observation composition or the optimistic-lock scenario). 71/71 passed. Also added a
      new PGlite-level stamp-rollback test to
      `tests/integration/domains/hazardous-events/UpdateHazardousEventUseCase.test.ts` (that file's
      own DEF-026 rollback-proof suite), confirmed passing.
- [x] 9d.13 RED→GREEN: write a PGlite integration test (new or extended file under
      `tests/integration/domains/hazardous-events/`) that creates an event via
      `CreateHazardousEventUseCase.execute()` with a `specificHazardId` whose full ancestor chain has
      non-null, valid `sourceRefId`s, then calls the real, unmodified
      `queryLinkedHazardousEventOptions`/`formatHazardousEventOption` (or the underlying Drizzle
      relational query it composes — confirm the exact call shape by reading
      `app/backend.server/services/disaster-event/linkedHazardousEventOptions.ts` at implementation
      time) against that same event, and asserts a non-blank `displayName` is produced. This is the
      empirical proof of design.md Decision 17's "zero consumer changes needed" claim — it MUST fail
      against the pre-9d.6/9d.10 code (a CA-created event's `displayName` is blank today) and pass
      once 9d.6 is in.

      New file: `tests/integration/domains/hazardous-events/LinkedHazardousEventOptionsHipCrosswalk.test.ts`.
      Correction found by reading the actual consumer: `queryLinkedHazardousEventOptions`'s own
      `formatHazardousEventOption` return shape has no `displayName` field — the field is `name`.
      Asserted `option.name === "Test Hazard"` (the seeded `hip_hazard` row's own name), not a
      generic non-blank check, to prove the hazard level specifically resolved (not a cluster/type
      fallback). RED confirmed empirically, not assumed: temporarily commented out the `stamp()`
      call in `CreateHazardousEvent.ts`, re-ran this test, got `expected '' to be 'Test Hazard'`
      (exactly the described gap), then restored the call and confirmed GREEN again.
- [x] 9d.14 Wire `IHipCrosswalkPort`/`DrizzleHipCrosswalkAdapter.server.ts`/
      `HipCrosswalkPortToken.ts` into `HazardousEventsModule.server.ts`, and update both
      `CreateHazardousEventUseCase`/`UpdateHazardousEventUseCase` factory registrations to supply the
      new dependency. Verify `yarn tsc` is clean.

      `yarn tsc` clean (0 errors) across the whole repo after this change.
- [x] 9d.15 Update `DrizzleHazardousEventRepository.server.ts`'s own `toRow()`/`toProps()` doc
      comments (lines 99/135) to note that the three HIP columns are now write-populated via
      `IHipCrosswalkPort`, not by this repository — and that the *read* path (`toProps`/`rehydrate`)
      still deliberately never reads them back into the domain entity, so a future reader does not
      mistake this for the domain gaining a HIP field.
- [x] 9d.16 Sync `openspec/changes/ca-he-route-adapter-write/specs/hip-crosswalk-port/spec.md`,
      the new requirement appended to `specs/create-hazardous-event/spec.md`, and
      `specs/update-hazardous-event/spec.md` against the implementation at archive time (standard
      OpenSpec sync step, same as task 2.6).

## 9e. Form page: five visual-parity fixes (design.md Decision 9 — Addendum 2, found live via DOM/computed-style inspection, 2026-11-02)

**Load-bearing ordering note**: 9e.1-9e.2 fix the missing `dts-form` class (Gap 1); 9e.3-9e.4 fix the
page banner/breadcrumb/h2 (Gap 2, spans both route files and `HazardousEventFormPage.tsx`); 9e.5-9e.6
fix the hazard-picker's missing visible labels (Gap 3); 9e.7-9e.10 fix the two row-grouping classes
and the vestigial `recordOriginator` wrapper (Gaps 4/5's grouping half); 9e.11 is the stretch-bug
investigation/fix (Gaps 4/5's width half — not unit-testable, Gate 9 only); 9e.12 is the section's
own regression verification. **Standing instruction for this whole review pass (established here,
referenced by every later 9-letter section below): only fast gates (vitest/tsc/prettier/Gate 9
live-browser) run per-section; heavy gates (mutation testing, SOLID review, anti-pattern,
code-review skill, independent second opinion) are deferred — not skipped — to one final
consolidated pass (10.12c, later extended as 10.12d).**

- [x] 9e.1 RED: extend `HazardousEventFormPage.dom.test.tsx` with an assertion that the rendered
      `<form>` element (`container.querySelector("form")`) has `class="dts-form"`. Verify it fails
      against the current `<Form method="post" ref={formRef}>` (no `className` at all).
- [x] 9e.2 GREEN: add `className="dts-form"` to the `<Form>` element in
      `HazardousEventFormPage.tsx`. Verify 9e.1 passes.
- [x] 9e.3 RED: extend `HazardousEventFormPage.dom.test.tsx`'s i18n mock with a top-level `title:
      "Hazardous events"` key and correct `form.create_title` to `"Add hazardous event"` (matching
      the real locale fix below), then add assertions: a link with accessible name "Hazardous
      events" and `href="/en/he-preview"` renders before the form; an `<h2>` with text "Add
      hazardous event" renders on `mode="create"`; an `<h2>` with text "Edit hazardous event"
      renders on `mode="edit"`. (`useViewContext`/`ctx.url` already resolve correctly against this
      file's existing `useRouteLoaderData` mock — no new mocking infrastructure needed.) Verify all
      three fail against the current code (no breadcrumb/h2 render at all).
- [x] 9e.4 GREEN:
      - In `HazardousEventFormPage.tsx`, add a `<section className="dts-page-section">` sibling
        immediately before `<Form>` containing `<p><Link href={ctx.url("/he-preview")}>{t("title")}
        </Link></p>` and `<h2>{mode === "edit" ? t("form.edit_title") : t("form.create_title")}
        </h2>` (import `Link` from `~/design-system/components/Link`, same as
        `HazardousEventDetailPage.tsx`'s own back-link).
      - In `app/routes/$lang+/_authenticated+/he-preview+/new.tsx` and `.../edit.$id.tsx`, change
        `<MainContainer title={t("form.create_title")}>` / `title={t("form.edit_title")}` to
        `<MainContainer title={t("title")}>` on both routes (matching `$id.tsx`/`_index.tsx`'s
        existing pattern). No RED/GREEN test for this one-line prop swap — route default-export
        components aren't unit-tested anywhere else in this codebase (confirmed: no `.test.*` file
        mounts `new.tsx`/`edit.$id.tsx`/`$id.tsx`/`_index.tsx`'s default export); verify it via Gate
        9's live-browser check instead (task 10.9).
      - In `locales/en/hazardous-events.json`, correct `form.create_title` from `"New hazardous
        event"` to `"Add hazardous event"`; leave `form.edit_title` unchanged.
      - In `locales/fr/hazardous-events.json`, correct `form.create_title` from `"Nouvel événement
        dangereux"` to `"Ajouter un événement dangereux"` (the real legacy translation, confirmed
        from `locales/app/fr.json`'s `hazardous_events.add` entry — do not invent a new FR string);
        leave `form.edit_title` unchanged (already correct).
      Verify 9e.3 passes.
- [x] 9e.5 RED: extend `HazardousEventHazardPicker.dom.test.tsx`'s i18n mock with
      `form.fields.hazard_type: "Hazard type"`, `form.fields.hazard_cluster: "Hazard cluster"`,
      `form.fields.specific_hazard: "Specific hazard"`. Add assertions that `screen.getByText("Hazard
      type")`, `screen.getByText("Hazard cluster")`, and `screen.getByText("Specific hazard")` each
      find a real visible `<label>` text node. Verify these three fail against the current
      `aria-label`-only markup (an `aria-label` attribute produces no visible text node, so
      `getByText` cannot find it even though `getByLabelText` can).
- [x] 9e.6 GREEN: in `HazardousEventHazardPicker.tsx`, wrap each of the three `<select>` elements in
      the existing `HazardousEventFormField` wrapper (label + real `<label htmlFor>`, already used
      by every other field on this page), replacing the bare `aria-label` attribute: `hipTypeId`
      gets `label={t("form.fields.hazard_type")}` + `id="hipTypeId"`; `hipClusterId` gets
      `label={t("form.fields.hazard_cluster")}` + `id="hipClusterId"`; the existing
      `specificHazardId` select (already has `id="specificHazardId"`) gets
      `label={t("form.fields.specific_hazard")}`. No change to any cascade/filter behavior. Update
      this file's own 7 pre-existing `screen.getByLabelText("Type"/"Cluster"/"Hazard")` assertions to
      `getByLabelText("Hazard type"/"Hazard cluster"/"Specific hazard")` (RTL's `getByLabelText`
      resolves a real `<label>` the same way it resolved `aria-label` before — these were already
      passing for the wrong reason, now pass for the right one). Also add
      `form.fields.hazard_type`/`hazard_cluster`/`specific_hazard` to
      `HazardousEventFormPage.dom.test.tsx`'s own i18n mock (it renders this picker too, even though
      its own assertions don't target these labels). Add the real locale entries to
      `locales/en/hazardous-events.json` (`form.fields.hazard_type`/`hazard_cluster`/
      `specific_hazard`) and `locales/fr/hazardous-events.json` (`"Type de danger"`/`"Groupe de
      risques"`/`"Risque spécifique"` — confirmed from `locales/app/fr.json`'s `hip.hazard_type`/
      `hip.hazard_cluster`/`hip.specific_hazard` entries, not invented). Verify 9e.5 passes, and that
      the updated pre-existing assertions still pass.
- [x] 9e.7 RED: extend `HazardousEventHazardPicker.dom.test.tsx` with a container-query assertion
      that the `<div>` wrapping the three selects has `class="mg-grid mg-grid__col-3"` (not `"flex
      gap-4"`). Verify it fails against the current markup.
- [x] 9e.8 GREEN: in `HazardousEventHazardPicker.tsx`, change the wrapping `<div className="flex
      gap-4">` to `<div className="mg-grid mg-grid__col-3">`. Verify 9e.7 passes and no regression
      to the 7 cascade/filter-behavior tests.
- [x] 9e.9 RED: extend `HazardousEventFormPage.dom.test.tsx` with two container-query assertions: the
      `<div>` wrapping `startDate`/`endDate` has `class="mg-grid mg-grid__col-2"` (not `"flex
      gap-4"`); `recordOriginator`'s own `HazardousEventFormField` has no wrapping `<div>` beyond its
      own `dts-form-component` (i.e. its parent element is the `<Form>`/`<section>` level, not an
      extra `flex gap-4` div). Verify both fail against the current markup.
- [x] 9e.10 GREEN: in `HazardousEventFormPage.tsx`, change the `startDate`/`endDate` wrapping `<div
      className="flex gap-4">` to `<div className="mg-grid mg-grid__col-2">`; remove the vestigial
      single-child `<div className="flex gap-4">` wrapping `recordOriginator` entirely (render its
      `HazardousEventFormField` directly — design.md's own trace of `row_meta.tsx`/
      `splitDefsIntoRows()` confirms legacy renders this field alone in its own row too, not sharing
      with a sibling). Verify 9e.9 passes.
- [x] 9e.11 Investigate and fix the input/textarea full-width stretch bug (Gaps 4/5's width half, not
      unit-testable — jsdom doesn't apply the real Tailwind/webpack CSS cascade). At implementation
      time, with `yarn dev` running, inspect the live page's computed styles to find the exact rule
      forcing inputs/textareas to ≈1376px (design.md's leading candidates: a Tailwind forms-plugin
      reset, or an inherited `width: 100%`/flex-child rule) and remove it — do not add a new explicit
      width to compensate; let elements return to their intrinsic HTML size. Verify via Gate 9 (task
      10.9): re-measure `getComputedStyle(element).width` on a plain text input and a plain textarea
      against the baseline already recorded in design.md (text input ≈216px, textarea ≈193px).
- [x] 9e.12 Verify: `yarn vitest run` scoped to `HazardousEventFormPage.dom.test.tsx` and
      `HazardousEventHazardPicker.dom.test.tsx` — all green, including every pre-existing scenario in
      both files (no regression to the `hazardousEventStatus` default scenarios or the hazard-picker
      cascade/filter scenarios).

**Additional files touched beyond this section's own anticipated list (stated per the
additive-edit guardrail, not pre-listed in 9e.1-9e.12):**
- `HazardousEventFormField.tsx` — 9e.11's confirmed fix lives here, not in
  `HazardousEventFormPage.tsx`/`HazardousEventHazardPicker.tsx` (see design.md's updated Gaps
  4/5 stretch-bug finding): wrapping `{children}` in one plain `<div>` so the control is no
  longer a direct `.dts-form-component` grid item. This is the single shared wrapper every field
  on the form already goes through, so the fix applies form-wide from one place.
- `tests/e2e/hazardous-events/he-preview-form.spec.ts` — 9e.6/9e.8 replaced the hazard-picker's
  `aria-label` attributes with real `<label>` text, which broke this spec's pre-existing
  `select[aria-label='Type']`/`select[aria-label='Cluster']` selectors (3 tests, 5 call sites).
  Updated to `page.getByLabel("Hazard type")`/`page.getByLabel("Hazard cluster")`. Not re-run to
  green in this environment -- Playwright's own `webServer` (port 4000) failed to come up under
  the test runner here (confirmed environment-local: the identical `yarn react-router dev --port
  4000` command starts and listens in under 1s when run directly, so this is a pre-existing
  harness/environment issue, not a regression from this change). The selector fix itself is a
  direct, provably-correct swap verified by other means: the new labels are real, confirmed live
  via `getComputedStyle`/screenshot (task 10.9 below) and covered by
  `HazardousEventHazardPicker.dom.test.tsx`'s own updated `getByLabelText` assertions.

## 9f. Form page: `startDate`/`endDate` row-grouping fix, re-derived against legacy's exact algorithm (design.md Decision 9 — Addendum 3, found live by the human via `getComputedStyle`, 2026-11-02, fourth round)

**Load-bearing ordering note**: 9f.1-9f.2 fix the one confirmed bug (`col-2` → `col-3`); 9f.3 is a
small doc/dead-class cleanup found while re-deriving the algorithm, not a behavior change; 9f.4 is a
no-code-change regression confirmation for the hazard-picker row (verified already correct, not
re-fixed); 9f.5 is the one genuinely new, NOT-yet-live-confirmed finding (`hazardousEventStatus`'s
lone `<select>`) — verify first, fix only if the live measurement confirms the predicted divergence;
9f.6 is the section's own fast-gate pass. Fast-gates-only standing instruction applies (see 9e's
preamble above); heavy gates deferred to the consolidated pass, scope now Sections 9a-9f.

- [x] 9f.1 RED: in `HazardousEventFormPage.dom.test.tsx`, flip the assertion added by 9e.9
      (`"wraps startDate/endDate in an mg-grid mg-grid__col-2 row (Gap 4/5 grouping)"`, currently
      expecting `class="mg-grid mg-grid__col-2"`) to expect `class="mg-grid mg-grid__col-3"`
      instead, and rename the test description to drop the now-wrong "col-2" reference. Verify it
      fails against the current (buggy) `mg-grid__col-2` markup.
- [x] 9f.2 GREEN: in `HazardousEventFormPage.tsx` line 165, change
      `<div className="mg-grid mg-grid__col-2">` wrapping `startDate`/`endDate` to
      `<div className="mg-grid mg-grid__col-3">`. No change to
      `HazardousEventFlexibleDateField.tsx`'s own internal structure — design.md Decision 9
      Addendum 3 confirms the Format/Value stack inside each field is already a correct match to
      legacy's `input.tsx` structure and is not part of this bug. Verify 9f.1 passes, and that no
      other assertion in this file regresses.
- [x] 9f.3 Cleanup (found while re-deriving the algorithm, not a behavior change): in
      `HazardousEventFlexibleDateField.tsx` lines 51-54, the comment says
      "`HazardousEventFormPage.tsx` places two of these side by side in one `flex` row" — the
      wrapper is `mg-grid`, not `flex` (confirmed: `HazardousEventFormPage.tsx:165`); update the
      comment to say "grid row," citing design.md Decision 9 Addendum 3 for the corrected
      row-major-vs-column-blocks reasoning instead of re-explaining it inline (per this project's
      terse-comment convention). Also drop the dead `flex-1` class from line 55's
      `className="flex flex-1 flex-col gap-2"` — `flex-1` only has an effect when the *parent* is
      `display: flex`; the actual parent is `mg-grid` (`display: grid`), so `flex-1` is a no-op.
      Leave `flex-col gap-2` as-is (that part governs this component's own internal stacking, still
      correct). No test change expected (no observable behavior change); confirm via a quick visual
      check during 9f.6's Gate 9 pass that nothing shifted.
- [x] 9f.4 Verify (no code change expected): re-run
      `HazardousEventHazardPicker.dom.test.tsx`'s existing `mg-grid mg-grid__col-3` assertion
      (added by 9e.7/9e.8) and confirm it still passes unmodified. Design.md Decision 9 Addendum 3
      traced this row through `splitDefsIntoRows()`/`rowMeta()` and confirmed the 3-select grid is
      not produced by that algorithm at all — it's hardcoded verbatim in legacy's own
      `hazardpicker.tsx:167`, already matched verbatim in the CA port. This task is a regression
      check only, guarding against this round's changes accidentally touching the wrong row.
- [x] 9f.5 RED→GREEN, live-verification-first (design.md Decision 9 Addendum 3's flagged open
      finding — do not fix blind): during this round's Gate 9 pass, measure
      `getComputedStyle(document.querySelector("#hazardousEventStatus")).width` on both
      `http://localhost:3000/en/hazardous-event/new` (legacy) and the CA create form, with the
      browser window at the same size used for every other measurement in this change. Legacy is
      predicted to show roughly one-third of the row width (matching the `col-3`
      lone-select row the algorithm table derives for it); CA is predicted to show the full row
      width (no wrapper today). **If the measurement confirms the predicted divergence**: write a
      RED assertion in `HazardousEventFormPage.dom.test.tsx` expecting `#hazardousEventStatus`'s
      `HazardousEventFormField` to be wrapped in `<div className="mg-grid mg-grid__col-3">`
      (matching the table's row 12), confirm it fails against the current unwrapped markup, then
      add that wrapper in `HazardousEventFormPage.tsx` and verify the assertion passes. **If the
      measurement does NOT confirm it** (e.g. some other rule already constrains the select):
      record the actual measured values and the reason in design.md Decision 9 Addendum 3, in
      place of the open-finding paragraph there, and make no code change. Either outcome is
      acceptable; silently picking one without measuring is not.
- [x] 9f.6 Fast-gate pass only for this section (per the standing instruction already applied via
      10.12c): `yarn vitest run` scoped to `HazardousEventFormPage.dom.test.tsx` and
      `HazardousEventHazardPicker.dom.test.tsx` (Gate 1), `yarn tsc` (Gate 2),
      `npx prettier --check` scoped to the files this section touched (Gate 3), and Gate 9
      (visual/UX parity, live-browser) re-screenshotting the `startDate`/`endDate` row's
      `gridTemplateColumns` (expect three equal tracks, `childCount: 2`, matching legacy's
      `415.987px 415.987px 415.987px` measurement) plus 9f.5's `hazardousEventStatus` width
      check. Do **not** run Gates 4-8/10 or `test-quality-auditor` for this section — they stay
      deferred to the one final consolidated pass across Sections 9a-9f (see the existing 10.12c
      note; extend its scope to include this section's files when that final pass runs). Do not
      archive on the strength of 10.1-10.10/10.12c alone — this section's own files still need
      their fast-gate pass first.

## 9g. Form page: "Save or submit" button disabled until the form is natively valid (design.md Decision 18 — found live, 2026-11-03; user-authorized deliberate deviation from legacy, not a parity fix)

**Load-bearing ordering note**: 9g.1-9g.2 build the mount-time check and the form-level delegated
live-recheck together (small enough to land in one RED/GREEN round, unlike some of this file's own
multi-round sections); 9g.3 is its own round specifically proving the deferred-recheck design
decision (the date-field Format-switch case); 9g.4 is a confirmation-only task for event delegation
reaching a descendant component's own `<select>`; 9g.5 is the Playwright E2E proof for the
`type="date"` control specifically, given jsdom's historically inconsistent constraint-validation
support for it (design.md Decision 18); 9g.6 is this section's own fast-gate pass. Fast-gates-only
standing instruction applies (9e's preamble); heavy gates deferred to 10.12d, scope now 9a-9g.

- [x] 9g.1 RED: extend `HazardousEventFormPage.dom.test.tsx` with a new describe block and these
      assertions, using `screen.getByRole("button", { name: "Save or submit" })`:
      (a) create mode, no `initialValues` (the `EMPTY_VALUES` default) — button has the `disabled`
      attribute on initial render, before any interaction; (b) edit mode, `initialValues` with
      `endDate: ""` and every other required field valid — button is disabled on initial render
      (the exact bug reproduced live: a stored record genuinely missing a required field); (c) edit
      mode, `initialValues` with every required field (`specificHazardId`, `startDate`, `endDate`,
      `recordOriginator`) valid — button is NOT disabled on initial render; (d) starting from (c)'s
      valid form, `fireEvent.change`/`fireEvent.input` clearing `recordOriginator` back to empty —
      button becomes disabled; then supplying a valid value again — button becomes enabled again,
      with no re-render/re-mount of the page between these two steps. Verify (a)/(b)/(d) fail against
      the current code (the button has no `disabled` logic and never updates). Verify (c) currently
      passes trivially (the button is unconditionally enabled today) — record this explicitly as a
      baseline/regression guard for 9g.2's GREEN step, not a true RED assertion.
- [x] 9g.2 GREEN: in `HazardousEventFormPage.tsx`, add `const [isFormValid, setIsFormValid] =
      useState(false)` (disabled-by-default safe initial value); one mount effect that (i) sets
      `isFormValid` from `formRef.current.checkValidity()` once the ref is attached, and (ii)
      attaches one `"input"` and one `"change"` listener directly on `formRef.current` (bubble
      phase, event delegation — not individual `onChange` props threaded into
      `HazardousEventHazardPicker`/`HazardousEventFlexibleDateField`), each recheck handler calling
      `queueMicrotask(() => setIsFormValid(formRef.current?.checkValidity() ?? false))` (design.md
      Decision 18's own "why deferred" rationale — same pattern already used by this file's
      `submitWithAction()`); a cleanup removing both listeners on unmount. Add `disabled={!isFormValid}`
      to the "Save or submit" `<button>`, no other prop/className change (the existing
      `.mg-button:disabled` rule in `public/assets/css/style-dts.css` already styles it — no new CSS).
      Verify 9g.1's (a)/(b)/(c)/(d) all pass.
- [x] 9g.3 RED→GREEN, its own round (proves the deferred-recheck decision specifically, not just "a
      recheck happens"). **Corrected at implementation time from how it's written above** — see
      design.md Decision 18's addendum for the full writeup of why the originally-proposed
      date-Format-switch scenario doesn't reproduce a stale read and why the hazard-picker
      filter-by-name scenario does. Confirmed RED for the right reason: with the `queueMicrotask`
      wrapper temporarily removed, the button never catches up (stays enabled; a `waitFor` assertion
      that it becomes disabled times out). Restoring the wrapper makes it pass. Test added to
      `HazardousEventFormPage.dom.test.tsx`.
- [x] 9g.4 Confirmation only, no code change expected unless this fails: extend the test file with a
      scenario starting from a form where every required field is valid except `specificHazardId`
      (empty), then selecting a valid hazard via `HazardousEventHazardPicker`'s own `<select>` —
      asserting the button becomes enabled. This exercises delegation reaching a descendant
      component's native `change` event, not just the page's own direct inputs. Expected to already
      pass once 9g.2 lands (the listener sits on the `<form>` itself; every descendant's native
      events bubble to it regardless of which component rendered it) — if it fails, the listener's
      attachment point is wrong and must be fixed here, not deferred to a later task.
- [x] 9g.5 Add a Playwright E2E scenario to `tests/e2e/hazardous-events/he-preview-form.spec.ts`
      (extend the existing spec): load the create form in a real browser, assert the "Save or
      submit" button is disabled; fill every required field one at a time (hazard classification,
      start date, end date, record originator), asserting the button remains disabled until the
      last one is filled, then becomes enabled; clear one required field again and assert it becomes
      disabled again. This is the authoritative proof for the `startDate`/`endDate` `type="date"`
      control specifically — design.md Decision 18 flags jsdom's own constraint-validation support
      for `type="date"` as historically inconsistent across versions; if a dom-tier assertion on the
      date input's `validity.valueMissing` does not behave as expected under this repo's pinned
      jsdom (confirm at implementation time, do not assume either outcome), this E2E scenario is the
      scenario of record for that control, and the dom-tier test should fall back to asserting the
      equivalent behavior through the flexible-date field's `yyyy-mm`/`yyyy` precision modes (plain
      text inputs, unaffected by any `type="date"` gap) instead.

      **Also fixed, same file, found at implementation time**: this section's own disabled button
      made the file's pre-existing test "a required field left empty blocks submission client-side"
      unrunnable as written — it clicked "Save or submit" with every required field empty, which
      is now a disabled element Playwright's own actionability check times out on before ever
      reaching the modal it used to open. Rewritten (same intent, stronger assertion) as "the 'Save
      or submit' button stays disabled for an empty form...", asserting `toBeDisabled()` directly
      instead of attempting the now-impossible click-through-to-modal flow. Two runs of the full
      spec file passed both new/rewritten 9g.5 scenarios; one pre-existing test
      ("the parent-picker flow updates the form's parent field end to end") failed in both a
      full-suite run and an isolated re-run — its own code comment already documents this as a
      known flake ("popup `window.open()` timing degrades under cumulative load"), and it exercises
      the unrelated "Change" parent-picker popup, not the Save/submit button this section touches.
      Not fixed here — out of scope for 9g, and a confound-free baseline couldn't be obtained in
      this environment (a leftover dev-server process from an earlier session held port 3001,
      forcing this run onto `API_PORT=3002`; killing it to get a clean baseline was outside this
      session's permissions). Flagged for the final consolidated regression pass (10.12d) to
      re-check with a clean environment, not assumed pre-existing without that caveat.
- [x] 9g.6 Fast-gate pass only for this section (per the standing instruction already applied via
      10.12c/9f.6): `yarn vitest run` scoped to `HazardousEventFormPage.dom.test.tsx` (Gate 1,
      15/15 passed), `yarn tsc` (Gate 2, clean), `npx prettier --check` scoped to
      `HazardousEventFormPage.tsx`, `HazardousEventFormPage.dom.test.tsx`, and
      `he-preview-form.spec.ts` (Gate 3, clean), and Gate 9 (visual/UX parity, live-browser,
      `yarn dev`/real Chrome against `/en/he-preview/new` and two existing edit-mode records)
      confirming: the empty create form's button starts disabled, styled per `.mg-button:disabled`
      (gray background, light-gray text, consistent with the Discard button's own enabled-outline
      styling alongside it — matches `public/assets/css/style-dts.css:709-714` exactly, no new CSS
      needed); filling `specificHazardId`/`startDate`/`endDate` leaves it disabled until
      `recordOriginator` also lands, then it goes solid-blue live, no reload; clearing
      `recordOriginator` again disables it live, no reload; an edit-mode record
      (`e8bfee4c-2249-4b50-880f-f054796b5dff`) with a genuinely-empty `recordOriginator` starts
      disabled on load; a fully-valid edit-mode record (`29d2e2ff-b93c-4e3f-8758-e31ec84a0fba`)
      starts enabled on load. Did **not** run Gates 4-8/10 or `test-quality-auditor` for this
      section — deferred to the one final consolidated pass across Sections 9a-9g (10.12d, scope
      extended below). Not archiving on the strength of 10.1-10.10/10.12c/9f.6 alone — this
      section's own files needed their own fast-gate pass first, now done.
- [x] 9g.7 Synced `openspec/changes/ca-he-route-adapter-write/specs/hazardous-event-form-validation/spec.md`
      against the implementation (standard OpenSpec sync step, same as 2.6/9a.4a/9b.6/9d.16). One
      correction needed beyond a plain sync: the "Changing which control is required..." scenario
      named the same date-Format-switch example that 9g.3 found doesn't actually reproduce (see
      design.md Decision 18's addendum) — rewritten as "A React-driven change to a required
      control's value leaves the button correctly disabled", using the verified hazard-picker
      filter-clearing mechanism instead, same underlying contract (deferred recheck observes
      post-render DOM, not a stale snapshot). Every other scenario already matched the
      implementation as built.

## 9h. HazardousEventHazardPicker: missing required marker on "Specific hazard", and the select getting permanently stuck after unrelated field edits (design.md Decisions 19/20 — found live via manual QA, 2026-11-03)

**Two independent findings, one section**: 9h.1-9h.2 are Decision 19's own one-line label fix;
9h.3-9h.5 are Decision 20's root-cause-confirming test, fix, and E2E proof. Fast-gates-only standing
instruction applies (9e's preamble); heavy gates deferred to 10.12d, scope extended below.

- [x] 9h.1 RED: extend `HazardousEventHazardPicker.dom.test.tsx` with an assertion that the
      "Specific hazard" field's own rendered label reads `"Specific hazard *"` (e.g.
      `screen.getByText("Specific hazard *")`), alongside the existing (unchanged) assertion that the
      group heading still reads `"Hazard classification *"`. Verify this fails against the current
      code (today's label reads plain `"Specific hazard"`, no marker).
- [x] 9h.2 GREEN: in `HazardousEventHazardPicker.tsx`, add `required` to the "Specific hazard"
      field's own `HazardousEventFormField` wrapper (design.md Decision 19). No other prop, no change
      to the native `required` attribute already on the `<select>` itself, no change to "Hazard
      type"/"Hazard cluster" (neither gains `required`). Verify 9h.1 passes and every pre-existing
      assertion in this file still passes.
- [x] 9h.3 RED: extend `HazardousEventHazardPicker.dom.test.tsx` (or
      `HazardousEventFormPage.dom.test.tsx`, whichever already holds a harness for firing a native
      `input`/`change` event on a sibling field — confirm at implementation time) with a mechanism
      -level assertion: with every required field but `specificHazardId` valid, fire a native
      `input`/`change` event on `recordOriginator` (simulating Decision 18's own trigger) and assert
      `HazardousEventHazardPicker` does not re-render as a result (a render-count spy, or an
      assertion that the `specificHazardId` `<select>` DOM node's identity/own `onChange` prop
      reference is unchanged across the event). Verify this fails against the current code (the
      component re-renders on every such event, per design.md Decision 20's confirmed root cause).
- [x] 9h.4 GREEN: in `HazardousEventHazardPicker.tsx`, wrap the component's export in `React.memo`
      (design.md Decision 20). No other change to the component's own body, props, or internal state
      logic. Verify 9h.3 passes, and separately re-verify (regression, do not assume) that the
      filter-by-name reset behavior from Decision 18's own addendum still works unchanged — typing
      into the filter input still clears `specificHazardId`/`typeId`/`clusterId` via this component's
      own internal state, and Decision 18's `HazardousEventFormPage.dom.test.tsx` scenario for that
      mechanism (9g.3) still passes with no modification.
- [x] 9h.5 Add a Playwright E2E scenario to `tests/e2e/hazardous-events/he-preview-form.spec.ts`
      (extend the existing spec) reproducing the exact live repro steps from design.md Decision 20:
      select a hazard type, select a hazard cluster, leave "Specific hazard" unselected; fill
      `recordOriginator`, `startDate`, `endDate`; return to "Specific hazard" and select one of its
      options by click; assert the select's value reflects the chosen option and the "Save or
      submit" button subsequently enables. This is the authoritative, real-browser proof for Decision
      20's fix — the same role 9g.5 already plays for Decision 18's own jsdom gap — since the
      user-facing symptom is native-widget keyboard/type-ahead behavior jsdom does not meaningfully
      emulate.
- [x] 9h.6 Fast-gate pass only for this section (per the standing instruction already applied via
      9f.6/9g.6/10.12c): `yarn vitest run` scoped to `HazardousEventHazardPicker.dom.test.tsx` and
      `HazardousEventFormPage.dom.test.tsx` (Gate 1), `yarn tsc` (Gate 2), `npx prettier --check`
      scoped to `HazardousEventHazardPicker.tsx`, `HazardousEventHazardPicker.dom.test.tsx`, and
      `he-preview-form.spec.ts` (Gate 3), and Gate 9 (visual/UX parity, live-browser, `yarn
      dev`/real Chrome against `/en/he-preview/new`) confirming: "Specific hazard" shows its own `*`;
      the exact Decision 20 repro steps no longer leave the select stuck — an option can be selected
      after filling other fields first, by click, type-ahead, and arrow keys. Did **not** run Gates
      4-8/10 or `test-quality-auditor` for this section — deferred to the one final consolidated pass
      (10.12d, scope extended below).
- [x] 9h.7 Sync `openspec/changes/ca-he-route-adapter-write/specs/hazardous-event-form-validation/spec.md`
      against the implementation (standard OpenSpec sync step, same as 2.6/9a.4a/9b.6/9d.16/9g.7).

## 9i. Picker page-chrome wrapper, parent-field tab-vs-popup, and list-row "Edit" action (design.md Decisions 21/22/23 — found live via manual QA confirmed by the orchestrator, 2026-11-03)

**Three independent findings, one section**: 9i.1 is Decision 21's own route-level `MainContainer`
wrap (no RED/GREEN — route default-export components aren't unit-tested anywhere in this codebase,
same precedent as 9e.4; verified via Gate 9 only); 9i.2-9i.3 are Decision 22's `window.open` call
fix; 9i.4-9i.5 are Decision 23's list-row Edit link. Fast-gates-only standing instruction applies
(9e's preamble); heavy gates deferred to 10.12d, scope extended below.

- [x] 9i.1 Fix Decision 21: in `app/routes/$lang+/_authenticated+/he-preview+/picker.tsx`'s default
      export, wrap `<HazardousEventPickerPage data={data} />` in `<MainContainer
      title={t("picker.title")}>` (add `useTranslation("hazardous-events")` and the `MainContainer`
      import, matching `_index.tsx`/`$id.tsx`'s own pattern exactly). Correct
      `locales/en/hazardous-events.json`'s existing (currently unused) `picker.title` value from
      `"Select a parent hazardous event"` to `"Select parent for event"` (legacy's exact wording);
      correct `locales/fr/hazardous-events.json`'s `picker.title` from `"Sélectionner un événement
      dangereux parent"` to `"Sélectionner un parent pour l'événement"` (confirmed from
      `locales/app/fr.json`'s own `hazardous_event.select_parent_for_event` catalog entry, not
      invented). No RED/GREEN test — verify via Gate 9 (task 9i.6) only, same precedent as task
      9e.4's `new.tsx`/`edit.$id.tsx` title-prop swap.
- [x] 9i.2 RED: create `app/domains/hazardous-events/presentation/web/HazardousEventParentField.dom.test.tsx`
      (new file — no test currently exists for this component; needs a real `window`/jsdom
      environment for `window.open`, hence the `.dom.test.tsx` naming convention this directory
      already uses) asserting that clicking the "Change" button calls `window.open` with exactly
      `ctx.url("/he-preview/picker")` and `"_blank"`, and no third argument. Verify it fails against
      the current `window.open(ctx.url("/he-preview/picker"), "he-picker", "width=900,height=700")`
      call.
- [x] 9i.3 GREEN: in `HazardousEventParentField.tsx`, change the "Change" button's `onClick` to
      `window.open(ctx.url("/he-preview/picker"), "_blank")` — drop the `"he-picker"` window-name and
      the `"width=900,height=700"` features string; `ctx.url(...)` itself is unchanged. Verify 9i.2
      passes. (Already confirmed by repo-wide grep before writing this task: no other test or E2E
      spec asserts on the removed `"he-picker"`/`"width=900,height=700"` literals, and the E2E
      parent-picker-flow spec drives the flow via Playwright's own `page.waitForEvent("popup")`,
      which fires identically for a tab or a popup — no update needed there.)
- [x] 9i.4 RED: extend `HazardousEventListPage.test.tsx` (already has `role`/`workflowStatus` on its
      `makeItem`/`makeData` fixtures) with scenarios: (a) `role: "data-collector"` + a row with
      `workflowStatus: "DRAFT"` renders a link to `he-preview/edit/{id}` before the link to
      `he-preview/{id}`; (b) `role: "admin"` + a row with `workflowStatus` one of `"SUBMITTED"`/
      `"APPROVED"`/`"PUBLISHED"` renders no edit link for that row (view link still present); (c)
      `role: "data-viewer"` renders no edit link for any row; (d) `role: null` renders no edit link
      for any row. Verify all four fail against the current View-only default actions cell.
- [x] 9i.5 GREEN: in `HazardousEventListPage.tsx`'s default (non-`renderActionsCell`) actions-cell
      branch, add an Edit icon link (`href={ctx.url(`/he-preview/edit/${item.id}`)}`,
      `aria-label={t("detail.edit")}` — reusing the existing `detail.edit` key from the
      `hazardous-events` namespace this component already loads, not a new `common.json` key — icon
      `<use href="/assets/icons/edit.svg#edit" />`, confirmed to exist) before the existing View link,
      both wrapped in one `<span className="flex items-center gap-1">` inside the single existing
      `TableCell`. Gate the Edit link with `roleHasPermission(role ?? null, "EditData") &&
      !isStatusAwareEditBlocked(role ?? null, item.workflowStatus)` (import both from their existing
      locations — `~/frontend/user/roles` and `./isStatusAwareEditBlocked`). No placeholder element
      when hidden (confirmed: this cell has no fixed multi-slot grid to preserve, unlike legacy's
      `ActionLinks.tsx` — see design.md Decision 23). **Superseded by Section 9j below**: Decision 23's
      own "no placeholder needed" reasoning was found live to be wrong — see design.md Decision 24 and
      task 9j for the fix. Verify 9i.4 passes, and that no existing assertion in this file regresses.
- [x] 9i.6 Verify (no code change expected, regression guard on an existing contract): extend or
      confirm a scenario that `HazardousEventPickerPage.tsx`'s own `renderActionsCell` override (the
      "Select" button) is unaffected by 9i.5 — the picker's action column never renders the new Edit
      link, since it always supplies its own override and never reaches the default branch 9i.5
      changed. `yarn vitest run` scoped to `HazardousEventListPage.test.tsx` and
      `tests/integration/domains/hazardous-events/routes/HazardousEventPickerRoute.test.ts` — all
      green, including every pre-existing scenario.
- [x] 9i.7 Fast-gate pass only for this section (per the standing instruction already applied via
      9f.6/9g.6/9h.6/10.12c): `yarn vitest run` scoped to `HazardousEventParentField.dom.test.tsx`
      and `HazardousEventListPage.test.tsx` (Gate 1), `yarn tsc` (Gate 2), `npx prettier --check`
      scoped to `picker.tsx`, `HazardousEventParentField.tsx`,
      `HazardousEventParentField.dom.test.tsx`, `HazardousEventListPage.tsx`, and both locale files
      (Gate 3), and Gate 9 (visual/UX parity, live-browser, `yarn dev`/real Chrome) confirming:
      `/en/he-preview/picker` now renders the page-title banner reading "Select parent for event,"
      matching `/en/he-preview`'s own banner structure; clicking "Change" opens a real browser tab
      (not a small chrome-less popup) that receives focus automatically, and still self-closes and
      returns focus to the form tab after selecting a parent (the existing `postMessage`/deferred
      `window.close()` mechanism, unchanged); the main list route shows an Edit icon before the View
      icon for an editable-status row when logged in with a role that has `EditData`, shows only View
      for a locked-status row or for `data-viewer`, and the parent-picker popup's own row actions show
      only "Select," never an Edit icon, for any role. Did **not** run Gates 4-8/10 or
      `test-quality-auditor` for this section — deferred to the one final consolidated pass across
      Sections 9a-9i (10.12d, scope extended below).
- [x] 9i.8 Sync `openspec/changes/ca-he-route-adapter-write/specs/hazardous-event-write-route-adapter/spec.md`'s
      two new requirements (picker page-chrome, "Change" tab-vs-popup) and
      `specs/hazardous-event-list-filters/spec.md`'s new list-row-Edit-link requirement against the
      implementation at archive time (standard OpenSpec sync step, same as 2.6/9a.4a/9b.6/9d.16/
      9g.7/9h.7).

      **Verified already synced, 10.12d consolidated review, 2026-11-04** — re-read both spec files
      against the shipped code before ticking, not taken on faith: `specs/hazardous-event-write-route-adapter/spec.md`
      lines 258-290 ("The parent-picker route renders the same page-title chrome..."/"The 'Change'
      control opens the parent picker as a tab, not a popup window...") match `picker.tsx`'s
      `<MainContainer title={t("picker.title")}>` wrap and `HazardousEventParentField.tsx`'s
      `window.open(ctx.url("/he-preview/picker"), "_blank")` call exactly, including the corrected
      `picker.title` locale value ("Select parent for event" / "Sélectionner un parent pour
      l'événement"). `specs/hazardous-event-list-filters/spec.md`'s "status-aware 'Edit' link"
      requirement already describes the two-slot/placeholder shape (Decision 24's fix, synced via
      9j.4) rather than Decision 23's own superseded "no placeholder" version — so this task's own
      list-filters half was already covered by 9j.4's sync, not left stale. No content change needed
      either file; only this checkbox was never ticked.

## 9j. List page: Edit/View action icons shift position depending on how many are shown (design.md Decision 24 — found live by the user right after 9i shipped, 2026-11-03)

**Corrects Decision 23's own reasoning**, confirmed live via screenshot: the View icon's horizontal
position shifts between an editable-status row (both Edit and View render) and a locked-status row
(View renders alone) because the enclosing `<span className="flex items-center gap-1">` group's total
width varies and `.dts-table__actions` centers that group. Fast-gates-only standing instruction
applies (9e's preamble); heavy gates deferred to 10.12d, scope extended below.

- [x] 9j.1 RED: extend `HazardousEventListPage.test.tsx`'s existing "row-level Edit action (design.md
      Decision 23)" describe block with a new scenario rendering two rows in one pass — one
      `workflowStatus: "DRAFT"`, one `workflowStatus: "SUBMITTED"` — both for role `"data-collector"`
      (`EditData`-holding). Assert: the `DRAFT` row's Edit slot contains the real `<a
      href=".../he-preview/edit/{id}">` link; the `SUBMITTED` row's Edit slot contains a non-interactive
      placeholder (`aria-hidden="true"`, no `he-preview/edit` href, no `<a>` tag) occupying the same
      position before the View link, not simply "no element there." Also extend the existing
      `data-viewer`/`null`-role "renders no Edit link" tests to additionally assert the placeholder is
      present (not merely that no Edit link exists) for those rows. Verify all new assertions fail
      against the current (Decision 23 / task 9i.5) implementation, which renders nothing in the Edit
      slot's place for a gated-off row.
- [x] 9j.2 GREEN: in `HazardousEventListPage.tsx`'s default actions-cell branch, change the Edit slot's
      conditional from "render the Edit `<Link>` or nothing" to "render the Edit `<Link>` or a
      same-sized, non-interactive placeholder" — per design.md Decision 24's exact markup:
      ```tsx
      {roleHasPermission(role ?? null, "EditData") &&
      !isStatusAwareEditBlocked(role ?? null, item.workflowStatus) ? (
      	<Link href={ctx.url(`/he-preview/edit/${item.id}`)} aria-label={t("detail.edit")} className="mg-button mg-button-table">
      		<svg aria-hidden="true" focusable="false" role="img"><use href="/assets/icons/edit.svg#edit" /></svg>
      	</Link>
      ) : (
      	<span className="mg-button mg-button-table invisible" aria-hidden="true">
      		<svg aria-hidden="true" focusable="false" />
      	</span>
      )}
      ```
      The View `<Link>` itself is unchanged — no placeholder is added for View, since View is never
      conditionally absent (design.md Decision 24's "reserving only the Edit slot is sufficient"
      reasoning). Verify 9j.1 passes, and that no existing assertion in this file regresses (in
      particular the Decision 7 view-action test and the picker's own `renderActionsCell`-override
      coverage, neither of which reaches this branch).
- [x] 9j.3 Fast-gate pass only for this section (per the standing instruction already applied via
      9f.6/9g.6/9h.6/9i.7/10.12c): `yarn vitest run` scoped to `HazardousEventListPage.test.tsx` (Gate
      1), `yarn tsc` (Gate 2), `npx prettier --check` scoped to `HazardousEventListPage.tsx` and
      `HazardousEventListPage.test.tsx` (Gate 3), and Gate 9 (visual/UX parity, live-browser, `yarn
      dev`/real Chrome) confirming via `getBoundingClientRect().left` on the View icon's own rendered
      element: its horizontal position is identical between a `DRAFT`/editable row and a
      `SUBMITTED`/locked row in the main list route, checked at two viewport widths — one below and
      one at/above `1024px` (`.mg-button`'s own `flex`→`inline-flex` breakpoint, `style-dts.css` line
      ~569). Also confirm `Tab` from the preceding cell lands on the View link directly for a locked
      row, never pausing on the placeholder (design.md Decision 24's `focusMode="child"` analysis). Did
      **not** run Gates 4-8/10 or `test-quality-auditor` for this section — deferred to the one final
      consolidated pass across Sections 9a-9j (10.12d, scope extended below).
- [x] 9j.4 Sync `openspec/changes/ca-he-route-adapter-write/specs/hazardous-event-list-filters/spec.md`'s
      Decision 24 requirement text and its two new scenarios against the implementation at archive
      time (standard OpenSpec sync step, same as 9i.8 and its own predecessors).

## 9k. Status enum validation, live-validity hook extraction, workflow-composer-callback de-duplication (10.12d consolidated review findings, 2026-11-04 — three fixes approved to build now, fast-gates-only)

**Three independent findings, one section**: 9k.1-9k.3 are the `hazardousEventStatus` runtime
enum-validation gap (RED/GREEN, a real new test) plus the one-line false-citation comment fix riding
along with it; 9k.4-9k.6 are the `useLiveFormValidity(formRef)` hook extraction (Gate 5 SOLID finding
#1 — pure refactor, no behavior change, existing tests as the safety net); 9k.7-9k.9 are the
`buildWorkflowComposerCallbacks` de-duplication (Gate 5 SOLID finding #2, already anticipated at task
7.6 — pure refactor, no behavior change). **Bookkeeping note, authoritative here, referenced by 9l's
and 9m's own preambles below rather than repeated**: fast-gates-only standing instruction applies
(9e's preamble); heavy gates for this section were deferred not to 10.12d itself (which had already
run Gates 4/5/6/7/8/10 for Sections 9a-9j before 9k existed) but to the consolidated heavy-gate pass
that followed, which extended 10.12d's own scope to cover 9a-9n (2026-11-04 — no separate `10.12e`
task was created). Mutation testing (`test-quality-auditor`) is excluded from this entire intent per
the user's standing decision (10.11a), not deferred to any future task.

- [x] 9k.1 RED: extend `app/domains/hazardous-events/domain/HazardousEvent.test.ts` with a scenario
      asserting `HazardousEvent.create()` throws `ValidationError` when `hazardousEventStatus` is a
      non-null string outside `HAZARDOUS_EVENT_STATUS_VALUES` (e.g. `"archived"` — simulating a
      tampered/hand-crafted form submission bypassing the UI's own `<select>`, which only ever offers
      valid options), plus the two confirming scenarios: a valid value (`"ongoing"`) does not throw,
      and `null` does not throw (the field stays nullable). Mirrors
      `specs/hazardous-event-entity/spec.md`'s new delta in this change. Verify the invalid-value
      scenario fails against the current code (no guard exists — `HazardousEvent.create()` accepts
      any string value for this field today).
- [x] 9k.2 GREEN: in `HazardousEvent.ts`'s `static create()`, add an enum guard for
      `hazardousEventStatus` mirroring `WorkflowInstance.create()`'s own existing pattern
      (`WorkflowInstance.ts` lines 139-143, `!ENTITY_TYPE_VALUES.includes(...)` /
      `!STATUS_VALUES.includes(...)`, both throwing `ValidationError`):
      ```ts
      if (
      	props.hazardousEventStatus !== null &&
      	!HAZARDOUS_EVENT_STATUS_VALUES.includes(props.hazardousEventStatus)
      ) {
      	throw new ValidationError(
      		`hazardousEventStatus must be one of ${HAZARDOUS_EVENT_STATUS_VALUES.join(", ")}, or null`,
      	);
      }
      ```
      Place it alongside this method's other field-level checks (before the `startDate`/`endDate`
      ordering check, same "report the more specific error first" ordering this method's own existing
      checks already follow — confirm the exact placement doesn't reorder which error a
      multi-violation input reports, matching this file's own documented check-ordering convention).
      Verify 9k.1 passes, and that no pre-existing `HazardousEvent.create()` scenario regresses (every
      existing fixture already uses a valid `hazardousEventStatus` value or `null`).
- [x] 9k.3 Also fix, same round (trivial, one-line, no test needed): in
      `app/domains/hazardous-events/presentation/web/HazardousEventFormPage.tsx` (the spatial-footprint
      placeholder's own code comment, ~lines 252-254), correct "flagged in design.md's Risks" — false,
      confirmed by a full-document search: `design.md` has no `## Risks` heading anywhere — to instead
      cite the real tracking record: `DEF-057` (registered this review round;
      `_docs/refactoring-plan/deferred-items-register.md`), not a Risks-section entry. No test change
      (a comment-only edit).
- [x] 9k.4 Extract `useLiveFormValidity(formRef: RefObject<HTMLFormElement>): boolean` into its own
      file, co-located in `app/domains/hazardous-events/presentation/web/`
      (`useLiveFormValidity.ts`), moving `HazardousEventFormPage.tsx`'s existing `useState` +
      `useLayoutEffect` block (current lines ~96-122: the mount-time `checkValidity()` read, the
      form-level delegated `"input"`/`"change"` listener, and the `queueMicrotask`-deferred recheck)
      verbatim — same logic, same comments explaining the `queueMicrotask` deferral rationale
      (Decision 18) and the hazard-picker filter-reset edge case it handles (Decision 18's addendum),
      not re-derived or re-worded. `HazardousEventFormPage.tsx` calls `const isFormValid =
      useLiveFormValidity(formRef);` in place of its own inline `useState`/`useLayoutEffect`. Pure
      refactor — no behavior change.
- [x] 9k.5 Decide, and document which was chosen (either is acceptable per the brief): either (a)
      leave `HazardousEventFormPage.dom.test.tsx`'s existing Decision-18 describe block exactly as-is
      (it exercises the hook's behavior indirectly through the page, and should keep passing
      unmodified against the refactored page), or (b) additionally move that describe block to a new
      `useLiveFormValidity.test.ts`/`.dom.test.ts` testing the hook directly via a minimal test
      harness (e.g. a bare `<form>` + the hook via a test component), if that reads more cleanly once
      the hook is its own file. Either way, no behavior change and no new scenario — this task is
      about where the existing coverage lives, not what it covers.
- [x] 9k.6 Verify: `yarn vitest run` scoped to `HazardousEventFormPage.dom.test.tsx` (and
      `useLiveFormValidity.test.ts`/`.dom.test.ts` if 9k.5 chose option (b)) — all green, including
      every pre-existing Decision-18/18-addendum/20 scenario (the hazard-picker filter-reset-clears
      the button edge case in particular, since it depends on this exact mechanism). `yarn tsc` clean.
      `npx prettier --check` scoped to the touched files clean.
- [x] 9k.7 Create `buildWorkflowComposerCallbacks({ tenantId, actingUserId }: { tenantId: string;
      actingUserId: string }): { getRecordDisplayName: () => Promise<string>; getValidCandidateIds:
      () => Promise<string[]> }` in
      `app/domains/hazardous-events/presentation/web/buildWorkflowComposerCallbacks.server.ts` —
      same directory `composeWorkflowAction.server.ts` already lives in (this domain's own precedent
      for a route-layer shared helper). `getRecordDisplayName` takes the target event's own `id` as a
      parameter (the one genuine difference between `new.tsx`'s `created.id` and `edit.$id.tsx`'s
      `event.id`) — mirror the two routes' identical closures exactly (`GetHazardousEventByIdUseCase`
      resolution, the same `specificHazardName || hazardClusterName || hazardTypeName || ""`
      fallback chain) and `getValidCandidateIds`'s identical body
      (`FindValidatorCandidatesUseCase.execute({ tenantId, excludingUserId: actingUserId })`, mapping
      to `candidates.map((c) => c.id)`) verbatim, including each closure's own existing explanatory
      comment (`new.tsx`'s "recordDisplayName derivation reuses..." / `edit.$id.tsx`'s "Re-fetched
      post-update, not the pre-edit `event`..." — keep edit's own fresher comment, since it documents
      a real, still-true distinction for that route specifically).
- [x] 9k.8 Update `new.tsx` (lines ~164-180) and `edit.$id.tsx` (lines ~186-202) to call
      `buildWorkflowComposerCallbacks({ tenantId, actingUserId: session.user.id })` and spread its
      `getRecordDisplayName`/`getValidCandidateIds` into their respective `composeWorkflowAction(...)`
      call — `new.tsx` passing a `getRecordDisplayName` closed over `created.id`, `edit.$id.tsx` over
      `event.id` (the factory itself stays id-agnostic per 9k.7; each route supplies its own id when
      it calls the factory, or the factory takes the event id as an explicit parameter — confirm
      whichever shape keeps both call sites simplest at implementation time, since design.md does not
      mandate one). No change to `composeWorkflowAction.server.ts` itself, and no change to either
      route's own request/response shape. Pure refactor — no behavior change.
- [x] 9k.9 Verify: both routes' existing integration tests
      (`tests/integration/domains/hazardous-events/routes/HazardousEventNewRoute.test.ts` and
      `HazardousEventEditRoute.test.ts`) pass unmodified — in particular the `submit-validation`
      composition scenarios (Section 6/7) that exercise `getRecordDisplayName`/`getValidCandidateIds`
      through `composeWorkflowAction`, since those are the only scenarios that actually call through
      this refactored code path. `yarn tsc` clean. `npx prettier --check` scoped to
      `buildWorkflowComposerCallbacks.server.ts`, `new.tsx`, `edit.$id.tsx` clean.
- [x] 9k.10 Fast-gate pass for this section's own new behavior (9k.1-9k.3 only — 9k.4-9k.9 are pure
      refactors covered by 9k.6/9k.9's own regression verification, not a separate live-browser
      check): Gate 9 (visual/UX parity, live-browser) — submit the create form with a tampered
      `hazardousEventStatus` value via a direct `fetch`/form-manipulation (not the UI `<select>`,
      which only ever offers valid options) and confirm the request is now rejected
      (`ValidationError` surfaces as a field-level error, not a silently-persisted invalid value).
- [x] 9k.11 Sync `openspec/changes/ca-he-route-adapter-write/specs/hazardous-event-entity/spec.md`
      (new in this round, delta already drafted) against the implementation at archive time (standard
      OpenSpec sync step, same as 2.6/9a.4a/9b.6/9d.16/9g.7/9h.7/9i.8).

## 9l. Stale/tampered validator list on submit-validation rejected before any write (design.md Decision 25, 10.12d review follow-up, user-approved 2026-11-04 — fast-gates-only)

**One finding, closing the one residual gap the 9k.7-9k.9 refactor and its predecessor fix
deliberately left open.** Design.md's earlier "Resolved" note (role-gating + empty-validator-list
moved earlier) explicitly flagged a narrower case as out of scope: a `submit-validation` request
whose validator list is non-empty but entirely stale/tampered against the real tenant-scoped
candidate list, which still wrote the primary record before rejecting. Decision 25 closes it, using
`buildWorkflowComposerCallbacks`'s own `id`-agnostic `getValidCandidateIds` (already extracted by
9k.7) to run the real DB membership check early, in both routes, before
`CreateHazardousEventUseCase.execute()`/`UpdateHazardousEventUseCase.execute()`. Same bookkeeping
as 9k's preamble (fast-gates-only now, heavy gates via 10.12d's extended scope, mutation testing
excluded per 10.11a) — not repeated here.
**Tasks 9k.7/9k.8 are not edited** — they already shipped and are checked off;
design.md Decision 25 instead notes where this section's `buildWorkflowComposerCallbacks` signature
change supersedes 9k.7's prose (which already described `getRecordDisplayName(id)` as taking `id` at
call time, ahead of what 9k.7/9k.8 actually implemented).

- [x] 9l.1 RED: in both `tests/integration/domains/hazardous-events/routes/HazardousEventNewRoute.test.ts`
      and `HazardousEventEditRoute.test.ts`, invert the existing
      `"submit-validation with only stale/invalid validator ids still runs
      Create/UpdateHazardousEventUseCase.execute"` test (do not add a new test alongside it — rename
      and rewrite in place, dropping "flagged for human decision, see report" from the title since
      it's resolved): assert the primary use case (`CreateHazardousEventUseCase.execute`/
      `UpdateHazardousEventUseCase.execute`) is **not** called, the thrown `Response` is still `422`,
      and nothing was written — create: `repository.countAll(tenantId)` unchanged before/after
      (mirroring the empty-validator-list test immediately above it in the same file); edit: the
      event's `description` and `updatedAt` unchanged before/after (mirroring the empty-validator-list
      test immediately above it in `HazardousEventEditRoute.test.ts`). Confirm both now fail against
      the current (unfixed) code — they should still see the primary use case called, since the fix
      isn't built yet.
- [x] 9l.2 GREEN: create `app/domains/hazardous-events/presentation/web/requireValidValidatorIds.server.ts`
      exporting `async function requireValidValidatorIds(args: { mappedAction: MappedWorkflowAction |
      null; parsed: ParsedHazardousEventFormData; getValidCandidateIds: () => Promise<readonly
      string[]>; request: Request }): Promise<readonly string[]>` — returns `[]` immediately (no DB
      call) when `mappedAction !== "submit-validation"`; otherwise calls `getValidCandidateIds()`,
      filters `parsed.validatorUserIds` against it, and if the filtered result is empty throws via
      `throwHazardousEventLoaderError(new ValidationError("At least one validator must be selected for
      submit-validation"), { logMsg: "No valid validator ids remained after candidate-list
      filtering", url: request.url })` — the exact message/logMsg `composeWorkflowAction.server.ts`
      used to throw, moved here verbatim, not reworded. Otherwise returns the filtered list.
- [x] 9l.3 GREEN: change `buildWorkflowComposerCallbacks.server.ts`'s signature to
      `buildWorkflowComposerCallbacks({ tenantId, actingUserId }: { tenantId: string; actingUserId:
      string }): { getRecordDisplayName: (id: string) => Promise<string>; getValidCandidateIds: () =>
      Promise<string[]> }` — `getRecordDisplayName` now takes `id` as a call-time parameter (dropping
      the factory-level `id` 9k.7 added) instead of closing over a factory-supplied `id`; its own
      `GetHazardousEventByIdUseCase` body and comment are otherwise unchanged. `getValidCandidateIds`'s
      body is unchanged.
- [x] 9l.4 GREEN: change `composeWorkflowAction.server.ts`'s args: remove the `getValidCandidateIds: ()
      => Promise<readonly string[]>` parameter, add `validatorUserIds: readonly string[]` in its
      place; delete the filter/empty-check/throw block (current lines ~49-68) entirely, and use
      `args.validatorUserIds` directly where the local `validatorUserIds` variable was previously built
      (the call into `processWorkflowActionUseCase.execute()`). Rewrite the function's header comment
      and the `getValidCandidateIds` JSDoc it removes — correct the "a stale/tampered validator list
      ... needs an async DB lookup the route-level guard doesn't have" claim (no longer true) and the
      false "see design.md's Risks section" citations (9k.3 already established there is no `## Risks`
      heading) to cite design.md Decision 25 instead. No re-check of `validatorUserIds.length === 0`
      is added here — confirmed unnecessary by reading `ProcessWorkflowAction.ts` directly:
      `ProcessWorkflowActionUseCase.execute()` already throws `ValidationError` for an empty
      `validatorUserIds` on `submit-validation` (its own pre-existing lines ~91-98), which remains the
      authoritative backstop for every caller, this route included.
- [x] 9l.5 GREEN: update `new.tsx`'s `action()` — immediately after the existing
      `requireWorkflowActionAuthorized` call and before `createHazardousEventUseCase.execute(...)`,
      call `buildWorkflowComposerCallbacks({ tenantId, actingUserId: session.user.id })` once, then
      `await requireValidValidatorIds({ mappedAction, parsed, getValidCandidateIds, request })`,
      storing the result as `validatorUserIds`. Update the `composeWorkflowAction(...)` call site
      (current lines ~156-169) to pass `getRecordDisplayName: () => getRecordDisplayName(created.id)`
      and `validatorUserIds` instead of spreading `buildWorkflowComposerCallbacks({ ..., id:
      created.id })` directly. Correct the file's own "(design.md Risks, resolved)" comment citations
      to Decision 25.
- [x] 9l.6 GREEN: identical restructuring in `edit.$id.tsx`'s `action()` — call
      `buildWorkflowComposerCallbacks({ tenantId, actingUserId: session.user.id })` and
      `requireValidValidatorIds(...)` immediately after `requireWorkflowActionAuthorized`, before
      `updateHazardousEventUseCase.execute(...)`; update the `composeWorkflowAction(...)` call site
      (current lines ~177-190) to pass `getRecordDisplayName: () => getRecordDisplayName(event.id)`
      and `validatorUserIds`. Same comment-citation correction as 9l.5.
- [x] 9l.7 Verify 9l.1's two inverted tests now pass. Re-run the existing mixed valid/invalid
      validator-id test in both route test files (`"...filters out the invalid id and still
      succeeds..."`) and confirm it still passes unmodified — `ProcessWorkflowActionUseCase.execute`
      must still receive only the valid id, now via the route's own early filter rather than
      `composeWorkflowAction`'s removed one. Re-run the full existing `submit-validation`/
      `direct-validate`/`direct-publish`/plain-save scenario sets in both files to confirm no
      regression. `yarn vitest run` scoped to both route test files, `composeWorkflowAction.server.ts`
      (if it has its own unit test file — confirm and update/remove any test there that drove the
      now-removed `getValidCandidateIds` callback through `composeWorkflowAction` directly), and
      `buildWorkflowComposerCallbacks.server.ts`'s own test file if one exists. `yarn tsc` clean.
      `npx prettier --check` scoped to every file touched by 9l.2-9l.6.
- [x] 9l.8 Fast-gate pass for this section (per the standing instruction, same deferral pattern as
      9f.6/9g.6/9h.6/9i.7/9j.3/9k.10): Gate 9 (visual/UX parity, live-browser via `yarn dev`) — submit
      the create form with `tempAction: submit-validation` and a tampered/stale validator-id list
      (direct `fetch`/form-manipulation, not the UI, which only ever offers real candidates) and
      confirm (a) the request is rejected with the same user-visible error the empty-list case already
      shows, not a generic error page, (b) no new event appears afterward on the HE list page. Repeat
      against an existing `DRAFT` event through the edit route and confirm (a)/(b) equivalently, plus
      that the event's own fields are unchanged. This section's Gates 4/5/6/7/8/10 are covered by the
      10.12d consolidated heavy-gate pass (its scope was extended to 9a-9n, 2026-11-04 — no separate
      `10.12e` task exists). Mutation testing (`test-quality-auditor`) is excluded from this entire
      intent (see 10.11a), not deferred here.
- [x] 9l.9 Sync `openspec/changes/ca-he-route-adapter-write/specs/hazardous-event-write-route-adapter/spec.md`
      against the implementation at archive time (standard OpenSpec sync step, same as
      2.6/9a.4a/9b.6/9d.16/9g.7/9h.7/9i.8/9k.11).

## 9m. submit-draft/resetToDraft role backstop, closing Decision 2's overclaimed uniform-protection gap (design.md Decision 26, 10.12d review follow-up, user-approved 2026-11-04 — fast-gates-only)

**One finding, from the same 10.12d review pass as Section 9l (Decision 25) — independent of it, not
sequential.** Design.md's Decision 2 claimed the entity's own `transition()` guard backstops
`resetToDraft`/`directValidate`/`directPublish` uniformly against a server-side caller bypassing the
UI. That is false for `resetToDraft`: its `allowedFrom` is every status by design (Decision 5/6), so
the entity provides no backstop at all for *who* calls it. `directValidate`/`directPublish` already
have both a narrow `allowedFrom` and an authoritative admin-role check in
`ProcessWorkflowActionUseCase.execute()`; `submit-draft` had neither. Decision 26 adds a minimal,
generic role check (reject `undefined`/`"data-viewer"`, accept everything else) — deliberately not a
replication of HE's own richer status-aware edit-permission rule, which stays at the HE layer. Same
bookkeeping as 9k's preamble (fast-gates-only now, heavy gates via 10.12d's extended scope covering
9l too, mutation testing excluded per 10.11a) — not repeated here.

**Shared-file note, checked, not assumed.** This section and 9l both touch
`composeWorkflowAction.server.ts`, but in disjoint parts: 9l rewrites the `submit-validation` branch
and the function's `validatorUserIds`/`getRecordDisplayName` signature (its own tasks 9l.4); this
section only adds one line (`actingUserRole: args.actingUserRole`) to the unrelated, pre-existing
generic `else` branch that already handles `submit-draft` exclusively. No merge conflict in intent —
confirm this by re-reading the file's current state at 9m.5 time, after 9l has landed, rather than
assuming the disjoint-parts analysis still holds.

**Reachability — see design.md Decision 26's own "Reachability" passage** (`EditData` already
excludes every role this new check would reject, so this fix changes no observable behavior through
HE's existing routes; it is defense-in-depth for a future shared-use-case caller). Tests below
reflect that honestly — no HE-route integration test claims to exercise a rejection that route can't
actually produce.

- [x] 9m.1 RED: in `app/domains/validation-workflow/application/isWorkflowActionAuthorized.test.ts`:
      (a) remove `"submit-draft"` from the existing
      `it.each(["submit-validation", "validate", "publish", "return", "submit-draft"])("%s is
      authorized for every role, including undefined", ...)` array, leaving the four actions that
      stay unrestricted; (b) add a new assertion that `isWorkflowActionAuthorized("submit-draft",
      role)` is `false` for `"data-viewer"`/`undefined`/`""` and `true` for
      `"data-collector"`/`"data-validator"`/`"admin"`; (c) extend the cross-call-site-agreement
      `describe` block's `it.each(["direct-validate", "direct-publish"])` to also cover
      `"submit-draft"` — generalize `tempActionFor` to map `"submit-draft"` to the real `tempAction`
      value `"submit-draft"` (identity, unlike the `"submit-validate"`/`"submit-publish"` indirection
      the other two use), and add `actingUserRole: role` to the `ProcessWorkflowActionCommand`
      literal built for it. This last change will not compile until 9m.4 adds the field to the
      `submit-draft` command variant — that is expected; note it as a compile-time RED (`yarn tsc`
      failure), not a runtime one, and confirm (b)'s runtime assertions fail against the current,
      unfixed `isWorkflowActionAuthorized.ts` (which returns `true` unconditionally for
      `submit-draft` today) once the file compiles again after 9m.4.
- [x] 9m.2 GREEN: `app/domains/validation-workflow/application/isWorkflowActionAuthorized.ts` — add a
      `submit-draft` case: `return false` when `actingUserRole === undefined || actingUserRole ===
      "data-viewer"`; otherwise fall through to the existing `return true`. Correct the function's own
      docstring ("every other action ... is unrestricted") — `submit-draft` is no longer unrestricted;
      `submit-validation`/`validate`/`publish`/`return` remain so (design.md Decision 26, item 1).
- [x] 9m.3 RED: in
      `app/domains/validation-workflow/application/use-cases/ProcessWorkflowAction.test.ts`: (a) add
      `actingUserRole: "data-collector"` to the four existing `submit-draft` command literals (the
      `it` at ~line 1222 "submit-draft calls resetToDraft from any status", the `it` at ~line 1323
      "a successful submit-draft does not call notify", and the `it.each` at ~line 1388 covering
      `submit-draft`/`direct-validate`/`direct-publish`) so they keep compiling and keep passing once
      the field becomes required in 9m.4 — a type-fixup to pre-existing tests, not a behavior change,
      since `"data-collector"` passes the new check; (b) add a new `it.each(["data-viewer",
      undefined])` test: "submit-draft is rejected with AuthorizationError when actingUserRole is
      %s, before findByEntity is called" — asserts `useCase.execute({ action: "submit-draft",
      entityId, entityType, actingUserId, actingUserRole })` rejects with `AuthorizationError` and
      `repo.findByEntity` is NOT called. Confirm (b) fails against the current, unfixed
      `ProcessWorkflowAction.ts` (no such check exists yet; the call resolves instead of rejecting).
- [x] 9m.4 GREEN:
      `app/domains/validation-workflow/application/use-cases/ProcessWorkflowAction.ts` — add
      `actingUserRole: string | undefined` to the `submit-draft` command variant (required, not
      `?:`, matching `direct-validate`/`direct-publish`'s own field shape). In `execute()`, alongside
      the existing admin-only check (~lines 104-110), add: for `command.action === "submit-draft"`,
      throw `AuthorizationError("submit-draft requires an edit-capable role")` when
      `!isWorkflowActionAuthorized("submit-draft", command.actingUserRole)`, before calling
      `workflowRepository.findByEntity()` (design.md Decision 26, item 2).
- [x] 9m.5 GREEN: re-read
      `app/domains/hazardous-events/presentation/web/composeWorkflowAction.server.ts`'s current state
      first (confirm 9l's own edits, if landed, don't shift this) — then add
      `actingUserRole: args.actingUserRole` to the generic `else` branch's
      `processWorkflowActionUseCase.execute({ action: mappedAction, entityId: args.entityId,
      entityType: "HE", actingUserId: args.actingUserId })` call (the branch handling `submit-draft`
      exclusively, per `MappedWorkflowAction`'s own union). `args.actingUserRole` is already a
      parameter of this function (design.md Decision 26, item 3).
- [x] 9m.6 GREEN:
      `app/domains/hazardous-events/presentation/web/requireWorkflowActionAuthorized.server.ts` — add
      an early check for `submit-draft`, mirroring the existing `direct-validate`/`direct-publish`
      block (~lines 30-41): when `mappedAction === "submit-draft" && !isWorkflowActionAuthorized
      ("submit-draft", actingUserRole)`, throw via `throwHazardousEventLoaderError(new
      AuthorizationError("submit-draft requires an edit-capable role"), { logMsg: "Non-edit-capable
      submit-draft request rejected", url: request.url })` (design.md Decision 26, item 4 — confirmed
      dead code through HE's own routes today, added for this file's own established fail-fast
      pattern and consistency, not because it blocks a live request path; see design.md Decision 26
      "Reachability").
- [x] 9m.7 Verify: 9m.1's and 9m.3's new assertions now pass. Re-run the full
      `isWorkflowActionAuthorized.test.ts` and `ProcessWorkflowAction.test.ts` suites, and both
      `tests/integration/domains/hazardous-events/routes/HazardousEventNewRoute.test.ts`/
      `HazardousEventEditRoute.test.ts` to confirm no regression — in particular
      `HazardousEventEditRoute.test.ts`'s existing `"submit-draft composes both use cases..."` test
      (~line 519, role `"data-collector"`) and its partial-success-redirect test (~line 770, role
      `"data-collector"`) still pass unmodified, since `"data-collector"` passes the new check.
      `yarn tsc` clean. `npx prettier --check` scoped to every file touched by 9m.1-9m.6.
- [x] 9m.8 Fast-gate pass for this section (per the standing instruction, same deferral pattern as
      9f.6/9g.6/9h.6/9i.7/9j.3/9k.10/9l.8). Gate 9 (visual/UX parity, live-browser) does not apply in
      its usual form here: per design.md Decision 26's "Reachability" passage, HE's own `EditData`
      gate already excludes every role this check would reject, so there is no live-browser scenario
      through `yarn dev` that can demonstrate a behavior change on either HE route. In its place,
      confirm the fix's only observable effect directly: a tampered/direct
      `ProcessWorkflowActionUseCase.execute({ action: "submit-draft", ..., actingUserRole:
      "data-viewer" })` call (unit-level, already covered by 9m.3/9m.7) is rejected before
      `findByEntity` runs — this is the only way to observe this fix, consistent with it being
      defense-in-depth for a future caller, not a live HE-route behavior change. This section's Gates
      4/5/6/7/8/10 are covered by the 10.12d consolidated heavy-gate pass (its scope was extended to
      9a-9n, 2026-11-04 — no separate `10.12e` task exists). Mutation testing (`test-quality-auditor`)
      is excluded from this entire intent (see 10.11a), not deferred here.
- [x] 9m.9 Sync
      `openspec/changes/ca-he-route-adapter-write/specs/process-workflow-action/spec.md` and
      `specs/hazardous-event-write-route-adapter/spec.md` against the implementation at archive time
      (standard OpenSpec sync step, same as 2.6/9a.4a/9b.6/9d.16/9g.7/9h.7/9i.8/9k.11/9l.9).

## 9n. `GetHazardousEventById.ts` cause-lookup comment correction; DEF-012 register extension (design.md Decision 27, 10.12d review follow-up, user-confirmed inert via direct data check, 2026-11-04 — documentation-only, no behavior change)

**The smallest section of this review pass — one task, no production behavior change.** Last of the
10.12d review findings. The fix is a two-line comment correction in `GetHazardousEventById.ts`
(design.md Decision 27 has the exact before/after text and the mechanics it corrects) plus the
additive clause already applied to DEF-012's own Detail cell in
`_docs/refactoring-plan/deferred-items-register.md` (done as part of writing this change's own
artifacts, not a task below — the register is a shared cross-cutting doc, not code). Nothing here is
behavior-changing: no new test (there is no new behavior to assert against — a comment carries no
runtime effect), no spec sync (9l.9/9m.9 sync a spec because those sections changed observable
behavior; this section changes none, so there is no delta for a spec to describe), and no additional
heavy-gate follow-up beyond 10.12d's own extended scope (mutation testing, SOLID review, the
code-review skill, and the independent second opinion all evaluate production behavior changes, and
this section makes none).

- [x] 9n.1 Correct the two-line comment at `GetHazardousEventById.ts` lines ~76-77 to the exact
      "After" text in design.md Decision 27 (same indentation and `//`/`--` style as the comment it
      replaces). No test is added or changed — this is a comment-only correction with no behavior to
      test; `GetHazardousEventById.test.ts`'s existing coverage of the degrade-to-null path is
      unaffected and needs no new assertion. Run `npx prettier --check
      app/domains/hazardous-events/application/use-cases/GetHazardousEventById.ts` scoped to this one
      file to confirm formatting stays clean. The DEF-012 register extension (already applied to
      `_docs/refactoring-plan/deferred-items-register.md` when this change's artifacts were written)
      and this task itself constitute this section's Gate 9-equivalent verification — there is no
      live-browser-testable behavior change here for a visual/UX parity check to exercise.

## 9o. `submit-draft` allowlist correction, the `requireWorkflowActionAuthorized.server.test.ts` regression, and the stale-citation batch fix (9k-9n heavy-gate pass findings, all independently converged on and user-approved, 2026-11-04 — fast-gates-only, no Gate 9: nothing here is user-visible)

**Three independent findings, one section, all from the same review pass.** 9o.1-9o.2 fix a real
predicate bug: design.md Decision 26's addendum (above) found that `isWorkflowActionAuthorized.ts`'s
`submit-draft` check is a denylist (rejects exactly `undefined`/`"data-viewer"`, accepts everything
else, including a typo'd role or `"super_admin"`), not the allowlist Decision 26 originally claimed.
9o.3 fixes a real, currently-failing regression test — confirmed via `yarn vitest run
app/domains/hazardous-events/presentation/web/requireWorkflowActionAuthorized.server.test.ts`: 1
failed, 10 passed — caused by 9m's own shipped fix (submit-draft now rejects `"data-viewer"`)
outdating a pre-existing test that still asserts the old, unrestricted behavior. 9o.4 batch-fixes 7
stale "design.md Risks section" citations across the codebase (`design.md` has no `## Risks`
heading anywhere — already established at 9k.3/9l.4/DEF-057) that this review's reviewers found were
missed by those earlier per-section fixes. This is bug-fixing and documentation correction on
already-shipped sections, not new behavior — no new test scenarios beyond 9o.1's, no Gate 9.

- [x] 9o.1 RED: in
      `app/domains/validation-workflow/application/isWorkflowActionAuthorized.test.ts`, move `""`
      out of the existing `it.each(["data-collector", "data-validator", "admin", ""])("submit-draft
      is authorized for actingUserRole %s", ...)` array (leaving only the three genuinely
      edit-capable roles there) and into the existing `it.each(["data-viewer",
      undefined])("submit-draft is rejected for actingUserRole %s", ...)` array, alongside a new
      case for a typo'd/garbage role string (e.g. `"data_collector"`, underscore instead of hyphen)
      added to that same rejected-array — this directly exercises the denylist-vs-allowlist
      distinction, since today's denylist incorrectly accepts both `""` and a typo'd role. Confirm
      both new/changed assertions (`""` and `"data_collector"` now expected `false`) fail against the
      current, unfixed denylist code (which returns `true` for both today). This also realigns the
      test with task 9m.1(b)'s own original spec, which already called for `""` to assert `false` —
      the shipped test diverged from its own task.
- [x] 9o.2 GREEN: in `app/domains/validation-workflow/application/isWorkflowActionAuthorized.ts`,
      replace the `submit-draft` denylist with the allowlist from design.md's Decision 26 addendum:
      add a module-level `const EDIT_CAPABLE_ROLES = new Set(["data-collector", "data-validator",
      "admin"]);` and change the `submit-draft` branch to `return actingUserRole !== undefined &&
      EDIT_CAPABLE_ROLES.has(actingUserRole);`. Correct this file's own docstring line describing the
      `submit-draft` rule (currently "rejects undefined/"data-viewer"") to describe the allowlist
      instead (e.g. "submit-draft: accepts only data-collector/data-validator/admin"). Verify 9o.1's
      new/changed assertions now pass, and re-run the full `isWorkflowActionAuthorized.test.ts` suite
      (including the cross-call-site-agreement `describe` block covering `requireWorkflowActionAuthorized`
      and `ProcessWorkflowActionUseCase.execute`) to confirm no other assertion regresses —
      `"super_admin"` was never asserted as accepted by any existing `submit-draft` test, so this is
      the one behavior change with no existing test to flip; confirm directly by re-running the file
      and checking no assertion for it exists or newly fails.
- [x] 9o.3 Fix the regression in
      `app/domains/hazardous-events/presentation/web/requireWorkflowActionAuthorized.server.test.ts`:
      the test `"returns submit-draft for any role without checking validatorUserIds"` (~line 143)
      currently asserts a `"data-viewer"` role still gets `"submit-draft"` back, contradicting 9m's
      own already-shipped fix (submit-draft now rejects `"data-viewer"`) and currently failing
      (confirmed: 1 failed, 10 passed in this file). Checked: no existing "rejected role" test for
      `submit-draft` exists elsewhere in this file to fold this into — the only `submit-draft`
      coverage in this file is this one test. This test's own real purpose — confirming `submit-draft`
      skips the empty-`validatorUserIds` check that `submit-validation` enforces (nothing else in this
      file exercises that) — is independent of the role-authorization question and still needs
      coverage. Change `actingUserRole` from `"data-viewer"` to `"data-collector"` (a genuinely
      edit-capable role with no validator-list check applied to `submit-draft`) and rename the test to
      drop "for any role" (e.g. `"returns submit-draft without checking validatorUserIds"`). This is a
      test correction aligning with 9m's already-shipped behavior, not a new assertion.
- [x] 9o.4 Batch-fix the 7 stale "design.md Risks section"/"design.md's Risks" citations found in this
      review pass, each corrected to point at the real Decision (or deferred-register item) that
      actually covers its topic — verified against design.md's own text per site, not assumed uniform:
      - `app/domains/hazardous-events/presentation/web/HazardousEventFormPage.tsx` ~line 238 (the
        `AttachmentsFormView` comment — "no CA-native upload path exists, flagged in design.md's Risks
        for confirmation") → `DEF-057` is wrong here (that's the spatial-footprint placeholder comment
        at ~line 225, already corrected by 9k.3); this site is about attachments, so correct to
        `DEF-054` (`_docs/refactoring-plan/deferred-items-register.md`, "Attachments are silently
        dropped on every save").
      - `app/domains/hazardous-events/presentation/web/extractFieldError.ts` ~line 21 (the "domain
        ValidationErrors carry none" comment) → this is the "No domain `ValidationError` carries a
        structured field key" finding, documented as an unheaded bullet under design.md's Decision 17
        section — cite it as "design.md, under Decision 17 — no domain ValidationError carries a
        structured field key", not Decision 25 or 26 (neither covers this topic).
      - `app/domains/hazardous-events/presentation/web/requireWorkflowActionAuthorized.server.ts`
        ~line 15 (the "fixes the 'write-then-reject' bug" docstring, covering both the role-gating and
        empty-validator-list checks this function runs) → correct to cite Decision 2/3 (both cover the
        write-then-reject fix for these two checks; Decision 25 covers only the later, narrower
        stale/tampered-but-non-empty-list case, a different scenario).
      - `app/domains/validation-workflow/application/isWorkflowActionAuthorized.test.ts` ~line 73
        (the "both import this one predicate... drift risk... resolved" comment above the
        cross-call-site-agreement `describe` block) → correct to cite Decision 2 (the drift-closure
        finding, in its "Server-side role-gating" paragraph) and Decision 26 (since 9m extended this
        same block to cover `submit-draft` too) — both, not Decision 25.
      - `tests/integration/domains/hazardous-events/routes/HazardousEventNewRoute.test.ts`: the
        `it.each` test-name string at ~line 502 ("a non-admin session requesting %s... is rejected
        with 403... (design.md Risks, resolved)") → Decision 2 (role-gating). The test-name string at
        ~line 546 ("submit-validation with an empty validator list is rejected with 422... (design.md
        Risks, resolved)") → Decision 2/3 (empty-validator-list check), not Decision 25 (which covers
        only the stale/non-empty-but-invalid-list case).
      - `tests/integration/domains/hazardous-events/routes/HazardousEventEditRoute.test.ts`: the
        same two test-name strings at ~line 559 (role-gating → Decision 2) and ~line 632
        (empty-validator-list → Decision 2/3), same corrections as the New-route file above.
      - `openspec/changes/ca-he-route-adapter-write/specs/hazardous-event-write-route-adapter/spec.md`
        ~line 148 (the role-gating requirement's "resolves the write-then-reject gap previously
        recorded in design.md's Risks section" prose) → Decision 2.
      No behavior change in this task — citation-text edits only.
- [x] 9o.5 Verify: `yarn vitest run` scoped to
      `app/domains/validation-workflow/application/isWorkflowActionAuthorized.test.ts` and
      `app/domains/hazardous-events/presentation/web/requireWorkflowActionAuthorized.server.test.ts`
      — both fully green (0 failed), confirming 9o.3's regression is resolved. `yarn tsc` clean.
      `npx prettier --check` scoped to every file touched by 9o.1-9o.4
      (`isWorkflowActionAuthorized.ts`/`.test.ts`, `requireWorkflowActionAuthorized.server.test.ts`,
      `HazardousEventFormPage.tsx`, `extractFieldError.ts`, `requireWorkflowActionAuthorized.server.ts`,
      `HazardousEventNewRoute.test.ts`, `HazardousEventEditRoute.test.ts`, `spec.md`). No Gate 9 —
      nothing in this section changes rendered output or user-observable behavior (the one real
      behavior change, dropping `super_admin` from `submit-draft`'s accepted roles, is unreachable
      through either HE route and has no live-browser scenario to screenshot, same reasoning as 9m.8).
- [x] 9o.6 9o.1-9o.5 passed (orchestrator independently re-verified: `isWorkflowActionAuthorized.test.ts` +
      `requireWorkflowActionAuthorized.server.test.ts` 27/27, broader regression check
      (`HazardousEventNewRoute.test.ts`/`HazardousEventEditRoute.test.ts`/`ProcessWorkflowAction.test.ts`)
      98/98, `tsc` clean) — 10.12d has been ticked.

## 10. Quality gates

- [x] 10.1 Gate 1: `yarn vitest run` on every test file touched across Sections 1-9 — all green.
- [x] 10.2 Gate 2: `yarn tsc` — zero TypeScript errors.
- [x] 10.3 Gate 3: `npx prettier --check <changed files>` scoped to this change's own files only.
- [x] 10.4 Gate 4: anti-pattern review against `.github/skills/anti-pattern-check/SKILL.md`.
- [x] 10.5 Gate 5: `solid-reviewer` agent on the changed use cases, domain entity, and route files —
      pay particular attention to the create/edit action composition logic Section 6/7 may have
      duplicated (flagged explicitly in 7.6).
- [x] 10.6 Gate 6: documentation review by a fresh subagent, full-diff sweep.
- [x] 10.7 Gate 7: project-conventions review against `.github/copilot-instructions.md`.
- [x] 10.8 Gate 8: `.github/skills/code-review/SKILL.md` in full, via a fresh subagent.
- [x] 10.9 Gate 9 (required — this change touches `app/domains/*/presentation/` and `app/routes/`):
      visual/UX parity review against design.md Decision 9's full ground-truth checklist, item by
      item. Via `yarn dev` + Playwright screenshots against real data.
- [x] 10.10 Gate 10: Independent second-opinion review (Claude Code's built-in `/code-review` at
      `high` effort via a second, separate fresh subagent; other tools use an equivalent platform
      feature or skip).
- [x] 10.11 Invoke `test-quality-auditor` scoped to every changed file under `app/domains/**` with
      real implementation logic: `CreateHazardousEvent.ts`, `WorkflowInstance.ts`,
      `ProcessWorkflowAction.ts`, `DrizzleValidatorCandidateRepository.server.ts`, and the new route
      files; resolve any real gap found.
- [x] 10.12 Run `yarn test:run2` (full PGlite suite) — no new failures vs. the base-branch baseline;
      confirm any pre-existing failure is pre-existing, not introduced here.
- [x] 10.12a Gates 1-10 (10.1-10.10) were run and passed before Section 9a existed. Re-run them
      scoped additionally to Section 9a's new files (`HazardousEventListActions.tsx`,
      `HazardousEventListHeader.tsx`, the `_index.tsx` loader/component changes, and the new locale
      keys) once Section 9a is complete — do not archive on the strength of the original pass alone.
      Gate 9 (visual/UX parity) in particular should screenshot-verify the two stacked blocks' order
      and styling against the live legacy page, per design.md Decision 15.

      **Fast-gate re-confirmation (2026-11-04, this round):** heavy gates (4/5/6/7/8/10) for this
      section were already satisfied by the original 10.12d pass per that task's own text. Fast gates
      re-run scoped to this section's files: Gate 1 (`yarn vitest run`, including
      `HazardousEventListActions.test.tsx`/`HazardousEventListHeader.test.tsx`/
      `HazardousEventListPage.test.tsx`/`HazardousEventPickerRoute.test.tsx`/
      `HazardousEventListRoute.test.tsx`) all green; Gate 2 (`yarn tsc`, whole project) clean; Gate 3
      (`npx prettier --check`, scoped) clean; Gate 9 — live-browser screenshot comparison via
      `test.admin@india.gov.in` against the live legacy `/en/hazardous-event` list page confirmed the
      "Add new event" button and the stacked count-header block match legacy's position/styling
      exactly. Confirmed via grep (not git history, since this change is entirely uncommitted) that
      no file this section touches (`HazardousEventListActions.tsx`, `HazardousEventListHeader.tsx`,
      `_index.tsx`) is mentioned anywhere in tasks.md Sections 9e-9n as a file those later sections
      edited.
- [x] 10.11a ~~Invoke `test-quality-auditor` scoped to Section 9d's new files
      (`IHipCrosswalkPort.ts`, `DrizzleHipCrosswalkAdapter.server.ts`) and the two use cases' new
      `IHipCrosswalkPort` composition logic in `CreateHazardousEvent.ts`/`UpdateHazardousEvent.ts`;
      resolve any real gap found.~~ **Skipped — mutation testing determined not necessary for this
      intent** (user decision, 2026-11-04, consistent with skipping it across the whole
      10.12d review pass). `DrizzleHipCrosswalkAdapter.server.ts`'s own `implements` clause
      would in any case crash Stryker (the known `@stryker-mutator/instrumenter`/`@babel/core`
      mismatch, `DEF-041`, a standing tooling limitation — no new deferred-register entry
      registered for it).
- [x] 10.12b Gates 1-10 (10.1-10.10) were run and passed before Sections 9b/9c/9d existed. Re-run them
      scoped additionally to those sections' new/changed files
      (`HazardousEventDetailPage.tsx`/`$id.tsx`, `HazardousEventDiscardModal.tsx`,
      `IHipCrosswalkPort.ts`/`DrizzleHipCrosswalkAdapter.server.ts`/the two use cases' new
      composition, `HazardousEventsModule.server.ts`, and the new locale keys) once Sections 9b-9d are
      complete — do not archive on the strength of the original pass alone. Gate 9 (visual/UX parity)
      in particular should screenshot-verify: the detail page's new Edit/add-cause links' placement
      and order against the live legacy detail page (design.md Decision 16), and the discard modal's
      vertical stacking/button emphasis against the live legacy modal (design.md Decision 9
      addendum).

      **Fast-gate re-confirmation (2026-11-04, this round):** heavy gates for this section already
      satisfied by the original 10.12d pass per that task's own text. Fast gates re-run scoped to
      this section's files: Gate 1 green (`HazardousEventDetailPage.test.tsx`,
      `HazardousEventDetailRoute.test.ts`, `isStatusAwareEditBlocked.test.ts`,
      `requireStatusAwareEditPermission.server.test.ts`, `HazardousEventDiscardModal.dom.test.tsx`,
      `IHipCrosswalkPort.test.ts`, `DrizzleHipCrosswalkAdapter.test.ts`,
      `LinkedHazardousEventOptionsHipCrosswalk.test.ts`, `CreateHazardousEventUseCase.test.ts`/
      `UpdateHazardousEventUseCase.test.ts` PGlite suites, and the two use cases' own unit test
      files); Gate 2 (`yarn tsc`) clean; Gate 3 (`npx prettier --check`, scoped, including both
      locale files) clean; Gate 9 — live-browser comparison via `test.admin@india.gov.in`: a DRAFT
      event's CA detail page shows Edit + add-cause links matching legacy's placement/order exactly;
      a `waiting-for-validation` event's CA detail page correctly shows only the add-cause link (no
      Edit) — legacy's equivalent page shows a "Validate or Return" button instead of Edit in that
      state, which is the out-of-scope approval-action surface design.md Decision 7/`DEF-053`
      already excludes, not a parity gap; the discard-confirmation modal on CA's `/en/he-preview/new`
      matches legacy's vertical stack/button emphasis exactly (opened only, not submitted, to avoid
      a write). Confirmed via grep (not git history, since this change is entirely uncommitted) that
      none of this section's files are mentioned in tasks.md Sections 9e-9n as files those later
      sections edited (`picker.tsx` is edited in 9i, but is not one of this section's files).
- [x] 10.12c Gates 1-10 were run and passed before Section 9e existed. Per the user's explicit
      standing instruction for this whole review pass, only re-run the **fast** gates now, scoped
      additionally to Section 9e's changed files (`HazardousEventFormPage.tsx`,
      `HazardousEventHazardPicker.tsx`, `new.tsx`, `edit.$id.tsx`, both locale files): `yarn vitest
      run` (Gate 1), `yarn tsc` (Gate 2), `npx prettier --check` scoped to those files (Gate 3), and
      Gate 9 (visual/UX parity, live-browser) re-screenshotting all five fixed gaps against the live
      legacy page — padding/containment (Gap 1), banner title + breadcrumb + h2 text (Gap 2), visible
      hazard-picker labels (Gap 3), and the two row-grouping widths plus the computed-width
      measurements from task 9e.11 (Gaps 4/5). Do **not** run Gates 4-8/10 or 10.11 for Section 9e in
      this pass — mutation testing (`test-quality-auditor`), the SOLID review, the anti-pattern/
      documentation/project-conventions reviews, the `code-review` skill, and the independent
      second-opinion review are explicitly deferred to one final consolidated pass across every
      finding from this entire review (Sections 9a-9f together — Section 9f was added after this
      task was first written; see 9f.6 for its own fast-gate pass and this same deferral), not
      skipped. Do not archive on the strength of the original 10.1-10.10 pass, or of
      10.12a/10.12b alone — Section 9e's own files still need their fast-gate pass before that
      final consolidated pass runs.
- [x] 10.12d **Final consolidated heavy-gate pass (per the user's standing instruction for this
      whole review — the one referenced by 10.12c's, 9f.6's, 9g.6's, 9h.6's, 9i.7's, and 9j.3's
      deferral notes).**
      Run once, across every file touched by Sections 9a-9n together, not once per section: Gate 4
      (anti-pattern review), Gate 5 (`solid-reviewer`), Gate 6 (documentation review, fresh
      subagent, full-diff sweep), Gate 7 (project-conventions review), Gate 8
      (`.github/skills/code-review/SKILL.md`, fresh subagent), and Gate 10 (independent
      second-opinion review, Claude Code's built-in `/code-review` at `high` effort via a second,
      separate fresh subagent). This satisfies 10.12a's and 10.12b's own "re-run Gates 1-10"
      requirement for their respective sections' heavy gates (their own fast gates — 1/2/3/9 — were
      already covered per-section by 10.12a/10.12b/10.12c/9f.6/9g.6/9h.6/9i.7/9j.3) as well as 9e's,
      9f's, 9g's, 9h's, 9i's, and 9j's explicitly deferred heavy gates, and (scope extended this
      round, 2026-11-04) 9k's/9l's/9m's own deferred heavy gates once those sections existed — this
      is the pass 9k/9l/9m's own preambles point to; no separate `10.12e` task is created. Mutation
      testing (`test-quality-auditor`) is excluded from this entire intent per the user's standing
      decision (2026-11-04, see 10.11a) — not run here or anywhere else in this gate pass. Every
      finding was resolved with the human (fix-vs-defer joint calls, 2026-11-04): the regression in
      `requireWorkflowActionAuthorized.server.test.ts` was fixed, the `submit-draft` denylist was
      converted to an allowlist, and the stale-citation batch (Section 9o) landed and passed its own
      fast gates, independently re-verified by the orchestrator (27/27 + 98/98 relevant tests,
      `tsc` clean). Box ticked.
- [x] 10.13 Run `opsx:archive` on this branch before raising the PR.
