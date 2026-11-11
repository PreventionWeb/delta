# hazardous-event-write-route-adapter Specification

## Purpose

Thin React Router loaders/actions exposing `CreateHazardousEventUseCase`/`UpdateHazardousEventUseCase`
(and, conditionally, `ProcessWorkflowActionUseCase`) through the HE create/edit/picker web routes —
kept as its own capability, distinct from `hazardous-event-route-adapter` (read-only). All 13
decisions this change originally left open are now resolved (see proposal.md "Confirmed Decisions");
this spec covers the full, final behavior.

## Requirements

### Requirement: HE create/edit routes require the EditData permission, checked directly

The `loader`/`action` exported from `app/routes/$lang+/_authenticated+/he-preview+/new.tsx` and
`.../edit.$id.tsx` SHALL call `requireUser()` and verify the resulting session's role has the
`EditData` permission before doing anything else, mirroring the `hazardous-event-route-adapter`
capability's `ViewData` check pattern (called directly inside the route, not inherited from the
parent `_authenticated+` layout, and not via the legacy `authLoaderWithPerm`/`authActionWithPerm`
HOC, which injects `userSession` via a forbidden `as any` cast). A session without `EditData` SHALL
be rejected with a structured `ErrorResponse` whose `error.code` is `"FORBIDDEN"` and status is `403`.

#### Scenario: Authenticated session without EditData permission is rejected on the create route

- **WHEN** `new.tsx`'s `loader` or `action` runs with a valid, authenticated session whose role does
  not have the `EditData` permission
- **THEN** the route MUST throw a `Response` with status `403` and `error.code` equal to `"FORBIDDEN"`
- **AND** `CreateHazardousEventUseCase.execute` MUST NOT be called

#### Scenario: Authenticated session without EditData permission is rejected on the edit route

- **WHEN** `edit.$id.tsx`'s `loader` or `action` runs with a valid, authenticated session whose role
  does not have the `EditData` permission
- **THEN** the route MUST throw a `Response` with status `403` and `error.code` equal to `"FORBIDDEN"`
- **AND** `UpdateHazardousEventUseCase.execute` MUST NOT be called

#### Scenario: Authenticated session with EditData permission proceeds normally

- **WHEN** either route's `loader`/`action` runs with a valid, authenticated session whose role has
  the `EditData` permission, and a resolvable tenant
- **THEN** the route MUST proceed to call its resolved use case normally

### Requirement: HE create/edit routes resolve tenant using the same rule as the read-only routes

Both routes SHALL resolve `tenantId` via the HE-local `resolveTenantId` helper (the same one
`hazardous-event-route-adapter` uses), redirecting to `/${lang}/user/select-instance` when no tenant
can be resolved, before calling any use case.

#### Scenario: No tenant available from either source on the create route

- **WHEN** `new.tsx`'s `action` runs with no active request-context store and
  `getCountryAccountsIdFromSession(request)` resolves to `null`
- **THEN** the action MUST throw a redirect `Response` to `/${lang}/user/select-instance`
- **AND** `CreateHazardousEventUseCase.execute` MUST NOT be called

### Requirement: The create action always persists the event, and conditionally composes any of the form's four workflow actions

