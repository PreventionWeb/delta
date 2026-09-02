## 1. Write the failing tests (Red)

- [x] 1.1 Create `tests/integration/db/queries/workflowInstance.test.ts`. Import
      `"../setup"` first, then `dr` from `~/db.server` and `userTable` from
      `~/drizzle/schema`. Import `workflowInstanceTable` from
      `~/domains/validation-workflow/infrastructure/workflowInstanceTable`. Write tests
      covering the delta spec's `workflow_instance` scenarios:
  - Insert with only `entity_id`/`entity_type` supplied → `status` defaults to `'DRAFT'`.
  - Insert with `entity_type = 'XX'` → promise rejects (CHECK constraint).
  - Insert with `status = 'ARCHIVED'` → promise rejects (CHECK constraint).
  - Insert a second row with the same `(entity_id, entity_type)` → promise rejects
    (unique constraint).
  - Insert a second row with the same `entity_id` but `entity_type = 'DE'` → succeeds.
  - Two concurrent `Promise.all`-fired inserts for the same `(entity_id, entity_type)` →
    exactly one resolves, the other rejects on the unique constraint (not both resolving).
  - Assert `country_accounts_id` is not a key on the returned row / not a column on the
    table's Drizzle definition.

  Tests MUST fail at this point (`workflowInstanceTable` does not exist yet). Run to
  confirm red: `yarn vitest run tests/integration/db/queries/workflowInstance.test.ts`

- [x] 1.2 Create `tests/integration/db/queries/workflowHistory.test.ts` (`import "../setup"`
      first). Import `workflowInstanceTable` and `workflowHistoryTable` from their
      `~/domains/validation-workflow/infrastructure/` paths. Write tests covering the delta
      spec's `workflow_history` scenarios:
  - Insert with `from_status = null`, `to_status = 'DRAFT'` referencing a real instance →
    succeeds.
  - Insert with `from_status = 'DRAFT'`, `to_status = 'SUBMITTED'` → succeeds.
  - Insert with `to_status = 'ARCHIVED'` → promise rejects.
  - Insert with an `instance_id` that matches no `workflow_instance` row → promise
    rejects (FK violation).
  - Insert a `workflow_instance` row, attach `workflow_history` rows to it, delete the
    instance, then query `workflow_history` for that `instance_id` → zero rows (cascade).

  Run to confirm red: `yarn vitest run tests/integration/db/queries/workflowHistory.test.ts`

- [x] 1.3 Create `tests/integration/db/queries/workflowNotification.test.ts`
      (`import "../setup"` first). Import `workflowInstanceTable` and
      `workflowNotificationTable`. Write tests covering the delta spec's
      `workflow_notification` scenarios:
  - Insert with `notified_at`, `notified_by_user_id`, `notification_message`, and
    `channel = 'email'` set → succeeds, values round-trip.
  - Insert with `notified_at = null`, `notified_by_user_id = null`,
    `notification_message = null`, `channel = null` → succeeds.
  - Insert with an `instance_id` matching no `workflow_instance` row → promise rejects.
  - Insert a `workflow_instance` row, attach a `workflow_notification` row, delete the
    instance, then query `workflow_notification` for that `instance_id` → zero rows
    (cascade).

  Run to confirm red:
  `yarn vitest run tests/integration/db/queries/workflowNotification.test.ts`

## 2. Implement the Drizzle schema files (Green — schema)

- [x] 2.1 Create `app/domains/validation-workflow/infrastructure/workflowInstanceTable.ts`
      per design.md Decisions 1, 2, 4, 6, 8, 9, 10: `pgTable("workflow_instance", {...})` with
      `id` (`ourRandomUUID()`), `entityId` (`uuid("entity_id").notNull()`, no `.references()`
      — Decision 1), `entityType` (`text("entity_type", { enum: ["HE","DE","DR"] }).notNull()`),
      `status` (`text("status", { enum: [...six values] }).notNull().default("DRAFT")`),
      `submittedByUserId`/`validatedByUserId`/`approvedByUserId`/`publishedByUserId` (nullable,
      `.references(() => userTable.id)`), `submittedAt`/`validatedAt`/`approvedAt`/`publishedAt`
      (nullable, `timestamp(..., { withTimezone: true })`), `createdAt`/`updatedAt` (not null,
      `{ withTimezone: true }`, default `sql\`CURRENT_TIMESTAMP\``; do NOT import
`createdUpdatedTimestamps`). Add table-level `check()`constraints for`entity_type`and`status`value domains, plus a named`uniqueIndex("workflow_instance_entity_id_entity_type_unique")`on`(entity_id, entity_type)`. No `countryAccountsId`column. Export`SelectWorkflowInstance`/`InsertWorkflowInstance` inferred types.

  Run to confirm still red (testSchema entry missing):
  `yarn vitest run tests/integration/db/queries/workflowInstance.test.ts`

