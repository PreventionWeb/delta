## Context

`2b` (`openspec/changes/archive/2026-09-04-ca-he-hip-hierarchy-schema/`) shipped
`specific_hazard`/`hazard_cluster`/`hazard_type`/`hips_version` as a uuid-keyed, 4-level
chain with plain-text `name` columns, hand-authored migration SQL (not `drizzle-kit
generate`), and schema files under `app/domains/hazardous-events/infrastructure/` per
ADR-009. This intent follows that same shape and convention, migrating the same live
tables — not a greenfield design.

The target ER diagram (`_docs/database/hazardous-events/hazardous-events-er-diagram.drawio`,
verified field-by-field against the raw XML, not the roadmap prose) adds three new tables
(`language`, `text_content`, `translation`) in its own swimlane, plus new columns on the
three existing hazard tables. Exact field list, verified against cell ids
`eDjk6iD8Mp8MSx61uKv3-{8,18,28}` (new tables) and `KqZPbQY2Lv0Ew4p42Cft-{61,74,85}` (modified
tables, first/authoritative occurrence of `hazard_type` per the task brief):

| Table                       | Columns (diagram order)                                                                                                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `language`                  | `id` (uuid, PK), `language_name` (text, NN+UQ), `language_cd` (text, 2 chars, NN+UQ)                                                                                                        |
| `text_content`              | `id` (uuid, PK), `original_text` (text, NN), `original_language_id` (uuid, FK → `language.id`)                                                                                              |
| `translation`               | `id` (uuid, PK), `text_content_id` (uuid, FK → `text_content.id`), `language_id` (uuid, FK → `language.id`), `translation` (text, NN)                                                       |
| `specific_hazard` (changed) | `id` (uuid, PK), `name_text_content_id` (uuid, FK), `code` (text, NN, unchanged), `hazard_cluster_id` (FK, unchanged), `source_ref_id` (text, UQ), `description_text_content_id` (uuid, FK) |
| `hazard_cluster` (changed)  | `id` (uuid, PK), `name_text_content_id` (uuid, FK), `hazard_type_id` (FK, unchanged), `source_ref_id` (text, UQ)                                                                            |
| `hazard_type` (changed)     | `id` (uuid, PK), `name_text_content_id` (uuid, FK), `hips_version_id` (FK, unchanged), `source_ref_id` (text, UQ)                                                                           |

As in `2b`, the diagram's NN/FK badges are mutually exclusive on every row (no row carries
both), so absence of "NN" on an FK row is not evidence of nullability either way — resolved
below by the same precedent-based reasoning `2b` Decision 4 used, flagged per-column.

## Goals / Non-Goals

**Goals:** the three new Shared Kernel tables, the three hazard tables migrated to reference
them, a correct and safe automatic backfill of every existing row, testable in PGlite for
final shape and in a dedicated migration test for the backfill itself.

**Non-Goals:**

- Wiring these tables into any route, model, `fieldsDef`, or the hazard-filter search query
  itself (that's `5i`'s `DrizzleHazardTaxonomyRepository`) — pure schema + migration.
- Translator-maintenance tooling for rows created after the backfill (`DEF-036`).
- Orphan cleanup of `text_content`/`translation` rows when the owning hazard row is deleted
  — not addressed by this intent; deferred alongside `DEF-036`.
- `hazard_driver.name` translation support (user-confirmed out of scope).
- Touching `hip_hazard`/`hip_cluster`/`hip_type` or their JSONB i18n — separate, untouched
  pipeline.

## Decisions

**1. Shared Kernel placement: `app/domains/shared/infrastructure/` (new directory).**
`app/domains/shared/domain/` already exists (`flexibleDateFormat.ts`) as this project's
precedent for a small, generic, non-business-logic shared rule that doesn't warrant its own
bounded context. `language`/`text_content`/`translation` are pure storage primitives with no
domain behavior — same class of thing. `infrastructure/` is new under `shared/` (sibling to
the existing `domain/`), matching ADR-009's layer-nested-inside-context structure.

**2. Nullability — resolved per-column, same precedent-based method as `2b` Decision 4:**

- `language.language_name`, `language.language_cd`: diagram marks both `NN, UQ` explicitly —
  not ambiguous, applied as written.
