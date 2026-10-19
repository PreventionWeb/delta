## MODIFIED Requirements

### Requirement: ProcessWorkflowActionUseCase maps the four-action command onto WorkflowInstance's real transition methods

`ProcessWorkflowActionUseCase.execute(command)` SHALL accept a
`ProcessWorkflowActionCommand` discriminated union on `action` (`'submit-validation' |
'validate' | 'publish' | 'return'`). It MUST load the `WorkflowInstance` via
`IWorkflowRepository.findByEntity(command.entityId, command.entityType)`, call the
corresponding entity transition method(s) with a single internally-computed `now = new
Date()` and `userId: command.actingUserId`, persist the result via
`IWorkflowRepository.update(transitioned, existing.updatedAt)` — passing the `updatedAt`
of the instance it loaded via `findByEntity`, before any transition was applied — and
return a `WorkflowInstanceDto` derived from `update()`'s resolved value. `action:
'reject'` and any transition producing or consuming the `REJECTED` status MUST NOT be
supported by this use case (DEF-022). The `{ action: "submit-validation" }` variant MUST
additionally carry `validatorUserIds: readonly string[]`, `recordDisplayName: string`, and
`recordDate: string`. The `{ action: "return" }` variant MUST additionally carry
`rejectionComments: string` (required, non-empty) and MAY carry `assigneeUserIds?: readonly
string[]`. None of these additional fields affect which transition method is called or
which status values are involved — they affect only the notification payload `execute()`
builds (see "execute() passes return/submit-validation command fields and the saved
instance's submittedByUserId through to the notification payload" below).

#### Scenario: submit-validation calls submit() from DRAFT

- **GIVEN** an existing `WorkflowInstance` with `status: "DRAFT"`
- **WHEN** `execute({ action: "submit-validation", entityId, entityType, actingUserId,
validatorUserIds: ["validator-1"], recordDisplayName: "Flood", recordDate: "2026-10-01" })`
  is called
- **THEN** `IWorkflowRepository.update` SHALL be called exactly once with an instance whose
  `status` is `"SUBMITTED"` and `submittedByUserId` equals `actingUserId`, and
  `expectedUpdatedAt` equal to the `updatedAt` of the instance `findByEntity` resolved
- **AND** the returned `WorkflowInstanceDto.status` SHALL be `"SUBMITTED"`

#### Scenario: submit-validation calls submit() from REVISION_REQUESTED

- **GIVEN** an existing `WorkflowInstance` with `status: "REVISION_REQUESTED"`
- **WHEN** `execute({ action: "submit-validation", entityId, entityType, actingUserId,
validatorUserIds: ["validator-1"], recordDisplayName: "Flood", recordDate: "2026-10-01" })`
  is called
- **THEN** the persisted instance's `status` SHALL be `"SUBMITTED"`

#### Scenario: validate with alsoApprove false validates only, status unchanged

- **GIVEN** an existing `WorkflowInstance` with `status: "SUBMITTED"`
- **WHEN** `execute({ action: "validate", alsoApprove: false, entityId, entityType,
actingUserId })` is called
- **THEN** `IWorkflowRepository.update` SHALL be called exactly once with an instance whose
  `status` is still `"SUBMITTED"` and `validatedByUserId` equals `actingUserId`
- **AND** `approvedByUserId` on the persisted instance SHALL remain `null`

#### Scenario: validate with alsoApprove true composes validate() then approve()

- **GIVEN** an existing `WorkflowInstance` with `status: "SUBMITTED"`
- **WHEN** `execute({ action: "validate", alsoApprove: true, entityId, entityType,
actingUserId })` is called
- **THEN** `IWorkflowRepository.update` SHALL be called exactly once (not twice — the
  composition happens in memory before the single `update` call) with an instance whose
  `status` is `"APPROVED"`, `validatedByUserId` equals `actingUserId`, and
  `approvedByUserId` equals `actingUserId`
- **AND** `validatedAt` and `approvedAt` on the persisted instance SHALL be equal (both stamped
  from the same internally-computed `now`)

#### Scenario: publish calls publish() from APPROVED

- **GIVEN** an existing `WorkflowInstance` with `status: "APPROVED"`
- **WHEN** `execute({ action: "publish", entityId, entityType, actingUserId })` is called
- **THEN** the persisted instance's `status` SHALL be `"PUBLISHED"` and `publishedByUserId`
  SHALL equal `actingUserId`

#### Scenario: return calls requestRevision() from SUBMITTED

- **GIVEN** an existing `WorkflowInstance` with `status: "SUBMITTED"`
- **WHEN** `execute({ action: "return", entityId, entityType, actingUserId,
rejectionComments: "Please revise the start date" })` is called
- **THEN** the persisted instance's `status` SHALL be `"REVISION_REQUESTED"`

#### Scenario: return with assigneeUserIds still calls requestRevision() from SUBMITTED

- **GIVEN** an existing `WorkflowInstance` with `status: "SUBMITTED"`
- **WHEN** `execute({ action: "return", entityId, entityType, actingUserId,
rejectionComments: "Please revise the start date", assigneeUserIds: ["assignee-1"] })` is
  called
- **THEN** the persisted instance's `status` SHALL be `"REVISION_REQUESTED"` — identical to
  the scenario without `assigneeUserIds`, confirming the field affects only the notification
  payload, never the transition

## ADDED Requirements

### Requirement: execute() passes return/submit-validation command fields and the saved instance's submittedByUserId through to the notification payload

After a successful `IWorkflowRepository.update()`, the `WorkflowActionNotification` built
by `execute()` MUST include `submittedByUserId` equal to the `update()`-resolved instance's
own `submittedByUserId` (never reloaded from an entity-type-specific table). When
`command.action === "submit-validation"`, the payload MUST include `validatorUserIds`,
`recordDisplayName`, and `recordDate` copied unmodified from the command. When
`command.action === "return"`, the payload MUST include `rejectionComments` copied
unmodified from the command, and `assigneeUserIds` copied unmodified from the command when
present (omitted from the payload when the command omits it). For `"validate"` and
`"publish"` commands, none of these five action-specific fields SHALL be present on the
payload.

#### Scenario: submit-validation's command fields reach the notification payload unmodified

- **GIVEN** an existing `WorkflowInstance` with `status: "DRAFT"`
- **WHEN** `execute({ action: "submit-validation", entityId, entityType, actingUserId,
validatorUserIds: ["v1", "v2"], recordDisplayName: "Flood", recordDate: "2026-10-01" })`
  resolves successfully
- **THEN** `INotificationPort.notify` SHALL have been called with a payload whose
  `validatorUserIds` is `["v1", "v2"]`, `recordDisplayName` is `"Flood"`, and `recordDate`
  is `"2026-10-01"`

#### Scenario: return's rejectionComments and assigneeUserIds reach the notification payload unmodified

- **GIVEN** an existing `WorkflowInstance` with `status: "SUBMITTED"` and
  `submittedByUserId: "submitter-1"`
- **WHEN** `execute({ action: "return", entityId, entityType, actingUserId,
rejectionComments: "Fix the location", assigneeUserIds: ["assignee-1", "assignee-2"] })`
  resolves successfully
- **THEN** `INotificationPort.notify` SHALL have been called with a payload whose
  `rejectionComments` is `"Fix the location"`, `assigneeUserIds` is `["assignee-1",
"assignee-2"]`, and `submittedByUserId` is `"submitter-1"`

#### Scenario: return without assigneeUserIds omits the field from the notification payload

- **GIVEN** an existing `WorkflowInstance` with `status: "SUBMITTED"` and
  `submittedByUserId: "submitter-1"`
- **WHEN** `execute({ action: "return", entityId, entityType, actingUserId,
rejectionComments: "Fix the location" })` resolves successfully (no `assigneeUserIds`
  supplied)
- **THEN** `INotificationPort.notify` SHALL have been called with a payload whose
  `rejectionComments` is `"Fix the location"`, `assigneeUserIds` is `undefined`, and
  `submittedByUserId` is `"submitter-1"`

#### Scenario: validate and publish notification payloads never carry the five action-specific fields

- **GIVEN** an existing `WorkflowInstance` with `status: "APPROVED"` and
  `submittedByUserId: "submitter-2"`
- **WHEN** `execute({ action: "publish", entityId, entityType, actingUserId })` resolves
  successfully
- **THEN** `INotificationPort.notify` SHALL have been called with a payload whose
  `validatorUserIds`, `recordDisplayName`, `recordDate`, `rejectionComments`, and
  `assigneeUserIds` are all `undefined`
- **AND** `submittedByUserId` on that payload SHALL be `"submitter-2"`
