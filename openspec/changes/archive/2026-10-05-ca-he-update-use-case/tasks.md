## 1. flexibleDateFormat Shared Kernel predicate and normalizers (`app/domains/shared/domain/`)

- [x] 1.1 Write `app/domains/shared/domain/flexibleDateFormat.test.ts` covering:
      - `isValidFlexibleDateFormat`: a bare `YYYY` within `1900`-`2100` is valid; a bare `YYYY`
        outside that range (e.g. `"1899"`, `"2101"`) is invalid; a full `YYYY-MM-DD` date outside
        that same numeric range (e.g. `"1899-12-31"`, `"2101-01-01"`) is still **valid** — the
        year-range check applies only to the bare-year form, confirmed against
        `parseFlexibleDate`'s own branching (design.md Context); `"2026-9-1"`/`"2026-09-1"`/
        `"2026-9-01"` (any non-zero-padded component) are invalid; `"2026-09-01"` is valid;
        `"2026-13-01"` and `"2026-00-01"` (out-of-range month) are invalid; `"2026-02-30"` and
        `"2026-04-31"` (day-overflow within a real month) are **valid** — this exact
        permissiveness is empirically confirmed legacy behavior (design.md Context), not a gap to
        close; `""` and a non-date garbage string are invalid.
      - `normalizeFlexibleDateFloor`: `"2020"` → `"2020-01-01"`; `"2020-06"` → `"2020-06-01"`;
        `"2020-06-15"` → unchanged.
      - `normalizeFlexibleDateCeiling`: `"2020"` → `"2020-12-31"`; `"2020-06-15"` → unchanged;
        and, confirming leap-year handling via the real last day of each month (design.md Decision
        1's worked examples, swept in `sweep.js`): `"2024-02"` → `"2024-02-29"` (leap), `"2023-02"`
        → `"2023-02-28"` (non-leap), `"1900-02"` → `"1900-02-28"` (century non-leap), `"2000-02"`
        → `"2000-02-29"` (century leap), `"2100-02"` → `"2100-02-28"` (century non-leap),
        `"2026-04"` → `"2026-04-30"`, `"2026-12"` → `"2026-12-31"`.
      Verify it fails to run (module not found) via
      `yarn vitest run app/domains/shared/domain/flexibleDateFormat.test.ts`
- [x] 1.2 Implement `app/domains/shared/domain/flexibleDateFormat.ts` (`isValidFlexibleDateFormat`,
      `normalizeFlexibleDateFloor`, `normalizeFlexibleDateCeiling`) per design.md Decision 1 and
      verify `yarn vitest run app/domains/shared/domain/flexibleDateFormat.test.ts` passes

## 2. CausalChain.ts — temporal-order check (floor-normalized, Decision 7 correction)

- [x] 2.1 Extend `app/domains/hazardous-events/domain/CausalChain.test.ts` with every scenario in
      `specs/hazardous-event-causal-chain/spec.md`'s new requirement: a cause starting after its
      effect throws `ConflictError`; a cause starting before its effect does not throw; equal
      `startDate`s do not throw; mismatched precision, coarser cause/finer effect (`"2020-06"` vs
      `"2020-06-15"`) compares correctly without throwing; **mismatched precision, finer cause at
      exactly a coarser effect's period start** (`causeStartDate: "2020-01-01"`,
      `effectStartDate: "2020"`) does **not** throw — the regression scenario proving the Decision
      7 bug (raw-string comparison wrongly throwing here) is closed; **mismatched precision, finer
      cause genuinely after a coarser effect's period start** (`causeStartDate: "2020-06-15"`,
      `effectStartDate: "2020"`) **does** throw `ConflictError` — confirming floor-normalization
      doesn't over-permit; a non-zero-padded `causeStartDate` does not block; a non-zero-padded
      `effectStartDate` does not block; an empty-string `startDate` on either side does not block.
      Verify it fails to run (`assertCauseStartsNoLaterThanEffect` does not exist) via
      `yarn vitest run app/domains/hazardous-events/domain/CausalChain.test.ts`
- [x] 2.2 Implement `assertCauseStartsNoLaterThanEffect` in
      `app/domains/hazardous-events/domain/CausalChain.ts` per design.md Decision 7 — floor-pad
      both `causeStartDate` and `effectStartDate` via `normalizeFlexibleDateFloor` before
      comparing, not a raw string comparison — importing `isValidFlexibleDateFormat` and
      `normalizeFlexibleDateFloor` from `~/domains/shared/domain/flexibleDateFormat` (task 1.2)
      and verify
      `yarn vitest run app/domains/hazardous-events/domain/CausalChain.test.ts` passes

