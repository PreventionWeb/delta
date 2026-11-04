## ADDED Requirements

### Requirement: ProcessWorkflowActionUseCase supports submit-draft, direct-validate, and direct-publish, mapped onto WorkflowInstance's new direct-transition methods

`ProcessWorkflowActionCommand`'s discriminated union gains three new `action` members:
`'submit-draft'`, `'direct-validate'`, `'direct-publish'`. `submit-draft` carries the base fields
(`entityId`, `entityType`, `actingUserId`) plus `actingUserRole: string | undefined` — the field the
use case's own role-gating check (see "submit-draft requires an edit-capable role" below) reads.
`direct-validate` and `direct-publish` each also carry `actingUserRole: string | undefined` — the
field the use case's own admin-only authorization check (see the Requirement below) reads; no other
additional payload on any of the three.
`applyTransition()`'s switch SHALL call `existing.resetToDraft(transitionParams)` for
`'submit-draft'`, `existing.directValidate(transitionParams)` for `'direct-validate'`, and
`existing.directPublish(transitionParams)` for `'direct-publish'` — each resolved to exactly one
`IWorkflowRepository.update()` call, the same single-commit-boundary shape as every other action.

#### Scenario: submit-draft calls resetToDraft from any status

- **GIVEN** an existing `WorkflowInstance` with `status: "PUBLISHED"`
- **WHEN** `execute({ action: "submit-draft", entityId, entityType, actingUserId, actingUserRole:
  "data-collector" })` is called
- **THEN** `IWorkflowRepository.update` SHALL be called exactly once with an instance whose
  `status` is `"DRAFT"` and every attribution pair is `null`

#### Scenario: direct-validate calls directValidate from DRAFT

- **GIVEN** an existing `WorkflowInstance` with `status: "DRAFT"`
- **WHEN** `execute({ action: "direct-validate", entityId, entityType, actingUserId, actingUserRole:
  "admin" })` is called
- **THEN** the persisted instance's `status` SHALL be `"APPROVED"` and `validatedByUserId` SHALL
  equal `actingUserId`

#### Scenario: direct-publish calls directPublish from REVISION_REQUESTED

- **GIVEN** an existing `WorkflowInstance` with `status: "REVISION_REQUESTED"`
- **WHEN** `execute({ action: "direct-publish", entityId, entityType, actingUserId, actingUserRole:
  "admin" })` is called
- **THEN** the persisted instance's `status` SHALL be `"PUBLISHED"`, `validatedByUserId` and
  `publishedByUserId` SHALL both equal `actingUserId`

#### Scenario: direct-validate from a disallowed status propagates ConflictError, same as every other action

- **GIVEN** an existing `WorkflowInstance` with `status: "SUBMITTED"`
- **WHEN** `execute({ action: "direct-validate", entityId, entityType, actingUserId, actingUserRole:
  "admin" })` is called
- **THEN** the returned promise SHALL reject with an instance of `ConflictError`
- **AND** `IWorkflowRepository.update` SHALL NOT have been called

### Requirement: submit-validation requires a non-empty validator list, enforced authoritatively inside ProcessWorkflowActionUseCase

