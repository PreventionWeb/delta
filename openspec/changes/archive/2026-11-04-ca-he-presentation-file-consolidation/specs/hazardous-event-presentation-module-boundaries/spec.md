## Purpose

Defines the module-boundary guarantees that hold across the hazardous-event
presentation-layer file consolidation, and specifies the previously-unspecified
behavior of the workflow-action composition pair now that it has real test
coverage for the first time.

## ADDED Requirements

### Requirement: Consolidated guard, extractor, and mapper modules preserve every exported symbol

`requestAuthorizationGuards.server.ts`, `extractFormFieldErrors.ts`, and
`formDataMappers.ts` MUST each export, under the identical exported name, every
function that its predecessor file(s) exported before consolidation. No
caller-visible behavior of `requireEditDataPermission`,
`requireStatusAwareEditPermission`, `requireWorkflowActionAuthorized`,
`requireValidValidatorIds`, `extractFieldError`, `extractCauseConflictError`,
`mapTempActionToWorkflowAction`, or `deriveRecordDate` MUST change as a result
of the file move.

#### Scenario: every pre-merge exported symbol is importable from its new file

- **WHEN** `app/domains/hazardous-events/presentation/web/requestAuthorizationGuards.server.ts`,
  `extractFormFieldErrors.ts`, and `formDataMappers.ts` are inspected after
  the merge
- **THEN** each of `requireEditDataPermission`, `requireStatusAwareEditPermission`,
  `requireWorkflowActionAuthorized`, `requireValidValidatorIds`,
  `extractFieldError`, `extractCauseConflictError`,
  `mapTempActionToWorkflowAction`, and `deriveRecordDate` MUST be exported
  under that exact name from its new file

#### Scenario: no caller requires a code change beyond its import path

- **GIVEN** a route module that called one of the 8 functions above before
  the merge
- **WHEN** the merge lands and the route module's `import` statement is
  updated to the new file path
- **THEN** the call expression itself (function name, argument shape, return
  value handling) MUST require no further change

#### Scenario: consolidated test files cover every pre-merge test case

- **GIVEN** the pre-merge test files for a consolidated module (e.g. the 3
  existing test files merging into `requestAuthorizationGuards.server.test.ts`)
- **WHEN** their test cases are moved into the one consolidated test file
- **THEN** the consolidated file's total test count MUST be greater than or
  equal to the sum of the pre-merge files' test counts (greater than, for
  `requireValidValidatorIds`, which had no prior test)

### Requirement: `requireValidValidatorIds` membership-checks `submit-validation`'s validator ids against the real candidate list before the primary write runs

`requireValidValidatorIds` MUST be a no-op (return `[]`, without calling
`getValidCandidateIds`) for any `mappedAction` other than
`"submit-validation"`. For `"submit-validation"`, it MUST filter
`parsed.validatorUserIds` down to only the ids present in
`getValidCandidateIds()`'s resolved result, and MUST throw a `422` `Response`
(via `throwHazardousEventLoaderError`, given a `ValidationError` with message
"At least one validator must be selected for submit-validation") if the
filtered list is empty -- whether because every submitted id was stale/not a
valid candidate, or because the submitted list was already empty. This closes
the write-before-reject gap a non-empty but entirely stale/tampered list
previously hit inside `composeWorkflowAction.server.ts`, after the write (see
design.md Decision 25 in the referencing `ca-he-route-adapter-write` change).

#### Scenario: no-op, no candidate-list call, for any non-submit-validation action

- **WHEN** `requireValidValidatorIds` is called with `mappedAction` set to
  `"submit-draft"`, `"direct-validate"`, `"direct-publish"`, or `null`
- **THEN** it MUST return `[]`
- **AND** it MUST NOT call `getValidCandidateIds`

#### Scenario: stale/tampered ids are filtered out of submit-validation's list

