## Why

A Herbrand-framework decision-chain analysis of DELTA's 9 core business processes found that
Disaster Events and Disaster Record are **not** separable bounded contexts today, unlike
Hazardous Events (which is cleanly separable). The coupling is narrow: only the financial-rollup
triad — damages/disruption/sector-relation breakdown entries feeding disaster-event cost totals —
fuses the two entities. `recalculate-disaster-event-costs-policy` was independently flagged as
the single highest-betweenness-centrality node in the entire 34-decision graph, and its decision
cluster spans two different processes ("boundary misalignment"). Plain CRUD on either entity does
not cluster across the boundary at all.

The rollup logic lives in `app/backend.server/models/analytics/disaster-events-cost-calculator.ts`
today — nested under neither entity's own module, but imported directly by four Disaster-Record-
side model files, which is itself a smell (an "analytics" module is being used as a required
write-path dependency). Extracting it into a standalone domain service with a narrow interface is
the precondition for eventually letting Disaster Events and Disaster Record become separate
modules — this change makes that future split possible without doing it now.

While auditing the current call sites (Phase 0 code read), two real gaps in today's behavior were
found and are addressed as part of this extraction, since the code is being touched and re-tested
anyway:

- Deleting a single damages, disruption, or sector-relation row does **not** trigger cost
  recalculation today (only create/update paths do), even though user-facing routes
  (`app/routes/$lang+/disaster-record+/edit-sub.$disRecId+/damages+/delete.$id.tsx` and the
  equivalent `disruptions+/delete.$id.tsx`) let a user delete these rows directly. This leaves the
  linked disaster event's four cached `*Calc` cost columns stale until an unrelated save happens
  to trigger a recalc elsewhere. This is a real, user-reachable bug, not a theoretical gap.
- A dead line in `calculateTotalRecoveryCost` (`totalRecoveryCost += Number();`, no argument) is
  a no-op — `Number()` returns `0`, not `NaN` — but the code comment above it incorrectly claims
  it produces `NaN`. The line and its stale comment should be removed for clarity. This is a
  cleanup, not a numeric correctness fix — no computed total changes as a result.

## What Changes

- **New file** `app/backend.server/services/disasterEventCostRollupService.ts` — a standalone
  domain service exposing exactly two public functions, mirroring the two entry points the
  current analytics module exposes today: `recalculateCostsForDisasterEvent(tx, disasterEventId)`
  and `recalculateCostsForDisasterRecord(tx, disasterRecordId)`. The four internal calculators
  (repair/replacement/rehabilitation/recovery) move into this file as private, non-exported
  helpers — no caller outside this file needs them individually today (verified: no route,
  handler, or MCP tool imports them directly; the only consumers are the two entry points and the
  four model files being updated by this change).
- **Modified** `app/backend.server/models/damages.ts` — `damagesCreate`, `damagesUpdate`, and
  `damagesUpdateByIdAndCountryAccountsId` switch their import from
  `./analytics/disaster-events-cost-calculator` to the new service. `damagesDeleteById` and
  `damagesDeleteBySectorId` gain a call to `recalculateCostsForDisasterRecord` after the delete
  (new behavior — see Why).
- **Modified** `app/backend.server/models/disruption.ts` — same pattern:
  `disruptionCreate`/`disruptionUpdate`/`disruptionUpdateByIdAndCountryAccountsId` switch imports;
  `disruptionDeleteById` and `disruptionDeleteBySectorId` gain the post-delete recalc call.
- **Modified** `app/backend.server/models/disaster_record__sectors.ts` —
  `disRecSectorsCreate`/`disRecSectorsUpdate`/`disRecSectorsUpdateByIdAndCountryAccountsId`/
  `upsertRecord` switch imports; `disRecSectorsDeleteById` and `deleteRecordsDeleteById` gain the
  post-delete recalc call. `upsertRecord` passes `dr` (not a transaction) — the new service's
  parameter type must accept both `Tx` and the base `dr` connection, matching today's usage.
- **Modified** `app/backend.server/models/disaster_record.ts` — `disasterRecordsUpdate` switches
  its import (still update-only; `disasterRecordsCreate` still does not call recalculation,
  since a brand-new record has no breakdown data yet — unchanged from today).
