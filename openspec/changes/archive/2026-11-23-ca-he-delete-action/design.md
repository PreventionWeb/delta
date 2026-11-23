## Context

See proposal.md for the Why. This section records the current state, established by a code read
and a live run (2026-11-23) against the local dev server. The live run used
`test.admin@india.gov.in` (role `admin` only, so the data-collector rules below are
code-derived) and throwaway events created for this purpose. All of them were deleted afterwards
(see "Out of scope findings" for two orphan rows the cleanup could not remove).

**How the live run was driven:**

- The fixtures were created by same-origin POSTs to the legacy/CA create actions.
- A, P1, E, F, G and C1 were deleted by clicking the real legacy row icon and dialog.
- H, and the final cleanup, were deleted by a direct POST to `/en/hazardous-event/delete/:id`.
  This is the same request legacy's fetcher sends, used after browser screenshots timed out. No
  toast was observed for H; its outcome was read from the DB.
- Only a Link-type attachment was exercised, so File-type file cleanup was not observed live.

### Phase 0 answers

1. **Current state.** `HazardousEventListPage.tsx:203-246` renders Edit (gated by `EditData` plus
   `isStatusAwareEditBlocked`) and View icons only. There is no delete control and no
   he-preview delete route (`app/routes/$lang+/_authenticated+/he-preview+/` contains `_index`,
   `$id`, `new`, `edit.$id`, `picker`). `DeleteHazardousEventUseCase` is registered and exported
   by `HazardousEventsModule.server.ts:215-240,300`, so `getAppContext().get(...)` can resolve it.
2. **Problem.** A CA list user cannot delete an event that legacy lets them delete, which blocks
   `7b`.
3. **Still needed.** Yes. Nothing in he-preview or the CA presentation layer calls the delete use
   case (grep).
4. **Risks.** Permission semantics (OD-1), behavioral divergence from legacy on causality links
   (OD-2), tenant scoping, two different `ConflictError` shapes, and coexistence side-effects
   between the legacy and CA delete paths.

### Existing behaviour: legacy vs CA use case

Legacy is `app/routes/$lang+/hazardous-event+/delete.$id.tsx:27-39`, which calls
`createDeleteActionWithCountryAccounts` (`app/backend.server/handlers/form/form.ts:824-866`, which
requires `EditData`), then `formDeleteWithCountryAccounts` (`form.ts:419-479`), then
`hazardousEventDelete` (`app/backend.server/models/event.ts:1729-1808`).

CA is `DeleteHazardousEventUseCase.execute`
(`app/domains/hazardous-events/application/use-cases/DeleteHazardousEvent.ts:80-189`), which calls
`DrizzleHazardousEventRepository.delete` (`DrizzleHazardousEventRepository.server.ts:756-789`).
CA has no web route yet, so its column below comes from code and tests, not a click:
`DeleteHazardousEvent.test.ts:603-750`, `tests/integration/domains/hazardous-events/DeleteHazardousEventUseCase.test.ts`
and `tests/integration/db/queries/DrizzleHazardousEventRepository.test.ts:1891-2030`.

