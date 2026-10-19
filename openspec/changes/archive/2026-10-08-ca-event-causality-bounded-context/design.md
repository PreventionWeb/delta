## Context

See `proposal.md` - Why. Relevant current state:

- `IEventCausalityRepository` (port only, no adapter) lives at
  `app/domains/shared/application/ports/IEventCausalityRepository.ts`. Its one method,
  `countReferences(hazardousEventId: string, tenantId: string): Promise<EventCausalityReferenceCounts>`,
  returns `{ sameTenantCount: number; crossTenantCount: number }`. `tenantId` classifies each
  matching row's own other side into same-tenant/cross-tenant — it does not filter.
- Its one consumer, `DeleteHazardousEventUseCase`
  (`app/domains/hazardous-events/application/use-cases/DeleteHazardousEvent.ts`), calls it
  alongside two other dependent-reference checks (`countReferencingDisasterEvents`,
  `countEdgesTouching`) via `Promise.all`, then builds an `EVENT_CAUSALITY` dependent entry that
  discloses `sameTenantCount` as `count` and only a boolean `crossTenantReferenceExists` (never the
  cross-tenant count itself) — this disclosure shaping is already fully specified by
  `DeleteHazardousEvent.test.ts` and is unchanged by this proposal.
- The underlying table, `app/drizzle/schema/eventCausalityTable.ts` (`event_causality`), has no
  `country_accounts_id` column of its own. Each row has a `triggering_*` side and a `triggered_*`
  side; a CHECK constraint on each side guarantees exactly one of
  `{triggering,triggered}_hazardous_event_id` / `{triggering,triggered}_disaster_event_id` is set,
  matching that side's own `{triggering,triggered}_entity_type` (`'HE'` or `'DE'`). Classifying a
  row's "other side" tenant therefore requires joining to `hazardousEventTable` (when the other
  side's entity type is `'HE'`) or `disasterEventTable` (when `'DE'`) to read that side's own
  `country_accounts_id`.
- The existing legacy query object, `app/db/queries/eventCausalityRepository.ts`
  (`EventCausalityRepository`, a plain object, not a class — no naming collision with the new
  `DrizzleEventCausalityRepository`), has no count-by-node method to reuse; this adapter's query
  is genuinely new.
- `app/domains/notices/infrastructure/NoticesModule.server.ts` is the only real NestJS module
  precedent in this codebase — referenced here for wiring *shape* only (own `DrizzleProvider`
  registration per module, token-based provider registration via `@Inject`/typed `Symbol` token,
  `exports` array). Its convention of exporting only use cases (hiding `NOTICE_REPOSITORY` behind
  them) is **not** followed here — `event-causality` has no use case, so the token itself must be
  exported.

## Goals / Non-Goals

**Goals:**

- Move `IEventCausalityRepository` (and its test) into its own bounded context,
  `app/domains/event-causality/`, with zero behavior change to the port's contract or to
  `DeleteHazardousEventUseCase`.
- Implement the first real adapter, `DrizzleEventCausalityRepository`, against the pre-existing
  `event_causality` table.
- Wire a minimal `EventCausalityModule.server.ts` that exports `EVENT_CAUSALITY_REPOSITORY`
  directly, ready for `HazardousEventsModule` (`5g`) to import later.
- Leave a forward-looking note in ADR-009 so a future similar placement question (Shared Kernel
  vs. own bounded context) has this precedent to point to.

**Non-Goals:**

- No schema change, no migration — `event_causality` is read-only from this context's
  perspective.
- No change to `DeleteHazardousEventUseCase`'s dependent-disclosure logic (same-tenant count
  disclosed, cross-tenant count never disclosed directly) — that rule is owned by
  `DeleteHazardousEventUseCase` itself, not this context; this context only supplies the raw
  counts.