- **GIVEN** `mappedAction: "submit-validation"` and
  `parsed.validatorUserIds` containing both ids present in
  `getValidCandidateIds()`'s result and ids absent from it
- **WHEN** `requireValidValidatorIds` is called
- **THEN** it MUST return only the submitted ids that are present in
  `getValidCandidateIds()`'s resolved result, in their original order

#### Scenario: every submitted id is returned when all are valid candidates

- **GIVEN** `mappedAction: "submit-validation"` and every id in
  `parsed.validatorUserIds` present in `getValidCandidateIds()`'s result
- **WHEN** `requireValidValidatorIds` is called
- **THEN** it MUST return the full submitted list unchanged

#### Scenario: an empty filtered result throws a 422, whether from staleness or an already-empty submission

- **GIVEN** `mappedAction: "submit-validation"`
- **WHEN** `requireValidValidatorIds` is called with either a
  `parsed.validatorUserIds` that is already empty, or one whose every id is
  absent from `getValidCandidateIds()`'s result
- **THEN** it MUST throw a `Response` with `status: 422` whose JSON body's
  `error.message` is "At least one validator must be selected for
  submit-validation"

### Requirement: `isStatusAwareEditBlocked` remains isomorphically importable

`isStatusAwareEditBlocked.ts` MUST NOT be merged into any `.server.ts`-suffixed
file or otherwise lose its non-`.server`-suffixed status, because
`HazardousEventDetailPage.tsx` and `HazardousEventListPage.tsx` import it
directly for use during both server-side rendering and client hydration.

#### Scenario: the predicate stays reachable from client-rendered components

- **GIVEN** `HazardousEventDetailPage.tsx`'s Edit-link visibility gate and
  `HazardousEventListPage.tsx`'s status-aware Edit-link gate, both of which
  import `isStatusAwareEditBlocked` directly
- **WHEN** the presentation-layer file consolidation in this change is
  complete
- **THEN** `isStatusAwareEditBlocked` MUST still be defined in a file without
  a `.server.ts` suffix, at an unchanged import path from both components

#### Scenario: `requireStatusAwareEditPermission` still wraps the same predicate

- **GIVEN** `requireStatusAwareEditPermission`, now defined inside
  `requestAuthorizationGuards.server.ts`
- **WHEN** it is called with a `role` and `workflowStatus`
- **THEN** it MUST delegate to the same `isStatusAwareEditBlocked` predicate
  it delegated to before the merge, with identical pass/throw behavior for
  every `(role, workflowStatus)` combination

### Requirement: `composeWorkflowAction` resolves the display name only for `submit-validation`

`composeWorkflowAction` MUST call its `getRecordDisplayName` callback if and
only if the resolved `mappedAction` is `"submit-validation"`, and MUST NOT
call it for `"direct-validate"`, `"direct-publish"`, `"submit-draft"`, or a
`null` mapped action.

#### Scenario: display name is resolved for submit-validation

- **WHEN** `composeWorkflowAction` is called with `mappedAction:
  "submit-validation"`
- **THEN** it MUST call `args.getRecordDisplayName()` exactly once before
  invoking `processWorkflowActionUseCase.execute`

#### Scenario: display name is not resolved for other actions

- **WHEN** `composeWorkflowAction` is called with `mappedAction` set to
  `"direct-validate"`, `"direct-publish"`, or `"submit-draft"`
- **THEN** it MUST NOT call `args.getRecordDisplayName()`

#### Scenario: a null mapped action is a no-op

- **WHEN** `composeWorkflowAction` is called with `mappedAction: null`
- **THEN** it MUST return `{ attempted: false }` without calling
  `processWorkflowActionUseCase.execute` or `args.getRecordDisplayName()`

#### Scenario: a `getRecordDisplayName` rejection propagates, uncaught

- **GIVEN** `mappedAction: "submit-validation"` and `args.getRecordDisplayName()`
  rejects
