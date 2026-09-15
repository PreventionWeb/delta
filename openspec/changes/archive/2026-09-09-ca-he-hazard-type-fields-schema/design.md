## Context

Target ER diagram (`tmp/hazardous-events-er-diagram/hazardous-events.drawio`, "Section H").
Every field list and every ambiguous point below was already verified against the raw XML and
confirmed with the user in a dedicated back-and-forth prior to this proposal — not re-derived
here. The `.png` render at `_docs/refactoring-plan/diagrams/hazardous-events-er-diagram.png` is a
compressed render with a history of misreadings and is not used for field-level precision.

Direct precedents: `2b` (`hazardTypeTable.ts` — the FK target for `hazard_type_id`, and the
already-corrected `hip*Id` stale-label pattern), `2c`'s `sourceCatalogTable.ts` (tenant-scoped
table + cascading `country_accounts_id`), `2f`'s `hazardousEventSpatialObservationTable.ts` (the
index-every-FK convention and the 63-byte identifier-shortening pattern this intent hits again,
more severely).

## Goals / Non-Goals

**Goals:** all six tables, hand-authored migration, testable in PGlite; every FK column indexed;
composite `UNIQUE` scoping exactly as confirmed (per-hazard-type for the global definition table,
per-tenant-per-hazard-type for the custom one); every constraint/index name within Postgres's
63-byte limit.

**Non-Goals:** wiring any table into a route, model, handler, or `fieldsDef` (pure schema); a
`specific_hazard_id`-keyed field-definition model (settled in favor of `hazard_type` per the
roadmap's own Non-Goals — not re-opened here); typed value columns or `json` for `value` (settled
as `text` — not re-opened); extraction of the shared-taxonomy tables to a shared-infra package
(flagged for later, not done in this intent).

## Decisions

**1. Exact field list (from the `.drawio`, already confirmed with the user):**

| Table                                 | Column                                    | Type / constraint                                          |
| -------------------------------------- | ------------------------------------------ | ------------------------------------------------------------ |
| `field_data_type`                      | `id`                                       | uuid, PK                                                    |
| `field_data_type`                      | `type`                                     | text, not null, `UNIQUE`                                    |
| `field_unit`                           | `id`                                       | uuid, PK                                                    |
| `field_unit`                           | `unit`                                     | text, not null, `UNIQUE`                                    |
| `hazard_type_field_definition`         | `id`                                       | uuid, PK                                                    |
| `hazard_type_field_definition`         | `hazard_type_id`                           | uuid, FK → `hazard_type.id`                                 |
| `hazard_type_field_definition`         | `field_key`                                | text, not null                                              |
| `hazard_type_field_definition`         | `label`                                    | text, not null                                              |
| `hazard_type_field_definition`         | `data_type`                                | uuid, FK → `field_data_type.id`, not null                   |
| `hazard_type_field_definition`         | `required`                                 | boolean, not null                                           |
| `hazard_type_field_definition`         | `unit`                                     | uuid, FK → `field_unit.id`, not null                        |
| `hazard_type_field_definition`         | `created_at`/`updated_at`                  | timestamptz, not null (Decision 2)                          |
| `hazard_type_custom_field_definition`  | (all of the above) + `country_accounts_id` | uuid, FK → `country_accounts.id`, not null                  |
| `hazardous_event_field_value`          | `id`                                       | uuid, PK                                                    |
| `hazardous_event_field_value`          | `hazardous_event_id`                       | uuid, FK → `hazardous_event.id`, not null                    |
| `hazardous_event_field_value`          | `hazard_type_field_definition_id`          | uuid, FK → `hazard_type_field_definition.id`, not null      |
| `hazardous_event_field_value`          | `value`                                    | text, not null                                              |
| `hazardous_event_field_value`          | `created_at`/`updated_at`                  | timestamptz, not null (Decision 2)                          |
| `hazardous_event_custom_field_value`   | (same shape as above, FK to)               | `hazard_type_custom_field_definition.id`                     |