- No absorption of or interaction with `hazardous_event_causality` (the unrelated, newer,
  HE-exclusive causal-chain table from `2e`/`3c`/`5i` — different table, different bounded
  context, different port (`ICausalChainRepository`)). `event_causality` (this change) and
  `hazardous_event_causality` (HE's own causal chain) are easy to conflate by name; they are not
  the same table and this change does not touch the latter.
- No wiring of `EventCausalityModule.server.ts` into `CoreModule.server.ts` or any other module
  yet —
  confirmed via repo search that no `HazardousEventsModule`/`ValidationWorkflowModule` exists yet
  to import it (`5c`/`5g` are not built). It stays unregistered and unimported until `5g`.

## Decisions

**Decision 1 — Port relocation is a pure file move, not a rewrite.**
`IEventCausalityRepository.ts` and `IEventCausalityRepository.test.ts` move verbatim (same
interface, same `EventCausalityReferenceCounts` type, same doc comment content with the "Shared
Kernel" line corrected to describe the new bounded context instead) to
`app/domains/event-causality/application/ports/`. The only functional edit anywhere outside the
new directory is `DeleteHazardousEvent.ts`'s import path (and its test's import path, which
imports the same types for its `FakeEventCausalityRepository` test double).
_Alternative considered:_ keep the port in `shared/` and only add the adapter elsewhere — rejected
because that leaves the Shared-Kernel-placement problem this proposal exists to fix.

**Decision 2 — Single query with `OR`, not a `UNION`, to avoid double-counting a
self-referencing row.**
`DrizzleEventCausalityRepository.countReferences` selects every `event_causality` row where
`triggering_hazardous_event_id = :hazardousEventId OR triggered_hazardous_event_id =
:hazardousEventId` in one query (not two unioned queries, one per side) — a physical row that
matches both predicates (a row whose `triggering_hazardous_event_id` and
`triggered_hazardous_event_id` are both the queried hazardous event — nothing in this table's
CHECK constraints forbids that, unlike `hazardous_event_causality`'s explicit
`cause <> effect` CHECK) still appears exactly once in the result set, so it still contributes
exactly one count, not two. Per row, a `CASE` expression picks "the other side" relative to
*which* predicate matched (triggering-side match → look at the triggered side's tenant;
triggered-side match → look at the triggering side's tenant).

**Pinned behavior for the self-referencing case (both predicates match the same row):** the
"other side" under either branch is the hazardous event itself, so the row is classified the
same way any other row is — by comparing that other side's tenant (here, `hazardousEventId`'s
own tenant) to the given `tenantId`. This is not special-cased or hard-coded to always land in
`sameTenantCount`: the port has no `findById` guard of its own (that belongs to whichever
consumer calls it — `DeleteHazardousEventUseCase` today, a different consumer later), so the
adapter must not assume `tenantId` always equals the queried event's own tenant. A dedicated
PGlite test asserts the row still contributes exactly one count (never zero, never two) rather
than leaving it an implicit consequence of query shape.
_Alternative considered:_ `UNION ALL` of a triggering-side query and a triggered-side query —
rejected because a self-referencing row would then appear once in each branch and be double
counted; `UNION` (distinct) doesn't fully fix it either since the two branches project different
columns (different "other side" tenant per branch) and wouldn't collapse to one row anyway.

**Decision 3 — Classify the other side by joining both possible sibling tables, not by a
runtime branch in application code.**
The query `LEFT JOIN`s `hazardousEventTable` once per side (aliased) and `disasterEventTable`
once per side (aliased) — four joins total — and the `CASE` expression picks the correct join's
`country_accounts_id` based on that side's own `entity_type` column (`'HE'` → the
`hazardousEventTable` alias, `'DE'` → the `disasterEventTable` alias). Only one of each pair is
ever non-null per row, per the table's own CHECK constraints, so the `CASE` never has an
ambiguous choice. `onDelete: cascade` on every FK means an "other side" **row** can never be
missing (no orphan-row null-handling needed) — but that row's own `country_accounts_id` column
is nullable on both `hazardousEventTable` and `disasterEventTable` (confirmed by reading both
schema files: neither declares `.notNull()` on this column). **Resolved, not left open:** the
existing `openspec/specs/event-causality-repository-port/spec.md` contract already defines
`crossTenantCount` as counting "the remaining matching rows" (i.e. total minus
`sameTenantCount`), so a `NULL` other-side tenant — which can never equal the given `tenantId` —
falls into `crossTenantCount` by that existing wording, not a new decision invented here. The
adapter's `CASE`/comparison must therefore be written so a `NULL` naturally fails the
same-tenant equality check and falls through to the cross-tenant branch, rather than written as
an explicit `<>` inequality (which would evaluate to `NULL`, not `true`, for a `NULL` operand in
SQL, silently excluding the row from both counts — a real correctness trap this adapter must
avoid). See the spec delta's own "other side has no recorded tenant" scenario.
_Alternative considered:_ fetch raw `event_causality` rows then resolve each side's tenant with a
second round-trip per row (N+1) — rejected as needless given the join is straightforward and the
row count per hazardous event is small (bounded by how many causal references one event has).