- `text_content.original_text`: diagram marks `NN` explicitly — applied as written.
- `text_content.original_language_id`: FK-only badge (ambiguous by the mutual-exclusivity
  rule). Decided **NOT NULL** — whoever writes a `text_content` row always knows what
  language they're writing in; an "unknown original language" state has no legitimate use
  case here, unlike `2b`'s hierarchy FKs where the ambiguity was about hierarchy placement,
  not authorship.
- `translation.text_content_id`, `translation.language_id`: FK-only badges (ambiguous).
  Decided **NOT NULL** — a `translation` row with no parent text or no language is
  meaningless; same reasoning as `2b` Decision 4.
- `specific_hazard.name_text_content_id`, `hazard_cluster.name_text_content_id`,
  `hazard_type.name_text_content_id`: FK-only badges (ambiguous). Decided **NOT NULL** — every
  hazard-taxonomy row must have a name; matches the invariant the old `name NOT NULL` column
  already enforced.
- `specific_hazard.description_text_content_id`: FK-only badge, but the roadmap intent
  explicitly says "if populated," confirming nullability is intentional, not diagram
  ambiguity. Decided **nullable**.
- `source_ref_id` on all three hazard tables: UQ badge, no NN badge, and the roadmap intent
  describes backfilling only `name`/`description` — never `source_ref_id` — for existing
  rows. Decided **nullable + UNIQUE** (Postgres allows multiple `NULL`s under a UNIQUE
  constraint, so every pre-existing row gets `NULL` without conflict; a future HIPs import
  populates it going forward).

**3. `language_cd` type: `text` with a `CHECK (char_length(language_cd) = 2)` constraint**,
not `varchar(2)`. No table in this codebase uses `varchar` — every fixed-shape short string
(`hips_version.version_no`, `hazard_driver.name`, etc.) uses `text`, with `check()` reserved
for enum-like constraints (`workflow_instance.status`, per `2a`). This follows that
convention rather than introducing `varchar` as a one-off.

**4. `onDelete` behavior — three different FKs, three different answers, stated explicitly
because `2b`'s blanket "no cascade" doesn't fit every FK introduced here:**

- `translation.text_content_id` → `text_content.id`: **`ON DELETE CASCADE`.** A `translation`
  row has no independent existence or meaning outside its parent `text_content` row — it is
  owned by it, not a reference-data link to it. This is the one FK in this intent that is NOT
  reference data, unlike every FK `2b` introduced.
- `translation.language_id` → `language.id`: no `onDelete` (Postgres default `NO ACTION`,
  behaviorally equivalent to `RESTRICT` here since no constraint is deferred). `language`
  rows are seed/reference data that are never deleted in normal operation; matches `2b`'s
  reference-data default.
- `specific_hazard.name_text_content_id` / `description_text_content_id`,
  `hazard_cluster.name_text_content_id`, `hazard_type.name_text_content_id` → `text_content.id`:
  no `onDelete` (same `NO ACTION` default). Deleting a `text_content` row while a
  hazard-taxonomy row still names itself via it would silently break that row's name; not
  allowed. (Orphan cleanup when the owning hazard row itself is deleted is a Non-Goal above,
  not addressed by this FK direction.)
- `text_content.original_language_id` → `language.id`: no `onDelete`, same reasoning as
  `translation.language_id`.

**5. Standing invariant — resolved with user 2026-10-07: every `text_content` row MUST have
a same-language `translation` row created alongside it, unconditionally.** Every time a
`text_content` row is created — this migration's backfill, or any future writer — a
`translation` row MUST also be created in the same statement sequence, with
`language_id` = that `text_content` row's own `original_language_id` and `translation` =
that row's own `original_text`. This makes `translation` the single, always-complete table
for search/display in any language, including the row's own original one.
`text_content.original_text`/`original_language_id` become pure provenance metadata (what
language this was authored in) and are never read directly by a search or display query —
only `translation` is. The existing `UNIQUE (text_content_id, language_id)` constraint on
`translation` already accommodates this; no schema change is needed, only the backfill SQL
(Decision 7) and this documented rule.

This intent's own backfill follows the rule (see Decision 7's SQL). **Enforcement for any
future writer of `text_content`** — a DB trigger vs. an application-layer contract the write
use case must honor — is intentionally **not decided here**; that's a design question for
whichever future intent adds a real write path to these tables (likely `5i`/`DEF-036`'s
territory), not something `5l` must resolve.

