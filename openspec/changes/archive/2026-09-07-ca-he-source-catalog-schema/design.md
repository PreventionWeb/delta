## Context

Today's `data_source`/`primary_data_source`/`other_data_source` columns (free text) live
on `hazardousEventTable.ts`, `disasterEventTable.ts`, `disasterRecordsTable.ts` — see
proposal.md. The target ER diagram
(`tmp/hazardous-events-er-diagram/hazardous-events.drawio`, "Source Catalog Management"
swimlane, cells `KqZPbQY2Lv0Ew4p42Cft-153..167`) replaces this with a single tenant-scoped
`source_catalog` reference table. Verified field-by-field against the raw XML per the
roadmap's `2a` lesson (paraphrased summaries have previously dropped/added fields).

`2b` (`app/domains/hazardous-events/infrastructure/specificHazardTable.ts` etc., merged)
set the current repo convention for a hand-authored migration and is the pattern this
intent follows.

## Goals / Non-Goals

**Goals:** the `source_catalog` table, tenant-scoped, migrated via a hand-authored SQL
file, testable in PGlite.

**Non-Goals:** touching `data_source`/`primary_data_source`/`other_data_source` or any of
their existing consumers on `hazardous_event`/`disaster_event`/`disaster_records`
(Phase 7); wiring this table into any route, model, or `fieldsDef` (no
presentation-layer impact — pure schema).

## Decisions

**1. Exact field list (from the `.drawio`, not the roadmap prose):**

| Column                | Type / constraint                          |
| --------------------- | ------------------------------------------ |
| `id`                  | uuid, PK                                   |
| `name`                | text, not null                             |
| `country_accounts_id` | uuid, not null, FK → `country_accounts.id` |

No timestamp columns exist in the diagram for this table.

**`createdAt`/`updatedAt` — deliberate addition, confirmed by user.** Standard audit
columns, declared inline as `timestamp(..., { withTimezone: true })` per ADR-002 — no
`createdUpdatedTimestamps` helper (that helper predates ADR-002 and omits
`withTimezone`). Matches `noticesTable.ts`'s exact pattern, the established convention
from `2a`/`2b`.

**2. `country_accounts_id` — cascade delete, matches `noticesTable.ts`.** Declared
`.notNull().references(() => countryAccountsTable.id, { onDelete: "cascade" })`. This is
the dominant convention across 9 of 11 tenant-scoped tables in this schema.
`hazardousEventTable.ts`'s lack of cascade is legacy debt in that one table, not a
precedent — confirmed by user, not re-derived here.

**3. Schema location: `app/domains/hazardous-events/infrastructure/`, not
`app/drizzle/schema/` — per ADR-009, same reasoning as `2b` (see its archived design.md
Decision 7).** Every new Track B table lives in HE's own `infrastructure/` for now, since
HE is the only CA-migrated domain today. Consequently this table is **not** added to
`app/drizzle/schema/index.ts` — confirmed against `2b`'s actual final state (its
post-review correction, archived tasks.md 8.2, removed those exports after the schema
move); only the PGlite `testSchema` barrel gets an entry, matching how `hazardClusterTable`/
`specificHazardTable`/`hipsVersionTable` are wired today.

**4. Genuinely shared data, kept in HE's `infrastructure/` for now — documented, not
silently omitted.** `data_source`/`primary_data_source`/`other_data_source` exist on
`hazardousEventTable`, `disasterEventTable`, AND `disasterRecordsTable` — this table is
not HE-exclusive, the same situation as `2b`'s HIP hierarchy tables. Per the user's
standing call: keep it in HE's own `infrastructure/` for now (no second CA-migrated
domain exists yet), flagged for extraction to `app/shared/`/`app/infrastructure/` once
Disaster Events gets its own CA migration.

**5. No enum, no `check()` constraint.** `name` is free text with no enumerated set in
the diagram — nothing for `text({ enum: [...] })`/`check()` to express.

**6. Migration is hand-authored SQL** (not `drizzle-kit generate`), registered as a new
entry in `app/drizzle/migrations/meta/_journal.json` — `2a`/`2b`'s convention
(`20260904120000_add_hip_hierarchy_tables.sql` is the most recent precedent).

**7. Test schema barrel — re-export, not duplicate.** Following `2a`/`2b`'s pattern:
`tests/integration/db/testSchema/sourceCatalogTable.ts` is `export * from
"~/domains/hazardous-events/infrastructure/sourceCatalogTable"`, avoiding drift between
the real and test schema.

**8. `UNIQUE(country_accounts_id, name)` — added after code review.** Not in the
diagram, but required: this table exists specifically to replace free-text source
columns with a controlled catalog, so unconstrained per-tenant duplicates would defeat
that purpose. Enforced via `uniqueIndex("source_catalog_country_accounts_id_name_unique")`.
Cross-tenant duplicates remain allowed (each tenant's catalog is independent).

## Risks / Trade-offs

- [Cascade delete on `country_accounts_id` (Decision 2) means deleting a country account
  silently deletes all its source-catalog rows] → matches the dominant, user-confirmed
  convention; acceptable because nothing references this table yet (no data-loss blast
  radius beyond the table itself).
- [Table sits in HE's `infrastructure/` despite being genuinely shared (Decision 4)] →
  explicitly flagged here and in proposal.md, same treatment as `2b`; not a silent gap.
- [Open design question, not settled here] No global/shared tier exists for genuinely
  common source names (e.g. "Satellite Imagery," "News Media") — every row is
  tenant-scoped, unlike `2h`'s explicit global-vs-tenant-custom split for
  `hazard_type_field_definition`. Deliberately deferred: this table has zero consumers in
  `2c`, so the cost of being wrong is zero today. Revisit once Phase 3/4 builds the actual
  source-entry UI and real usage patterns show whether tenants duplicate identical source
  names — decide with product input then, not speculation now.

## Migration Plan

Additive only — `CREATE TABLE IF NOT EXISTS source_catalog`, no existing table touched,
no rollback data-loss risk. `yarn dbsync` applies; a straight `DROP TABLE` migration
would fully revert if needed (nothing references this table yet).
