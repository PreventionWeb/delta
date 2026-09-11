# workflow-instance-entity Specification

## Purpose

Models a single entity's (HE/DE/DR) approval-workflow status and attribution as a
framework-free domain entity, with transition methods that enforce a fixed status graph
and the publish backfill rule for validator attribution.

## Requirements

### Requirement: WorkflowInstance construction via validated factory

The `WorkflowInstance` domain entity in
`app/domains/validation-workflow/domain/WorkflowInstance.ts` SHALL only be instantiated
through a static `WorkflowInstance.create(props)` factory. The constructor MUST be
inaccessible to callers outside the class. The factory MUST validate that `entityType` is
one of `'HE'`, `'DE'`, `'DR'` and that `status` is one of `DRAFT`, `SUBMITTED`,
`REVISION_REQUESTED`, `APPROVED`, `REJECTED`, `PUBLISHED`, and MUST throw
`ValidationError` (from `app/shared/errors/`) if either is not a member of its enum.

The factory MUST also validate that `createdAt` and `updatedAt` are each a valid `Date`
instance (design.md Decision 9) — not merely `instanceof Date`, but also not representing
an invalid date (e.g. `new Date("garbage")`, which is `instanceof Date` but has `NaN` for
`getTime()`). `ValidationError` on either field being invalid.

The same validity check MUST also apply to each of the four attribution timestamps
(`submittedAt`, `validatedAt`, `approvedAt`, `publishedAt`), each only when it is non-null
(they are nullable). `ValidationError` on any of them being a non-null but invalid `Date`.

