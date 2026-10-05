## MODIFIED Requirements

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
  (both non-empty and both in valid zero-padded format)
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
