## Why

`validation-workflow`'s `WorkflowInstance` entity (`3a`) and `IWorkflowRepository` port
exist, but nothing calls them yet. Today's live system has this workflow-transition logic
duplicated across two independently-maintained generic services
(`handleApprovalWorkflowService`, `processApprovalStatusActionService` — 0c finding), each
already shared across HE/DE/DR despite looking HE-specific. This change adds the single
use case that replaces both: `ProcessWorkflowActionUseCase`, built once in
`validation-workflow` and consumed by every entity type's own presentation/route layer,
per the roadmap's "built once, generically" directive for Phase 4 Track A.

**Correction to the roadmap's stale intent text (`hazardous-events-refactoring-roadmap.md`
lines ~1192-1221):** the action enum there reads
`'submit-validation'|'validate'|'publish'|'reject'|'return'`. `'reject'` is dropped from
this change's scope. `WorkflowInstance` has no `reject()` method and `REJECTED` is a valid
`Status` enum member that no code path produces or consumes — confirmed unreachable by
reading the entity directly. `3a`'s own design.md (Decision 4, Open Questions) already
flagged this exact gap as a "future change's design question," naming `4a` explicitly. The
user was asked directly today (2026-09-23) and confirmed `reject()` stays out of scope:
there isn't even business agreement on what `REJECTED` represents — `3a`'s design.md
guesses "flagging a draft as a duplicate/miscategorized entry" while the Herbrand behavior
audit models a distinct Data Validator decision parallel to publish/return. Neither theory
is confirmed against live code (zero trace of reject/REJECTED in `app/backend.server`).
This is now tracked as `DEF-022` in `_docs/refactoring-plan/deferred-items-register.md` —
this change does not re-litigate it. **Corrected action set:** `'submit-validation' |
'validate' | 'publish' | 'return'` (four actions).

The roadmap text also compresses `'validate'` into a single call, but `3a`'s design.md
("Resolved with the user," under Decision 1) already specifies a two-call composition:
the `'validate'` action calls `WorkflowInstance.validate()`, then — based on the reviewer's
actual decision — separately calls `approve()`. This proposal's design.md works out the
command shape that carries that sub-decision, since the roadmap's flat `action` enum has
no field for it.

## What Changes

- Add `ProcessWorkflowActionUseCase` in `validation-workflow/application/use-cases/`,
  accepting a `ProcessWorkflowActionCommand` discriminated union keyed by `action`
  (`'submit-validation' | 'validate' | 'publish' | 'return'`). The `'validate'` variant
  carries an additional `alsoApprove: boolean` field, since `validate()` and `approve()`
  are both legal calls from `SUBMITTED` and 3a resolved that a single `'validate'` action
  composes both, conditionally.
- Add `INotificationPort` — a new, framework-free port (no adapter in this change,
  matching `IWorkflowRepository`'s own interface-now/adapter-later split). The use case
  calls it exactly once per successful `execute()` call.
- Add `WorkflowInstanceDto` and a `toWorkflowInstanceDto` mapper, following the
  `NoticeDto`/`toNoticeDto` precedent (Command/Query and DTO naming applied consistently,
  per the roadmap's own stated intent for this phase). **Deviates from the roadmap's
  files-touched list**, which names no DTO — justified the same way `3a`'s intent text
  needed correction: the roadmap's own quality bar ("Command/Query naming... applied
  consistently across every use case in this phase") implies a DTO boundary matching
  Notices, and returning the bare domain entity would break that consistency.
- Add `WorkflowInstanceNotFoundError` (extends shared `NotFoundError`), following the
  `NoticeNotFoundError` precedent, since `IWorkflowRepository.findByEntity` resolves
  `null` rather than throwing and the use case must translate that into a typed error.
- No changes to `WorkflowInstance.ts` or `IWorkflowRepository.ts` — this use case
  consumes both as-is.

## Capabilities

### New Capabilities

- `process-workflow-action`: the `ProcessWorkflowActionUseCase` — command shape, the
  four-action transition mapping, error propagation from the entity/repository, and the
  notify-exactly-once contract.
- `notification-port`: the `INotificationPort` interface shape (event-shaped payload —
  instance/entity identifiers, action, from/to status, acting user, timestamp — with
  recipient resolution explicitly deferred to a future adapter).

### Modified Capabilities

None. `workflow-instance-entity` and `workflow-repository-port` are consumed unchanged.

## Impact

**Files:**

- `app/domains/validation-workflow/application/use-cases/ProcessWorkflowAction.ts` (new)
- `app/domains/validation-workflow/application/use-cases/ProcessWorkflowAction.test.ts` (new)
- `app/domains/validation-workflow/application/ports/INotificationPort.ts` (new)
- `app/domains/validation-workflow/application/ports/INotificationPort.test.ts` (new —
  arity/compile-time conformance checks, matching `IWorkflowRepository.test.ts`'s pattern)
- `app/domains/validation-workflow/application/dto/WorkflowInstanceDto.ts` (new)
- `app/domains/validation-workflow/application/dto/WorkflowInstanceDto.test.ts` (new — the
  mapper has real Date→ISO conversion logic, unlike the trivial error subclass below)
- `app/domains/validation-workflow/application/errors/WorkflowInstanceErrors.ts` (new —
  no dedicated test file, matching `NoticeErrors.ts`'s precedent of a trivial
  constructor-only subclass covered indirectly through the use case's own not-found test)

**DB migration:** None. Zero schema changes — this change is pure application-layer
TypeScript, consuming the already-migrated `workflow_instance` table (`ca-workflow-schema`,
archived) through the already-defined `IWorkflowRepository` port (`3a`, archived).

**Test approach:** Unit tier only (Vitest, zero DB, zero NestJS). A fake in-memory
`IWorkflowRepository` (same pattern as `IWorkflowRepository.test.ts`'s
`FakeWorkflowRepository`) and a spy/no-op `INotificationPort`. No PGlite import anywhere
in this change's test file, verified by the test tier itself and by `yarn tsc`.

**Security / multi-tenancy:** `IWorkflowRepository` carries no `tenantId` parameter by
design (`3a` Decision 6 — `workflow_instance` has no `countryAccountsId`; tenant validation
is the caller's own aggregate repository's job before it ever reaches this port). This use
case inherits that contract unchanged: **it performs zero tenant checks of its own.** Its
precondition is that the caller (e.g. a future HE/DE/DR use case or route handler) has
already verified the acting user's tenant owns `entityId` before invoking
`ProcessWorkflowActionUseCase.execute()`. This is not a new risk introduced here — it is
`3a`'s already-accepted risk, restated because this is the first change to give that port
a real caller. Flagged for the human reviewer, not silently resolved.

**Known, deliberately-not-fixed gap (inherited from `3a`, not introduced here):**
`IWorkflowRepository.save()` has no lost-update protection for two concurrent callers each
transitioning an already-existing row (`3a` design.md Risks). This change's spec states the
resulting behavior explicitly (see `specs/process-workflow-action/spec.md`'s concurrent-
callers scenario) rather than silently ignoring it, but does not fix it — fixing it would
mean changing `IWorkflowRepository.save()`'s contract, which is out of this change's file
list. Tracked as `DEF-024` in `_docs/refactoring-plan/deferred-items-register.md`.
