## 1. ICausalChainRepository.countEdgesTouching — new port method

- [x] 1.1 Extend `app/domains/hazardous-events/application/ports/ICausalChainRepository.test.ts`:
      add `countEdgesTouching` to `FakeCausalChainRepository` (count rows in `this.edges` where
      `nodeId` equals either `edge.causeId` or `edge.effectId`) and write the five scenarios from
      `specs/causal-chain-repository-port/spec.md` (zero edges, cause-only, effect-only
      — explicitly proving this differs from `findReachableEdgesFrom`'s forward-only result for
      the same node, both-sides, unrelated edge excluded). Add the compile-time arity assertion
      (`AssertEqual<Parameters<ICausalChainRepository["countEdgesTouching"]>, [string]>`,
      matching the file's existing pattern for the other three methods). This project has
      neither `verbatimModuleSyntax` nor a vitest `typecheck` block configured, so — matching
      `4c`'s own recorded lesson for `deleteCauseEdges` — **the real red signal here is `yarn
      tsc` reporting the missing method**, not `yarn vitest run`, which may pass even though the
      interface doesn't declare the method yet. Verify red with `yarn tsc`.
- [x] 1.2 Add `countEdgesTouching(nodeId: string): Promise<number>` to
      `app/domains/hazardous-events/application/ports/ICausalChainRepository.ts` per design.md
      Decision 2 (doc comment included — note the comment explains why this count needs no
      tenant-disclosure split, unlike `IEventCausalityRepository.countReferences`, task group
      4). Verify `yarn tsc` no longer reports the missing method, and
      `yarn vitest run app/domains/hazardous-events/application/ports/ICausalChainRepository.test.ts`
      passes.
- [x] 1.3 **Repo-wide fallout**: adding a required interface method breaks every existing
      class that `implements ICausalChainRepository`, even though Vitest itself (which strips
      types) would not catch this. Confirmed via repo-wide grep (not scoped to one directory,
      per standing full-ref-search rule) — the only other implementer is
      `app/domains/hazardous-events/application/use-cases/CreateHazardousEvent.test.ts`'s own
      local `FakeCausalChainRepository` (`UpdateHazardousEvent.test.ts`'s own
      `FakeCausalChainRepository` is handled in task 1.4, a separate file). Add a
      `countEdgesTouching` stub to `CreateHazardousEvent.test.ts`'s fake matching that file's
      own existing convention for a method `CreateHazardousEventUseCase` never calls (`throw
      new Error("not used by CreateHazardousEventUseCase's own tests")`) — zero behavior
      change, zero new assertions needed, this is purely a compile-fix. Verify `yarn tsc`
      reports no error in this file.
- [x] 1.4 Add the identical `countEdgesTouching` stub (same "not used by ...'s own tests"
      convention) to `UpdateHazardousEvent.test.ts`'s own local `FakeCausalChainRepository`.
      Verify `yarn tsc` reports no error in this file, and
      `yarn vitest run app/domains/hazardous-events/application/use-cases/CreateHazardousEvent.test.ts app/domains/hazardous-events/application/use-cases/UpdateHazardousEvent.test.ts`
      still passes (zero assertions changed, confirming the stub is behavior-neutral).

## 2. IHazardousEventRepository.countReferencingDisasterEvents — new port method

- [x] 2.1 Extend `app/domains/hazardous-events/application/ports/IHazardousEventRepository.test.ts`:
      add a `disasterEventReferences` store and `countReferencingDisasterEvents` to
      `FakeHazardousEventRepository`, and write the scenarios from
      `specs/hazardous-event-repository-port/spec.md`'s new requirement (zero references,
      multiple references, and — the one that would catch a buggy tenant-filtered
      implementation — a cross-tenant reference still counted). Also add the new
      MODIFIED-requirement scenario for `delete` itself (design.md Decision 7): calling
      `delete` for an `id`/`tenantId` pair with no matching row resolves normally, without
      throwing (the fake's own `Map.delete()` already behaves this way — this task adds the
      scenario that pins it as the port's own documented contract, not an accident of this one
      fake's implementation). Add the compile-time arity assertion
      (`AssertEqual<Parameters<IHazardousEventRepository["countReferencingDisasterEvents"]>,
      [string, string]>`). Matching `4c`'s own lesson (task 1.1 above): verify red with
      `yarn tsc` for the missing method, not `yarn vitest run`.
- [x] 2.2 Add `countReferencingDisasterEvents(hazardousEventId: string, tenantId: string):
      Promise<number>` to
      `app/domains/hazardous-events/application/ports/IHazardousEventRepository.ts` per
      design.md Decision 4 (doc comment stating `tenantId` scopes the HE side only, is not
      used to filter the counted rows, and why this one source needs no tenant-disclosure
      split — the existing `0f` write-time guard on this field), and add a doc-comment note on
      the existing `delete` method per design.md Decision 7 (no behavior change to `delete`
      itself — doc-comment only). Verify `yarn tsc` no longer reports the missing method, and
      `yarn vitest run app/domains/hazardous-events/application/ports/IHazardousEventRepository.test.ts`
      passes.
- [x] 2.3 **Repo-wide fallout**: confirmed via repo-wide grep, every other class
      `implements IHazardousEventRepository` is a local fake in a use-case test file:
      `CreateHazardousEvent.test.ts`, `GetHazardousEventById.test.ts`,
      `ListHazardousEvents.test.ts`, `RecordSpatialObservation.test.ts`, and
      `UpdateHazardousEvent.test.ts` (five files total). Add a `countReferencingDisasterEvents`
      stub to each one's own `FakeHazardousEventRepository`, matching that file's own existing
      convention for a method its use case never calls (the same `throw new Error("not used by
      ...'s own tests")` pattern each file already uses for its own unused `delete`/spatial
      methods, confirmed directly in each file before writing the stub — do not assume the
      exact wording, copy each file's own existing phrasing). Zero behavior change, zero new
      assertions. Verify `yarn tsc` reports no error in any of the five files, and
      `yarn vitest run app/domains/hazardous-events/application/use-cases/CreateHazardousEvent.test.ts app/domains/hazardous-events/application/use-cases/GetHazardousEventById.test.ts app/domains/hazardous-events/application/use-cases/ListHazardousEvents.test.ts app/domains/hazardous-events/application/use-cases/RecordSpatialObservation.test.ts app/domains/hazardous-events/application/use-cases/UpdateHazardousEvent.test.ts`
      all still pass unchanged.

## 3. IWorkflowRepository.deleteByEntity — new port method (resolves OQ2)

- [x] 3.1 Extend
      `app/domains/validation-workflow/application/ports/IWorkflowRepository.test.ts`: add
      `deleteByEntity` to `FakeWorkflowRepository` (remove the matching entry from its own
      `store`, keyed the same way `save`/`findByEntity` already key it) and write the four
      scenarios from `specs/workflow-repository-port/spec.md`'s new requirements (an existing
      instance is removed, confirmed via a subsequent `findByEntity` resolving `null`; a
      missing instance is a no-op, does not throw; calling it twice in sequence is idempotent;
      no `tenantId` parameter is present on the signature). Add the compile-time arity
      assertion (`AssertEqual<Parameters<IWorkflowRepository["deleteByEntity"]>, [string,
      EntityType]>`, matching the file's existing pattern for the other three methods).
      Matching `4c`'s own lesson (task 1.1 above): verify red with `yarn tsc` for the missing
      method, not `yarn vitest run`.
- [x] 3.2 Add `deleteByEntity(entityId: string, entityType: EntityType): Promise<void>` to
      `app/domains/validation-workflow/application/ports/IWorkflowRepository.ts` per design.md
      Decision 8 (doc comment included — idempotent no-op on a missing instance, no `tenantId`
      parameter, matching every other method on this port). Verify `yarn tsc` no longer reports
      the missing method, and
      `yarn vitest run app/domains/validation-workflow/application/ports/IWorkflowRepository.test.ts`
      passes.
- [x] 3.3 **Repo-wide fallout**: confirmed via repo-wide grep, every other class
      `implements IWorkflowRepository` is a local fake in a use-case test file:
      `CreateHazardousEvent.test.ts`, `GetHazardousEventById.test.ts`,
      `ListHazardousEvents.test.ts`, `UpdateHazardousEvent.test.ts` (four files total —
      `RecordSpatialObservation.test.ts` does not depend on `IWorkflowRepository`, confirmed
      directly, and needs no stub for this method). Add a `deleteByEntity` stub to each one's
      own `FakeWorkflowRepository`, matching that file's own existing convention for a method
      its use case never calls (confirmed directly in each file before writing the stub — do
      not assume the exact wording, copy each file's own existing phrasing). Zero behavior
      change, zero new assertions.
      **Corrected during implementation**: design.md Context's own broader grep for
      object-literal fakes (`: IWorkflowRepository =`, `as`, `satisfies`) claimed zero
      additional hits beyond the four `class ... implements` fakes above — re-verified and
      found incomplete. `app/domains/validation-workflow/application/use-cases/
      ProcessWorkflowAction.test.ts` has two object-literal fakes typed against
      `IWorkflowRepository`, not caught by an `implements`-only grep: `makeRepository()`'s
      own return object (lines 28-38) and the inline `const repo: IWorkflowRepository = {...}`
      (lines 197-201). Add `deleteByEntity: vi.fn()` to both, matching that file's own
      existing `vi.fn()` convention already used there for `findByEntityIds`. Zero behavior
      change, zero new assertions — same as the other four files. Verify `yarn tsc` reports
      no error in any of the five files, and
      `yarn vitest run app/domains/hazardous-events/application/use-cases/CreateHazardousEvent.test.ts app/domains/hazardous-events/application/use-cases/GetHazardousEventById.test.ts app/domains/hazardous-events/application/use-cases/ListHazardousEvents.test.ts app/domains/hazardous-events/application/use-cases/UpdateHazardousEvent.test.ts app/domains/validation-workflow/application/use-cases/ProcessWorkflowAction.test.ts`
      all still pass unchanged.

## 4. IEventCausalityRepository — new shared port

- [x] 4.1 Write `app/domains/shared/application/ports/IEventCausalityRepository.test.ts`
      following `IHazardousEventRepository.test.ts`'s/`ICausalChainRepository.test.ts`'s own
      Fake-conformance-plus-arity-assertion pattern: a `FakeEventCausalityRepository
      implements IEventCausalityRepository` backed by an in-memory row list, where each stored
      row also records which tenant its own "other side" belongs to (needed to compute the
      same-tenant/cross-tenant split), and every scenario from
      `specs/event-causality-repository-port/spec.md` (compiles with no disallowed imports;
      zero-rows, same-tenant-as-triggering-party, same-tenant-as-triggered-party, cross-tenant,
      and mixed same-tenant-plus-cross-tenant scenarios, each asserting the full
      `{ sameTenantCount, crossTenantCount }` result; `tenantId` present as the method's own
      second parameter — note this port now DOES take a `tenantId`, unlike
      `IWorkflowRepository`, per design.md Decision 3's own explicit, justified divergence; no
      Drizzle type in the signature).
      **Corrected during implementation**: this file imports only types, which esbuild elides,
      so `yarn vitest run` does not fail with "module not found" as this step predicts — it can
      pass trivially even with the method missing. `yarn tsc` reporting `TS2307: Cannot find
      module` is the real red signal, the same `4c`-established lesson task 1.1 already applies
      elsewhere; verified red that way instead
      (`yarn tsc` showed `Cannot find module './IEventCausalityRepository'`).
- [x] 4.2 Implement `app/domains/shared/application/ports/IEventCausalityRepository.ts`
      (`EventCausalityReferenceCounts { sameTenantCount: number; crossTenantCount: number }`,
      `countReferences(hazardousEventId: string, tenantId: string):
      Promise<EventCausalityReferenceCounts>`) per design.md Decisions 1 and 3 — this is the
      first file under `app/domains/shared/application/`, create that directory. Verify
      `yarn vitest run app/domains/shared/application/ports/IEventCausalityRepository.test.ts`
      passes

## 5. DeleteHazardousEventUseCase

- [x] 5.1 Write
      `app/domains/hazardous-events/application/use-cases/DeleteHazardousEvent.test.ts` using
      fakes for `IHazardousEventRepository`, `IEventCausalityRepository`,
      `ICausalChainRepository`, and `IWorkflowRepository` (the same fakes built/extended in
      tasks 1-4, or equivalent lightweight test doubles local to this file — follow
      `UpdateHazardousEvent.test.ts`'s own `FakeCausalChainRepository` pattern for
      consistency), and a spy/fake `ILogger`, covering every scenario in
      `specs/delete-hazardous-event/spec.md`:
      - Zero dependents deletes successfully: `IWorkflowRepository.deleteByEntity` called
        exactly once with `id`/`"HE"`, then `IHazardousEventRepository.delete` called exactly
        once with `id`/`tenantId`, `execute()` resolves.
      - `findById` rejects `NotFoundError`: propagates unmodified, zero calls to any dependent
        check, `deleteByEntity`, or `delete`.
      - Empty/non-string `id`, `tenantId`, or `actingUserId`: `ValidationError`, zero
        repository calls at all (not even `findById`) — matching `4c`'s own
        `assertNonEmptyString` convention for all three command fields.
      - `DISASTER_EVENT` and `CAUSAL_CHAIN` each independently block the delete with a
        `ConflictError` whose `context.dependents` names that type and its exact count;
        neither `deleteByEntity` nor `delete` called in either case.
      - **`EVENT_CAUSALITY` blocking — three scenarios, matching the spec's own three** (not
        just one): a same-tenant-only reference (`{ sameTenantCount: 1, crossTenantCount: 0 }`)
        discloses `{ count: 1, crossTenantReferenceExists: false }`; a cross-tenant-only
        reference (`{ sameTenantCount: 0, crossTenantCount: 1 }`) discloses `{ count: 0,
        crossTenantReferenceExists: true }` — assert the thrown error's `context` does not
        contain the literal cross-tenant count anywhere under this entry; a mixed case
        (`{ sameTenantCount: 2, crossTenantCount: 3 }`) discloses `{ count: 2,
        crossTenantReferenceExists: true }`, again asserting the `3` never appears in the
        context. All three block the delete identically (neither `deleteByEntity` nor `delete`
        called).
      - Causal-chain block fires whether the event is the cause side or the effect side of the
        touching edge (two separate scenarios, per the spec's own two scenarios under that
        requirement) — do not write only the cause-side case, the effect-side case is the one
        most likely to be missed by a buggy implementation that reuses
        `findReachableEdgesFrom`-style forward-only logic.
      - **All three dependent-reference checks run before any throw, not fail-fast**: assert
        all three fake check methods were called (not just the first) before the error is
        thrown, using two blocking sources at once; assert the single thrown `ConflictError`'s
        `context` names both dependent types.
      - A dependent-reference check rejects (test at least one of the three, e.g.
        `countEdgesTouching`): the same error propagates, neither `deleteByEntity` nor `delete`
        called.
      - **`deleteByEntity` runs before `delete`, in that order, when all checks pass** — assert
        call order explicitly (e.g. via a shared call-log array both fakes append to), not just
        that both were eventually called.
      - `deleteByEntity` itself rejects (all checks pass): the same error propagates, `delete`
        is never called, no log event.
      - `delete` itself rejects after `deleteByEntity` succeeds: the same error propagates, no
        log event.
      - Successful delete logs exactly once, naming `id`/`tenantId`/`actingUserId`; a blocked
        (`ConflictError`) or any other failed call logs nothing.
      - **Mandatory concurrent-callers scenario** (design.md Decision 6 and Risks, spec's own
        "both reads before either write" requirement): two `execute()` calls for the **same**
        `id`/`tenantId`, both with zero dependents. This use case's own local fakes (in
        `DeleteHazardousEvent.test.ts` itself — separate, local fakes from the ones in each
        port's own `.test.ts` file; `IHazardousEventRepository`'s own fake must independently
        implement `delete` as a no-op on a missing row, and `IWorkflowRepository`'s own fake
        must independently implement `deleteByEntity` as a no-op on a missing instance,
        matching each port's own pinned contract, design.md Decisions 7-8) must gate both
        calls' own `findById` and dependent-reference checks to resolve **before either call's
        own `deleteByEntity`/`delete` runs** — do not rely on incidental microtask-ordering
        timing. Use a deferred/gated fake — the same technique `4c`'s own tasks.md describes
        for its structurally similar concurrent scenario (archived
        `2026-10-05-ca-he-update-use-case/tasks.md`, its own "Mandatory concurrent-callers
        scenario" bullet: drive the read-side fake methods "to resolve for both calls before
        either call's own [write] runs," then assert the final state "reflects both writes
        having been applied," demonstrating the accepted race rather than asserting it's
        prevented): have the fakes' `findById` and check methods resolve immediately, but gate
        each call's own `deleteByEntity`/`delete` behind a shared promise that only resolves
        once both calls have reached that point. Assert both calls resolve successfully, and
        two separate log events are emitted, one per call (the second recording what was,
        against the real rows, a no-op — design.md Risks). Note in the test's own comment
        (matching `4c`'s own `DEF-030` precedent style) that this proves the use case holds no
        shared mutable state of its own for this specific, forced ordering — it does **not**
        prove mutual exclusion or exactly-once deletion against a real, concurrently-written
        DB, which is `DEF-033`'s own open gap, not something a mock can close; a different
        ordering (second call's `findById` running after the first call's `delete` has already
        committed) would correctly throw `NotFoundError` instead, and is not a scenario this
        task needs to cover separately (spec's own stated acceptance of that alternative
        outcome).
      - **Secondary concurrent scenario — different tenants**: two `execute()` calls for two
        different tenants' events, one with zero dependents (succeeds) and one with a blocking
        dependent (throws `ConflictError`), issued concurrently before either resolves — assert
        neither call's own dependent-reference checks are affected by the other call's id or
        result.
      Verify it fails to run (module not found) via
      `yarn vitest run app/domains/hazardous-events/application/use-cases/DeleteHazardousEvent.test.ts`
- [x] 5.2 Implement
      `app/domains/hazardous-events/application/use-cases/DeleteHazardousEvent.ts`
      (`DeleteHazardousEventCommand { id, tenantId, actingUserId }`,
      `DeleteHazardousEventDependent` discriminated union type, `DeleteHazardousEventUseCase`)
      per design.md Decision 6's own pseudocode and exact `ConflictError` context shape:
      `assertNonEmptyString` on `id`/`tenantId`/`actingUserId` (all three, matching `4c`'s own
      convention); `findById(id, tenantId)` first (tenant gate, propagates `NotFoundError`);
      `Promise.all` the three dependent-reference checks
      (`countReferencingDisasterEvents`, `IEventCausalityRepository.countReferences`,
      `ICausalChainRepository.countEdgesTouching`) — never fail-fast; build `dependents` by
      pushing a `DISASTER_EVENT` entry when that count is non-zero, an `EVENT_CAUSALITY` entry
      (`count: sameTenantCount`, `crossTenantReferenceExists: crossTenantCount > 0`) when
      `sameTenantCount + crossTenantCount` is non-zero — never disclosing the raw
      `crossTenantCount` itself — and a `CAUSAL_CHAIN` entry when that count is non-zero; throw
      `ConflictError` with `context: { hazardousEventId, dependents }` if `dependents.length >
      0` — no `i18nKey` third argument, matching `CausalChain.ts`'s own `ConflictError` throws
      (design.md Decision 6b); otherwise call `workflowRepository.deleteByEntity(id, "HE")`
      (design.md Decision 8 — before the main delete, propagating any rejection unmodified and
      never reaching the main delete in that case), then call `delete(id, tenantId)`, then log
      one structured event (`msg: "hazardous_event.deleted"`) naming
      `id`/`tenantId`/`actingUserId`. Verify
      `yarn vitest run app/domains/hazardous-events/application/use-cases/DeleteHazardousEvent.test.ts`
      passes

## 6. Refactor

- [x] 6.1 Re-read the full diff across all five touched/new implementation files
      (`ICausalChainRepository.ts`, `IHazardousEventRepository.ts`, `IWorkflowRepository.ts`,
      `IEventCausalityRepository.ts`, `DeleteHazardousEvent.ts`) **and** the five stubbed
      use-case test files (tasks 1.3/1.4/2.3/3.3: `CreateHazardousEvent.test.ts`,
      `GetHazardousEventById.test.ts`, `ListHazardousEvents.test.ts`,
      `RecordSpatialObservation.test.ts`, `UpdateHazardousEvent.test.ts`) for duplication or
      simplification opportunities, and simplify without changing any test's assertions;
      verify
      `yarn vitest run app/domains/hazardous-events/application/ports/ICausalChainRepository.test.ts app/domains/hazardous-events/application/ports/IHazardousEventRepository.test.ts app/domains/validation-workflow/application/ports/IWorkflowRepository.test.ts app/domains/shared/application/ports/IEventCausalityRepository.test.ts app/domains/hazardous-events/application/use-cases/DeleteHazardousEvent.test.ts app/domains/hazardous-events/application/use-cases/CreateHazardousEvent.test.ts app/domains/hazardous-events/application/use-cases/GetHazardousEventById.test.ts app/domains/hazardous-events/application/use-cases/ListHazardousEvents.test.ts app/domains/hazardous-events/application/use-cases/RecordSpatialObservation.test.ts app/domains/hazardous-events/application/use-cases/UpdateHazardousEvent.test.ts`
      stays green after any refactor

## 7. Deferred items register

**Note for whoever reviews this task:** the original brief for this change explicitly
authorized only one new register row (`DEF-032`, the interim port-placement decision). Rows
`DEF-033` and `DEF-035` below are additional findings surfaced during this change's own Phase 0
ground-truth review (the check-then-delete race, and the legacy `event_relationship`/`event`
supertype gap) — flagged here per the register's own "For agents" instruction (add a row for
anything found and declined, in addition to design.md's own Risks section), not something this
change was asked to add in advance. **`DEF-034` is deliberately skipped, not reserved for later
use** — an earlier draft of this change proposed it for the orphaned-`WorkflowInstance` finding,
but the user resolved that finding in-change (design.md Decision 8, `IWorkflowRepository.
deleteByEntity`) rather than deferring it, so no row for it is added; the register's own
"gaps expected" rule (Fields section) makes this an intentional, documented skip, not an error.
Confirm `DEF-033`/`DEF-035` are genuinely new findings, not duplicates of any existing row,
before adding them: design.md Risks already distinguishes `DEF-033` from `DEF-030` (a delete
racing a concurrent link-insert, vs. `DEF-030`'s own two-concurrent-link-writes race) — re-verify
that distinction, don't just trust it, and separately confirm `DEF-033` is not better described
as a further instance of `DEF-024`'s/`DEF-026`'s own transactional-guarantee findings (both of
those are about a *single* use case's own multi-write sequence lacking a transaction boundary —
`4b`'s/`4c`'s own `save()` sequences — which is a different shape from `DEF-033`'s own
check-then-act race between one use case's read and a DB-level cascade trigger).

- [x] 7.1 Add three new rows to `_docs/refactoring-plan/deferred-items-register.md` (append
      after `DEF-031`, with an intentional gap at `DEF-034`; do not touch any existing row):
      - **`DEF-032`** | Title: interim placement of the Disaster-Event-reference delete check
        on `IHazardousEventRepository` | Domain/Context: Hazardous Events | Category: B |
        Detail: `countReferencingDisasterEvents` answers "does another aggregate (Disaster
        Event) reference me," which by rights belongs on that other aggregate's own
        repository; added here instead because no `IDisasterEventRepository` exists yet | 
        Trigger: Disaster Events' own Clean Architecture migration, once
        `IDisasterEventRepository` exists — move this method there | Origin: `4f` design.md
        Decision 4, 2026-10-06
      - **`DEF-033`** | Title: `DeleteHazardousEventUseCase`'s check-then-delete sequence is
        not atomic against either causality table's live cascade FKs | Domain/Context:
        Hazardous Events | Category: B | Detail: a `hazardous_event_causality` or
        `event_causality` row inserted after this use case's checks resolve non-blocking but
        before the real adapter's `delete()` commits is still silently cascaded away — the
        exact bug class this change exists to close, reopened by a race window a zero-DB
        application layer cannot close on its own; related to `DEF-030`'s own
        `ICausalChainRepository` TOCTOU finding (same root cause — no transaction/locking
        boundary exists anywhere in this codebase for a check-then-act sequence against these
        tables — but a distinct manifestation: a delete racing a concurrent link-insert, not
        two concurrent link-writes) | Trigger: `5f` (the real, DB-backed delete-dependent-check
        adapter) — needs a transaction/locking strategy spanning the counts and the delete, or
        migrating the FKs from `cascade` to `restrict` | Origin: `4f` design.md Risks,
        2026-10-06
      - **`DEF-035`** | Title: the real `IHazardousEventRepository.delete` adapter must
        replicate several legacy transaction steps beyond the `hazardous_event` row itself, and
        one legacy FK-violation gap remains unfixed either way | Domain/Context: Hazardous
        Events | Category: B | Detail: `hazardousEventTable.id` is itself a FK into
        `eventTable.id` (a shared supertype table, confirmed directly) — the legacy delete
        transaction (`app/backend.server/models/event.ts` line 1728, `hazardousEventDelete` —
        not the dead-code twin under `event/`, `DEF-001`) deletes the `hazardous_event` row,
        then `event_relationship` rows where the event is the *child* (incoming link), then the
        `event` row itself (its own validation-row cleanup is now superseded by this change's
        own `IWorkflowRepository.deleteByEntity`, `DEF-034`'s would-be finding, resolved
        in-change instead). A real adapter that only does `DELETE FROM hazardous_event` would
        orphan the `event` row. None of this is a new check `DeleteHazardousEventUseCase` itself
        needs (it is internal delete-transaction mechanics, not another aggregate's reference).
        The one remaining gap: `event_relationship`'s *outgoing* role (this event as the
        parent/cause of some other row) is cleaned up by neither the legacy function nor this
        change — `0a` finding #6's own broken reactive-catch gap, inherited verbatim by a naive
        adapter | Trigger: `5f` — must replicate the legacy transaction's supertype-row and
        incoming-link cleanup, and separately decide whether to finally fix the outgoing-role
        gap or continue inheriting it | Origin: `4f` design.md Decision 5 and Risks, 2026-10-06
      Verify by reading the register back: all three new rows present with the four fields
      above, every pre-existing row (through `DEF-031`) byte-for-byte unchanged, and no `DEF-034`
      row present.

## 8. Quality gates

- [x] 8.1 `yarn vitest run app/domains/hazardous-events/application/ports/ICausalChainRepository.test.ts app/domains/hazardous-events/application/ports/IHazardousEventRepository.test.ts app/domains/validation-workflow/application/ports/IWorkflowRepository.test.ts app/domains/shared/application/ports/IEventCausalityRepository.test.ts app/domains/hazardous-events/application/use-cases/DeleteHazardousEvent.test.ts app/domains/hazardous-events/application/use-cases/CreateHazardousEvent.test.ts app/domains/hazardous-events/application/use-cases/GetHazardousEventById.test.ts app/domains/hazardous-events/application/use-cases/ListHazardousEvents.test.ts app/domains/hazardous-events/application/use-cases/RecordSpatialObservation.test.ts app/domains/hazardous-events/application/use-cases/UpdateHazardousEvent.test.ts`
      — all green
- [x] 8.2 `yarn tsc` — zero TypeScript errors
- [x] 8.3 `npx prettier --check` on the five touched/new implementation files
      (`ICausalChainRepository.ts`, `IHazardousEventRepository.ts`, `IWorkflowRepository.ts`,
      `IEventCausalityRepository.ts`, `DeleteHazardousEvent.ts`), their five own test files, and
      the five stubbed use-case test files (`CreateHazardousEvent.test.ts`,
      `GetHazardousEventById.test.ts`, `ListHazardousEvents.test.ts`,
      `RecordSpatialObservation.test.ts`, `UpdateHazardousEvent.test.ts` — fifteen files
      total) — never bulk `yarn format`, per standing project instruction — Prettier clean
- [x] 8.4 Anti-pattern review against `.github/skills/anti-pattern-check/SKILL.md`
- [x] 8.5 SOLID review — invoke `solid-reviewer` agent against `DeleteHazardousEvent.ts` and
      the four port changes (routed through `sdd-implementer`, per standing
      gate-orchestration rule, not run directly in parallel by the implementer)
- [x] 8.6 Documentation review — comments explain WHY not WHAT, one full-diff sweep by a fresh
      subagent, not self-review
- [x] 8.7 Project conventions review against `.github/copilot-instructions.md`
- [x] 8.8 Code review — run `.github/skills/code-review/SKILL.md` in full via a fresh subagent
      (routed through `sdd-implementer`, per standing gate-orchestration rule)
- [x] 8.9 Visual/UX parity review — SKIP: this change touches no
      `app/domains/*/presentation/` file and no `app/routes/` file (application/port-layer
      only, proposal.md Impact); state this explicitly in the gate report rather than silently
      omitting the gate
- [x] 8.10 Independent second-opinion review — Claude Code's built-in `/code-review` at high
      effort via a second, separate fresh subagent (not the project's own `code-review` skill
      again); resolve findings before archiving. Other tools: use an equivalent platform
      feature if one exists, otherwise skip this task and say so explicitly
- [x] 8.11 Test quality audit (mutation-testing mandate covers every `app/domains/**` file with
      real implementation logic) — run `test-quality-auditor` scoped to
      `DeleteHazardousEvent.ts` only. The four port files (`ICausalChainRepository.ts`,
      `IHazardousEventRepository.ts`, `IWorkflowRepository.ts`, `IEventCausalityRepository.ts`)
      are type-only interface declarations with no runtime logic of their own to mutate —
      Stryker has nothing to mutate there, and the fakes exercising the new methods live in
      `.test.ts` files, not source. Resolve any real survivor found in `DeleteHazardousEvent.ts`.

## 9. Regression and archive

- [x] 9.1 `yarn test:run2` — 1311/1311 passing, 1 todo, zero failures.
- [x] 9.2 Run `opsx:archive` on `feature/ca-he-delete-use-case`.
