## Why

`IHazardousEventRepository`'s three spatial-observation methods
(`findCurrentSpatialObservation`, `findSpatialObservationByTime`, `saveSpatialObservation`) on
`DrizzleHazardousEventRepository.server.ts` are still Phase 3e/5e stubs that throw `"not
implemented yet (5e)"` — `RecordSpatialObservationUseCase` (`4g`) is fully built and tested
against a fake, but cannot run against real data. `IDivisionRepository.findValidDivisionIds` — the
port that use case also depends on — has no adapter at all (`DEF-005`, "Phase 5e — not yet
proposed"). `IHazardousEventRepository.ts`'s `SpatialObservationRecord` is also still a
hand-maintained interface that merely happens to match `SpatialObservation`'s own
`SpatialObservationProps` field-for-field (`DEF-027`) — a future field added to one and not the
other would only be caught by `tsc`, never a test. The roadmap's `5e` entry
(`_docs/refactoring-plan/hazardous-events-refactoring-roadmap.md`, corrected 2026-10-22 with a
human readiness check) is the authoritative, user-approved scope for closing all three: implement
the three adapter methods for real, add the missing `DrizzleDivisionRepository`, and resolve
`DEF-027` by making `SpatialObservationRecord` a type alias of `SpatialObservationProps`.

The readiness check settled two decisions, which this proposal implements as given, not
re-litigates:

1. **`SpatialObservationRecord` becomes `export type SpatialObservationRecord =
SpatialObservationProps`** — not a port retype to `SpatialObservation` directly. Retyping the
   port would force this adapter to call `SpatialObservation.create()` itself, relocating
   `RecordSpatialObservationUseCase`'s existing hydrate-from-trusted-persistence pattern
   (`SpatialObservation.create(existingRecord, new Set(existingRecord.divisionIds))`,
   `RecordSpatialObservation.ts` ~line 123) from the use-case layer into the adapter layer — not
   an improvement.
2. **`DrizzleDivisionRepository` is a new, plain adapter** querying the shared `divisionTable`
   directly, tenant-scoped via its own `countryAccountsId` column — legacy precedent for the query
   shape is `app/db/queries/hazardousEventDivisionRepository.ts`'s
   `getDivisionNamesByHazardousEventIds`, not copied verbatim.

This proposal also corrects two assumptions in the roadmap's own "Files touched" list, found during
this change's own Phase 0 code verification (not re-litigating the roadmap's two already-decided
points above):

1. **The adapter file is `DrizzleDivisionRepository.server.ts`, not `DrizzleDivisionRepository.ts`.**
   Every sibling adapter in `app/domains/hazardous-events/infrastructure/` (`DrizzleCausalChainRepository.server.ts`,
   `DrizzleHazardTaxonomyRepository.server.ts`, `DrizzleHazardousEventRepository.server.ts`) uses
   the `.server.ts` suffix (project convention, `.github/copilot-instructions.md`); the roadmap's
   text dropped it.
2. **Neither test file lives under `tests/integration/domains/hazardous-events/`.** The real,
   already-existing `DrizzleHazardousEventRepository.test.ts` lives at
   `tests/integration/db/queries/DrizzleHazardousEventRepository.test.ts` (`import "../setup"`) —
   confirmed by repo search, and the same location the `ca-persistence-unit-of-work` change (merged
   2026-10-22, immediately prior on this same file) already used for this exact file. The new
   `DrizzleDivisionRepository.test.ts` follows the same convention, matching
   `DrizzleHazardTaxonomyRepository.test.ts`'s placement for a comparable small, focused
   tenant-membership adapter. `tests/integration/domains/hazardous-events/` is reserved for
   use-case-level tests (`CreateHazardousEventUseCase.test.ts` and siblings) in this codebase today,
   not adapter-level ones.

## What Changes

