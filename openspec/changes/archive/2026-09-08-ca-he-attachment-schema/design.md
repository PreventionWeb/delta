## Context

Target ER diagram (`tmp/hazardous-events-er-diagram/hazardous-events.drawio`, "Hazardous event
attachments management" swimlane, cells `KqZPbQY2Lv0Ew4p42Cft-352` through `-378`). Verified
field-by-field against the raw XML, not the PNG render or the roadmap prose — already confirmed
with the user; not re-derived below.

DE has four existing attachment tables, split into two generations:

- `app/drizzle/schema/disasterEventAttachmentTable.ts` (oldest, legacy/pre-CA): no `title`
  column; NOT NULL columns declared with `DEFAULT ""`/`DEFAULT 0`; `timestamp(..., { mode:
"date" })` with no `withTimezone`; no index. **Not followed.**
- `disasterEventAssessmentAttachmentTable.ts` / `disasterEventDeclarationAttachmentTable.ts` /
  `disasterEventResponseAttachmentTable.ts` (newer, byte-for-byte identical to each other): `id`
  via `ourRandomUUID()`; `<parent>Id` uuid not null FK cascade; `title`/`fileKey`/`fileName`/
  `fileType`/`fileSize` all not null; `createdAt` timestamptz not null default
  `CURRENT_TIMESTAMP`; an index on the parent FK. **This is the precedent followed here**, with
  one correction (Decision 2).

`2d` (`hazardDriverTable.ts`) and `2f` (`hazardousEventSpatialObservation*Table.ts`) are the
direct precedents for this intent's hand-authored migration structure, `infrastructure/`
placement, and index-everything convention.

## Goals / Non-Goals

**Goals:** the `hazardous_event_attachment` table, migrated via a hand-authored SQL file,
testable in PGlite; FK column indexed; shape matched to DE's newer attachment-table pattern with
one confirmed correction.

**Non-Goals:** modifying, migrating data into, or deprecating `hazardous_event.attachments`
(jsonb) — it stays untouched, read and written by `processAndSaveAttachments`, exercised by
`tests/integration/db/models/hazardousEventAttachmentsHipSpatial.test.ts`; that cutover is
Phase 7's job. No polymorphic/multi-stage attachment table design (a single table with a
stage/type discriminator covering Assessment/Declaration/Response-equivalent concepts) — out of
scope for this intent (HE has no such sub-entities in Phase 2's schema) and separately recorded
as a future consideration for DE's own eventual CA migration, not this one. No route, model,
handler, or `fieldsDef` changes.

## Decisions

**1. Exact field list (from the `.drawio`, not the roadmap prose — already confirmed with the
user):**

| Column               | Type / constraint                           |
| -------------------- | ------------------------------------------- |
| `id`                 | uuid, PK, `gen_random_uuid()`-style default |
| `hazardous_event_id` | uuid, FK → `hazardous_event.id`             |
| `title`              | text, not null                              |
| `file_key`           | text, not null                              |
| `file_name`          | text, not null                              |
| `file_type`          | text, not null                              |
| `file_size`          | bigint, not null                            |
| `created_at`         | timestamptz, diagram shows `DEFAULT now()`  |
| `updated_at`         | timestamptz, no default shown in diagram    |

No explicit NN badge is shown on `hazardous_event_id` in the diagram, but per every prior intent
in this series the diagram's FK/NN badges never co-occur on any row — this is not evidence of
nullability either way. Decision 3 resolves it to not-null, matching every other table's FK to
its own parent across `2a`-`2f`.

**2. `updated_at` declared `.notNull().default(sql\`CURRENT_TIMESTAMP\`)` — a deliberate
correction over the newer DE precedent, not an inheritance of it.** All three newer DE tables
declare `updatedAt` as `timestamp("updated_at", { withTimezone: true })` with **no** `.notNull()`
and **no default** — nullable, asymmetric with their own `createdAt` on the same table. Confirmed
with the user this is a legacy oversight in DE's own pre-CA code (DE has not yet been migrated to
Clean Architecture), not a deliberate design choice worth inheriting. This table instead follows
the symmetric-timestamps convention already established across every table in `2a`-`2f`:
`createdAt`/`updatedAt` both timestamptz not null, both defaulting to `CURRENT_TIMESTAMP`, per
ADR-002 (`{ withTimezone: true }` inline — never `createdUpdatedTimestamps`).

**3. `hazardous_event_id` FK: `.notNull().references(() => hazardousEventTable.id, { onDelete:
"cascade" })`.** Matches all three newer DE attachment tables' treatment of their own parent FK,
and the established convention across `2a`-`2f`. No `AnyPgColumn` return-type annotation — that
annotation is only needed for circular/self-references (see `hazardousEventTable.id`'s own
self-referencing use in `eventTable`); a plain arrow function suffices here, matching `2a`-`2f`'s
own FK declarations, not DE's `(): AnyPgColumn =>` form.

