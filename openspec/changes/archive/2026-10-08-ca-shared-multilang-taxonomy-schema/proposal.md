## Why

The HIP taxonomy ER diagram (`_docs/database/hazardous-events/hazardous-events-er-diagram.drawio`)
adds multi-language support on top of `2b`'s already-shipped
`specific_hazard`/`hazard_cluster`/`hazard_type` tables. Today those tables store a single
plain-text `name` column, which cannot hold more than one language and cannot be searched by
free-text input in an unknown locale. This is a hard prerequisite for `5i`
(`DrizzleHazardTaxonomyRepository`), which will query these exact tables, and for the
hazard-filter free-text search use case these tables exist to serve.

## What Changes

- Add a Shared Kernel (`app/domains/shared/infrastructure/`) translation primitive, three new
  tables: `language` (`id`, `language_name`, `language_cd`), `text_content` (`id`,
  `original_text`, `original_language_id` FK), `translation` (`id`, `text_content_id` FK,
  `language_id` FK, `translation`). Generic, domain-agnostic storage — matches
  `flexibleDateFormat.ts`'s existing Shared Kernel placement (a small, non-business-logic
  shared rule, not its own bounded context).
- **BREAKING (schema-internal only, no live consumer)**: drop `specific_hazard.name`,
  `hazard_cluster.name`, `hazard_type.name`; replace each with `name_text_content_id` (FK to
  `text_content.id`). `specific_hazard` additionally gains `description_text_content_id`
  (nullable FK) — a genuinely new capability, `2b` never had a `description` column on this
  table. All three gain a nullable, unique `source_ref_id` (text) tracking the external HIPs
  source system's own id (Drupal today).
- Migration auto-backfills every existing `specific_hazard`/`hazard_cluster`/`hazard_type`
  row's current `name` into a freshly-created `text_content` row (one per source row, no
  dedup) before dropping `name` — no manual data-fix step. `specific_hazard.description` has
  no existing column to source from today, so `description_text_content_id` is `NULL` on every
  backfilled row (see design.md). Every created `text_content` row also gets a same-language
  `translation` row alongside it (standing invariant — `translation` is always the complete,
  single table for search/display; `text_content.original_text`/`original_language_id` become
  provenance metadata only — see design.md Decision 5).
- `hazard_driver.name` is explicitly out of scope — no translation support needed there.
- Update the 6 PGlite test files that insert a plain `name` value directly against these three
  tables (3 named in the roadmap intent, plus 3 more found by a full-repo grep — see Impact)
  and the `testSchema` mirrors, per the `P1-42` convention.
- `_docs/decisions/ADR-001-multilingual-strategy.md`: add a new Decision subsection
  documenting this as a **third, parallel** content-translation mechanism, alongside — not
  replacing — the existing Weblate + JSONB content-hash pipeline (`zeroStrMap` JSONB columns +
  `yarn export_tables_for_translation` + Weblate + `dts_jsonb_localized`, which remains the
  single-locale display-resolution mechanism for sectors/assets/the legacy
  `hip_hazard`/`hip_cluster`/`hip_type` tables and is untouched here). This normalized
  `text_content`/`translation`/`language` mechanism exists for free-text filter search across
  unknown-locale input, which the JSONB pipeline was never built to do. Also correct ADR-001's
  Context section, whose "en, ar, ru, with fr, es, zh partially available" (6 total) is stale
  — `app/utils/lang.backend.ts`'s `VALID_LANGUAGES` (9: adds `sr`, `sq`, `tg`) is the actual
  source of truth, confirmed live and current (consumed by `i18next.server.ts`,
  `{Create,Update}NoticeRequest.ts`, `AcceptLanguageI18nResolver.server.ts`, with real locale
  JSON files for all 9 under `locales/app/`/`locales/content/`) — a factual correction, done
  here only because this ADR is already being touched.
- `language` is seeded with all 9 `VALID_LANGUAGES` codes (not just the 6 ADR-001's stale
  Context section names), per the above.

Translator-maintenance workflow for rows created after the backfill is out of scope
(`DEF-036`) — schema + migration + automatic backfill only.

## Capabilities

### New Capabilities

- `shared-translation-schema`: persisted shape and constraints of the Shared Kernel
  `language`/`text_content`/`translation` tables.

### Modified Capabilities

- `hip-hierarchy-schema`: the `hazard_type`, `hazard_cluster`, and `specific_hazard`
  requirements change column shape — `name` (text) is replaced by `name_text_content_id`
  (FK), `specific_hazard` gains `description_text_content_id`, and all three gain
  `source_ref_id`. The `hips_version` requirement and the chain-integrity requirement are
  unaffected and not included in this delta.

