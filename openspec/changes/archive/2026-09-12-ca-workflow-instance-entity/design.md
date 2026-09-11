## Context

See proposal.md - Why for motivation. This covers only what shapes the entity/port
design.

The only prior art in this bounded context is the already-archived `ca-workflow-schema`
change's tables (`app/domains/validation-workflow/infrastructure/workflowInstanceTable.ts`).
Its real column set is the sole source of truth for this entity's shape:

- `status`: `STATUS_VALUES = ["DRAFT", "SUBMITTED", "REVISION_REQUESTED", "APPROVED", "REJECTED", "PUBLISHED"]`
- `entityId` (uuid, not null) / `entityType` (`ENTITY_TYPE_VALUES = ["HE", "DE", "DR"]`) —
  polymorphic key, no FK (schema design.md Decision 1)
- Four independent attribution pairs, each `<name>ByUserId` (nullable FK to `userTable`) +
  `<name>At` (nullable `timestamptz`): `submittedBy/submittedAt`,
  `validatedBy/validatedAt`, `approvedBy/approvedAt`, `publishedBy/publishedAt`
- `UNIQUE(entityId, entityType)` — one instance per entity (schema design.md Decision 4)
- No `countryAccountsId` — tenant validation happens in the caller's own repository
  (schema design.md Decision 2)

The roadmap's 3a intent text does not fully specify which transition writes which
attribution pair, or the exact allowed-status-graph, beyond the publish backfill rule. The
task brief resolves the attribution mapping explicitly (submit → submitted pair, approve
decision → approved pair, revision-request → no attribution). This design document works
out the remaining detail — the full transition graph and where `validated*` gets written
outside of publish's backfill — grounded only in the real column set, per the roadmap's
own Phase 3 Gate (zero invented columns).