**4. Index on `hazardous_event_id`: `index("hazardous_event_attachment_hazardous_event_id_idx")`.**
Matches the newer DE precedent (which, unlike the legacy table and unlike
`hazardousEventGeomTable`/`hazardousEventDivisionTable`, already includes an index) and this
project's own now-established indexing convention. Postgres does not auto-index FK columns;
without this, a cascade delete against `hazardous_event` would seq-scan this table.

**5. No uniqueness constraint.** Multiple attachments per event is the obvious intent (an event
can have many attached files) — nothing in the diagram or DE's precedent suggests otherwise.

**6. No enum, no `check()` constraint.** The diagram shows no enumerated column on this table.

**7. Schema location: `app/domains/hazardous-events/infrastructure/`, not
`app/drizzle/schema/` — per ADR-009.** Same reasoning as `2b`-`2f` (see `2b`'s archived
design.md Decision 7). Not added to `app/drizzle/schema/index.ts`; only the PGlite `testSchema`
barrel gets an entry.

**8. HE-exclusive — no extraction flag, same treatment as `2d`-`2f`.** DE already has its own
separate attachment tables (four of them) — this is a permanent, parallel-but-separate
HE-owned addition, not a reconciliation against shared data.

**9. One cross-package FK: `hazardous_event_attachment.hazardous_event_id` → legacy
`app/drizzle/schema/hazardousEventTable.ts`.** Same category of narrow, necessary exception as
`2d`'s Decision 6, `2f`'s Decision 10 — the table being referenced hasn't been CA-migrated yet.
`tests/integration/db/testSchema/hazardousEventTable.ts` already exists — no new barrel entry
needed for this FK target.

**10. Migration is hand-authored SQL** (not `drizzle-kit generate`), registered as a new entry in
`app/drizzle/migrations/meta/_journal.json` at `idx` 52, following
`20260907150000_add_hazardous_event_spatial_observation_tables` at `idx` 51. **Two top-level
statements**: one `CREATE TABLE IF NOT EXISTS hazardous_event_attachment`, one
`CREATE INDEX` — Postgres has no inline syntax for a plain non-unique index inside `CREATE
TABLE`, unlike `UNIQUE`/`PRIMARY KEY`, so this cannot be a single statement (the same structural
shape hit in `2c`, `2e`, `2f`). The two statements MUST be separated by their own
`--> statement-breakpoint` comment line, or `yarn dbsync` can silently report success without
executing both — the `2c` migration-execution bug (see its archived design.md/tasks.md).

**11. Identifier length check (the `2f` risk) — both clear the 63-byte limit, no shortening
needed:** `hazardous_event_attachment_hazardous_event_id_idx` (49 bytes),
`hazardous_event_attachment_hazardous_event_id_fk` (48 bytes). Unlike `2f`'s division join
table, the full `<table>_<column>_<kind>` convention is used as-is here.

**12. Test schema barrel — re-export, not duplicate.** Following `2a`-`2f`'s pattern:
`tests/integration/db/testSchema/hazardousEventAttachmentTable.ts` does `export * from
"~/domains/hazardous-events/infrastructure/hazardousEventAttachmentTable"`, added to
`tests/integration/db/testSchema/index.ts`. No new barrel entry needed for the
`hazardousEventTable` FK target (Decision 9).

## Risks / Trade-offs

- [Cascade delete on `hazardous_event_id`] → matches DE's own precedent and the established
  convention across `2a`-`2f`; acceptable because nothing else references this new table yet.
- [Deviating from DE's own nullable `updated_at` (Decision 2)] → deliberate, user-confirmed
  correction, not a design disagreement with DE per se — DE's own column shape predates its CA
  migration and is not automatically authoritative; documented here so a future reader comparing
  this table against DE's isn't surprised by the asymmetry in the other direction (DE nullable,
  this table not).
- [Cross-package FK from a new `infrastructure/` table into legacy
  `app/drizzle/schema/hazardousEventTable.ts` (Decision 9)] → same narrow, necessary exception
  category as `2d`/`2f`; not a precedent for routinely reaching into legacy tables from
  `infrastructure/`.
- [`file_size` as bigint rather than integer] → matches DE's precedent exactly; file sizes can
  exceed the int4 range (2,147,483,647 bytes ≈ 2GB) for large attachments; spec.md includes a
  scenario asserting a value above that range round-trips intact — the only scenario that
  actually distinguishes `bigint` from `integer`.
- [No uniqueness constraint (Decision 5)] → intentional; nothing prevents duplicate
  title/file_key rows for the same event, matching DE's own precedent (which has none either).

## Migration Plan

Additive only — one `CREATE TABLE IF NOT EXISTS` statement plus one `CREATE INDEX` statement
(Decision 10), no existing table altered, no data migration, no rollback data-loss risk. `yarn
dbsync` applies; a straight `DROP TABLE` migration would fully revert if needed — nothing
references this table today, and `hazardous_event.attachments` (jsonb) remains the live column.