## 3. HazardousEvent.ts — format-gated, floor/ceiling-normalized date-ordering check (DEF-020, Decision 8 correction)

- [x] 3.1 Extend the existing "Date ordering" describe block in
      `app/domains/hazardous-events/domain/HazardousEvent.test.ts` (grepped first to confirm: no
      existing scenario in this block uses a mixed-precision `startDate`/`endDate` pair today —
      every existing literal is full `YYYY-MM-DD`, so none of the new scenarios below flips an
      existing assertion) with the new scenarios from `specs/hazardous-event-entity/spec.md`:
      - `startDate: "2026-9-1"`, `endDate: "2026-10-1"` (both non-zero-padded) MUST NOT throw for
        the date-ordering reason, under the **current** (pre-fix) raw-comparison code this is a
        red scenario — confirm it fails first (the current code throws `ValidationError` for this
        exact input, since `"2026-9-1" > "2026-10-1"` lexically). Also confirm the
        single-malformed-side variants (`startDate` malformed with a valid `endDate`, and vice
        versa) are added as scenarios and are red for the same reason where applicable.
      - **Mixed-precision accept** (`startDate: "2020-06"`, `endDate: "2020"`, both valid
        zero-padded format): MUST NOT throw — under the **current** (pre-fix) raw-comparison code
        this is also a red scenario (`"2020-06" > "2020"` lexically throws today), confirming the
        fix is a genuine behavior change, not merely a format gate.
      - **Mixed-precision reject** (`startDate: "2020-07-01"`, `endDate: "2020-06"`, both valid
        zero-padded format): MUST throw `ValidationError` — already green under the current
        raw-comparison code (`"2020-07-01" > "2020-06"` lexically), included to prove the fix
        doesn't over-permit once normalized (floor("2020-07-01") > ceiling("2020-06")).
      Verify via `yarn vitest run app/domains/hazardous-events/domain/HazardousEvent.test.ts`
- [x] 3.2 Modify the ordering check in
      `app/domains/hazardous-events/domain/HazardousEvent.ts` per design.md Decision 8 — compare
      `normalizeFlexibleDateFloor(startDate) > normalizeFlexibleDateCeiling(endDate)`, not a raw
      string comparison — importing `isValidFlexibleDateFormat`, `normalizeFlexibleDateFloor`, and
      `normalizeFlexibleDateCeiling` from `~/domains/shared/domain/flexibleDateFormat` (task 1.2),
      and verify `yarn vitest run app/domains/hazardous-events/domain/HazardousEvent.test.ts`
      passes in full — including that the pre-existing "Failure — startDate later than endDate"
      scenario (both dates valid zero-padded format, same precision) still throws exactly as before

## 4. ICausalChainRepository — deleteCauseEdges

- [x] 4.1 Extend `FakeCausalChainRepository` in
      `app/domains/hazardous-events/application/ports/ICausalChainRepository.test.ts` with a
      `deleteCauseEdges` implementation and every scenario from
      `specs/causal-chain-repository-port/spec.md`'s new requirement: an existing cause edge for
      the given effect is removed; calling it for a node with no existing cause edge is a no-op
      (resolves, does not throw); an edge where the given node is the cause, not the effect, is
      unaffected; only edges matching the given `effectId` are removed, unrelated edges remain.
      Add the arity assertion for the new method, matching the file's existing
      `AssertEqual`-tuple pattern for `findReachableEdgesFrom`/`saveEdge`. This project has
      neither `verbatimModuleSyntax` nor a vitest `typecheck` block configured, so **the red
      signal here is `yarn tsc` reporting the missing method on `ICausalChainRepository`**, not
      `yarn vitest run`, which may pass even though the interface doesn't declare the method yet
      (same caveat `4b`'s and `4g`'s own tasks.md recorded for their own new ports/methods).
      Verify red with `yarn tsc`
- [x] 4.2 Add `deleteCauseEdges(effectId: string): Promise<void>` to
      `app/domains/hazardous-events/application/ports/ICausalChainRepository.ts` per design.md
      Decision 5 (doc comment naming the singular-replace scope and the table's own lack of a
      `UNIQUE` constraint) and verify `yarn tsc` no longer reports the missing method, and
      `yarn vitest run app/domains/hazardous-events/application/ports/ICausalChainRepository.test.ts`
      passes

