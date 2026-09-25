## 1. ICausalChainRepository port

- [x] 1.1 Write `app/domains/hazardous-events/application/ports/ICausalChainRepository.test.ts`:
      a fake in-memory conformance implementation (matches
      `IHazardousEventRepository.test.ts`'s `FakeHazardousEventRepository` pattern) exercising
      every scenario in `specs/causal-chain-repository-port/spec.md` (empty-node,
      reachable-forward-edges, non-reachable-edge-excluded, single edge persisted with
      explanation, null explanation persisted as null, two concurrent `saveEdge` calls both
      persist independently), implemented as a class declared `implements ICausalChainRepository`
      with `import type { ICausalChainRepository } from "./ICausalChainRepository"` (matching
      `IHazardousEventRepository.test.ts`'s/`INotificationPort.test.ts`'s own `import type`
      convention). This project has neither `verbatimModuleSyntax` nor a vitest `typecheck` block
      configured (confirmed by reading `tsconfig.json`/`vitest.config.ts`), so esbuild erases the
      `import type` and the `implements` clause before `yarn vitest run` ever resolves the module —
      **the red signal at this step is `yarn tsc` reporting the missing
      `./ICausalChainRepository` module, not `yarn vitest run`**, which may pass even though the
      port file does not exist yet. Verify red with `yarn tsc` (reports the missing module)
- [x] 1.2 Implement `app/domains/hazardous-events/application/ports/ICausalChainRepository.ts`
      per design.md Decision 2 (`findReachableEdgesFrom`, `saveEdge`, importing `CausalEdge` from
      `../../domain/CausalChain`) and verify `yarn tsc` no longer reports the missing module, and
      `yarn vitest run app/domains/hazardous-events/application/ports/ICausalChainRepository.test.ts`
      passes

## 2. IHazardTaxonomyRepository port

- [x] 2.1 Write `app/domains/hazardous-events/application/ports/IHazardTaxonomyRepository.test.ts`:
      a fake in-memory conformance implementation (`implements IHazardTaxonomyRepository`,
      via an `import type`), exercising every scenario in
      `specs/hazard-taxonomy-repository-port/spec.md` (same-tenant-only inclusion for both
      methods, non-existent id excluded without throwing, empty `ids` array resolves an empty
      set). Same red-signal caveat as task 1.1 — verify red with `yarn tsc` (reports the missing
      `./IHazardTaxonomyRepository` module), not `yarn vitest run` alone
- [x] 2.2 Implement `app/domains/hazardous-events/application/ports/IHazardTaxonomyRepository.ts`
      per design.md Decision 3 and verify `yarn tsc` no longer reports the missing module, and
      `yarn vitest run app/domains/hazardous-events/application/ports/IHazardTaxonomyRepository.test.ts`
      passes

## 3. HazardousEventDto

- [x] 3.1 Write `app/domains/hazardous-events/application/dto/HazardousEventDto.test.ts`
      (matches `WorkflowInstanceDto.test.ts`'s pattern): Date→ISO conversion for
      `createdAt`/`updatedAt`/`submittedAt`, null passthrough for every nullable field,
      `workflowStatus` taken from the passed-in `WorkflowInstance`, array fields
      (`hazardDriverIds`/`attachments`/`fieldValues`/`customFieldValues`) copied from the entity.
      Verify it fails to run (module not found — `toHazardousEventDto` doesn't exist yet) via
      `yarn vitest run app/domains/hazardous-events/application/dto/HazardousEventDto.test.ts`
- [x] 3.2 Implement `app/domains/hazardous-events/application/dto/HazardousEventDto.ts`
      (`HazardousEventDto` interface + `toHazardousEventDto(event, workflowInstance)`) per
      design.md Decision 6 and verify
      `yarn vitest run app/domains/hazardous-events/application/dto/HazardousEventDto.test.ts`
      passes

## 4. CreateHazardousEventUseCase

- [x] 4.1 Write `app/domains/hazardous-events/application/use-cases/CreateHazardousEvent.test.ts`
      using fakes for all four ports (`IHazardousEventRepository`, `ICausalChainRepository`,
      `IHazardTaxonomyRepository`, `IWorkflowRepository`) and a spy/fake `ILogger`, covering every
      scenario in `specs/create-hazardous-event/spec.md`: happy path with no `causeId` (no
      causal-chain calls made), `ValidationError` from `HazardousEvent.create()` propagates and no
      save occurs, happy path with a valid `causeId` (call order
      `hazardousEventRepository.save` -> `workflowRepository.save` -> `causalChainRepository.saveEdge`,
      edge args correct), missing-cause `NotFoundError` propagates with zero writes,
      **cross-tenant `causeId` is rejected** (`findById` called with `(causeId, command.tenantId)`,
      `NotFoundError` propagates even though the cause exists under a different tenant — the
      same-tenant-only default from design.md Decision 4, final for this change), `findReachableEdgesFrom`
      called with the generated id (not `causeId`) and, with a fake resolving `[]` (what a real
      adapter returns for a brand-new id), execution proceeds to persist the edge,
      **a contrived edges-fake causing a cycle rejection propagates `ConflictError` and blocks
      every write** (`save`/`saveEdge`/workflow-`save` all uncalled),
      **`causeId: ""` is treated as absent** (`findById`/`findReachableEdgesFrom`/`saveEdge` all
      uncalled, `hasCause: false` logged),
      **a failure from `hazardousEventRepository.save` itself propagates unmodified with neither
      `workflowRepository.save` nor `causalChainRepository.saveEdge` ever called**,
      **a failure from `workflowRepository.save` or `causalChainRepository.saveEdge` propagates
      unmodified with the already-saved `HazardousEvent` left in place and no compensating delete**
      (`DEF-026`; two sub-cases, one per failing call), two concurrent creates
      sharing one `causeId` both succeed with two distinct edges, `WorkflowInstance` persisted at
      `DRAFT` with all-null attribution, returned DTO has `workflowStatus: "DRAFT"` and reflects
      `save()`'s resolved values (not the pre-save instances), and the
      `hazardous_event.created` log event fires once on success with `hasCause` computed from the
      same non-empty-string test as the rest of `execute()` (verify with `causeId: ""` logging
      `hasCause: false`). Verify it fails to run (module not found —
      `CreateHazardousEventUseCase` doesn't exist yet) via
      `yarn vitest run app/domains/hazardous-events/application/use-cases/CreateHazardousEvent.test.ts`
- [x] 4.2 Implement `app/domains/hazardous-events/application/use-cases/CreateHazardousEvent.ts`
      (`CreateHazardousEventCommand`, `CreateHazardousEventUseCase`) per design.md Decisions 1, 4,
      5, 7, 8, 9, 10 — id generated internally, `updatedAt: null` at construction, `causeId`
      treated as absent when `undefined` or `""` (single `hasCause` computation reused for the
      cause branch, the edge-save branch, and the log line), write order
      `HazardousEvent.save` -> `WorkflowInstance.save` -> edge `saveEdge` from Decision 4/5,
      constructor parameter order from Decision 9, `hazardous_event.created` log event from
      Decision 10, errors propagate unmodified with no compensating delete on a later write's
      failure — and verify
      `yarn vitest run app/domains/hazardous-events/application/use-cases/CreateHazardousEvent.test.ts`
      passes

## 5. Refactor

- [x] 5.1 Re-read the full diff across all four new implementation files (application-layer only:
      two port interfaces, the DTO, the use case) for duplication or simplification opportunities
      (e.g. the `hasCause` computation, the fake-port test setup shared across scenarios) and
      simplify without changing any test's assertions; verify
      `yarn vitest run app/domains/hazardous-events/application/ports/ICausalChainRepository.test.ts app/domains/hazardous-events/application/ports/IHazardTaxonomyRepository.test.ts app/domains/hazardous-events/application/dto/HazardousEventDto.test.ts app/domains/hazardous-events/application/use-cases/CreateHazardousEvent.test.ts`
      stays green after any refactor

## 6. Deferred items register

- [x] 6.1 Add `DEF-026` to `_docs/refactoring-plan/deferred-items-register.md` (three
      non-transactional writes in `CreateHazardousEventUseCase`, no application-layer
      unit-of-work abstraction exists, chosen write order minimizes but does not eliminate the
      risk, a caller retry on failure creates a duplicate `HazardousEvent`; legacy code already
      establishes the fix pattern via `tx.transaction()` and the widely-used `Tx` type — not a
      novel abstraction to invent, design.md Decision 5's Alternative 1 — targeted for `5k`, Phase
      5, per roadmap planning 2026-09-24) and
      **narrow** `DEF-021`'s row (a real computation path now exists via
      `IHazardTaxonomyRepository`, and a real caller — `CreateHazardousEventUseCase` — exercises
      it for the first time, but no adapter exists in this change to prove the query correct
      against real schema; this is a narrowing, not a closure — a future adapter intent, deferred
      to Phase 5, is responsible for closing this row). Verify by reading the updated table rows
      back

## 7. Quality gates

- [x] 7.1 `yarn vitest run app/domains/hazardous-events/application/ports/ICausalChainRepository.test.ts app/domains/hazardous-events/application/ports/IHazardTaxonomyRepository.test.ts app/domains/hazardous-events/application/dto/HazardousEventDto.test.ts app/domains/hazardous-events/application/use-cases/CreateHazardousEvent.test.ts`
      — all green
- [x] 7.2 `yarn tsc` — zero TypeScript errors
- [x] 7.3 `npx prettier --check` on the eight new files (`ICausalChainRepository.ts`,
      `ICausalChainRepository.test.ts`, `IHazardTaxonomyRepository.ts`,
      `IHazardTaxonomyRepository.test.ts`, `HazardousEventDto.ts`, `HazardousEventDto.test.ts`,
      `CreateHazardousEvent.ts`, `CreateHazardousEvent.test.ts`) — never bulk `yarn format`, per
      standing project instruction — Prettier clean
- [x] 7.4 Anti-pattern review against `.github/skills/anti-pattern-check/SKILL.md`
- [x] 7.5 SOLID review — invoke `solid-reviewer` agent against the new use case, DTO, and ports
      (routed through `sdd-implementer`, per standing gate-orchestration rule, not run directly in
      parallel by the implementer)
- [x] 7.6 Documentation review — comments explain WHY not WHAT, one full-diff sweep by a fresh
      subagent, not self-review
- [x] 7.7 Project conventions review against `.github/copilot-instructions.md`
- [x] 7.8 Code review — run `.github/skills/code-review/SKILL.md` in full via a fresh subagent
      (routed through `sdd-implementer`, per standing gate-orchestration rule)
- [x] 7.9 Visual/UX parity review — SKIPPED: this change touches no
      `app/domains/*/presentation/` file and no `app/routes/` file (application-tier only,
      proposal.md Impact)
- [x] 7.10 Independent second-opinion review — Claude Code's built-in code review at `high`
      effort via a second, separate fresh subagent; resolve findings before archiving
- [x] 7.11 Test quality audit (mutation-testing mandate covers every `app/domains/**` file with
      real implementation logic, not `domain/`-only) — ran Stryker scoped to
      `CreateHazardousEvent.ts` and `HazardousEventDto.ts` (the two files with real
      implementation/conversion logic in this change; the two port interface files are type-only
      declarations, out of this gate's scope per the standing rule). First run: 97.62%, one real
      survivor (a `StringLiteral` mutant on the `causeId`-not-a-string `ValidationError` message —
      the test asserted only the error type, not its message). Fixed by asserting the exact
      message; re-run: 100.00%, 0 survived, 42/42 killed.

## 8. Regression and archive

- [x] 8.1 `yarn test:run2` — full PGlite suite passes with no new failures. First two runs hit
      Windows worker-process crashes unrelated to this change (`HttpServerBootstrap.test.ts` load
      timeout, then an unhandled "Worker exited unexpectedly" — same class of crash seen earlier
      this session with Stryker; 0 actual assertion failures in either run). Confirmed not a real
      regression: the failing test passed cleanly in isolation, and a full run with
      `--maxWorkers=2` (reduced concurrency) passed clean — 93/93 files, 1087/1087 tests, 0
      failures.
- [x] 8.2 Run `opsx:archive` on `feature/ca-he-create-use-case` before raising the PR