`execute()` SHALL reject a `submit-validation` command whose `validatorUserIds` is empty with a
`ValidationError` (`"At least one validator must be selected for submit-validation"`), before calling
`IWorkflowRepository.findByEntity`. This is the use case's own authoritative enforcement of the
invariant — revised during implementation (SOLID review, DIP finding: authorization/validation is a
business rule, not a presentation concern, same pattern as the admin-role check below), so every
caller of `execute()` gets the check, not only `hazardous-event-write-route-adapter`'s own route,
which keeps a pre-existing early short-circuit of the same check on its own request path (see that
capability's spec) rather than relying on this check alone.

#### Scenario: submit-validation is rejected when validatorUserIds is empty

- **WHEN** `execute({ action: "submit-validation", entityId, entityType, actingUserId,
  validatorUserIds: [], recordDisplayName, recordDate })` is called
- **THEN** the returned promise SHALL reject with an instance of `ValidationError`
- **AND** `IWorkflowRepository.findByEntity` SHALL NOT have been called
- **AND** `IWorkflowRepository.update` SHALL NOT have been called
- **AND** `INotificationPort.notify` SHALL NOT have been called

#### Scenario: submit-validation proceeds when validatorUserIds is non-empty

- **GIVEN** an existing `WorkflowInstance` with `status: "DRAFT"`
- **WHEN** `execute({ action: "submit-validation", entityId, entityType, actingUserId,
  validatorUserIds: ["validator-1"], recordDisplayName, recordDate })` is called
- **THEN** `IWorkflowRepository.update` SHALL be called exactly once with the persisted instance's
  `status` equal to `"SUBMITTED"`

### Requirement: direct-validate and direct-publish require the admin role, enforced authoritatively inside ProcessWorkflowActionUseCase

`execute()` SHALL reject a `direct-validate`/`direct-publish` command whose `actingUserRole` is not
`"admin"` with an `AuthorizationError` (`"${action} requires the admin role"`), before calling
`IWorkflowRepository.findByEntity`. This is the use case's own authoritative enforcement of the
invariant — revised during implementation (Gate 10 code-review finding, researched against external
Clean Architecture sources: authorization is a business rule, not a presentation concern), so every
caller of `execute()` gets the check, not only `hazardous-event-write-route-adapter`'s own route,
which keeps a pre-existing early short-circuit of the same check on its own request path (see that
capability's spec) rather than relying on this check alone.

#### Scenario: direct-validate is rejected when actingUserRole is not admin

- **WHEN** `execute({ action: "direct-validate", entityId, entityType, actingUserId,
  actingUserRole: "data-collector" })` is called
- **THEN** the returned promise SHALL reject with an instance of `AuthorizationError`
- **AND** `IWorkflowRepository.findByEntity` SHALL NOT have been called

#### Scenario: direct-publish is rejected when actingUserRole is undefined

- **WHEN** `execute({ action: "direct-publish", entityId, entityType, actingUserId,
  actingUserRole: undefined })` is called
- **THEN** the returned promise SHALL reject with an instance of `AuthorizationError`
- **AND** `IWorkflowRepository.findByEntity` SHALL NOT have been called

#### Scenario: direct-validate proceeds when actingUserRole is admin

- **GIVEN** an existing `WorkflowInstance` with `status: "DRAFT"`
- **WHEN** `execute({ action: "direct-validate", entityId, entityType, actingUserId,
  actingUserRole: "admin" })` is called
- **THEN** `IWorkflowRepository.update` SHALL be called exactly once with the persisted instance's
  `status` equal to `"APPROVED"`

### Requirement: submit-draft requires an edit-capable role, enforced authoritatively inside ProcessWorkflowActionUseCase

`execute()` SHALL reject a `submit-draft` command whose `actingUserRole` is `undefined` or
`"data-viewer"` with an `AuthorizationError` (`"submit-draft requires an edit-capable role"`), before
calling `IWorkflowRepository.findByEntity`. This is the use case's own authoritative enforcement of
the invariant (design.md Decision 26) — a minimal, generic backstop closing the gap left by
`resetToDraft()`'s own `allowedFrom` accepting every status (design.md Decision 5/6), which means the
entity provides no authorization-equivalent protection of its own for this action, unlike
`directValidate`/`directPublish`. It is deliberately narrower than HE's own status-aware
edit-permission rule (which also blocks editing by record `workflowStatus`, not just by role) —
that richer rule is HE-specific business policy and stays at the HE route/loader layer (see that
capability's own spec); this use case stays entity-type-agnostic and enforces only the role
dimension. `hazardous-event-write-route-adapter`'s own route keeps a pre-existing early short-circuit
of the same role check on its own request path (see that capability's spec) rather than relying on
this check alone, for consistency with `direct-validate`/`direct-publish`'s own early check —
though, unlike that pair, no role reachable through HE's own routes today is actually rejected by
either check (HE's flat `EditData` permission already excludes `"data-viewer"`/`undefined` before
either check runs); this requirement protects a future caller of `execute()` that does not sit behind
an equivalent gate.

#### Scenario: submit-draft is rejected when actingUserRole is data-viewer

- **WHEN** `execute({ action: "submit-draft", entityId, entityType, actingUserId, actingUserRole:
  "data-viewer" })` is called
- **THEN** the returned promise SHALL reject with an instance of `AuthorizationError`
- **AND** `IWorkflowRepository.findByEntity` SHALL NOT have been called

#### Scenario: submit-draft is rejected when actingUserRole is undefined

- **WHEN** `execute({ action: "submit-draft", entityId, entityType, actingUserId, actingUserRole:
  undefined })` is called
- **THEN** the returned promise SHALL reject with an instance of `AuthorizationError`
- **AND** `IWorkflowRepository.findByEntity` SHALL NOT have been called

#### Scenario: submit-draft proceeds for any edit-capable role

- **GIVEN** an existing `WorkflowInstance` with `status: "PUBLISHED"`
- **WHEN** `execute({ action: "submit-draft", entityId, entityType, actingUserId, actingUserRole })`
  is called with `actingUserRole` equal to `"data-collector"`, `"data-validator"`, or `"admin"`
- **THEN** `IWorkflowRepository.update` SHALL be called exactly once with the persisted instance's
  `status` equal to `"DRAFT"`, for every one of the three roles

### Requirement: submit-draft, direct-validate, and direct-publish never trigger a notification

`buildNotification()` SHALL NOT be reached for `submit-draft`, `direct-validate`, or
`direct-publish` — `execute()` SHALL skip the `notificationPort.notify()` call entirely for these
three actions, after a successful `IWorkflowRepository.update()`, matching legacy's own
`handleSubmitAsDraft`/`handleSubmitAsValidated`/`handleSubmitAsPublished`, none of which call any
email function. This is a deliberate, explicit no-notify branch for each of the three — not an
oversight a future reader should "fix" by wiring up a notification that was never supposed to exist.

#### Scenario: A successful submit-draft does not call notify

- **GIVEN** an existing `WorkflowInstance` with `status: "APPROVED"`
- **WHEN** `execute({ action: "submit-draft", entityId, entityType, actingUserId, actingUserRole:
  "data-collector" })` resolves successfully
- **THEN** `INotificationPort.notify` SHALL NOT have been called

#### Scenario: A successful direct-publish does not call notify

- **GIVEN** an existing `WorkflowInstance` with `status: "DRAFT"`
- **WHEN** `execute({ action: "direct-publish", entityId, entityType, actingUserId, actingUserRole:
  "admin" })` resolves successfully
- **THEN** `INotificationPort.notify` SHALL NOT have been called

#### Scenario: A successful submit-draft/direct-validate/direct-publish still logs one INFO line

- **GIVEN** any of the three new actions resolves successfully
- **WHEN** `execute()` completes
- **THEN** the injected `ILogger.info` SHALL still have been called with
  `msg: "workflow_action.processed"`, reflecting the correct `fromStatus`/`toStatus` — the
  no-notify rule applies only to `INotificationPort.notify`, not to the existing structured-log
  requirement every action already has