| Case (live fixture)                                                                                                 | Legacy (live unless [code])                                                                                                                                                                                                                                                                                                                                                                          | CA use case: from code/tests                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (a) Plain event, no dependents (A)                                                                                  | Deleted. Info toast "Record deleted" top-right (root flash). Redirect to `/en/hazardous-event` with the query string dropped (`?pageSize=50` lost). Audit row `delete`.                                                                                                                                                                                                                              | Deleted: `workflow_instance` row first, then `hazardous_event`, incoming `event_relationship` and the `event` supertype row, plus an audit row, all in one tx (`DeleteHazardousEvent.ts:137-160`).                                                                                            |
| (b1) Cause of a legacy child via `event_relationship` (P1 to C1)                                                    | **Blocked with a raw "Unexpected Error" page** ("Failed query: delete from "event"..."). The tx rolled back and P1 is intact. The friendly mapping `event.ts:1792-1802` checks `error.code` on the top-level error, but the error is thrown as a Drizzle query-wrapper. Probable cause: the pg error sits on `.cause` (drizzle-orm `^0.45.2`). Not proven by stepping through.                       | Blocked: `ConflictError("Delete events that are caused by this event first", {id, tenantId})`. `pgErrorCode`/`pgErrorConstraint` (`app/infrastructure/pgErrorCode.server.ts:4-36`) unwrap `.cause` correctly. No `dependents` array. This is DEF-044.                                         |
| (b2) Child of a legacy parent (C1)                                                                                  | Deleted. Its incoming `event_relationship` row is removed (verified by DB query).                                                                                                                                                                                                                                                                                                                    | Deleted. Same incoming-role cleanup (`DrizzleHazardousEventRepository.server.ts:771-773`).                                                                                                                                                                                                    |
| (b3) Cause of a CA child via `hazardous_event_causality` (H to I, created through `/he-preview/new` with `causeId`) | **Deleted. The H-to-I edge was silently cascaded away**, so I lost its cause. H's `workflow_instance` row was **left orphaned**, because legacy never touches CA workflow rows.                                                                                                                                                                                                                      | **Blocked**: `CAUSAL_CHAIN` dependent (`countEdgesTouching`, `DrizzleCausalChainRepository.server.ts:189-198`, which counts both sides).                                                                                                                                                      |
| (b4) Effect side of a CA edge (I)                                                                                   | [code] Would be deleted with the edge cascaded (FK `ON DELETE CASCADE`). **Not observed**: H's delete had already removed the edge before I was deleted in cleanup. I's workflow row was orphaned (observed).                                                                                                                                                                                        | **Blocked**: `CAUSAL_CHAIN` (`DeleteHazardousEvent.test.ts:731`, "blocks the delete when the event is only the effect side").                                                                                                                                                                 |
| (c) Link attachment plus map-coordinate footprint (E)                                                               | Deleted. The `hazardous_event_geom` row cascaded. The legacy JSONB `attachments` column goes with the row; the file post-process only matters for File-type attachments (not exercised live).                                                                                                                                                                                                        | Deleted. The child tables cascade (see below). File-type attachments' files are deleted after the row delete (`DeleteHazardousEvent.ts:162-174`), **but only those in `hazardous_event_attachment`**. Legacy JSONB attachments are not read (`DrizzleHazardousEventRepository.server.ts:99`). |
| (d1) Referenced by `disaster_event.hazardous_event_id` (F, DE1)                                                     | Blocked. **Red error toast top-center**: "Cannot delete hazard event because it is linked to one or more disaster events. Please delete the associated disaster events first." No redirect; the row stays.                                                                                                                                                                                           | Blocked: `DISASTER_EVENT` dependent with count.                                                                                                                                                                                                                                               |
| (d2) Triggering HE of a disaster event via `event_causality` (G, DE2)                                               | **Deleted. The `event_causality` row was silently cascaded away**, so DE2 lost its triggering-HE link.                                                                                                                                                                                                                                                                                               | **Blocked**: `EVENT_CAUSALITY` dependent (same-tenant count plus a cross-tenant flag).                                                                                                                                                                                                        |
| Foreign tenant / missing id                                                                                         | [code] `formDeleteWithCountryAccounts` calls `getById(ctx, id)` with no tenant, so `hazardousEventById` (`event.ts:1648-1658`) runs **unscoped** (`form.ts:429`). `hazardousEventDelete` then checks the DE link **before** the tenant check (`event.ts:1736-1767`), so a foreign id with a DE link discloses "linked to disaster events". Otherwise it returns "Record not found or access denied". | `NotFoundError` from `findById(id, tenantId)` before any dependent check. No disclosure.                                                                                                                                                                                                      |
| Permission                                                                                                          | [code] Server: `EditData` only. UI: `canDeleteDataCollectionRecord` (`app/frontend/user/roles.ts:447-470`); a status rule is UI-only.                                                                                                                                                                                                                                                                | Use case: no role check (the route's job).                                                                                                                                                                                                                                                    |

### Is cascading delete in effect? Three layers, from live `pg_constraint` (2026-11-23) and the schema files

1. **FK `ON DELETE CASCADE` onto the event's own child rows: yes, in both paths.**
   - `hazardous_event_attachment` (`hazardousEventAttachmentTable.ts:29`);
   - `hazardous_event_field_value` (`hazardousEventFieldValueTable.ts:20`);
   - `hazardous_event_custom_field_value` (`hazardousEventCustomFieldValueTable.ts:20`);
   - `hazardous_event_hazard_driver` (`hazardousEventHazardDriverTable.ts:13`);
   - `hazardous_event_spatial_observation` (`hazardousEventSpatialObservationTable.ts:19`), and
     through it the `..._geom`/`..._division` tables (`...GeomTable.ts:25-26`,
     `...DivisionTable.ts:15-16`);
   - legacy `hazardous_event_geom` and `hazardous_event_division` (live constraint only).

   This is owned-child cleanup. It is intended and needs no decision.

2. **FK cascade onto the two causality tables: present at the DB level, but only reached by
   legacy.** Both sides cascade:
   - `hazardous_event_causality` (`hazardousEventCausalityTable.ts:19,22`);
   - `event_causality` (`app/drizzle/schema/eventCausalityTable.ts:28-52`).

   **Legacy hits these cascades** (live: G, H). **CA pre-empts them**: its dependent checks run
   under `SELECT ... FOR UPDATE` in the same tx (`DeleteHazardousEvent.ts:89-135`, DEF-033's
   fix), and it throws `ConflictError` before the cascade can fire. So in CA these cascades only
   act as an unreachable backstop.

3. **NO ACTION, so the delete is blocked by the FK.**
   - `event_relationship.parent_id` / `child_id` reference `event.id`
     (`eventRelationshipTable.ts:8,11`). The incoming role is cleaned explicitly; the outgoing role
     raises 23503 (DEF-044).
   - `disaster_event.hazardous_event_id` (live: `disaster_event_hazardous_event_id_hazardous_event_id_fk`,
     NO ACTION) is pre-checked by both paths.
   - `hazardous_event.id` references `event.id` (`hazardousEventTable.ts:36`), and both paths
     delete the `event` row explicitly.

**Answer to "has cascading delete been enabled in the CA code":** no, not for cross-aggregate
links. The cascade FKs on the causality tables predate CA's use case (from `2e`/legacy). CA
deliberately **blocks** where legacy **silently cascades**. The only cascades CA relies on are the
owned child tables (layer 1), which legacy also relies on.

## Goals / Non-Goals

**Goals:**

- Legacy-parity row action and confirmation dialog on `/he-preview`, built on design-system
  components only.
- Every outcome of `DeleteHazardousEventUseCase` reaches the user as a translated message. None
  of them produces an error page.
- A thin route adapter following the he-preview mutating-route conventions.

**Non-Goals:**

- Any change to `DeleteHazardousEventUseCase`'s semantics, (OD-2 decided: none).
- A delete control on the detail page (legacy has none).
- Fixing legacy's raw-error-page bug, or the coexistence orphans (reported only).
- DEF-053, DEF-055, DEF-050/051 (not approved for this intent).

## Decisions

### D1. Action-only route `delete.$id.tsx`, submitted via `useFetcher`

The new file is `app/routes/$lang+/_authenticated+/he-preview+/delete.$id.tsx`. It exports only
`action`, with no default component.

- **Order:** `requireUser`, then `resolveTenantId`, then `requireEditDataPermission`. These are
  the same guards and the same order as `new.tsx:35-37` / `edit.$id.tsx:43-45`. Then the OD-1
  status gate, then
  `getAppContext().get(DeleteHazardousEventUseCase).execute({ id, tenantId, actingUserId })`.
- **Authorization failures are returned, not thrown (amended 2026-11-23, user decision).** These
  are a missing `EditData` (checked before the event lookup) and the OD-1 status gate.
  - The delete-specific guards `requireDeleteRole` and `requireStatusAwareDeletePermission` throw
    `AuthorizationError`. The route maps it to `{ ok:false, messageKeys:["delete.forbidden"] }`
    with status 403.
  - So a crafted POST is still refused with a 403, and nothing is deleted.
  - Throwing would make a fetcher action replace the whole page with the root error boundary.
    That happened when the role or status changed between render and confirm.
  - `requireUser` and `resolveTenantId` stay outside the catch, so their redirects still propagate.
  - The shared `requireEditDataPermission` (new/edit routes) is unchanged.
- **Success:** `redirectWithMessage(args, "/he-preview" (no query string, OD-5), { type: "info", text })`.
  - `text` is the translated `delete.success`. The translator comes from the request's i18next
    instance (`getInstance(context)` from `~/middleware/i18next.server`, as `_index.tsx:39` uses;
    the implementer confirms the exact `t`/`getFixedT` API).
  - This mirrors `formDeleteWithCountryAccounts`'s `redirectWithMessage` (`form.ts:455-465`), so
    the global root flash toast shows it (`root.tsx:217-225,299-302`). That is the same top-right
    info toast legacy shows.
- **Expected use-case failures** (`ConflictError`, `NotFoundError`) are **returned** as
  `{ ok: false, messageKeys }` with the error's own 4xx status (409/404/403). `messageKeys` is an
  ordered array, because D2 yields one message per blocking reason; the client shows them, in
  order, in one toast. (Amended during implementation: the draft's singular `messageKey` plus
  `values?` could not carry several reasons, and no approved copy has a placeholder.) The
  not-found lookup done for the OD-1 status gate is returned the same way, not thrown. They are not thrown through
  `throwHazardousEventLoaderError`, because a thrown Response from a fetcher action lands in an
  error boundary. That is exactly what made legacy's case (b1) show a raw error page.
- **Unknown errors** go through `throwHazardousEventLoaderError` (logged, rethrown) as elsewhere.

`useFetcher` matches legacy's `DeleteButton` (`delete-dialog.tsx:27,51`). The list stays mounted, so
a blocked delete shows a toast in place, with no navigation.

**Alternative considered:** an `intent=delete` action on `_index.tsx`. Rejected: it mixes a
mutation into the list route, and diverges from legacy's URL shape and from one-route-per-mutation
in he-preview.

### D2. Error-to-message mapping is a pure presentation helper keyed off error type and `dependents[].type`, never `err.message`

`mapDeleteErrorToMessageKeys(err)` (in `mapDeleteErrorToMessageKey.ts`) returns an ordered key array and covers:

- `ConflictError` with `context.dependents`: one message per dependent type, joined in the order
  given (DISASTER_EVENT, EVENT_CAUSALITY, CAUSAL_CHAIN);
- `ConflictError` without `dependents`:
  - The repository's DEF-044 conflict gets the "caused by this event" message. It is identified by
    an explicit marker (user-approved 2026-11-23): `DrizzleHazardousEventRepository.delete()` sets
    `context.reason = OUTGOING_EVENT_RELATIONSHIP_CONFLICT`. That constant is exported from the
    `IHazardousEventRepository` port. The error's message and status are unchanged.
  - Any other conflict gets a generic `delete.blocked.generic` ("This record cannot be deleted.").
    That covers unmarked conflicts, including a bare `{ id, tenantId }` context, and a
    `ConcurrentModificationError`.
- `NotFoundError`: "Record not found or access denied".
- `AuthorizationError`: `delete.forbidden`, "You do not have permission to delete this record."
  (D1).

`EVENT_CAUSALITY`'s same-tenant `count` may be shown. Its cross-tenant count is never available,
and the copy never implies one beyond what `crossTenantReferenceExists` allows (DEF-012 / 4f
disclosure rule). All copy below, EN and FR (`locales/{en,fr}/hazardous-events.json`), is
user-approved (2026-11-23). This includes the FR translations and the later `delete.forbidden` and
`delete.blocked.generic` keys. Legacy only has strings for DISASTER_EVENT, caused-by, not-found
and success; the rest are new:

| Key                                                    | Draft EN copy                                                                                                                                           |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `delete.blocked.disaster_event`                        | "Cannot delete hazard event because it is linked to one or more disaster events. Please delete the associated disaster events first." (legacy verbatim) |
| `delete.blocked.caused_by` (DEF-044 + OD-2 cause side) | "Delete events that are caused by this event first" (legacy verbatim)                                                                                   |
| `delete.blocked.event_causality`                       | "Cannot delete hazard event because it is linked to one or more disaster events as a cause or effect. Remove those links first."                        |
| `delete.blocked.causal_chain`                          | "Cannot delete hazard event because it is linked to another hazardous event as a cause or effect. Remove that link first."                              |
| `delete.not_found`                                     | "Record not found or access denied" (legacy verbatim)                                                                                                   |
| `delete.success`                                       | "Record deleted" (legacy verbatim)                                                                                                                      |
| `delete.forbidden`                                     | "You do not have permission to delete this record."                                                                                                     |
| `delete.blocked.generic`                               | "This record cannot be deleted."                                                                                                                        |

The `CAUSAL_CHAIN` dependent carries no direction. Naming "cause" vs "effect" specifically would
need a backend change, so the copy covers both.

### D3. `HazardousEventDeleteButton` component (new, in `presentation/web/`)

It owns the trigger, the `Dialog`, the fetcher, and raising the error toast. `HazardousEventListPage`
renders it in the default actions cell only. The toast queue and its single `ToastRegion` are
owned by the list page and passed to each button, so a toast outlives its row if a revalidation
removes that row (amended during implementation; a per-button region would unmount with the row).
The toast is raised when `fetcher.data` arrives, not on `state === "idle"`. When a caller supplies `renderActionsCell` (the
picker, `HazardousEventPickerPage.tsx:30`), that override fully replaces the cell, unchanged from
today. While `fetcher.state !== "idle"` the trigger shows the `dts-spinner` and is in React
Aria's pending state (`isPending`, via the design-system `Button`'s `pending` prop). Pending
ignores presses, which is the double-submit guard, but unlike legacy's native `disabled`
(`delete-dialog.tsx:58,103-107`) it keeps the button focusable. So focus returns to the trigger
after the dialog closes and isn't lost (amended 2026-11-23). `data-[pending]:pointer-events-none`
reproduces legacy's only surviving `:disabled` effect (style-dts.css:709 vs 809): the pending
trigger shows no hover. Known minor difference: a failed delete's toast appears before the list
refresh lands, so the old row briefly shows its trash icon again. Legacy shows the toast after
the refresh.

