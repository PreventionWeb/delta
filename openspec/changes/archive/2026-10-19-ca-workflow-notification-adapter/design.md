## Context

See proposal.md - Why. This covers only what shapes the adapter / port / command design.

Ground truth for this design (all read in full before writing this document):

- `app/backend.server/services/emailValidationWorkflowService.ts` — three exported
  functions: `emailAssignedValidators` (validators, on submission), `emailAssigneesNotificationService`
  (a distinct assignee list, `submit-return` only), `emailValidationWorkflowStatusChangeNotificationService`
  (submitter, `published`/`needs-revision`/`validated`). All three are entity-type-generic
  (`hazardous_event`/`disaster_event`/`disaster_records`), per-recipient try/catch-continue,
  and depend on `ctx` (`ctx.t`, `ctx.lang`, `ctx.fullUrl`) plus `UserRepository.getById`.
- `app/services/approvalStatusWorkflowService.ts` (`processApprovalStatusActionService`) —
  the live dispatcher: `actionType === "submit-return"` fires only
  `emailAssigneesNotificationService`; every other successful action fires only
  `emailValidationWorkflowStatusChangeNotificationService`. Never both for one call.
- `app/backend.server/services/approvalWorkflowService.ts` — a **second**, separate legacy
  dispatcher (`handleApprovalWorkflowService`, driven by `tempAction`/`tempValidatorUserIds`
  form fields, used by the entity edit-and-save flow). Its own `"submit-return"` branch
  (`handleSubmitAsReturned`) updates status only — **it sends no email**. Only its
  `"submit-validation"` branch (`handleSubmitForValidation`) sends email
  (`emailAssignedValidators`), using a caller-supplied `validatorUserIds: string[]` (no DB
  read — the caller already collected them, e.g. from a form). This confirms: all
  status-change emails this change replicates come from the one dispatcher
  (`processApprovalStatusActionService`); there is no double-fire risk between the two
  dispatchers for the actions this change covers.
- `app/frontend/components/data-collection/View.tsx` — the live UI feeding
  `processApprovalStatusActionService`. Lines 55-67 define **two separate** action labels,
  both "Return record" in English but distinct `action` values: `"submit-reject"` (no
  assignee UI) and `"submit-return"` (assignee-selection UI, `selectedAssigneeIds`,
  required non-empty — line 379). Lines 274-282 and 512-524 render them as two separate,
  user-selectable radio buttons in the same confirmation form, both requiring non-empty
  comment text (line 378-380's disabled condition covers both). This is direct evidence
  both legacy recipient paths are live, real, and mutually exclusive by the user's own
  button choice — not dead code, not two names for one thing.
- `app/utils/translator.ts` (`createTranslator`) — `str.replace(new RegExp(...), String(value))`
  with no escaping. `ctx.t()` does not HTML-escape interpolated values. Confirms the
  "needs-revision" email template's raw `{rejectionComments}` interpolation is a genuine,
  unescaped HTML-injection point in the code this change replaces.
- `app/domains/validation-workflow/application/ports/INotificationPort.ts` and its archived
  design (`2026-09-24-ca-process-workflow-action-use-case/design.md` Decision 12) — today's
  payload has no recipient data at all; Decision 12's own reasoning for that ("this use case
  has no data to compute who the recipient is... the future email-adapter intent's job") is
  the reasoning this change now acts on, not a constraint it violates.
- `app/domains/validation-workflow/application/use-cases/ProcessWorkflowAction.ts` — `saved`
  (the `IWorkflowRepository.update()`-resolved instance) already carries
  `submittedByUserId` for free; nothing elsewhere in the command or repository carries
  validator/assignee lists or event display data.
- `app/domains/validation-workflow/domain/WorkflowInstance.ts` — five transition methods,
  `requestRevision()` among them, taking only `{ userId, now }`. No attribution field exists
  for "assignees" (legacy persists that separately, in `entity_validation_assignment`, a
  table this bounded context does not own).
- `app/utils/email.ts` (`sendEmail`) and `app/utils/config.ts` (`configPublicUrl`) — both
  plain functions, no `ctx` dependency, usable directly from a singleton adapter.
- The roadmap's `5c` entry registers this adapter as a NestJS provider
  (`EmailNotificationAdapter` as the `INotificationPort` provider) — a singleton, not
  request-scoped. No `ctx` (`BackendContext`) is available to it.

## Goals / Non-Goals

**Goals:**

- Replicate the real, confirmed legacy recipient-targeting and template-selection behavior
  for `"submit-validation"` (widening confirmed by the human reviewer, 2026-10-16),
  `"validate"`, `"publish"`, and `"return"`, entity-type-generically for `HE`/`DE`/`DR`.
- Widen `INotificationPort`/`ProcessWorkflowActionCommand` only as far as that real behavior
  requires — no speculative fields.
- Keep `validation-workflow` free of HIP-lookup logic and HE/DE/DR-specific table access
  (Decision 3).

**Non-Goals:**

- No change to `WorkflowInstance.ts`'s transition/status model (Decision 2).
- No change to `IWorkflowRepository.ts` or any schema/migration — assignee/validator ids are
  not persisted by this change (Decision 4).
- No write to `workflowNotificationTable` — unconstrained and unused by this change, exactly
  as `4a`'s Decision 12 left it; a future intent may choose to write it, this one doesn't
  need to.
- No per-recipient localization or per-session language rendering (Decision 8) — single
  locale, English, tracked as a new deferred item rather than attempted and done partially.
- No retry/outbox mechanism for failed sends — `DEF-023` already settles this at the
  use-case tier; the adapter adds no retry logic of its own (Decision 5 bounds this to
  continue-on-error across recipients, not retry).

## Decisions

### 1. Widen `WorkflowActionNotification` with recipient-_id lists_ and pre-resolved display strings — not a pre-resolved recipient

`4a`'s Decision 12 said the payload must not assume "a resolved recipient (e.g. no
`recipientUserId`/`notifiedUserId` field)". This change adds `validatorUserIds?`,
`assigneeUserIds?` (both `readonly string[]`) and `submittedByUserId: string | null`. These
are not resolved recipients — they're the same caller-supplied _identifiers_ legacy itself
receives from form data (confirmed: `handleSubmitForValidation`'s `validatorUserIds`,
`processApprovalStatusActionService`'s `assignedToUserIds`, both read from request form
fields, never from a DB query the port could instead perform). No persisted source for
either list exists anywhere in `validation-workflow` (`IWorkflowRepository` doesn't carry
them; `entity_validation_assignment` belongs to a different bounded context) or ever will
without a much larger change. The port still carries zero resolved `User`
objects/emails/names — the adapter still does that resolution itself via
`UserRepository.getById`, exactly as legacy does. This is a widening of what counts as
"self-sufficient", justified by this specific, confirmed absence of any alternative source —
not a general retreat from Decision 12's principle.

