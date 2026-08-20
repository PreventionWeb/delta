## Context

`app/backend.server/models/analytics/disaster-events-cost-calculator.ts` computes and persists
four aggregate cost fields on `disasterEventTable`
(`repairCostsLocalCurrencyCalc`, `replacementCostsLocalCurrencyCalc`,
`rehabilitationCostsLocalCurrencyCalc`, `recoveryNeedsLocalCurrencyCalc`) from data owned by
Disaster Record's child tables (`damagesTable`, `disruptionTable`,
`sectorDisasterRecordsRelationTable`). It is imported directly by four Disaster-Record-side model
files even though it lives under an `analytics/` folder, which is misleading — this is a required
write-path dependency, not an analytics/reporting query.

A Herbrand decision-chain analysis identified this rollup as the sole reason Disaster Events and
Disaster Record cluster together as one bounded context (`recalculate-disaster-event-costs-policy`
was flagged as the single highest-betweenness-centrality node in the full 34-decision graph).
Extracting it into a neutral, narrow-interface service is the precondition for eventually
splitting the two entities — this change does not perform that split.

`Tx` (`app/db.server.ts`) is already a union type of the transaction callback parameter and the
base `Dr` connection type. `upsertRecord` in `disaster_record__sectors.ts` calls the rollup with
`dr` directly (not inside a transaction) — the existing `Tx` type already accepts this, so the
new service's signature requires no special handling for that call site.

## Goals / Non-Goals

**Goals:**

- Move the rollup logic to a location that does not nest under either `damages`/`disaster_record`
  or `event`/`disaster-events` — `app/backend.server/services/` (an existing, already-used
  location for cross-cutting business logic; see `approvalWorkflowService.ts`,
  `emailValidationWorkflowService.ts`).
- Narrow the public interface to exactly the two entry points existing callers already use:
  recalculate-by-event-id and recalculate-by-record-id. The four individual calculators become
  private module-level functions, not exports — verified (repo-wide grep, results confirmed by
  the coordinator) that no route, handler, or MCP tool imports them individually today; only the
  two entry points and the four model files being updated in this change consume the module.