After any `ok:false` result the button calls `useRevalidator().revalidate()`. A 4xx makes React
Router skip its own revalidation, whereas legacy's `{ ok:false }` returned 200 and refreshed the
list. Without this, a not-found row would stay on screen, and a forbidden row's Delete icon would
keep its stale state.

### D4. Design-system additions

- `Button.tsx`: new `danger-outline` variant reproducing PrimeReact's
  `severity="danger" outlined` button. Use Tailwind palette classes only (e.g. red-500
  border/text, transparent background), with the same shape as `ITEM_DIALOG_BASE`, and accept an
  icon child.
- The icon is a `trash-alt.svg` sprite reference, the same asset the row icon uses, replacing the
  PrimeIcons `pi pi-trash`. This is the PrimeReact-free way to render it. Gate 9 checks that it
  reads as the same icon.
- Dialog sizing and chrome: legacy is `w-[32rem] max-w-full` (`delete-dialog.tsx:150`). Gate 9
  found the default variant (`dts-dialog-panel`) differs in width and chrome (title size and
  colour, boxed close button, message indent, spacing). So `Dialog` gained a `variant="confirm"`
  reproducing lara's `.p-dialog`/`.p-confirm-dialog` rules (`theme.css:4890-4966`) in Tailwind
  classes, instead of only a size option. (Amended at Gate 9.)
