## Context

Target ER diagram (`tmp/hazardous-events-er-diagram/hazardous-events.drawio`, "Spatial Data"
swimlane). Verified field-by-field against the raw XML per the roadmap's `2a` lesson — the PNG
render at `_docs/refactoring-plan/diagrams/hazardous-events-er-diagram.png` has produced
misreadings before and is not used here. Already confirmed with the user; not re-derived below.

Two existing tables compete as precedent for shape, and both are the tables this intent's model
supersedes (not replaces — both stay untouched):

- `app/drizzle/schema/hazardousEventGeomTable.ts` — `hazardousEventId` FK cascades; `geom` via a
  `customType<{ data: unknown }>({ dataType: () => "geometry(Geometry,4326)" })` helper, not null,
  `$type<unknown>()`; `title` nullable text. No indexes, no timestamps.
- `app/drizzle/schema/hazardousEventDivisionTable.ts` — `hazardousEventId` FK cascades;
  `divisionId` FK does NOT cascade (references stable reference data in `divisionTable.ts`, no
  `onDelete`, default RESTRICT); `UNIQUE(hazardousEventId, divisionId)`. No indexes, no timestamps.

`2d` (`hazardDriverTable.ts`/`hazardousEventHazardDriverTable.ts`) and `2e`
(`hazardousEventCausalityTable.ts`) are the direct precedents for this intent's hand-authored
migration structure, `infrastructure/` placement, and index-everything convention (`2d`'s
post-review correction, tasks.md 7.1-7.2).

## Goals / Non-Goals

**Goals:** the three spatial-observation tables, migrated via a hand-authored SQL file, testable
in PGlite; every FK column indexed; cascade behavior matched per-column to the closer legacy
precedent (geom-child vs. division-child).

**Non-Goals:** modifying, migrating data into, or deprecating `hazardous_event_geom` /
`hazardous_event_division` (both stay untouched — a later Track B/Phase 3+ intent handles any
cutover); wiring any of the three tables into a route, model, or `fieldsDef` (pure schema); any
domain-layer duplicate-timestamp conflict logic (that's `3d`/`5e`'s job — this intent adds only
the DB-level `UNIQUE` half, per Decision 4).

## Decisions

**1. Exact field list (from the `.drawio`, not the roadmap prose — already confirmed with the
user):**

| Table                                          | Column                                   | Type / constraint                                   |
| ---------------------------------------------- | ---------------------------------------- | --------------------------------------------------- |
| `hazardous_event_spatial_observation`          | `id`                                     | uuid, PK, `gen_random_uuid()`-style default         |
| `hazardous_event_spatial_observation`          | `hazardous_event_id`                     | uuid, FK → `hazardous_event.id`                     |
| `hazardous_event_spatial_observation`          | `observation_time`                       | timestamptz                                         |
| `hazardous_event_spatial_observation`          | `note`                                   | text, nullable                                      |
| `hazardous_event_spatial_observation`          | `created_at`                             | timestamptz, diagram shows `DEFAULT now()`          |
| `hazardous_event_spatial_observation`          | `updated_at`                             | timestamptz, no default shown in diagram            |
| `hazardous_event_spatial_observation_division` | `id`                                     | uuid, PK                                            |
| `hazardous_event_spatial_observation_division` | `hazardous_event_spatial_observation_id` | uuid, FK → `hazardous_event_spatial_observation.id` |
| `hazardous_event_spatial_observation_division` | `division_id`                            | uuid, FK → `division.id`                            |
| `hazardous_event_spatial_observation_geom`     | `id`                                     | uuid, PK                                            |
| `hazardous_event_spatial_observation_geom`     | `hazardous_event_spatial_observation_id` | uuid, FK → `hazardous_event_spatial_observation.id` |
| `hazardous_event_spatial_observation_geom`     | `geom`                                   | `geometry(Geometry,4326)`, not null                 |
| `hazardous_event_spatial_observation_geom`     | `title`                                  | text, nullable                                      |

