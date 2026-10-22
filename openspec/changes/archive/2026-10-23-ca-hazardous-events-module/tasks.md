## 1. Repository/runner token files (Red → Green)

- [x] 1.1 Write a failing test in
      `tests/integration/domains/hazardous-events/HazardousEventsModule.test.ts`
      asserting `HAZARDOUS_EVENT_REPOSITORY`, `CAUSAL_CHAIN_REPOSITORY`,
      `HAZARD_TAXONOMY_REPOSITORY`, and `DIVISION_REPOSITORY` are each a `Symbol`
      typed as the matching `InjectionToken<T>` — run via
      `yarn vitest run tests/integration/domains/hazardous-events/HazardousEventsModule.test.ts`
      and confirm it fails because none of the four token files exists yet.
- [x] 1.2 Create `app/domains/hazardous-events/infrastructure/HazardousEventRepositoryToken.ts`
      exporting `HAZARDOUS_EVENT_REPOSITORY: InjectionToken<IHazardousEventRepository> = Symbol("HAZARDOUS_EVENT_REPOSITORY")`,
      mirroring `WorkflowRepositoryToken.ts`'s shape, and verify that slice of 1.1 passes.
- [x] 1.3 Create `app/domains/hazardous-events/infrastructure/CausalChainRepositoryToken.ts`
      exporting `CAUSAL_CHAIN_REPOSITORY: InjectionToken<ICausalChainRepository> = Symbol("CAUSAL_CHAIN_REPOSITORY")`
      and verify that slice of 1.1 passes.
- [x] 1.4 Create `app/domains/hazardous-events/infrastructure/HazardTaxonomyRepositoryToken.ts`
      exporting `HAZARD_TAXONOMY_REPOSITORY: InjectionToken<IHazardTaxonomyRepository> = Symbol("HAZARD_TAXONOMY_REPOSITORY")`
      and verify that slice of 1.1 passes.
- [x] 1.5 Create `app/domains/hazardous-events/infrastructure/DivisionRepositoryToken.ts`
      exporting `DIVISION_REPOSITORY: InjectionToken<IDivisionRepository> = Symbol("DIVISION_REPOSITORY")`
      and verify that slice of 1.1 passes.
- [x] 1.6 Confirm `TRANSACTION_RUNNER` (`app/infrastructure/TransactionRunnerToken.ts`)
      already exists and needs no new token file — only a new registration inside
      `HazardousEventsModule` (design.md Decision 2); no code change in this task.

## 2. HazardousEventsModule — repository/runner wiring (Red → Green)

- [x] 2.1 Write a failing test: `Test.createTestingModule({ imports:
      [HazardousEventsModule] }).compile()` resolves without throwing — run and
      confirm it fails (module file does not exist yet).