- [x] 2.2 Create `app/domains/validation-workflow/infrastructure/workflowHistoryTable.ts`
      per design.md Decisions 6, 7, 8, 9, 10: `pgTable("workflow_history", {...})` with `id`,
      `instanceId` (`.references(() => workflowInstanceTable.id, { onDelete: "cascade" })`,
      not null), `fromStatus` (nullable text-enum, same six values), `toStatus` (not null,
      same enum), `actingUserId` (not null, `.references(() => userTable.id)`), `occurredAt`
      (not null, `timestamp("occurred_at", { withTimezone: true })`, default
      `CURRENT_TIMESTAMP` — Decision 7 explains the `timestamp` → `occurredAt` rename),
      `comment` (nullable `text("comment")`). Add a `check()` constraint on `to_status`, and
      one on `from_status` that allows `NULL` or one of the six values. Export inferred types.

  Run: `yarn vitest run tests/integration/db/queries/workflowHistory.test.ts`

- [x] 2.3 Create
      `app/domains/validation-workflow/infrastructure/workflowNotificationTable.ts` per
      design.md Decisions 8, 11: `pgTable("workflow_notification", {...})` with `id`,
      `instanceId` (`.references(() => workflowInstanceTable.id, { onDelete: "cascade" })`,
      not null), `notifiedUserId` (not null, `.references(() => userTable.id)`),
      `notifiedByUserId` (nullable, `.references(() => userTable.id)`), `notifiedAt`
      (nullable, `{ withTimezone: true }`, **no DB default** — Decision 11),
      `notificationMessage` (nullable `text`), `channel` (nullable `text("channel")`, no enum
      — delivery mechanism is Phase 4a's concern). Export inferred types.

  Run: `yarn vitest run tests/integration/db/queries/workflowNotification.test.ts`

## 3. Implement the PGlite testSchema entries (Green — test infrastructure)

- [x] 3.1 Create `tests/integration/db/testSchema/workflowInstanceTable.ts` as a thin
      re-export: `export * from "~/domains/validation-workflow/infrastructure/workflowInstanceTable";`
      (P1-42 pattern — no duplicated table definition).
- [x] 3.2 Create `tests/integration/db/testSchema/workflowHistoryTable.ts`:
      `export * from "~/domains/validation-workflow/infrastructure/workflowHistoryTable";`
- [x] 3.3 Create `tests/integration/db/testSchema/workflowNotificationTable.ts`:
      `export * from "~/domains/validation-workflow/infrastructure/workflowNotificationTable";`
- [x] 3.4 Add all three `export *` lines to `tests/integration/db/testSchema/index.ts`,
      alphabetically ordered among the existing entries.

  Run to confirm all three test files are green:
  `yarn vitest run tests/integration/db/queries/workflowInstance.test.ts tests/integration/db/queries/workflowHistory.test.ts tests/integration/db/queries/workflowNotification.test.ts`

## 4. Generate and apply the migration (Green — DB migration)

- [x] 4.1 Hand-author `app/drizzle/migrations/<timestamp>_add_workflow_tables.sql`
      (design.md Decision 5 — this repo's migrations are hand-authored and journal-registered,
      not `drizzle-kit generate` output). Transcribe the three table definitions from step 2
      directly — column names, types, defaults, `CHECK` constraints, FKs, and the unique index
      — so the SQL and the schema files cannot silently diverge (see design.md Risks). Use
      `<timestamp>` in `YYYYMMDDHHMMSS` format, later than every existing migration.
- [x] 4.2 Add the new migration's entry to `app/drizzle/migrations/meta/_journal.json`,
      matching the existing entries' format.
- [x] 4.3 Run `yarn dbsync` against a local/dev database and confirm it applies cleanly
      with no errors, creating all three tables with the expected columns and constraints.

## 5. Quality gates (Refactor)

- [x] 5.1 **Gate 1 — Tests green**:
      `yarn vitest run tests/integration/db/queries/workflowInstance.test.ts tests/integration/db/queries/workflowHistory.test.ts tests/integration/db/queries/workflowNotification.test.ts`
      All scenarios from the delta spec pass.
- [x] 5.2 **Gate 2 — TypeScript**: `yarn tsc` — zero errors. Confirm
      `SelectWorkflowInstance["entityType"]` resolves to `"HE" | "DE" | "DR"`,
      `SelectWorkflowInstance["status"]` to the six-value union, and no `as any` appears
      anywhere in the three schema files or the three test files.
- [x] 5.3 **Gate 3 — Prettier**: `yarn format:check` on the changed files (do not run a
      bare repo-wide `yarn format`); fix with targeted `npx prettier --write <file>` if needed.
- [x] 5.4 **Gate 4 — Anti-pattern review**: read `.github/skills/anti-pattern-check/SKILL.md`
      and confirm none of its listed anti-patterns appear — specifically: no `pgEnum()` used
      (Decision 6), no `createdUpdatedTimestamps` imported (Decision 9), no
      `countryAccountsId` added to any of the three tables (Decision 2), `drizzle-kit push`
      not invoked anywhere.
- [x] 5.5 **Gate 5 — SOLID review**: invoke the `solid-reviewer` agent on the three new
      schema files. Confirm each file has a single responsibility (table definition + type
      exports only, no query logic).
- [x] 5.6 **Gate 6 — Documentation review**: comments explain WHY, not WHAT. Required
      WHY comments: on `entityId` (why no `.references()` — Decision 1), on the missing
      `countryAccountsId` (why — Decision 2), on the unique index (why — Decision 4), on
      `occurredAt` (why not named `timestamp` — Decision 7).
- [x] 5.7 **Gate 7 — Project conventions review**: read `.github/copilot-instructions.md`
      and `AGENTS.md`; confirm none of the three schema files use a `.server.ts` suffix
      (they're pure type/schema definitions, safe for any bundle, matching `noticesTable.ts`),
      `yarn dbsync` was used and not `drizzle-kit push`, and branch is
      `feature/ca-workflow-schema` targeting `dev`.
- [x] 5.8 **Gate 8 — Code review**: run `.github/skills/code-review/SKILL.md` in full
      against the diff. Address every finding before proceeding.
- [x] 5.9 **Gate 9 — Visual/UX parity**: N/A — no presentation-layer change in this
      intent (schema only). State this explicitly rather than skipping the gate silently.

## 6. Regression and archive

- [x] 6.1 **Baseline first**: on `dev` (or this branch's base commit, before any change
      in this proposal), run `yarn test:run2` and record the result. Any failure seen here is
      the confirmed pre-existing baseline — do not label a failure "pre-existing" on the basis
      of assumption alone.
- [x] 6.2 **Full PGlite regression suite on this branch**: `yarn test:run2` MUST pass with
      no new failures relative to the 6.1 baseline. Any new failure must be fixed before
      proceeding.
- [x] 6.3 **Post-implementation correction against the ER diagram source (design.md
      Decisions 10/11)**: a post-implementation review found the field lists for all three
      tables were transcribed inaccurately from the ER diagram into the original roadmap `2a`
      text, and this proposal initially inherited that inaccuracy. Corrected, with the user's
      explicit sign-off per field:
  - `workflowInstanceTable.ts`: added `submittedByUserId`/`submittedAt`,
    `approvedByUserId`/`approvedAt` (kept `validatedByUserId`/`publishedByUserId` as a
    deliberate, confirmed-useful deviation from the diagram, not reverted).
  - `workflowHistoryTable.ts`: added `comment` (nullable text).
  - `workflowNotificationTable.ts`: renamed `recipientUserId`→`notifiedUserId`,
    `sentAt`→`notifiedAt` to match the diagram; added `notifiedByUserId`,
    `notificationMessage`; kept `channel` as a deliberate, confirmed-useful addition;
    `notifiedAt` deliberately kept nullable with no DB default despite the diagram's
    literal "default now()" annotation, to preserve the already-tested pending-delivery
    scenario (Decision 11).
  - `proposal.md`, `design.md` (Decisions 10/11 + a new Risk entry), `specs/validation-workflow-schema/spec.md`, and this file all updated to match.
  - Test files updated for the renamed/added fields; all 18 PGlite tests re-run green.
  - Migration file `20260902120000_add_workflow_tables.sql` regenerated in place (not a
    new file — nothing had consumed the old one yet). Local `dts_development` DB: the 3
    tables (old shape, already applied) dropped, the corresponding `__drizzle_migrations__`
    row removed, `yarn dbsync` re-run — verified via direct SQL inspection
    (`information_schema.columns`, `pg_constraint`, `pg_indexes`) that the corrected shape
    landed exactly as declared. This DB operation was explicitly authorized by the user,
    one time, given the tables were empty and unconsumed.
  - The same gap-analysis root cause affects Phase 2 intents `2c`/`2e`/`2f`/`2h` and
    `hazardous_event`'s own new columns — those have no implementation yet, so they're
    being corrected directly in the roadmap document, outside this proposal's scope.
- [x] 6.4 **Tick all checkboxes** — tick every item in this tasks.md (including this one)
      so the incomplete-task guard does not block archiving.
- [x] 6.5 **Archive**: run `opsx:archive` on branch `feature/ca-workflow-schema` to
      finalize the OpenSpec change artifacts.
- [x] 6.6 **Raise PR** targeting `dev`, title:
      `Feature: validation-workflow schema — workflow_instance/history/notification tables (Phase 2a)`