- **Removed file** `app/backend.server/models/analytics/disaster-events-cost-calculator.ts` — no
  re-export shim; all four consumers are updated in this same change, and grep confirms no other
  file imports from it (the two apparent hits in `app/frontend/editabletable/data.ts` and
  `table.tsx` are an unrelated client-side `updateTotals` helper for a UI table component —
  confirmed false positives, not related to this module).
- Bug fix folded into the extraction (not a rewrite of the calculation logic): remove the dead
  `totalRecoveryCost += Number();` line and its stale comment in the recovery-cost calculator.
- Bug fix folded into the extraction: wire the existing recalculation call into the four
  single-row delete functions listed above, using the record-based entry point
  (`recalculateCostsForDisasterRecord`), so deleting a damages/disruption/sector-relation row
  keeps the disaster event's cached cost totals correct.
- Performance improvement folded into the extraction: replace the N+1 query pattern in the
  recovery-cost calculator (one `damages` query per sector-relation row) with a single batched
  query, preserving the existing two-level fallback semantics exactly (see design.md for the
  precise invariant this must preserve).

**Not a breaking change** for any external contract — this is an internal refactor. The four
`*Calc` columns on `disasterEventTable` and their values for existing data are unaffected except
for the two named bug fixes above.

## Capabilities

### New Capabilities

- `disaster-event-cost-rollup-service`: A standalone domain service that recalculates and
  persists a disaster event's four aggregate cost fields from its linked disaster records'
  damages, disruption, and sector-relation data, exposing only two entry points
  (recalculate-by-event-id, recalculate-by-record-id) to callers on either side of the
  Disaster-Event / Disaster-Record boundary.

### Modified Capabilities

(none — no existing `openspec/specs/` capability currently documents this rollup behavior; it is
being specified for the first time as part of this extraction)

## Impact

- **Files created**: `app/backend.server/services/disasterEventCostRollupService.ts`
- **Files deleted**: `app/backend.server/models/analytics/disaster-events-cost-calculator.ts`
- **Files modified**: `app/backend.server/models/damages.ts`, `disruption.ts`,
  `disaster_record__sectors.ts`, `disaster_record.ts` (import swap + new delete-path recalc calls
  on the three sector/damages/disruption files)
- **Files NOT touched**: anything under `app/backend.server/models/event/` or
  `app/backend.server/models/hazardous_event*` (Hazardous Events is out of scope — the Herbrand
  analysis found it already cleanly separable) and no database schema or migration file
- **No DB migration required** — no column, table, or index changes; the four `*Calc` columns on
  `disasterEventTable` already exist and are only ever written, never restructured
- **Test approach**: PGlite integration tests (`yarn test:run2`) for the new service, since the
  logic reads/writes real Drizzle tables (`damagesTable`, `disruptionTable`,
  `sectorDisasterRecordsRelationTable`, `disasterRecordsTable`, `disasterEventTable`) — all five
  already have PGlite test schemas under `tests/integration/db/testSchema/`. No E2E test is
  proposed (existing E2E suites under `tests/e2e/disaster-records/` and
  `tests/e2e/disaster-event/` already exercise these flows end-to-end and are expected to keep
  passing unchanged).
- **Security / multi-tenancy**: the rollup service's queries do not filter by
  `countryAccountsId` today, and this change does not add that scoping — the service is only ever
  reached through caller functions that have already established tenant scope (e.g.
  `damagesUpdateByIdAndCountryAccountsId` verifies tenant ownership before calling it). This is an
  inherited-trust-from-caller pattern, unchanged by this extraction, and is flagged here rather
  than silently carried forward. Adding independent tenant scoping inside the service is out of
  scope for this change (it would require plumbing `countryAccountsId` through every call site,
  including the ones that don't currently have it, e.g. `damagesUpdate`).
- **Explicitly out of scope**: splitting Disaster Events and Disaster Record into separate
  database schemas or modules (this extraction makes that decision possible later, it does not
  make it now); any change to Hazardous Events; any change to the `*Calc` column names, types, or
  the shape of data returned to callers.