**Aggregate result type:** Postgres `COUNT`/`SUM` return `bigint`, which drivers commonly surface
as a string rather than a `number` (and `SUM` over zero matching rows returns `NULL`, not `0`).
`IEventCausalityRepository.countReferences`'s contract is `Promise<EventCausalityReferenceCounts>`
— plain `number` fields — so the query must coerce explicitly (e.g. `::int` cast or Drizzle's
`count()`/`.mapWith(Number)`, plus `COALESCE(..., 0)` for the zero-rows case) rather than return
the raw aggregate. Left uncoerced, `DeleteHazardousEventUseCase`'s own `count` field would
silently become a string, and `sameTenantCount + crossTenantCount`'s arithmetic (used to decide
whether `event_causality` blocks the delete at all) would silently become string concatenation
instead of addition — a real correctness bug, not just a type mismatch, so task 3.1 must verify
the returned type, not just the returned value.

**Decision 4 — `EventCausalityModule.server.ts` exports the repository token directly.**
Unlike `NoticesModule` (which exports only use cases, keeping `NOTICE_REPOSITORY` module-private),
`EventCausalityModule` has no use case of its own to hide the port behind — its only job is to let
other domains (`HazardousEventsModule` today via `5g`, Disaster Events' own future CA module later)
inject `IEventCausalityRepository` directly. `EVENT_CAUSALITY_REPOSITORY` (a typed `Symbol`
token, same pattern as `NOTICE_REPOSITORY`) is therefore in the module's `exports` array.
`DrizzleProvider` is registered within this module's own DI scope, same reasoning as
`NoticesModule`'s Decision 2 (avoids a circular module dependency).
_Alternative considered:_ wait for `5g` to invent the export-the-token convention — rejected per
the proposal's own blast-radius argument: fixing the port's home and shipping its first real
consumer-ready module now is cheaper than doing it once a second real consumer exists.

**Resolved via discussion, 2026-10-08 (SOLID review finding):** exporting the token directly
scopes every consumer to the full `IEventCausalityRepository` surface, which is a risk only if
that surface grows. The chosen mitigation is interface segregation discipline, not a use-case
wrapper layer: if this context ever needs a write capability, it gets its own segregated port
(e.g. `IEventCausalityWriter`) and its own export token — never a new method bolted onto
`IEventCausalityRepository` itself. This is a documented discipline, not something structurally
enforced today; flagged deliberately rather than solved by adding a use-case layer now for a
single stateless read method with no orchestration logic to justify one.

**Decision 5 (resolved) — module file suffix: `EventCausalityModule.server.ts`.**
Settled per ADR-009's now-explicit suffix rule (two new paragraphs added ahead of its
"Consequences" section, citing `5m`/2026-10-08): a file needs `.server.ts` only when it
transitively imports genuinely browser-unsafe code, not merely because it is conceptually
server-side wiring. `EventCausalityModule` registers `DrizzleProvider` and wires a real
repository, so it qualifies — `EventCausalityModule.server.ts`, correcting the roadmap's own
unsuffixed file name. `EventCausalityRepositoryToken.ts`, by contrast, carries no suffix — a bare
`Symbol()` declaration has nothing that could leak or break if ever bundled, same as
`NoticeRepositoryToken.ts`'s own precedent. `IEventCausalityRepository.ts` is unaffected either
way — a pure interface, already `.ts`, unchanged by the move. `DrizzleEventCausalityRepository`
was never in question: it imports `~/db.server`-adjacent infrastructure directly, so it keeps
the `.server.ts` suffix, matching `DrizzleNoticeRepository.server.ts`. See ADR-009 itself for the
full reasoning, not re-derived here.