- `Dialog.tsx`: an opt-out of outside-click dismissal (Escape stays enabled). Legacy's dialog
  ignores outside clicks (D5 item 3). The existing `dismissDisabled` prop does the opposite: it
  disables Escape and keeps outside click.
- Error feedback: see OD-4.

### D5. Gate 9 ground truth: legacy list row plus confirmation dialog

**Reference-source type:** (a), a real existing page in this codebase (legacy `/en/hazardous-event`),
plus live screenshots taken 2026-11-23 for Gate 9 (deleted after archive, not committed; re-capture
from legacy if needed):

- `legacy-list-row-actions.jpg`
- `legacy-delete-confirm-dialog.jpg`
- `legacy-delete-success-toast.jpg`
- `legacy-delete-blocked-disaster-toast.jpg`
- `legacy-delete-blocked-parent-raw-error.jpg` (a legacy bug, **not** a parity target)

**Content-level checklist:**

1. **Row slot.**
   - Legacy uses a 3-slot grid, `repeat(3, 2.25rem)`, `columnGap 0.25rem`, centered
     (`ActionLinks.tsx:25-31`), ordered Edit, View, Delete.
   - An empty slot is a same-size invisible placeholder (`ActionLinks.tsx:32-36,90-91`).
   - CA today uses `flex items-center gap-1` with an invisible `mg-button mg-button-table`
     placeholder for Edit (`HazardousEventListPage.tsx:207-235`). The Delete slot must follow
     the same placeholder pattern, so the View icon never shifts when Delete is hidden.
   - The page wrapper (`MainContainer`), header and filters are unchanged.
   - **Amended (user-approved at Gate 9):** the CA cell now uses legacy's grid, not
     `flex gap-1`. It has 3 tracks of `--spacing(9)` (2.25rem), a `gap-x-1` gap, and centred
     items. Under flex the icons were about 53px apart instead of legacy's 35px.
