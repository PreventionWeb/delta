## Why

Phase 4 has shipped `CreateHazardousEventUseCase` (`4b`), `UpdateHazardousEventUseCase`
(`4c`), `GetHazardousEventByIdUseCase` (`4d`), `ListHazardousEventsUseCase` (`4e`), and
`RecordSpatialObservationUseCase` (`4g`), but nothing in the new Clean Architecture
application layer can delete a `HazardousEvent`. This change adds
`DeleteHazardousEventUseCase`, the roadmap's own `4f`, and is deliberately the last CRUD
use case in Phase 4 Track B — it depends on `4b`'s `ICausalChainRepository` (`hazardous_event_causality`)
already existing, which it does.

**Ground-truth findings relative to the roadmap's own shorthand intent text, not assumed:**

1. **The roadmap's `4f` section already uses the existing `ConflictError`**
   (`app/shared/errors/DomainError.ts`), not a new
   `HazardousEventHasDependentsError` subclass — matching the convention every use case
   since `4b` has followed (`assertCausalLinkDoesNotCreateCycle`,
   `assertCauseStartsNoLaterThanEffect` in `CausalChain.ts` both already throw
   `ConflictError` with a `context` payload for a structurally identical "blocked by other
   data" situation).
2. **Three distinct mechanisms can reference a `HazardousEvent` today, confirmed directly
   against the schema, not just the roadmap's prose:**
   - (a) `disaster_event.hazardous_event_id` (`disasterEventTable.ts` line 50) — a single FK,
     **no `onDelete` clause** (defaults to `RESTRICT`). Already guarded by existing legacy
     code today (0f: `disasterEventCreate`/`disasterEventUpdate` already check this field's own
     tenant match at write time).
   - (b) `event_causality` (`eventCausalityTable.ts`) — HE↔DE causality linking, **all four
     FK columns `onDelete: "cascade"`**. Confirmed via the Phase 0 audit (`0a` finding #8,
     `0f`) that deleting a `HazardousEvent` today cascades away its `event_causality` rows
     silently, with no block and no trace. This is the deliberate behavior change this
     change makes — closing that gap by blocking, not porting the cascade forward. `DEF-004`
     confirms this table's own write path (`syncLinkedHazardousEvents`) has **no** tenant
     guard, unlike (a) — a real, reachable cross-tenant-row risk, not just a theoretical one
     (design.md Decision 3, 6b).
   - (c) `hazardous_event_causality` (`4b`'s own schema, `2026-09-07-ca-he-causality-schema`
     design.md, confirmed directly against the live schema file
     `app/domains/hazardous-events/infrastructure/hazardousEventCausalityTable.ts`) — HE-to-HE
     causal chain, via `ICausalChainRepository`, **both FK columns also `onDelete: "cascade"`**
     (same silent-cascade exposure as (b), not previously named as a delete-gap anywhere in
     the audit). Unlike (b), this table's only write path (`saveEdge`, called only from
     `4b`/`4c`) already enforces same-tenant linking via `findById` (design.md Decision 2).
   - The legacy `event_relationship` table (`parentId`/`childId`, **no `onDelete` clause at
     all**) is a fourth, older mechanism, explicitly **not** part of this unified check — see
     design.md Decision 5 for why, and the residual risk this exclusion leaves (register
     row, tasks.md).
3. **No existing port method answers "is this node a cause or effect of anything"** —
   `ICausalChainRepository.findReachableEdgesFrom(nodeId)` only resolves edges reachable
   **forward** from `nodeId` (i.e. where `nodeId` is a cause, transitively) — it does not
   surface an edge where `nodeId` is only an effect. A new port method is required (design.md
   Decision 2).
4. **`IHazardousEventRepository.delete(id, tenantId): Promise<void>` already exists** (line
   34) — this change needs zero changes to that method's own **signature**, only one new
   sibling method for the disaster-event-reference check (design.md Decision 4). Its own
   missing-row **behavior**, however, was never previously pinned by any spec — this change
   does pin it (a no-op, not an error), needed to make this change's own mandatory
   concurrent-callers scenario well-defined (design.md Decision 7).
5. **Correction, this round of review: the legacy live delete path is
   `app/backend.server/models/event.ts` line 1728, not
   `app/backend.server/models/event/hazardous_event_delete.ts`.** The latter lives under the
   directory `DEF-001` already names as entirely dead code (every real HE entry point resolves
   to `event.ts`). Both functions are byte-for-byte identical, so no behavioral finding drawn
   from reading it changes — only the citation, now corrected throughout design.md.