Three diagram peculiarities, already resolved, not re-opened:

- `field_data_type`/`field_unit` are drawn twice (once per section) with byte-identical shape —
  confirmed one shared table each, not two, same pattern as `hazard_type`/`country_accounts`
  being redrawn elsewhere in the same diagram.
- The FK column literally labeled `hip_type_id` on both definition tables is a confirmed stale
  label predating `2b`'s naming migration — corrected to `hazard_type_id`, targeting `2b`'s
  `hazardTypeTable`, not the legacy `hipTypeTable` (same correction pattern as `hazardTypeTable`'s
  own `hips_version_id` comment).
- `unit` on both definition tables shows an "NN" (not-null) badge instead of "FK" — a
  follow-the-edge-connector check confirmed it is genuinely an FK to `field_unit` despite the
  badge; both facts hold simultaneously.

**2. `createdAt`/`updatedAt` added to the four non-lookup tables (`hazard_type_field_definition`,
`hazard_type_custom_field_definition`, `hazardous_event_field_value`,
`hazardous_event_custom_field_value`) — applied by established `2a`-`2g` convention, not diagram
evidence. The two shared lookup tables (`field_data_type`, `field_unit`) do not get timestamps —
pure reference/enum-like data with no independent lifecycle, matching Decision 1's field list and
both spec.md files.** The diagram shows no timestamp columns on any of these six tables (unlike
prior intents, which at least had partial timestamp evidence). Flagging this explicitly per the
task brief: this is a convention-driven addition, to be confirmed rather than silently assumed.
Declared inline as `timestamp(..., { withTimezone: true })` per ADR-002, both `.notNull()`,
defaulting via `sql\`CURRENT_TIMESTAMP\`` — no `createdUpdatedTimestamps` helper.

**3. Composite `UNIQUE` scoping — confirmed business rule, not the diagram's literal bare-`UQ`
annotation.** `hazard_type_field_definition` shows `field_key (text) UQ` with no visible composite
scope, but the actual rule (confirmed directly with the user) is that the same field key (e.g.
`wind_speed`) legitimately applies to multiple hazard types as separate rows — hazard-specific
fields may be shared across hazard types or exclusive to one. So: `UNIQUE(hazard_type_id,
field_key)`, not a bare unique on `field_key`. The custom-definition table extends this with
tenant scope: `UNIQUE(country_accounts_id, hazard_type_id, field_key)` — the same tenant can't
redefine a field twice for the same hazard type; different tenants (or the same tenant across
different hazard types) are independent.

**4. Two distinct value tables, not one shared table under a paraphrased name.** The diagram's two
drawings of "hazardous_event_field_value" have different FK targets
(`hazard_type_field_definition_id` vs. `hazard_type_custom_field_definition_id`) and different UQ
constraints — unlike `field_data_type`/`field_unit`'s identical redraws, this is a genuine
two-table split, confirmed with the user.

**5. Cascade behavior — matched per-column to the confirmed business meaning, not a blanket rule:**

- `hazardous_event_id` (both value tables) — `.notNull().references(..., { onDelete: "cascade"
})`. Deleting an event removes its recorded field values.
- `hazard_type_field_definition_id` / `hazard_type_custom_field_definition_id` (each value table
  → its own definition table) — `.notNull().references(..., { onDelete: "cascade" })`. Deleting a
  field definition removes recorded values against it.
- `hazard_type_id` (both definition tables) — `.notNull().references(() => hazardTypeTable.id)`,
  **no** `onDelete` (default RESTRICT). Matches `2f`'s `division_id` precedent: reference/taxonomy
  data shouldn't vanish because something referencing it was deleted.
- `data_type` / `unit` (both definition tables) — `.notNull().references(...)`, **no** `onDelete`.
  Same reasoning — `field_data_type`/`field_unit` are shared lookup data.
