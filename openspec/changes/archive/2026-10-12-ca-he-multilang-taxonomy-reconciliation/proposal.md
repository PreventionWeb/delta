## Why

`5l` (`openspec/changes/archive/2026-10-08-ca-shared-multilang-taxonomy-schema/`) and a
parallel, independently-built migration from another team member (tickets #774/#794,
commits `6d98c11c`/`c42affd1` on `dev`) both add the same conceptual thing — `language`/
`text_content`/`translation` Shared Kernel tables, and a `name_text_content_id`-based
rewrite of `specific_hazard`/`hazard_cluster`/`hazard_type` — as two independent,
irreconcilable migrations against the same physical tables. Shipping both would corrupt
the schema. The other team's migration does a full legacy-data re-import (`hip_class`/
`hip_cluster`/`hip_hazard` → deterministic hash-based UUIDs) that `5l`'s own migration
never attempted, so it is adopted going forward; `5l`'s own migration is retracted. Four
kinds of regressions the adopted migration introduces relative to `5l`'s already-tested,
already-decided design are corrected on top of it — a column rename, a missing cascade,
and a `NOT NULL` gap were named by the user up front (the `NOT NULL` gap originally scoped
to 3 columns); Phase 0 investigation then found the `NOT NULL` gap actually spans 9
columns, not 3, and surfaced a fourth, previously-unnamed regression (a reversed
translation invariant, fixed by a backfill) — both confirmed with the user before being
folded in (see "Decisions Finalized During Review" below).

## What Changes

- **Retract** `5l`'s own migration: delete
  `app/drizzle/migrations/20261008000000_add_shared_multilang_taxonomy.sql` and its
  `meta/_journal.json` entry. Confirmed never applied to any shared database (only ever
  run against a local `dts_development` instance) — a clean retraction, not a rollback of
  applied state.
- **Adopt** the other team's migration as-is (`20261009042834_...`/`20261009091033_...`,
  already committed on `dev`) — not modified by this change.
- **Add** one new, small correction migration running after both adopted migrations,
  fixing four regressions relative to `5l`'s decided design:
  - Rename `hazard_type.hip_version_id` → `hips_version_id` (typo fix, restoring `2b`'s
    original, correctly-spelled name) and its FK constraint.
  - Add `ON DELETE CASCADE` to `translation.text_content_id`'s FK (currently defaults to
    `NO ACTION`/`RESTRICT`-equivalent).
  - Add `NOT NULL` to all nine columns the adopted migration left nullable: the three
    named `name_text_content_id` columns on `hazard_type`, `hazard_cluster`,
    `specific_hazard` (currently nullable, relying only on the import's own discipline),
    plus six more found by Phase 0 investigation and confirmed in scope:
    `hazard_type.hips_version_id` (covered by the same statement that renames it),
    `hazard_cluster.hazard_type_id`, `specific_hazard.hazard_cluster_id`,
    `text_content.original_language_id`, `translation.text_content_id`,
    `translation.language_id`.
  - Backfills every pre-existing `text_content` row that lacks a same-language
    `translation` row (`INSERT INTO translation (text_content_id, language_id,
    translation) SELECT id, original_language_id, original_text FROM text_content WHERE
    NOT EXISTS (SELECT 1 FROM translation t WHERE t.text_content_id = text_content.id AND
    t.language_id = text_content.original_language_id)`), closing the gap left by the
    adopted migration's own step 7, which explicitly excludes a row's original language
    from getting a `translation` row (see "Decisions Finalized During Review" below).
  - `language.language_cd`'s `varchar(2)` type (the adopted migration's choice) is kept
    as-is — a deliberate call, not touched.
