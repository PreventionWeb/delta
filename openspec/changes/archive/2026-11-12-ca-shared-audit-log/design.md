## Context

See proposal.md - Why for the motivation. The relevant current state, confirmed by reading code
directly (not re-derived here, just the facts the decisions below depend on):

- `auditLogsTable` (`app/drizzle/schema/auditLogsTable.ts`) already has every column needed:
  `tableName`/`recordId`/`userId` (`NOT NULL`, FK to `userTable`)/`action`/`oldValues`/`newValues`
  (both nullable `jsonb`)/`timestamp`/`countryAccountsId` (nullable, FK to `countryAccountsTable`).
- `CreateHazardousEventUseCase`/`UpdateHazardousEventUseCase`/`DeleteHazardousEventUseCase` each
  already wrap their entire write sequence in `this.transactionRunner.run(async (tx) => {...})`
  (`ITransactionRunner`, `Tx` type from `~/db.server`). `Tx` is itself a union that includes `Dr`
  (the plain, non-transactional Drizzle client) — `export type Tx = <transaction-callback-param> |
  Dr`. All three already carry `command.tenantId`/`command.actingUserId` as required, validated
  (`assertNonEmptyString`) fields.
- `ProcessWorkflowActionUseCase.execute()` has **no transaction at all** — it calls
  `workflowRepository.update()` and, conditionally, `notificationPort.notify()` as two independent
  awaited steps, each failure handled differently (an `update()` failure propagates; a `notify()`
  failure is caught, logged at WARN, and swallowed — `DEF-023`/Decision 8 in that capability's own
  spec). Its constructor only holds `(logger, workflowRepository, notificationPort)` — no DB client,
  by design (DIP boundary already established for this entity-type-agnostic use case).
- `ProcessWorkflowActionCommand` has no `tenantId` field, and `workflowInstanceTable` has no
  `countryAccountsId` column (explicit schema Decision 2 from that capability's own design —
  "caller's own repository validates tenant ownership"). The one real production caller,
  `composeWorkflowAction.server.ts` (called from both `he-preview+/new.tsx` and
  `he-preview+/edit.$id.tsx`), already has `tenantId` in scope at every one of its three
  `execute()` call sites but does not pass it through today.
