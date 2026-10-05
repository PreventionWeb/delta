## 1. HazardousEventDetailDto — additive DTO and mapper

- [x] 1.1 Write
      `app/domains/hazardous-events/application/dto/HazardousEventDetailDto.test.ts`
      covering: `toHazardousEventDetailDto` spreads every field `toHazardousEventDto`
      itself returns, unchanged; `currentSpatialObservation` is `null` when the given
      `SpatialObservationRecord` is `null`; `currentSpatialObservation` equals
      `toSpatialObservationDto(record)` when a record is given (assert the real mapped
      shape, not just "is not null"). Verify it fails to run (module not found) via
      `yarn vitest run app/domains/hazardous-events/application/dto/HazardousEventDetailDto.test.ts`
- [x] 1.2 Implement
      `app/domains/hazardous-events/application/dto/HazardousEventDetailDto.ts`
      (`HazardousEventDetailDto`, `toHazardousEventDetailDto`) per design.md Decision 4 —
      `interface ... extends HazardousEventDto`, mapper spreads `toHazardousEventDto`'s own
      output and adds `currentSpatialObservation` via `toSpatialObservationDto` — and
      verify
      `yarn vitest run app/domains/hazardous-events/application/dto/HazardousEventDetailDto.test.ts`
      passes

## 2. GetHazardousEventByIdUseCase

