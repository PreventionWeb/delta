## Why

`IEventCausalityRepository` was placed under `app/domains/shared/application/ports/` (Shared
Kernel) in `4f`, when it was just a port signature with no adapter. DDD's Shared Kernel pattern
(Evans) is meant for small, non-business-logic shared rules — `flexibleDateFormat.ts` is the real
fit. `event_causality` now has its own table, its own repository concern, and a genuine business
rule (`4f`'s same-tenant/cross-tenant disclosure split in `countReferences`) — the same shape as
`validation-workflow`: a relationship concern shared between Hazardous Events and Disaster Events,
owned by neither. It belongs in its own bounded context, not Shared Kernel. Blast radius is small
today — `IEventCausalityRepository` has exactly one consumer (`DeleteHazardousEventUseCase`) — so
this is the cheapest point to fix the placement, before Disaster Events' own CA work adds a second
consumer.

## What Changes

- Relocate `IEventCausalityRepository.ts` and its test from
  `app/domains/shared/application/ports/` to `app/domains/event-causality/application/ports/` —
  structural move only, no behavior change to the port's contract.
- Update `DeleteHazardousEvent.ts`'s import path to the new location (its only consumer).
- Implement `DrizzleEventCausalityRepository` — the first real adapter fulfilling
  `IEventCausalityRepository` — querying the pre-existing `event_causality` table. No schema
  change, no migration.
- Create `EventCausalityModule` (NestJS), registering the adapter under an
  `EVENT_CAUSALITY_REPOSITORY` token and exporting that token **directly** (not hidden behind a
  use case, since this context has no use case of its own — unlike `NoticesModule`'s convention).
  Nothing imports this module yet; `HazardousEventsModule` (`5g`) will import it later.
- Update ADR-009's Shared Kernel section with a brief note that this port's placement was
  evaluated and the context deliberately chose its own bounded context over Shared Kernel — for
  future reference when a similar placement question comes up. ADR-009 never explicitly named
  `IEventCausalityRepository` as a Shared Kernel member, so there is nothing to retract, only to
  note.

## Capabilities

### New Capabilities

- None. `openspec/specs/event-causality-repository-port/` already exists (from `4f`) and already
  specifies this port's interface and `countReferences` contract — see note below.

### Modified Capabilities

- `event-causality-repository-port`: the interface-compilation requirement's file-path
  reference moves from `app/domains/shared/application/ports/` to
  `app/domains/event-causality/application/ports/` (no contract change). New requirements are
  added for the first real adapter (`DrizzleEventCausalityRepository`, previously unspecified —
  `4f` only specified the port, not an implementation) and for `EventCausalityModule`'s
  direct-export wiring.
- `delete-hazardous-event`: **not modified.** Checked against
  `openspec/specs/delete-hazardous-event/spec.md` — its requirements reference
  `IEventCausalityRepository.countReferences` only by name and contract, never by file path, so
  `DeleteHazardousEventUseCase`'s own spec is unaffected by the port's relocation. Confirmed, not
  assumed.

## Impact

- **Affected code:**
  - `app/domains/shared/application/ports/IEventCausalityRepository.ts` — removed (moved).
  - `app/domains/shared/application/ports/IEventCausalityRepository.test.ts` — removed (moved).
  - `app/domains/event-causality/application/ports/IEventCausalityRepository.ts` — new location.
  - `app/domains/event-causality/application/ports/IEventCausalityRepository.test.ts` — new
    location.
  - `app/domains/event-causality/infrastructure/DrizzleEventCausalityRepository.server.ts` — new
    adapter.
  - `app/domains/event-causality/infrastructure/EventCausalityModule.server.ts` — new NestJS
    module. Carries the `.server.ts` suffix — it registers `DrizzleProvider` and wires a real
    repository, i.e. transitively imports genuinely browser-unsafe code (ADR-009's now-explicit
    suffix rule, not "because `NoticesModule` does it").
  - `app/domains/event-causality/infrastructure/EventCausalityRepositoryToken.ts` — new injection
    token (no suffix — a bare `Symbol()` declaration, same as `NoticeRepositoryToken.ts`; nothing
    in it could leak or break if ever bundled, per ADR-009).
  - `tests/integration/domains/event-causality/DrizzleEventCausalityRepository.test.ts` — new
    PGlite adapter test, grouped with this bounded context's other integration tests per
    ADR-009's test-location convention (not `tests/integration/db/queries/`, which remains
    correct only for tests with no port/adapter class involved — `DrizzleNoticeRepository.test.ts`
    is a known, deliberately-not-migrated exception, predating this convention).
  - `tests/integration/domains/event-causality/EventCausalityModule.test.ts` — new module-wiring
    test, same folder — one bounded context, one test folder.
  - `app/domains/hazardous-events/application/use-cases/DeleteHazardousEvent.ts` — import path
    only, no behavior change.
  - `app/domains/hazardous-events/application/use-cases/DeleteHazardousEvent.test.ts` — import
    path only.
  - `_docs/decisions/ADR-009-clean-architecture-module-structure.md` — Shared Kernel section note.
  - `openspec/specs/event-causality-repository-port/spec.md` — `## Purpose` section updated
    directly by the implementer (task 8.2, before archiving in 8.3), not via this change's own
    delta spec.
- **DB migration:** None required. `event_causality` is pre-existing and untouched by this
  change; this is a structural relocation plus a new read-only adapter against an existing table.
- **Test approach:** Unit (relocated port conformance test, unchanged) + PGlite integration
  (`yarn test:run2`) for the new `DrizzleEventCausalityRepository` — zero rows, same-tenant row,
  cross-tenant row, both directions (hazardous event as triggering or triggered side), and
  tenant-scoped classification verified against joins to `hazardousEventTable`/
  `disasterEventTable`.
- **Multi-tenancy / security:** `event_causality` carries no `countryAccountsId` column of its
  own — same-tenant/cross-tenant classification requires joining to the other side's own
  entity table (`hazardousEventTable` when the other side is `'HE'`, `disasterEventTable` when
  `'DE'`) to read its `countryAccountsId`. Getting this join wrong silently misclassifies
  cross-tenant references as same-tenant or vice versa, which directly affects
  `DeleteHazardousEventUseCase`'s disclosure rule (same-tenant count is disclosed in the
  `ConflictError`; cross-tenant count is only ever disclosed as a boolean flag). This is the one
  security-sensitive aspect of this change, despite there being no schema change.
