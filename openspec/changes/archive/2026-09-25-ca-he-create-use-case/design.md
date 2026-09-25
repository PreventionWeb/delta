## Context

See proposal.md - Why for the scope correction. Ground truth read in full before writing this
document:

- `app/domains/hazardous-events/domain/HazardousEvent.ts` — `static create(props,
validHazardDriverIds: ReadonlySet<string>, validCustomFieldDefinitionIds: ReadonlySet<string>):
HazardousEvent`. No `parentId`. Both valid-id-set params are mandatory, no default
  (`3e` design.md Decision 4, `DEF-021`). Throws `ValidationError` for shape/membership
  violations.
- `app/domains/hazardous-events/domain/CausalChain.ts` — pure function
  `assertCausalLinkDoesNotCreateCycle(existingEdges: readonly CausalEdge[], causeId, effectId):
void`, throws `ConflictError` for a confirmed cycle (self-link checked first) or `ValidationError`
  if `CAUSAL_CHAIN_TRAVERSAL_CAP` (500 distinct nodes) is exceeded before resolving. `3c` design.md
  Decision 6: "receives `existingEdges` as a plain parameter; a future use-case intent is
  responsible for loading that array... and calling this function before persisting a new row" —
  this is that use-case intent.
- `app/domains/hazardous-events/application/ports/IHazardousEventRepository.ts` — real signatures:
  `findById(id, tenantId): Promise<HazardousEvent>` (throws `NotFoundError`, tenant-scoped),
  `findAll`, `save(entity): Promise<HazardousEvent>`, `delete`, plus spatial-observation methods.
  No causality methods.
- `app/domains/validation-workflow/domain/WorkflowInstance.ts` — `static
create(props): WorkflowInstance`. For `status: "DRAFT"`, `REQUIRED_NULL` requires all four
  attribution pairs (`submitted`/`validated`/`approved`/`published`) null; `REQUIRED_SET` for
  `DRAFT` is empty. `IWorkflowRepository.save(instance)` persists it; `findByEntity(entityId,
entityType)` resolves `null`, never throws.
- `app/domains/validation-workflow/application/use-cases/ProcessWorkflowAction.ts` design.md
  Decision 9: "`4b`'s (`CreateHazardousEventUseCase`'s) job, at entity-creation time" —
  confirms this change, not `4a`, owns DRAFT initialization.
- `app/domains/hazardous-events/infrastructure/hazardousEventCausalityTable.ts` — `causeHazardousEventId`,
  `effectHazardousEventId` (both FK `hazardousEventTable.id`, `onDelete: "cascade"`),
  `causalityExplanation` (nullable text), no `countryAccountsId` column — tenancy is only
  transitive through the two FK'd `HazardousEvent` rows.
- `app/domains/hazardous-events/infrastructure/hazardDriverTable.ts` and
  `hazardTypeCustomFieldDefinitionTable.ts` — both have `countryAccountsId uuid NOT NULL`, so a
  real tenant-scoped membership query is straightforward to define once a future adapter intent
  implements `IHazardTaxonomyRepository`.
- `openspec/changes/archive/2026-09-22-ca-he-aggregate-child-value-objects/design.md` (Decision 4,
  Risks): "computing them correctly (a real, tenant-filtered query...) is the eventual persistence
  intent's job" — `DEF-021`'s register entry names this same gap as needing "a persistence intent
  for `HazardousEvent`'s driver/custom-field-value collections to be proposed first... no such
  intent named yet." This change is that persistence intent.
- `openspec/changes/archive/2026-09-21-ca-he-causal-chain-domain-logic/design.md` (Non-Goals,
  Risks): "Cross-tenant access control on `hazardous_event_causality` (`DEF-012`) — explicitly out
  of scope per the roadmap's own `3c` text"; "that intent's design should scope the edge list (e.g.
  to the relevant connected component/tenant) before calling this function" — read together with
  `DEF-012`'s register entry ("Before Phase 3c... or Phase 5 builds real access control"), this
  change is the "next intent" both notes point to.
- `app/domains/notices/application/use-cases/CreateNotice.ts` — the Command/UseCase/DTO precedent:
  `id`/`createdAt` generated internally (`crypto.randomUUID()`, `new Date()`), never accepted from
  the command; errors from the entity/repository propagate unmodified; `saved` (not the
  pre-save entity) feeds the returned DTO.
- `app/domains/hazardous-events/application/ports/IHazardousEventRepository.test.ts` /
  `app/domains/validation-workflow/application/ports/IWorkflowRepository.test.ts` — the
  fake-conformance-implementation test pattern this change's two new port test files follow.
- `app/db.server.ts` exports `Tx` — a real Drizzle transaction-handle type
  (`Parameters<(typeof dr)["transaction"]>[0]`-derived, or the plain `Dr` connection). It is an
  **infrastructure-layer** type: nothing in `app/domains/**` imports it, no port
  (`IHazardousEventRepository`, `IWorkflowRepository`, or either new port this change adds) accepts
  a `Tx` parameter, and no `IUnitOfWork`-style application-layer abstraction wraps it anywhere
  (confirmed by repo-wide grep). No Drizzle adapter exists yet for `IHazardousEventRepository` or
  `IWorkflowRepository` either, so there is nothing today that could thread `Tx` through even if a
  port method accepted one.

