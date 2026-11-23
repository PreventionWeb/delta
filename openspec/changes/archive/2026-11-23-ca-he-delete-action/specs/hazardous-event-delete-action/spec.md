## Purpose

Lets an authorised user delete a hazardous event from the CA hazardous-event list page
(`/he-preview`) through a confirmed row action. The page must look and behave like legacy's
list-row delete, and every outcome must be shown to the user as a message, never as an error
page.

## ADDED Requirements

### Requirement: The list page's default actions cell offers a Delete row action as its third slot

The CA hazardous-event list page SHALL render a Delete control (trash icon, accessible name
"Delete") as the third action slot in each row, after Edit and View. The control SHALL be shown
only when the delete permission rule (see "Delete is gated by role and workflow status")
permits it for the current user and that row. When it is not permitted, a same-sized
non-interactive placeholder SHALL occupy the slot, so the other icons do not shift. When a caller
supplies its own actions cell (the parent-event picker), no Delete control SHALL appear.

#### Scenario: Admin sees Delete on every row

- **WHEN** a user with role `admin` views `/he-preview` with rows in any workflow status
- **THEN** each row's actions cell shows Edit-or-placeholder, View and Delete, in that order

#### Scenario: Delete hidden for a data-viewer

- **WHEN** a user with role `data-viewer` views `/he-preview`
- **THEN** no row shows a Delete control, and each row's third slot is an invisible placeholder of
  the same size

#### Scenario: Picker page never offers Delete

- **WHEN** any user opens the parent-event picker (`/he-preview/picker`)
- **THEN** no row shows a Delete control

### Requirement: Delete requires confirmation before anything is submitted

Activating a row's Delete control SHALL open a modal confirmation with:

- the title "Are you sure you want to delete this record?";
- the message "This data cannot be recovered after being deleted.";
- a "Do not delete" action, first and primary;
- a "Delete permanently" action, second, danger style, with a trash icon.

Nothing SHALL be submitted until "Delete permanently" is chosen. Closing the dialog by "Do not
delete", the close control, or Escape SHALL submit nothing. A click outside the dialog SHALL NOT
close it, matching legacy.

#### Scenario: Cancel submits nothing

- **WHEN** the user opens the confirmation and chooses "Do not delete"
- **THEN** the dialog closes, no request is sent, and the row remains

#### Scenario: Escape closes without deleting

- **WHEN** the confirmation is open and the user presses Escape
- **THEN** the dialog closes and no request is sent

#### Scenario: Outside click is ignored

- **WHEN** the confirmation is open and the user clicks the dimmed overlay outside it
- **THEN** the dialog stays open and no request is sent

#### Scenario: Confirm submits exactly once

- **WHEN** the user chooses "Delete permanently"
- **THEN** the dialog closes, exactly one delete request is sent for that row's event, and the
  row's Delete control ignores activation, keeps keyboard focus, and shows a busy indicator
  until the request settles

### Requirement: The delete route action deletes the event within the caller's tenant only

`POST /{lang}/he-preview/delete/{id}` SHALL:

- require an authenticated session and a resolved tenant;
- require the `EditData` permission;
- delete the hazardous event with that id only if it belongs to the session's tenant.

On success, the response SHALL redirect to the bare list page (no page, page-size or filter query
string, matching legacy), and the next page SHALL show the
informational message "Record deleted". The event, its owned child records, and its workflow
instance SHALL no longer exist, and exactly one audit entry with action `delete` SHALL be recorded.

#### Scenario: Successful delete of an event with no dependents

- **WHEN** an admin confirms Delete on an event in their tenant with no dependents
- **THEN** the browser lands on the list page, an informational "Record deleted" message is shown,
  the row is gone, and the event, its `event` supertype row and its workflow instance no longer
  exist

#### Scenario: Foreign-tenant id is indistinguishable from a missing id

- **WHEN** a user submits a delete for an event id that belongs to another tenant
- **THEN** nothing is deleted, and the user sees the message "Record not found or access denied",
  with no information about that event's dependents or existence

#### Scenario: Missing id

- **WHEN** a user submits a delete for an id that does not exist
- **THEN** nothing is deleted, the user sees "Record not found or access denied", not an error
  page, and the list refreshes, so a row for an event that no longer exists disappears

#### Scenario: No EditData permission

- **WHEN** a user without `EditData` (e.g. `data-viewer`) submits a delete request directly
  (the list never offers them the control)
- **THEN** the request is rejected with HTTP 403, nothing is deleted, and the response is the
  message "You do not have permission to delete this record.", not an error page

### Requirement: Delete is gated by role and workflow status

The Delete control's visibility and the route action SHALL both follow one role/status rule.
The route action SHALL enforce it server-side, rejecting a non-permitted request with HTTP 403
and deleting nothing, even when the request is sent directly rather than through the list page.
A rejection SHALL be shown as the "You do not have permission to delete this record." message,
never an error page, and the list SHALL refresh so the row's Delete control reflects the current
rule.
The rule:

- users with role `admin` or `data-validator` SHALL be permitted in every workflow status,
  including an event with no workflow status;
- a `data-collector` SHALL be permitted for `DRAFT`, `REVISION_REQUESTED` and `REJECTED`;
- a `data-collector` SHALL NOT be permitted for `SUBMITTED`, `APPROVED` or `PUBLISHED`, nor for
  an event with no workflow status (fail closed);
