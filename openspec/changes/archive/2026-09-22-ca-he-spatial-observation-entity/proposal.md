## Why

No domain-layer entity exists yet for `hazardous_event_spatial_observation` (Phase 2, already
shipped) even though its real DB constraints already anticipate one: the table's own comment says
"the domain-layer conflict check (3d/5e) is authoritative," and `3b`'s
`IHazardousEventRepository` port already declares `findCurrentSpatialObservation`,
`findSpatialObservationByTime`, `saveSpatialObservation` against a provisional
`SpatialObservationRecord` type whose own doc comment says "Phase 3d's own `SpatialObservation`
entity supersedes this" (`design.md` Decision 5). Until this entity exists, three real business
rules have no home: which reading counts as "current" for a hazardous event, whether a second
reading at the same `observationTime` silently overwrites the first, and whether a division
reference is tenant-scoped before being accepted. The last of these is a live, confirmed gap:
today's `syncHazardousEventSpatialFootprint` (`app/backend.server/models/event.ts:402-406`)
validates a division id only by checking it exists in `divisionTable` at all
(`inArray(divisionTable.id, divisionIds)`) — no `countryAccountsId` filter of any kind — tracked
as `DEF-005`, which names this change ("Phase 3d") as its own closing intent.

## What Changes

- Add `SpatialObservation`, a private-constructor domain entity (matching `HazardousEvent`'s and
  `WorkflowInstance`'s established pattern) modeling one dated geom/division reading, grounded in
  the three real Phase 2 tables' actual columns (`hazardousEventSpatialObservationTable`, its
  `_geom` and `_division` children) — the same field set `3b`'s provisional
  `SpatialObservationRecord` already declared, now with real behavior attached.
- `SpatialObservation.create()` validates shape (required `id`/`hazardousEventId`/valid-Date
  `observationTime`, `geometries` and `divisionIds` each required to be arrays, no duplicate
  `divisionIds` within one observation) and validates every
  `divisionId` against a caller-supplied, already tenant-scoped `validDivisionIds` set — the
  factory signature makes it structurally impossible to construct a `SpatialObservation` without
  that set, closing `DEF-005` by construction (the real DB query that produces the set is a future
  adapter's job — `5e` — not this domain-only change's; see design.md).
- `SpatialObservation.selectCurrent()` implements the "current observation" rule: latest by
  `observationTime`, independent of the input array's order — a backfilled earlier
  `observationTime` inserted last must never be selected as current.
- A duplicate-`observationTime` conflict check throws `ConflictError` when a candidate observation
  collides with an existing one at the same exact time, unless the caller passes an explicit
  `confirmReplace: true` — resolving the roadmap's "resolved open decision #8." This mirrors
  `WorkflowInstance.transition()`'s established "operation disallowed given current state →
  `ConflictError`" convention, not `HazardousEvent.create()`'s shape-validation convention.
- No DB, no port, no use-case wiring — matches `3c`'s expand-only precedent. `3b`'s
  `IHazardousEventRepository` and its `SpatialObservationRecord` placeholder are left untouched;
  updating the port's three spatial method signatures to use this new entity is explicitly out of
  scope here (flagged as follow-up, same as `3b` Decision 5 already anticipated).

## Capabilities

### New Capabilities

- `hazardous-event-spatial-observation`: domain-layer business rules for one hazardous event's
  spatial observation reading — shape validation, tenant-scoped division-reference validation
  (closing `DEF-005`), latest-by-`observationTime` "current" selection, and the
  duplicate-`observationTime` conflict/`confirmReplace` rule.

### Modified Capabilities

(none — `hazardous-event-repository-port` and `hazardous-event-spatial-observation-schema` are
unchanged by this intent; the port's provisional `SpatialObservationRecord` type and its three
spatial methods are deliberately left as-is, per Non-Goals in design.md)

## Impact

- **Files added:** `app/domains/hazardous-events/domain/SpatialObservation.ts`,
  `app/domains/hazardous-events/domain/SpatialObservation.test.ts`. One other file was touched:
  `_docs/refactoring-plan/deferred-items-register.md`'s DEF-005 row was updated to reflect that
  this intent now exists and closes DEF-005 by construction (full closure — the real tenant-scoped
  query — is still `5e`'s job), replacing its stale "Phase 3d — not yet proposed" text.
- **DB migration:** none required. The target tables
  (`hazardous_event_spatial_observation`/`_geom`/`_division`) already exist from Phase 2; this
  intent adds pure domain logic only.
- **Test approach:** Unit (Vitest, `yarn vitest run`) — in-memory fixtures for observations,
  division-id sets, and existing-observation snapshots; zero DB dependency, zero PGlite/real-DB
  setup. Consistent with `3a`/`3b`/`3c`'s domain-entity/domain-service unit tests, co-located next
  to the source file.
- **Security / multi-tenancy:** directly closes `DEF-005` at the domain layer by construction (see
  What Changes). This change does **not** implement the actual tenant-scoped division query
  itself — that remains `5e`'s job, per the roadmap's own phase split — but it makes the future
  adapter's job auditable: `SpatialObservation.create()` cannot be called without a
  `validDivisionIds` argument, so a future adapter that forgets to scope that set by tenant fails
  loudly (wrong divisions rejected/accepted) rather than silently, unlike today's live code.
  **One open question surfaced during Phase 0 validation, not yet resolved by the user, is called
  out explicitly in design.md's Open Questions section** — `divisionTable.countryAccountsId` is
  nullable at the DB level, so "tenant-scoped" needs an explicit answer for what a null-tenant
  division means. This does not block this change's own implementation (the entity only consumes
  an already-computed set), but it does need confirmation before `5e` builds the real query.
- **Downstream consumers:** none yet. `3b`'s `IHazardousEventRepository` still returns/accepts the
  provisional `SpatialObservationRecord` shape; no use case or route calls
  `SpatialObservation.ts` as of this intent (expand-only rule, matching `3c`'s own precedent).