- [x] 2.1 Write
      `app/domains/hazardous-events/application/use-cases/GetHazardousEventById.test.ts`
      using fakes for `IHazardousEventRepository` and `IWorkflowRepository`, and a
      spy/fake `ILogger`, covering every scenario in
      `specs/get-hazardous-event-by-id/spec.md`:
      - Happy path: an existing event with a recorded `WorkflowInstance` and at least one
        spatial observation resolves a `HazardousEventDetailDto` whose `workflowStatus`
        matches the `WorkflowInstance` and whose `currentSpatialObservation` matches the
        fake's `findCurrentSpatialObservation` return value, mapped via
        `toSpatialObservationDto` (assert the real mapped DTO shape, not just
        truthiness) — this test only proves correct passthrough/mapping of whatever the
        fake reports as current; the latest-by-`observationTime` ordering rule itself is
        the port's own contract, verified by the real adapter's own PGlite test (`5e`),
        not re-verified here.
      - No spatial observation recorded: `findCurrentSpatialObservation` returns `null`;
        `execute()` does not throw; the resolved DTO's `currentSpatialObservation` is
        `null`.
      - Missing or cross-tenant `query.id`: the fake `findById` throws `NotFoundError`;
        assert it propagates and the fake `IWorkflowRepository.findByEntity` and
        `IHazardousEventRepository.findCurrentSpatialObservation` are each called zero
        times.
      - Missing/non-string `query.tenantId` or `query.id` (empty string and a
        runtime-cast non-string value): assert `ValidationError` with zero repository
        calls of any kind.
      - Missing `WorkflowInstance` for an otherwise-valid event: the fake `findByEntity`
        resolves `null`; assert `NotFoundError` propagates and
        `findCurrentSpatialObservation` is called zero times.
      - Subsequent lookups use the resolved event's own id, not the raw query input: use
        a fake `IHazardousEventRepository.findById` that resolves an event whose own `id`
        differs cosmetically from `query.id` (matching `4b`'s own "fetched entity's own
        id, not the caller's input" precedent) and assert the fake
        `IWorkflowRepository.findByEntity` and `findCurrentSpatialObservation` were each
        called with the *resolved* event's id.
      - A successful call logs exactly once with the fetched event's id/tenant; every
        failing call logs zero times.
      - **Mandatory concurrent-callers scenario** (project standing rule for shared
        mutable state, and `specs/get-hazardous-event-by-id/spec.md`'s own "Concurrent
        callers" requirement): two `execute()` calls for two different existing events,
        issued concurrently before either resolves, each resolve with the DTO matching
        their own id, with no cross-contamination between the two calls' own fake-call
        arguments or results (matching `GetNoticeById.test.ts`'s own analogous
        scenario) — this use case holds no shared mutable state of its own, so this
        scenario proves the absence of cross-call interference, not prevention of a
        check-then-act race (design.md Risks explains why the latter does not apply to
        this pure-read shape).
      Verify it fails to run (module not found — `GetHazardousEventByIdUseCase` doesn't
      exist yet) via
      `yarn vitest run app/domains/hazardous-events/application/use-cases/GetHazardousEventById.test.ts`
- [x] 2.2 Implement
      `app/domains/hazardous-events/application/use-cases/GetHazardousEventById.ts`
      (`GetHazardousEventByIdQuery`, `GetHazardousEventByIdUseCase`) per design.md
      Decisions 1-4 — no defense-in-depth tenant-equality check (Decision 1), the
      defensive `WorkflowInstance` `NotFoundError` (Decision 2), sequential reads keyed
      off the resolved event's own id (Decision 3), and `toHazardousEventDetailDto`
      (task 1.2) for the return value — and verify
      `yarn vitest run app/domains/hazardous-events/application/use-cases/GetHazardousEventById.test.ts`
      passes

## 3. Refactor

- [x] 3.1 Re-read the full diff across both new implementation files
      (`HazardousEventDetailDto.ts`, `GetHazardousEventById.ts`) for duplication or
      simplification opportunities, and simplify without changing any test's assertions;
      verify
      `yarn vitest run app/domains/hazardous-events/application/dto/HazardousEventDetailDto.test.ts app/domains/hazardous-events/application/use-cases/GetHazardousEventById.test.ts`
      stays green after any refactor

## 4. Deferred items register

- [x] 4.1 Add `DEF-031` to `_docs/refactoring-plan/deferred-items-register.md`, naming
      the Phase-M-backfill/defensive-`WorkflowInstance`-`NotFoundError` interaction from
      design.md Decision 2/Risks: once a real `IHazardousEventRepository` adapter and a
      real route exist, this use case's defensive `NotFoundError` for a missing
      `WorkflowInstance` will fire for every legacy-created event until Phase M's backfill
      runs — targeted at whichever future intent first wires a real adapter and route to
      `GetHazardousEventByIdUseCase` (and note that `4c`'s own `UpdateHazardousEvent.ts`
      carries the identical latent issue on its own write path, for the same reason). Do
      **not** modify any other existing register row. Verify by reading the register back:
      the new row is present, every other row unchanged.

## 5. Quality gates

- [x] 5.1 `yarn vitest run app/domains/hazardous-events/application/dto/HazardousEventDetailDto.test.ts app/domains/hazardous-events/application/use-cases/GetHazardousEventById.test.ts`
      — all green
- [x] 5.2 `yarn tsc` — zero TypeScript errors
- [x] 5.3 `npx prettier --check` on the two new implementation files and their two test
      files (four files total) — never bulk `yarn format`, per standing project
      instruction — Prettier clean
- [x] 5.4 Anti-pattern review against `.github/skills/anti-pattern-check/SKILL.md`
- [x] 5.5 SOLID review — invoke `solid-reviewer` agent against `GetHazardousEventById.ts`
      and `HazardousEventDetailDto.ts` (routed through `sdd-implementer`, per standing
      gate-orchestration rule, not run directly in parallel by the implementer)
- [x] 5.6 Documentation review — comments explain WHY not WHAT, one full-diff sweep by a
      fresh subagent, not self-review
- [x] 5.7 Project conventions review against `.github/copilot-instructions.md`
- [x] 5.8 Code review — run `.github/skills/code-review/SKILL.md` in full via a fresh
      subagent (routed through `sdd-implementer`, per standing gate-orchestration rule)
- [x] 5.9 Visual/UX parity review — SKIP: this change touches no
      `app/domains/*/presentation/` file and no `app/routes/` file (application-tier only,
      proposal.md Impact); state this explicitly in the gate report rather than silently
      omitting the gate
- [x] 5.10 Independent second-opinion review — Claude Code's built-in `/code-review` at
      high effort via a second, separate fresh subagent (not the project's own
      `code-review` skill again); resolve findings before archiving. Other tools: use an
      equivalent platform feature if one exists, otherwise skip this task and say so
      explicitly
- [x] 5.11 Test quality audit (mutation-testing mandate covers every `app/domains/**` file
      with real implementation logic) — run `test-quality-auditor` scoped to
      `HazardousEventDetailDto.ts` (its real branching on `currentObservation === null`)
      and `GetHazardousEventById.ts` — the two files with real implementation logic in
      this change. Resolve any real survivor found

## 6. Regression and archive

- [x] 6.1 `yarn test:run2` — 1,240 of 1,241 real tests passed (1 todo). The one failure
      (`HttpServerBootstrap.test.ts`, NestJS bootstrap timeout, unrelated to anything this
      change touches) is the same failure already confirmed pre-existing via an isolated
      worktree on `feature/he-ca-phase4` during the `4c` round — identical test, line, and
      error on the same integration branch, not a new claim.
- [x] 6.2 Run `opsx:archive` on `feature/ca-he-get-by-id-use-case`.
