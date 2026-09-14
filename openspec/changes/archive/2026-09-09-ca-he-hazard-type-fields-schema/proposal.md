## Why

`hazardous_event` has no way to record hazard-type-specific structured metadata (e.g. wind speed
for a cyclone, magnitude for an earthquake) — every hazard type currently shares the same fixed
column set. The ER diagram's "Section H" models a custom-field system: field definitions (global
and tenant-custom) backed by shared data-type/unit lookups, plus the value tables that store what
was actually recorded per event. This intent adds all six tables; wiring them into a route, model,
or `fieldsDef` is out of scope (pure schema).

## What Changes

- Add `field_data_type` (shared lookup): `id`, `type` (text, `UNIQUE`). Add `field_unit` (shared
  lookup): `id`, `unit` (text, `UNIQUE`). Referenced by both field-definition tables below — one
  physical table each, not duplicated per section (diagram draws both twice for visual grouping).
- Add `hazard_type_field_definition` (global field definitions): `id`, `hazard_type_id` FK →
  `hazard_type.id` (diagram's stale `hip_type_id` label corrected — targets `2b`'s new
  `hazardTypeTable`, not the legacy `hipTypeTable`), `field_key`, `label`, `data_type` FK →
  `field_data_type.id`, `required` (boolean), `unit` FK → `field_unit.id`, `created_at`/`updated_at`.
  `UNIQUE(hazard_type_id, field_key)` — the same field key may legitimately repeat across
  different hazard types, just not twice for the same one.
- Add `hazard_type_custom_field_definition` (tenant-custom field definitions): identical shape
  plus `country_accounts_id` FK → `country_accounts.id`. `UNIQUE(country_accounts_id,
  hazard_type_id, field_key)`.
- Add `hazardous_event_field_value`: `id`, `hazardous_event_id` FK (cascade),
  `hazard_type_field_definition_id` FK (cascade), `value` (text), `created_at`/`updated_at`.
  `UNIQUE(hazardous_event_id, hazard_type_field_definition_id)`.
- Add `hazardous_event_custom_field_value`: `id`, `hazardous_event_id` FK (cascade),
  `hazard_type_custom_field_definition_id` FK (cascade), `value` (text),
  `created_at`/`updated_at`. `UNIQUE(hazardous_event_id, hazard_type_custom_field_definition_id)`.
  Genuinely distinct from `hazardous_event_field_value` — different FK target, different UQ.
- Add an `index()` on every FK column across all six tables — 11 indexes total (see design.md for
  the full list and the identifier-length shortening this required on several names).
- Generate and apply a hand-authored migration via `yarn dbsync`.

No route, model, handler, or `fieldsDef` changes — pure schema addition, same scope as `2b`-`2g`.

## Capabilities

### New Capabilities

- `hazard-type-field-definition-schema`: the field-definition side — `hazard_type_field_definition`,
  `hazard_type_custom_field_definition`, and the two shared lookup tables `field_data_type` /
  `field_unit`.
- `hazardous-event-field-value-schema`: the value side — `hazardous_event_field_value` and
  `hazardous_event_custom_field_value`.

### Modified Capabilities

None.

## Impact

**Files:**

- `app/domains/hazardous-events/infrastructure/fieldDataTypeTable.ts` (new)
- `app/domains/hazardous-events/infrastructure/fieldUnitTable.ts` (new)
- `app/domains/hazardous-events/infrastructure/hazardTypeFieldDefinitionTable.ts` (new)
- `app/domains/hazardous-events/infrastructure/hazardTypeCustomFieldDefinitionTable.ts` (new)
- `app/domains/hazardous-events/infrastructure/hazardousEventFieldValueTable.ts` (new)
- `app/domains/hazardous-events/infrastructure/hazardousEventCustomFieldValueTable.ts` (new)
- `app/drizzle/migrations/<timestamp>_add_hazard_type_field_tables.sql` (new, hand-authored)
- `app/drizzle/migrations/meta/_journal.json` (new entry)
- `tests/integration/db/testSchema/fieldDataTypeTable.ts` (new, re-export)
- `tests/integration/db/testSchema/fieldUnitTable.ts` (new, re-export)
- `tests/integration/db/testSchema/hazardTypeFieldDefinitionTable.ts` (new, re-export)
- `tests/integration/db/testSchema/hazardTypeCustomFieldDefinitionTable.ts` (new, re-export)
- `tests/integration/db/testSchema/hazardousEventFieldValueTable.ts` (new, re-export)
- `tests/integration/db/testSchema/hazardousEventCustomFieldValueTable.ts` (new, re-export)
- `tests/integration/db/testSchema/index.ts` (add six barrel exports; `hazardTypeTable`,
  `hazardousEventTable`, `countryAccounts` barrel entries already exist — confirmed, no new
  entries needed for those three FK targets)
- `tests/integration/db/queries/hazardTypeFieldDefinition.test.ts` (new)
- `tests/integration/db/queries/hazardousEventFieldValue.test.ts` (new)
- `tests/integration/db/models/hazardTypeFieldDefinitionTestHelpers.ts` (new, not originally
  anticipated — extracted during code review to deduplicate seed helpers shared by both new
  test files, same pattern as `hazardousEventTestHelpers.ts`)

**DB migration required:** yes — 6 `CREATE TABLE` statements plus 11 `CREATE INDEX` statements
(composite `UNIQUE` constraints go inline in `CREATE TABLE`), applied via `yarn dbsync` (never
`drizzle-kit push`).

**Test approach:** PGlite (`yarn test:run2`) — schema/constraint verification only, no route or
domain logic involved.

**Multi-tenancy:** `hazard_type_field_definition`, `field_data_type`, `field_unit` are global,
untenanted lookups (same tier as `2b`'s HIP hierarchy). `hazard_type_custom_field_definition`
carries `country_accounts_id` directly (cascade on delete). The two value tables carry no
`country_accounts_id` column — tenant scoping is inherited transitively via `hazardous_event_id`
→ `hazardous_event.country_accounts_id`, same pattern as `2f`'s spatial observation tables.

**Security:** none directly — pure schema, no route/auth surface touched. Three cross-package FKs
(in-domain to `2b`'s `hazardTypeTable`; legacy cross-package to `hazardousEventTable` and
`countryAccountsTable`) are flagged in design.md as narrow, necessary exceptions, not new access
paths.
