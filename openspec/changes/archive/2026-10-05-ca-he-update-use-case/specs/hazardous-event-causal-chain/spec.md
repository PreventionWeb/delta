## ADDED Requirements

### Requirement: Reject a causal link whose cause starts later than its effect

`assertCauseStartsNoLaterThanEffect(causeStartDate, effectStartDate)` MUST throw a `ConflictError`
when both `causeStartDate` and `effectStartDate` match the accepted zero-padded
`YYYY`/`YYYY-MM`/`YYYY-MM-DD` date format (ADR-002, "Partial and Uncertain Dates") and
`causeStartDate` is later than `effectStartDate`. Equality MUST be accepted (a cause event
starting on exactly the same date as its effect is a valid causal link, not a violation). When
either date does not match the accepted format, the function MUST NOT throw for this reason —
the temporal check does not block construction of a causal link merely because a date is missing
or not in the expected format.

#### Scenario: A cause starting after its effect is rejected

- **WHEN** `causeStartDate` is `"2026-05-10"` and `effectStartDate` is `"2026-05-01"` (both valid
  zero-padded dates)
- **THEN** `assertCauseStartsNoLaterThanEffect` throws a `ConflictError`

#### Scenario: A cause starting before its effect is accepted

- **WHEN** `causeStartDate` is `"2026-05-01"` and `effectStartDate` is `"2026-05-10"`
- **THEN** `assertCauseStartsNoLaterThanEffect` returns normally (no error thrown)

#### Scenario: A cause starting on exactly the same date as its effect is accepted

- **WHEN** `causeStartDate` and `effectStartDate` are both `"2026-05-10"`
- **THEN** `assertCauseStartsNoLaterThanEffect` returns normally (no error thrown)

#### Scenario: Mismatched precision — coarser cause, finer effect — compares correctly

- **WHEN** `causeStartDate` is `"2020-06"` (year-month precision) and `effectStartDate` is
  `"2020-06-15"` (day precision)
- **THEN** `assertCauseStartsNoLaterThanEffect` returns normally (no error thrown)

#### Scenario: Mismatched precision — finer cause at exactly a coarser effect's period start — is accepted

- **WHEN** `causeStartDate` is `"2020-01-01"` (day precision) and `effectStartDate` is `"2020"`
  (year precision) — the cause's exact date is the first day of the effect's own (coarser) period
- **THEN** `assertCauseStartsNoLaterThanEffect` returns normally (no error thrown) — both sides are
  normalized to the earliest point of their own period before comparing (`"2020-01-01"` vs.
  `"2020-01-01"`), so this is accepted as equality, not rejected as "cause is more precise, so
  compares greater"

#### Scenario: Mismatched precision — finer cause genuinely after a coarser effect's period start — is still rejected

- **WHEN** `causeStartDate` is `"2020-06-15"` (day precision) and `effectStartDate` is `"2020"`
  (year precision) — the cause falls partway through the effect's own (coarser) year, genuinely
  after that year's first day
- **THEN** `assertCauseStartsNoLaterThanEffect` throws a `ConflictError` — normalizing the effect
  to its period's start does not grant a cause starting anywhere within that period a free pass

#### Scenario: A non-zero-padded causeStartDate does not block the link

- **WHEN** `causeStartDate` is `"2026-9-1"` (not zero-padded) and `effectStartDate` is any valid
  zero-padded date, including one that would otherwise read as earlier than `"2026-9-1"`'s intended
  calendar date
- **THEN** `assertCauseStartsNoLaterThanEffect` does not throw for the temporal reason

#### Scenario: A non-zero-padded effectStartDate does not block the link

- **WHEN** `effectStartDate` is `"2026-9-1"` (not zero-padded) and `causeStartDate` is any valid
  zero-padded date
- **THEN** `assertCauseStartsNoLaterThanEffect` does not throw for the temporal reason

#### Scenario: A missing (empty-string) startDate on either side does not block the link

- **WHEN** `causeStartDate` or `effectStartDate` is `""`
- **THEN** `assertCauseStartsNoLaterThanEffect` does not throw for the temporal reason