- Update all four existing call sites to import from the new service.
- Wire recalculation into the three delete paths that are missing it today
  (`damagesDeleteById`, `damagesDeleteBySectorId`, `disruptionDeleteById`,
  `disruptionDeleteBySectorId`, `disRecSectorsDeleteById`, `deleteRecordsDeleteById`) — a real,
  user-reachable gap (routes `disaster-record+/edit-sub.$disRecId+/damages+/delete.$id.tsx` and
  the disruptions equivalent let a user delete a row without the linked event's costs updating).
- Remove the dead `totalRecoveryCost += Number();` line and its incorrect "NaN" comment.
- Replace the N+1 query in the recovery-cost calculation with a single batched query while
  preserving the exact two-level fallback semantics (see Decision 4).

**Non-Goals:**

- Splitting Disaster Events and Disaster Record into separate schemas/modules — this change makes
  that decision possible later, it does not make it.
- Any change to Hazardous Events — already a cleanly separable bounded context per the Herbrand
  analysis; untouched by this coupling.
- Adding `countryAccountsId` scoping inside the rollup service's queries — it inherits tenant
  trust from callers today (some of which, e.g. `damagesUpdate`, do not currently pass a
  `countryAccountsId` at all). Fixing that is a separate, larger change.
- Fixing the unsynchronized-concurrent-recalculation race described in Risks below — this change
  preserves that existing behavior; it does not introduce it and does not resolve it.
- Renaming or restructuring the four `*Calc` columns, or changing what callers outside the four
  updated model files observe.

## Decisions

### Decision 1 — New service location: `app/backend.server/services/disasterEventCostRollupService.ts`

**Choice**: Place the extracted module in `app/backend.server/services/`, alongside
`approvalWorkflowService.ts` and `emailValidationWorkflowService.ts`.

**Rationale**: `services/` already exists as DELTA's location for cross-cutting business logic
that isn't scoped to one table's CRUD model. It sits outside both `models/event/` (Disaster
Event's own module) and the Disaster-Record-side files (`damages.ts`, `disruption.ts`,
`disaster_record.ts`, `disaster_record__sectors.ts`), so it does not privilege either side of the
boundary this extraction is meant to make splittable later.

**Alternative considered**: A new `app/backend.server/models/cost-rollup/` directory. Rejected —
`models/` is documented as "one file per table"; this service does not own a table, it reads two
entities' tables and writes a third's aggregate columns. Placing it in `models/` would misrepresent
its role the same way `analytics/` did.

### Decision 2 — Public interface: two functions, same names' intent as today

**Choice**: Export exactly:
```ts
export async function recalculateCostsForDisasterEvent(tx: Tx, disasterEventId: string): Promise<void>
export async function recalculateCostsForDisasterRecord(tx: Tx, disasterRecordId: string): Promise<void>
```
These are renamed from `updateTotals` / `updateTotalsUsingDisasterRecordId` to name the *intent*
(recalculate costs) rather than the *mechanism* (update totals), consistent with the service now
having a name that says what it does. `calculateTotals` and the four `calculateTotal*` functions
move in as private (non-exported) helpers.

**Rationale**: Every existing caller only ever needs "recalculate for this event" or "recalculate
for whatever event this record is linked to." Exposing the four calculators individually invites
new callers to bypass the two entry points and query these tables ad hoc, which is exactly the
kind of scattered coupling this extraction is meant to prevent from spreading further.

**Alternative considered**: Keep the old function names to minimize diff noise at call sites.
Rejected — the call sites are already being touched in this change (import path change), so the
rename costs nothing extra, and the old names (`updateTotals`) don't say which entity's totals or
why, which is part of what made this module easy to misuse as an "analytics" dependency.

### Decision 3 — Delete paths call `recalculateCostsForDisasterRecord`, not a new event-level flow

**Choice**: The six delete functions each already know the `recordId` for the row being deleted
(the row itself, or the row's `recordId` foreign key). After the delete completes, call
`recalculateCostsForDisasterRecord(tx, recordId)` — reusing the same record-based entry point
that already handles the "record is unlinked from an event" no-op case.

**Rationale**: Reuses an already-specified, already-tested code path rather than inventing a
parallel one. The existing no-op guard (record not linked to an event → skip) is exactly the
right behavior after a delete too — a deleted damages row on an unlinked record needs no
recalculation.

**Note on transactions**: `damagesDeleteById`, `disruptionDeleteById`, and `disRecSectorsDeleteById`
(via `deleteRecordsDeleteById`) currently run outside any `dr.transaction(...)` wrapper — they call
`dr.delete(...)` directly. The recalculation call added after the delete uses `dr` for the same
reason `upsertRecord` does today: `Tx` already accepts it. No new transaction wrapping is
introduced by this change; the delete and the recalculation remain two separate statements, exactly
as create/update already behave when called outside `disasterRecordsUpdate`'s tx-wrapped context.

### Decision 4 — N+1 fix must preserve the exact two-level fallback semantics

**Choice**: Replace the per-sector-relation-row `damages` query with a single query that fetches
all `damages` rows for the event's record IDs up front, grouped by `(recordId, sectorId)` in
memory, then apply the same per-row fallback logic against the in-memory map instead of issuing a
new query per row.

**The invariant that MUST be preserved** (documented here because a naive rewrite breaks it):
today's calculation iterates `sectorDisasterRecordsRelationTable` rows, not `damagesTable` rows.
For each sector-relation row:
- if `damageRecoveryCost` is set on that row, its value is added and the row's own damages are
  **not** consulted;
- otherwise, `damagesTable.totalRecovery` is summed for that exact `(recordId, sectorId)` pair.

A damages row whose `(recordId, sectorId)` pair has **no** corresponding sector-relation row
contributes **zero** to the total under both the current implementation and the rewrite — this is
existing behavior, not a bug, and a "sum all damages, grouped by record+sector" rewrite that skips
the sector-relation join would silently include such rows and change totals for any event with
damages recorded against a sector that was never linked via
`sectorDisasterRecordsRelationTable`. The rewrite MUST keep iterating sector-relation rows as the
outer loop.

**The falsy-zero edge case**: `damageRecoveryCost` and `totalRecovery` are Drizzle `numeric(...)`
columns (see `ourMoney()` in `app/utils/drizzleUtil.ts`), which Drizzle returns as **strings**, not
numbers. A value of `"0"` is a non-empty string and therefore truthy in the existing
`if (sectorDisaster.damageRecoveryCost)` check — so a sector-relation row with an explicit
`damageRecoveryCost` of `0` takes the **override branch** (contributing `0`) rather than falling
through to sum that pair's damages, exactly the same as today. Only `null`/`undefined` values
fall through to the damages-sum branch. The rewrite MUST preserve string-truthiness semantics
(e.g. do not coerce to `Number(...)` before the truthiness check, or `"0"` would incorrectly
become falsy and change behavior).

**Alternative considered**: A single SQL query with a `LEFT JOIN` and `COALESCE` doing the
fallback in the database. Rejected for this change — correct, but a larger rewrite of the query
shape that increases review risk for what is meant to be a behavior-preserving extraction plus a
scoped perf fix. The batched-in-memory approach removes the N+1 (one query total instead of one
per sector-relation row) while keeping the row-by-row fallback logic recognizable and easy to
diff against the original.

## Risks / Trade-offs

- [Risk] **Unsynchronized concurrent recalculation** (pre-existing, not introduced or fixed by
  this change). The four `*Calc` columns are shared mutable state written by a full
  recompute-and-overwrite on every damages/disruption/sector-relation/record write, from multiple
  request handlers, with no locking or transaction isolation tying the read-aggregate-write cycle
  to the write that triggered it. If two callers trigger recalculation for the **same**
  `disasterEventId` concurrently (e.g. two sector-relation rows for the same event saved in quick
  succession from two browser tabs), each recalculation queries the DB independently; the value
  actually persisted is whichever recalculation's `UPDATE` **commits last**, not whichever
  **started** last. If recalculation B's read snapshot is taken before A's write is visible, and
  B's write commits after A's, the persisted total reflects B's (stale) snapshot even though A's
  data is newer. → Mitigation: none proposed in this change — recording it here so it is not
  mistaken for new behavior introduced by the extraction, and so it is available as a named,
  understood gap for whoever picks up "make the recalculation transactionally consistent" as a
  follow-on change (e.g. wrapping the writing operation and its recalculation in one
  `dr.transaction` with `SERIALIZABLE` isolation, or moving to an event-sourced recompute queue).
- [Risk] Renaming the exported function names (Decision 2) means any out-of-tree script or
  ad-hoc tooling not caught by the repo-wide grep would break silently at compile time (TypeScript
  will catch it, not runtime). → Mitigation: `yarn tsc` is a mandatory gate in tasks.md; a broken
  import surfaces before merge.
- [Risk] The N+1 rewrite (Decision 4) changes the query plan (one query instead of N). For an
  event with zero or few records this is a no-op improvement; the invariant tests in
  `specs/disaster-event-cost-rollup-service/spec.md` are what gives confidence the totals are
  unchanged for the cases that matter (override present, override absent, no matching damages
  row, multiple records/sectors). → Mitigation: covered by dedicated test scenarios, not just
  "trust the refactor."
- [Risk] Wiring recalculation into six delete functions that previously had none changes observed
  totals for any tenant that has been deleting damages/disruption/sector-relation rows without
  a subsequent unrelated save — those events' cached totals will change (become correct) the
  first time this code runs. → Mitigation: this is the intended fix (see proposal.md Why); flagged
  here so the PR description and QA notes call it out as an expected, one-time data correction
  for already-stale events, not a regression.

## TypeScript types introduced

| Name | Kind | Location | Description |
|---|---|---|---|
| `recalculateCostsForDisasterEvent` | `async function` | `app/backend.server/services/disasterEventCostRollupService.ts` | Recomputes and persists the four `*Calc` cost columns for one disaster event. Replaces `updateTotals`. |
| `recalculateCostsForDisasterRecord` | `async function` | same file | Resolves the record's linked event (no-op if unlinked) and delegates to `recalculateCostsForDisasterEvent`. Replaces `updateTotalsUsingDisasterRecordId`. |
| `Totals` | `interface` (private, not exported) | same file | Unchanged shape: `{ repairCost, replacementCost, rehabilitationCost, recoveryCost }` (all `string`), moved verbatim from the old module. |

No Drizzle schema changes. No new database types.

## Test infrastructure

PGlite integration tests (`yarn test:run2`) — the service reads and writes real Drizzle tables
(`damagesTable`, `disruptionTable`, `sectorDisasterRecordsRelationTable`, `disasterRecordsTable`,
`disasterEventTable`), all five of which already have PGlite test schema definitions under
`tests/integration/db/testSchema/`, confirming no new test-infrastructure setup is required.

Proposed test file: `tests/integration/db/services/disasterEventCostRollupService.test.ts`, using
`import "../../setup"` (two levels deeper than `tests/integration/db/`).

No unit-tier tests are proposed — every scenario requires real aggregation over seeded rows across
four tables, which is exactly what the PGlite tier exists for; mocking the DB layer here would
test the mocks, not the fallback/aggregation logic that is the point of this service.

## Form-CSV-API pipeline impact

None. `disasterEventCostRollupService.ts` has no `fieldsDef`, is not a model in the
Form-CSV-API sense, and does not appear in any CSV import/export or REST API surface — it is an
internal write-path side effect triggered by the four model files' own `fieldsDef`-driven
create/update/delete handlers, exactly as the module it replaces was.
