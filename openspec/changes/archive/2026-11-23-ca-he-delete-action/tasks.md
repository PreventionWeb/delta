## 1. Blocking decisions (resolved with the human, 2026-11-23)

- [x] 1.1 OD-1 decided (user-approved): the status-aware rule is enforced server-side, a
      data-collector on `null` workflow status is blocked, a data-collector on `REJECTED` is
      allowed, and D1's 403-on-authorization-failure is accepted. Recorded in design.md OD-1 and
      spec.md "Delete is gated by role and workflow status".
- [x] 1.2 OD-2 decided (user-approved): Option A. CA keeps blocking causal and event-causality
      links. There is no use-case change and no `delete-hazardous-event` delta spec. Recorded in
      design.md OD-2 and spec.md's blocked-delete requirement.
- [x] 1.3 OD-3 decided (user-approved): DEF-044 keeps blocking with the friendly caused-by
      message. This resolves DEF-044; its row is deleted at archive (task 10.1).
- [x] 1.4 OD-4 decided (user-approved): Option A, a new design-system `Toast` on React Aria
      `UNSTABLE_ToastRegion` (tasks 4.5/4.6).
- [x] 1.5 OD-5 decided (user-approved): the success redirect drops the query string. D2's draft EN
      copy is approved as written. Recorded in design.md and spec.md.

## 2. Pure presentation helpers (TDD)

- [x] 2.1 Red: write `app/domains/hazardous-events/presentation/web/isStatusAwareDeleteBlocked.test.ts`
      covering every role × {each `Status`, `null`} cell of design.md's OD-1 table.
      This includes `super_admin`, `undefined`/`null` role, and the `REJECTED`/`null` decisions.
      **Verify:** `yarn vitest run app/domains/hazardous-events/presentation/web/isStatusAwareDeleteBlocked.test.ts`
      fails.
- [x] 2.2 Green: implement `isStatusAwareDeleteBlocked.ts` as a pure, isomorphic module (no
      `.server` suffix), in the same style as `isStatusAwareEditBlocked.ts`. **Verify:** the 2.1
      test passes.
- [x] 2.3 Red: write `mapDeleteErrorToMessageKey.test.ts`. **Verify:** it fails. Cover:
  - each single dependent type;
  - all three dependent types together, in order DISASTER_EVENT, EVENT_CAUSALITY, CAUSAL_CHAIN;
  - EVENT_CAUSALITY with `crossTenantReferenceExists: true`, `count: 0` (no count rendered);
  - the dependent-less DEF-044 `ConflictError`;
  - `NotFoundError`;
  - an `AuthorizationError` maps to `delete.forbidden` (amended); an unknown error returns
    `null`, so the caller rethrows;
  - the mapping never reads `err.message`.
- [x] 2.4 Green: implement `mapDeleteErrorToMessageKey.ts`. **Verify:** the 2.3 test passes.

## 3. Route action `delete.$id.tsx` (TDD, PGlite)

- [x] 3.1 Red: create `tests/integration/domains/hazardous-events/routes/HazardousEventDeleteRoute.test.ts`
      with `import "../../../db/setup"`. Mock `~/init.server` and `~/utils/session` exactly as
      `HazardousEventEditRoute.test.ts` does, and seed through `hazardousEventTestHelpers`.
      **Verify:** `yarn vitest run tests/integration/domains/hazardous-events/routes/HazardousEventDeleteRoute.test.ts`
      fails for the right reason (module missing / behavior absent). Cases:
  - success: redirect to the bare `/he-preview` (no query string) with a flash `Set-Cookie`; the `hazardous_event`,
    `event` and `workflow_instance` rows are gone; one `audit_logs` row with action `delete`;
  - missing id: no delete; returns `{ ok:false }` with the not-found key and a 4xx status, not a
    thrown Response;
  - foreign-tenant id: as missing, and its row is untouched;
  - a `disaster_event` reference: DISASTER_EVENT key, row intact;
  - an `event_causality` row to another tenant's DE: EVENT_CAUSALITY key, and the response
    contains no cross-tenant count;
  - a `hazardous_event_causality` edge, cause side and effect side separately: CAUSAL_CHAIN key;
  - an outgoing `event_relationship` (DEF-044): caused-by key, rolled back;
  - a role without `EditData`: the action returns `delete.forbidden` with a 403 (amended: data,
    not a thrown Response) and nothing is deleted;
  - a data-collector on a `PUBLISHED` event, and on an event with no `workflow_instance` row, gets
    `delete.forbidden` with a 403 and nothing is deleted; a data-collector on a `REJECTED` event succeeds;
  - concurrent: two `action()` calls via `Promise.all` for the same zero-dependent event give
    exactly one deletion and one audit row; neither throws; each returns either the redirect or
    the not-found key;
  - sequential repeat: a second call after the first completes returns the not-found key.
