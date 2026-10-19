# notification-port Specification

## Purpose

Defines the Dependency Inversion boundary between `ProcessWorkflowActionUseCase` and a
future notification-delivery adapter (e.g. the email-based adapter named in the roadmap as
a separate, later intent), keeping this bounded context free of any recipient-resolution
or delivery-channel logic it does not own.

## Requirements

### Requirement: INotificationPort interface compiles as a valid, framework-free TypeScript port

The file `app/domains/validation-workflow/application/ports/INotificationPort.ts` MUST
export an interface named `INotificationPort` with exactly one method, `notify`, and a
`WorkflowActionNotification` payload type. The file MUST NOT import from any Drizzle,
NestJS, or Remix module — only from
`app/domains/validation-workflow/domain/WorkflowInstance.ts` and shared value types.
`yarn tsc` MUST succeed with zero errors referencing this file.

#### Scenario: TypeScript compilation succeeds

- **GIVEN** `INotificationPort.ts` is written with the correct method signature and no
  disallowed imports
- **WHEN** `yarn tsc` is run
- **THEN** it MUST exit with code 0 and zero type errors referencing this file

### Requirement: notify() accepts a self-sufficient event payload, not a pre-resolved recipient

`INotificationPort.notify(notification: WorkflowActionNotification): Promise<void>` MUST
be declared on the interface. `WorkflowActionNotification` is a discriminated union on
`action` (`'submit-validation' | 'validate' | 'publish' | 'return'`), mirroring
`ProcessWorkflowActionCommand`'s own shape — refined to this shape during gate 5's SOLID
review (ISP finding), superseding this requirement's earlier flat-interface-with-optional-fields
framing; see design.md Decision 1's update note. Every branch MUST carry the base fields
`instanceId`, `entityId`, `entityType`, `action`, `fromStatus`, `toStatus`, `actingUserId`,
`occurredAt`, and `submittedByUserId` (`string | null`, always present — sourced from the
saved `WorkflowInstance`'s own `submittedByUserId`, never reloaded from an entity-type-specific
table). The `"submit-validation"` branch MUST additionally carry `validatorUserIds`,
`recordDisplayName`, `recordDate` (all required on that branch). The `"return"` branch MUST
additionally carry `rejectionComments` (required) and MAY carry `assigneeUserIds` (optional).
The `"validate"` and `"publish"` branches carry no additional fields — accessing any of the
five action-specific fields on either of those branches, or `rejectionComments`/`assigneeUserIds`
on `"submit-validation"`, or `validatorUserIds`/`recordDisplayName`/`recordDate` on `"return"`,
MUST be a compile error, not merely an `undefined` runtime value. The type MUST NOT include a
pre-resolved recipient object, name, or email address (e.g. no `recipientEmail`/`notifiedUserName`
field) — resolving a user id to a deliverable email/name stays an adapter's responsibility. An
id list (`validatorUserIds`/`assigneeUserIds`) is not itself a resolved recipient: it is the
same caller-supplied identifier list the legacy services this port replaces receive as request
form data, with no persisted source anywhere in this bounded context.

#### Scenario: TypeScript compilation succeeds

- **GIVEN** `INotificationPort.ts` is written with the widened `WorkflowActionNotification`
  shape and no disallowed imports (no Drizzle, NestJS, or Remix module)
- **WHEN** `yarn tsc` is run
- **THEN** it MUST exit with code 0 and zero type errors referencing this file

#### Scenario: Method signature is pinned via compile-time shape assertions

- **GIVEN** the `INotificationPort` interface and `WorkflowActionNotification` type
- **WHEN** each branch is isolated via `Extract<WorkflowActionNotification, { action: "..." }>`
  and asserted with `AssertEqual<keyof Extract<...>, ...>` against its own exact field list
  (base fields plus only that branch's action-specific fields) — one assertion per branch
  (`"submit-validation"`, `"validate"`, `"publish"`, `"return"`), since `keyof` on a bare union
  only yields the fields common to every member and can't pin a per-branch shape directly —
  and `AssertEqual<Parameters<INotificationPort["notify"]>, [WorkflowActionNotification]>` is
  also declared (same `AssertEqual` tuple-equality pattern as `IWorkflowRepository.test.ts`)
- **THEN** `yarn tsc` MUST succeed only while every branch's field list and the `notify`
  parameter tuple match exactly — dropping, renaming, or adding a field on any one branch
  breaks that branch's own assertion at the type level

#### Scenario: A no-op test double satisfies the interface without resolving any recipient

- **GIVEN** a test double implementing `INotificationPort` whose `notify` method only
  records the calls it received
- **WHEN** it is passed to `ProcessWorkflowActionUseCase` and a successful action is
  executed
- **THEN** the test double SHALL receive one call to `notify` with a complete
  `WorkflowActionNotification` payload, including `submittedByUserId` and whichever
  action-specific optional fields apply
- **AND** the test double SHALL NOT need to resolve any user id to an email address or
  display name to satisfy the interface — that remains an adapter's own responsibility

#### Scenario: submittedByUserId reflects the saved instance, not a reloaded record

- **GIVEN** a `WorkflowInstance` whose `submittedByUserId` is set
- **WHEN** any action is executed successfully and `notify()` is called
- **THEN** the payload's `submittedByUserId` SHALL equal the `IWorkflowRepository.update()`-resolved
  instance's `submittedByUserId`, without `ProcessWorkflowActionUseCase` or any adapter
  querying an HE/DE/DR-specific table to obtain it

#### Scenario: validatorUserIds, recordDisplayName, and recordDate are present only for submit-validation

- **GIVEN** a command with `action: "submit-validation"`, `validatorUserIds: ["u1", "u2"]`,
  `recordDisplayName: "Flood"`, `recordDate: "2026-10-01"`
- **WHEN** `execute(command)` resolves successfully
- **THEN** the `notify()` payload SHALL include `validatorUserIds: ["u1", "u2"]`,
  `recordDisplayName: "Flood"`, and `recordDate: "2026-10-01"`
- **AND** `rejectionComments` and `assigneeUserIds` SHALL be `undefined` on that payload

#### Scenario: rejectionComments and assigneeUserIds are present only for return

- **GIVEN** a command with `action: "return"`, `rejectionComments: "Please fix the date"`,
  `assigneeUserIds: ["u3"]`
- **WHEN** `execute(command)` resolves successfully
- **THEN** the `notify()` payload SHALL include `rejectionComments: "Please fix the date"`
  and `assigneeUserIds: ["u3"]`
- **AND** `validatorUserIds`, `recordDisplayName`, and `recordDate` SHALL be `undefined` on
  that payload

#### Scenario: return without assigneeUserIds carries rejectionComments but no assignee list

- **GIVEN** a command with `action: "return"`, `rejectionComments: "Needs more detail"`, and
  no `assigneeUserIds` field
- **WHEN** `execute(command)` resolves successfully
- **THEN** the `notify()` payload SHALL include `rejectionComments: "Needs more detail"` and
  `assigneeUserIds` SHALL be `undefined`

**Coverage note:** `INotificationPort.test.ts` predates `ProcessWorkflowActionUseCase`
(written before section 5's Green phase) and so exercises the recording double directly,
without a use case to pass it to. The "passed to `ProcessWorkflowActionUseCase`" half of
each scenario above is covered by `ProcessWorkflowAction.test.ts`'s notify-payload
assertions.
