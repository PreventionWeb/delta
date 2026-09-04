## Why

The target HE schema (ER diagram, "HIPs Management" section) replaces today's flat
`hip_hazard`/`hip_cluster`/`hip_class` shape with a versioned 4-level chain:
`specific_hazard → hazard_cluster → hazard_type → hips_version`. `hazardous_event` will
later (`2i`) collapse its three independent FK columns down to one `specific_hazard_id`,
deriving cluster/type through the chain. This intent lays the new tables only — no
existing table is touched.

## What Changes

- Add 4 new Drizzle tables, uuid-keyed, chained by FK: `specific_hazard` → `hazard_cluster`
  → `hazard_type` → `hips_version`.
- Register a hand-authored migration and `_journal.json` entry (repo convention since
  `2a`, not `drizzle-kit generate`).
- Today's `hip_hazard`/`hip_cluster`/`hip_class` tables and their 34 existing consumers
  are untouched — this is purely additive.

## Capabilities

### New Capabilities

- `hip-hierarchy-schema`: persisted shape and FK constraints of the
  `specific_hazard → hazard_cluster → hazard_type → hips_version` chain.

### Modified Capabilities

None.

## Impact

- **Files**: 4 new schema files under `app/domains/hazardous-events/infrastructure/`
  (see design.md Decision 7), 1 migration file, plus the PGlite test barrel
  (`tests/integration/db/testSchema/index.ts`) — not the shared `app/drizzle/schema/`
  barrel, matching `2a`'s domain-owned pattern.
- **DB migration**: required (`yarn dbsync`), additive only (`CREATE TABLE`).
- **Test approach**: PGlite (`yarn test:run2`) covers schema shape, not-null, and FK
  rejection (an orphaned `specific_hazard` is rejected) — it builds the test DB via
  `pushSchema` off the testSchema barrel, not the migration file. The hand-authored
  migration itself is verified separately, by running `yarn dbsync` against a real local
  Postgres and inspecting `information_schema`/`pg_constraint`.
- **Multi-tenancy / auth**: none. These are global reference tables (no
  `country_accounts_id`), matching today's `hip_hazard`/`hip_cluster`/`hip_class` — no
  route, loader, or action touches them in this intent.
- **Existing code**: zero — no FK from old tables into the new ones, `hazardous_event`
  unchanged (that's `2i`).

## Decisions confirmed by user sign-off (see design.md Decisions 2-3)

The `.drawio` source had two field-level gaps the roadmap prose didn't mention — flagged
rather than guessed, confirmed with the user:

1. `hips_version.version_no` is `text` (no type was declared in the diagram).
2. `hazard_type`'s FK to `hips_version` is named `hips_version_id`, not the diagram's
   literal `hip_version_id` (a diagram typo, corrected for consistency).