2. **Delete trigger.**
   - `<button type="button" class="mg-button mg-button-table" aria-label="Delete">` containing an
     `<svg aria-hidden focusable=false role=img><use href="/assets/icons/trash-alt.svg#delete"/></svg>`;
   - while submitting, it shows `<span class="dts-spinner"/>` instead of the svg. Legacy disables
     the button; CA uses React Aria's pending state (`aria-disabled`, still focusable; D3).
3. **Dialog.**
   - modal with a dimmed overlay;
   - header "Are you sure you want to delete this record?" plus a close "×";
   - body "This data cannot be recovered after being deleted.";
   - footer right-aligned with gap 0.5rem: **first** "Do not delete", **second** "Delete
     permanently" (red outline, red text, leading trash icon);
   - "Do not delete" is a bright-blue filled button. **Both labels are bold** (screenshot). Its
     blue looks closer to the design-system `accent` variant (blue-500) than to
     `dts-button--primary` (`--color-dts-button-primary-bg`, `all.css:269-273`). The implementer
     must read both class definitions against the screenshot and pick the matching variant, not
     assume `primary`;
   - button height 2.5rem, min-width 6.5rem (`delete-dialog.tsx:64-65`);
   - width 32rem, max 100%;
   - not draggable; Escape and close are disabled while submitting
     (`delete-dialog.tsx:151-152`).
   - **Outside click does NOT close legacy's dialog.** PrimeReact `Dialog`'s default is
     `dismissableMask: false` (`node_modules/primereact/dialog/dialog.cjs.js:361`), and
     `delete-dialog.tsx` doesn't override it. The design-system `Dialog` is always `isDismissable`
     (`Dialog.tsx:45`), so parity needs a way to turn outside-click dismissal off for this dialog
     (e.g. a new `Dialog` prop). This is a design-system change.
   - **Escape closes it** when not submitting (`closeOnEscape={!submitting}`, code-derived; not
     pressed live).
