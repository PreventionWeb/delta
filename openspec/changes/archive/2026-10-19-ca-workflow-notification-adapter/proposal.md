## Why

`validation-workflow`'s `INotificationPort` (`4a`) and `ProcessWorkflowActionUseCase` exist,
but no adapter implements the port — `notify()` calls are inert today. The roadmap's own
`5b` sketch (`_docs/refactoring-plan/hazardous-events-refactoring-roadmap.md` line ~1500)
describes the target adapter from an incomplete reading of legacy behavior (it cites "0c's
audit", but `0c`'s own findings, lines 269-273 of that file, never mention email). Direct
reading of the two live legacy services —
`app/backend.server/services/emailValidationWorkflowService.ts` and its callers,
`app/backend.server/services/approvalWorkflowService.ts`'s `handleApprovalWorkflowService`
and `app/services/approvalStatusWorkflowService.ts`'s `processApprovalStatusActionService`
— shows real behavior the port's current shape cannot carry: a rejection-comments field,
and a genuine split between two different recipient sets for the one CA `"return"` action.
This change builds the adapter against the real behavior and widens the port/command only
as far as that real behavior requires.

## What Changes

- **BREAKING**: `WorkflowActionNotification` (`INotificationPort.ts`) gains
  `submittedByUserId: string | null` (always present, sourced from the saved instance) and
  five action-specific fields: `validatorUserIds`, `recordDisplayName`, `recordDate`
  (required, `"submit-validation"` branch only), and `rejectionComments` (required),
  `assigneeUserIds` (optional) (`"return"` branch only). The type is a discriminated union on
  `action`, not a flat interface with optional fields — refined to this shape during gate 5's
  SOLID review (ISP finding); see design.md Decision 1's update note. This supersedes `4a`
  design.md Decision 12's "no resolved recipient" framing — see design.md Decision 1 for why
  that's still consistent with the port's "self-sufficient event, not a pre-resolved User"
  intent.
- **BREAKING**: `ProcessWorkflowActionCommand`'s `{ action: "return" }` variant gains a
  required `rejectionComments: string` and an optional `assigneeUserIds?: readonly
string[]`. Its `{ action: "submit-validation" }` variant gains a required
  `validatorUserIds: readonly string[]`, `recordDisplayName: string`, and `recordDate:
string` — confirmed by human reviewer, 2026-10-16, see "Decision confirmed" below.
- `ProcessWorkflowActionUseCase.execute()` threads the new command fields and
  `saved.submittedByUserId` into the `WorkflowActionNotification` it builds. No change to
  its transition, persistence, or error-propagation logic.
- **New**: `EmailNotificationAdapter` (`app/domains/validation-workflow/infrastructure/`),
  implementing `INotificationPort`, entity-type-generic for `HE`/`DE`/`DR` (already the
  live, shared shape of the legacy services it replaces — not a scope expansion). Sends:
  - the "assigned validators" email on `"submit-validation"` (replicates
    `emailAssignedValidators`), to every `validatorUserIds` entry;
  - the "validated"/"published" email to the submitter on `"validate"` (only when
    `toStatus === "APPROVED"`) / `"publish"` (replicates
    `emailValidationWorkflowStatusChangeNotificationService`'s matching branches);
  - on `"return"`: to `assigneeUserIds` when present and non-empty (replicates
    `emailAssigneesNotificationService`, legacy's `submit-return`), otherwise to
    `submittedByUserId` (replicates `emailValidationWorkflowStatusChangeNotificationService`'s
    `"needs-revision"` branch, legacy's `submit-reject`) — see design.md Decision 2 for the
    evidence this split is real and live, not invented.
  - sends nothing for `"validate"` with `toStatus === "SUBMITTED"` (alsoApprove: false) —
    no legacy event corresponds to this (design.md Decision 6).
- **Deliberate deviation from legacy**: every interpolated dynamic string (rejection
  comments, names) is HTML-escaped in the email body. Legacy's own
  `emailValidationWorkflowStatusChangeNotificationService` "needs-revision" template
  interpolates `rejectionComments` unescaped via `ctx.t`, which does not escape
  (`app/utils/translator.ts` — plain `String(value)` substitution) — a real HTML-injection
  bug in the code this change replaces. Parity does not require reproducing it (design.md
  Decision 7).
- **Deliberate scope reduction from legacy**: email content is single-locale (English),
  using `configPublicUrl()` directly for links, not translated per-recipient or per-session
  language. Legacy's own emails are rendered in the _acting_ user's session language
  (`ctx.lang`), not the recipient's — already a dubious legacy behavior — and the adapter
  runs as a NestJS-registered singleton with no per-request `BackendContext`. Tracked as a
  new deferred item, not silently dropped (design.md Decision 8).

## Decision confirmed (human reviewer, 2026-10-16): widen `submit-validation`

The roadmap's own `5b` text says the adapter "sends the validator-assignment notification
on submit-validation" — full parity requires `validatorUserIds` plus the event's display
name/date, none of which exist on today's `submit-validation` command variant or anywhere
else `ProcessWorkflowActionUseCase` has access to (confirmed: `IWorkflowRepository` and
`WorkflowInstance` carry no assignment or event-display data; legacy itself gets this list
from caller-supplied form data, not a DB read — `handleSubmitForValidation`,
`approvalWorkflowService.ts` lines 212-230).

**Confirmed: widen `submit-validation`** the same way `return` is widened above — no new
files, only new fields on an existing variant, exactly as this proposal's file list and
specs already assume. The narrow alternative (leave `submit-validation` on today's shape,
`notify()` no-ops for that action, a new deferred item instead) was considered and
rejected: it would reproduce the exact "reduced-fidelity adapter, gap deferred" outcome
already ruled out for `return`, for no different reason, and the roadmap's own text names
this email as a requirement, not an optional extra. No further artifact changes needed —
the delta specs were already written against this (recommended) outcome throughout.

## Capabilities

### New Capabilities

- `email-notification-adapter`: the `EmailNotificationAdapter`'s `INotificationPort`
  implementation — per-action recipient resolution, template selection, per-recipient
  send-and-continue semantics, HTML-escaping.

### Modified Capabilities

- `notification-port`: `WorkflowActionNotification` gains `submittedByUserId` (always,
  every branch) and becomes a discriminated union on `action` carrying five action-specific
  fields across its `"submit-validation"`/`"return"` branches (`validatorUserIds`,
  `recordDisplayName`, `recordDate`, `rejectionComments`, `assigneeUserIds`) — see design.md
  Decision 1's update note; the "no resolved recipient" framing is narrowed to "no resolved
  User/email", not "no recipient-id list at all".
- `process-workflow-action`: `ProcessWorkflowActionCommand`'s `"return"` variant gains
  `rejectionComments` (required) and `assigneeUserIds` (optional); its `"submit-validation"`
  variant gains `validatorUserIds`, `recordDisplayName`, `recordDate` (all required) —
  pending the confirmation above. `execute()` passes `saved.submittedByUserId` and these new
  command fields through to the notification payload unchanged otherwise.

## Impact

**Files touched:**

- `app/domains/validation-workflow/infrastructure/EmailNotificationAdapter.server.ts`
  (new) — the port implementation. `.server.ts` suffix per `.github/copilot-instructions.md`'s
  "Server-only files" convention (it imports `nodemailer`-backed `sendEmail` and
  `UserRepository`, which pulls in Drizzle) — corrected from this proposal's original
  `EmailNotificationAdapter.ts` during implementation; `DrizzleWorkflowRepository.server.ts`
  in this same domain is the existing precedent.
- `app/domains/validation-workflow/infrastructure/EmailNotificationAdapter.test.ts` (new) —
  unit tests; constructor-injected `UserLookup`/`sendEmail`/`configPublicUrl` fakes (gate 5
  SOLID review, DIP finding), not `vi.mock`.
- `app/domains/validation-workflow/infrastructure/EmailNotificationTemplates.ts` (new, not
  in this proposal's original file list — added during implementation per gate 5's SOLID
  review, SRP finding) — pure email subject/text/html builders, `ENTITY_TYPE_INFO`,
  `escapeHtml`, `recordUrl`, extracted out of the adapter so a future i18n change (the
  single-locale deferred item below) touches only this file.
- `app/domains/validation-workflow/application/ports/INotificationPort.ts` — widen
  `WorkflowActionNotification` into a discriminated union on `action` (gate 5 SOLID review,
  ISP finding); update its doc comment (no longer "no adapter in this change").
- `app/domains/validation-workflow/application/ports/INotificationPort.test.ts` — replace
  the single flat `AssertEqual`/`makeNotification()` fixture with per-branch `Extract<...>`
  shape assertions and per-branch notification builders.
- `app/domains/validation-workflow/application/use-cases/ProcessWorkflowAction.ts` — widen
  `ProcessWorkflowActionCommand`'s `"return"` and `"submit-validation"` variants; populate
  the new notification fields in `execute()`.
- `app/domains/validation-workflow/application/use-cases/ProcessWorkflowAction.test.ts` —
  update the 2 existing `"return"` command literals (lines ~431, ~851) and 6
  `"submit-validation"` command literals (lines ~260-801) for the widened shapes; add
  notification-payload assertions for the new fields.
- `openspec/specs/notification-port/spec.md` (via this change's delta) — MODIFIED
  requirement for the widened payload.
- `openspec/specs/process-workflow-action/spec.md` (via this change's delta) — MODIFIED
  requirement for the widened command variants.
- `openspec/changes/ca-workflow-notification-adapter/specs/email-notification-adapter/spec.md`
  (new) — ADDED requirements for the adapter's own behavior.
- `_docs/refactoring-plan/deferred-items-register.md` — add a deferred item for
  single-locale (non-localized) email content (implementer's task, see tasks.md); add the
  no-op deferred item too, only if the narrow alternative above is chosen instead.

**Not touched, confirmed by direct reading:**

- `app/domains/validation-workflow/domain/WorkflowInstance.ts` — no change.
  `requestRevision()` stays a single method, `REVISION_REQUESTED` stays a single status; the
  assignees-vs-submitter split is a notification-recipient concern, not a transition or
  attribution concern (design.md Decision 2).
- `app/domains/validation-workflow/application/ports/IWorkflowRepository.ts` and
  `DrizzleWorkflowRepository.server.ts` — no change; no new persisted field is needed
  (assignee ids are not persisted by this change, matching legacy's `entity_validation_assignment`
  staying outside this bounded context).
- `app/domains/validation-workflow/infrastructure/workflowNotificationTable.ts` — no
  change; this adapter does not write that table (non-goal, see design.md).

**DB migration required:** No.

**Test approach:** Unit tests only (Vitest, no PGlite/real DB) — `EmailNotificationAdapter`
has no persistence of its own; `sendEmail` and `UserRepository.getById` are mocked. Existing
`ProcessWorkflowAction.test.ts` and `INotificationPort.test.ts` remain unit tests, updated
for the widened shapes.

**Security / multi-tenancy implications:**

- No multi-tenancy change — `validation-workflow` already carries no `countryAccountsId`
  (inherited, `3a` Decision 2); this change does not alter that boundary.
- Security-positive: fixes a real HTML-injection bug present in the legacy code this change
  replaces (see "Deliberate deviation from legacy" above) — flagged, not silently carried
  forward.
