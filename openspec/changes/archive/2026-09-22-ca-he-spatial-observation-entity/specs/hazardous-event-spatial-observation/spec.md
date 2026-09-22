## Purpose

Provides the domain-layer entity and business rules for one hazardous event's dated spatial
observation reading — shape validation, tenant-scoped division-reference validation, the
latest-by-`observationTime` "current observation" rule, and the duplicate-`observationTime`
conflict/`confirmReplace` rule — closing `DEF-005` (spatial-footprint division linking with no
tenant check) at the domain layer.

## ADDED Requirements

### Requirement: `SpatialObservation.create()` validates required identity and time fields

`SpatialObservation.create()` MUST throw a `ValidationError` when `id` or `hazardousEventId` is
not a non-empty string, and MUST throw a `ValidationError` when `observationTime`, `createdAt`, or
`updatedAt` is not a valid `Date` instance (not a `Date`, or a `Date` whose `getTime()` is `NaN`).
`note` MAY be `null` and MUST NOT be treated as invalid input.

#### Scenario: Valid props construct a SpatialObservation

- **WHEN** `create()` is called with a non-empty `id`, non-empty `hazardousEventId`, a valid
  `observationTime`/`createdAt`/`updatedAt`, `note: null`, empty `geometries`, and empty
  `divisionIds` (with an empty `validDivisionIds` set)
- **THEN** `create()` returns a `SpatialObservation` whose getters reflect the given props

#### Scenario: Missing hazardousEventId is rejected

- **WHEN** `create()` is called with `hazardousEventId` as an empty or whitespace-only string
- **THEN** `create()` throws a `ValidationError` naming `hazardousEventId`

#### Scenario: Non-Date observationTime is rejected, not thrown as a raw TypeError

- **WHEN** `create()` is called with `observationTime` set to a non-`Date` value (e.g. a string or
  `undefined`)
- **THEN** `create()` throws a `ValidationError` naming `observationTime`, never a raw `TypeError`

#### Scenario: An invalid-instant Date (NaN time) is rejected

- **WHEN** `create()` is called with `observationTime: new Date("not-a-real-date")`
- **THEN** `create()` throws a `ValidationError` naming `observationTime`

### Requirement: `SpatialObservation.create()` validates that `geometries` and `divisionIds` are arrays before any array-element check

`SpatialObservation.create()` MUST throw a `ValidationError` when `geometries` is not an array,
and MUST throw a `ValidationError` when `divisionIds` is not an array. Neither check MAY be
skipped or deferred: `create()` MUST NOT throw a raw, unhandled error for a non-array value, and
MUST NOT silently treat a non-array iterable (for example, a string) as if it were an array of
individual elements. The `divisionIds` array-shape check MUST be evaluated before the
duplicate-value check (`Requirement: SpatialObservation.create() rejects duplicate divisionIds
within one observation`), since that check assumes `divisionIds` is already an array.

#### Scenario: A null or undefined geometries value is rejected, not thrown as a raw error

- **WHEN** `create()` is called with `geometries: null` or `geometries: undefined`
- **THEN** `create()` throws a `ValidationError` naming `geometries`, never a raw, unhandled error

#### Scenario: A string geometries value is rejected, not silently spread into individual characters

- **WHEN** `create()` is called with `geometries: "somestring"` (a non-array but iterable value)
- **THEN** `create()` throws a `ValidationError` naming `geometries`; the resulting
  `SpatialObservation` MUST NOT have its `geometries` silently populated with the string's
  individual characters

#### Scenario: A null, undefined, or non-array/non-string divisionIds value is rejected

- **WHEN** `create()` is called with `divisionIds: null`, `divisionIds: undefined`, or
  `divisionIds: 12345`
- **THEN** `create()` throws a `ValidationError` naming `divisionIds`, never a raw, unhandled error

#### Scenario: A string divisionIds value is rejected, not silently spread into individual characters