4. **Success.**
   - the dialog closes immediately on confirm (`delete-dialog.tsx:48-51`), then the redirect
     happens;
   - info toast "Record deleted" top-right (top-left for `ar`), life 3s (root flash);
   - the row is gone.
5. **Blocked.**
   - red/error toast at the **top-center** of the viewport with the mapped message, life 5s
     (`delete-dialog.tsx:31-41`);
   - no redirect, the row stays, the dialog is closed.
6. **Cancel / close / Escape.** The dialog closes; nothing is submitted. An outside click does
   nothing (item 3).
7. **State variant not shown by legacy:** an error toast for not-found. Same top-center error
   surface as item 5.

**Decided (OD-5):** the success redirect drops the query string, as legacy does.

### D6. Test infrastructure

- **Route tests:** PGlite, under
  `tests/integration/domains/hazardous-events/routes/HazardousEventDeleteRoute.test.ts`, with
  `import "../../../db/setup"`. Mock `~/init.server`/`~/utils/session` exactly as
  `HazardousEventEditRoute.test.ts` does. Seed through `hazardousEventTestHelpers`, and seed the
  dependents with plain inserts: `disaster_event`, `event_causality`, a `hazardous_event_causality`
  edge, and an outgoing `event_relationship`.
- **Presentation tests:** `.dom.test.tsx` (jsdom) beside the components.
- **E2E:** `tests/e2e/hazardous-events/he-preview-delete.spec.ts`. Seed with plain Drizzle inserts
  (the he-preview.spec.ts precedent: NestJS decorators can't go through Playwright's transform).
