## Context

See proposal.md for the full "Why", including the readiness-check finding that no write path
(`CreateHazardousEvent.ts`, `UpdateHazardousEvent.ts`, or the legacy `event.ts`/`event_relationship`
path) can create a new cross-tenant `hazardous_event_causality` row today — every `causeId`
resolution is same-tenant-only, final. This design assumes the "recommended" scope from the
proposal's "Scope decision for human review" section: build the grant primitive and the read-side
gate; do not touch the write paths in this intent.

Current state this design builds on:

- `hazardous_event_causality` (`2e`) has no tenant column of its own; `ICausalChainRepository`
  (`4b`/`5i`) is deliberately untenanted across all four of its methods.
- `ICausalChainRepository.findReachableEdgesFrom` backs `CausalChain.ts`'s
  `assertCausalLinkDoesNotCreateCycle` (both at write time in `CreateHazardousEvent`/
  `UpdateHazardousEvent`, and inside `DrizzleCausalChainRepository`'s own in-transaction
  `assertNoCycleInTx` recheck).
- `ICausalChainRepository.countEdgesTouching` backs `DeleteHazardousEventUseCase`'s (`4f`)
  `CAUSAL_CHAIN` dependent-check — a flat, ungated count, distinct from `EVENT_CAUSALITY`'s
  same-tenant/cross-tenant split (that split lives on the _other_ table, `event_causality`,
  `IEventCausalityRepository`, `4f`'s own module).
- `IHazardousEventRepository.findById(id, tenantId)` throws `NotFoundError` unconditionally for
  any id outside `tenantId` — the only non-disclosure pattern this domain uses for "exists, but
  not yours." No code path bypasses this today.
- No sharing/grant table or mechanism exists anywhere in the repo (confirmed via grep in
  proposal.md).

## Goals / Non-Goals

**Goals:**

- A durable, queryable record of "tenant G may know about tenant O's hazardous event E" —
  `hazardous_event_share`.
- Owning-tenant-only grant/revoke, via the same tenant-scoped-`findById`-as-non-disclosure pattern
  already used throughout this domain.
- A new read method, `ICausalChainRepository.findVisibleEdgesTouching(nodeId, tenantId, tx?)`,
  that a future Phase 6+ presentation use case can call to show a tenant only the causal edges it
  is entitled to know about.
- Idempotent grant creation; revoke is a plain, non-throwing no-op when nothing to revoke
  (matching `IHazardousEventRepository.delete`'s existing convention).

**Non-Goals:**

- Not changing `findReachableEdgesFrom`, `saveEdge`, `replaceCauseEdge`, or `countEdgesTouching`.
  All four stay grant-blind. This is deliberate, not an oversight — see Decision 1.
- Not unlocking cross-tenant link _creation_ in `CreateHazardousEvent`/`UpdateHazardousEvent`.
  Tracked as a new deferred item (see proposal.md).
- Not exposing the linked `HazardousEvent`'s full detail (title, location, magnitude, etc.) to a
  grantee tenant. `GetHazardousEventByIdUseCase`/`IHazardousEventRepository.findById` are
  untouched. Tracked as a new deferred item.
- Not a multi-hop "visible causal graph" traversal. `findVisibleEdgesTouching` is direct-edges-only
  (mirrors `countEdgesTouching`'s shape, not `findReachableEdgesFrom`'s recursive shape) — see
  Decision 4.
- Not folding in `DEF-043` (write-side advisory-locking gap, same port) or `DEF-046` (DE↔DE legacy
  path, different domain/table) — different concerns, explicitly excluded.

## Decisions

### Decision 1 — Grants gate one new read method only; every existing `ICausalChainRepository` method stays grant-blind

The alternative — filtering `findReachableEdgesFrom`'s or `countEdgesTouching`'s results by grant
— was considered and rejected. Both methods feed correctness/safety logic that must see the true
graph regardless of visibility:

- `findReachableEdgesFrom` backs cycle detection. A hidden-but-real cross-tenant edge can still
  close a real cycle in the data; filtering it out of the traversal would let
  `assertCausalLinkDoesNotCreateCycle` approve a link that actually closes a cycle. That is a
  correctness bug, not a security improvement.
- `countEdgesTouching` backs `DeleteHazardousEventUseCase`'s dependent-check. Deletion safety
  needs to know a real dependent exists, grant or no grant — otherwise a tenant could delete an
  event that another tenant still has a live (if ungranted) causal reference to, silently
  orphaning that reference. This directly answers the roadmap's question 3: **no**, a grant does
  not change what the `CAUSAL_CHAIN` dependent's count reveals.

So grants only gate a new, additive method with no existing caller — `findVisibleEdgesTouching` —
built ahead of its first real consumer (Phase 6+ presentation), the same way `4f` built
`IEventCausalityRepository`'s `countReferences` before any route consumed it.

### Decision 2 — Grant subject is the `hazardous_event`, not the causality edge

A grant is `(hazardousEventId, grantedToCountryAccountsId)`, not
`(causalityEdgeId, grantedToCountryAccountsId)`. One event can be the "far side" of several edges
across several tenants; a single grant on the event covers all of them, and survives edges being
replaced (`replaceCauseEdge`) or added later. This also matches `2e` design.md Decision 12's own
framing of the leading candidate ("owning tenant, shared-with tenant, granted-by, reason" — scoped
to the record, i.e. the event, in the Salesforce `<Object>Share` precedent it cites).

**Alternatives considered:**

- _Per-edge grant_ — rejected: would need re-granting every time an edge is replaced, with no
  benefit (the confidentiality concern is "can tenant G know about event E," not "can tenant G
  know about this specific edge").
- _Bilateral tenant-pair agreement_ (grant covers every event, not just one) — rejected as the
  default: would make a transboundary agreement all-or-nothing between two tenants, when the real
  cases described (Nepal→India floods) are specific-event, not blanket-country-pair. Noted as a
  possible future convenience layer (a grant-all-events-between-tenants flag) if that need
  materializes, not built now — would be a trivial addition on top of this schema (a sentinel
  `hazardousEventId`, or a second table) without blocking it.
- _Link-implied visibility_ (creating the cross-tenant edge itself grants visibility) — rejected:
  conflates linking with visibility and offers no revocation story independent of the edge
  itself; also moot today since no write path can create such an edge.
- _Existence-only, formalizing the status quo_ (no grant table at all; the status quo already
  reveals "an edge exists" via `countEdgesTouching`) — rejected as not meeting the roadmap's
  requirement for an actual access-control mechanism; also conflates two different consumers
  (delete-safety vs. presentation) that this design deliberately separates (Decision 1).

### Decision 3 — Owning tenant only may grant or revoke

`GrantHazardousEventShareUseCase`/`RevokeHazardousEventShareUseCase` take `(hazardousEventId,
tenantId, grantedToCountryAccountsId, actingUserId, reason?)` and resolve ownership via
`IHazardousEventRepository.findById(hazardousEventId, tenantId)` — identical to every other
tenant-scoped lookup in this domain. A non-owning tenant's attempt throws `NotFoundError`, the
same non-disclosure shape `findById` already has everywhere else (it doesn't reveal "this event
exists, but isn't yours" as a distinct outcome from "this event doesn't exist").

**Rejected alternative:** either side may grant. This would let a grantee tenant hand itself
access to another tenant's data by issuing its own "grant," which isn't a grant at all — it's
self-service cross-tenant access with a different name. Rejected outright, not just as a
secondary option.

A grant to oneself (`grantedToCountryAccountsId === tenantId`) is rejected with a
`ValidationError` — meaningless, and would otherwise silently succeed as a no-op grant that masks
a caller bug.

### Decision 4 — `findVisibleEdgesTouching` is direct-edges-only, not a filtered multi-hop traversal

Given chain `C(T3) → A(T1) → B(T2)`, if T2 has a grant on `A` only (not on `C`), should T2's
"visible causal chain" for `B` include `C`? A naive filtered `findReachableEdgesFrom` risks either
leaking `C`'s existence through `A` (if the filter only checks the first hop) or needing non-trivial
chain-pruning logic (cut the traversal at the first ungranted node) to avoid that leak.

This design avoids the question entirely for now: `findVisibleEdgesTouching(nodeId, tenantId)`
returns only _direct_ edges where `nodeId` is the cause or the effect (the same shape as
`countEdgesTouching`, not `findReachableEdgesFrom`), each included only if its own other side is
same-tenant with `tenantId` or has an active grant to `tenantId`. No transitive traversal is
exposed by this method at all, so there is no multi-hop leak to reason about. A future intent
that needs transitive visible-chain traversal (if Phase 6+ presentation ever wants one) gets its
own dedicated design pass on the chain-pruning question above — flagged here, not solved here.

### Decision 5 — Revoke is a hard delete; grant is idempotent via `ON CONFLICT DO NOTHING`

No `deletedAt`/soft-delete column — matches every other new table in this domain's CA code (none
use soft delete; `2e`, `hazardDriverTable`, etc. are all hard-delete). Revoking removes the grant
row outright; the underlying `hazardous_event_causality` edge is never touched (test tier
requirement). Revocation's own audit trail is the structured logger (`grant.revoked` /
`grant.created` log events), not a DB row — consistent with this codebase having no existing
audit-log table to write into instead.

A duplicate `grant()` call for an existing `(hazardousEventId, grantedToCountryAccountsId)` pair
is a no-op, not a `ConflictError` — enforced by a unique index plus `ON CONFLICT
(hazardous_event_id, granted_to_country_accounts_id) DO NOTHING`. Treating re-granting as an error
would make a retried or idempotent caller (e.g. a form resubmission) fail for no operational
reason; the desired end state ("this tenant has a grant") is already satisfied.

### Decision 6 — New table and port live in `hazardous-events/`, not a new bounded context

`event-causality` (`4f`/`5m` precedent) was promoted out of Shared Kernel into its own bounded
context because it has its own table, repository, and business rule, _and_ two real-or-imminent
consumers (`HazardousEventsModule` today, Disaster Events' own future CA work). This grant
mechanism also has its own table, repository, and rule — but today exactly one domain
(Hazardous Events) owns the records being shared and is the only consumer. Promoting it to a new
top-level context now would be the same premature-abstraction mistake `4f`'s own history warns
about in the other direction — Evans' Shared Kernel guidance is "extract once logic accumulates
and a second consumer exists," not "extract speculatively." If Disaster Events' own CA migration
later needs identical cross-tenant sharing over `disaster_event`, that is the trigger to revisit
promotion (mirroring `event-causality`'s own relocation precedent exactly), not before.

### New/changed types

- `app/domains/hazardous-events/infrastructure/hazardousEventShareTable.ts` (new Drizzle table,
  `hazardous_event_share`):
  - `id: uuid` (`ourRandomUUID()`)
  - `hazardousEventId: uuid` — `references(() => hazardousEventTable.id, { onDelete: "cascade" })`
  - `grantedToCountryAccountsId: uuid` — `references(() => countryAccountsTable.id, { onDelete:
"cascade" })`
  - `grantedByUserId: uuid` — no FK (matches `actingUserId`'s existing unvalidated-string
    convention throughout this domain's use cases)
  - `reason: text` — nullable
  - `createdAt: timestamp("created_at", { withTimezone: true })` — inline, per ADR-002, not
    `createdUpdatedTimestamps`
  - Unique index on `(hazardousEventId, grantedToCountryAccountsId)`
  - Index on `grantedToCountryAccountsId` (the grantee-side lookup `findVisibleEdgesTouching`
    needs)
  - This is a second cross-package FK from a new `infrastructure/` table into legacy
    `app/drizzle/schema/hazardousEventTable.ts` and into `countryAccountsTable.ts` — same narrow,
    necessary exception `2e` design.md Decision 8 already flagged, not a new precedent.
- `app/domains/hazardous-events/application/ports/IHazardousEventShareRepository.ts` (new):
  ```ts
  export interface IHazardousEventShareRepository {
  	grant(
  		hazardousEventId: string,
  		grantedToCountryAccountsId: string,
  		grantedByUserId: string,
  		reason: string | null,
  		tx?: Tx,
  	): Promise<void>; // idempotent — see Decision 5
  	revoke(
  		hazardousEventId: string,
  		grantedToCountryAccountsId: string,
  		tx?: Tx,
  	): Promise<void>; // resolves normally when no matching grant exists
  	hasGrant(
  		hazardousEventId: string,
  		grantedToCountryAccountsId: string,
  		tx?: Tx,
  	): Promise<boolean>;
  }
  ```
- `app/domains/hazardous-events/infrastructure/DrizzleHazardousEventShareRepository.server.ts`
  (new) — fulfills the port above against `hazardous_event_share`.
- `app/domains/hazardous-events/application/ports/ICausalChainRepository.ts` — add:
  ```ts
  /** Direct edges only touching nodeId (cause or effect), included only when the edge's own
   * other side is same-tenant with tenantId or has an active hazardous_event_share grant to
   * tenantId. Unlike every other method on this port, this one IS tenant-aware by design —
   * it is the only grant-gated read (design.md Decision 1). */
  findVisibleEdgesTouching(
    nodeId: string,
    tenantId: string,
    tx?: Tx,
  ): Promise<readonly CausalEdge[]>;
  ```
  Also update the port's file-level comment, which currently says "Not tenant-scoped — the table
  has no tenant column of its own (`DEF-012`)" — that sentence described the whole port; now it
  describes every method except this new one. Reference `DEF-012`'s closure, not its existence.
- `app/domains/hazardous-events/application/use-cases/GrantHazardousEventShare.ts` /
  `RevokeHazardousEventShare.ts` (new) — thin use cases per Decision 3, each depending on
  `IHazardousEventRepository` (ownership check) and `IHazardousEventShareRepository`.

### Drizzle schema change

One new table, `hazardous_event_share`, as specified under "New/changed types" above. No existing
table altered.

### PGlite vs. real DB

PGlite integration (`yarn test:run2`), consistent with `5i`'s own adapters and the roadmap's test
tier guidance for this intent — the grant table, the two new use cases, and
`findVisibleEdgesTouching`'s join logic all need a real Postgres-compatible engine (unique
constraint behavior, `ON CONFLICT`, multi-table joins). No real-DB (`test:run3`) or E2E tier is
needed; there is no presentation layer in Phase 5 for this intent to exercise.

### Form-CSV-API / fieldsDef impact

None. This intent adds no field to any `fieldsDef`-driven form, CSV import/export, or REST API
surface — it is backend port/use-case/schema work only, with no route or presentation layer
(Phase 6+ is where a grant-management UI, if ever built, would live).

## Risks / Trade-offs

- [The grant mechanism has no application-reachable write path to ever populate a *new*
  cross-tenant `hazardous_event_causality` row — only a pre-existing or Phase-M-backfilled row
  benefits from a grant today] → Deliberate, per the proposal's "Scope decision for human review."
  Tracked as a new deferred item rather than silently expanded into this intent; `DEF-012`'s own
  concern (access control for rows that already can exist) is still fully addressed.
- [A grant only ever discloses the linked event's id (via `findVisibleEdgesTouching`), never its
  full detail — `GetHazardousEventByIdUseCase` stays unconditionally same-tenant] → Deliberate
  scope boundary (Non-Goals); tracked as a new deferred item so a future Phase 6+ intent doesn't
  assume this already works.
- [`DEF-043`, per-edge advisory-locking gap in `saveEdge`/`replaceCauseEdge` for a disjoint
  4-node cycle, touches the same port this intent modifies] → Explicitly out of scope: this
  intent adds a new read method and touches no write/locking logic; `DEF-043` is a write-side
  concurrency-correctness concern, this intent is a read-side visibility concern. Not folded in,
  per the user's own recommendation going into this intent, confirmed correct after reviewing
  `DrizzleCausalChainRepository.server.ts`'s actual locking code.
- [`DEF-046` (DE↔DE legacy `syncLinkedDisasterEvents` tenant-check gap) touches a superficially
  similar "cross-tenant event link" shape] → Different table (`disaster_event` linking fields,
  not `hazardous_event_causality`), different domain boundary (HE/DE legacy, not HE's own CA
  port), different write path (legacy form framework, not a CA use case). Not in scope.
- [Second cross-package FK pattern from `infrastructure/` into both legacy `hazardousEventTable`
  and `countryAccountsTable`] → Same narrow exception `2e` Decision 8 already established; not a
  new precedent, flagged here for the same reason `2e` flagged its own instance.
- [`actingUserId`/`grantedByUserId` has no FK or format validation] → Matches this domain's
  existing, unvalidated-string convention for `actingUserId` everywhere else (e.g.
  `DeleteHazardousEventCommand.actingUserId`); not a new gap introduced here.

## Migration Plan

Additive only — one `CREATE TABLE IF NOT EXISTS hazardous_event_share` plus its unique index and
lookup index, with `--> statement-breakpoint` between statements, applied via `yarn dbsync`. No
existing table altered, no data migration. Rollback: a straight `DROP TABLE hazardous_event_share`
fully reverts — nothing references this table outside the new port/use cases added in this same
intent.
