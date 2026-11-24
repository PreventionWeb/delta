## 1. Blocking decisions (human, before any code)

- [x] 1.1 Record the user's decisions in design.md "Resolved Decisions" (2026-11-23): OD-1 final
      (no folder merge in 6b; `legacy-exempt`; build on `app/design-system/components/`), OD-2 A,
      OD-3, OD-4, OD-5, OD-5b (no support-contact line), OD-6, OD-7 (enrolled), OD-8, OD-9, OD-10,
      OD-11, ED-1 (all three producers), ED-2 (`{ field }` only), ED-3 (no logging), and the
      withdrawn `#666` fix. **Verify:** the table lists all of them and no open decision remains.
- [x] 1.2 Feature-prototype `not-required` exception (OD-1/OD-6) and design-system pin (OD-9)
      approved and recorded. **Verify:**
      `yarn check:design-system --verify-spec --change ca-he-error-boundary --base origin/dev` passes.

## 2. Infrastructure: 22P02 to not-found (TDD, PGlite)

- [x] 2.1 Red: in `tests/integration/db/queries/DrizzleHazardousEventRepository.test.ts` add a
      test that `findById("not-a-uuid", tenantId)` rejects with `NotFoundError`. Before it, add a
      probe assertion that PGlite surfaces SQLSTATE `22P02` readable by `pgErrorCode` (catch the
      raw error from a direct query); if PGlite does not, move these repository tests to a
      `test:run3` file and record why in design.md D2. **Verify:**
      `yarn vitest run tests/integration/db/queries/DrizzleHazardousEventRepository.test.ts` fails
      on the NotFoundError assertion only.
