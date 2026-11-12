## Why

Tracing the CA detail page's missing "Audit log history" section (`DEF-058`) back to what legacy
actually writes revealed that `audit_logs` is a real, existing, domain-agnostic table
(`app/drizzle/schema/auditLogsTable.ts`) that CA's new `hazardous-events` domain code never
writes to at all. Confirmed by reading the real (non-dead-code) legacy write path directly —
`app/backend.server/models/event.ts` and `app/backend.server/handlers/form/form.ts`: legacy
writes a row on Create/Update/Delete (not awaited/not inside the write's own transaction, and
`country_accounts_id` always left null), and writes **nothing at all** for workflow status
transitions (submit/validate/publish/return) — confirmed via a full grep of `app/services/`.
CA's new use cases should keep writing into this same existing schema (no new table), while fixing
legacy's weaker guarantees (transactional write, populated `country_accounts_id`) and closing its
complete gap for workflow transitions. Scoped and decided with the human 2026-11-07/11 (roadmap
`6j`); this proposal builds to those decisions exactly, plus two explicit follow-up instructions
not yet in the roadmap text (mutation testing fully omitted for this intent, same as the
immediately-preceding `ca-shared-attachments-module`).

## What Changes

- **New shared module** `app/domains/shared/audit-log/` owning an `IAuditLogPort` and a
  Drizzle-backed adapter writing into the existing, unchanged `auditLogsTable` — no new table, no
  migration. Same generic-subdomain reasoning already applied to `6i`'s attachments module (see
  design.md Decision 1 for the exact file breakdown).
- **Wire `CreateHazardousEventUseCase`/`UpdateHazardousEventUseCase`/`DeleteHazardousEventUseCase`**
  to call the new port inside their own existing `transactionRunner.run()` callback, matching
  legacy's action strings (`"Create hazardous event"` / `"Update hazardous event"` / `"delete"` —
  the lowercase `"delete"` is legacy's own confirmed quirk, reproduced deliberately, not silently
  "fixed") **except** writing `newValues` correctly single-encoded on Create (legacy's
  double-`JSON.stringify()` on this one field is a confirmed bug, not reproduced). The audit row
  and the record change now succeed or fail together — a deliberate improvement over legacy's
  not-awaited, outside-transaction pattern.
- **Add a new audit-write hook directly inside the shared `ProcessWorkflowActionUseCase.execute()`**
  (not an HE-specific layer), firing for every one of its seven actions
  (`submit-validation`/`validate`/`publish`/`return`/`submit-draft`/`direct-validate`/
  `direct-publish`) — a deliberate improvement over legacy's own gap (it logs none of these
  today). Keyed by `command.entityType` translated to the legacy table name (`"HE"` →
  `"hazardous_event"`) and `command.entityId` (not the `workflow_instance` row's own id), so
  querying `audit_logs` by one record's id returns its entire history (create, update, delete,
  every transition) in one place. A write failure here is logged, not propagated — the same
  tolerated-degradation precedent already established for `notificationPort.notify()`
  (`DEF-023`/Decision 8) — so an audit-write failure never blocks a transition that already
  succeeded.
- **`country_accounts_id` is populated going forward** on every new write — pure additive
  correctness; nothing today queries or filters on this column, so this changes no existing
  behavior. For the workflow-transition hook specifically, this requires adding a `tenantId` field
  to `ProcessWorkflowActionCommand` (see design.md Decision 8 — a gap not covered by the roadmap's
  own "tenantId already in scope everywhere" claim, found by reading `ProcessWorkflowAction.ts`
  and `IWorkflowRepository.ts` directly: `workflow_instance` has no `countryAccountsId` column and
  the command carries no `tenantId` today; the one real production caller,
  `composeWorkflowAction.server.ts`, already has `tenantId` in scope and is updated to pass it
  through).
- **No UI work.** The detail page's missing "Audit log history" section (`DEF-058`) is a separate,
  larger read-side gap, tracked on its own — not solved here.