- **WHEN** `create()` is called with `divisionIds: "div-1"` (a bare string, iterable but not an
  array)
- **THEN** `create()` throws a `ValidationError` naming `divisionIds`; the resulting
  `SpatialObservation` MUST NOT have its `divisionIds` silently populated with the string's
  individual characters

#### Scenario: The divisionIds array-shape check is evaluated before the duplicate-value check

- **WHEN** `create()` is called with `divisionIds: "aab"` — a non-array string whose individual
  characters, if it were iterated as an array, would themselves collide in a way that would also
  trigger the duplicate-value check (`new Set("aab")` has two distinct members against a
  three-character length)
- **THEN** `create()` throws the `ValidationError` naming `divisionIds` as not an array, not the
  `ValidationError` for a repeated `divisionIds` value — proving the array-shape check is
  evaluated first

### Requirement: `SpatialObservation.create()` rejects duplicate divisionIds within one observation

`SpatialObservation.create()` MUST throw a `ValidationError` when `divisionIds` contains the same
value more than once, independent of the DB's own `unique(observation_id, division_id)`
constraint (Invariant 3 — DB constraints are defense-in-depth, never a substitute for the
domain-layer rule).

#### Scenario: A repeated divisionId is rejected

- **WHEN** `create()` is called with `divisionIds: ["div-1", "div-2", "div-1"]` and a
  `validDivisionIds` set containing both `div-1` and `div-2`
- **THEN** `create()` throws a `ValidationError`

#### Scenario: Distinct divisionIds are accepted

- **WHEN** `create()` is called with `divisionIds: ["div-1", "div-2"]`, no repeats, and a
  `validDivisionIds` set containing both
- **THEN** `create()` returns a `SpatialObservation` without error

### Requirement: `SpatialObservation.create()` validates every divisionId against a caller-supplied tenant-scoped set

`SpatialObservation.create()` MUST require a `validDivisionIds: ReadonlySet<string>` argument and
MUST throw a `ValidationError` when any entry in `divisionIds` is not a member of that set. This
argument is mandatory — there is no default or optional form of `create()` that skips this check —
so that a caller cannot construct a `SpatialObservation` referencing an unvalidated division.

#### Scenario: A divisionId absent from validDivisionIds is rejected

- **WHEN** `create()` is called with `divisionIds: ["div-1"]` and a `validDivisionIds` set that
  does not contain `"div-1"` (for example, because it belongs to a different tenant)
- **THEN** `create()` throws a `ValidationError` naming the offending division id

#### Scenario: A divisionId present in validDivisionIds is accepted

- **WHEN** `create()` is called with `divisionIds: ["div-1"]` and a `validDivisionIds` set
  containing `"div-1"`
- **THEN** `create()` returns a `SpatialObservation` without error

#### Scenario: An empty divisionIds array requires no membership check

- **WHEN** `create()` is called with `divisionIds: []`, regardless of the contents of
  `validDivisionIds`
- **THEN** `create()` returns a `SpatialObservation` without error

### Requirement: The "current observation" rule selects latest by observationTime, independent of array order

`SpatialObservation.selectCurrent(observations)` MUST return the observation whose
`observationTime` is latest among the given array, regardless of the array's iteration order, and
MUST return `null` when given an empty array. A `SpatialObservation` inserted after the others in
the input array, but whose `observationTime` is earlier than another entry's, MUST NOT be
selected.

#### Scenario: The latest observationTime is selected regardless of array position

- **WHEN** `selectCurrent` is called with an array of three observations whose `observationTime`
  values are `2026-01-01`, `2026-03-01`, and `2026-02-01`, in that array order
- **THEN** `selectCurrent` returns the observation with `observationTime` `2026-03-01`

#### Scenario: A backfilled earlier observationTime inserted last does not become current

- **WHEN** `selectCurrent` is called with an array where the observation with the latest
  `observationTime` (`2026-03-01`) appears first in the array, and an observation with an earlier
  `observationTime` (`2026-01-15`, a backfilled record) appears last in the array
