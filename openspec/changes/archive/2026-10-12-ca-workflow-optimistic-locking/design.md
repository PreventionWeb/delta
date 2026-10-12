## Context

`DrizzleWorkflowRepository.save()` (current code, `app/domains/validation-workflow/
infrastructure/DrizzleWorkflowRepository.server.ts:141-193`) is a single upsert:
`insert(...).onConflictDoUpdate({ target: id, set: setFields, setWhere: entityId AND
entityType match })`. The `setWhere` guard exists only to catch an `id` reused for a
different entity (Decision 3 in `5a`'s own design.md) — it says nothing about whether the
row being updated has changed since the caller last read it. There are exactly two real
callers of `IWorkflowRepository.save()` today:

- `ProcessWorkflowActionUseCase.execute()` (`application/use-cases/
  ProcessWorkflowAction.ts:74`) — always operates on an existing row: it calls
  `findByEntity()` first and throws `WorkflowInstanceNotFoundError` if nothing is found
  (line 54), so `save()` here is always logically an update.
- `CreateHazardousEventUseCase.execute()` (`hazardous-events/application/use-cases/
  CreateHazardousEvent.ts:192`) — always creates a brand-new `WorkflowInstance` via
  `WorkflowInstance.createDraft()` with a freshly generated id; `save()` here is always
  logically an insert.

No caller ever relies on `save()`'s insert-or-update ambiguity — each caller already knows
which case it is in. This is the basis for Decision 1 below.

An existing integration test
(`tests/integration/domains/validation-workflow/DrizzleWorkflowRepository.test.ts:413`,
titled "...characterizes DEF-024") already proves the save/save race empirically: two
concurrent `save()` calls against the same row both resolve successfully, with whichever
issues last against PGlite's single connection silently winning. See proposal.md for the
full motivation; this document covers the how.

## Goals / Non-Goals

**Goals:**

- Make a losing concurrent write to the same `WorkflowInstance` row fail loudly
  (`ConcurrentModificationError`) instead of silently overwriting a newer state.
- Make a stale write that races behind a `deleteByEntity()` for the same entity fail
  loudly instead of resurrecting the deleted row.
- Keep the fix scoped to `DrizzleWorkflowRepository` and its two real callers — no changes
  to `IHazardousEventRepository` (that race is `DEF-037`, owned by `5d`).

**Non-Goals:**

- Transactional atomicity across multiple writes (e.g. `HazardousEvent.save()` +
  `WorkflowInstance.save()` as one unit) — that is `5k`'s `DEF-026`/`DEF-033` scope, not
  this one.
- A general-purpose optimistic-locking abstraction reusable by every repository in the
  codebase. This design solves `IWorkflowRepository` concretely; `DEF-037` is told to
  treat it as a precedent to adapt, not a shared library to import.
- An audit trail of deleted `WorkflowInstance` rows. Decision 2 below explains why this
  isn't needed for the two races in scope, but a future requirement for "who deleted this
  and when" would be new scope, not a byproduct of this change.

## Decisions

### Decision 1 — Split `save()` into `insert()` and `update(instance, expectedUpdatedAt)`, not an optional parameter

**Chosen:** `IWorkflowRepository` gains two methods, replacing `save()`:

```ts
insert(instance: WorkflowInstance): Promise<WorkflowInstance>;
update(instance: WorkflowInstance, expectedUpdatedAt: Date): Promise<WorkflowInstance>;
```

`expectedUpdatedAt` is **required**, not optional. Every caller of `update()` must supply
the `updatedAt` value it read before computing `instance`.

**Alternative considered and rejected:** `save(instance: WorkflowInstance,
expectedUpdatedAt?: Date)`, where omitting the second argument keeps today's unguarded
upsert. Rejected because it reopens exactly the bug this change closes for any caller
(current or future) that forgets to pass it — with no compiler error to catch the
omission. An optional parameter is a silent opt-out of the fix, not a safer default.

**Alternative considered and rejected:** keep `save()` as a single method that internally
branches on whether `instance` is new (e.g. a `exists: boolean` flag on the domain
entity). Rejected: `WorkflowInstance` has no concept of "is this new," and introducing one
only to route a persistence decision does not belong on the domain entity (it would leak
an infrastructure concern — "has this been persisted yet" — into the domain layer).

**Consequence:** this is a breaking interface change. Both real callers are updated
(`ProcessWorkflowActionUseCase` → `update()`, `CreateHazardousEventUseCase` → `insert()`),
along with every test fake implementing `IWorkflowRepository` (listed in proposal.md
Impact).

### Decision 2 — `update()` is a plain conditional `UPDATE`, never an upsert; this alone prevents the delete/save resurrection, no tombstone needed

**Chosen:** `update()` issues `UPDATE workflow_instance SET ... WHERE id = ? AND
entity_id = ? AND entity_type = ? AND updated_at = ?` — a plain conditional update with no
`ON CONFLICT` / insert fallback of any kind. `insert()` issues a plain `INSERT`, relying
on the existing `UNIQUE(entity_id, entity_type)` index for the already-tested
first-insert-race behavior (unchanged from today).

Because `update()` can no longer insert, a `deleteByEntity()` that commits between a
caller's `findByEntity()` read and its later `update()` call leaves `update()`'s `WHERE`
clause matching zero rows — the row is gone, so there is nothing to conditionally update.
This is indistinguishable, from `update()`'s own point of view, from any other zero-row
conflict, and is resolved as `ConcurrentModificationError` by Decision 4's diagnostic
re-read, with a message indicating the row no longer exists. No tombstone, soft-delete
column, or separate table is needed to prevent resurrection — the fix is simply that
"update" and "insert" are no longer the same operation.

**Alternative considered and rejected:** a tombstone row/table marking deleted entities,
checked by `insert()` before it writes. This was the roadmap intent's leading candidate
("e.g. a tombstone"), but on inspection it solves a different problem than the one that
exists today: a tombstone is for preventing `insert()` from recreating a deleted entity,
which would only matter if some caller could legitimately call `insert()` for an
`entityId` that *might* already have existed and been deleted. Neither real caller does
this — `CreateHazardousEventUseCase` always inserts a fresh, never-before-seen
`entityId`. The actual resurrection risk in `5a`'s finding is a stale **update**
resurrecting a row via the upsert's insert fallback, which Decision 2 already removes.
**This is a deviation from the roadmap's own suggested mechanism, called out explicitly
per spec-writer instructions** — confirmed by the human reviewer 2026-10-12 (Decision 7).
**Leftover gap, explicitly out of scope:** a `CreateHazardousEventUseCase.insert()` racing
concurrently with nothing (it always uses a fresh id) has no resurrection exposure; a
genuinely new orphan-row race (insert succeeding after some other write for the *same new
entity* fails) is `5k`'s `DEF-026` territory, not this one.

### Decision 3 — Reuse `updated_at` as the optimistic-lock token; no new `version` column, no DB migration

**Chosen:** the existing `updated_at` column (already application-managed —
`WorkflowInstance.transition()` sets it on every state change, no DB trigger) is compared
directly in `update()`'s `WHERE` clause. No schema change.

**Precision risk identified and mitigated:** `updated_at` is `TIMESTAMPTZ`, which
PostgreSQL stores at microsecond precision; `WorkflowInstance`'s own `updatedAt` is a JS
`Date`, which only has millisecond precision. For every row ever written by
`DrizzleWorkflowRepository` itself (the only production write path),
`toRow()`/`insert()`/`update()` always write an explicit, application-computed `Date`
value — there is no code path in production where this table's `updated_at` is populated
by its own `.default(sql\`CURRENT_TIMESTAMP\`)` instead of an explicit value, so a
round-trip through the DB is lossless (an ISO-8601-with-milliseconds value written to a
`TIMESTAMPTZ` column has no sub-millisecond component to lose). The column default only
ever fires for rows inserted by something other than this repository:
  - the `insertInvalidRow()` test helper in `DrizzleWorkflowRepository.test.ts`, which
    bypasses the repository entirely — not a correctness concern for any real caller;
  - a backfill written by Phase M (data-migration, parallel team workstream, status not
    verified by this proposal) — flagged here as a **risk**, not resolved, since that
    team's write path is out of this proposal's visibility.

As defense-in-depth regardless of the above, `update()`'s `WHERE` clause compares
`date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', $expectedUpdatedAt)`
(or the Drizzle-idiomatic equivalent) rather than a raw `=`, so a sub-millisecond
component on either side — however it got there — cannot cause a false conflict by
itself. It can still cause a false *non*-conflict (two different sub-millisecond values
rounding to the same millisecond behaving as equal) — accepted as a pre-existing class of
clock-resolution risk, no worse than today's complete absence of any check.

**Alternative considered and rejected:** add a dedicated integer `version` column
(`version INTEGER NOT NULL DEFAULT 1`, incremented on every `update()`). This avoids the
timestamp-precision question entirely and is the more conventional optimistic-locking
pattern. Rejected for this change specifically because it requires adding `version` to
`WorkflowInstanceProps` (the domain entity), which ripples into every direct
`WorkflowInstance.create()` call site across the test suite (`DrizzleWorkflowRepository.
test.ts`, `ProcessWorkflowAction.test.ts`, and others construct full prop literals) for a
precision concern that, per the analysis above, does not actually affect any production
write path. Flagged as a candidate to revisit if the Phase M risk above turns out to be
real (see Risks).

### Decision 4 — A non-atomic diagnostic re-read by `id` distinguishes the three zero-row causes

**Chosen:** when `update()`'s conditional `UPDATE ... RETURNING` affects zero rows, issue
a separate `SELECT * FROM workflow_instance WHERE id = ?` to classify the cause before
throwing:

1. **No row found** → the entity was deleted concurrently (Decision 2's resurrection
   case) → throw `ConcurrentModificationError`.
2. **Row found, but `entity_id`/`entity_type` doesn't match** → today's existing identity
   mismatch guard (an id collision across entities) → throw the existing `ConflictError`
   with its existing message, unchanged.
3. **Row found, entity matches, but `updated_at` doesn't match `expectedUpdatedAt`** → a
   genuine lost-update race → throw `ConcurrentModificationError`.

This re-read is explicitly non-atomic (a second write could land between the failed
`UPDATE` and this `SELECT`) — it exists only to produce an accurate error message/type for
the *already-failed* write, not to make the write itself atomic. Re-running it in a loop
or wrapping it in a transaction would not change the outcome (the `UPDATE` has already
returned zero rows) and is not attempted.

### Decision 5 — New `ConcurrentModificationError extends ConflictError`, in `~/shared/errors`

**Chosen:** add `ConcurrentModificationError` to `app/shared/errors/DomainError.ts`
(exported via `app/shared/errors/index.ts`), extending `ConflictError`. It does not
override `code` or `statusHint` — it inherits `"CONFLICT"` / `409` from `ConflictError`,
matching ADR-003's existing coarse-grained error vocabulary (none of today's `ConflictError`
call sites distinguish sub-cases by `code` either). It is distinguished from a generic
`ConflictError` by type (`instanceof`), not by `code`.