- [x] 3.2 Green: implement `app/routes/$lang+/_authenticated+/he-preview+/delete.$id.tsx`
      (action only) per design.md D1. The route file must contain no business logic inline.
      **Verify:** the 3.1 test passes. Steps:
  - `requireUser`, then `resolveTenantId`, then `requireEditDataPermission`;
  - then the OD-1 status gate: add `requireStatusAwareDeletePermission` to
    `requestAuthorizationGuards.server.ts`, reading `workflowStatus` through
    `GetHazardousEventByIdUseCase`. Amended: it throws `AuthorizationError`, which the route
    returns as `delete.forbidden`;
  - then `getAppContext().get(DeleteHazardousEventUseCase).execute(...)`;
  - map expected errors via 2.4 and return them; send unknown errors through
    `throwHazardousEventLoaderError`;
  - validate lang via `getLanguageAllowDefault`; translate the success flash via the request's
    i18next instance.

## 4. Design-system additions

- [x] 4.1 Red: extend `app/design-system/components/Button.test.tsx` for a `danger-outline`
      variant: it renders a native button with the variant's classes and any icon child.
      **Verify:** fails.
- [x] 4.2 Green: add the `danger-outline` variant to `Button.tsx` (Tailwind palette classes only,
      no hard-coded pixel values; shape per design.md D4). **Verify:** 4.1 passes.
- [x] 4.3 Red: extend `app/design-system/components/Dialog.dom.test.tsx`. With the new
      outside-click opt-out set, clicking the overlay does not call `onOpenChange(false)` and
      Escape still does. Without it, the existing behavior is unchanged. **Verify:** fails.
- [x] 4.4 Green: add the outside-click opt-out prop to `Dialog.tsx` (design.md D4), plus the
      `variant="confirm"` legacy ConfirmDialog chrome (D4, amended at Gate 9). **Verify:** 4.3
      passes and the existing Dialog tests still pass.
- [x] 4.5 Red: write `app/design-system/components/Toast.dom.test.tsx`.
      **Verify:** fails. Cover:
  - the toast renders its message with error/info semantics;
  - it auto-dismisses after its configured life;
  - it can be dismissed manually;
  - it is announced through a live region.
- [x] 4.6 Green: implement `app/design-system/components/Toast.tsx` on
      `react-aria-components`' `UNSTABLE_ToastRegion`/`UNSTABLE_ToastQueue`, positioned
      top-center, styled after legacy's PrimeReact error toast with Tailwind/existing classes.
      **Verify:** 4.5 passes.

## 5. `HazardousEventDeleteButton` and list-page wiring (TDD, jsdom)

- [x] 5.1 Red: write `HazardousEventDeleteButton.dom.test.tsx`. **Verify:** fails. Cover:
  - the trigger has accessible name "Delete" and the trash sprite;
  - clicking opens the dialog with the exact title, body and button order (from i18n keys);
  - "Do not delete", the close control and Escape each close the dialog with no submit;
  - an overlay click leaves it open, with no submit;
  - "Delete permanently" submits exactly one POST to `/{lang}/he-preview/delete/{id}` and closes
    the dialog;
  - while submitting, the trigger is in React Aria's pending state (amended from disabled) and
    shows `dts-spinner`;
  - a double activation sends one request;
  - a returned `{ ok:false, messageKeys }` shows one error toast with the translated messages, in order.