- `data-viewer`, `super_admin` and users with no role SHALL NOT be permitted in any status.

#### Scenario: Data-collector on a published event

- **WHEN** a `data-collector` views a `PUBLISHED` event's row
- **THEN** no Delete control is shown for that row

#### Scenario: Data-collector on a draft event

- **WHEN** a `data-collector` views a `DRAFT` event's row
- **THEN** the Delete control is shown

#### Scenario: Data-validator on a submitted event

- **WHEN** a `data-validator` views a `SUBMITTED` event's row
- **THEN** the Delete control is shown

#### Scenario: Data-collector on a rejected event

- **WHEN** a `data-collector` views a `REJECTED` event's row
- **THEN** the Delete control is shown

#### Scenario: Data-collector on an event with no workflow status

- **WHEN** a `data-collector` views a row for an event that has no workflow status (e.g. created
  through the legacy UI before backfill)
- **THEN** no Delete control is shown for that row

#### Scenario: Admin on an event with no workflow status

- **WHEN** an `admin` views a row for an event that has no workflow status
- **THEN** the Delete control is shown

#### Scenario: Direct request bypassing the hidden control is rejected

- **WHEN** a `data-collector` sends a delete request directly for a `PUBLISHED` event
- **THEN** the request is rejected with HTTP 403, nothing is deleted, and the user sees the
  permission message, not an error page

#### Scenario: Status changed after the list was rendered

- **WHEN** a `data-collector` confirms Delete on a row that was `DRAFT` when the list loaded but is
  now `SUBMITTED`
- **THEN** nothing is deleted, the permission message is shown, and the refreshed list no longer
  offers Delete on that row

### Requirement: A delete blocked by dependents is reported as a message and changes nothing

When the event cannot be deleted because other records depend on it, the route action SHALL NOT
redirect or render an error page. The list page SHALL stay as it was, the row SHALL remain, and
an error message SHALL be shown identifying the blocking reason(s). One message per blocking
reason, in this order:

1. a disaster event references it;
2. a disaster-event causality link references it;
3. a hazardous-event cause/effect link references it;
4. another event records it as its cause (legacy parent link).

The message SHALL NOT disclose any count or detail of records belonging to another tenant.

A hazardous-event cause/effect link (on either side), a disaster-event causality link (in either
direction), and a legacy parent link SHALL each block the delete. None of them SHALL be removed
as a side effect of a delete attempt.

#### Scenario: Referenced by a disaster event

- **WHEN** a user confirms Delete on an event that a disaster event references
- **THEN** the row remains and the user sees "Cannot delete hazard event because it is linked to
  one or more disaster events. Please delete the associated disaster events first."

#### Scenario: Cause of another event through a legacy parent link (DEF-044)

- **WHEN** a user confirms Delete on an event that another event records as its legacy parent
- **THEN** the row remains, no data changes, and the user sees "Delete events that are caused by
  this event first", not an error page

#### Scenario: An unrecognised conflict gets a generic message

- **WHEN** a delete is refused by a conflict that is neither a known dependent nor the legacy
  parent link
- **THEN** the row remains and the user sees "This record cannot be deleted.", not the
  caused-by message and not an error page

#### Scenario: Linked through a hazardous-event cause/effect link

- **WHEN** a user confirms Delete on an event that is the cause or the effect in a hazardous-event
  causal link
- **THEN** the row remains, the link is intact, and the user sees the cause/effect-link blocked
  message

#### Scenario: Linked to a disaster event through event causality, including cross-tenant

- **WHEN** a user confirms Delete on an event with an event-causality link, where the linked
  record belongs to another tenant
- **THEN** the row remains and the user sees the event-causality blocked message, with no count
  or name for the other tenant's record

#### Scenario: Several blocking reasons at once

- **WHEN** an event is both referenced by a disaster event and linked by a causal link
- **THEN** the user sees both blocked messages, in the order above

#### Scenario: Attachment files survive a blocked delete

- **WHEN** a delete of an event with File-type attachments is blocked by a dependent
- **THEN** the event's attachment files still exist

### Requirement: Concurrent and repeated delete attempts never produce an error page

Two delete attempts for the same event that overlap or follow one another SHALL result in exactly
one deletion and exactly one `delete` audit entry. Neither attempt SHALL produce an error page.
The attempt that did not perform the deletion SHALL end with either the success outcome or the
"Record not found or access denied" message.

#### Scenario: Two tabs confirm Delete on the same event at the same time

- **WHEN** two sessions of the same tenant submit a delete for the same zero-dependent event
  concurrently, before either has resolved
- **THEN** exactly one deletion and one audit entry occur, and each session ends on either the
  "Record deleted" outcome or the not-found message, never an error page

#### Scenario: Second tab confirms after the first has finished

- **WHEN** tab 1's delete has completed, and tab 2 (still showing the stale row) then confirms
  Delete on the same event
- **THEN** tab 2 sees "Record not found or access denied" and nothing else changes

#### Scenario: Double click on Delete permanently

- **WHEN** the user activates "Delete permanently" twice in quick succession
- **THEN** only one delete request is sent
