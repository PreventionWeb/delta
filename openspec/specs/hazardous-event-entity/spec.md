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

The factory MUST validate that when both `startDate` and `endDate` are non-empty **and each
independently matches the accepted zero-padded `YYYY`/`YYYY-MM`/`YYYY-MM-DD` date format (ADR-002,
"Partial and Uncertain Dates")**, `startDate` is not later than `endDate`, and MUST throw
`ValidationError` otherwise. This comparison MUST normalize each date **directionally** before
comparing — `startDate` floor-padded to the earliest point of its own period (`YYYY` →
`YYYY-01-01`, `YYYY-MM` → `YYYY-MM-01`), `endDate` ceiling-padded to the latest point of its own
period (`YYYY` → `YYYY-12-31`, `YYYY-MM` → the real last day of that month, leap-year aware) —
rather than a plain, unnormalized string comparison. This mirrors
`app/backend.server/utils/dateFilters.ts`'s own `createDateCondition`, which already applies this
same directional floor/lower-bound vs. ceiling/upper-bound padding for disaster-date range
filtering. When either `startDate` or `endDate` does not match that accepted format, the factory
MUST skip this ordering comparison entirely (treat it as unenforceable) rather than performing a
raw, format-unaware string comparison — this format-gating and normalization closes `DEF-020` (a
prior raw comparison both miscompared non-zero-padded values such as `"2026-9-1"` vs. `"2026-10-1"`
and miscompared format-valid but mixed-precision pairs, such as rejecting a `startDate` of
`"2020-06"` against an `endDate` of `"2020"`) without rejecting construction for a pre-existing,
non-zero-padded value, since this same factory is also how a future adapter reconstructs an
existing persisted row.

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

#### Scenario: A malformed startDate or endDate skips the ordering check without blocking

- **GIVEN** a props object where `startDate` is `"2026-9-1"` (not zero-padded) and `endDate` is
  `"2026-10-1"` (also not zero-padded) — a pair that a raw, format-unaware string comparison would
  miscompare as `startDate > endDate`
- **WHEN** `HazardousEvent.create(props)` is called
- **THEN** it MUST NOT throw for the date-ordering reason
- **AND** this MUST hold identically whether only one of the two dates is malformed or both are

#### Scenario: A mixed-precision startDate/endDate pair within the same event is accepted when correctly ordered

- **GIVEN** a props object where `startDate` is `"2020-06"` (year-month precision) and `endDate` is
  `"2020"` (year precision) — both valid zero-padded formats, a pair a raw, unnormalized string
  comparison would reject (`"2020-06" > "2020"` lexically)
- **WHEN** `HazardousEvent.create(props)` is called
- **THEN** it MUST NOT throw for the date-ordering reason — floor-padding `startDate` to
  `"2020-06-01"` and ceiling-padding `endDate` to `"2020-12-31"` confirms `startDate` falls within
  `endDate`'s own (coarser) period, not after it

#### Scenario: A mixed-precision startDate/endDate pair within the same event is rejected when genuinely out of order

- **GIVEN** a props object where `startDate` is `"2020-07-01"` (day precision) and `endDate` is
  `"2020-06"` (year-month precision) — both valid zero-padded formats
- **WHEN** `HazardousEvent.create(props)` is called
- **THEN** it MUST throw a `ValidationError` — floor-padded `startDate` (`"2020-07-01"`) is later
  than ceiling-padded `endDate` (`"2020-06-30"`), so `startDate` is genuinely after the end of
  `endDate`'s own (coarser) period

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
`createdAt`, `updatedAt`, `hazardDriverIds`, `attachments`, `fieldValues`, `customFieldValues`.
No property MUST be mutable after construction.

#### Scenario: Properties are accessible after construction

- **GIVEN** a `HazardousEvent` created by `HazardousEvent.create(props)`
- **WHEN** each property is read
- **THEN** it MUST return the value that was passed in `props` (or, for the three normalized
  attribution fields, `null` when the input was `""`)

#### Scenario: Child collection properties return a defensive copy, not the live internal array

- **GIVEN** a `HazardousEvent` created with a non-empty `hazardDriverIds`, `attachments`,
  `fieldValues`, or `customFieldValues` array