**6. `language` seed rows — settled: all 9 of `app/utils/lang.backend.ts`'s
`VALID_LANGUAGES`** (`ar`, `zh`, `en`, `fr`, `ru`, `es`, `sr`, `sq`, `tg`), not ADR-001's
Context section's "6" — that list is confirmed stale (ADR-001's own Context is corrected as
part of this intent, task 7.1), while `VALID_LANGUAGES` is live and current, actively
consumed by `app/middleware/i18next.server.ts`,
`app/domains/notices/presentation/dto/{Create,Update}NoticeRequest.ts`, and
`app/shared/i18n/AcceptLanguageI18nResolver.server.ts`, with real locale JSON files present
for all 9 codes under `locales/app/` and `locales/content/`. `en` is used for the backfill's
`original_language_id`, mirroring the same "treat HIPs-standard content as English"
assumption the existing Weblate pipeline already makes for the predecessor
`hip_type`/`hip_cluster`/`hip_hazard` content — not a new guess. Decision 5 also means a
wrong `original_language_id` tag would only mislabel provenance, never affect the stored or
searchable text itself, making this low-risk and cheap to correct later if ever wrong.

`language_name` values (no existing display-name list was found anywhere in `app/` to
follow — grepped for one): `English`, `Arabic`, `Russian`, `French`, `Spanish`, `Chinese`,
`Serbian`, `Albanian`, `Tajik`, paired with `language_cd`
`en`/`ar`/`ru`/`fr`/`es`/`zh`/`sr`/`sq`/`tg` respectively, in that order.

**7. Migration mechanics — column add, backfill, then constrain, then drop (not a single-step
`ALTER ... DROP name, ADD name_text_content_id`):**

```sql
-- per table, illustrated for specific_hazard:
ALTER TABLE specific_hazard ADD COLUMN name_text_content_id uuid;
--> statement-breakpoint
UPDATE specific_hazard SET name_text_content_id = gen_random_uuid();
--> statement-breakpoint
INSERT INTO text_content (id, original_text, original_language_id)
  SELECT name_text_content_id, name, (SELECT id FROM language WHERE language_cd = 'en')
  FROM specific_hazard;
--> statement-breakpoint
-- Decision 5's invariant: every text_content row gets a same-language translation row too.
INSERT INTO translation (text_content_id, language_id, translation)
  SELECT tc.id, tc.original_language_id, tc.original_text
  FROM text_content tc
  JOIN specific_hazard sh ON sh.name_text_content_id = tc.id;
--> statement-breakpoint
ALTER TABLE specific_hazard
  ADD CONSTRAINT specific_hazard_name_text_content_id_fk
  FOREIGN KEY (name_text_content_id) REFERENCES text_content(id);
--> statement-breakpoint
ALTER TABLE specific_hazard ALTER COLUMN name_text_content_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE specific_hazard DROP COLUMN name;
```

Each existing row gets its own freshly-generated `text_content` row — no deduplication by
`name` text, because names can legitimately repeat across rows and across the three tables
(e.g. two `specific_hazard` rows with the same display name under different clusters), and
deduplicating would make the two rows' names inseparably linked (editing one's translation
would silently change the other's). The same 7-statement shape (add column → backfill
`UPDATE` → `INSERT` into `text_content` → `INSERT` into `translation` → add FK → set
`NOT NULL` → drop `name`) repeats for `hazard_cluster.name` and `hazard_type.name` — both
have a legacy `name` column to migrate away from, same as `specific_hazard.name` above.

**`specific_hazard.description_text_content_id` does NOT follow this 7-statement shape.**
There is no pre-existing `description` column on `specific_hazard` to source a backfill
from, so there is nothing to `UPDATE`, nothing to `INSERT` into `text_content`/`translation`,
no value to ever be `NOT NULL`, and no old column to `DROP`. It is two statements:

```sql
ALTER TABLE specific_hazard
  ADD COLUMN description_text_content_id uuid;
--> statement-breakpoint
ALTER TABLE specific_hazard
  ADD CONSTRAINT specific_hazard_description_text_content_id_fk
  FOREIGN KEY (description_text_content_id) REFERENCES text_content(id);
```