6. **The live legacy delete path's own `entityValidationAssignmentDeleteByEntityId`/
   `entityValidationRejectionDeleteByEntityId` calls are the pre-CA precedent for cleaning up
   this event's own validation state before deleting it** — today's `workflow_instance` is the
   CA-era successor to that state, and `IWorkflowRepository` had no equivalent cleanup method
   before this change (design.md Decision 8).

**Five architectural decisions already made by the user across this session, cited as
settled, not reopened here** (full reasoning in design.md Decisions 1-4, 6b, and 8):

1. Error type: reuse `ConflictError`, with a `context` payload naming which dependents and
   how many — no new `DomainError` subclass.
2. Case (c)'s check is a new method on the existing `ICausalChainRepository`.
3. Case (b)'s check lives on a new, shared port (`IEventCausalityRepository`) that belongs to
   neither Hazardous Events nor Disaster Events exclusively — design.md Decision 1 settles its
   exact location (`app/domains/shared/application/ports/`, a DDD Shared Kernel case per
   ADR-009, not `IWorkflowRepository`'s "domain-owned-but-widely-consumed" shape).
4. Case (a)'s check is an interim addition to `IHazardousEventRepository` itself — the
   architecturally correct home is a future `IDisasterEventRepository`, once Disaster Events
   gets its own Clean Architecture migration (register row `DEF-032`, tasks.md).
5. **Cross-tenant disclosure (resolved this round):** case (b) (`event_causality`) alone needs
   a same-tenant/cross-tenant disclosure split in the `ConflictError` context — cases (a) and
   (c) both have an existing, confirmed write-time tenant guard, making exact-count disclosure
   safe for those two (design.md Decisions 2, 4, 6b). **WorkflowInstance cleanup (resolved this
   round):** add `IWorkflowRepository.deleteByEntity` and call it in this change, mirroring the
   legacy precedent above, rather than deferring it (design.md Decision 8).

**One correction to the brief's own example signatures, made this session and confirmed
against the roadmap's own text (not a new decision, a literal-reading correction):** the
roadmap's `4f` section says the `ConflictError` context carries "which dependents and **how
many**," and its own `5f` section says the backing queries must "return enough detail (which
table, how many rows) ... not just a boolean." All three dependent-reference port methods
therefore return a count (or a richer, count-bearing shape for case (b), design.md Decision 3),
not `Promise<boolean>` — the brief's own illustrative names (`hasAnyEdge`,
`hasDisasterEventReference`) are superseded by count-returning equivalents.

## What Changes

- Add `DeleteHazardousEventUseCase` (`execute(command)`) that: tenant-gates via
  `IHazardousEventRepository.findById(id, tenantId)` (throws `NotFoundError` for a missing or
  foreign-tenant event, identical sequencing to `4c`/`4d`); then runs all three
  dependent-reference counts concurrently (`Promise.all`, not fail-fast — the roadmap's own
  "which dependents and how many" phrasing requires a complete picture, not the first hit);
  throws one `ConflictError` naming every dependent type with a non-zero count when any
  exists (case (b)'s own entry disclosing only a same-tenant count plus a cross-tenant flag,
  design.md Decision 6b); otherwise cleans up the event's `WorkflowInstance` row
  (`IWorkflowRepository.deleteByEntity`, design.md Decision 8), calls
  `IHazardousEventRepository.delete(id, tenantId)`, and logs success. Zero DB/PGlite
  dependency — Phase 4 Gate, matching `4b`/`4c`/`4d`/`4e`/`4g`.
