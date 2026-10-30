## Why

`DeleteHazardousEventUseCase.execute()` (`4f`) unconditionally calls
`IHazardousEventRepository.countReferencingDisasterEvents` as one of three dependent
checks before allowing a delete (`app/domains/hazardous-events/application/use-cases/
DeleteHazardousEvent.ts:71`, inside a `Promise.all`). The real adapter built in `5d`
(`DrizzleHazardousEventRepository.server.ts`) still has this method stubbed to throw
`"... is not implemented yet (5f)"`. Every hazardous-event delete attempt against the
real adapter today throws that raw `Error` instead of resolving a typed
`ConflictError` or succeeding — confirmed by direct read, not assumed. This implements
the one remaining stub so the delete path is no longer unconditionally broken.

## What Changes

- Implement `DrizzleHazardousEventRepository.countReferencingDisasterEvents` against
  `disaster_event`: a plain `COUNT(*)` filtered by `disaster_event.hazardous_event_id
  = hazardousEventId`, with no join back to `hazardous_event` and no filter on
  `disaster_event.country_accounts_id`. `tenantId` is accepted (interface conformance)
  but intentionally unused by the query — the port's own fake-conformance test
  (`IHazardousEventRepository.test.ts`) already establishes this exact semantics, and
  the use case's own caller already verifies `hazardousEventId` belongs to `tenantId`
  via `findById` before this method is ever invoked (see design.md Context).
- Add PGlite integration tests for the new method to the existing adapter test file.

**Not in scope** (adjacent, explicitly excluded per the roadmap's `5f` scoping and this
project's standing instruction not to expand scope unilaterally):

- `IHazardousEventRepository.ts` or its own fake-conformance test — the contract is
  already fully specified (requirement `countReferencingDisasterEvents counts Disaster
  Events referencing a hazardous event, not filtered by the referencing event's own
  tenant`, `openspec/specs/hazardous-event-repository-port/spec.md`) and unchanged by
  this intent.
- `DeleteHazardousEventUseCase.ts` or its test — it already calls the method correctly
  against the (currently throwing) stub; only the adapter implementation changes.
- `5e`'s spatial-observation methods on the same file, and `5g`'s NestJS module
  registration — separate, later intents.
- `DEF-032` (interim placement of this method on `IHazardousEventRepository` rather
  than a future `IDisasterEventRepository`) — that register item is about the method's
  *location*, not its existence; implementing it here leaves `DEF-032` exactly as-is
  (confirmed, not assumed — see design.md Context). No register update.
- `DEF-033` (check-then-delete sequence not atomic against either causality table's
  live cascade FKs) — targets `5k`'s transaction/locking work across all three
  dependent-check counts plus the delete; a plain `SELECT COUNT(*)` read has no
  transactional concern of its own and this change does not attempt to close that gap.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

(none — `openspec/specs/hazardous-event-repository-port/spec.md`'s existing
`countReferencingDisasterEvents` requirement already fully describes the behavior this
adapter method must satisfy, including the "not filtered by the referencing event's
own tenant" rule. No requirement text changes. This change's `.openspec.yaml` sets
`skip_specs: true` accordingly — confirmed via direct re-read of the requirement, not
assumed; see design.md Context for the full trace.)

## Impact

- **Files modified:**
  - `app/domains/hazardous-events/infrastructure/DrizzleHazardousEventRepository.server.ts`
    — replace the throwing stub with a real implementation; add a `disasterEventTable`
    import (not currently imported in this file).
  - `tests/integration/db/queries/DrizzleHazardousEventRepository.test.ts` — add a
    `describe("countReferencingDisasterEvents")` block (the file already imports
    `disasterEventTable` and `seedCountryAccount`, both needed here).
- **Files NOT modified** (see Not in scope above): `IHazardousEventRepository.ts`,
  `IHazardousEventRepository.test.ts`, `DeleteHazardousEvent.ts`,
  `DeleteHazardousEvent.test.ts`, `_docs/refactoring-plan/deferred-items-register.md`.
- **DB migration:** none — `disaster_event` already has `hazardous_event_id` (indexed
  via `disaster_event_hazardous_event_id_idx`) and `country_accounts_id`; no column
  change needed (confirmed by direct read of `app/drizzle/schema/disasterEventTable.ts`).
- **Test approach:** PGlite integration only (`yarn test:run2`), in the existing
  `tests/integration/db/queries/DrizzleHazardousEventRepository.test.ts`. No real-DB
  tier (`yarn test:run3`) — this method makes no concurrency claim (design.md Context);
  no E2E — no route wires `DeleteHazardousEventUseCase` to this adapter yet (`5g`+).
- **Security/multi-tenancy:** this is the one adapter method in the file that does
  **not** filter its query by `countryAccountsId` — a deliberate, spec-mandated
  exception (a cross-tenant `disaster_event` reference must still be counted, not
  excluded), not an oversight. Tenancy for the `HazardousEvent` side of this check is
  already enforced by the use case's prior `findById(id, tenantId)` call, not by this
  method itself (design.md Context).