- [x] 2.2 Red: add the remaining repository scenarios ("Read-by-id methods treat a malformed id
      as not found"): `findByIdForUpdate` inside a tx rejects with `NotFoundError`;
      `delete("not-a-uuid", …)` resolves normally and every `hazardous_event`, `event_relationship`
      and `event` row remains; `delete` with a malformed id inside a caller `tx` leaves that `tx`
      usable for a following query; malformed vs missing give the same `code`; a non-22P02 driver
      error still propagates unchanged; two concurrent malformed lookups each reject and a later
      query on the same db still succeeds. **Verify:** new tests fail for the expected reason.
- [x] 2.3 Red (route level, before Green): malformed-id route tests: `HazardousEventDetailRoute`
      `not-a-uuid` → 404 `NOT_FOUND`; `HazardousEventEditRoute` loader and action → 404;
      `HazardousEventNewRoute` `?parent=not-a-uuid` → 404; create/edit action with a malformed
      `causeId` → same outcome as an unknown UUID and no row written;
      `HazardousEventDeleteRoute` `delete/not-a-uuid` → 404
      `{ ok:false, messageKeys:["delete.not_found"] }`, nothing deleted; `HazardousEventListRoute`
      `?hazardTypeId=not-a-uuid` → 200 (existing filter behaviour pinned). **Verify:** all except
      the list case fail against current code.
- [x] 2.4 Use-case Red: in `tests/integration/domains/hazardous-events/CreateHazardousEventUseCase.test.ts`
      and `UpdateHazardousEventUseCase.test.ts` add a malformed `causeId` case asserting the same
      error class as an unknown well-formed `causeId` and that no row is written. **Verify:** fail
      against current code.
- [x] 2.5 Green: in `DrizzleHazardousEventRepository.server.ts` map `pgErrorCode(err) === "22P02"`
      to `NotFoundError("HazardousEvent", id)` in `findById` and `findByIdForUpdate`, and to a
      normal no-op return in `delete`; leave `mapWriteError` untouched (design.md D2). **Verify:**
      2.1-2.4 pass.

## 3. Presentation: pure error-to-view mapper (TDD, unit)

- [x] 3.1 Red: `app/domains/hazardous-events/presentation/web/mapRouteErrorToView.test.ts` covering
      404/403/400/422/409/500/other status, a non-Response `Error`, a string, `undefined`, an
      envelope with/without/empty/non-string `traceId`, a string `data` body, and that
      `details`/`message` never appear in the returned view. **Verify:**
      `yarn vitest run app/domains/hazardous-events/presentation/web/mapRouteErrorToView.test.ts` fails (module missing).
- [x] 3.2 Green: implement `mapRouteErrorToView` and the `HazardousEventErrorKind` /
      `HazardousEventErrorView` types (design.md D1). **Verify:** 3.1 passes.

## 4. Presentation: error envelope for unexpected errors (TDD, PGlite route tests)

- [x] 4.1 Red: update every existing route test that asserts the raw error is rethrown so it
      asserts the new spec instead (500 Response, `error.code` `INTERNAL_ERROR`, no original
      message, no `details`, `traceId` from `withRequestContext`, logger called once):
      `HazardousEventDetailRoute.test.ts:408`, `HazardousEventListRoute.test.ts:608`,
      `HazardousEventDeleteRoute.test.ts:641` (`thrown` becomes the 500 Response, still no toast
      data), and re-check `HazardousEventEditRoute.test.ts:966` / `HazardousEventNewRoute.test.ts:801`
      (they assert the envelope for an unmapped error; update if they cover a non-DomainError).
      Add: a thrown redirect `Response` passes through untouched; two concurrent failing requests
      keep their own trace ids. **Verify:** the updated tests fail against the current helper.
- [x] 4.2 Green: change the non-DomainError branch of `throwHazardousEventLoaderError.server.ts`
      (design.md D4); keep the `error` log. If OD-11 = A, also route the listed unwrapped call
      sites through the helper, with a test per site. **Verify:** 4.1 passes and
      `yarn vitest run tests/integration/domains/hazardous-events/routes` is green.

## 5. Routes: namespace order and ErrorBoundary export (TDD, PGlite)

- [x] 5.1 Red: in each of `HazardousEvent{List,Detail,New,Edit,Picker}Route.test.ts` add: a
      ViewData/EditData-denied request asserts a 403 Response **and** that the request's i18n
      instance already has `hazardous-events` loaded (French request for the detail case); the
      edit loader 404 asserts the same; unauthenticated still redirects. **Verify:** new
      namespace assertions fail.
- [x] 5.2 Green: move `loadNamespaces(["hazardous-events","common"])` to the first awaited line of
      the `_index`, `$id`, `new`, `edit.$id`, `picker` loaders and the `new`/`edit.$id` actions
      (edit action gains `context`); add
      `export { HazardousEventErrorBoundary as ErrorBoundary }` to those five route modules only
      (not `delete.$id.tsx`, OD-10) once group 6 provides the component. **Verify:** 5.1 passes;
      `yarn tsc` clean.

## 6. Presentation: boundary component and copy (TDD, DOM)

- [x] 6.1 Add the `error.*` keys from the spec table to `locales/en/hazardous-events.json` and
      `locales/fr/hazardous-events.json`; run `yarn i18n:extractor` if it covers this namespace.
      **Verify:** a unit test loads both files and asserts every key in the spec table exists and
      is non-empty, and no value contains an em dash.
- [x] 6.2 Red: `HazardousEventErrorBoundary.dom.test.tsx` (pattern:
      `tests/unit/domains/notices/presentation/NoticeErrorBoundary.test.tsx`): renders title/body per
      kind; heading level below the page title; `role="alert"`; icon `aria-hidden`; trace row only
      when a traceId exists; copy writes exactly the id and announces "Error reference copied";
      missing or rejecting clipboard keeps the page rendered and announces nothing; back link
      href `/{lang}/he-preview`; "[object Object]", SQL text, `details` and `error.message` never
      rendered; no support-contact line (OD-5b); FR rendering. **Verify:** fails (component missing).
- [x] 6.3 Green: implement `HazardousEventErrorBoundary.tsx` per design.md D6 with HE's
      legacy-parity set `~/design-system/components/` (`Button` for copy, `BackLink`), the legacy
      classes other he-preview pages use, and a `lucide-react` icon. Do not import or change
      `app/design-system/ui/` (OD-1). No new hex values or arbitrary px. **Verify:** 6.2 passes.
- [x] 6.4 Documentation only: add `app/design-system/components/README.md` stating that this folder
      is the Hazardous Events legacy-parity component set, must not be used for new screens (new
      screens use `app/design-system/ui/`), and is removed when HE's UI is upgraded to the new
      design system (merge tracked by DEF-014). Do not change `scripts/check-design-system.ts` or
      any component. **Verify:** file exists;
      `tests/unit/design-system/components/imports.test.ts` still green (it scans only `.ts`/`.tsx`).

## 7. End-to-end (Playwright)

- [x] 7.1 Add `tests/e2e/hazardous-events/he-preview-error-boundary.spec.ts`: missing UUID on
      detail (404, title, site header present, no "Return to Home"); `not-a-uuid` on detail and
      edit (404, no "Failed query"); FR not-found copy; trace reference visible and copy button
      copies it (grant clipboard permission in the context); back link navigates to the list;
      a forced unexpected error shows "Something went wrong" with an error reference (use a route
      request that reaches the D4 path without app changes if one exists; otherwise record in the
      task note that this state is covered by DOM + PGlite tests only). No data created; if a
      test must create an event, delete it via the CA UI and assert no orphan `workflow_instance`
      rows. **Verify:** `yarn test:e2e tests/e2e/hazardous-events/he-preview-error-boundary.spec.ts` passes (PORT=4000).
- [x] 7.2 Run the existing `he-preview*.spec.ts` files to confirm no regression (delete toasts
      unchanged). **Verify:** all pass.

## 8. Envelope `details` limited to field-level validation (design.md D8)

- [x] 8.1 Red: `tests/unit/shared/errors/toErrorResponseDetails.test.ts`: `ValidationError` with
      `{ field }` → `{ field }`; extra keys dropped; non-string `field` → undefined; no context →
      undefined; `NotFoundError`, `AuthorizationError`, `ConflictError`,
      `ConcurrentModificationError` → undefined; nothing is logged for dropped context (ED-3). **Verify:** fails (module missing).
- [x] 8.2 Green: implement `app/shared/errors/toErrorResponseDetails.ts` and export it from
      `app/shared/errors/index.ts`. **Verify:** 8.1 passes.
- [x] 8.3 Red then Green (HE): in HE route tests add the spec scenarios "Extra context keys on a
      ValidationError are dropped", "Conflict context is never sent", and a not-found body without
      id/entity; keep `HazardousEventListRoute.test.ts:489` (`{ field: "page" }`) unchanged; then
      use the rule in `throwHazardousEventLoaderError.server.ts`. **Verify:** HE route tests green.
- [x] 8.4 Red then Green (Notices, ED-1): update the Notices route test for
      `{ entity, id }` (details now absent), add the `ValidationError` `{ field }` case
      (`NoticesIndexRoute.test.ts:274` stays), then use the rule in
      `throwNoticeLoaderError.server.ts`. **Verify:** `yarn vitest run tests/integration/domains/notices` green.
- [x] 8.5 Red then Green (shared REST filter, ED-1): in
      `tests/integration/nestjs/DomainErrorFilter.test.ts` flip `:213-216` to "no details, no id in
      body", add the `{ field, tenantId }` → `{ field }` case and the concurrent case; keep
      `:219-223` and `:315-321`; then use the rule in `DomainErrorFilter.server.ts` (keep `context`
      as i18n args). **Verify:** file green; Notices REST tests green.

## 9. Verification (quality gates, in order)

- [x] 9.1 Quality gate 1 of 10: `yarn vitest run` on every test file touched in groups 2-8; all green.
- [x] 9.2 Quality gate 2 of 10: `yarn tsc`; zero errors.
- [x] 9.3 Quality gate 3 of 10: Prettier clean, scoped: `npx prettier --check <changed files>`
      (never repo-wide `yarn format`; preview any `--write` on a copy first).
- [x] 9.4 Quality gate 4 of 10: anti-pattern review against `.github/skills/anti-pattern-check/SKILL.md`.
- [x] 9.5 Quality gate 5 of 10: SOLID review, invoke `solid-reviewer` on the diff; report findings
      to the human with reasoning (fix vs defer is a joint call).
- [x] 9.6 Quality gate 6 of 10: documentation review via a fresh subagent: comments explain WHY
      not WHAT, terse; one full-diff sweep before the final report.
- [x] 9.7 Quality gate 7 of 10: project conventions review against `.github/copilot-instructions.md`.
- [x] 9.8 Quality gate 8 of 10: code review, run `.github/skills/code-review/SKILL.md` in full via a
      fresh subagent; report findings to the human.
- [x] 9.9 Quality gate 9 of 10 (required: touches `app/domains/*/presentation/`, `app/routes/`;
      `ui-classification: legacy-exempt`). Gate 9a:
      `yarn check:design-system --verify-spec --change ca-he-error-boundary --base origin/dev` passes
      (spec metadata verified; token scans are skipped for legacy-exempt; local `dev` is stale), plus
      the design-system-check skill items that still apply to legacy-exempt code: no PrimeReact
      imports, Lucide icons only, accessible names on icon-only controls, no em dashes, sentence-case
      new copy; record the legacy-exempt status in the Gate 9 report. Gate 9b (full, unchanged by
      legacy-exempt): `runWcag22A11yCheck` (`tests/e2e/helpers/a11y.ts`) on not-found EN/FR,
      malformed id and unexpected states; `verifyKeyboardSequence` Tab, copy (Enter announces), Tab,
      back link; 24 x 24 px targets; visible, unobscured focus. Gate 9c (legacy parity, not
      prototype parity): `capturePrototypeStateScreenshots` (`tests/e2e/helpers/prototype-evidence.ts`)
      for those states at desktop and 375 px into `test-results/gate-9/ca-he-error-boundary/`; score
      the design.md ground-truth checklist against legacy HE (the legacy root boundary for shared
      elements, the other he-preview pages for header, buttons and back link) in
      `openspec/changes/ca-he-error-boundary/evidence/gate-9-report.md`; audit by a fresh subagent
      running `visual-parity-reviewer` and the design-system-check skill.
- [x] 9.10 Quality gate 10 of 10 (Claude Code only): built-in `code-review` at `high` effort via a
      second, separate fresh subagent; report findings to the human before archiving.
- [x] 9.11 Test quality: invoke `test-quality-auditor` (Stryker) scoped to the changed
      `app/domains/**` logic files only: `mapRouteErrorToView.ts`,
      `throwHazardousEventLoaderError.server.ts`, the changed methods of
      `DrizzleHazardousEventRepository.server.ts`, and the changed HE route files only if they gain
      logic. `app/shared/errors/toErrorResponseDetails.ts` is outside `app/domains/**`; include it
      only if the human asks. Resolve any real gap; a Stryker tooling
      limitation is noted in design.md, not registered as a new DEF item.
- [x] 9.12 Regression: `yarn test:run2` (full PGlite suite) passes with no new failures; any failure
      claimed pre-existing is proven by running the same suite on the base branch
      (`feature/he-ca-phase6`) and comparing.

## 11. Review round 2 (user decisions 2026-11-24)

- [x] 11.1 Artifacts: A1 (spec wording limited to `details` and ids), A2 (validator-ids wrap in
      scope; auth/session/tenant awaits out of scope), C1-C3 and B1 recorded as approved
      deviations, D (D2 wording, Risks, repository-port spec), E2 (neutral 403 copy in the spec
      table); DEF-062 (B2 focus ring) and DEF-063 (E3 duplicate submit) added to the register.
- [x] 11.2 D, Red then Green: repository `findById`/`findByIdForUpdate`/`delete` reject a
      malformed id before querying (caller tx stays usable; uppercase id still resolves); a
      malformed `tenantId` surfaces as a driver error. Round 3: the unreachable 22P02 backstop and
      its probe test removed (user, 2026-11-24).
- [x] 11.3 A2, Red then Green: `requireValidValidatorIds` failure in the create and edit actions
      becomes the 500 envelope.
- [x] 11.4 E1, Red then Green: a second copy re-announces "Error reference copied".
- [x] 11.5 E2, Red then Green: neutral 403 copy in EN/FR locales and tests.
- [x] 11.6 B1, Red then Green: `BackLink` text and border use `--color-dts-action`;
      `BackLink.test.tsx` and detail-page pins updated; strict axe E2E passes with the back link.
- [x] 11.7 Re-run gates: touched Vitest files, `tsc`, scoped Prettier, `check:design-system`,
      new E2E spec + he-preview detail E2E, targeted Gate 9 re-check, mutation testing on changed
      logic files.

## 10. Human approval and archive

- [x] 10.1 Present the final state (diff summary, gate results, Gate 9 report, any deferred
      findings) to the human and get explicit approval to archive. **Verify:** approval recorded
      in chat.
- [x] 10.2 Update `_docs/refactoring-plan/hazardous-events-refactoring-roadmap.md` 6b to Complete and
      remove the "Check at propose time" note; tick every checkbox in this file (including 10.3)
      before archiving. **Verify:** no unchecked boxes remain.
- [x] 10.3 Run `opsx:archive` for `ca-he-error-boundary` on this branch before raising the PR
      (targets `feature/he-ca-phase6`). **Verify:** change moved under `openspec/changes/archive/`
      and specs synced.