- **Mutation testing:** project default, via `test-quality-auditor` scoped to the new/changed
  `app/domains/**` files.
  Stryker could not instrument `requestAuthorizationGuards.server.ts`: Babel crashes on the
  function-typed property at line 149, the same family as DEF-041. Its new
  `requireStatusAwareDeletePermission` is covered by exact-outcome unit tests instead.
- **No fieldsDef / Form-CSV-API impact:** CA routes do not use fieldsDef; the legacy CSV/API delete
  surfaces are untouched.

## Resolved Decisions (user-approved 2026-11-23, "go with your recommendations")

**OD-1. Permission gate. Decided: server-side enforcement, fail closed on `null`.**

Legacy hides the row icon via `canDeleteDataCollectionRecord` but its server checks only
`EditData`. CA also enforces the status-aware rule in the route action (as `6b` does for edit),
because the route is new and delete is irreversible. The rule is implemented by a pure
`isStatusAwareDeleteBlocked(role, workflowStatus)` shared by the row and the action:

| Role                           | DRAFT | REVISION_REQUESTED | REJECTED | SUBMITTED | APPROVED | PUBLISHED | `null` (DEF-031 legacy rows) |
| ------------------------------ | ----- | ------------------ | -------- | --------- | -------- | --------- | ---------------------------- |
| admin, data-validator          | allow | allow              | allow    | allow     | allow    | allow     | allow                        |
| data-collector                 | allow | allow              | allow    | block     | block    | block     | block                        |
| data-viewer, super_admin, none | block | block              | block    | block     | block    | block     | block                        |

- `null` blocks a data-collector: before Phase M, CA cannot tell a legacy published row from a
  draft.
- `REJECTED` (no legacy equivalent) is allowed: it is a non-published state.
- Authorization failures (no `EditData`, or this rule) return a 403 `delete.forbidden` toast,
  as in D1 (amended).

**OD-2. Causality links. Decided: Option A, CA keeps blocking.**

Both `event_causality` and `hazardous_event_causality` links, on either side, block the delete
with D2's messages. This is a known divergence from live legacy, which silently cascades them.
There is no use-case change and no `delete-hazardous-event` delta spec. Accepted consequence: an
effect-side event whose status locks editing stays undeletable until it is unlocked or unlinked.

