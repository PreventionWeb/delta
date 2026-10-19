# email-notification-adapter Specification

## Purpose

Defines `EmailNotificationAdapter`, the first real implementation of `INotificationPort`:
an entity-type-generic (`HE`/`DE`/`DR`) email sender that replicates the confirmed legacy
recipient-targeting and template-selection behavior of
`emailAssignedValidators`/`emailValidationWorkflowStatusChangeNotificationService`/
`emailAssigneesNotificationService`, without depending on `BackendContext` or any
HE/DE/DR-specific data source.

## Requirements

### Requirement: EmailNotificationAdapter implements INotificationPort with no BackendContext dependency

`EmailNotificationAdapter` MUST implement `INotificationPort`'s `notify(notification):
Promise<void>` method. It MUST NOT import or require a `BackendContext` (`ctx`) — it runs as
a singleton provider (roadmap `5c`), not per-request. It MUST build record URLs via
`configPublicUrl()` directly and MUST NOT call `ctx.t`/`ctx.lang`/`ctx.fullUrl`.

#### Scenario: Adapter instantiates and sends without any ctx argument

- **GIVEN** `EmailNotificationAdapter` constructed with no `BackendContext` argument
- **WHEN** `notify()` is called with a valid `WorkflowActionNotification`
- **THEN** the call MUST resolve (or reject only per the scenarios below) without
  referencing `ctx` in any form

### Requirement: submit-validation sends the assigned-validators email to every validatorUserIds entry

When `notification.action === "submit-validation"`, `notify()` MUST send one email to each
user id in `notification.validatorUserIds`, resolving each recipient's email via
`UserRepository.getById`, using `notification.recordDisplayName` and
`notification.recordDate` in the body, and a record URL built from
`notification.entityType`/`notification.entityId`. It MUST also resolve
`notification.submittedByUserId` and include that submitter's display name in the body
(replicates `emailAssignedValidators`'s "Submitted by:" line) — restored by code review,
2026-10-17, after an earlier implementation pass dropped it without a corresponding design
decision.

#### Scenario: Two validators both receive the assigned-validators email

- **GIVEN** a notification with `action: "submit-validation"`, `validatorUserIds: ["v1",
"v2"]`, `recordDisplayName: "Flood"`, `recordDate: "2026-10-01"`, `entityType: "HE"`,
  `entityId: "entity-1"`
- **AND** `UserRepository.getById` resolves a user with a valid email for both `"v1"` and
  `"v2"`
- **WHEN** `notify(notification)` is called
- **THEN** `sendEmail` SHALL have been called exactly twice, once per validator's email
  address
- **AND** both calls' bodies SHALL include `"Flood"` and a URL containing
  `/hazardous-event/entity-1`

#### Scenario: The assigned-validators email includes the resolved submitter's display name

- **GIVEN** a notification with `action: "submit-validation"`, `validatorUserIds: ["v1"]`,
  `submittedByUserId: "submitter-1"`
- **AND** `UserRepository.getById("submitter-1")` resolves a user with `firstName: "Sam"`,
  `lastName: "Submitter"`
- **WHEN** `notify(notification)` is called
- **THEN** the sent email's body SHALL include `"Submitted by: Sam Submitter"`

#### Scenario: A validator with no email on file is skipped, others still notified

- **GIVEN** a notification with `action: "submit-validation"`, `validatorUserIds: ["v1",
"v2"]`
- **AND** `UserRepository.getById("v1")` resolves a user with no `email` field set
- **AND** `UserRepository.getById("v2")` resolves a user with a valid email
- **WHEN** `notify(notification)` is called
- **THEN** `sendEmail` SHALL have been called exactly once, for `"v2"`'s email
- **AND** the call MUST NOT reject solely because `"v1"` had no email

### Requirement: validate and publish send the submitter notification only when a corresponding legacy event exists

When `notification.action === "validate"` and `notification.toStatus === "APPROVED"`, or
`notification.action === "publish"`, `notify()` MUST send exactly one email to
`notification.submittedByUserId`'s resolved address (the "validated" or "published"
template respectively). When `notification.action === "validate"` and
`notification.toStatus === "SUBMITTED"` (status unchanged — `alsoApprove: false`), `notify()`
MUST send no email at all and MUST resolve normally.

#### Scenario: validate with toStatus APPROVED sends the validated email to the submitter

- **GIVEN** a notification with `action: "validate"`, `toStatus: "APPROVED"`,
  `submittedByUserId: "submitter-1"`
- **AND** `UserRepository.getById("submitter-1")` resolves a user with a valid email
- **WHEN** `notify(notification)` is called
- **THEN** `sendEmail` SHALL have been called exactly once, to that submitter's email,
  with a body indicating the record has been validated

#### Scenario: validate with toStatus unchanged sends no email

- **GIVEN** a notification with `action: "validate"`, `fromStatus: "SUBMITTED"`,
  `toStatus: "SUBMITTED"`, `submittedByUserId: "submitter-1"`
- **WHEN** `notify(notification)` is called
- **THEN** `sendEmail` SHALL NOT have been called
- **AND** the call MUST resolve without rejecting

#### Scenario: publish sends the published email to the submitter

- **GIVEN** a notification with `action: "publish"`, `toStatus: "PUBLISHED"`,
  `submittedByUserId: "submitter-2"`
- **AND** `UserRepository.getById("submitter-2")` resolves a user with a valid email
- **WHEN** `notify(notification)` is called
- **THEN** `sendEmail` SHALL have been called exactly once, to that submitter's email,
  with a body indicating the record has been published

#### Scenario: submittedByUserId is null — no submitter email is possible, notify() still resolves

- **GIVEN** a notification with `action: "publish"`, `toStatus: "PUBLISHED"`,
  `submittedByUserId: null`
- **WHEN** `notify(notification)` is called
- **THEN** `sendEmail` SHALL NOT have been called
- **AND** the call MUST resolve without rejecting (matches legacy's own
  `if (!submitterUserId) return;` early exit)

### Requirement: return sends to assigneeUserIds when present and non-empty, otherwise to submittedByUserId

When `notification.action === "return"` and `notification.assigneeUserIds` is present and
non-empty, `notify()` MUST send one email to each id in `assigneeUserIds` (the
"returned — action needed" template, embedding `notification.rejectionComments`) and MUST
NOT email `submittedByUserId`. When `assigneeUserIds` is absent or empty, `notify()` MUST
send exactly one email to `submittedByUserId` (the "needs revision" template, embedding
`notification.rejectionComments`) instead.

#### Scenario: return with assigneeUserIds notifies only the assignees

- **GIVEN** a notification with `action: "return"`, `assigneeUserIds: ["a1", "a2"]`,
  `submittedByUserId: "submitter-1"`, `rejectionComments: "Fix the date"`
- **AND** both `"a1"` and `"a2"` resolve to users with valid emails
- **WHEN** `notify(notification)` is called
- **THEN** `sendEmail` SHALL have been called exactly twice, to `"a1"`'s and `"a2"`'s
  emails
- **AND** `sendEmail` SHALL NOT have been called for `submitter-1`'s email
- **AND** both bodies SHALL include `"Fix the date"`

#### Scenario: return without assigneeUserIds notifies the submitter

- **GIVEN** a notification with `action: "return"`, no `assigneeUserIds` field,
  `submittedByUserId: "submitter-1"`, `rejectionComments: "Fix the date"`
- **AND** `"submitter-1"` resolves to a user with a valid email
- **WHEN** `notify(notification)` is called
- **THEN** `sendEmail` SHALL have been called exactly once, to `submitter-1`'s email
- **AND** the body SHALL include `"Fix the date"`

#### Scenario: return with an empty assigneeUserIds array notifies the submitter, not zero recipients

- **GIVEN** a notification with `action: "return"`, `assigneeUserIds: []`,
  `submittedByUserId: "submitter-1"`, `rejectionComments: "Fix the date"`
- **WHEN** `notify(notification)` is called
- **THEN** `sendEmail` SHALL have been called exactly once, to `submitter-1`'s email —
  an empty array is treated identically to an absent field, never as "notify zero people"

### Requirement: Every interpolated value in an HTML email body is escaped

`notify()` MUST HTML-escape every dynamic string it interpolates into an HTML email body —
`rejectionComments`, resolved user display names, and `recordDisplayName` — for every
template, with no exception. This applies even where the legacy template this adapter
replaces did not escape that value (the "needs-revision" submitter template's
`rejectionComments` interpolation).

#### Scenario: Rejection comments containing HTML are escaped in the submitter notification

- **GIVEN** a notification with `action: "return"`, no `assigneeUserIds`,
  `submittedByUserId: "submitter-1"`, `rejectionComments: "<script>alert(1)</script>"`
- **WHEN** `notify(notification)` is called
- **THEN** the HTML body passed to `sendEmail` SHALL contain the escaped form (e.g.
  `&lt;script&gt;`) and SHALL NOT contain a literal `<script>` tag

#### Scenario: Rejection comments containing HTML are escaped in the assignees notification

- **GIVEN** a notification with `action: "return"`, `assigneeUserIds: ["a1"]`,
  `rejectionComments: "<b>bad</b>"`
- **WHEN** `notify(notification)` is called
- **THEN** the HTML body passed to `sendEmail` SHALL contain the escaped form and SHALL NOT
  contain a literal `<b>` tag

### Requirement: A failed send for one recipient does not prevent sends to other recipients in the same notify() call

When `notify()` must send to more than one recipient (`"submit-validation"`'s
`validatorUserIds`, or `"return"`'s `assigneeUserIds`), a `sendEmail` rejection for one
recipient MUST NOT prevent the attempt for any other recipient in the same call. After every
recipient has been attempted, if at least one send failed, `notify()` MUST reject with one
error reflecting that at least one send failed. If every send succeeded, `notify()` MUST
resolve normally.

#### Scenario: One recipient's send fails, the other recipient is still emailed, and notify() rejects afterward

- **GIVEN** a notification with `action: "submit-validation"`, `validatorUserIds: ["v1",
"v2"]`
- **AND** `sendEmail` rejects for `"v1"`'s address and resolves for `"v2"`'s address
- **WHEN** `notify(notification)` is called
- **THEN** `sendEmail` SHALL have been called for both `"v1"` and `"v2"`'s addresses
- **AND** the `notify()` call SHALL reject (reflecting `"v1"`'s failure) only after both
  attempts have completed, not before `"v2"`'s attempt was made

#### Scenario: All recipients fail, notify() rejects once after every attempt

- **GIVEN** a notification with `action: "return"`, `assigneeUserIds: ["a1", "a2"]`
- **AND** `sendEmail` rejects for both addresses
- **WHEN** `notify(notification)` is called
- **THEN** `sendEmail` SHALL have been called for both `"a1"` and `"a2"`'s addresses
- **AND** the `notify()` call SHALL reject exactly once, after both attempts have completed

### Requirement: Entity type maps to the correct URL segment and display label

`notify()` MUST map `notification.entityType` to a record URL segment and display label:
`"HE"` → `hazardous-event` / `"hazardous event"`; `"DE"` → `disaster-event` / `"disaster
event"`; `"DR"` → `disaster-record` / `"disaster record"`. The record URL MUST be built as
`` `${configPublicUrl()}/${urlSegment}/${entityId}` ``, with no language path segment.

#### Scenario: Each entity type produces its own URL segment and label

- **GIVEN** three notifications identical except for `entityType`: `"HE"`, `"DE"`, `"DR"`,
  each with `entityId: "entity-1"`
- **WHEN** `notify()` is called for each, triggering an email send
- **THEN** the resulting record URLs SHALL contain `/hazardous-event/entity-1`,
  `/disaster-event/entity-1`, and `/disaster-record/entity-1` respectively
- **AND** each body SHALL use the matching display label

### Requirement: No concurrent-callers scenario applies — the adapter holds no shared mutable state

`EmailNotificationAdapter` MUST NOT maintain any in-memory cache, counter, or other shared
mutable state across `notify()` calls. Each call is independent and reads only its own
`notification` argument plus per-call lookups (`UserRepository.getById`, `sendEmail`).

#### Scenario: Two concurrent notify() calls for different notifications do not interact

- **GIVEN** two `notify()` calls started concurrently, for two different
  `WorkflowActionNotification` payloads (different `instanceId`s)
- **WHEN** both are in flight at the same time
- **THEN** each call's sent emails SHALL reflect only its own notification's data — neither
  call's recipient list, template choice, or interpolated values SHALL be affected by the
  other call being in flight
