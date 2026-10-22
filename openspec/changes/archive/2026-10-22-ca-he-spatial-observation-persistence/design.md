## Context

See proposal.md - Why. This covers only what shapes the three adapter methods, the new
`DrizzleDivisionRepository`, and the `SpatialObservationRecord` type-alias change.

Ground truth read in full before writing this document:

- `app/domains/hazardous-events/domain/SpatialObservation.ts` — `SpatialObservationProps` (`id`,
  `hazardousEventId`, `observationTime`, `note`, `geometries: readonly unknown[]`,
  `divisionIds: readonly string[]`, `createdAt`, `updatedAt`) is already field-identical to
  `SpatialObservationRecord`. `SpatialObservation.create()` validates shape and tenant-scoped
  division membership; `selectCurrent()` picks latest-by-`observationTime`, order-independent;
  `assertNoConflictingObservationTime()` throws `ConflictError` for a same-time duplicate unless
  `confirmReplace`.
- `app/domains/hazardous-events/application/use-cases/RecordSpatialObservation.ts` — the only
  current caller of all three adapter methods and of `IDivisionRepository`. Calls, in order:
  `findById` (existence+tenant check, throws `NotFoundError`), `divisionRepository.findValidDivisionIds`
  (no `tx`), `findSpatialObservationByTime` (the duplicate check), `SpatialObservation.create()`
  twice (existing-record hydration, then the new observation), `assertNoConflictingObservationTime`,
  `saveSpatialObservation`. On a replace (`confirmReplace: true`), the new observation reuses the
  existing record's `id` and `createdAt` — a *new* observation always gets a fresh
  `crypto.randomUUID()`. This file's own logic, call order, and error contracts are out of scope —
  the one exception is Decision 8's single-line `command.tx` addition to its existing
  `findValidDivisionIds` call, which changes nothing else about how this file behaves.
- `app/domains/hazardous-events/infrastructure/hazardousEventSpatialObservationTable.ts` — parent
  table, PK `id` (`ourRandomUUID()` — `uuid("id").primaryKey().default(gen_random_uuid())`), FK
  `hazardousEventId` (cascade), `unique(hazardous_event_id, observation_time)`
  (`hazardous_event_spatial_observation_event_id_time_unique`) — "DB-level defense-in-depth; the
  domain-layer conflict check (3d/5e) is authoritative" per the table's own comment.
- `app/domains/hazardous-events/infrastructure/hazardousEventSpatialObservationGeomTable.ts` — own
  PK `id`, FK `hazardousEventSpatialObservationId` (cascade), `geom` (`customType<{data:
  unknown}>` → `geometry(Geometry,4326)`, `.$type<unknown>()` — no PostGIS TS library), nullable
  `title`.
- `app/domains/hazardous-events/infrastructure/hazardousEventSpatialObservationDivisionTable.ts` —
  own PK `id`, FK `hazardousEventSpatialObservationId` (cascade), FK `divisionId` (no cascade —
  division is stable reference data), `unique(hazardous_event_spatial_observation_id,
  division_id)` (`hazardous_event_spatial_observation_division_obs_div_unique`).
- `app/drizzle/schema/divisionTable.ts` — `countryAccountsId` is nullable (`.references(() =>
  countryAccountsTable.id)`, no `.notNull()`); `division-repository-port`'s own merged spec already
  requires a `null`-tenant row to be valid for no tenant.
- `app/domains/hazardous-events/application/ports/IHazardousEventRepository.ts` — current
  `SpatialObservationRecord` interface (provisional, pre-`DEF-027`); the three spatial method
  signatures, already widened with `tx?`/`tx` by `ca-persistence-unit-of-work` (merged
  2026-10-22, immediately prior on this same file). `findCurrentSpatialObservation` takes no
  `tx` (arity `[string, string]`, confirmed via `IHazardousEventRepository.test.ts`'s own
  `AssertEqual` check) — not touched by that change, not touched by this one either.
