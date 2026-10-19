## Why

No entry point exists yet to record a spatial reading against a `HazardousEvent`.
`SpatialObservation.create()`, `selectCurrent()`, and `assertNoConflictingObservationTime()`
(`3d`) are real, tested domain building blocks, and `IHazardousEventRepository`'s three
spatial-observation methods (`findCurrentSpatialObservation`, `findSpatialObservationByTime`,
`saveSpatialObservation`) already exist as interface-only port methods — but nothing calls
any of them. This change adds `RecordSpatialObservationUseCase`, the first real caller of two of
the three (`findSpatialObservationByTime`, `saveSpatialObservation` — `findCurrentSpatialObservation`
is not called here, see design.md Non-Goals), and the first real caller of `SpatialObservation`'s
own conflict-check static methods.

**Build-order correction (2026-09-30, confirmed with the user):** the roadmap lists this
intent (`4g`) after `UpdateHazardousEvent` (`4c`), but `4c`'s own scope requires
`RecordSpatialObservationUseCase` to already exist (it delegates to it internally when a
submission bundles a spatial reading). This is the reverse of `4b`'s own build-order note for
`4c`'s CausalChain dependency — same shape, opposite direction: `4g` has no dependency on `4c`
(it needs only `SpatialObservation`, shipped in `3d`, and `IHazardousEventRepository`'s
existing port methods), so building `4g` first closes the gap without introducing a cycle.
Roadmap letters stay as reference names; only the build order changes.

**Two corrections to this intent's own shorthand command shape, found during Phase 0 ground-truth
verification (not assumed — read against the shipped code):**

1. **The brief's own claim that "no standalone current/duplicate-check domain function exists"
   in `SpatialObservation.ts` is factually wrong.** Both `static selectCurrent()` and
   `static assertNoConflictingObservationTime(existingAtSameTime, confirmReplace)` are real,
   shipped, tested methods on that class (lines 138 and 163). This use case's job is to _call_
   them, not re-implement their logic at the application layer — a materially different (and
   much smaller) design than orchestrating the conflict rule from scratch.
2. **The roadmap's shorthand command shape (`{ hazardousEventId, observationTime?, geometry,
divisionIds, confirmReplace? }`) omits fields the entity and every existing port method
   require**, the same class of gap `4b` found and corrected for `parentId` → `causeId`:
   - No `tenantId` — every `IHazardousEventRepository` method this use case calls requires one.
     Added as a mandatory command field.
   - `geometry` (singular) doesn't match `SpatialObservationProps.geometries: readonly
