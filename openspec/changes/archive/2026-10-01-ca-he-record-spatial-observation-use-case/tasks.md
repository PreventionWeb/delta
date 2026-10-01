## 1. IDivisionRepository port

- [x] 1.1 Write `app/domains/hazardous-events/application/ports/IDivisionRepository.test.ts`: a
      fake in-memory conformance implementation (matches
      `IHazardTaxonomyRepository.test.ts`'s `FakeHazardTaxonomyRepository` pattern) exercising
      every scenario in `specs/division-repository-port/spec.md` (same-tenant-only inclusion,
      non-existent id excluded without throwing, empty `ids` array resolves an empty set, a
      `countryAccountsId: null` row excluded for every queried tenant), implemented as a class
      declared `implements IDivisionRepository`, importing the interface as an `import type`
      from `./IDivisionRepository` (matches `IHazardTaxonomyRepository.test.ts`'s own
      convention). This project has neither `verbatimModuleSyntax` nor a vitest `typecheck`
      block configured, so esbuild erases the `import type`/`implements` clause before
      `yarn vitest run` ever resolves the module — **the red signal at this step is `yarn tsc`
      reporting the missing `./IDivisionRepository` module, not `yarn vitest run`**, which may
      pass even though the port file does not exist yet (same caveat `4b`'s own tasks.md
      recorded for its two new ports). Verify red with `yarn tsc`
- [x] 1.2 Implement `app/domains/hazardous-events/application/ports/IDivisionRepository.ts` per
      design.md Decision 8 (`findValidDivisionIds(ids, tenantId): Promise<ReadonlySet<string>>`,
      doc comment naming the null-`countryAccountsId` exclusion) and verify `yarn tsc` no longer
      reports the missing module, and
      `yarn vitest run app/domains/hazardous-events/application/ports/IDivisionRepository.test.ts`
      passes

## 2. SpatialObservationDto

- [x] 2.1 Write `app/domains/hazardous-events/application/dto/SpatialObservationDto.test.ts`
      (matches `HazardousEventDto.test.ts`'s pattern): Date→ISO conversion for
      `observationTime`/`createdAt`/`updatedAt`, `null` passthrough for `note`, `geometries`/
      `divisionIds` copied from the input record. Verify it fails to run (module not found —
      `toSpatialObservationDto` doesn't exist yet) via
      `yarn vitest run app/domains/hazardous-events/application/dto/SpatialObservationDto.test.ts`
- [x] 2.2 Implement `app/domains/hazardous-events/application/dto/SpatialObservationDto.ts`
      (`SpatialObservationDto` interface + `toSpatialObservationDto(record)`) per design.md
      Decision 9 and verify
      `yarn vitest run app/domains/hazardous-events/application/dto/SpatialObservationDto.test.ts`
      passes

## 3. RecordSpatialObservationUseCase

- [x] 3.1 Write `app/domains/hazardous-events/application/use-cases/RecordSpatialObservation.test.ts`
      using fakes for both ports (`IHazardousEventRepository`, `IDivisionRepository`) and a
      spy/fake `ILogger`, covering every scenario in `specs/record-spatial-observation/spec.md`:
      missing `hazardousEventId` propagates `NotFoundError` with zero spatial reads/writes,
      cross-tenant `hazardousEventId` propagates `NotFoundError` identically, omitted
      `observationTime` defaults to a fixed `now` (use `vi.setSystemTime`/`vi.useFakeTimers()` to
      assert the exact persisted value, then restore real timers), a malformed `observationTime`
      (non-`Date`, and a `NaN`-time `Date`) propagates `ValidationError` **before**
      `findSpatialObservationByTime` is ever called (assert the fake's call count is zero), no
      existing observation at the resolved time succeeds regardless of `confirmReplace`, a
      duplicate `observationTime` with `confirmReplace` omitted or `false` propagates
      `ConflictError` with zero calls to `saveSpatialObservation`, a duplicate `observationTime`
      with `confirmReplace: true` persists a replacement reusing the existing observation's `id`
      and `createdAt` with a fresh `updatedAt`, a non-boolean truthy `confirmReplace` (e.g. the
      string `"true"`) is treated as `false` and still conflicts, an omitted `note` on a replace
      persists `null` (not the prior observation's note), **two concurrent callers racing for an
      empty `observationTime` slot** — a fake `saveSpatialObservation` that throws `ConflictError`
      on its second call for the same `(hazardousEventId, observationTime)` pair (simulating the
      real DB unique-constraint violation `3d`'s design.md Decision 7 names) — verify
      `execute()` propagates that rejection unmodified to the losing caller rather than resolving
      successfully, a cross-tenant/non-existent `divisionIds` entry propagates `ValidationError`
      with zero calls to `saveSpatialObservation`, a same-tenant `divisionIds` entry succeeds, and
      a successful call returns a `SpatialObservationDto` with ISO date strings reflecting
      `saveSpatialObservation()`'s resolved values. Verify it fails to run (module not found —
      `RecordSpatialObservationUseCase` doesn't exist yet) via
      `yarn vitest run app/domains/hazardous-events/application/use-cases/RecordSpatialObservation.test.ts`
- [x] 3.2 Implement
      `app/domains/hazardous-events/application/use-cases/RecordSpatialObservation.ts`
      (`RecordSpatialObservationCommand`, `RecordSpatialObservationUseCase`, the local
      `toSpatialObservationRecord()` mapper, a locally-duplicated `isInvalidDate` guard, and a
      locally-duplicated `toSafeStringArray()` helper matching `CreateHazardousEvent.ts`'s own
      precedent) per design.md Decisions 1–7 and 10 — validation/write order from Decision 2,
      `id`/`createdAt` reuse on replace from Decision 4, `note` defaulting from Decision 5, error
      propagation from Decision 6, `observationTime` shape-guard ordering from Decision 7,
      constructor order and logging from Decision 10 — and verify
      `yarn vitest run app/domains/hazardous-events/application/use-cases/RecordSpatialObservation.test.ts`
      passes

## 4. Refactor

- [x] 4.1 Re-read the full diff across all three new implementation files (the port interface,
      the DTO, the use case) for duplication or simplification opportunities (e.g. the
      `isInvalidDate`/`toSafeStringArray` local duplicates, the fake-port test setup shared
      across scenarios) and simplify without changing any test's assertions; verify
      `yarn vitest run app/domains/hazardous-events/application/ports/IDivisionRepository.test.ts app/domains/hazardous-events/application/dto/SpatialObservationDto.test.ts app/domains/hazardous-events/application/use-cases/RecordSpatialObservation.test.ts`
      stays green after any refactor

## 5. Deferred items register

- [x] 5.1 In `_docs/refactoring-plan/deferred-items-register.md`: **narrow** `DEF-005`'s row (a
      real computation path now exists via `IDivisionRepository`, and a real caller —
      `RecordSpatialObservationUseCase` — exercises it for the first time, but no adapter exists
      in this change to prove the query correct against real schema; full closure stays `5e`'s
      job), and **add `DEF-027`** (`SpatialObservationRecord`/`SpatialObservation` type
      duplication — the port's provisional record shape and the real domain entity are
      structurally identical today; this change adds a mapping boundary rather than retyping the
      port, per `3d`'s own explicit hand-off of that retype to `5e`; targeted for `5e`, roadmap
      planning 2026-09-30). Verify by reading the updated rows back

## 6. Quality gates

- [x] 6.1 `yarn vitest run app/domains/hazardous-events/application/ports/IDivisionRepository.test.ts app/domains/hazardous-events/application/dto/SpatialObservationDto.test.ts app/domains/hazardous-events/application/use-cases/RecordSpatialObservation.test.ts`
      — all green
- [x] 6.2 `yarn tsc` — zero TypeScript errors
- [x] 6.3 `npx prettier --check` on the six new files (`IDivisionRepository.ts`,
      `IDivisionRepository.test.ts`, `SpatialObservationDto.ts`, `SpatialObservationDto.test.ts`,
      `RecordSpatialObservation.ts`, `RecordSpatialObservation.test.ts`) — never bulk
      `yarn format`, per standing project instruction — Prettier clean
- [x] 6.4 Anti-pattern review against `.github/skills/anti-pattern-check/SKILL.md`
- [x] 6.5 SOLID review — invoke `solid-reviewer` agent against the new use case, DTO, and port
      (routed through `sdd-implementer`, per standing gate-orchestration rule, not run directly
      in parallel by the implementer)
- [x] 6.6 Documentation review — comments explain WHY not WHAT, one full-diff sweep by a fresh
      subagent, not self-review
- [x] 6.7 Project conventions review against `.github/copilot-instructions.md`
- [x] 6.8 Code review — run `.github/skills/code-review/SKILL.md` in full via a fresh subagent
      (routed through `sdd-implementer`, per standing gate-orchestration rule)
- [x] 6.9 Visual/UX parity review — SKIP: this change touches no `app/domains/*/presentation/`
      file and no `app/routes/` file (application-tier only, proposal.md Impact); state this
      explicitly in the gate report rather than silently omitting the gate
- [x] 6.10 Independent second-opinion review — SUBSTITUTE ran, not the literal built-in. No
      distinct built-in `/code-review` was reachable from a subagent this session: the only
      `code-review` in the skills listing is this project's own (identical replicas under
      `.claude/skills/` and `.github/skills/`), which appears to shadow the platform built-in by
      name — inferred from the `simplify` skill's description ("use /code-review for that"). Ran
      instead: a second, separate fresh `general-purpose` subagent doing a generic,
      checklist-free correctness/security/concurrency review, none of 6.8's findings passed in.
      Findings triaged (see report); two need user decision. Recommend renaming the project skill
      (e.g. `delta-code-review`) — flagged to user, not renamed here (outside this change's
      scope).
- [x] 6.11 Test quality audit (mutation-testing mandate covers every `app/domains/**` file with
      real implementation logic, not `domain/`-only) — run `test-quality-auditor` scoped to
      `RecordSpatialObservation.ts` and `SpatialObservationDto.ts` (the two files with real
      implementation/conversion logic in this change; `IDivisionRepository.ts` is a type-only
      declaration, out of this gate's scope per the standing rule). Resolve any real survivor
      found, matching `4b`'s own precedent of asserting an exact error message where a mutant
      survived on a message string

## 7. Regression and archive

- [x] 7.1 `yarn test:run2` — full PGlite suite passes with no new failures. If any failure
      appears, confirm it is pre-existing by running the same suite against the base branch
      before archiving (standing rule: never label a failure "pre-existing" without this check)
- [x] 7.2 Run `opsx:archive` on `feature/ca-he-record-spatial-observation-use-case` before
      raising the PR