- **Mutation testing (Stryker) is skipped entirely for this intent** — no `test-quality-auditor`
  task is added anywhere in `tasks.md`, matching the immediately-preceding
  `ca-shared-attachments-module` intent's own explicit skip, extended here per direct user
  instruction to omit even a marked-skipped line (see design.md's closing note).

## Capabilities

### New Capabilities

- `shared-audit-log-port`: the cross-domain audit-log write port (`record()`, domain-and-entity-
  agnostic), its Drizzle-backed adapter, transactional and non-transactional write behavior, and
  concurrent-caller behavior.

### Modified Capabilities

- `create-hazardous-event`: `CreateHazardousEventUseCase` now writes an audit row inside the same
  transaction as the create.
- `update-hazardous-event`: `UpdateHazardousEventUseCase` now writes an audit row inside the same
  transaction as the update.
- `delete-hazardous-event`: `DeleteHazardousEventUseCase` now writes an audit row inside the same
  transaction as the delete.
- `process-workflow-action`: `ProcessWorkflowActionUseCase.execute()` now writes an audit row for
  every processed workflow action, tolerating a write failure without blocking the transition.

## Impact

**Files changed:**

- `app/domains/shared/audit-log/application/ports/IAuditLogPort.ts` (new) — port interface
  (`record(entry, tx?)`).
- `app/domains/shared/audit-log/infrastructure/DrizzleAuditLogAdapter.server.ts` (new) — adapter
  writing into the existing `auditLogsTable`.
- `app/domains/shared/audit-log/infrastructure/AuditLogPortToken.ts` (new) — DI token, hidden-token
  convention per `ValidationWorkflowModule`/`SharedAttachmentStorageModule`.
- `app/domains/shared/audit-log/infrastructure/SharedAuditLogModule.server.ts` (new) — NestJS
  module wiring the port/adapter for domains to import.
- `app/domains/hazardous-events/application/use-cases/CreateHazardousEvent.ts` (modified) — audit
  write inside the existing transaction, after the event insert.
- `app/domains/hazardous-events/application/use-cases/UpdateHazardousEvent.ts` (modified) — audit
  write inside the existing transaction, after the row update.
- `app/domains/hazardous-events/application/use-cases/DeleteHazardousEvent.ts` (modified) — audit
  write inside the existing transaction, after the row delete.
- `app/domains/hazardous-events/infrastructure/HazardousEventsModule.server.ts` (modified) —
  imports `SharedAuditLogModule`, injects `AUDIT_LOG_PORT` into Create/Update/Delete.
- `app/domains/validation-workflow/application/use-cases/ProcessWorkflowAction.ts` (modified) —
  new audit-write hook alongside the existing `notify()` call; `tenantId` added to
  `ProcessWorkflowActionCommandBase`.
- `app/domains/validation-workflow/infrastructure/ValidationWorkflowModule.server.ts` (modified) —
  imports `SharedAuditLogModule`, injects `AUDIT_LOG_PORT` into `ProcessWorkflowActionUseCase`.
- `app/domains/hazardous-events/presentation/web/composeWorkflowAction.server.ts` (modified) —
  threads its already-in-scope `tenantId` into all three `processWorkflowActionUseCase.execute()`
  call sites.
- `app/routes/$lang+/_authenticated+/he-preview+/edit.$id.tsx` and `new.tsx` (modified) — pass
  `tenantId` (already in scope) into `composeWorkflowAction()`'s args.

**DB migration required:** no — `auditLogsTable` is unchanged; no `yarn dbsync` in this change.

**Test approach:** PGlite (`yarn test:run2`) integration tests — each of Create/Update/Delete
writes exactly one correctly-shaped `audit_logs` row inside the same transaction as its own record
change, including a rollback scenario (a failing record write leaves no audit row either). Unit
tests for the new shared module's port/adapter (concurrent-write behavior, tx-vs-no-tx behavior).
A `ProcessWorkflowActionUseCase` test per transition action confirming an audit row is written
with the right `table_name`/`record_id`/`action`, and that an audit-write failure doesn't block
the transition's own success (mirroring the existing `notify()`-failure test precedent).

**Security / multi-tenancy implications:** `country_accounts_id` is populated from each use case's
own already-tenant-scoped command, and the new `tenantId` field added to
`ProcessWorkflowActionCommand` is threaded from the one real caller's own session-derived tenant
context — no new cross-tenant read path is introduced; this is a write-only addition.