**Decision 6 (resolved) — PGlite test location: `tests/integration/domains/event-causality/`.**
Also settled in the same ADR-009 update: a port-adapter class's own integration test belongs
grouped with its bounded context's other integration tests (module/controller/guard tests),
not the flat `tests/integration/db/queries/` bucket — the standard Clean Architecture
test-type-first-then-bounded-context convention, not `DrizzleNoticeRepository.test.ts`'s
location copied uncritically (that file is a known, deliberately-not-migrated exception,
predating this distinction). This corrects the roadmap's own stated path for
`DrizzleEventCausalityRepository.test.ts` — it was already correct for `EventCausalityModule.test.ts`
— so both now sit in `tests/integration/domains/event-causality/`, one bounded context's whole
integration-test surface in one folder. `tests/integration/db/queries/` remains the right home
only for tests with no port/adapter class at all (plain schema/constraint tests).

**Decision 7 — ADR-009 gets additive notes, not a rewrite.**
ADR-009's Shared Kernel section (around its "A second, distinct category of cross-cutting code...
Shared Kernel" paragraph) never named `IEventCausalityRepository` explicitly, so nothing is
retracted. A short paragraph is appended there: this exact placement question (small shared
relationship-port vs. its own bounded context) came up for `event_causality`, was resolved in
favor of a dedicated bounded context once the port grew a real adapter and a real business rule,
and `validation-workflow` is the precedent this followed. Two further paragraphs, just ahead of
its "Consequences" section, formalize Decisions 5 and 6 above as project-wide conventions (not
one-off choices for this change alone) — citing `5m`/2026-10-08 as the precedent. This is
forward-looking guidance for the next domain that hits either question, not a correction of a
past decision.

**Decision 8 — fieldsDef / Form-CSV-API pipeline: not applicable.**
This change has no form, no CSV import/export, and no REST API route — it is a port, an adapter,
and a module with no presentation surface. There is nothing in the Form-CSV-API pipeline to touch.

**Decision 9 (resolved via discussion, 2026-10-08) — `countReferences` does not validate
`hazardousEventId`/`tenantId`'s shape.** This is deliberate, not an oversight (Gate 10 finding):
Clean Architecture's canonical validation-ownership guidance (Hombergh, _Get Your Hands Dirty on
Clean Architecture_) places input validation at the use case/input-model layer, not the
repository — a repository stays a pure persistence abstraction, not coupled to business/
validation rules. `DeleteHazardousEventUseCase` already validates both via
`assertNonEmptyString` before calling this port, so a malformed input is unreachable through the
one current consumer; a future second consumer owns the same responsibility for its own
equivalent validation. No injection risk either way — this is a parameterized query regardless of
input shape. The actual failure mode of an unvalidated malformed id is a raw Postgres error
surfacing instead of a typed domain error (a DX/error-contract gap, not a security or
data-integrity one), which is why this doesn't rise to needing a defensive check at this layer.

## Risks / Trade-offs