**Location rationale:** placed in `~/shared/errors`, not `validation-workflow/
application/errors` (where `WorkflowInstanceNotFoundError` lives), because `DEF-037`'s
future `IHazardousEventRepository` adapter is explicitly told to follow this as "the
direct precedent," and a workflow-domain-scoped error class would be an awkward import for
a different domain's repository. A generic concurrency error belongs in the shared
vocabulary alongside `ConflictError` itself.

## Risks / Trade-offs

- **[Risk] Phase M's backfill may write `updated_at` via a path that doesn't match this
  table's application-managed convention (Decision 3), producing sub-millisecond-precision
  rows that collide unpredictably with the millisecond-truncated comparison.** →
  Mitigation: the millisecond-truncation comparison already prevents a *false conflict*
  from this; the residual risk is a *false non-conflict* (rare, two different values
  truncating to the same millisecond), accepted as no worse than today's total absence of
  a check. Confirm Phase M's write path before this proposal is archived if its status can
  be checked; otherwise this is a known, documented residual risk, not a blocker.
- **[Risk, accepted 2026-10-12] CAS token non-advancement on a clock tie.** If a winning
  write's `now()` coincidentally equals the row's pre-existing `updated_at`, the token
  doesn't advance and a separate stale caller could still pass the WHERE clause. Needs two
  independent rare events at once; judged not worth fixing now for this app's traffic.
  **Not fixed** — see `DEF-038`.