## Goals / Non-Goals

**Goals:**

- One `CreateHazardousEventUseCase.execute(command)` that constructs, validates, and persists a
  `HazardousEvent`; optionally links it as the effect of an existing, already-persisted cause
  event with a real cycle check; initializes its `WorkflowInstance` at `DRAFT`; and returns a
  `HazardousEventDto`.
- Define `ICausalChainRepository` and `IHazardTaxonomyRepository` as the two new ports this use
  case needs, matching this codebase's existing "small port per bounded concern" pattern
  (`INotificationPort`, `IWorkflowRepository`) rather than growing `IHazardousEventRepository`
  into an unrelated concern.
- Settle, not leave open, the one question this change's own ground truth flagged as belonging
  here: `causeId` tenant scoping ships as same-tenant-only, final for this change (Decision 4);
  `DEF-012` itself (cross-tenant access control as a real future capability) stays open in the
  register.

**Non-Goals:**

- No Drizzle adapter for `IHazardousEventRepository`, `IWorkflowRepository`,
  `ICausalChainRepository`, or `IHazardTaxonomyRepository` — none of the four ports this domain
  depends on has a real adapter yet. All four stay interface-only in this change, matching `3c`'s/
  `4a`'s own split; no PGlite tier for any of them. A real adapter for `ICausalChainRepository` and
  `IHazardTaxonomyRepository` is deferred to a future Phase 5 intent.
- No route, no `authActionWithPerm` wiring. Application-tier only, same as `4a` today.
- No `UpdateHazardousEventUseCase` scope: changing an existing event's `causeId` after creation,
  and the temporal-order check the roadmap assigns to `4c`, are explicitly that use case's job,
  not this one's.
- No resolution of `DEF-012` (cross-tenant causality access control) — this change ships a final,
  same-tenant-only default for its own `causeId` validation (Decision 4), but that default is not
  itself a resolution of `DEF-012`'s real access-control gap; the register entry stays open.
- `DEF-021` is **narrowed, not closed**, by this change — `IHazardTaxonomyRepository` gives
  `HazardousEvent.create()`'s mandatory valid-id-set parameters a real computation path and a real
  caller for the first time, but no adapter exists in this change to prove the query correct
  against real schema; that verification is deferred to a future adapter intent.
- No attachment-id generation policy. `HazardousEvent.create()` already treats attachment `id` as
  "typed but not validated" (`3e` design.md Decision 2); this change does not invent a rule for
  where that id comes from — the command accepts `attachments` pre-shaped, same as
  `hazardDriverIds`/`fieldValues`/`customFieldValues`.

## Decisions

### 1. `id` generated internally; the create-time cycle check is real but can never fail

Matches `CreateNoticeUseCase`: `const id = crypto.randomUUID();` at the top of `execute()`, never
accepted from the command. Consequence, stated explicitly rather than left for a reviewer to spot:
a brand-new `effectId` has zero existing edges pointing at or through it, so
`assertCausalLinkDoesNotCreateCycle(edges, causeId, newId)` can never observe `causeId` as
reachable from `newId`, and `causeId === newId` is impossible (the id didn't exist before this
call). The roadmap's original `4b` text ("a brand-new event cannot already be an ancestor of
anything, confirmed correct... per 0b finding #5") is still true under the edge model, for exactly
this reason.

