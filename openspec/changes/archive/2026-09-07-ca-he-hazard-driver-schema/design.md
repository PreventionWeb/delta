## Context

Target ER diagram (`tmp/hazardous-events-er-diagram/hazardous-events.drawio`, "Hazard
driver management" swimlane, cells `KqZPbQY2Lv0Ew4p42Cft-172..222`) introduces
`hazard_driver` and its join to `hazardous_event`. Verified field-by-field against the raw
XML per the roadmap's `2a` lesson — the PNG render at
`_docs/refactoring-plan/diagrams/hazardous-events-er-diagram.png` has produced
misreadings before and is not used here.

`2c` (`app/domains/hazardous-events/infrastructure/sourceCatalogTable.ts`, merged) is the
direct precedent for a single tenant-scoped reference table with the same hand-authored
migration convention. This intent additionally needs a join-table pattern, for which
`app/drizzle/schema/userCountryAccountsTable.ts` is the precedent (two not-null cascade
FKs, no tenant column of its own).

## Goals / Non-Goals

**Goals:** the `hazard_driver` and `hazardous_event_hazard_driver` tables, migrated via a
hand-authored SQL file, testable in PGlite.

**Non-Goals:** wiring either table into any route, model, or `fieldsDef` (no
presentation-layer impact — pure schema); any UI for assigning drivers to events (a later
Track B/Phase 3+ intent).

## Decisions

**1. Exact field list (from the `.drawio`, not the roadmap prose):**

| Table                           | Column                | Type / constraint                          |
| ------------------------------- | --------------------- | ------------------------------------------ |
| `hazard_driver`                 | `id`                  | uuid, PK                                   |
| `hazard_driver`                 | `name`                | text, not null                             |
| `hazard_driver`                 | `country_accounts_id` | uuid, not null, FK → `country_accounts.id` |
| `hazardous_event_hazard_driver` | `id`                  | uuid, PK                                   |
| `hazardous_event_hazard_driver` | `hazardous_event_id`  | uuid, not null, FK → `hazardous_event.id`  |
| `hazardous_event_hazard_driver` | `hazard_driver_id`    | uuid, not null, FK → `hazard_driver.id`    |

No timestamp columns exist in the diagram for either table.

**`createdAt`/`updatedAt` — deliberate addition, confirmed by user.** Standard audit
columns on both tables, declared inline as `timestamp(..., { withTimezone: true })` per
ADR-002 — no `createdUpdatedTimestamps` helper. Matches `noticesTable.ts`'s pattern, the
established convention from `2a`/`2b`/`2c`.

**2. `hazard_driver.country_accounts_id` — cascade delete, matches `noticesTable.ts`.**
Declared `.notNull().references(() => countryAccountsTable.id, { onDelete: "cascade" })`.
Dominant convention across 9 of 11 tenant-scoped tables in this schema — see `2c`'s
archived design.md Decision 2 for the full reasoning; applied here without re-derivation.

**3. `hazardous_event_hazard_driver`'s two FKs both cascade — matches
`userCountryAccountsTable.ts`.** Both `hazardous_event_id` and `hazard_driver_id` are
`.notNull().references(..., { onDelete: "cascade" })`, the existing two-parent join-table
pattern in this codebase (both FKs cascade, not just one). No `country_accounts_id` on
this table — tenant scoping is inherited via `hazardous_event_id` →
`hazardous_event.country_accounts_id`.

**3a. `UNIQUE(hazardous_event_id, hazard_driver_id)` + indexes on both FKs — added after
code review.** `userCountryAccountsTable.ts` (Decision 3's precedent) carries extra
business columns and isn't a pure join table, so it wasn't checked for uniqueness/index
behavior. The closer analog is `disasterEventAssessmentSectorTable.ts` — a pure two-FK
join table — which has both a composite `unique()` on its two FK columns and an `index()`
on each individually. Without these, the same event/driver pair could be inserted
unboundedly, and cascade deletes against either parent would seq-scan the join table.
Added `unique("hazardous_event_hazard_driver_event_id_driver_id_unique")` plus
`index()` on each FK column, matching that precedent. Also added
`index("hazard_driver_country_accounts_id_idx")` on `hazard_driver` — `source_catalog`
got an equivalent index for free via its own composite unique index; `hazard_driver`
deliberately has no uniqueness constraint (see the Risks entry below) but shouldn't lose
the index as an uncommented side effect of that.

**4. Schema location: `app/domains/hazardous-events/infrastructure/`, not
`app/drizzle/schema/` — per ADR-009.** Every new Track B table lives in HE's own
`infrastructure/` for now — same reasoning as `2b`/`2c` (see `2b`'s archived design.md
Decision 7, `2c`'s Decision 3). Not added to `app/drizzle/schema/index.ts`; only the
PGlite `testSchema` barrel gets entries.

**5. HE-exclusive — no extraction flag, unlike `2b`/`2c`.** Repo-wide grep confirms no
"driver" concept exists anywhere else in the schema (`hazard_driver`/
`hazardous_event_hazard_driver` are new business capabilities, not a reconciliation
against shared data). Unlike `2b`'s HIP hierarchy or `2c`'s source catalog — both flagged
as shared with Disaster Event/Disaster Records — this data is a permanent HE-owned
addition. No "flagged for extraction" note applies here.

**6. One cross-package FK: `hazardous_event_hazard_driver.hazardous_event_id` →
legacy `hazardousEventTable`.** This is the one FK in this change that reaches outside the
domain's own `infrastructure/` folder, into
`app/drizzle/schema/hazardousEventTable.ts` (not yet CA-migrated). This is a necessary,
narrow exception — the same category as any new CA-owned table that must reference a
still-legacy table — not a precedent for routinely reaching into `app/drizzle/schema/`
from `infrastructure/`.

**7. No enum, no `check()` constraint.** Neither table has an enumerated column in the
diagram.

**8. Migration is hand-authored SQL** (not `drizzle-kit generate`), registered as a new
entry in `app/drizzle/migrations/meta/_journal.json` — `2a`/`2b`/`2c`'s convention.
**Critical:** the two `CREATE TABLE` statements MUST be separated by
`--> statement-breakpoint`, or `yarn dbsync` can silently report success without
executing both statements — the exact bug found and fixed during `2c` (see its archived
design.md/tasks.md). `hazard_driver` is created before
`hazardous_event_hazard_driver`, since the latter's FK depends on the former existing.

**9. Test schema barrel — re-export, not duplicate.** Following `2a`/`2b`/`2c`'s pattern:
`tests/integration/db/testSchema/hazardDriverTable.ts` and
`tests/integration/db/testSchema/hazardousEventHazardDriverTable.ts` each `export *
from "~/domains/hazardous-events/infrastructure/..."`, avoiding drift between the real
and test schema. `hazardousEventTable` is already present in the test schema barrel
(`tests/integration/db/testSchema/hazardousEventTable.ts`), so no new barrel entry is
needed for the cross-package FK's target.

## Risks / Trade-offs

- [Cascade delete on `hazard_driver.country_accounts_id` (Decision 2) means deleting a
  country account silently deletes all its hazard-driver rows, and transitively all
  `hazardous_event_hazard_driver` rows referencing them] → matches the dominant,
  user-confirmed convention; acceptable because nothing else references either table yet.
- [Cross-package FK from a new `infrastructure/` table into legacy
  `app/drizzle/schema/hazardousEventTable.ts` (Decision 6)] → explicitly flagged here and
  in proposal.md as a narrow, necessary exception, not a precedent.
- [No uniqueness constraint on `hazard_driver(country_accounts_id, name)`, unlike `2c`'s
  `source_catalog`] → deliberate: unlike `source_catalog` (which explicitly replaces
  free-text columns and exists to prevent duplicate catalog entries), the diagram gives
  no signal that duplicate driver names within a tenant are meaningfully wrong, and no
  consumer exists yet to make that call. Revisit if/when a driver-management UI surfaces
  real duplication problems — decide with product input then, not speculation now.

## Migration Plan

Additive only — two `CREATE TABLE IF NOT EXISTS` statements, no existing table altered,
no rollback data-loss risk. `yarn dbsync` applies; a straight `DROP TABLE` migration
(dropping the join table before the reference table) would fully revert if needed —
nothing references either table today.