- [x] 2.2 Create `app/domains/hazardous-events/infrastructure/HazardousEventsModule.server.ts`
      (`.server.ts` suffix — see proposal.md's flagged filename deviation) with
      `DrizzleProvider` and `useClass` registrations for all four new tokens
      (`HAZARDOUS_EVENT_REPOSITORY` → `DrizzleHazardousEventRepository`,
      `CAUSAL_CHAIN_REPOSITORY` → `DrizzleCausalChainRepository`,
      `HAZARD_TAXONOMY_REPOSITORY` → `DrizzleHazardTaxonomyRepository`,
      `DIVISION_REPOSITORY` → `DrizzleDivisionRepository`) plus `TRANSACTION_RUNNER`
      → `DrizzleTransactionRunner` (no `exports` yet), and verify task 2.1 passes.
- [x] 2.3 Write failing tests asserting each of `module.get(HAZARDOUS_EVENT_REPOSITORY)`,
      `module.get(CAUSAL_CHAIN_REPOSITORY)`, `module.get(HAZARD_TAXONOMY_REPOSITORY)`,
      `module.get(DIVISION_REPOSITORY)`, and `module.get(TRANSACTION_RUNNER)` resolves
      to an instance of its matching adapter class, and that each resolves to the
      identical singleton on repeated gets — confirm all pass against task 2.2's
      module (no further code expected; flag immediately if any fails).
- [x] 2.4 Write a failing test asserting that a second NestJS module importing
      `HazardousEventsModule` cannot resolve any of the five tokens from 2.3 via
      `@Inject()` (each throws a "no provider for ..." resolution error) — confirm
      this already passes once 2.2 lands, since none of the five tokens is in
      `exports` (documents the intentional hiding; no code change expected).

## 3. ValidationWorkflow — InitializeWorkflowInstanceUseCase (Red → Green)

**Scope correction (2026-10-22):** this section is new, added by the SOLID-review-driven
correction described in proposal.md/design.md. It did not exist in the original tasks.md.

- [x] 3.1 Write `app/domains/validation-workflow/application/use-cases/InitializeWorkflowInstance.test.ts`
      (unit test, following `ProcessWorkflowAction.test.ts`'s own harness-with-fake-repository
      convention), covering per `specs/initialize-workflow-instance/spec.md`: a new DRAFT
      `WorkflowInstance` is built (fresh `id`, one internally-computed `now`, correct
      `entityId`/`entityType`, every attribution field `null`) and persisted via
      `IWorkflowRepository.insert()`; the use case's return value is the repository's
      resolved value, not the pre-insert instance; `command.tx` is threaded to `insert()`
      unmodified when present, and `undefined` is passed when `command.tx` is omitted; no
      `ILogger` method is ever called. Run and confirm every assertion fails (the source
      file does not exist yet).
- [x] 3.2 Create `app/domains/validation-workflow/application/use-cases/InitializeWorkflowInstance.ts`
      exporting `InitializeWorkflowInstanceCommand { entityId: string; entityType: EntityType; tx?: Tx }`
      and `InitializeWorkflowInstanceUseCase`, constructor `(workflowRepository: IWorkflowRepository)`
      (no `ILogger` — design.md Decision 7), `execute()` generating its own `id`
      (`crypto.randomUUID()`) and `now` (`new Date()`), calling
      `WorkflowInstance.createDraft({ id, entityId: command.entityId, entityType: command.entityType, now })`
      then `this.workflowRepository.insert(instance, command.tx)`, returning the insert's
      resolved value. Verify task 3.1 passes.
- [x] 3.3 Write a failing unit test (same file) for the two concurrent-callers scenarios
      in `specs/initialize-workflow-instance/spec.md`: two concurrent `execute()` calls for
      *different* `entityId`s both resolve, each with its own `id`; two concurrent calls for
      the *same* `entityId`/`entityType` against a fake repository that simulates the real
      unique-constraint behaviour (first `insert()` call for a given key succeeds, the
      second rejects) resolve as one success + one rejection, with the rejection surfaced
      unmodified — confirm this passes immediately once 3.2 lands (no use-case-level locking
      is added; the fake's own behaviour is what's asserted). Flag immediately if it fails
      for any reason other than the fake needing this behaviour added to it.

## 4. ValidationWorkflow — DeleteWorkflowInstanceUseCase (Red → Green)

**Scope correction (2026-10-22):** new section.

- [x] 4.1 Write `app/domains/validation-workflow/application/use-cases/DeleteWorkflowInstance.test.ts`
      covering per `specs/delete-workflow-instance/spec.md`: `execute()` calls
      `IWorkflowRepository.deleteByEntity(entityId, entityType, tx)` exactly once and
      resolves, both when an instance exists and when none does (idempotent — no throw);
      `command.tx` is threaded unmodified, `undefined` when omitted; no `ILogger` method is
      ever called. Run and confirm every assertion fails (source file does not exist yet).
- [x] 4.2 Create `app/domains/validation-workflow/application/use-cases/DeleteWorkflowInstance.ts`
      exporting `DeleteWorkflowInstanceCommand { entityId: string; entityType: EntityType; tx?: Tx }`
      and `DeleteWorkflowInstanceUseCase`, constructor `(workflowRepository: IWorkflowRepository)`
      (no `ILogger`), `execute()` calling
      `this.workflowRepository.deleteByEntity(command.entityId, command.entityType, command.tx)`
      and resolving. Verify task 4.1 passes.
- [x] 4.3 Write a failing unit test (same file) for the concurrent-callers scenario in
      `specs/delete-workflow-instance/spec.md`: two concurrent `execute()` calls for the
      same `entityId`/`entityType` against a fake repository simulating
      `deleteByEntity`'s idempotent contract both resolve successfully (neither rejects) —
      confirm this passes immediately once 4.2 lands.

## 5. ValidationWorkflow — GetWorkflowInstanceByEntityUseCase (Red → Green)

**Scope correction (2026-10-22):** new section.

- [x] 5.1 Write `app/domains/validation-workflow/application/use-cases/GetWorkflowInstanceByEntity.test.ts`
      covering per `specs/get-workflow-instance-by-entity/spec.md`: `execute()` calls
      `IWorkflowRepository.findByEntity(entityId, entityType)` and returns its result
      unmodified, including `null` when absent, without throwing; no `ILogger` method is
      ever called. Run and confirm every assertion fails (source file does not exist yet).
- [x] 5.2 Create `app/domains/validation-workflow/application/use-cases/GetWorkflowInstanceByEntity.ts`
      exporting `GetWorkflowInstanceByEntityQuery { entityId: string; entityType: EntityType }`
      and `GetWorkflowInstanceByEntityUseCase`, constructor `(workflowRepository: IWorkflowRepository)`
      (no `ILogger`), `execute()` returning
      `this.workflowRepository.findByEntity(query.entityId, query.entityType)` directly.
      Verify task 5.1 passes.
- [x] 5.3 Write a failing unit test (same file) for the concurrent-callers scenario in
      `specs/get-workflow-instance-by-entity/spec.md`: two concurrent `execute()` calls for
      the same `entityId`/`entityType` both resolve to the current state, and
      `findByEntity` is called exactly twice (once per call, never coalesced) — confirm
      this passes immediately once 5.2 lands.

## 6. ValidationWorkflow — ListWorkflowInstancesByEntityIdsUseCase (Red → Green)

**Scope correction (2026-10-22):** new section.

- [x] 6.1 Write `app/domains/validation-workflow/application/use-cases/ListWorkflowInstancesByEntityIds.test.ts`
      covering per `specs/list-workflow-instances-by-entity-ids/spec.md`: `execute()` calls
      `IWorkflowRepository.findByEntityIds(entityIds, entityType)` and returns its result
      unmodified (entities with no instance omitted, not nulled); an empty `entityIds`
      resolves to `[]` without throwing; no `ILogger` method is ever called. Run and
      confirm every assertion fails (source file does not exist yet).
- [x] 6.2 Create `app/domains/validation-workflow/application/use-cases/ListWorkflowInstancesByEntityIds.ts`
      exporting `ListWorkflowInstancesByEntityIdsQuery { entityIds: string[]; entityType: EntityType }`
      and `ListWorkflowInstancesByEntityIdsUseCase`, constructor
      `(workflowRepository: IWorkflowRepository)` (no `ILogger`), `execute()` returning
      `this.workflowRepository.findByEntityIds(query.entityIds, query.entityType)` directly.
      Verify task 6.1 passes.
- [x] 6.3 Write a failing unit test (same file) for the concurrent-callers scenario in
      `specs/list-workflow-instances-by-entity-ids/spec.md`: two concurrent `execute()`
      calls for overlapping `entityIds` subsets both resolve to their own requested
      subset's current state, and `findByEntityIds` is called exactly twice — confirm this
      passes immediately once 6.2 lands.

## 7. ValidationWorkflowModule — revert WORKFLOW_REPOSITORY export, export the four new use cases (Red → Green)

**Scope correction (2026-10-22) — this section fully replaces the original Section 6**
("Widen ValidationWorkflowModule's exports"). Task 6.3's edit (adding `WORKFLOW_REPOSITORY`
to `exports`) and tasks 6.1/6.2's test edits are reverted by this section, not left in place.