- `country_accounts_id` (custom definition table only) — `.notNull().references(() =>
countryAccountsTable.id, { onDelete: "cascade" })`. Matches the dominant tenant-scoping
  convention (`2c`'s `source_catalog`, `noticesTable`).

**6. Every FK column individually `index()`-ed — 11 indexes total, applied proactively per the
now-established `2d`-`2g` post-review convention, not waiting for a review finding:**

`hazard_type_field_definition`: `hazard_type_id`, `data_type`, `unit` (3).
`hazard_type_custom_field_definition`: `hazard_type_id`, `data_type`, `unit`, `country_accounts_id`
(4). `hazardous_event_field_value`: `hazardous_event_id`, `hazard_type_field_definition_id` (2).
`hazardous_event_custom_field_value`: `hazardous_event_id`, `hazard_type_custom_field_definition_id`
(2). Postgres does not auto-index FK columns; without these, a cascade delete against any parent
would seq-scan the corresponding child table. The three composite `UNIQUE` constraints (Decision
3/Requirement tables) also each function as an index on their leading column, but a dedicated
single-column index is still added per column per this convention.

**7. Identifier-length audit — every FK/unique/index name checked against Postgres's 63-byte
limit before finalizing (per `2f`'s precedent, hit harder here because `hazard_type_custom_field_definition`
is a long table name carrying a 3-column composite unique).** Verified with a byte-length script
against the actual candidate strings, not estimated. Full names hold for all `hazard_type_field_definition`
constraints/indexes (max 60 bytes) and most `hazard_type_custom_field_definition` ones (max 59
bytes), but three had to be shortened:

| Table                                  | Constraint (unabbreviated, bytes)                                                                              | Shortened to (bytes)                                                    |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| `hazard_type_custom_field_definition`   | `..._country_accounts_id_hazard_type_id_field_key_unique` (87)                                                  | `hazard_type_custom_field_definition_ca_ht_key_unique` (52)             |
| `hazardous_event_field_value`           | `..._hazardous_event_id_hazard_type_field_definition_id_unique` (85)                                            | `hazardous_event_field_value_event_id_field_def_id_unique` (56)         |
| `hazardous_event_custom_field_value`    | `..._hazardous_event_id_hazard_type_custom_field_definition_id_unique` (99)                                     | `hazardous_event_custom_field_value_evt_id_def_id_unique` (55)          |

The FK to `hazard_type_field_definition_id`/`hazard_type_custom_field_definition_id` on each value
table, and the matching index, are also abbreviated to `field_def_id`/`custom_field_def_id` for
consistency with their table's shortened unique name (`..._field_value_field_def_id_fk` (43),
`..._field_value_field_def_id_idx` (44); `..._custom_field_value_custom_field_def_id_fk` (57),
`..._custom_field_value_custom_field_def_id_idx` (58)). Every other constraint/index name across
all six tables uses the full, unabbreviated column name(s) — see tasks.md for the complete,
per-statement name list used in the hand-authored migration.

**8. Schema location: `app/domains/hazardous-events/infrastructure/`, not `app/drizzle/schema/` —
per ADR-009.** All six tables, same reasoning as `2b`-`2g`. Not added to `app/drizzle/schema/index.ts`;
only the PGlite `testSchema` barrel gets entries.

**9. Split ownership, matching the roadmap's own framing.** `hazard_type_field_definition`,
`hazard_type_custom_field_definition`, `field_data_type`, `field_unit` are the same shared-taxonomy
tier as `2b`'s HIP hierarchy — flagged for extraction to shared infra once Disaster Events gets
its own CA migration. `hazardous_event_field_value`/`hazardous_event_custom_field_value` are
HE-exclusive (no existing custom-field concept anywhere else in the schema) — not flagged, same
treatment as `2d`-`2g`.

**10. Three cross-package FK situations:**

- `hazard_type_id` (both definition tables) → `2b`'s already-merged, domain-owned
  `app/domains/hazardous-events/infrastructure/hazardTypeTable.ts`. Normal in-domain reference, not
  a cross-package exception.
