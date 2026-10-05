# hazardous-event-causal-chain Specification

## Purpose

Provides the domain-layer cycle-detection rule for `hazardous_event_causality`'s cause/effect
graph — a real path-membership check so an arbitrarily long causal chain can never be silently
closed into a cycle, replacing reliance on any depth-capped approximation.

## Requirements

### Requirement: Reject a causal link that would close a cycle of any length

`assertCausalLinkDoesNotCreateCycle` MUST throw a `ConflictError` when adding the proposed
`causeId → effectId` edge to the given `existingEdges` would make `causeId` reachable by following
edges forward from `effectId` — i.e., a path already exists from the proposed effect back to the
proposed cause. This MUST hold regardless of chain length, including chains far longer than a
fixed small depth (e.g. 10).

#### Scenario: A long acyclic chain is accepted

- **WHEN** `existingEdges` forms a single non-branching chain of 50 nodes (`n0→n1→n2→...→n49`) and
  the proposed link is `n49 → n50` (extending the chain by one more node)
- **THEN** `assertCausalLinkDoesNotCreateCycle` returns normally (no error thrown)

#### Scenario: A cycle far beyond a depth-10-style cap is rejected

- **WHEN** `existingEdges` forms a single non-branching chain of 20 nodes (`n0→n1→...→n19`) and the
  proposed link is `n19 → n0` (closing the chain into a cycle) — mirroring the exact shape Phase 0
  sub-track 0b proved the legacy depth-10-capped query fails to catch
- **THEN** `assertCausalLinkDoesNotCreateCycle` throws a `ConflictError`

#### Scenario: A cycle formed through a branching graph is rejected

- **WHEN** `existingEdges` includes multiple branches from shared nodes (not a single linear
  chain) and, through some combination of those branches, `effectId` can already reach `causeId`
- **THEN** `assertCausalLinkDoesNotCreateCycle` throws a `ConflictError`

#### Scenario: An unrelated, disconnected acyclic edge set does not block a new link

- **WHEN** `existingEdges` contains edges entirely disconnected from both the proposed `causeId`
  and `effectId` (no path exists from `effectId` to `causeId` through any combination of edges)
- **THEN** `assertCausalLinkDoesNotCreateCycle` returns normally (no error thrown)

### Requirement: Reject the trivial 1-length self-cause case at the domain layer

`assertCausalLinkDoesNotCreateCycle` MUST throw a `ConflictError` when `causeId` and `effectId` are
the same value, independent of `existingEdges`, as its own domain-layer check — not relying on the
`hazardous_event_causality` table's DB-level CHECK constraint as the only enforcement of this rule
(project Invariant 3: DB constraints are defense-in-depth, never a substitute for the domain-layer
rule).

#### Scenario: An event proposed as its own cause is rejected

- **WHEN** `causeId` and `effectId` are the same ID, and `existingEdges` is empty
- **THEN** `assertCausalLinkDoesNotCreateCycle` throws a `ConflictError`

### Requirement: A safety cap bounds traversal without being usable as the detection mechanism

`assertCausalLinkDoesNotCreateCycle` MUST bound the total number of distinct nodes visited during
traversal at `CAUSAL_CHAIN_TRAVERSAL_CAP`. Reaching this cap before either confirming a cycle or
exhausting all reachable nodes MUST throw a `ValidationError` (a distinct error type from the
`ConflictError` used for a confirmed cycle) and MUST NOT be treated as, or reported as, "no cycle."
The cap exists only to bound work against a pathologically large graph; it MUST NOT be the
mechanism that decides whether a cycle exists.

#### Scenario: A confirmed cycle is reported before the cap is reached, when found first

- **WHEN** `causeId` is reachable from `effectId` within fewer than `CAUSAL_CHAIN_TRAVERSAL_CAP`
  visited nodes
- **THEN** `assertCausalLinkDoesNotCreateCycle` throws a `ConflictError`, not a cap-exceeded error

#### Scenario: Traversal exceeding the cap fails closed, distinctly from a confirmed cycle

- **WHEN** `existingEdges` forms a graph large enough that traversal from `effectId` would need to
  visit more than `CAUSAL_CHAIN_TRAVERSAL_CAP` distinct nodes before either reaching `causeId` or
  exhausting all reachable nodes
- **THEN** `assertCausalLinkDoesNotCreateCycle` throws a `ValidationError`, and never returns
  normally as if the link were confirmed acyclic

#### Scenario: A valid acyclic chain at exactly the cap boundary is accepted

- **WHEN** `existingEdges` forms a single non-branching acyclic chain whose traversal from
  `effectId` visits exactly `CAUSAL_CHAIN_TRAVERSAL_CAP` distinct nodes, all reachable nodes are
  exhausted at that count, and `causeId` is never among them
- **THEN** `assertCausalLinkDoesNotCreateCycle` returns normally (no error thrown)

### Requirement: Concurrent invocation has no shared-state hazard

`assertCausalLinkDoesNotCreateCycle` MUST behave as a pure function with no shared mutable state
across invocations, so that concurrent callers evaluating different proposed links against their
own `existingEdges` arguments never interfere with each other's traversal or result.

#### Scenario: Two concurrent calls against independent inputs do not affect each other

- **WHEN** two calls to `assertCausalLinkDoesNotCreateCycle` are made concurrently, each with its
  own `existingEdges`, `causeId`, and `effectId` arguments, and neither call's arguments are
  mutated by the other
- **THEN** each call's outcome (return normally, throw `ConflictError`, or throw `ValidationError`)
  depends only on its own arguments, never on the other call's timing or arguments

**Note:** this scenario documents an absence of a hazard (no internal cache, counter, or store
exists in `CausalChain.ts` for concurrent callers to race on), not a concurrency mechanism to
build. A separate, real concurrency hazard exists one layer up — two concurrent callers each
persisting a new edge after independently passing this check against the same pre-write snapshot
of `existingEdges` could jointly close a cycle neither call observed alone (TOCTOU). That hazard is
explicitly out of scope for this capability (design.md Risks) and belongs to whatever future
use-case capability loads edges and persists a new one around this check.

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