- **WHEN** the caller mutates the array returned by the corresponding getter (e.g. pushes an
  element, or mutates the original `props` array after `create()` returns)
- **THEN** the entity's own internally held collection MUST NOT reflect that mutation

### Requirement: HazardousEvent validates the hazard driver id collection

`HazardousEvent.create(props, validHazardDriverIds, validCustomFieldDefinitionIds)` MUST validate
`props.hazardDriverIds`. It MUST throw `ValidationError` when `props.hazardDriverIds` is not an
array. For each element, it MUST throw `ValidationError` referencing the offending value when the
element is not a non-empty string after trimming (matching the
`tenantId`/`specificHazardId`/`startDate` required-string-field check). It MUST throw
`ValidationError` when `props.hazardDriverIds` contains a duplicate value — mirroring
`hazardous_event_hazard_driver`'s `UNIQUE(hazardousEventId, hazardDriverId)` constraint at the
domain layer (Invariant 3).

`create()` MUST require a `validHazardDriverIds: ReadonlySet<string>` argument and MUST throw a
`ValidationError` when any entry in `props.hazardDriverIds` is not a member of that set. This
argument is mandatory — there is no default or optional form of `create()` that skips this check —
so that a caller cannot construct a `HazardousEvent` referencing an unvalidated (and potentially
cross-tenant) hazard driver. This closes `DEF-021` (a cross-tenant hazard-driver reference gap) by
construction, the same pattern `SpatialObservation.create()`'s `validDivisionIds` established for
`DEF-005`.

#### Scenario: Happy path — empty hazardDriverIds is valid

- **GIVEN** a props object with `hazardDriverIds: []`, every other required field valid, and any
  `validHazardDriverIds` set (including an empty one)
- **WHEN** `HazardousEvent.create(props, validHazardDriverIds, validCustomFieldDefinitionIds)` is
  called
- **THEN** it MUST NOT throw
- **AND** the returned instance's `hazardDriverIds` MUST be an empty array

#### Scenario: Happy path — distinct hazard driver ids present in validHazardDriverIds are accepted

- **GIVEN** a props object with `hazardDriverIds: ["driver-1", "driver-2"]` and a
  `validHazardDriverIds` set containing both `"driver-1"` and `"driver-2"`
- **WHEN** `HazardousEvent.create(props, validHazardDriverIds, validCustomFieldDefinitionIds)` is
  called
- **THEN** it MUST NOT throw
- **AND** the returned instance's `hazardDriverIds` MUST equal `["driver-1", "driver-2"]`

#### Scenario: Failure — hazardDriverIds is not an array

- **GIVEN** a props object where `hazardDriverIds` is `null`, `undefined`, or a non-array value
- **WHEN** `HazardousEvent.create(props, validHazardDriverIds, validCustomFieldDefinitionIds)` is
  called
- **THEN** it MUST throw a `ValidationError` referencing `hazardDriverIds`
- **AND** it MUST NOT throw an unhandled `TypeError` or any other non-`ValidationError` exception

#### Scenario: Failure — hazardDriverIds contains an empty or whitespace-only entry

- **GIVEN** a props object where `hazardDriverIds` contains `""` or `"   "`
- **WHEN** `HazardousEvent.create(props, validHazardDriverIds, validCustomFieldDefinitionIds)` is
  called
- **THEN** it MUST throw a `ValidationError`

#### Scenario: Failure — hazardDriverIds contains a duplicate value

- **GIVEN** a props object where `hazardDriverIds` is `["driver-1", "driver-1"]` and a
  `validHazardDriverIds` set containing `"driver-1"`
- **WHEN** `HazardousEvent.create(props, validHazardDriverIds, validCustomFieldDefinitionIds)` is
  called
- **THEN** it MUST throw a `ValidationError`

#### Scenario: Failure — a hazardDriverId absent from validHazardDriverIds is rejected

- **GIVEN** a props object with `hazardDriverIds: ["driver-1"]` and a `validHazardDriverIds` set
  that does not contain `"driver-1"` (for example, because it belongs to a different tenant)