- **WHEN** `composeWorkflowAction` is called
- **THEN** the rejection MUST propagate to `composeWorkflowAction`'s own
  caller (it is awaited outside the `try` block that catches
  `processWorkflowActionUseCase.execute()` failures, by design -- a
  display-name lookup failure is a bug in the caller's own lookup, not a
  workflow-transition write failure, and MUST NOT be reported as
  `{ attempted: true, outcome: "failed" }`)
- **AND** `processWorkflowActionUseCase.execute` MUST NOT be called
- **AND** nothing MUST be logged via `getPinoLogger().warn`

### Requirement: `composeWorkflowAction` passes the command shape documented for each mapped action

`composeWorkflowAction` MUST call `processWorkflowActionUseCase.execute` with
`entityType: "HE"` and the caller's `entityId`/`actingUserId` for every
mapped action. For `"submit-validation"`, it MUST additionally pass
`validatorUserIds` (the caller-filtered list, used as-is, not re-validated)
and `recordDisplayName`, and MUST NOT pass `actingUserRole`. For
`"direct-validate"`, `"direct-publish"`, `"submit-draft"`, and any other
non-null mapped action, it MUST pass `actingUserRole` and MUST NOT pass
`validatorUserIds`/`recordDisplayName`.

#### Scenario: submit-validation's command carries validator ids and display name, not a role

- **WHEN** `composeWorkflowAction` is called with `mappedAction:
  "submit-validation"`
- **THEN** `processWorkflowActionUseCase.execute` MUST be called with
  `action: "submit-validation"`, `validatorUserIds: args.validatorUserIds`,
  and `recordDisplayName` equal to the resolved display name
- **AND** the call MUST NOT include an `actingUserRole` property

#### Scenario: direct-validate/direct-publish/submit-draft's command carries the acting role, not validator ids

- **WHEN** `composeWorkflowAction` is called with `mappedAction` set to
  `"direct-validate"`, `"direct-publish"`, or `"submit-draft"`
- **THEN** `processWorkflowActionUseCase.execute` MUST be called with
  `actingUserRole: args.actingUserRole`
- **AND** the call MUST NOT include `validatorUserIds` or `recordDisplayName`

### Requirement: `composeWorkflowAction` reports a post-commit workflow-transition failure as a partial success, not a thrown error

A failure inside `processWorkflowActionUseCase.execute()` MUST be caught, MUST
be logged at `warn` level with `msg: "hazardous_event.workflow_action_failed"`
and the failing `entityId`/`action`, and MUST surface to the caller as
`{ attempted: true, outcome: "failed" }` rather than a thrown error.

#### Scenario: a workflow-transition write failure is caught and reported, not thrown

- **GIVEN** `processWorkflowActionUseCase.execute()` rejects
- **WHEN** `composeWorkflowAction` is called with any non-null `mappedAction`
- **THEN** it MUST return `{ attempted: true, outcome: "failed" }`
- **AND** it MUST NOT throw or let the rejection propagate to its caller
- **AND** it MUST log a `warn`-level entry with
  `msg: "hazardous_event.workflow_action_failed"`, the `entityId`, and the
  `mappedAction` as `action`

#### Scenario: a successful transition reports success

- **GIVEN** `processWorkflowActionUseCase.execute()` resolves
- **WHEN** `composeWorkflowAction` is called with any non-null `mappedAction`
- **THEN** it MUST return `{ attempted: true, outcome: "succeeded" }`

### Requirement: `buildWorkflowComposerCallbacks` resolves the display name with a fallback chain, re-fetched per call, tenant-scoped

`buildWorkflowComposerCallbacks`'s `getRecordDisplayName(id)` callback MUST
call `GetHazardousEventByIdUseCase.execute({ id, tenantId })` (the factory's
own `tenantId`, with the call-time `id`, not a caller-held pre-edit object --
re-fetched so a submission that both changes the hazard classification and
requests submit-validation does not email validators a stale pre-edit name)
and MUST return the first non-empty value among the result's
`specificHazardName`, `hazardClusterName`, and `hazardTypeName`, in that
order, falling back to `""` if all three are empty.

