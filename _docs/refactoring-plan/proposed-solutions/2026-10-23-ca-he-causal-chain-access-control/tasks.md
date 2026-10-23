## 1. Schema

- [ ] 1.1 Write `app/domains/hazardous-events/infrastructure/hazardousEventShareTable.ts`
      (`hazardous_event_share`: `id`, `hazardousEventId` FK → `hazardousEventTable` cascade,
      `grantedToCountryAccountsId` FK → `countryAccountsTable` cascade, `grantedByUserId` (no FK),
      `reason` nullable text, `createdAt` inline `timestamptz` per ADR-002, unique index on
      `(hazardousEventId, grantedToCountryAccountsId)`, index on `grantedToCountryAccountsId`) and
      verify `yarn tsc` reports zero errors for this file.
- [ ] 1.2 Generate the migration (`yarn dbsync`) — one additive `CREATE TABLE IF NOT EXISTS
  hazardous_event_share` plus its unique and lookup indexes, with `--> statement-breakpoint`
      between statements — and verify the migration applies cleanly against a fresh PGlite
      instance (`tests/integration/db/setup.ts`'s own bootstrap).
- [ ] 1.3 Add `tests/integration/db/testSchema/hazardousEventShareTable.ts` re-exporting via
      `export * from "~/domains/hazardous-events/infrastructure/hazardousEventShareTable"` (`2e`'s
      own pattern) and verify the PGlite test schema includes the new table (existing integration
      setup boots without error).

## 2. IHazardousEventShareRepository port

- [ ] 2.1 Write the failing unit test
      `app/domains/hazardous-events/application/ports/IHazardousEventShareRepository.test.ts`
      asserting the interface shape (no Drizzle row type on any method signature, `Tx` permitted)
      and verify it fails to compile/run before the port exists
      (`yarn vitest run app/domains/hazardous-events/application/ports/IHazardousEventShareRepository.test.ts`).
- [ ] 2.2 Write `IHazardousEventShareRepository.ts` (`grant`, `revoke`, `hasGrant`, design.md "New/
      changed types") and verify
      `yarn vitest run app/domains/hazardous-events/application/ports/IHazardousEventShareRepository.test.ts`
      passes.

## 3. DrizzleHazardousEventShareRepository adapter

- [ ] 3.1 Write failing PGlite integration tests in
      `tests/integration/db/queries/DrizzleHazardousEventShareRepository.test.ts` (`import
  "../setup"`) covering every scenario in
      `specs/hazardous-event-share-repository-port/spec.md`: new grant persisted; null reason;
      duplicate grant is a no-op (exactly one row, original `grantedByUserId`/`reason`
      unchanged); two concurrent `grant()` calls for the same pair both resolve, exactly one row
      afterward; two distinct grantee tenants persist independently; revoke removes a grant;
      revoke on a nonexistent pair is a clean no-op; revoking one grantee's grant leaves another
      grantee's grant on the same event untouched; revoke never touches
      `hazardous_event_causality`; `hasGrant` true/false/wrong-tenant/post-revoke cases; a
      `tx`-scoped call observes that transaction's own uncommitted writes. Verify this test file
      fails (no adapter yet).
- [ ] 3.2 Implement `DrizzleHazardousEventShareRepository.server.ts` (`grant` via `INSERT ...ON
  CONFLICT (hazardous_event_id, granted_to_country_accounts_id) DO NOTHING`; `revoke` via
      `DELETE ... WHERE` both columns match, resolving normally on zero rows affected; `hasGrant`
      via a single-row existence check) and verify
      `yarn vitest run tests/integration/db/queries/DrizzleHazardousEventShareRepository.test.ts`
      passes in full.

## 4. ICausalChainRepository.findVisibleEdgesTouching

- [ ] 4.1 Add the failing scenarios from `specs/causal-chain-repository-port/spec.md`'s new
      `findVisibleEdgesTouching` requirement to
      `app/domains/hazardous-events/application/ports/ICausalChainRepository.test.ts` and verify
      they fail (method not yet on the interface).
- [ ] 4.2 Add `findVisibleEdgesTouching(nodeId, tenantId, tx?)` to `ICausalChainRepository.ts`
      (design.md "New/changed types") and update the port's file-level comment to reference
      `DEF-012`'s closure rather than its existence; verify
      `yarn vitest run app/domains/hazardous-events/application/ports/ICausalChainRepository.test.ts`
      passes.
- [ ] 4.3 Add the matching failing PGlite scenarios to
      `tests/integration/db/queries/DrizzleCausalChainRepository.test.ts`: empty result for no
      edges; same-tenant edge always included; cross-tenant edge with no grant excluded;
      cross-tenant edge with an active grant included; revoking the grant removes it from the
      visible set without deleting the edge; a node that is only ever an effect still has its
      other side's tenant evaluated; a mix of visible/non-visible edges resolves only the visible
      ones; no transitive traversal beyond direct edges; a `tx`-scoped uncommitted grant is
      reflected; existing methods (`findReachableEdgesFrom`, `saveEdge`, `replaceCauseEdge`,
      `countEdgesTouching`) are unaffected by an ungranted cross-tenant edge. Verify this file
      fails to compile/pass before implementation.
- [ ] 4.4 Implement `findVisibleEdgesTouching` in `DrizzleCausalChainRepository.server.ts` — a
      direct-edge query (same WHERE shape as `countEdgesTouching`) joined to `hazardousEventTable`
      twice (classify each side's owning tenant, same join precedent as
      `DrizzleEventCausalityRepository.countReferences`, `4f`) and left-joined to
      `hazardous_event_share` to test for an active grant to `tenantId` on the non-`nodeId` side;
      verify
      `yarn vitest run tests/integration/db/queries/DrizzleCausalChainRepository.test.ts`
      passes in full, including the pre-existing scenarios (no regression).

## 5. GrantHazardousEventShareUseCase

- [ ] 5.1 Write failing tests in
      `app/domains/hazardous-events/application/use-cases/GrantHazardousEventShare.test.ts`
      (mocked repositories) covering every scenario in `specs/grant-hazardous-event-share/spec.md`:
      owning tenant succeeds; non-owning tenant throws `NotFoundError` with no grant created;
      nonexistent `hazardousEventId` throws `NotFoundError`; granting to one's own tenant id
      throws `ValidationError` before any repository call; re-granting an existing pair resolves
      normally. Verify the test file fails (use case not yet implemented).
- [ ] 5.2 Implement `GrantHazardousEventShare.ts` (design.md Decision 3) and verify
      `yarn vitest run app/domains/hazardous-events/application/use-cases/GrantHazardousEventShare.test.ts`
      passes.
- [ ] 5.3 Write a failing PGlite integration test
      `tests/integration/domains/hazardous-events/GrantHazardousEventShare.test.ts` (`import
  "../../setup"`) exercising the use case against real `IHazardousEventRepository` and
      `IHazardousEventShareRepository` adapters for the owning-tenant-succeeds and
      non-owning-tenant-NotFoundError scenarios, then implement whatever wiring is missing and
      verify it passes.

## 6. RevokeHazardousEventShareUseCase

- [ ] 6.1 Write failing tests in
      `app/domains/hazardous-events/application/use-cases/RevokeHazardousEventShare.test.ts`
      (mocked repositories) covering every scenario in
      `specs/revoke-hazardous-event-share/spec.md`: owning tenant succeeds; non-owning tenant
      throws `NotFoundError` with the existing grant untouched; revoking a never-granted pair on
      one's own event resolves normally; revoke never calls anything that would touch
      `hazardous_event_causality`. Verify the test file fails.
- [ ] 6.2 Implement `RevokeHazardousEventShare.ts` and verify
      `yarn vitest run app/domains/hazardous-events/application/use-cases/RevokeHazardousEventShare.test.ts`
      passes.
- [ ] 6.3 Write a failing PGlite integration test
      `tests/integration/domains/hazardous-events/RevokeHazardousEventShare.test.ts` for the
      owning-tenant-succeeds and revoke-leaves-causal-link-intact scenarios against real adapters,
      then verify it passes.

## 7. Module wiring

- [ ] 7.1 Register `DrizzleHazardousEventShareRepository` under a
      `HAZARDOUS_EVENT_SHARE_REPOSITORY` token and both new use cases in
      `HazardousEventsModule.server.ts`; verify
      `yarn vitest run tests/integration/domains/hazardous-events/GrantHazardousEventShare.test.ts tests/integration/domains/hazardous-events/RevokeHazardousEventShare.test.ts`
      passes with the use cases resolved through NestJS DI (not hand-constructed), matching this
      module's existing wiring convention.

## 8. Deferred register and roadmap updates

- [ ] 8.1 Delete the `DEF-012` row from `_docs/refactoring-plan/deferred-items-register.md`.
- [ ] 8.2 Add a new deferred-register row documenting that no write path (`CreateHazardousEvent`,
      `UpdateHazardousEvent`, legacy `event.ts`) can create a _new_ cross-tenant
      `hazardous_event_causality` row, so a grant only governs pre-existing/backfilled rows today
      — trigger: whoever next designs the write-path unlock (per proposal.md's "Scope decision").
- [ ] 8.3 Add a new deferred-register row documenting that a grant does not unlock cross-tenant
      full-event-detail viewing (`GetHazardousEventByIdUseCase`/`IHazardousEventRepository.findById`
      remain unconditionally same-tenant) — trigger: whichever Phase 6+ intent first needs a
      cross-tenant detail view.
- [ ] 8.4 Confirm and record (in this change's own notes, not the register) that `DEF-043` and
      `DEF-046` were explicitly considered and excluded, per design.md Risks.
- [ ] 8.5 Mark `5n` complete in `_docs/refactoring-plan/hazardous-events-refactoring-roadmap.md`,
      including the scope-decision note from proposal.md.

## 9. Quality gates

- [ ] 9.1 Gate 1 — `yarn vitest run` every test file touched in sections 1-7 together; all green.
- [ ] 9.2 Gate 2 — `yarn tsc`; zero errors.
- [ ] 9.3 Gate 3 — `npx prettier --check` scoped to every file touched in sections 1-7; clean (run
      `yarn format` scoped to those files only if not, per standing "never bulk-format" rule).
- [ ] 9.4 Gate 4 — Anti-pattern review against `.github/skills/anti-pattern-check/SKILL.md`.
- [ ] 9.5 Gate 5 — SOLID review via the `solid-reviewer` agent, scoped to this change's files.
- [ ] 9.6 Gate 6 — Documentation review (comments explain WHY, compacted without losing meaning)
      via a fresh subagent, one full-diff sweep.
- [ ] 9.7 Gate 7 — Project-conventions review against `.github/copilot-instructions.md`.
- [ ] 9.8 Gate 8 — Code review via `.github/skills/code-review/SKILL.md` in full, via a fresh
      subagent.
- [ ] 9.9 Gate 9 — Visual/UX parity review: **N/A, explicitly** — this change touches no
      `app/domains/*/presentation/` file and no `app/routes/` file (backend-only, Phase 5; no
      presentation layer exists for HE until Phase 6).
- [ ] 9.10 Gate 10 — Independent second-opinion review: Claude Code's built-in `/code-review` at
      `high` effort via a second, separate fresh subagent; resolve findings before archiving.
- [ ] 9.11 Test-quality-auditor scoped to every file touched under `app/domains/hazardous-events/`
      in sections 2-7 (real implementation logic: the adapter, both use cases); resolve any real
      gap found. (`ICausalChainRepository.ts`/`IHazardousEventShareRepository.ts` themselves are
      type-only interfaces — excluded from this gate on their own, but their adapters are not.)

## 10. Regression and archive

- [ ] 10.1 `yarn test:run2` (full PGlite suite) passes with no new failures; any pre-existing
      failure is confirmed pre-existing by running the same suite against the pre-change `dev`
      baseline, not assumed.
- [ ] 10.2 Run `opsx:archive` on this branch before raising the PR.