- `app/domains/hazardous-events/infrastructure/DrizzleHazardousEventRepository.server.ts` — the
  three spatial methods are stubs (`throw new Error("...not implemented yet (5e)")`). Its
  `insert()`/`update()`/`delete()` already follow `(tx ?? this.db).transaction(async (innerTx) =>
{...})` with every nested read also using the resolved executor, not a hard-coded `this.db` —
  the fix `ca-persistence-unit-of-work`'s design.md Decision 2 made, confirmed there to be load-
  bearing: a hard-coded `this.db` read inside a method reachable from an open `tx` hangs
  indefinitely against PGlite (not silently wrong — a real, observable failure mode), since PGlite
  serializes access to its single underlying connection. This design follows the identical
  resolved-executor discipline throughout, for the same reason.
- `app/domains/hazardous-events/infrastructure/DrizzleCausalChainRepository.server.ts` — the
  project's own precedent for a small, focused adapter: private error-mapping helper, `pgErrorCode`/
  `pgErrorConstraint` from `app/infrastructure/pgErrorCode.server.ts` (checks both the top-level
  error and its `.cause`, since `drizzle-orm` wraps driver errors in `DrizzleQueryError`).
- `app/domains/hazardous-events/infrastructure/DrizzleHazardTaxonomyRepository.server.ts` — the
  project's own precedent for a small, tenant-membership-only adapter: a single `resolveValidIds`
  helper, `ids.length === 0` short-circuits with no query, `and(eq(table.countryAccountsId,
  tenantId), inArray(table.id, [...ids]))`. `DrizzleDivisionRepository` follows this shape exactly.
- `app/domains/notices/infrastructure/DrizzleNoticeRepository.server.ts`'s `save()` — the project's
  own precedent for an upsert-by-id with cross-tenant protection:
  `.insert(...).onConflictDoUpdate({target: table.id, set: {...no createdAt...}, where:
eq(table.tenantColumn, tenantValue)})`; an empty `RETURNING` (the `WHERE` not satisfied — the id
  exists under different ownership) is surfaced as `ConflictError`; a raw `23505` on the insert
  path (not a conflict-target hit, e.g. a different unique constraint) is also `ConflictError`.
  `saveSpatialObservation` follows this shape, substituting `hazardousEventId` for Notices' own
  `tenantId` as the ownership column (the spatial tables carry no tenant column at all — ownership
  is transitive through `hazardousEventId`).
- `app/backend.server/models/event.ts` (~line 433) — legacy precedent for reading a PostGIS
  geometry column back as GeoJSON: `sql<string>\`ST_AsGeoJSON(${table.geom})\`` projected in the
  `select()`, then `JSON.parse(row.geom)` in application code. Legacy insert precedent (test file
  `tests/integration/db/queries/hazardousEventSpatialObservation.test.ts`): `sql\`ST_GeomFromGeoJSON(${JSON.stringify(geoJson)})\``.
- **Confirmed by grepping every existing fixture that constructs a `SpatialObservationProps`/
  `SpatialObservationRecord`'s `geometries` array** (`RecordSpatialObservation.test.ts`,
  `SpatialObservation.test.ts`, `SpatialObservationDto.test.ts`, `HazardousEventDetailDto.test.ts`,
  `GetHazardousEventById.test.ts`): every one uses a bare GeoJSON geometry object per element —
  `{ type: "Point", coordinates: [...] }` or `{ type: "Point" }` — never a `{ geometry, title }`
  wrapper. `tests/integration/db/models/hazardousEventAttachmentsHipSpatial.test.ts` has no
  `geometries` array at all (confirmed by grep — it is unrelated, legacy-hip-spatial-model
  territory) and is not part of this evidence.
  `tests/integration/db/queries/hazardousEventSpatialObservation.test.ts` is separately informative
  for the *child table's own* row shape (one `geom`/`title` row per geometry, via
  `ST_GeomFromGeoJSON`) — a different fact than the domain-level array-element shape, both used
  together in Decision 4.
- `tests/integration/db/setup.ts` — PGlite is built with the `postgis` extension
  (`@electric-sql/pglite-postgis`) and `CREATE EXTENSION IF NOT EXISTS postgis` already runs;
  `pushSchema` excludes PostGIS's own catalog tables from the diff. Confirms PGlite can exercise
  real geometry columns and the `unique(hazardous_event_id, observation_time)` constraint for
  this change's own tests — no `tests/integration-realdb/` counterpart is needed for the
  constraint-violation race (Decision 5).
