## Context

See proposal.md - Why. All six use cases, all four repository adapters
(`DrizzleHazardousEventRepository`, `DrizzleCausalChainRepository`,
`DrizzleHazardTaxonomyRepository`, `DrizzleDivisionRepository`), and
`DrizzleTransactionRunner` already exist and are independently unit-tested. This
change adds the NestJS module that wires them together.

**2026-10-22 scope correction.** Tasks 1-9 of the original tasks.md landed with one
design flaw, found by this change's own SOLID review: widening `ValidationWorkflowModule`'s
`exports` to include the full `WORKFLOW_REPOSITORY` token exposed `IWorkflowRepository`'s
write methods (`insert`, `update`, `deleteByEntity`) across the bounded-context boundary,
not just the two read methods five of the six use cases actually call. Confirmed by
grepping `app/domains/hazardous-events/application/use-cases/*.ts` for
`this\.workflowRepository\.`:

| Use case | Call | Read/Write |
|---|---|---|
| `CreateHazardousEvent.ts:185` | `workflowRepository.insert(workflowInstance, tx)` | **Write** |
| `DeleteHazardousEvent.ts:120` | `workflowRepository.deleteByEntity(command.id, "HE", tx)` | **Write** |
| `GetHazardousEventById.ts:32` | `workflowRepository.findByEntity(...)` | Read |
| `ListHazardousEvents.ts:50` | `workflowRepository.findByEntityIds(...)` | Read |
| `UpdateHazardousEvent.ts:189` | `workflowRepository.findByEntity(...)` | Read |

`IWorkflowRepository.update()` is called by **no** HE use case. This is a pre-existing
bounded-context violation introduced by Phase 4 (`4b`/`4f`, already archived and shipped) —
`5g`'s own wiring just made it externally visible for the first time, since NestJS exports
are all-or-nothing per module. The `EventCausalityModule`/`EVENT_CAUSALITY_REPOSITORY`
precedent cited by the original design does not actually support exporting all five methods
of `IWorkflowRepository`: that port has one method, `countReferences`, and it is read-only.

Per the user's explicit framing: this is the first true inter-bounded-context module wiring
in this codebase's Clean Architecture refactor, so whatever pattern lands here becomes the
de facto precedent for every future domain-to-domain dependency. The user decided to fix
this properly now, inside this same change, rather than ship with a documented risk.

Confirmed by reading every constructor directly (not inferred from the roadmap
text, which omits these dependencies) — **this table supersedes the one in the original
version of this document**, reflecting the corrected dependency shape:

| Use case | Constructor params (in order) |
|---|---|
| `CreateHazardousEventUseCase` | `ILogger`, `IHazardTaxonomyRepository`, `IHazardousEventRepository`, `Pick<InitializeWorkflowInstanceUseCase, "execute">`, `ICausalChainRepository`, `ITransactionRunner` |
| `UpdateHazardousEventUseCase` | `ILogger`, `IHazardTaxonomyRepository`, `IHazardousEventRepository`, `Pick<GetWorkflowInstanceByEntityUseCase, "execute">`, `ICausalChainRepository`, `Pick<RecordSpatialObservationUseCase, "execute">`, `ITransactionRunner` |
| `GetHazardousEventByIdUseCase` | `ILogger`, `IHazardousEventRepository`, `Pick<GetWorkflowInstanceByEntityUseCase, "execute">` |
| `ListHazardousEventsUseCase` | `ILogger`, `IHazardousEventRepository`, `Pick<ListWorkflowInstancesByEntityIdsUseCase, "execute">` |
| `DeleteHazardousEventUseCase` | `ILogger`, `IHazardousEventRepository`, `IEventCausalityRepository`, `ICausalChainRepository`, `Pick<DeleteWorkflowInstanceUseCase, "execute">`, `ITransactionRunner` |
| `RecordSpatialObservationUseCase` | `IHazardousEventRepository`, `IDivisionRepository` (unchanged — no logger, no `ITransactionRunner`; caller threads an optional `tx` through `execute()`) |