- **[Risk] The join-based tenant classification is the one place a subtle multi-tenancy bug could
  hide** (e.g. joining the wrong alias, or comparing against the *hazardous event's own* tenant
  instead of the *other side's* tenant — the port's whole contract is that `tenantId` classifies
  the other side, not the queried event itself, which is already same-tenant by definition) →
  **Mitigation:** the PGlite test suite asserts same-tenant and cross-tenant counts independently,
  in both directions (hazardous event as triggering side and as triggered side), plus the
  self-referencing-row edge case from Decision 2, against seeded rows in two different tenants —
  not just assertions that *some* number comes back.
- **[Risk] This change introduces a second table that looks similar in name to
  `hazardous_event_causality` (`2e`/`3c`), inviting future confusion** → **Mitigation:** the
  Non-Goals section above states this explicitly; the adapter's own file and test names
  (`DrizzleEventCausalityRepository`, not `DrizzleHazardousEventCausalityRepository`) stay
  distinct from `5i`'s `DrizzleCausalChainRepository`.
- **[Risk/Trade-off] No concurrent-callers scenario is specified for `countReferences`.** This
  capability has no shared mutable state of its own (no in-process cache, counter, debounce, or
  request-coalescing layer) — it is a stateless read query against Postgres, which already
  guarantees each call sees a consistent snapshot via MVCC. Two concurrent callers simply run two
  independent, correctly-isolated queries; there is no app-level race to pin with a test. This is
  a deliberate scope decision, not an oversight — contrast with `DeleteHazardousEventUseCase`'s
  own concurrent-callers tests, which exist because *that* use case has a real
  read-then-write sequence across multiple repositories.

## Migration Plan

1. Create `app/domains/event-causality/application/ports/IEventCausalityRepository.ts` and
   `.test.ts` (moved content, Shared Kernel comment corrected).
2. Delete the two files at their old `app/domains/shared/application/ports/` location.
3. Update `DeleteHazardousEvent.ts` and `DeleteHazardousEvent.test.ts` import paths.
4. Add `DrizzleEventCausalityRepository.server.ts`, `EventCausalityRepositoryToken.ts` (no
   suffix), and `EventCausalityModule.server.ts` under
   `app/domains/event-causality/infrastructure/`.
5. Add the two PGlite integration tests (`DrizzleEventCausalityRepository.test.ts`,
   `EventCausalityModule.test.ts`) under `tests/integration/domains/event-causality/`.
6. Append the ADR-009 notes (Shared Kernel placement, `.server.ts` suffix rule, test-location
   convention).

No deploy-time migration, no rollback script — this is a code-only, same-PR-reversible change
(a plain `git revert` undoes it cleanly; no data or schema state to roll back).

## Open Questions

Four ambiguities found during design are resolved here, not deferred, since each would otherwise
change the spec, the adapter's query shape, or a file path: (a) self-referencing
`event_causality` row counting — Decision 2; (b) `NULL` other-side tenant classification —
Decision 3, which shows the existing `event-causality-repository-port` spec's own wording
already settles this as cross-tenant, not a new decision this change invents; (c) the module's
`.server.ts` suffix — Decision 5, now a project-wide ADR-009 rule, not a one-off pick; (d) the
PGlite test file location — Decision 6, same ADR-009 update. What's left, genuinely deferrable to
human review without changing this design's architecture:

1. **`EventCausalityRepositoryToken.ts`** is a new file not named in the roadmap's own file list,
   added by necessity (the module needs a typed injection token) rather than roadmap oversight
   being ruled out. Flagging the addition; not expected to be controversial.
2. **`openspec/specs/event-causality-repository-port/spec.md`'s own `## Purpose` section**
   still describes this port's home as Shared Kernel after this change archives, since a delta's
   `## Purpose` is ignored for an existing capability and editing the main spec file directly is
   outside this agent's own role boundary. `tasks.md` task 8.2 hands this to the implementer
   explicitly, so it isn't silently forgotten.
