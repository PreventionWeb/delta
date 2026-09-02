## Why

Hazardous Events (HE), Disaster Events (DE), and Disaster Records (DR) each drive their own
validation/publish workflow today through duplicated, per-entity mechanisms: direct
`validated_by_user_id`/`validated_at`/`published_by_user_id`/`published_at` columns on
`hazardous_event`, `disaster_event`, and `disaster_records` themselves (migration
`20251215061552_validation_workflow_tables_and_columns.sql`), plus a narrower
`entity_validation_assignment`/`entity_validation_rejection` pair that only covers assignment
and rejection-reason tracking — not a full status-transition history, and not notifications.
Phase 0's audit (0c) confirmed this duplication is live, not dead code: two independently-built
generic services (`handleApprovalWorkflowService`, `processApprovalStatusActionService`) already
implement overlapping status logic, and publishing today silently overwrites the original
validator's attribution — a bug, not a feature.

The target design (roadmap Phase 2 Section G, Phase 3a) replaces this with one polymorphic,
generic `workflow_instance`/`workflow_history`/`workflow_notification` table set — a single
source of truth for status, keyed by `entity_id` + `entity_type`, owned by its own bounded
context (`validation-workflow`) so HE, DE, and DR consume it identically rather than
reimplementing it a third time. This change adds only the Drizzle schema and migration for
those three tables — no domain entity, use case, or route yet (those are Phase 3a/4a, separate
OpenSpec intents). Nothing currently reads or writes these tables; they are new and additive,
so this lands with zero risk to the live system per Invariant 2 (expand-only until cutover) —
the old columns and `entity_validation_*` tables are untouched and keep serving production
traffic exactly as they do today.

## What Changes

- **New file** `app/domains/validation-workflow/infrastructure/workflowInstanceTable.ts` —
  `workflow_instance` table: polymorphic `entity_id` (UUID, not a real FK — see design.md
  Decision 1) + `entity_type` (`'HE'|'DE'|'DR'`), `status`
  (`DRAFT|SUBMITTED|REVISION_REQUESTED|APPROVED|REJECTED|PUBLISHED`), a symmetric
  attribution + timestamp pair for all four transitions
  (`submitted_by_user_id`/`submitted_at`, `validated_by_user_id`/`validated_at`,
  `approved_by_user_id`/`approved_at`, `published_by_user_id`/`published_at` — see design.md
  Decision 10), `createdAt`/`updatedAt`. Deliberately carries **no** `countryAccountsId`
  column — see design.md Decision 2. A `UNIQUE(entity_id, entity_type)` constraint enforces
  one workflow instance per entity — see design.md Decision 4.
- **New file** `app/domains/validation-workflow/infrastructure/workflowHistoryTable.ts` —
  `workflow_history` table: append-only transition log, FK to `workflow_instance`,
  `from_status` (nullable — the initial DRAFT row has no prior status), `to_status`,
  `acting_user_id`, `occurred_at`, `comment` (nullable free text, e.g. a rejection reason).
- **New file** `app/domains/validation-workflow/infrastructure/workflowNotificationTable.ts` —
  `workflow_notification` table: FK to `workflow_instance`, `notified_user_id` (not null),
  `notified_by_user_id` (nullable — who triggered it), `notified_at` (nullable, no DB
  default — see design.md Decision 11), `notification_message` (nullable text), `channel`
  (free text — delivery mechanism is Phase 4a's `INotificationPort` concern, not decided
  here).
- **New file** `app/drizzle/migrations/<timestamp>_add_workflow_tables.sql` — hand-authored
  DDL matching the three schema files above (this project's migrations are hand-authored and
  journal-registered, not `drizzle-kit generate` output — see design.md Decision 5), applied
  via `yarn dbsync`.
- **Modified file** `app/drizzle/migrations/meta/_journal.json` — new migration entry.
- **New files** `tests/integration/db/testSchema/workflowInstanceTable.ts`,
  `workflowHistoryTable.ts`, `workflowNotificationTable.ts` — thin re-exports (the P1-42
  pattern established by `noticesTable.ts`) so the PGlite `pushSchema` harness creates these
  tables for tests.
- **Modified file** `tests/integration/db/testSchema/index.ts` — three new `export *` lines.

No route, model, handler, domain entity, use case, or `fieldsDef` pipeline is touched. No
existing table is modified.

## Capabilities

### New Capabilities

- `validation-workflow-schema`: The `workflow_instance`, `workflow_history`, and
  `workflow_notification` Drizzle schemas and their migration — correct columns, types,
  defaults, and constraints; the `entity_type` and `status` enums each reject any value
  outside their declared set at the database level; `entity_id`/`instance_id` uniqueness and
  FK integrity rules; and the tenant-scoping exception on `workflow_instance` is enforced by
  omission (no `countryAccountsId` column exists to populate).

### Modified Capabilities

(none — no existing spec-level behaviour changes; the old `entity_validation_assignment`/
`entity_validation_rejection` tables and the direct columns on `hazardous_event`/
`disaster_event`/`disaster_records` are untouched)

## Impact

- **`app/domains/validation-workflow/infrastructure/workflowInstanceTable.ts`** — new file.
- **`app/domains/validation-workflow/infrastructure/workflowHistoryTable.ts`** — new file.
- **`app/domains/validation-workflow/infrastructure/workflowNotificationTable.ts`** — new file.
- **`app/drizzle/migrations/<timestamp>_add_workflow_tables.sql`** — new, hand-authored;
  reviewed and committed alongside the schema files.
- **`app/drizzle/migrations/meta/_journal.json`** — modified; new entry appended.
- **`tests/integration/db/testSchema/workflowInstanceTable.ts`** — new, thin re-export.
- **`tests/integration/db/testSchema/workflowHistoryTable.ts`** — new, thin re-export.
- **`tests/integration/db/testSchema/workflowNotificationTable.ts`** — new, thin re-export.
- **`tests/integration/db/testSchema/index.ts`** — modified; three `export *` lines added.
- **DB migration**: required. Hand-authored SQL + `_journal.json` entry, applied with
  `yarn dbsync`. Never `drizzle-kit push`.
- **Test approach**: PGlite (`yarn test:run2`). `tests/integration/db/setup.ts` creates
  tables via `pushSchema` against `testSchema/` — it does not execute the hand-authored `.sql`
  migration file directly, so the two artifacts must be kept in sync by hand (see design.md
  Decision 5 and Risks).
- **Security / multi-tenancy**: security-sensitive by omission, not by oversight —
  `workflow_instance` intentionally has no `countryAccountsId` column. This is safe only
  because every caller reaches this table through its own aggregate repository (e.g.
  `HazardousEventRepository`), which has already validated tenant ownership of `entity_id`
  before this table is ever touched — this table has no independent way to enforce
  tenant isolation itself. See design.md Decision 2 for the full reasoning and its limits.
- **fieldsDef / Form-CSV-API pipeline**: not impacted — no model file, form, or CSV/API route
  is created in this change.
