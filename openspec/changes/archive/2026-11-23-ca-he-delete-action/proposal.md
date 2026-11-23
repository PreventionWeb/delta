## Why

The CA hazardous-event list page (`/he-preview`) has no way to delete an event. Legacy's list
offers a trash-icon row action with a confirmation dialog, and that row action is the only delete
UI legacy has. Phase 7's cutover (`7b`) needs a full replacement before the legacy list can be
retired. `DeleteHazardousEventUseCase` (`4f`/`5d`) already exists, is wired into
`HazardousEventsModule`, and is tested. No route or UI calls it yet. Roadmap intent: `6l`.

## What Changes

- Add a **Delete** row action (trash icon, third icon slot after Edit/View) to
  `HazardousEventListPage.tsx`'s default actions cell. It is gated by the role/status rule (design.md OD-1, user-approved). It is
  never shown when a caller supplies `renderActionsCell`, which is how the picker page reuses this
  list.
- Add a confirmation dialog matching legacy's `HazardousEventDeleteButton` UX (title, warning,
  "Do not delete" / "Delete permanently"). It is built on the design-system `Dialog`/`Button`,
  with no PrimeReact import.
- Add a new he-preview route action (`delete.$id.tsx`, URL `/he-preview/delete/:id`, the same URL
  shape as legacy's `/hazardous-event/delete/:id`). It resolves `DeleteHazardousEventUseCase` via
  `getAppContext().get(...)`, is tenant-scoped through `resolveTenantId`, and requires `EditData`.
  It also enforces the same role/status rule server-side (OD-1).
- Map both `ConflictError` shapes to translated, user-visible messages, never a raw error page:
  - the use case's `dependents[]` (DISASTER_EVENT / EVENT_CAUSALITY / CAUSAL_CHAIN);
  - the repository's DEF-044 outgoing-`event_relationship` conflict.

  Map `NotFoundError` to a user-visible message as well. Authorization failures return a 403
  "not permitted" message, not an error page (design.md D1, amended). Any other dependent-less
  conflict gets a generic "cannot be deleted" message. After any failure, the list is
  revalidated. Success
  shows a "Record deleted" flash message and redirects back to the bare list,
  dropping the query string as legacy does (OD-5).

- Design-system additions needed for legacy parity:
  - a danger-outline `Button` variant with a leading icon;
  - a `Dialog` option to ignore outside clicks (legacy's dialog does), plus a `variant="confirm"`
    reproducing PrimeReact's 32rem ConfirmDialog chrome (added at Gate 9, design.md D4);
  - a non-PrimeReact error toast (React Aria `UNSTABLE_ToastRegion`) for blocked-delete feedback (OD-4).
- The list's actions cell switches from `flex gap-1` to legacy `ActionLinks`' 3-track grid, so
  icon spacing matches legacy. This was user-approved at Gate 9. The list page owns the delete
  toast queue and region (design.md D3).
- New i18n keys in `locales/{en,fr}/hazardous-events.json`.
- No new backend/domain logic. `DeleteHazardousEventUseCase` keeps blocking causal links (OD-2).
  The server-side status rule is a presentation-layer route guard (OD-1).

## Capabilities

### New Capabilities

- `hazardous-event-delete-action`: the CA list page's Delete row action, its confirmation
  dialog, the `/he-preview/delete/:id` route action, its permission/tenant gates, and the
  user-visible outcome of every delete result (success, blocked-by-dependents, not-found,
  permission-denied, concurrent double-submit). Causal and legacy-parent links block the delete
  (OD-2/OD-3).

### Modified Capabilities

- None. `delete-hazardous-event` (the use case spec) is unchanged: OD-2 kept its blocking
  semantics.

## Impact

**Files (expected):**

| File                                                                                                                                                            | Change   | Reason                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------- |
| `app/routes/$lang+/_authenticated+/he-preview+/delete.$id.tsx`                                                                                                  | new      | Thin action-only route adapter for `DeleteHazardousEventUseCase`                 |
| `app/domains/hazardous-events/presentation/web/HazardousEventListPage.tsx`                                                                                      | modified | Third row-action slot (Delete), legacy grid layout, toast region                 |
| `app/domains/hazardous-events/presentation/web/HazardousEventDeleteButton.tsx`                                                                                  | new      | Trash-icon trigger, confirm dialog, `useFetcher` submit, error feedback          |
| `app/domains/hazardous-events/presentation/web/isStatusAwareDeleteBlocked.ts`                                                                                   | new      | Pure predicate translating `canDeleteDataCollectionRecord` to CA `Status` (OD-1) |
| `app/domains/hazardous-events/presentation/web/mapDeleteErrorToMessageKey.ts`                                                                                   | new      | Pure mapping from both ConflictError shapes and NotFound to i18n keys            |
| `app/domains/hazardous-events/presentation/web/requestAuthorizationGuards.server.ts`                                                                            | modified | `requireStatusAwareDeletePermission`                                             |
| `app/design-system/components/Button.tsx`                                                                                                                       | modified | `danger-outline` variant (legacy "Delete permanently" button)                    |
| `app/design-system/components/Dialog.tsx`                                                                                                                       | modified | Outside-click opt-out; `confirm` variant (legacy ConfirmDialog chrome)           |
| `app/design-system/components/Toast.tsx` (OD-4)                                                                                                                 | new      | Error toast surface replacing legacy's PrimeReact `Toast`                        |
| `locales/en/hazardous-events.json`, `locales/fr/hazardous-events.json`                                                                                          | modified | Dialog copy, outcome messages                                                    |
| Tests under `tests/integration/domains/hazardous-events/routes/`, `app/domains/hazardous-events/presentation/web/*.dom.test.tsx`, `tests/e2e/hazardous-events/` | new      | See tasks.md                                                                     |

- **DB migration:** none.
- **Test approach:**
  - PGlite integration for the route action: success, not-found, foreign tenant, each dependent
    block, the DEF-044 block, permission denied, and double submit;
  - jsdom presentation tests for the row slot and the dialog;
  - Playwright E2E for the delete lifecycle, including a dependent-blocked delete (covers
    DEF-003's delete-guard variant);
  - a Gate 9 visual-parity review against the legacy list row and dialog.
- **Security / multi-tenancy:**
  - every lookup is tenant-scoped through `resolveTenantId` and the use case's own
    `(id, tenantId)` scoping, so a foreign-tenant id yields not-found and never discloses
    existence;
  - `EVENT_CAUSALITY`'s cross-tenant count is never surfaced; only the existing boolean flag may
    influence copy;
  - the role/status delete rule is enforced server-side, not only in the UI (OD-1).
- **Deferred register:**
  - DEF-044: resolved by this change (OD-3, keep blocking with a friendly message). Its row
    is deleted at archive.
  - DEF-003: this change adds the delete-guard E2E variant only. The row stays, because it also
    covers parent-linking and approval-transition variants.
- **Coexistence findings** (reported, not in scope): legacy delete of a CA-created event orphans
  its `workflow_instance` row; CA delete of a legacy-created event does not remove files
  referenced only by the legacy `attachments` JSONB column. See design.md "Out of scope findings".
