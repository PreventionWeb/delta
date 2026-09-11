## Why

The `validation-workflow` bounded context has DB-level tables
(`app/domains/validation-workflow/infrastructure/workflowInstanceTable.ts`,
`workflowHistoryTable.ts`, `workflowNotificationTable.ts`, from the already-archived
`ca-workflow-schema` change) but no domain layer at all — `domain/`,
`application/ports/`, `application/use-cases/` are still empty `.gitkeep` placeholders.
Phase 3's own Gate requires every entity/service in this phase to have zero DB and zero
NestJS/framework dependency; Track B's `HazardousEvent` entity (3b, not started) depends
on this module's `IWorkflowRepository` port existing so it can query approval status
without carrying its own status field (avoiding the two-sources-of-truth drift Phase 0
finding 0c documented in today's system). This change builds Track A first, per the
roadmap's own sequencing note, so Track B has something to depend on.

## What Changes

- Add a `WorkflowInstance` domain entity (`app/domains/validation-workflow/domain/WorkflowInstance.ts`)
  modeling the `workflow_instance` row shape as a pure TypeScript class: polymorphic
  `entityId`/`entityType` (`'HE'|'DE'|'DR'`), `status` enum
  (`DRAFT|SUBMITTED|REVISION_REQUESTED|APPROVED|REJECTED|PUBLISHED`), and instance
  transition methods (`submit`, `validate`, `approve`, `requestRevision`, `publish`) that
  enforce a fixed status-transition graph and reject any call made from a disallowed
  current status. `REJECTED` remains a valid status value (matches the shipped DB
  constraint) but no method targets it in this change — see below.
- Implement the publish backfill rule (resolved open decision #9, PM decision, Phase 0
  finding 0c): `publish()` always sets `publishedByUserId`/`publishedAt` from the
  publisher, but only sets `validatedByUserId`/`validatedAt` from the publisher when both
  are still `null` at the time of the call. An already-set validator's attribution is
  never overwritten by a later publish — this is the one behavior fix this refactor
  makes relative to today's system (0c: "publishing silently overwrites the original
  validator's attribution").
- Add `IWorkflowRepository` port (`app/domains/validation-workflow/application/ports/IWorkflowRepository.ts`):
  `findByEntity` (single polymorphic lookup), `findByEntityIds` (batched lookup for list
  views — avoids both an N+1 query pattern and any other module reaching into
  `workflowInstanceTable` directly), and `save`. Zero Drizzle/framework imports — only
  `WorkflowInstance` and shared value types.
- Zero framework dependencies anywhere in this change: no Drizzle, no NestJS, no Remix
  imports in `WorkflowInstance.ts` or `IWorkflowRepository.ts`.

**Not in scope for this change** (explicitly deferred, see design.md):

- No repository implementation (Drizzle adapter) — that is Phase 4a/5a's job, once
  `IWorkflowRepository` exists for it to implement.
- No use case / NestJS wiring — Phase 4a's `ProcessWorkflowActionUseCase` is the first
  consumer of both the entity and the port.
- No change to `workflowInstanceTable.ts` or any other already-archived schema file —
  this change only reads that file to ground the entity's shape; it does not modify it.
- No data migration from the legacy `validation_workflow.ts` / direct
  `hazardous_event.validated_by_user_id`-style columns — Phase M/7.
- No `reject()` transition method — confirmed with the user: `REJECTED` represents a
  distinct future capability (flagging a draft as a likely duplicate or miscategorized
  entry), not a validation-workflow outcome, and isn't designed yet.

## Capabilities

### New Capabilities

- `workflow-instance-entity`: `WorkflowInstance` domain entity — construction, the fixed
  status-transition graph, and the publish backfill rule.
- `workflow-repository-port`: `IWorkflowRepository` interface — method signatures,
  batched lookup contract, and the deliberate absence of a `tenantId` parameter (tenant
  validation is the caller's own repository's job, per `ca-workflow-schema` design.md
  Decision 2).

### Modified Capabilities

_(none — `validation-workflow-schema` describes the DB table shape and is unchanged by
this purely domain-layer addition)_

## Impact

- **Affected code:** two new production files —
  `app/domains/validation-workflow/domain/WorkflowInstance.ts` and
  `app/domains/validation-workflow/application/ports/IWorkflowRepository.ts` — plus one
  test file per production file (`WorkflowInstance.test.ts`; `IWorkflowRepository.test.ts`,
  added during Gate 8 to give the port's four spec requirements an automated regression
  check instead of a one-time manual `tsc` read-through). Nothing outside
  `app/domains/validation-workflow/` is touched; no existing file is modified.
- **DB migration:** none required. This change adds no table, column, or index — it adds
  pure TypeScript modeling an already-shipped table (`workflowInstanceTable.ts`, from the
  archived `ca-workflow-schema` change).
- **Test approach:** Unit tests only (Vitest, no PGlite import, no DB). Covers: every
  edge of the status-transition graph (each disallowed call rejected), and the publish
  backfill rule for both branches (validator fields empty vs. already set).
- **Security / multi-tenancy:** `IWorkflowRepository` deliberately carries no `tenantId`
  parameter on any method, matching `workflowInstanceTable`'s deliberate omission of
  `countryAccountsId` (`ca-workflow-schema` design.md Decision 2). This is a documented,
  accepted risk inherited from that schema decision, not introduced here — the caller's
  own aggregate repository (e.g. HE's) is responsible for tenant-scoping before it ever
  reaches into this port. Flagged again here since this is the first change to define
  that port's actual shape.
