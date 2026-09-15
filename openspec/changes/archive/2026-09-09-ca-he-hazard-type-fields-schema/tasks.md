## 1. `field_data_type` table

- [x] 1.1 Write failing test `tests/integration/db/queries/hazardTypeFieldDefinition.test.ts`
      (`import "../setup"`) covering the base scenarios from spec.md: insert with a new `type`
      succeeds; `type = NULL` rejected (not-null); a duplicate `type` rejected (unique
      constraint); two concurrent inserts of different `type` values both succeed. Run
      `yarn vitest run tests/integration/db/queries/hazardTypeFieldDefinition.test.ts` — fails
      (table doesn't exist).
- [x] 1.2 Add `app/domains/hazardous-events/infrastructure/fieldDataTypeTable.ts` — `id` via
      `ourRandomUUID()`, `type` text not null with a `unique("field_data_type_type_unique")`
      constraint — per design.md Decisions 1/6.
- [x] 1.3 Add `tests/integration/db/testSchema/fieldDataTypeTable.ts` re-exporting it and add it
      to `tests/integration/db/testSchema/index.ts`. Do NOT add it to
      `app/drizzle/schema/index.ts` — per design.md Decision 8.
- [x] 1.4 Run `yarn vitest run tests/integration/db/queries/hazardTypeFieldDefinition.test.ts` —
      `field_data_type` scenarios pass.

## 2. `field_unit` table

- [x] 2.1 Add failing tests (same file, new `describe` block) covering: insert with a new `unit`
      succeeds; `unit = NULL` rejected (not-null); a duplicate `unit` rejected (unique
      constraint); two concurrent inserts of different `unit` values both succeed. Run — fails
      (table doesn't exist).
- [x] 2.2 Add `app/domains/hazardous-events/infrastructure/fieldUnitTable.ts` — `id` via
      `ourRandomUUID()`, `unit` text not null with a `unique("field_unit_unit_unique")`
      constraint — per design.md Decisions 1/6.
- [x] 2.3 Add `tests/integration/db/testSchema/fieldUnitTable.ts` re-exporting it and add it to
      `tests/integration/db/testSchema/index.ts`.
- [x] 2.4 Run `yarn vitest run tests/integration/db/queries/hazardTypeFieldDefinition.test.ts` —
      `field_unit` scenarios pass.

## 3. `hazard_type_field_definition` table

- [x] 3.1 Add failing tests (same file, new `describe` block) covering the base scenarios from
      spec.md: insert with an existing `hazard_type_id`/`data_type`/`unit` and valid
      `field_key`/`label`/`required` succeeds; each of `hazard_type_id`, `field_key`, `label`,
      `data_type`, `required`, `unit` rejected when `NULL` (not-null, six cases); a
      `hazard_type_id` matching no `hazard_type` row rejected (FK); a `data_type` matching no
      `field_data_type` row rejected (FK); a `unit` matching no `field_unit` row rejected (FK);
      the same `field_key` under two different `hazard_type_id` values both succeed; a duplicate
      `(hazard_type_id, field_key)` pair rejected (unique constraint); two concurrent inserts of
      different `field_key` values under the same `hazard_type_id` both succeed. Seed
      `hazard_type`, `field_data_type`, `field_unit` rows via the `testSchema` fixtures. Run —
      fails (table doesn't exist).
- [x] 3.2 Add `app/domains/hazardous-events/infrastructure/hazardTypeFieldDefinitionTable.ts` —
      `id` via `ourRandomUUID()`, `hazardTypeId` uuid not null `.references(() =>
      hazardTypeTable.id)` (importing from `./hazardTypeTable`, in-domain — **no** `onDelete`),
      `fieldKey` text not null, `label` text not null, `dataType` uuid not null `.references(() =>
      fieldDataTypeTable.id)` (**no** `onDelete`), `required` boolean not null, `unit` uuid not
      null `.references(() => fieldUnitTable.id)` (**no** `onDelete` — confirmed genuine FK
      despite the diagram's "NN" badge, design.md Decision 1), `createdAt`/`updatedAt`
      timestamp(`{ withTimezone: true }`) not null defaulting to `CURRENT_TIMESTAMP`, an
      `index("hazard_type_field_definition_hazard_type_id_idx")` on `hazardTypeId`, an
      `index("hazard_type_field_definition_data_type_idx")` on `dataType`, an
      `index("hazard_type_field_definition_unit_idx")` on `unit`, and a
      `unique("hazard_type_field_definition_hazard_type_id_field_key_unique")` on
      `(hazardTypeId, fieldKey)` — per design.md Decisions 1/2/3/5/6.
- [x] 3.3 Add `tests/integration/db/testSchema/hazardTypeFieldDefinitionTable.ts` re-exporting it
      and add it to `tests/integration/db/testSchema/index.ts`.
      `tests/integration/db/testSchema/hazardTypeTable.ts` already exists — no new barrel entry
      needed for that FK target.
- [x] 3.4 Run `yarn vitest run tests/integration/db/queries/hazardTypeFieldDefinition.test.ts` —
      `hazard_type_field_definition` base scenarios pass.

## 4. `hazard_type_field_definition` restrict behaviour

- [x] 4.1 Add failing tests (same file) covering: deleting a `hazard_type` row that is still
      referenced by a `hazard_type_field_definition` row is rejected (FK, no cascade); deleting a
      `field_data_type` row that is still referenced is rejected (FK, no cascade); deleting a
      `field_unit` row that is still referenced is rejected (FK, no cascade). Run — fails until
      3.2 lands, then passes with no further code change.
- [x] 4.2 Run `yarn vitest run tests/integration/db/queries/hazardTypeFieldDefinition.test.ts` —
      passes.

## 5. `hazard_type_custom_field_definition` table

- [x] 5.1 Add failing tests (same file, new `describe` block) covering the base scenarios from
      spec.md: insert with an existing `country_accounts_id`/`hazard_type_id`/`data_type`/`unit`
      and valid `field_key`/`label`/`required` succeeds; `country_accounts_id = NULL` rejected
      (not-null); a `country_accounts_id` matching no `country_accounts` row rejected (FK); the
      same `(hazard_type_id, field_key)` pair across two different `country_accounts_id` values
      both succeed; the same `(country_accounts_id, field_key)` pair across two different
      `hazard_type_id` values both succeed; a duplicate `(country_accounts_id, hazard_type_id,
      field_key)` triple rejected (unique constraint); two concurrent inserts of different
      `field_key` values under the same `country_accounts_id` and `hazard_type_id` both succeed.
      Seed `country_accounts` rows via the existing `testSchema` fixtures. Run — fails (table
      doesn't exist).
- [x] 5.2 Add
      `app/domains/hazardous-events/infrastructure/hazardTypeCustomFieldDefinitionTable.ts` —
      same columns as `hazardTypeFieldDefinitionTable.ts` (3.2) plus `countryAccountsId` uuid not
      null `.references(() => countryAccountsTable.id, { onDelete: "cascade" })` (importing from
      `~/drizzle/schema/countryAccountsTable`), an
      `index("hazard_type_custom_field_definition_hazard_type_id_idx")` on `hazardTypeId`, an
      `index("hazard_type_custom_field_definition_data_type_idx")` on `dataType`, an
      `index("hazard_type_custom_field_definition_unit_idx")` on `unit`, an
      `index("hazard_type_custom_field_definition_country_accounts_id_idx")` on
      `countryAccountsId`, and a `unique("hazard_type_custom_field_definition_ca_ht_key_unique")`
      on `(countryAccountsId, hazardTypeId, fieldKey)` — per design.md Decisions 1/2/3/5/6/7.
      (Unique constraint name abbreviated from the unabbreviated 87-byte form — over Postgres's
      63-byte limit; see design.md Decision 7/Risks.)
- [x] 5.3 Add `tests/integration/db/testSchema/hazardTypeCustomFieldDefinitionTable.ts`
      re-exporting it and add it to `tests/integration/db/testSchema/index.ts`.
      `tests/integration/db/testSchema/countryAccounts.ts` already exists — no new barrel entry
      needed for that FK target.
- [x] 5.4 Run `yarn vitest run tests/integration/db/queries/hazardTypeFieldDefinition.test.ts` —
      `hazard_type_custom_field_definition` base scenarios pass.

## 6. `hazard_type_custom_field_definition` cascade/restrict behaviour

- [x] 6.1 Add failing tests (same file) covering: deleting a `country_accounts` row cascades to
      delete its dependent `hazard_type_custom_field_definition` rows; deleting a `hazard_type`
      row that is still referenced is rejected (FK, no cascade). Run — fails until 5.2 lands,
      then passes with no further code change.
- [x] 6.2 Run `yarn vitest run tests/integration/db/queries/hazardTypeFieldDefinition.test.ts` —
      all scenarios in this file pass (spec.md's full `hazard-type-field-definition-schema` set,
      1:1).

## 7. `hazardous_event_field_value` table

- [x] 7.1 Write failing test `tests/integration/db/queries/hazardousEventFieldValue.test.ts`
      (`import "../setup"`) covering the base scenarios from spec.md: insert with an existing
      `hazardous_event_id` and `hazard_type_field_definition_id` and a valid `value` succeeds;
      `hazardous_event_id = NULL` rejected (not-null); `hazard_type_field_definition_id = NULL`
      rejected (not-null); `value = NULL` rejected (not-null); a `hazardous_event_id` matching no
      `hazardous_event` row rejected (FK); a `hazard_type_field_definition_id` matching no
      `hazard_type_field_definition` row rejected (FK); the same event with two different
      definitions both succeed; the same definition across two different events both succeed; a
      duplicate `(hazardous_event_id, hazard_type_field_definition_id)` pair rejected (unique
      constraint); two concurrent inserts of different definitions under the same event both
      succeed. Seed `hazardous_event` and `hazard_type_field_definition` rows via the existing
      `testSchema` fixtures. Run
      `yarn vitest run tests/integration/db/queries/hazardousEventFieldValue.test.ts` — fails
      (table doesn't exist).
- [x] 7.2 Add `app/domains/hazardous-events/infrastructure/hazardousEventFieldValueTable.ts` —
      `id` via `ourRandomUUID()`, `hazardousEventId` uuid not null `.references(() =>
      hazardousEventTable.id, { onDelete: "cascade" })` (importing from
      `~/drizzle/schema/hazardousEventTable`), `hazardTypeFieldDefinitionId` uuid not null
      `.references(() => hazardTypeFieldDefinitionTable.id, { onDelete: "cascade" })`, `value`
      text not null, `createdAt`/`updatedAt` timestamp(`{ withTimezone: true }`) not null
      defaulting to `CURRENT_TIMESTAMP`, an
      `index("hazardous_event_field_value_hazardous_event_id_idx")` on `hazardousEventId`, an
      `index("hazardous_event_field_value_field_def_id_idx")` on
      `hazardTypeFieldDefinitionId`, and a
      `unique("hazardous_event_field_value_event_id_field_def_id_unique")` on
      `(hazardousEventId, hazardTypeFieldDefinitionId)` — per design.md Decisions 1/2/4/5/6.
      (FK constraint, index, and unique constraint on `hazardTypeFieldDefinitionId` all use the
      shortened `field_def_id` form; see design.md Decision 7.)
- [x] 7.3 Add `tests/integration/db/testSchema/hazardousEventFieldValueTable.ts` re-exporting it
      and add it to `tests/integration/db/testSchema/index.ts`.
      `tests/integration/db/testSchema/hazardousEventTable.ts` already exists — no new barrel
      entry needed for that FK target.
- [x] 7.4 Run `yarn vitest run tests/integration/db/queries/hazardousEventFieldValue.test.ts` —
      `hazardous_event_field_value` base scenarios pass.

## 8. `hazardous_event_field_value` cascade behaviour

- [x] 8.1 Add failing tests (same file) covering: deleting a `hazardous_event` row cascades to
      delete its dependent `hazardous_event_field_value` rows; deleting a
      `hazard_type_field_definition` row cascades to delete its dependent
      `hazardous_event_field_value` rows. Run — fails until 7.2 lands, then passes with no
      further code change.
- [x] 8.2 Run `yarn vitest run tests/integration/db/queries/hazardousEventFieldValue.test.ts` —
      passes.

## 9. `hazardous_event_custom_field_value` table

- [x] 9.1 Add failing tests (same file, new `describe` block) covering the base scenarios from
      spec.md: insert with an existing `hazardous_event_id` and
      `hazard_type_custom_field_definition_id` and a valid `value` succeeds;
      `hazardous_event_id = NULL` rejected (not-null); `hazard_type_custom_field_definition_id =
      NULL` rejected (not-null); `value = NULL` rejected (not-null); a `hazardous_event_id`
      matching no `hazardous_event` row rejected (FK); a
      `hazard_type_custom_field_definition_id` matching no `hazard_type_custom_field_definition`
      row rejected (FK); the same event with two different custom definitions both succeed; the
      same custom definition across two different events both succeed; a duplicate
      `(hazardous_event_id, hazard_type_custom_field_definition_id)` pair rejected (unique
      constraint); two concurrent inserts of different custom definitions under the same event
      both succeed. Seed `hazard_type_custom_field_definition` rows via the `testSchema`
      fixtures. Run — fails (table doesn't exist).
- [x] 9.2 Add
      `app/domains/hazardous-events/infrastructure/hazardousEventCustomFieldValueTable.ts` — `id`
      via `ourRandomUUID()`, `hazardousEventId` uuid not null `.references(() =>
      hazardousEventTable.id, { onDelete: "cascade" })`, `hazardTypeCustomFieldDefinitionId` uuid
      not null `.references(() => hazardTypeCustomFieldDefinitionTable.id, { onDelete: "cascade"
      })`, `value` text not null, `createdAt`/`updatedAt` timestamp(`{ withTimezone: true }`) not
      null defaulting to `CURRENT_TIMESTAMP`, an
      `index("hazardous_event_custom_field_value_hazardous_event_id_idx")` on
      `hazardousEventId`, an
      `index("hazardous_event_custom_field_value_custom_field_def_id_idx")` on
      `hazardTypeCustomFieldDefinitionId`, and a
      `unique("hazardous_event_custom_field_value_evt_id_def_id_unique")` on
      `(hazardousEventId, hazardTypeCustomFieldDefinitionId)` — per design.md Decisions 1/2/4/5/6.
      (FK constraint and index on `hazardTypeCustomFieldDefinitionId` use the shortened
      `custom_field_def_id` form; the unique constraint uses the further-shortened
      `evt_id_def_id` form — the fully-descriptive name is 99 bytes, well over the 63-byte limit;
      see design.md Decision 7/Risks.)
- [x] 9.3 Add `tests/integration/db/testSchema/hazardousEventCustomFieldValueTable.ts`
      re-exporting it and add it to `tests/integration/db/testSchema/index.ts`.
- [x] 9.4 Run `yarn vitest run tests/integration/db/queries/hazardousEventFieldValue.test.ts` —
      `hazardous_event_custom_field_value` base scenarios pass.

## 10. `hazardous_event_custom_field_value` cascade behaviour

- [x] 10.1 Add failing tests (same file) covering: deleting a `hazardous_event` row cascades to
      delete its dependent `hazardous_event_custom_field_value` rows; deleting a
      `hazard_type_custom_field_definition` row cascades to delete its dependent
      `hazardous_event_custom_field_value` rows. Run — fails until 9.2 lands, then passes with no
      further code change.
- [x] 10.2 Run `yarn vitest run tests/integration/db/queries/hazardousEventFieldValue.test.ts` —
      all scenarios in this file pass (spec.md's full `hazardous-event-field-value-schema` set,
      1:1).

## 11. Real migration

- [x] 11.1 Hand-author `app/drizzle/migrations/20260907170000_add_hazard_type_field_tables.sql`
      — 17 top-level statements (6 `CREATE TABLE IF NOT EXISTS` plus 11 `CREATE INDEX`, since
      Postgres has no inline syntax for a plain non-unique index inside `CREATE TABLE`, unlike
      the composite `UNIQUE` constraints, which do go inline — the same structural shape hit in
      `2c`/`2e`/`2f`), each separated by its own `--> statement-breakpoint` line, in dependency
      order.

      The first two statements create `field_data_type` and `field_unit`, each a uuid PK
      defaulting to `gen_random_uuid()` plus their respective `type`/`unit` text-not-null-unique
      column, since neither has any FK dependency. The third statement creates
      `hazard_type_field_definition`: uuid PK, `hazard_type_id` uuid not null FK to
      `hazard_type(id)` with no `ON DELETE` clause, `field_key` text not null, `label` text not
      null, `data_type` uuid not null FK to `field_data_type(id)` with no `ON DELETE` clause,
      `required` boolean not null, `unit` uuid not null FK to `field_unit(id)` with no `ON
      DELETE` clause, `created_at`/`updated_at` timestamptz not null default `CURRENT_TIMESTAMP`,
      and an inline unique constraint on `(hazard_type_id, field_key)`. The fourth statement
      creates `hazard_type_custom_field_definition` with the same columns as the third statement
      plus `country_accounts_id` uuid not null FK to `country_accounts(id)` `ON DELETE CASCADE`,
      and an inline unique constraint on `(country_accounts_id, hazard_type_id, field_key)` named
      `hazard_type_custom_field_definition_ca_ht_key_unique` (shortened per design.md Decision 7).
      The fifth statement creates `hazardous_event_field_value`: uuid PK, `hazardous_event_id`
      uuid not null FK to `hazardous_event(id)` `ON DELETE CASCADE`, `hazard_type_field_
      definition_id` uuid not null FK to `hazard_type_field_definition(id)` `ON DELETE CASCADE`
      (constraint named `hazardous_event_field_value_field_def_id_fk`, shortened), `value` text
      not null, `created_at`/`updated_at` timestamptz not null default `CURRENT_TIMESTAMP`, and
      an inline unique constraint on `(hazardous_event_id, hazard_type_field_definition_id)`
      named `hazardous_event_field_value_event_id_field_def_id_unique`. The sixth statement
      creates `hazardous_event_custom_field_value` with the equivalent shape against
      `hazard_type_custom_field_definition(id)` `ON DELETE CASCADE` (constraint named
      `hazardous_event_custom_field_value_custom_field_def_id_fk`), and an inline unique
      constraint named `hazardous_event_custom_field_value_evt_id_def_id_unique` on
      `(hazardous_event_id, hazard_type_custom_field_definition_id)`.

      Statements 7-17 are the eleven `CREATE INDEX` statements listed in design.md Decision 6:
      three on `hazard_type_field_definition` (`hazard_type_id`, `data_type`, `unit`), four on
      `hazard_type_custom_field_definition` (`hazard_type_id`, `data_type`, `unit`,
      `country_accounts_id`), two on `hazardous_event_field_value` (`hazardous_event_id`,
      `hazard_type_field_definition_id`, index named with the shortened `field_def_id` form),
      and two on `hazardous_event_custom_field_value` (`hazardous_event_id`,
      `hazard_type_custom_field_definition_id`, index named with the shortened
      `custom_field_def_id` form). Same style as
      `20260907150000_add_hazardous_event_spatial_observation_tables.sql`.
- [x] 11.2 Add the matching entry to `app/drizzle/migrations/meta/_journal.json` — `idx` 53,
      `tag` `20260907170000_add_hazard_type_field_tables`, following the
      `20260907160000_add_hazardous_event_attachment_table` entry at `idx` 52.
- [x] 11.3 Run `yarn dbsync` against a local Postgres and confirm it applies cleanly with no
      errors; verify directly against `information_schema.columns`/
      `information_schema.table_constraints`/`pg_constraint`/`pg_indexes` that all six tables,
      every FK (with correct cascade behavior per design.md Decision 5 — cascade on
      `hazardous_event_id` on both value tables, cascade on both definition-id FKs on the value
      tables, cascade on `country_accounts_id`, no cascade on `hazard_type_id`/`data_type`/`unit`
      on both definition tables), all three composite unique constraints, and all eleven indexes
      exist as written (per the `2c` migration-execution bug — do not trust a clean `yarn dbsync`
      exit code alone).

## 12. Quality gates

- [x] 12.1 `yarn vitest run tests/integration/db/queries/hazardTypeFieldDefinition.test.ts
      tests/integration/db/queries/hazardousEventFieldValue.test.ts` — green.
- [x] 12.2 `yarn tsc` — zero errors.
- [x] 12.3 `yarn format:check` — clean (scoped `npx prettier --check` on the changed `.ts` files;
      `.sql` has no prettier parser, same as prior migrations; `_journal.json` kept in its
      pre-existing 2-space style — clean append, not a full-file reformat).
- [x] 12.4 Anti-pattern review against `.github/skills/anti-pattern-check/SKILL.md` — confirm no
      findings.
- [x] 12.5 Invoke `solid-reviewer` agent on the six new table files — confirm no SOLID
      violations.
- [x] 12.6 Documentation review — any comments explain WHY, not WHAT, terse single-line only.
- [x] 12.7 Project conventions review against `.github/copilot-instructions.md` — confirm no
      violations.
- [x] 12.8 Run `.github/skills/code-review/SKILL.md` in full. Confirm every spec.md scenario
      across both capabilities maps 1:1 to a test, no gaps.
- [x] 12.9 Visual/UX parity — N/A, no presentation-layer file is touched by this change.

## 13. Regression and archive

- [x] 13.1 Run `yarn test:run2` on `feature/he-ca-phase2` (this branch's actual base, before any
      change in this diff) first — record the exact pass/fail/total counts and which test(s)
      fail. Run again after this change's implementation. Confirm the same pre-existing
      failure(s), if any, are unchanged and no new failures were introduced — do not label any
      failure "pre-existing" without this baseline comparison.
- [x] 13.2 Run `opsx:archive` on this branch before raising the PR (PR targets
      `feature/he-ca-phase2`, not `dev`).