- [x] 7.1 In `tests/integration/domains/validation-workflow/ValidationWorkflowModule.test.ts`:
      restore the original negative assertion removed by task 6.1
      (`"a second module importing ValidationWorkflowModule cannot resolve
      WORKFLOW_REPOSITORY via token injection"`, asserting `compile()` rejects with
      `/Symbol\(WORKFLOW_REPOSITORY\)/`), and delete the positive test task 6.2 added
      (`"a second module importing ValidationWorkflowModule can resolve WORKFLOW_REPOSITORY
      directly"`, under the `describe("exported tokens", ...)` block — delete that whole
      block, it no longer has a reason to exist). Update the `"exports metadata"` block's
      assertion to expect
      `[ProcessWorkflowActionUseCase, InitializeWorkflowInstanceUseCase,
      DeleteWorkflowInstanceUseCase, GetWorkflowInstanceByEntityUseCase,
      ListWorkflowInstancesByEntityIdsUseCase]` (not `[ProcessWorkflowActionUseCase,
      WORKFLOW_REPOSITORY]`). Run the file and confirm every one of these assertions now
      fails against the still-unreverted module from task 6.3 (module not corrected yet).
- [x] 7.2 In the same file, add four new tests mirroring
      `"ProcessWorkflowActionUseCase resolves to a defined instance"`/`"ProcessWorkflowActionUseCase's
      injected dependencies are the module's own singletons"`: for each of
      `InitializeWorkflowInstanceUseCase`, `DeleteWorkflowInstanceUseCase`,
      `GetWorkflowInstanceByEntityUseCase`, and `ListWorkflowInstancesByEntityIdsUseCase`,
      assert `module.get(...)` resolves to a defined instance whose `workflowRepository`
      field is the exact `module.get(WORKFLOW_REPOSITORY)` singleton. Confirm these fail
      (not registered yet).
- [x] 7.3 Add four new tests under a `describe("exported use cases", ...)` block mirroring
      the pattern task 6.2 used (now deleted) for each of the four new use cases: a
      `ConsumerModule` that imports `ValidationWorkflowModule` and injects the use case via
      its own `useFactory`'s `inject` array compiles successfully and resolves the same
      singleton — confirm all four fail first (not exported yet).
