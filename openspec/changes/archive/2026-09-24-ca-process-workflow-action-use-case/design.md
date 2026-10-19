## Context

See proposal.md - Why. This covers only what shapes the use case / ports design.

Ground truth for this design (all read in full before writing this document):

- `app/domains/validation-workflow/domain/WorkflowInstance.ts` — the five real transition
  methods (`submit`, `validate`, `approve`, `requestRevision`, `publish`), each taking
  `{ userId, now }` and returning a new instance; invalid-from-status throws
  `ConflictError`; `REJECTED` is unreachable by design.
- `app/domains/validation-workflow/application/ports/IWorkflowRepository.ts` — real
  signatures: `findByEntity(entityId, entityType): Promise<WorkflowInstance | null>`,
  `findByEntityIds(entityIds, entityType): Promise<WorkflowInstance[]>`,
  `save(instance): Promise<WorkflowInstance>`. No `tenantId` parameter anywhere.
- `openspec/changes/archive/2026-09-12-ca-workflow-instance-entity/design.md` — Decision 1
  (status graph + attribution table), Decision 1's "Resolved with the user" note
  (`'validate'`'s two-call composition), Decision 3 (`ConflictError` vs `ValidationError`
  split), Decision 6 (no-tenantId rationale), Risks (lost-update gap, `save()` return-value
  ambiguity, `ValidationError`-on-invalid-`now` open decision — all explicitly left for
  this change to resolve).
- `_docs/refactoring-plan/deferred-items-register.md` DEF-022 — `reject()`/`REJECTED` out
  of scope, resolved with the user 2026-09-23.
- `app/domains/notices/application/use-cases/CreateNotice.ts` /
  `UpdateNotice.ts` — the Command/UseCase/DTO precedent this change follows: a
  `<Verb><Noun>Command` interface, a `<Verb><Noun>UseCase` class with constructor-injected
  ports and an `execute(command)` method, `now` computed inline via `new Date()` (no
  `IClock` port exists anywhere in this codebase — confirmed by repo-wide grep), errors
  from the entity/repository propagated unmodified.
- `app/domains/notices/application/fetchOwnedNotice.ts` /
  `app/domains/notices/application/errors/NoticeErrors.ts` — the null-to-typed-error
  translation precedent (`NotFoundError` → `NoticeNotFoundError`).
- `app/domains/validation-workflow/infrastructure/workflowNotificationTable.ts` and
  `ca-workflow-schema`'s design.md Decision 11 — confirms `INotificationPort` is genuinely
  new (no adapter exists), `channel` is deliberately unconstrained pending this port's
  decision, and recipient resolution is explicitly a _later_ intent's job (roadmap
  line ~1440's future "email-based INotificationPort adapter" intent, not this one).

## Goals / Non-Goals

**Goals:**

- One `ProcessWorkflowActionUseCase`, callable identically for `HE`/`DE`/`DR`, that maps
  four named actions onto `WorkflowInstance`'s real transition methods with no
  use-case-level status-guard logic of its own — the entity's `ConflictError` is the only
  source of transition-rejection.
- A command shape for `'validate'` that represents the reviewer's approve/hold decision
  without reintroducing `'reject'`/`REJECTED` vocabulary anywhere (per DEF-022).
- Explicit, decided answers to every question `3a`'s design.md left open for this change
  (lost-update handling, `save()`'s return value, the `ValidationError`-on-`now` question,
  tenancy precondition) — none deferred silently.

**Non-Goals:**

- No `reject()` action, no `REJECTED` handling of any kind (DEF-022; user-confirmed
  2026-09-23).
- No `INotificationPort` adapter (email or otherwise) — interface only, matching
  `IWorkflowRepository`'s own interface-now/adapter-later split. The adapter is a
  separately-scoped future intent (roadmap line ~1440-1448).
- No persistence for `workflow_history` or `workflow_notification` rows. Those tables
  exist (`ca-workflow-schema`, archived) but no repository port for either is in this
  change's file list, and none is implied by the roadmap's 4a file list. `INotificationPort`
  is an application-layer event notification, not a `workflow_notification`-row writer —
  whatever adapter eventually implements it may choose to write that table, but this change
  does not assume or require it to.
- No change to `IWorkflowRepository.ts`'s contract (see Decision 5 below — the lost-update
  gap is accepted, not fixed, at this tier).