`new.tsx`'s `action` SHALL call `CreateHazardousEventUseCase.execute()` for every submission
regardless of any requested workflow action. When the submitted `tempAction` maps to
`submit-draft`, `direct-validate`, `direct-publish`, or `submit-validation` (the last requiring a
non-empty, comma-separated `tempValidatorUserIds`), the action SHALL additionally call
`ProcessWorkflowActionUseCase.execute()` with the matching `action` value, `entityId` set to the
newly-created event's id, and `entityType: "HE"`, after the create call. When no
`tempAction` is present (matching legacy's own no-op-without-`tempAction` behavior), only
`CreateHazardousEventUseCase.execute()` SHALL be called.

#### Scenario: Plain draft create calls only the create use case

- **WHEN** the create action is submitted with no `tempAction` field
- **THEN** `CreateHazardousEventUseCase.execute` MUST be called exactly once
- **AND** `ProcessWorkflowActionUseCase.execute` MUST NOT be called

#### Scenario: Create with a validation request composes both use cases in order

- **WHEN** the create action is submitted with `tempAction: "submit-validation"` and a non-empty
  `tempValidatorUserIds`
- **THEN** `CreateHazardousEventUseCase.execute` MUST be called before
  `ProcessWorkflowActionUseCase.execute`
- **AND** `ProcessWorkflowActionUseCase.execute` MUST be called with `entityId` equal to the id
  `CreateHazardousEventUseCase.execute` resolved to, and `action: "submit-validation"`

#### Scenario: Create with an admin direct-publish request composes both use cases

- **WHEN** the create action is submitted with `tempAction` mapping to `direct-publish`, by a
  session whose role is `"admin"`
- **THEN** `ProcessWorkflowActionUseCase.execute` MUST be called with `action: "direct-publish"` and
  `entityId` equal to the newly-created event's id
- **AND** the same server-side admin check as the edit action's direct-validate/direct-publish
  requirement applies identically here

### Requirement: The edit route additionally enforces a status-aware edit permission

`edit.$id.tsx`'s `loader` and `action` SHALL, after the flat `EditData` check, reject the request
when the session's role is `data-viewer` (regardless of the event's `workflowStatus`), or when the
event's `workflowStatus` is `SUBMITTED`, `APPROVED`, or `PUBLISHED` (for any other role). A
`workflowStatus` of `DRAFT`, `REVISION_REQUESTED`, or `null` SHALL be treated as editable. A blocked
request SHALL be rejected with the same `403`/`FORBIDDEN` `ErrorResponse` shape as the flat
`EditData` check.

#### Scenario: data-viewer is blocked regardless of status

- **WHEN** `edit.$id.tsx`'s `loader` runs with a session whose role is `data-viewer`, for an event
  with `workflowStatus: "DRAFT"`
- **THEN** the loader MUST throw a `403` `FORBIDDEN` `ErrorResponse`

#### Scenario: A non-data-viewer role is blocked for SUBMITTED/APPROVED/PUBLISHED

- **WHEN** `edit.$id.tsx`'s `loader` or `action` runs with a session whose role is
  `data-collector`/`data-validator`/`admin`, for an event with `workflowStatus` equal to
  `"SUBMITTED"`, `"APPROVED"`, or `"PUBLISHED"`
- **THEN** the route MUST throw a `403` `FORBIDDEN` `ErrorResponse` in every case
- **AND** `UpdateHazardousEventUseCase.execute` MUST NOT be called

#### Scenario: DRAFT, REVISION_REQUESTED, and null workflowStatus are all editable

- **WHEN** `edit.$id.tsx`'s `loader` or `action` runs with any non-`data-viewer` role, for an event
  with `workflowStatus` equal to `"DRAFT"`, `"REVISION_REQUESTED"`, or `null`
- **THEN** the route MUST proceed to call `UpdateHazardousEventUseCase.execute` normally

### Requirement: The edit action composes UpdateHazardousEventUseCase with whichever workflow action the form requested

`edit.$id.tsx`'s `action` SHALL call `UpdateHazardousEventUseCase.execute()` for every submission
regardless of any requested workflow action. When the submitted form data maps to `submit-draft`,
`direct-validate`, `direct-publish`, or `submit-validation` (with a non-empty validator list), the
action SHALL additionally call `ProcessWorkflowActionUseCase.execute()` with the matching `action`
value, after the update call, against the same event's id.

#### Scenario: Plain edit save with no workflow action calls only the update use case

- **WHEN** the edit action is submitted with no `tempAction` field
- **THEN** `UpdateHazardousEventUseCase.execute` MUST be called exactly once
- **AND** `ProcessWorkflowActionUseCase.execute` MUST NOT be called

#### Scenario: Edit with submit-draft composes both use cases

- **WHEN** the edit action is submitted with `tempAction: "submit-draft"`
- **THEN** `UpdateHazardousEventUseCase.execute` MUST be called before
  `ProcessWorkflowActionUseCase.execute`
- **AND** the latter MUST be called with `action: "submit-draft"`

