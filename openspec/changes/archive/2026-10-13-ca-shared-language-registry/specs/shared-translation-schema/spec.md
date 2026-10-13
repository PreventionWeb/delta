## REMOVED Requirements

### Requirement: `language` table shape and constraints

**Reason**: `language_cd`'s exact-2-character shape cannot hold a BCP-47 tag with a
script/region/variant subtag (e.g. `sr-Latn`). Replaced below by a requirement describing the
widened column and its BCP-47-shape CHECK constraint.

**Migration**: No existing `language` row is affected — every currently-seeded code is a
2-character primary subtag, which satisfies the new, wider shape constraint unchanged. No data
migration is required; only the column type and CHECK constraint change (see design.md
Migration Plan).

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

## ADDED Requirements

### Requirement: `language` table shape and BCP-47-shaped constraints

The `language` table MUST persist one row per supported language, with columns `id` (UUID
primary key), `language_name` (text, not null, unique), and `language_cd` (`varchar(35)`,
not null, unique). `varchar(35)` bounds the maximum length per RFC 5646 §4.4.1's recommended
buffer size for a single BCP-47 language tag — wide enough to hold a tag with script, region,
and variant subtags (e.g. `sr-Latn-RS`), not just a bare 2-letter code. `language_cd` MUST
also satisfy a CHECK constraint validating the same permissive shape `resolveLocale()`
already uses for `Accept-Language` parsing (design.md Decision Q3, Option A — chosen for one
consistent mental model of "looks like a BCP-47 tag" across the request layer and the DB
layer, not the stricter structural pattern considered and rejected): `^[A-Za-z0-9]+(-
[A-Za-z0-9]+)*$` — one or more alphanumeric subtags separated by single hyphens, with no
position-specific length rules for script/region/variant. This is a deliberately loose shape
check, not a full IANA subtag-registry validation, and does not independently verify that a
given tag is real BCP-47 (see the two accepted-gap scenarios below).

#### Scenario: Insert a language with a bare primary-subtag code

- **WHEN** a row is inserted with `language_name = "English"`, `language_cd = "en"`
- **THEN** the insert succeeds

#### Scenario: Insert a language with a script subtag

- **WHEN** a row is inserted with `language_name = "Serbian (Latin)"`,
  `language_cd = "sr-Latn"`
- **THEN** the insert succeeds

#### Scenario: Insert a language with a region subtag

- **WHEN** a row is inserted with `language_name = "Spanish (Latin America)"`,
  `language_cd = "es-419"`
- **THEN** the insert succeeds

#### Scenario: `language_name` is required

- **WHEN** a row is inserted with no `language_name`
- **THEN** the insert is rejected by a database-level not-null constraint

#### Scenario: `language_cd` is required

- **WHEN** a row is inserted with no `language_cd`
- **THEN** the insert is rejected by a database-level not-null constraint

#### Scenario: `language_cd` longer than 35 characters is rejected by the column type

- **WHEN** a row is inserted with a `language_cd` longer than 35 characters
- **THEN** the insert is rejected with SQLSTATE `22001` (string data right truncation — the
  `varchar(35)` type itself), not `23514` (the check constraint)

#### Scenario: Accepted gap — a non-standard tag shaped like two stacked subtags is not rejected

- **GIVEN** the CHECK constraint intentionally matches `resolveLocale()`'s own permissive
  pattern rather than validating real BCP-47 subtag positions
- **WHEN** a row is inserted with `language_cd = "en-fil"` (not a real BCP-47 construction —
  stacking two primary-language-like subtags is not a defined tag shape)
- **THEN** the insert succeeds — this is a known, accepted trade-off of Option A, not a bug

#### Scenario: Accepted gap — a single-character primary subtag is not rejected

- **GIVEN** the previous exact-2-character CHECK constraint rejected this value; Option A's
  permissive pattern does not
- **WHEN** a row is inserted with `language_cd = "f"`
- **THEN** the insert succeeds — this is a known, accepted regression of Option A relative to
  the prior constraint, traded for consistency with `resolveLocale()`'s own pattern

#### Scenario: `language_cd` at the exact 35-character width boundary succeeds

- **WHEN** a row is inserted with a `language_cd` exactly 35 characters long
- **THEN** the insert succeeds and the persisted value is exactly 35 characters — the column
  width boundary is not narrower than advertised

#### Scenario: A zero-length `language_cd` is rejected by the check constraint

- **WHEN** a row is inserted with `language_cd = ""`
- **THEN** the insert is rejected with SQLSTATE `23514` — the permissive pattern still
  requires at least one character

#### Scenario: `language_cd` must be unique

- **WHEN** a row is inserted with a `language_cd` matching an existing `language` row
- **THEN** the insert is rejected by a database-level unique constraint

#### Scenario: `language_name` must be unique

- **WHEN** a row is inserted with a `language_name` matching an existing `language` row
- **THEN** the insert is rejected by a database-level unique constraint
