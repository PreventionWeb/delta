## Why

Phase 4's six hazardous-events use cases (`CreateHazardousEventUseCase`,
`UpdateHazardousEventUseCase`, `GetHazardousEventByIdUseCase`,
`ListHazardousEventsUseCase`, `DeleteHazardousEventUseCase`,
`RecordSpatialObservationUseCase`) and their adapters (`5i`'s
`DrizzleCausalChainRepository`/`DrizzleHazardTaxonomyRepository`, `5e`'s
`DrizzleDivisionRepository`, `DrizzleHazardousEventRepository`) all exist and are
unit-tested in isolation, but no NestJS module wires them to concrete adapters. None
of the six use cases is reachable from the application DI context
(`getAppContext()`) today. Without this wiring, the hazardous-events domain has no
way to be driven by a future controller/route, and two already-built cross-domain
exports (`EventCausalityModule`'s `EVENT_CAUSALITY_REPOSITORY`,
`ValidationWorkflowModule`'s `ProcessWorkflowActionUseCase`) have no consumer.

**Scope correction (2026-10-22):** this change's own SOLID review, run mid-implementation
after tasks.md Sections 1-9 had landed, found that the originally-approved wiring widened
`ValidationWorkflowModule`'s `exports` to include the full `WORKFLOW_REPOSITORY` token —
exposing `IWorkflowRepository`'s write methods (`insert`, `update`, `deleteByEntity`) across
the validation-workflow/hazardous-events bounded-context boundary, not just the two read
methods five of the six use cases actually need. `EventCausalityModule`'s
`EVENT_CAUSALITY_REPOSITORY` export — cited as this design's precedent — does not actually
support it: that port has one read-only method (`countReferences`), a materially narrower
exposure than exporting all five methods of `IWorkflowRepository`.

Because this is the first true inter-bounded-context module wiring in this codebase's Clean
Architecture refactor, the user decided to fix this properly now, folded into this same
change, rather than ship with the violation and a documented risk. The corrected design
keeps `WORKFLOW_REPOSITORY` unexported (restoring `ca-validation-workflow-module`'s original
Decision 4 in full) and instead has validation-workflow export four small use cases of its
own — two that build and persist the `WorkflowInstance` aggregate for a write operation
(matching the rule "the owning bounded context builds and persists its own aggregate"), and
two that proxy its two read methods — so `HazardousEventsModule` depends only on
validation-workflow's own use cases, never on its repository port directly.

## What Changes

- Create `HazardousEventsModule` (`app/domains/hazardous-events/infrastructure/HazardousEventsModule.server.ts`)
  as a NestJS module that:
  - Registers `DrizzleHazardousEventRepository`, `DrizzleCausalChainRepository`,
    `DrizzleHazardTaxonomyRepository`, and `DrizzleDivisionRepository` under four new
    Symbol injection tokens (new token files — see design.md Decision 1; none exist
    in this domain today). **Unchanged by the scope correction — already implemented.**
  - Registers `DrizzleTransactionRunner` under the already-existing `TRANSACTION_RUNNER`
    token (`app/infrastructure/TransactionRunnerToken.ts`) — this module is the first
    consumer to actually wire it into a provider graph (see design.md Decision 2).
    **Unchanged by the scope correction — already implemented.**
  - Imports `ValidationWorkflowModule` directly (not via `CoreModule`) — **corrected**:
    not for `IWorkflowRepository` itself any more, but for the four cross-domain use cases
    described below.
  - Imports `EventCausalityModule` directly for the `EVENT_CAUSALITY_REPOSITORY` token
    `DeleteHazardousEventUseCase` depends on. **Unchanged.**
  - Exports all six Phase 4 use cases, each built via `useFactory` (mirrors
    `NoticesModule`'s pattern). `RecordSpatialObservationUseCase` is exported
    alongside the other five despite `UpdateHazardousEventUseCase` being its only
    current caller (design.md's Risks/Trade-offs section). **Corrected**: the
    `useFactory`/`inject` arrays for `CreateHazardousEventUseCase`,
    `DeleteHazardousEventUseCase`, `GetHazardousEventByIdUseCase`,
    `ListHazardousEventsUseCase`, and `UpdateHazardousEventUseCase` now inject one of
    the four new validation-workflow use cases (below) in place of `WORKFLOW_REPOSITORY`.
- **Corrected (reverses the 2026-10-22 "BREAKING" decision below):**
  `ValidationWorkflowModule`'s `exports` array (`app/domains/validation-workflow/infrastructure/ValidationWorkflowModule.server.ts`)
  does **not** widen to include `WORKFLOW_REPOSITORY`. Task 6.3's earlier edit, which added
  it, is reverted. Instead, validation-workflow gains and exports four new use cases:
  - `InitializeWorkflowInstanceUseCase` — builds and persists a DRAFT `WorkflowInstance`
    for a newly-created entity; replaces `CreateHazardousEventUseCase`'s inline
    `WorkflowInstance.createDraft(...)` + `workflowRepository.insert(...)` call pair.
  - `DeleteWorkflowInstanceUseCase` — removes the `WorkflowInstance` for a deleted entity;
    replaces `DeleteHazardousEventUseCase`'s inline `workflowRepository.deleteByEntity(...)`
    call.
  - `GetWorkflowInstanceByEntityUseCase` — proxies `IWorkflowRepository.findByEntity`;
    replaces the direct call in `GetHazardousEventByIdUseCase` and
    `UpdateHazardousEventUseCase`.
  - `ListWorkflowInstancesByEntityIdsUseCase` — proxies `IWorkflowRepository.findByEntityIds`;
    replaces the direct call in `ListHazardousEventsUseCase`.

  Both write-side use cases accept an optional `tx?: Tx` so `CreateHazardousEventUseCase`'s
  and `DeleteHazardousEventUseCase`'s existing `transactionRunner.run()` atomicity guarantee
  (the HE row and the workflow row commit or roll back together) is preserved exactly —
  see design.md's "Atomicity" section. `ValidationWorkflowModule`'s own
  `"Tokens stay hidden"` comment is restored to its original wording (`ca-validation-workflow-module`
  Decision 4, unmodified) and extended to list the four new use cases in `exports`.
- `CreateHazardousEventUseCase`, `DeleteHazardousEventUseCase`, `GetHazardousEventByIdUseCase`,
  `ListHazardousEventsUseCase`, and `UpdateHazardousEventUseCase` each have their
  `IWorkflowRepository` constructor dependency replaced with
  `Pick<CorrespondingUseCase, "execute">` for whichever of the four new use cases they now
  call — mirroring the existing `Pick<RecordSpatialObservationUseCase, "execute">` pattern
  already used by `UpdateHazardousEventUseCase`. Their own `execute()` bodies change only at
  the single call site that reaches `IWorkflowRepository` today; every other line, every
  thrown error, and every log event is unchanged.
- Update `CoreModule.server.ts` to import `HazardousEventsModule` (not exported —
  mirrors `ValidationWorkflowModule`'s own precedent; see design.md Decision 3).
  **Unchanged by the scope correction.**

## Capabilities

### New Capabilities

- `hazardous-events-module-wiring`: NestJS DI wiring for the hazardous-events
  domain — token resolution for all four repository ports, transaction-runner
  wiring, cross-module imports, use-case export shape, and concurrent compilation,
  mirroring `validation-workflow-module-wiring`'s and `notices-module-wiring`'s shape.
  **Corrected**: the cross-module-import and use-case-wiring requirements now describe
  importing four validation-workflow use cases, not `WORKFLOW_REPOSITORY`.
- `initialize-workflow-instance`: business behaviour of the new
  `InitializeWorkflowInstanceUseCase` (builds + persists a DRAFT `WorkflowInstance`,
  transaction-threading, concurrent-caller behaviour against the table's own unique
  constraint).
- `delete-workflow-instance`: business behaviour of the new
  `DeleteWorkflowInstanceUseCase` (idempotent removal, transaction-threading,
  concurrent-caller behaviour).
- `get-workflow-instance-by-entity`: business behaviour of the new
  `GetWorkflowInstanceByEntityUseCase` (single-entity lookup, null-when-absent,
  concurrent-caller behaviour).
- `list-workflow-instances-by-entity-ids`: business behaviour of the new
  `ListWorkflowInstancesByEntityIdsUseCase` (batched lookup, omits entities with no
  instance, concurrent-caller behaviour).

### Modified Capabilities

- `core-module`: adds the requirement that `CoreModule` imports
  `HazardousEventsModule` and that all six Phase 4 use cases are resolvable from a
  `CoreModule`-based test container, without breaking existing
  `NoticesModule`/`ValidationWorkflowModule`-derived resolution; `HazardousEventsModule`
  is not re-exported. **Unchanged by the scope correction.**
- `validation-workflow-module-wiring`: **corrected** — within the requirement governing
  `exports`, the "neither `WORKFLOW_REPOSITORY` nor `NOTIFICATION_PORT` is exported" rule
  is restored to its original, archived wording unmodified; the requirement's own `exports`
  SHALL-list is widened from `ProcessWorkflowActionUseCase` alone to all five use cases
  (the four new ones plus the unchanged `ProcessWorkflowActionUseCase`). The capability
  also gains new requirements: each of the four new use cases is resolvable from
  `ValidationWorkflowModule` with correctly-wired dependencies.

## Impact

- **Files touched:**
  - `app/domains/hazardous-events/infrastructure/HazardousEventsModule.server.ts`
    (already created — **corrected**: five of its six `useFactory`/`inject` arrays change
    to inject one of the four new validation-workflow use cases instead of
    `WORKFLOW_REPOSITORY`; the `ValidationWorkflowModule`/`EventCausalityModule` imports
    and the four repository-token/`TRANSACTION_RUNNER` registrations are unchanged.)
  - `app/domains/hazardous-events/infrastructure/HazardousEventRepositoryToken.ts`,
    `CausalChainRepositoryToken.ts`, `HazardTaxonomyRepositoryToken.ts`,
    `DivisionRepositoryToken.ts` (already created — unchanged by this correction)
  - `app/infrastructure/CoreModule.server.ts` (already updated — unchanged by this
    correction)
  - `app/domains/validation-workflow/infrastructure/ValidationWorkflowModule.server.ts`
    (already modified to export `WORKFLOW_REPOSITORY` — **corrected**: that export is
    reverted; four new `useFactory` providers/exports are added instead)
  - `app/domains/validation-workflow/application/use-cases/InitializeWorkflowInstance.ts`,
    `DeleteWorkflowInstance.ts`, `GetWorkflowInstanceByEntity.ts`,
    `ListWorkflowInstancesByEntityIds.ts` (new)
  - `app/domains/hazardous-events/application/use-cases/CreateHazardousEvent.ts`,
    `DeleteHazardousEvent.ts`, `GetHazardousEventById.ts`, `ListHazardousEvents.ts`,
    `UpdateHazardousEvent.ts` (modified — constructor dependency swap + single call-site
    change each; see design.md's constructor table)
  - Unit test files for the five HE use cases above (modified — one-line harness-construction
    change each; see tasks.md)
  - `app/domains/validation-workflow/application/use-cases/InitializeWorkflowInstance.test.ts`,
    `DeleteWorkflowInstance.test.ts`, `GetWorkflowInstanceByEntity.test.ts`,
    `ListWorkflowInstancesByEntityIds.test.ts` (new)
  - `tests/integration/domains/hazardous-events/HazardousEventsModule.test.ts` (already
    created — **corrected**: cross-module-import and six-use-case-wiring assertions that
    reference `WORKFLOW_REPOSITORY` are replaced with assertions against the four new
    use-case classes)
  - `tests/integration/domains/hazardous-events/CreateHazardousEventUseCase.test.ts`,
    `DeleteHazardousEventUseCase.test.ts`, `UpdateHazardousEventUseCase.test.ts` (modified
    — construction-site update + one new atomicity-proof test each; see tasks.md and
    design.md's "Atomicity" section)
  - `tests/integration/db/queries/DrizzleHazardousEventRepository.test.ts` (modified —
    one construction site at line ~2226 found by grepping the whole repo for
    `new UpdateHazardousEventUseCase(`, not caught by the original change's own search
    scoped to `tests/integration/domains/hazardous-events/`)
  - `tests/integration/domains/validation-workflow/ValidationWorkflowModule.test.ts`
    (already modified per tasks 6.1/6.2 to assert `WORKFLOW_REPOSITORY` is exported —
    **corrected**: that assertion and its positive-resolution test are removed, restoring
    the original negative "cannot resolve `WORKFLOW_REPOSITORY`" assertion; new assertions
    added for the four new use cases' resolvability and export membership)
  - `openspec/specs/core-module/spec.md` (delta via this change's `specs/core-module/spec.md`
    — unchanged by this correction)
  - `openspec/specs/validation-workflow-module-wiring/spec.md` (delta via this
    change's `specs/validation-workflow-module-wiring/spec.md` — corrected)
  - `openspec/specs/hazardous-events-module-wiring/spec.md` (delta via this change's own
    spec file — corrected)
  - `openspec/specs/initialize-workflow-instance/spec.md`,
    `delete-workflow-instance/spec.md`, `get-workflow-instance-by-entity/spec.md`,
    `list-workflow-instances-by-entity-ids/spec.md` (new, via this change's own spec files)
- **DB migration:** None. The scope correction adds no new table or column —
  `workflow_instance`'s existing `uniqueIndex` on `(entity_id, entity_type)`
  (`ca-validation-workflow-module`, archived) is unchanged and is what gives
  `InitializeWorkflowInstanceUseCase`'s concurrent-callers scenario its deterministic
  outcome (see `specs/initialize-workflow-instance/spec.md`).
- **Test approach:** Integration tier, PGlite (`yarn test:run2`), plus Vitest unit tests
  for the four new validation-workflow use cases and the harness-construction updates to
  the five existing HE use-case unit tests. See tasks.md for the full Red→Green sequencing
  across both domains.
- **Security / multi-tenancy:** None directly — `workflow_instance` has no
  `countryAccountsId` column by design (`ca-validation-workflow-module` schema Decision 2);
  this correction does not change that. The four new use cases add no new tenant-scoping
  concern themselves — they are thin wrappers around the same `IWorkflowRepository` methods
  the removed direct calls already used.
- **Downstream consumers:** `CoreModule` (this change). No controller/route consumes the
  exported use cases yet. Flagged for the user's own decision (not acted on unilaterally,
  see design.md's Risks/Notes): whether to record "a write operation crossing a bounded-context
  boundary goes through the owning context's own exported use case, never its repository
  port directly" as a durable, codebase-wide rule (roadmap or an ADR-009 amendment), given
  this is the first real inter-bounded-context wiring and sets precedent for every future one.
