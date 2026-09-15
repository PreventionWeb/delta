## Context

`2i` (already merged) added a real column to `app/drizzle/schema/hazardousEventTable.ts`:

```ts
specificHazardId: uuid("specific_hazard_id").references(
  () => specificHazardTable.id,
),
```

with its own relation (`specificHazard: one(specificHazardTable, ...)`, lines 97-100). This is a
new, type-compatible, real schema column named identically to a pre-existing local variable in
`app/backend.server/utils/hazardFilters.ts`:

```ts
// hazardFilters.ts, line 29-32
const specificHazardId =
  filters.specificHazardId != null
    ? String(filters.specificHazardId).trim()
    : null;
```

This local variable is used (lines 35, 61, 80-84, 93-146) to filter and validate against
`hazardousEventTable.hipHazardId` — the old HIP hierarchy's most granular tier — via
`hipHazardTable`/`hipClusterTable`/`hipTypeTable`. It has nothing to do with the new
`hazardousEventTable.specificHazardId` column. The two are unrelated concepts that now share one
name, sitting textually a few lines from `hazardousEventTable.hipHazardId` — an invitation for a
future "these don't match, let me fix it" mistake.

## Goals / Non-Goals

**Goals:**

- `hazardFilters.ts`: eliminate the naming collision risk by renaming the internal local variable
  to `hipHazardIdFilter`, with provably zero behavior change (same SQL conditions, same logged
  output).

**Non-Goals:**

- No change to `filters.specificHazardId` (the external-facing object property / URL query
  parameter). It is stable, UI-facing, and used identically by two routes and two other model
  files (`mostDamagingEvents.ts`, `geographicImpact.ts`) — renaming it would ripple into
  routes/forms/bookmarked URLs for zero benefit.
- No change to `mostDamagingEvents.ts` or `geographicImpact.ts`.
- No change to `hazardousEventTable.specificHazardId` (the `2i` schema column) or
  `specificHazardTable` — this proposal does not touch schema at all.
- No DB migration.
- No change to `FilterParams`, `GeographicImpactFilters`, or `MostDamagingEventsParams` type
  shapes.
- **`effectDetails.ts`'s `hipTypeId`/`hipHazardId` bug is explicitly out of scope for this
  proposal** — see "Descoped: the `effectDetails.ts` fix" below.

## Decisions

### Rename the internal local variable only

**Decision**: Rename `const specificHazardId` (line 29) to `const hipHazardIdFilter`, and update
every reference to the renamed variable. `hipHazardIdFilter` was chosen over alternatives (e.g.
`legacySpecificHazardId`, `hipHazardLocalId`) because it names both what it is (a filter value)
and which column it maps to (`hipHazardId`), making the mapping self-evident at the call site
(`eq(hazardousEventTable.hipHazardId, hipHazardIdFilter)`) without requiring a comment.

**Sites requiring an update (all in `app/backend.server/utils/hazardFilters.ts`):**

| Line(s) | Current | After rename |
|---|---|---|
| 29-32 | `const specificHazardId = ...` | `const hipHazardIdFilter = ...` |
| 35 | `hazardTypeId \|\| hazardClusterId \|\| specificHazardId` | `... \|\| hipHazardIdFilter` |
| 61 | `specificHazardId: !!specificHazardId,` (inside `filtersToApply`) | `specificHazardId: !!hipHazardIdFilter,` — **key stays**, only the referenced variable changes |
| 80 | `if (specificHazardId) {` | `if (hipHazardIdFilter) {` |
| 81 | `eq(hazardousEventTable.hipHazardId, specificHazardId)` | `eq(hazardousEventTable.hipHazardId, hipHazardIdFilter)` |
| 83 | `logger.debug("Applied specific hazard filter", { specificHazardId });` (shorthand) | `{ specificHazardId: hipHazardIdFilter }` — **emitted key stays `specificHazardId`** |
| 93 | `if (specificHazardId) {` | `if (hipHazardIdFilter) {` |
| 94 | `logger.debug("Starting specific hazard validation", { specificHazardId });` (shorthand) | `{ specificHazardId: hipHazardIdFilter }` |
| 108 | `.where(eq(hipHazardTable.id, specificHazardId))` | `.where(eq(hipHazardTable.id, hipHazardIdFilter))` |
| 121 | `specificHazardId,` inside `logger.warn("Hazard cluster mismatch detected", {...})` payload (shorthand) | `specificHazardId: hipHazardIdFilter,` |
| 130 | `specificHazardId,` inside `logger.warn("Hazard type mismatch detected", {...})` payload (shorthand) | `specificHazardId: hipHazardIdFilter,` |
| 138 | `specificHazardId,` inside `logger.info("Specific hazard validation completed", {...})` payload (shorthand) | `specificHazardId: hipHazardIdFilter,` |
| 145 | `specificHazardId,` inside `logger.warn("Specific hazard not found in hierarchy", {...})` payload (shorthand) | `specificHazardId: hipHazardIdFilter,` |
| 192 | `specificHazardId,` inside the `catch` block's `logger.error(...)` payload (shorthand) | `specificHazardId: hipHazardIdFilter,` |

This is the exhaustive list — seven of these (lines 83, 94, 121, 130, 138, 145, 192) are
object-shorthand log payloads (`{ specificHazardId }` or bare `specificHazardId,` inside a larger
payload literal), which is the trap: a naive rename of the shorthand form would silently change
the **emitted log key** from `specificHazardId` to `hipHazardIdFilter`, which is an observable
behavior change and would violate "same validation logging" (see Test Infrastructure below). Each
shorthand site must become `{ specificHazardId: hipHazardIdFilter }` — key unchanged, value now
reads from the renamed variable.