## Impact

- **Files** (new):
  - `app/domains/shared/infrastructure/languageTable.ts`
  - `app/domains/shared/infrastructure/textContentTable.ts`
  - `app/domains/shared/infrastructure/translationTable.ts`
  - `tests/integration/db/testSchema/languageTable.ts`,
    `textContentTable.ts`, `translationTable.ts` (re-export mirrors, required for
    `pushSchema` to resolve the new FKs — not optional, see design.md)
  - `tests/integration/db/queries/language.test.ts`, `textContent.test.ts`,
    `translation.test.ts` — the three new Shared Kernel tables' own schema-shape tests
  - `app/drizzle/migrations/<timestamp>_add_shared_multilang_taxonomy.sql` (hand-authored,
    `--> statement-breakpoint` between every statement) + matching `meta/_journal.json` entry
  - A dedicated migration-boundary test exercising the raw backfill SQL against a
    pre-migration-shaped PGlite instance (see design.md — the standard `pushSchema`-based
    PGlite tier only ever sees the final shape, so it cannot itself prove the backfill works)
  - `tests/integration/db/models/textContentTestHelpers.ts` — shared `seedTextContent()`/
    `getOrCreateLanguage()` test helper (Decision 5's invariant), used by all six touched test
    files in this intent
- **Files** (modified):
  - `app/domains/hazardous-events/infrastructure/specificHazardTable.ts`,
    `hazardClusterTable.ts`, `hazardTypeTable.ts` — drop `name`, add
    `nameTextContentId`/`sourceRefId` (+ `descriptionTextContentId` on `specific_hazard` only)
  - `tests/integration/db/queries/hazardousEventSpecificHazard.test.ts`,
    `hipHierarchyChain.test.ts`, `specificHazard.test.ts` — the 3 files named in the roadmap
    intent
  - `tests/integration/db/queries/hazardType.test.ts`, `hazardCluster.test.ts` — **found by a
    full-repo grep of `.insert(hazardTypeTable)`/`.insert(hazardClusterTable)`, not named in
    the roadmap's own "Files touched" list; both insert a plain `name` value and will fail to
    compile/run once `name` is dropped**
  - `tests/integration/db/models/hazardTypeFieldDefinitionTestHelpers.ts` — **also found by
    the same grep; its `seedHazardType()` helper inserts a plain `name` and is shared by other
    tests outside this intent's stated scope (`hazardTypeFieldDefinition.test.ts`,
    `hazardousEventFieldValue.test.ts`, and `hazardousEventSpecificHazard.test.ts` itself) —
    fixing it here is required for those tests to keep compiling, even though they test
    unrelated behavior**
  - `tests/integration/db/testSchema/specificHazardTable.ts`,
    `hazardClusterTable.ts`, `hazardTypeTable.ts` — re-exports, unaffected in content but
    listed for completeness (they already re-export, no change needed)
  - `tests/integration/db/testSchema/index.ts` — barrel export additions for the 3 new
    Shared Kernel testSchema re-exports
  - `_docs/decisions/ADR-001-multilingual-strategy.md` — new Decision subsection (addition,
    not a correction of the existing Weblate/JSONB claim), plus a one-sentence factual
    correction to the Context section's stale 6-language claim
- **DB migration**: required (`yarn dbsync`), **destructive** (drops `name` on 3 live tables)
  with an automatic backfill — not purely additive like `2b`. See design.md Migration Plan for
  the safe column-add-then-drop ordering and rollback.
- **Multi-tenancy / auth**: none. `language`/`text_content`/`translation` are global reference
  data, matching the existing HIP hierarchy tables — no `country_accounts_id`, no route,
  loader, or action touches them in this intent.
- **Existing code**: zero behavioral impact outside the 3 migrated tables and the 6 test
  files above. `hazardousEventTable.specificHazardId` is an opaque FK, unaffected by how
  `specific_hazard.name` is stored. The legacy `hip_hazard`/`hip_cluster`/`hip_type` tables
  and their own JSONB i18n (`20260109060059_multi_lang_hips_sectors_assets.sql`) are untouched.
- **Test approach**: PGlite (`yarn test:run2`) for the final schema shape (not-null, FK,
  unique-constraint rejection on the new/changed columns) — same tier as `2b`. The backfill
  itself needs a separate, dedicated PGlite-based migration test (raw `PGlite` client, not the
  `pushSchema`-built `dr`), because `pushSchema` only ever builds the _final_ shape and never
  sees a pre-migration row. `yarn dbsync` against real local Postgres remains the final check
  for the hand-authored SQL, per `2b`'s own convention.