- **WHEN** `HazardousEvent.create(props, validHazardDriverIds, validCustomFieldDefinitionIds)` is
  called
- **THEN** it MUST throw a `ValidationError` naming the offending hazard driver id

#### Scenario: An empty hazardDriverIds array requires no membership check

- **GIVEN** a props object with `hazardDriverIds: []`, regardless of the contents of
  `validHazardDriverIds`
- **WHEN** `HazardousEvent.create(props, validHazardDriverIds, validCustomFieldDefinitionIds)` is
  called
- **THEN** it MUST NOT throw solely due to the membership check

### Requirement: HazardousEvent validates the attachment collection

`HazardousEvent.create(props)` MUST validate `props.attachments`. It MUST throw `ValidationError`
when `props.attachments` is not an array. For each element, it MUST throw `ValidationError`
referencing the offending field when `title`, `fileKey`, `fileName`, or `fileType` is not a
non-empty string after trimming, or when `fileSize` is not a finite integer `number`. `id` is
typed as a required `string` but, matching the existing `HazardousEvent.id` property's own
treatment, is not itself validated for presence or non-emptiness. `attachments` carries no
duplicate-value check — `hazardous_event_attachment` has no uniqueness constraint beyond its
primary key.

#### Scenario: Happy path — empty attachments is valid

- **GIVEN** a props object with `attachments: []` and every other required field valid
- **WHEN** `HazardousEvent.create(props)` is called
- **THEN** it MUST NOT throw

#### Scenario: Happy path — a well-formed attachment is accepted

- **GIVEN** a props object with one attachment `{ id: "att-1", title: "Photo", fileKey: "k1",
  fileName: "photo.jpg", fileType: "image/jpeg", fileSize: 204800 }`
- **WHEN** `HazardousEvent.create(props)` is called
- **THEN** it MUST NOT throw
- **AND** the returned instance's `attachments[0]` MUST equal the input attachment

#### Scenario: Failure — attachments is not an array

- **GIVEN** a props object where `attachments` is `null`, `undefined`, or a non-array value
- **WHEN** `HazardousEvent.create(props)` is called
- **THEN** it MUST throw a `ValidationError` referencing `attachments`
- **AND** it MUST NOT throw an unhandled `TypeError` or any other non-`ValidationError` exception

#### Scenario: Failure — an attachments element is null, undefined, or not an object

- **GIVEN** a props object where `attachments` is an array containing `null`, `undefined`, or a
  non-object primitive as one of its elements (for example `attachments: [null]` or
  `attachments: ["garbage"]`)
- **WHEN** `HazardousEvent.create(props)` is called
- **THEN** it MUST throw a `ValidationError` referencing `attachments`
- **AND** it MUST NOT throw an unhandled `TypeError` or any other non-`ValidationError` exception

#### Scenario: Failure — an attachment is missing a required text field

- **GIVEN** a props object where one attachment has `title: ""`, or `fileKey`, `fileName`, or
  `fileType` empty or whitespace-only
- **WHEN** `HazardousEvent.create(props)` is called
- **THEN** it MUST throw a `ValidationError`

#### Scenario: Failure — an attachment's fileSize is not a finite integer

- **GIVEN** a props object where one attachment's `fileSize` is a string, `NaN`, `Infinity`, or a
  non-integer number (e.g. `1.5`)
- **WHEN** `HazardousEvent.create(props)` is called
- **THEN** it MUST throw a `ValidationError` referencing `fileSize`
- **AND** it MUST NOT throw an unhandled `TypeError` or any other non-`ValidationError` exception

#### Scenario: Happy path — a zero or negative fileSize is not itself rejected by this requirement