- **No route, presentation, or controller impact.** No consumer besides `DeleteHazardousEvent.ts`
  exists today.

## Open Questions (flagged for human review — not guessed)

Both prior open questions — the module file's `.server.ts` suffix, and the PGlite test file's
location — are now resolved and documented directly in
`_docs/decisions/ADR-009-clean-architecture-module-structure.md` (two new paragraphs added just
before its "Consequences" section, citing `5m`/2026-10-08 as precedent): `.server.ts` only when a
file transitively imports genuinely browser-unsafe code (so `EventCausalityModule.server.ts`
qualifies, `EventCausalityRepositoryToken.ts` does not); port-adapter class tests live under
`tests/integration/domains/<context>/`, not `tests/integration/db/queries/`. See design.md's own
Decisions 4 and 5 for the brief pointer, and ADR-009 itself for the full reasoning — not
re-derived here.

Also already resolved, not genuine open questions once checked: self-referencing
`event_causality` row counting (design.md Decision 2) and `NULL` other-side tenant classification
(design.md Decision 3, citing `event-causality-repository-port`'s own existing "remaining
matching rows" wording for `crossTenantCount`).

What's left, genuinely deferrable without changing this design's architecture:

1. **`EventCausalityRepositoryToken.ts` is a new file not named in the roadmap's own file list** —
   added because `EventCausalityModule` needs a typed injection token (mirroring
   `NoticeRepositoryToken.ts`), and the roadmap's file list may simply have omitted it the same
   way it omitted this detail for `NoticesModule`'s own token file. Flagging the addition rather
   than silently introducing an unlisted file.
2. **Updating `openspec/specs/event-causality-repository-port/spec.md`'s own `## Purpose`
   section** (it currently describes the port's home as "the `app/domains/shared/` Shared Kernel
   location") **cannot be done via this change's delta spec** — delta `## Purpose` sections are
   ignored by the archive tool for an existing capability; the OpenSpec CLI's own instructions say
   this must be edited directly on the main spec file. That is outside this agent's role boundary
   (spec-writer edits only `openspec/changes/`, never `openspec/specs/` directly). `tasks.md` task
   8.2 hands this explicitly to the implementer so it isn't forgotten.