- [x] 7.4 In `app/domains/validation-workflow/infrastructure/ValidationWorkflowModule.server.ts`:
      remove `WORKFLOW_REPOSITORY` from `exports` (reverting task 6.3); add four `useFactory`
      providers (one per new use case, each `inject: [WORKFLOW_REPOSITORY]`, mirroring
      `ProcessWorkflowActionUseCase`'s own existing `useFactory` shape but with a single
      dependency and no `getPinoLogger()` call — design.md Decision 7); add all four to
      `exports` alongside the unchanged `ProcessWorkflowActionUseCase`; restore the
      `// Tokens stay hidden — design.md Decision 4.` comment to its original, unqualified
      wording (both `WORKFLOW_REPOSITORY` and `NOTIFICATION_PORT` stay hidden — the comment
      no longer needs the "only NOTIFICATION_PORT" qualifier task 6.3 added, since
      `WORKFLOW_REPOSITORY` is hidden again too). Verify tasks 7.1, 7.2, and 7.3 all pass.
- [x] 7.5 Update the `describe("concurrent compilation", ...)` block's existing assertions
      (currently covering `ProcessWorkflowActionUseCase`/`WORKFLOW_REPOSITORY`/
      `NOTIFICATION_PORT` only) to also resolve and assert distinct-per-container instances
      for the four new use cases. Run and confirm the new parts fail first (not registered
      until 7.4), then pass after 7.4.

## 8. Hazardous-events use cases — constructor swap (Red → Green)

**Scope correction (2026-10-22):** this section is new. It replaces the direct
`IWorkflowRepository` dependency in each of the five affected HE use cases with
`Pick<CorrespondingNewUseCase, "execute">`, per design.md's constructor table. Per
design.md Decision 6, each new use case returns the same `WorkflowInstance` domain-entity
shape `IWorkflowRepository` already returned, so **every existing assertion in each unit
test file below needs zero content changes** — only each file's `createHarness()` (or
equivalent) construction line changes, to wrap the same `FakeWorkflowRepository` fake in a
real instance of the corresponding new use case. Confirm this minimal-diff claim is
actually true for each file as you go; if an existing assertion does need a content change
beyond the construction line, that is a signal the "zero behaviour change" claim in
proposal.md/design.md needs revisiting — stop and report it rather than forcing the test to
pass.

- [x] 8.1 In `app/domains/hazardous-events/application/use-cases/CreateHazardousEvent.ts`:
      change the constructor's fourth parameter from `workflowRepository: IWorkflowRepository`
      to `initializeWorkflowInstanceUseCase: Pick<InitializeWorkflowInstanceUseCase, "execute">`;
      replace the inline `WorkflowInstance.createDraft(...)` + `this.workflowRepository.insert(workflowInstance, tx)`
      call pair (lines ~179-188) with
      `const savedWorkflow = await this.initializeWorkflowInstanceUseCase.execute({ entityId: saved.id, entityType: "HE", tx });`;
      remove the now-unused `WorkflowInstance` value import (keep if anything else in the
      file still needs it — verify before removing) and the `IWorkflowRepository` type
      import, replacing it with an `InitializeWorkflowInstanceUseCase` type import.