- `hazardous_event_id` (both value tables) → legacy `app/drizzle/schema/hazardousEventTable.ts`.
  Same narrow, necessary exception as `2d`-`2g` — already present in the test schema barrel
  (`tests/integration/db/testSchema/hazardousEventTable.ts`); no new barrel entry needed.
- `country_accounts_id` (custom definition table) → legacy, shared
  `app/drizzle/schema/countryAccountsTable.ts`. Same flavor of exception as `2c`'s
  `source_catalog`; already present in the test schema barrel
  (`tests/integration/db/testSchema/countryAccounts.ts`); no new barrel entry needed.

**11. Migration is hand-authored SQL** (not `drizzle-kit generate`), registered as a new entry in
`app/drizzle/migrations/meta/_journal.json` following the current last entry
(`20260907160000_add_hazardous_event_attachment_table`, `idx` 52). This migration structurally
cannot be a single statement: 6 `CREATE TABLE IF NOT EXISTS` statements plus 11 `CREATE INDEX`
statements (Postgres has no inline syntax for a plain non-unique index inside `CREATE TABLE`,
unlike `UNIQUE`, which does go inline) — 17 top-level statements, each separated by its own
`--> statement-breakpoint` line, or `yarn dbsync` can silently report success without executing
all of them (the `2c` migration-execution bug, hit again in `2e`/`2f`/`2g`). Table creation order
(dependency order): `field_data_type`, `field_unit` (no dependencies) → `hazard_type_field_definition`
→ `hazard_type_custom_field_definition` → `hazardous_event_field_value` →
`hazardous_event_custom_field_value`.

**12. Test schema barrel — re-export, not duplicate.** Following `2a`-`2g`'s pattern: each of the
six new tables gets a `tests/integration/db/testSchema/<TableName>.ts` file doing `export * from
"~/domains/hazardous-events/infrastructure/<TableName>"`, added to
`tests/integration/db/testSchema/index.ts`. As noted in Decision 10, no new barrel entries are
needed for the `hazardTypeTable`/`hazardousEventTable`/`countryAccountsTable` FK targets — all
three already exist.

**13. No enum, no `check()` constraint beyond the `UNIQUE`s above.** The diagram shows no
enumerated column on any of the six tables. `value` is plain `text` on both value tables — the
diagram's own author-annotation raising typed-columns/`json` alternatives is already settled in
favor of `text` and not re-opened.

## Risks / Trade-offs

- [Three constraint names had to be abbreviated below their full descriptive form (Decision 7)] →
  necessary to fit Postgres's 63-byte identifier limit; documented above and in tasks.md so a
  future reader isn't surprised by the abbreviation. Every other name across the six tables keeps
  the full, unabbreviated column name(s).
- [`unit` is NOT NULL despite the diagram's ambiguous "NN"-not-"FK" badge (Decision 1)] →
  confirmed genuine FK via edge-connector check, not a guess; a field definition without a unit
  would otherwise silently pass validation with an orphaned-looking column.
- [`hazard_type_id`/`data_type`/`unit` have no cascade (Decision 5)] → deleting shared reference
  data while field definitions still reference it raises an FK violation rather than silently
  orphaning definitions; intentional, matches `2f`'s `division_id` precedent.
- [Cross-package FK from `country_accounts_id` into legacy, shared `countryAccountsTable.ts`
  (Decision 10)] → same narrow, necessary exception category as `2c`'s `source_catalog` — not a
  precedent for routinely reaching into shared legacy tables from `infrastructure/`.
- [`createdAt`/`updatedAt` added to all six tables despite zero diagram evidence (Decision 2)] →
  convention-driven, not diagram-driven; flagged explicitly for confirmation during review rather
  than silently assumed.

## Migration Plan

Additive only — 6 `CREATE TABLE IF NOT EXISTS` statements plus 11 `CREATE INDEX` statements
(Decision 11), no existing table altered, no data migration, no rollback data-loss risk. `yarn
dbsync` applies; a straight `DROP TABLE` migration (children before parents, reverse of creation
order) would fully revert if needed — nothing references any of these six tables today.
