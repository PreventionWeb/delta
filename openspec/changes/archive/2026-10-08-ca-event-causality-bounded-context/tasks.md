## 1. Relocate the port (structural move, no behavior change)

- [x] 1.1 Create `app/domains/event-causality/application/ports/IEventCausalityRepository.ts`
      with the exact same `EventCausalityReferenceCounts` type and `IEventCausalityRepository`
      interface as the current `app/domains/shared/application/ports/IEventCausalityRepository.ts`,
      only correcting the doc comment to describe the `event-causality` bounded context instead of
      "Shared Kernel". Create
      `app/domains/event-causality/application/ports/IEventCausalityRepository.test.ts` with the
      same content as the current test file (same import path updated). Verify with
      `yarn vitest run app/domains/event-causality/application/ports/IEventCausalityRepository.test.ts`
      — passes unmodified in behavior.
- [x] 1.2 Delete `app/domains/shared/application/ports/IEventCausalityRepository.ts` and
      `IEventCausalityRepository.test.ts`. Verify with a grep of the entire repo root for
      `IEventCausalityRepository` (not scoped to `app/`/`tests/` — a narrower scope can miss a
      self-reference or an agent/doc file elsewhere, per this project's own full-ref-search
      convention). Confirmed this session that a repo-root grep returns exactly 16 files; after
      1.1-1.3 land, every remaining hit MUST be one of these, and no other:
      `_docs/refactoring-plan/hazardous-events-refactoring-roadmap.md` (historical narrative —
      describes the move itself, correctly still names the old path as "where it moved from");
      `openspec/specs/event-causality-repository-port/spec.md` and
      `openspec/specs/delete-hazardous-event/spec.md` (main specs, only updated at archive, task
      8.3); `openspec/changes/archive/2026-10-07-ca-he-delete-use-case/**` (the archived `4f`
      change — historical record, never edited); and this change's own
      `proposal.md`/`design.md`/`tasks.md`/`specs/**` under
      `openspec/changes/ca-event-causality-bounded-context/`. Any hit outside that list is a
      missed update.
- [x] 1.3 Update `app/domains/hazardous-events/application/use-cases/DeleteHazardousEvent.ts`'s
      import (currently lines 3-6) to the new path. Update
      `DeleteHazardousEvent.test.ts`'s import (currently lines 11-14) the same way. Verify with
      `yarn vitest run app/domains/hazardous-events/application/use-cases/DeleteHazardousEvent.test.ts`
      — full existing suite still green, zero behavior change.

## 2. DrizzleEventCausalityRepository — failing test first (Red)

