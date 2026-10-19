## Why

`IWorkflowRepository` (`3a`) and `workflow_instance` (`2a`) both exist, and six real consumers —
`ProcessWorkflowActionUseCase`, `CreateHazardousEventUseCase`, `GetHazardousEventByIdUseCase`,
`ListHazardousEventsUseCase`, `UpdateHazardousEventUseCase`, `DeleteHazardousEventUseCase` — are
already built and fully tested against hand-written fakes of this port. No real adapter exists
yet, so none of these use cases can run against an actual database. This change implements that
adapter so the validation-workflow bounded context has a working persistence layer, matching
exactly the contract its six existing consumers already assume from their own fakes.

## What Changes

- Add `DrizzleWorkflowRepository` (`app/domains/validation-workflow/infrastructure/`) implementing
  `IWorkflowRepository` against the existing `workflow_instance` table: `findByEntity`,
  `findByEntityIds` (one batched `IN`-clause query, never a loop), `save` (insert-or-update), and
  `deleteByEntity` (idempotent no-op when no row matches).
- No tenant filter of any kind in the adapter — `workflow_instance` has no `countryAccountsId`
  column by design (`2a`); the port's documented contract is that the caller's own aggregate
  repository (`HazardousEventRepository`/future `DisasterEventRepository`) already validated
  tenant ownership before reaching this port.
- No schema change, no migration — `workflow_instance` (`2a`) is unchanged.
- No module wiring (`ValidationWorkflowModule` is `5c`'s scope, not this change's).

**File naming note:** the roadmap's own "Files touched" list for `5a` names
`DrizzleWorkflowRepository.ts` without a suffix. Per ADR-009's now-codified `.server.ts` rule (a
file needs the suffix only when it transitively imports genuinely browser-unsafe code — confirmed
precedent: `DrizzleNoticeRepository.server.ts`, `DrizzleEventCausalityRepository.server.ts`), this
adapter injects `DRIZZLE_CLIENT` and queries `~/db.server`-adjacent infrastructure directly, so it
qualifies. The actual file is `DrizzleWorkflowRepository.server.ts` — a deliberate correction of
the roadmap text, not a deviation from policy.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `workflow-repository-port`: adds the first real adapter's behavior — query shape, conflict
  handling, row-mapping (including the skip-and-log treatment of an invariant-violating row in
  `findByEntityIds`), and tenant-omission behavior against the real `workflow_instance` table —
  as new requirements against the existing capability. The port's own type-level contract (`3a`,
  null-on-absent, batch-omit-missing, insert-or-update, idempotent delete, no `tenantId`
  parameter) is unchanged. Matches `event-causality-repository-port`'s own precedent (`5m`) of
  folding a first adapter's requirements into its existing port-level spec rather than creating a
  separate `drizzle-<x>-repository` capability — standardized on this shape rather than
  `drizzle-notice-repository`'s older, pilot-era precedent of a dedicated adapter spec.

## Impact

- **Affected code:**
  - `app/domains/validation-workflow/infrastructure/DrizzleWorkflowRepository.server.ts` — new
    adapter.
  - `tests/integration/domains/validation-workflow/DrizzleWorkflowRepository.test.ts` — new PGlite
    integration test, grouped with this bounded context's own integration-test folder per
    ADR-009's test-location convention (confirmed still correct — see design.md Context).
  - `openspec/specs/workflow-repository-port/spec.md` — gains new requirements at archive time
    (this change's own delta, not edited directly — see Capabilities above).
- **DB migration:** None. `workflow_instance` is pre-existing (`2a`), untouched by this change.
- **Test approach:** PGlite integration (`yarn test:run2`) only. No unit-only test needed beyond
  this — the adapter has no business logic to isolate from its queries, and the port's own
  type-level contract is already covered by `IWorkflowRepository.test.ts` from `3a`.
- **Multi-tenancy / security:** No tenant filter in this adapter, by design — flagged explicitly
  because this is the one place a reader might expect one and not find it. This is not a gap:
  `workflow_instance` has no `countryAccountsId` column at all (`2a`'s own schema decision), and
  every real call site reaches this port only after its own aggregate repository
  (`DrizzleHazardousEventRepository`, not yet built) has already resolved and tenant-validated the
  `entityId` being passed in. No route or presentation-layer code calls this adapter directly.
- **Known, pre-existing gap this change does not fix:** `save()` has no optimistic-locking
  protection against a lost update when two callers concurrently save different field changes to
  the same existing row (`DEF-024`, accepted for `3a`, targeted at `5j`). This change's own test
  suite includes a scenario that characterizes this exact behavior (last-write-wins, no error to
  either caller) rather than silently fixing or silently ignoring it.

## Resolved Since Initial Draft

Three items originally flagged for human review are now resolved and reflected throughout this
proposal, design.md, and the spec delta — no open questions remain:

1. **Row-invariant-failure handling:** `findByEntityIds` skips and logs a row that fails
   `WorkflowInstance.create()`'s own invariant validation, treating it the same as a missing
   instance; `findByEntity` still throws. See design.md's Open Questions section for the full
   resolution and its `DEF-031`-consistent reasoning.
2. **Capability-spec shape:** standardized on `event-causality-repository-port`'s precedent
   (`5m`) — this change's new requirements are a Modified delta against the existing
   `workflow-repository-port` spec, not a new, separate capability.
3. **`DrizzleNoticeRepository`'s own possible `23505`/`error.cause.code` bug:** left as an
   informational note only (design.md Decision 4) — no deferred-items-register entry added as
   part of this change.
