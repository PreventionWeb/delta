## Why

`4b` (`CreateHazardousEventUseCase`), `4c` (`UpdateHazardousEventUseCase`), and `4g`
(`RecordSpatialObservationUseCase`) are real, shipped, mock-tested use cases, but nothing
in the new Clean Architecture application layer can fetch a single, already-persisted
`HazardousEvent` by id. This change adds `GetHazardousEventByIdUseCase`, the read-path
counterpart the roadmap's own `4d` names, needed before `4e` (`ListHazardousEvents`) and
before any route/controller (Phase 6) can expose a detail view.

**Two things ground-truth-checked and corrected relative to the roadmap's own shorthand
intent text, not assumed:**

1. **`IHazardousEventRepository.findCurrentSpatialObservation(hazardousEventId, tenantId)`
   already exists and already implements exactly the "latest by `observationTime`, or
   `null` if none" rule `4d`'s own intent text asks for** (`IHazardousEventRepository.ts`
   lines 36-40, shipped with `3d`/`4g`, confirmed unused by any use case built so far).
   No new port method is needed — this change is the first caller of an existing,
   previously-dormant method.
2. **`HazardousEventDto`/`toHazardousEventDto` has exactly two real call sites today
   (`CreateHazardousEvent.ts`, `UpdateHazardousEvent.ts`), both shipped and merged, and
   has no field for a spatial observation at all.** Rather than add a spatial-observation
   field/param to that existing DTO and mapper — which would force both existing call
   sites to change for a field only this new read path needs — this change introduces its
   own additive DTO, `HazardousEventDetailDto`, with its own mapper,
   `toHazardousEventDetailDto`, that wraps `toHazardousEventDto`'s own output (spread,
   plus one new field) rather than duplicating its field-mapping logic. **Zero changes to
   `HazardousEventDto.ts`, `CreateHazardousEvent.ts`, or `UpdateHazardousEvent.ts`.** This
   is also the right shape independent of blast-radius: `4e` (`ListHazardousEvents`, next
   on the roadmap) will want the plain, observation-free `HazardousEventDto` for its own
   paginated rows — fetching a spatial observation per list row would be an N+1 cost a
   list endpoint should never pay. (User-confirmed decision; not reopened here.)

