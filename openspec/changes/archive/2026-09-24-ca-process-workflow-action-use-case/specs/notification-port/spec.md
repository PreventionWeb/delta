## Purpose

Defines the Dependency Inversion boundary between `ProcessWorkflowActionUseCase` and a
future notification-delivery adapter (e.g. the email-based adapter named in the roadmap as
a separate, later intent), keeping this bounded context free of any recipient-resolution
or delivery-channel logic it does not own.

## ADDED Requirements

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
be declared on the interface. `WorkflowActionNotification` MUST include `instanceId`,
`entityId`, `entityType`, `action` (`'submit-validation' | 'validate' | 'publish' |
'return'`), `fromStatus`, `toStatus`, `actingUserId`, and `occurredAt`. It MUST NOT
require or assume a resolved recipient (e.g. no `recipientUserId`/`notifiedUserId` field)
— recipient resolution (e.g. "which users are assigned as validators for this entity") is
explicitly a future adapter's responsibility, not this port's.

#### Scenario: Method signature is pinned via compile-time shape assertions

- **GIVEN** the `INotificationPort` interface and `WorkflowActionNotification` type
- **WHEN** `AssertEqual<keyof WorkflowActionNotification, "instanceId" | "entityId" |
  "entityType" | "action" | "fromStatus" | "toStatus" | "actingUserId" | "occurredAt">`
  and `AssertEqual<Parameters<INotificationPort["notify"]>, [WorkflowActionNotification]>`
  are declared (same `AssertEqual` tuple-equality pattern as
  `IWorkflowRepository.test.ts`)
- **THEN** `yarn tsc` MUST succeed only while every field name and the `notify` parameter
  tuple match exactly — dropping, renaming, or adding a field breaks these assertions at
  the type level

**Correction:** an earlier draft of this scenario asserted that a class implementing
`INotificationPort` with `action` omitted from `notify`'s parameter type would fail
`yarn tsc`. Verified false by direct compile check: TypeScript's parameter contravariance
allows a `notify` implementation accepting a narrower parameter type to satisfy the wider
interface signature, so no error is raised. Replaced with the `AssertEqual` compile-time
pin above, which does catch a shape change.

#### Scenario: A no-op test double satisfies the interface without resolving any recipient

- **GIVEN** a test double implementing `INotificationPort` whose `notify` method only
  records the calls it received
- **WHEN** it is passed to `ProcessWorkflowActionUseCase` and a successful action is
  executed
- **THEN** the test double SHALL receive one call to `notify` with a complete
  `WorkflowActionNotification` payload
- **AND** the test double SHALL NOT need to know or compute any recipient identity to
  satisfy the interface

**Coverage note:** `INotificationPort.test.ts` predates `ProcessWorkflowActionUseCase`
(written before section 5's Green phase) and so exercises the recording double directly,
without a use case to pass it to. The "passed to `ProcessWorkflowActionUseCase`" half of
this scenario is covered by `ProcessWorkflowAction.test.ts`'s notify-exactly-once tests,
which assert the recording double receives a complete 8-field payload after a successful
`execute()` call.
