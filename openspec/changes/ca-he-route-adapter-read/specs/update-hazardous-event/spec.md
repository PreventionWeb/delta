## ADDED Requirements

### Requirement: A missing WorkflowInstance on the existing event degrades gracefully

`execute()` SHALL NOT throw when no `WorkflowInstance` exists for the existing event identified by
`command.id`/`command.tenantId`. The resolved result's `workflowStatus` SHALL be `null` in this
case, and the rest of the update (merge, persist, causal-link revalidation, bundled spatial
observation) SHALL proceed exactly as it would for an event with a `WorkflowInstance`. This
resolves `DEF-031` for this use case: every event created before this refactor has no
`WorkflowInstance` row until Phase M's backfill runs, and Phase 6 does not depend on Phase M.

This requirement was not previously documented in this spec even though the superseded behavior
(throwing `NotFoundError`) was already implemented and tested — a pre-existing spec/test gap, not
introduced by this change.

#### Scenario: An existing event with no WorkflowInstance can still be updated

- **GIVEN** an existing `HazardousEvent` within `command.tenantId` that has no associated
  `WorkflowInstance`
- **WHEN** `execute(command)` is called with valid field changes for that event
- **THEN** `execute()` SHALL NOT throw
- **AND** the update SHALL be persisted
- **AND** the resolved result's `workflowStatus` SHALL be `null`

#### Scenario: An existing event with a WorkflowInstance is unaffected

- **GIVEN** an existing `HazardousEvent` within `command.tenantId` with an associated
  `WorkflowInstance`
- **WHEN** `execute(command)` is called with valid field changes for that event
- **THEN** the resolved result's `workflowStatus` SHALL equal the `WorkflowInstance`'s current
  status, not `null`

## MODIFIED Requirements

### Requirement: Update an existing event's fields via a partial-patch command

`UpdateHazardousEventUseCase.execute(command)` SHALL load the existing `HazardousEvent` identified
by `command.id` within `command.tenantId`, apply only the fields present in `command` (a field
absent from `command`, i.e. `undefined`, MUST leave the existing entity's stored value for that
field unchanged), re-validate the resulting merged entity, persist it, and resolve a result
reflecting the merged, persisted state — including a `workflowStatus` that is `null` when the
existing event has no associated `WorkflowInstance` (see "A missing WorkflowInstance on the
existing event degrades gracefully" above), rather than always a definite `Status` value.

An explicit `null` on a nullable field (`hazardousEventStatus`, `specificHazardLocalName`,
`specificHazardNationalName`) MUST set that field to `null`, distinct from the field being absent
from `command` entirely.

A present collection field (`hazardDriverIds`, `attachments`, `fieldValues`,
`customFieldValues`) MUST fully replace the existing entity's stored collection for that field —
not merge per-element against it. A collection field absent from `command` MUST leave the
existing entity's stored collection for that field entirely unchanged.

#### Scenario: A present scalar field replaces the existing value

- **GIVEN** an existing `HazardousEvent` with `description: "Original"`
- **WHEN** `execute()` is called with `command.description: "Updated"` and every other field
  absent
- **THEN** the resolved result's `description` SHALL equal `"Updated"`
- **AND** every other field SHALL equal the existing entity's stored value, unchanged

#### Scenario: An absent scalar field leaves the existing value unchanged

- **GIVEN** an existing `HazardousEvent` with `magnitude: "5.2"`
- **WHEN** `execute()` is called with `command.magnitude` absent (not present on the command
  object) and at least one other field present
- **THEN** the resolved result's `magnitude` SHALL equal `"5.2"`, unchanged

#### Scenario: An explicit null on a nullable field sets it to null, distinct from absence

- **GIVEN** an existing `HazardousEvent` with `specificHazardLocalName: "Local name"`
- **WHEN** `execute()` is called with `command.specificHazardLocalName: null`
- **THEN** the resolved result's `specificHazardLocalName` SHALL be `null`

#### Scenario: A present collection field fully replaces the existing collection

- **GIVEN** an existing `HazardousEvent` with `hazardDriverIds: ["driver-a", "driver-b"]`
- **WHEN** `execute()` is called with `command.hazardDriverIds: ["driver-c"]`, where `"driver-c"`
  is present in the tenant's valid hazard driver set
- **THEN** the resolved result's `hazardDriverIds` SHALL equal exactly `["driver-c"]`,
  not a union with the prior collection

#### Scenario: A carried-over collection id is re-validated, not assumed still valid

- **GIVEN** an existing `HazardousEvent` with `hazardDriverIds: ["driver-a"]`, and `"driver-a"` has
  since been removed from the tenant's valid hazard driver set
- **WHEN** `execute()` is called with `command.hazardDriverIds` absent (carrying the existing
  collection over unchanged)
- **THEN** `execute()` SHALL throw `ValidationError`, the same as if `"driver-a"` had been newly
  submitted and found invalid

#### Scenario: Failure — the event does not exist under the caller's tenant

- **GIVEN** `command.id` does not correspond to any `HazardousEvent` within `command.tenantId`
  (either the id does not exist at all, or it exists under a different tenant)
- **WHEN** `execute()` is called
- **THEN** it SHALL throw `NotFoundError`
- **AND** no write of any kind SHALL occur

#### Scenario: A missing or non-string actingUserId is rejected before any write

- **GIVEN** a command whose `actingUserId` is an empty string, or a non-string value reachable only
  by a caller bypassing the compile-time type
- **WHEN** `execute()` is called
- **THEN** it SHALL throw `ValidationError`
- **AND** no write of any kind SHALL occur