### Requirement: Direct-validate and direct-publish are rejected server-side for a non-admin role, before the primary use case is ever called

Both the create and edit actions SHALL verify the acting session's role is `"admin"` when the
submitted form maps to `direct-validate`/`direct-publish`, via `requireWorkflowActionAuthorized`,
called immediately after parsing form data and **before** `CreateHazardousEventUseCase.execute()`/
`UpdateHazardousEventUseCase.execute()` — not merely before `ProcessWorkflowActionUseCase.execute()`.
A non-admin request for either action SHALL be rejected with a `403`/`FORBIDDEN` `ErrorResponse`
before any use case runs, so no `HazardousEvent` row is created or updated and a retried request
cannot produce a duplicate event (resolves the write-then-reject gap recorded in design.md
Decision 2). This closes a gap present in legacy's own `shouldProcess` (which enforced
`admin`-only for `submit-publish` but had no role check at all for `submit-validate`) rather than
replicating it. **This route-level check is an early short-circuit, not the authoritative
enforcement** — `ProcessWorkflowActionUseCase.execute()` independently enforces the same invariant
for any caller (see the `process-workflow-action` capability's own spec), including one that does
not go through this route.

#### Scenario: A non-admin direct-validate/direct-publish request is rejected before any write

- **WHEN** either action is submitted with `tempAction` mapping to `direct-validate` or
  `direct-publish`, by a session whose role is not `"admin"`
- **THEN** the action MUST throw a `403` `FORBIDDEN` `ErrorResponse` in both cases
- **AND** `CreateHazardousEventUseCase.execute`/`UpdateHazardousEventUseCase.execute` MUST NOT be
  called
- **AND** `ProcessWorkflowActionUseCase.execute` MUST NOT be called

#### Scenario: An admin direct-validate/direct-publish request proceeds

- **WHEN** the edit action is submitted with `tempAction` mapping to `direct-validate` or
  `direct-publish`, by a session whose role is `"admin"`
- **THEN** `ProcessWorkflowActionUseCase.execute` MUST be called with the matching `action` value

### Requirement: An empty, or entirely stale/tampered, validator list on submit-validation is rejected server-side, before the primary use case is ever called

Both the create and edit actions SHALL verify, when the submitted form maps to
`submit-validation`, that at least one submitted validator id survives two checks run **before**
`CreateHazardousEventUseCase.execute()`/`UpdateHazardousEventUseCase.execute()` — not merely before
`ProcessWorkflowActionUseCase.execute()`: (1) a synchronous, non-empty check on the client-submitted
`tempValidatorUserIds`, via `requireWorkflowActionAuthorized`, called immediately after parsing form
data; and (2) an async membership check against the real, tenant-scoped validator-candidate list
(`FindValidatorCandidatesUseCase`), via `requireValidValidatorIds`, called immediately after (1).
Either failure SHALL reject with a validation error before any use case runs, so no `HazardousEvent`
row is created or updated and a retried request cannot produce a duplicate event (resolves the
write-then-reject gap previously recorded in design.md Decision 25, and in design.md's earlier
"Resolved" note for the client-submitted-empty-list case this requirement originally covered alone).
**This route-level check is an early short-circuit, not the authoritative enforcement** —
`ProcessWorkflowActionUseCase.execute()` independently enforces the same non-empty invariant for any
caller (see the `process-workflow-action` capability's own spec), including one that does not go
through this route.

#### Scenario: An empty validator list is rejected before any write

- **WHEN** either action is submitted with `tempAction: "submit-validation"` and an empty
  `tempValidatorUserIds`
- **THEN** the action MUST reject with a validation error
- **AND** the primary use case (`CreateHazardousEventUseCase`/`UpdateHazardousEventUseCase`) MUST NOT
  be called
- **AND** `ProcessWorkflowActionUseCase.execute` MUST NOT be called

#### Scenario: A validator list where every submitted id is stale/tampered is rejected before any write, on create

- **GIVEN** `tempValidatorUserIds` contains at least one id, but none of them appear in the real,
  tenant-scoped candidate list `FindValidatorCandidatesUseCase` resolves for this request
- **WHEN** the create action is submitted with `tempAction: "submit-validation"` and that list
- **THEN** the action MUST reject with a `422` validation error
- **AND** `CreateHazardousEventUseCase.execute` MUST NOT be called
- **AND** no new `HazardousEvent` row MUST exist afterward (repository count unchanged)

#### Scenario: A validator list where every submitted id is stale/tampered is rejected before any write, on edit

- **GIVEN** `tempValidatorUserIds` contains at least one id, but none of them appear in the real,
  tenant-scoped candidate list `FindValidatorCandidatesUseCase` resolves for this request
- **WHEN** the edit action is submitted with `tempAction: "submit-validation"` and that list
- **THEN** the action MUST reject with a `422` validation error
- **AND** `UpdateHazardousEventUseCase.execute` MUST NOT be called
- **AND** the event's own fields and `updatedAt` MUST remain exactly as they were before this
  submission

#### Scenario: A mixed valid/invalid validator-id list is filtered, not rejected

- **GIVEN** `tempValidatorUserIds` contains at least one id present in the real candidate list and
  at least one id that is not
- **WHEN** either action is submitted with `tempAction: "submit-validation"` and that list
- **THEN** the primary use case MUST be called normally
- **AND** `ProcessWorkflowActionUseCase.execute` MUST be called with `validatorUserIds` containing
  only the id(s) present in the real candidate list, excluding the stale/invalid one(s)

### Requirement: submit-draft is rejected server-side for a non-edit-capable role, before the primary use case is ever called, as an early short-circuit of the use case's own authoritative check

Both the create and edit actions SHALL pass `actingUserRole` through `requireWorkflowActionAuthorized`
when the submitted form maps to `submit-draft`, which SHALL reject when `actingUserRole` is
`undefined` or `"data-viewer"` — the same predicate (`isWorkflowActionAuthorized`) and early-check
placement (before `CreateHazardousEventUseCase.execute()`/`UpdateHazardousEventUseCase.execute()`)
already used for `direct-validate`/`direct-publish`. **Unlike that pair, this check is not currently
reachable through either HE route under today's permission wiring**: `EditData` (the flat permission
check both routes already enforce first) is granted only to `"data-collector"`/`"data-validator"`/
`"admin"`, so `actingUserRole` can never be `undefined`/`"data-viewer"` by the time this check runs
here — it exists for consistency with this file's established fail-fast pattern and to guard against
a future change to the `EditData` gate re-opening the gap, not because it blocks a live request path
today (design.md Decision 26). **The use case's own check
(`process-workflow-action`'s "submit-draft requires an edit-capable role" requirement) is the
authoritative enforcement** for any caller, including one that does not go through this route — the
same two-tier relationship `direct-validate`/`direct-publish` already have.

#### Scenario: requireWorkflowActionAuthorized rejects submit-draft for data-viewer or an undefined role

- **WHEN** `requireWorkflowActionAuthorized` is called directly with `parsed.tempAction` mapping to
  `submit-draft` and `actingUserRole` equal to `"data-viewer"` or `undefined`
- **THEN** it MUST throw a `403` `FORBIDDEN` `ErrorResponse` in both cases

#### Scenario: requireWorkflowActionAuthorized accepts submit-draft for every role reachable through HE's own routes

- **WHEN** `requireWorkflowActionAuthorized` is called directly with `parsed.tempAction` mapping to
  `submit-draft` and `actingUserRole` equal to `"data-collector"`, `"data-validator"`, or `"admin"`
- **THEN** it MUST return `"submit-draft"` (not throw) in every case
- **AND** a request reaching this point through `new.tsx`/`edit.$id.tsx` has already passed the flat
  `EditData` check, which guarantees `actingUserRole` is one of these three — so no HE route
  integration test exercises a rejection here; that rejection is exercised only at the predicate and
  use-case layers (see `process-workflow-action`'s own spec)

### Requirement: A follow-up transition failure after a committed create/update returns a partial-success response, not a 500

When the primary use case (`CreateHazardousEventUseCase`/`UpdateHazardousEventUseCase`) resolves
successfully but the subsequent `ProcessWorkflowActionUseCase.execute()` call rejects, the action
SHALL return a partial-success response (not propagate the rejection as an unhandled 500) indicating
the event was saved but the requested transition did not complete. The event SHALL remain queryable
afterward in its pre-transition status. This requirement covers only a genuine post-commit
`ProcessWorkflowActionUseCase` write failure — it is distinct from, and must not be conflated with,
an empty or entirely stale/tampered validator list (the previous requirement), which is now rejected
**before** the primary use case ever runs and therefore never reaches this partial-success path.

#### Scenario: Create succeeds, the follow-up submit-validation transition fails

- **GIVEN** `CreateHazardousEventUseCase.execute` resolves successfully
- **AND** the subsequent `ProcessWorkflowActionUseCase.execute` call is stubbed to reject
- **WHEN** the create action is submitted with a request that triggers both calls
- **THEN** the action MUST return a partial-success response, not a `500`
- **AND** `GetHazardousEventByIdUseCase.execute` for the newly-created event's id MUST resolve with
  `workflowStatus: "DRAFT"` (its pre-transition status)

#### Scenario: Update succeeds, the follow-up transition fails

- **GIVEN** `UpdateHazardousEventUseCase.execute` resolves successfully
- **AND** the subsequent `ProcessWorkflowActionUseCase.execute` call is stubbed to reject
- **WHEN** the edit action is submitted with a request that triggers both calls
- **THEN** the action MUST return a partial-success response, not a `500`
- **AND** the event's `workflowStatus` MUST remain whatever it was before this submission

### Requirement: A CA-native parent picker preserves legacy's exact popup/postMessage behavior

`app/routes/$lang+/_authenticated+/he-preview+/picker.tsx` SHALL render a tenant-scoped, searchable
list of hazardous events (reusing `6a`/`6h`'s list/filter components) with a "Select" action per row.
Selecting a row SHALL `window.opener.postMessage` the selected event back to the window that opened
the picker and then close the picker window — the same mechanism and user-visible behavior as
legacy's `app/routes/$lang+/hazardous-event+/picker.tsx`, with only the underlying list/loader
implementation swapped from legacy to CA's own.

#### Scenario: Selecting a row posts a message to the opener and closes the picker

- **WHEN** a user selects a row in the picker route
- **THEN** `window.opener.postMessage` MUST be called with the selected event's data
- **AND** `window.close()` MUST be called shortly after (a short deferred delay, not
  synchronously, avoids a race with message delivery — implementation detail, not timed exactly)

#### Scenario: The picker route is tenant-scoped

- **WHEN** the picker route's `loader` runs
- **THEN** it MUST resolve `tenantId` the same way as the list/detail routes and return only that
  tenant's events

### Requirement: The create and edit routes contain no business logic inline

Each route file's `loader`/`action` MUST NOT contain field-validation, cycle/temporal-order checks,
or transaction logic inline — all such logic MUST live in the resolved use case(s)
(`CreateHazardousEventUseCase`/`UpdateHazardousEventUseCase`/`ProcessWorkflowActionUseCase`), matching
the thin-route convention `hazardous-event-route-adapter` already establishes for the read-only routes.

#### Scenario: Route files delegate all validation to the use case layer

- **WHEN** `new.tsx` or `edit.$id.tsx` is inspected
- **THEN** neither file MUST construct a `HazardousEvent`/`WorkflowInstance` domain entity directly,
  call `assertCausalLinkDoesNotCreateCycle`/`assertCauseStartsNoLaterThanEffect` directly, or open an
  `ITransactionRunner` transaction directly — all such calls MUST be reached only via a use case's own
  `execute()` method

### Requirement: The parent-picker route renders the same page-title chrome as every other HE route

`app/routes/$lang+/_authenticated+/he-preview+/picker.tsx`'s default export SHALL wrap
`HazardousEventPickerPage` in `<MainContainer title={t("picker.title")}>`, matching the
`MainContainer`-wrapping convention every other HE route (`_index.tsx`, `$id.tsx`, `new.tsx`,
`edit.$id.tsx`) already follows, and matching legacy's own picker
(`app/routes/$lang+/hazardous-event+/picker.tsx`, `title: "Select parent for event"`). The
`picker.title` translation SHALL read "Select parent for event" (EN) / "Sélectionner un parent pour
l'événement" (FR) — legacy's own exact wording.

#### Scenario: The picker route renders the page-title banner

- **GIVEN** a session with `EditData` permission reaches `/en/he-preview/picker`
- **WHEN** the route renders
- **THEN** the rendered output SHALL include the page-title banner reading "Select parent for event"

### Requirement: The "Change" control opens the parent picker as a tab, not a popup window

`HazardousEventParentField.tsx`'s "Change" button SHALL open the parent-picker route via
`window.open(ctx.url("/he-preview/picker"), "_blank")` — no window-name argument and no features
string — matching legacy's own call shape
(`app/frontend/events/hazardeventform.tsx`'s `openHazardousEventPicker`). A `target` of `"_blank"`
with no features string opens a real browser tab, which receives focus automatically, rather than a
small chrome-less popup window. The existing close-on-select mechanism
(`HazardousEventPickerPage.tsx`'s `selectParentEvent()`, `postMessage` then a deferred
`window.close()`) is unchanged by this requirement.

#### Scenario: Clicking "Change" opens the picker without popup features

- **WHEN** a user clicks the "Change" button on the parent field
- **THEN** `window.open` SHALL be called with exactly `ctx.url("/he-preview/picker")` and `"_blank"`
- **AND** no third (features-string) argument SHALL be passed

### Requirement: Attachment parsing accepts the real widget output shape

`parseHazardousEventFormData.server.ts`'s attachment parsing SHALL accept items shaped as the
`AttachmentsFormView`/`ContentRepeater` widget actually submits them — `{id, title, tag,
file_option: "File" | "Link", file: {name, tenantPath, content_type}, url}` — rather than
requiring the previously-assumed `{id, title, fileKey, fileName, fileType, fileSize}` shape that
the widget never produces. An item whose `file_option` is `"File"` SHALL be parsed using its
`file` sub-object; an item whose `file_option` is `"Link"` SHALL be parsed using its `url` field.

#### Scenario: A real File-type widget item is parsed, not dropped

- **WHEN** the submitted `attachments` field contains an item shaped `{id, title, tag,
file_option: "File", file: {name, tenantPath, content_type}}`
- **THEN** the parsed result includes that attachment with its file metadata populated
- **AND** the attachment is not silently filtered out

#### Scenario: A real Link-type widget item is parsed, not dropped

- **WHEN** the submitted `attachments` field contains an item shaped `{id, title, tag,
file_option: "Link", url}`
- **THEN** the parsed result includes that attachment with its `url` populated

### Requirement: Stale fields from a type switch are discarded, not persisted

Because the widget's File/Link type toggle does not clear the other type's field when the user
switches, parsing SHALL derive the persisted field set from the item's own `file_option` and
discard whichever field set does not match it, rather than persisting both.

#### Scenario: A Link-type item with a stale leftover file value does not persist file fields

- **WHEN** the submitted item has `file_option: "Link"`, a populated `url`, and a leftover
  `file` object from before the user switched the type
- **THEN** the parsed result for that attachment has its file-specific fields absent/null
- **AND** its `url` is populated

#### Scenario: A File-type item with a stale leftover url value does not persist url

- **WHEN** the submitted item has `file_option: "File"`, a populated `file` object, and a
  leftover `url` value from before the user switched the type
- **THEN** the parsed result for that attachment has `url` absent/null
- **AND** its file-specific fields are populated

### Requirement: The widget's client-supplied attachment id is not trusted as a persisted identity

The widget mints a new item's `id` client-side as a non-UUID string. Parsing SHALL NOT require or
rely on that value being a valid UUID, since the attachment's persisted identity is minted
server-side at write time (see `create-hazardous-event`/`update-hazardous-event`).

#### Scenario: A non-UUID client-supplied id does not cause the attachment to be rejected

- **WHEN** the submitted item's `id` is a non-UUID string (e.g. a millisecond timestamp)
- **THEN** the attachment is still parsed and included in the result