The call is kept anyway, per the user's explicit scope decision, as **defense-in-depth**: it is
the same guard `4c` (update, where an existing event's `causeId` changes) will need, so
`CreateHazardousEventUseCase` establishes the calling convention `4c` reuses rather than inventing
its own. With a _correct real adapter_, `findReachableEdgesFrom(newId)` always resolves `[]` for a
freshly-generated `newId`, so the check always passes in production. This is documented here so no
future reader mistakes the call's presence for a claim that create-time cycles are possible in
practice.

**Test implication — the rejection branch is testable through `execute()`, using a contrived fake,
not a real one:** `findReachableEdgesFrom` receives the generated `newId` as its own argument, so
a fake `ICausalChainRepository` can be stubbed to resolve
`[{ causeId: newId, effectId: command.causeId }]` regardless of what id was generated — the BFS
then starts at `newId`, reaches `command.causeId` on its first step, and
`assertCausalLinkDoesNotCreateCycle` throws `ConflictError`. This needs no injectable id generator
and no module mocking of `assertCausalLinkDoesNotCreateCycle` itself. This change's test file
therefore includes both: (a) the propagation scenario (`ConflictError` from a contrived
edges-fake propagates unmodified, and `save`/`saveEdge`/workflow-`save` are never called — this
also proves the check runs before any write), and (b) confirmation that `findReachableEdgesFrom`
is called with the generated id, not `command.causeId`. Only the _production_ claim ("this branch
never fires against a correct real adapter") rests on Decision 1's argument above, not on the test
itself — stated explicitly so the two claims (unreachable with real data; constructible with a
contrived fake) aren't conflated.

### 2. `ICausalChainRepository`: scoped read, not a whole-table load

```ts
// application/ports/ICausalChainRepository.ts
import type { CausalEdge } from "../../domain/CausalChain";

export interface ICausalChainRepository {
	/** Edges reachable by following cause->effect forward from `nodeId`, matching exactly what
	 * `assertCausalLinkDoesNotCreateCycle`'s own BFS needs starting from `effectId` — never a
	 * whole-table load (`3c` design.md Risks explicitly warns against that). Empty for a node
	 * with no existing edges (always true for a freshly-generated id at create time). MUST resolve
	 * the complete reachable set or reject — an adapter MUST NOT silently return a truncated
	 * partial set under its own internal query bound; a truncated-but-successful result would let
	 * the caller's BFS finish on partial data and misreport "no cycle" for a graph it never fully
	 * saw (see the bound note below — this is the exact failure mode `3c`'s own design avoids). */
	findReachableEdgesFrom(nodeId: string): Promise<readonly CausalEdge[]>;

	/** Inserts one cause->effect edge row. `hazardous_event_causality`'s own FK/CHECK constraints
	 * are the authoritative guard against a dangling or self-referencing edge; this method does
	 * not re-validate. */
	saveEdge(
		edge: CausalEdge,
		causalityExplanation: string | null,
	): Promise<void>;
}
```

`CausalEdge` is imported from `3c`'s `domain/CausalChain.ts`, not redefined — this port is the
first real consumer of that type outside its own test file.

**Alternatives considered:**

1. **Add causality methods to `IHazardousEventRepository`.** Rejected: spatial observations sit on
   that port because they are children of one `HazardousEvent` aggregate (`3d`'s own framing).
   Causality is a graph _between_ aggregates — `3c` Decision 1 deliberately placed
   `assertCausalLinkDoesNotCreateCycle` outside the aggregate, as a domain service, for the same
   reason. `4c` (a future, separate use case) will be this port's second consumer, independent of
   whichever `HazardousEvent` instance it's called for — another sign this isn't aggregate-scoped
   data.
2. **`findAllEdges(): Promise<readonly CausalEdge[]>` (whole table).** Rejected per `3c` design.md
   Risks' own explicit warning against an unscoped load; also the only shape a naive port would
   need if it copied `assertCausalLinkDoesNotCreateCycle`'s parameter type directly, which is
   exactly the shortcut that warning calls out.
3. **Chosen: `findReachableEdgesFrom(nodeId)`**, scoped to exactly the traversal
   `assertCausalLinkDoesNotCreateCycle` performs, reusable by `4c` without a different query
   shape.

**Bound left to the future adapter, and it must fail closed, not truncate — named explicitly so
it isn't rediscovered as a surprise or reintroduced as a bug:** `CAUSAL_CHAIN_TRAVERSAL_CAP` (`3c`)
bounds how many _distinct nodes_ the in-memory BFS visits — it does not bound how many rows
`findReachableEdgesFrom` itself may need to load before the BFS ever runs, same distinction `3c`'s
own Gate 10, round 2 finding drew for `buildForwardAdjacency`'s input. This port's interface makes
no promise about the adapter's own query cost, but it does promise completeness (see the method's
own doc comment above) — so the future Drizzle adapter for this port MUST NOT respond to an
oversized reachable set by silently returning a truncated partial list: that is exactly
`event.ts`'s legacy depth-10 bug `3c`'s own design.md Context names as the precedent this whole
design exists to avoid ("hitting the cap is treated as safe... a chain longer than the cap
silently passes"). A BFS that runs to completion against a truncated edge list finishes normally
and misreports "no cycle" for a graph it never fully saw. If the adapter's own query-level bound
would be exceeded before the reachable set is fully loaded, it MUST reject (e.g. `ValidationError`,
the same class `3c`'s own in-memory cap-exceeded branch uses) rather than return a partial result.
`4c` inherits this same contract when it becomes this port's second consumer.

**No adapter in this change.** `ICausalChainRepository` stays interface-only here, matching this
design's original "interface now, adapter later" recommendation. (An earlier revision of this
change had folded a real `DrizzleCausalChainRepository` adapter into this same scope, per a
since-reversed user decision; that decision is reverted, and a real adapter is deferred to a future
Phase 5 intent.) The fake-conformance test (`ICausalChainRepository.test.ts`) is this change's only
proof that this port's contract is implementable.

### 3. `IHazardTaxonomyRepository`: tenant-scoped membership lookup, closing DEF-021's "no computation path" gap

```ts
// application/ports/IHazardTaxonomyRepository.ts
export interface IHazardTaxonomyRepository {
	/** Subset of `ids` that exist in `hazard_driver` under `tenantId` — feeds
	 * `HazardousEvent.create()`'s mandatory `validHazardDriverIds` parameter with a real,
	 * tenant-filtered set instead of an empty one (narrows DEF-021's "no computation path" gap;
	 * does not yet verify a real adapter's query is correct — no adapter exists in this change). */
	findValidHazardDriverIds(
		ids: readonly string[],
		tenantId: string,
	): Promise<ReadonlySet<string>>;

	/** Same contract as `findValidHazardDriverIds`, against
	 * `hazard_type_custom_field_definition`. */
	findValidCustomFieldDefinitionIds(
		ids: readonly string[],
		tenantId: string,
	): Promise<ReadonlySet<string>>;
}
```

**Alternatives considered:**

1. **Command carries the valid-id sets, computed by the caller (route/presentation layer).**
   Rejected — pushes a tenant-scoping decision into presentation code, the opposite of "closed by
   construction" (`DEF-021`'s own framing, matching `3e` Decision 4's rationale for making the
   sets mandatory `create()` parameters in the first place). A use case that accepts
   caller-computed trust sets for its own membership check does not actually close the gap; it
   relocates it to a layer with less reason to get tenant scoping right.
2. **Always pass empty sets.** Rejected — trivially satisfies `HazardousEvent.create()`'s type
   signature but rejects every real `hazardDriverIds`/`customFieldValues` entry a caller supplies,
   making the use case unusable for its stated purpose.
3. **Chosen: a new port, queried by the use case itself**, scoped to exactly the ids the command
   references (`ids: readonly string[]` in, not "all ids for this tenant" out) — bounded query
   shape, same reasoning as Decision 2's rejection of a whole-table load.

Kept as one port with two methods (not two single-method ports) because both queries are the same
shape against sibling reference-data tables consumed by the same aggregate's `create()` call —
matching `IHazardousEventRepository`'s own precedent of grouping related-but-distinct concerns
(aggregate + spatial observations) behind one port, at a smaller scale.

**No adapter in this change.** `IHazardTaxonomyRepository` stays interface-only here; this narrows
but does not close `DEF-021` (Risks). A real adapter is deferred to a future Phase 5 intent.

### 4. Validation and write order

```
1. validHazardDriverIds   = await taxonomyRepository.findValidHazardDriverIds(command.hazardDriverIds, command.tenantId)
2. validCustomFieldDefinitionIds = await taxonomyRepository.findValidCustomFieldDefinitionIds(customFieldIds, command.tenantId)
3. HazardousEvent.create(props, validHazardDriverIds, validCustomFieldDefinitionIds)  -- pure; ValidationError propagates; updatedAt: null
4. hasCause = typeof command.causeId === "string" && command.causeId !== ""
5. IF hasCause:
     a. cause = await hazardousEventRepository.findById(command.causeId, command.tenantId)  -- NotFoundError propagates; same-tenant-only, final for this change (see below)
     b. edges = await causalChainRepository.findReachableEdgesFrom(newEvent.id)  -- always [] with a real adapter (Decision 1)
     c. assertCausalLinkDoesNotCreateCycle(edges, command.causeId, newEvent.id)  -- ConflictError/ValidationError propagate
6. saved = await hazardousEventRepository.save(newEvent)
7. workflowInstance = WorkflowInstance.create({ id: crypto.randomUUID(), entityId: saved.id, entityType: "HE", status: "DRAFT", ...all attribution null, createdAt: now, updatedAt: now })
8. savedWorkflow = await workflowRepository.save(workflowInstance)
9. IF hasCause:
     await causalChainRepository.saveEdge({ causeId: command.causeId, effectId: saved.id }, command.causalityExplanation ?? null)
10. logger.info({ msg: "hazardous_event.created", hazardousEventId: saved.id, tenantId: command.tenantId, hasCause })
11. return toHazardousEventDto(saved, savedWorkflow)
```

Ordering is fixed by data dependency and by Decision 5's failure-mode analysis, not by an arbitrary
choice. Steps 1-2 must precede step 3 because `create()` needs their resolved sets as parameters.
Step 5 (cause-existence and the cycle check) runs strictly after `create()` succeeds and strictly
before any `save()` call, so a missing cause or a rejected cycle never leaves a partial write.
`WorkflowInstance` initialization (steps 7-8) is placed **before** the edge write (step 9), not
after: `workflowInstance.entityId` only needs `saved.id` (available immediately after step 6), the
edge write has no dependent of its own, and Decision 5 below explains why this order minimizes the
worse of the two possible partial-write outcomes.

`newEvent.updatedAt` is `null` at construction (step 3), not `now` — `HazardousEventProps.updatedAt`
is `Date | null` precisely to distinguish "created, never since updated" from "updated," and
`HazardousEvent.test.ts`'s own happy-path fixture already uses `null` for a freshly-created
instance. `WorkflowInstance`'s `createdAt`/`updatedAt` are a different type (`Date`, never
`null`) and are both set to the same internally-computed `now` at step 7, matching `3a`'s own
convention.

**`causeId` tenant scoping (step 5a) — settled for this change, not left open:**
`DEF-012`'s register entry names "Before Phase 3c... or Phase 5" as when real cross-tenant access
control should land, and `3c`'s own design.md Risks note hands the scoping decision to "the next
intent" that calls `assertCausalLinkDoesNotCreateCycle` from a real use case — this change. The
underlying real-world need is genuine (a transboundary hazard, e.g. a flood in Nepal causing a
flood in India, is a legitimate cross-tenant cause/effect pair), so this is recorded as a
deliberate choice among two real alternatives, not an oversight:

- **Chosen: same-tenant-only.** `hazardousEventRepository.findById(command.causeId,
command.tenantId)` — reuses the existing port method, no new capability. A cross-tenant
  `causeId` throws `NotFoundError` even if the cause event genuinely exists in another tenant.
  Chosen because it requires no new port method and follows the same "closed by construction
  until proven safe to open" discipline `DEF-021` already established for
  `hazardDriverIds`/`customFieldValues` — not because cross-tenant causality is unwanted. It also
  happens to match the roadmap's own original `4b` test-tier line ("foreign-tenant parent is
  rejected"), cited here as a fact about what ships, not as the reason it was chosen. Shipping this
  does not resolve `DEF-012`; it leaves the transboundary-hazard use case unsupported until a
  future intent addresses that register entry directly.
- **Rejected for this change: a cross-tenant existence check** (e.g. a new, genuinely
  tenant-agnostic `IHazardousEventRepository.existsById(id): Promise<boolean>`, no `tenantId`
  parameter). This would be a stated exception to this codebase's own standing rule ("ALL queries
  must be scoped with `countryAccountsId`. Never fetch across tenants.") — a deliberate, narrow
  carve-out `DEF-012`'s real need would justify, but not one this change's own scope (a create-time
  causal link) forces a decision on. It also opens a minor information-disclosure surface (a
  tenant-A caller could probe arbitrary ids to learn whether they exist in _any_ tenant) that does
  not exist anywhere else in this codebase's tenant-scoped ports today, and would need a real
  answer to "does `causalityExplanation` or any future UI surface leak the cause event's own
  fields across tenants" — genuinely out of this change's scope to answer.

This is final for this change: a future intent resolving `DEF-012` for real (e.g. a per-record
sharing-grant mechanism, the register's own "leading candidate") would add a new port method and
name its standing-rule exception explicitly, not flip a flag here.

### 5. No transaction abstraction exists — three sequential writes, partial-failure risk accepted and registered; HazardousEvent -> WorkflowInstance -> edge minimizes the worse outcome

Steps 6, 8, and 9 above are three independent `await`s against three different ports. No
port-level or application-layer transaction abstraction wraps them — `app/db.server.ts`'s `Tx`
type is real but infrastructure-only, accepted by no port method anywhere (Context) — so there is
nothing this use case could pass through today even if it wanted to. Any of the three orderings
that respects the one real data dependency (edge needs
`saved.id`, `WorkflowInstance` needs `saved.id`; neither needs the other) leaves _some_ partial-write
risk — the question is which failure is more recoverable, not whether one exists.

**Chosen order's failure modes, both accepted and both worse-than-atomic but neither silent:**

- Step 6 succeeds, step 8 (`WorkflowInstance` save) then throws: a `HazardousEvent` exists with no
  `WorkflowInstance` — every future `ProcessWorkflowActionUseCase.execute()` call for that
  `entityId` throws `WorkflowInstanceNotFoundError` forever (`4a`'s own Decision 9), with no
  self-healing route back. This is the worst-case outcome, but it can now only be triggered by the
  _second_ write failing, not the third.
- Steps 6 and 8 succeed, step 9 (edge save) then throws (e.g. the cause event is deleted between
  step 5a and step 9, failing the edge's own FK constraint): the `HazardousEvent` and its `DRAFT`
  `WorkflowInstance` both exist and are fully usable through every normal workflow-action path; only
  the causal link is missing. This is recoverable by a future intent (`4c`'s own "if the parent is
  being set/changed, runs CausalChain's cycle check" scope, or a dedicated relink use case) without
  any data corruption — a strictly softer failure than the one above.

In both cases, `execute()` rejects with the underlying error unmodified (Decision 8) — the caller
sees the failure, and every write that already succeeded stays persisted; there is no compensating
delete of any kind. A caller that blindly retries the same logical request on rejection creates a
**second, distinct `HazardousEvent`** (a new `crypto.randomUUID()` id, not idempotent), potentially
leaving the first partially-written row behind — retried duplicate-creation is a real, separate
consequence of no application-layer transaction abstraction existing, not just the two bullets
above.

**Alternatives considered:**

1. **Add a unit-of-work port so all three writes commit atomically**, potentially building on
   `app/db.server.ts`'s existing `Tx` type. Rejected for this change specifically — it would
   require a new cross-cutting abstraction touching `IHazardousEventRepository`,
   `ICausalChainRepository`, and `IWorkflowRepository`'s contracts simultaneously (and would leak
   an infrastructure-layer Drizzle type into the application layer's port signatures if `Tx` itself
   were threaded through), well outside this change's file list, and no adapter exists for any of
   the three ports yet to make such an abstraction meaningful today. **Not a novel abstraction to
   invent, though** — confirmed via repo-wide grep (2026-09-24): legacy code already establishes
   exactly this pattern for multi-table writes (`tx.transaction(async (tx) => {...})`, e.g.
   `app/backend.server/models/event/hazardous_event_create_update.ts:365`,
   `app/backend.server/models/event.ts:930/1240`), and `Tx` is already threaded as a parameter type
   through ~95 files across `app/db/queries/`/`app/backend.server/models/`. A future intent
   threading `Tx` through the new CA ports' `save()` methods would be following this codebase's own
   established convention, not inventing one — worth citing directly when that intent is proposed.
2. **Edge before `WorkflowInstance`.** Rejected — it makes the _worse_ failure (no
   `WorkflowInstance`, unrecoverable through the normal workflow-action path) reachable from
   _either_ of the last two writes failing, instead of only the second one.
3. **Chosen: `HazardousEvent` -> `WorkflowInstance` -> edge**, and the risk that remains is accepted
   explicitly at this tier, same shape as `4a`'s own accepted lost-update risk (`DEF-024`). Tracked
   as new register entry `DEF-026` (next free id, noting `app/db.server.ts`'s `Tx` as the likely
   base for an eventual real fix), including the retry-creates-a-duplicate consequence above, not
   fixed silently and not left unstated. **Targeted for `5k`** (Phase 5, roadmap planning
   2026-09-24) — added to the roadmap specifically so both the atomicity gap and the legacy
   `tx.transaction()` precedent above aren't lost before that intent gets proposed.

### 6. `HazardousEventDto`: flat shape, includes the freshly-initialized workflow status

```ts
// application/dto/HazardousEventDto.ts
export interface HazardousEventDto {
	id: string;
	tenantId: string;
	specificHazardId: string;
	startDate: string;
	endDate: string;
	nationalSpecification: string;
	description: string;
	chainsExplanation: string;
	magnitude: string;
	recordOriginator: string;
	dataSource: string;
	hazardousEventStatus: HazardousEventStatus | null;
	specificHazardLocalName: string | null;
	specificHazardNationalName: string | null;
	apiImportId: string | null;
	createdByUserId: string | null;
	updatedByUserId: string | null;
	submittedByUserId: string | null;
	submittedAt: string | null;
	createdAt: string;
	updatedAt: string | null;
	hazardDriverIds: readonly string[];
	attachments: readonly HazardousEventAttachmentProps[];
	fieldValues: readonly HazardousEventFieldValueProps[];
	customFieldValues: readonly HazardousEventCustomFieldValueProps[];
	/** From the WorkflowInstance this use case just initialized — always "DRAFT" for this use
	 * case's own output, but the DTO's own shape is not narrowed to that one value: a future
	 * caller (4d's GetHazardousEventByIdUseCase, per the roadmap) reuses this same DTO shape for
	 * an entity that may be in any Status. Named workflowStatus, not status, to avoid colliding
	 * with the entity's own unrelated hazardousEventStatus (physical/temporal classification,
	 * 3b design.md Context). */
	workflowStatus: Status;
}

export function toHazardousEventDto(
	event: HazardousEvent,
	workflowInstance: WorkflowInstance,
): HazardousEventDto;
```

`Status` and `WorkflowInstance` are both imported from `validation-workflow` here too, same
cross-context dependency named and justified in Decision 11 — this DTO's mapper is the second
place in this change that import appears, not a separate decision.

Matches `WorkflowInstanceDto`'s "Date values as ISO 8601 strings" convention. `toHazardousEventDto`
takes both the saved `HazardousEvent` and the saved `WorkflowInstance` as separate parameters
(mapper stays a pure function of its inputs, no internal repository call) — the roadmap's own
test-tier expectation ("happy path returns DTO with a `DRAFT` status") is satisfied by passing
`savedWorkflow` from step 8 directly. Uses `saved`/`savedWorkflow` (steps 6/8's resolved values),
not the pre-save entities, matching `CreateNoticeUseCase`'s and `ProcessWorkflowActionUseCase`'s
own "the repository may enrich on write" rationale.

### 7. `CreateHazardousEventCommand` shape

```ts
export interface CreateHazardousEventCommand {
	tenantId: string;
	specificHazardId: string;
	startDate: string;
	endDate: string;
	nationalSpecification: string;
	description: string;
	chainsExplanation: string;
	magnitude: string;
	recordOriginator: string;
	dataSource: string;
	hazardousEventStatus: HazardousEventStatus | null;
	specificHazardLocalName: string | null;
	specificHazardNationalName: string | null;
	apiImportId: string | null;
	actingUserId: string;
	hazardDriverIds: readonly string[];
	attachments: readonly HazardousEventAttachmentProps[];
	fieldValues: readonly HazardousEventFieldValueProps[];
	customFieldValues: readonly HazardousEventCustomFieldValueProps[];
	/** Optional: if present as a non-empty string, the new event is persisted as the *effect* of
	 * this existing, already-persisted HazardousEvent. Omitted, `undefined`, or `""` -> treated as
	 * absent, no causal edge is created. */
	causeId?: string;
	/** Only meaningful when `causeId` is present; ignored otherwise. Maps to
	 * `hazardous_event_causality.causality_explanation` (nullable). */
	causalityExplanation?: string | null;
}
```

Omits `id`/`createdAt`/`updatedAt`/`submittedByUserId`/`submittedAt`/`updatedByUserId` — generated
or defaulted by the use case (`id` via `crypto.randomUUID()`; `createdAt` via a single internal
`new Date()`; `updatedAt: null`, per Decision 4 — a freshly-created event has not yet been
updated; attribution fields null at creation, matching `CreateNoticeCommand`'s own omission list).
`actingUserId` feeds `HazardousEvent.createdByUserId` only — `WorkflowInstance` at `DRAFT` requires
all attribution null (Context), so `actingUserId` is not passed to `WorkflowInstance.create()`.

### 8. Missing-cause and taxonomy-membership errors propagate unmodified — no new error class

`IHazardousEventRepository.findById()` already throws `NotFoundError` itself (does not resolve
`null`) — unlike `IWorkflowRepository.findByEntity()`, which is why `4a` needed a
null-to-typed-error translation (`WorkflowInstanceNotFoundError`) and this change does not.
`HazardousEvent.create()`'s own `ValidationError` (shape/membership) and
`assertCausalLinkDoesNotCreateCycle`'s `ConflictError`/`ValidationError` also propagate unmodified,
matching `CreateNoticeUseCase`'s and `ProcessWorkflowActionUseCase`'s own "errors from
entity/repository propagate unmodified" precedent (ADR-003).

### 9. Constructor parameter order

Matches `ProcessWorkflowActionUseCase`'s established order (logger first, then ports in the order
they're first used within `execute()`, per Decision 4's step numbering:
`taxonomyRepository` steps 1-2, `hazardousEventRepository` steps 5a/6, `workflowRepository` step
8, `causalChainRepository` steps 5b-c/9):
`constructor(private readonly logger: ILogger, private readonly taxonomyRepository:
IHazardTaxonomyRepository, private readonly hazardousEventRepository:
IHazardousEventRepository, private readonly workflowRepository: IWorkflowRepository, private
readonly causalChainRepository: ICausalChainRepository) {}`

### 10. Logging: one `hazardous_event.created` info-level event per successful `execute()`

Matches `ProcessWorkflowActionUseCase`'s `workflow_action.processed` precedent — one structured
`this.logger.info({ msg: "hazardous_event.created", hazardousEventId: saved.id, tenantId:
command.tenantId, hasCause })` call after step 9 succeeds, on the success path only (no
error-path logging is added here — thrown errors already propagate to whatever caller-side
logging exists, matching `CreateNoticeUseCase`'s own single-success-log shape; there is no
`notify()`-style best-effort side effect in this use case for a failure-path log to cover).
`hasCause` is computed once, near the top of `execute()`, as `typeof command.causeId === "string"
&& command.causeId !== ""` — the same non-empty-string test Decision 4/7 already define for
`causeId`'s presence — and that single computed value is reused for the step-5 branch, the step-9
branch, and this log line, so `""` can never be logged as "has a cause" while being treated as
absent everywhere else.

### 11. Cross-bounded-context dependency on `validation-workflow` is at the application layer, not the domain layer — allowed, and named explicitly

`HazardousEvent.ts` (domain layer) deliberately re-implements `isInvalidDate` locally rather than
importing `WorkflowInstance.ts`'s copy, "to avoid a cross-bounded-context import" (its own
comment). `CreateHazardousEventUseCase` (application layer) imports `WorkflowInstance`, `Status`,
and `IWorkflowRepository` from `validation-workflow` directly — this is not the same rule being
broken. The domain-layer constraint is about one bounded context's _entities_ depending on
another's; a _use case_, by definition, orchestrates across bounded contexts.

Checked against `ADR-009` (`_docs/decisions/ADR-009-clean-architecture-module-structure.md`), not
assumed: its Consequences section warns that "genuinely shared logic that two contexts both need
has to be deliberately placed in `app/infrastructure/`/`app/shared/`" — but that bullet is about
avoiding _duplicated_ logic living in two places, not about forbidding one bounded context from
depending on another's owned capability. `WorkflowInstance.entityType`'s own type,
`"HE" | "DE" | "DR"` (`3a`, unchanged since), is direct evidence that `validation-workflow` was
designed from the start as a single, shared bounded context multiple other domains are meant to
call into — not duplicated per domain, and not something ADR-009's shared-logic bullet is warning
against. `4a`'s own `ProcessWorkflowActionUseCase` already sits in `validation-workflow` and is
written to be "entity-type-agnostic... callable identically for HE/DE/DR," confirming the same
reading. This change's `CreateHazardousEventUseCase` is the **first real cross-context import**
between two domains' `application/` layers in this codebase — confirmed by a repo-wide grep for
`~/domains/<other-domain>`-style imports across `app/domains/**`: every existing cross-context-style
import found is self-referential (a domain importing its own `~/domains/<same-domain>/...` path via
the absolute alias, e.g. `notices/application/dto/NoticeDto.ts` importing
`~/domains/notices/domain/Notice`), none reaches into a _different_ domain's tree (`4a` itself
needed no such import, since it stayed entity-type-agnostic via the `EntityType` string). Named
explicitly, with this citation, so the SOLID and conventions review gates don't flag it as an
oversight or an ADR-009 violation.

## Risks / Trade-offs

- **[Risk] Three sequential, non-transactional writes (Decision 5)** — a `HazardousEvent` can be
  persisted with no `WorkflowInstance` behind it (unrecoverable through the normal workflow-action
  path) if the second write fails, or with no causal edge (recoverable by a future relink) if the
  third fails; a caller retrying on either failure creates a distinct, duplicate `HazardousEvent`
  rather than resuming the original. → Mitigation: accepted at this tier, ordered to make the
  unrecoverable failure the harder one to trigger (Decision 5), tracked as new `DEF-026`; no
  unit-of-work abstraction exists in this codebase to fix it today (same shape as `4a`'s accepted
  `DEF-024`).
- **[Risk] `DEF-021` — narrowed, not closed, by this change**: `IHazardTaxonomyRepository` gives
  `HazardousEvent.create()`'s mandatory valid-id-set parameters a real computation path and a real
  caller for the first time, but no adapter exists in this change to prove the query correct
  against real schema. → Mitigation: the fake-conformance test
  (`IHazardTaxonomyRepository.test.ts`) proves the interface's contract is implementable; a future
  adapter intent (Phase 5) is responsible for the real-schema verification and for closing this
  register entry.
- **[Risk] `DEF-012` (cross-tenant causality access control) is unaffected by this change's adapter
  scope, and stays open in the register** — this change's `causeId` validation ships
  same-tenant-only as a final decision (Decision 4), not a placeholder; `DEF-012`'s own real gap
  (no sharing/access-control mechanism for a legitimate cross-tenant cause/effect pair) is a
  separate, still-unresolved need that a future intent must address directly, most likely via the
  register's own "leading candidate" (per-record sharing grants). → Mitigation: the tenant-scoping
  choice itself is no longer ambiguous (Decision 4), so a future intent addressing `DEF-012` has a
  named, stable boundary to build against rather than an open question to first resolve.
- **[Risk] The create-time cycle check can never fail against a correct real adapter (Decision 1)** — its "cycle rejected" branch is only exercisable through `execute()` with a deliberately
  contrived fake `ICausalChainRepository`, never with real production data (this will remain true
  once a real adapter exists too, since a freshly-generated id genuinely has no edges).
  → Mitigation: both the contrived-fake propagation test and `3c`'s own direct
  `CausalChain.test.ts` coverage exist side by side (Decision 1); the asymmetry (unreachable with
  real data, constructible with a fake) is stated explicitly rather than left for a reviewer to
  notice on their own.
- **[Risk, resolved] DRAFT-init invariant hand-assembled by `execute()`**, found in SOLID review —
  every other transition encapsulates its own invariant, DRAFT didn't. → Fixed: added
  `WorkflowInstance.createDraft()` (delegates to `create()`); `execute()` uses it now.
- **[Risk, resolved] Cause-linking reused the raw `causeId` input, not the fetched entity's own
  id**, found in independent code review. → Fixed: `execute()` now uses `cause.id`; regression
  test added. The related TOCTOU gap (read-then-write between cycle check and `saveEdge`) isn't a
  new risk — roadmap decision #7 already accepted this exact race shape; cross-referenced there,
  not a duplicate register item.

## Migration Plan

None. Application-layer TypeScript only (two new port interfaces, one new use case, one new DTO)
— no schema change, no data migration, no feature flag, no infrastructure-layer adapter in this
change. Inert until a future route/handler intent calls `CreateHazardousEventUseCase`, exactly as
`4a`'s `ProcessWorkflowActionUseCase` remains inert until its own future caller exists.

## Open Questions

None remaining for this change. Both questions the original version of this design raised are
resolved by direct user decision:

- **`causeId` tenant scoping** (same-tenant-only vs. cross-tenant) — settled as same-tenant-only,
  final for this change; folded into Decision 4's own rationale. `DEF-012` itself stays open in
  the register (Risks).
- **Adapter scope** (interface-only vs. real adapter in this change) — settled as interface-only: a
  real adapter for `ICausalChainRepository` and `IHazardTaxonomyRepository` is deferred to a new
  Phase 5 intent, per the standing "one OpenSpec intent at a time" preference and "no exceptions to
  phased gates." (An earlier revision of this change had folded real, PGlite-tested adapters into
  this same change per a direct user decision; that decision has since been explicitly reversed by
  the user, and this design reflects the reversal.)
