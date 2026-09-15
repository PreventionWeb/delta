## Why

Track B's `2i` change added a real `specificHazardId` column (and `specificHazardTable` relation)
to `app/drizzle/schema/hazardousEventTable.ts`. That column name is a verbatim, textual collision
with a pre-existing, unrelated local variable also named `specificHazardId` in
`app/backend.server/utils/hazardFilters.ts` — a legacy variable that actually maps to the *old*
HIP hierarchy's most granular tier (`hazardousEventTable.hipHazardId`), not the new column. This
proposal fixes that naming-collision risk.

This proposal originally also planned a second fix — a copy-paste bug in
`app/backend.server/models/analytics/effectDetails.ts` mapping `specificHazardId` to the wrong
column (`hipTypeId` instead of `hipHazardId`). **That fix is descoped.** Implementation
investigation found `getEffectDetails` cannot be called at all today, by anyone, regardless of
input — a separate, unrelated, pre-existing bug (three dangling `(table as any).spatialFootprint`
selections left over from an incomplete column removal) makes Drizzle's query builder throw
before any DB round-trip. `geographicImpact.ts`'s `getDisasterRecordsForDivision` has the
identical dead pattern and is equally unreachable. Patching either the `hipTypeId`/`hipHazardId`
mapping or the dead `spatialFootprint` references would be wasted effort: both files query against
the legacy HIP hierarchy (`hip_type`/`hip_cluster`/`hip_hazard`) and are due a full rewrite against
the new `hazard_type`/`hazard_cluster`/`specific_hazard` schema regardless, once analytics is
picked up (Phase 6 or Phase 7 cleanup — exact phase not yet decided). Confirmed with the user:
don't patch code that's getting rebuilt anyway, and don't spend effort fixing a bug that's
evidently been silently broken for a while with no report. Recorded as a new action item in
`hazardous-events-phase0-audit-findings.md` instead of fixed here.

## What Changes

- **`app/backend.server/utils/hazardFilters.ts`** — rename the internal local variable
  `specificHazardId` (declared line 29, used at lines 35, 61, 80-84, 93-146) to
  `hipHazardIdFilter`. Pure internal rename, zero behavior change. The external contract
  (`filters.specificHazardId`, the object property the function receives its input through) is
  untouched — only what that value is assigned *to* changes name. All seven log payloads that use
  object-shorthand (`{ specificHazardId }`) must keep emitting the key `specificHazardId` (i.e.
  become `{ specificHazardId: hipHazardIdFilter }`) so logged output is byte-for-byte identical
  before and after.
- New PGlite integration test file `tests/integration/db/models/hazardFilterAnalytics.test.ts`
  covering this rename only.

No other files are touched. `app/backend.server/models/analytics/effectDetails.ts` and
`app/backend.server/models/analytics/geographicImpact.ts` are **not modified** — both remain
broken exactly as found, tracked as a new action item for a later phase, not patched here.
`mostDamagingEvents.ts` and `geographicImpact.ts` both call the already-correct
`applyHazardFilters` helper for the parts of them that do work; unaffected by this rename. The
UI-facing query parameter `?specificHazardId=` and all `FilterParams`/`GeographicImpactFilters`/
`MostDamagingEventsParams` object shapes are not renamed.

No DB migration is required — this is a logic-only rename with no schema involvement.

Test approach: PGlite integration test, following this project's TDD discipline. This is a
characterization test that must pass identically before and after the rename (proves zero
behavior change) — there is no bug to reproduce, so no Red phase applies.

No security or multi-tenancy implications: the rename touches no tenant-scoping logic.

## Capabilities

### New Capabilities

- `hazard-filter-correctness`: covers the internal-naming-safety guarantee for
  `applyHazardFilters` in `hazardFilters.ts` — the rename must not change behavior or logged
  output.

### Modified Capabilities

_(none — no existing spec files exist in `openspec/specs/` for this function)_

## Impact

- **`app/backend.server/utils/hazardFilters.ts`** — internal rename only, zero behavior change
- **Callers unaffected**: `mostDamagingEvents.ts`, `geographicImpact.ts` (both call
  `applyHazardFilters`, unaffected by an internal rename), `sectors.tsx`/`hazards.tsx` routes
  (pass `specificHazardId` straight through by name, no shape change)
- **Security / multi-tenancy**: no changes
- **Tests**: new PGlite integration test under `tests/integration/db/models/`, reusing the
  `hazardousEventDisasterEventBoundary.test.ts` / `hazardousEventTestHelpers.ts` seeding precedent
- **PR target**: `feature/he-ca-phase2` (not `dev`)
- **Descoped, tracked separately**: the `effectDetails.ts` `hipTypeId`/`hipHazardId` bug and the
  dead `spatialFootprint` references in `effectDetails.ts`/`geographicImpact.ts` — see the new
  action item in `hazardous-events-phase0-audit-findings.md`.
