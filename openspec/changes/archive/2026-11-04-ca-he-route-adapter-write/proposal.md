## Why

Hazardous Events (HE) has no Clean Architecture write path in the web layer. `6a` (merged) shipped
read-only `he-preview+` routes; every create/edit still goes through the legacy
`app/routes/$lang+/_authenticated+/hazardous-event+/new.tsx` and
`app/routes/$lang+/hazardous-event+/edit.$id.tsx`, which call `formSave` +
`handleApprovalWorkflowService` directly against Drizzle models. Phase 7's cutover cannot retire
that legacy path until a CA-based create/edit replacement exists. The CA application layer already
has most of what the use-case side needs (`CreateHazardousEventUseCase`, `UpdateHazardousEventUseCase`,
`ProcessWorkflowActionUseCase`) — `6c` is the route-adapter work that exposes them, plus the small
set of application-layer additions (below) that this session's readiness check found genuinely
missing, not just un-wired.

**All 13 decisions this change originally left open have now been resolved with the human, one at a
time, each grounded in code read directly** (`approvalWorkflowService.ts`, `SaveSubmitDialog.tsx`,
`WorkflowInstance.ts`, `app/frontend/user/roles.ts`, `emailValidationWorkflowService.ts`, and
`picker.tsx`) — see "Confirmed Decisions" below. **A further gap, found live after that point
(2026-11-02, design.md Decision 15 — the list page's missing "Add new event" affordance, plus the
one new question it raised about a top-of-page count header), has also now been resolved with the
human.** **Four more gaps, found live and via code research later the same session (2026-11-02,
design.md Decisions 9-addendum/16/17): the detail page's missing "Edit" link and missing "Add
hazardous event caused by this event" link (Decision 16); the discard-confirmation modal's reversed
button emphasis/orientation (Decision 9 addendum); and a confirmed, currently-live cross-domain data
gap in how CA-created events expose their hazard taxonomy to seven legacy/analytics consumers,
closed with a temporary anti-corruption layer (Decision 17) — are also now resolved.** Nothing in
this proposal is still open.

## What Changes

- Add `app/routes/$lang+/_authenticated+/he-preview+/new.tsx` and `.../edit.$id.tsx` — the roadmap's
  own placeholder path (`app/routes/$lang+/he-preview+/...`) is corrected to the real route family
  `6a` established (nested under `_authenticated+`).
- Add `app/routes/$lang+/_authenticated+/he-preview+/picker.tsx` — a CA-native parent-picker route,
  reusing `6a`/`6h`'s own list/filter components, that the create/edit form opens exactly the way
  legacy's own popup does (Decision 13).
- Each loader/action pair follows `6a`'s `requireUser()` + `roleHasPermission(role, "<perm>")` pattern
  (not the legacy `authLoaderWithPerm`/`authActionWithPerm` HOC), gating on `EditData` — plus, on the
  edit route only, a second, status-aware gate replicating `canEditDataCollectionRecord` (Decision 11).
- The create action first checks the request itself is authorized/well-formed (role-gating for
  direct-validate/direct-publish; a non-empty validator list for submit-validation), then calls
  `CreateHazardousEventUseCase`; only when the submitted form requested a validation submission does
  it additionally call `ProcessWorkflowActionUseCase` against the newly-created event's id, in the
  same request. The edit action follows the same "check, then update, conditionally transition"
  shape, now covering every action the create/edit form's own "Save or submit" modal can actually
  send: `submit-draft`, the admin-only direct-validate/direct-publish shortcut, and
  `submit-validation` (Decisions 1, 2, 5, 6). The authorization/well-formedness checks run before
  either use case, so a rejected request never creates/updates a row (design.md Risks, resolved).
- `CreateHazardousEventUseCase` gains an optional `spatialObservation` field (Decision 3) and now
  calls `assertCauseStartsNoLaterThanEffect` alongside the existing cycle check (Decision 4).
- `WorkflowInstance` gains three new transition methods — `resetToDraft`, `directValidate`,
  `directPublish` — and `ProcessWorkflowActionCommand` gains three matching new action variants
  (Decisions 5, 6), with a corresponding, deliberate loosening of `WorkflowInstance.create()`'s own
  `REQUIRED_SET` table for `APPROVED`/`PUBLISHED` (see design.md Decision 6 for why this is necessary,
  not optional).
- New `IValidatorCandidateRepository` port (mechanical `findByRole` query) in `validation-workflow`'s
  application layer, with a Drizzle adapter, and `FindValidatorCandidatesUseCase` owning the
  validator-then-admin-fallback policy on top of it (Decision 8).