#### Scenario: display name prefers specificHazardName when present

- **GIVEN** a hazardous event with a non-empty `specificHazardName`
- **WHEN** `getRecordDisplayName(id)` is called
- **THEN** it MUST return the `specificHazardName` value, regardless of
  `hazardClusterName`/`hazardTypeName`

#### Scenario: display name falls back to hazardClusterName

- **GIVEN** a hazardous event whose `specificHazardName` is empty but whose
  `hazardClusterName` is non-empty
- **WHEN** `getRecordDisplayName(id)` is called
- **THEN** it MUST return the `hazardClusterName` value

#### Scenario: display name falls back to hazardTypeName

- **GIVEN** a hazardous event whose `specificHazardName` and
  `hazardClusterName` are both empty but whose `hazardTypeName` is non-empty
- **WHEN** `getRecordDisplayName(id)` is called
- **THEN** it MUST return the `hazardTypeName` value

#### Scenario: display name is empty when no hazard name is set

- **GIVEN** a hazardous event with `specificHazardName`, `hazardClusterName`,
  and `hazardTypeName` all empty
- **WHEN** `getRecordDisplayName(id)` is called
- **THEN** it MUST return `""`

#### Scenario: the lookup is re-fetched per call, scoped to the factory's tenantId

- **GIVEN** `buildWorkflowComposerCallbacks` constructed with a given
  `tenantId`
- **WHEN** `getRecordDisplayName(id)` is called
- **THEN** `GetHazardousEventByIdUseCase.execute` MUST be called with
  exactly `{ id, tenantId }`, where `id` is the call-time argument (not a
  value captured when `buildWorkflowComposerCallbacks` was constructed)

### Requirement: `buildWorkflowComposerCallbacks` excludes the acting user from validator candidates, tenant-scoped

`buildWorkflowComposerCallbacks`'s `getValidCandidateIds()` callback MUST
delegate to `FindValidatorCandidatesUseCase.execute({ tenantId,
excludingUserId: actingUserId })` and return the mapped `id`s of its result,
rather than deriving the exclusion independently.

#### Scenario: the acting user is excluded via the use case's own parameter, not a local filter

- **GIVEN** `buildWorkflowComposerCallbacks` constructed with a given
  `tenantId` and `actingUserId`
- **WHEN** `getValidCandidateIds()` is called
- **THEN** `FindValidatorCandidatesUseCase.execute` MUST be called with
  exactly `{ tenantId, excludingUserId: actingUserId }`
- **AND** the callback's return value MUST be that call's resolved
  candidates' `id` fields, in the order returned

### Requirement: `composeWorkflowAction` derives `recordDate` identically to its pre-merge behavior for `submit-validation`

For `mappedAction === "submit-validation"`, the `recordDate` passed to
`processWorkflowActionUseCase.execute` MUST be `deriveRecordDate(parsed.startDate,
parsed.endDate)`, unchanged by the Group 3/Group 4 file merges.

#### Scenario: recordDate combines start and end dates

- **GIVEN** `parsed.startDate` and a different, non-empty `parsed.endDate`
- **WHEN** `composeWorkflowAction` is called with `mappedAction:
  "submit-validation"`
- **THEN** `processWorkflowActionUseCase.execute` MUST be called with
  `recordDate` equal to `` `${startDate} to ${endDate}` ``

#### Scenario: recordDate is just the start date when dates match or end date is absent

- **GIVEN** `parsed.startDate` equal to `parsed.endDate`, or `parsed.endDate`
  empty
- **WHEN** `composeWorkflowAction` is called with `mappedAction:
  "submit-validation"`
- **THEN** `processWorkflowActionUseCase.execute` MUST be called with
  `recordDate` equal to `parsed.startDate`