- [x] 8.2 In `app/domains/hazardous-events/application/use-cases/CreateHazardousEvent.test.ts`:
      in `createHarness()`, change the `useCase` construction's fourth argument from
      `workflowRepository` to `new InitializeWorkflowInstanceUseCase(workflowRepository)`
      (the harness's own `FakeWorkflowRepository` instance, unchanged, now wrapped). Run the
      full file and confirm every existing assertion still passes with zero content
      changes, per this section's own stated expectation — flag immediately if any
      assertion needs more than this one line changed.
- [x] 8.3 In `app/domains/hazardous-events/application/use-cases/DeleteHazardousEvent.ts`:
      change the constructor's fifth parameter from `workflowRepository: IWorkflowRepository`
      to `deleteWorkflowInstanceUseCase: Pick<DeleteWorkflowInstanceUseCase, "execute">`;
      replace `await this.workflowRepository.deleteByEntity(command.id, "HE", tx);` (line
      ~120) with
      `await this.deleteWorkflowInstanceUseCase.execute({ entityId: command.id, entityType: "HE", tx });`.
- [x] 8.4 In `app/domains/hazardous-events/application/use-cases/DeleteHazardousEvent.test.ts`:
      update both `useCase` construction sites (lines ~343 and ~946) to wrap the harness's
      `FakeWorkflowRepository`/local fake in `new DeleteWorkflowInstanceUseCase(workflowRepository)`.
      Run the full file and confirm every existing assertion still passes unchanged.
- [x] 8.5 In `app/domains/hazardous-events/application/use-cases/GetHazardousEventById.ts`:
      change the constructor's third parameter from `workflowRepository: IWorkflowRepository`
      to `getWorkflowInstanceByEntityUseCase: Pick<GetWorkflowInstanceByEntityUseCase, "execute">`;
      replace `this.workflowRepository.findByEntity(event.id, "HE")` (line ~32) with
      `this.getWorkflowInstanceByEntityUseCase.execute({ entityId: event.id, entityType: "HE" })`.
- [x] 8.6 In `app/domains/hazardous-events/application/use-cases/GetHazardousEventById.test.ts`:
      update every `useCase` construction site (eight sites, per the whole-repo grep —
      lines ~232, 252, 266, 286, 308, 333, 360, 382, 410, 427, 467; confirm the exact count
      and line numbers against the current file state, they may have shifted) to wrap the
      fake in `new GetWorkflowInstanceByEntityUseCase(workflowRepository)`. Run the full
      file and confirm every existing assertion still passes unchanged.
- [x] 8.7 In `app/domains/hazardous-events/application/use-cases/ListHazardousEvents.ts`:
      change the constructor's third parameter from `workflowRepository: IWorkflowRepository`
      to `listWorkflowInstancesByEntityIdsUseCase: Pick<ListWorkflowInstancesByEntityIdsUseCase, "execute">`;
      replace `this.workflowRepository.findByEntityIds(ids, "HE")` (line ~50) with
      `this.listWorkflowInstancesByEntityIdsUseCase.execute({ entityIds: ids, entityType: "HE" })`.
- [x] 8.8 In `app/domains/hazardous-events/application/use-cases/ListHazardousEvents.test.ts`:
      update every `useCase` construction site (confirm exact count and line numbers
      against the current file state) to wrap the fake in
      `new ListWorkflowInstancesByEntityIdsUseCase(workflowRepository)`. Run the full file
      and confirm every existing assertion still passes unchanged.
- [x] 8.9 In `app/domains/hazardous-events/application/use-cases/UpdateHazardousEvent.ts`:
      change the constructor's third parameter from `workflowRepository: IWorkflowRepository`
      to `getWorkflowInstanceByEntityUseCase: Pick<GetWorkflowInstanceByEntityUseCase, "execute">`
      (this use case never writes to the workflow instance — confirmed by grep, it only
      calls `findByEntity`, never `update`/`insert`/`deleteByEntity` — so it needs the Get
      query use case only, not Initialize or Delete); replace
      `this.workflowRepository.findByEntity(existingEvent.id, "HE")` (line ~189) with
      `this.getWorkflowInstanceByEntityUseCase.execute({ entityId: existingEvent.id, entityType: "HE" })`.
- [x] 8.10 In `app/domains/hazardous-events/application/use-cases/UpdateHazardousEvent.test.ts`:
      update the `useCase` construction site (line ~459) to wrap the fake in
      `new GetWorkflowInstanceByEntityUseCase(workflowRepository)`. Run the full file and
      confirm every existing assertion still passes unchanged.

## 9. Hazardous-events integration tests — construction sites and atomicity proofs (Red → Green)

**Scope correction (2026-10-22):** this section is new.

- [x] 9.1 Update the `useCase` construction sites in
      `tests/integration/domains/hazardous-events/CreateHazardousEventUseCase.test.ts`
      (lines ~73 and ~140) to wrap the real `DrizzleWorkflowRepository` instance in
      `new InitializeWorkflowInstanceUseCase(workflowRepository)`. Run the file and confirm
      both existing rollback-proof tests still pass.
- [x] 9.2 Add a new assertion to the existing "a stubbed rejection on the causal edge save,
      with a causeId present, leaves zero rows persisted" test (same file, ~line 122):
      after the existing `hazardousEventTable` row-count assertion, also assert
      `(await dr.select().from(workflowInstanceTable)).length` is `0` (import
      `workflowInstanceTable` from `~/domains/validation-workflow/infrastructure/workflowInstanceTable`).
      This is the missing proof, per design.md's "Atomicity" section, that
      `InitializeWorkflowInstanceUseCase` threads `tx` through to
      `IWorkflowRepository.insert()` correctly — without it, a forgotten `tx` would leave
      an orphaned committed workflow row that this test did not previously catch. Run and
      confirm it passes (it should, if 8.1/9.1 were done correctly — if it fails, that is a
      real bug in the new use case's `tx` threading, not a test to loosen).
- [x] 9.3 Update the `useCase` construction site in
      `tests/integration/domains/hazardous-events/DeleteHazardousEventUseCase.test.ts`
      (line ~107) to wrap the real `DrizzleWorkflowRepository` instance in
      `new DeleteWorkflowInstanceUseCase(workflowRepository)`. Run the file and confirm the
      existing "DEF-033 lock proof" describe block's tests still pass.
- [x] 9.4 Add a new test to the same file's `describe("DeleteHazardousEventUseCase against
      real adapters (DEF-033 lock proof)", ...)` block: stub
      `harness.hazardousEventRepository.delete` (not `deleteByEntity`, which the existing
      test already covers) to reject after `deleteByEntity` has already run; assert
      `execute()` rejects with that error, then assert both
      `harness.workflowRepository.findByEntity(id, "HE")` resolves to a non-null value
      (the workflow row is still present — the earlier `deleteByEntity` rolled back too)
      and `harness.hazardousEventRepository.findById(id, tenantId)` resolves (the HE row is
      still present). This is the missing proof, per design.md's "Atomicity" section, that
      `DeleteWorkflowInstanceUseCase` threads `tx` through to
      `IWorkflowRepository.deleteByEntity()` correctly when a *later* step fails — the
      existing test only stubs `deleteByEntity` itself, which cannot catch this class of
      bug. Run and confirm it passes.
- [x] 9.5 Update the three `useCase` construction sites in
      `tests/integration/domains/hazardous-events/UpdateHazardousEventUseCase.test.ts`
      (lines ~106, ~191, ~271) to wrap the real `DrizzleWorkflowRepository` instance in
      `new GetWorkflowInstanceByEntityUseCase(workflowRepository)`. Run the file and
      confirm every existing test still passes.
- [x] 9.6 Update the `useCase` construction site in
      `tests/integration/db/queries/DrizzleHazardousEventRepository.test.ts` (line ~2226 —
      found by grepping the whole repo for `new UpdateHazardousEventUseCase(`, not caught
      by the original tasks.md's search, which was scoped to
      `tests/integration/domains/hazardous-events/`) to wrap the real
      `DrizzleWorkflowRepository` instance in
      `new GetWorkflowInstanceByEntityUseCase(workflowRepository)`. Run the file and
      confirm every existing test still passes.

## 10. HazardousEventsModule — cross-module imports (Red → Green)

**Scope correction (2026-10-22) — this section replaces the original Section 3.** The
`ValidationWorkflowModule`/`EventCausalityModule` imports themselves are already correct
and need no code change; only the test coverage for *what* is resolvable through the
`ValidationWorkflowModule` import changes, from `WORKFLOW_REPOSITORY` to the four new use
cases.

- [x] 10.1 In `tests/integration/domains/hazardous-events/HazardousEventsModule.test.ts`,
      replace the `describe("cross-module imports", ...)` block's existing
      `"WORKFLOW_REPOSITORY resolves to an instance of DrizzleWorkflowRepository inside the
      compiled module"` test with four tests asserting
      `module.get(InitializeWorkflowInstanceUseCase)`,
      `module.get(DeleteWorkflowInstanceUseCase)`,
      `module.get(GetWorkflowInstanceByEntityUseCase)`, and
      `module.get(ListWorkflowInstancesByEntityIdsUseCase)` each resolve to a defined
      instance. Remove the now-unused `WORKFLOW_REPOSITORY`/`DrizzleWorkflowRepository`
      imports from this test file if nothing else in it still needs them. Run and confirm
      these four new assertions fail (`HazardousEventsModule.server.ts` not yet rewired —
      Section 11 below).
- [x] 10.2 `ValidationWorkflowModule` and `EventCausalityModule` are already in
      `HazardousEventsModule`'s `imports` array (task 3.2/3.4 from the original tasks.md) —
      no code change needed here; this scope correction only changes *what* is consumed
      through those imports (Section 11), not the imports themselves.
- [x] 10.3 The `EVENT_CAUSALITY_REPOSITORY` cross-module-import test and its passing status
      are unaffected by this correction — no change.

## 11. HazardousEventsModule — six use cases rewiring (Red → Green)

**Scope correction (2026-10-22) — this section replaces the original Section 4's content**
for the five affected use cases (`RecordSpatialObservationUseCase`'s own wiring, task
4.5/4.6 in the original, is unaffected and not touched here).

- [x] 11.1 In `tests/integration/domains/hazardous-events/HazardousEventsModule.test.ts`,
      update the five existing field-identity assertions under
      `describe("six Phase 4 use cases", ...)` that currently check
      `fields.workflowRepository` against `module.get(WORKFLOW_REPOSITORY)` (for
      `GetHazardousEventByIdUseCase`, `ListHazardousEventsUseCase`,
      `CreateHazardousEventUseCase`, `DeleteHazardousEventUseCase`, and
      `UpdateHazardousEventUseCase`) to instead check the renamed field
      (`getWorkflowInstanceByEntityUseCase`, `listWorkflowInstancesByEntityIdsUseCase`,
      `initializeWorkflowInstanceUseCase`, `deleteWorkflowInstanceUseCase`, or
      `getWorkflowInstanceByEntityUseCase` respectively — per design.md's constructor
      table) against `module.get(TheCorrespondingUseCaseClass)`. Run and confirm these five
      updated assertions fail (module not rewired yet).
- [x] 11.2 In `app/domains/hazardous-events/infrastructure/HazardousEventsModule.server.ts`:
      remove the `WORKFLOW_REPOSITORY`/`IWorkflowRepository` imports; import the four new
      validation-workflow use case classes; update the `useFactory`/`inject` arrays for
      `GetHazardousEventByIdUseCase` (`inject: [HAZARDOUS_EVENT_REPOSITORY,
      GetWorkflowInstanceByEntityUseCase]`), `ListHazardousEventsUseCase` (`inject:
      [HAZARDOUS_EVENT_REPOSITORY, ListWorkflowInstancesByEntityIdsUseCase]`),
      `CreateHazardousEventUseCase` (`inject: [HAZARD_TAXONOMY_REPOSITORY,
      HAZARDOUS_EVENT_REPOSITORY, InitializeWorkflowInstanceUseCase,
      CAUSAL_CHAIN_REPOSITORY, TRANSACTION_RUNNER]`), `DeleteHazardousEventUseCase`
      (`inject: [HAZARDOUS_EVENT_REPOSITORY, EVENT_CAUSALITY_REPOSITORY,
      CAUSAL_CHAIN_REPOSITORY, DeleteWorkflowInstanceUseCase, TRANSACTION_RUNNER]`), and
      `UpdateHazardousEventUseCase` (`inject: [HAZARD_TAXONOMY_REPOSITORY,
      HAZARDOUS_EVENT_REPOSITORY, GetWorkflowInstanceByEntityUseCase,
      CAUSAL_CHAIN_REPOSITORY, RecordSpatialObservationUseCase, TRANSACTION_RUNNER]`) —
      inject order must match each constructor's declared order exactly (design.md's
      constructor table; positional and untyped at this call site, design.md's original
      Decision 5, unchanged). `RecordSpatialObservationUseCase`'s own provider/export is
      untouched. Verify tasks 10.1 and 11.1 both pass.
- [x] 11.3 Write a failing test asserting that none of `HazardousEventsModule`'s own
      `useFactory` `inject` arrays names `WORKFLOW_REPOSITORY` (per
      `specs/hazardous-events-module-wiring/spec.md`'s own "WORKFLOW_REPOSITORY is not a
      dependency of any HazardousEventsModule provider" requirement) — confirm it passes
      immediately once 11.2 lands (documents the corrected shape; no further code change
      expected).

## 12. Behavioral round-trip and concurrency (re-verify after rewiring)

**Scope correction (2026-10-22):** the original Section 5 is kept, re-verified against the
rewired module rather than rewritten — the round-trip test exercises each use case's
`execute()` through its public contract, which is unchanged by this correction.

- [x] 12.1 The sequential Create → GetById → List → Update(with spatialObservation) →
      Delete round-trip test (originally task 5.1) is unaffected in shape by this
      correction — re-run it (`yarn vitest run
      tests/integration/domains/hazardous-events/HazardousEventsModule.test.ts`) after
      Section 11 lands and confirm it still passes. If it fails, that is a real
      constructor-wiring bug introduced by this correction (exactly the class of bug this
      test exists to catch) — fix the wiring, do not loosen the test.
- [x] 12.2 The concurrent-compilation test (originally task 5.2) is unaffected in shape —
      re-run it after Section 11 lands and confirm it still passes.

## 13. CoreModule integration (re-verify after rewiring)

**Scope correction (2026-10-22):** the original Section 7 is kept, re-verified — `CoreModule`
only imports `HazardousEventsModule` and `ValidationWorkflowModule`; neither import itself
changes, only what's inside each module's own provider graph.

- [x] 13.1 `CoreModule` still compiles and all six Phase 4 use cases still resolve from it
      (originally tasks 7.1-7.3) — re-run
      `yarn vitest run tests/integration/domains/validation-workflow/ValidationWorkflowModule.test.ts`'s
      `"ValidationWorkflowModule — CoreModule resolution"` block and
      `tests/integration/domains/hazardous-events/HazardousEventsModule.test.ts`'s
      `"HazardousEventsModule — CoreModule resolution"` block after Sections 7 and 11 land,
      and confirm both still pass.
- [x] 13.2 The regression assertion that `CoreModule`'s own `exports` contains
      `DrizzleProvider`/`NoticesModule` and excludes both `ValidationWorkflowModule` and
      `HazardousEventsModule` (originally task 7.4) is unaffected — re-run and confirm it
      still passes.
- [x] 13.3 Re-run `yarn vitest run tests/integration/domains/notices/NoticesModule.test.ts`
      (originally task 7.5) and confirm `CreateNoticeUseCase`, `ListNoticesUseCase`, and
      `GetNoticeByIdUseCase` still resolve unchanged — this test file is untouched by this
      correction.

## 14. Refactor

- [x] 14.1 Review every file touched by Sections 3-11 (the four new validation-workflow use
      cases and their token-free constructors, `ValidationWorkflowModule.server.ts`, the
      five modified HE use cases, `HazardousEventsModule.server.ts`, and every touched test
      file) for naming/comment consistency with `ProcessWorkflowAction.ts` and
      `RecordSpatialObservation.ts`; tighten any comment that merely restates the code
      rather than explaining a WHY-level decision. Confirm every comment referencing the
      reverted `WORKFLOW_REPOSITORY`-export design (e.g. any surviving
      "design.md Decision 4" comment pointing at the old widening) is updated to point at
      the corrected decision instead — a stale comment citing a reverted decision is worse
      than no comment.
- [x] 14.2 Re-run every test file touched by Sections 3-11 after any refactor to confirm all
      assertions are still green:
      `yarn vitest run app/domains/validation-workflow/application/use-cases/InitializeWorkflowInstance.test.ts app/domains/validation-workflow/application/use-cases/DeleteWorkflowInstance.test.ts app/domains/validation-workflow/application/use-cases/GetWorkflowInstanceByEntity.test.ts app/domains/validation-workflow/application/use-cases/ListWorkflowInstancesByEntityIds.test.ts`,
      `yarn vitest run app/domains/hazardous-events/application/use-cases/`,
      `yarn vitest run tests/integration/domains/hazardous-events/`,
      `yarn vitest run tests/integration/domains/validation-workflow/ValidationWorkflowModule.test.ts`,
      and `yarn vitest run tests/integration/db/queries/DrizzleHazardousEventRepository.test.ts`.

## 15. Quality gates

**Scope correction (2026-10-22):** gate scope is widened from the original tasks.md.
Sections 3-11 add real implementation logic (not pure DI wiring), so 15.5 and 15.11 are
widened accordingly, and 15.11 is now mandatory rather than DI-wiring-only.

- [x] 15.1 `yarn vitest run tests/integration/domains/hazardous-events/HazardousEventsModule.test.ts`,
      `yarn vitest run tests/integration/domains/validation-workflow/ValidationWorkflowModule.test.ts`,
      and every test file listed in task 14.2 — all still green.
- [x] 15.2 `yarn tsc` — zero TypeScript errors.
- [x] 15.3 `yarn format:check` — Prettier clean (run `npx prettier --check` scoped to the
      touched files only if not; never a bulk `yarn format`).
- [x] 15.4 Anti-pattern review — check `.github/skills/anti-pattern-check/SKILL.md` against
      all touched files, including the four new validation-workflow use-case files.
- [x] 15.5 SOLID review — invoke `solid-reviewer` agent on the four new
      validation-workflow use-case files, `ValidationWorkflowModule.server.ts`'s diff, the
      five modified HE use-case files' diffs, and `HazardousEventsModule.server.ts`'s diff.
      This is specifically the gate that found the original design flaw this correction
      fixes — give it the corrected design, not just the DI-wiring files the original
      narrower scope covered.
- [x] 15.6 Documentation review (fresh subagent, not self-review) — comments explain WHY
      not WHAT, one full-diff sweep before the final report, covering every file in
      Sections 3-11.
- [x] 15.7 Project conventions review — check `.github/copilot-instructions.md`.
- [x] 15.8 Code review — run `.github/skills/code-review/SKILL.md` in full, via a fresh
      subagent.
- [x] 15.9 Visual/UX parity review — SKIPPED: this change touches no file under
      `app/domains/*/presentation/` or `app/routes/` (pure NestJS DI wiring plus
      application-layer use cases, no controller or route).
- [x] 15.10 Independent second-opinion review — SKIPPED (user decision, 2026-10-22): the
      genuine built-in `/code-review` command is structurally unreachable by any agent in
      this environment, confirmed twice independently (two separate fresh subagent
      sessions) — this repo's own `.github/skills/code-review/SKILL.md` is literally named
      `code-review` and shadows the bundled command for any agent-invoked `Skill` call; the
      `/review` alias is also not reachable. A manual second-opinion pass was still run in
      its place (full diff read, `design.md` cross-check, independent `tsc --noEmit`
      verification, constructor/`useFactory` order re-check) and found 2 documentation
      inaccuracies (both fixed — see `design.md`'s "A durable rule..." section and this
      file's own 5g roadmap entry) plus one accepted, non-blocking design observation
      (`DeleteWorkflowInstanceUseCase`'s lack of added invariants, left as-is — matches
      pre-existing behavior, not a regression). Treated as sufficient coverage alongside
      the SOLID review and sdd-implementer's own self-review; not re-attempted a third time.
- [x] 15.11 Test quality audit — invoke `test-quality-auditor` scoped to the four new
      validation-workflow use-case files and the five modified HE use-case files. This is
      now **mandatory, not DI-wiring-only**, because Sections 3-11 add real
      application-layer implementation logic (constructing/persisting/removing/querying a
      domain aggregate), unlike the original narrower scope which covered only
      `@Module()`-decorated DI wiring and token files. `HazardousEventsModule.server.ts`
      and the four token files keep the original expectation of 0 mutants on
      `@Module()`-decorated content and `Symbol()` description strings (structural tool
      exclusion, not a quality gap, per `ca-validation-workflow-module`'s own confirmed
      finding — no new DEF entry). Resolve any real gap the audit finds in the
      application-layer files.

## 16. Regression and archive

- [x] 16.1 `yarn test:run2` (full PGlite suite) — confirm no new failures. Any
      failure must be verified against a clean run of the same suite on the base
      branch (`feature/he-ca-phase5`) before being called pre-existing; do not
      assume based on filename or unrelated-looking stack trace alone.
- [x] 16.2 Run `opsx:archive` on this branch (`feature/ca-hazardous-events-module`)
      before raising the PR.