**No change needed**: `filters.specificHazardId` at the destructuring/derivation site (line
29-32, the right-hand side) stays exactly as-is — only the identifier it's assigned to changes.

**Alternative considered**: leave the variable name alone and rely on a comment warning future
readers not to confuse it with the new column. Rejected — a comment is not durable protection
against a rename temptation once `hazardousEventTable.specificHazardId` is a real, type-compatible
column sitting one property away; renaming removes the hazard rather than documenting around it.

## Descoped: the `effectDetails.ts` fix

This proposal originally also planned fixing a copy-paste bug in
`app/backend.server/models/analytics/effectDetails.ts` (line 198 filtering
`hazardousEventTable.hipTypeId` instead of `hipHazardId` when `specificHazardId` is supplied).
Implementation investigation found this fix cannot be verified: `getEffectDetails` cannot be
called at all today, by anyone, regardless of input. Root cause, confirmed via `git log`: commit
`59f4558e` removed the `spatial_footprint` column from `damages`/`losses`/`disruption`/
`disasterRecords` tables (migration `20260730071321_remove_spatial_footprint_columns.sql`), but
left three `SELECT`-clause references in `effectDetails.ts` (lines 298/353/392) patched only as
`(table as any).spatialFootprint` — silencing the type error while leaving the selected value
`undefined`, which Drizzle's query builder rejects at build time, before any DB round-trip.
`geographicImpact.ts`'s `getDisasterRecordsForDivision` (lines 811/835) has the identical dead
pattern and is equally unreachable — this matters because that was this proposal's own cited
"already correct" reference implementation for the `specificHazardId` -> `hipHazardId` mapping;
that reference is itself broken. `mostDamagingEvents.ts` does not have this pattern.

**Decision: do not patch either bug.** Confirmed with the user: both `effectDetails.ts` and
`geographicImpact.ts` query against the legacy HIP hierarchy and are due a full rewrite against
the new `hazard_type`/`hazard_cluster`/`specific_hazard` schema once analytics is picked up in
this refactor (Phase 6 or Phase 7 cleanup — not yet decided which). Patching the dead
`spatialFootprint` references or the `hipTypeId`/`hipHazardId` mapping now would be fixing code
that gets thrown away regardless — the same "wasted effort" reasoning already applied to action
items 1/4/5/6/7 in `hazardous-events-phase0-audit-findings.md`. Unlike those items, this bug also
appears to have been silently broken for a while with zero report, reinforcing that it's not an
urgent gap to patch versus rebuild correctly. Recorded as a new action item in that same findings
doc rather than fixed here.

A related correction, not yet verified (the function can't run to confirm it): working through
the actual ID values involved, the original characterization plan's Red/Green assignment for the
`effectDetails.ts` bug may have been backwards — `hipTypeId` and `specificHazardId` are different
ID namespaces that could never accidentally match, so the "sibling hazard excluded" assertion
likely passes vacuously pre-fix (nothing matches, not because of correct filtering), while
"matching hazard included" is the one that's actually broken today. Left unresolved since the fix
itself is descoped; flagged in the new action item so whoever picks this up later isn't misled by
the original (wrong) characterization.

## Test Infrastructure

No existing test file references `hazardFilters.ts` (confirmed via repo-wide search — zero
matches).

**Precedent to reuse**: `tests/integration/db/models/hazardousEventDisasterEventBoundary.test.ts`
+ `tests/integration/db/models/hazardousEventTestHelpers.ts`. The helpers file already provides:

- `seedCountryAccount()` — creates a country + country account, returns `countryAccountsId`
- `seedHipChain()` — creates a fresh `hipType` -> `hipCluster` -> `hipHazard` chain and returns
  `{ hipTypeId, hipClusterId, hipHazardId }`

### Behavior-preservation characterization test

`applyHazardFilters` takes raw table references and a Drizzle query builder as parameters, so it
can be called directly in a test without going through `mostDamagingEvents.ts` or
`geographicImpact.ts`. Seed via `seedCountryAccount()` + `seedHipChain()` to get a real
`hipHazardId`/`hipClusterId`/`hipTypeId` triple that the hierarchical-validation sub-query
(lines 96-109) can find. Call `applyHazardFilters` with `filters.specificHazardId` set to that
seeded `hipHazardId`, and:

- Capture the resulting `baseConditions` array (or its rendered SQL, e.g. via each condition's
  `.getSQL().toQuery()` / `queryChunks`) and assert it is identical before and after the rename.
- Mock `createLogger` (from `~/utils/logger.server`) to capture every `logger.debug` /
  `logger.info` / `logger.warn` call's message and payload, and assert the captured payloads
  (specifically every site listed in the Decisions table above) are identical before and after
  the rename — this is what actually catches the shorthand trap if the implementer gets it wrong.

This test is expected to be **Green immediately** (there is no bug in current behavior to
reproduce — this is a pure internal rename). Write it, confirm Green against the current code,
perform the rename, confirm it is still Green. This satisfies "TDD discipline" as a
characterization test bracketing a refactor, not a Red -> Green bug fix.

### Test file organization

One new file: `tests/integration/db/models/hazardFilterAnalytics.test.ts`, one `describe` block
for the rename.

## Concurrency

Not applicable — `applyHazardFilters` allocates no shared mutable state; `baseConditions` is a
fresh, function-local array per call.

## Presentation-layer impact

Not applicable. This fix touches no `app/domains/*/presentation/` code and no route's rendered
output. Gate 9 (visual/UX parity) is marked N/A in `tasks.md` for this reason.

## Migration Plan

No deployment steps or rollback strategy needed — this is a logic-only rename with no schema
changes, no migrations, and no API contract changes. `yarn dbsync` is not applicable to this
change.
