# shared-translation-schema Specification

## Purpose

Defines the persisted shape of the Shared Kernel translation primitives —
`language`, `text_content`, `translation` — used to store free-text content once per
authoring language and resolve it by join across any number of target languages, as a
parallel mechanism to the existing Weblate/JSONB content pipeline for cases (unknown-locale
free-text filter search) that pipeline does not cover. This spec covers schema-level
observable behaviour only.

## Requirements

### Requirement: `language` table shape and constraints

The `language` table MUST persist one row per supported language, with columns `id` (UUID
primary key), `language_name` (text, not null, unique), and `language_cd` (`varchar(2)`,
not null, unique). `varchar(2)` enforces only a maximum of 2 characters at the type level;
a value shorter than 2 characters passes the type and is rejected only by the table's
existing `CHECK (char_length(language_cd) = 2)` constraint.

#### Scenario: Insert a language

- **WHEN** a row is inserted with `language_name = "English"`, `language_cd = "en"`
- **THEN** the insert succeeds

#### Scenario: `language_name` is required

- **WHEN** a row is inserted with no `language_name`
- **THEN** the insert is rejected by a database-level not-null constraint

#### Scenario: `language_cd` is required

- **WHEN** a row is inserted with no `language_cd`
- **THEN** the insert is rejected by a database-level not-null constraint

#### Scenario: `language_cd` longer than 2 characters is rejected by the column type

- **WHEN** a row is inserted with `language_cd = "fra"`
- **THEN** the insert is rejected with SQLSTATE `22001` (string data right truncation —
  the `varchar(2)` type itself), not `23514` (the check constraint)

#### Scenario: `language_cd` shorter than 2 characters is rejected by the check constraint

- **WHEN** a row is inserted with `language_cd = "f"`
- **THEN** the insert is rejected with SQLSTATE `23514` — `varchar(2)` permits a 1-character
  value, so only the check constraint catches it

#### Scenario: `language_cd` must be unique

- **WHEN** a row is inserted with a `language_cd` matching an existing `language` row
- **THEN** the insert is rejected by a database-level unique constraint

#### Scenario: `language_name` must be unique

- **WHEN** a row is inserted with a `language_name` matching an existing `language` row
- **THEN** the insert is rejected by a database-level unique constraint

### Requirement: `text_content` table shape and constraints

The `text_content` table MUST persist one row per piece of original-language source text,
with columns `id` (UUID primary key), `original_text` (text, not null), and
`original_language_id` (UUID, not null, FK to `language.id`).

#### Scenario: Insert a text content row

- **WHEN** a row is inserted with `original_text = "Earthquake"` and an
  `original_language_id` matching an existing `language` row
- **THEN** the insert succeeds

#### Scenario: `original_text` is required

- **WHEN** a row is inserted with no `original_text`
- **THEN** the insert is rejected by a database-level not-null constraint

#### Scenario: `original_language_id` is required

- **WHEN** a row is inserted with `original_language_id = NULL`
- **THEN** the insert is rejected by a database-level not-null constraint

#### Scenario: `original_language_id` must reference an existing language

- **WHEN** a row is inserted with an `original_language_id` that matches no row in
  `language`
- **THEN** the insert is rejected by the foreign key constraint

### Requirement: `translation` table shape and constraints

The `translation` table MUST persist one row per translated rendering of a `text_content`
row into a given language, with columns `id` (UUID primary key), `text_content_id` (UUID,
not null, FK to `text_content.id`, `ON DELETE CASCADE`), `language_id` (UUID, not null, FK to
`language.id`), and `translation` (text, not null). There MUST NOT be more than one
`translation` row per (`text_content_id`, `language_id`) pair.

#### Scenario: Insert a translation

- **WHEN** a row is inserted with a `text_content_id` matching an existing `text_content`
  row, a `language_id` matching an existing `language` row, and `translation = "Séisme"`
- **THEN** the insert succeeds

#### Scenario: `text_content_id` is required

- **WHEN** a row is inserted with `text_content_id = NULL`
- **THEN** the insert is rejected by a database-level not-null constraint

#### Scenario: `text_content_id` must reference an existing text_content row

- **WHEN** a row is inserted with a `text_content_id` that matches no row in `text_content`
- **THEN** the insert is rejected by the foreign key constraint

#### Scenario: `language_id` is required

- **WHEN** a row is inserted with `language_id = NULL`
- **THEN** the insert is rejected by a database-level not-null constraint

#### Scenario: `language_id` must reference an existing language row

- **WHEN** a row is inserted with a `language_id` that matches no row in `language`
- **THEN** the insert is rejected by the foreign key constraint

#### Scenario: `translation` text is required

- **WHEN** a row is inserted with no `translation` text
- **THEN** the insert is rejected by a database-level not-null constraint

#### Scenario: duplicate (text_content_id, language_id) is rejected

- **WHEN** a second `translation` row is inserted with the same `text_content_id` and
  `language_id` as an existing row
- **THEN** the insert is rejected by a database-level unique constraint

#### Scenario: deleting a text_content row cascades to its translations

- **WHEN** a `text_content` row is deleted while one or more `translation` rows reference
  its `id`
- **THEN** the delete succeeds and every referencing `translation` row is deleted along
  with it

#### Scenario: concurrent inserts of distinct translations for the same text_content both succeed

- **WHEN** two callers concurrently insert `translation` rows against the same existing
  `text_content_id` but two different `language_id` values, before either transaction
  commits
- **THEN** both inserts succeed — the unique constraint validates each
  (`text_content_id`, `language_id`) pair independently

#### Scenario: concurrent inserts of the same (text_content_id, language_id) — exactly one succeeds

- **WHEN** two callers concurrently insert `translation` rows with the identical
  `text_content_id` and `language_id` pair, before either transaction commits
- **THEN** exactly one insert succeeds and the other is rejected by the unique constraint

### Requirement: every text_content row populated by the HIPs taxonomy migration has a same-language translation row

Every `text_content` row populated by the HIPs taxonomy migration (the adopted migration
`6d98c11c`/`c42affd1` plus its correction migration) MUST resolve to a `translation` row
whose `language_id` equals that `text_content` row's own `original_language_id` and whose
`translation` text equals that row's own `original_text`. This preserves the standing
invariant (originally `5l` Decision 5, recorded in `ADR-001-multilingual-strategy.md`)
that `translation` is the single, always-complete table a query reads from in any
language, including a row's own original one — `text_content.original_text`/
`original_language_id` remain provenance metadata, never read directly by search or
display. Enforcement for any future writer of `text_content` beyond this migration (a DB
trigger vs. an application-layer contract) is unchanged and remains undecided.

#### Scenario: a text_content row with no same-language translation row is backfilled

- **GIVEN** a `text_content` row with `original_text = "Earthquake"` and
  `original_language_id` referencing the `en` `language` row, with no existing
  `translation` row for that (`text_content_id`, `en`) pair
- **WHEN** the correction migration runs
- **THEN** a `translation` row exists with `text_content_id` equal to that row's `id`,
  `language_id` equal to the `en` row, and `translation` text equal to `"Earthquake"`

#### Scenario: a text_content row that already has a same-language translation row is not duplicated

- **GIVEN** a `text_content` row that already has a `translation` row in its own
  `original_language_id`
- **WHEN** the correction migration runs
- **THEN** no second `translation` row is created for that same (`text_content_id`,
  `language_id`) pair — enforced both by the migration's own `NOT EXISTS` guard and, as a
  backstop, by `translation`'s existing `UNIQUE (text_content_id, language_id)` constraint