- Implement `DrizzleHazardousEventRepository.server.ts`'s three spatial-observation methods for
  real, against `hazardous_event_spatial_observation` and its `_geom`/`_division` child tables
  (Phase 2 schema, unchanged by this proposal):
  - `findCurrentSpatialObservation(hazardousEventId, tenantId)` and
    `findSpatialObservationByTime(hazardousEventId, observationTime, tenantId, tx?)` both join to
    `hazardous_event` to scope by `country_accounts_id = tenantId` (the child tables carry no
    tenant column of their own) and resolve `null` — not throw — when the hazardous event itself
    doesn't belong to `tenantId`.
  - `saveSpatialObservation(hazardousEventId, observation, tenantId, tx?)` verifies
    `hazardousEventId` belongs to `tenantId` (throws `NotFoundError` if not — DEF-005's "verify
    before writing any spatial row" requirement, already in the merged port spec) and that
    `observation.hazardousEventId` matches the `hazardousEventId` parameter (throws
    `ValidationError` on mismatch), then upserts the parent row by `id` (`ON CONFLICT (id) DO
    UPDATE ... WHERE hazardous_event_id = $hazardousEventId`, mirroring
    `DrizzleNoticeRepository.server.ts`'s own upsert pattern), replacing the geom/division child
    collections wholesale (delete-then-reinsert, mirroring `DrizzleHazardousEventRepository.server.ts`'s
    own `update()` pattern). Each `geometries` element is a raw GeoJSON geometry object (matching
    every existing fixture in this codebase — `RecordSpatialObservation.test.ts`,
    `SpatialObservation.test.ts`, `SpatialObservationDto.test.ts` all already use bare `{ type:
    "Point", coordinates: [...] }` — not a `{ geometry, title }` wrapper), persisted via
    `ST_GeomFromGeoJSON`/read back via `ST_AsGeoJSON` (legacy precedent: `app/backend.server/models/event.ts`'s
    own `ST_AsGeoJSON(hazardousEventGeomTable.geom)` usage).
  - **New, DB-layer defense-in-depth** (closes the gap `0d` finding #1 left, per the roadmap's own
    "must not repeat that gap" instruction): `saveSpatialObservation` independently re-verifies
    every `divisionId` against `division.country_accounts_id = tenantId` inside its own write
    transaction, rejecting with `ValidationError` if any fails — this is a second, DB-layer check,
    not a replacement for `SpatialObservation.create()`'s own domain-layer membership check or for
    `DrizzleDivisionRepository`'s own read-path check.
  - **Concurrent-write contract resolved** (closes the "deferred to Phase 3d" language in the
    currently-merged `hazardous-event-repository-port` spec, now that `3d` and this adapter both
    exist): two callers racing to insert distinct new observations for the same
    `hazardousEventId`/`observationTime` are serialized by the real
    `UNIQUE(hazardous_event_id, observation_time)` constraint; the losing caller's `23505` is
    mapped to the same `ConflictError` shape `SpatialObservation.assertNoConflictingObservationTime`
    throws for a synchronously-detected duplicate (the exact contract `hazardous-event-spatial-observation`'s
    own "Concurrent callers" requirement specifies for this adapter to satisfy).
- **New**: `DrizzleDivisionRepository.server.ts` fulfilling `IDivisionRepository.findValidDivisionIds`
  — closes `DEF-005`'s "no adapter exists yet" clause. Plain tenant-membership lookup against
  `divisionTable`, matching `DrizzleHazardTaxonomyRepository.server.ts`'s own `resolveValidIds`
  shape (empty-`ids` short-circuit, no query for `ids.length === 0`).
- **`IDivisionRepository.findValidDivisionIds` gains an optional trailing `tx?: Tx`** (found during
  Phase 0, folded into this change's scope by user decision — see "Found during Phase 0" below),
  matching the convention `ca-persistence-unit-of-work` already established for every other port's
  methods (e.g. `ICausalChainRepository.countEdgesTouching(nodeId, tx?)`). `DrizzleDivisionRepository`
  threads it as the resolved executor (`tx ?? this.db`), same pattern as every other adapter touched
  by that change. `RecordSpatialObservationUseCase.execute()`'s one existing call to
  `findValidDivisionIds` gains `command.tx` as a third argument — the only change to that file; its
  own call order, logic, and error propagation are untouched.
- **Resolves `DEF-027`**: `IHazardousEventRepository.ts`'s `SpatialObservationRecord` becomes
  `export type SpatialObservationRecord = SpatialObservationProps`, importing the type from
  `SpatialObservation.ts`, instead of an independently-declared, hand-maintained interface.
- Closes `_docs/refactoring-plan/deferred-items-register.md`'s `DEF-027` row (deleted, per this
  register's own "delete the row" convention — not annotated "RESOLVED" in place). `DEF-005`'s row
  is **narrowed, not deleted** (confirmed user decision): its "no adapter yet" clause is closed by
  this change, but its legacy `syncHazardousEventSpatialFootprint` clause is not — per the standing
  principle that legacy code is replaced at cutover, never patched, that row stays open until a
  future change actually retires the legacy route. See tasks.md Task 7.3 for the exact replacement
  text.

### Found during Phase 0, now folded into scope by user decision: `IDivisionRepository.findValidDivisionIds` gains `tx`

`IDivisionRepository.findValidDivisionIds(ids, tenantId)` had no `tx` parameter.
`RecordSpatialObservationUseCase.execute()` calls it without one, always reading via
`DrizzleDivisionRepository`'s own `this.db` connection regardless of whether the use case itself
received a `tx`. Once `UpdateHazardousEventUseCase` calls `RecordSpatialObservationUseCase.execute()`
from inside its own open `transactionRunner.run()` (already shipped, `ca-persistence-unit-of-work`),
this `this.db` read would happen while that outer transaction is still open — the same shape of bug
`ca-persistence-unit-of-work`'s own design.md Decision 9 found and fixed for
`findById`/`findSpatialObservationByTime`, empirically confirmed there to hang indefinitely against
PGlite (not fail cleanly) rather than silently misread.

This was initially raised in this proposal as an out-of-scope risk, since fixing it means touching
`RecordSpatialObservationUseCase.ts` — named in this task's own scope as "already fully built, do
not change its logic, only the adapter/port layer beneath it." The user reviewed this and decided
to fix it now, in this same change, rather than leave it as a dormant risk for `5g` to rediscover:
the fix is a one-line, non-logic-changing call-site addition (`RecordSpatialObservation.ts` passes
`command.tx` as a third argument to a call it already makes, in the same position/order — nothing
else in that file changes), mirroring a pattern `ca-persistence-unit-of-work` already proved safe
for every sibling port in this codebase. See design.md Decision 8 (now resolved, not an open risk)
and the `division-repository-port`/`record-spatial-observation` capabilities below.

## Capabilities

### Modified Capabilities

- `hazardous-event-repository-port`: `findCurrentSpatialObservation`'s and
  `findSpatialObservationByTime`'s tenant-scoping behavior becomes concrete (join to
  `hazardous_event`, resolve `null` for a foreign-tenant id); `saveSpatialObservation` gains a
  concrete ownership check, hazardousEventId-match check, division-tenant re-check, and upsert
  behavior; the previously-deferred "Concurrent saveSpatialObservation calls" requirement's
  contract is resolved concretely; **new** requirement that `SpatialObservationRecord` is a type
  alias of `SpatialObservationProps`, not an independent interface (closes `DEF-027`).
- `division-repository-port`: `findValidDivisionIds` gains an optional trailing `tx?: Tx` parameter,
  with its own tx-threading and no-tx-unchanged scenarios (found during Phase 0, folded in by user
  decision — see "Found during Phase 0" above).
- `record-spatial-observation`: the existing tx-threading requirement (added by
  `ca-persistence-unit-of-work`) is widened to also cover the `IDivisionRepository.findValidDivisionIds`
  call — previously the only repository call this use case makes that was not yet participating in
  `command.tx` when present.

## Impact

**Files touched:**

- `app/domains/hazardous-events/infrastructure/DrizzleHazardousEventRepository.server.ts` —
  implement the three spatial-observation methods (currently throwing stubs).
- `tests/integration/db/queries/DrizzleHazardousEventRepository.test.ts` (existing file,
  `import "../setup"`) — add PGlite integration scenarios for all three methods, including the
  mandatory concurrent-callers scenario.
- `app/domains/hazardous-events/infrastructure/DrizzleDivisionRepository.server.ts` (**new**) —
  fulfills `IDivisionRepository`, closes `DEF-005`'s "no adapter exists yet" clause (not its live
  legacy-route clause — see "Found during Phase 0" and tasks.md Task 7.3); threads `tx` as the
  resolved executor.
- `tests/integration/db/queries/DrizzleDivisionRepository.test.ts` (**new**, `import "../setup"`)
  — PGlite integration tests for the real adapter, mirroring the existing fake-conformance
  scenarios in `IDivisionRepository.test.ts` against real tenant-scoped rows, plus a tx-threading
  scenario.
- `app/domains/hazardous-events/application/ports/IDivisionRepository.ts` — add an optional
  trailing `tx?: Tx` to `findValidDivisionIds`.
- `app/domains/hazardous-events/application/ports/IDivisionRepository.test.ts` — widen the existing
  `AssertEqual` arity assertion to include `Tx?`.
- `app/domains/hazardous-events/application/use-cases/RecordSpatialObservation.ts` — one-line
  change: pass `command.tx` as a third argument to its existing `this.divisionRepository.findValidDivisionIds(...)`
  call. No other change to this file's logic, call order, or error propagation.
- `app/domains/hazardous-events/application/use-cases/RecordSpatialObservation.test.ts` — widen
  `FakeDivisionRepository`/`DivisionLookupCall` to capture `tx`; add tx-threading and
  tx-absent-unchanged scenarios for the `findValidDivisionIds` call, alongside the existing ones for
  `findById`/`findSpatialObservationByTime`/`saveSpatialObservation`.
- `app/domains/hazardous-events/application/ports/IHazardousEventRepository.ts` — `SpatialObservationRecord`
  becomes `export type SpatialObservationRecord = SpatialObservationProps`, imported from
  `../../domain/SpatialObservation`; doc comments referencing the old "provisional shape" language
  updated (closes `DEF-027`).
- `app/domains/hazardous-events/domain/SpatialObservation.ts` — update the file's own header
  comment, which currently says it "supersedes" the port's provisional shape — now true by
  construction (type alias), not aspirational; no behavioral change.
- `_docs/refactoring-plan/deferred-items-register.md` — delete the `DEF-027` row; narrow `DEF-005`'s
  row (confirmed: narrow, not delete) — see tasks.md Task 7.3 for the exact replacement
  Detail/Trigger text.

**DB migration required:** No. `hazardous_event_spatial_observation` and its `_geom`/`_division`
child tables, and `division`, all already exist (Phase 2 schema) with no column changes.

**Test approach:** PGlite integration tests (`yarn test:run2`) for both new/modified adapter files
— real Postgres-compatible behavior (the `unique(hazardous_event_id, observation_time)` constraint,
PostGIS geometry round-trips via the `postgis` PGlite extension already wired into
`tests/integration/db/setup.ts`) is exactly what needs proving, not a fake. The
`SpatialObservationRecord` type-alias change is verified by source inspection (a `grep` confirming
a `type` alias declaration, not a compile-time assertion — the two shapes are already structurally
identical today, so no compile-time check can distinguish "alias" from "coincidentally-matching
interface"; design.md Decision 1/tasks.md Task 1.1-1.2), not a new DB-backed test. The
`IDivisionRepository.findValidDivisionIds`/`RecordSpatialObservationUseCase` tx-widening is covered
by unit-level tests with no DB: `IDivisionRepository.test.ts`'s widened `AssertEqual` arity
assertion, and `RecordSpatialObservation.test.ts`'s two new tx-threading scenarios (alongside its
existing fakes-based ones for `findById`/`findSpatialObservationByTime`/`saveSpatialObservation`).

**Security / multi-tenancy implications:** This change is the first real enforcement point for
`DEF-005`'s "no tenant check on spatial-footprint division linking" gap, at two independent layers:
`DrizzleDivisionRepository`'s own read-path membership query, and `saveSpatialObservation`'s own
DB-layer re-check at write time (the `0d` finding #1 gap explicitly named in this task's own scope).
`findCurrentSpatialObservation`/`findSpatialObservationByTime` both scope by `tenantId` via a join
to `hazardous_event`, since the spatial tables carry no tenant column of their own. **Residual
gap, unchanged by this change:** this enforcement covers only the new Clean Architecture path
(`RecordSpatialObservationUseCase` → `DrizzleHazardousEventRepository`/`DrizzleDivisionRepository`).
The legacy `syncHazardousEventSpatialFootprint` function, reachable from live legacy routes, still
has no `countryAccountsId` filter on its own division check — this change does not touch it, by
design: the standing principle for this refactor is that legacy code is replaced at cutover, never
patched directly. See tasks.md Task 7.3 for `DEF-005`'s narrowed register text, which keeps this
gap tracked until a future change retires the legacy route.
