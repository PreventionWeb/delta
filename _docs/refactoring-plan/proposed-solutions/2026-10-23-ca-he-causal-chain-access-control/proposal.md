> **Status: Proposed design, not implemented — deliberately paused, 2026-10-23.**
> This is `5n`'s full OpenSpec proposal (originally drafted under
> `openspec/changes/ca-he-causal-chain-access-control/`), moved here rather than applied or
> archived. It is a complete, independently-verified design — not an abandoned or half-finished
> change. Implementation is paused because the actual cross-tenant sharing/access-control
> requirement is still undecided at the product level (pending stakeholder/business discussion,
> no production data currently depends on it, confirmed via this proposal's own readiness-check:
> no live code path can create a cross-tenant `hazardous_event_causality` row today). Tracked as
> `DEF-012` in `deferred-items-register.md`; see `5n` in
> `hazardous-events-refactoring-roadmap.md` for current status. Treat this as a strong starting
> point for that future discussion, not a spec to implement as-is without re-confirming its
> design decisions against whatever the business actually decides.

## Why

`hazardous_event_causality` (`2e`) deliberately allows cross-tenant cause/effect links (a real
transboundary-hazard need, e.g. Nepal→India floods) but no access-control mechanism exists to
govern who may know about or traverse the other tenant's linked event — `DEF-012`. Readiness-check
research for this intent also surfaced a fact the roadmap's own scoping text didn't anticipate:
**no code path can create a cross-tenant link today.** Both `CreateHazardousEvent.ts` (line ~162)
and `UpdateHazardousEvent.ts` (line ~310) resolve a proposed `causeId` via
`hazardousEventRepository.findById(causeId, command.tenantId)` — "Same-tenant-only, final -- a
cross-tenant causeId throws NotFoundError even though it exists in the other tenant," per both
files' own inline comments. The legacy write path (`app/backend.server/models/event.ts`) enforces
the identical same-tenant rule on `event_relationship` (lines 643, 871, 1181, 1849). So any
cross-tenant row in this table today can only arrive via direct DB write or a future data-migration
backfill (Phase M, a separate workstream) — not through either live application write path.

This reframes, but does not remove, the need for `5n`: `DEF-012` is about governing visibility of
cross-tenant rows that already can exist in the table (via backfill or any future write-path
change), independent of whether today's interactive UI can create a _new_ one. Building the access
grant mechanism now is still correct and closes `DEF-012` as scoped; it does **not** need to also
unlock interactive cross-tenant link creation to do so — that is a separate, non-trivial product
question (addressed under "Scope decision for human review" below) tracked as a new deferred item
rather than silently rolled into this intent.

A repo-wide grep (`Share`/`ObjectShare`/`sharingGrant`/`accessGrant`/`grantedTo`/`sharedWith`,
case-insensitive, plus a `countryAccountsId`-scoping sweep) found no existing sharing/grant
mechanism anywhere in `app/`, `_docs/decisions/`, or `openspec/specs/` — matches made were generic
"Shared Kernel" prose, `SuperAdminMenuBar`/`superAdminUsersTable` (a platform-wide admin role, not
a tenant-to-tenant grant), and `selectInstanceService.ts` (a user selecting _which single_ tenant's
session is active, not simultaneous cross-tenant access). `2e` design.md Decision 12's leading
candidate — explicit per-record sharing grants, Salesforce `<Object>Share`-style — is confirmed,
not replaced.

## What Changes

- Add `hazardous_event_share`, an additive table recording one row per (hazardous event, tenant
  granted access) pair: `hazardousEventId`, `grantedToCountryAccountsId`, `grantedByUserId`,
  `reason` (nullable), `createdAt`. Unique on `(hazardousEventId, grantedToCountryAccountsId)`.
- Add `IHazardousEventShareRepository` (`grant`, `revoke`, `hasGrant`) and its Drizzle adapter,
  registered in `HazardousEventsModule`.
- Add `GrantHazardousEventShareUseCase` / `RevokeHazardousEventShareUseCase` — **owning tenant
  only** may grant or revoke (enforced via `IHazardousEventRepository.findById(hazardousEventId,
tenantId)`; a non-owning tenant's attempt resolves `NotFoundError`, same non-disclosure shape as
  every other tenant-scoped lookup in this domain, not a distinct 403).
