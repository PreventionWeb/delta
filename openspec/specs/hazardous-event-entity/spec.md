# hazardous-event-entity Specification

## Purpose

Models a single hazardous event's core aggregate data as a framework-free domain entity, carrying
no approval-status or HIP-hierarchy fields, with construction-time validation that closes the
tenant/specificHazardId/startDate presence gap and the empty-string-vs-null attribution crash.

## Requirements

### Requirement: HazardousEvent construction via validated factory

The `HazardousEvent` domain entity in `app/domains/hazardous-events/domain/HazardousEvent.ts` SHALL
only be instantiated through a static `HazardousEvent.create(props)` factory. The constructor MUST
be inaccessible to callers outside the class.

The factory MUST validate that `tenantId`, `specificHazardId`, and `startDate` are each present —
neither `undefined`/`null` nor an empty string after trimming — and MUST throw `ValidationError`
(from `app/shared/errors/`) referencing the offending field's name if any is absent.

This same check MUST also reject, for each of the three fields, any value that is not a string and
not `null`/`undefined` — e.g. a number, object, or boolean — by throwing `ValidationError` from the
identical check (design.md Decision 10). It MUST NOT allow an internal `.trim()` call to throw a raw
`TypeError` when a non-string value is passed.

The factory MUST validate that when both `startDate` and `endDate` are non-empty, `startDate` is
not later than `endDate` (string comparison, matching the columns' real `text` storage), and MUST
throw `ValidationError` otherwise.

Independently of that ordering check, the factory MUST reject a present `endDate` value that is
not a string (e.g. a number) by throwing `ValidationError` referencing `endDate` — even though
`endDate` itself is optional and a `null`, `undefined`, or whitespace-only value MUST NOT throw
(design.md Decision 11). This check MUST run before the ordering check above, and MUST NOT allow
an internal `.trim()` call on a non-string `endDate` to throw a raw `TypeError`, nor silently skip
the ordering check and return successfully.

The factory MUST normalize an empty-string `createdByUserId`, `updatedByUserId`, or
`submittedByUserId` to `null` rather than throwing or persisting the empty string — these three
fields are optional attribution, distinct from the three required fields above.

The factory MUST validate that `createdAt` is a genuinely valid `Date` instance — both
`instanceof Date` and, once cast to that type, not `NaN`-valued (`Number.isNaN(value.getTime())`
is `false`) — and MUST throw `ValidationError` referencing `createdAt` otherwise. `updatedAt` and
`submittedAt` are nullable: the factory MUST skip this check when either is `null`, but MUST apply
the identical valid-`Date` check, throwing `ValidationError` referencing the field's name, whenever
either is non-null. This validation MUST run before the `startDate <= endDate` ordering check above,
so an invalid Date is always reported as a Date-validity error, never misreported as a date-ordering
error.

#### Scenario: Happy path — all required fields present, no attribution set

- **GIVEN** a props object with non-empty `tenantId`, `specificHazardId`, `startDate`,
  `endDate: ""`, and `createdByUserId`/`updatedByUserId`/`submittedByUserId` all `null`
- **WHEN** `HazardousEvent.create(props)` is called
- **THEN** it MUST return a `HazardousEvent` instance whose properties match the input, without
  throwing

#### Scenario: Happy path — endDate empty is valid for an ongoing/forecasted event

- **GIVEN** a props object with `hazardousEventStatus: "ongoing"`, a non-empty `startDate`, and
  `endDate: ""`
- **WHEN** `HazardousEvent.create(props)` is called
- **THEN** it MUST NOT throw

#### Scenario: Failure — missing tenantId throws ValidationError

- **GIVEN** a props object where `tenantId` is `""`
- **WHEN** `HazardousEvent.create(props)` is called
- **THEN** it MUST throw a `ValidationError`
- **AND** the error message MUST reference `tenantId`

#### Scenario: Failure — missing specificHazardId throws ValidationError

- **GIVEN** a props object where `specificHazardId` is `""`
- **WHEN** `HazardousEvent.create(props)` is called
- **THEN** it MUST throw a `ValidationError`
- **AND** the error message MUST reference `specificHazardId`

#### Scenario: Failure — missing startDate throws ValidationError

- **GIVEN** a props object where `startDate` is `""`
- **WHEN** `HazardousEvent.create(props)` is called
- **THEN** it MUST throw a `ValidationError`
- **AND** the error message MUST reference `startDate`

#### Scenario: Failure — startDate later than endDate throws ValidationError

- **GIVEN** a props object where `startDate` is `"2026-05-10"` and `endDate` is `"2026-05-01"`
  (both non-empty)
- **WHEN** `HazardousEvent.create(props)` is called
- **THEN** it MUST throw a `ValidationError`

#### Scenario: Failure — a present, non-string endDate throws ValidationError, not TypeError

- **GIVEN** a props object where `endDate` is a number (e.g. `20260501`) — a value that is neither
  `null`/`undefined` nor a string
- **WHEN** `HazardousEvent.create(props)` is called
- **THEN** it MUST throw a `ValidationError` referencing `endDate`
- **AND** it MUST NOT throw an unhandled `TypeError` or any other non-`ValidationError` exception
- **AND** it MUST NOT silently skip the `startDate`/`endDate` ordering check and return
  successfully

#### Scenario: Happy path — endDate null or undefined is valid, same as empty string

- **GIVEN** a props object where `endDate` is `null` or `undefined`, and every other required
  field is valid
- **WHEN** `HazardousEvent.create(props)` is called
- **THEN** it MUST NOT throw (matching the existing `endDate: ""` happy path — `null`,
  `undefined`, and `""` are all equally valid "not set" states, design.md Decision 2/11)

#### Scenario: Failure — createdAt missing or not a Date instance throws ValidationError, not a TypeError

- **GIVEN** a props object where `createdAt` is `undefined`, `null`, or some non-`Date` value (e.g.
  from a future adapter hydrating an untyped or malformed row)
- **WHEN** `HazardousEvent.create(props)` is called
- **THEN** it MUST throw a `ValidationError` referencing `createdAt`
- **AND** it MUST NOT throw an unhandled `TypeError` or any other non-`ValidationError` exception

#### Scenario: Failure — createdAt is a syntactically-real but invalid Date throws ValidationError

- **GIVEN** a props object where `createdAt` is `new Date("garbage")` — an `instanceof Date` value
  whose `getTime()` is `NaN`
- **WHEN** `HazardousEvent.create(props)` is called
- **THEN** it MUST throw a `ValidationError` referencing `createdAt`

#### Scenario: Failure — non-null updatedAt that is an invalid Date throws ValidationError

- **GIVEN** a props object where `updatedAt` is `new Date("garbage")`
- **WHEN** `HazardousEvent.create(props)` is called
- **THEN** it MUST throw a `ValidationError` referencing `updatedAt`

#### Scenario: Happy path — updatedAt is null, skipping the Date-validity check

- **GIVEN** a props object where `updatedAt` is `null` and every other required field is valid
- **WHEN** `HazardousEvent.create(props)` is called
- **THEN** it MUST NOT throw

#### Scenario: Failure — non-null submittedAt that is an invalid Date throws ValidationError

- **GIVEN** a props object where `submittedAt` is `new Date("garbage")`
- **WHEN** `HazardousEvent.create(props)` is called
- **THEN** it MUST throw a `ValidationError` referencing `submittedAt`

#### Scenario: Happy path — submittedAt is null, skipping the Date-validity check

- **GIVEN** a props object where `submittedAt` is `null` and every other required field is valid
- **WHEN** `HazardousEvent.create(props)` is called
- **THEN** it MUST NOT throw

#### Scenario: Date-validity errors take priority over the date-ordering check

- **GIVEN** a props object where `createdAt` is `new Date("garbage")` and `startDate`/`endDate` are
  also set such that `startDate` is later than `endDate`
- **WHEN** `HazardousEvent.create(props)` is called
- **THEN** it MUST throw a `ValidationError` referencing `createdAt`, not one referencing `endDate`

#### Scenario: A required field that is null or undefined at runtime throws ValidationError, not a TypeError

- **GIVEN** a props object where `tenantId`, `specificHazardId`, or `startDate` is `null` or
  `undefined` (e.g. from a future adapter hydrating an untyped or genuinely-nullable DB row —
  `countryAccountsId` and `specificHazardId` are nullable at the DB level today)
- **WHEN** `HazardousEvent.create(props)` is called
- **THEN** it MUST throw a `ValidationError` referencing the field's name
- **AND** it MUST NOT throw an unhandled `TypeError` or any other non-`ValidationError` exception

#### Scenario: A required field that is whitespace-only throws ValidationError

- **GIVEN** a props object where `tenantId`, `specificHazardId`, or `startDate` is a whitespace-only
  string (e.g. `"   "`)
- **WHEN** `HazardousEvent.create(props)` is called
- **THEN** it MUST throw a `ValidationError`, matching the empty-string case (presence is checked
  after trimming)

#### Scenario: A required field that is a non-string, non-null value throws ValidationError, not TypeError

- **GIVEN** a props object where `tenantId`, `specificHazardId`, or `startDate` is a number (e.g.
  `12345`) — a value that is neither `null`/`undefined` nor a string
- **WHEN** `HazardousEvent.create(props)` is called
- **THEN** it MUST throw a `ValidationError` referencing the field's name
- **AND** it MUST NOT throw an unhandled `TypeError` or any other non-`ValidationError` exception

#### Scenario: Empty-string attribution field is normalized to null, not rejected

- **GIVEN** a props object with `createdByUserId: ""`, `updatedByUserId: ""`, and
  `submittedByUserId: ""`, with all required fields present
- **WHEN** `HazardousEvent.create(props)` is called
- **THEN** it MUST NOT throw
- **AND** the returned instance's `createdByUserId`, `updatedByUserId`, and `submittedByUserId`
  MUST each be `null`, not `""`

#### Scenario: A real UUID attribution value is preserved unchanged

- **GIVEN** a props object with `createdByUserId` set to a real user id string
- **WHEN** `HazardousEvent.create(props)` is called
- **THEN** the returned instance's `createdByUserId` MUST equal that value exactly

### Requirement: HazardousEvent carries no approval-status or HIP-hierarchy field

The `HazardousEvent` entity MUST NOT expose a `status`, `approvalStatus`, `validatedByUserId`,
`validatedAt`, `publishedByUserId`, `publishedAt`, `hipHazardId`, `hipClusterId`, or `hipTypeId`
property. Approval-workflow state is looked up separately via `IWorkflowRepository`
(`app/domains/validation-workflow/application/ports/IWorkflowRepository.ts`), and hazard
classification is carried solely via `specificHazardId`.

#### Scenario: Entity type has no approval-status or HIP-hierarchy properties

- **GIVEN** the `HazardousEvent` class definition
- **WHEN** its public property list is inspected
- **THEN** it MUST NOT include `status`, `approvalStatus`, `validatedByUserId`, `validatedAt`,
  `publishedByUserId`, `publishedAt`, `hipHazardId`, `hipClusterId`, or `hipTypeId`

### Requirement: HazardousEvent exposes all retained columns read-only

The `HazardousEvent` instance returned by `create()` MUST expose every retained column as a
read-only property: `id`, `tenantId`, `specificHazardId`, `startDate`, `endDate`,
`nationalSpecification`, `description`, `chainsExplanation`, `magnitude`, `recordOriginator`,
`dataSource`, `hazardousEventStatus`, `specificHazardLocalName`, `specificHazardNationalName`,
`apiImportId`, `createdByUserId`, `updatedByUserId`, `submittedByUserId`, `submittedAt`,
`createdAt`, `updatedAt`. No property MUST be mutable after construction.

#### Scenario: Properties are accessible after construction

- **GIVEN** a `HazardousEvent` created by `HazardousEvent.create(props)`
- **WHEN** each property is read
- **THEN** it MUST return the value that was passed in `props` (or, for the three normalized
  attribution fields, `null` when the input was `""`)