**OD-3. DEF-044. Decided: keep blocking, with the friendly caused-by message.**

This is the conscious gate decision DEF-044 asked for, so this change resolves DEF-044. Its
register row is deleted at archive (task 10.1), not before.

**OD-4. Error-toast surface. Decided: Option A.**

A new design-system `Toast` on React Aria `UNSTABLE_ToastRegion`/`UNSTABLE_ToastQueue`
(`react-aria-components@1.22.1`), top-center, styled to legacy. Gate 9 compares it against
`legacy-delete-blocked-disaster-toast.jpg`. Success keeps using the root-level flash toast.

**OD-5. Redirect after success. Decided: drop the query string (legacy parity).**

The action redirects to the bare `/he-preview`. D2's draft EN copy is approved as written.

## Risks / Trade-offs

- [Risk] `UNSTABLE_` React Aria toast API could change on upgrade (OD-4). Mitigation: the
  design-system wrapper isolates call sites, and dom tests pin the behavior.
- [Risk] A data-collector who could delete a legacy-created draft in legacy can't in CA before
  Phase M (OD-1). Mitigation: admins and validators are unaffected; it resolves
  automatically after backfill.
- [Risk] Two-tab race: tab 1 deletes, tab 2 confirms afterwards. Mitigation: the use case returns
  `NotFoundError` (sequential) or a no-op (lock-wait), and the route maps both to a message or
  success. Never a 500. Specified in the concurrent scenario.
- [Trade-off] A blocked CAUSAL_CHAIN message can't say which side (cause or effect) without a
  backend change (D2).
- [Known limitation, C] The status check and the delete are not atomic: `workflowStatus` is read
  before the delete transaction. This is consistent with the CA edit route's read-then-act gate,
  and legacy has no server-side status check at all. Revisit when status-aware authorization moves
  inside the use-case transaction (natural candidates: `6m` detail-page workflow actions, or the
  Phase 7a sign-off).
- [Known limitation, F] A non-UUID id makes Postgres raise 22P02, which is rethrown as an error
  page. This is consistent with the other he-preview routes, and legacy passes the raw id to
  Postgres too (`form.ts:426-431`). Revisit in `6b`'s `HazardousEventErrorBoundary`, mapping an
  invalid id/22P02 to not-found across all he-preview routes.
- [Accepted, D] The status lookup reuses `GetHazardousEventByIdUseCase` (task 3.2). That is heavier
  than needed and logs `hazardous_event.fetched` on every delete attempt.

## Migration Plan

None. This is an additive route and UI. Rollback is reverting the commit. No DB migration.

## Out of scope findings (human decision 2026-11-23)

Item 2 is registered as `DEF-061`. Items 1, 3 and 4 are legacy-only and disappear at the Phase 7
cutover, so they have no register rows.

1. **Legacy delete orphans CA `workflow_instance` rows.** `hazardousEventDelete` never deletes
   `workflow_instance`, which has no FK to `hazardous_event`. Live: deleting CA-created H and I
   through legacy left rows `38ade7bc-2c81-4a40-b061-efd309da730d` and
   `8779f425-cb4c-4236-96bb-beaf85af7eda` (`entity_type='HE'`, `status='DRAFT'`). Coexistence-only;
   it disappears at `7b`. These two dev-DB rows were left in place, because no write SQL was run.
2. **CA delete of a legacy-created event doesn't remove files referenced only by the legacy
   `attachments` JSONB column**, since the CA reads only `hazardous_event_attachment`. Pre-Phase-M
   gap; likely Phase M's backfill concern.
3. **Legacy's caused-by friendly message never fires** (b1). Legacy-only bug, retired at `7b`.
4. **[code, not exercised live] Legacy discloses foreign-tenant DE linkage** before its tenant check (`event.ts:1736-1767`
   vs `1751-1767`). Legacy-only, retired at `7b`.
