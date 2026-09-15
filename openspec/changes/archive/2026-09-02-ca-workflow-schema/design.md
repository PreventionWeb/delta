## Context

See proposal.md - Why for motivation. This covers only what shapes the schema.

First schema file for the `validation-workflow` bounded context (Phase 1 scaffold exists at
`app/domains/validation-workflow/`, currently empty except `.gitkeep`). Unlike Notices and
Track B (2b-2i), these pgTable definitions live in the domain's own `infrastructure/` folder,
not `app/drizzle/schema/` — see Decision 3.

Two prior mechanisms exist and are **not** touched by this change (expand-only until cutover):

- `entity_validation_assignment` / `entity_validation_rejection` — narrower (assignment +
  rejection reason only, no history/notifications), keyed by full-word
  `entity_validation_type` (vs. this change's `HE`/`DE`/`DR` short codes; see Decision 6).
- Direct `validated_by_user_id`/`published_by_user_id`/etc. columns already on
  `hazardous_event`, `disaster_event`, `disaster_records` (migration
  `20251215061552_validation_workflow_tables_and_columns.sql`).

Both stay live and unmodified. The new tables are additive; migrating off the old mechanism is
a later, separate concern (Phase M / Phase 7).

Migrations in this repo are hand-authored SQL registered in `_journal.json`, not
`drizzle-kit generate` output — see Decision 5.

## Goals / Non-Goals

**Goals:**

- Define `workflowInstanceTable`, `workflowHistoryTable`, `workflowNotificationTable` per the
  roadmap's 2a intent, correctly typed per ADR-002.
- Enforce `entity_type` and `status` at the database level (CHECK constraints), not just in TS.
- Add PGlite test coverage under `tests/integration/db/testSchema/`.
- Generate the migration SQL + journal entry, confirm `yarn dbsync` applies cleanly.

**Non-Goals:**

- Domain entities, ports, use cases, or NestJS wiring — Phase 3a/4a.
- Migrating/backfilling data from the legacy mechanisms — Phase M.
- Deciding the notification delivery mechanism — `channel` is left unconstrained text;
  Phase 4a's `INotificationPort` decides this.
- Any change to `hazardous_event`, `disaster_event`, `disaster_records`,
  `entity_validation_assignment`, `entity_validation_rejection`.

## Decisions

### 1. `entity_id` is a plain UUID, not a `.references()` FK

`workflow_instance` is polymorphic across three unrelated tables. Postgres has no native
polymorphic FK. The alternative — three nullable type-specific FK columns + a three-way CHECK
(`eventCausalityTable.ts`'s pattern) — was rejected: this table's only consumer
(`IWorkflowRepository`) receives `entityId`/`entityType` as opaque values and never joins
across them at the SQL level, so the extra FK columns buy integrity this access pattern
doesn't need. `entity_id` stays a plain `uuid`, not null, no `.references()` — a permanent
property of a polymorphic key, not a gap to close later.

### 2. No `countryAccountsId` on any of the three tables

Per the roadmap: tenant validation happens in the caller's own aggregate repository before
reaching this table. This is the one deliberate exception to the project-wide
`countryAccountsId` rule — `workflow_instance` belongs to `_an entity_`, and that entity's own
repository already enforces tenant ownership before any workflow read/write. Applies to
`workflow_history`/`workflow_notification` too, since both are reached only via `instance_id`.

**Limit:** this table has no independent tenant isolation. A future caller that queries
`workflow_instance` directly without checking `entity_id` against its own tenant scope could
leak cross-tenant status. Accepted risk — see Risks.

### 3. Table files live in `infrastructure/`, not `app/drizzle/schema/`

Deliberate divergence from Notices and this roadmap's own Track B, per the roadmap's explicit
instruction for this intent. `validation-workflow` has no legacy tables to co-locate near, so
keeping schema inside its own module tree from day one is a genuine green-field choice, not an
inconsistency. Consequence: these files must be referenced by full module path everywhere
(repository adapters, testSchema re-exports) — no tool scans this location automatically.
`drizzle.config.ts`'s schema glob doesn't need to change (Decision 5: migrations are
hand-authored, not generated from that glob).

### 4. `UNIQUE(entity_id, entity_type)` on `workflow_instance`

Not stated in the roadmap's 2a text, but required by contracts already planned: 3a's
`findByEntity` is singular, and 4b initializes one `WorkflowInstance` per entity at creation.
Without a DB-level constraint, two concurrent callers could each create an instance for the
same entity, silently losing one's history. Same reasoning as 2f's
`hazardous_event_spatial_observation` unique constraint ("defense in depth alongside the
application-layer check"), applied one intent earlier. Enforced via a named `uniqueIndex()`:
`workflow_instance_entity_id_entity_type_unique`.

### 5. Hand-authored migration SQL, not `drizzle-kit generate` output

Confirmed by inspecting every file in `app/drizzle/migrations/`: none contain the
`--> statement-breakpoint` marker drizzle-kit emits, and `package.json` has no `db:generate`
script (`dbsync` only applies). Convention: hand-author DDL matching the schema file, add the
journal entry, run `yarn dbsync`.

### 6. `entity_type`/`status` use `text({ enum: [...] })` + explicit `CHECK`, not `pgEnum()`

`drizzleUtil.ts` documents a project-wide convention against `pgEnum()` (broken Postgres enum
support in Drizzle). But plain `text({ enum })` alone (as `noticesTable.audience` uses it)
generates no CHECK constraint — insufficient here, since the roadmap's test tier requires an
invalid value to be rejected at insert time, not just by the TS type checker. Resolution:
`text({ enum })` for the TS type, paired with an explicit `check()` per enum column (matching
`eventCausalityTable.ts`'s working `check()` precedent) for real DB-level rejection. `check()`
references bare column names, not `sql\`${table.col}\``, matching that same precedent.

`status`'s `.default("DRAFT")` is a DB-level convenience for direct-insert paths (tests, future
migration scripts) — Phase 3a's entity layer remains the sole authority on initial state and
will always supply it explicitly.

### 7. `workflow_history`'s timestamp field is named `occurredAt` / `occurred_at`

The roadmap lists it as `timestamp`, which would shadow this file's own `timestamp()` import
from `drizzle-orm/pg-core`. `occurredAt` matches this schema's existing `<verb>At` convention
(`createdAt`, `validatedAt`, etc.). Purpose unchanged: records when the transition happened.

### 8. FK columns to `userTable`; cascade delete from `workflow_instance` to its children

All `*_user_id` columns are real `.references(() => userTable.id)` FKs (matches the precedent
in `entityValidationAssignmentTable.ts`). `acting_user_id`/`notified_user_id` are `.notNull()`
— every row either table receives today has a real user. The `workflow_instance` attribution
columns and `notified_by_user_id` are nullable (not every instance has reached every
transition; a notification's trigger may be a system process).

**Flagged now:** a `.notNull()` `acting_user_id` means no way to record a system-triggered
transition if one is ever needed — not anticipated through Phase 4, would become nullable then
if required.

`workflow_history.instance_id`/`workflow_notification.instance_id` cascade-delete with their
parent (matches `disasterEventDeclarationTable.ts`/`eventCausalityTable.ts`'s convention for
child rows with no independent lifecycle).

### 9. Every timestamp column is inline `{ withTimezone: true }` (ADR-002)

None of these three files use `createdUpdatedTimestamps` from `drizzleUtil.ts` — it declares
bare `timestamp()` with no timezone, which ADR-002 forbids for new tables.

### 10. `workflow_instance` gets symmetric attribution for all four transitions; `workflow_history` gets `comment` — corrections against the ER diagram

**Context:** the roadmap's original `2a` text mistranscribed the diagram — it added
`validated_by_user_id`/`published_by_user_id` (not in the diagram) while dropping
`submitted_at`/`approved_at` (which are) and `workflow_history.comment` entirely. Caught in
post-implementation review against the actual `.drawio`/`.png` source, not at proposal time.
`spec-writer`/`sdd-implementer` both faithfully implemented the roadmap text as written — the
gap originated in how that text was authored.

**Decided, with the user's explicit sign-off:**

- `workflow_instance` gets all four transitions symmetric (`submitted`/`validated`/`approved`/
  `published`, each with `_by_user_id` + `_at`). The diagram itself only has the four `_at`
  timestamps with no attribution columns. Keeping/adding the `_by_user_id` pairs is a
  deliberate deviation beyond the diagram: avoids a join to `workflow_history` for a read every
  consumer wants often.
- `workflow_history` gets a nullable `comment` column — present in the diagram, missed in the
  first pass. A straightforward fix, not a deviation.

### 11. `workflow_notification` renamed to match the diagram; two columns added; `channel` kept; `notifiedAt` has no DB default

`recipientUserId`/`sentAt` renamed to `notifiedUserId`/`notifiedAt` to match the diagram
exactly. `notifiedByUserId` (nullable) and `notificationMessage` (nullable) added — both were
missing from the original implementation.

`channel` is not in the diagram — confirmed with the user as a deliberate keep. Left as
unconstrained text (not an enum) since the actual delivery mechanism is Phase 4a's
`INotificationPort` decision, not this schema's.

**`notifiedAt` is nullable with no DB default**, despite the diagram's `default now()`
annotation — kept to preserve the already-approved "delivery still pending" spec scenario,
which requires an explicit-null insert to stay `null`. Adding the literal default would
silently break that scenario as a side effect of the field-list fix; a future reader wanting
the diagram's literal behavior would need a separate, explicit decision.

## Risks / Trade-offs

- **No `countryAccountsId` on `workflow_instance`** → by design (Decision 2); a real, accepted
  limit. Same class of untenanted-join bug Phase 0 found in `event_causality` (0f) and HE's
  Geographic-level linking (0d). Must be enforced procedurally by Phase 3a/4a's
  `IWorkflowRepository`; this schema only documents the omission.

- **PGlite test harness doesn't execute the hand-authored `.sql` migration** → same limitation
  already accepted for Notices. The migration SQL must be transcribed directly from the schema
  file (not independently re-derived) and reviewed side-by-side with it.

- **`UNIQUE(entity_id, entity_type)` (Decision 4) wasn't asked for by the roadmap's 2a text** →
  flagged explicitly for human review; justified against 3a/4b's already-planned contracts. No
  code depends on it yet, so it's cheap to remove if a reviewer disagrees.

- **Table files outside `app/drizzle/schema/` (Decision 3)** → nothing in this repo currently
  scans that directory programmatically, so accepted. The glob can be extended later without
  moving these files if that changes.

- **`testSchema/` re-exports reach directly into `infrastructure/`** — the first case of code
  outside a domain module importing from that module's own `infrastructure/` rather than its
  application-layer interface. Accepted as test-harness plumbing, the same narrow exception a
  composition root gets for DI wiring (e.g. Phase 5's `ValidationWorkflowModule`). Every other
  domain's `testSchema` re-export points at the shared `app/drizzle/schema/` instead — this
  shape is unique to `validation-workflow`, a direct consequence of Decision 3.

- **[Process gap, closed for this change] Field lists were transcribed inaccurately from the ER
  diagram into the roadmap's `2a` text**, and this proposal initially inherited that inaccuracy
  → found in post-implementation review, corrected via Decisions 10/11 with the user's sign-off
  per field. `2c`/`2e`/`2f`/`2h` and `hazardous_event`'s own new columns had the same root
  cause and are corrected directly in the roadmap (no implementation yet to fix). Lesson: verify
  field-level schema details against the diagram source directly, not the roadmap's prose.

## Migration Plan

Purely additive — three new tables, nothing existing touched. Apply via `yarn dbsync`;
rollback is `DROP TABLE` in child-then-parent order (`workflow_notification`,
`workflow_history`, `workflow_instance`) since nothing yet writes to them. No feature flag
needed — inert until Phase 3a/4a's repository/use-case layer exists.
