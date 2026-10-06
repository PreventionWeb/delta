## 1. HazardousEventDto.ts — internal extraction of `mapHazardousEventFields`, no exported-behavior change

- [x] 1.1 Run
      `yarn vitest run app/domains/hazardous-events/application/dto/HazardousEventDto.test.ts`
      and confirm it passes against the current, pre-refactor `HazardousEventDto.ts` (baseline
      — this file is not otherwise touched by this task; recorded so task 1.3's "still
      green, unmodified" claim has a concrete before/after to compare against).
- [x] 1.2 Refactor `app/domains/hazardous-events/application/dto/HazardousEventDto.ts` per
      design.md Decision 3 (human-reviewer decision): extract a new, exported
      `mapHazardousEventFields(event: HazardousEvent): Omit<HazardousEventDto,
      "workflowStatus">` containing exactly the field-mapping logic `toHazardousEventDto`
      already has (same fields, same transforms — `submittedAt?.toISOString() ?? null`,
      `createdAt.toISOString()`, `updatedAt?.toISOString() ?? null`, unchanged), with a doc
      comment stating it is exported for cross-file reuse by this domain's own additive-DTO
      mappers but is not part of this module's stable, documented public DTO surface
      (`toHazardousEventDto` remains that surface). Rewrite `toHazardousEventDto` to call
      it: `return { ...mapHazardousEventFields(event), workflowStatus:
      workflowInstance.status };`. Do not change `toHazardousEventDto`'s own exported
      signature, parameter types, or return type in any way.
- [x] 1.3 Verify
      `yarn vitest run app/domains/hazardous-events/application/dto/HazardousEventDto.test.ts`
      still passes, **unmodified** — do not edit this test file for this task. A failure
      here means the extraction changed `toHazardousEventDto`'s observable behavior, which
      is out of scope; fix the refactor, not the test.

## 2. HazardousEventListItemDto — additive, nullable-workflowStatus DTO and mapper, sharing `mapHazardousEventFields`

- [x] 2.1 Write
      `app/domains/hazardous-events/application/dto/HazardousEventListItemDto.test.ts`
      covering: `toHazardousEventListItemDto(event, workflowInstance)` with a non-null
      `WorkflowInstance` sets `workflowStatus` to that instance's own `status` and every
      other field matches `event`'s own values; with `null`, sets `workflowStatus: null`
      and every other field still matches `event`'s own values (proving the shared
      `mapHazardousEventFields` extraction runs identically regardless of whether a
      `WorkflowInstance` exists — this replaces the field-by-field parity test design.md
      previously described, since there is no longer a second, independent mapper to pin
      against drift). Verify it fails to run (module not found) via
      `yarn vitest run app/domains/hazardous-events/application/dto/HazardousEventListItemDto.test.ts`
- [x] 2.2 Implement
      `app/domains/hazardous-events/application/dto/HazardousEventListItemDto.ts`
      (`HazardousEventListItemDto`, `toHazardousEventListItemDto`) per design.md
      Decisions 2-3 — `interface HazardousEventListItemDto extends
      Omit<HazardousEventDto, "workflowStatus"> { workflowStatus: Status | null }`;
      `toHazardousEventListItemDto` imports and calls `mapHazardousEventFields` (task 1.2)
      from `./HazardousEventDto`: `return { ...mapHazardousEventFields(event),
      workflowStatus: workflowInstance?.status ?? null };` — and verify
      `yarn vitest run app/domains/hazardous-events/application/dto/HazardousEventListItemDto.test.ts`
      passes

## 3. ListHazardousEventsUseCase