- No resolution of DEF-010 (direct-publish-without-prior-validation policy) — see
  Decision 6. This change narrows its blast radius but does not close it; that remains a
  PM decision.
- No tenant-scoping logic added anywhere in this use case (see proposal.md - Impact -
  Security).

## Decisions

### 1. Corrected action set and entity-method mapping

| Command `action`      | Entity method(s) called                                                    | Allowed-from (entity's own guard) |
| --------------------- | -------------------------------------------------------------------------- | --------------------------------- |
| `'submit-validation'` | `submit({ userId, now })`                                                  | `DRAFT`, `REVISION_REQUESTED`     |
| `'validate'`          | `validate({ userId, now })`, then conditionally `approve({ userId, now })` | `SUBMITTED` (both calls)          |
| `'publish'`           | `publish({ userId, now })`                                                 | `APPROVED`                        |
| `'return'`            | `requestRevision({ userId, now })`                                         | `SUBMITTED`                       |

`'reject'` is removed from the roadmap's original five-action list per DEF-022. No
use-case-level status guard is added anywhere in this table — an action attempted from a
disallowed status calls straight through to the entity method, which throws `ConflictError`
itself (Decision 3, below), exactly matching the roadmap's own framing ("an invalid
transition... propagates the entity's own rejection"). Example: `'publish'` called while
the instance is still `DRAFT` reaches `WorkflowInstance.publish()`, whose `allowedFrom`
guard is `["APPROVED"]` — it throws `ConflictError` with no special-casing in the use case.

### 2. `ProcessWorkflowActionCommand` shape: discriminated union, `alsoApprove: boolean` only on the `'validate'` variant

```ts
interface ProcessWorkflowActionCommandBase {
	entityId: string;
	entityType: EntityType; // "HE" | "DE" | "DR", re-exported from WorkflowInstance.ts
	actingUserId: string;
}

export type ProcessWorkflowActionCommand =
	| (ProcessWorkflowActionCommandBase & { action: "submit-validation" })
	| (ProcessWorkflowActionCommandBase & {
			action: "validate";
			/** true: also call approve() after validate(), composing 3a's resolved
			 * two-call 'validate' action in one command. false: validate() only —
			 * status stays SUBMITTED, held for a later decision. Never "reject"/
			 * "decline" — REJECTED stays unreachable (DEF-022); this field only
			 * decides whether approve() is called in the same execute() call. */
			alsoApprove: boolean;
	  })
	| (ProcessWorkflowActionCommandBase & { action: "publish" })
	| (ProcessWorkflowActionCommandBase & { action: "return" });
```

**Alternatives considered:**

1. **Flat optional field on every variant** (e.g. `alsoApprove?: boolean` outside the
   union). Rejected — it becomes representable (and needs a runtime no-op guard) on
   `'submit-validation'`/`'publish'`/`'return'`, where it means nothing. A discriminated
   union makes that state unrepresentable at the type level instead of guarding it at
   runtime.
2. **Split into two actions** (`'validate-approve'` / `'validate-hold'`, or similar).
   Rejected — the corrected action set is fixed at four actions
   (`'submit-validation'|'validate'|'publish'|'return'`); this alternative silently
   reopens that count without a stated reason to.
3. **A separate top-level `'approve'` action**, called independently of `'validate'`.
   Rejected on two grounds: (a) it directly contradicts `3a`'s resolved composition
   ("Phase 4a's `'validate'` use-case action calls this entity's `validate()`, then...
   separately calls `approve()`" — one action, not two independently-callable ones), and
   (b) it reopens DEF-010 in the wrong direction — under the corrected four-action set, `approve()`
   is only ever reachable through `'validate'`'s `alsoApprove: true` branch (see Decision
   6); a standalone `'approve'` action would let a caller reach `APPROVED` without this use
   case ever having called `validate()` first, which Decision 6 below specifically avoids.
4. **Chosen: discriminated union with `alsoApprove: boolean` on the `'validate'` variant
   only.** Illegal states unrepresentable, no runtime guard needed, four actions preserved,
   and the field's boolean shape sidesteps `reject`/`decline` vocabulary entirely (per
   DEF-022's own caution against implying a decided meaning for a rejection concept that
   isn't agreed yet).

### 3. `ConflictError` propagates unmodified; no use-case-level re-wrapping

Matches `3a`'s own Decision 3 framing and `CreateNoticeUseCase`'s "errors propagate
unmodified" precedent (ADR-003 `DomainError` hierarchy). `ProcessWorkflowActionUseCase`
does not catch `ConflictError` from any entity method call — it propagates directly to the
caller. No use case ever calls `save()` or the notification port after a `ConflictError`.

### 4. `save()`'s resolved value — not the pre-save instance — feeds both notification and the returned DTO

Matches `CreateNoticeUseCase`'s "WHY use `saved`, not `notice`" comment: the repository may
enrich the entity on write (`3a` design.md Risks explicitly leaves this open — "doesn't say
whether the resolved instance is the same object passed in or a fresh reconstitution").
`ProcessWorkflowActionUseCase` always uses `IWorkflowRepository.save()`'s resolved value —
never the locally-transitioned instance — for the `INotificationPort.notify()` payload and
for `toWorkflowInstanceDto()`.

### 5. Lost-update race on `save()`: accepted, not fixed, at this tier — explicit concurrent-callers scenario

`3a`'s design.md already flags this as an accepted risk ("`UNIQUE(entityId, entityType)`
only prevents two callers from creating the first instance... it does not stop two callers
who each `findByEntity` → transition → `save()` on an already-existing row from silently
overwriting each other"). Two options were weighed:

- **Tighten `IWorkflowRepository.save()`'s contract** (e.g. optimistic locking, a
  `ConflictError` on stale write). Rejected for this change specifically because it would
  require editing `IWorkflowRepository.ts`, which is not in this change's file list and
  has no adapter yet to enforce the new contract against.
- **Chosen: accept last-write-wins at the use-case tier**, exactly as `3a` already scoped
  it, and state the outcome explicitly rather than leaving it implied. The mandatory
  concurrent-callers scenario (see `specs/process-workflow-action/spec.md`) deliberately
  uses two _conflicting_ actions racing off the same stale read, not two harmless repeats
  of the same action, so the real severity is visible rather than hidden behind a
  same-action example: caller A reads `SUBMITTED`, then a second caller B independently
  reads the same `SUBMITTED` row and drives it through `validate({alsoApprove: true})` →
  `publish()`, persisting `PUBLISHED`. Caller A, still holding its stale `SUBMITTED`
  snapshot, then calls `'return'` and saves — its `save()` call persists
  `REVISION_REQUESTED` **over the already-`PUBLISHED` row**, with no error to either
  caller and no indication to A that its transition landed on top of a published record.
  `WorkflowInstance`'s own "`PUBLISHED` is terminal — no method transitions out of it"
  guarantee (the entity's own doc comment) holds only _per in-memory instance, per read_ —
  it is not enforced at the persistence tier, because `IWorkflowRepository.save()` has no
  compare-and-swap/version check. This is explicitly the **inherited** 3a risk, not a new
  one introduced here — tracked as `DEF-024` in
  `_docs/refactoring-plan/deferred-items-register.md` (see proposal.md - Impact), not fixed
  in this change.

### 6. DEF-010 interaction — narrowed, not resolved

Verified directly against Decision 1's table: under the corrected four-action set,
`approve()` is only ever reachable through the `'validate'` action's `alsoApprove: true`
branch, always immediately preceded by a `validate()` call in the same `execute()` call
with the same `now`. So **this use case can never itself produce an unvalidated `APPROVED`
record** — every `APPROVED` instance this use case creates has real, contemporaneous
`validatedByUserId`/`validatedAt` attribution. `publish()`'s backfill rule (`3a`, already
implemented) therefore only ever fires, when reached exclusively through this use case, as
a genuine no-op (attribution already set). This is **not** a resolution of DEF-010
("direct publish without prior validation... policy question") — an `APPROVED` instance
reconstituted from a source other than this use case (a future bulk-import path, a
different domain's direct `WorkflowInstance.create()` call, or legacy-data backfill) could
still carry null validator attribution, and Decision 7 of `3a`'s design.md explicitly
allows `validated: either` for `APPROVED`. Flagged here for the human reviewer rather than
silently treated as closed — DEF-010 remains open, category D, no phase assigned.

### 7. Notification fires once per successful `execute()` call, regardless of whether `status` itself changed

The roadmap's own test-tier text says "notification is triggered exactly once per
successful transition." Read literally against `3a`'s own framing ("four transitions
symmetric... each with `_by_user_id` + `_at`" — `validate()` is one of the four named
transitions even though it does not change `status`), a `'validate'` action with
`alsoApprove: false` is still a successful transition: it writes real attribution
(`validatedByUserId`/`validatedAt`) even though `status` remains `SUBMITTED`. **Decision:**
`INotificationPort.notify()` is called exactly once per successful `execute()` call — once
whether the call composed one entity-method call or two (`validate()` + `approve()`), and
once even when `status` is unchanged (`validate()` alone). `fromStatus` is the status
before any entity-method call in this `execute()` invocation; `toStatus` is the status
after the last one (so `'validate'` with `alsoApprove: false` reports `fromStatus:
"SUBMITTED", toStatus: "SUBMITTED"`, and with `alsoApprove: true` reports `fromStatus:
"SUBMITTED", toStatus: "APPROVED"`).

**Alternative considered:** skip notification when `status` is unchanged. Rejected — a
validator's sign-off (`validate()` with `alsoApprove: false`, i.e. "validated, holding on
the approval decision") is a real event other parties (e.g. the original submitter) would
plausibly want to know about, and the roadmap's own text doesn't gate notification on a
`status` change, only on a "successful transition."

### 8. Notification-send failure after a successful `save()`: logged, not propagated

Once `save()` resolves, the workflow transition is durably persisted — a failure in
`INotificationPort.notify()` afterward must not make `execute()` reject, since the
caller-visible transition already succeeded and there is no compensating rollback in this
change (no outbox/saga pattern exists anywhere in this codebase to lean on). **Decision:**
`ProcessWorkflowActionUseCase` wraps the `notify()` call in its own try/catch, logs the
failure via the injected `ILogger.error` (matching `CreateNoticeUseCase`'s existing
`ILogger` injection), and still resolves `execute()` with the `WorkflowInstanceDto`
computed from `save()`'s result.

Tracked as `DEF-023` in `_docs/refactoring-plan/deferred-items-register.md` — no generic
notification-retry mechanism exists yet; picked up separately from this change.

**Alternative considered:** let `notify()` errors propagate, matching how `save()` errors
propagate. Rejected — unlike `save()`, a `notify()` failure has no natural retry story at
this tier: re-calling `execute()` to "retry" the notification would also re-attempt the
transition, which is not idempotent for every action (`publish()` on an
already-`PUBLISHED` instance throws `ConflictError`; `validate()` on an already-`SUBMITTED`
instance doesn't throw, but re-stamps `validatedByUserId`/`validatedAt` with the retrying
call's own values — not a true no-op, just not an error). Treating notification as a
best-effort side effect, separate from
the transition's own success/failure, avoids conflating those two very different retry
semantics.

### 9. `findByEntity` returning `null` is translated to `WorkflowInstanceNotFoundError`, not auto-created

Matches `fetchOwnedNotice`'s null-to-typed-error precedent exactly (`NotFoundError` →
`NoticeNotFoundError`). `ProcessWorkflowActionUseCase` never creates a `WorkflowInstance`
itself when `findByEntity` resolves `null` — initializing one at `DRAFT` is `4b`'s
(`CreateHazardousEventUseCase`'s) job, at entity-creation time, not this action-processing
use case's. `WorkflowInstanceNotFoundError extends NotFoundError` (new file,
`application/errors/WorkflowInstanceErrors.ts`), constructed as
`new WorkflowInstanceNotFoundError(entityId, entityType)`.

### 10. `ValidationError`-on-invalid-`now`: moot for this caller, recorded rather than skipped

`3a`'s design.md Risks flagged that `transition()`'s `ValidationError`-on-invalid-`now`
choice "needs an explicit decision before Phase 4a wires a real caller." Resolution for
_this_ caller: `ProcessWorkflowActionUseCase` always computes `now` via a single internal
`const now = new Date();` at the top of `execute()` (matching `CreateNoticeUseCase`'s own
convention — no `IClock` port exists anywhere in this codebase, confirmed by a repo-wide
grep) and never accepts `now` from the command. A `Date` freshly constructed via `new
Date()` can never fail `isInvalidDate`, so `transition()`'s `ValidationError`-on-`now`
branch is unreachable through this use case. This closes the concern for `4a`'s caller
specifically without re-deciding the general operational-error-vs-programmer-error question
`3a` raised (still open for any _other_ future caller of `WorkflowInstance`'s transition
methods, e.g. a bulk-migration script that might compute `now` itself).

### 11. Return type: `WorkflowInstanceDto`, mapped from `save()`'s resolved instance

Matches `NoticeDto`/`toNoticeDto`'s shape and the "Date values serialised as ISO 8601
strings" convention from `create-notice`'s own spec. New file,
`application/dto/WorkflowInstanceDto.ts`:

```ts
export interface WorkflowInstanceDto {
	id: string;
	entityId: string;
	entityType: EntityType;
	status: Status;
	submittedByUserId: string | null;
	submittedAt: string | null;
	validatedByUserId: string | null;
	validatedAt: string | null;
	approvedByUserId: string | null;
	approvedAt: string | null;
	publishedByUserId: string | null;
	publishedAt: string | null;
	createdAt: string;
	updatedAt: string;
}

export function toWorkflowInstanceDto(
	instance: WorkflowInstance,
): WorkflowInstanceDto;
```

Covered by its own `WorkflowInstanceDto.test.ts` (Date→ISO conversion, null passthrough for
every nullable attribution field) — this mapper has real conversion logic, unlike
`WorkflowInstanceErrors.ts`'s trivial constructor pass-through (Decision 9), so it gets a
dedicated red/green test pair rather than being covered only indirectly through the use
case's own tests.

### 12. `INotificationPort`: event-shaped payload, recipient resolution explicitly out of this port's scope

```ts
export interface WorkflowActionNotification {
	instanceId: string;
	entityId: string;
	entityType: EntityType;
	action: "submit-validation" | "validate" | "publish" | "return";
	fromStatus: Status;
	toStatus: Status;
	actingUserId: string;
	occurredAt: Date;
}

export interface INotificationPort {
	notify(notification: WorkflowActionNotification): Promise<void>;
}
```

Deliberately does **not** mirror `workflowNotificationTable`'s columns
(`notifiedUserId`, `notifiedByUserId`, `notificationMessage`, `channel`) — this use case has
no data to compute who the recipient is ("assigns validators, emails them on submission" is
the future email-adapter intent's job, per `ca-workflow-schema` design.md Decision 11:
"the actual delivery mechanism is Phase 4a's `INotificationPort` decision, not this
schema's" — read together with the roadmap's separate future intent at line ~1440 that
implements the email adapter). Recipient resolution needs assignment data this bounded
context doesn't own yet (no `entity_validation_assignment` port exists in
`validation-workflow`). The port's payload is the complete, self-sufficient _event_ an
adapter needs to decide who to notify and how — not a pre-resolved recipient list.

