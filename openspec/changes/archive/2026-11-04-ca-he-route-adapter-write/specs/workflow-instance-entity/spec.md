## MODIFIED Requirements

### Requirement: WorkflowInstance construction via validated factory

The `WorkflowInstance` domain entity in
`app/domains/validation-workflow/domain/WorkflowInstance.ts` SHALL only be instantiated
through a static `WorkflowInstance.create(props)` factory. The constructor MUST be
inaccessible to callers outside the class.

The factory MUST first validate that `entityId` is present: `null`, `undefined`, or a
string that is empty or contains only whitespace after `.trim()` MUST cause the factory
to throw `ValidationError` (from `app/shared/errors/`) with a message that references the
`entityId` field (matching `HazardousEvent.create()`'s convention: literally `entityId
must not be empty`). This check MUST run before every other validation in `create()` —
including the `entityType`/`status` enum checks below — so that an `entityId` presence
failure is always reported as an `entityId` error, never masked by a different field's
error when multiple fields are simultaneously invalid.

The same check MUST also reject any `entityId` value that is not a string and not
`null`/`undefined` — e.g. a number, object, or boolean — by throwing `ValidationError`
from the identical check. It MUST NOT allow an internal `.trim()` call to throw a raw
`TypeError` when a non-string value is passed.

The factory MUST validate that `entityType` is one of `'HE'`, `'DE'`, `'DR'` and that
`status` is one of `DRAFT`, `SUBMITTED`, `REVISION_REQUESTED`, `APPROVED`, `REJECTED`,
`PUBLISHED`, and MUST throw `ValidationError` if either is not a member of its enum.

The factory MUST also validate that `createdAt` and `updatedAt` are each a valid `Date`
instance — not merely `instanceof Date`, but also not representing an invalid date (e.g.
`new Date("garbage")`, which is `instanceof Date` but has `NaN` for `getTime()`).
`ValidationError` on either field being invalid.

The same validity check MUST also apply to each of the four attribution timestamps
(`submittedAt`, `validatedAt`, `approvedAt`, `publishedAt`), each only when it is non-null
(they are nullable). `ValidationError` on any of them being a non-null but invalid `Date`.

The factory MUST also validate cross-field consistency: each of the four attribution pairs
(`submittedByUserId`/`submittedAt`, `validatedByUserId`/`validatedAt`,
`approvedByUserId`/`approvedAt`, `publishedByUserId`/`publishedAt`) MUST be jointly `null`
or jointly set — never split — and, except when `status` is `REJECTED` (unvalidated — no
transition targets it yet), the pairs required set or required null for the given
`status` MUST be satisfied, per the following table:

**CHANGED by this capability's delta** (design.md "Decision 5/6" — a necessary consequence
of adding `directValidate`/`directPublish`, not an independent relaxation):

| Status | `REQUIRED_SET` (was) | `REQUIRED_SET` (now) | `REQUIRED_NULL` (unchanged) |
| --- | --- | --- | --- |
| `DRAFT` | `[]` | `[]` | `submitted, validated, approved, published` |
| `SUBMITTED` | `submitted` | `submitted` | `approved, published` |
| `REVISION_REQUESTED` | `submitted` | `submitted` | `approved, published` |
| `APPROVED` | `submitted, approved` | **`[]`** | `published` |
| `REJECTED` | (exempt) | (exempt) | (exempt) |
| `PUBLISHED` | `submitted, validated, approved, published` | **`validated, published`** | `[]` |

`ValidationError` on any violation of the table above, same as before — only the table's
own contents changed, not the validation mechanism.

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

#### Scenario: Failure — empty-string entityId throws ValidationError

- **GIVEN** a props object where `entityId` is `""`
- **WHEN** `WorkflowInstance.create(props)` is called
- **THEN** it MUST throw a `ValidationError`
- **AND** the error message MUST reference the `entityId` field

#### Scenario: Failure — whitespace-only entityId throws ValidationError

- **GIVEN** a props object where `entityId` is `"   "` (whitespace only)
- **WHEN** `WorkflowInstance.create(props)` is called
- **THEN** it MUST throw a `ValidationError`
- **AND** the error message MUST reference the `entityId` field

#### Scenario: Failure — null or undefined entityId throws ValidationError

- **GIVEN** a props object where `entityId` is `null` or `undefined`
- **WHEN** `WorkflowInstance.create(props)` is called
- **THEN** it MUST throw a `ValidationError` in both cases
- **AND** the error message MUST reference the `entityId` field

#### Scenario: Failure — non-string, non-null entityId throws ValidationError, not TypeError

- **GIVEN** a props object where `entityId` is a number (e.g. `12345`) — a value that is
  neither `null`/`undefined` nor a string
- **WHEN** `WorkflowInstance.create(props)` is called
- **THEN** it MUST throw a `ValidationError`
- **AND** the error message MUST reference the `entityId` field
- **AND** it MUST NOT throw an unhandled `TypeError` or any other non-`ValidationError`
  exception

#### Scenario: Happy path — a real entityId value passes through unchanged

- **GIVEN** a props object where `entityId` is a real UUID string (e.g.
  `"11111111-1111-1111-1111-111111111111"`)
- **WHEN** `WorkflowInstance.create(props)` is called
- **THEN** it MUST NOT throw
- **AND** the returned instance's `entityId` getter MUST equal the input value exactly

#### Scenario: entityId presence is checked before entityType validity

- **GIVEN** a props object where `entityId` is `""` and `entityType` is `'XX'` (also
  invalid)
- **WHEN** `WorkflowInstance.create(props)` is called
- **THEN** it MUST throw a `ValidationError` whose message references `entityId`, not
  `entityType`

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

#### Scenario: APPROVED with only validatedByUserId/At set no longer throws (new, direct-validate shape)

- **GIVEN** a props object with `status: 'APPROVED'`, `validatedByUserId`/`validatedAt` set
  to real values, and `submittedByUserId`/`submittedAt`/`approvedByUserId`/`approvedAt` all
  `null`
- **WHEN** `WorkflowInstance.create(props)` is called
- **THEN** it MUST NOT throw — this is the exact shape `directValidate()` produces from a
  true `DRAFT` origin

#### Scenario: APPROVED with the normal flow's fuller shape still does not throw (unchanged)

- **GIVEN** a props object with `status: 'APPROVED'`, `submittedByUserId`/`submittedAt` and
  `approvedByUserId`/`approvedAt` all set to real values
- **WHEN** `WorkflowInstance.create(props)` is called
- **THEN** it MUST NOT throw — the relaxation is additive; the normal flow's own, stricter
  shape remains valid

#### Scenario: PUBLISHED with only validatedByUserId/At and publishedByUserId/At set no longer throws (new, direct-publish shape)

- **GIVEN** a props object with `status: 'PUBLISHED'`, `validatedByUserId`/`validatedAt` and
  `publishedByUserId`/`publishedAt` all set to real values, and
  `submittedByUserId`/`submittedAt`/`approvedByUserId`/`approvedAt` all `null`
- **WHEN** `WorkflowInstance.create(props)` is called
- **THEN** it MUST NOT throw — this is the exact shape `directPublish()` produces from a
  true `DRAFT` origin

#### Scenario: PUBLISHED missing validatedByUserId/At still throws (the narrowed requirement is still enforced)

- **GIVEN** a props object with `status: 'PUBLISHED'`, `publishedByUserId`/`publishedAt` set,
  and `validatedByUserId`/`validatedAt` both `null`
- **WHEN** `WorkflowInstance.create(props)` is called
- **THEN** it MUST throw a `ValidationError` — `validated` is still required for `PUBLISHED`
  even after the relaxation; only `submitted`/`approved` were dropped from the requirement

#### Scenario: Failure — a split attribution pair throws ValidationError

- **GIVEN** a props object where `validatedByUserId` is set but `validatedAt` is `null`
  (or vice versa for any of the four pairs)
- **WHEN** `WorkflowInstance.create(props)` is called
- **THEN** it MUST throw a `ValidationError` — unaffected by this delta's `REQUIRED_SET`
  relaxation, which only loosens which *complete* pairs are required, not the split-pair check

## ADDED Requirements

### Requirement: resetToDraft() transitions any status back to DRAFT and clears every attribution pair

`resetToDraft({ userId, now })` SHALL be callable from **any** current `status` — the only
transition method with no `allowedFrom` restriction. It MUST return a new `WorkflowInstance`
with `status: 'DRAFT'` and `submittedByUserId`/`submittedAt`, `validatedByUserId`/`validatedAt`,
`approvedByUserId`/`approvedAt`, and `publishedByUserId`/`publishedAt` all `null`. It MUST NOT
mutate the original instance. `userId` is accepted for `TransitionParams` signature consistency
but is not stored anywhere (no column records who reset a record to draft, same precedent as
`requestRevision()`'s own unused `userId`).

#### Scenario: Reset from PUBLISHED clears every attribution pair

- **GIVEN** a `WorkflowInstance` with `status: 'PUBLISHED'` and every attribution pair set to
  real values
- **WHEN** `.resetToDraft({ userId: "user-1", now: someDate })` is called
- **THEN** it MUST return a new instance with `status: 'DRAFT'` and every one of the four
  attribution pairs `null`
- **AND** the original instance's `status` and attribution MUST be unchanged

#### Scenario: Reset is callable from every status, including DRAFT itself

- **GIVEN** a `WorkflowInstance` with `status` equal to each of `DRAFT`, `SUBMITTED`,
  `REVISION_REQUESTED`, `APPROVED`, `PUBLISHED` in turn
- **WHEN** `.resetToDraft({ userId: "user-1", now: someDate })` is called on each
- **THEN** none of the calls MUST throw `ConflictError`
- **AND** every result MUST have `status: 'DRAFT'`

### Requirement: directValidate() transitions DRAFT or REVISION_REQUESTED to APPROVED, setting only validator attribution

`directValidate({ userId, now })` SHALL be callable only when `status` is `DRAFT` or
`REVISION_REQUESTED`. It MUST return a new instance with `status: 'APPROVED'`,
`validatedByUserId` set to `userId`, and `validatedAt` set to `now`. It MUST NOT set, clear, or
otherwise change `submittedByUserId`, `submittedAt`, `approvedByUserId`, `approvedAt`,
`publishedByUserId`, or `publishedAt` — whatever those fields already held (typically `null`
from a true `DRAFT` origin, or carried over non-null from a prior submit-then-revision-request
cycle) MUST pass through unchanged. Calling it from any other status MUST throw `ConflictError`.

#### Scenario: Happy path — direct-validate from DRAFT

- **GIVEN** a `WorkflowInstance` with `status: 'DRAFT'` and every attribution pair `null`
- **WHEN** `.directValidate({ userId: "admin-1", now: someDate })` is called
- **THEN** it MUST return a new instance with `status: 'APPROVED'`,
  `validatedByUserId: "admin-1"`, `validatedAt: someDate`
- **AND** `submittedByUserId`, `approvedByUserId`, and `publishedByUserId` MUST all still be
  `null` on the returned instance

#### Scenario: Happy path — direct-validate from REVISION_REQUESTED preserves carried-over submission attribution

- **GIVEN** a `WorkflowInstance` with `status: 'REVISION_REQUESTED'` and
  `submittedByUserId`/`submittedAt` already set from an earlier submission
- **WHEN** `.directValidate({ userId: "admin-1", now: someDate })` is called
- **THEN** the returned instance MUST have `status: 'APPROVED'`,
  `validatedByUserId: "admin-1"`, `validatedAt: someDate`
- **AND** `submittedByUserId`/`submittedAt` on the returned instance MUST equal the original
  instance's values, unchanged

#### Scenario: Failure — direct-validate from SUBMITTED, APPROVED, REJECTED, or PUBLISHED throws ConflictError

- **GIVEN** a `WorkflowInstance` with `status` equal to `'SUBMITTED'`, `'APPROVED'`,
  `'REJECTED'`, or `'PUBLISHED'`
- **WHEN** `.directValidate({ userId: "admin-1", now: someDate })` is called
- **THEN** it MUST throw a `ConflictError` in every case

### Requirement: directPublish() transitions DRAFT or REVISION_REQUESTED to PUBLISHED, setting only validator and publisher attribution

`directPublish({ userId, now })` SHALL be callable only when `status` is `DRAFT` or
`REVISION_REQUESTED`. It MUST return a new instance with `status: 'PUBLISHED'`,
`validatedByUserId` set to `userId`, `validatedAt` set to `now`, `publishedByUserId` set to
`userId`, and `publishedAt` set to `now`. It MUST NOT set, clear, or otherwise change
`submittedByUserId`, `submittedAt`, `approvedByUserId`, or `approvedAt`. Calling it from any
other status MUST throw `ConflictError`.

#### Scenario: Happy path — direct-publish from DRAFT

- **GIVEN** a `WorkflowInstance` with `status: 'DRAFT'` and every attribution pair `null`
- **WHEN** `.directPublish({ userId: "admin-1", now: someDate })` is called
- **THEN** it MUST return a new instance with `status: 'PUBLISHED'`,
  `validatedByUserId: "admin-1"`, `validatedAt: someDate`, `publishedByUserId: "admin-1"`,
  `publishedAt: someDate`
- **AND** `submittedByUserId` and `approvedByUserId` MUST both still be `null`

#### Scenario: Happy path — direct-publish from REVISION_REQUESTED preserves carried-over submission attribution

- **GIVEN** a `WorkflowInstance` with `status: 'REVISION_REQUESTED'` and
  `submittedByUserId`/`submittedAt` already set
- **WHEN** `.directPublish({ userId: "admin-1", now: someDate })` is called
- **THEN** `submittedByUserId`/`submittedAt` on the returned instance MUST equal the original
  instance's values, unchanged

#### Scenario: Failure — direct-publish from SUBMITTED, APPROVED, REJECTED, or PUBLISHED throws ConflictError

- **GIVEN** a `WorkflowInstance` with `status` equal to `'SUBMITTED'`, `'APPROVED'`,
  `'REJECTED'`, or `'PUBLISHED'`
- **WHEN** `.directPublish({ userId: "admin-1", now: someDate })` is called
- **THEN** it MUST throw a `ConflictError` in every case

### Requirement: The three new transition methods stamp updatedAt, validate now, stay pure, and carry ConflictError context — same as every existing transition

`resetToDraft`, `directValidate`, and `directPublish` MUST each set the returned instance's
`updatedAt` to the `now` value passed in; MUST reject an invalid `now` with `ValidationError`
before any status-guard check; MUST leave the receiver unchanged and return a distinct new
instance; and, when disallowed from the current status, MUST throw `ConflictError` with
`context` equal to `{ entityId, entityType, from: <current status>, attemptedTransition:
"directValidate" | "directPublish" }` (N/A for `resetToDraft`, which has no disallowed status).

#### Scenario: directPublish's ConflictError context names the attempted transition

- **GIVEN** a `WorkflowInstance` with `status: 'SUBMITTED'`
- **WHEN** `.directPublish({ userId: "admin-1", now: someDate })` is called
- **THEN** the thrown `ConflictError`'s `context.attemptedTransition` MUST equal
  `"directPublish"`

#### Scenario: An invalid now is rejected before the status guard, for all three new methods

- **GIVEN** a `WorkflowInstance` in a status from which a given new method is legal
- **WHEN** that method is called with `now` set to `new Date("garbage")`
- **THEN** it MUST throw a `ValidationError`, not proceed to transition