This table is the authoritative source for each use case's `useFactory`/`inject`
array.

## Goals / Non-Goals

**Goals:**

- Make all six Phase 4 use cases resolvable from `getAppContext()` via `CoreModule`.
- Register every adapter a use case's constructor actually requires.
- Keep all four hazardous-events repository tokens hidden (no consumer outside
  `HazardousEventsModule` needs them directly today).
- **Corrected goal, replacing the original "widen `ValidationWorkflowModule`'s exports
  minimally" goal:** keep `WORKFLOW_REPOSITORY` and `NOTIFICATION_PORT` both unexported from
  `ValidationWorkflowModule`, restoring `ca-validation-workflow-module`'s original Decision 4
  in full. Instead, validation-workflow exports four small use cases
  (`InitializeWorkflowInstanceUseCase`, `DeleteWorkflowInstanceUseCase`,
  `GetWorkflowInstanceByEntityUseCase`, `ListWorkflowInstancesByEntityIdsUseCase`) that
  `HazardousEventsModule` depends on instead — the owning bounded context builds and
  persists (or reads) its own aggregate; a foreign context never reaches its repository
  port directly.
- Preserve the existing atomicity guarantee: `CreateHazardousEventUseCase`'s and
  `DeleteHazardousEventUseCase`'s HE-row-plus-workflow-row writes continue to commit or
  roll back together inside the same `transactionRunner.run()` call.

**Non-Goals:**

- No controller, guard, or HTTP route. Same "DI-only" status as `ValidationWorkflowModule`
  and `EventCausalityModule` today.
- No change to any of the six use cases' or four repository adapters' *observable*
  behaviour — every thrown error, returned DTO shape, and log event is unchanged. (The
  original version of this document said "no change to any of the six use cases" outright;
  that is no longer accurate — five of the six use cases get a constructor-dependency swap
  and a single internal call-site change each, which is real, deliberate, user-accepted
  scope, not a pure-DI change any more. See the "Atomicity" section below for why this is
  safe.)
- No change to `EventCausalityModule` or `EVENT_CAUSALITY_REPOSITORY`'s already-exported
  status — out of scope for this change (see "A durable rule for future cross-domain
  wiring" below for why this is flagged, not silently left as a double standard).
- No domain events, eventual consistency, or outbox pattern. Explicitly ruled out by the
  user: any of these would break the atomicity guarantee this change is required to
  preserve. Not re-raised as an alternative anywhere in this document.
- No change to `NOTIFICATION_PORT`'s hidden status in `ValidationWorkflowModule`.

## Decisions

### Decision 1 — Four new repository token files

Unchanged by the scope correction. `app/domains/hazardous-events/infrastructure/` has
zero `*Token.ts` files before this change; `IHazardousEventRepository`,
`ICausalChainRepository`, `IHazardTaxonomyRepository`, and `IDivisionRepository` each need
one, mirroring `WorkflowRepositoryToken.ts`'s exact shape (Symbol-based
`InjectionToken<T>`, kept out of the port file itself):

- `HazardousEventRepositoryToken.ts` → `HAZARDOUS_EVENT_REPOSITORY`
- `CausalChainRepositoryToken.ts` → `CAUSAL_CHAIN_REPOSITORY`
- `HazardTaxonomyRepositoryToken.ts` → `HAZARD_TAXONOMY_REPOSITORY`
- `DivisionRepositoryToken.ts` → `DIVISION_REPOSITORY`

Already implemented (tasks.md Section 1); not touched by this correction.

### Decision 2 — TRANSACTION_RUNNER: first real consumer, registered per-module

Unchanged by the scope correction. Already implemented (tasks.md Section 2).

### Decision 3 — HazardousEventsModule imported but not exported from CoreModule

Unchanged by the scope correction. Already implemented (tasks.md Section 7).

### Decision 4 — Corrected: validation-workflow exports use cases, not WORKFLOW_REPOSITORY