- **THEN** `selectCurrent` returns the observation with `observationTime` `2026-03-01`, not the
  one that appears last in the array

#### Scenario: An empty array has no current observation

- **WHEN** `selectCurrent` is called with an empty array
- **THEN** `selectCurrent` returns `null`

#### Scenario: A single observation is trivially current

- **WHEN** `selectCurrent` is called with an array containing exactly one observation
- **THEN** `selectCurrent` returns that observation

### Requirement: A second observation at the same observationTime is a conflict unless confirmReplace is set

`SpatialObservation.assertNoConflictingObservationTime(existingAtSameTime, confirmReplace)` MUST
throw a `ConflictError` when `existingAtSameTime` is non-`null` and `confirmReplace` is `false`.
It MUST NOT throw when `existingAtSameTime` is `null` (no existing observation at that time), and
MUST NOT throw when `existingAtSameTime` is non-`null` and `confirmReplace` is `true` (the caller
has explicitly opted into replacing it). A second observation at the same `observationTime` MUST
NOT silently overwrite the first without an explicit `confirmReplace` intent.

#### Scenario: No existing observation at that time is not a conflict

- **WHEN** `assertNoConflictingObservationTime` is called with `existingAtSameTime: null` and
  `confirmReplace: false`
- **THEN** `assertNoConflictingObservationTime` returns normally (no error thrown)

#### Scenario: A duplicate observationTime without confirmReplace is rejected

- **WHEN** `assertNoConflictingObservationTime` is called with a non-`null` `existingAtSameTime`
  and `confirmReplace: false`
- **THEN** `assertNoConflictingObservationTime` throws a `ConflictError`

#### Scenario: A duplicate observationTime with confirmReplace is allowed

- **WHEN** `assertNoConflictingObservationTime` is called with a non-`null` `existingAtSameTime`
  and `confirmReplace: true`
- **THEN** `assertNoConflictingObservationTime` returns normally (no error thrown)

### Requirement: Concurrent callers racing to record an observation at the same time receive a consistent conflict contract

Two concurrent callers that each independently check for an existing observation at the same
`hazardousEventId`/`observationTime` before either has persisted (both observing no conflict) and
then both attempt to persist MUST NOT both succeed in creating two distinct "current" observations
for that exact time. Exactly one caller's observation MUST persist as the recorded observation for
that `(hazardousEventId, observationTime)` pair; the other caller MUST receive the same
`ConflictError` it would have received had it performed its existence check after the first
caller's write completed, whether its conflict was detected synchronously (via a pre-check) or
because its write lost a race against a concurrent writer. A caller's error contract MUST NOT
differ based on which of the two cases occurred.

#### Scenario: A caller that loses a concurrent write race receives the same conflict as a synchronous duplicate check

- **WHEN** two callers, A and B, each check for an existing observation at the same
  `hazardousEventId`/`observationTime`, both observe none, both proceed to persist without
  `confirmReplace`, and A's write completes first
- **THEN** B's write MUST fail with the same `ConflictError` `assertNoConflictingObservationTime`
  throws for a synchronously-detected duplicate, not a raw, unmapped database error

**Note:** `SpatialObservation.ts` itself holds no shared mutable state (no cache, counter, or
store) — this requirement documents the contract a future persistence adapter (roadmap `5e`, not
yet proposed) MUST satisfy, backed by `hazardous_event_spatial_observation`'s own
`unique(hazardous_event_id, observation_time)` DB constraint as the actual enforcement mechanism
(defense-in-depth per that table's own comment). This scenario cannot be exercised by a zero-DB
unit test against `SpatialObservation.ts` alone; it is specified here so `5e`'s own PGlite
integration tests have an unambiguous target, the same hand-off this capability inherited from
`hazardous-event-repository-port`'s own design.md (Decision 7 there).