- [x] 5.2 Green: implement `HazardousEventDeleteButton.tsx` (`useFetcher`, design-system `Dialog`
      plus `Button`; the "Do not delete" variant chosen per design.md D5 item 3 and
      `danger-outline`; no PrimeReact import). **Verify:** 5.1 passes.
- [x] 5.3 Red: extend `HazardousEventListPage.test.tsx` (or the matching `.dom.test.tsx`).
      **Verify:** fails. Cover:
  - admin rows show Edit/View/Delete in order;
  - data-viewer rows show an invisible same-size placeholder in the third slot;
  - data-collector rows follow design.md's OD-1 table: `DRAFT` and `REJECTED` shown; `PUBLISHED`
    and no workflow status hidden;
  - with `renderActionsCell` supplied, no Delete control renders.
- [x] 5.4 Green: wire the Delete slot into `HazardousEventListPage.tsx`'s default actions cell,
      gated by `roleHasPermission(role, "EditData") && !isStatusAwareDeleteBlocked(role, item.workflowStatus)`,
      using the same placeholder pattern as the Edit slot. **Verify:** 5.3 passes, and the
      existing `HazardousEventPickerPage` tests still pass.

- [x] 5.5 (User-approved addition, Gate 9) Lay the default actions cell out on legacy
      `ActionLinks`' grid: 3 × 2.25rem tracks, a 0.25rem column gap and centred items, so the icon
      spacing matches legacy. Placeholders keep their slot. **Verify:** the
      `HazardousEventListPage.test.tsx` grid assertion passes, and Gate 9 compares the row
      against legacy.

## 6. i18n

- [x] 6.1 Add the design.md D2 keys plus the dialog's title, body, both button
      labels and close label to `locales/en/hazardous-events.json` and
      `locales/fr/hazardous-events.json` by hand. Do not run `yarn i18n:extractor`; it parses
      legacy `ctx.t({ code, msg })` only. **Verify:** 5.1/5.3 tests resolve the real keys; no
      missing-key warnings in the dom tests.

## 7. E2E (Playwright), including DEF-003's delete-guard variant

- [x] 7.1 Write `tests/e2e/hazardous-events/he-preview-delete.spec.ts`. Seed with plain Drizzle
      inserts (the `he-preview.spec.ts` precedent) and clean up all seeded rows in `afterAll`.
      **Verify:** `yarn test:e2e tests/e2e/hazardous-events/he-preview-delete.spec.ts` passes
      (PORT=4000). Cases:
  - admin deletes a zero-dependent event: confirm dialog, "Record deleted" toast, row gone;
  - Cancel keeps the row;
  - a dependent-blocked delete (event referenced by a seeded `disaster_event`): error toast with
    the DISASTER_EVENT message, row still present, the DB row still exists;
  - a DEF-044 outgoing `event_relationship` block: caused-by message, not an error page.

## 8. Verification (quality gates, in order)

- [x] 8.1 `yarn vitest run` on every test file touched above. All green.
- [x] 8.2 `yarn tsc`: zero TypeScript errors.
- [x] 8.3 `npx prettier --check <changed files>`: clean. Scoped to changed files only; never a
      repo-wide `yarn format`.
- [x] 8.4 Anti-pattern review against `.github/skills/anti-pattern-check/SKILL.md`. No `as any`;
      tenant scoping on every lookup; no PrimeReact import in new presentation files.
- [x] 8.5 SOLID review: invoke the `solid-reviewer` agent on the diff. Report findings to the human
      with reasoning; fix-vs-defer is a joint call.
- [x] 8.6 Documentation review: comments explain WHY, not WHAT, and are compacted. Do one full-diff
      sweep before the final report, not just each round's delta.