**This decision replaces the original Decision 4** ("Widening ValidationWorkflowModule's
exports: what changes in its own test"), which is reverted in full. The rule driving this
correction, stated explicitly so it is reusable for every future cross-domain dependency in
this codebase:

> A write operation crossing a bounded-context boundary goes through the owning context's
> own exported use case, which builds and persists its own aggregate. A repository port is
> never exported directly for cross-domain injection.

Four new use cases are added to `app/domains/validation-workflow/application/use-cases/`,
matching `ProcessWorkflowActionUseCase`'s own file-naming convention (no "UseCase" suffix
on the filename) and each taking only `IWorkflowRepository` as a constructor dependency
(no `ILogger` — see "Logging" below):

- **`InitializeWorkflowInstance.ts` → `InitializeWorkflowInstanceUseCase`**
  Replaces `CreateHazardousEventUseCase`'s inline `WorkflowInstance.createDraft(...)` +
  `workflowRepository.insert(...)` pair. Command:
  `{ entityId: string; entityType: EntityType; tx?: Tx }`. Generates its own `id`
  (`crypto.randomUUID()`) and `now` (`new Date()`) internally — the same two values
  `CreateHazardousEventUseCase` generates inline today, just relocated. Returns
  `Promise<WorkflowInstance>` (the domain entity — see "Return type" below).

- **`DeleteWorkflowInstance.ts` → `DeleteWorkflowInstanceUseCase`**
  Replaces `DeleteHazardousEventUseCase`'s inline `workflowRepository.deleteByEntity(...)`
  call. Command: `{ entityId: string; entityType: EntityType; tx?: Tx }`. Returns
  `Promise<void>`, idempotent (matches `IWorkflowRepository.deleteByEntity`'s own
  documented contract: "resolves normally when no matching instance exists"). Named
  `Delete`, not `Retire` — the operation is a hard delete of the row, and "retire" would
  wrongly suggest a status transition (e.g. an `ARCHIVED` status) that does not exist in
  this domain's `Status` enum.

- **`GetWorkflowInstanceByEntity.ts` → `GetWorkflowInstanceByEntityUseCase`**
  Proxies `IWorkflowRepository.findByEntity`. Query:
  `{ entityId: string; entityType: EntityType }`. Returns
  `Promise<WorkflowInstance | null>`. Replaces the direct call in
  `GetHazardousEventByIdUseCase` and `UpdateHazardousEventUseCase`.

- **`ListWorkflowInstancesByEntityIds.ts` → `ListWorkflowInstancesByEntityIdsUseCase`**
  Proxies `IWorkflowRepository.findByEntityIds`. Query:
  `{ entityIds: string[]; entityType: EntityType }`. Returns
  `Promise<WorkflowInstance[]>`. Replaces the direct call in `ListHazardousEventsUseCase`.