- `submit-return` is confirmed out of scope for `6c` — already registered as `DEF-053` (Decision 7).
- **New, found live (2026-11-02):** the `6a`/`6h` list page (`he-preview+/_index.tsx` +
  `HazardousEventListPage.tsx`) had no way to reach the create route this change builds — a user
  could only reach `he-preview+/new` by typing the URL. Adds two new, route-local components (never
  inside the shared `HazardousEventListPage`, and never wired into the parent-picker route — see
  design.md Decision 15 for why): `HazardousEventListActions` — an "Add new event" navigation link,
  role-gated the same way legacy's own `canAddNewRecord` effectively is (`roleHasPermission(role,
  "EditData")`, already used throughout `6c`), linking to `he-preview+/new` (not legacy's
  `/hazardous-event/new`) — and `HazardousEventListHeader` — a top-of-page unfiltered-total count
  ("{count} hazardous event(s) in {instanceName}"), reusing the loader's existing
  `unfilteredTotalCount` value (no new query) alongside a new `instanceName` session read. `6h`'s own
  "Showing X of Y" line stays unchanged below the filter bar — both counts are kept, confirmed to
  answer genuinely different questions (always-unfiltered total vs. filtered-of-unfiltered), not a
  duplicate.
- **New, found live + via code research (2026-11-02, second round):**
  - The detail page (`he-preview+/$id.tsx` + `HazardousEventDetailPage.tsx`) gains an "Edit" link and
    an "Add hazardous event caused by this event" link, both gated by `roleHasPermission(role,
    "EditData")` — a flat, role-only gate confirmed to match legacy exactly (legacy's own detail-page
    Edit button has no status check at all; the status-aware block is enforced only at the edit
    route's own loader, Decision 2, untouched here). The create route's `?parent=` pre-fill this
    second link targets already exists (built earlier this session) — no new application-layer work
    (design.md Decision 16).
  - The discard-confirmation modal's buttons are restacked vertically with "Save as draft" as the
    primary/filled button and "Discard work and exit" as the outline button, matching legacy exactly
    — a pure visual-parity fix, no behavior change (design.md Decision 9 addendum).
  - A new, explicitly temporary HIP legacy anti-corruption layer (`IHipCrosswalkPort` +
    `DrizzleHipCrosswalkAdapter.server.ts`) resolves and writes `hazardous_event`'s three legacy HIP
    columns (`hip_hazard_id`/`hip_cluster_id`/`hip_type_id`) from each event's `specificHazardId`,
    wired into `CreateHazardousEventUseCase` and `UpdateHazardousEventUseCase` inside their existing
    transactions. Closes a confirmed, currently-live gap affecting seven legacy/analytics consumer
    files (Disaster Events' own hazardous-event link picker, three analytics modules, two
    content-picker configs, and legacy's own keyword search) that today all silently fail to
    recognize or display a CA-created event's hazard taxonomy — none of those seven files are
    modified (design.md Decision 17). Registered for eventual removal as `DEF-055` once every
    dependent domain migrates off the HIP columns.
- **New, found live (2026-11-03) — user-authorized deliberate deviation from legacy, not a parity
  fix.** The main "Save or submit" button is always enabled today, regardless of whether required
  fields are filled; a missing required field fails silently (only a browser's own easy-to-miss
  native tooltip, no custom message, no network request) — reproduced live, confirmed with the user
  as a real gap worth fixing even though legacy itself has the identical behavior. The button now
  tracks `formRef.current.checkValidity()` live (mount-time check plus a form-level delegated
  `input`/`change` listener, deferred via `queueMicrotask` — same pattern already used by
  `submitWithAction()`'s own deferred `requestSubmit()`) and is disabled via its own existing
  `.mg-button:disabled` styling whenever the form is not currently submittable (design.md Decision
  18). `HazardousEventSaveSubmitModal`'s own, separate `isSubmitDisabled` validator-selection check
  is untouched.
- **New, found live via manual QA (2026-11-03, third round) — six more gaps, all resolved as
  straightforward fixes, no open questions:**
  - The hazard-classification group's "Specific hazard" field showed no required-marker of its own,
    inconsistent with every other individually-required field on the page (Decision 19) — a one-line
    fix, passing `required` to its own `HazardousEventFormField` wrapper.
  - `specificHazardId`'s `<select>` could become permanently unselectable (by click, type-ahead, or
    arrow keys) after editing an unrelated field first, confirmed via `react-dom` internals as an
    unmemoized-component re-render issue interacting with Decision 18's own live-validity listener
    (Decision 20) — fixed by wrapping `HazardousEventHazardPicker`'s export in `React.memo`.
  - The parent-picker route (`picker.tsx`) was missing the page-title/`MainContainer` chrome every
    other HE route renders (Decision 21) — fixed at the route level, reusing the existing (previously
    unused and mistranslated) `picker.title` locale key, corrected to legacy's exact wording.
  - The parent-picker's "Change" button opened a small chrome-less popup window instead of a tab,
    unlike legacy's own call shape (Decision 22, user-requested) — fixed by dropping the window-name
    and features-string arguments from `window.open`.
  - The main list page had no direct per-row "Edit" action, only "View" — reaching Edit took two
    clicks via the detail page (Decision 23) — a status-aware Edit icon link was added to the default
    actions cell, reusing the existing `isStatusAwareEditBlocked` predicate (Decision 2/16); the
    picker's own action column is unaffected (it always supplies its own "Select" override).
  - The new Edit icon's conditional presence shifted the View icon's horizontal position row-to-row,
    since both share one centered flex group (Decision 24, correcting Decision 23's own "no
    placeholder needed" reasoning) — fixed with a fixed-width, non-interactive placeholder reserved
    for the Edit slot only; View needs no placeholder since it is never conditionally absent.

**Not changed by this intent (explicitly out of scope, confirmed):**

- `ProcessWorkflowActionUseCase`'s single hardcoded `notificationPort.notify()` call, and any
  pub/sub generalization of it (`DEF-052`).
- `submit-return` / the detail-page's own approval-action surface (`DEF-053` — the next intent after
  `6c`, not open-ended).
- `HazardousEventErrorBoundary` — `6b`'s own scope (separate branch).
- CSV import/export, REST controller, `ApiKeyAuthGuard` — `6d`–`6f`.

## Confirmed Decisions

All 13, resolved with the human, each grounded in code read directly. Full technical rationale,
code citations, and the exact new type signatures are in design.md; this section records the
resolution and its headline reasoning only.

1. **Atomicity (Create/Update + `ProcessWorkflowActionUseCase` composition) — Option (a), accept the
   gap, documented.** `ProcessWorkflowActionUseCase` has no transaction of its own, so composing it
   after a committed `CreateHazardousEventUseCase`/`UpdateHazardousEventUseCase` call is not atomic
   the way legacy's shared-`tx` `formSave` + `handleApprovalWorkflowService` was for the *status-write*
   itself. On a transition failure after a successful create/update commit, the route returns a
   partial-success response — redirect to the event's edit page with a message such as "Event saved
   as draft; submission failed — please retry" — rather than a generic 500. The real narrowed gap is
   specifically a status-transition **write** failure after a committed create/update; legacy's own
   equivalent already treats *notification* failures as equally best-effort (local try/catch,
   swallowed, logged), so that half of the behavior already matches on both sides. Threading a `tx`
   through `ProcessWorkflowActionUseCase` would still be unsafe even if `DEF-052` is implemented —
   the pre-commit-notify timing problem is orthogonal to `DEF-052`'s pub/sub concern.
2. **Role-gating — close a real legacy security gap.** Legacy's `shouldProcess`
   (`approvalWorkflowService.ts:112-129`) enforces `role === "admin"` for `submit-publish` but has
   **no role check at all** for `submit-validate`, even though its own UI only ever shows both
   actions on the same admin-only card. `6c` enforces `role === "admin"` server-side for **both**
   the direct-validate and direct-publish actions — closing legacy's gap, not replicating it — and
   returns **403** for a disallowed server-side request rather than legacy's silent no-op.
3. **Create's spatial footprint — extend the command, compose inside the existing transaction.**
   `CreateHazardousEventCommand` gains an optional `spatialObservation` field (same shape as
   `UpdateHazardousEventCommand`'s). Inside `CreateHazardousEventUseCase`'s existing
   `transactionRunner.run()` block, it conditionally calls
   `RecordSpatialObservationUseCase.execute({ ...command.spatialObservation, tenantId,
   hazardousEventId: saved.id, tx })` — mirroring `UpdateHazardousEvent.ts:272-281` exactly. No new
   atomicity gap (same transaction), same log-only-after-commit pattern as the rest of `execute()`.
4. **Create's missing `assertCauseStartsNoLaterThanEffect` guard — fixed.**
   `CreateHazardousEventUseCase.execute()` now calls
   `assertCauseStartsNoLaterThanEffect(cause.startDate, newEvent.startDate)` right after the existing
   `assertCausalLinkDoesNotCreateCycle` check, mirroring `UpdateHazardousEvent.ts:331`.
5. **`submit-draft` (reset-to-draft) — built, as a data-integrity fix, not a cosmetic add.** New
   `WorkflowInstance.resetToDraft(transitionParams)`, callable from **any** status, clears
   `submittedByUserId/At`, `validatedByUserId/At`, `publishedByUserId/At`, and (per `DRAFT`'s own
   `REQUIRED_NULL` invariant — see design.md Decision 6) `approvedByUserId/At` too. New
   `"submit-draft"` member on `ProcessWorkflowActionCommand`; `execute()` skips
   `buildNotification()`/`notify()` entirely for it via an early guard (legacy sends none either —
   a deliberate choice, not a fallthrough gap).
   Without this, editing the *content* of an already-approved/published record via a plain default
   save would leave stale approval/publish attribution on changed content — a real regression.
6. **`submit-validate`/`submit-publish` direct admin shortcuts — built as new direct-transition
   methods, not by chaining existing calls.** Legacy's shortcuts (`approvalWorkflowService.ts:295-361`)
   each do one single DB update and **never set `submittedByUserId`/`submittedAt`** — only
   `validatedByUserId`/`At` (direct-validate) or both `validatedByUserId`/`At` and
   `publishedByUserId`/`At` in the same update (direct-publish). New `WorkflowInstance.directValidate`
   (`DRAFT`/`REVISION_REQUESTED` → `APPROVED`, sets only `validatedByUserId`/`At`) and
   `WorkflowInstance.directPublish` (`DRAFT`/`REVISION_REQUESTED` → `PUBLISHED`, sets
   `validatedByUserId`/`At` and `publishedByUserId`/`At`), each reachable via one
   `ProcessWorkflowActionUseCase.execute()` call — one transition, one `update()`, same commit
   boundary as any other action. `validate()`/`publish()`'s existing strict guards are untouched.
   Admin-only gating (Decision 2) applies to both. No notification fires for either (legacy's own
   `handleSubmitAsValidated`/`handleSubmitAsPublished` call no email function at all — same
   deliberate-no-notify treatment as Decision 5, confirmed by reading the file directly, not assumed
   by extension).
7. **`submit-return` — confirmed out of scope for `6c`.** `SaveSubmitDialog.tsx`'s own `SaveAction`
   type has exactly four values and does not include `submit-return` — `new.tsx`/`edit.$id.tsx`
   never send it. Registered as `DEF-053` ("No CA route exposes the detail/view page's own approval
   actions"), explicitly the next intent after `6c` — required before edit can be considered
   complete across every status. `6c` builds nothing for it.
8. **Validator candidate list — built now, inside `6c`.** New `IValidatorCandidateRepository`
   (`validation-workflow`'s application layer, alongside `INotificationPort` — the same kind of
   entity-type-agnostic shared concern; confirmed via grep that legacy's
   `getUserCountryAccountsWithValidatorRole` is reused unchanged across HE/DE/disaster_records), with
   a Drizzle adapter reproducing legacy's exact rule read from `new.tsx:67-84`: tenant-scoped
   validators, excluding the acting user, falling back to tenant admins (same self-exclusion) when
   that list is empty. **Revised during implementation** (Gate 5 SOLID review, DIP finding,
   user-approved): the port exposes only a mechanical `findByRole(tenantId, role, excludingUserId)`
   query; `FindValidatorCandidatesUseCase` owns the validator-then-admin-fallback branching,
   calling `findByRole` twice when needed. The observable outcome is unchanged — only which layer
   decides moved. Ships inside `6c` itself, not a later intent — `6c`'s own `submit-validation` UI
   needs it the day `6c` ships.
9. **`recordDisplayName`/`recordDate` derivation — resolved, no new port needed.** Read from
   `emailValidationWorkflowService.ts:62-104`: `recordDate` = `startDate` + (`" to " + endDate`
   when `endDate` differs from `startDate`) — both already on the command. `recordDisplayName` =
   `specificHazardName || hazardClusterName || hazardTypeName`, via
   `ISpecificHazardTaxonomyRepository.findNamesByIds()` (already built in `6a`) — mirrors legacy's
   `hipHazardId`→`hipClusterId`→`hipTypeId` fallback exactly. `rejectionComments` is not `6c`'s
   concern (Decision 7).
10. **Empty validator list — defensive server-side rejection, not a silent no-op.** `6c`'s route
    action validates `validatorUserIds.length > 0` before calling `ProcessWorkflowActionUseCase` for
    `submit-validation`, rejecting with a validation error when empty — the UI already disables the
    submit button for this case through normal use (`SaveSubmitDialog.tsx`); this is purely a
    defensive check against a bypassed request.
11. **Status-aware edit permission — replicated, confirmed load-bearing.** Read directly from
    `app/frontend/user/roles.ts:487-520` (the code, not its stale comment): block edit entirely for
    `data-viewer` regardless of status; for every other role, block edit when `workflowStatus` is
    `SUBMITTED`/`APPROVED`/`PUBLISHED`; allow otherwise (`DRAFT`, `REVISION_REQUESTED`, or
    `null`/missing — `DEF-031`'s case, treated as editable, matching legacy's own
    fallthrough-on-falsy-`approvalStatus` precedent). This check is load-bearing for Decisions 5/6: it
    confirms the direct-shortcut/reset-to-draft actions are only ever reachable from
    `DRAFT`/`REVISION_REQUESTED` in practice, since edit access itself is already denied from
    `SUBMITTED`/`APPROVED`/`PUBLISHED` before the "Save or submit" modal is ever reached.
12. **UI build strategy — Option (a): full new React Aria form, built inside `6c`.** The full
    ground-truth checklist in design.md Decision 9 (18-field set/order, required markers, both
    validation/error-display layers, the "Save or submit" modal's exact role-gated action cards, the
    discard-confirmation modal, live styling/layout parity) applies in full, no split into a
    follow-up intent.
13. **Parent-picker — CA-native equivalent, same UI/behavior as today.** New
    `app/routes/$lang+/_authenticated+/he-preview+/picker.tsx`, reusing `6a`/`6h`'s already-built CA
    list/filter components with the same "Select" action column added, but keeping the exact same
    popup-window + `postMessage` + close-on-select mechanism legacy's `picker.tsx` already uses.
    Only the underlying list/loader implementation swaps from legacy to CA's own; the user-visible
    behavior does not change at all.

## List-page top-of-page count — resolved with the human (2026-11-02)

Legacy's list page (`app/routes/$lang+/_public+/hazardous-event+/_index.tsx`) renders two stacked
blocks above its filter bar: `HazardEventHeader` (`app/components/EventCounter.tsx`) — a plain
`<h2>` reading "{count} hazardous event(s) in {instanceName}", where `count` is the **unfiltered**
total (`pagination.totalItems`) and `instanceName` is the tenant's own configured
`settings?.websiteName || "DELTA Resilience"` (read from session via `getCountrySettingsFromSession`)
— and `DataMainLinks` (`app/frontend/data_screen.tsx`) — the "Add new event" button, role-gated by
`canAddNewRecord(role)`.

The CA list page (`HazardousEventListPage.tsx`, from `6a`, extended in `6h`) already has a
*different* count mechanism, confirmed by reading the file directly: a "Showing X of Y hazardous
event(s)" line (`list.showing_of_total`), positioned **below** the filter bar, showing
filtered-count-of-unfiltered-total (`6h`'s Decision 13) — not the same component, position, or
phrasing as legacy's `HazardEventHeader`.

**Resolved: add the top-of-page block, keep the existing lower line unchanged — both stay.** The
human re-checked the live legacy page directly (scrolled the full page including the pagination
footer) and confirmed legacy itself only ever has the one top count — so the question was never
"does legacy have two," it was "should the *new* page have two." Decided yes: the two blocks answer
genuinely different questions (an always-unfiltered, filter-independent total vs. a
filtered-of-unfiltered total that moves with the filter bar), so they are not a duplicate once both
exist on the same page. The top block's count reuses the loader's existing `unfilteredTotalCount`
value (the same one `6h`'s own lower line already uses) — no second query. See design.md Decision 15
for the full build: the new `HazardousEventListHeader`/`HazardousEventListActions` components, the
new `instanceName` session read, and why neither is wired into the parent-picker route.

## Capabilities

### New Capabilities

- `hazardous-event-write-route-adapter`: loaders/actions for the new HE create/edit/picker routes —
  `EditData` + status-aware edit permission, tenant resolution, the "always write, conditionally
  transition" composition for both create and edit (covering `submit-draft`,
  direct-validate/direct-publish, and `submit-validation`), server-side role-gating, the
  partial-success response shape, and the parent-picker route.
- `validator-candidate-repository-port`: `IValidatorCandidateRepository`, the new
  entity-type-agnostic port for resolving a tenant's users by role, placed in `validation-workflow`'s
  application layer. Mechanical query only — no fallback policy.
- `find-validator-candidates`: `FindValidatorCandidatesUseCase`, which owns the
  validator-then-admin-fallback policy, calling the port's `findByRole` twice when the validator
  list is empty.
- `hip-crosswalk-port`: `IHipCrosswalkPort`, the new, explicitly temporary HE anti-corruption-layer
  port (`resolve`/`stamp`) that populates `hazardous_event`'s legacy HIP columns from each event's
  `specificHazardId`, closing the seven-consumer gap documented in design.md Decision 17. Registered
  for eventual removal as `DEF-055`.
- `hazardous-event-form-validation`: the create/edit form's "Save or submit" button is disabled
  whenever the form is not currently valid per native HTML5 constraint validation, tracked live as
  the user fills the form (design.md Decision 18) — a deliberate, user-authorized deviation from
  legacy, not a parity fix.

### Modified Capabilities

- `create-hazardous-event`: adds the optional `spatialObservation` field and its conditional
  `RecordSpatialObservationUseCase` composition inside the existing transaction; adds the
  `assertCauseStartsNoLaterThanEffect` guard alongside the existing cycle check; adds the
  `IHipCrosswalkPort.resolve()`/`stamp()` composition inside the same transaction (design.md
  Decision 17).
- `update-hazardous-event`: adds the same unconditional `IHipCrosswalkPort.resolve()`/`stamp()`
  composition, re-stamping on every update regardless of whether `specificHazardId` changed
  (design.md Decision 17).
- `hazardous-event-route-adapter` (owned by `6a`, merged): the detail loader
  (`he-preview+/$id.tsx`) now captures and returns the `role` `requireViewDataPermission` already
  resolves (previously discarded); `HazardousEventDetailPage` renders the new "Edit" and "Add
  hazardous event caused by this event" links, both gated by `roleHasPermission(role, "EditData")`
  (design.md Decision 16).
- `workflow-instance-entity`: adds `resetToDraft`/`directValidate`/`directPublish`; adjusts
  `REQUIRED_SET` for `APPROVED`/`PUBLISHED` (see design.md Decision 6 for the exact before/after
  table and why the adjustment is required for the new methods to construct a valid instance).
- `process-workflow-action`: adds the `submit-draft`/`direct-validate`/`direct-publish` command
  variants, their `applyTransition()` mapping, and an early guard in `execute()` that skips
  `buildNotification()`/`notify()` entirely for all three (no change to `WorkflowActionNotification`
  or `EmailNotificationAdapter.server.ts` — confirmed at implementation time, see design.md
  Decision 5/6); `execute()`'s admin-role check now calls the shared `isWorkflowActionAuthorized`
  predicate instead of reimplementing it inline (design.md Risks, resolved).
- `hazardous-event-list-filters` (owned by `6h`, merged): adds the "Add new event" navigation link
  (`HazardousEventListActions`, role-gated by `roleHasPermission(role, "EditData")`) and the
  top-of-page unfiltered-total count header (`HazardousEventListHeader`), both rendered by the main
  list route above `HazardousEventListPage`/`HazardousEventFilterBar` — never inside
  `HazardousEventListPage` itself, and never by the parent-picker route (design.md Decision 15).
  Does not touch this capability's existing filter-parsing or summary-line/legend requirements —
  `6h`'s `list.showing_of_total` line is explicitly kept, unchanged.

## Impact

**Files (new):**

- `app/routes/$lang+/_authenticated+/he-preview+/new.tsx` — create route
- `app/routes/$lang+/_authenticated+/he-preview+/edit.$id.tsx` — edit route
- `app/routes/$lang+/_authenticated+/he-preview+/picker.tsx` — CA-native parent-picker route
- `app/domains/hazardous-events/presentation/web/HazardousEventFormPage.tsx` (and sibling components for
  the taxonomy picker, spatial-footprint section, attachments section, "Save or submit" modal,
  discard-confirmation modal) — the full React Aria create/edit form, built against design.md
  Decision 9's ground-truth checklist
- `app/domains/validation-workflow/application/ports/IValidatorCandidateRepository.ts` (+ test)
- `app/domains/validation-workflow/infrastructure/DrizzleValidatorCandidateRepository.server.ts` (+ test)
- `app/domains/validation-workflow/infrastructure/ValidatorCandidateRepositoryToken.ts`
- `app/domains/validation-workflow/application/use-cases/FindValidatorCandidates.ts` (+ test) — owns
  the validator-then-admin-fallback policy, calling `IValidatorCandidateRepository.findByRole`
  twice when needed; the only caller of the repository port outside its own module, same convention
  as `GetWorkflowInstanceByEntityUseCase`
- `app/domains/validation-workflow/application/isWorkflowActionAuthorized.ts` (+ test) — the
  admin-role predicate shared by HE's `requireWorkflowActionAuthorized.server.ts` and
  `ProcessWorkflowActionUseCase.execute()`, closing a drift risk the two found independently
  reimplementing it (design.md Risks, resolved)
- `app/domains/hazardous-events/presentation/web/requireEditDataPermission.server.ts`,
  `requireStatusAwareEditPermission.server.ts`, `requireWorkflowActionAuthorized.server.ts` (+ test)
  — the request-authorization/well-formedness guard, called before the primary use case; its result
  is passed into `composeWorkflowAction.server.ts` as a parameter, not re-derived there (design.md
  Risks, resolved), `parseHazardousEventFormData.server.ts`, `composeWorkflowAction.server.ts`,
  `mapTempActionToWorkflowAction.ts`, `deriveRecordDate.ts` — route-layer helpers shared by the
  create/edit actions
- `app/domains/hazardous-events/presentation/web/HazardousEventPickerPage.tsx` (+ test) — thin wrapper
  reusing `HazardousEventListPage` (below) for the parent-picker route
- Route-level PGlite integration tests, presentation-layer tests, and Playwright E2E tests for the
  full create/edit/picker flow (see tasks.md)

**Files (modified):**

- `app/domains/hazardous-events/application/use-cases/CreateHazardousEvent.ts` (+ test) —
  `spatialObservation` field, `RecordSpatialObservationUseCase` composition,
  `assertCauseStartsNoLaterThanEffect`
- `app/domains/validation-workflow/domain/WorkflowInstance.ts` (+ test) — three new transition
  methods, `REQUIRED_SET` adjustment for `APPROVED`/`PUBLISHED`
- `app/domains/validation-workflow/application/use-cases/ProcessWorkflowAction.ts` (+ test) — three
  new command variants, `applyTransition()`'s mapping, and an early no-notify guard in `execute()`.
  `WorkflowActionNotification`/`EmailNotificationAdapter.server.ts` are **not** modified (confirmed
  at implementation time — see design.md Decision 5/6)
- `app/domains/hazardous-events/presentation/web/HazardousEventListPage.tsx` — gains optional
  `renderActionsCell`/`basePath` props (defaults preserve existing behavior exactly) so the picker
  route can genuinely reuse it, per Decision 13. **Not** where the new "Add new event" link lives
  (see below) — deliberately kept out of this shared component so the parent-picker route, which
  reuses it, never renders the link (design.md Decision 15).
- `app/domains/hazardous-events/presentation/web/HazardousEventListActions.tsx` (+ test) — **new** —
  the "Add new event" navigation link (design.md Decision 15), role-gated by
  `roleHasPermission(role, "EditData")`, linking to `he-preview+/new`, reusing
  `HazardousEventListPage.tsx`'s own existing `RouterLink`/`mg-button*` idiom, no new dependency.
  Rendered only by `app/routes/$lang+/_authenticated+/he-preview+/_index.tsx`'s default export, as a
  sibling before `HazardousEventListPage` — never by `picker.tsx`/`HazardousEventPickerPage.tsx`.
- `app/domains/hazardous-events/presentation/web/HazardousEventListHeader.tsx` (+ test) — **new** —
  the top-of-page unfiltered-total count ("{count} hazardous event(s) in {instanceName}"), porting
  legacy's `HazardEventHeader` exactly (design.md Decision 15). Rendered only by `_index.tsx`,
  before `HazardousEventListActions`; not wired into `picker.tsx`.
- `app/routes/$lang+/_authenticated+/he-preview+/_index.tsx` — wires in
  `HazardousEventListHeader` and `HazardousEventListActions` (design.md Decision 15); loader gains
  one new session read, `getCountrySettingsFromSession(request)`, to resolve `instanceName` —
  `role`/`unfilteredTotalCount` are already returned, reused as-is for both new components.
- `app/domains/hazardous-events/infrastructure/HazardousEventsModule.server.ts`,
  `app/domains/validation-workflow/infrastructure/ValidationWorkflowModule.server.ts` — DI wiring
  for the new dependencies above
- `vitest.config.ts` — `HazardousEventPickerPage.dom.test.ts` named to route to the jsdom project
  (needs a real `window`, same precedent as `HazardousEventFilterBar.dom.test.tsx`); the two
  configs were later folded into this one file and the file-list-based routing replaced with the
  `*.dom.test.{ts,tsx}` naming convention (this session's cleanup — design.md)
- `locales/en/hazardous-events.json`, `locales/fr/hazardous-events.json` — new `picker.*` keys, plus
  new `list.add_new_event`/`list.resource_actions`/`list.count_in_instance` keys (design.md
  Decision 15)
- `app/domains/hazardous-events/application/ports/ICausalChainRepository.ts` (+ test),
  `app/domains/hazardous-events/infrastructure/DrizzleCausalChainRepository.server.ts` (+ test) —
  new `findCauseEdge()` method (found at implementation time: the edit form cannot prefill its
  parent field without it — see design.md's own Risks section)
- `app/domains/hazardous-events/application/dto/HazardousEventDetailDto.ts` (+ test),
  `app/domains/hazardous-events/application/use-cases/GetHazardousEventById.ts` (+ test) — new
  `cause: { id, displayName, causalityExplanation } | null` field, resolved via the above
- `app/domains/hazardous-events/application/ports/IHipCrosswalkPort.ts` (+ test),
  `app/domains/hazardous-events/infrastructure/DrizzleHipCrosswalkAdapter.server.ts` (+ test),
  `app/domains/hazardous-events/infrastructure/HipCrosswalkPortToken.ts` — new, explicitly temporary
  ACL port resolving/writing the three legacy HIP columns from `specificHazardId` (design.md
  Decision 17)
- `app/routes/$lang+/_authenticated+/he-preview+/$id.tsx` — loader now captures and returns `role`
  instead of discarding it (design.md Decision 16)
- `app/domains/hazardous-events/presentation/web/HazardousEventDetailPage.tsx` (+ test) — new "Edit"
  and "Add hazardous event caused by this event" links, both role-gated (design.md Decision 16)
- `app/domains/hazardous-events/presentation/web/HazardousEventDiscardModal.tsx` (+ test) — button
  order/emphasis swapped to match legacy exactly (design.md Decision 9 addendum)
- `app/domains/hazardous-events/application/use-cases/CreateHazardousEvent.ts` (+ test),
  `app/domains/hazardous-events/application/use-cases/UpdateHazardousEvent.ts` (+ test) — new
  `IHipCrosswalkPort` constructor dependency and `resolve()`/`stamp()` composition (design.md
  Decision 17, in addition to the changes already listed below for these same two files)
- `app/domains/hazardous-events/infrastructure/HazardousEventsModule.server.ts` — DI wiring for
  `IHipCrosswalkPort` (design.md Decision 17, in addition to the wiring already listed below)
- `locales/en/hazardous-events.json`, `locales/fr/hazardous-events.json` — new `detail.edit`/
  `detail.add_cause` keys (design.md Decision 16)
- `app/domains/hazardous-events/presentation/web/HazardousEventFormPage.tsx` (+ test) — the "Save or
  submit" button gains a live `checkValidity()`-driven `disabled` state (design.md Decision 18, a
  deliberate deviation from legacy, not a parity fix); no other file changes

**DB migration:** None. `workflow_instance`'s schema already has every column the new transition
methods write to; the `REQUIRED_SET` change is application-layer validation logic, not schema;
`hazardous_event`'s three HIP columns already exist (nullable, from legacy) — Decision 17 populates
them via application-layer writes, it does not alter the schema.

**Multi-tenancy / security:** Every loader/action resolves `tenantId` before calling any use case and
gates on `EditData` via `requireUser()` + `roleHasPermission` (not the legacy HOC); the edit route
additionally enforces the status-aware gate (Decision 11); `admin`-only enforcement for
direct-validate/direct-publish (Decision 2, closing a real legacy gap) is authoritatively enforced
inside `ProcessWorkflowActionUseCase.execute()` itself (revised during implementation — Gate 10
code-review finding, researched — see design.md Decision 2), with the route's own pre-existing check
kept as an early short-circuit, not a second source of truth; the action also rejects an empty
validator list, authoritatively enforced inside `ProcessWorkflowActionUseCase.execute()` with the
route's own check again kept as an early short-circuit, same pattern (Decision 3). The detail page's
new Edit/Add-cause links reuse the same `EditData` gate (Decision 16); `IHipCrosswalkPort.stamp()`
is tenant-scoped (`WHERE id = ? AND country_accounts_id = ?`, Decision 17).

**Test approach:** PGlite integration (`yarn test:run2`) for every use-case/route/port change, calling
exported `action`/`execute()` functions directly; presentation-layer tests for the new form
components; Playwright E2E for the full create/edit/picker submission flows, verified against real
rendered output per design.md Decision 9.
