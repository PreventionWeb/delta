## Why

The target ER diagram (`tmp/hazardous-events-er-diagram/hazardous-events.drawio`, "hazardous
event causality" swimlane, cells `KqZPbQY2Lv0Ew4p42Cft-224..275`, verified directly against the
raw XML per this roadmap's own field-verification lesson) introduces a dedicated
`hazardous_event_causality` table (cause/effect pair + explanation) that replaces
`eventRelationshipTable` for HE's own causal chain. No such table exists in the schema today.
This intent adds it.

## What Changes

- Add `hazardous_event_causality` (`id`, `cause_hazardous_event_id`, `effect_hazardous_event_id`,
  `causality_explanation`, `created_at`, `updated_at`), matching the `.drawio` field list exactly.
- Both FKs (`cause_hazardous_event_id`, `effect_hazardous_event_id`) are not-null, cascade on
  delete, each individually indexed — following `eventCausalityTable`'s pattern (the closer
  causality-specific precedent), not `eventRelationshipTable`'s (no cascade, no index).
- Add `CHECK(cause_hazardous_event_id <> effect_hazardous_event_id)` — the DB-level,
  defense-in-depth half of the "no self-causing event" rule (roadmap Invariant 3); the general
  n-length cycle case stays app-layer, deferred to `3c` (roadmap's resolved open decision #7).
- Register a hand-authored migration + `_journal.json` entry (repo convention since `2a`).
- `eventRelationshipTable` (old) and `eventCausalityTable` (DE-side linking) are both untouched
  — no absorption, per this roadmap's own Non-Goals.
- No existing table, column, route, model, or `fieldsDef` is touched — purely additive.

## Capabilities

### New Capabilities

- `hazardous-event-causality-schema`: persisted shape and constraints of the
  `hazardous_event_causality` table — cause/effect FK pair into `hazardous_event`, the
  self-reference CHECK constraint, and cascade/index behaviour.

### Modified Capabilities

None.

## Impact

- **Files**:
  - `app/domains/hazardous-events/infrastructure/hazardousEventCausalityTable.ts` (new) — the
    table definition, with both FKs into the legacy `app/drizzle/schema/hazardousEventTable.ts`
    (see design.md Decision 6).
  - `app/drizzle/migrations/<timestamp>_add_hazardous_event_causality_table.sql` (new) —
    hand-authored migration, three top-level statements (`CREATE TABLE IF NOT EXISTS` with the
    CHECK inline, plus two `CREATE INDEX` statements — Postgres has no inline non-unique index
    syntax), each separated by `--> statement-breakpoint` per the `2c` migration-execution bug
    (see design.md Decision 9).
  - `app/drizzle/migrations/meta/_journal.json` (updated) — new migration entry.
  - `tests/integration/db/testSchema/hazardousEventCausalityTable.ts` (new) — barrel re-export.
  - `tests/integration/db/testSchema/index.ts` (updated) — export the new barrel file.
  - `tests/integration/db/queries/hazardousEventCausality.test.ts` (new) — PGlite tests.
- **DB migration**: required, `yarn dbsync`. Additive only (`CREATE TABLE` x1), no existing
  table altered, no data migration, no rollback data-loss risk.
- **Test approach**: PGlite (`yarn test:run2`) for schema shape, not-null, cascade, index, and
  CHECK constraint behaviour (including the negative case: a same-event insert must be rejected
  and a genuine n-length cycle must NOT be blocked at the DB level, since that stays app-layer).
  No real-DB (`test:run3`) or E2E coverage needed — pure schema, no route/model wiring.
- **Multi-tenancy / security**: no `country_accounts_id` on this table. Each FK independently
  resolves to a tenant via `hazardous_event.country_accounts_id`, but nothing requires
  `cause_hazardous_event_id` and `effect_hazardous_event_id` to belong to the _same_ tenant —
  deliberately, not by oversight. Real transboundary hazards (e.g. an upstream flood in one
  country causing a disaster in a neighbouring one) genuinely require cross-tenant causality
  links; this schema doesn't block that case. See design.md Decision 12 — the actual
  reliable/secure/on-demand cross-tenant sharing mechanism is a distinct, unsolved product
  question, out of scope for this schema-only intent. No route, loader, or action reads/writes
  this table in this intent, so no `authLoaderWithPerm`/`authActionWithPerm` wiring is needed yet.
- **Ownership note**: HE-exclusive, same treatment as `2d`. DE's own `eventCausalityTable` stays
  separate and untouched — no absorption, per this roadmap's own Non-Goals. Not flagged for
  future extraction.