The division join table's diagram `UQ` annotation literally reads `(hazardous_event_spatial_observation_id,
admin_area_id)` — `admin_area_id` is a confirmed stale label (the roadmap's own text already flags
this); the real column is `division_id`. No timestamp columns are shown in the diagram for either
child table.

**2. `createdAt`/`updatedAt` added to ALL THREE tables, symmetrically — matches `2a`-`2e`'s
convention.** Declared inline as `timestamp(..., { withTimezone: true })` per ADR-002, both
`.notNull()`, defaulting via the `sql` tagged template to `CURRENT_TIMESTAMP` — no
`createdUpdatedTimestamps` helper.

Applied symmetrically to both child tables (the diagram shows no timestamp columns on either)
and to the parent's `updated_at` (the diagram shows no default there, only on `created_at`) —
same reasoning as `2e`'s Decision 2: an unexplained asymmetry would be a special case with no
functional benefit.

**3. Cascade behavior — matched per-column to the closer legacy precedent, not a single blanket
rule:**

- `hazardous_event_spatial_observation.hazardous_event_id` — `.notNull().references(() =>
hazardousEventTable.id, { onDelete: "cascade" })`. Matches both legacy tables' treatment of this
  same FK.
- `hazardous_event_spatial_observation_division.hazardous_event_spatial_observation_id` and
  `hazardous_event_spatial_observation_geom.hazardous_event_spatial_observation_id` — both
  `.notNull().references(..., { onDelete: "cascade" })`. Child-of-new-parent, same treatment as
  `hazardous_event_geom`/`hazardous_event_division`'s existing FK to `hazardous_event`.
- `hazardous_event_spatial_observation_division.division_id` — `.notNull().references(() =>
divisionTable.id)`, **no `onDelete`** (default RESTRICT). Matches `hazardousEventDivisionTable`'s
  existing, deliberate precedent exactly: `division` is stable reference data, not owned by this
  intent's cascade chain.

Without cascade on the two `hazardous_event_spatial_observation_id` FKs, deleting an observation
row would raise an FK violation instead of cleanly removing its division/geom children.

**4. `UNIQUE(hazardous_event_id, observation_time)` on the parent table — the DB-level half of a
rule `3d`/`5e`'s application layer also enforces.** Already called for in the roadmap's own Test
tier text for `2f`: prevents the exact-duplicate-timestamp case at the DB level, defense in depth
alongside the application-layer conflict check — same "belt and suspenders" framing as `2e`'s
Decision 4 / Invariant 3 ("DB constraints are defense-in-depth, not a substitute for domain-layer
rules"). This constraint is not a substitute for `3d`/`5e`'s domain-layer check, which must still
implement the rule with its own meaningful domain error.

**5. Multiple observations per event are explicitly intended — no constraint limits
`hazardous_event_id` to a single row.** The entire point of this intent is a time-series model;
only the `(hazardous_event_id, observation_time)` pair from Decision 4 is unique.

**6. New table name: `hazardous_event_spatial_observation_geom` /
`hazardousEventSpatialObservationGeomTable.ts` — deliberate departure from the diagram's literal
name.** The diagram itself names this table `hazardous_event_geom`, which collides with the
already-existing, untouched `app/drizzle/schema/hazardousEventGeomTable.ts` (today's
single-snapshot table). User's explicit choice: name the new table
`hazardous_event_spatial_observation_geom`, matching its sibling
`hazardous_event_spatial_observation_division`'s own naming convention, rather than reusing the
diagram's colliding literal name. This avoids a same-database naming collision and keeps both
child tables of the new observation model visually paired under one prefix.

**7. Every FK column individually `index()`-ed — matches `2d`'s post-review-corrected convention
and `2e`, not the older, gap-having `hazardous_event_geom`/`hazardous_event_division` pattern.**
Four indexes total: `hazardous_event_spatial_observation_hazardous_event_id_idx` (on
`hazardous_event_id`), `hazardous_event_spatial_observation_division_observation_id_idx` (on
`hazardous_event_spatial_observation_id`), `hazardous_event_spatial_observation_division_division_id_idx`
(on `division_id`), `hazardous_event_spatial_observation_geom_observation_id_idx` (on
`hazardous_event_spatial_observation_id`). Postgres does not auto-index FK columns; without these,
a cascade delete against any parent would seq-scan the corresponding child table.

**8. Schema location: `app/domains/hazardous-events/infrastructure/`, not `app/drizzle/schema/` —
per ADR-009.** Every new Track B table lives in HE's own `infrastructure/` for now — same
reasoning as `2b`-`2e` (see `2b`'s archived design.md Decision 7). Not added to
`app/drizzle/schema/index.ts`; only the PGlite `testSchema` barrel gets entries.

**9. HE-exclusive — no extraction flag, same treatment as `2d`/`2e`.** Matches the existing
per-domain pattern already confirmed in the roadmap's own text: DE, DR, losses, damages, and
disruption each already have their own separate geom/division table pair. This is a permanent
HE-owned addition, not a reconciliation against shared data.

**10. Two cross-package FK situations — one is a new flavor not yet seen in `2b`-`2e`.**

- `hazardous_event_spatial_observation.hazardous_event_id` → legacy
  `app/drizzle/schema/hazardousEventTable.ts`. Same category of narrow, necessary exception as
  `2d`'s Decision 6 / `2e`'s Decision 8 — the table being referenced hasn't been CA-migrated yet.
  `hazardousEventTable` is already present in the test schema barrel
  (`tests/integration/db/testSchema/hazardousEventTable.ts`); no new barrel entry needed for this
  FK target.
- `hazardous_event_spatial_observation_division.division_id` → legacy, **shared, non-domain-owned**
  `app/drizzle/schema/divisionTable.ts`. This is a new flavor of cross-package FK not yet seen in
  `2b`-`2e`: those all reached into `hazardousEventTable` specifically (a table that will
  eventually migrate to this same domain); `division` is shared reference data used across
  multiple domains (DE, DR, losses, etc.) and has no CA-migration destination that belongs to HE.
  `divisionTable` is already present in the test schema barrel
  (`tests/integration/db/testSchema/divisionTable.ts`); no new barrel entry needed for this FK
  target either.

**11. Migration is hand-authored SQL** (not `drizzle-kit generate`), registered as a new entry in
`app/drizzle/migrations/meta/_journal.json` at `idx` 51, following `20260907140000_add_hazardous_event_causality_table`
at `idx` 50. **This migration structurally cannot be a single statement**: three `CREATE TABLE IF
NOT EXISTS` statements plus four separate `CREATE INDEX` statements (Postgres has no inline syntax
for a plain non-unique index inside `CREATE TABLE`, unlike `UNIQUE`/`PRIMARY KEY` — the same
structural shape hit in `2c` and `2e`). Each of the seven top-level statements MUST be separated by
its own `--> statement-breakpoint` comment line, or `yarn dbsync` can silently report success
without executing all of them — the `2c` migration-execution bug (see its archived
design.md/tasks.md). Tables created in dependency order:
`hazardous_event_spatial_observation` first, then `hazardous_event_spatial_observation_division`
and `hazardous_event_spatial_observation_geom` (either order between the two children — both only
depend on the parent).

**12. Test schema barrel — re-export, not duplicate.** Following `2a`-`2e`'s pattern: each of the
three new tables gets a `tests/integration/db/testSchema/<TableName>.ts` file doing `export * from
"~/domains/hazardous-events/infrastructure/<TableName>"`, added to
`tests/integration/db/testSchema/index.ts`. As noted in Decision 10, no new barrel entries are
needed for the `hazardousEventTable`/`divisionTable` FK targets — both already exist.

**13. No enum, no `check()` constraint beyond Decision 4's `UNIQUE`.** The diagram shows no
enumerated column on any of the three tables.

## Risks / Trade-offs

- [Cascade delete on both `hazardous_event_spatial_observation_id` FKs (Decision 3) means deleting
  a parent observation row silently removes its division and geom children] → matches the
  user-confirmed, per-column legacy precedent; acceptable because nothing else references these
  new tables yet.
- [`division_id` does NOT cascade (Decision 3), matching `hazardousEventDivisionTable`'s existing
  behavior] → deleting a `division` row referenced by an active spatial observation raises an FK
  violation rather than silently orphaning the observation's division data; intentional, not a
  gap — division is stable reference data.
- [New table named `hazardous_event_spatial_observation_geom`, not the diagram's literal
  `hazardous_event_geom` (Decision 6)] → deliberate, user-confirmed departure from the diagram to
  avoid a same-database naming collision with the existing, untouched
  `hazardous_event_geom` table; documented here so a future reader comparing this table against
  the diagram isn't surprised by the name mismatch.
- [Cross-package FK from a new `infrastructure/` table into legacy, shared
  `app/drizzle/schema/divisionTable.ts` (Decision 10)] → a new flavor of exception (shared
  reference data, not another not-yet-migrated HE table) — explicitly flagged here and in
  proposal.md as narrow and necessary, not a precedent for routinely reaching into shared legacy
  tables from `infrastructure/`.
- [`UNIQUE(hazardous_event_id, observation_time)` (Decision 4) only catches exact-timestamp
  duplicates] → deliberate; a near-duplicate (e.g. two observations one second apart) is not
  blocked at the DB level — that's `3d`/`5e`'s domain-layer conflict-check territory, not this
  intent's.
- [Postgres truncates identifiers over 63 bytes, silently, with a NOTICE not an error] → the
  division join table's naming convention (long table name + long
  `hazardous_event_spatial_observation_id` column name) overflows 63 bytes for both its unique
  constraint and its FK-to-parent constraint under the `<table>_<column>_...` conventions used
  elsewhere in this change. Discovered during implementation, not anticipated in Decision 11 (which
  only names the four index identifiers, all ≤63 bytes). Fixed by shortening: unique constraint
  renamed `hazardous_event_spatial_observation_division_obs_div_unique` (59 bytes, was a 70-byte
  name); both child tables' FK-to-parent constraints renamed
  `<table>_obs_id_fk` (54/50 bytes) instead of the causality/hazard-driver precedent's
  `<table>_<column>_fk` form, which would have been 86/82 bytes. tasks.md updated to match. Not a
  design deviation requiring approval — a physical DB limit, not a choice.

## Migration Plan

Additive only — three `CREATE TABLE IF NOT EXISTS` statements plus four `CREATE INDEX` statements
(Decision 11), no existing table altered, no data migration, no rollback data-loss risk. `yarn
dbsync` applies; a straight `DROP TABLE` migration (children before parent) would fully revert if
needed — nothing references these three tables today.