- [x] 2.1 Write
      `tests/integration/domains/event-causality/DrizzleEventCausalityRepository.test.ts` (per
      design.md Decision 6 / ADR-009's test-location convention — grouped with this bounded
      context's other integration tests, not `tests/integration/db/queries/`), with
      `import "../../db/setup"` (same depth as `NoticesModule.test.ts`'s own setup import), with
      fixtures seeding `hazardousEventTable`/`disasterEventTable` rows across two tenants and
      `eventCausalityTable` rows covering every scenario in
      `specs/event-causality-repository-port/spec.md`'s new ADDED requirement: zero rows
      (`{sameTenantCount: 0, crossTenantCount: 0}`); same-tenant reference with the queried
      hazardous event as the triggering side; same-tenant reference as the triggered side;
      cross-tenant reference counted in `crossTenantCount` and not excluded; one same-tenant row
      and one cross-tenant row present together, counted independently; both directions present
      together, neither skipped; a row whose triggering and triggered hazardous-event-id both
      equal the queried event, pinned to the exact result
      `{ sameTenantCount: 1, crossTenantCount: 0 }` when queried with that event's own tenant,
      and `{ sameTenantCount: 0, crossTenantCount: 1 }` when queried with a different tenant
      (per design.md Decision 2 — both cases, not just the same-tenant one, so the
      mutation-coverage check in 7.1 has a concrete assertion either way); and a row whose other
      side resolves to a `NULL` `country_accounts_id`, counted in `crossTenantCount` and never
      excluded from both counts (per design.md Decision 3 and the spec delta's "no recorded
      tenant" scenario). Verify the file fails to compile/run (the adapter does not exist yet) —
      Red.

## 3. DrizzleEventCausalityRepository — implementation (Green)

- [x] 3.1 Implement
      `app/domains/event-causality/infrastructure/DrizzleEventCausalityRepository.server.ts`
      fulfilling `IEventCausalityRepository`, per design.md Decisions 2 and 3: a single query
      matching `triggering_hazardous_event_id = :id OR triggered_hazardous_event_id = :id` (not a
      `UNION`), joining both possible sibling tables per side
      (`hazardousEventTable`/`disasterEventTable`, aliased) and selecting the other side's
      `country_accounts_id` via a `CASE` keyed off which predicate matched and that side's own
      `entity_type`, coercing the aggregate to `number` (per design.md Decision 3's "Aggregate
      result type" note — `::int`/`.mapWith(Number)` plus `COALESCE(..., 0)`, not a raw
      `bigint`/string). Verify with
      `yarn vitest run tests/integration/domains/event-causality/DrizzleEventCausalityRepository.test.ts`
      — all scenarios from 2.1 pass (Green), and add an explicit
      `typeof result.sameTenantCount === "number"` (and
      same for `crossTenantCount`) assertion so a regression to a string-typed aggregate fails
      loudly rather than only failing `DeleteHazardousEventUseCase`'s own arithmetic downstream.

## 4. EventCausalityModule — failing test first (Red), then implementation (Green)

- [x] 4.1 Write `app/domains/event-causality/infrastructure/EventCausalityRepositoryToken.ts`
      (typed `Symbol` token, same pattern as `NOTICE_REPOSITORY`) — no behavior to test
      independently yet; its own correctness is exercised by 4.2's assertions below, same as
      `NOTICE_REPOSITORY` has no standalone test of its own.
- [x] 4.2 Write `tests/integration/domains/event-causality/EventCausalityModule.test.ts`,
      following `NoticesModule.test.ts`'s pattern, with two assertions — not one:
      (a) `Test.createTestingModule({ imports: [EventCausalityModule] }).compile()` resolves
      `EVENT_CAUSALITY_REPOSITORY` to an instance of `DrizzleEventCausalityRepository` — this
      alone is **not sufficient** to prove Decision 4's direct-export wiring, since
      NestJS's default `strict: false` testing-module resolution can resolve a provider from
      anywhere in the module graph regardless of whether it is in that module's own `exports`
      array; (b) a second, test-only consumer module — `@Module({ imports:
      [EventCausalityModule], providers: [{ provide: PROBE, useFactory: (repo:
      IEventCausalityRepository) => repo, inject: [EVENT_CAUSALITY_REPOSITORY] }] })` (the
      factory parameter typed explicitly — `useFactory`'s parameters are untyped/`any` by
      default) — compiles successfully and resolves `PROBE` to the same repository instance;
      this is what actually fails with a "Nest can't resolve dependencies" error if
      `EVENT_CAUSALITY_REPOSITORY` is ever removed from `EventCausalityModule`'s own `exports`
      array, and is the real backing test for specs requirement "EventCausalityModule exposes
      the repository port directly, without a use case in front of it". Verify both assertions
      fail first (`EventCausalityModule` does not exist yet) — Red.
- [x] 4.3 Implement `app/domains/event-causality/infrastructure/EventCausalityModule.server.ts`
      per design.md Decision 4 (and the `.server.ts` suffix per Decision 5 — it registers
      `DrizzleProvider` and wires a real repository, transitively importing browser-unsafe code):
      registers `DrizzleProvider` in its own DI scope, provides
      `DrizzleEventCausalityRepository` under the `EVENT_CAUSALITY_REPOSITORY` token, and
      **exports that token directly** (no use case to hide it behind, unlike `NoticesModule`).
      Verify with
      `yarn vitest run tests/integration/domains/event-causality/EventCausalityModule.test.ts` —
      Green.

## 5. Documentation

- [x] 5.1 Confirm (do not re-add — already landed) that
      `_docs/decisions/ADR-009-clean-architecture-module-structure.md` carries: (a) the
      forward-looking note on `event_causality`'s Shared-Kernel-vs-own-bounded-context placement
      (design.md Decision 7, following the `validation-workflow` precedent); (b) the two
      paragraphs just ahead of its "Consequences" section formalizing the `.server.ts` suffix
      rule (design.md Decision 5) and the port-adapter test-location convention (design.md
      Decision 6), both citing `5m`/2026-10-08. Verify by reading the file — no existing sentence
      is retracted, only notes appended.

## 6. Quality gates

- [x] 6.1 `yarn vitest run app/domains/event-causality/application/ports/IEventCausalityRepository.test.ts tests/integration/domains/event-causality/DrizzleEventCausalityRepository.test.ts tests/integration/domains/event-causality/EventCausalityModule.test.ts app/domains/hazardous-events/application/use-cases/DeleteHazardousEvent.test.ts`
      — all green.
- [x] 6.2 `yarn tsc` — zero TypeScript errors.
- [x] 6.3 `npx prettier --check <every file touched in this change, listed explicitly>` — never
      a bulk/repo-wide `yarn format` (known to reformat 300+ unrelated files in this repo). If
      drift is reported, fix with `npx prettier --write` on that same explicit, scoped file list
      only, then re-run `--check` to confirm.
- [x] 6.4 Anti-pattern review against `.github/skills/anti-pattern-check/SKILL.md` — confirm no
      listed anti-pattern is reproduced (in particular: tenant-scoping bypass, since this change's
      whole purpose touches tenant classification).
- [x] 6.5 SOLID review — invoke the `solid-reviewer` agent against every file touched in this
      change; resolve findings.
- [x] 6.6 Documentation review — a fresh subagent sweeps every comment added/changed in this
      change (not self-review), confirming comments explain WHY (e.g. design.md's Decisions 2/3
      rationale reflected inline where the query is non-obvious) not WHAT, compacted without
      losing meaning; one full-diff sweep before the final report.
- [x] 6.7 Project conventions review against `.github/copilot-instructions.md`.
- [x] 6.8 Code review — run `.github/skills/code-review/SKILL.md` in full, via a fresh subagent.
- [x] 6.9 Visual/UX parity review — **skipped explicitly**: this change touches no
      `app/domains/*/presentation/` file and no `app/routes/` file; there is no presentation
      surface to compare against a reference page.
- [x] 6.10 Independent second-opinion review — invoke Claude Code's built-in `code-review` at
      `high` effort via a second, separate fresh subagent; resolve findings before archiving.

## 7. Test quality

- [x] 7.1 Invoke `test-quality-auditor` scoped to
      `app/domains/event-causality/infrastructure/DrizzleEventCausalityRepository.server.ts` (the
      one file in this change with real implementation logic — the port is a type-only interface,
      the module/token are wiring, not logic). Resolve any real mutation-coverage gap found,
      particularly around the same-tenant/cross-tenant `CASE` branch and the self-referencing-row
      edge case.

## 8. Regression and archive

- [x] 8.1 Run `yarn test:run2` (full PGlite suite) and confirm no new failures versus the base
      branch (`feature/ca-event-causality-bounded-context`'s own base,
      `feature/he-ca-phase5`/`dev`) — any pre-existing failure must be confirmed as pre-existing
      by running the same suite on the base branch first, not assumed.
- [x] 8.2 Update `openspec/specs/event-causality-repository-port/spec.md`'s own `## Purpose`
      section directly (not via this change's delta — a delta's `## Purpose` is ignored for an
      existing capability) to describe this port's home as the `event-causality` bounded
      context, not the `app/domains/shared/` Shared Kernel location. This task is explicitly for
      the implementer, not the spec-writer agent that authored this change (design.md Open
      Question 2) — verify by reading the updated file's `## Purpose` line.
- [x] 8.3 Run `opsx:archive` on this change, on this same branch, before raising the PR.