All four are registered in `ValidationWorkflowModule.server.ts` via `useFactory`/`inject`,
mirroring `ProcessWorkflowActionUseCase`'s own existing pattern exactly (only the
dependency list is shorter — `[WORKFLOW_REPOSITORY]` only, no `NOTIFICATION_PORT`), and all
four are added to `exports` alongside the unchanged `ProcessWorkflowActionUseCase`.
`WORKFLOW_REPOSITORY` and `NOTIFICATION_PORT` stay out of `exports`, restoring the original
`ca-validation-workflow-module` Decision 4 wording verbatim (confirmed against
`openspec/specs/validation-workflow-module-wiring/spec.md`'s own archived text).

**Why two use cases for writes but two for reads, not one "WorkflowInstanceQuery" use case
covering both reads:** matches `GetHazardousEventByIdUseCase`/`ListHazardousEventsUseCase`'s
own existing convention of one use case per distinct query shape (a single-entity lookup and
a batched lookup are genuinely different operations with different callers), rather than
introducing a shape this domain doesn't otherwise use.

**Read-side alternative considered and rejected:** export a second, narrower token typed as
`Pick<IWorkflowRepository, "findByEntity" | "findByEntityIds">` pointing at the same
`DrizzleWorkflowRepository` singleton `WORKFLOW_REPOSITORY` already resolves to. Rejected
for two reasons. First, it still exports a view of the repository port itself — at runtime
it is the exact same `DrizzleWorkflowRepository` instance, just narrowed at the TypeScript
type layer only; it does not actually satisfy the rule stated above ("a repository port is
never exported directly for cross-domain injection"), it just makes the violation harder to
see. Second, it is less consistent with this codebase's own established convention than two
small query use cases are — every other cross-domain or same-domain collaborator in this
change's own use-case table (`RecordSpatialObservationUseCase` included) is a use case, not
a `Pick<>`'d port.

**Acknowledged, not resolved here — flagged in "A durable rule for future cross-domain
wiring" below:** `EventCausalityModule` already exports `EVENT_CAUSALITY_REPOSITORY`
directly (no use case of its own wraps it), and this change's own `DeleteHazardousEventUseCase`
consumes it that way, unchanged. The rule above is not retroactively applied to that export —
doing so is out of scope for this change and not something this spec-writer pass decides
unilaterally.

### Decision 5 — Dependency type: `Pick<NewUseCase, "execute">`, matching existing precedent

Each of the five HE use cases depends on one of the four new use cases through
`Pick<ThatUseCase, "execute">`, exactly matching the existing, already-shipped pattern
`UpdateHazardousEventUseCase` uses for `RecordSpatialObservationUseCase`. This is a
same-shape dependency (a collaborator use case, not a repository port) in both cases, so
the same typing convention applies without introducing a new one.

### Decision 6 — Return type: domain entity, not a DTO

The four new use cases return `WorkflowInstance`/`WorkflowInstance | null`/
`WorkflowInstance[]`/`void` — the same domain-entity shapes `IWorkflowRepository` already
returns today — not a `WorkflowInstanceDto`. This is a deliberate minimal-diff choice: HE
already imports and consumes the `WorkflowInstance` domain entity directly today (confirmed:
`CreateHazardousEvent.ts` line 14 imports it from
`~/domains/validation-workflow/domain/WorkflowInstance`, and `toHazardousEventDto`,
`toHazardousEventDetailDto`, and `toHazardousEventListItemDto` all take a `WorkflowInstance`
parameter and read only its `.status` field). Returning the same entity type from the new
use cases means these three existing DTO mappers need zero signature changes.

**Alternative considered:** return `WorkflowInstanceDto` (matching `ProcessWorkflowActionUseCase`'s
own return type), which would be a stricter form of encapsulation at the boundary. Rejected
for this change — it would additionally require widening all three DTO mappers' parameter
types to a structural `{ status: Status }` shape (or to `WorkflowInstanceDto` itself) purely
to satisfy a boundary-purity goal with no corresponding behaviour change, touching three more
files and their own tests for no observable benefit. The entity-crossing precedent already
exists in this codebase (`IWorkflowRepository`'s own return type); this change relocates
*where* the call happens, not *what* crosses the boundary. Revisit if a future change needs
`WorkflowInstance`'s internal fields hidden from HE for a concrete reason.

### Decision 7 — Logging: the four new use cases do not log their own success

Neither `InitializeWorkflowInstanceUseCase` nor `DeleteWorkflowInstanceUseCase` takes an
`ILogger` or logs on success — not because they're reads (`GetWorkflowInstanceByEntityUseCase`
and `ListWorkflowInstancesByEntityIdsUseCase` don't log either, for a different reason below),
but because of the mandatory atomicity constraint: both run inside the caller's own open
`transactionRunner.run()` block, so a log emitted at that point would describe a write that
has not committed yet and may still roll back. This is exactly `RecordSpatialObservationUseCase`'s
own precedent (design.md addendum to its Decision 6: "Moved here from
RecordSpatialObservationUseCase ... logs only after this use case's own outer transaction has
committed, not mid-transaction") — not `ProcessWorkflowActionUseCase`'s, which *is* a
top-level, directly-routed entry point and therefore safe to log from immediately.

The two read-side use cases (`GetWorkflowInstanceByEntityUseCase`,
`ListWorkflowInstancesByEntityIdsUseCase`) also take no `ILogger`. They are, like
`RecordSpatialObservationUseCase`, collaborator-only use cases never reached directly by a
route — their callers (`GetHazardousEventByIdUseCase`, `ListHazardousEventsUseCase`,
`UpdateHazardousEventUseCase`) already log one composite "fetched"/"listed"/"updated" event
per top-level call today. Giving the two read-side use cases their own log line would add
new per-sub-fetch log noise that doesn't exist today, with no corresponding ask from the
user — rejected as unrequested scope, not deferred.

### Decision 8 — Clock and id: InitializeWorkflowInstanceUseCase computes its own `now`/`id`

Before this change, `CreateHazardousEventUseCase` generated one `now = new Date()` and fed
it to both the `HazardousEvent`'s own `createdAt` and (via the same reading) the
`WorkflowInstance.createDraft(...)` call; it also generated the workflow instance's `id` via
`crypto.randomUUID()` inline. After this change, `InitializeWorkflowInstanceUseCase`
generates both its own `now` and its own `id` internally — `CreateHazardousEventUseCase` no
longer threads its own `now`/id into the command. This is a real, accepted behaviour change:
the `HazardousEvent.createdAt` and `WorkflowInstance.createdAt`/`updatedAt` timestamps, which
previously came from one clock reading, may now differ by microseconds. Verified safe:
`CreateHazardousEvent.test.ts`'s existing assertion at the "initializes and persists a
WorkflowInstance at DRAFT" test only checks `savedWorkflow.createdAt` equals
`savedWorkflow.updatedAt` (the workflow row's own internal self-consistency) — nothing in
the existing test suite asserts the `HazardousEvent`'s and the `WorkflowInstance`'s
timestamps are equal to each other, so no existing assertion needs to change because of this.

### Decision 9 — No HE-specific input assertions imported into validation-workflow

The four new use cases do not call HE's own `assertNonEmptyString` helper (it lives in
`app/domains/hazardous-events/application/`, and importing it into
`app/domains/validation-workflow/application/` would create the reverse cross-context
dependency this whole correction exists to avoid). They trust their caller's `entityId`/
`entityType`, exactly as `ProcessWorkflowActionUseCase` already trusts its own caller's
`entityId`/`entityType` without re-validating them.

## Atomicity

**Mandatory constraint, verified explicitly, not assumed:** `CreateHazardousEventUseCase`
and `DeleteHazardousEventUseCase` both run their workflow-instance call inside
`transactionRunner.run()`, so the HE row and the workflow row commit or roll back together
(`ca-persistence-unit-of-work`/`5k`'s own guarantee). Both `InitializeWorkflowInstanceUseCase`
and `DeleteWorkflowInstanceUseCase` accept and thread an optional `tx?: Tx` on their own
command — `CreateHazardousEventUseCase` and `DeleteHazardousEventUseCase` pass their own
open `tx` through unchanged, exactly as `UpdateHazardousEventUseCase` already threads
`command.tx` into `RecordSpatialObservationUseCase`'s own command
(`RecordSpatialObservation.ts`'s own doc comment: "Participates in a caller's own open
transaction when present"). No domain event, eventual-consistency mechanism, or outbox is
considered anywhere in this document — ruled out explicitly by the user as something that
would silently break this guarantee.

**The specific regression this correction could introduce, and how it's tested:** the
existing rollback-proof integration test in `CreateHazardousEventUseCase.test.ts` (the
"stubbed rejection on the causal edge save" test) only asserts on the `hazardousEventTable`
row count and the causal-chain edge set after rollback — it does not check the
`workflow_instance` table at all, so it would not catch `InitializeWorkflowInstanceUseCase`
forgetting to pass `tx` through to `workflowRepository.insert`. Similarly,
`DeleteHazardousEventUseCase.test.ts` has no test at all that fails a write *after*
`deleteByEntity` has already run (its one existing rollback test stubs `deleteByEntity`
itself, which proves nothing about whether `DeleteWorkflowInstanceUseCase` threads `tx`
correctly when a *later* step fails). tasks.md adds the missing assertions and the missing
test rather than treating this as an implicit casualty of the refactor — see tasks.md's
dedicated atomicity-proof tasks.

## A durable rule for future cross-domain wiring

**Recommendation, not a decision made here** — the user asked this to be surfaced, not
decided unilaterally. Decision 4 states a rule ("a write operation crossing a
bounded-context boundary goes through the owning context's own exported use case; a
repository port is never exported directly for cross-domain injection") that this change
follows for `ValidationWorkflowModule`, but does not retroactively apply to
`EventCausalityModule`'s existing `EVENT_CAUSALITY_REPOSITORY` export. Two honest ways to
record it, for the user to choose between (not decided here):

1. **State the rule with an explicit, narrow carve-out**: a bounded context with no use
   case of its own may still export a single-method, read-only repository port directly
   (`EventCausalityModule`'s own current shape); any context that has, or later gains, a
   second method or a write method on its port must route all cross-domain consumption
   through its own use case instead, never through the port.
2. **Apply the rule uniformly** and flag `EventCausalityModule`/`EVENT_CAUSALITY_REPOSITORY`
   as a follow-up: wrap `countReferences` in a small `CountEventCausalityReferencesUseCase`
   of its own, exported in place of the port, so every cross-domain dependency in the
   codebase follows the identical shape with no exception to remember.

This change does not edit `EventCausalityModule` or any ADR file, and does not record
either option above as a durable rule anywhere — that edit, if wanted, is the user's own
call, made via a future change. (This change does touch the roadmap doc, but only to
narrate this scope correction in `5g`'s own section — not to add the durable rule itself.)

## Risks / Trade-offs

- **[Risk, resolved by this correction]** The original version of this change widened
  `ValidationWorkflowModule`'s exports to the full `WORKFLOW_REPOSITORY` token, exposing
  three write methods no HE use case needed, across the first real bounded-context boundary
  in this codebase. → **Mitigation:** this correction (Decision 4) replaces that export with
  four narrow use cases; `WORKFLOW_REPOSITORY` reverts to unexported.
- **[Risk]** `useFactory`/`inject` positional-array mismatch for `CreateHazardousEventUseCase`
  (6 params) and `UpdateHazardousEventUseCase` (7 params) is not caught by `tsc` — the inject
  order in `HazardousEventsModule.server.ts` must mirror each constructor's declared order
  exactly (this risk entry, not a numbered Decision, is the citation for that requirement). →
  **Mitigation:** the existing behavioral round-trip test (tasks.md Section 5, re-verified
  after this correction's rewiring).
- **[Risk, tooling]** Per `ca-validation-workflow-module`'s own precedent, Stryker produces
  0 mutants on `@Module()`-decorated files and `Symbol()` description strings — a confirmed
  structural exclusion, not a quality gap in this module's own files. No DEF entry added
  (per standing instruction not to register new Stryker-tooling-limitation DEF items); noted
  here instead.
- **[Trade-off]** `RecordSpatialObservationUseCase` is exported even though its only current
  caller is same-module (`UpdateHazardousEventUseCase`) — consistent with "export every Phase
  4 use case," per the original (pre-correction) version of this document; unchanged by this
  correction and not restated as a numbered Decision here, since neither export shape changed.
- **[Open, flagged for the user]** Whether to record Decision 4's rule durably (roadmap
  cross-cutting section or an ADR-009 amendment) so every future domain's module-wiring
  change inherits it automatically — see "A durable rule for future cross-domain wiring"
  above. Not decided in this document.

## Migration Plan

No data migration. Deployment is a pure code change. Rollback is reverting the commit — no
schema or running-state impact. `workflow_instance`'s existing unique index on
`(entity_id, entity_type)` (`ca-validation-workflow-module`, archived) is unchanged.

## Open Questions

None left unresolved as a judgment call — the one open item (the durable-rule
recommendation above) is explicitly surfaced for the user's own decision, not left
ambiguous or silently resolved by this document.