The factory MUST also validate cross-field consistency (design.md Decision 7): each of
the four attribution pairs (`submittedByUserId`/`submittedAt`,
`validatedByUserId`/`validatedAt`, `approvedByUserId`/`approvedAt`,
`publishedByUserId`/`publishedAt`) MUST be jointly `null` or jointly set — never split —
and, except when `status` is `REJECTED` (unvalidated — no transition targets it yet), the
pairs required set or required null for the given `status` (per Decision 7's table) MUST
be satisfied. `ValidationError` on any violation.

#### Scenario: Happy path — fresh DRAFT instance with no attribution set

- **GIVEN** a props object with a valid `entityId`, `entityType: 'HE'`, `status: 'DRAFT'`,
  and every attribution field (`submittedByUserId`, `submittedAt`, `validatedByUserId`,
  `validatedAt`, `approvedByUserId`, `approvedAt`, `publishedByUserId`, `publishedAt`)
  `null`
- **WHEN** `WorkflowInstance.create(props)` is called
- **THEN** it MUST return a `WorkflowInstance` instance whose properties match the input
  exactly, without throwing

#### Scenario: Happy path — reconstitution with a subset of attribution already set

- **GIVEN** a props object with `status: 'SUBMITTED'`, `submittedByUserId`/`submittedAt`
  set to real values, and every other attribution field `null`
- **WHEN** `WorkflowInstance.create(props)` is called
- **THEN** it MUST return a `WorkflowInstance` instance without throwing
- **AND** the returned instance's `submittedByUserId`/`submittedAt` MUST equal the input

#### Scenario: Failure — invalid entityType throws ValidationError

- **GIVEN** a props object where `entityType` is `'XX'` (not `'HE'`, `'DE'`, or `'DR'`)
- **WHEN** `WorkflowInstance.create(props)` is called
- **THEN** it MUST throw a `ValidationError`
- **AND** the error message MUST reference the `entityType` field

#### Scenario: Failure — invalid status throws ValidationError

- **GIVEN** a props object where `status` is `'IN_REVIEW'` (not a member of the status
  enum)
- **WHEN** `WorkflowInstance.create(props)` is called
- **THEN** it MUST throw a `ValidationError`
- **AND** the error message MUST reference the `status` field

#### Scenario: Failure — a split attribution pair throws ValidationError

- **GIVEN** a props object where `validatedByUserId` is set but `validatedAt` is `null`
  (or vice versa for any of the four pairs)
- **WHEN** `WorkflowInstance.create(props)` is called
- **THEN** it MUST throw a `ValidationError`

#### Scenario: Failure — a status missing its required attribution throws ValidationError

- **GIVEN** a props object with `status: 'SUBMITTED'` and `submittedByUserId`/
  `submittedAt` both `null`
- **WHEN** `WorkflowInstance.create(props)` is called
- **THEN** it MUST throw a `ValidationError`

#### Scenario: Failure — a status with attribution it must not have throws ValidationError

- **GIVEN** a props object with `status: 'DRAFT'` and any attribution pair non-null
- **WHEN** `WorkflowInstance.create(props)` is called
- **THEN** it MUST throw a `ValidationError`

#### Scenario: REJECTED is exempt from status-required-attribution validation

- **GIVEN** a props object with `status: 'REJECTED'` and any combination of attribution
  fields (each pair still jointly null or jointly set)
- **WHEN** `WorkflowInstance.create(props)` is called
- **THEN** it MUST NOT throw

#### Scenario: Failure — an invalid createdAt or updatedAt throws ValidationError

- **GIVEN** a props object where `createdAt` (or `updatedAt`) is `new Date("garbage")` —
  an object that is `instanceof Date` but whose `getTime()` is `NaN`
- **WHEN** `WorkflowInstance.create(props)` is called
- **THEN** it MUST throw a `ValidationError`

#### Scenario: Failure — an invalid non-null attribution timestamp throws ValidationError

- **GIVEN** a props object where one of `submittedAt`, `validatedAt`, `approvedAt`, or
  `publishedAt` is non-null but is `new Date("garbage")` — an object that is
  `instanceof Date` but whose `getTime()` is `NaN`
- **WHEN** `WorkflowInstance.create(props)` is called
- **THEN** it MUST throw a `ValidationError`

#### Scenario: Attribution timestamp validity is checked before pair consistency

- **GIVEN** a props object where one attribution pair's `ByUserId` field is `null` and its
  `At` field is non-null but is `new Date("garbage")` (a shape that could plausibly be
  rejected either as a split pair or as an invalid Date)
- **WHEN** `WorkflowInstance.create(props)` is called
- **THEN** it MUST throw a `ValidationError` whose message references that the `At` field
  must be a valid Date, not that the pair is split

### Requirement: WorkflowInstance exposes all domain properties read-only

The `WorkflowInstance` instance returned by `create()` MUST expose every column modeled
from `workflowInstanceTable` as a read-only property: `id`, `entityId`, `entityType`,
`status`, `submittedByUserId`, `submittedAt`, `validatedByUserId`, `validatedAt`,
`approvedByUserId`, `approvedAt`, `publishedByUserId`, `publishedAt`, `createdAt`,
`updatedAt`. No property MUST be mutable after construction. Every `Date`-returning
getter MUST return a distinct clone, not the entity's own internal `Date` instance —
mutating a returned `Date` MUST NOT change what the entity itself reports.

Construction itself MUST also defensively clone every incoming `Date`/nullable-`Date`
field before storing it (design.md Decision 2, round 3 hardening): a caller mutating a
`Date` object after passing it into `create()`, or reusing a single shared `Date` instance
across a transition call and a later mutation, MUST NOT be able to change what the
constructed (or transitioned) instance subsequently reports.

#### Scenario: Properties are accessible after construction

- **GIVEN** a `WorkflowInstance` created by `WorkflowInstance.create(props)`
- **WHEN** each property is read
- **THEN** it MUST return the value that was passed in `props`

#### Scenario: Mutating a returned Date does not affect the entity's own state

- **GIVEN** a `WorkflowInstance` with a non-null `submittedAt`
- **WHEN** the caller mutates the `Date` object returned by the `submittedAt` getter
- **THEN** a subsequent read of `submittedAt` MUST still return the original, unmutated
  value

#### Scenario: Mutating a Date after passing it into create() does not affect the entity's state

- **GIVEN** a `Date` object passed as `submittedAt` into `WorkflowInstance.create(props)`
- **WHEN** the caller mutates that same `Date` object after the call returns
- **THEN** the entity's `submittedAt` getter MUST still return the original, unmutated
  value

#### Scenario: Mutating a shared `now` after a transition does not affect the returned instance

- **GIVEN** a `Date` object passed as `now` into a transition method (e.g. `submit()`)
- **WHEN** the caller mutates that same `Date` object after the transition returns
- **THEN** the returned instance's stamped fields (e.g. `submittedAt`, `updatedAt`) MUST
  still reflect the original, unmutated value

### Requirement: submit() transitions DRAFT or REVISION_REQUESTED to SUBMITTED and stamps submission attribution

`submit({ userId, now })` SHALL be callable only when the instance's current `status` is
`DRAFT` or `REVISION_REQUESTED`. It MUST return a new `WorkflowInstance` with `status:
'SUBMITTED'`, `submittedByUserId` set to `userId`, `submittedAt` set to `now`, and
`updatedAt` set to `now`. It MUST also set `validatedByUserId` and `validatedAt` to
`null`, clearing any validator attribution left over from a prior revision cycle. It MUST
NOT mutate the original instance. Calling it from any other status MUST throw
`ConflictError` (from `app/shared/errors/`) and MUST NOT change `status` or any
attribution field.

#### Scenario: Happy path — submit from DRAFT

- **GIVEN** a `WorkflowInstance` with `status: 'DRAFT'`
- **WHEN** `.submit({ userId: "user-1", now: someDate })` is called
- **THEN** it MUST return a new instance with `status: 'SUBMITTED'`,
  `submittedByUserId: "user-1"`, `submittedAt: someDate`
- **AND** the original instance's `status` MUST still be `'DRAFT'`

#### Scenario: Happy path — resubmit from REVISION_REQUESTED overwrites prior submission attribution

- **GIVEN** a `WorkflowInstance` with `status: 'REVISION_REQUESTED'` and
  `submittedByUserId`/`submittedAt` already set from an earlier submission
- **WHEN** `.submit({ userId: "user-2", now: laterDate })` is called
- **THEN** it MUST return a new instance with `status: 'SUBMITTED'`,
  `submittedByUserId: "user-2"`, `submittedAt: laterDate`

#### Scenario: Resubmit from REVISION_REQUESTED clears stale validator attribution

- **GIVEN** a `WorkflowInstance` with `status: 'REVISION_REQUESTED'` and
  `validatedByUserId`/`validatedAt` set from a validation that happened before the
  revision was requested
- **WHEN** `.submit({ userId: "user-2", now: laterDate })` is called
- **THEN** the returned instance's `validatedByUserId` and `validatedAt` MUST both be
  `null`

#### Scenario: Failure — submit from SUBMITTED throws ConflictError

- **GIVEN** a `WorkflowInstance` with `status: 'SUBMITTED'`
- **WHEN** `.submit({ userId: "user-1", now: someDate })` is called
- **THEN** it MUST throw a `ConflictError`

#### Scenario: Failure — submit from APPROVED, REJECTED, or PUBLISHED throws ConflictError

- **GIVEN** a `WorkflowInstance` with `status` equal to `'APPROVED'`, `'REJECTED'`, or
  `'PUBLISHED'`
- **WHEN** `.submit({ userId: "user-1", now: someDate })` is called
- **THEN** it MUST throw a `ConflictError` in every case

### Requirement: validate() stamps validator attribution while SUBMITTED without changing status

`validate({ userId, now })` SHALL be callable only when the instance's current `status`
is `SUBMITTED`. It MUST return a new `WorkflowInstance` with `status` unchanged
(`'SUBMITTED'`), `validatedByUserId` set to `userId`, and `validatedAt` set to `now`.
Calling it from any other status MUST throw `ConflictError` and MUST NOT change any
attribution field.

#### Scenario: Happy path — validate while SUBMITTED

- **GIVEN** a `WorkflowInstance` with `status: 'SUBMITTED'` and `validatedByUserId`/
  `validatedAt` both `null`
- **WHEN** `.validate({ userId: "validator-1", now: someDate })` is called
- **THEN** it MUST return a new instance with `status: 'SUBMITTED'`,
  `validatedByUserId: "validator-1"`, `validatedAt: someDate`

#### Scenario: Failure — validate from DRAFT, REVISION_REQUESTED, APPROVED, REJECTED, or PUBLISHED throws ConflictError

- **GIVEN** a `WorkflowInstance` with `status` equal to any value other than `'SUBMITTED'`
- **WHEN** `.validate({ userId: "validator-1", now: someDate })` is called
- **THEN** it MUST throw a `ConflictError` in every case

### Requirement: approve() transitions from SUBMITTED and stamps approval attribution

`approve({ userId, now })` SHALL be callable only when `status` is `SUBMITTED`. It MUST
return a new instance with `status: 'APPROVED'`, `approvedByUserId` set to `userId`, and
`approvedAt` set to `now`. Calling it from any other status MUST throw `ConflictError`.

There is no `reject()` method in this change. `REJECTED` remains a valid `status` enum
member (construction/reconstitution accepts it), but no transition method produces or
consumes it — it represents a distinct, not-yet-designed capability (flagging a draft as
a likely duplicate or miscategorized entry), confirmed out of scope with the user.

#### Scenario: Happy path — approve from SUBMITTED

- **GIVEN** a `WorkflowInstance` with `status: 'SUBMITTED'`
- **WHEN** `.approve({ userId: "approver-1", now: someDate })` is called
- **THEN** it MUST return a new instance with `status: 'APPROVED'`,
  `approvedByUserId: "approver-1"`, `approvedAt: someDate`

#### Scenario: Failure — approve from DRAFT, REVISION_REQUESTED, APPROVED, REJECTED, or PUBLISHED throws ConflictError

- **GIVEN** a `WorkflowInstance` with `status` equal to any value other than `'SUBMITTED'`
- **WHEN** `.approve({ userId: "approver-1", now: someDate })` is called
- **THEN** it MUST throw a `ConflictError` in every case

### Requirement: requestRevision() transitions SUBMITTED to REVISION_REQUESTED without writing any attribution field

`requestRevision({ userId, now })` SHALL be callable only when `status` is `SUBMITTED`.
It MUST return a new instance with `status: 'REVISION_REQUESTED'`. It MUST NOT set,
clear, or otherwise change `submittedByUserId`, `submittedAt`, `validatedByUserId`,
`validatedAt`, `approvedByUserId`, `approvedAt`, `publishedByUserId`, or `publishedAt` —
no column exists to record who requested revision or when. Calling it from any other
status MUST throw `ConflictError`.

#### Scenario: Happy path — request revision from SUBMITTED writes no attribution

- **GIVEN** a `WorkflowInstance` with `status: 'SUBMITTED'` and `submittedByUserId`/
  `submittedAt` already set from the submission
- **WHEN** `.requestRevision({ userId: "reviewer-1", now: someDate })` is called
- **THEN** it MUST return a new instance with `status: 'REVISION_REQUESTED'`
- **AND** `submittedByUserId`/`submittedAt` on the returned instance MUST equal the
  original instance's values, unchanged
- **AND** every other attribution field on the returned instance MUST remain `null`

#### Scenario: Failure — requestRevision from DRAFT, REVISION_REQUESTED, APPROVED, REJECTED, or PUBLISHED throws ConflictError

- **GIVEN** a `WorkflowInstance` with `status` equal to any value other than `'SUBMITTED'`
- **WHEN** `.requestRevision({ userId: "reviewer-1", now: someDate })` is called
- **THEN** it MUST throw a `ConflictError` in every case

### Requirement: publish() transitions APPROVED to PUBLISHED and backfills validator attribution only when empty

`publish({ userId, now })` SHALL be callable only when `status` is `APPROVED`. It MUST
return a new instance with `status: 'PUBLISHED'`, `publishedByUserId` set to `userId`,
and `publishedAt` set to `now` — unconditionally, every time. In addition:

- If, at the time `publish()` is called, both `validatedByUserId` and `validatedAt` are
  `null`, the returned instance MUST have `validatedByUserId` set to `userId` and
  `validatedAt` set to `now` (direct publish, auto-marked validated).
- If either `validatedByUserId` or `validatedAt` is already non-null, the returned
  instance's `validatedByUserId`/`validatedAt` MUST equal the original instance's values
  exactly, unchanged — an existing validator's attribution MUST NOT be overwritten by the
  publisher, regardless of whether the publisher is a different user than the validator.

Calling `publish()` from any status other than `APPROVED` MUST throw `ConflictError`.

#### Scenario: Direct publish — validator fields empty get backfilled from the publisher

- **GIVEN** a `WorkflowInstance` with `status: 'APPROVED'` and `validatedByUserId`/
  `validatedAt` both `null`
- **WHEN** `.publish({ userId: "publisher-1", now: someDate })` is called
- **THEN** it MUST return a new instance with `status: 'PUBLISHED'`,
  `publishedByUserId: "publisher-1"`, `publishedAt: someDate`,
  `validatedByUserId: "publisher-1"`, `validatedAt: someDate`

#### Scenario: Publish after separate validation — existing validator attribution is preserved

- **GIVEN** a `WorkflowInstance` with `status: 'APPROVED'`, `validatedByUserId:
"validator-1"`, and `validatedAt: earlierDate` (set by an earlier `validate()` call)
- **WHEN** `.publish({ userId: "publisher-2", now: laterDate })` is called
- **THEN** it MUST return a new instance with `status: 'PUBLISHED'`,
  `publishedByUserId: "publisher-2"`, `publishedAt: laterDate`
- **AND** `validatedByUserId` MUST still equal `"validator-1"`
- **AND** `validatedAt` MUST still equal `earlierDate`

#### Scenario: Failure — publish from DRAFT, SUBMITTED, REVISION_REQUESTED, REJECTED, or PUBLISHED throws ConflictError

- **GIVEN** a `WorkflowInstance` with `status` equal to any value other than `'APPROVED'`
- **WHEN** `.publish({ userId: "publisher-1", now: someDate })` is called
- **THEN** it MUST throw a `ConflictError` in every case

### Requirement: Every transition method stamps updatedAt

`submit`, `validate`, `approve`, `requestRevision`, and `publish` MUST each set the
returned instance's `updatedAt` to the `now` value passed into that call.

#### Scenario: updatedAt reflects the transition's own now, not a wall-clock read

- **GIVEN** a `WorkflowInstance` in a status from which a given transition method is
  legal
- **WHEN** that transition method is called with an explicit `now`
- **THEN** the returned instance's `updatedAt` MUST equal that `now` value exactly

### Requirement: Transition methods validate the caller-supplied now

Every transition method (`submit`, `validate`, `approve`, `requestRevision`, `publish`)
MUST reject a `now` that is not a valid `Date` instance (design.md Decision 5 addendum) —
the same validity check as `create()`'s (design.md Decision 9): not merely `instanceof
Date`, but also not representing an invalid date. An invalid `now` MUST throw
`ValidationError`, not `ConflictError` — this is malformed input, not a conflict with the
instance's current status — and MUST throw even when the instance's current status would
also make the transition disallowed.

#### Scenario: Failure — an invalid now throws ValidationError

- **GIVEN** a `WorkflowInstance` in a status from which a given transition method is legal
- **WHEN** that transition method is called with `now` set to `new Date("garbage")` — an
  object that is `instanceof Date` but whose `getTime()` is `NaN`
- **THEN** it MUST throw a `ValidationError`

#### Scenario: An invalid now takes priority over a status conflict

- **GIVEN** a `WorkflowInstance` in a status from which a given transition method is
  disallowed
- **WHEN** that transition method is called with an invalid `now`
- **THEN** it MUST throw a `ValidationError`, not a `ConflictError`

### Requirement: ConflictError carries the attempted transition, current status, and entity identity

Every `ConflictError` thrown by a disallowed transition MUST have a `message`
identifying which transition was attempted and the status it was attempted from, and a
`context` object (per `DomainError`) equal to `{ entityId, entityType, from: <current
status>, attemptedTransition: <method name> }`.

#### Scenario: ConflictError message names the transition and status

- **GIVEN** a `WorkflowInstance` in a status from which `submit()` is disallowed
- **WHEN** `.submit(...)` is called
- **THEN** the thrown `ConflictError`'s message MUST reference both `"submit"` and the
  instance's current status

#### Scenario: ConflictError context carries entity identity and the attempted transition

- **GIVEN** a `WorkflowInstance` with a known `entityId`/`entityType`, in a status from
  which `submit()` is disallowed
- **WHEN** `.submit(...)` is called
- **THEN** the thrown `ConflictError`'s `context` MUST equal `{ entityId, entityType,
from: <the instance's current status>, attemptedTransition: "submit" }`

### Requirement: Transition methods are pure and never mutate the receiver

Every transition method (`submit`, `validate`, `approve`, `requestRevision`,
`publish`) MUST leave the `WorkflowInstance` it was called on completely unchanged and
MUST return a distinct new `WorkflowInstance` object. No transition method MUST read from
or write to any module-level variable, cache, or singleton.

#### Scenario: Original instance is unchanged after a successful transition

- **GIVEN** a `WorkflowInstance` with `status: 'DRAFT'`
- **WHEN** `.submit({ userId: "user-1", now: someDate })` is called and its result is
  discarded
- **THEN** the original instance's `status` MUST still be `'DRAFT'`
- **AND** the original instance's `submittedByUserId`/`submittedAt` MUST still be `null`

#### Scenario: Two sequential transitions from the same instance produce independent results

- **GIVEN** a single `WorkflowInstance` with `status: 'SUBMITTED'`
- **WHEN** `.approve({ userId: "a", now: d1 })` is called once, and separately
  `.requestRevision({ userId: "b", now: d2 })` is called again on the same original
  instance
- **THEN** the two results MUST be independent objects
- **AND** the `approve()` result MUST have `status: 'APPROVED'`
- **AND** the `requestRevision()` result MUST have `status: 'REVISION_REQUESTED'`
- **AND** neither call MUST have affected the other's result