- **BREAKING, schema-internal, no live consumer**: the nine corrected NOT NULL
  constraints and the renamed column are breaking only for a future writer of these
  tables; no live route, loader, or action references them today (confirmed, same as
  `5l`'s own Impact finding).
- Update `app/domains/shared/infrastructure/languageTable.ts`'s `languageCd` field to
  `varchar(2)` (currently `text` + length-2 check) to match the real column type;
  everything else already declared in the TypeScript schema files on this branch already
  matches the corrected target shape — confirmed by direct inspection, not assumed (see
  design.md Decision 1).
- Retire `tests/integration/db/queries/sharedMultilangTaxonomyBackfill.test.ts` entirely
  — it tested `5l`'s own now-deleted migration's backfill mechanics, which the adopted
  migration does not share (full DROP+rebuild vs. column-add-then-backfill).
- Add one new, narrowly-scoped migration-boundary test proving the correction migration's
  own four fixes apply correctly (see design.md Decision 4 — this is new ground beyond
  the literal file list in the originating intent, flagged as such).
- Confirm (not necessarily change) `tests/integration/db/queries/language.test.ts`,
  `textContent.test.ts`, `translation.test.ts` continue to pass against the corrected
  schema.

**This proposal does not relitigate the overall "adopt their migration" call.** Two scope
questions surfaced by Phase 0 investigation were raised as blocking Open Questions in an
earlier draft of this proposal and have since been resolved by the user; both resolutions
are reflected directly in "What Changes" above and in design.md. Recorded here for audit
trail.

## Decisions Finalized During Review

1. **Same-language `translation` invariant: resolved as (a) — backfill, preserve the
   invariant.** `5l` Decision 5 (also recorded in `ADR-001-multilingual-strategy.md`)
   states every `text_content` row MUST have a same-language `translation` row, and that
   `translation` — not `text_content.original_text` — is the single table queries read
   from. The adopted migration's own step 7 does the opposite: it inserts a `translation`
   row for every language found in the legacy JSONB **except** the row's own original
   language (`WHERE l.language_id <> tc.original_language_id`), with an explicit comment:
   "The original language is stored only in `text_content`, not in `translation`." Left
   alone, this would mean no English row exists in `translation` for any of the migrated
   names, breaking any future consumer that reads hazard names only via `translation`
   (as `5i`'s planned `DrizzleHazardTaxonomyRepository` would, per ADR-001). **Decision:
   the correction migration backfills the missing same-language `translation` rows**
   (SQL in design.md Decision 2), preserving the already-decided `5l`/`ADR-001` invariant
   rather than reversing it. `ADR-001` itself is unchanged — no reversal needed.
2. **NOT NULL scope: resolved as all 9 columns, not just the 3 named.** The adopted
   migration's `CREATE TABLE` statements omit `NOT NULL` on six columns beyond the three
   named `name_text_content_id` ones: `hazard_type.hips_version_id` (the same column
   being renamed), `hazard_cluster.hazard_type_id`, `specific_hazard.hazard_cluster_id`,
   `text_content.original_language_id`, `translation.text_content_id`,
   `translation.language_id`. The current main specs (`hip-hierarchy-schema`,
   `shared-translation-schema`) already require all nine as `NOT NULL`, and the
   TypeScript schema on this branch already declares `.notNull()` on every one of them.
   **Decision: fix all nine** — the correction migration adds `NOT NULL` to all six
   additional columns alongside the three originally named.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `hip-hierarchy-schema`: removes the "existing taxonomy names are preserved across the
  multi-language migration" requirement, which described `5l`'s own retracted backfill
  mechanics — the adopted migration does a structurally different full re-import with no
  equivalent backfill to specify. No other requirement text changes: the table-shape
  requirements for `hazard_type`/`hazard_cluster`/`specific_hazard` already state
  `name_text_content_id` as `NOT NULL` and `hazard_type.hips_version_id` by its correct
  name — those requirements were already correct; this change closes an *implementation*
  gap against them (the adopted migration's real DB didn't yet satisfy what the spec
  already required), not a spec change.

- `shared-translation-schema`: its existing `translation` table requirement already
  states `ON DELETE CASCADE` in full and already has a cascade-delete scenario —
  unchanged, no delta needed for that part (implementation-gap-not-spec-gap, same
  reasoning as above). This capability DOES gain one new requirement: every
  `text_content` row populated by the HIPs taxonomy migration (adopted migration plus its
  correction) must resolve to a same-language `translation` row — the observable outcome
  of Decision 1 above (the backfill). This was previously only stated in `5l`'s own
  design.md and `ADR-001`, never as a capability-spec requirement; it becomes one here
  because its enforcing mechanism (the retracted migration) no longer exists and the
  invariant needs a durable home that doesn't depend on a single migration file.

## Impact

- **Files deleted**:
  - `app/drizzle/migrations/20261008000000_add_shared_multilang_taxonomy.sql` — `5l`'s own
    retracted migration.
  - `tests/integration/db/queries/sharedMultilangTaxonomyBackfill.test.ts` — tested the
    retracted migration's own backfill mechanics, not applicable to the adopted migration.
- **Files added**:
  - `app/drizzle/migrations/20261011000000_fix_hips_multilang_corrections.sql` — the new
    correction migration (timestamp later than `20261009091033`, see design.md): column
    rename, cascade FK, nine-column `NOT NULL`, and the same-language `translation`
    backfill.
  - Matching `app/drizzle/migrations/meta/_journal.json` entry.
  - A new migration-boundary PGlite test covering all four of the correction migration's
    fixes (file name and scope — see design.md Decision 4; not one of the three files the
    originating intent named for rewrite, flagged as new).
- **Files modified**:
  - `app/domains/shared/infrastructure/languageTable.ts` — `languageCd` becomes
    `varchar(2)` (currently `text` + check).
- **Files confirmed as already correct, no change** (verified by direct inspection, not
  assumed — see design.md Decision 1):
  - `app/domains/shared/infrastructure/translationTable.ts` — already declares
    `onDelete: "cascade"` on `textContentId`.
  - `app/domains/hazardous-events/infrastructure/hazardTypeTable.ts` — already names the
    field `hipsVersionId`/column `hips_version_id` correctly; only the adopted migration's
    raw SQL column name was ever wrong.
  - `app/domains/hazardous-events/infrastructure/hazardClusterTable.ts`,
    `specificHazardTable.ts` — `nameTextContentId` already `.notNull()`.
  - `tests/integration/db/queries/translation.test.ts` — already has a cascade-delete
    test (predates the adopted migration); becomes the acceptance test proving the
    correction migration's CASCADE fix, no new test needed.
  - `tests/integration/db/queries/hazardType.test.ts`, `hazardCluster.test.ts`,
    `specificHazard.test.ts` — already have a `nameTextContentId`-required
    (`@ts-expect-error`) test each; no new NOT NULL test needed for the three named
    columns.
- **DB migration**: required (`yarn dbsync`), additive/corrective only — no new table, no
  destructive drop (the adopted migration already did the destructive rebuild; this
  change's own migration is `ALTER`+`INSERT`-only: rename column, drop+re-add one FK with
  cascade, set `NOT NULL` on nine existing columns, backfill missing same-language
  `translation` rows).
- **Multi-tenancy / auth**: none — `language`/`text_content`/`translation` and the HIP
  hierarchy tables are global reference data, no `country_accounts_id`, no route/loader/
  action touches them, same conclusion as `5l`'s own Impact section.
- **Merge/rebase precondition (not a file change, but required before implementation)**:
  the implementation branch must contain commits `6d98c11c` and `c42affd1` (confirmed, as
  of this proposal, NOT ancestors of `feature/he-ca-phase5`). Merging/rebasing will
  produce conflicts in `app/drizzle/migrations/meta/_journal.json` and in every test file
  `5l` already updated to use `nameTextContentId` that `dev` still has on the pre-`5l`
  plain-`name` shape (`hazardType.test.ts`, `hazardCluster.test.ts`, `specificHazard.test.ts`,
  `hipHierarchyChain.test.ts`, `hazardousEventSpecificHazard.test.ts`,
  `hazardTypeFieldDefinitionTestHelpers.ts`). See design.md Decision 5 for the exact
  resolution rule per file.
- **Spec deltas**: `specs/hip-hierarchy-schema/spec.md` (REMOVED requirement, retracted
  migration's stale backfill description) and `specs/shared-translation-schema/spec.md`
  (ADDED requirement, the same-language `translation` invariant as an observable,
  migration-outcome behavior — see "Decisions Finalized During Review").
- **Test approach**: PGlite (`yarn test:run2`) for the corrected final shape and for the
  new correction-migration-boundary test; `yarn dbsync` against real local Postgres as
  the final sign-off, per `2b`/`5l`'s own convention. No E2E tier — pure schema/migration
  change, no presentation-layer file touched.