- `EntityType` is the fixed union `"HE" | "DE" | "DR"`. Only `"HE"` maps to a real legacy table
  today (`hazardousEventTable`'s own Drizzle name, `"hazardous_event"`); `DE`/`DR` have not
  migrated to CA yet.
- The existing `app/domains/shared/attachments/` module (from `6i`) is the direct structural
  precedent for this one: `application/ports/I<X>Port.ts` + `infrastructure/{Adapter.server.ts,
  <X>PortToken.ts, Shared<X>Module.server.ts}`, hidden-token convention, `useFactory` DI wiring.

## Goals / Non-Goals

**Goals:**

- One shared, entity-agnostic audit-write port usable by HE today and DE/DR once they migrate.
- CA's audit write for Create/Update/Delete is strictly stronger than legacy's (same transaction,
  not best-effort).
- Workflow transitions get an audit trail legacy never had, without making
  `ProcessWorkflowActionUseCase` aware of any HE-specific concept.
- `audit_logs` rows for one record (create, update, delete, every transition) are queryable
  together by `table_name` + `record_id`.

**Non-Goals:**

- No new table, no migration, no change to `auditLogsTable`'s shape.
- No UI for reading audit history (`DEF-058`, tracked separately).
- No audit trail for `DE`/`DR` transitions yet — those entity types have no legacy table to key
  against; this design only avoids blocking them, it does not give them real coverage.
- No change to `notificationPort.notify()`'s own behavior or tests.

## Decisions

### Decision 1 — Module layout

Mirrors `app/domains/shared/attachments/` exactly:

```
app/domains/shared/audit-log/
  application/ports/IAuditLogPort.ts
  infrastructure/DrizzleAuditLogAdapter.server.ts
  infrastructure/AuditLogPortToken.ts
  infrastructure/SharedAuditLogModule.server.ts
```

No alternative considered beyond this — it is this project's own established pattern for a
second cross-cutting, domain-agnostic concern, and the roadmap decision already names this as the
precedent to follow.

### Decision 2 — Port signature: optional `tx`, not two methods

```ts
export interface AuditLogEntry {
	readonly tableName: string;
	readonly recordId: string;
	readonly userId: string;
	readonly action: string;
	readonly oldValues: unknown;
	readonly newValues: unknown;
	readonly countryAccountsId: string | null;
}

export interface IAuditLogPort {
	record(entry: AuditLogEntry, tx?: Tx): Promise<void>;
}
```

`tx` is optional, not split into `record()`/`recordInTransaction()`. Create/Update/Delete HE pass
their own `tx` (write happens inside their existing transaction — Decision 6). The workflow-
transition hook passes nothing — `ProcessWorkflowActionUseCase` has no DB client to pass
(Context), and introducing one there would widen its DIP boundary beyond what this intent needs.
**Alternative considered and rejected**: making `tx` mandatory and giving
`ProcessWorkflowActionUseCase` its own injected `Dr` — rejected because it adds a raw
infrastructure dependency to a use case whose entire point (per its own capability's design) is to
stay persistence-detail-free, for a call site that was never transactional to begin with (there is
nothing to join). The adapter resolves the no-`tx` case by executing against its own
DI-injected `Dr` client (same `DRIZZLE_CLIENT` token `DrizzleWorkflowRepository` already uses).

### Decision 3 — Action-string convention

- Create/Update reuse legacy's exact strings: `"Create hazardous event"` / `"Update hazardous
  event"`.
- Delete reuses legacy's lowercase `"delete"` — a confirmed, deliberate reproduction of legacy's
  own inconsistent quirk (roadmap: "not something to silently 'fix' without a decision" — already
  decided: reproduce it).
- Workflow transitions have no legacy precedent at all (legacy logs none of them today). This
  design uses the command's own `action` discriminant literal verbatim
  (`"submit-validation"`/`"validate"`/`"publish"`/`"return"`/`"submit-draft"`/`"direct-validate"`/
  `"direct-publish"`) as the audit `action` string — the least arbitrary choice available, directly
  traceable to the use case's own existing type, no new vocabulary invented.

### Decision 4 — `newValues` encoding

Create writes `newValues` as the raw object (the adapter/port's own `jsonb` column handles
serialization once) — **not** `JSON.stringify()`'d before being passed in. This is a deliberate,
confirmed deviation from legacy's own double-encode bug on this one field (roadmap: "a confirmed
unintentional legacy quirk, not reproduced"). Update already passes the raw object in legacy too,
so Update's shape is unchanged in spirit — both now single-encode consistently.

### Decision 5 — Delete's `oldValues`/`newValues`

Matches legacy exactly: `oldValues` = the full pre-delete row (already fetched by
`findByIdForUpdate()`'s `locked` value in the existing code), `newValues` = `null` (no new state —
the row is gone).

### Decision 6 — Write placement: inside the transaction for Create/Update/Delete, independent try/catch for workflow transitions

Create/Update/Delete each call `auditLogPort.record(entry, tx)` **inside** their existing
`transactionRunner.run()` callback, immediately after the write step the audit row documents (same
placement convention `hipCrosswalkPort.stamp()` already uses — "immediately after the event
insert, same tx"). A failure here rolls back the whole transaction, same as any other step inside
it — deliberate (roadmap: "the audit row and the record change succeed or fail together").

The workflow-transition hook has no transaction to join (Context). It calls
`auditLogPort.record(entry)` after `workflowRepository.update()` resolves, in its own `try/catch`
block, structurally identical to the existing `notify()` block immediately below it: WARN-level
log on failure, swallowed (not propagated), with the same `console.error` last-resort fallback if
`ILogger` itself throws. This is a second, independent `try/catch` — not nested inside `notify()`'s
own — so one of the two failing never suppresses or skips the other.

### Decision 7 — `table_name` for workflow transitions: translate `entityType`, don't store it raw

Per the roadmap's own decision, querying `audit_logs` by one HE record's id must return its entire
history (create/update/delete/every transition) in one place — which requires `table_name =
"hazardous_event"` on transition rows too, not the literal `"HE"` entity-type code. A small,
private lookup lives next to `ProcessWorkflowAction.ts`:

```ts
const ENTITY_TYPE_TABLE_NAME: Partial<Record<EntityType, string>> = {
	HE: "hazardous_event",
};
```

Only `HE` is populated — `DE`/`DR` have no legacy CA table yet (Context). An unmapped
`entityType` is treated as an audit-write failure under Decision 6's own tolerated-degradation
rule (logged at WARN, skipped, transition still succeeds) — not a thrown error, not a crash. This
keeps `DE`/`DR` transitions working exactly as they do today (zero audit trail, the current
reality) until a future migration adds their own entry to this map. **Alternative considered**:
make `ProcessWorkflowActionUseCase` reject unmapped entity types outright — rejected, since that
would make adopting this generic hook a precondition for `DE`/`DR` ever calling this use case at
all, which is backwards (the use case is already entity-agnostic and already serves `DE`/`DR`
command shapes today, just with no audit coverage).

### Decision 8 — `tenantId` on `ProcessWorkflowActionCommand` (gap closed, not pre-resolved by the roadmap)

**This is new and not one of the roadmap's "do not re-litigate" decisions** — found by reading
`ProcessWorkflowAction.ts`/`IWorkflowRepository.ts` directly during this design, not assumed. The
roadmap's "CA's own use cases already have `tenantId` in scope everywhere this write happens" is
true for Create/Update/Delete HE but was not actually true inside
`ProcessWorkflowActionCommand`/`ProcessWorkflowActionUseCase` itself — `workflow_instance` has no
`countryAccountsId` column (that capability's own Decision 2) and the command carries no
`tenantId`. The only real caller, `composeWorkflowAction.server.ts`, already has `tenantId` in
scope at all three of its `execute()` call sites (via `buildWorkflowComposerCallbacks({ tenantId,
actingUserId })`'s own closure) but never threads it through.

Resolution: add `tenantId: string` to `ProcessWorkflowActionCommandBase`. `composeWorkflowAction()`
gains a `tenantId` argument (its two route callers, `new.tsx`/`edit.$id.tsx`, already hold
`tenantId` in scope and pass it in) and includes it in all three `execute()` calls. This only
widens the command type and this one function's args — it does not touch
`workflowInstanceTable`'s own schema or `IWorkflowRepository`; the new `tenantId` is consumed
solely by the audit-write hook to populate `countryAccountsId`, nothing else in `execute()` reads
it. **Alternative considered**: look up the owning tenant indirectly via a repository call inside
the hook — rejected, since it would make the entity-agnostic use case reach into an HE-specific (or
any domain-specific) repository to resolve a value its one real caller already has for free.

### Decision 9 — DI wiring

`HazardousEventsModule.server.ts` imports `SharedAuditLogModule` (alongside its existing
`SharedAttachmentStorageModule` import) and injects `AUDIT_LOG_PORT` as a new, final constructor
argument to `CreateHazardousEventUseCase`/`UpdateHazardousEventUseCase`/
`DeleteHazardousEventUseCase`, narrowed to `Pick<IAuditLogPort, "record">` (same ISP convention
`attachmentStoragePort` already uses). `ValidationWorkflowModule.server.ts` imports
`SharedAuditLogModule` and injects the same token as a new 4th constructor argument to
`ProcessWorkflowActionUseCase`.

### Decision 10 — `userId` is always satisfiable

`auditLogsTable.userId` is `NOT NULL` with an FK to `userTable`. Every one of the four write sites
(Create/Update/Delete HE, workflow transitions) already carries a required, non-empty-validated
`actingUserId` in its own command type — no nullable-user accommodation is needed anywhere in this
design.

## Risks / Trade-offs

- **[Risk]** Audit-write failure inside Create/Update/Delete's own transaction rolls back the
  entire record change (unlike the workflow-transition path, where it's tolerated) →
  **Mitigation**: deliberate, not an inconsistency — this is the roadmap's own explicit decision
  for these three use cases specifically (write succeeds/fails together with the record change);
  the asymmetry with workflow transitions exists because only the latter has no transaction to
  join in the first place (Decision 6).
- **[Risk]** Widening `ProcessWorkflowActionCommand` with `tenantId` (Decision 8) is scope beyond
  the roadmap's own "at minimum" file list → **Mitigation**: flagged explicitly here for human
  review before implementation starts; it is additive-only (a new required field, no existing
  field changes meaning), confined to the one real caller, and necessary for this intent's own
  "populate `country_accounts_id` going forward" goal to actually hold for workflow transitions.
- **[Risk]** An unmapped `EntityType` (Decision 7) means `DE`/`DR` transitions get silently no
  audit trail → **Mitigation**: matches their current (zero-coverage) reality exactly; not a
  regression, revisited when those domains migrate.
- **[Risk]** `DrizzleAuditLogAdapter` falling back to its own injected `Dr` client when `tx` is
  omitted means a transition's audit row commits immediately and independently, with no later
  rollback possible if anything downstream in the same request fails → **Mitigation**: there is no
  "downstream in the same transaction" to roll back from — `workflowRepository.update()` has
  already committed by the time the hook runs, exactly like `notify()`'s own existing, already-
  accepted behavior one line below it.

## Migration Plan

No DB migration. This is a pure application-code change: deploy as a normal release; rollback is
reverting the commit — `auditLogsTable` itself is untouched either way, so no forward/backward
data compatibility concern exists in either direction.

## Note on mutation testing (Stryker)

Skipped entirely for this intent, same as the immediately-preceding `ca-shared-attachments-module`
— no `test-quality-auditor` task appears anywhere in `tasks.md`, not even marked as skipped (per
explicit user instruction, stricter than that preceding intent's own precedent of keeping a
skipped-and-annotated line). Root cause is the known Stryker/Babel `implements`-clause crash
(`DEF-041`, unresolved); tracked there, not re-logged here.