- [x] 8.7 Project conventions review against `.github/copilot-instructions.md`.
- [x] 8.8 Code review: run `.github/skills/code-review/SKILL.md` in full via a fresh subagent.
- [x] 8.9 Visual/UX parity review (Gate 9): invoke the `visual-parity-reviewer` agent against the
      design.md D5 checklist and the `reference/` screenshots in this change folder. Compare the
      list row slot, the trigger, the dialog (layout, copy, button order, emphasis and color,
      width, outside-click behaviour), the success toast and the blocked toast against legacy
      `/en/hazardous-event` side by side. Do not use computed-style readings as ground truth; read
      the actual class/CSS definitions.
- [x] 8.10 Independent second-opinion review (Claude Code only): invoke the built-in `code-review`
      at `high` effort via a second, separate fresh subagent. Resolve findings before archiving.
- [x] 8.11 Test quality: invoke `test-quality-auditor` scoped to the changed `app/domains/**` files:
      `isStatusAwareDeleteBlocked.ts`, `mapDeleteErrorToMessageKey.ts`,
      `HazardousEventDeleteButton.tsx`, `HazardousEventListPage.tsx`, and
      `requestAuthorizationGuards.server.ts` if changed. Resolve any real gap found.

## 8b. User decisions on review findings (2026-11-23)

- [x] 8b.1 (A) Revalidate the list after any `ok:false` result, so a not-found row disappears as
      in legacy. 404 status kept. **Verify:** dom revalidation tests and E2E.
- [x] 8b.2 (B) Role/status rejection returned as a `delete.forbidden` toast with a 403, not a
      thrown Response. List revalidated. EN/FR copy added. D1, spec.md and route tests updated.
- [x] 8b.3 (E) DEF-044 is identified by an explicit `context.reason` marker that the repository
      sets (`OUTGOING_EVENT_RELATIONSHIP_CONFLICT`, exported from the port). Every unmarked
      dependent-less conflict maps to `delete.blocked.generic`. Both are covered by repository
      integration and mapper unit tests.
- [x] 8b.4 (G) Trigger uses React Aria `isPending` (design-system `Button` `pending` prop)
      instead of `disabled`; focus-return test added.
- [x] 8b.5 C and F recorded in design.md Risks as known limitations with revisit points, D
      accepted (one line). No register rows for them.

- [x] 8b.6 (User-approved 2026-11-23) The explicit DEF-044 marker replaces the context-shape
      heuristic (see 8b.3). All EN/FR delete copy is approved (design.md D2).
- [x] 8b.7 Re-run mutation testing on `mapDeleteErrorToMessageKey.ts` only.

## 9. Regression

- [x] 9.1 `yarn test:run2` (full PGlite suite) MUST pass with no new failures. Any pre-existing
      failure must be confirmed pre-existing by running the suite on the base branch and
      comparing by test name, not assumed.

## 10. Non-code housekeeping (at archive time, after merge approval, not during implementation)

- [x] 10.1 Delete the DEF-044 row from `_docs/refactoring-plan/deferred-items-register.md` (resolved
      by OD-3, user-approved 2026-11-23); resolved rows are removed, never annotated. Do this at
      archive time, not before.
- [x] 10.2 DEF-003: leave the row in place (it also covers parent-linking and approval-transition
      variants). Note in the PR that the delete-guard variant is now covered by 7.1.
- [x] 10.3 Update the roadmap's `6l` entry status in
      `_docs/refactoring-plan/hazardous-events-refactoring-roadmap.md`.
- [x] 10.4 Present design.md's "Out of scope findings" (orphan `workflow_instance` rows,
      legacy-JSONB attachment files, legacy bugs) to the human for a register decision. Do not
      add register rows unilaterally.

## 11. Archive

- [x] 11.1 Present the final state (diff, test results, gate outcomes) to the human and get explicit
      approval before archiving.
- [x] 11.2 Run `opsx:archive` on this same branch before raising the PR.