- Add `ICausalChainRepository.findVisibleEdgesTouching(nodeId, tenantId, tx?)` — a new,
  grant-gated read method returning only direct edges touching `nodeId` whose other side is either
  same-tenant or has an active grant to `tenantId`. **Existing methods
  (`findReachableEdgesFrom`, `saveEdge`, `replaceCauseEdge`, `countEdgesTouching`) are
  unchanged and stay grant-blind** — see design.md for why (cycle detection and the `4f`
  delete-dependent check both require the true, ungated graph; gating them would be a correctness
  bug dressed as a security fix).
- **What a grantee tenant can see (answers roadmap question 2):** only the edge's existence (the
  linked event's own id), via the new method above — never the linked `HazardousEvent`'s full
  detail. `IHazardousEventRepository.findById` / `GetHazardousEventByIdUseCase` remain
  unconditionally same-tenant; this intent does not touch them. Tracked as a new deferred item
  (grant exists, full cross-tenant detail view does not) rather than built speculatively ahead of
  a Phase 6+ presentation need.
- **Who can grant (answers roadmap question 1):** the owning tenant only — the tenant that owns
  the `hazardous_event` being shared. Either-side granting was considered and rejected: it would
  let a grantee hand itself access to data it doesn't own.
- **Interaction with `4f`'s dependent-check disclosure (answers roadmap question 3):** the
  roadmap's phrasing ("same-tenant count vs. cross-tenant-exists boolean") describes
  `EVENT_CAUSALITY`'s disclosure shape on the _other_ table (`event_causality`,
  `IEventCausalityRepository`) — not this one. This table's own `4f` disclosure
  (`DeleteHazardousEventUseCase`'s `CAUSAL_CHAIN` dependent) is a flat, ungated
  `countEdgesTouching` total. **No change**: a grant does not alter what that count reveals.
  Deletion-safety needs the true total regardless of visibility grants, for the same reason
  cycle detection does — a hidden-but-real cross-tenant edge must still block an unsafe delete.
- Update `_docs/refactoring-plan/deferred-items-register.md`: delete `DEF-012`; add a new row for
  "grant mechanism exists, but no write path creates a new cross-tenant link" and a new row for
  "grant exists, but doesn't unlock cross-tenant full-detail viewing." Explicitly confirm
  `DEF-043` (write-side concurrency on the same port) and `DEF-046` (unrelated DE↔DE legacy path)
  are out of scope — different concerns, not folded in.

### Scope decision for human review

This intent, as scoped above, builds a real, tested access-control mechanism and satisfies the
roadmap's three required answers — but it does **not** make the mechanism end-to-end usable
through the live application today, since no write path can create a new cross-tenant row for a
grant to ever gate in practice (only backfilled/pre-existing rows benefit immediately). Two paths
forward, for the reviewer to pick between before `/opsx:apply`:

- **(Recommended) Proceed as scoped above.** Ship the grant primitive and the read-side gate now;
  open a new deferred item for the write-path gap, which is its own design question (e.g., does
  creating a cross-tenant link require the grant to pre-exist, or should attempting to link
  trigger a grant-request flow? which side initiates?) deserving a dedicated proposal, not a
  late addition here.
- **Expand scope** to also change `CreateHazardousEvent`/`UpdateHazardousEvent`'s `causeId`
  resolution (fall through to a new grant-gated cross-tenant lookup when same-tenant `findById`
  throws `NotFoundError`) and add a corresponding `IHazardousEventRepository` method. This makes
  the feature usable immediately but roughly doubles this intent's blast radius and touches two
  already-shipped, tested use cases.

Proposal and design docs below are written for the recommended (minimal) path; flag if the
reviewer prefers the expanded one before `/opsx:apply` proceeds.

## Capabilities

### New Capabilities

- `hazardous-event-share-repository-port`: `IHazardousEventShareRepository` — grant/revoke/check
  a cross-tenant visibility grant on one `hazardous_event`, plus the `DrizzleHazardousEventShareRepository`
  adapter fulfilling it against the new `hazardous_event_share` table.
- `grant-hazardous-event-share`: `GrantHazardousEventShareUseCase` — owning-tenant-only grant
  creation, idempotent on a duplicate grant.
- `revoke-hazardous-event-share`: `RevokeHazardousEventShareUseCase` — owning-tenant-only grant
  removal; no-op (not an error) when no matching grant exists.

### Modified Capabilities

- `causal-chain-repository-port` (`openspec/specs/causal-chain-repository-port/spec.md`): add
  `findVisibleEdgesTouching`, a new grant-gated read method, without altering any existing
  method's documented behavior (`findReachableEdgesFrom`, `saveEdge`, `replaceCauseEdge`,
  `countEdgesTouching` are all unchanged).

