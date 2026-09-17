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
from the identical check (design.md Decision 4, round 2). It MUST NOT allow an internal
`.trim()` call to throw a raw `TypeError` when a non-string value is passed.

The factory MUST validate that `entityType` is one of `'HE'`, `'DE'`, `'DR'` and that
`status` is one of `DRAFT`, `SUBMITTED`, `REVISION_REQUESTED`, `APPROVED`, `REJECTED`,
`PUBLISHED`, and MUST throw `ValidationError` if either is not a member of its enum.

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
