## Context

See `proposal.md` "Why"/"Confirmed Decisions" for motivation and the resolution headlines. This
document carries the full technical rationale, the exact code citations each resolution rests on,
and the new type signatures. This session added Decisions 15-27 across several rounds of live
browser/code review (15-17: list "Add new event"/count header, detail-page links, HIP ACL gap;
9-Addendum-2/3: form visual-parity fixes; 18-24: button-disabled gate, stuck-select bug, picker/list
fixes; 25-27: the 10.12d consolidated-review follow-ups) — every decision in this document, including
all of these, is fully resolved, not a choice still to be made.

`6a` (merged) established the route family (`app/routes/$lang+/_authenticated+/he-preview+/`), the
`requireUser()` + `roleHasPermission(role, "<perm>")` permission-check pattern, HE-local
`presentation/` helpers (ADR-009), and the first `app/design-system/components/` primitives. `6c`
reuses all of this directly.

**`presentation/` split into `presentation/web/` (this session, cleanup).** Per ADR-009's own
anticipated refinement ("as a context accumulates more than one or two adapters, subfolders by
adapter type inside `presentation/`... are the expected refinement") — `6c`'s own HE-local web-route
helpers/pages/forms pushed this past that threshold. Every file formerly directly under
`app/domains/hazardous-events/presentation/` now lives under `presentation/web/`;
`presentation/rest/` is reserved, unused, for `6d`/`6e`/`6f`'s future REST adapter. Every reference
to the old path (routes, the `isWorkflowActionAuthorized` agreement test, `vitest.config.ts`/
`vitest.dom.config.ts`, and the forward-looking roadmap doc's own not-yet-built file paths) was
updated to match.

**`vitest.config.ts`/`vitest.dom.config.ts` consolidated into one file (this session, cleanup).**
The two configs previously each hand-maintained the identical list of jsdom-tier file paths (one as
an `exclude`, the other as an `include`) — not scalable as more files need that tier. Folded into a
single `vitest.config.ts` using Vitest 4's `test.projects` array: a `"node"` project (`extends: true`
onto this file's own `reactRouter()`-based resolved config, same `setupFiles`/`environment: "node"`
as before) and a `"dom"` project (standalone, plain `@vitejs/plugin-react`, `environment: "jsdom"`,
same reasoning the old separate config's header carried for why `reactRouter()` can't be shared).
Every file the old `vitest.dom.config.ts` named explicitly was renamed to end in
`.dom.test.{ts,tsx}`; the `"dom"` project's `include` and the `"node"` project's `exclude` are both
now that one glob, not an enumerated list. `vitest.dom.config.ts` deleted; `yarn test:dom` removed
from `package.json` (`test:run2` — plain `vitest run` — now runs both projects in one invocation,
confirmed empirically, not just by reading the Vitest 4 projects docs). `.github/copilot-instructions.md`
and `_docs/code-structure/testing.md` updated to match.

## Goals / Non-Goals

**Goals:**

- Specify, fully, the create/edit/picker route behavior, the application-layer additions
  (`CreateHazardousEventUseCase`'s spatial-observation/cause-order fixes, `WorkflowInstance`'s three
  new transition methods, `IValidatorCandidateRepository`), and the full create/edit form UI, each
  grounded in a direct code citation, not an inference.
- Record exactly how the `WorkflowInstance.create()` invariant table (`REQUIRED_SET`) must change to
  stay internally consistent once direct-transition methods exist — this is a real, necessary
  consequence of Decision 6, not a separate choice.

**Non-Goals:**

- `submit-return` / the detail-page's own approval-action surface — `DEF-053`, the next intent after
  `6c`.
- Any generalization of `ProcessWorkflowActionUseCase`'s single `notificationPort.notify()` call into
  a pub/sub pattern — `DEF-052`.
- `HazardousEventErrorBoundary` (`6b`), CSV/REST/API-key (`6d`–`6f`).

## Decisions

### Decision 1 — Route placement, confirmed, inherited from `6a`

`app/routes/$lang+/_authenticated+/he-preview+/{new,edit.$id,picker}.tsx`, matching `6a`'s own
Decision 1.

### Decision 2 — Permission checks: `EditData` (flat) + status-aware (edit only) + server-side role-gating (action-level)

**Flat gate, both routes.** Mirrors `6a`'s Decision 2, substituting `EditData` for `ViewData`:
`requireUser()` (from `~/utils/auth`), then `roleHasPermission(role, "EditData")` (from
`~/frontend/user/roles`), called directly inside each loader/action — not the legacy HOC.

**Status-aware gate, edit route only (resolves former Open Decision 11).** Read directly from
`app/frontend/user/roles.ts:487-520` — note the function's own doc comment is stale/wrong ("Can edit
draft and needs-revision records only" for `data-collector`) and must not be trusted over the actual
code:

```ts
export function canEditDataCollectionRecord(role, approvalStatus): boolean {
  if (!role) return false;
  if (approvalStatus?.toLowerCase() === "waiting-for-validation") return false;
  if (approvalStatus?.toLowerCase() === "published" || approvalStatus?.toLowerCase() === "validated")
    return false;
  if (role === "data-viewer") return false;
  return true;
}
```

Translated to CA's `Status`/role vocabulary (`"waiting-for-validation"` → `SUBMITTED`,
`"validated"` → `APPROVED`, `"published"` → `PUBLISHED`): `edit.$id.tsx`'s loader blocks edit
entirely when the session's role is `data-viewer` (any status), and otherwise blocks edit when
`workflowStatus` is `SUBMITTED`, `APPROVED`, or `PUBLISHED`. `DRAFT`, `REVISION_REQUESTED`, and
`null`/missing (`DEF-031`'s case) are all editable — `null` is treated as editable because legacy's
own check only blocks on a truthy, matching `approvalStatus` string; a missing/falsy value falls
through to "allowed," which is the same behavior, not an invented one. A blocked request is rejected
the same way as the flat `EditData` check — `403`/`FORBIDDEN`.

**This is load-bearing for Decisions 5/6, not incidental**: since edit access is denied from
`SUBMITTED`/`APPROVED`/`PUBLISHED` before the "Save or submit" modal is ever reached, the new
`resetToDraft`/`directValidate`/`directPublish` transitions are — in practice, through this UI —
only ever invoked from `DRAFT` or `REVISION_REQUESTED`, exactly the from-states those methods accept.
A server-side caller that bypasses the UI could still attempt `directValidate`/`directPublish` from a
blocked status; the entity's own `transition()` guard (unaffected by this route-level check) is what
rejects that with `ConflictError`, same as any other transition. **Correction (Decision 26): this
does not hold for `resetToDraft`.** Its `allowedFrom` is every status by design (Decision 5/6) — the
entity's own guard therefore provides zero backstop against a bypassing caller, on either the status
dimension or (more importantly) the *who-can-call-it* dimension. The claim above was previously
written to cover all three transitions uniformly; it was wrong to do so for `resetToDraft`. Decision
26 closes the resulting role-authorization gap with a minimal, generic check.

**Server-side role-gating, use-case layer, route layer kept as an early short-circuit (resolves
former Open Decision 2; revised during implementation — Gate 10 code-review finding, researched
against external Clean Architecture sources — "Authorization in Use Cases, Not Controllers"
(DEV.to), Milan Jovanovic's "Authentication and Authorization in Clean Architecture", and OWASP API
Security Top 10 2023 risk #5, broken function-level authorization — user-approved).** Read directly
from `approvalWorkflowService.ts:112-129`'s `shouldProcess`: it enforces `role === "admin"` for
`submit-publish` but has **no role check at all** for `submit-validate`, even though its own UI
(`SaveSubmitDialog.tsx`) only ever renders both actions on the same admin-only card. Legacy's own
server-side gap (no check on `submit-validate`) is **not** replicated. `ProcessWorkflowActionCommand`'s
`direct-validate`/`direct-publish` variants each gain an `actingUserRole: string | undefined` field,
and `ProcessWorkflowActionUseCase.execute()` itself is now the authoritative check — it throws
`AuthorizationError` (`"${command.action} requires the admin role"`) when `actingUserRole !==
"admin"`, before calling `workflowRepository.findByEntity()` — authorization is a business rule, not
a presentation concern, so every caller of the use case (including a future entry point that isn't
`6c`'s own route) gets the invariant for free, not just this one request path. **Current state
(write-then-reject gap found and fixed; full story in Decision 17's "[Resolved] Role-gating..."
bullet below, which this paragraph only summarizes)**: the admin-role check now runs inside the
shared `requireWorkflowActionAuthorized` function, called before the primary use case in both
routes' `action()`s; the resolved mapped action is then passed into `composeWorkflowAction.server.ts`,
which no longer re-checks it. Both this guard and `ProcessWorkflowActionUseCase.execute()`'s own
authoritative, domain-layer enforcement call the same `isWorkflowActionAuthorized` predicate
(`application/isWorkflowActionAuthorized.ts`) rather than each independently reimplementing the
admin-role rule, closing the drift risk that duplication previously created. The route-level call
now guarantees rejection happens before any write. `submit-validation` carries
no role restriction (its own validator-list-emptiness rule, Decision 25, is a separate, non-role
concern). **`submit-draft` previously carried no role restriction either** (matching legacy's and
`SaveSubmitDialog.tsx`'s own card visibility) **but now does (Decision 26)**: rejected for
`actingUserRole` of `undefined` or `"data-viewer"`, accepted for `"data-collector"`/
`"data-validator"`/`"admin"` — a minimal generic backstop, not a replication of legacy's/
`SaveSubmitDialog.tsx`'s own card-visibility matrix (which never gated `submit-draft` by role at
all) and not full parity with HE's own richer status-aware edit-permission rule either (see
Decision 26 for why).

### Decision 3 — Create/edit composition shape, and the atomicity gap (resolved: Option (a), accepted and documented)

**Confirmed shape (write-then-reject gap found and fixed; see Decision 17's "[Resolved]
Role-gating..." bullet below for the full story)**: both actions first run
`requireWorkflowActionAuthorized` (role-gating +
empty-validator-list check) against the parsed form data; only a request that passes goes on to
call its primary use case (`CreateHazardousEventUseCase`/`UpdateHazardousEventUseCase`). Only when
the submitted form requests a workflow action — `tempAction` mapping to `submit-draft`,
`direct-validate`, `direct-publish` (admin-only), or `submit-validation` (non-empty validator list)
— does the action additionally call `ProcessWorkflowActionUseCase.execute()` against the event's
id, in the same request, after the primary use case.

**Empty validator list, authoritative enforcement (resolved during implementation — same SOLID/DIP
review finding and pattern as Decision 2's admin-role check).** `ProcessWorkflowActionUseCase.execute()`
itself rejects a `submit-validation` command whose `validatorUserIds` is empty, throwing
`ValidationError("At least one validator must be selected for submit-validation")` before calling
`workflowRepository.findByEntity()` — the same "business rule, not a presentation concern" reasoning
as Decision 2's admin-role check, so every caller of `execute()` gets the invariant (see the
`process-workflow-action` capability's own spec). The same raw check now also runs in
`requireWorkflowActionAuthorized`, before the primary use case — a second, presentation-layer
implementation of the same rule, not a shared call into this one (full mechanism, and the drift risk
that duplication creates, resolved — see Decision 17's "[Resolved] Role-gating..." bullet below).
`composeWorkflowAction.server.ts` itself no longer
checks this at all; it receives the already-resolved mapped action as a parameter. (The route
separately re-checks the validator list after
filtering it against the real tenant-scoped candidate list — Decision 8 — request-input
sanitization against a stale/tampered client list, not a duplicate of this check.)

**Atomicity, resolved.** `ProcessWorkflowActionUseCase.execute()` has no `tx` parameter and no
`ITransactionRunner` of its own (`ProcessWorkflowAction.ts` lines 47-56) — composing it after a
committed `CreateHazardousEventUseCase`/`UpdateHazardousEventUseCase` call is not the same atomic
guarantee as legacy's shared-`tx` `formSave` + `handleApprovalWorkflowService` for the *status-write*
itself. **Option (a), accepted**: on a `ProcessWorkflowActionUseCase` failure after a successful
create/update commit, the route returns a partial-success response — a redirect (not a generic
500) to the event's own edit page with a `?partial=transition-failed` query flag the edit page
renders as a banner, not the generic error-boundary page a thrown `Response` would reach. The
event remains queryable afterward, in whatever status it was in before the failed transition
attempt (`DRAFT` for a failed create+submit-validation; its pre-transition status for a failed
edit+transition).

**Why this narrows to specifically a status-transition *write* failure, not notification
failures**: legacy's own equivalent (`handleApprovalWorkflowService`, sharing the same outer `tx` as
the create/update) is actually *more* atomic for the status-change **write** itself — it rolls back
together with the create/update if the write fails. But legacy treats its own *email-notification*
step identically to how `ProcessWorkflowActionUseCase` already does: `handleSubmitForValidation`'s
`emailAssignedValidators` call is wrapped in a local `try`/`catch` that swallows and logs
(`approvalWorkflowService.ts:246-257`), the same best-effort treatment
`ProcessWorkflowActionUseCase.execute()` already gives `notificationPort.notify()`. So the *real*,
narrowed gap this change accepts is specifically "a status-transition **write** failure (not a
notification failure) after a committed create/update" — a case legacy's shared-`tx` design
structurally cannot produce, and this change's composed-use-case design can, in principle, though in
practice `ProcessWorkflowActionUseCase.execute()`'s own write failures are narrow (a stale
`ConcurrentModificationError`, a missing `WorkflowInstance`, or a `ConflictError` from an illegal
transition attempt — none of which a normal, freshly-created-then-submitted event should ever hit).

**Threading a `tx` through `ProcessWorkflowActionUseCase` is still rejected, confirmed independent of
`DEF-052`.** Even if `DEF-052`'s pub/sub generalization were implemented, threading a transaction
through would still create a second, orthogonal problem: `notificationPort.notify()` is called
*inside* `execute()`, after `workflowRepository.update()` but with no knowledge of an outer,
not-yet-committed transaction — a validator could be emailed about a submission that then rolls back.
`DEF-052` addresses *who reacts* to a transition, not *when the reaction fires relative to a commit*;
fixing one does not fix the other. Both problems remain un-addressed by `6c`, by design, with this
paragraph as the record of why that's deliberate, not an oversight.

**Test requirement**: both the create and edit PGlite tests need an explicit scenario — the primary
use case resolves successfully, the follow-up `ProcessWorkflowActionUseCase.execute()` call is
stubbed to reject, and the test asserts (a) the route returns its partial-success shape, not a 500,
and (b) the event is still queryable via `GetHazardousEventByIdUseCase` in its pre-transition status.

### Decision 4 — Create's missing `assertCauseStartsNoLaterThanEffect` guard (resolved: fixed)

`CreateHazardousEventUseCase.execute()` now calls
`assertCauseStartsNoLaterThanEffect(cause.startDate, newEvent.startDate)` immediately after the
existing `assertCausalLinkDoesNotCreateCycle` check (same place `UpdateHazardousEvent.ts:331` calls
it), only when `causeId` is present. This is a one-line addition with its own TDD cycle and a
`create-hazardous-event` spec delta (new requirement, mirroring the existing
`assertCauseStartsNoLaterThanEffect` scenarios already specified for `update-hazardous-event`).

### Decision 5/6 — Workflow-transition mapping: `submit-draft`, direct-validate, direct-publish, and the required `REQUIRED_SET` adjustment

**`submit-draft` — `WorkflowInstance.resetToDraft(transitionParams)` (resolved: build now).**
Callable from **any** status (the only transition method with no `allowedFrom` restriction).
Returns a new instance with `status: 'DRAFT'`, and `submittedByUserId/At`, `validatedByUserId/At`,
`approvedByUserId/At`, `publishedByUserId/At` **all** `null`. Legacy's own `handleSubmitAsDraft`
(`approvalWorkflowService.ts` lines 266-288) only mentions three pairs
(`submittedByUserId/At`/`validatedByUserId/At`/`publishedByUserId/At` null) because its schema has no
separate "approved" concept distinct from "validated" — CA's own `DRAFT` invariant
(`REQUIRED_NULL.DRAFT`, already `["submitted", "validated", "approved", "published"]` — all four)
requires clearing `approvedByUserId/At` too, so `resetToDraft` clears all four to keep the entity's
own invariant intact on the next reconstitution, not just the three legacy's narrower schema ever
had to touch. `userId` is accepted (for `TransitionParams` signature consistency) but unused — same
precedent as `requestRevision()`'s own "no attribution column exists for this event" case.
`ProcessWorkflowActionCommand` gains a `{ action: "submit-draft" }` variant (base fields only, no
extra payload); `applyTransition()`'s switch calls `existing.resetToDraft(transitionParams)`.
`execute()` skips `buildNotification()`/`notificationPort.notify()` entirely for this action (an
early guard via a type predicate narrowing the command, not a `buildNotification()` branch) —
legacy's own `handleSubmitAsDraft` sends no email either, confirmed by reading the function. Since
`WorkflowActionNotification` never gains a matching member, `EmailNotificationAdapter.server.ts`
needs no new case.

**Rationale, why this is a data-integrity fix, not cosmetic**: without it, editing the *content* of
an already-`APPROVED`/`PUBLISHED` record via a plain default save (no transition requested) would
leave stale approval/publish attribution sitting on now-different content — a real correctness
regression, not just a missing UX affordance. (In practice this is further guarded by Decision 2's
status-aware edit permission, which blocks editing an `APPROVED`/`PUBLISHED` record at all — but
`resetToDraft` is the mechanism that would let an admin/validator explicitly revert a record to
`DRAFT` from any status they *can* reach, e.g. `REVISION_REQUESTED`, without that reversion leaving
old attribution behind.)

**Direct-validate / direct-publish — new methods, not chained calls (resolved: build now).** Read
directly, `approvalWorkflowService.ts` lines 295-361:

```ts
// handleSubmitAsValidated — one update, sets ONLY validatedByUserId/At
await tx.update(table).set({
  approvalStatus: "validated",
  validatedByUserId: submittedByUserId,
  validatedAt: sql`CURRENT_TIMESTAMP`,
  updatedAt: sql`CURRENT_TIMESTAMP`,
}).where(eq(table.id, entityId));

// handleSubmitAsPublished — one update, sets validatedByUserId/At AND publishedByUserId/At
await tx.update(table).set({
  approvalStatus: "published",
  validatedByUserId: submittedByUserId,
  validatedAt: sql`CURRENT_TIMESTAMP`,
  publishedByUserId: submittedByUserId,
  publishedAt: sql`CURRENT_TIMESTAMP`,
  updatedAt: sql`CURRENT_TIMESTAMP`,
}).where(eq(table.id, entityId));
```

Neither touches `submittedByUserId`/`submittedAt` at all — whatever that pair already holds (`null`
from a true `DRAFT` origin, or carried over, non-null, from a prior submit-then-`REVISION_REQUESTED`
cycle) is left exactly as-is. Chaining `submit-validation`→`validate`→`publish` to approximate this
would incorrectly *populate* `submittedByUserId`/`At` (which legacy's real shortcut never touches)
and would need a fabricated validator list — a real data divergence, not just an awkward sequencing
choice, on top of compounding Decision 3's atomicity gap across three calls instead of one. So:

```ts
// WorkflowInstance.ts — new methods
directValidate({ userId, now }: TransitionParams): WorkflowInstance {
  return this.transition(["DRAFT", "REVISION_REQUESTED"], "directValidate", now, {
    status: "APPROVED",
    validatedByUserId: userId,
    validatedAt: now,
    updatedAt: now,
  });
}

directPublish({ userId, now }: TransitionParams): WorkflowInstance {
  return this.transition(["DRAFT", "REVISION_REQUESTED"], "directPublish", now, {
    status: "PUBLISHED",
    validatedByUserId: userId,
    validatedAt: now,
    publishedByUserId: userId,
    publishedAt: now,
    updatedAt: now,
  });
}
```

Each is reachable via exactly one `ProcessWorkflowActionUseCase.execute()` call — one transition, one
`workflowRepository.update()`, the same single commit boundary as `submit-validation`/`validate`/
`publish`/`return` already have. `ProcessWorkflowActionCommand` gains
`{ action: "direct-validate" }` and `{ action: "direct-publish" }` variants (base fields only);
`applyTransition()`'s switch calls the matching new entity method. `validate()`/`publish()`'s
existing strict guards (`SUBMITTED`-only, `APPROVED`-only respectively) are **not** reused or
weakened — they represent the normal validator-reviewed flow and stay exactly as they are; the two
new methods are a deliberately separate path.

**No notification for either (same deliberate-no-notify treatment as `submit-draft`, confirmed by
reading the file, not assumed by extension)**: `handleSubmitAsValidated`/`handleSubmitAsPublished`
call no email function at all — unlike `handleSubmitForValidation`, which calls
`emailAssignedValidators`. Both actions are excluded, alongside `submit-draft`, from the same early
guard in `execute()` that skips `buildNotification()`/`notify()` entirely — `WorkflowActionNotification`
and `EmailNotificationAdapter.server.ts` are both unchanged by this delta.

**The required `REQUIRED_SET` adjustment — a necessary consequence, not a separate choice.**
`WorkflowInstance.create()`'s current invariant table:

```ts
const REQUIRED_SET: Record<Status, readonly PairName[]> = {
  DRAFT: [],
  SUBMITTED: ["submitted"],
  REVISION_REQUESTED: ["submitted"],
  APPROVED: ["submitted", "approved"],      // <- before
  REJECTED: [],
  PUBLISHED: ["submitted", "validated", "approved", "published"],  // <- before
};
```

`directValidate` reaches `APPROVED` setting only `validatedByUserId/At` — never `approvedByUserId/At`,
and (from a true `DRAFT` origin) never `submittedByUserId/At` either. `directPublish` reaches
`PUBLISHED` setting `validatedByUserId/At` and `publishedByUserId/At` — never `approvedByUserId/At`,
and (from a true `DRAFT` origin) never `submittedByUserId/At`. Both shapes would fail
`WorkflowInstance.create()`'s own invariant check on the very next reconstitution from the DB (the
repository's read path calls `create()` to rebuild the entity), which would make a legitimately
direct-validated/published row unreadable — a real, must-fix correctness gap, not a style
preference. The table must relax to:

```ts
const REQUIRED_SET: Record<Status, readonly PairName[]> = {
  DRAFT: [],
  SUBMITTED: ["submitted"],
  REVISION_REQUESTED: ["submitted"],
  APPROVED: [],                              // <- after: no longer universally required
  REJECTED: [],
  PUBLISHED: ["validated", "published"],     // <- after: drop "submitted", "approved"
};
```

**Why this is still safe for the normal flow**: `REQUIRED_SET` only enforces a *minimum*, never an
exact-match. The normal flow (`submit()`→`SUBMITTED`, optionally `validate()`→still `SUBMITTED`,
`approve()`→`APPROVED`, `publish()`→`PUBLISHED`) still naturally ends up with `submitted` and
`approved` both set by the time it reaches `APPROVED` (since `approve()` only patches
`approvedByUserId/At`+`status`, never clearing the `submitted` pair `SUBMITTED`'s own
`REQUIRED_SET: ["submitted"]` already guaranteed was present) — relaxing the *requirement* doesn't
change what the normal flow actually produces, it only stops forbidding the new, narrower
direct-shortcut shape. `REQUIRED_NULL` is unaffected (`APPROVED`'s `["published"]` and `PUBLISHED`'s
`[]` both still hold for every shape either path produces) and the split-pair check (each pair
jointly null or jointly set) is satisfied by both new methods' patches, which only ever set complete
pairs.

**Test requirement**: `workflow-instance-entity`'s spec delta adds scenarios for both new methods
(happy path from each allowed from-state, `ConflictError` from every other status, the
`REQUIRED_SET`-relaxation itself exercised via a reconstitution test — construct a `WorkflowInstance`
in the exact shape `directValidate`/`directPublish` produce and confirm `create()` no longer throws).
The relaxation is additive, not a narrowing, for the normal flow's own stricter shape — but one
pre-existing test exercised a shape the relaxation legitimately widens (`APPROVED` with `submitted`
set and `approved` absent, previously rejected only because the old `REQUIRED_SET` required
`approved`); that test's expectation was updated to `.not.toThrow()` as a direct, intended
consequence of this change, not a regression.

### Decision 7 — `submit-return`: confirmed out of scope (`DEF-053`)

`SaveSubmitDialog.tsx`'s own `SaveAction` type (`"submit-draft" | "submit-validate" |
"submit-publish" | "submit-validation"`) has exactly four values — `submit-return` is never sent by
`new.tsx`/`edit.$id.tsx`. Legacy's `submit-return` is driven from the detail/view page's own approval
actions (`HazardousEventView`'s `returnAssigneeOptions`), a UI surface `6c` doesn't touch. Registered
as `DEF-053`, explicitly the next intent after `6c` (not open-ended) — `6c` builds nothing for it,
and `ProcessWorkflowActionUseCase`'s existing `"return"` action/`requestRevision()` method are
untouched by this change.

### Decision 8 — Validator candidate list: new `IValidatorCandidateRepository` port, built inside `6c`

Read directly from `new.tsx` lines 67-84: the loader fetches
`getUserCountryAccountsWithValidatorRole(countryAccountsId)`, excludes the acting user, and — only
when that filtered list is empty — falls back to `getUserCountryAccountsWithAdminRole(countryAccountsId)`,
excluding the acting user from that list too. Confirmed via grep that both legacy query functions are
reused unchanged across HE/DE/disaster_records — this is exactly the kind of entity-type-agnostic,
shared concern `validation-workflow`'s application layer already owns one of (`INotificationPort`),
so the new port lives alongside it, not inside HE's own domain.

**Revised during implementation (Gate 5 SOLID review, DIP finding, user-approved):** the first draft
of the port ran the validator-then-admin-fallback branching itself, inside the Drizzle adapter — a
business rule baked into infrastructure. The port is now a mechanical, single-role query; the
fallback policy moved up to `FindValidatorCandidatesUseCase`, which is the only place that decides
"try validators, fall back to admins if empty":

```ts
// app/domains/validation-workflow/application/ports/IValidatorCandidateRepository.ts
export type ValidatorCandidateRole = "data-validator" | "admin";

export interface ValidatorCandidate {
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
}

export interface IValidatorCandidateRepository {
  /** Mechanical query only — no fallback policy (SOLID review, DIP finding): that business rule
   * belongs to FindValidatorCandidatesUseCase, which calls this twice. */
  findByRole(
    tenantId: string,
    role: ValidatorCandidateRole,
    excludingUserId: string,
  ): Promise<readonly ValidatorCandidate[]>;
}
```

`DrizzleValidatorCandidateRepository.server.ts` implements only `findByRole` — the same
tenant/role/`emailVerified`-filtered, self-excluding query as before (against the same underlying
tables `getUserCountryAccountsWithValidatorRole`/`getUserCountryAccountsWithAdminRole` already
query), just parameterized by `role` instead of running the validator query and the admin query
internally.

`FindValidatorCandidatesUseCase.execute()` now owns the fallback branching: it calls
`findByRole(tenantId, "data-validator", excludingUserId)` first, and only when that result is empty
does it call `findByRole(tenantId, "admin", excludingUserId)` and return that instead. The
externally-observable outcome is unchanged from the original design (same tenant-scoping, same
self-exclusion, same validator-then-admin-fallback result) — only which layer owns the decision
moved, per DIP. Ships inside `6c` itself — `6c`'s own `submit-validation` UI (the "Select
validator(s)" `MultiSelect` in the "Save or submit" modal) needs this data the day `6c` ships; it is
not deferred to a later intent the way `DEF-049`'s own broader `entity_validation_assignment` gap is.

### Decision 9 — UI ground-truth checklist (reference source: legacy, type (a) — a real, existing page)

Unchanged from this change's earlier draft — `6c` is not the same scale of presentation-layer work as
`6a`'s read-only tables; it is a full create/edit form, built now, inside `6c` (Decision 12,
confirmed — Option (a), no split into a follow-up intent). Reference source, read directly (type
(a)): legacy's `app/routes/$lang+/_authenticated+/hazardous-event+/new.tsx` /
`app/routes/$lang+/hazardous-event+/edit.$id.tsx`, their shared `HazardousEventForm` component
(`app/frontend/events/hazardeventform.tsx`), the generic form-rendering chain
(`app/frontend/form/{form_components,input,inputs,row_meta}.tsx`), and
`app/frontend/components/approval-workflow/SaveSubmitDialog.tsx`.

**Field set and order** (`fieldsDef()`, `hazardeventform.tsx` lines 198-211/48-196):

| # | Field | Type / control | Required? | Section grouping |
| --- | --- | --- | --- | --- |
| 1 | `parent` | custom override — link to parent event + "Change"/"Unset" controls opening the picker (Decision 13), hidden `<input type="hidden" name="parent">` | No | own row |
| 2 | `hipHazardId` | custom override — cascading hazard/cluster/type picker **plus a "Filter by hazard name" text input above the three selects** (own row, label and placeholder both literally "Filter by hazard name" — `hazardpicker.tsx`'s own two translation codes share this one msg text), label hardcoded `"Hazard classification *"` | **Yes** (hardcoded, not via the generic required-marker mechanism) | `colOverride: 1`, own row |
| 3 | `hipClusterId` | pure React state driving #2's cascade, not a form field — the command only takes `specificHazardId` (code review finding: no hidden `<input>` exists, nor is one needed). **Never disabled, and — a Gate 9 finding, found via live comparison, NOT a strict type-then-cluster-then-hazard cascade like the earlier draft assumed** — the filter box's search term matches hazard *names* only; the surviving cluster/type lists are *derived* from the surviving hazards (ported from `hazardpicker.tsx` lines 95-120 as `filterHazardTaxonomy`), not independently name-matched. Picking a hazard directly back-fills its cluster+type; picking a cluster back-fills its type. Any change to the filter text clears the type/cluster/hazard selection. | n/a | — |
| 4 | `hipTypeId` | same as #3, plus one more exact-parity quirk: when exactly one type survives the filter, its `<select>` renders *only* that option with no placeholder at all — legacy's own cluster select has the equivalent single-survivor behavior present in the code but hardcoded off (`false && filteredClusters.length === 1 ? ...`), so the cluster select always keeps its placeholder regardless of count; replicated exactly, not "fixed," since this is a parity requirement, not a design choice | n/a | — |
| 5 | approval-status display | read-only disabled text + hidden input carrying the real value | n/a | own row |
| 6 | `nationalSpecification` | textarea | No | own row |
| 7 | `startDate` | flexible-precision date — **confirmed at implementation time via live comparison (Gate 9 finding: the first build of this form shipped a plain `<input type="date">` with no precision selector at all, missing this row's own ground truth entirely)**. Ported from legacy's `date_optional_precision` control (`input.tsx:223-449`) as `HazardousEventFlexibleDateField`: a "Format" row (its own label, `"Start date" + " " + "Format"`) holding a `<select>` of exactly three options — "Full date" (`yyyy-mm-dd`, default), "Year and month" (`yyyy-mm`), "Year only" (`yyyy`) — above a conditional value row (or two). `yyyy-mm-dd` renders one native `<input type="date" required>` labelled `"Start date" + " " + "Date"`. `yyyy-mm` renders a required year `<input type="text" inputMode="numeric" pattern="\d{4}">` labelled `"... Year"` plus an unrequired month `<select>` labelled `"... Month"` (12 localized month names via `Intl.DateTimeFormat`, legacy's own `getMonthName`). `yyyy` renders only the year input. A hidden `<input type="hidden" name="startDate">` carries the actual submitted value in `isValidFlexibleDateFormat`'s own convention (`~/domains/shared/domain/flexibleDateFormat.ts`, ADR-002) — `name` is **only** ever on this hidden input, `required`/`id` always on whichever value control is currently primary (a hidden input is excluded from native constraint validation entirely, so putting `required` there would silently break task 9.9's own required-field guarantee). A malformed year is rejected via native `pattern` validation (task 9.9's own "native, client-side only" layer), not legacy's toast. | **Yes** | shares a row with `endDate` |
| 8 | `endDate` | same `HazardousEventFlexibleDateField`, `name="endDate"` | **Yes** | same row as `startDate` — **this row's original "row-major, not side-by-side column-blocks" framing was wrong; see Addendum 3 below for the corrected layout and the Fragment-flattening fix** (the fix itself was already correct, only this cell's explanation of why was not) |
| 9 | `description` | textarea | No | starts new row |
| 10 | `chainsExplanation` | textarea, label exactly "Composite event - chains explanation" | No | own row |
| 11 | `magnitude` | text | No | own row |
| 12 | `spatialFootprint` | custom override — map + division picker | No (always visible, never conditionally hidden) | starts new row |
| 13 | `attachments` | custom override — file upload | No | starts new row |
| 14 | `recordOriginator` | text | **Yes** | shares a row |
| 15 | `hazardousEventStatus` | enum select — exactly `forecasted`/`ongoing`/`passed`, capitalized labels | No | starts new row |
| 16 | `dataSource` | text | No | own row |
| 17/18 | `tempValidatorUserIds`, `tempAction` | hidden, no label/row — written by the "Save or submit" modal's own submit handler | n/a | — |

**Required-field marker**: a literal `" *"` suffix appended to the label text (`WrapInput`,
`input.tsx` lines 20-22, for every generically-required field; hardcoded identically for the
`hipHazardId` override). Reproduce "label text + literal space + asterisk," not a CSS-only or
icon-based marker.

**Validation / error display — two independent layers, both reproduced:**

1. **Client-side, native only.** Every required input renders a real DOM `required` attribute.
   Before any submission, the form's own `checkValidity()`/`reportValidity()` equivalent runs first;
   on failure it shows the browser's native validation indicator on the first invalid field and does
   **not** submit. React Aria's own equivalent mechanism (`validate`/`isRequired` + native constraint
   validation) is confirmed at implementation time, not assumed — but the *behavior* (block the
   submit client-side on an invalid required field, don't rely on the server alone) is non-negotiable
   ground truth, not an implementation detail left open.
2. **Server-side, post-submission.** A per-field error list rendered directly below that field's own
   control, driven by the action's returned per-field error map — matching `FieldErrors`/
   `FieldErrors2`'s own visible-list-of-strings behavior (`form_components.tsx` lines 146-180), not a
   single top-of-form banner.

**Conditional visibility**: neither `spatialFootprint` nor `attachments` is conditionally hidden —
both always render, matching legacy exactly. **Corrected (10.12d consolidated review, 2026-11-04):**
this row is NOT "now buildable in full" as this paragraph originally claimed — Decision 3 only wires
the application-layer plumbing (`CreateHazardousEventCommand`'s `spatialObservation` field and its
conditional `RecordSpatialObservationUseCase` composition inside the transaction); no UI was ever
built to populate it. As shipped, `spatialFootprint` renders a static placeholder paragraph with a
permanently-empty hidden `spatialObservation` input and `spatialObservationChanged` hardcoded `"0"` —
no real map/division-tree picker widget exists, so that application-layer plumbing can never actually
fire from this form. Tracked as `DEF-057`, not a Risks-section item — this document has no `## Risks`
heading anywhere (confirmed by a full-document search); the placeholder's own code comment citing one
is also false and is corrected separately (see tasks.md Section 9k).

**Interaction — "Save or submit" modal** (ground truth for Decisions 2/5/6/7's role-gating, read
directly from `SaveSubmitDialog.tsx`, not guessed):

- One option card per action: **`submit-draft`** (every role, default-selected); **direct-validate/
  direct-publish** (admin-only, one card — a nested "Publish to UNDRR instance" checkbox switches
  which of the two is sent); **`submit-validation`** (`data-validator`/`data-collector`/`admin`,
  with a required validator-selection control whose own submit stays disabled until at least one
  candidate is selected — populated from Decision 8's new port).
- `submit-return` never appears in this modal (Decision 7).
- A separate "Discard" button opens its own confirmation modal: "Save as draft" (maps to
  `submit-draft`) or "Discard work and exit" (navigates away unsaved).
- **Each card's icon badge (confirmed at implementation time via live comparison — Gate 9 finding,
  first missed entirely).** A colored circular badge (`w-11 h-11 rounded-full`, background
  `#eaf2fb`, icon color `#1d66b1` — Tailwind arbitrary values, not inline `style`, per the
  no-inline-styles rule) sits between the radio input and the title/description column, in that
  exact order (radio, badge, text — `SaveSubmitDialog.tsx`'s own `renderOptionCard`). Icon per
  action, PrimeIcons (`pi pi-*`, already loaded globally via `root.tsx`, no new dependency):
  `submit-draft` → `pi-save` (a floppy disk, not a bookmark — read the actual icon, not the
  prose), `submit-validate`/`submit-publish` → `pi-shield` (the shared admin-only card),
  `submit-validation` → `pi-send`.

**Styling/layout parity**: row/column grouping per the table above; no in-form section headings exist
in legacy today (no field sets a `uiRow.label`) — a new implementation must not add one. Exact
computed spacing/column widths are read directly from the live legacy page at implementation time,
same practice `6a` followed.

### Decision 9 — Addendum: discard-modal button order/emphasis (found live, 2026-11-02; resolved — apply directly, not an open question)

**Already compared live, both directions functionally correct — a pure visual-parity gap, not a
behavior question.** Legacy's own discard-confirmation modal (`hazardeventform.tsx`, the `Dialog`
immediately above line 540) stacks **"Save as draft"** (primary/filled) above **"Discard work and
exit"** (outline). The CA form's existing `HazardousEventDiscardModal.tsx` (built earlier this
session) instead puts them side-by-side (`<div className="flex gap-3">`) with the emphasis
reversed — Discard rendered `mg-button-primary`, Save rendered `mg-button-outline`. Both modals
offer the same two choices with the same behavior (`onSaveAsDraft`/`onDiscard`); only the visual
layout and which action reads as "primary" differ.

**Resolution: match legacy exactly, no further input needed.** `HazardousEventDiscardModal.tsx`'s
footer changes from a horizontal `flex gap-3` row to a vertical stack (`flex flex-col gap-3`), with
"Save as draft" first, rendered `mg-button-primary`, and "Discard work and exit" second, rendered
`mg-button-outline` — a straight swap of each button's own className plus the container's flex
direction, no change to either callback or to the modal's trigger/visibility logic. No new spec
requirement: the two capabilities offered and their outcomes are unchanged, so this is a
presentation-only fix captured here, not in any `spec.md` delta (the artifact standard's "describes
observable behaviour only" scope already excludes exact CSS-class choices from spec requirements).

### Decision 9 — Addendum 2: five visual-parity gaps in the create/edit form (found live via DOM/computed-style inspection, 2026-11-02, third round; resolved — apply directly, not open questions)

**All five found by the human directly comparing rendered DOM and computed styles between
`/en/hazardous-event/new` (legacy) and `/en/he-preview/new` (CA) — not assumed, and each re-confirmed
here against the actual legacy source before specifying the fix.**

**Gap 1 — `<Form>` is missing the `dts-form` class, which is the entire source of the padding gap.**
Legacy's `<form>` carries `class="dts-form"` (confirmed: `app/frontend/form/view_form.tsx` renders
`<Form ...>` from `form_components.tsx`, and `HazardousEventDetailPage.tsx`'s own `<form
className="dts-form">` — `6a`'s already-built detail page — confirms the class governs this
padding independent of any other wrapper). `dts-form`'s own computed style is `padding: 0 63.98px 0
32.06px`. `HazardousEventFormPage.tsx`'s `<Form method="post" ref={formRef}>` (react-router's
`Form`, which forwards `className` like a plain `<form>`) has no `className` at all — confirmed by
reading the component's current JSX, not merely the live DOM. **Fix:** add `className="dts-form"` to
that one element. No other container in the chain above it needs changing — `MainContainer` is
shared byte-for-byte with the detail/list pages, which already render correctly.

**Gap 2 — page banner/heading: wrong title in the pink banner, and the breadcrumb + page-specific
`<h2>` are missing entirely.** Confirmed directly from `app/frontend/form/view_form.tsx` lines 82-104
(the shared `FormView` both legacy `new.tsx`/`edit.$id.tsx` render through) and
`app/frontend/events/hazardeventform.tsx` lines 571-579 (`HazardousEventForm`'s own call into
`FormView`):

```tsx
<FormView
  ...
  title={ctx.t({ code: "hazardous_events", msg: "Hazardous events" })}
  editLabel={ctx.t({ code: "hazardous_events.edit", msg: "Edit hazardous event" })}
  addLabel={ctx.t({ code: "hazardous_events.add", msg: "Add hazardous event" })}
  ...
/>
```

```tsx
// view_form.tsx, inside <MainContainer title={title}>
<section className="dts-page-section">
  <p><LangLink lang={ctx.lang} to={props.listUrl || props.path}>{title}</LangLink></p>
  <h2>{props.edit ? props.editLabel : props.addLabel}</h2>
  ...
</section>
```

`title` ("Hazardous events") is both `MainContainer`'s own banner title **and** the breadcrumb
link's text — the same constant the already-correct `he-preview+/$id.tsx` detail route and
`he-preview+/_index.tsx` list route already pass today (`t("title")`, same top-level locale key).
The page-specific wording only ever appears in the body, as a classless `<h2>`: **"Add hazardous
event"** on create, **"Edit hazardous event"** on edit — never in the banner.

**Correction to this task's own framing, found by reading the source above, not guessed:** the
page-specific `<h2>` text on create is legacy's **"Add hazardous event"**, not "New hazardous
event" — the existing (wrongly-used) locale key `form.create_title` currently holds `"New
hazardous event"`, which does not match legacy's `addLabel` anywhere. `form.edit_title`
(`"Edit hazardous event"`) already matches legacy's `editLabel` exactly and needs no text change.
Going with legacy's confirmed exact wording for the create `<h2>` ("Add hazardous event"), since
Decision 9's entire premise is legacy parity and the mismatch is a plain copy error, not a product
choice — flagged here explicitly in case a different value was actually intended.

**Fix:**
- `app/routes/$lang+/_authenticated+/he-preview+/new.tsx` and `.../edit.$id.tsx`: change
  `<MainContainer title={t("form.create_title")}>` / `title={t("form.edit_title")}` to
  `<MainContainer title={t("title")}>` on both routes — matching `$id.tsx`/`_index.tsx`'s existing
  pattern exactly.
- `locales/en/hazardous-events.json`: correct `form.create_title`'s value from
  `"New hazardous event"` to `"Add hazardous event"`; leave `form.edit_title` unchanged.
  `locales/fr/hazardous-events.json`: correct `form.create_title` from `"Nouvel événement
  dangereux"` to `"Ajouter un événement dangereux"` — the real legacy FR translation, confirmed
  directly from `locales/app/fr.json`'s own `hazardous_events.add` catalog entry (id
  `hazardous_events.add`, line ~5908: `"translation": "Ajouter un événement dangereux"`), not
  invented. `form.edit_title`'s FR value (`"Modifier l'événement dangereux"`) already matches
  legacy's own `hazardous_events.edit` catalog entry exactly — no change needed. These two keys are
  now repurposed as the body `<h2>` text, not the banner title — no other call site uses
  either key (grepped the whole repo; only the two route files and this change's own DOM test mock
  reference them).
- `HazardousEventFormPage.tsx`: render, as a sibling immediately before the `<Form>` element (not
  inside it — matching legacy's own `<section>` sitting beside, not inside, its `<Form>`):
  ```tsx
  <section className="dts-page-section">
    <p><Link href={ctx.url("/he-preview")}>{t("title")}</Link></p>
    <h2>{mode === "edit" ? t("form.edit_title") : t("form.create_title")}</h2>
  </section>
  ```
  using the same `Link`/`ctx.url()` pattern `HazardousEventDetailPage.tsx` already uses for its own
  back-link (Decision 16) — both the link and the `<h2>` stay classless/unstyled, matching legacy's
  own plain markup exactly; don't invent styling for either.

**Gap 3 — the hazard classification selects (type/cluster/specific hazard) have no visible
`<label>` at all, only `aria-label`.** Confirmed directly: `HazardousEventHazardPicker.tsx`'s three
`<select>` elements carry `aria-label={t("detail.classification.type"/"cluster"/"hazard")}` only —
satisfies `getByLabelText` in tests but renders no visible label text in the DOM, which is exactly
what the live comparison found missing. Legacy's actual labels, confirmed from
`app/frontend/hip/hazardpicker.tsx` lines 170-266 (`<Field label={ctx.t({code:"hip.hazard_type",
msg:"Hazard type"})}>` etc.), are **"Hazard type"**, **"Hazard cluster"**, **"Specific hazard"** —
distinct text from the detail page's `detail.classification.type/cluster/hazard` keys ("Type" /
"Cluster" / "Hazard"), which must stay untouched (`HazardousEventDetailPage.tsx` renders those as
its own `"Type: …"` / `"Cluster: …"` / `"Hazard: …"` display lines — a different, already-correct
use of those keys; confirmed via repo-wide grep before deciding not to repurpose them).

**FR values, confirmed from `locales/app/fr.json`'s own catalog, not invented:** `hip.hazard_type` →
`"Type de danger"` (line ~2208), `hip.hazard_cluster` → `"Groupe de risques"` (line ~2198),
`hip.specific_hazard` → `"Risque spécifique"` (line ~2233) — add these as the three new keys' FR
values in `locales/fr/hazardous-events.json`.

**Fix:** add three new locale keys under `form.fields` — `hazard_type: "Hazard type"`,
`hazard_cluster: "Hazard cluster"`, `specific_hazard: "Specific hazard"` — and wrap each `<select>`
in `HazardousEventHazardPicker.tsx` with the existing `HazardousEventFormField` wrapper (already
used everywhere else on this page; it renders a real `<label htmlFor>`), replacing the bare
`aria-label` attribute:
```tsx
<HazardousEventFormField label={t("form.fields.hazard_type")} htmlFor="hipTypeId">
  <select id="hipTypeId" ...>
```
(same pattern for `hipClusterId`/`hazard_cluster` and `specificHazardId`/`specific_hazard` — note
`specificHazardId`'s `<select>` already has `id="specificHazardId"`, used as-is). No change to any
of the picker's existing cascade/filter behavior.

**Gaps 4 & 5 — one root cause, not two: row-grouping is missing, and inputs/textareas are
force-stretched full-width.** Confirmed via computed-style comparison that border/padding on
inputs/textareas are already identical between legacy and CA (`border: 0.8px solid rgb(204, 204,
204)`, `padding: 5.6px 7.98px`) — the only actual difference is width. Legacy's inputs/textareas
stay at their natural HTML-intrinsic width (confirmed by `getComputedStyle().width` with no CSS
class on the bare element: textarea ≈193px, text input ≈216px) — they are never stretched to fill
a container. CA's same elements compute to ≈1376px (full row width).

Confirmed root cause, read directly from `app/frontend/form/row_meta.tsx`'s `rowMeta()` and
`app/frontend/form/types.ts`'s `splitDefsIntoRows()` (the actual engine that produces legacy's
layout, traced field-by-field through `fieldsDefCommon()`): **every** field row — even a
single-field one — renders inside a `<div className="mg-grid mg-grid__col-N">` (`N` = the row's
field count, minimum 3, with special-cased overrides: a lone textarea gets `col-2`, a lone
`spatialFootprint`/`attachments` gets `col-1`). The grid's own columns don't stretch their contents
to fill — a plain `<input>`/`<textarea>` sits at its intrinsic width inside whichever column it
occupies, left-aligned, with any unused columns simply empty. This explains both the explicitly
multi-field rows (type/cluster/hazard; start/end date) **and** every lone field (national
specification, chains explanation, magnitude, record originator, hazardous event status, data
source) — a lone field's row is still grid-templated, just with 1 of N columns populated, which
looks identical to "no grid at all" once the column is empty.

**Traced specifically — `recordOriginator` does not share its row with any sibling field in
legacy**, despite the original Decision 9 table's ambiguous "shares a row" note: stepping through
`splitDefsIntoRows()` field-by-field (`attachments` → `uiRowNew: true` closes its own row;
`recordOriginator` → `uiRow: {}` opens a new row; `hazardousEventStatus` → `uiRowNew: true` closes
*that* row before anything else joins it) shows `recordOriginator` renders alone — still wrapped in
`mg-grid mg-grid__col-3` with 2 empty columns, which is what "shares a row" in the table actually
meant (shares the grid template, not a sibling field). The CA page's existing `<div className="flex
gap-4">` wrapping its lone `HazardousEventFormField` is vestigial and should simply be removed
(unwrap to a plain field, no row container needed) rather than converted to an `mg-grid` wrapper.

**Decision — fix scope, deliberately bounded, not a full re-implementation of `row_meta.tsx`'s
generic engine:** only the two fields design.md's own table already identifies as genuinely
multi-field rows get an explicit `mg-grid` wrapper:
- `HazardousEventHazardPicker.tsx`: change the `<div className="flex gap-4">` wrapping the three
  selects to `<div className="mg-grid mg-grid__col-3">`.
- `HazardousEventFormPage.tsx`: change the `<div className="flex gap-4">` wrapping
  `startDate`/`endDate` to `<div className="mg-grid mg-grid__col-2">`. **Superseded by Addendum 3
  below — this is the bug that round found live: `col-2` is wrong, the correct class is
  `mg-grid__col-3`.**
- `HazardousEventFormPage.tsx`: remove the pointless single-child `<div className="flex gap-4">`
  wrapping `recordOriginator` entirely (render the `HazardousEventFormField` directly, no wrapper).

Every other lone field already renders as a plain block with no row wrapper at all today — once the
actual stretch bug (below) is fixed, an un-gridded lone field and a 1-of-N-populated grid row are
visually indistinguishable (both show one intrinsically-sized, left-aligned control with nothing
beside it), so none of the remaining lone fields need a new `mg-grid` wrapper added. This bounded
scope is deliberate: fully replicating `row_meta.tsx`'s generic row-splitting engine for the CA form
is a larger, separate piece of work, not part of this corrective pass.

**Partially superseded by Addendum 3 below.** The "visually indistinguishable" argument above was
verified live only for non-stretching controls (`<input>`/`<textarea>`, which size to their own
intrinsic width regardless of the grid column they sit in). It does not hold for a lone `<select>`
— `hazardousEventStatus` — because `.dts-form-component select { width: 100% }` (confirmed two
paragraphs below) makes a select stretch to fill whatever width is actually available to it, which
*is* affected by whether an outer `mg-grid__col-N` wrapper exists. `recordOriginator`'s removed
wrapper (a lone text input) is unaffected and stays removed.

**The stretch bug itself, confirmed at implementation time via live `getComputedStyle` inspection
(neither leading candidate above was the cause):** `.dts-form-component` (legacy's own
`style-dts.css`, reused as-is) is itself `display: grid`. A direct grid-item control defaults to
`justify-self: stretch`, filling the full row width -- exactly the ≈1279px measured live. Legacy
never hits this because its own `WrapInput`/`Field` (`form_components.tsx`) nests the control
inside extra non-grid wrapper elements (`.dts-form-component > .form-field > label > div >
input`), so the actual `<input>` is never a *direct* grid item and sizes to its own intrinsic
width in normal block flow. CA's `HazardousEventFormField` renders `{children}` as a direct
child of `.dts-form-component` instead. **Fix, verified empirically (DOM-patch test live, then
shipped and re-measured):** wrap `{children}` in `HazardousEventFormField.tsx` with one plain
`<div>` -- no explicit width added, matching the instruction to let elements return to their
intrinsic HTML size. Confirmed post-fix on the live page: `#magnitude`/`#dataSource`/
`#recordOriginator` all measure 215.95px, `#nationalSpecification`/`#description` both measure
192.75px -- matching this section's own recorded baseline (text input ≈216px, textarea ≈193px)
to within sub-pixel rendering variance. `.dts-form-component select`'s own explicit
`width: 100%` rule (legacy's deliberate full-width select behavior) is untouched by this fix and
continues to apply.

**No spec.md changes for any of the five gaps** — same rationale as the Decision 9 discard-modal
addendum: these are presentation-only fixes (a missing CSS class, swapped locale-key usage, missing
`<label>` elements, a wrapper `className` change) with no change to any requirement's observable
capability or outcome; `specs/` already covers the behaviors these elements expose.

### Decision 9 — Addendum 3: `startDate`/`endDate` row-grouping bug, re-derived against legacy's exact algorithm (found live by the human via `getComputedStyle`, 2026-11-02, fourth round)

**The bug, confirmed live against legacy's real rendered page.** Addendum 2 (above) fixed the
`startDate`/`endDate` row's wrapper from a bare `flex gap-4` to `mg-grid mg-grid__col-2` — the
wrong class. Live `getComputedStyle` against legacy's equivalent row at
`http://localhost:3000/en/hazardous-event/new` shows `mg-grid mg-grid__col-3` with only 2 of 3
slots filled: `gridTemplateColumns: 415.987px 415.987px 415.987px`, `childCount: 2` — i.e. 2/3 of
the row's total width, not a 50/50 full-width split. `col-2` makes each field's column exactly
twice as wide as legacy's.

**The actual algorithm — quoted exactly from `app/frontend/form/row_meta.tsx`'s `rowMeta()`, the
real engine, not a reconstruction:**

```ts
let cols = uiRow.defs.length;        // number of fields sharing this row
if (cols < 3) { cols = 3; }          // ALWAYS at least 3 -- a shared row is NEVER col-2
if (uiRow.defs.length == 1) {        // only a LONE field can go below 3
  let def = uiRow.defs[0];
  if (def.key == "spatialFootprint" || def.key == "attachments") { cols = 1; }  // full width
  if (def.type == "textarea") { cols = 2; }  // half width, textarea only
  // else: stays at 3 (one-third width) -- e.g. a lone select/custom field like "Parent"
}
if (uiRow.uiRow?.colOverride) { cols = uiRow.uiRow.colOverride; }  // explicit override, rare
className = `mg-grid mg-grid__col-${cols}`;
```

Row grouping itself comes from a separate function, `app/frontend/form/types.ts`'s
`splitDefsIntoRows()`: a field with `uiRow` set opens a new row (and may carry a `colOverride`); a
field with `uiRowNew: true` also opens a new row (no override); any other field joins whatever row
is currently open. Re-walking `fieldsDef()`/`fieldsDefCommon()`
(`app/frontend/events/hazardeventform.tsx` lines 48-211) field-by-field through this function,
then `rowMeta()`, against every row in the legacy form (not just the one already found):

| Row (legacy field-def order) | Fields sharing it | `rowMeta()` result | Why |
| --- | --- | --- | --- |
| 1 | `parent` | `col-3` | lone, type `uuid` — no special case, stays at the 3-minimum |
| 2 | `hipHazardId`, `hipClusterId`, `hipTypeId` | `col-1` | `hipHazardId` carries `uiRow: { colOverride: 1 }` — the override wins regardless of the 3-field count |
| — | (inside the override) hazard type/cluster/hazard selects | `col-3` | **not from this algorithm at all** — hardcoded directly in `app/frontend/hip/hazardpicker.tsx:167`, a different, independent mechanism (see below) |
| 3 | `approvalStatus` (legacy) / CA's `workflowStatusDisplay` equivalent | `col-3` | lone, type `approval_status` — not textarea, stays at 3-minimum |
| 4 | `nationalSpecification` | `col-2` | lone textarea — the textarea special case |
| 5 | `startDate`, `endDate` | **`col-3`** | 2 fields, no override on either (`startDate`'s `uiRow: {}` has no `colOverride`/`label`) — stays at the 3-minimum. **This is the row with the bug.** |
| 6 | `description` | `col-2` | lone textarea |
| 7 | `chainsExplanation` | `col-2` | lone textarea |
| 8 | `magnitude` | `col-3` | lone, type `text` — not textarea, stays at 3-minimum |
| 9 | `spatialFootprint` | `col-1` | lone, `spatialFootprint` special case |
| 10 | `attachments` | `col-1` | lone, `attachments` special case |
| 11 | `recordOriginator` | `col-3` | lone, type `text` — not textarea, stays at 3-minimum |
| 12 | `hazardousEventStatus` | `col-3` | lone, type `enum` — not textarea, stays at 3-minimum |
| 13 | `dataSource` | `col-3` | lone, type `text` — not textarea, stays at 3-minimum |

**Where the one real bug actually lives, and why it's a single fix, not two.** The task that found
this bug asked specifically to verify the "Start date Date"/"End date Date" *value* row as a
"separate shared-row pair from the Format row." Re-read directly from legacy's own
`app/frontend/form/input.tsx` lines 286-451 (the `date_optional_precision` control, the thing each
of `startDate`/`endDate` actually renders): it returns **one block-level `<div>`** per field,
containing the Format `<select>`, the hidden input, and then (depending on `precision`) the
Date/Year/Month control(s) — all stacked vertically inside that one div, in normal block flow, not
a separate grid. There is no second, independently-classed "value row" wrapper in legacy, and
there is none in the CA port either: `HazardousEventFormPage.tsx:165`'s one
`<div className="mg-grid mg-grid__col-N">` wraps exactly two children — the whole `startDate`
`HazardousEventFlexibleDateField` and the whole `endDate` one, each of which is itself one
`flex flex-col gap-2` div containing that field's own Format-then-Value stack
(`HazardousEventFlexibleDateField.tsx:55-174`). Changing the outer wrapper's column count changes
the width available to *both* fields' Format selects and Value inputs at once, because both sit
inside the same grid column. **There is exactly one class to fix, in exactly one place:
`HazardousEventFormPage.tsx:165`, `mg-grid__col-2` → `mg-grid__col-3`.** No change is needed inside
`HazardousEventFlexibleDateField.tsx`.

**Correction to Decision 9's original row 7/8 text (struck through there, corrected here): the
"row-major... not two side-by-side column-blocks" framing was backwards.** Reading
`input.tsx:286-451` directly (this session, not previously read when that row was written) shows
legacy's real layout *is* two side-by-side column-blocks — one block-level div per field, each
holding its own Format-then-Value stack — exactly what the CA port's `HazardousEventFlexibleDateField`
already does by wrapping its children in one real element instead of a bare Fragment. **That
implementation fix (avoiding Fragment-flattening) was and remains correct; only the original row's
prose explanation of why was wrong.** No code change follows from this correction, only the
documentation fix above (row 7/8's table cell) and this note.

**Why the hazard-picker's 3-select row needed no correction, confirmed not assumed.** It is
governed by a completely different mechanism than `row_meta.tsx`: `app/frontend/hip/hazardpicker.tsx`
line 167 hardcodes `<div className="mg-grid mg-grid__col-3">` directly around its three `<select>`
elements, independent of `splitDefsIntoRows()`/`rowMeta()` (those only ever see the outer row —
`hipHazardId`/`hipClusterId`/`hipTypeId` together — which resolves to `col-1` via the override,
*not* `col-3`; the `col-3` three-select grid is nested one level inside that override, built
by hand in the picker component itself). `HazardousEventHazardPicker.tsx:77` already has
`<div className="mg-grid mg-grid__col-3">` wrapping its own three selects — a verbatim match to
`hazardpicker.tsx:167`, confirmed by reading both side by side. No fix needed. The outer `col-1`
row-level wrapper has no CA equivalent (`HazardousEventFormPage.tsx` renders
`<HazardousEventHazardPicker>` directly, no wrapping div) — harmless, since `col-1` is a single
full-width column, visually identical to no grid wrapper at all for a block-level child; not worth
adding purely for symmetry.

**Why `recordOriginator`'s already-removed wrapper needed no reversal, confirmed not assumed.**
Addendum 2 traced `splitDefsIntoRows()` and found `recordOriginator` renders alone (`col-3` per the
table above), then removed its vestigial `flex gap-4` wrapper on the reasoning that a lone,
non-stretching text input looks identical whether or not it sits inside a mostly-empty `col-3`
grid. Re-confirmed here: `recordOriginator` is `type: "text"`, and legacy's own live-measured
baseline (Addendum 2, Gap 4/5) already proved intrinsic-width inputs don't stretch to fill their
grid column regardless of that column's track width. No regression, no change needed.

**Resolved via live measurement, task 9f.5 (2026-11-03): divergence confirmed, fixed.**
`getComputedStyle(document.querySelector("#hazardousEventStatus")).width` at the same 1536px
viewport used throughout this change: legacy (`http://localhost:3000/en/hazardous-event/new`)
measures **415.987px**, inside its own `mg-grid mg-grid__col-3` row (`gridTemplateColumns:
415.987px 415.987px 415.987px`, one slot filled). CA (`http://localhost:3000/en/he-preview/new`,
before the fix) measured **1279.88px** — the full row width, no wrapper — confirming the predicted
stretch-rule divergence exactly. Fix: `HazardousEventFormPage.tsx` wraps the `hazardousEventStatus`
`HazardousEventFormField` in `<div className="mg-grid mg-grid__col-3">`, matching the table above.
Re-measured live post-fix: CA now also reads 415.987px, pixel-identical to legacy. All three
`mg-grid` rows on the CA form (hazard-picker 3-select, startDate/endDate pair, hazardousEventStatus)
now read `col-3` with `gridTemplateColumns: 415.987px 415.987px 415.987px`, matching legacy
row-for-row.

**Minor, out-of-scope observation, reported only (no spec/task follows):**
`HazardousEventFilterBar.tsx:161` (6h, already archived) also uses `mg-grid mg-grid__col-2`. It is
a different page/component, outside this change's `HazardousEventFormPage`/`HazardousEventFlexibleDateField`/
`HazardousEventHazardPicker` scope, and not obviously `row_meta.tsx`-driven (the filter bar has no
`fieldsDef`/`uiRow` concept at all) — flagged here for whoever next touches that file, not
investigated further here per this change's own scope boundary.

**No spec.md changes** — same rationale as Addendum 2: a wrapper `className` correction, not a
change to any requirement's observable capability.

### Decision 14 — `hazardousEventStatus` defaults to `"ongoing"` on create (deliberate departure from legacy, not a parity gap)

**Confirmed, user-directed: not legacy parity, a new requirement.** Legacy's own `hazardeventform.tsx`
defaults a brand-new record's `hazardousEventStatus` to `"forecasted"`; CA's create form instead
defaults it to `"ongoing"`. This is recorded here explicitly so a future contributor doing a
parity pass does not "correct" it back to match legacy — the divergence is intentional.

**Scope: a form-layer default only, not a domain-level one.** `HazardousEventFormPage.tsx`'s
`EMPTY_VALUES.hazardousEventStatus` constant is `"ongoing"` instead of `null`;
`CreateHazardousEventCommand`/`HazardousEvent`'s own domain layer still accepts `null` as a
perfectly valid value and does not itself default anything. `EMPTY_VALUES` is used only as
`new.tsx`'s own fallback when no `initialValues` prop is supplied — `edit.$id.tsx` always passes
the real stored event's `hazardousEventStatus` (including a genuine `null`) as `initialValues`, so
an existing record's value is never overridden. A future REST/CSV create path (`6d`-`6f`) composes
`CreateHazardousEventUseCase` directly, bypassing this form entirely, and will **not** inherit this
default unless that future intent adds its own equivalent — flagged here so it isn't assumed to be
covered already.

**Test requirement**: a presentation-layer test asserting the rendered `<select>`'s value is
`"ongoing"` on create with no `initialValues`; two more asserting edit with `initialValues.
hazardousEventStatus` of `null` and of `"forecasted"` both render unchanged, not overridden.

### Decision 15 — List page "Add new event" navigation button, and top-of-page count header (found live, 2026-11-02; count question resolved with the human)

**Problem, confirmed by reading the code directly.** `HazardousEventListPage.tsx` (`6a`, extended in
`6h`) has no way to reach the create route `6c` builds — a user can only reach `he-preview+/new` by
typing the URL. The roadmap always intended an "Add new event" affordance to be added "when we pick
up the intent for new event," i.e. now, as part of `6c`.

**Legacy ground truth, read directly:**

- `app/routes/$lang+/_public+/hazardous-event+/_index.tsx` (the actual list page served to
  authenticated users too, despite the `_public+` route-group name — content varies by permission)
  renders two stacked blocks above its filter bar:
  ```tsx
  <HazardEventHeader ctx totalCount={ld.data.pagination.totalItems} instanceName={ld.instanceName} />
  <DataMainLinks ctx relLinkToNew="/new" isPublic={ld.isPublic} baseRoute="/hazardous-event"
    addNewLabel={ctx.t({ code: "hazardous_event.add_new_event", msg: "Add new event" })}
    csvExportLinks={false} />
  ```
- `HazardEventHeader` (`app/components/EventCounter.tsx`): a plain
  `<div className="dts-page-intro"><h2 className="mg-u-margin-bottom--sm">{count} hazardous
  event(s) in {instanceName}</h2></div>`. `totalCount` is the **unfiltered** total
  (`pagination.totalItems`); `instanceName` is `settings?.websiteName || "DELTA Resilience"`, read via
  `getCountrySettingsFromSession(request)` — the tenant's own configured instance name, never
  hardcoded.
- `DataMainLinks` (`app/frontend/data_screen.tsx:126-159`): returns `null` entirely when `isPublic`.
  Otherwise renders
  `<div className="dts-page-intro"><div className="dts-additional-actions
  width-override-data-collection" role="navigation" aria-label="Resource actions">` containing a
  PrimeReact `<Button id="add_new_event_link" className="mg-button mg-button--small
  mg-button-primary" label="Add new event" visible={canAddNewRecord(role)} onClick={...navigates to
  baseRoute + relLinkToNew...}>`.
- `canAddNewRecord(role)` (`app/frontend/user/roles.ts:416-424`): `false` when `!role` or
  `role === "data-viewer"`, `true` otherwise. **Confirmed equivalent to `roleHasPermission(role,
  "EditData")`** by reading `roles.ts`'s own permission tables (lines 339-364): `data-viewer` has no
  `EditData` entry; `data-collector`, `data-validator`, and `admin` all do. Same effective rule,
  already the gate `6c`'s own loaders/actions use throughout (not the legacy HOC) — no new permission
  concept needed.
- Confirmed live via screenshot: both blocks are stacked, count block top-left on its own row,
  "Add new event" button top-right on the next row, both above the filter bar.

**CA page's current state, read directly from `HazardousEventListPage.tsx`:** has neither block. It
already has a *different* count mechanism from `6h` — the `list.showing_of_total` line
(`"Showing {{filtered}} of {{total}} hazardous event(s)"`), positioned **below** the
`HazardousEventFilterBar`, showing filtered-count-of-unfiltered-total (`6h`'s own Decision 13). This
is not the same component, position, or phrasing as legacy's `HazardEventHeader`.

**Decision, button only — build now, not blocked on anything. Placement: the list ROUTE, not the
shared `HazardousEventListPage` component — a correctness requirement, not a style choice.**
`HazardousEventListPage` is reused by `HazardousEventPickerPage` for the parent-picker popup
(Decision 13) — confirmed by reading `picker.tsx`'s loader and `HazardousEventPickerPage.tsx`
directly: the picker route is itself `EditData`-gated (`requireEditDataPermission`), so *every* user
who reaches the picker popup already has `EditData`, and the picker passes the loader's `role`
straight through as `data.role` with no override. If the button were added inside
`HazardousEventListPage` keyed on `roleHasPermission(role, "EditData")`, it would unconditionally
render inside the parent-picker popup too — navigating the popup window to the create form, a real
UX bug, not a cosmetic gap. Legacy itself never has this problem because it renders `HazardEventHeader`/
`DataMainLinks` directly in the route file (`_public+/hazardous-event+/_index.tsx`), never inside the
shared `hazardeventlist.tsx` component both the list and picker reuse — confirmed by reading that
route file directly (both components are rendered in the route's own JSX, not passed down into or
rendered by the list component). This change follows the same split, not a new one:

- **New component, route-local, not inside `HazardousEventListPage`**:
  `app/domains/hazardous-events/presentation/web/HazardousEventListActions.tsx`, exporting
  `HazardousEventListActions({ role }: { role?: string | null })`. Rendered only by
  `app/routes/$lang+/_authenticated+/he-preview+/_index.tsx`'s default export, as a sibling
  *before* `<HazardousEventListPage data={data} />` (not passed into it as a prop) — `picker.tsx`'s
  own default export is untouched and never renders this component, so the picker popup is
  structurally incapable of showing the button, not merely gated by a role check that happens to
  always pass there.
- No `Button`-equivalent exists yet in `app/design-system/components/` (checked: `Checkbox`,
  `Combobox`, `DateRangePicker`, `Link`, `Select`, `Table`/`TableCell`/`TableColumn`/`TableRow` —
  no `Button`). `HazardousEventListPage.tsx` itself already renders real navigation elements with
  hardcoded legacy CSS classes, not a component abstraction — the pagination controls use
  `RouterLink` with `className="mg-button mg-button--small mg-button-ghost"`, and the actions column
  uses the design-system `Link` with `className="mg-button mg-button-table"`. The new component
  follows the same idiom: a plain `RouterLink` (from `react-router`) to `ctx.url("/he-preview/new")`,
  with `className="mg-button mg-button--small mg-button-primary"` — the exact class legacy's own
  `add_new_event_link` `<Button>` uses, reused as a token, not a hardcoded pixel value, per the
  standing no-hardcoded-styles rule.
- Wrapper markup matches legacy's `DataMainLinks` exactly: `<div className="dts-page-intro"><div
  className="dts-additional-actions width-override-data-collection" role="navigation"
  aria-label={t("list.resource_actions")}>` — reusing the `width-override-data-collection` modifier
  `HazardousEventListPage.tsx` already applies to its own `<Table>`, and the `dts-page-intro` wrapper
  class legacy uses for both of its own stacked blocks.
- Role gate: only rendered when `roleHasPermission(role, "EditData")` is true, given the `role` prop.
  `role` is already returned by `_index.tsx`'s loader (`{ items, totalCount, unfilteredTotalCount,
  taxonomyOptions, role }`) — no new loader plumbing needed. `roleHasPermission`
  (`~/frontend/user/roles`) is a plain, pure, isomorphic function (no `.server.ts` suffix, no
  server-only import) — safe to call directly inside this presentation component, same as legacy's
  own client-side `canAddNewRecord(ctx.user?.role ?? null)` call.
- Target: `he-preview+/new` (`6c`'s own create route — `ctx.url("/he-preview/new")`), never legacy's
  `/hazardous-event/new`.
- i18n: new `list.add_new_event` ("Add new event") and `list.resource_actions` ("Resource actions" —
  the wrapper's `aria-label`, matching legacy's own `record.resource_actions` text exactly) keys in
  `locales/en/hazardous-events.json` and `locales/fr/hazardous-events.json` — same namespace
  (`hazardous-events`) the rest of this file's strings already use, not a new namespace.
- No layout-wrapper change: the list route (`_index.tsx`) already wraps this page in `MainContainer`
  (confirmed by reading the route file) — the new component renders inside that wrapper, alongside
  `HazardousEventListPage`, not instead of it.

**Open question, now RESOLVED with the human (2026-11-02).** Decision: **add** the top-of-page block,
replicating `HazardEventHeader` — an unfiltered-total `<h2>` reading "{count} hazardous event(s) in
{instanceName}" — and **keep** `6h`'s existing `list.showing_of_total` line below the filter bar
**unchanged**. Both stay; they are not redundant. The human's own re-check of the live legacy page
(scrolled the full page including the pagination footer) confirmed legacy itself only ever has the
one top count — so this was never a question of legacy having two blocks. It is a question of
whether the *new* CA page should have two different-purpose blocks: the top one is an
always-unfiltered, position-fixed total (answers "how many events exist in this tenant, period");
the lower one is filtered-of-unfiltered (answers "how many of those match my current filters").
These are genuinely different questions, not two phrasings of the same one — confirmed, not merely
asserted, by re-reading both components' own text: `HazardEventHeader`'s count never changes when
filters change (it isn't filter-aware at all — it receives `pagination.totalItems`, independent of
any filter state), while `list.showing_of_total`'s `filtered` value is exactly what moves when a
filter is applied. Keeping both gives a user two different, useful numbers, not one number said
twice.

**Implementation, resolved — reuse the existing value, do not add a second query.** `6h`'s own lower
line already receives `unfilteredTotalCount` from `ListHazardousEventsUseCase`'s result (Decision 13)
— `_index.tsx`'s loader already returns it (`{ items, totalCount, unfilteredTotalCount,
taxonomyOptions, role }`). The new top block's count is the *same* `unfilteredTotalCount` value,
threaded to a second place it's displayed — not a second call to
`ListHazardousEventsUseCase`/`listHazardousEventsUseCase.execute()`, and not a new
`pagination.totalItems`-shaped field. One value, two presentations.

**New: `instanceName`.** Neither `6a` nor `6h` ever fetched this — it's new to this decision.
`_index.tsx`'s loader gains one additional call,
`const settings = await getCountrySettingsFromSession(request);` (`~/utils/session` — a plain
shared session utility, not legacy-domain-specific; already imported by other CA-adjacent route
loaders, e.g. the disaster-record `_index.tsx` routes use the identical pattern), then
`instanceName: settings?.websiteName || "DELTA Resilience"` — the exact same fallback string legacy
uses, returned alongside the loader's existing fields. No new port/use-case: this is a session-read,
the same class of concern `resolveTenantId`/`requireUser` already are at this layer, not a
domain-layer query.

**New component, route-local — mirrors legacy's own two-component split.** Legacy keeps
`HazardEventHeader` (count) and `DataMainLinks` (button) as two separate components, both rendered
directly in the route file. This decision does the same, for the same reason given above for the
button alone (the picker-popup bug) — plus simple single-responsibility: the count header has
nothing to do with the button's role-gating.

- `app/domains/hazardous-events/presentation/web/HazardousEventListHeader.tsx`, exporting
  `HazardousEventListHeader({ totalCount, instanceName }: { totalCount: number; instanceName:
  string })`. Ports `HazardEventHeader` exactly:
  `<div className="dts-page-intro"><h2 className="mg-u-margin-bottom--sm">{t("list.count_in_instance",
  { count: totalCount, instance: instanceName })}</h2></div>`. No role gate (legacy's own
  `HazardEventHeader` has none — it renders unconditionally whenever the route itself is reachable).
- `app/routes/$lang+/_authenticated+/he-preview+/_index.tsx`'s default export renders both new
  components, in legacy's own confirmed stacking order (screenshot-verified: count block first, on
  its own row; "Add new event" button next, on the row below; both above the filter bar):
  `<HazardousEventListHeader totalCount={data.unfilteredTotalCount} instanceName={data.instanceName} />`,
  then `<HazardousEventListActions role={data.role} />`, then `<HazardousEventListPage data={data} />`.
  Neither new component is wired into `picker.tsx` (same reasoning as the button: the picker is a
  popup for selecting a parent event, not a place to show tenant-wide counts or offer event
  creation).
- i18n: new `list.count_in_instance` key ("{{count}} hazardous event(s) in {{instance}}") in
  `locales/en/hazardous-events.json` and `locales/fr/hazardous-events.json`, interpolation params
  matching the existing `list.showing_of_total` convention (`{{filtered}}`/`{{total}}`) in the same
  file.

### Decision 16 — HE detail page: "Edit" link and "Add hazardous event caused by this event" link (found live, 2026-11-02; corrected 2026-11-02 — Edit is status-aware, add-cause is role-only)

**Problem, confirmed by reading the code directly.** `HazardousEventDetailPage.tsx` (`6a`) has
neither an "Edit" affordance nor a way to create a new event as this one's effect — a user can only
reach `he-preview+/edit/{id}` or `he-preview+/new?parent={id}` by typing the URL.

**Correction (Gate 9 live-comparison finding, same day): the Edit link IS status-aware — the
original reading below cited the wrong component.** The first pass of this decision read
`app/frontend/form/view_main_data_collection.tsx` and concluded the Edit link was role-only, not
status-aware. A live comparison against `/en/hazardous-event/{id}` for a `waiting-for-validation`
record, logged in as `admin`, showed no Edit button at all — only "Validate or Return" — which sent
this back to the code. `hazardeventform.tsx` (HE's actual legacy view) imports
`ViewComponentMainDataCollection` from `app/frontend/components/data-collection/View.tsx`, a
*different* file from the one originally cited. `View.tsx`'s own Edit link (lines 624-639):

```tsx
<LangLink
  visible={canEditDataCollectionRecord(ctx.user?.role ?? null, props.approvalStatus)}
  lang={ctx.lang}
  to={`${props.path}/edit/${String(props.id)}`}
  className="mg-button mg-button-secondary"
  style={{ margin: "5px" }}
>
  {ctx.t({ code: "common.edit", msg: "Edit" })}
</LangLink>
```

`canEditDataCollectionRecord` (`app/frontend/user/roles.ts` lines 487-520) is status-aware: `false`
for `!role`, `false` for `data-viewer`, `false` when `approvalStatus` is `waiting-for-validation`
(locked for *every* role, not just data-viewer), `false` when `published`/`validated`, `true`
otherwise — i.e. editable only for `draft`/`needs-revision`. This is the exact rule
`requireStatusAwareEditPermission.server.ts` already implements for the edit route's own loader
(Decision 2) — that file's own doc comment already correctly names
`canEditDataCollectionRecord` as its source. **The detail page's Edit link therefore reuses that
same predicate**, extracted to an isomorphic `isStatusAwareEditBlocked.ts` (new file, no
`.server.ts` suffix so the presentation component can call it too) so both call sites share one
source of truth instead of two copies of the same rule.

**The "Add hazardous event caused by this event" link is a separate, role-only gate — confirmed
still accurate, unaffected by the Edit-link correction above.** Read directly from
`hazardeventform.tsx` lines 730-746 (`HazardousEventView`'s own `extraActions`, rendered
unconditionally by `View.tsx` regardless of `approvalStatus` — confirmed live too):

```tsx
<LangLink
  visible={canAddNewRecord(ctx.user?.role ?? null)}
  lang={ctx.lang}
  to={`${route}/new?parent=${item.id}`}
>
  {ctx.t({ code: "hazardous_event.add_cause", msg: "Add hazardous event caused by this event" })}
</LangLink>
```

`canAddNewRecord` (`roles.ts` lines 416-424) is a flat role check — `false` for `!role`/`data-viewer`,
`true` otherwise — the correct gate for *creating* a new event, not an edit-permission question on
the existing one, so using the create-side check here (not the edit-side one) is itself legacy's own
deliberate choice, reproduced as-is. Unlike the Edit link, this one genuinely has no status
dependency anywhere in its own render path.

**Decision: add-cause is a flat `roleHasPermission(role, "EditData")` gate; Edit is that same gate
AND `isStatusAwareEditBlocked` (the extracted `canEditDataCollectionRecord` predicate) — matching
legacy exactly.** Decision 2's status-aware gate at the edit route's own loader is untouched and
stays the authoritative, server-side enforcement point — the detail-page Edit link's own gate is a
presentation-layer convenience matching what legacy shows, not a new enforcement layer; a request
that reaches `edit.$id.tsx` directly (bypassing the link) is still blocked there regardless of
whether this link's own check agrees.

**The create route's `?parent=` pre-fill mechanism already exists — no new plumbing needed for the
second link.** Read directly from `app/routes/$lang+/_authenticated+/he-preview+/new.tsx` lines
26-70: the loader already resolves `?parent=` via `GetHazardousEventByIdUseCase` (tenant-scoped,
reused), and the action (lines 73-191) already passes `parsed.causeId`/`parsed.causalityExplanation`
through to `CreateHazardousEventUseCase.execute()`. `CreateHazardousEventCommand.causeId` has been
present since Decision 4 — this is not new application-layer work, only a new link on the detail
page pointing at an already-built destination. The intent's own framing ("confirm whether the CA
create route needs a new query-param-driven pre-fill mechanism it doesn't have today") is answered:
it already has one.

**Implementation shape, route-local, not inside the shared component — same split as Decision 15
used for the list page, for the same reason.** `$id.tsx`'s loader currently discards the role
`requireViewDataPermission` already returns (`await requireViewDataPermission({ request });`,
ignoring the return value) — it must instead capture it (`const role = await
requireViewDataPermission({ request });`) and return it alongside the detail DTO, the same shape
`6a`'s list loader already uses for its own `role` field. `HazardousEventDetailPage.tsx` renders both
new links directly (this page has no parent-picker-style reuse concern the way `HazardousEventListPage`
does — grepped for other render sites of `HazardousEventDetailPage`; `$id.tsx` is its only caller):

- A right-aligned block, placed after the existing back-link (`<p><Link href={ctx.url("/he-preview")}>...`)
  and before the `<h5>` heading — matching legacy's own placement (`View.tsx`'s Edit link sits in a
  `<div style={{ textAlign: "right" }}>` immediately after the back-link paragraph and before the
  `<h2>` title). Use the design system's existing `Link` component and a Tailwind `text-right`
  utility in place of legacy's inline `style={{ textAlign: "right" }}`, per the standing
  no-inline-styles rule this file's own header comment (line 5) already follows. The block itself
  renders whenever `roleHasPermission(role, "EditData")` is true (the add-cause link's own gate),
  so it can still show the add-cause link alone when the Edit link is status-blocked.
- Inside that block, in legacy's own order: the Edit link first (`mg-button mg-button-secondary`,
  text from `t("detail.edit")`, target `ctx.url(`/he-preview/edit/${data.id}`)`) — rendered only
  when `roleHasPermission(role, "EditData")` AND `!isStatusAwareEditBlocked(role, data.workflowStatus)`
  — then the "Add hazardous event caused by this event" link (plain text link, no button class —
  legacy's own `extraActions` renders it as a bare `<LangLink>` inside a `<p>`, not a button — text
  from `t("detail.add_cause")`, target `ctx.url(`/he-preview/new?parent=${data.id}`)`), rendered
  whenever the block itself renders (role-only, no status check).
- Neither link renders when `role` is `null`/`undefined` (an unauthenticated/no-permission session
  never reaches this loader in the first place, since `requireViewDataPermission` already 403s it —
  the gate here is defense-in-depth for a `ViewData`-but-not-`EditData` role, matching legacy's own
  two-permission split exactly).
- i18n: new `detail.edit` ("Edit") and `detail.add_cause` ("Add hazardous event caused by this
  event") keys in `locales/en/hazardous-events.json` and `locales/fr/hazardous-events.json`, same
  namespace the rest of this page's strings already use.

### Decision 17 — HIP legacy anti-corruption layer: closing a confirmed, currently-live cross-domain data gap (found live + via code research, 2026-11-02)

**Root cause, confirmed, cite don't re-derive.** `DrizzleHazardousEventRepository.server.ts`'s
`toRow()` (line 99's own comment: `"Strict subset of the table's columns -- excludes legacy
approval/HIP/attachments-JSONB (Decision 4)"`) never sets `hipHazardId`/`hipClusterId`/`hipTypeId`
on either `insert()` (line 584) or `update()` (line 612) — confirmed by reading both methods
directly: `insert()` passes `toRow()`'s result straight to `.values()`, so the three HIP columns
fall through to the DB's own `NULL` default; `update()` destructures `row` into `setFields` which
never contained those keys either, so `.set(setFields)` never includes them in the generated SQL,
leaving whatever a legacy-origin row already had untouched (irrelevant here — every CA-created row
starts with all three already `null`). This was a previously reviewed, accepted trade-off
(`openspec/changes/archive/2026-10-15-ca-he-drizzle-repository-core/design.md` Decision 7),
explicitly flagged there as "not evaluated exhaustively." This session traced the actual blast
radius and found it is much bigger than that flag assumed.

**Confirmed, currently-live production impact — read directly, not hypothesized:**

- `app/backend.server/services/disaster-event/linkedHazardousEventOptions.ts` lines 7-41 — the most
  important one. `formatHazardousEventOption()` builds `displayName` purely from
  `event.hipHazard?.name || event.hipCluster?.name || event.hipType?.name` (via
  `localizedHipName`) — never from `specificHazard`. These three fields are themselves Drizzle
  relational reads (`hazardousEventRel`'s `hipHazard`/`hipCluster`/`hipType` one-relations, already
  defined in `hazardousEventTable.ts` lines 89-100, joining on the very `hipHazardId`/`hipClusterId`/
  `hipTypeId` columns this gap leaves `null`). A CA-created event therefore shows a blank, unsearchable
  name in Disaster Events' own hazardous-event link picker today — Disaster Events is not migrated to
  CA yet and actively uses this picker in production.
- `app/backend.server/models/analytics/hazardImpact.ts` lines 191-425 — damages/losses/event-count-
  by-hazard-type charts group a CA event under `NULL`, or it vanishes from the chart entirely.
- `app/backend.server/models/analytics/ImpactonSectors.ts` lines 225-257 — HIP-keyed filter
  conditions silently no-op for a CA event (neither matched nor excluded correctly).
- `app/backend.server/models/analytics/mostDamagingEvents.ts` line 267 — a join on `hipHazardId`
  breaks (produces no row) for a CA event.
- `app/routes/$lang+/disaster-record+/content-picker-config.tsx` line 110 and
  `app/routes/$lang+/analytics+/content-picker-config.tsx` line 113 — dashboard widget pickers reusing
  the same HIP-keyed query shape.
- `app/backend.server/utils/hazardFilters.ts` — the shared hazard-filter/search utility every one of
  the above (and more) composes; entirely HIP-based.
- `app/db/queries/hazardousEventRepository.ts` lines 71-88 — keyword search runs `ilike` over
  `hip_hazard`/`hip_cluster`/`hip_class` columns; a CA event is unsearchable by keyword there.
- None of these seven files are in the deferred-items register or any `design.md` today. `DEF-008`'s
  planned analytics rewrite (tracked separately, `6g`) covers only `effectDetails.ts`/
  `geographicImpact.ts` — two different files, not any of the above seven.
- **Not investigated yet, explicitly flagged, not blocking this change:** the REST/JSON API
  (`app/routes/$lang+/api+/hazardous-event+/list.ts`) and CSV export/import payload shape may carry
  the identical dependency. Flagged for a human to check before HE's Phase 7 sign-off if not
  resolved by then — recorded in `DEF-055` below, not silently dropped.

**The fix mechanism, mechanically confirmed complete.** `hazardTypeTable`, `hazardClusterTable`, and
`specificHazardTable` (`app/domains/hazardous-events/infrastructure/{hazardTypeTable,hazardClusterTable,specificHazardTable}.ts`)
each carry their own `sourceRefId: text(...).unique()` — the original legacy HIP id (`hip_class.id`/
`hip_cluster.id`/`hip_hazard.id` respectively) each row was migrated from. `hazardousEventTable`'s
own `hipHazardId`/`hipClusterId`/`hipTypeId` columns (`app/utils/drizzleUtil.ts`'s
`hipRelationColumnsOptional()`, lines 92-104) are `text`, each with a real FK
(`hazardous_event_hip_{hazard,cluster,type}_id_hip_{hazard,cluster,class}_id_fk`) to
`hipHazardTable`/`hipClusterTable`/`hipTypeTable`'s own `text` primary keys — the exact same type as
`sourceRefId`, no cast needed. A full crosswalk exists: given a `specificHazardId`, resolve its own
`sourceRefId` (→ `hip_hazard_id`), its cluster's `sourceRefId` (→ `hip_cluster_id`), and its cluster's
type's `sourceRefId` (→ `hip_type_id`).

**Defensive requirement, found during this session's own schema read, not in the original intent
framing — a dangling `sourceRefId` must not become a blocked create.** Every HIP column carries a
real FK constraint. A `sourceRefId` is a plain `text` value with no FK of its own enforcing it still
matches a live `hip_hazard`/`hip_cluster`/`hip_class` row — if HIPs taxonomy data were ever edited
after migration (not expected, but not provably impossible either), a stale `sourceRefId` fed
straight into an INSERT/UPDATE would violate the HIP column's FK and roll back the entire create —
turning a reporting gap into a hard outage. **Resolution**: the resolver's own query validates each
non-null `sourceRefId` against the real `hip_hazard`/`hip_cluster`/`hip_class` table (an existence
join, not a blind pass-through) and resolves to `null` for any level whose `sourceRefId` doesn't
match a live row — the same "null when we can't honestly resolve it" treatment as a genuinely-absent
`sourceRefId`, never a value that could fail the FK.

**Chosen mechanism (Option (c) of three considered) — a dedicated, self-contained ACL port, not a
domain-entity field and not a new parameter threaded through the main repository.**

| Option | Verdict |
| --- | --- |
| (a) Add `hipHazardId`/`hipClusterId`/`hipTypeId` to the `HazardousEvent` domain entity | Rejected — puts a legacy, migration-era concept into the domain the archived `ca-he-drizzle-repository-core` change deliberately kept HIP-free (its own Decision 4/7); the domain's HIP-free shape is a decision this change must not quietly reverse. |
| (b) Extra parameter on `IHazardousEventRepository.insert`/`update`, written inside `toRow()`/`setFields` | Works, but permanently changes the main repository port's signature for a feature explicitly meant to be deleted whole once every dependent domain migrates — removal later would mean editing the main repository again, not a clean one-shot deletion. |
| **(c) Dedicated ACL port (`resolve`+`stamp`), its own adapter/token/module wiring, called from the use-case layer after the main repository write, inside the same transaction — chosen** | The main repository, its port, and the domain entity are never touched. Every line of this feature lives in its own new files plus two call sites inside the two use cases — deleting the whole feature later is deleting those files and those two call sites, nothing else to clean up. |

```ts
// app/domains/hazardous-events/application/ports/IHipCrosswalkPort.ts
export interface HipCrosswalkIds {
  readonly hipHazardId: string | null;
  readonly hipClusterId: string | null;
  readonly hipTypeId: string | null;
}

/** TEMPORARY migration-era scaffolding (DEF-055) -- bypasses IHazardousEventRepository/
 * HazardousEvent entirely by design (Decision 17). Delete this file, its adapter, its token, its
 * module wiring, and its two call sites in CreateHazardousEventUseCase/UpdateHazardousEventUseCase
 * in one shot once every dependent domain (Disaster Events, analytics) no longer reads
 * hip_hazard_id/hip_cluster_id/hip_type_id off hazardous_event. */
export interface IHipCrosswalkPort {
  /** Pure read, no tx -- taxonomy rows are immutable at request time, same precedent as
   * IHazardTaxonomyRepository's own pre-transaction lookups in both use cases. Null for any level
   * whose sourceRefId is itself null, OR whose resolved value has no matching row in the live
   * hip_hazard/hip_cluster/hip_class table (dangling sourceRefId -- defensive, see above). */
  resolve(specificHazardId: string): Promise<HipCrosswalkIds>;

  /** Direct UPDATE of hazardous_event's three HIP columns only, tenant-scoped, by id. MUST run
   * inside the same tx as the event write it follows -- never called standalone. */
  stamp(eventId: string, tenantId: string, ids: HipCrosswalkIds, tx: Tx): Promise<void>;
}
```

`DrizzleHipCrosswalkAdapter.server.ts` implements both: `resolve()` is one query joining
`specific_hazard` → `hazard_cluster` → `hazard_type` for their three `source_ref_id` values, each
additionally existence-checked against `hip_hazard`/`hip_cluster`/`hip_class` (left join, `null` the
result when unmatched); `stamp()` is a plain `UPDATE hazardous_event SET hip_hazard_id = ?,
hip_cluster_id = ?, hip_type_id = ? WHERE id = ? AND country_accounts_id = ?` against the given `tx`.

**Wiring — `CreateHazardousEventUseCase`.** New constructor dependency, `hipCrosswalkPort:
IHipCrosswalkPort`. `resolve(command.specificHazardId)` is called before `transactionRunner.run()`
(alongside the existing pre-transaction `taxonomyRepository.findValidHazardDriverIds`/
`findValidCustomFieldDefinitionIds` calls — same "pure read, no tx needed" class of call already
established in this file). Inside the transaction, immediately after `const saved = await
this.hazardousEventRepository.insert(newEvent, tx);`, add `await
this.hipCrosswalkPort.stamp(saved.id, command.tenantId, hipCrosswalkIds, tx);` — same transaction as
the event/workflow/spatial-observation writes, no new atomicity gap.

**Wiring — `UpdateHazardousEventUseCase`, and the "always re-stamp" resolution.** Same new
constructor dependency. `resolve(updatedEvent.specificHazardId)` — the final, merged value (command's
new id when provided, else the existing event's own), not `command.specificHazardId` directly, since
that field is optional on update — is called before `transactionRunner.run()`, right after
`updatedEvent` is built. Inside the transaction, immediately after `const saved = await
this.hazardousEventRepository.update(updatedEvent, existingEvent.updatedAt, tx);` succeeds (the
optimistic-lock-guarded call — see concurrency note below), add the matching `stamp()` call.

**Decided: stamp on every update, unconditionally — not only when `specificHazardId` changes.** The
alternative (re-stamp only when `specificHazardId` is present in the command and differs from the
existing value) would be cheaper but depends on an unverified assumption: that Phase M's own backfill
originally derived every legacy row's `specific_hazard_id` from its `hip_hazard_id` through this exact
same crosswalk, so the two agree by construction today. That backfill is a separate, parallel
workstream this change does not own and has not inspected — resting correctness on an assumption
about it is exactly the kind of guess this project's standing rule against assuming is written to
prevent. Unconditional re-stamping is self-evidently correct regardless of that assumption (it always
derives the three HIP ids fresh from whatever `specificHazardId` the event currently holds, on every
save) at the cost of one extra `SELECT` per update — accepted. This also directly satisfies the
requirement that an edit changing `specificHazardId` to a hazard with a `null`-resolving crosswalk
level must write an explicit `NULL` there, not leave a now-stale non-null value behind:
`stamp()`'s `UPDATE ... SET hip_hazard_id = ?, ...` always sets all three columns to whatever
`resolve()` just returned, including `null`, every time it runs.

**Concurrency — no new mechanism needed, confirmed by reading the call order, not assumed.** `stamp()`
is only ever called after `hazardousEventRepository.update()` has already resolved successfully.
`update()`'s own optimistic-lock check (`expectedUpdatedAt`) means the losing caller in a concurrent-
edit race gets a `ConcurrentModificationError` thrown from inside `update()` itself and never reaches
the `stamp()` call at all — so two concurrent updates can never produce a row with one writer's
`specificHazardId`-derived content and the other writer's HIP ids; the existing "two simultaneous
edits of the same event" scenario (the "Concurrent-callers rule applies" bullet below, already
specified) already covers this by construction, and gains one more assertion: the losing caller's
`stamp()` is never invoked
(verifiable via a spy on the fake `IHipCrosswalkPort`).

**Explicitly NOT touched — the whole point.** None of the seven consumer files listed above are
modified by this change. This is deliberate, matching the user's own standing instruction against
modifying the legacy implementation: the fix is entirely upstream (populate the columns those files
already read), so the legacy/cross-domain side needs zero changes.

**Explicitly temporary, not permanent architecture.** `IHipCrosswalkPort.ts`'s own doc comment (above)
states this plainly; this design.md section is the second half of that record. `DEF-055` (deferred-
items register) is the tracked removal item, cross-referencing all seven consumer files so whoever
revisits it — once Disaster Events, analytics, and the rest have their own Clean Architecture
migrations and stop reading `hip_hazard_id`/`hip_cluster_id`/`hip_type_id` off `hazardous_event`
entirely — has the map already made, rather than re-deriving it.

**Residual gaps, noted, not blocking:**

- A taxonomy entry whose own `sourceRefId` (at any of the three levels) is itself `null` — e.g. a
  `specific_hazard`/`hazard_cluster`/`hazard_type` row added after the original HIPs-migration
  backfill, which never had a legacy HIP id to carry forward — resolves to `null` for that level,
  narrower than today's "every CA event" gap but not eliminated entirely. Not fixable by this
  change (there is no legacy HIP id to resolve for a taxonomy entry that postdates HIPs); any
  consumer still reading that column for such an event sees the same blank/vanish behavior this
  change fixes for every pre-existing taxonomy entry.
- Events created through `6c`'s own create route before this fix lands keep `null` HIP columns —
  `6c` is unmerged, so this is expected to be dev-environment-only data, not production data; no
  backfill is added by this change (any real backfill is Phase M's own parallel workstream, out of
  this change's scope).
- The REST/JSON API and CSV import/export residual check (above) — tracked in `DEF-055`, not
  resolved here.

**Verification requirement — an end-to-end scenario against the real, untouched consumer, not just
unit coverage of the new port.** A PGlite integration test creates an event via
`CreateHazardousEventUseCase.execute()` with a `specificHazardId` whose full ancestor chain has
non-null `sourceRefId`s, then calls the real, unmodified
`queryLinkedHazardousEventOptions`/`formatHazardousEventOption` (or the underlying Drizzle relational
query it composes) against that same event, and asserts a non-blank `displayName` — proving the
"zero consumer changes needed" claim empirically, not just by reading the code.

- A status-transition write failure after a committed create/update is possible and must surface
  as a partial-success response, not a 500 — covered by its own named test scenario (Decision 3,
  "Test requirement").
- **[Risk] `REQUIRED_SET` relaxation (Decision 5/6) could, in principle, mask a genuinely-invalid
  `APPROVED`/`PUBLISHED` row that's missing *every* attribution pair (e.g. a data-corruption case
  that predates this change).** → Mitigation: `REQUIRED_NULL` and the split-pair check are unaffected
  and still catch any row with an inconsistent pair; the relaxation only widens which *complete*
  shapes are accepted, it doesn't stop checking consistency within each pair.
- **[Risk, downgraded — now covered at its authoritative layer] Server-side role-gating for
  direct-validate/direct-publish (Decision 2) is new code with no legacy precedent for
  `submit-validate`'s own role check (legacy never had one).** Originally mitigated only by a
  route-level PGlite scenario; now that `ProcessWorkflowActionUseCase.execute()` itself is the
  authoritative check (not just `6c`'s route), the risk is covered at two layers: the route-level
  PGlite scenario (non-admin attempts `direct-validate`/`direct-publish` through the route, asserts
  `403` and that `ProcessWorkflowActionUseCase.execute` is never called) and new unit tests directly
  on `ProcessWorkflowActionUseCase.execute()` (`ProcessWorkflowAction.test.ts`) asserting it rejects
  both actions with `AuthorizationError` when `actingUserRole` is anything other than `"admin"`,
  including `undefined`, without calling `workflowRepository.findByEntity` — the invariant is now
  verified directly where it's enforced, not only observed indirectly through the route.
- **Concurrent-callers rule applies — this change writes data.** Two scenarios, both already
  supported by the existing `expectedUpdatedAt` mechanism and requiring no new production code, only
  new tests:
  - **Two simultaneous edits of the same event**: `UpdateHazardousEventUseCase.execute()` passes
    `existingEvent.updatedAt` as `expectedUpdatedAt`; the second writer to commit must reject with
    `ConcurrentModificationError`.
  - **Two simultaneous workflow-transition submits on the same entity**: `ProcessWorkflowActionUseCase.execute()`
    passes `existing.updatedAt` the same way; the second caller must reject with
    `ConcurrentModificationError`, not silently apply a transition against stale state. This now also
    covers two callers racing on the *same new* action (e.g. two admins both attempting
    `direct-publish` on the same `DRAFT` event at once).
- **[Risk, materialized once, now mitigated] UI scope (Decision 12) is categorically larger than
  `6a`'s own list/detail pages**, which took seven rounds of parity correction after live-page
  comparison. A full create/edit form with a modal-driven save/submit workflow is bigger still. →
  Mitigation: tasks.md Section 5 breaks the form into one task per content/validation/layout concern
  (Decision 9's own table), not a single "build the form" task, and Gate 9 checks the rendered
  result against Decision 9's checklist item by item. **This risk materialized**: the first Gate 9
  pass missed three real discrepancies against legacy — the date-precision selector (row 7/8 had
  already flagged "confirm at implementation time" but that confirmation didn't happen), the
  hazard-name filter box (not in the checklist at all), and the save/submit modal's icon badges (not
  in the checklist at all) — found only by a second, independent live-browser comparison. All three
  are now fixed (this table's own rows 2-4/7-8 and the "Interaction" section above) and the
  checklist itself was updated with the concrete detail that was previously missing, specifically so
  a future Gate 9 pass has something concrete to check against instead of re-deriving it from the
  live page again.
- **[Found at implementation time] `GetHazardousEventByIdUseCase`'s DTO carried no current-cause
  field.** The edit form has no way to prefill "currently linked to parent X" without one, and a
  plain hidden `causeId`/`spatialObservation` field re-posted unchanged on every save cannot be
  told apart from an intentional clear/edit. → Resolution, two parts:
  - `ICausalChainRepository` gains `findCauseEdge(effectId)` (Drizzle: a plain `SELECT` by
    `effect_hazardous_event_id`, relying on `replaceCauseEdge`'s own delete-then-insert shape to
    guarantee at most one row). `GetHazardousEventByIdUseCase` resolves it, looks up the cause
    event + its taxonomy name, and adds `cause: { id, displayName, causalityExplanation } | null`
    to `HazardousEventDetailDto` — additive, same pattern as the `REQUIRED_SET` change following
    from Decision 6.
  - `edit.$id.tsx`'s action only passes `causeId`/`causalityExplanation` through to
    `UpdateHazardousEventCommand` when a hidden `causeIdChanged` field is `"1"` (set only when
    Section 9's "Change"/"Unset" controls are used), and only passes `spatialObservation` through
    when a hidden `spatialObservationChanged` field is `"1"` (set only when the spatial-footprint
    widget is actually edited). Section 9's parent/spatial-footprint components MUST set these
    flags on user interaction, not on every render.
- **[Found at implementation time] No domain `ValidationError` carries a structured field key.**
  Every throw site in `HazardousEvent.ts` passes only a message string (e.g. `"startDate must not
  be later than endDate"`), no `context: { field }`. Task 9.10 needs a per-field error map to
  render inline, so the route layer — not the domain — infers the field from the message's own
  leading-word convention (`/^(\w+)\s/`, checked against this form's known field names; no match
  falls back to a non-field-specific message). This is a heuristic, not a structured contract —
  a future domain-error-shape change could silently break it. Chosen over editing every throw
  site in `HazardousEvent.ts` to keep this change's domain-layer footprint to what Decisions 1-11
  already called for.
- **[Confirmed data-loss bug, deferred to an immediate follow-up intent — `DEF-054`] Attachments
  (Decision 9 row 13) are silently dropped on every save, not merely missing a CA-native upload
  path.** `HazardousEventAttachmentProps`/`hazardousEventAttachmentTable` (`id`/`title`/`fileKey`/
  `fileName`/`fileType`/`fileSize`) is a real, already-existing CA-native table — but the reused
  `AttachmentsFormView`/`ContentRepeater` widget actually submits items shaped
  `{title, tag, file_option, file: {name, tenantPath, content_type}, url}` (confirmed by reading
  the widget's own source), not `HazardousEventAttachmentProps`'s shape. Corrects an earlier,
  unverified claim in this same entry that "the metadata shape is already identical" — it is not.
  `parseHazardousEventFormData.server.ts`'s `isAttachmentProps()` type guard requires the latter
  shape, so every attachment submitted through the real widget is silently filtered out by
  `parseAttachments()` before reaching the use case — not a storage-location gap, complete loss of
  attachment data on save. The existing "persists the attachments metadata" integration test gives
  false confidence: it hand-constructs an already-correctly-shaped fixture, never exercising the
  real widget's actual output. See `DEF-054` for the full root-cause writeup and next steps.
- **[Resolved] Role-gating (Decision 2) and the empty-validator-list guard (Decision 3) now run
  before the primary use case, not after.** Previously, a non-admin session submitting
  `tempAction: submit-validate`/`submit-publish` (or anyone submitting `submit-validation` with an
  empty validator list) still had its event saved before the 403/422 was thrown — the user saw an
  error with no indication the record was saved, and a retry on the create route produced a second,
  duplicate event. Fix: both checks were extracted into a shared `requireWorkflowActionAuthorized`
  function, called at the top of both `new.tsx`'s and `edit.$id.tsx`'s own `action()`, immediately
  after parsing form data and before `CreateHazardousEventUseCase.execute()`/
  `UpdateHazardousEventUseCase.execute()` is ever called. The resolved `MappedWorkflowAction` is then
  passed into `composeWorkflowAction.server.ts` as a parameter — a second SOLID-review finding
  (calling the guard twice conflated "authorize" with "just get the mapped value") means
  `composeWorkflowAction.server.ts` no longer calls `requireWorkflowActionAuthorized` at all; it
  trusts the caller's already-validated value. **Correcting an inaccuracy a later code-review gate
  caught in this same paragraph**: `ProcessWorkflowActionUseCase.execute()` — the authoritative,
  domain-layer check — did not call the shared function either; it independently reimplemented the
  identical admin-role predicate inline (pre-existing from `6c`'s original implementation, unrelated
  to this round's fix). **Resolved (human decision: extract, not document-as-intentional)**: the
  admin-role predicate (`direct-validate`/`direct-publish` require `"admin"`) now lives in one place,
  `app/domains/validation-workflow/application/isWorkflowActionAuthorized.ts` — a pure
  `isWorkflowActionAuthorized(action, actingUserRole): boolean`, entity-type-agnostic like
  `INotificationPort`/`IValidatorCandidateRepository`, placed beside `ProcessWorkflowActionCommand`'s
  own action union (`use-cases/ProcessWorkflowAction.ts`), which it type-only imports from (no runtime
  cycle). Both `requireWorkflowActionAuthorized.server.ts` (presentation, fail-fast) and
  `ProcessWorkflowActionUseCase.execute()` (domain, still the authoritative enforcement point — the
  check itself was not removed from either site, only its logic de-duplicated) now call this one
  function instead of each re-encoding `actingUserRole !== "admin"` independently. The
  empty-validator-list rule was deliberately **not** folded into this role predicate — it is an
  HE-specific form-data-shape concern (`submit-validation` needs a non-empty validator list), not a
  role check. **Correction**: `ProcessWorkflowActionUseCase.execute()` does independently enforce
  this rule (Decision 3's own "Empty validator list, authoritative enforcement" paragraph above,
  `ProcessWorkflowAction.ts` lines ~97-101) — it is `composeWorkflowAction`'s now-removed early check
  (see above) that duplicated it at the presentation layer, not `execute()` itself, which remains the
  one authoritative enforcement point regardless of the predicate. TDD-verified in
  `isWorkflowActionAuthorized.test.ts` — direct unit coverage of the predicate for every action/role
  combination, plus a dedicated agreement test asserting `requireWorkflowActionAuthorized` and
  `ProcessWorkflowActionUseCase.execute()` reject/accept in lockstep with the predicate across every
  action/role combination, closing the drift risk for good (a future change to the admin-role rule now
  has exactly one place to edit). **Why
  moving the presentation-layer check earlier is safe for every
  legitimate, permitted request**: both checks are pure functions of the parsed form data and the
  acting role, not of write success — moving them earlier changes nothing for a request that was
  always going to pass. It only changes behavior for an invalid/unauthorized request, which is now
  rejected before any write (fail-closed) instead of after. A side effect, deliberate: a crafted
  request that bundles a legitimate content edit with an unauthorized transition is now rejected
  wholesale, rather than silently applying the content edit anyway. TDD-verified in
  `HazardousEventNewRoute.test.ts`/`HazardousEventEditRoute.test.ts` — the role-gating and
  empty-validator-list scenarios now assert the primary use case is *not* called (previously asserted
  it *was*), plus a repository-count/content-unchanged assertion confirming nothing was written.
  **[Resolved — Decision 25]** A *stale/tampered* validator list (every submitted id invalid
  against the real tenant-scoped candidate list) used to be checked separately, after the primary
  use case, inside `composeWorkflowAction.server.ts` — so that narrower case still wrote before
  rejecting. Decision 25 moves this check earlier too, alongside the guards above, closing the gap
  for this case as well.
- **[Risk, tooling limitation, not a code issue]** The `test-quality-auditor`'s mutation-testing pass
  could not run against `filterHazardTaxonomy.ts` — its generic `sortByName<T extends { name:
  string }>` helper crashes `@stryker-mutator/instrumenter`'s bundled Babel generator, the same
  `@stryker-mutator/instrumenter`/`@babel/core` version-mismatch family already on record as
  `DEF-041` (there logged for an `implements` clause and an interface method signature; a generic
  function constraint is a third trigger shape, same root cause class). → **Mitigation:** none
  needed — not introduced by this change, not specific to it. No new deferred-register entry added,
  per the standing no-new-DEF-for-this-tooling-limitation rule; this note plus `DEF-041`'s own
  existing row is the complete record. `flexiblePrecisionDate.ts` (the sibling pure-logic file
  added alongside it) mutation-tested cleanly at 95.35%, with the one real gap (`formatFlexibleDateValue`'s
  `yyyy-mm-dd` guard, only "day missing" was covered, not "year missing"/"month missing") closed by
  two added test cases.

- **[Resolved, corrected — Decision 16] A `SUBMITTED`/`APPROVED`/`PUBLISHED` record's detail page
  does NOT show an Edit link.** The original note here (based on a wrong file citation) claimed
  legacy always shows an enabled Edit link regardless of status. A live Gate 9 comparison found
  otherwise: legacy's real Edit link (`View.tsx`, `canEditDataCollectionRecord`) is itself
  status-aware. The detail page's own Edit link now reuses `isStatusAwareEditBlocked` (the same
  predicate Decision 2's `requireStatusAwareEditPermission.server.ts` already implements), so it
  matches legacy exactly instead of diverging from it.
- **[Risk, mitigated by construction — Decision 17] Dangling `sourceRefId`.** Mitigated by the
  resolver's own existence-join against `hip_hazard`/`hip_cluster`/`hip_class` (Decision 17) — a
  `sourceRefId` with no live matching row resolves to `null`, never a value that could fail the
  column's own FK and block a create/update outright.
- **[Accepted, documented — Decision 17] Residual null-crosswalk gap for post-migration taxonomy
  entries, and no backfill for events created before this fix lands.** Both recorded in Decision 17's
  own "Residual gaps" subsection; neither blocks this change.

### Decision 18 — "Save or submit" button disabled until the form is natively valid (found live, 2026-11-03; user-authorized deliberate deviation from legacy, NOT a parity fix)

**The problem, confirmed live this session, not assumed.** The main "Save or submit" button
(`HazardousEventFormPage.tsx`, the button opening `HazardousEventSaveSubmitModal`) is rendered with
no `disabled` logic at all — it is always clickable regardless of whether the form's required
fields (`specificHazardId`, `startDate`, `endDate`, `recordOriginator`) are actually filled.
Submission failure on a missing required field is caught only by the browser's own native HTML5
constraint validation at the moment `requestSubmit()` fires inside `submitWithAction()` — which
shows a small, easy-to-miss inline browser tooltip on the first invalid field, no custom message, no
console output, no network request. Reproduced directly this session: creating an event with
`hazardousEventStatus: "ongoing"` and `endDate` left blank produced total silence — no navigation, no
visible error, nothing — because legacy itself requires an end date even for an "Ongoing" event
(confirmed separately, not a CA-only quirk), and the only symptom was the easy-to-miss native tooltip.

**This is explicitly NOT a legacy-parity fix.** Legacy's own form has the identical always-enabled
button and the identical native-only silent-failure behavior (`hazardeventform.tsx`'s own submit
button has no `disabled`/validity wiring either, confirmed by reading it) — this change deliberately
diverges from legacy to fix a real UX gap, user-authorized as a new requirement. Recorded here the
same way Decision 14 records its own `hazardousEventStatus` default divergence, so a future
parity-pass contributor does not "correct" this back to match legacy's silent-failure behavior.

**Decision: track `formRef.current.checkValidity()` live, drive the button's `disabled` prop from
it, in `HazardousEventFormPage.tsx` only.**

- New `const [isFormValid, setIsFormValid] = useState(false)` — defaults to disabled (the safe
  default) until the first real check runs; never defaults to `true`, which would briefly expose a
  genuinely-invalid form as submittable.
- One mount effect (`useEffect`, or `useLayoutEffect` to avoid a one-frame enabled→disabled flash in
  a real browser — either satisfies this requirement's own observable-behavior contract; confirm
  the choice at implementation time, Gate 9) that, once `formRef.current` is attached:
  1. Sets `isFormValid` from `formRef.current.checkValidity()` immediately — this is what makes a
     pre-filled **edit** form with genuinely missing required data (e.g. a legacy row missing
     `endDate`) start correctly disabled, not just after the user's first interaction. This is the
     exact scenario that produced the silent failure found live.
  2. Attaches **one** delegated listener pair directly on `formRef.current` — `addEventListener`
     for both `"input"` and `"change"`, bubble phase (the default) — rather than threading an
     `onChange`/`onInput` prop down into `HazardousEventHazardPicker` (for `specificHazardId`) and
     `HazardousEventFlexibleDateField` (for `startDate`/`endDate`) individually. A native DOM event
     fired on any descendant control bubbles up through the `<form>` regardless of which component
     rendered it, so one pair of listeners at the form level covers all four required fields (and
     any future one added to this form) for free — simpler and more robust than per-field wiring,
     confirmed against this file's actual structure (every required control is a normal descendant
     of the single `<Form ref={formRef}>` element, no portal/iframe boundary in the way).
  3. Returns a cleanup removing both listeners on unmount.
- The recheck handler itself: `queueMicrotask(() => setIsFormValid(formRef.current?.checkValidity()
  ?? false))` — **deferred, not synchronous, and this is load-bearing, not stylistic.** A native
  `"change"`/`"input"` listener attached directly to the `<form>` DOM node fires in the bubble phase
  *before* React's own root-level synthetic-event listener (which sits higher up the tree, so it is
  visited later in bubble order) has run its `onChange` handler and committed the resulting
  re-render. `HazardousEventFlexibleDateField`'s own Format `<select>` is the concrete case this
  matters for: switching it (e.g. "Full date" → "Year only") swaps which DOM element currently
  carries `required`/`id` via a React state update in that same component, triggered by that same
  native `change` event. Reading `checkValidity()` synchronously inside our own listener would
  observe the **pre-re-render** DOM for that one event and could report a stale validity snapshot.
  Deferring with `queueMicrotask` lets React's synchronous commit for that event finish first, then
  reads the final, post-render DOM — the identical reasoning, and the identical mechanism, already
  established in this same file for `submitWithAction()`'s own `queueMicrotask(() =>
  formRef.current?.requestSubmit())` (see that function's own comment).
- `HazardousEventFormPage.tsx`'s "Save or submit" `<button>` gains `disabled={!isFormValid}`. No
  other prop/className change.

**No new CSS — confirmed by reading the stylesheet, not assumed.** `public/assets/css/style-dts.css`
lines 709-714 already define `.mg-button:disabled { background-color: #808080; color: #cccccc;
pointer-events: none; }`, which already applies to `mg-button-primary` (the button's existing
className, unchanged) the moment the native `disabled` attribute is present. The existing button
styling is reused as-is, per this task's own instruction not to invent new CSS.

**Scope: the main form button only — `HazardousEventSaveSubmitModal`'s own `isSubmitDisabled` is a
separate, narrower, already-correct check and is NOT touched or generalized by this decision.** That
modal's footer button disables specifically when `selectedAction === "submit-validation" &&
selectedValidators.length === 0` — a per-action validator-selection rule, not a required-field check.
By the time a user reaches that modal, the main button's own new gate already guarantees every
required field is valid (the modal only opens via the main button's `onClick`, which cannot fire
while `disabled`), so the modal's own check needs no change and stays exactly as it is.

**Confirm at implementation time, not assumed: jsdom's constraint-validation support for
`type="date"`.** jsdom 30.x (this repo's pinned version) implements `checkValidity()`/`required` for
plain text/select controls reliably; its support for `type="date"` inputs' own `validity.valueMissing`
computation has historically been inconsistent across jsdom releases. If a dom-tier test exercising
the `startDate`/`endDate` date `<input>` specifically does not see the expected
`validity.valueMissing`, fall back to asserting the same scenario through the flexible-date field's
other precision modes (`yyyy-mm`/`yyyy` use a plain text input, unaffected by this gap) for the dom
tier, and lean on the Playwright E2E scenario (task 9g.5) — a real browser, not jsdom — as the
authoritative proof for the `type="date"` case specifically. Do not silently skip the date-field
scenario if this gap is hit; record what was actually observed.

**Test requirement**: dom-tier scenarios covering (a) mount-disabled when a required field is empty
(create mode's own default-empty form, and an edit-mode form whose `initialValues.endDate` is `""`
— the exact bug reproduced live); (b) mount-enabled when every required field already has a valid
value (an edit-mode form with full `initialValues`, no user interaction at all); (c) live toggling —
typing a value into an empty required text field flips disabled→enabled, clearing a previously-valid
one flips it back; (d) the date-field Format-switch scenario proving the deferred recheck reads
post-render DOM, not a stale snapshot (see tasks.md Section 9g for the exact scenario list and the
RED-for-the-right-reason confirmation each one needs). No spec change needed for *why* each of these
individually fails/passes under jsdom's own quirks — that is Section 9g's own implementation detail;
`specs/hazardous-event-form-validation/spec.md` (new capability, see proposal.md) specifies only the
externally observable button-disabled contract itself.

**Addendum (implementation time, 9g.3) — the date-field Format-switch example above does not
actually reproduce a stale read; corrected to the real reproducing scenario.** The defer mechanism
itself (queueMicrotask) is implemented exactly as decided above and is genuinely load-bearing — only
the illustrative example in this decision's own prose was wrong, found by trying it and reading the
actual DOM state rather than assuming. Switching `HazardousEventFlexibleDateField`'s Format selector
(e.g. "Full date" → "Year only") from a complete, valid date does NOT empty the newly-mounted
control: `parts.y`/`parts.m`/`parts.d` persist atomically across a precision change (every code path
that derives `parts` from a shorter precision already fills `m`/`d` with `1`, never `0`, unless the
user explicitly clears the full-date input), so the new control's `defaultValue` carries the old,
still-valid value forward. Confirmed empirically: after switching a fully-valid `startDate`
("2026-01-01") to "Year only", the new control's value was `"2026"`, `validity.valid=true` — no
invalidity, with or without the defer.

The scenario that does genuinely reproduce the stale-read hazard is `HazardousEventHazardPicker`'s
own filter-by-name text input. Typing into it calls `setSearchTerm`/`setTypeId("")`/`setClusterId("")`/
`setSpecificHazardId("")` — the last of these drives the `specificHazardId` `<select required>`'s own
`value` prop, so React's commit force-clears that *controlled* select's actual DOM value, a change the
filter input's own native "input" event never carries directly. Confirmed empirically: immediately
after firing the filter input's native event (same synchronous tick, before our queued microtask
runs), `select.value === ""` and `select.validity.valid === false` already (React's own commit is
synchronous within that event dispatch) — but `button.disabled` was still `false` (our form-level
listener fires *before* React's own root-level handler in bubble order, so a synchronous read inside
it would catch the pre-commit, still-valid DOM and never get a second chance to recheck). With the
`queueMicrotask` wrapper removed entirely (temporary test to confirm this), the button never catches
up at all — stays enabled indefinitely. Restoring the wrapper fixes it. Test added under this
scenario in `HazardousEventFormPage.dom.test.tsx` (9g.3); tasks.md 9g.3 updated to match.

No DB migration. `workflow_instance`'s schema already has every column the three new transition
methods write to; `hazardous_event`'s HIP columns already exist (nullable, from legacy) — Decision 17
populates them, it does not alter the schema. Deploy is a pure code change (new routes/form + two
modified use cases + one modified domain entity + two new ports/adapters + two detail-page links + one
modal styling fix); rollback is a plain revert.

### Decision 19 — "Specific hazard" field shows no required marker of its own (found live via manual QA, 2026-11-03; one-line fix, consistent with the existing per-field convention)

**The problem, confirmed by reading `HazardousEventHazardPicker.tsx` directly.** The hazard
classification group wraps all three cascading `<select>`s inside one outer
`HazardousEventFormField` (lines 53-58) that carries `required` and renders the group heading
**"Hazard classification *"** — the asterisk Decision 9's own ground-truth table already records as
hardcoded onto this one group label (Decision 9's field-set table, row 2: `"Hazard classification *"`,
hardcoded, not via the generic required-marker mechanism). Separately, the innermost `<select
id="specificHazardId" required>` (line 139) does carry the real native `required` attribute — so the
field is genuinely required and natively validated — but its own `HazardousEventFormField` wrapper
(lines 132-135) is called with no `required` prop, so it renders only the plain label **"Specific
hazard"**, no `*`. This is inconsistent with every other individually-required field already on this
same page: `recordOriginator` (line 280 of `HazardousEventFormPage.tsx`, `required` passed to its own
`HazardousEventFormField`), and `startDate`/`endDate` (each their own `HazardousEventFlexibleDateField`,
required independently) each mark their OWN field, showing their OWN `*`. "Specific hazard" is the one
required control on the page whose own field-level label never gets one.

**Resolution: pass `required` to the "Specific hazard" field's own wrapper too.** This is additive
only — it does not touch the group heading's own hardcoded `"Hazard classification *"` label
(Decision 9's own ground truth; that label stays exactly as-is, hardcoded, not generically derived),
and it does not add `required` to "Hazard type" or "Hazard cluster" (neither is required, matching
Decision 9's table and the existing native `required` attribute's own placement — only on the
`specificHazardId` select). No behavior change: the native `required` attribute, and therefore
`checkValidity()`/Decision 18's live button-disabled tracking, are unaffected — this is a pure visible
-label fix, consistent with the already-established per-field-asterisk convention in this same file.

```tsx
// HazardousEventHazardPicker.tsx, inner "Specific hazard" field wrapper
<HazardousEventFormField
  label={t("form.fields.specific_hazard")}
  required
  htmlFor="specificHazardId"
>
```

**Test requirement**: one dom-tier assertion in `HazardousEventHazardPicker.dom.test.tsx` that the
"Specific hazard" field's own rendered label text ends in `" *"` (e.g.
`screen.getByText("Specific hazard *")`), alongside the existing assertion (unchanged) that the group
heading itself still renders `"Hazard classification *"`.

### Decision 20 — `specificHazardId` select becomes permanently unselectable after unrelated field edits (confirmed bug, found live via manual QA, 2026-11-03; root cause confirmed via `react-dom` source, fix: `React.memo`)

**Reproduction, confirmed live in a real browser, independently, via click/type-ahead/arrow-key
interaction, all failing identically.** On the create form: (1) select a Hazard type; (2) select a
Hazard cluster — `specificHazardId`'s `<select>` now correctly filters to its real option list but is
left unselected; (3) do **not** select a specific hazard yet — move on and fill `recordOriginator`,
`startDate`, `endDate`; (4) return to "Specific hazard" and try to select any option, by click,
keyboard type-ahead, or arrow keys. **Nothing happens** — `.value`/`.selectedIndex` never move. The
control is permanently stuck for the rest of the session; the required field can never be satisfied
through normal interaction, so Decision 18's own submit-button gate stays disabled forever with no
visible error.

**What was already ruled out, empirically, before this decision's own investigation**: not a
disabled/removed element (`disabled` stays `false` throughout, correct filtered options); not a
stale DOM/remount (`getElementById`/`activeElement` both resolve to the live, focused node
throughout); not missing event delivery (a temporary `keydown`/`keypress`/`keyup` listener confirmed
real keystrokes reach the element, yet `.selectedIndex` never moves even for "D", the unique first
letter of the first real option, "Downburst"); not a `MutationObserver`-visible DOM mutation
(`{attributes, childList, subtree: true}` showed zero mutations during a failing keystroke); not
generic test-tooling flakiness (`hipTypeId`/`hipClusterId` — structurally near-identical sibling
`<select>`s in the same file — kept responding to the identical interaction methods in the same
stuck session); not the component's own `onChange` logic (direct programmatic writes via the
native property descriptor's setter, followed by a dispatched `change` event, always still worked
and persisted).

**Root cause, confirmed by reading this repo's installed `react-dom` (`19.2.7`,
`node_modules/react-dom/cjs/react-dom-client.development.js`) directly — not assumed.**

1. `HazardousEventHazardPicker` is a plain function component — no `React.memo`, no other
   memoization (confirmed: the whole `app/` tree has zero existing uses of `React.memo` to compare
   against; this is a new pattern for the codebase, justified below).
2. Every re-render of its parent, `HazardousEventFormPage`, therefore calls
   `HazardousEventHazardPicker` again in full, rebuilding every JSX element inside it from scratch —
   including a brand-new inline `onChange` closure for the `specificHazardId` `<select>`
   (`HazardousEventHazardPicker.tsx` lines 141-154), a new function reference on *every single call*,
   regardless of whether `searchTerm`/`typeId`/`clusterId`/`specificHazardId` actually changed.
3. `HazardousEventFormPage` re-renders on every keystroke in *any* required field, by design —
   Decision 18's own delegated `"input"`/`"change"` listener on `<form>` (`HazardousEventFormPage.tsx`
   lines 114-121) calls `queueMicrotask(() => setIsFormValid(form.checkValidity()))` on every bubbled
   event, so typing into `recordOriginator` or either date field re-renders the whole page, including
   the (un-memoized) `HazardousEventHazardPicker` subtree, even though nothing about the hazard
   picker's own props changed.
4. React's reconciler marks a host fiber "needs update" when *any* prop differs by reference/value
   from the previous commit — the new `onChange` reference alone is sufficient, confirmed by reading
   `updateProperties`'s `"select"` case (`react-dom-client.development.js` lines 20876-20934): for
   every prop in `nextProps` other than `value`/`defaultValue`/`multiple`, a changed reference calls
   `setProp(...)` (lines 20915-20924) — `onChange` always differs. Separately and unconditionally
   (lines 20929-20930): `null != _propKey8 ? updateOptions(domElement, !!tag, _propKey8, !1) : ...` —
   `_propKey8` is `nextProps.value`, which for this controlled select is always non-null (even `""`),
   so `updateOptions` runs on **every** commit that touches this host node, with no comparison at all
   against the *previous* `value`.
5. `updateOptions` itself (lines 1775-1798), for a single (non-`multiple`) select, finds the option
   whose `.value` matches and does `node[i].selected = !0` (line 1790) **unconditionally** — no guard
   against the option already being selected. (Contrast the `multiple` branch three lines above it,
   line 1783, which *does* guard: `node[propValue].selected !== i && (node[propValue].selected = i)`
   — the single-select path is the one branch in this function with no such guard.)
6. This is a direct IDL-property assignment via a plain JS property setter, not an HTML-attribute
   write and not a childList change — invisible to a `MutationObserver` watching
   `{attributes, childList, subtree: true}`, exactly matching what was observed live (point 6 of the
   ruled-out list above).

**Chain, stated end to end**: typing in `recordOriginator`/a date field → native `input`/`change`
bubbles to `<form>` → Decision 18's `recheck` → `queueMicrotask` → `setIsFormValid` → `HazardousEventFormPage`
re-renders → un-memoized `HazardousEventHazardPicker` re-renders → new `onChange` closure for
`specificHazardId`'s `<select>` → React marks that fiber dirty regardless of `value` → commit calls
`updateOptions` → `node[i].selected = !0` is reassigned on the select's currently-matching option,
silently, on every keystroke in a completely unrelated field, for as long as the user is away from the
hazard picker.

**Why this stops the native widget responding (best-supported explanation for this last link,
confirmed at the React level above; the browser-engine internals below are the working hypothesis
this decision adopts, not independently re-derived from a browser engine's own source in this
investigation — flagged as such, not presented as fully re-verified).** Per browser engines'
documented handling of scripted `<option>`/`<select>` selection, a script-driven write to an option's
`selected` IDL property — even one that doesn't change the logical selection — updates the control's
internal selection bookkeeping independently of any user gesture. The browser's native
keyboard/type-ahead navigation computes its next index relative to that bookkeeping. `specificHazardId`
is left on its still-unselected placeholder at exactly the point these redundant script writes start
recurring (the user deliberately defers choosing a value while filling other fields) — so every one
of these writes keeps re-asserting a script-only selection that was never confirmed by a real user
`change`, and the control never reaches a state the engine will treat as "ready for the next native
keyboard/click interaction to move it." This also explains, consistently with the evidence, why
`hipTypeId`/`hipClusterId` were unaffected in the same stuck session: both already held a REAL value
set by a genuine prior user `change` event (steps 1-2 of the reproduction) by the time the unrelated
re-renders start recurring in steps 3-4, so the same redundant `.selected = true` writes simply
re-assert an already-genuine, user-confirmed selection — there is no "never-yet-confirmed" option left
exposed the way there is for `specificHazardId`.

**Fix: wrap `HazardousEventHazardPicker`'s export in `React.memo`.** Chosen over the alternatives
the investigation brief named:

- **Rejected: `key={clusterId}` remount.** Explicitly ruled out — it would also wipe
  `specificHazardId`'s own value every time the user changes their mind about cluster, which is not
  the bug and not acceptable collateral damage.
- **Rejected: lifting the select out of the subtree the parent's `isFormValid` re-render touches, or
  moving Decision 18's listener.** Both are larger, more invasive restructurings of
  `HazardousEventFormPage`'s established JSX shape (Decision 9) for no extra correctness over `memo`,
  which targets the actual mechanism directly: an unnecessary re-render of a component whose own
  props did not change.
- **Chosen: `React.memo(HazardousEventHazardPicker)`.** Confirmed correct, not just plausible, by
  checking the three props it receives are referentially stable across exactly the re-renders that
  were corrupting the control: `taxonomyOptions` is passed straight from the route loader's own
  `data.taxonomyOptions` (`app/routes/.../he-preview+/new.tsx` line 70/202) — stable until a real
  navigation/revalidation, never touched by `setIsFormValid`; `initialSpecificHazardId` is a primitive
  string, trivially stable by value; `errors={fieldErrors?.specificHazardId}` is a property access on
  `fieldErrors`, itself a stable prop reference across the same client-only re-renders (it only
  changes after a real server round-trip). `React.memo`'s default shallow comparison therefore
  correctly bails out of re-rendering `HazardousEventHazardPicker` for every `isFormValid`-driven
  parent re-render, while still re-rendering normally whenever any of these props genuinely change
  (a real revalidation or a new server-side error).

**Why this does not reintroduce or break Decision 18's own `queueMicrotask` mechanism, or the
filter-by-name reset behavior its addendum already depends on.** `React.memo` only intercepts
re-renders a component would otherwise receive *because its parent re-rendered with unchanged props*
— it has no effect at all on a component's own internal `useState`-driven re-renders. The
filter-by-name reset (`HazardousEventHazardPicker.tsx` lines 67-72:
`setSearchTerm`/`setTypeId("")`/`setClusterId("")`/`setSpecificHazardId("")`) is triggered by this
component's *own* `onChange` handler calling its *own* internal state setters — this still re-renders
the (now-memoized) component exactly as before, memo or not, because memo never gates a component's
own state-driven updates, only parent-driven ones. So the native `input` event this reset fires still
bubbles to `<form>`, still triggers Decision 18's `recheck`/`queueMicrotask`/`checkValidity()` read,
and that read still observes the post-commit, now-cleared `specificHazardId` DOM value exactly as
Decision 18's addendum already proved empirically (`design.md` Decision 18, "the scenario that does
genuinely reproduce the stale-read hazard"). What changes is only the other direction:
`HazardousEventFormPage`'s own `isFormValid`-driven re-renders (from typing in sibling fields) can no
longer cascade into `HazardousEventHazardPicker` at all when its props haven't changed, so they can
no longer reach `specificHazardId`'s `<select>` and trigger the spurious `updateOptions`/`.selected`
reassignment described above in the first place.

**Test requirement.** A dom-tier scenario in `HazardousEventHazardPicker.dom.test.tsx` (or
`HazardousEventFormPage.dom.test.tsx`, whichever already holds the harness for simulating sibling-field
edits — confirm at implementation time) proving the *mechanism* is closed: with every required field
but `specificHazardId` valid, fire a native `input`/`change` event on `recordOriginator` (simulating
Decision 18's own trigger) some number of times, and assert the `specificHazardId` `<select>`'s own
DOM node identity (or a render-count spy on `HazardousEventHazardPicker`) is unchanged across those
events — i.e., it does not re-render at all in response to an unrelated sibling edit once memoized.
Because the user-facing symptom is a real-browser native-widget keyboard/type-ahead behavior that
jsdom does not meaningfully emulate (the same class of gap Decision 18 already flagged for
`type="date"` constraint validation), the authoritative, user-facing proof is a Playwright E2E
scenario extending `tests/e2e/hazardous-events/he-preview-form.spec.ts`: reproduce the exact live
repro steps (type → cluster → leave hazard unselected → fill `recordOriginator`/dates → return to
"Specific hazard" → select an option by click) and assert the option is actually selected
(`specificHazardId`'s value reflects the chosen option, and the "Save or submit" button subsequently
enables) — this is the scenario of record for the real bug, the same role 9g.5 already plays for
Decision 18's own `type="date"` jsdom gap.

No DB migration; no new dependency (`React.memo` is part of `react`, already a direct dependency).
Deploy is a pure code change confined to `HazardousEventHazardPicker.tsx`; rollback is a plain revert.

### Decision 21 — Parent-picker page is missing its page-chrome wrapper (confirmed live by the orchestrator, 2026-11-03; fix location corrected from the intent's own framing)

**The problem, confirmed via screenshot comparison of `/en/he-preview` and `/en/he-preview/picker`.**
`/en/he-preview` renders the global nav, then the page-title banner (`.dts-page-header`/
`.dts-page-title`, an `<h1 class="dts-heading-1">`, from `MainContainer`), then the list content.
`/en/he-preview/picker` jumps straight from the global nav into the filter row — no banner at all.
Confirmed by reading the actual source, not just the rendered DOM:
`app/routes/$lang+/_authenticated+/he-preview+/picker.tsx`'s default export returns
`<HazardousEventPickerPage data={data} />` with no wrapper at all, and
`HazardousEventPickerPage.tsx` itself renders `<HazardousEventListPage ...>` directly — neither file
imports `MainContainer`. Legacy's own picker (`app/routes/$lang+/hazardous-event+/picker.tsx`) wraps
in `<MainContainer title={ctx.t({ code: "hazardous_event.select_parent_for_event", msg: "Select
parent for event" })}>`. The table/filter styling itself is unaffected — only the page-title wrapper
is missing, which is what reads as "unstyled and cheap."

**Fix location, corrected from the intent's own suggestion — route-level, not inside
`HazardousEventPickerPage.tsx`.** Every other HE route wraps itself in `MainContainer` at the route
file, not inside its presentation component — confirmed directly: `_index.tsx` line 78
(`<MainContainer title={t("title")}>` around `<HazardousEventListHeader>`/`<HazardousEventListActions>`/
`<HazardousEventListPage>`), `$id.tsx` line 49 (same, around `<HazardousEventDetailPage>`), and
`new.tsx`/`edit.$id.tsx` (Decision 9 Addendum 2, Gap 2, around `<HazardousEventFormPage>`). Wrapping
inside `HazardousEventPickerPage.tsx` instead would be the one HE page that breaks this established
route-owns-its-chrome convention, for no benefit (the component has exactly one caller,
`picker.tsx`, confirmed by grep) — so the fix lives in `picker.tsx`'s default export, matching every
sibling route exactly:

```tsx
// app/routes/$lang+/_authenticated+/he-preview+/picker.tsx
export default function HazardousEventPickerRoute() {
	const data = useLoaderData<typeof loader>();
	const { t } = useTranslation("hazardous-events");
	return (
		<MainContainer title={t("picker.title")}>
			<HazardousEventPickerPage data={data} />
		</MainContainer>
	);
}
```

**Locale key — reuse the existing `picker.title` key, correcting its text; do not add a new key.**
`locales/en/hazardous-events.json`/`locales/fr/hazardous-events.json` already declare a `picker.title`
key, sitting alongside `picker.select` — but it is currently unused anywhere in the codebase
(confirmed by repo-wide grep) and its text does not match legacy's own wording: EN currently reads
"Select a parent hazardous event" (legacy: "Select parent for event"); FR currently reads
"Sélectionner un événement dangereux parent" (legacy's real translation, confirmed directly from
`locales/app/fr.json`'s own `hazardous_event.select_parent_for_event` catalog entry: "Sélectionner un
parent pour l'événement"). Since this key was clearly provisioned for exactly this purpose (same
namespace, same `picker.*` grouping as `picker.select`) and simply never wired up, correcting its
text and wiring it is the right fix — adding a second, redundant key (e.g.
`picker.select_parent_title`, as the intent's own framing suggested) would leave the existing key
permanently orphaned. **Fix:** `locales/en/hazardous-events.json`'s `picker.title` → `"Select parent
for event"`; `locales/fr/hazardous-events.json`'s `picker.title` → `"Sélectionner un parent pour
l'événement"`.

**Test requirement: none — verified via Gate 9 only, same precedent as the `new.tsx`/`edit.$id.tsx`
title-prop swap (Decision 9 Addendum 2, Gap 2, task 9e.4).** Route default-export components are not
unit-tested anywhere else in this codebase (confirmed: no `.test.*` file mounts `_index.tsx`/
`$id.tsx`/`new.tsx`/`edit.$id.tsx`/`picker.tsx`'s own default export) — this one-line wrapper addition
follows the same pattern. Verified live instead: screenshot `/en/he-preview/picker` post-fix and
confirm the page-title banner now renders, reading "Select parent for event," matching
`/en/he-preview`'s own banner structure.

No DB migration; no new dependency. Deploy is a pure code change confined to `picker.tsx` and the two
locale files; rollback is a plain revert.

### Decision 22 — Parent-picker opens as a small popup window instead of a tab (confirmed live by the orchestrator, 2026-11-03; user-requested behavior, matches legacy's own call shape)

**The problem, confirmed by reading `HazardousEventParentField.tsx` directly.** The "Change" button's
`onClick` (lines 63-69) calls:

```tsx
window.open(ctx.url("/he-preview/picker"), "he-picker", "width=900,height=700");
```

Passing a window-name (`"he-picker"`) and a features string (`"width=900,height=700"`) is what makes
a browser open a small, chrome-less popup window rather than a normal tab. Legacy's own equivalent
(`app/frontend/events/hazardeventform.tsx:325-326`, `openHazardousEventPicker`) passes neither:

```tsx
const openHazardousEventPicker = () => {
	window.open(urlLang(ctx.lang, "/hazardous-event/picker"), "_blank");
};
```

A `target` of `"_blank"` with no features string is what makes a browser open a real new tab, which
gets focus automatically — the behavior the user explicitly asked for. The close-on-select mechanism
(`HazardousEventPickerPage.tsx`'s `selectParentEvent()`, `window.opener?.postMessage(...)` then a
`setTimeout(() => window.close(), 50)`) already works correctly and is unaffected by this fix — once
a *tab* (not a popup) self-closes, returning focus to the opener tab is standard browser behavior,
requiring no extra code.

**Fix: match legacy's own call shape exactly — drop the window-name and features string, keep CA's
own URL-building.**

```tsx
// HazardousEventParentField.tsx, the "Change" button's onClick
onClick={() => window.open(ctx.url("/he-preview/picker"), "_blank")}
```

Only the second/third arguments change; `ctx.url(...)` (CA's own route) is unchanged — this is not a
reversion to legacy's URL.

**Confirmed: no other code depends on the removed window-name/features string.** Repo-wide grep for
`"he-picker"` and `"width=900,height=700"` finds exactly one match each, both on this same line in
`HazardousEventParentField.tsx` — no test, E2E spec, or other source file asserts on either literal.
`HazardousEventFormPage.dom.test.tsx`'s own i18n mock has a `change: "Change"` string (the button's
label) but no assertion on `window.open`'s call arguments. `tests/e2e/hazardous-events/he-preview-form.spec.ts`'s
parent-picker-flow test (`"the parent-picker flow updates the form's parent field end to end"`, flagged
separately in task 9g.5 as a pre-existing flake unrelated to this fix) drives the flow through
Playwright's own `page.waitForEvent("popup")`, which fires identically whether the new window is a
Playwright-visible popup or a plain tab — no selector/assertion change needed there either.

**Test requirement.** No dom-tier test exists yet for `HazardousEventParentField.tsx` (confirmed: no
`HazardousEventParentField.*test*` file exists in this directory). New
`HazardousEventParentField.dom.test.tsx` (needs a real `window.open`/jsdom environment, hence the
`.dom.test.tsx` naming convention this directory already uses): a spy on `window.open` asserting that
clicking the "Change" button calls it with exactly two arguments — `ctx.url("/he-preview/picker")` and
`"_blank"` — and no third argument.

No DB migration; no new dependency. Deploy is a pure code change confined to
`HazardousEventParentField.tsx`; rollback is a plain revert.

### Decision 23 — List page has no direct per-row "Edit" action, only "View" (confirmed live by the orchestrator via DOM inspection, 2026-11-03; status-aware, reusing the existing predicate)

**The problem, confirmed by reading `HazardousEventListPage.tsx` directly.** The default actions cell
(rendered when `renderActionsCell` is not supplied — i.e. the real main list route,
`he-preview+/_index.tsx`, confirmed the only caller that omits this prop; the parent-picker route
always supplies its own "Select" override, Decision 13) renders a single "View" icon link only (lines
~201-215):

```tsx
<TableCell centered className="dts-table__actions" focusChild>
	{renderActionsCell ? (
		renderActionsCell(item)
	) : (
		<Link href={ctx.url(`/he-preview/${item.id}`)} aria-label={tCommon("view")} className="mg-button mg-button-table">
			<svg aria-hidden="true" focusable="false" role="img">
				<use href="/assets/icons/eye-show-password.svg#eye-show" />
			</svg>
		</Link>
	)}
</TableCell>
```

Legacy's own list (`app/frontend/events/hazardeventlist.tsx` → `DataCollectionActionLinks`,
`app/frontend/components/data-collection/ActionLinks.tsx`) renders Edit + View + Delete icon links per
row by default, Edit/Delete each conditionally hidden (an empty `<span>` placeholder slot inside a
fixed 3-column inline-style grid, preserving column alignment) via
`canEditDataCollectionRecord(userRole, approvalStatus)`/`canDeleteDataCollectionRecord(userRole,
approvalStatus)`. Today a CA user can only reach Edit via List → View (detail page) → the detail
page's own Edit link (Decision 16) — two clicks instead of legacy's one. The user confirmed this is a
real missed entry point, explicitly noting the status-aware constraint (not every record is editable
in every state) this repo already has ported and reusable: `isStatusAwareEditBlocked(role,
workflowStatus): boolean` (`app/domains/hazardous-events/presentation/web/isStatusAwareEditBlocked.ts`),
already used by both `HazardousEventDetailPage.tsx`'s own Edit-link gate and
`requireStatusAwareEditPermission.server.ts`'s loader-level gate (Decision 2/16).

**Scope, confirmed not to touch the picker's own action column.** `HazardousEventListPage.tsx`'s
`renderActionsCell` prop exists specifically so the picker route (`HazardousEventPickerPage.tsx`) can
supply its own "Select" button instead of the default cell — confirmed by reading
`HazardousEventPickerPage.tsx` directly: it always passes `renderActionsCell`, so the default branch
this decision changes is never reached there. No change to `HazardousEventPickerPage.tsx` or its own
action column.

**Data already available — no new loader field.** `item.workflowStatus` is already on
`HazardousEventListItemDto` (`Status | null`); `role` is already a prop on
`HazardousEventListPageData` (`role?: string | null`, already threaded through from `_index.tsx`'s
loader for `HazardousEventListActions`/`HazardousEventListHeader`, Decision 15). Both match
`isStatusAwareEditBlocked`'s own signature exactly — no new plumbing.

**Icon asset, confirmed to exist.** `public/assets/icons/edit.svg` exists (`<svg id="edit" ...>`,
confirmed by reading the file), the same convention as the existing View link's
`eye-show-password.svg#eye-show` (file name differs from the internal `id`; the `#fragment` always
matches the SVG's own `id`, not its filename) — so the Edit link's icon is
`<use href="/assets/icons/edit.svg#edit" />`.

**Label, reusing the existing `detail.edit` key — no new locale key, no touch to `common.json`.**
`locales/en/hazardous-events.json` already has `detail.edit: "Edit"` (added by Decision 16, under the
page's existing `detail.*` group) and its FR equivalent. The View link's own aria-label uses
`tCommon("view")` from the shared `common` namespace, but `common.json` has no `edit` key today
(confirmed by reading both `locales/en/common.json` and `locales/fr/common.json`) — adding one there
would touch a namespace shared by every other domain for a label this page already has under its own
namespace. Reusing `t("detail.edit")` (the `hazardous-events` namespace this component already loads
via `useTranslation("hazardous-events")`) avoids that, and is the same text either way ("Edit").

**Fix: add an Edit icon link before the View icon link in the default (non-`renderActionsCell`)
branch, gated the same way the detail page already gates its own Edit link.**

```tsx
<TableCell centered className="dts-table__actions" focusChild>
	{renderActionsCell ? (
		renderActionsCell(item)
	) : (
		<span className="flex items-center gap-1">
			{roleHasPermission(role ?? null, "EditData") &&
				!isStatusAwareEditBlocked(role ?? null, item.workflowStatus) && (
					<Link
						href={ctx.url(`/he-preview/edit/${item.id}`)}
						aria-label={t("detail.edit")}
						className="mg-button mg-button-table"
					>
						<svg aria-hidden="true" focusable="false" role="img">
							<use href="/assets/icons/edit.svg#edit" />
						</svg>
					</Link>
				)}
			<Link href={ctx.url(`/he-preview/${item.id}`)} aria-label={tCommon("view")} className="mg-button mg-button-table">
				<svg aria-hidden="true" focusable="false" role="img">
					<use href="/assets/icons/eye-show-password.svg#eye-show" />
				</svg>
			</Link>
		</span>
	)}
</TableCell>
```

Target route confirmed by reading the routes directory directly (not assumed): `edit.$id.tsx` resolves
to `he-preview/edit/:id`, confirmed via `edit.$id.tsx`'s own partial-success redirect
(`` `/${lang}/he-preview/edit/${event.id}?partial=transition-failed` ``).

**No empty-placeholder slot needed, confirmed by reading `TableCell`/the table's own column
structure, not assumed.** Unlike legacy's `ActionLinks.tsx`, this isn't a multi-column inline-style
grid with one fixed slot per action — `HazardousEventListPage.tsx` declares exactly one `"actions"`
`TableColumn` (confirmed by reading the column declarations), and both icon links sit inside that
single `TableCell`, centered as a group. When Edit is hidden, the View icon simply renders alone,
still centered in the same cell — there is no separate column position to preserve, so no placeholder
`<span>` is needed the way legacy's fixed 3-slot grid requires one. A plain conditional (render
nothing when blocked) is sufficient and matches this project's standing no-inline-styles-where-
avoidable preference better than porting legacy's inline-style empty-slot mechanism.

**Superseded by Decision 24 below.** This paragraph's own reasoning is wrong — see Decision 24's
"reasoning error" bullet for the full explanation. A placeholder is needed after all.

**Test requirement.** Extend `HazardousEventListPage.test.tsx` (already has `role`/`workflowStatus` on
its `makeItem`/`makeData` fixtures, confirmed by reading the file): a role with `EditData` and an
editable `workflowStatus` (`DRAFT`/`REVISION_REQUESTED`/`null`) sees both the Edit and View links, Edit
first; a role with `EditData` but a locked `workflowStatus` (`SUBMITTED`/`APPROVED`/`PUBLISHED`) sees
only View; `data-viewer` sees only View regardless of `workflowStatus`; a `null`/missing role sees only
View. Also extend (or confirm via the existing `renderActionsCell`-override test, if one already
proves this) that the picker's own action column never renders an Edit link — `HazardousEventPickerPage.tsx`
always supplies `renderActionsCell`, so this is a regression guard on that existing contract, not new
behavior.

No DB migration; no new dependency (`roleHasPermission`/`isStatusAwareEditBlocked` are both existing,
already-imported-elsewhere pure functions). Deploy is a pure code change confined to
`HazardousEventListPage.tsx`; rollback is a plain revert.

### Decision 24 — Actions-column icons shift position depending on how many are shown (confirmed live by the orchestrator via screenshot, 2026-11-03; corrects Decision 23's own "no placeholder needed" reasoning)

**The problem, confirmed live immediately after Decision 23/9i shipped.** `HazardousEventListPage.tsx`'s
default actions cell (the same code Decision 23 just added — lines ~203-237, markup quoted there in
full) wraps the Edit/View links in one `<span className="flex items-center gap-1">` inside the
single `TableCell`. `.dts-table__actions` (`public/assets/css/style-dts.css` line ~3176) is a plain `display: flex;
justify-content: center;` — it centers whatever single child sits inside the `TableCell`, which here
is the `<span className="flex items-center gap-1">` group, not either icon individually. On a row
where Edit renders (e.g. `DRAFT`), that group holds two icon-links and centers as a two-icon block;
on a row where Edit is gated off (e.g. `"waiting-for-validation"`/`SUBMITTED`), the same group holds
only the View icon and centers as a one-icon block. Centering a block of varying total width at a
fixed point necessarily puts each child at a different horizontal offset depending on the block's own
width — so the View icon's horizontal position visibly shifts row to row. Confirmed live via
screenshot: on a "Waiting for validation" row (Edit hidden) the View icon sits noticeably further
right/center than on a "Draft" row (both icons shown), where View sits to the right of a
fixed-looking Edit position — visually misaligned down the column.

**Decision 23's own reasoning error, named explicitly, not glossed over.** Decision 23's "No
empty-placeholder slot needed" paragraph reasoned that because this cell declares exactly one
`"actions"` `TableColumn` (not legacy's multi-column inline-style grid), there was "no separate
column position to preserve." That conflated *the cell having one column* with *the group inside it
having a constant width* — two different things. The cell is a single centered flex container, which
is precisely the condition under which a variable-width group recenters when its width changes; a
single centered column is the cause of the bug, not evidence against it. Legacy's own
`DataCollectionActionLinks` (`app/frontend/components/data-collection/ActionLinks.tsx`) never hits
this because it never centers a variable-width group at all — it lays out a **fixed-width CSS grid**
(`display: grid; gridTemplateColumns: repeat(3, 2.25rem)`), three slots of constant width each,
rendering either the real icon-link or an empty `<span style={emptySlotStyle} aria-hidden="true" />`
of the same fixed dimensions when that slot's action isn't available — the group's total width is
invariant regardless of which actions are present, so nothing recenters.

**Fix: a fixed-width, non-interactive placeholder reserved for the Edit slot only — not a literal
port of legacy's 3-slot grid.** CA has exactly two possible actions here (Edit, View; no Delete in
`6c`'s scope), and View is unconditionally rendered — only Edit's presence varies. Reserving a
fixed-width slot specifically for Edit is therefore sufficient: once that one slot's width stops
varying, the enclosing `<span className="flex items-center gap-1">` group's total width is constant
on every row (`EditSlotWidth + gap + ViewWidth`, always), so the cell's own `justify-content: center`
centers an invariant-width group every time — View's own offset from the cell's left edge becomes
constant across rows. A second placeholder for View is not needed: View is never absent, so its own
slot already never varies.

**Mechanism, chosen over an inline CSS grid.** Legacy's own technique (an inline-style grid with a
same-sized empty `<span>`) is one valid way to get a fixed slot, but porting it here would introduce
both a new CSS mechanism (`display: grid`) and an inline `style` object into a component that
currently mixes only Tailwind utility classes (`flex items-center gap-1`) with this project's
`mg-button`/`mg-button-table`/`dts-table__actions` design-system classes — and this project has a
standing no-inline-styles-where-avoidable preference (already applied once in this same file's own
Decision 9 "Save or submit" badge styling, Tailwind arbitrary values over inline `style`). A grid
wrapper is also unnecessary machinery for reserving exactly one slot out of two, where the simpler
fix is a placeholder that is sized by construction rather than by a guessed or measured pixel/rem
value:

```tsx
<span className="flex items-center gap-1">
	{roleHasPermission(role ?? null, "EditData") &&
	!isStatusAwareEditBlocked(role ?? null, item.workflowStatus) ? (
		<Link
			href={ctx.url(`/he-preview/edit/${item.id}`)}
			aria-label={t("detail.edit")}
			className="mg-button mg-button-table"
		>
			<svg aria-hidden="true" focusable="false" role="img">
				<use href="/assets/icons/edit.svg#edit" />
			</svg>
		</Link>
	) : (
		<span className="mg-button mg-button-table invisible" aria-hidden="true">
			<svg aria-hidden="true" focusable="false" />
		</span>
	)}
	<Link href={ctx.url(`/he-preview/${item.id}`)} aria-label={tCommon("view")} className="mg-button mg-button-table">
		<svg aria-hidden="true" focusable="false" role="img">
			<use href="/assets/icons/eye-show-password.svg#eye-show" />
		</svg>
	</Link>
</span>
```

**Why this is sized correctly without measuring or guessing a number.** The placeholder reuses the
exact same `mg-button mg-button-table` classes and the same `<svg>` box the real Edit link renders —
it is not a hand-picked width (legacy's own `2.25rem` is itself a guessed/measured constant tied to
that codebase's own icon size, which this change deliberately does not port). `.mg-button`'s own
rules (`style-dts.css` line ~550: `padding: 0.86rem 1.14rem`, a `1px` border, `display: flex`) apply
identically to a `<span>` as to an `<a>` — nothing in that rule block is anchor-specific — so the
placeholder's box is byte-for-byte the same size as the real Edit link's box by construction, not by
coincidence, and stays correct automatically if `.mg-button`'s own padding/icon size ever changes.
The child `<svg>` is required for this — an empty `<span className="mg-button mg-button-table">`
with no child collapses to a narrower box than one containing the `1.14rem` icon, which would
reintroduce the same shift this fix exists to remove; the placeholder's `<svg>` needs no `<use>`
child (nothing is drawn), only the same outer `<svg>` element and its sizing rule
(`.mg-button svg { height/width: 1.14rem }`).

**Inert by construction, not merely visually hidden.** The placeholder is a `<span>`, never an `<a>`
— it has no `href`, carries `aria-hidden="true"`, and Tailwind's `invisible` utility
(`visibility: hidden`) hides it from sighted users while preserving its layout box. Because it is
not a link and not natively focusable, no `tabIndex` suppression is needed to keep it out of the tab
order. No change to the shared `app/design-system/components/Link.tsx` primitive was needed or made
— `LinkProps` is untouched; the placeholder deliberately isn't a `Link` instance at all, which avoids
widening that primitive's prop surface for a single call site.

**`focusChild`/`focusMode="child"` interaction, checked, not assumed.** This `TableCell` passes
`focusChild`, which `TableCell.tsx` forwards to React Aria Components' `Cell` as
`focusMode="child"` — confirmed by reading `TableCell.tsx` directly. React Aria's own grid-cell
child-focus mode walks the cell's descendants for the first *focusable* element (the same
tabbable-element semantics `react-aria-components` already relies on elsewhere in this codebase),
not `firstElementChild` — so a non-interactive, `aria-hidden`, href-less placeholder sitting first in
DOM order is skipped, and the real, focusable View link (or the real Edit link, when present)
receives focus correctly on every row. No behavior change to keyboard grid navigation.

**Test requirement.** Extend `HazardousEventListPage.test.tsx`'s existing "row-level Edit action"
describe block (Decision 23's own tests) with: (a) a two-row render (one `DRAFT`, one `SUBMITTED`,
same `EditData`-holding role) asserting both rows' actions cell contains exactly one Edit-position
element before the View link — the real `<a href=".../edit/...">` for `DRAFT`, a placeholder
`<span aria-hidden="true">` with no `he-preview/edit` href for `SUBMITTED`; (b) the existing
`data-viewer`/`null`-role "renders no Edit link" assertions extended to additionally assert the
placeholder is present in the Edit position for those rows too, not merely that no Edit link exists;
(c) a regression check that the existing view-action/picker-override tests (lines ~281-295 and the
`renderActionsCell`-override coverage) are unaffected — the picker's own override path never reaches
this placeholder logic at all. Per the project's string-based `renderToString` test convention
already used throughout this file, assert on the placeholder via a DOM-structure/string match (e.g.
the presence of `<span aria-hidden="true"` immediately preceding the View icon's own markup, and the
absence of any `he-preview/edit` href on that row), not a pixel measurement — Vitest/jsdom cannot
measure real layout, so the live Gate 9 pass (below) is what actually confirms the pixel-level fix.

**Gate 9 (live-browser), measurement-based, not an eyeball check.** Using real Chrome via `yarn dev`
against seeded data containing both an editable-status row and a locked-status row for the same
`EditData`-holding session: confirm via `getBoundingClientRect().left` on the View icon's own
rendered element that its horizontal position is identical between the two rows. Check at two
viewport widths, one below and one at/above `1024px` — `.mg-button`'s own rule switches `display:
flex` to `display: inline-flex` at that breakpoint (`style-dts.css` line ~569), and this fix must hold
under both. Separately confirm `Tab` from the hazard-type cell (or whichever cell precedes Actions)
lands on View directly for a locked row, never pausing on the placeholder.

**Why this is the minimal correct fix, not a bigger refactor of the table styling.** The fix is
confined to the two-branch Edit slot inside one existing `<span>` in `HazardousEventListPage.tsx` — no
new CSS class, no change to `.dts-table__actions`/`.mg-button`/`.mg-button-table` in
`style-dts.css`, no change to `TableCell`/`TableColumn`, no change to the shared `Link` component, and
no generalization of `row_meta.tsx`-style grid layout into this table (that generic engine belongs to
the create/edit *form*'s own layout, Decision 9 Addendum 2, and is explicitly out of scope for a
read-only list table with exactly two possible row actions). Only the Edit slot gains a placeholder
branch because only Edit's presence varies; View needs no placeholder of its own because View never
varies. No DB migration; no new dependency; deploy is a pure code change confined to
`HazardousEventListPage.tsx` and its own test file; rollback is a plain revert.

### Decision 25 — Stale/tampered validator list on `submit-validation` now rejected before the primary create/update, closing the one residual write-before-reject gap left open by the earlier role-gating/empty-validator-list fix (10.12d review pass, user-approved, 2026-11-04)

**The gap, as left open by the earlier fix (above, "Resolved" bullet).** That fix moved two checks
earlier — admin-role gating for `direct-validate`/`direct-publish`, and a *client-submitted* empty
validator list for `submit-validation` — both pure, synchronous functions of the parsed form data
and the acting role. It explicitly left one case unfixed: a `submit-validation` request whose
`tempValidatorUserIds` is non-empty but every id is stale or tampered (invalid against the real,
tenant-scoped candidate list). That case can only be detected with an async DB lookup
(`FindValidatorCandidatesUseCase`), which `requireWorkflowActionAuthorized`'s synchronous guard
doesn't have — so it stayed inside `composeWorkflowAction.server.ts`, which only runs **after**
`CreateHazardousEventUseCase`/`UpdateHazardousEventUseCase` has already committed. Consequence,
confirmed by reading `composeWorkflowAction.server.ts` directly: the record is saved, the user then
sees a generic 422 error page (neither `new.tsx` nor `edit.$id.tsx` wraps the call site in a
try/catch, so the thrown `Response` propagates past the existing partial-success redirect), with no
"it was saved" messaging — and a naive retry of what looks like a failed submission creates a
**second**, duplicate event via `new.tsx`'s own create path.

**Why this is fixable the same way, now.** `getValidCandidateIds()` (ultimately
`FindValidatorCandidatesUseCase.execute({ tenantId, excludingUserId })`, read directly in
`buildWorkflowComposerCallbacks.server.ts`) depends only on `tenantId`/`actingUserId` — never on the
record's own id. Nothing about this lookup requires the create/update to have already committed. Only
`getRecordDisplayName` needs the record's id, and only to read the just-created/updated row's current
hazard classification (not a stale pre-edit name — see that closure's own comment). This makes the
exact same reasoning as the "Why moving the presentation-layer check earlier is safe" passage above
apply here too: both checks are pure functions of data available before the write, so moving this one
earlier changes nothing for a request that was always going to succeed, and only changes behavior for
an invalid one — rejecting it fail-closed, before any write, instead of after.

**Fix shape, confirmed against the real current code (`composeWorkflowAction.server.ts`,
`buildWorkflowComposerCallbacks.server.ts`, both route files), not transcribed from the initial
brief.**

1. **`buildWorkflowComposerCallbacks` no longer takes `id` at factory-call time.** New signature:

   ```ts
   function buildWorkflowComposerCallbacks({
   	tenantId,
   	actingUserId,
   }: {
   	tenantId: string;
   	actingUserId: string;
   }): {
   	getRecordDisplayName: (id: string) => Promise<string>;
   	getValidCandidateIds: () => Promise<string[]>;
   };
   ```

   `getRecordDisplayName` now takes `id` as a call-time parameter instead of having it baked into
   the factory — this realigns the code with what task 9k.7 already documented in prose ("takes the
   target event's own `id` as a parameter") but did not actually implement; 9k.7/9k.8 themselves are
   not edited (see the tasks.md note below), this corrects the drift going forward.
   `getValidCandidateIds` is unchanged in shape; being usable immediately, with no id dependency, is
   exactly what makes calling it early possible. One factory call per action invocation, not two —
   no placeholder id is threaded through.

2. **New shared helper, not inlined in either route** (a fresh subagent's review of the initial
   fix sketch correctly flagged that inlining the filter-and-throw in both `new.tsx` and
   `edit.$id.tsx` would reintroduce the exact duplication 9k.7-9k.9 just removed, and would sit
   uneasily against this spec's own "routes contain no business logic inline" requirement):

   ```ts
   // app/domains/hazardous-events/presentation/web/requireValidValidatorIds.server.ts
   async function requireValidValidatorIds(args: {
   	mappedAction: MappedWorkflowAction | null;
   	parsed: ParsedHazardousEventFormData;
   	getValidCandidateIds: () => Promise<readonly string[]>;
   	request: Request;
   }): Promise<readonly string[]>;
   ```

   Returns `[]` immediately for any `mappedAction` other than `"submit-validation"` (no DB call).
   For `"submit-validation"`, calls `getValidCandidateIds()`, filters `parsed.validatorUserIds`
   against it, and — if the filtered result is empty — throws via `throwHazardousEventLoaderError`
   with the same `ValidationError` message `composeWorkflowAction.server.ts` used to throw
   (`"At least one validator must be selected for submit-validation"`), otherwise returns the
   filtered (guaranteed non-empty) list. This is a new, separate helper, not folded into
   `requireWorkflowActionAuthorized`/`isWorkflowActionAuthorized` — those stay synchronous and pure,
   and design.md already deliberately kept the validator-list rule out of the role predicate (see
   the "Resolved" bullet above); this helper is additive to that pattern, not a rework of it.

3. **Both routes call it once, early, right after `requireWorkflowActionAuthorized`** (the cheap,
   synchronous check first, the DB-dependent one second), before `CreateHazardousEventUseCase.execute()`/
   `UpdateHazardousEventUseCase.execute()`:

   ```ts
   const { getRecordDisplayName, getValidCandidateIds } = buildWorkflowComposerCallbacks({
   	tenantId,
   	actingUserId: session.user.id,
   });
   const validatorUserIds = await requireValidValidatorIds({
   	mappedAction,
   	parsed,
   	getValidCandidateIds,
   	request,
   });
   ```

   then, after the primary use case commits, both routes spread the already-filtered
   `validatorUserIds` and a `getRecordDisplayName` closed over the real id into
   `composeWorkflowAction`:

   ```ts
   const result = await composeWorkflowAction({
   	...
   	entityId: created.id, // or event.id in edit.$id.tsx
   	getRecordDisplayName: () => getRecordDisplayName(created.id), // or event.id
   	validatorUserIds,
   	request,
   });
   ```

   Both routes need the identical restructuring — `edit.$id.tsx` already has `event.id` upfront
   (it is editing an existing record), but that doesn't change this shape: `getRecordDisplayName`
   still must run **after** `UpdateHazardousEventUseCase.execute()` commits, not before, to pick up
   a classification change made in the same submission (the existing "re-fetched, not the stale
   pre-edit name" reasoning in that closure, untouched) — only `getValidCandidateIds` moves earlier,
   in both routes equally. The asymmetry the initial brief raised (edit knows its id upfront, create
   doesn't) turns out not to matter: the early call only ever needs `tenantId`/`actingUserId`.

4. **`composeWorkflowAction.server.ts` loses `getValidCandidateIds` entirely — option (a) from the
   brief, not option (b), confirmed safe by reading `ProcessWorkflowActionUseCase.execute()`
   directly.** That use case already throws `ValidationError` when
   `command.action === "submit-validation" && command.validatorUserIds.length === 0` (its own
   lines ~91-98, predating this change) — the authoritative, domain-layer backstop every caller gets
   for free, not something this fix adds. Since the route now guarantees a non-empty, filtered list
   by construction before `composeWorkflowAction` is ever reached, a defensive re-check inside
   `composeWorkflowAction` itself would duplicate a check that already exists one layer down for
   free. `composeWorkflowAction`'s signature replaces the `getValidCandidateIds` callback with a
   plain `validatorUserIds: readonly string[]` parameter, and its lines 49-68 (the filter + empty
   check + throw) are deleted outright — `args.validatorUserIds` is used directly at the call into
   `processWorkflowActionUseCase.execute()`. Its header comment, which explained the now-removed
   check as "a stale/tampered validator list ... needs an async DB lookup the route-level guard
   doesn't have," is rewritten: that objection no longer applies once the route itself does this
   lookup early.

**TOCTOU window, noted, not a new scenario.** The candidate list is re-read between the early check
and `ProcessWorkflowActionUseCase.execute()` actually running — a candidate could, in principle,
become invalid in that window (e.g. a role revoked mid-request). This race already existed before
this fix (the window just used to sit entirely inside `composeWorkflowAction.server.ts`, after the
write); this fix widens it to also span the primary create/update call, but does not introduce a new
failure mode — `ProcessWorkflowActionUseCase.execute()`'s own authoritative validator-list check
(point 4, above) still runs as the final backstop regardless.

**Test requirement.** The two existing documented tests this gap's own residual-gap note named —
`"submit-validation with only stale/invalid validator ids still runs
Create/UpdateHazardousEventUseCase.execute"` in both `HazardousEventNewRoute.test.ts` and
`HazardousEventEditRoute.test.ts` — are **inverted**, not joined by a new test, the same way the
earlier role-gating/empty-validator-list fix inverted its own predecessor tests: they now assert the
primary use case is **not** called and the repository is unchanged (create: `countAll` before/after
equal; edit: `description`/`updatedAt` unchanged), mirroring the empty-validator-list test
immediately above each of them in both files. The existing mixed valid/invalid validator-id test
("filters out the invalid id and still succeeds") already covers partial filtering end-to-end and is
unaffected by this change in shape — it is re-verified, not rewritten, since filtering moved earlier
but its outcome (only the valid id reaches `ProcessWorkflowActionUseCase.execute`) is unchanged.

**Stale "design.md Risks" citations corrected.** This file has no `## Risks` heading (established
above, Decision 9's "Conditional visibility" note). `composeWorkflowAction.server.ts`'s
header comment, `new.tsx`/`edit.$id.tsx`'s inline comments, and
`specs/hazardous-event-write-route-adapter/spec.md` all wrongly cited it for this gap — corrected to
cite **Decision 25** instead, as part of this fix.

**Scope, deliberately not broadened.** This decision does not touch
`requireWorkflowActionAuthorized`/`isWorkflowActionAuthorized` or the role-gating/empty-validator-list
checks they already moved earlier — it is additive to that existing pattern, covering the one
narrower case (a non-empty but entirely stale/tampered list) that was deliberately left out of it.
No DB migration; no new dependency; deploy is a pure code change confined to
`composeWorkflowAction.server.ts`, `buildWorkflowComposerCallbacks.server.ts`, a new
`requireValidValidatorIds.server.ts`, and both route files plus their own test files; rollback is a
plain revert.

### Decision 26 — `submit-draft`/`resetToDraft` role backstop: closing Decision 2's overclaimed uniform-protection gap for a future shared-use-case caller (10.12d review pass, user-approved, 2026-11-04)

**The gap, re-derived against the real code, not transcribed from the initial framing.**
`resetToDraft()` (`WorkflowInstance.ts` lines ~323-336) calls `this.transition(STATUS_VALUES,
"resetToDraft", now, {...})` — `STATUS_VALUES` is literally every status, so `transition()`'s own
`allowedFrom` guard (line ~249, `if (!allowedFrom.includes(this.props.status))`) can never reject a
`resetToDraft` call from any status. This is deliberate and correct — Decision 5/6 already
established why (editing the content of an already-approved/published record via a plain default
save must reset status to `DRAFT` and clear stale attribution regardless of prior status) — and this
decision does **not** touch that behavior.

The gap is in Decision 2's own claim about what backstops this, not in `resetToDraft()` itself.
Decision 2 (above, "This is load-bearing for Decisions 5/6, not incidental") asserted: "A server-side
caller that bypasses the UI could still attempt them [`resetToDraft`/`directValidate`/`directPublish`]
from a blocked status; the entity's own `transition()` guard ... is what rejects that with
`ConflictError`, same as any other transition." That holds for `directValidate`/`directPublish`
(narrow `allowedFrom: ["DRAFT", "REVISION_REQUESTED"]`) but was false for `resetToDraft`: because its
`allowedFrom` is every status, the entity provides zero backstop against *who* calls it or *from what
status* — contradicting the "same as any other transition" framing. Decision 2's text above is
corrected in place (this decision edits it directly, not only here).

Contrast with `directValidate`/`directPublish`, which have both a narrow `allowedFrom` **and** an
admin-role check authoritatively enforced inside `ProcessWorkflowActionUseCase.execute()`
(`ProcessWorkflowAction.ts` lines ~104-110, via the shared `isWorkflowActionAuthorized` predicate).
`resetToDraft`/`submit-draft` has neither an application-layer role check today — only HE's own
status-aware edit-permission gate (Decision 2, `edit.$id.tsx`'s loader/action) prevents misuse in
practice, and that gate is presentation-layer, HE-specific, and exists because HE chose to build it
— it is not inherited by any other caller of this shared use case. A future caller (e.g. DE/
disaster_records adopting `ProcessWorkflowActionUseCase` directly, or any caller skipping HE's own
route) could invoke `submit-draft` with no role at all, and nothing in the application/domain layer
would stop it.

**The fix — minimal generic backstop, not full status-aware parity (user-approved; two other options
declined: a doc-only correction, or replicating HE's status-aware edit-permission rule into the
shared use case).**

1. `app/domains/validation-workflow/application/isWorkflowActionAuthorized.ts` gains a `submit-draft`
   case: `actingUserRole === undefined || actingUserRole === "data-viewer"` → `false`; otherwise
   `true`. Same bare-string-literal style as the existing `"admin"` check — no dependency on
   `~/frontend/user/roles.ts`'s richer permission-matrix abstraction is introduced, consistent with
   this file's existing choice to stay entity-type-agnostic. The function's own docstring ("every
   other action ... is unrestricted") is corrected: `submit-draft` is no longer unrestricted;
   `submit-validation`/`validate`/`publish`/`return` remain so.
2. `ProcessWorkflowActionCommand`'s `submit-draft` variant (`ProcessWorkflowAction.ts` line ~47)
   gains `actingUserRole: string | undefined` — required, not optional (`?:`), the same shape as
   `direct-validate`/`direct-publish`'s own field, so every construction site must pass it
   explicitly, even as `undefined`. `execute()` gains a check alongside the existing admin-only one
   (lines ~104-110): for `command.action === "submit-draft"`, throw
   `AuthorizationError("submit-draft requires an edit-capable role")` when
   `!isWorkflowActionAuthorized("submit-draft", command.actingUserRole)`.
3. `composeWorkflowAction.server.ts`'s generic `else` branch (lines ~69-76) — confirmed, by reading
   `MappedWorkflowAction`'s type (`"submit-draft" | "direct-validate" | "direct-publish" |
   "submit-validation"`), to handle `submit-draft` exclusively, since the other three mapped actions
   each have their own branch — now passes `actingUserRole: args.actingUserRole` through (already a
   parameter of this function, used today by the `direct-validate`/`direct-publish` branch).
4. `requireWorkflowActionAuthorized.server.ts` gains the same early check for `submit-draft`, for
   consistency with the existing `direct-validate`/`direct-publish` pre-check (lines ~30-41) and to
   avoid a future write-before-reject regression (the same shape Decision 25 just closed for the
   validator-list case) if an HE route change ever let `submit-draft` reach this function with a
   disallowed role. **Confirmed dead code today, not a live guard — see "Reachability" below.**
   Included anyway because this file's established pattern is to fail-fast for every role-gated
   action it already knows about, not because it currently blocks anything live.

**Reachability through HE's own routes today — verified, not assumed.**
`app/frontend/user/roles.ts`'s `roles` table (lines ~339-347) grants `EditData` only to
`"data-collector"`/`"data-validator"`/`"admin"` — never to `"data-viewer"`, and an `undefined` role
fails `roleHasPermission` outright. Both `new.tsx` and `edit.$id.tsx` reject on the flat `EditData`
check (Decision 2) before `requireWorkflowActionAuthorized` ever runs. So by the time `submit-draft`'s
new check would evaluate `actingUserRole` inside either HE route, that role is already guaranteed to
be one of the three that pass it. **This fix changes no observable behavior through HE's existing
routes.** It is pure defense-in-depth for the shared, entity-type-agnostic use case and the
fail-fast guard in item 4, protecting a future caller that does not sit behind HE's own `EditData`
gate — exactly the DE/disaster_records scenario the gap description names. Test coverage reflects
this honestly: the real coverage is at the predicate (`isWorkflowActionAuthorized`) and use-case
(`ProcessWorkflowActionUseCase.execute`) layers; a `HazardousEventNewRoute`/`HazardousEventEditRoute`
integration test for a `data-viewer` role submitting `submit-draft` would only ever exercise the
earlier `EditData` `403`, not this new check, so no such integration test is added for that specific
case (Section 9m below tests this honestly instead).

**Why this does NOT replicate HE's own status-aware edit-permission rule
(`canEditDataCollectionRecord`'s `SUBMITTED`/`APPROVED`/`PUBLISHED`-blocks-edit logic) into the shared
use case — the user's own stated reasoning.** That rule is HE-specific business policy about which
record *statuses* a given role may edit at all, already correctly placed at the HE route/loader layer
(Decision 2) where it has access to the record's own `workflowStatus`. `ProcessWorkflowActionUseCase`
is entity-type-agnostic (`IWorkflowRepository`/`INotificationPort`, no HE-specific knowledge) and must
stay that way for DE/disaster_records to reuse it unmodified. Folding HE's richer status-aware matrix
into this shared use case would (a) hard-code an HE policy into a cross-domain layer, forcing every
future entity type to either inherit or fight it, and (b) duplicate logic that already lives
correctly, once, at the HE layer. This fix closes only the narrower "no role at all" gap — a bare
role-allowlist check, symmetric in shape with the existing admin-only check — and leaves the richer
status-aware rule exactly where Decision 2 put it.

**Test requirement.** `isWorkflowActionAuthorized.test.ts`'s existing `it.each([...,
"submit-draft"])("%s is authorized for every role, including undefined", ...)` block (it currently
groups `submit-draft` with `submit-validation`/`validate`/`publish`/`return`) is split: `submit-draft`
moves into its own assertion (rejected for `"data-viewer"`/`undefined`, accepted otherwise), the
remaining four actions keep the existing "authorized for every role" assertion unchanged. The
existing cross-call-site-agreement `describe` block (same file, `it.each(["direct-validate",
"direct-publish"])`, calling both `requireWorkflowActionAuthorized` and
`ProcessWorkflowActionUseCase.execute` directly with each role) gains a parallel `"submit-draft"`
case — this is also the correct place to exercise `requireWorkflowActionAuthorized`'s own new check
directly, bypassing HE's `EditData` gate, since (per "Reachability" above) going through the full
route never reaches it. `ProcessWorkflowAction.test.ts`'s existing `submit-draft` command literals
(the three `it`s/one `it.each` building `{ action: "submit-draft", entityId, entityType,
actingUserId }` with no `actingUserRole`) stop compiling once the field becomes required and are
updated to include a valid `actingUserRole` (e.g. `"data-collector"`) — a type-fixup to pre-existing
tests, not new assertions; their own behavior is otherwise unaffected since all three pass the new
check.

**Scope, deliberately not broadened.** No DB migration; no new dependency; no change to
`resetToDraft()`'s own unconditional `allowedFrom`, to `submit-validation`'s rule, or to HE's own
status-aware edit-permission gate. No change to `new.tsx`/`edit.$id.tsx` — both already resolve and
pass `actingUserRole`/`role` to `requireWorkflowActionAuthorized` and `composeWorkflowAction`, so no
route-file edit is needed to thread the new field through. Deploy is a pure code change confined to
`isWorkflowActionAuthorized.ts`, `ProcessWorkflowAction.ts`, `composeWorkflowAction.server.ts`, and
`requireWorkflowActionAuthorized.server.ts`, plus their own test files; rollback is a plain revert.

**Addendum — the `submit-draft` check is a denylist, not the allowlist this decision claimed
(9k-9n heavy-gate pass finding, all three independent reviewers converged, user-approved,
2026-11-04).** Item 1 above, and the "bare role-allowlist check, symmetric in shape with the
existing admin check" sentence later in this decision (the paragraph beginning "Why this does NOT
replicate HE's own status-aware edit-permission rule"), both mis-describe the shipped predicate.
The real code in `isWorkflowActionAuthorized.ts` is:

```ts
if (action === "submit-draft") {
	return actingUserRole !== undefined && actingUserRole !== "data-viewer";
}
```

That rejects exactly two values (`undefined`, `"data-viewer"`) and accepts every other string,
including a typo'd or garbage role (`"data_collector"`, `"ADMIN"`, `""`). It is a denylist. The
admin-only check for `direct-validate`/`direct-publish` (`actingUserRole === "admin"`) is the real
allowlist this decision meant to match in shape — it accepts exactly one known-good value. Given
this predicate's own stated purpose (defense-in-depth for a future shared-use-case caller, e.g.
DE/disaster_records, that might not sit behind HE's own `EditData` gate, where the only input is an
untrusted role string), a denylist is the wrong tool: it authorizes anything that isn't one of two
blocked strings, which is the opposite of defense-in-depth against unknown/malformed input.

**Correction.** Convert to a true allowlist of known edit-capable roles:

```ts
const EDIT_CAPABLE_ROLES = new Set(["data-collector", "data-validator", "admin"]);
// in isWorkflowActionAuthorized:
if (action === "submit-draft") {
	return actingUserRole !== undefined && EDIT_CAPABLE_ROLES.has(actingUserRole);
}
```

**One judgment call, flagged.** The role set is `"data-collector"`/`"data-validator"`/`"admin"` —
**three** roles, not four. `"super_admin"` is a real `RoleId` (`app/frontend/user/roles.ts`), but
verified against that file's own `roles` table: `super_admin`'s permission list has no `EditData`
("no country-specific permissions for data sovereignty," per that file's own comment) — it is not
edit-capable in this codebase. This matches this decision's own text elsewhere: item 1's "accepted
otherwise" (now corrected above) and the "Reachability" passage below both independently name only
`"data-collector"`/`"data-validator"`/`"admin"` as the three roles `EditData` grants. Dropping
`super_admin` is therefore not a new restriction invented here — it is this decision's own existing
reasoning, applied consistently to the predicate's code instead of just its prose. It is a real
predicate-level behavior change from today's shipped denylist (which currently accepts
`super_admin`, since it isn't `undefined` or `"data-viewer"`), though still unreachable through
either HE route (`EditData` already excludes `super_admin` before `requireWorkflowActionAuthorized`
ever runs), for the same reason the rest of this decision's "Reachability" analysis holds.

**Test impact.** `isWorkflowActionAuthorized.ts`'s own docstring ("submit-draft: rejects
undefined/"data-viewer"") is corrected to describe the allowlist, not the two rejected values.
`isWorkflowActionAuthorized.test.ts`'s existing `it.each(["data-collector", "data-validator",
"admin", ""])("submit-draft is authorized for actingUserRole %s", ...)` asserting `true` for `""`
must flip: `""` is not a listed valid role, so under the allowlist it is rejected. This also
realigns the test with task 9m.1(b)'s own original spec, which already called for `""` to assert
`false` — the shipped test diverged from its own task; this fix corrects the drift, not just the
production code. `super_admin` was never covered by an existing assertion for `submit-draft`, so
there is no existing "accepted" assertion to flip for it — it is simply absent from the new
allowlist's accepted set.

**Not an in-place edit.** Per this file's own established precedent for a later-round correction
(see Decision 25's "Tasks 9k.7/9k.8 are not edited... design.md Decision 25 instead notes where
this section's... signature change supersedes 9k.7's prose"), this addendum supersedes item 1's
code block and the "bare role-allowlist check, symmetric in shape" sentence above, in place, by
addition — those passages are left as shipped-decision history, not rewritten, and this addendum is
the authoritative statement of the predicate's correct shape going forward.

### Decision 27 — `GetHazardousEventById.ts`'s cause-lookup comment corrected; DEF-012 extended with the `replaceCauseEdge` blind-delete finding (10.12d review pass, user-confirmed inert via direct data check, 2026-11-04)

**The finding, re-derived against the real code, not transcribed from the initial framing.**
`GetHazardousEventById.ts` lines ~75-77 carries a comment claiming "the same-tenant invariant means
this should never actually miss." That claim is inaccurate about *where* tenant scoping lives.
`findCauseEdge(effectId)` (`DrizzleCausalChainRepository.server.ts` lines 200-218) filters only by
`effect_hazardous_event_id` — it has no tenant check of its own, so a cross-tenant edge, if one
existed, would be found here. The tenant scoping is in the *next* call: `findById(causeEdge.causeId,
query.tenantId)` (line 83) is scoped to `query.tenantId`, and its `NotFoundError` is caught (lines
87-94) and degrades to `causeEvent = null` rather than rethrowing. So a cross-tenant edge is not
missed at the edge-lookup step — it is found, then its cause *event* is filtered out one step later,
producing the same observable result (`cause: null`, "Parent: -" on the page) but via a different
mechanism than the comment describes.

Separately, `UpdateHazardousEvent.ts`'s `validateCauseIfSet` (lines 344-347) correctly enforces
same-tenant-only when *setting* a new cause — confirmed correct and unaffected by this fix. But
`replaceCauseEdge` (`DrizzleCausalChainRepository.server.ts` lines 169-173) unconditionally deletes
whatever edge currently exists for the effect event, with no tenant filter at all, before inserting
the new validated one — on both `set` and `clear` (`UpdateHazardousEvent.ts`'s `applyCausalEdgeChange`,
lines 365-372, routes either outcome through the same `replaceCauseEdge` call). So a pre-existing
cross-tenant edge (predating today's write-time enforcement, or from the real-world transboundary
scenario DEF-012 itself already describes) would be silently deleted the next time a user explicitly
set or cleared the cause via the edit form, with no warning it ever existed.

**Confirmed currently inert — a documentation correction, not a behavior-changing fix.** The user
confirmed directly against real data (2026-11-04) that no cross-tenant `hazardous_event_causality`
rows exist in current or legacy data today. So this residual mechanism is real but has nothing to
act on right now: no code behavior changes as a result of this decision. The comment still needed
correcting regardless of that — it made a factually false claim about the current code's own
mechanics (where the miss happens, and why), independent of whether any row exists today to exercise
it. Leaving a false comment in place would mislead the next reader (including whoever eventually
designs DEF-012's sharing/access-control mechanism) about which call is actually tenant-scoped.

**Exact comment correction** (`GetHazardousEventById.ts`, replaces the two-line comment at lines
76-77, same indentation, same `//` style and `--` convention as the comment it replaces):

Before:
```
// Defensive only -- the same-tenant invariant means this should never actually miss;
// degrades to "no cause" rather than failing the page (DEF-031 precedent, as above).
```

After:
```
// Edge lookup here is unscoped; the cause fetch below is tenant-scoped, so a cross-tenant
// edge (none today, confirmed 2026-11-04 -- see DEF-012) degrades to "no cause" here, not a
// failure (DEF-031 precedent, as above).
```

**DEF-012 register extension** (`_docs/refactoring-plan/deferred-items-register.md`, additive
clause appended to DEF-012's existing Detail cell, applied verbatim — Category/Trigger unchanged,
Origin gains one citation for this decision):

> A related but distinct finding (`6c`'s 10.12d review, confirmed 2026-11-04):
> `DrizzleCausalChainRepository.server.ts`'s `replaceCauseEdge` deletes any existing cause edge for
> an effect event with no tenant check of its own, before inserting a newly-validated one, whenever
> `UpdateHazardousEvent.ts`'s `causeAction` is `set` or `cleared` (not only when setting a new
> parent). `GetHazardousEventById.ts`'s own `findCauseEdge` lookup is itself unscoped, but the
> cause-event fetch that follows it is tenant-scoped and silently discards a cross-tenant cause
> (degrades to `cause: null`, shown as no parent) rather than surfacing that an edge exists. If a
> user then explicitly set or cleared the cause via the edit form's "Change"/"Unset" control, that
> hidden pre-existing cross-tenant edge would be silently deleted with no warning it ever existed.
> Confirmed currently inert — no cross-tenant `hazardous_event_causality` rows exist in current or
> legacy data today (data check, 2026-11-04) — but this is a real silent-data-loss risk the moment
> one did exist, and whoever designs the sharing/access-control mechanism above needs to account for
> `replaceCauseEdge`'s own blind delete too, not only the access-control question this item is
> primarily about.

**Scope, deliberately minimal.** No code behavior change; no new test (comment-only edit, nothing
observable to assert against); no spec sync (nothing in `specs/` describes this comment's wording,
and no observable behavior changed for a spec to reflect). Confined to the one comment in
`GetHazardousEventById.ts` and the one additive clause in DEF-012's own register entry (Section 9n
below). No additional heavy-gate follow-up applies beyond 10.12d's own extended scope — no production
behavior changed, so there is nothing for mutation testing, SOLID review, or an independent second
opinion to evaluate.
