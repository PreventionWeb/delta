## Why

`workflowInstanceTable.entityId` is a DB-level `NOT NULL uuid` column, but
`WorkflowInstance.create()` (`app/domains/validation-workflow/domain/WorkflowInstance.ts`)
never checks that `entityId` is present before constructing an instance — it validates
`entityType`, `status`, all timestamps, and cross-field attribution consistency, but not
`entityId` itself. This was found during human review of the sibling change `3b`
(`ca-he-hazardous-event-entity`), whose `HazardousEvent.create()` _does_ validate presence
of its own structurally-equivalent caller-supplied reference fields (`tenantId`,
`specificHazardId`), throwing `ValidationError` when empty/missing. The two sibling
entities are inconsistent, and any application-layer code that constructs a
`WorkflowInstance` with a missing/blank `entityId` currently gets a raw DB constraint
violation on persist instead of a clear domain-level `ValidationError` at construction
time — or, for a `WorkflowInstance` that is never persisted, no error at all.

## Branch note

This change's artifacts and implementation live on `feature/ca-he-hazardous-event-entity`
(the same branch as intent `3b`) and will ship in the same PR, at the user's explicit
direction. This is a deliberate, one-off exception to the project's usual
one-change-one-branch convention — not an oversight. `3a`
(`ca-workflow-instance-entity`, the change that introduced `WorkflowInstance.ts`) is
already merged and archived; this is a new, standalone follow-up change, not a reopening
of `3a`.

## What Changes

- `WorkflowInstance.create()` gains a presence check on `entityId`: `null`/`undefined` or
  an empty/whitespace-only string (after `.trim()`) throws `ValidationError` referencing
  `entityId`, with message `entityId must not be empty` — matching
  `HazardousEvent.create()`'s exact convention (`` `${field} must not be empty` ``, using
  `value == null || value.trim().length === 0`).
- This check runs as the **first** guard in `create()`, before the existing
  `entityType`/`status` enum checks, mirroring `HazardousEvent.create()`'s own ordering
  (required-field presence checked before anything else). A new scenario pins this
  ordering: an empty `entityId` together with an invalid `entityType` MUST report the
  `entityId` error, not the `entityType` error.
- No other field's validation changes. `WorkflowInstanceProps.id` has the same
  DB-NOT-NULL/no-domain-check gap as `entityId` did, but is explicitly **out of scope**
  here — see Impact below.

## Capabilities

### Modified Capabilities

- `workflow-instance-entity`: the "WorkflowInstance construction via validated factory"
  requirement gains a new normative rule — `create()` MUST validate that `entityId` is
  present (non-null, non-empty after trim) and MUST throw `ValidationError` referencing
  `entityId` otherwise, checked before the existing `entityType`/`status` checks.

## Impact

**Files changed:**

- `app/domains/validation-workflow/domain/WorkflowInstance.ts` — add the `entityId`
  presence check as the first guard in `static create()`.
- `app/domains/validation-workflow/domain/WorkflowInstance.test.ts` — add failing tests
  (Red phase) for empty-string, whitespace-only, and null/undefined `entityId`, a
  passing-through case for a real UUID, and the ordering scenario (empty `entityId` +
  invalid `entityType` reports the `entityId` error).

**Call sites checked:** grepped the full `app` tree for `WorkflowInstance.create(` —
every call site is a test (`WorkflowInstance.test.ts`,
`application/ports/IWorkflowRepository.test.ts`). There is no production
application-layer or infrastructure-layer caller yet (the repository/handler layer that
will call `create()` from real request data has not been built). This confirms the
change is contained to the two files above, and that the added check cannot break any
existing live code path — only future callers and the tests written here are affected.

**DB migration:** none. The DB column is already `NOT NULL`; this only adds an
application-level guard ahead of it. No schema change.

**Test approach:** PGlite/`test:run2` is the project's primary suite, but this specific
change is pure in-memory domain-entity logic with zero DB interaction — the new tests are
plain Vitest unit tests on `WorkflowInstance.create()`, run via
`yarn vitest run app/domains/validation-workflow/domain/WorkflowInstance.test.ts`. The
mandatory `yarn test:run2` regression gate still runs at the end per project convention,
to confirm no other suite is affected.

**Security / multi-tenancy:** none. This is a synchronous, pure domain-entity
validation change with no auth, no query, and no `countryAccountsId` scoping involved.

**Out of scope (explicitly, not silently dropped):** `WorkflowInstanceProps.id` has the
same shape of gap (`NOT NULL` in the DB schema, no presence check in `create()`) as
`entityId` had. Generalizing this fix into a loop over multiple required fields (the way
`HazardousEvent.create()` loops over three) was considered and rejected for this change —
the reported gap was `entityId` specifically, and `id` is a separate, unconfirmed
question the user has not raised. Recorded here as an explicit out-of-scope observation
per this change's own review (not added to
`_docs/refactoring-plan/deferred-items-register.md`, which is outside
`openspec/changes/` and not touched by this proposal).