## Impact

**Files changed (new unless noted):**

- `app/domains/hazardous-events/infrastructure/hazardousEventShareTable.ts` — new Drizzle table
- `app/domains/hazardous-events/application/ports/IHazardousEventShareRepository.ts` (+ `.test.ts`)
- `app/domains/hazardous-events/infrastructure/DrizzleHazardousEventShareRepository.server.ts`
- `app/domains/hazardous-events/application/use-cases/GrantHazardousEventShare.ts` (+ `.test.ts`)
- `app/domains/hazardous-events/application/use-cases/RevokeHazardousEventShare.ts` (+ `.test.ts`)
- `app/domains/hazardous-events/application/ports/ICausalChainRepository.ts` — modified: add
  `findVisibleEdgesTouching`; update stale `DEF-012` comment
- `app/domains/hazardous-events/application/ports/ICausalChainRepository.test.ts` — modified
- `app/domains/hazardous-events/infrastructure/DrizzleCausalChainRepository.server.ts` — modified:
  implement `findVisibleEdgesTouching` (join to `hazardousEventTable` for other-side tenant
  classification, join to `hazardous_event_share` for the grant check — same join shape precedent
  as `DrizzleEventCausalityRepository.countReferences`, `4f`)
- `app/domains/hazardous-events/infrastructure/HazardousEventsModule.server.ts` — modified:
  register the new repository + use cases
- `app/drizzle/migrations/<timestamp>_add_hazardous_event_share.sql` — new, additive
- `tests/integration/db/testSchema/hazardousEventShareTable.ts` — new (`export *` pattern, `2e`)
- `tests/integration/db/queries/DrizzleCausalChainRepository.test.ts` — modified: new scenarios
- `tests/integration/db/queries/DrizzleHazardousEventShareRepository.test.ts` — new
- `tests/integration/domains/hazardous-events/GrantHazardousEventShare.test.ts` — new
- `tests/integration/domains/hazardous-events/RevokeHazardousEventShare.test.ts` — new
- `_docs/refactoring-plan/deferred-items-register.md` — modified (see above)
- `_docs/refactoring-plan/hazardous-events-refactoring-roadmap.md` — modified: mark `5n` complete
  with the scope-decision note

**DB migration:** Yes — one additive `CREATE TABLE IF NOT EXISTS hazardous_event_share` plus its
indexes/unique constraint, applied via `yarn dbsync`. No existing table altered, no data migration,
no rollback data-loss risk (symmetric `DROP TABLE` would fully revert).

**Test approach:** PGlite integration (`yarn test:run2`) for the repository adapter and both use
cases, per the roadmap's own test-tier guidance — grant/revoke/hasGrant against a real schema,
plus `findVisibleEdgesTouching`'s exclude/include/revoke-removes-access scenarios. Unit tests for
the port interface shape, matching `ICausalChainRepository.test.ts`'s and
`IEventCausalityRepository.test.ts`'s existing precedent.

**Security / multi-tenancy implications:** This is a security-sensitive change — it is, by
definition, building the first mechanism in this codebase that lets one tenant's data become
visible to another. Key invariants carried through design.md: (1) `findReachableEdgesFrom`,
`saveEdge`, `replaceCauseEdge`, and `countEdgesTouching` all stay grant-blind — only
`findVisibleEdgesTouching` is gated; (2) a grant only ever discloses edge/id existence, never a
`HazardousEvent`'s field data; (3) granting/revoking is owning-tenant-only, enforced through the
existing tenant-scoped `findById` non-disclosure pattern (wrong-tenant attempt reads as
`NotFoundError`, identical to every other cross-tenant lookup in this domain today).