- `openspec/specs/hazardous-event-repository-port/spec.md` (merged, 510 lines) — the three spatial
  methods' current requirements; the "Concurrent saveSpatialObservation calls" requirement
  explicitly defers its own losing-caller contract "to Phase 3d's `SpatialObservation` design,"
  which has since resolved it (`openspec/specs/hazardous-event-spatial-observation/spec.md`'s own
  "Concurrent callers" requirement, Decision 7 below).
- `openspec/specs/division-repository-port/spec.md` (merged, 42 lines) — every requirement is
  already phrased as "an implementation MUST...", with no Drizzle/adapter-specific language, so the
  real `DrizzleDivisionRepository` adapter itself needs no requirement-text change beyond what
  Decision 8's `tx?: Tx` widening already requires (proposal.md Capabilities; spec delta in
  specs/division-repository-port/spec.md).
- **Confirmed no existing test depends on this change's behavior**: `grep -rn "not implemented yet
(5e)|new RecordSpatialObservationUseCase(|saveSpatialObservation|findSpatialObservationByTime"
tests/` returns no matches at all. `UpdateHazardousEventUseCase.test.ts`'s own
  `recordSpatialObservationUseCase` dependency is always a plain `{ execute: vi.fn() }` fake in
  every existing scenario there (including the "delegated call rejects, rollback" scenario at
  design.md Decision 8 of `ca-persistence-unit-of-work`) — never a real `RecordSpatialObservationUseCase`
  wired to the real adapters this change implements. No existing test needs updating as a side
  effect of the three stubs starting to return real data.
- `openspec/changes/archive/2026-10-22-ca-persistence-unit-of-work/` — Decisions 2 and 9 there are
  the direct precedent for "never a hard-coded `this.db` inside a method reachable from an open
  `tx`," empirically proven against PGlite (hang, not silent misread). `tests/integration/db/queries/DrizzleHazardousEventRepository.test.ts`
  is the real, already-existing test file this change extends (not
  `tests/integration/domains/hazardous-events/`, which that change's own Task 3.1 confirmed via
  repo search is not where this file lives).

## Goals / Non-Goals

**Goals:**

- Implement the three spatial-observation adapter methods against the real Phase 2 schema,
  tenant-scoped at the DB layer (not just the domain layer), satisfying every requirement already
  in the merged `hazardous-event-repository-port` spec plus the concrete behavior this design adds.
- Close `DEF-005`'s "no adapter exists yet" clause with a real `DrizzleDivisionRepository` adapter.
  Its separate legacy-function clause stays open, narrowed not deleted (confirmed user decision,
  tasks.md Task 7.3) — the standing principle for this refactor is that legacy code is replaced at
  cutover, never patched directly.
- Close `DEF-027` by making `SpatialObservationRecord` a genuine type alias.
- Satisfy `hazardous-event-spatial-observation`'s own "Concurrent callers" requirement's contract
  (3d's hand-off to this change) for real, against a real DB constraint.
- Widen `IDivisionRepository.findValidDivisionIds` with an optional `tx?: Tx`, and thread
  `command.tx` through `RecordSpatialObservationUseCase`'s one call to it — found during this
  change's own Phase 0, folded into scope by user decision rather than left as a dormant risk for
  `5g` to rediscover (Decision 8, now resolved).

**Non-Goals:**

- No change to `RecordSpatialObservationUseCase`'s own logic, call order, or error-propagation
  contract, beyond the single, additive `command.tx` argument on its existing
  `findValidDivisionIds` call (Decision 8) — no other line in that file changes.
- No per-element GeoJSON structural validation beyond what `ST_GeomFromGeoJSON` itself enforces —
  `SpatialObservation.ts`'s own design.md (2026-09-22) already decided this is out of scope for the
  domain layer ("no PostGIS TS library to validate against"), and this change does not add one at
  the adapter layer either.
- No `HazardousEventsModule` wiring (`5g`'s job) — `DrizzleDivisionRepository` is constructed
  directly in tests, like every other adapter in this codebase before its own module exists.
- No resolution of the inherited "two concurrent `confirmReplace: true` replaces of the same
  observation" lost-update race — named and accepted by the 2026-10-01 change's own Risks section;
  this change does not add new exposure to it (Decision 7).

## Decisions

### Decision 1 (given, not re-litigated): `SpatialObservationRecord` becomes a type alias

`export type SpatialObservationRecord = SpatialObservationProps;` in
`IHazardousEventRepository.ts`, importing `SpatialObservationProps` from
`../../domain/SpatialObservation`. The port's own "No method accepts a raw Drizzle or
infrastructure type" requirement is unaffected — `SpatialObservationProps` is a plain, framework-
free interface, not a Drizzle row type. `SpatialObservation.ts`'s own header comment ("supersedes
... the port's provisional shape") and the port's "Minimal, provisional shape" doc comment are
both updated to reflect that this is now true by construction, not aspirational — a documentation
fix, no behavior change (Decision 9's housekeeping list).

### Decision 2 (given, not re-litigated): `DrizzleDivisionRepository.server.ts` is a new, independent adapter

Shaped exactly like `DrizzleHazardTaxonomyRepository.server.ts`'s own `resolveValidIds`: a single
`findValidDivisionIds(ids, tenantId, tx?)` method — `tx` folded in per Decision 8 — `ids.length ===
0` short-circuits with no query (same reasoning — some drivers reject a bare `IN ()`), otherwise
`(tx ?? this.db).select(...).from(divisionTable).where(and(eq(divisionTable.countryAccountsId,
tenantId), inArray(divisionTable.id, [...ids])))` — the resolved-executor pattern every other
adapter touched by `ca-persistence-unit-of-work` already uses. A `null` `countryAccountsId` row is
never matched
by `eq(..., tenantId)` for any real `tenantId` string, closing `division-repository-port`'s own
"null-tenant row is never valid for any tenant" requirement by construction, with no extra `IS NOT
NULL` guard needed. File name and location corrected from the roadmap's text (proposal.md).

**No concurrent-callers scenario for this adapter.** The spec-writer's own standing rule requires
one for shared mutable state accessed by async operations — `findValidDivisionIds` is a pure,
read-only `SELECT`, and the `division` table rows it reads are written by an entirely separate
feature (division import/management) outside this change's scope. Two concurrent reads of the same
rows return the same, independently-correct result; there is no cache, counter, or write path in
this adapter for two callers to race on (the same reasoning `CausalChain.ts`'s own design.md used
for its pure entity/static functions, and `hazardous-event-spatial-observation`'s own spec Note
uses for `SpatialObservation.ts` itself).

### Decision 3: `findCurrentSpatialObservation`/`findSpatialObservationByTime` scope tenancy via a join to `hazardous_event`, resolving `null` for a foreign-tenant id

Neither spatial table carries a `country_accounts_id` column (Context). Both read methods join
`hazardous_event_spatial_observation` to `hazardous_event` on `hazardous_event_id = hazardous_event.id`,
filtering `hazardous_event.country_accounts_id = tenantId`. A `hazardousEventId` that exists but
belongs to a different tenant produces zero joined rows — resolved as `null`, not an error, matching
both methods' existing "resolves null, never throws" contract (no reason to distinguish "no
observation yet" from "wrong tenant" for a read). `findCurrentSpatialObservation` orders by
`observation_time DESC LIMIT 1`; no tie-break logic is needed since the table's own
`unique(hazardous_event_id, observation_time)` constraint makes a tie for the same
`hazardousEventId` impossible. Both methods assemble the full record (parent fields, plus geom and
division child rows for that one observation id) via a shared private helper so geometry
read-back/parsing logic (Decision 4) is written once.

### Decision 4: each `geometries` element is a raw GeoJSON geometry object, not a `{ geometry, title }` wrapper

Grepping every existing fixture that constructs a `SpatialObservationProps`/`SpatialObservationRecord`'s
`geometries` array (Context) shows a single, consistent convention already in place: a bare GeoJSON
geometry object per element (`{ type: "Point", coordinates: [...] }`). This change's adapter writes
each element via `sql\`ST_GeomFromGeoJSON(${JSON.stringify(element)})\`` (matching
`hazardousEventSpatialObservationGeomTable`'s own geom row — one row per `geometries` array entry)
and reads each geom row back via `sql<string>\`ST_AsGeoJSON(${geomTable.geom})\``, `JSON.parse`'d —
the exact legacy precedent (`event.ts`). The geom table's own `title` column has no source field on
`SpatialObservationProps` (the domain entity has never carried a per-geometry title) and is left
`null` on every insert — not a regression, since nothing in this codebase has ever populated it for
a `SpatialObservation`. `geometries`/`divisionIds` array **order is not preserved** across a write-
then-read round trip (no ordering column on either child table, and a replace's delete-then-reinsert
assigns each row a fresh random `id` and the same `CURRENT_TIMESTAMP`) — tests compare resolved sets/
structural GeoJSON equality, never array-position equality (tasks.md).

A malformed geometry element (missing `type`, invalid `coordinates` shape) is not caught by any
existing domain-layer check (`SpatialObservation.create()`'s own design.md already scoped per-
element geometry validation out — Non-Goals). It reaches `ST_GeomFromGeoJSON` as-is.

**Empirically confirmed (Task 6.8, against PGlite):** `{ type: "Point" }` with no `coordinates`
raises Postgres code `XX000` (`internal_error`, PostGIS's own generic class — `routine:
"pg_error"`, `file: "lwgeom_pg.c"`), message `"Unable to find 'coordinates' in GeoJSON string"`.
`XX000` is too broad to add as a global branch in `mapSpatialWriteError` (it is Postgres's
catch-all internal-error class, not specific to malformed GeoJSON — mapping it unconditionally
risks masking an unrelated internal failure elsewhere in the same transaction). Instead, the geom
insert statement is wrapped in its own scoped `try/catch` that maps *any* error reaching that one
statement to `ValidationError`, reasoned from the statement's own shape: it has no unique or FK
failure mode of its own (the FK target was just inserted/confirmed in the same transaction, and
the table carries no unique constraint), so any error it raises is a malformed-geometry failure.
This is implemented directly in `saveSpatialObservation`, not in Decision 6's shared
`mapSpatialWriteError` switch.

### Decision 5: the concurrent-callers scenario for `saveSpatialObservation`'s unique-constraint race is provable on PGlite — no `tests/integration-realdb/` counterpart needed

Unlike `DrizzleCausalChainRepository.realdb.test.ts`'s own documented limitation (PGlite's
single-mutex `.transaction()` can't prove an *advisory lock* is the serializing mechanism, since any
open transaction serializes a concurrent caller regardless), this race needs no lock at all — it is
a real `UNIQUE(hazardous_event_id, observation_time)` constraint violation, and PGlite enforces real
Postgres constraints correctly within its own serialized execution. Two concurrent `saveSpatialObservation`
calls for the same `(hazardousEventId, observationTime)` with two different (fresh) ids — exactly
what happens when two callers each independently observe "no existing observation" and both proceed
to insert — still produce one committed row and one real `23505` even when PGlite executes the two
transactions one-after-another rather than truly interleaved: the second transaction's `INSERT`
genuinely collides with the first's already-committed row. This is the same constraint Postgres
itself would enforce under true concurrency; PGlite's serialization changes only the *scheduling*,
not the SQL-level outcome being tested. No `tests/integration-realdb/` file is added for this reason.

### Decision 6: `saveSpatialObservation`'s write path — ownership check, upsert-by-id, child replace, and error mapping

All of the following runs inside one `(tx ?? this.db).transaction(async (innerTx) => {...})` call,
every statement using `innerTx` as its executor — never a hard-coded `this.db` (Context: the
Decision 2/9 resolved-executor rule from `ca-persistence-unit-of-work`, empirically load-bearing
against PGlite, not stylistic here).

1. **Input-shape guard, no DB round trip:** if `observation.hazardousEventId !== hazardousEventId`
   (the method's own parameter), throw `ValidationError` — a caller-contract violation, not a race.
2. **Ownership check:** `SELECT 1 FROM hazardous_event WHERE id = hazardousEventId AND
country_accounts_id = tenantId` via `innerTx`. Zero rows throws `NotFoundError("HazardousEvent",
   hazardousEventId)` — the same error class/shape `findById` uses for a missing/foreign-tenant id
   (DEF-005's "verify hazardousEventId belongs to tenantId" requirement, already in the merged port
   spec). In practice this never fires from `RecordSpatialObservationUseCase`'s own call (it already
   calls `findById` first) — this is defense-in-depth for any other future caller of this port.
3. **Division tenant re-check (new, DB-layer defense-in-depth, closes the `0d` finding #1 gap for
   this write path specifically):** `SELECT id FROM division WHERE id = ANY(observation.divisionIds)
AND country_accounts_id = tenantId` via `innerTx`; if the matched count is less than the number of
   distinct `divisionIds`, throw `ValidationError` naming the unmatched ids. Independent of
   `SpatialObservation.create()`'s own domain-layer check and of `DrizzleDivisionRepository`'s own
   read-path check — a genuine second gate, not a duplicate of either (mirrors `SpatialObservation.ts`'s
   own "DB constraints are defense-in-depth, never a substitute for the domain-layer rule"
   philosophy, applied here to a different check than that file's own duplicate-divisionIds guard).
4. **Parent row upsert**, mirroring `DrizzleNoticeRepository.server.ts`'s `save()`:
   `.insert(hazardousEventSpatialObservationTable).values({id: observation.id, hazardousEventId,
observationTime: observation.observationTime, note: observation.note, createdAt:
   observation.createdAt, updatedAt: observation.updatedAt}).onConflictDoUpdate({target: table.id,
   set: {observationTime: observation.observationTime, note: observation.note, updatedAt:
   observation.updatedAt}, where: eq(table.hazardousEventId, hazardousEventId)}).returning()` —
   `createdAt` is supplied on the `values()` insert path (a brand-new row uses the caller's own
   `observation.createdAt`, exactly like `RecordSpatialObservationUseCase`'s own `createdAt:
   existingEntity?.createdAt ?? now`, not the column's `CURRENT_TIMESTAMP` default) but is never in
   the `set` clause, so a replace (same `id` as an existing row) leaves the original creation
   timestamp untouched, matching
   `RecordSpatialObservationUseCase`'s own "reuses the existing observation's ... `createdAt` on a
   replace" behavior at the DB layer too. **Empty `returning()`** means the id exists under a
   *different* `hazardousEventId` — a genuine cross-event id collision — mapped to `ConflictError`
   (mirrors Notices' own "Notice id already used by a different tenant" handling exactly, substituting
   `hazardousEventId` for Notices' `tenantId` as the ownership column).
5. **Child collections replaced wholesale:** delete every existing geom/division row for
   `observation.id`, then — skipping the insert entirely when the input array is empty, matching
   `DrizzleHazardousEventRepository.server.ts`'s own `insertChildCollections` convention — insert one
   geom row per `geometries` element (Decision 4) and one division row per `divisionIds` entry.
6. **Error mapping** (private helper, matching `DrizzleHazardousEventRepository.server.ts`'s own
   `mapWriteError`/`DrizzleCausalChainRepository.server.ts`'s `mapInsertError` shape — `pgErrorCode`/
   `pgErrorConstraint`, checking both the top-level error and `.cause`):
   - `23505` on `hazardous_event_spatial_observation_event_id_time_unique` → `ConflictError`, with
     context `{ hazardousEventId, observationTime }` — the exact contract
     `hazardous-event-spatial-observation`'s own "Concurrent callers" requirement specifies
     ("the same `ConflictError` shape `assertNoConflictingObservationTime` throws for a
     synchronously-detected duplicate"); the adapter cannot know the caller's own `confirmReplace`
     value, so it is not part of this context (unlike the domain-layer throw's own context object) —
     a narrower but still-matching "shape" (same error class, same identifying fields).
   - `23505` on `hazardous_event_spatial_observation_division_obs_div_unique` → `ValidationError` —
     a duplicate `divisionId` in the input array that reached the DB (the domain layer already
     guards this via `SpatialObservation.create()`'s own duplicate check; this is the DB-layer
     defense-in-depth counterpart).
   - `23503` → `ValidationError` — a `divisionId` deleted between `DrizzleDivisionRepository`'s read
     and this write (the same class of TOCTOU `DrizzleHazardousEventRepository.server.ts`'s own
     `mapWriteError` already handles for its own child collections).
   - A malformed-geometry failure from `ST_GeomFromGeoJSON` is mapped to `ValidationError` by a
     separate, scoped `try/catch` around the geom-insert statement itself (Decision 4) — not a
     branch in this switch, since the empirically-confirmed code (`XX000`) is too broad to map
     globally here.
   - Any other error rethrows unmodified by default — matching `mapWriteError`'s own terminal
     `throw err` branch.
7. **Return value:** the same shared read-assembly helper Decision 3 uses (via `innerTx`, not a
   separate connection), re-reading the just-written observation by id — not simply echoing the
   input `observation` back — so the resolved record reflects what is actually persisted, matching
   `insert()`'s own "re-query after write" discipline elsewhere in this file.

### Decision 7: the previously-deferred concurrent-write contract is now resolved, not redecided

`hazardous-event-repository-port`'s own "Concurrent saveSpatialObservation calls" requirement
explicitly deferred its losing-caller contract "to Phase 3d's `SpatialObservation` design." `3d`
resolved it, verbatim, in the `2026-09-22-ca-he-spatial-observation-entity` change's own design.md
(Section 7, "Concurrent-callers contract..."): "the caller that loses the race ... MUST surface to
its own caller the same `ConflictError` shape that `assertNoConflictingObservationTime` throws for a
synchronously-detected duplicate — mapped from the DB constraint violation, not left as a raw DB
error." `hazardous-event-spatial-observation`'s own merged spec capability states the same contract
in its own words ("MUST receive the same `ConflictError`... not a raw, unmapped database error").
Decision 6's `23505`-on-the-
time-constraint mapping is exactly this. The spec delta (specs/) updates `hazardous-event-repository-port`'s
own requirement text to state this resolved contract directly, rather than continuing to point
forward to a now-already-resolved cross-reference. The **separate, already-named risk** of two
concurrent `confirmReplace: true` upserts of the *same* existing `id` (Decision 6 step 4's `ON
CONFLICT (id) DO UPDATE` lets both succeed, last-committer-wins, with no signal to the loser) is
inherited from the 2026-10-01 change's own Risks section ("No lost-update protection...") — not new,
not addressed differently here (Risks, below).

### Decision 8 (RESOLVED — user decision: fix now, not deferred): `IDivisionRepository.findValidDivisionIds` gains an optional `tx?: Tx`

**The problem, as originally found during this change's own Phase 0:** `IDivisionRepository.findValidDivisionIds`
had no `tx` parameter. `RecordSpatialObservationUseCase.execute()` calls it without one, always
reading via `DrizzleDivisionRepository`'s own `this.db` connection regardless of whether the use
case itself received a `tx`. Once `UpdateHazardousEventUseCase` calls
`RecordSpatialObservationUseCase.execute()` from inside its own open `transactionRunner.run()`
(already shipped, `ca-persistence-unit-of-work`), this `this.db` read would run while that outer
transaction is still open — the same shape of bug `ca-persistence-unit-of-work`'s own design.md
Decision 9 found and fixed for `findById`/`findSpatialObservationByTime`, confirmed there to hang
PGlite indefinitely (not fail cleanly) rather than silently misread.

**Two options were weighed, as originally drafted:**

- **Option A (CHOSEN) — widen `IDivisionRepository.findValidDivisionIds` with an optional trailing
  `tx?: Tx`, and pass `command.tx` at `RecordSpatialObservationUseCase.execute()`'s one call site.**
  This is the identical pattern `ca-persistence-unit-of-work` already proved safe for every other
  port method in this codebase (e.g. `ICausalChainRepository.countEdgesTouching(nodeId, tx?)`,
  `IEventCausalityRepository.countReferences(..., tx?)`) — a pure, additive, optional parameter with
  no default-path behavior change. The call-site edit is one line, in the same position/order as the
  existing call, changing nothing else in `RecordSpatialObservation.ts` — not the kind of "logic
  change" this task's own file-boundary language was written to prevent (that language guards
  against re-deciding the use case's validation order, error contracts, or hydration pattern, none
  of which this touches).
- **Option B (REJECTED) — leave it as a documented risk, deferred to `5g` or a future change.** This
  was this change's own original draft position, reasoned from the task's "do not change its logic"
  instruction read literally. Rejected once reviewed: the fix is cheap, mirrors an already-proven
  pattern exactly, and this change is precisely the moment `DrizzleDivisionRepository` becomes a
  real adapter for the first time — the natural place to close this gap, rather than ship an adapter
  that is already known to hang under a real, nearby, already-shipped call path, and relying on `5g`
  (module wiring) to rediscover it independently.

**Decision:** Option A, per explicit user review and decision. Widen `IDivisionRepository.findValidDivisionIds(ids,
tenantId, tx?)`; `DrizzleDivisionRepository.server.ts` threads `tx` as the resolved executor (`tx ??
this.db`), identical to every other adapter this session; `RecordSpatialObservationUseCase.execute()`'s
one existing call becomes `this.divisionRepository.findValidDivisionIds(toSafeStringArray(command.divisionIds),
command.tenantId, command.tx)` — the only edit to that file. The `record-spatial-observation` and
`division-repository-port` capabilities both gain spec deltas reflecting this (specs/).

**No import-purity carve-out needed, unlike the three ports `ca-persistence-unit-of-work` widened.**
`openspec/specs/division-repository-port/spec.md` (42 lines, read in full — Context) carries no
"framework-free"/"MUST NOT import from any Drizzle..." requirement at all, the same situation that
change's own Decision 3 found for `causal-chain-repository-port` (and initially, incorrectly,
assumed for `workflow-repository-port`, which did need one). `IDivisionRepository.ts`'s `import
type { Tx } from "~/db.server"` needs no corresponding spec carve-out here — ruled out explicitly,
not by omission, so a future reviewer doesn't need to re-derive it.

### Decision 9: housekeeping — stale comments corrected, no behavior change

- `SpatialObservation.ts`'s file-header comment ("supersedes ... provisional `SpatialObservationRecord`")
  and `IHazardousEventRepository.ts`'s "Minimal, provisional shape" doc comment both predate this
  change's own resolution of `DEF-027` — both updated to describe the now-real type-alias
  relationship, not an aspirational future one.
- `DrizzleHazardousEventRepository.server.ts`'s three stub methods carry a `// Spatial-observation
(5e) is a separate later intent.` comment — removed once implemented; no longer accurate.

## Risks / Trade-offs

- **[Risk, resolved by Decision 8 — recorded for history]** `IDivisionRepository.findValidDivisionIds`
  originally had no `tx`, which would have hung a real `DrizzleDivisionRepository` call made from
  inside `UpdateHazardousEventUseCase`'s open `transactionRunner.run()` (once `5g` wires both into
  the same DI graph), per `ca-persistence-unit-of-work`'s own Decision 9 precedent →
  **Mitigation:** fixed in this same change (Decision 8) — `tx?: Tx` added to the port, threaded
  through the adapter, and passed at `RecordSpatialObservationUseCase.execute()`'s one call site. No
  residual exposure.
- **[Risk, inherited from the 2026-10-01 change, not new]** Two concurrent `confirmReplace: true`
  calls for the *same* existing observation `id` both succeed via `ON CONFLICT (id) DO UPDATE`
  (Decision 6 step 4) — the second write simply wins, with no signal to the first caller that its
  own write was overwritten → **Mitigation:** none added — this is the same lost-update exposure the
  2026-10-01 change's own Risks section already named and accepted ("no optimistic-locking mechanism
  exists in this codebase for this shape of race"); this change does not widen or narrow it.
- **[Risk, tooling limitation, not a code issue]** `test-quality-auditor`'s mutation-testing pass is
  expected to crash against both `DrizzleHazardousEventRepository.server.ts` and
  `DrizzleDivisionRepository.server.ts` — the same `DEF-041` `@stryker-mutator/instrumenter`/
  `@babel/core` `implements`-clause crash already confirmed on unrelated, already-merged files →
  **Mitigation:** none needed; no new deferred-items-register entry per the standing
  no-new-DEF-for-this-tooling-limitation rule — noted here for visibility only.
- **[Risk, resolved by Task 6.8 — recorded for history]** `ST_GeomFromGeoJSON`'s exact failure mode
  for a malformed `geometries` element was not known in advance → **Mitigation:** empirically
  confirmed against PGlite (`XX000`, Decision 4); mapped via a scoped `try/catch` around the geom
  insert, not a global branch, since `XX000` is too broad to map unconditionally.

## Migration Plan

No schema change, no data migration — `hazardous_event_spatial_observation` and its children, and
`division`, already exist. Deploy is a normal code release (three previously-throwing stub methods
start returning real data; a new adapter class; a type alias with an identical runtime shape to the
interface it replaces). No rollback concern beyond the usual revert-the-PR path.

## Open Questions

None. Decision 8 was the one open question this design originally deferred; it has since been
resolved by explicit user review (Option A, see Decision 8) and is folded into this change's own
specs and tasks — nothing left outstanding.
