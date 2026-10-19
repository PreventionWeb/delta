## Context

See proposal.md - Why for motivation and ground-truth findings. Ground truth read in full
before writing this document:

- `app/drizzle/schema/eventCausalityTable.ts` — `event_causality`. Four FK columns
  (`triggeringHazardousEventId`/`triggeringDisasterEventId`/`triggeredHazardousEventId`/
  `triggeredDisasterEventId`), all `onDelete: "cascade"`, each individually indexed. A CHECK
  constraint on each side ensures exactly one of the HE/DE id columns is set, matching
  `triggeringEntityType`/`triggeredEntityType`. Counting rows where `hazardousEventId` matches
  either `triggeringHazardousEventId` or `triggeredHazardousEventId` needs no entity-type
  filter — the CHECK constraint already guarantees those two columns are only ever populated
  for the `'HE'` side.
- `app/drizzle/schema/disasterEventTable.ts` line 50 — `hazardousEventId: uuid(...).references(
  (): AnyPgColumn => hazardousEventTable.id)`, **no `onDelete` clause** (defaults to
  `RESTRICT`). `disaster_event` also has its own `countryAccountsId` column.
- `openspec/changes/archive/2026-09-07-ca-he-causality-schema/design.md` Decision 3 — confirms
  `hazardous_event_causality`'s own two FKs (`causeHazardousEventId`/`effectHazardousEventId`)
  are *also* `.notNull().references(() => hazardousEventTable.id, { onDelete: "cascade" })`,
  following `eventCausalityTable`'s pattern rather than `eventRelationshipTable`'s — confirmed
  against the live schema file itself
  (`app/domains/hazardous-events/infrastructure/hazardousEventCausalityTable.ts`), not just the
  design doc's own narrative. This means case (b) and case (c) share the identical
  cascade-on-delete exposure — not just case (b), as the roadmap's own `4f` prose states
  explicitly (it only names case (b)'s cascade).
- `app/drizzle/schema/eventRelationshipTable.ts` — the legacy, generic polymorphic
  `parentId`/`childId` table. `.notNull()`, **no `onDelete` clause at all**. Confirmed
  genuinely different from both causality tables and explicitly out of scope (Decision 5).
- **`hazardousEventTable.id` is itself a FK into `eventTable.id`, confirmed by reading
  `hazardousEventTable.ts` directly (not assumed)**: `id: uuid("id")
  .references((): AnyPgColumn => eventTable.id).primaryKey()`, no `onDelete` clause (defaults
  to `RESTRICT`). `hazardous_event` is a subtype row of a shared `event` supertype table
  (`disaster_event.id` is the identical pattern, Context above) — a real fourth table
  genuinely touched by a delete, but, confirmed below, not a fourth *external dependent-check*
  this use case itself needs to add.
- **`hazardousEventDelete` — the live legacy delete path is `app/backend.server/models/event.ts`
  line 1728, not `app/backend.server/models/event/hazardous_event_delete.ts`.** Corrected by the
  user, confirmed directly: the real route
  (`app/routes/$lang+/hazardous-event+/delete.$id.tsx`) imports `hazardousEventDelete` from
  `~/backend.server/models/event` (i.e. `event.ts`), never from the `event/` subdirectory.
  `DEF-001` already names that entire subdirectory as confirmed dead code — "every real HE entry
  point ... resolves to `event.ts`, never this directory" — so the file this document
  originally cited was the dead-code twin, not the live path. Both functions are byte-for-byte
  identical (confirmed directly, not assumed), so every behavioral claim drawn from reading it
  — the disaster-event pre-check, the validation-row cleanup, the FK-violation catch — remains
  accurate; only the citation was wrong. Its own transaction, in order: deletes
  `entity_validation_assignment`/`entity_validation_rejection` rows for this entity (the pre-CA
  equivalent of today's `workflow_instance` cleanup — direct precedent for Decision 8 below);
  deletes the `hazardous_event` row; deletes `event_relationship` rows **where this id is the
  `childId`** (this event was itself caused by something, cleaning up the *incoming* link); then
  deletes the `event` supertype row. Its own pre-check, before any of that: a
  `disaster_event.hazardousEventId` lookup (case (a), confirmed already working). Its own
  `catch` block exists specifically to translate an
  `event_relationship_parent_id_event_id_fk` constraint violation (i.e. this event is itself the
  **parent** of some other `event_relationship` row — the *outgoing*, cause-role link, never
  cleaned up by this function) into a friendly message — this is the exact catch the Phase 0
  audit's `0a` finding #6 (Decision 5, below) shows is broken (`error?.code` vs. the real,
  nested `error.cause.code`). The legacy code's own silence on
  `event_causality`/`hazardous_event_causality` is confirmed directly here too: no reference to
  either table anywhere in this function.
- `app/domains/hazardous-events/application/ports/ICausalChainRepository.ts` —
  `findReachableEdgesFrom(nodeId)` (forward-reachability only), `saveEdge`, `deleteCauseEdges`.
  No method answers "is `nodeId` a cause or effect of any edge" (proposal.md finding 3).
- `openspec/changes/archive/2026-09-25-ca-he-create-use-case/design.md` Decision 4 — confirms
  `CreateHazardousEventUseCase`'s own `resolveCauseId`/causal-link path resolves `causeId` via
  `IHazardousEventRepository.findById(causeId, tenantId)` before ever calling
  `ICausalChainRepository.saveEdge` — `findById` throws `NotFoundError` for a cross-tenant id,
  confirmed in the real shipped code (`4b`, carried into `4c`'s own equivalent path). `saveEdge`
  is called only from these two use cases — no other write path to
  `hazardous_event_causality` exists. This is the direct precedent behind Decision 2 below: a
  cross-tenant edge cannot exist via any sanctioned write path today.
- `app/domains/hazardous-events/application/ports/IHazardousEventRepository.ts` — `findById`,
  `findAll`, `save`, `delete(id, tenantId): Promise<void>` (already exists, signature unchanged
  by this change), plus the three spatial-observation methods. Eight methods after this change.
- `app/domains/validation-workflow/infrastructure/workflowInstanceTable.ts` — `entityId` is a
  **polymorphic key with no FK at all** ("no single FK possible across 3 tables," its own
  Decision 1 comment). `IWorkflowRepository` has no `delete`/`deleteByEntity` method before this
  change (Decision 8 adds one).
- `app/domains/validation-workflow/application/ports/IWorkflowRepository.ts` — the
  "domain-owned-but-widely-consumed" shape: lives under `validation-workflow`'s own
  `application/ports/`, has no `tenantId` parameter on any method (its own doc comment: "no
  tenant filter of its own ... caller's own repository scopes tenancy"), and is consumed by
  HE's own use cases via DI. Considered and rejected as the shape for
  `IEventCausalityRepository` (Decision 1) — `validation-workflow` is a genuine bounded
  context that owns `WorkflowInstance` as its own aggregate; no equivalent bounded context
  owns `event_causality`. `deleteByEntity` (Decision 8) is added directly to this port instead,
  since `WorkflowInstance` genuinely is `validation-workflow`'s own aggregate.
- **Repo-wide grep for `implements IWorkflowRepository`**: four local fakes exist, one per
  use-case test file that depends on `IWorkflowRepository` — `CreateHazardousEvent.test.ts`,
  `GetHazardousEventById.test.ts`, `ListHazardousEvents.test.ts`, `UpdateHazardousEvent.test.ts`
  (`RecordSpatialObservation.test.ts` does not depend on this port, confirmed directly — one
  fewer file than the `IHazardousEventRepository`/`ICausalChainRepository` fallout list below).
  Adding `deleteByEntity` breaks all four at `yarn tsc` time the same way (tasks.md).
  **Corrected during implementation:** this `implements`-only grep missed two object-literal
  fakes typed against `IWorkflowRepository` in
  `app/domains/validation-workflow/application/use-cases/ProcessWorkflowAction.test.ts` —
  `makeRepository()`'s own returned object literal (lines 28-38) and the inline `const repo:
  IWorkflowRepository = {...}` (lines 197-201). A fifth file, not four, needs the
  `deleteByEntity` stub (tasks.md task 3.3, revised).
- `_docs/decisions/ADR-009-clean-architecture-module-structure.md` — read in full. Its
  "Decision" section names two distinct categories of cross-cutting code: `app/shared/`
  (generic technical infrastructure — `DomainError`, `ILogger`, i18n resolvers) and
  `app/domains/shared/` (a DDD "Shared Kernel" — domain/business logic genuinely shared
  across bounded contexts, nested exactly like any other context: `domain/`, and
  `application/` "if ever needed"). First instance: `app/domains/shared/domain/
  flexibleDateFormat.ts` (`4c`, 2026-10-01).
- `openspec/changes/archive/2026-10-05-ca-he-update-use-case/design.md` Decision 1 — the real
  text behind `flexibleDateFormat.ts`'s placement, read directly rather than reconstructed:
  "`app/shared/` (per ADR-009) is reserved for genuinely technical cross-cutting
  infrastructure ... swappable per-implementation concerns. The date-format/precision rule is
  not that: it is a DDD 'Shared Kernel' case." Also: "`app/domains/shared/domain/` places this
  pseudo-context under the identical per-context layering ADR-009 already establishes ...
  rather than a flat grab-bag."
- `app/db/queries/eventCausalityRepository.ts` — the legacy, pre-CA `EventCausalityRepository`
  (a plain object literal, not a class: `export const EventCausalityRepository = {...}`),
  consumed from `app/backend.server/services/disaster-event/linkedDisasterData.ts`. Confirms
  "event causality" already functions as a concept with no single owning domain in the
  *legacy* codebase too (consumed by DE-side service code, defined in a shared `db/queries/`
  location, not nested under any domain) — independent, pre-CA evidence for the Shared Kernel
  classification, not a precedent to port forward mechanically (its own methods —
  `getLinkedHazardousEventIds`, `getLinkedDisasterEventIds`, `createMany`,
  `listCurrentDisasterEventLinks` — answer different questions than the one this change needs
  and are not reused).
- `_docs/refactoring-plan/hazardous-events-phase0-audit-findings.md` line ~568 (`0f`) —
  `disasterEventCreate`/`disasterEventUpdate` (`event.ts` ~1825/~1971) **already look up and
  guard the singular `hazardousEventId` field's own tenant match before writing it** — the
  audit's own contrast case for why `event_causality`'s own missing guard (`DEF-004`) is a bug
  at all ("unlike the singular `hazardousEventId` field, which the same file explicitly
  guards"). Direct precedent behind Decision 4 below: case (a)'s own write path is already
  tenant-guarded today, the same practical shape as case (c)'s (above).
- `app/domains/hazardous-events/application/ports/IHazardousEventRepository.test.ts` and
  `ICausalChainRepository.test.ts` — both already establish this codebase's own port-test
  convention: a `Fake...Repository implements I...Repository` conformance test class plus a
  compile-time `AssertEqual<Parameters<...>, [...]>` arity assertion per method, in the port's
  own `.test.ts` file (not the use case's test file). This change follows that convention for
  every new/modified port method, matching 1:1.
- **Repo-wide grep for every existing `implements ICausalChainRepository`/
  `implements IHazardousEventRepository`, not scoped to this change's own two files** (per
  standing full-ref-search rule): confirms five more local fakes exist, one per use-case test
  file — `CreateHazardousEvent.test.ts` (both interfaces), `UpdateHazardousEvent.test.ts` (both
  interfaces), `GetHazardousEventById.test.ts`, `ListHazardousEvents.test.ts`,
  `RecordSpatialObservation.test.ts` (`IHazardousEventRepository` only, each). Adding a
  required method to either interface breaks every one of these at `yarn tsc` time, even though
  Vitest itself (type-stripping) would not catch it — the exact lesson `4c`'s own tasks.md
  already recorded for `deleteCauseEdges` ("the real red signal here is `yarn tsc`"). All five
  already throw `new Error("not used by ...'s own tests")` for methods their own use case never
  calls (confirmed directly in each file, not assumed) — the fix in each case is the identical,
  trivial, behavior-neutral stub (tasks.md). A broader grep for object-literal fakes typed via
  `: IHazardousEventRepository =`, `as IHazardousEventRepository`, or `satisfies
  IHazardousEventRepository` (and the `ICausalChainRepository` equivalents) — which
  `implements` alone would miss — returned zero additional hits for these two ports. **Corrected
  during implementation:** the `IWorkflowRepository` equivalent of this same broader grep was
  not actually zero — see the correction above (`ProcessWorkflowAction.test.ts`, two sites).
  Every fake for `ICausalChainRepository`/`IHazardousEventRepository` is a `class ...
  implements` declaration, already accounted for above; `IWorkflowRepository` has one
  additional object-literal-typed file beyond its four `class ... implements` fakes.
- `app/domains/hazardous-events/domain/CausalChain.ts` — `assertCausalLinkDoesNotCreateCycle`/
  `assertCauseStartsNoLaterThanEffect` both throw `ConflictError` with a `context` payload for
  a structurally identical "blocked by other data" situation — the direct precedent for
  Decision 6b below, already live in this codebase, not a novel introduction.
- **External sources cited by the original brief could not be independently verified this
  session** — `amrelsher07.medium.com`'s delete-behaviors article and `dzone.com`'s aggregate
  article both returned HTTP 403 (Forbidden) to a direct fetch. This document does not restate
  their content as confirmed; the port-placement decision instead rests entirely on the
  verified in-repo evidence above (ADR-009's own text, `IWorkflowRepository`'s real shape, and
  the legacy `EventCausalityRepository`'s own no-single-owner placement) — a narrower but
  directly checked basis.

## Goals / Non-Goals

**Goals:**

- One `DeleteHazardousEventUseCase.execute(command)` that tenant-gates via `findById`, runs
  all three dependent-reference counts concurrently, throws a single `ConflictError` naming
  every non-zero dependent (shaped per Decision 6b's own tenant-disclosure split), cleans up
  the event's `WorkflowInstance` row (Decision 8), and deletes and logs — zero DB dependency
  (Phase 4 Gate).
- Add exactly the port methods needed: one new method on each of two existing ports
  (`ICausalChainRepository`, `IHazardousEventRepository`), one new method on a third existing
  port (`IWorkflowRepository`, Decision 8), and one brand-new Shared Kernel port
  (`IEventCausalityRepository`, Decision 1) for case (b)'s genuinely ownerless table.
- Leave `IHazardousEventRepository.delete(id, tenantId)`'s own **signature** unchanged — it
  already exists with the correct signature (proposal.md finding 4). Its own missing-row
  **behavior**, previously unpinned by any spec, is pinned as a no-op (Decision 7) — a narrow,
  directly-required addition, not a signature change.

**Non-Goals:**

- No Drizzle adapter for any of the four new/modified ports — interface and mock-tested
  only, matching every other Phase 4 use case (Phase 4 Gate). The real, DB-backed
  implementations are `5f`'s job (Risks — `5f`'s own roadmap text needs a follow-up
  correction this change does not make).
- No change to `IHazardousEventRepository.delete`'s own **signature** — its previously-unpinned
  missing-row **behavior** is pinned by this change (Decision 7), not left as a non-goal.
- No cleanup of the legacy `event_relationship` table's own outgoing-role gap (Decision 5) —
  flagged via a new deferred-register row (`DEF-035`, tasks.md), not resolved here.
- No transaction boundary around the check-then-delete sequence, and no FK migration from
  `cascade` to `restrict` on either causality table — both are real, infrastructure-layer
  concerns for whoever builds the real adapter (`5f`), not something a zero-DB application
  layer can provide (Risks, `DEF-033`).
- No route, controller, or auth wrapper — this use case has no caller yet (Phase 6).

## Decisions

### 1. `IEventCausalityRepository` lives at `app/domains/shared/application/ports/` — a Shared Kernel port, not `IWorkflowRepository`'s "domain-owned-but-widely-consumed" shape

**The deciding question:** does any bounded context under `app/domains/` own
`event_causality` the way `validation-workflow` owns `WorkflowInstance`? No. `event_causality`
is a cross-entity join table (HE↔DE, discriminated by `triggeringEntityType`/
`triggeredEntityType`) that both HE and DE read and write today (legacy
`EventCausalityRepository`, consumed from a DE-side service, Context) — it has never belonged
to either domain exclusively, unlike `workflow_instance`, which really is `validation-workflow`'s
own aggregate table that HE/DE happen to consume via DI.

**Why not copy `IWorkflowRepository`'s placement (nest it under `hazardous-events` or
`disaster-events` anyway):** that would misrepresent the domain model — inventing an owning
context for a table that is, by its own schema design (the entity-type discriminator columns
on both sides), deliberately symmetric between two real contexts. ADR-009's own "Shared
Kernel" category exists for exactly this situation: "domain/business logic deliberately shared
across multiple bounded contexts," nested under `app/domains/shared/` "like any other context
(`domain/`, and `application/` if ever needed)" (Context). `flexibleDateFormat.ts`'s own
placement decision (`4c`) is the direct, already-verified precedent for this same
reasoning — a rule neither HE nor Disaster Records/Disaster Events own exclusively, placed
under `app/domains/shared/domain/` rather than nested in HE's own `domain/`.

**Why `application/ports/`, not `domain/`:** `flexibleDateFormat.ts` is a pure, stateless
value-level predicate — no I/O, no DI, no test double needed beyond calling the function
directly. `IEventCausalityRepository` is a repository **port** — an interface with a real
DB-backed adapter on the other side of it (Phase 5), needing dependency injection and a fake
conformance test, structurally identical to every other port in this codebase. ADR-009's own
text anticipates this exact need ("`application/` if ever needed") rather than assuming
`domain/` is `app/domains/shared/`'s only possible layer. This is the first file under
`app/domains/shared/application/` — flagged explicitly here since it is a new subtree, not an
addition to an existing one.

**Note on the port's own `tenantId` parameter (Decision 3, revised):** placing this port under
the Shared Kernel location is a statement about *ownership* (no domain owns this table), not
about whether its methods may ever take a `tenantId`. `IWorkflowRepository`'s own no-`tenantId`
convention follows from `workflow_instance` having no tenant column of its own at all (Context);
`event_causality` is in the identical position (no tenant column, `DEF-004`), but Decision 3
below adds a `tenantId` parameter anyway — for a different, narrower reason (disclosure
shaping, not filtering) that does not weaken the Shared Kernel classification itself.

**Alternatives considered and rejected:**

- **`IWorkflowRepository`'s shape** (nest under one domain's own `application/ports/`,
  consumed cross-domain via DI). Rejected above — no domain genuinely owns this table.
- **`app/shared/` (the technical-infrastructure top-level folder, not
  `app/domains/shared/`).** Rejected — ADR-009 reserves `app/shared/` for swappable technical
  concerns (`DomainError`, `ILogger`, i18n resolvers); `event_causality`'s cross-aggregate
  reference-integrity rule is domain/business logic, the same distinction ADR-009 itself draws
  and `4c`'s own corrected placement already applied.
- **A brand-new `app/domains/event-causality/` bounded context.** Rejected as unwarranted
  scope for a single counting method — this would invent a fourth domain for a table this
  change does not otherwise need to model as its own aggregate, context, or use-case surface.

### 2. `ICausalChainRepository.countEdgesTouching(nodeId): Promise<number>` — a new method, not a reuse of `findReachableEdgesFrom`; exact count, no tenant-disclosure split

`findReachableEdgesFrom(nodeId)` resolves edges reachable **forward** (following
`causeId -> effectId`) starting from `nodeId` — it answers "what does this node eventually
cause," not "does any edge touch this node at all." A node that is only ever an **effect**
(nothing in the stored graph has it as a cause) resolves `[]` from `findReachableEdgesFrom`
even though deleting it would still destroy a real recorded causal link. Delete must block on
both sides (proposal.md: "cause or effect side") — a new, symmetric method is required.

```ts
/** Counts every stored edge where nodeId is either causeId or effectId, in either
 * direction — unlike findReachableEdgesFrom's forward-only reachability traversal, this
 * answers "does any edge touch this node at all," needed by DeleteHazardousEventUseCase's
 * unified dependent-check (roadmap 4f). Not tenant-scoped, matching this port's existing
 * methods — hazardous_event_causality has no tenant column of its own (DEF-012). In practice
 * this count is always same-tenant data today: every writer of this table (saveEdge, called
 * only by CreateHazardousEventUseCase/UpdateHazardousEventUseCase, Context) resolves causeId
 * via IHazardousEventRepository.findById(causeId, tenantId) first, which throws NotFoundError
 * for a cross-tenant id (4b design.md Decision 4, confirmed in the real shipped code) — so no
 * cross-tenant edge can exist via any sanctioned write path today. This is why
 * DeleteHazardousEventUseCase discloses this count directly, with no same-tenant/cross-tenant
 * split, unlike IEventCausalityRepository.countReferences (Decision 3), whose own table has a
 * confirmed-unguarded write path (DEF-004). */
countEdgesTouching(nodeId: string): Promise<number>;
```

Returns a count, not a boolean, per the roadmap's own "which dependents and how many" / "not
just a boolean" phrasing (proposal.md).

### 3. `IEventCausalityRepository.countReferences(hazardousEventId, tenantId): Promise<EventCausalityReferenceCounts>` — split into same-tenant and cross-tenant counts, resolving OQ1 for this source specifically

**Resolved by the user (correcting this document's own earlier premise):** case (c)
(`countEdgesTouching`, Decision 2) needs no tenant-disclosure split — its only write path
already enforces same-tenant linking. Case (b) (`event_causality`, this method) is different:
`DEF-004` confirms a real, **currently-unguarded** write path
(`syncLinkedHazardousEvents`/`EventCausalityRepository.createMany`) — cross-tenant rows are a
genuine, reachable possibility here today, unlike case (c). The user's resolution: keep this
method counting *all* references (correctness — a cross-tenant dependent must still block the
delete), but shape what `DeleteHazardousEventUseCase` discloses in its own `ConflictError`
context for this source specifically — an exact count for same-tenant references, and only a
boolean flag for the rest, never their precise count (Decision 6b).

```ts
export interface EventCausalityReferenceCounts {
	readonly sameTenantCount: number;
	readonly crossTenantCount: number;
}

/**
 * Port for event_causality — Shared Kernel between Hazardous Events and Disaster Events
 * (Decision 1). Counts every row where hazardousEventId appears as either
 * triggeringHazardousEventId or triggeredHazardousEventId, in either direction, split into
 * same-tenant and cross-tenant buckets relative to tenantId. No entityType parameter: the
 * table's own CHECK constraint already guarantees triggeringHazardousEventId/
 * triggeredHazardousEventId are only ever populated for the 'HE' side, so no row with a
 * matching id column could belong to the 'DE' side.
 *
 * This takes a tenantId where IWorkflowRepository's own methods take none (Decision 1's own
 * note) — not because event_causality has gained a tenant column (it has not, DEF-004), but
 * because DeleteHazardousEventUseCase's own disclosure contract (Decision 6b) needs to
 * classify each matching row, not just count it. "Same-tenant" means the row's own other side
 * (whichever entity — HE or DE — isn't hazardousEventId) belongs to tenantId; a real adapter
 * resolves this via a join against hazardousEventTable or disasterEventTable depending on that
 * row's own entityType (5f's own job, not this interface's).
 */
export interface IEventCausalityRepository {
	countReferences(
		hazardousEventId: string,
		tenantId: string,
	): Promise<EventCausalityReferenceCounts>;
}
```

### 4. `IHazardousEventRepository.countReferencingDisasterEvents(hazardousEventId, tenantId): Promise<number>` — interim placement, exact count, no tenant-disclosure split

Added to `IHazardousEventRepository` rather than a (non-existent) `IDisasterEventRepository`,
per the brief's own settled decision — register row `DEF-032` (tasks.md) names this interim
placement and its future trigger (Disaster Events' own Clean Architecture migration).

```ts
/** Counts disaster_event rows whose hazardousEventId matches. tenantId scopes the
 * HazardousEvent side only (interface-signature parity with every other method on this
 * port, and because the caller's own prior findById(id, tenantId) has already proven
 * hazardousEventId belongs to tenantId) — it does NOT filter the counted disaster_event
 * rows by their own tenant. A cross-tenant disaster_event reference is still a real
 * dependent that must block the delete (DEF-032: interim placement; this method's real
 * home is a future IDisasterEventRepository). Disclosed as an exact count, no
 * same-tenant/cross-tenant split (Decision 6b) — the Phase 0 audit (0f, Context) confirms
 * disasterEventCreate/disasterEventUpdate already guard this field's own tenant match at
 * write time, the same practical shape as case (c)'s (Decision 2), unlike event_causality's
 * own confirmed-unguarded write path (DEF-004, Decision 3). */
countReferencingDisasterEvents(
	hazardousEventId: string,
	tenantId: string,
): Promise<number>;
```

**Why not tenant-filter the count:** filtering it would let a delete proceed against a real
reference, trading a friendly `ConflictError` today for an unguarded `RESTRICT`-violation error
at the real DB layer once `5f` ships (Context: this column has no `onDelete` clause). Keeping
the count unfiltered is the conservative, "no exceptions" choice the roadmap's own `4f` intent
text asks for — and, per the write-time guard above, this is a correctness safeguard for an
edge case that should not occur today, not a count the user ever expects to see non-zero in
practice.

### 5. `event_relationship` (legacy `parentId`/`childId`) is explicitly excluded from this unified check — and is not actually fully ignored by the legacy system either

Confirmed directly against the Phase 0 audit
(`hazardous-events-phase0-audit-findings.md` lines 647-660, "Invariant 1 quirks — confirmed and
corrected against 0a-0f," point 2) and the live legacy code itself (`event.ts` line 1728,
Context) that this table has **two** distinct roles relative to a delete, not one:

- **Incoming (`childId = this event`'s id — this event was itself caused by something else):**
  the legacy delete function already deletes these rows proactively, as part of its own
  transaction, before deleting the `event` supertype row. No violation, no gap here.
- **Outgoing (`parentId = this event`'s id — this event is itself the cause of some other
  `event_relationship` row):** never cleaned up or pre-checked. The legacy function's own
  `catch` block exists specifically to translate the resulting FK violation into a friendly
  message, but `0a` finding #6 shows the catch itself is dead code ("checks `error?.code`, but
  Drizzle nests the real code under `error.cause.code`") — so in practice this is
  **unchecked**, not "checked reactively," a raw uncaught error propagates instead of the
  intended friendly message.

The brief's own case (c) is specifically `hazardous_event_causality` via `ICausalChainRepository`
— a different, newer table from `event_relationship` entirely — and this change's own unified
check does not add a fourth check for `event_relationship`'s own outgoing-role gap. **This is
not a new gap this change introduces or silently ignores** — it is the identical, already-named
`0a` finding #6 gap, now explicitly inherited by whoever builds the real adapter (`5f`) rather
than left implicit. See Risks for the residual exposure, and tasks.md for the register row
(`DEF-035`, revised from its first draft to reflect the legacy transaction's own actual shape,
not an assumption that `event_relationship` is wholly unhandled).

### 6. `DeleteHazardousEventUseCase.execute()`: exact composition, `ConflictError` shape, command shape, and `actingUserId` validation

**Command:**

```ts
export interface DeleteHazardousEventCommand {
	id: string;
	tenantId: string;
	actingUserId: string;
}
```

`actingUserId` is validated (`assertNonEmptyString`) even though no persisted column records
it — matching `4b`'s/`4c`'s own convention of validating every command field needed for the
audit-trail log event, not only the fields a save path persists.

**`execute()` pseudocode:**

```
1. assertNonEmptyString(command.id, "id")
2. assertNonEmptyString(command.tenantId, "tenantId")
3. assertNonEmptyString(command.actingUserId, "actingUserId")
4. event = await hazardousEventRepository.findById(command.id, command.tenantId)
   -- tenant gate; propagates NotFoundError unmodified, same sequencing as 4c/4d
5. [disasterEventCount, eventCausalityCounts, causalChainCount] = await Promise.all([
     hazardousEventRepository.countReferencingDisasterEvents(command.id, command.tenantId),
     eventCausalityRepository.countReferences(command.id, command.tenantId),
     causalChainRepository.countEdgesTouching(command.id),
   ])
   -- all three run concurrently, never fail-fast (Decision 6a below)
6. dependents = []
   if (disasterEventCount > 0)
     dependents.push({ type: "DISASTER_EVENT", count: disasterEventCount })
   eventCausalityTotal = eventCausalityCounts.sameTenantCount + eventCausalityCounts.crossTenantCount
   if (eventCausalityTotal > 0)
     dependents.push({
       type: "EVENT_CAUSALITY",
       count: eventCausalityCounts.sameTenantCount,
       -- never the precise crossTenantCount -- Decision 6b / OQ1 resolution
       crossTenantReferenceExists: eventCausalityCounts.crossTenantCount > 0,
     })
   if (causalChainCount > 0)
     dependents.push({ type: "CAUSAL_CHAIN", count: causalChainCount })
   -- this implementation builds dependents in one consistent order as a matter of internal
   -- style; the spec itself (specs/delete-hazardous-event/spec.md) only requires presence of
   -- each non-zero entry, not a specific order -- tests assert membership, not array equality,
   -- so this ordering choice can change later without a spec or test change
7. IF dependents.length > 0:
     throw new ConflictError(
       "Cannot delete a hazardous event that has dependents",
       { hazardousEventId: command.id, dependents },
     )
     -- no third (i18nKey) argument -- Decision 6b
8. await workflowRepository.deleteByEntity(command.id, "HE")
   -- cleans up the WorkflowInstance row 4b created (Decision 8, resolves OQ2) -- runs before
   -- the main delete so a failure here never leaves the HE row deleted with its own
   -- WorkflowInstance orphaned; propagates unmodified on rejection, main delete not reached
9. await hazardousEventRepository.delete(command.id, command.tenantId)
10. logger.info({ msg: "hazardous_event.deleted", hazardousEventId: command.id,
      tenantId: command.tenantId, actingUserId: command.actingUserId })
11. RETURN
```

**6a. Why `Promise.all` (gather all three dependent counts), not fail-fast on the first
non-zero count:** the roadmap's own `4f` text requires the thrown error's context to carry
"which dependents and how many" (plural) — a fail-fast design can only ever report the one
check that happened to run first, hiding the other two even when they also block the delete.
`5f`'s own roadmap text reinforces this: the backing queries must "return enough detail ... not
just a boolean." Gathering all three before throwing is the only shape that satisfies "which
dependents" as a complete set, confirmed as a real difference in behavior by the spec's own
"two dependent types are both present" scenario (`specs/delete-hazardous-event/spec.md`) — a
fail-fast implementation would fail that scenario's own "context names both" assertion.
**Alternative considered and rejected:** sequential fail-fast checks (disaster-event, then
event_causality, then causal-chain, stopping at the first non-zero count). Rejected per the
above — it cannot produce the "which dependents and how many" context the roadmap's own text
requires whenever more than one dependent type blocks the same delete.

**6b. `ConflictError` context shape — resolves OQ1, with a same-tenant/cross-tenant split for
`event_causality` specifically, exact counts for the other two:**

```ts
export type DeleteHazardousEventDependent =
	| { type: "DISASTER_EVENT"; count: number }
	| {
			type: "EVENT_CAUSALITY";
			/** Same-tenant count only. Never the cross-tenant count — see crossTenantReferenceExists. */
			count: number;
			/** True when one or more cross-tenant event_causality rows also exist; their own
			 * count is never disclosed (DEF-004's confirmed-unguarded write path makes a real
			 * cross-tenant reference a genuine, not merely theoretical, possibility here). */
			crossTenantReferenceExists: boolean;
	  }
	| { type: "CAUSAL_CHAIN"; count: number };
```

`hazardousEventId` is included in the context's own top level so a presentation layer can
correlate the error back to the event the caller tried to delete without re-parsing the
request. **Why only `EVENT_CAUSALITY` gets a split, not `DISASTER_EVENT` or `CAUSAL_CHAIN`
too:** `DISASTER_EVENT`'s own write path (`disasterEventCreate`/`disasterEventUpdate`) and
`CAUSAL_CHAIN`'s own write path (`saveEdge`, gated by `findById`) are both already tenant-guarded
today (Decisions 2 and 4's own citations) — a cross-tenant row for either is a defense-in-depth
correctness safeguard against something that should not occur via any sanctioned write path, not
a real disclosure risk the user needs shielded from in practice. `EVENT_CAUSALITY`'s own write
path (`DEF-004`) has no such guard — cross-tenant rows are a confirmed, live possibility today,
so this is the one source where disclosing an exact count would be disclosing real,
currently-reachable cross-tenant data. No `i18nKey` third argument is passed to `ConflictError`,
matching `CausalChain.ts`'s own two `ConflictError` throws (Context) — both already omit it, and
this change follows that established precedent rather than inventing a translation key this
document has no business deciding unilaterally.

**6c. Log event name: `"hazardous_event.deleted"`** — matches this domain's own established
singular, per-entity log-naming convention (`"hazardous_event.created"`,
`"hazardous_event.fetched"`, cited by `4e`'s own design.md Decision 7), not `4e`'s own
plural/list-shaped `"hazardous_events.listed"` exception (that naming divergence is specific to
a list result set, which this use case does not return).

### 7. `IHazardousEventRepository.delete`'s own behavior on a missing row is pinned as a no-op, not an error — a narrow, directly-required addition to an already-shipped method's contract

**Why this change touches an already-existing method's own contract at all:** this change's
own mandatory concurrent-callers spec scenario (two concurrent `execute()` calls for the
**same** event) is only well-defined once `delete`'s own behavior for a second call against an
already-deleted row is pinned — today's port spec (`hazardous-event-repository-port`,
pre-existing) declares `delete(id, tenantId): Promise<void>` with no scenario at all for a
missing row. The existing `FakeHazardousEventRepository` (`IHazardousEventRepository.test.ts`,
Context) already behaves this way by construction (`Map.delete()` on an absent key silently
no-ops) — this is a doc-comment-and-spec-scenario addition pinning that already-true behavior
as the port's own documented contract, not a behavior change to any existing implementation.

**Chosen:** `delete(id, tenantId)` MUST resolve normally (not throw `NotFoundError` or any
other error) when no row matches `id`/`tenantId` — idempotent-delete semantics, matching REST's
own conventional `DELETE` idempotency and the fake's own pre-existing behavior.

**Alternative considered and rejected:** `delete` throws `NotFoundError` for a missing row,
mirroring `findById`'s own throw-based contract. Rejected — this would make `delete` behave
inconsistently with conventional idempotent-delete semantics, and would complicate this
change's own concurrent-callers scenario for no benefit (the scenario's own point is proving
this use case holds no shared mutable state, not exercising a second error path already covered
by the `NotFoundError` requirement on `findById`).

### 8. `IWorkflowRepository.deleteByEntity(entityId, entityType)` — new port method, called before the main delete, resolving OQ2

**Resolved by the user: yes, clean up the `WorkflowInstance` row now, in this change** —
mirroring the legacy precedent (Context: `event.ts` line 1728's own
`entityValidationAssignmentDeleteByEntityId`/`entityValidationRejectionDeleteByEntityId` calls,
the pre-CA equivalent of today's `workflow_instance`) rather than deferring it.

```ts
/** Deletes the WorkflowInstance for a given entity, if one exists. Idempotent: no matching
 * instance is a no-op, not an error — matches IHazardousEventRepository.delete's own
 * established idempotent-delete convention (Decision 7). No tenantId parameter, matching
 * every other method on this port (Context: "caller's own repository scopes tenancy") — the
 * caller (DeleteHazardousEventUseCase) has already proven entityId belongs to its own tenant
 * via its own prior findById call before this is ever invoked. */
deleteByEntity(entityId: string, entityType: EntityType): Promise<void>;
```

**Ordering: `deleteByEntity` runs *before* `IHazardousEventRepository.delete`, not after.**
If `deleteByEntity` itself rejects, `execute()` propagates that error and the main `delete` is
never reached — the `HazardousEvent` row still exists, recoverable with no special handling
(the use case's own `findById` already proved it's there; a retry just re-runs the same
sequence). The reverse ordering (main delete first, `deleteByEntity` second) would instead risk
the exact failure mode this change exists to close: a deleted `HazardousEvent` with its
`WorkflowInstance` row still orphaned, if the second write failed. This mirrors `DEF-026`'s own
established reasoning for `4b`'s multi-write ordering ("order chosen so only a 2nd-write
failure orphans the unrecoverable one").

**Why no tenantId parameter, matching every other `IWorkflowRepository` method (not a new
divergence, unlike Decision 3's own `IEventCausalityRepository.countReferences`):**
`workflow_instance` has no tenant column of its own (Context), and — unlike Decision 3's own
disclosure-shaping need — nothing about this method's own result is ever disclosed to a caller
at all (`Promise<void>`), so there is no analogous reason to break from this port's own
established no-`tenantId` convention here.

## Risks / Trade-offs

- **[Risk, resolved by the user — case (b) only, no longer open] `event_causality`'s own
  confirmed-unguarded write path (`DEF-004`) made exact-count disclosure a real risk for this
  one source.** Resolved via Decision 6b's same-tenant/cross-tenant split: the disclosed
  `ConflictError` context for `EVENT_CAUSALITY` carries only the same-tenant count plus a
  boolean flag, never the cross-tenant count itself. Cases (a) and (c) needed no equivalent
  split — both have a confirmed, existing write-time tenant guard (Decisions 2 and 4's own
  citations), making a cross-tenant row for either a theoretical correctness safeguard rather
  than a live disclosure risk.
- **[Risk, resolved by the user — no longer open] A tenant could be permanently blocked from
  deleting its own event by a cross-tenant `event_causality` reference it can neither see nor
  remove.** Accepted as-is by the user's own resolution (Decision 6b/OQ1) — the split still
  blocks the delete (correctness preserved) while limiting what the blocked user actually sees
  about the cross-tenant side to a boolean flag. The underlying access-control question
  (`DEF-012`) remains open for `hazardous_event_causality` generally, but is not reachable via
  this specific disclosure path anymore for `event_causality`.
- **[Risk] The second of two concurrent same-event deletes logs a success for what was, against
  the real row, a no-op.** Given `delete`'s own idempotent, no-op-on-a-missing-row contract
  (Decision 7), the losing caller's own `execute()` still completes normally and still emits its
  own `"hazardous_event.deleted"` log event — an audit trail reader would see two deletion
  events for one event, with no indication the second one deleted nothing. The same applies to
  `deleteByEntity`'s own idempotent no-op (Decision 8). → Mitigation: not fixed in this
  change — accepted as a minor audit-log accuracy trade-off, the same class of cost idempotent-
  delete semantics always carries; neither method's own return type (`Promise<void>`) has a way
  to tell the caller whether its own call was the one that actually removed a row, and changing
  that return type is a larger port-contract change this change does not take on for a logging
  nicety alone.
- **[Risk] Check-then-delete is not atomic, and both causality tables still have live
  `onDelete: cascade` FKs.** A `hazardous_event_causality` or `event_causality` row inserted
  for this event *after* this use case's counts resolve zero but *before* the real adapter's
  `delete()` call commits would still be silently cascaded away — the exact class of bug this
  change exists to close, reopened by a race window the application layer alone cannot close
  (no port here offers a transaction boundary spanning a read and a later write, same baseline
  `4c`'s own Risks and `DEF-030` already accepted for a structurally similar check-then-act
  race on the same causal-chain table). → Mitigation: not fixed in this change — the real fix
  (a transaction/locking strategy spanning the counts and the delete, or migrating the FKs from
  `cascade` to `restrict`) is squarely `5f`'s job, the first point where a real DB connection
  exists for this use case's own dependents. Register row `DEF-033` (tasks.md) names this so
  `5f` sees the full shape of the problem before building the real adapter. The mandatory
  concurrent-callers spec scenario proves this use case holds no shared mutable state of its
  own for a forced read-before-either-write ordering — matching `4c`'s own precedent of proving
  the race propagates through mocks, not that a mock can prevent a DB-level race it has no
  transaction boundary to prevent.
- **[Risk] `DEF-033` compounds with `DEF-031` once a real adapter exists.** If `5f`'s real
  adapter hits the `DEF-033` cascade/race (`deleteByEntity` succeeds, the subsequent `delete`
  call itself rejects), the surviving `HazardousEvent` is left with no `WorkflowInstance` at
  all — not merely `DEF-031`'s own pre-backfill gap — so `GetHazardousEventByIdUseCase`/
  `UpdateHazardousEventUseCase` throw their defensive `NotFoundError` for that event until a
  retried delete succeeds or the row is manually recreated. → Mitigation: not fixed in this
  change — documented as a widening of both already-existing register rows (`DEF-031`,
  `DEF-033`), not a new row, since this is a compounding interaction between two already-tracked
  root causes rather than an independent third problem.
- **[Risk] The real adapter (`5f`) must replicate several legacy cleanup steps beyond a bare
  `DELETE FROM hazardous_event`, or it will either orphan the `event` supertype row or hit a raw
  FK violation — confirmed via the live legacy transaction, not assumed.**
  `hazardousEventTable.id` is itself a FK into `eventTable.id` (Context) — `hazardous_event` is a
  subtype row of a shared `event` supertype table, exactly like `disaster_event`. The legacy
  `event.ts` line 1728 transaction (Context) deletes, in order: the legacy validation rows
  (now superseded by this change's own `deleteByEntity` call, Decision 8), the `hazardous_event`
  row, `event_relationship` rows where this event is the *child* (incoming link, already
  handled), and finally the `event` row itself. None of this is a new *external dependent-check*
  this use case's own unified check needs to add — `event`, `event_relationship`'s incoming
  role, and the legacy validation tables are all part of the delete's own internal transaction
  mechanics, not another aggregate's reference, and remain `5f`'s own implementation concern,
  same as the `hazardous_event_attachment`/`hazardous_event_field_value`/etc. child tables' own
  `onDelete: cascade` cleanup (Context). **The one genuinely unhandled gap this surfaces
  (Decision 5):** `event_relationship`'s *outgoing* role (this event is the parent/cause of
  some other row) is cleaned up by neither the legacy function nor this change's own unified
  check — a real adapter that only replicates the legacy transaction's existing steps verbatim
  would still inherit `0a` finding #6's own raw FK-violation risk for that one role, unless `5f`
  deliberately adds a fix. → Mitigation: not fixed in this change — scoped out per the brief's
  own case (c) definition (Decision 5). Register row `DEF-035` (tasks.md) flags both the
  supertype-row replication need and the one remaining outgoing-role gap for `5f`. A repo-wide
  grep for every other reference to `eventTable.id` (not just the ones the brief or the audit
  already named) confirms `event_relationship` and the two subtype tables (`hazardous_event`,
  `disaster_event`) are the only tables with a FK into it — no further surprise `RESTRICT`
  constraint exists for `5f` to discover later.
- **[Risk] `5f`'s own roadmap text is now stale relative to this change's port-placement
  decisions.** The roadmap's `5f` section (`hazardous-events-refactoring-roadmap.md`, "Delete
  Dependent-Check Queries") lists its own "Files touched" as only
  `DrizzleHazardousEventRepository.ts` (modified) — written before this change's own Decision 1
  moved case (b)'s query to a new, separate `IEventCausalityRepository`/its own future adapter,
  and before `4b`'s `ICausalChainRepository` was confirmed as the home for case (c) (that
  adapter is `5i`, per `DEF-030`'s own citation, not `5f`). → Mitigation: not fixed in this
  change (editing the roadmap's `5f` section is a different change's scope, and this document
  is not the roadmap). Flagged here and in proposal.md Impact so whoever picks up `5f` reads
  this change's own actual port surface rather than the roadmap's now-outdated file list.

## Open Questions

Two items from an earlier draft of this document (cross-tenant disclosure/deadlock, and the
orphaned `WorkflowInstance` row) are now resolved by explicit user decision — Decisions 6b and
8 respectively, with the resulting trade-offs recorded in Risks above. One item remains open,
informational only, not blocking this change's own implementation:

1. **The `delete`-is-a-no-op-on-a-missing-row contract (Decision 7).** This change pins a
   behavior on an already-shipped port method that no prior change's own spec decided either
   way. It is needed to make this change's own mandatory concurrent-callers scenario
   well-defined, and it matches the existing fake's own already-true behavior — but it also
   binds whatever real adapter `5d`/`5f` eventually builds for `delete` to this exact contract,
   which neither of those future intents has reviewed. Flagged so whoever picks up `5d`/`5f`
   knows this constraint did not originate from their own design process.

## Migration Plan

None. Application-layer TypeScript only (one new use case, three modified ports
(`IHazardousEventRepository`, `ICausalChainRepository`, `IWorkflowRepository`), one new port
(`IEventCausalityRepository`), three new deferred-register rows — `DEF-032` (pre-authorized by
the brief), `DEF-033`, `DEF-035` (surfaced this session); `DEF-034` was considered for the
orphaned-`WorkflowInstance` finding and deliberately not added, since that finding is resolved
in this change (Decision 8) rather than deferred) — no schema change, no data migration, no
feature flag, no infrastructure-layer adapter in this change. Inert until a future
route/handler intent (Phase 6) calls `DeleteHazardousEventUseCase`, exactly as
`4b`/`4c`/`4d`/`4e`/`4g`'s own use cases remain inert until their own future callers exist.