left nullable, `NULL` on every row (pre-existing and newly inserted alike) until a future
writer populates it — do not run the backfill UPDATE/INSERT steps against it; doing so would
either need a fabricated `original_text` value (violating `text_content.original_text NOT
NULL` with no real content to put there) or silently create meaningless empty rows.

The `language` table and its `en` seed row must be inserted before any of the backfill
blocks above run. Every statement in this file —
without exception — is separated by `--> statement-breakpoint`: a hand-authored migration
missing a breakpoint between statements can be silently marked fully applied by `drizzle-kit
migrate` without every statement actually running (project convention, see
`feedback_migration_statement_breakpoint` lesson). `2a`'s workflow migration (pure
`CREATE TABLE` × 3, no DML) is not cited here as a safe model to follow for this reason —
this migration mixes DDL and DML across statements within one file and cannot omit any
breakpoint.

**8. `source_ref_id` UNIQUE constraint is added last**, after the column exists with all rows
`NULL`, so it never conflicts with backfilled data.

**9. Test tier — PGlite covers final shape only; a dedicated migration test covers the
backfill.** `tests/integration/db/setup.ts` builds the test `dr` via `drizzle-kit/api`'s
`pushSchema` against the `testSchema` barrel — i.e., it generates DDL for the _current_
schema file contents directly, with no concept of "before" and "after" a migration. A test
written against that `dr` can never see a pre-migration `name` column, so it cannot exercise
the backfill UPDATE/INSERT logic at all — only the final FK/not-null/unique shape (same
limitation `2b` had, but `2b`'s migration was pure `CREATE TABLE`, so there was no backfill
logic to miss testing).

Because this migration is destructive (drops `name`) and auto-backfills with no manual
fix step, the backfill logic is the highest-risk part of this change and needs its own
coverage, not just a `yarn dbsync` + manual inspection pass:

- A dedicated test (`tests/integration/db/queries/sharedMultilangTaxonomyBackfill.test.ts`)
  opens its own raw `PGlite` client (not the mocked `dr`), creates the minimal pre-migration
  DDL subset for `hips_version`/`hazard_type`/`hazard_cluster`/`specific_hazard` (plain `name`
  column, matching today's live schema exactly), seeds a handful of rows (including one
  `specific_hazard` row, since the diagram and roadmap only ever discuss backfilling
  `specific_hazard.description` and no column exists for it today — nothing to seed there),
  reads the real hand-authored migration SQL file, splits it on `--> statement-breakpoint`,
  executes each statement in order, then asserts: `name` no longer exists on any of the three
  tables; every pre-existing row's `name_text_content_id` resolves through `text_content` to
  the original string; **for every backfilled row, a `translation` row exists with
  `text_content_id` = that row's `name_text_content_id`, `language_id` = the seeded `en`
  row, and `translation` text equal to the original `name` string** (Decision 5's invariant —
  `description_text_content_id` is excluded from this assertion: per Decision 7's note, it is
  never backfilled and stays `NULL`, so no `text_content`/`translation` row exists for it at
  all); `language` contains the seeded nine rows with `en` present; `source_ref_id` is `NULL`
  and the unique constraint still allows multiple `NULL`s (insert a second row post-migration
  with no `source_ref_id`, confirm it succeeds).
- The PGlite-via-`pushSchema` tier (same as `2b`) covers the _final_ shape in isolation:
  not-null rejection on `name_text_content_id`, FK rejection on a dangling
  `name_text_content_id`/`text_content_id`/`language_id`, unique-constraint rejection on a
  duplicate non-null `source_ref_id`/`language_cd`/(`text_content_id`,`language_id`) pair, and
  cascade-delete behavior on `translation.text_content_id`.
- `yarn dbsync` against real local Postgres remains the final sign-off, inspecting
  `information_schema`/`pg_constraint`, per `2b`'s own convention — kept as a task, not a
  replacement for the two automated tiers above.

**10. Test schema barrel — re-export, not duplicate, matching `2b` Decision 8.**
`tests/integration/db/testSchema/languageTable.ts`, `textContentTable.ts`,
`translationTable.ts` each do `export * from
"~/domains/shared/infrastructure/<name>Table"`. These are **required**, not optional —
`pushSchema` resolves `specific_hazard.name_text_content_id`'s FK target by walking the
`testSchema` barrel's exports; without a mirror for `text_content`, the FK target is
undefined and `pushSchema` fails for every table in this intent, not just the new ones.