**Alternative considered:** keep the port untouched and have a wrapping use case (outside
`validation-workflow`) resolve recipients and call a _different_, adapter-specific method.
Rejected — `ProcessWorkflowActionUseCase.execute()` is the only call site that already knows
`command`, `saved`, and the single `notify()` call; inventing a second call path
duplicates the "notify exactly once per execute()" guarantee (`4a` Decision 7) for no
benefit.

**Update, 2026-10-16 (gate 5 SOLID review, ISP finding):** `WorkflowActionNotification` is a
discriminated union on `action`, mirroring `ProcessWorkflowActionCommand`'s own shape, rather
than the flat interface with five comment-annotated "meaningful only when..." optional fields
originally described above. This is a shape refinement, not a reopening of this decision's
substance — which fields exist and when they're meaningful is unchanged; only how that's
expressed changed, from a comment-enforced convention to a compile-time-enforced one (a field
belonging to a different action is now a type error, not an `undefined` at runtime). See
`specs/notification-port/spec.md`'s updated "Method signature is pinned via compile-time shape
assertions" scenario for the per-branch `AssertEqual` mechanism this requires.

### 2. `"return"`'s assignees-vs-submitter split is real and resolved via an optional field, not a new action

**Confirmed by human reviewer, 2026-10-16** (tasks.md Task 0.2), on the `View.tsx` evidence below.

**Evidence** (Context, above): both `"submit-reject"` (notify submitter) and
`"submit-return"` (notify a caller-chosen assignee list) are live, user-selectable actions
in `View.tsx`, dispatched by the same live function
(`processApprovalStatusActionService`), mutually exclusive by the operator's own button
choice. Both already map to the identical CA `"return"`/`requestRevision()`/
`REVISION_REQUESTED` transition (`4a` Decision 1 — there is no CA equivalent of a separate
"reject" action; `DEF-022` already ruled that out at the status-model level). The real
distinction lives entirely in _who gets notified_, never in the transition itself.

**Resolution:** `{ action: "return" }` gains `rejectionComments: string` (required — both
legacy UI paths require non-empty comment text, `View.tsx` line 378-380) and
`assigneeUserIds?: readonly string[]` (optional). The adapter's dispatch rule: non-empty
`assigneeUserIds` → notify those assignees (legacy `submit-return`); absent/empty →
notify `submittedByUserId` (legacy `submit-reject`). This mirrors legacy's own
discriminating signal (presence of `assignedToUserIds` form data) instead of inventing a
`"reject"` action name, consistent with `DEF-022`'s caution against implying a decided
reject/decline vocabulary.

