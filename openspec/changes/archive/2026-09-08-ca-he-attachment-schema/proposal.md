## Why

`hazardous_event` stores attachments in a single `attachments` jsonb column, actively read and
written by `processAndSaveAttachments` (via `hazardousEventCreate`/`Update`, exercised in
`tests/integration/db/models/hazardousEventAttachmentsHipSpatial.test.ts`). Disaster Events (DE)
already replaced this shape with normalized attachment tables for its own sub-entities. This
intent adds the equivalent normalized table for Hazardous Events (Section F of the ER diagram),
matching DE's newer attachment-table pattern. The jsonb column stays untouched until Phase 7's
cutover — this intent is purely additive.

## What Changes

- Add `hazardous_event_attachment`: `id` (uuid PK), `hazardous_event_id` (uuid FK, cascade
  delete), `title`, `file_key`, `file_name`, `file_type` (all text, not null), `file_size`
  (bigint, not null), `created_at`/`updated_at` (timestamptz, both not null, both defaulting to
  `CURRENT_TIMESTAMP` — a deliberate correction over DE's own nullable `updated_at`; see
  design.md Decision 2).
- Add an `index()` on `hazardous_event_id` — matches DE's newer attachment-table precedent and
  this series' established indexing convention.
- No uniqueness constraint — multiple attachments per event is the intended shape.
- Generate and apply a hand-authored migration via `yarn dbsync`.

No route, model, handler, or `fieldsDef` changes — pure schema addition, same scope as `2b`-`2f`.
The existing `attachments` jsonb column on `hazardous_event` is not touched, removed, or migrated
into this table — that is Phase 7's job.

## Capabilities

### New Capabilities

- `hazardous-event-attachment-schema`: the normalized attachment data model for hazardous
  events — table shape, constraints, cascade behavior, and indexing.

### Modified Capabilities

None. `hazardous_event.attachments` (jsonb) is unmodified — no delta spec against it.

## Impact

**Files:**

- `app/domains/hazardous-events/infrastructure/hazardousEventAttachmentTable.ts` (new)
- `app/drizzle/migrations/20260907160000_add_hazardous_event_attachment_table.sql` (new,
  hand-authored)
- `app/drizzle/migrations/meta/_journal.json` (new entry, idx 52)
- `tests/integration/db/testSchema/hazardousEventAttachmentTable.ts` (new, re-export)
- `tests/integration/db/testSchema/index.ts` (add one barrel export)
- `tests/integration/db/queries/hazardousEventAttachment.test.ts` (new)

**DB migration required:** yes — one `CREATE TABLE` statement plus one `CREATE INDEX` statement,
applied via `yarn dbsync` (never `drizzle-kit push`).

**Test approach:** PGlite (`yarn test:run2`) — schema/constraint verification only, no route or
domain logic involved.

**Multi-tenancy:** no `country_accounts_id` column on the new table — tenant scoping is
inherited transitively via `hazardous_event_id` → `hazardous_event.country_accounts_id`, same
pattern as the existing `hazardous_event_geom`/`hazardous_event_division`/spatial-observation
tables.

**Security:** none directly — pure schema, no route/auth surface touched. One cross-package FK
(into legacy `hazardousEventTable`) is flagged in design.md as a narrow, necessary exception, not
a new access path. The existing jsonb `attachments` column and its read/write path
(`processAndSaveAttachments`) are unaffected — no data migration in this intent.