- [x] 3.1 Write
      `app/domains/hazardous-events/application/use-cases/ListHazardousEvents.test.ts`
      using fakes for `IHazardousEventRepository` and `IWorkflowRepository`, and a
      spy/fake `ILogger`, covering every scenario in
      `specs/list-hazardous-events/spec.md`:
      - Happy path: three events, each with its own `WorkflowInstance` — resolved array
        has one DTO per event, each `workflowStatus` matching its own instance.
      - Pagination forwarded as given: assert `findAll` is called exactly once with
        `tenantId` and `{ page: 2, pageSize: 10 }` unchanged (matching
        `ListNotices.test.ts`'s own "passes tenantId and pagination to findAll exactly
        once" scenario — valid, in-bounds values).
      - Missing/non-string `query.tenantId` (empty string and a runtime-cast non-string
        value): assert `ValidationError`, with zero calls to either repository.
      - **Page/pageSize bounds guard** (design.md Decision 6, spec's own "out-of-bounds
        page or pageSize" requirement): `page: 0` (and a negative/non-integer value),
        `pageSize: 0` (and a negative/non-integer value), and `pageSize: 101` each assert
        `ValidationError` with zero calls to either repository; `page: 1, pageSize: 100`
        (both at their valid boundary) asserts `execute()` does not throw for this reason
        and `findAll` is called with `{ page: 1, pageSize: 100 }` unchanged.
      - Empty page: fake `findAll` resolves `[]`; assert the resolved value is `[]` and
        `findByEntityIds` is called zero times; assert the log event reports `count: 0,
        missingWorkflowStatusCount: 0`.
      - One batched call regardless of page size: fake `findAll` resolves five events;
        assert `findByEntityIds` is called exactly once, with an array of exactly those
        five ids and entity type `"HE"`; assert the fake's single-entity `findByEntity`
        method is called zero times (the literal per-row/N+1 guard).
      - `findAll` rejects: assert the same error propagates from `execute()`, zero calls
        to `findByEntityIds`, no log event (matches `ListNotices.test.ts`'s own
        "propagates repository errors unmodified" scenario).
      - `findByEntityIds` rejects (after `findAll` resolves one or more events): assert
        the same error propagates from `execute()`, no log event.
      - **Join correctness, not a positional zip** (spec's own "out of order with one
        omitted" scenario) — fake `findByEntityIds` must return instances in a different
        order than the events and omit one in the middle; assert the resolved array's
        order matches `findAll`'s own order and each DTO's `workflowStatus` matches its
        own event's id, not array position. A test whose fake returns instances in the
        same order as the events would pass a buggy positional-zip implementation — do
        not write that version.
      - Missing `WorkflowInstance` for one row among several: resolved array has the
        correct length, the affected row has `workflowStatus: null` and every other field
        populated, `execute()` does not throw, and the log event reports `count: 3,
        missingWorkflowStatusCount: 1`.
      - **Mandatory concurrent-callers scenario** (project standing rule for shared
        mutable state, and the spec's own "Concurrent callers" requirement): two
        `execute()` calls for two different tenants, issued concurrently before either
        resolves, each resolve with that tenant's own correctly status-enriched rows, and
        each tenant's own `findByEntityIds` call is given only that tenant's own events'
        ids — matching `ListNoticesUseCase.test.ts`'s own analogous scenario.
      Verify it fails to run (module not found — `ListHazardousEventsUseCase` doesn't
      exist yet) via
      `yarn vitest run app/domains/hazardous-events/application/use-cases/ListHazardousEvents.test.ts`
- [x] 3.2 Implement
      `app/domains/hazardous-events/application/use-cases/ListHazardousEvents.ts`
      (`ListHazardousEventsQuery`, `ListHazardousEventsUseCase`) per design.md
      Decisions 1, 4, 6, 7 — flat query shape; `assertNonEmptyString(query.tenantId,
      "tenantId")` then a `page`/`pageSize` bounds guard
      (`Number.isInteger(query.page) && query.page >= 1`, and
      `Number.isInteger(query.pageSize) && query.pageSize >= 1 && query.pageSize <= 100`,
      throwing `ValidationError` otherwise — Decision 6, before any repository call); skip
      `findByEntityIds` entirely for an empty page (Decision 4); join by id via a `Map`
      keyed on `WorkflowInstance.entityId` while iterating `events` (preserving
      `findAll`'s own order, not `workflowInstances`'s); log `count` and
      `missingWorkflowStatusCount` (Decision 7) — and verify
      `yarn vitest run app/domains/hazardous-events/application/use-cases/ListHazardousEvents.test.ts`
      passes

## 4. Refactor

- [x] 4.1 Re-read the full diff across all three touched/new implementation files
      (`HazardousEventDto.ts`, `HazardousEventListItemDto.ts`, `ListHazardousEvents.ts`)
      for duplication or simplification opportunities, and simplify without changing any
      test's assertions; verify
      `yarn vitest run app/domains/hazardous-events/application/dto/HazardousEventDto.test.ts app/domains/hazardous-events/application/dto/HazardousEventListItemDto.test.ts app/domains/hazardous-events/application/use-cases/ListHazardousEvents.test.ts`
      stays green after any refactor

## 5. Deferred items register

- [x] 5.1 Widen the existing `DEF-031` row in
      `_docs/refactoring-plan/deferred-items-register.md` (do not add a new row, do not
      touch any other row) across all four of its free-text columns:
      - **Title:** broaden from naming only `GetHazardousEventByIdUseCase` to covering
        both the single-fetch and list read paths.
      - **Detail:** add that `ListHazardousEventsUseCase` surfaces the identical
        not-yet-backfilled-legacy-row root cause as `workflowStatus: null` on the
        affected row (data, not an error) rather than a thrown `NotFoundError`, and that a
        future Phase 6 list-to-detail navigation could let a user click from a
        successfully rendered `null`-status list row into `GetHazardousEventByIdUseCase`'s
        own defensive 404 for that same event (design.md Risks) — both are the same root
        cause, surfacing differently depending on which use case serves the request.
      - **Trigger:** add `ListHazardousEventsUseCase` and the future Phase 6 list+detail
        routes alongside the existing `GetHazardousEventByIdUseCase` trigger.
      - **Origin:** append "`4e` design.md Risks, 2026-10-05" after the existing `4d`
        citation.
      Verify by reading the register back: all four `DEF-031` columns reflect the above,
      every other row is byte-for-byte unchanged.

## 6. Quality gates

- [x] 6.1 `yarn vitest run app/domains/hazardous-events/application/dto/HazardousEventDto.test.ts app/domains/hazardous-events/application/dto/HazardousEventListItemDto.test.ts app/domains/hazardous-events/application/use-cases/ListHazardousEvents.test.ts`
      — all green (the first file is unmodified but included to confirm Decision 3's
      extraction stayed behavior-preserving through every later edit in this change)
- [x] 6.2 `yarn tsc` — zero TypeScript errors
- [x] 6.3 `npx prettier --check` on the three touched/new implementation files
      (`HazardousEventDto.ts`, `HazardousEventListItemDto.ts`, `ListHazardousEvents.ts`)
      and their three test files (six files total) — never bulk `yarn format`, per
      standing project instruction — Prettier clean
- [x] 6.4 Anti-pattern review against `.github/skills/anti-pattern-check/SKILL.md`
- [x] 6.5 SOLID review — invoke `solid-reviewer` agent against `ListHazardousEvents.ts`,
      `HazardousEventListItemDto.ts`, and the `mapHazardousEventFields` extraction inside
      `HazardousEventDto.ts` (routed through `sdd-implementer`, per standing
      gate-orchestration rule, not run directly in parallel by the implementer)
- [x] 6.6 Documentation review — comments explain WHY not WHAT, one full-diff sweep by a
      fresh subagent, not self-review
- [x] 6.7 Project conventions review against `.github/copilot-instructions.md`
- [x] 6.8 Code review — run `.github/skills/code-review/SKILL.md` in full via a fresh
      subagent (routed through `sdd-implementer`, per standing gate-orchestration rule)
- [x] 6.9 Visual/UX parity review — SKIP: this change touches no
      `app/domains/*/presentation/` file and no `app/routes/` file (application-tier only,
      proposal.md Impact); state this explicitly in the gate report rather than silently
      omitting the gate
- [x] 6.10 Independent second-opinion review — Claude Code's built-in `/code-review` at
      high effort via a second, separate fresh subagent (not the project's own
      `code-review` skill again); resolve findings before archiving. Other tools: use an
      equivalent platform feature if one exists, otherwise skip this task and say so
      explicitly
- [x] 6.11 Test quality audit (mutation-testing mandate covers every `app/domains/**` file
      with real implementation logic) — run `test-quality-auditor` scoped to
      `HazardousEventDto.ts` (the extracted `mapHazardousEventFields`, and
      `toHazardousEventDto`'s own now-thinner body), `HazardousEventListItemDto.ts` (its
      `workflowInstance?.status ?? null` branching), and `ListHazardousEvents.ts` (the
      empty-page short-circuit, the id-based join, and the missing-instance handling) —
      the three files with real implementation logic touched in this change. Resolve any
      real survivor found

## 7. Regression and archive

- [x] 7.1 `yarn test:run2` — first run: 1264/1265 passed, 1 todo; one failure in
      `hazardousEventDisasterEventBoundary.test.ts` (a 5000ms-timeout, 201-row-seed test
      entirely unrelated to this change's own files). Not assumed pre-existing: re-ran the
      exact same suite on the exact same code a second time — all 1264 tests passed, zero
      failures, confirming the first failure was a non-deterministic, load-sensitive flake,
      not a regression (stronger evidence than a base-branch diff, since it rules out any
      code difference entirely).
- [x] 7.2 Run `opsx:archive` on `feature/ca-he-list-use-case`.