**11. `drizzle.config.ts`'s `schema: "./app/drizzle/schema/*"` glob is irrelevant here**,
same as it was for `2b`. `yarn dbsync` runs `drizzle-kit migrate`, which replays the
hand-authored SQL files in `app/drizzle/migrations/` directly against `_journal.json` — it
never re-derives SQL from the `schema` glob. No config change is needed for these
Shared-Kernel-located files to be picked up by `dbsync`.

**12. Existing-consumer check before finalizing.** Grepped `scripts/` and `app/` for any
writer to `specific_hazard`/`hazard_cluster`/`hazard_type` beyond the files already listed in
Impact — found none. `scripts/import_translation_tables.ts` (→
`importTranslationsIfNeeded`) is the existing Weblate/JSONB pipeline's own script, unrelated
to and untouched by this intent.

## Risks / Trade-offs

- [Decision 5's invariant (every `text_content` row must have a same-language `translation`
  row) is stated here but its enforcement for future writers is explicitly left undecided] →
  acceptable for `5l`, since this intent's own backfill is the only writer today and it
  follows the rule directly in SQL; whichever intent adds the next real write path must pick
  trigger-vs-application-contract enforcement before that path ships.
- [Migration is destructive — drops `name` on 3 live tables with real production rows,
  unlike `2b`'s purely additive `CREATE TABLE`s] → mitigated by the add-then-backfill-then-drop
  ordering (Decision 7) and the dedicated migration-boundary test (Decision 9); rollback below
  rebuilds `name` from `text_content.original_text` if needed.
- [`ON DELETE CASCADE` on `translation.text_content_id` is the first cascade FK in this
  table family — every other FK `2b` and this intent introduce defaults to `RESTRICT`] →
  justified in Decision 4; narrow blast radius (only ever deletes `translation` rows, never a
  hazard-taxonomy row).
- [`drizzle-orm`'s pg migrator (`pg-core/dialect.js`'s `migrate()`) wraps every statement of
  every pending migration file — not just this one — in a single `session.transaction(...)`
  call, so the first `ALTER TABLE` on each hazard table holds an `ACCESS EXCLUSIVE` lock on
  it for the full add-backfill-constrain-drop sequence, blocking all reads/writes on that
  table until the whole batch commits — this also happens to be what makes the migration safe
  against a concurrent writer inserting mid-sequence, since Postgres blocks that insert until
  the lock releases] → accepted: `hazard_type`/`hazard_cluster`/`specific_hazard` are small,
  slow-changing HIPs reference/taxonomy tables (hundreds of rows, not millions) with no
  high-concurrency writers, so sub-second lock duration is not a practical concern here. A
  future reuse of this same column-add→backfill→constrain→drop pattern against a large or hot
  table should use `ADD CONSTRAINT ... NOT VALID` + a separate `VALIDATE CONSTRAINT`, plus
  chunked backfills, instead of relying on this same-transaction-as-the-whole-batch behavior.

## Migration Plan

Not additive-only, unlike `2b`. Order: create `language` → seed 9 `VALID_LANGUAGES` rows → create `text_content` → create `translation` → per hazard table: add nullable FK column(s), backfill, constrain NOT NULL, drop `name` → add `source_ref_id` column + UNIQUE constraint (per Decision 7/8, each table repeats this sub-sequence).

**Rollback**: drop the `source_ref_id` columns and their unique constraints; re-add `name`
text columns to the three tables; backfill `name` from `text_content.original_text` via the
stored `name_text_content_id` join; drop `name_text_content_id`/`description_text_content_id`
columns and their FKs; drop `translation`, then `text_content`, then `language`, in that
order — `ON DELETE CASCADE` only fires on row deletes, not on `DROP TABLE`, so `translation`
must be dropped explicitly before `text_content`, not left for the cascade to handle. A real
rollback script is not authored as part of this intent (none of `2a`/`2b`'s migrations ship
one either), but the reverse mapping above is lossless as long as rollback happens before any
translator adds a non-English translation — which `DEF-036`'s absence makes true for the
lifetime of this intent.