Existing precedent to follow: `app/domains/notices/domain/Notice.ts` (private constructor

- single validated static factory, read-only getters, deterministic pure functions with an
  explicit `now: Date` parameter rather than an internal clock read) and
  `app/domains/notices/application/ports/INoticeRepository.ts` (port shape, tenancy
  documented per-method in the interface's own doc comment).

## Goals / Non-Goals

**Goals:**

- Define `WorkflowInstance` as an immutable, framework-free domain entity whose
  transition methods enforce a fixed, fully-specified status graph.
- Implement the publish backfill rule exactly as resolved (open decision #9): publish
  always stamps `publishedBy`/`publishedAt`; it stamps `validatedBy`/`validatedAt` only
  when both are still `null`.
- Define `IWorkflowRepository` with `findByEntity`, `findByEntityIds`, `save` — no
  `tenantId` parameter anywhere, matching the table's own lack of `countryAccountsId`.
- Zero DB/framework imports in either new file, verified by `yarn tsc` and by the test
  tier itself (unit only, no PGlite import — Phase 3 Gate).

**Non-Goals:**

- No Drizzle adapter implementing `IWorkflowRepository` (Phase 4a/5a).
- No use case, no NestJS module wiring, no `INotificationPort` (Phase 4a).
- No `reject()` method or any resubmission-after-reject edge — see Decision 4.

## Decisions

### 1. Status-transition graph, and which transition writes which attribution pair

Grounded directly in the four real attribution pairs plus the task brief's own resolution
for `submit`/`approve`/`requestRevision`. `validate` is this design's own resolution (see
rationale below), and `publish` implements the already-resolved backfill
rule (open decision #9).

| Method              | Allowed from                  | Resulting `status`      | Attribution written                                                                                                                                          |
| ------------------- | ----------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `submit()`          | `DRAFT`, `REVISION_REQUESTED` | `SUBMITTED`             | `submittedByUserId`/`submittedAt` (always overwritten — resubmission updates who/when); also clears `validatedByUserId`/`validatedAt` to `null` (Decision 8) |
| `validate()`        | `SUBMITTED`                   | `SUBMITTED` (unchanged) | `validatedByUserId`/`validatedAt` (always overwritten by a real validate call)                                                                               |
| `approve()`         | `SUBMITTED`                   | `APPROVED`              | `approvedByUserId`/`approvedAt`                                                                                                                              |
| `requestRevision()` | `SUBMITTED`                   | `REVISION_REQUESTED`    | none — no column exists for this event (task brief's own resolution)                                                                                         |
| `publish()`         | `APPROVED`                    | `PUBLISHED`             | `publishedByUserId`/`publishedAt` always; `validatedByUserId`/`validatedAt` only if both are currently `null` (backfill rule, open decision #9)              |

All five methods also stamp `updatedAt: now` — a post-review fix (Gate 10 finding); this
was missing initially despite every method already receiving `now` for this purpose.

`PUBLISHED` is terminal — no method transitions out of it. `REJECTED` is a valid
`status` enum member (matches the shipped DB CHECK constraint) so `create()` can
reconstitute a row in that state, but **no transition method in this change produces
or consumes `REJECTED`** — confirmed with the user: it represents a distinct future
capability (flagging a draft as a likely duplicate or miscategorized entry, not a
validation-workflow outcome), explicitly out of scope for this change. Any method
called from a status not listed in its "Allowed from" column throws (Decision 3).

**Why `validate()` exists as a same-status, attribution-only transition, not folded into
`approve()`:** `ca-workflow-schema` design.md Decision 10 explicitly describes
`workflow_instance` as having "four transitions symmetric (submitted/validated/approved/
published, each with `_by_user_id` + `_at`)" — four named events, even though `status`
itself has no `VALIDATED` value. Phase 0 finding 0c ("publishing silently overwrites the
original validator's attribution") only makes sense if validation is normally a
**separate, already-completed step before publish**, distinct from the approval decision
that moves status to `APPROVED`. Modeling `validate()` as a same-status transition (legal
only while `SUBMITTED`, writes no status change) is the only reading consistent with (a)
all four attribution pairs having a real writer, and (b) the publish backfill rule making
sense as a fallback for a validation step that was skipped ("direct publish, auto-marked
validated").

**Resolved with the user:** Phase 4a's `'validate'` use-case action calls this entity's
`validate()`, then, based on the reviewer's actual decision, separately calls `approve()`
(rejection has no entity method yet — see Decision 4). Both are legal from `SUBMITTED`
since `validate()` doesn't change `status`, so no redesign is needed here for that.

### 2. Immutable entity: private constructor, single validated `create()` factory, transition methods return a new instance

Matches `Notice`'s pattern. `WorkflowInstance` props are `readonly`; `WorkflowInstance.create(props)` is
the only construction path (used both for a fresh `DRAFT` instance — supplied by a future
use case with all four attribution pairs `null` — and for repository reconstitution from
a persisted row). Transition methods (`submit`, `validate`, `approve`,
`requestRevision`, `publish`) do not mutate `this`; each returns a **new**
`WorkflowInstance` reflecting the post-transition state. This avoids any shared mutable
entity state being read by two callers mid-transition (the concurrent-caller class of bug)
by construction — there is no in-place mutation to race on. `create()` validates
`entityType` and `status` are members of their respective enums, throwing `ValidationError`
otherwise (matches `Notice.create()`'s use of `ValidationError` for structural invariant
violations, not `ConflictError` — see Decision 3 for the distinction).

**Alternative considered:** mutable entity with transition methods mutating `this` and
returning `void` or `this`. Rejected — immutable-with-new-instance is the pattern already
established by `Notice`/`computePublishedAt`'s functional style in this codebase, and it
makes `WorkflowInstance.create()` (used to build the pre-transition test fixture) and the
post-transition result trivially comparable by reference in tests (old instance
untouched, new instance is the return value).

**Post-review hardening (Gate 10 finding):** `WorkflowInstanceProps`' fields are now
explicitly `readonly` at the type level (not just the constructor binding), and every
`Date`-returning getter clones before returning — a caller mutating a returned `Date` in
place could otherwise silently corrupt the entity's internal state despite the class
having no public setters.

**Round 3 hardening (Gate 10 finding):** the outbound cloning above left the inbound side
unguarded — `create()` and `transition()`'s internal `new WorkflowInstance(...)` both
stored the caller's `props` object by reference, so a caller mutating a `Date` they had
just passed in (or reusing a single shared `now` object across several transition calls)
could silently corrupt the entity's internal state immediately after construction, with no
public setter ever being called. Fixed at the one choke point both paths share — the
private constructor now clones every `Date`/nullable-`Date` field of `props` before
assigning `this.props`, so `create()` and `transition()` get the protection uniformly
rather than needing it duplicated at each call site.

**Round 4 note:** with Decision 9's timestamp-validity check now covering all six
`Date`-typed fields plus `transition()`'s own `now` check (Decision 5 addendum), no `NaN`
or non-`Date` value can reach the private constructor through the public API at all — the
constructor's cloning above still runs unconditionally (it has no way to know a caller
didn't go through `create()`/`transition()`), but every value it clones is now guaranteed
already-valid by the time it gets there.

### 3. Invalid transitions throw `ConflictError`, not `ValidationError`

`ConflictError` (`~/shared/errors`, code `CONFLICT`, statusHint 409) models "resource
conflict" per ADR-003 — an attempted state change that conflicts with the entity's current
state, as opposed to `ValidationError` (422), which models malformed input to `create()`.
Calling `approve()` on a `DRAFT` instance is not malformed input — the props are
perfectly valid — it is a conflict between the requested transition and the current
state. Reused directly from `~/shared/errors`; no new error class or file is added,
consistent with 3a's file list (`WorkflowInstance.ts`, its test, `IWorkflowRepository.ts`
only). Each throw includes `context: { entityId, entityType, from: status, attemptedTransition }`
(the base `DomainError` constructor's second argument) so a caller/logger can identify
which transition was rejected without parsing the message string.

### 4. Terminal states: `REJECTED` and `PUBLISHED` have no outgoing transition in this entity

Not addressed anywhere in the roadmap text for 3a. Chosen conservatively: no evidence
(column, roadmap prose, or Phase 0 finding) supports a resubmit-after-reject path, and the
schema has no attribution slot that would distinguish "resubmitted after rejection" from
a first submission anyway. Cheap to extend later — adding a new allowed edge to the graph
in Decision 1's table is additive, not a breaking change to existing callers. Flagged in
Open Questions for the human reviewer, since Phase 4a's UI action set may need it.

### 5. Transition methods take an explicit `{ userId, now }` parameter, never read a clock internally

Matches `Notice.computePublishedAt`'s explicit `now: Date` parameter. Keeps every method a
pure function of its inputs — required for the "zero framework dependency" gate and for
deterministic unit tests of the publish-backfill branch (both branches need to assert the
exact `Date` instance that ends up in `validatedAt`).

**Round 4 addendum — `transition()` validates `now`:** the private `transition()` helper
(the single choke point all five public transition methods call through) now checks `now`
with the same `isInvalidDate` predicate `create()` uses (Decision 9), throwing
`ValidationError` if it fails — added once here rather than duplicated per method. This is
malformed input, not a state conflict, so it's `ValidationError`, not `ConflictError`
(matches the structural-invalidity vs. state-conflict split already established in
Decision 3). The check runs **before** the `allowedFrom` status guard: an invalid `now`
throws `ValidationError` even when the current status would also fail the transition,
because malformed input takes priority over a state-conflict report — pinned by a test
covering exactly that ordering. This does not reopen `transition()`'s existing, still-true
trade-off of skipping `create()`'s enum/cross-field-consistency checks (status/entityType
can't change via `transition()`, so re-validating them there would be redundant) — only the
caller-supplied `now` needed its own check, since nothing else validates it.

### 6. `IWorkflowRepository`: no `tenantId` parameter on any method

Unlike `INoticeRepository` (where only `save` is exempt, because `Notice` itself carries
`tenantId`), **none** of `IWorkflowRepository`'s methods take `tenantId`, and
`WorkflowInstance` itself carries no tenant field — because `workflowInstanceTable` itself
has no `countryAccountsId` column (`ca-workflow-schema` design.md Decision 2: tenant
validation happens in the caller's own aggregate repository, e.g. HE's, before it ever
calls into this port). Documented on the interface's own doc comment, matching
`INoticeRepository`'s convention of stating the multi-tenancy contract inline, precisely
so a future implementer or reviewer doesn't read the _absence_ of `tenantId` as an
oversight.

- `findByEntity(entityId: string, entityType: EntityType): Promise<WorkflowInstance | null>`
  — returns `null`, not a thrown `NotFoundError`, when no instance exists yet.
  **Diverges deliberately from `INoticeRepository.findById`'s throw-based contract**:
  a `Notice` is expected to always exist once its `id` is known (it's fetched by primary
  key after being created), whereas a `WorkflowInstance` legitimately may not exist yet
  for a given entity during the additive, expand-only migration window before Phase M's
  cutover (`ca-workflow-schema`'s own migration plan is purely additive — nothing
  currently writes to these tables). Once Phase 4b ships (initializes one instance per
  entity at creation time), absence becomes rarer but the port contract does not need to
  change to reflect that — `null` remains a valid "not yet migrated" response either way.
- `findByEntityIds(entityIds: string[], entityType: EntityType): Promise<WorkflowInstance[]>`
  — single batched call for list views (e.g. an HE list page rendering a status badge per
  row) instead of one `findByEntity` per row (N+1) and instead of a list-view module
  querying `workflowInstanceTable` directly (breaks the module boundary
  `IWorkflowRepository` exists to enforce). Returns only the instances that exist; callers
  index the result by `entityId` and treat a missing key the same way as a `null` result
  from `findByEntity`.
- `save(instance: WorkflowInstance): Promise<WorkflowInstance>` — insert-or-update,
  matching `INoticeRepository.save`'s upsert contract. The `UNIQUE(entityId, entityType)`
  constraint (`ca-workflow-schema` design.md Decision 4) is what actually prevents two
  concurrent callers from creating two instances for the same entity — this port's own
  contract doesn't need to (and, with zero DB dependency in this change, cannot) add a
  second enforcement layer. Flagging this is not a new risk: `ca-workflow-schema`'s own
  design.md already accepts it as a persistence-layer concern.

**Why `findByEntity`/`findByEntityIds`/`save`'s no-implementation status doesn't trigger a
concurrent-callers spec scenario:** this change defines an interface only — no adapter, no
shared in-process mutable state (cache, counter, singleton) exists yet for two async
callers to race on. The one genuine concurrent-write hazard (two callers each trying to
create the first instance for the same entity) is a persistence-layer race already
mitigated by the DB unique index, not something a unit-tested interface signature can
exercise. Revisit when the Drizzle adapter (Phase 4a/5a) is proposed — that PGlite-backed
change is where a real concurrent-`save` scenario becomes testable and appropriate.

### 7. `create()` validates cross-field consistency, not just enum membership

Added after independent review (Gate 10 + mutation testing both independently flagged
that `create()` could construct a logically-inconsistent instance, e.g. `PUBLISHED` with
`publishedAt: null`). Two rules, both enforced in `create()` only — `transition()` bypasses
them deliberately (see its own comment):

1. **Pair consistency (status-independent):** each of the four attribution pairs
   (`submitted`, `validated`, `approved`, `published`) must be jointly `null` or jointly
   set — never split. This also closes the asymmetric-validator-state gap Gate 10 and
   mutation testing both found in `publish()`'s backfill check: since `create()` now
   rejects a split `validated` pair, that state can never reach `publish()` through the
   public API, making the fix stronger than defensively hardening `publish()` itself.
2. **Status consistency:** which pairs a given `status` requires set vs. requires null,
   derived from which transition method is the only writer of each pair:

   | status               | submitted                                               | validated | approved | published |
   | -------------------- | ------------------------------------------------------- | --------- | -------- | --------- |
   | `DRAFT`              | null                                                    | null      | null     | null      |
   | `SUBMITTED`          | **set**                                                 | either    | null     | null      |
   | `REVISION_REQUESTED` | **set**                                                 | either    | null     | null      |
   | `APPROVED`           | **set**                                                 | either    | **set**  | null      |
   | `REJECTED`           | unvalidated — no transition targets it yet (Decision 4) |
   | `PUBLISHED`          | **set**                                                 | **set**   | **set**  | **set**   |

   `validated` is "either" for `SUBMITTED`/`REVISION_REQUESTED`/`APPROVED` because
   `validate()` may or may not have been called yet; it's required set for `PUBLISHED`
   because `publish()`'s backfill rule guarantees it always ends up set by then.

### 8. `submit()` clears stale `validated` attribution on resubmit

Added after the user confirmed today's live `hazardousEventUpdateApprovalStatusNeedRevision`
clears `validatedByUserId`/`validatedAt` when a record is returned for revision — a
validator's sign-off on a since-corrected draft is misleading otherwise. This
implementation clears the pair at a different moment than the live behavior it's modeled
on: the live code clears it at _revision-request_ time, whereas `submit()` clears it at
_resubmit_ time. The end state is identical either way — a `SUBMITTED` instance produced by
a resubmission never carries stale validator attribution — and nothing in this entity
contradicts the spec it's replacing; this note exists only so a future reader doesn't
assume the two implementations clear at the same instant. `submit()` now always includes
`validatedByUserId: null, validatedAt: null` in its patch. Harmless when called from
`DRAFT` (already null there). Doesn't need to clear `approved`/`published` pairs — per
Decision 7's table, those are already guaranteed null for any status `submit()` can be
called from.

### 9. `create()` validates `createdAt`/`updatedAt` are valid Dates; the enum drift-guard test lives at the infrastructure tier

Two independent findings from a third round of review (two independent code-review passes
plus two mutation-testing runs), both closed together since they share a "framework-free
domain tier" theme:

1. **Timestamp validity.** `create()` checks `createdAt`/`updatedAt` — and, as of round 4,
   all four nullable attribution timestamps (`submittedAt`/`validatedAt`/`approvedAt`/
   `publishedAt`, each only when non-null) — with a single shared `isInvalidDate(value)`
   predicate (`!(x instanceof Date) || Number.isNaN(x.getTime())`), throwing
   `ValidationError` referencing the field name if any check fails. `createdAt`/`updatedAt`
   are checked first, then the four attribution fields in their own loop over `PAIR_NAMES`
   (nulls skipped), **before** Decision 7's pair-consistency loop — so an invalid `*At`
   value is always reported as a Date-validity error, not misreported as a pair-split
   error. `isInvalidDate` is reused a third time by `transition()`'s own `now` check (round
   4, see Decision 5 addendum below), closing the gap upstream at every entry point that can
   construct or transition an instance — a caller can no longer get an invalid Date into
   `submittedAt`/`validatedAt`/`approvedAt`/`publishedAt` through either `create()` or a
   transition method.

   **Round 4 scope note:** this expands round 3's `createdAt`/`updatedAt`-only check to all
   six `Date`-typed fields on `WorkflowInstanceProps`, per explicit user approval — the gap
   flagged in round 3's Risks section (below) is now closed, not merely documented.

2. **Drift-guard test relocation (round 3), superseded by deduplication (round 6).**
   `WorkflowInstance.test.ts` (added in round 2, Gate 8 finding A2) had imported
   `../infrastructure/workflowInstanceTable` — a Drizzle-backed module — purely to assert
   `ENTITY_TYPE_VALUES`/`STATUS_VALUES` match the table's own arrays. Round 3 fixed the
   framework-free violation this caused by relocating the test to a new
   `workflowInstanceTable.test.ts` at the infrastructure tier, keeping both arrays as
   separate hand-copies compared by a test.

   Round 6 removes the duplication itself rather than just guarding it: `WorkflowInstance.ts`
   is now the sole definition of both arrays; `workflowInstanceTable.ts` and
   `workflowHistoryTable.ts` (the only two consumers, confirmed by a repo-wide search) import
   them directly from the domain instead of declaring their own copies. This is not a
   Dependency Rule violation — the rule constrains the domain from depending on
   infrastructure, not the reverse; infrastructure importing domain is the designed
   direction, the same one `IWorkflowRepository.ts` already uses. With one definition, drift
   is structurally impossible, so the round-3 drift-guard test is deleted rather than kept —
   there is nothing left for it to catch.

## Risks / Trade-offs

- **`reject()` is not implemented in this change** (Decision 4) → `REJECTED` stays a valid
  `status` value at the type level (matches the shipped DB constraint), but no method
  produces or consumes it. Adding `reject()` later is additive, not breaking.
- **`IWorkflowRepository` has no tenant enforcement of its own** (Decision 6) → inherited,
  accepted risk from `ca-workflow-schema` design.md Decision 2, restated here because this
  is the first change to give that port real method signatures. Any future caller that
  invokes this port without having already checked `entityId` against its own tenant scope
  can leak cross-tenant workflow status — the same risk class Phase 0 found in
  `event_causality` (0f) and HE's Geographic-level linking (0d).
- **`save()` has no lost-update protection for concurrent transitions on an existing row**
  (code review finding, Gate 8) → `UNIQUE(entityId, entityType)` only prevents two callers
  from creating the first instance for an entity; it does not stop two callers who each
  `findByEntity` → transition → `save()` on an already-existing row from silently
  overwriting each other (last write wins, no error to either caller). Accepted as a
  Phase 4a/5a adapter concern, not fixed here — this change adds no persistence
  implementation for a lost-update guard (e.g. optimistic locking) to exist in. Flagging
  now so the future Drizzle adapter proposal treats it as a known requirement, not a
  surprise.
- **`IWorkflowRepository.save()`'s return-value contract doesn't say whether the resolved
  instance is the same object passed in or a fresh reconstitution of what was actually
  persisted** (round 3 Gate 10 finding) → matters once a real adapter exists and could
  apply DB-side defaults/triggers, or once the already-flagged lost-update race (above)
  is in play. No adapter exists yet in this change to pin the answer down concretely;
  flagged for the Phase 4a/5a adapter proposal rather than guessed at here.
- **`transition()`'s invalid-`now` check throws `ValidationError`, an operational
  `DomainError`, for what may actually be a programmer error** (round 4 Gate 10 finding,
  independent second-opinion pass) → `now` is a service-supplied clock value, never user
  input (Decision 5) — a caller passing a malformed `now` is a bug in that caller, not an
  anticipated runtime condition a client can act on. `DomainError`'s own doc comment
  (`app/shared/errors/DomainError.ts`, citing ADR-003) draws exactly this line:
  "operational errors" (this class) vs. "programmer errors... unexpected bugs that should
  never be caught by application code" (plain `Error`). Using `ValidationError` here means
  a caller-side clock bug is catchable and gets a 422 instead of surfacing as an uncaught
  bug. Zero impact today (no production caller exists yet), but the choice needs an
  explicit decision before Phase 4a wires a real caller — not silently changed here.
  Related, same root cause: the error message ("now must be a valid Date") names an
  internal method-parameter, not a persisted field like every other `ValidationError` in
  this file — reword only alongside whatever the error-type decision resolves to, not
  independently.

## Migration Plan

None. This change adds two new TypeScript files with no runtime side effects until a
future use case (Phase 4a) and repository adapter (Phase 4a/5a) call them. No DB schema
change, no data migration, no feature flag.

## Open Questions

None remaining for this change. `'validate'`'s use-case mapping is resolved (see Decision
1). `reject()` itself — its trigger conditions and whether it allows resubmission — is a
future change's design question, not this one's; out of scope per the user's direction.