**Alternative considered:** add a second action, e.g. `"reject"`, alongside `"return"`.
Rejected — it reopens `DEF-022`'s closed question (a `"reject"` action name implies
`REJECTED`-status vocabulary that was deliberately ruled out) and both legacy actions
already collapse to the exact same transition; only the recipient differs, which an optional
field expresses without touching the action vocabulary.

**Alternative considered:** a `recipientKind: "submitter" | "assignees"` discriminator field
instead of inferring from `assigneeUserIds`'s presence. Rejected for being a second
redundant signal — leaving `assigneeUserIds` empty/absent for the submitter case and
non-empty for the assignees case is the one signal, matches legacy's own code structure
(`actionType === "submit-return"` gates on data presence, not a separate flag), and removes
a representable-but-nonsensical state (`recipientKind: "assignees"` with an empty array).

### 3. `submit-validation`'s event-display data is pre-resolved by the caller, not looked up by the adapter

Legacy's `emailAssignedValidators` derives an event name via a HIP hazard→cluster→type
fallback chain and reads `eventFields.startDate`/`endDate` directly off the HE/DE/DR record.
Reproducing that chain inside `EmailNotificationAdapter` would require
`validation-workflow` to depend on `app/backend.server/models/hip` and HE/DE/DR-specific
field shapes — a bounded-context violation this domain has avoided everywhere else
(`4a` Decision 12's own reasoning). **Decision:** the command carries pre-resolved
`recordDisplayName: string` and `recordDate: string` — the caller (the future HE/DE/DR
submission route/use-case, not yet built) does the HIP/date resolution it already has
direct access to, and hands the adapter two display strings. Same pattern as `eventFields`
being caller-supplied in legacy today, just narrowed to the two fields the email body
actually uses instead of passing the whole `eventFields: any` blob through.

### 4. No schema change; assignee/validator ids are not persisted by this change

`workflowInstanceTable` gains no column. `entity_validation_assignment` (where legacy
persists validator/assignee relationships) is untouched and unread by this change — the
notification payload's id lists are transient, passed straight from command to adapter to
`sendEmail` calls, never written anywhere. This matches today's actual legacy flow order
too: `handleSubmitForValidation` sends the email _and separately_ calls
`entityValidationAssignmentCreate` — the email was never reading that table back.

### 5. Per-recipient send is continue-on-error, matching legacy; one aggregated failure still reaches the use case's existing swallow-and-log

Legacy's `emailAssignedValidators` and `emailAssigneesNotificationService` both wrap each
recipient's `sendEmail` call in its own try/catch that logs and continues — one recipient's
failure never skips the rest. `EmailNotificationAdapter.notify()` replicates this: for a
multi-recipient action (`"submit-validation"`, or `"return"` with `assigneeUserIds`), it
attempts every recipient regardless of earlier failures, collects any errors, and — only
after every recipient has been attempted — rejects with one aggregated error if at least
one send failed. This still reaches `ProcessWorkflowActionUseCase`'s existing
try/catch-and-`ILogger.warn` (`4a` Decision 8, `DEF-023`) exactly once per `execute()` call,
unchanged. This is continue-on-error, not retry — it does not reopen `DEF-023` (no send is
attempted twice).

**Alternative considered:** let the first recipient's thrown error propagate immediately.
Rejected — remaining recipients would silently never be attempted, which is a real parity
regression from legacy's own continue-on-error loops, not a neutral simplification.

### 6. Template/recipient dispatch table, keyed on `action` and `toStatus`

| `action`              | `toStatus`                                      | Recipient(s)                                             | Template (legacy source)                                                 |
| --------------------- | ----------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------ |
| `"submit-validation"` | `"SUBMITTED"`                                   | every `validatorUserIds` entry                           | `emailAssignedValidators`                                                |
| `"validate"`          | `"SUBMITTED"` (unchanged, `alsoApprove: false`) | none — no email sent                                     | no legacy equivalent event                                               |
| `"validate"`          | `"APPROVED"` (`alsoApprove: true`)              | `submittedByUserId`                                      | `emailValidationWorkflowStatusChangeNotificationService` — `"validated"` |
| `"publish"`           | `"PUBLISHED"`                                   | `submittedByUserId`                                      | `emailValidationWorkflowStatusChangeNotificationService` — `"published"` |
| `"return"`            | `"REVISION_REQUESTED"`                          | `assigneeUserIds` if non-empty, else `submittedByUserId` | `emailAssigneesNotificationService` / `..."needs-revision"` branch       |

Dispatch is keyed on `toStatus`, not only `action`, because `"validate"` is the one action
whose legacy-equivalent outcome depends on whether `alsoApprove` fired — the notification
payload doesn't carry `alsoApprove` directly, but `toStatus` already encodes its effect
(`4a` Decision 7), so re-deriving it from `toStatus` avoids adding a redundant field.

### 7. HTML-escape every interpolated value — a deliberate, documented deviation from legacy

Legacy's `emailAssigneesNotificationService` escapes `rejectionMessage` in its HTML body
(`escapeHtml(rejectionMessage)`) but its sibling
`emailValidationWorkflowStatusChangeNotificationService`'s "needs-revision" template does
not — confirmed via direct reading of both, and confirmed separately that `ctx.t()` itself
never escapes (`app/utils/translator.ts`). That inconsistency is a live HTML-injection bug:
a submitter-supplied... no, a validator/publisher-supplied rejection comment reaches another
user's inbox unescaped. **Decision:** `EmailNotificationAdapter` escapes every interpolated
string (comments, names) in every HTML body, unconditionally. This is a security
improvement over legacy, not a parity break — "match legacy behavior" does not extend to
reproducing a known-bad escaping gap once it's been found by direct reading.

### 8. Email content is single-locale (English); no `ctx`, no per-recipient localization

The adapter is registered as a NestJS singleton provider (roadmap `5c`), with no
`BackendContext` available — no `ctx.t`, `ctx.lang`, or `ctx.fullUrl`. Even if a locale
source existed, legacy itself renders every email in the _acting_ user's current session
language, not the recipient's — not a behavior obviously worth reproducing, and one that
would require threading a locale value through the command for every action. **Decision:**
hardcode English strings for subjects/bodies (matching the literal fallback `msg` text
already present in legacy's own `ctx.t()` calls) and build links via `configPublicUrl()`
directly, with no language path segment. Record a new deferred item
("`EmailNotificationAdapter` sends single-locale English email regardless of recipient or
actor language — no i18n for server-sent notifications exists yet") rather than silently
narrowing scope — implementer's task, see tasks.md.

### 9. Entity type → URL segment / display label mapping

| `EntityType` | URL segment       | Display label       |
| ------------ | ----------------- | ------------------- |
| `"HE"`       | `hazardous-event` | `"hazardous event"` |
| `"DE"`       | `disaster-event`  | `"disaster event"`  |
| `"DR"`       | `disaster-record` | `"disaster record"` |

Record URL: `` `${configPublicUrl()}/${urlSegment}/${entityId}` `` — no language path
segment (Decision 8). This is a 1:1 carry-over of legacy's three `entityType` branches
(`hazardous_event`/`disaster_event`/`disaster_records`), re-keyed onto the CA `EntityType`
enum (`"HE"|"DE"|"DR"`) that already replaced the legacy string union elsewhere in this
domain.

### 10. Concurrent-callers scenario: does not apply, stated explicitly

`EmailNotificationAdapter` holds no shared mutable state — no cache, counter, or in-memory
store. Each `notify()` call is independent: it reads nothing from and writes nothing to
adapter-local state, only calls `UserRepository.getById` (already-existing, unrelated
contention surface) and `sendEmail` per recipient. The "two concurrent callers" class of bug
this project's spec standard calls out does not apply here, and the capability's spec says
so explicitly rather than omitting the concern.

## Risks / Trade-offs

- **Reduced-fidelity, deliberately: no localization** (Decision 8) — English-only emails
  regardless of recipient/actor language. Tracked as a new deferred item, not silently
  dropped.
- **Widened port payload is not backward compatible** — any other future `INotificationPort`
  consumer (none exists today — `EmailNotificationAdapter` is the first and only adapter)
  would need to know about the new optional fields. No current code is affected beyond what
  this change itself updates.
- **No persisted audit trail of what was sent** — `workflowNotificationTable` stays unwritten
  (Non-Goal). If a future requirement needs a sent-notification history, that's a separate,
  larger change (write path + read path), not assumed here.

## Migration Plan

None. Pure application/infrastructure-layer TypeScript addition and port/command widening;
no schema change, no data migration, no feature flag. Inert until the roadmap's `5c`
(`ValidationWorkflowModule`) wires `EmailNotificationAdapter` as the `INotificationPort`
provider and a real HE/DE/DR route starts calling `ProcessWorkflowActionUseCase`.