## 5. UpdateHazardousEventUseCase

- [x] 5.1 Write
      `app/domains/hazardous-events/application/use-cases/UpdateHazardousEvent.test.ts` using
      fakes for `IHazardousEventRepository`, `IWorkflowRepository`, `IHazardTaxonomyRepository`,
      `ICausalChainRepository`, a fake/mock `RecordSpatialObservationUseCase` collaborator
      (constructor-injected, per design.md Decision 6 — asserted as a mock, never a real call,
      matching the roadmap's own stated test-tier requirement), and a spy/fake `ILogger`,
      covering every scenario in `specs/update-hazardous-event/spec.md`:
      - Partial-patch semantics: a present scalar field replaces the existing value, an absent
        scalar field leaves it unchanged, an explicit `null` on a nullable field
        (`hazardousEventStatus`/`specificHazardLocalName`/`specificHazardNationalName`) sets it to
        `null` distinctly from absence, a present collection field fully replaces the existing
        collection (not a union/merge), and a carried-over collection id (command omits the
        field) is still re-validated against the tenant's current valid-id set and throws
        `ValidationError` if no longer valid.
      - Missing/cross-tenant `command.id` propagates `NotFoundError` with zero writes of any kind.
      - A missing `WorkflowInstance` for an otherwise-valid event propagates `NotFoundError`
        (defensive scenario, design.md step 3) before any merge/validation work runs.
      - `causeId` tri-state: omitted performs **no** causal-chain read or write at all (assert the
        fake `ICausalChainRepository`'s call counts are all zero) and the existing link is
        unaffected; `null` clears an existing link with no replacement; `""` clears identically to
        `null`; a non-empty, different value replaces the existing link (old edge gone, new edge
        present).
      - A cross-tenant or non-existent `causeId` propagates `NotFoundError` with zero writes.
      - A `causeId` that would close a cycle propagates `ConflictError` with zero writes (use a
        fake `ICausalChainRepository` whose `findReachableEdgesFrom` returns edges making the
        updated event already reachable from the proposed cause).
      - A `causeId` whose cause `startDate` is later than the updated event's own `startDate`
        propagates `ConflictError` with zero writes; equal `startDate`s succeed; a malformed
        `startDate` on either side does not block for the temporal reason (subject to every other
        check still passing).
      - An event with an existing `causeId` that is updated with `startDate` changed but
        `causeId` omitted does **not** re-trigger the cycle or temporal check and does not alter
        the existing causal link (assert zero calls to `findReachableEdgesFrom`/`saveEdge`/
        `deleteCauseEdges`).
      - A bundled `spatialObservation` delegates to the fake `RecordSpatialObservationUseCase`
        with `tenantId`/`hazardousEventId` taken from the update's own already-validated
        `command.tenantId`/`command.id` — **not** from any value a test deliberately plants inside
        `command.spatialObservation` itself (prove the override, not just the happy path). No
        `spatialObservation` means zero calls to the collaborator. A `ConflictError` thrown by the
        fake collaborator (simulating `4g`'s own un-confirmed-replace conflict) propagates
        unmodified to `execute()`'s own caller, and the fake `IHazardousEventRepository.save()`
        call for the `HazardousEvent` itself is asserted to have already happened before the
        collaborator was invoked (design.md Decision 6's write-order claim, proven, not merely
        asserted in prose).
      - **Mandatory concurrent-callers scenario** (project standing rule for shared mutable
        state, and `specs/update-hazardous-event/spec.md`'s own "Concurrent callers" requirement):
        two `execute()` calls — one updating event `A`'s `causeId` to `B`, the other concurrently
        updating event `B`'s `causeId` to `A` — using a fake `ICausalChainRepository` whose
        `findReachableEdgesFrom` is driven to resolve for both calls **before** either call's own
        `saveEdge`/`deleteCauseEdges` runs (i.e. both calls observe the pre-write edge set). Assert
        that each call's own cycle check evaluates correctly in isolation against the snapshot it
        read (neither call's own logic is wrong), and that the fake's final stored edge state
        after both calls resolve reflects both writes having been applied — i.e. demonstrate the
        accepted race (design.md Risks) rather than asserting it's prevented, matching `4g`'s own
        "proves propagation, not prevention" precedent for its structurally analogous race.
      - A successful call returns a `HazardousEventDto` reflecting the merged, persisted state and
        the existing (unmodified) `workflowStatus`.

      Verify it fails to run (module not found — `UpdateHazardousEventUseCase` doesn't exist yet)
      via
      `yarn vitest run app/domains/hazardous-events/application/use-cases/UpdateHazardousEvent.test.ts`
- [x] 5.2 Implement
      `app/domains/hazardous-events/application/use-cases/UpdateHazardousEvent.ts`
      (`UpdateHazardousEventCommand`, `UpdateHazardousEventUseCase`, `resolveCauseAction`, and
      locally-duplicated `toSafeStringArray`/`extractCustomFieldDefinitionIds` helpers matching
      `CreateHazardousEvent.ts`'s own precedent) per design.md Decisions 2-6 — command shape from
      Decision 2, merge/validate/reconstruct order from Decision 3, the `causeId` tri-state from
      Decision 4, the spatial-observation delegation and write ordering from Decision 6 — and
      verify
      `yarn vitest run app/domains/hazardous-events/application/use-cases/UpdateHazardousEvent.test.ts`
      passes

## 6. Refactor

- [x] 6.1 Re-read the full diff across all five new/modified implementation files
      (`flexibleDateFormat.ts`, `CausalChain.ts`, `HazardousEvent.ts`, `ICausalChainRepository.ts`,
      `UpdateHazardousEvent.ts`) for duplication or simplification opportunities (e.g. the
      `toSafeStringArray`/`extractCustomFieldDefinitionIds` local duplicates, the fake-port test
      setup shared across scenarios) and simplify without changing any test's assertions; verify
      `yarn vitest run app/domains/shared/domain/flexibleDateFormat.test.ts app/domains/hazardous-events/domain/CausalChain.test.ts app/domains/hazardous-events/domain/HazardousEvent.test.ts app/domains/hazardous-events/application/ports/ICausalChainRepository.test.ts app/domains/hazardous-events/application/use-cases/UpdateHazardousEvent.test.ts`
      stays green after any refactor

## 7. Deferred items register

- [x] 7.1 **Correction (user-confirmed during implementation): delete `DEF-020`'s row entirely,
      not narrow it** — the register's own header rule is to remove an entry once it's picked up
      and resolved, and both of `DEF-020`'s own named open questions (format to enforce,
      reject-vs-skip) are fully resolved by this change's format-gated, floor/ceiling-normalized
      fix (design.md Decision 8); the remaining, larger precision-model work already has its own
      row (`DEF-028`). This task's original "narrow" phrasing was imprecise, not a deliberate
      override of the register's own convention. Do **not** touch `DEF-024` or `DEF-026`'s
      existing text, and do **not** add a new register row for either — both are explicitly
      flagged in design.md Risks/Open Questions for the user's own joint decision (standing
      project rule: review/design findings outside this change's approved scope are reported, not
      unilaterally resolved). Verified by reading the register back: `DEF-020` row removed,
      `DEF-028`'s own text updated to drop its now-dangling `DEF-020` cross-reference
- [x] 7.2 `DEF-029` (Disaster Records' own non-zero-padded date-matching inconsistency with
      ADR-002) was already added to `_docs/refactoring-plan/deferred-items-register.md` directly
      during this change's own spec revision (2026-10-01, user-approved out-of-scope finding, not
      acted on by `4c` itself — a different table, `disasterRecordsTable`, not `hazardousEventTable`).
      No implementer action needed; verify the row is still present before archiving

## 7A. actingUserId validation (cross-cutting fix found during code review)

- [x] 7A.1 Add `assertNonEmptyString(command.actingUserId, "actingUserId")` to
      `UpdateHazardousEvent.ts`'s `execute()`, alongside its existing `tenantId`/`id` guards, and
      the identical addition to `CreateHazardousEvent.ts`'s `execute()` alongside its existing
      `tenantId` guard (same gap, same fix, in the sibling use case it was found to share — not
      legacy/pre-existing, confirmed via `git merge-base --is-ancestor feature/he-ca-phase4
      origin/dev` returning false). Add a regression test to each use case's own test suite
      proving a non-string and an empty-string `actingUserId` each throw `ValidationError` with
      zero writes. Verify
      `yarn vitest run app/domains/hazardous-events/application/use-cases/UpdateHazardousEvent.test.ts app/domains/hazardous-events/application/use-cases/CreateHazardousEvent.test.ts`
      passes
- [x] 7A.2 **Correction (found during code review, implemented in two passes):** tightening
      `buildUpdatedEventProps`'s merge was initially applied to all eleven non-nullable
      scalar/collection fields, then partially reverted after a review pass found
      `HazardousEvent.create()` has **zero** type/shape validation on six of them
      (`nationalSpecification`, `description`, `chainsExplanation`, `magnitude`,
      `recordOriginator`, `dataSource`) — tightening those would let a runtime-bypassing `null`
      reach the entity with no error raised at all, worse than the original gap. **Final state:**
      tightened from `command.field ?? existingEvent.field` to `command.field !== undefined ?
      command.field : existingEvent.field` only for `specificHazardId`, `startDate`, `attachments`,
      `fieldValues`, plus the `mergedHazardDriverIds`/`mergedCustomFieldValues` merge locals — the
      fields `HazardousEvent.create()` actually validates. `endDate` and the six unvalidated fields
      stay on `??`, cross-referenced in `DEF-009`'s register row rather than fixed here. Added a
      test proving a runtime-cast `startDate: null` now throws `ValidationError` with zero writes.
      Verified
      `yarn vitest run app/domains/hazardous-events/application/use-cases/UpdateHazardousEvent.test.ts`
      passes

## 8. Quality gates

- [x] 8.1 `yarn vitest run app/domains/shared/domain/flexibleDateFormat.test.ts app/domains/hazardous-events/domain/CausalChain.test.ts app/domains/hazardous-events/domain/HazardousEvent.test.ts app/domains/hazardous-events/application/ports/ICausalChainRepository.test.ts app/domains/hazardous-events/application/use-cases/UpdateHazardousEvent.test.ts`
      — all green
- [x] 8.2 `yarn tsc` — zero TypeScript errors
- [x] 8.3 `npx prettier --check` on the five touched/new implementation files and their five test
      files (ten files total) — never bulk `yarn format`, per standing project instruction —
      Prettier clean
- [x] 8.4 Anti-pattern review against `.github/skills/anti-pattern-check/SKILL.md`
- [x] 8.5 SOLID review — invoke `solid-reviewer` agent against `UpdateHazardousEvent.ts` (the new
      use case, including its constructor-injected use-case collaborator, design.md Decision 6)
      and the modified `CausalChain.ts`/`HazardousEvent.ts`/`ICausalChainRepository.ts` (routed
      through `sdd-implementer`, per standing gate-orchestration rule, not run directly in
      parallel by the implementer)
- [x] 8.6 Documentation review — comments explain WHY not WHAT, one full-diff sweep by a fresh
      subagent, not self-review
- [x] 8.7 Project conventions review against `.github/copilot-instructions.md`
- [x] 8.8 Code review — run `.github/skills/code-review/SKILL.md` in full via a fresh subagent
      (routed through `sdd-implementer`, per standing gate-orchestration rule)
- [x] 8.9 Visual/UX parity review — SKIP: this change touches no `app/domains/*/presentation/`
      file and no `app/routes/` file (application/domain-tier only, proposal.md Impact); state
      this explicitly in the gate report rather than silently omitting the gate
- [x] 8.10 Independent second-opinion review — Claude Code's built-in `/code-review` at high
      effort via a second, separate fresh subagent (not the project's own `code-review` skill
      again); resolve findings before archiving. Other tools: use an equivalent platform feature
      if one exists, otherwise skip this task and say so explicitly
- [x] 8.11 Test quality audit (mutation-testing mandate covers every `app/domains/**` file with
      real implementation logic) — run `test-quality-auditor` scoped to `flexibleDateFormat.ts`,
      `CausalChain.ts` (its new function), `HazardousEvent.ts` (its modified check), and
      `UpdateHazardousEvent.ts` — the four files with real implementation/branching logic in this
      change (`ICausalChainRepository.ts` is a type-only interface declaration, out of this gate's
      scope per the standing rule). Resolve any real survivor found

## 9. Regression and archive

- [x] 9.1 `yarn test:run2` — 1,226 of 1,227 real tests passed (1 todo). The one failure
      (`HttpServerBootstrap.test.ts`, a NestJS bootstrap timeout, unrelated to anything this change
      touches) confirmed pre-existing via a separate worktree on the base branch
      (`feature/he-ca-phase4`) — identical failure there, before any of this change's work
      (standing rule: never label a failure "pre-existing" without this check)
- [x] 9.2 Run `opsx:archive` on `feature/ca-he-update-use-case`