- **[Risk] Every test fake implementing `IWorkflowRepository` across both domains
  (hazardous-events and validation-workflow use-case tests) breaks under `tsc` the moment
  `save()` is removed from the interface.** → Mitigation: tasks.md enumerates every
  affected test file explicitly; this is mechanical (rename `save` mock to `insert`/
  `update` per call site) but not optional — `yarn tsc` is a hard gate before this change
  can be considered done.
- **[Trade-off] `ConcurrentModificationError` conflates two semantically different causes
  (lost-update vs. resurrection-prevented) under one error type.** → Accepted: both are
  "the row changed state since you read it" from the caller's point of view, and
  `ProcessWorkflowActionUseCase` propagates either one unmodified (Decision 6), so the
  reaction is the same regardless of which sub-case occurred. The two sub-cases remain
  distinguishable after the fact from the thrown error's `message` text (`context` itself
  carries only `entityId`/`entityType` in both cases, not which cause fired).
- **[Trade-off] This design intentionally diverges from the roadmap intent's own suggested
  mechanism ("e.g. a tombstone") for the resurrection case.** → Surfaced explicitly for
  human confirmation rather than silently substituted, per this change's own standing
  instruction that a roadmap deviation must be flagged, not just implemented. Confirmed
  2026-10-12 (Decision 7).

## Migration Plan

No DB migration (`yarn dbsync`) is required — no schema changes. Deployment is a single
coordinated release of the interface change and both call sites (`IWorkflowRepository`,
`DrizzleWorkflowRepository`, `ProcessWorkflowActionUseCase`, `CreateHazardousEventUseCase`)
— there is no reasonable partial-rollout state (an old caller passing no
`expectedUpdatedAt` to a new `update()` fails to compile, which is the intended
all-or-nothing behavior). Rollback is a plain revert of the same commit set; no persisted
data shape changes, so no backward/forward data compatibility concern exists either way.

## Decisions (resolved 2026-10-12, were Open Questions)

**Decision 6 — `ProcessWorkflowActionUseCase` propagates `ConcurrentModificationError`
unmodified.** Matches the use case's existing "errors propagate unmodified" precedent for
every other error today — no bounded-retry loop is implemented. The caller (route/
controller, not yet built) is responsible for surfacing the 409 and prompting a manual
retry.

**Decision 7 — No tombstone.** Decision 2's no-tombstone resolution of the delete/save
resurrection race is accepted as-is; no audit trail of deleted `WorkflowInstance` rows is
in scope for this change.