**One finding surfaced during Phase 0 verification, flagged for the human reviewer, not
resolved unilaterally in this change (see design.md Decision 2 and Risks):**
`GetHazardousEventByIdUseCase` needs a `WorkflowInstance` to satisfy
`toHazardousEventDto`'s mandatory second parameter, exactly as `4c` does. `4c` treats a
missing `WorkflowInstance` as a defensive, "can never fire against a correct adapter"
`NotFoundError` — correct for `4c`'s own write path, because `4b` always creates a
`WorkflowInstance` atomically alongside the event it creates. But `_docs/refactoring-plan/
hazardous-events-refactoring-roadmap.md`'s own "Phase M — Data Migration: Backfill,
Validation, Rollback" section (line 880, confirmed "execution not started") shows the
backfill of legacy `hazardous_event` rows into `workflow_instance` is real, planned, and
**not yet done**. Once a real `IHazardousEventRepository` adapter (Phase 5, not yet built)
and a real route (Phase 6, not yet built) exist, this exact read path will be the one that
serves every legacy-created event — for which the "defensive, can-never-fire" case becomes
the **common** case until Phase M's backfill actually runs. This change still implements
the same defensive convention as `4c` (it is the only option available within this
change's own stated DTO boundary — see design.md Decision 2 for why), but surfaces this
production-readiness risk explicitly via a new deferred-items register row (`DEF-031`)
rather than silently inheriting it.

## What Changes

- Add `GetHazardousEventByIdUseCase` (`execute(query)`) that: loads the existing event via
  `IHazardousEventRepository.findById(query.id, query.tenantId)` (`NotFoundError` on a
  missing or cross-tenant id, enforced by the port itself); loads its `WorkflowInstance`
  via `IWorkflowRepository.findByEntity(event.id, "HE")` (defensive `NotFoundError` on
  `null`, matching `4c`'s own convention — see design.md Decision 2); loads its current
  spatial observation via `IHazardousEventRepository.findCurrentSpatialObservation(event.id,
  query.tenantId)` (resolves `null`, never throws, when none exists — a legitimate state,
  not an error); and returns a `HazardousEventDetailDto`.
- Add `HazardousEventDetailDto`/`toHazardousEventDetailDto` in a new file,
  `app/domains/hazardous-events/application/dto/HazardousEventDetailDto.ts` — wraps
  `HazardousEventDto`'s own output with one additional field,
  `currentSpatialObservation: SpatialObservationDto | null`, mapped via the existing
  `toSpatialObservationDto` (no new mapping logic duplicated). This is an addition beyond
  the roadmap's own two-file stub (`GetHazardousEventById.ts`/`.test.ts` only) — the roadmap
  text itself requires the DTO to carry both workflow status and the current observation,
  and the user-confirmed decision above rules out retrofitting the existing
  `HazardousEventDto`.
- Add `GetHazardousEventByIdQuery { id: string; tenantId: string }` — matches the Notices
  domain's own established naming for this exact use-case shape
  (`GetNoticeByIdQuery`, `app/domains/notices/application/use-cases/GetNoticeById.ts`),
  not `Command` (this is the first read-only use case in the hazardous-events domain).

## Capabilities

### New Capabilities

- `get-hazardous-event-by-id`: `GetHazardousEventByIdUseCase` — fetches a single,
  tenant-owned `HazardousEvent` by id, enriches it with its current workflow status and
  current spatial observation, and returns a `HazardousEventDetailDto`.

### Modified Capabilities

<!-- None — no existing capability's requirements change. HazardousEventDto/
toHazardousEventDto, IHazardousEventRepository, and IWorkflowRepository are all reused
exactly as already specified; HazardousEventDetailDto is a new, additive capability, not a
modification to the existing hazardous-event-entity/update-hazardous-event/
create-hazardous-event capabilities. -->

## Impact

**Files touched:**

- `app/domains/hazardous-events/application/use-cases/GetHazardousEventById.ts` (new) —
  the use case
- `app/domains/hazardous-events/application/use-cases/GetHazardousEventById.test.ts` (new)
  — unit tests
- `app/domains/hazardous-events/application/dto/HazardousEventDetailDto.ts` (new) — the
  additive DTO and its mapper
- `app/domains/hazardous-events/application/dto/HazardousEventDetailDto.test.ts` (new) —
  unit tests for the mapper's own branching (observation present vs. `null`)
- `_docs/refactoring-plan/deferred-items-register.md` — add `DEF-031`, naming the
  Phase-M-backfill/defensive-`NotFoundError` interaction above (see design.md Decision 2
  and Risks); no existing row is modified or removed

**DB migration:** None. `hazardous_event`, `workflow_instance`, and
`hazardous_event_spatial_observation`/`hazardous_event_spatial_observation_geom`/
`hazardous_event_spatial_observation_division` all already exist. This change is
application/domain-layer TypeScript only — no schema change, no new port method (both
`IHazardousEventRepository.findCurrentSpatialObservation` and
`IWorkflowRepository.findByEntity` already exist and are reused unchanged).

**Test approach:** Unit only (Vitest, fake/mock `IHazardousEventRepository` and
`IWorkflowRepository`, spy/fake `ILogger`) — matches `4b`'s, `4c`'s, and `4g`'s own test
tier (Phase 4 Gate: zero PGlite/DB dependency). No real adapter exists yet for either
repository port.

**Security / multi-tenancy:**

- `query.id` is validated against `query.tenantId` entirely inside
  `IHazardousEventRepository.findById()` — same-tenant-only by the port's own contract
  (`NotFoundError` on a missing or foreign-tenant id), reused unchanged from `4b`/`4c`.
  This use case performs no separate defense-in-depth tenant-equality check on the
  returned entity (matching `4b`'s/`4c`'s own convention of trusting the port's contract,
  not Notices' older, independently-settled defense-in-depth pattern for its own domain).
- Every subsequent lookup (`findByEntity`, `findCurrentSpatialObservation`) runs only
  after `findById` has already confirmed `query.id` belongs to `query.tenantId` — a
  missing or cross-tenant id throws before either later call ever runs, a property of
  this use case's sequential (not `Promise.all`) call ordering, not of which id is passed
  to those later calls. Subsequent calls use `event.id` (the entity `findById` itself
  resolved) rather than echoing the raw `query.id`, following `4b`'s own established
  canonical-id precedent — see design.md Decision 3 for both points, kept distinct.
- **Flagged for a joint decision, not resolved in this change** (see Why, above, and
  design.md Decision 2/Risks): the defensive `NotFoundError` for a missing
  `WorkflowInstance`, mirrored unchanged from `4c`'s write-path convention, will surface as
  a 404 for every legacy-created event once a real adapter and route exist, until Phase M's
  backfill runs. `DEF-031` records this for the human reviewer; no fix is attempted here.