- **GIVEN** a props object where one attachment's `fileSize` is `0`
- **WHEN** `HazardousEvent.create(props)` is called
- **THEN** it MUST NOT throw solely because of that value (shape validation only — no positivity
  rule is enforced, matching `hazardous_event_attachment`'s own lack of a `CHECK` constraint)

### Requirement: HazardousEvent validates the hazard-type field value collection

`HazardousEvent.create(props)` MUST validate `props.fieldValues`. It MUST throw `ValidationError`
when `props.fieldValues` is not an array. For each element, it MUST throw `ValidationError`
referencing the offending field when `hazardTypeFieldDefinitionId` is not a non-empty string
after trimming, or when `value` is not a `string` (an empty string is a valid `value`, matching
this entity's existing treatment of other free-text columns such as `description`). It MUST throw
`ValidationError` when `props.fieldValues` contains two elements with the same
`hazardTypeFieldDefinitionId` — mirroring `hazardous_event_field_value`'s
`UNIQUE(hazardousEventId, hazardTypeFieldDefinitionId)` constraint at the domain layer (Invariant
3).

#### Scenario: Happy path — empty fieldValues is valid

- **GIVEN** a props object with `fieldValues: []` and every other required field valid
- **WHEN** `HazardousEvent.create(props)` is called
- **THEN** it MUST NOT throw

#### Scenario: Happy path — distinct field definition ids are accepted, including an empty value

- **GIVEN** a props object with `fieldValues: [{ hazardTypeFieldDefinitionId: "def-1", value: "5" }, { hazardTypeFieldDefinitionId: "def-2", value: "" }]`
- **WHEN** `HazardousEvent.create(props)` is called
- **THEN** it MUST NOT throw

#### Scenario: Failure — fieldValues is not an array

- **GIVEN** a props object where `fieldValues` is `null`, `undefined`, or a non-array value
- **WHEN** `HazardousEvent.create(props)` is called
- **THEN** it MUST throw a `ValidationError` referencing `fieldValues`
- **AND** it MUST NOT throw an unhandled `TypeError` or any other non-`ValidationError` exception

#### Scenario: Failure — a fieldValues element is null, undefined, or not an object

- **GIVEN** a props object where `fieldValues` is an array containing `null`, `undefined`, or a
  non-object primitive as one of its elements (for example `fieldValues: [null]` or
  `fieldValues: ["garbage"]`)
- **WHEN** `HazardousEvent.create(props)` is called
- **THEN** it MUST throw a `ValidationError` referencing `fieldValues`
- **AND** it MUST NOT throw an unhandled `TypeError` or any other non-`ValidationError` exception

#### Scenario: Failure — a field value is missing its definition id

- **GIVEN** a props object where one field value's `hazardTypeFieldDefinitionId` is empty or
  whitespace-only
- **WHEN** `HazardousEvent.create(props)` is called
- **THEN** it MUST throw a `ValidationError`

#### Scenario: Failure — a field value's value is not a string

- **GIVEN** a props object where one field value's `value` is `null`, `undefined`, or a number
- **WHEN** `HazardousEvent.create(props)` is called
- **THEN** it MUST throw a `ValidationError` referencing `value`
- **AND** it MUST NOT throw an unhandled `TypeError` or any other non-`ValidationError` exception

#### Scenario: Failure — fieldValues contains a duplicate definition id

- **GIVEN** a props object where two elements of `fieldValues` share the same
  `hazardTypeFieldDefinitionId`
- **WHEN** `HazardousEvent.create(props)` is called
- **THEN** it MUST throw a `ValidationError`

### Requirement: HazardousEvent validates the hazard-type custom field value collection

`HazardousEvent.create(props, validHazardDriverIds, validCustomFieldDefinitionIds)` MUST validate
`props.customFieldValues` using the identical shape rules `fieldValues` uses (array-shape,
required `hazardTypeCustomFieldDefinitionId`, `value` typed as a string, empty string permitted),
checked against `props.customFieldValues` independently of `props.fieldValues` — they are two
distinct collections with two distinct backing tables and two distinct FK targets, not one merged
collection. It MUST throw `ValidationError` when `props.customFieldValues` contains two elements
with the same `hazardTypeCustomFieldDefinitionId` — mirroring
`hazardous_event_custom_field_value`'s own, separate
`UNIQUE(hazardousEventId, hazardTypeCustomFieldDefinitionId)` constraint.

`create()` MUST require a `validCustomFieldDefinitionIds: ReadonlySet<string>` argument and MUST
throw a `ValidationError` when any element's `hazardTypeCustomFieldDefinitionId` is not a member
of that set. This argument is mandatory — there is no default or optional form of `create()` that
skips this check — so that a caller cannot construct a `HazardousEvent` referencing an unvalidated
(and potentially cross-tenant) custom field definition. This closes `DEF-021` (a cross-tenant
custom-field-definition reference gap) by construction, the same pattern
`SpatialObservation.create()`'s `validDivisionIds` established for `DEF-005`. `fieldValues`'s
`hazardTypeFieldDefinitionId` has no equivalent check — `hazard_type_field_definition` (its FK
target) has no `countryAccountsId` at all; it is global reference data, so no membership set
applies to it.

#### Scenario: Happy path — empty customFieldValues is valid

- **GIVEN** a props object with `customFieldValues: []`, every other required field valid, and any
  `validCustomFieldDefinitionIds` set (including an empty one)
- **WHEN** `HazardousEvent.create(props, validHazardDriverIds, validCustomFieldDefinitionIds)` is
  called
- **THEN** it MUST NOT throw

#### Scenario: Happy path — a fieldValues definition id and a customFieldValues definition id may be equal without conflict

- **GIVEN** a props object with `fieldValues: [{ hazardTypeFieldDefinitionId: "def-1", value: "a" }]`
  and `customFieldValues: [{ hazardTypeCustomFieldDefinitionId: "def-1", value: "b" }]`, and a
  `validCustomFieldDefinitionIds` set containing `"def-1"`
- **WHEN** `HazardousEvent.create(props, validHazardDriverIds, validCustomFieldDefinitionIds)` is
  called
- **THEN** it MUST NOT throw (the two collections' duplicate checks are independent — this is not
  a duplicate within either collection; `fieldValues`'s `"def-1"` is not checked against
  `validCustomFieldDefinitionIds`, and vice versa)

#### Scenario: Failure — customFieldValues is not an array

- **GIVEN** a props object where `customFieldValues` is `null`, `undefined`, or a non-array value
- **WHEN** `HazardousEvent.create(props, validHazardDriverIds, validCustomFieldDefinitionIds)` is
  called
- **THEN** it MUST throw a `ValidationError` referencing `customFieldValues`
- **AND** it MUST NOT throw an unhandled `TypeError` or any other non-`ValidationError` exception

#### Scenario: Failure — a customFieldValues element is null, undefined, or not an object

- **GIVEN** a props object where `customFieldValues` is an array containing `null`, `undefined`,
  or a non-object primitive as one of its elements (for example `customFieldValues: [null]` or
  `customFieldValues: ["garbage"]`)
- **WHEN** `HazardousEvent.create(props, validHazardDriverIds, validCustomFieldDefinitionIds)` is
  called
- **THEN** it MUST throw a `ValidationError` referencing `customFieldValues`
- **AND** it MUST NOT throw an unhandled `TypeError` or any other non-`ValidationError` exception

#### Scenario: Failure — customFieldValues contains a duplicate custom field definition id

- **GIVEN** a props object where two elements of `customFieldValues` share the same
  `hazardTypeCustomFieldDefinitionId`, and a `validCustomFieldDefinitionIds` set containing it
- **WHEN** `HazardousEvent.create(props, validHazardDriverIds, validCustomFieldDefinitionIds)` is
  called
- **THEN** it MUST throw a `ValidationError`

#### Scenario: Failure — a hazardTypeCustomFieldDefinitionId absent from validCustomFieldDefinitionIds is rejected

- **GIVEN** a props object with `customFieldValues: [{ hazardTypeCustomFieldDefinitionId: "def-1", value: "a" }]`
  and a `validCustomFieldDefinitionIds` set that does not contain `"def-1"` (for example, because
  it belongs to a different tenant)
- **WHEN** `HazardousEvent.create(props, validHazardDriverIds, validCustomFieldDefinitionIds)` is
  called
- **THEN** it MUST throw a `ValidationError` naming the offending custom field definition id

#### Scenario: An empty customFieldValues array requires no membership check

- **GIVEN** a props object with `customFieldValues: []`, regardless of the contents of
  `validCustomFieldDefinitionIds`
- **WHEN** `HazardousEvent.create(props, validHazardDriverIds, validCustomFieldDefinitionIds)` is
  called
- **THEN** it MUST NOT throw solely due to the membership check