unknown[]` (plural, array). Renamed to `geometries` in the command to match the entity
     exactly — no singular/plural translation layer invented.
   - `note` is missing entirely, but `SpatialObservationProps.note: string | null` is a
     mandatory (non-optional) constructor field. Added as an optional command field, defaulting
     to `null` — see design.md Decision 5 for why this default matters specifically on a
     replace.

## What Changes

- Add `RecordSpatialObservationUseCase` (`execute(command)`) that: verifies `hazardousEventId`
  exists under `command.tenantId` (`IHazardousEventRepository.findById`, same same-tenant-only
  pattern `4b` established for `causeId`); resolves `validDivisionIds` via a new
  `IDivisionRepository` port; defaults `observationTime` to `now()` when omitted; looks up any
  existing observation at that exact time (`findSpatialObservationByTime`); calls
  `SpatialObservation.assertNoConflictingObservationTime()` (throws `ConflictError` unless
  `confirmReplace === true`); constructs the new/replacement `SpatialObservation` via
  `SpatialObservation.create()` (reusing the existing observation's `id`/`createdAt` on a
  replace, per design.md Decision 4); persists via `saveSpatialObservation`; and returns a new
  `SpatialObservationDto`.
- Add `IDivisionRepository` (new port, interface-only, matching `4b`'s `IHazardTaxonomyRepository`
  precedent exactly) — `findValidDivisionIds(ids, tenantId): Promise<ReadonlySet<string>>`
  against the tenant-scoped `division` table, narrowing (not closing) `DEF-005` the same way
  `4b` narrowed `DEF-021`. Excludes `countryAccountsId IS NULL` divisions from every tenant's
  valid set — not a new decision here, this was already confirmed by the user on 2026-09-21
  in `3d`'s own design.md Open Questions, carried forward unchanged.
- Add `SpatialObservationDto` + `toSpatialObservationDto()` mapper (ISO 8601 date strings,
  matching `HazardousEventDto`'s own convention) — new, only a `.gitkeep` exists today in
  `application/dto/`.
- `IHazardousEventRepository`'s three spatial-observation port methods are consumed **as-is,
  no signature change** — they keep returning/accepting `SpatialObservationRecord`, not the
  real `SpatialObservation` entity. `3d`'s own design.md Non-Goals already assigns that retype
  to `5e` explicitly ("the port's three spatial methods keep using `SpatialObservationRecord`
  until `5e` wires the real adapter and updates the port signatures... not silently left stale
  by this change") — this change follows that hand-off, it does not reopen it. This use case
  maps between the two shapes at its own boundary (design.md Decision 3).
- `RecordSpatialObservationUseCase` is built to be callable two ways, per the roadmap's own
  text: directly (a future API's optional `observationTime` field, historical backfill) or
  internally from `UpdateHazardousEvent` (`4c`, not yet built) when a submission bundles a
  spatial reading — this change only builds the callee; `4c`'s own delegation is that future
  change's job.

## Capabilities

### New Capabilities

- `record-spatial-observation`: `RecordSpatialObservationUseCase` — validates and persists one
  spatial reading for an existing `HazardousEvent`, enforcing the current/duplicate-time
  conflict rule from `3d`'s `SpatialObservation` entity.
- `division-repository-port`: `IDivisionRepository` — tenant-scoped existence lookup against
  `division`, feeding `SpatialObservation.create()`'s mandatory `validDivisionIds` parameter.

### Modified Capabilities

None. `IHazardousEventRepository` (`hazardous-event-repository-port`) is consumed as-is, with
no signature changes — see What Changes above for why that is a deliberate hand-off to `5e`,
not an oversight.

## Impact

**Files touched (all new — no existing source file under `app/` is modified):**

- `app/domains/hazardous-events/application/use-cases/RecordSpatialObservation.ts` — the use case
- `app/domains/hazardous-events/application/use-cases/RecordSpatialObservation.test.ts` — unit tests
- `app/domains/hazardous-events/application/dto/SpatialObservationDto.ts` — DTO + mapper
- `app/domains/hazardous-events/application/dto/SpatialObservationDto.test.ts` — mapper tests
- `app/domains/hazardous-events/application/ports/IDivisionRepository.ts` — new port
- `app/domains/hazardous-events/application/ports/IDivisionRepository.test.ts` — fake
  conformance tests (matches `IHazardTaxonomyRepository.test.ts`'s pattern)
- `_docs/refactoring-plan/deferred-items-register.md` — narrow `DEF-005` (real computation path
  now exists via `IDivisionRepository`, no adapter yet — full closure stays `5e`'s job); add
  `DEF-027` (the `SpatialObservationRecord`/`SpatialObservation` type duplication this use case
  maps across at its own boundary — already named as a deferred follow-up in `3b`/`3d`'s own
  design docs but not previously given a register row; `5e` is where it resolves)
- `_docs/refactoring-plan/hazardous-events-refactoring-roadmap.md` — already updated
  (2026-09-30) with the `4g`-before-`4c` build-order note; no further edit needed here

**DB migration:** None. `hazardous_event_spatial_observation`, its `_geom`/`_division` children,
and `division` all already exist (`2f` HE schema phase, pre-existing `division` table). This
change adds application-layer TypeScript only (one new port interface, one new use case, one new
DTO) — no schema change, no infrastructure-layer adapter.

**Test approach:** Unit only (Vitest, mock/fake repositories) — matches `4b`'s and `3d`'s own
test tier (Phase 4 Gate: zero PGlite/DB dependency). No PGlite tier in this change: neither
`IHazardousEventRepository` nor the new `IDivisionRepository` has a real adapter yet.

**Security / multi-tenancy:**

- `hazardousEventId` is validated against `command.tenantId` via
  `IHazardousEventRepository.findById()` before any spatial-observation read/write — the
  roadmap's own shorthand test-tier line only calls out "a cross-tenant division id is
  rejected," but a cross-tenant `hazardousEventId` is an equally real gap this change closes
  the same way `4b` closed it for `causeId` (same-tenant-only, `NotFoundError` on mismatch).
- `IDivisionRepository.findValidDivisionIds()` excludes any `division` row whose
  `countryAccountsId` is `null` from every tenant's valid set, per the already-confirmed answer
  in `3d`'s design.md Open Questions (2026-09-21) — this change does not reopen that question,
  it implements the confirmed answer for the first time.
- No route/auth-wrapper changes — application-tier only, same as `4b`'s and `3d`'s own scope.