- Add `DeleteHazardousEventCommand { id, tenantId, actingUserId }`.
- Add `ICausalChainRepository.countEdgesTouching(nodeId): Promise<number>` — counts every
  `hazardous_event_causality` row where `nodeId` is either the cause or the effect side (`4b`'s
  cause-or-effect requirement, not `findReachableEdgesFrom`'s forward-only semantics).
- Add `IHazardousEventRepository.countReferencingDisasterEvents(hazardousEventId, tenantId):
  Promise<number>` — interim placement (register row `DEF-032`), counts `disaster_event` rows
  whose `hazardousEventId` matches, **not filtered by the disaster event's own tenant**
  (design.md Decision 4).
- Add a new, shared port `IEventCausalityRepository` at
  `app/domains/shared/application/ports/IEventCausalityRepository.ts` —
  `countReferences(hazardousEventId, tenantId): Promise<EventCausalityReferenceCounts>`
  (`{ sameTenantCount, crossTenantCount }`), counting `event_causality` rows where
  `hazardousEventId` appears as either the triggering or triggered hazardous-event id,
  regardless of direction, split by whether the row's own other side shares `tenantId`
  (design.md Decision 3). First file under `app/domains/shared/application/`.
- Add `IWorkflowRepository.deleteByEntity(entityId, entityType): Promise<void>` — idempotent
  cleanup of the `WorkflowInstance` row for a deleted entity, called by
  `DeleteHazardousEventUseCase` before the main delete (design.md Decision 8).

## Capabilities

### New Capabilities

- `delete-hazardous-event`: `DeleteHazardousEventUseCase` — tenant-scoped delete of a
  `HazardousEvent`, blocked by a single unified dependent-reference check across three
  independent mechanisms, surfaced as one `ConflictError` naming every blocking dependent, and
  cleaning up the event's own `WorkflowInstance` row before deleting it.
- `event-causality-repository-port`: `IEventCausalityRepository` — the first port under the
  new `app/domains/shared/application/` Shared Kernel location, counting `event_causality`
  references to a given hazardous event id, split into same-tenant and cross-tenant counts.

### Modified Capabilities

- `hazardous-event-repository-port`: adds `countReferencingDisasterEvents` — the interface's
  own "exactly seven methods" requirement becomes "exactly eight." Also pins a previously
  unspecified behavior on the existing `delete` requirement — a missing row is a no-op, not a
  thrown error (design.md Decision 7).
- `causal-chain-repository-port`: adds `countEdgesTouching`.
- `workflow-repository-port`: adds `deleteByEntity` — the interface's own "exactly three
  methods" requirement becomes "exactly four."

## Impact

**Files touched:**

- `app/domains/hazardous-events/application/use-cases/DeleteHazardousEvent.ts` (new)
- `app/domains/hazardous-events/application/use-cases/DeleteHazardousEvent.test.ts` (new)
- `app/domains/hazardous-events/application/ports/IHazardousEventRepository.ts` (modified —
  add `countReferencingDisasterEvents`; also a doc-comment addition to the existing `delete`
  method pinning its no-op-on-missing-row contract, no signature change)
- `app/domains/hazardous-events/application/ports/IHazardousEventRepository.test.ts`
  (modified — extend `FakeHazardousEventRepository` and the arity assertions)
- `app/domains/hazardous-events/application/ports/ICausalChainRepository.ts` (modified — add
  `countEdgesTouching`)
- `app/domains/hazardous-events/application/ports/ICausalChainRepository.test.ts` (modified —
  extend `FakeCausalChainRepository` and the arity assertions)
- `app/domains/shared/application/ports/IEventCausalityRepository.ts` (new)
- `app/domains/shared/application/ports/IEventCausalityRepository.test.ts` (new)
- `app/domains/validation-workflow/application/ports/IWorkflowRepository.ts` (modified — add
  `deleteByEntity`)
- `app/domains/validation-workflow/application/ports/IWorkflowRepository.test.ts` (modified —
  extend `FakeWorkflowRepository` and the arity assertions)
- `app/domains/hazardous-events/application/use-cases/CreateHazardousEvent.test.ts`,
  `GetHazardousEventById.test.ts`, `ListHazardousEvents.test.ts`,
  `RecordSpatialObservation.test.ts`, `UpdateHazardousEvent.test.ts` (all modified — adding a
  required method to an existing interface breaks every other class that `implements` it,
  confirmed via a repo-wide grep for `implements ICausalChainRepository`/
  `implements IHazardousEventRepository`/`implements IWorkflowRepository`, not assumed from
  this change's own files. Each of these five files' own local fake gets a trivial,
  behavior-neutral stub for the new methods its own use case actually depends on (four of the
  five also have their own `FakeWorkflowRepository`, needing a `deleteByEntity` stub too —
  `RecordSpatialObservation.test.ts` does not depend on `IWorkflowRepository` and needs no such
  stub), matching that file's own existing "not used by this use case's own tests" convention
  for methods it never calls — zero new assertions, zero behavior change. See design.md Context
  and tasks.md for the full list and the `4c`-established lesson that `yarn tsc`, not
  `yarn vitest run`, is the actual red/green signal for this class of change.)
- `app/domains/validation-workflow/application/use-cases/ProcessWorkflowAction.test.ts`
  (modified — a sixth fallout file, found during implementation, not by the design-time grep:
  two object-literal fakes typed `: IWorkflowRepository` rather than a `class ... implements`
  declaration, which an `implements`-only grep misses. Same trivial `deleteByEntity: vi.fn()`
  stub, zero behavior change. design.md Context and tasks.md task 3.3 corrected accordingly.)
- `_docs/refactoring-plan/deferred-items-register.md` (modified by the implementer, per
  tasks.md — three new rows, `DEF-032`, `DEF-033`, `DEF-035`; `DEF-034` was considered, for the
  orphaned-`WorkflowInstance` finding, and deliberately not added — that finding is resolved in
  this change via `deleteByEntity`, not deferred; no existing row touched. Only `DEF-032` was
  authorized in advance by this change's own brief — `DEF-033`/`DEF-035` are additional findings
  surfaced during this change's own ground-truth review, flagged per the register's own
  standing instruction, not pre-scoped; see design.md Risks.)

This is a wider blast radius than `4f`'s own two-file roadmap stub — matching the pattern
`4e` already set (additions beyond the stub are normal once ground truth is read, not a scope
violation): four new port methods across three existing ports plus one brand-new port are
needed because no existing method answers any of the three dependent-check questions, and
because the WorkflowInstance-cleanup resolution added a fourth.

**DB migration:** None. All four referenced tables (`disaster_event`, `event_causality`,
`hazardous_event_causality`, `workflow_instance`) already exist. This change is
application/domain-layer TypeScript only — no schema change.

**Test approach:** Unit only (Vitest, fake/mock ports, spy/fake `ILogger`) — matches
`4b`/`4c`/`4d`/`4e`/`4g`'s own test tier (Phase 4 Gate: zero PGlite/DB dependency). No real
adapter exists yet for any of the four ports; the roadmap's own `5f` is where the real,
DB-backed dependent-check queries get built and PGlite-tested (`deleteByEntity`'s own real
adapter is `IWorkflowRepository`'s, a separate future intent) — see design.md Risks for how
`5f`'s own roadmap text is now stale relative to this change's port-placement decisions.

**Security / multi-tenancy:**

- `findById(id, tenantId)` is the tenant gate for the event being deleted — same sequencing
  `4c`/`4d` already established (tenant-scoped lookup before any lookup lacking its own
  `tenantId` parameter).
- The two causality-table counts (`countEdgesTouching`, `IEventCausalityRepository.
  countReferences`) are **not** tenant-filtered by design — `hazardous_event_causality` and
  `event_causality` both deliberately allow cross-tenant links today (`DEF-012`, `DEF-004`),
  and a cross-tenant referrer is still a real dependent; filtering it out would let a delete
  proceed and then either hit the silent cascade (the exact bug this change exists to close)
  or, for case (a), a different cross-tenant reference entirely.
- `countReferencingDisasterEvents`'s own `tenantId` parameter scopes the **HE side only**
  (kept for interface-signature parity with every other `IHazardousEventRepository` method,
  and because `findById` has already proven `hazardousEventId` belongs to `tenantId` by the
  time this method is called) — it does not filter the `disaster_event` rows being counted by
  their own tenant (design.md Decision 4).
- **Cross-tenant disclosure — resolved this round, not an open flag (design.md Decision 6b,
  Risks):** `DomainErrorFilter.server.ts` (confirmed directly, lines 73-75) puts a thrown
  `DomainError`'s own `context` straight into the HTTP response body as `details`. Cases (a)
  and (c) disclose their exact counts directly — both have a confirmed, existing write-time
  tenant guard (0f for (a); `findById`-gated `saveEdge` for (c)), so a cross-tenant row for
  either is a theoretical correctness safeguard, not a live disclosure risk. Case (b)
  (`event_causality`) is different — `DEF-004` confirms a real, currently-unguarded write path,
  so its own `ConflictError` entry discloses only the same-tenant count plus a boolean
  `crossTenantReferenceExists` flag, never the cross-tenant count itself. The underlying
  cross-tenant-deadlock question this disclosure split does not itself resolve (a tenant
  genuinely blocked by a cross-tenant `event_causality` row it cannot see or remove) is accepted
  as-is, per the user's own resolution — the same open access-control question `DEF-012`
  already names for `hazardous_event_causality` generally.
- No new route or auth wrapper in this change — this use case has no caller yet (Phase 6,
  not yet built), matching every other Phase 4 use case's current state.
