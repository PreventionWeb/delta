## MODIFIED Requirements

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

## ADDED Requirements

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