### 13. Constructor parameter order: logger, then repository, then notification port

Matches `CreateNoticeUseCase`/`UpdateNoticeUseCase`'s established order (`ILogger` first,
then the domain repository): `constructor(private readonly logger: ILogger, private
readonly workflowRepository: IWorkflowRepository, private readonly notificationPort:
INotificationPort) {}`. No functional significance — named explicitly so the tasks/tests
don't invent a different order ad hoc.

## Risks / Trade-offs

- **Lost-update race on `save()`** (Decision 5) — accepted, inherited from `3a`, not fixed
  here. Concretely: a stale-read caller's `'return'` can silently overwrite an
  already-`PUBLISHED` row with `REVISION_REQUESTED` — `WorkflowInstance`'s "PUBLISHED is
  terminal" guarantee is enforced only per in-memory instance, not at the persistence
  tier. Tracked as `DEF-024`.
- **DEF-010 narrowed but not resolved** (Decision 6) — this use case's own callers can
  never reach an unvalidated `APPROVED` state, but other callers of `WorkflowInstance`
  still can; the PM policy question stays open.
- **Notification is best-effort** (Decision 8, `DEF-023`) — a `notify()` failure is logged and
  swallowed, not retried. If notification delivery becomes a hard requirement (e.g. a
  compliance need for guaranteed validator alerts), this trade-off needs revisiting with a
  real outbox/retry mechanism — none exists in this codebase today.
- **No tenant check in this use case** (proposal.md - Impact - Security) — inherited from
  `3a` Decision 6, restated because this is the first real caller of that port.

## Migration Plan

None. Pure application-layer TypeScript addition; no schema change, no data migration, no
feature flag. Inert until a future intent (HE/DE/DR's own action-processing route or use
case) calls `ProcessWorkflowActionUseCase`.

## Open Questions

None remaining for this change. DEF-010 and the lost-update gap are explicitly flagged
above as _not resolved here_, not left as unstated assumptions — both are named,
cross-referenced Deferred Items, not unanswered questions that would change this change's
own specs or task breakdown.
