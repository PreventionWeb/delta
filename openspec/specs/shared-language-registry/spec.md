# shared-language-registry Specification

## Purpose

Defines `VALID_LANGUAGES` as the single application-layer source of truth for which
languages DELTA supports, and the mechanism that keeps the `language` database table from
silently drifting away from it.

## Requirements

### Requirement: `VALID_LANGUAGES` is the sole application-layer source of truth for supported languages

`getAvailableLanguages()` (`app/backend.server/translations.ts`) SHALL determine which
languages are available by intersecting the languages with locale files present on disk
against `VALID_LANGUAGES` (`app/utils/lang.backend.ts`). No second, independently-maintained
list of supported language codes SHALL exist in application code.

#### Scenario: A language in `VALID_LANGUAGES` with complete locale files is available

- **WHEN** `getAvailableLanguages()` is called
- **AND** a language code is present in `VALID_LANGUAGES` and has locale JSON files on disk
- **THEN** that language code is included in the returned list

#### Scenario: A language in `VALID_LANGUAGES` missing locale files is excluded

- **WHEN** `getAvailableLanguages()` is called
- **AND** a language code is present in `VALID_LANGUAGES` but has no locale JSON files on disk
- **THEN** that language code is excluded from the returned list

#### Scenario: A language with locale files but absent from `VALID_LANGUAGES` is excluded

- **WHEN** `getAvailableLanguages()` is called
- **AND** a language code has locale JSON files on disk but is not present in
  `VALID_LANGUAGES`
- **THEN** that language code is excluded from the returned list

### Requirement: Tenant default-language validation accepts any language `getAvailableLanguages()` returns

`SettingsService.updateSettings()` SHALL accept any language code returned by
`getAvailableLanguages()` as a valid tenant default language, and SHALL reject any other
value with a `SettingsValidationError`.

#### Scenario: A language previously excluded by a narrower, separately-maintained list is now accepted

- **WHEN** `SettingsService.updateSettings()` is called with a language code that is present
  in `VALID_LANGUAGES` and has complete locale files, but was not previously accepted by a
  narrower whitelist
- **THEN** the update succeeds and the tenant's default language is persisted as that code

#### Scenario: An unsupported language code is still rejected

- **WHEN** `SettingsService.updateSettings()` is called with a language code not returned by
  `getAvailableLanguages()`
- **THEN** it throws `SettingsValidationError` with a `language` field error
- **AND** no change is persisted

### Requirement: An automated check detects drift between `VALID_LANGUAGES` and the `language` table

The set of `language_cd` values persisted in the `language` database table, as produced by
replaying the project's migration history, SHALL be verifiable by an automated test against
the current `VALID_LANGUAGES` constant, in both directions: every `VALID_LANGUAGES` entry
MUST have a corresponding `language` row, and every `language` row's code MUST be present in
`VALID_LANGUAGES`. A mismatch in either direction SHALL cause the check to fail.

#### Scenario: Every `VALID_LANGUAGES` entry has a matching `language` row

- **GIVEN** the real migrations that create, seed, and alter `public.language` have run
- **WHEN** the consistency check compares `VALID_LANGUAGES` against the resulting
  `language.language_cd` values
- **THEN** every code in `VALID_LANGUAGES` is present among the `language_cd` values

#### Scenario: A `VALID_LANGUAGES` entry with no corresponding migration is caught

- **GIVEN** `VALID_LANGUAGES` contains a code with no `language` row produced by any migration
- **WHEN** the consistency check runs
- **THEN** it fails, naming the missing code

#### Scenario: A `language` row with no corresponding `VALID_LANGUAGES` entry is caught

- **GIVEN** the migration history produces a `language` row whose code is not present in
  `VALID_LANGUAGES`
- **WHEN** the consistency check runs
- **THEN** it fails, naming the unexpected code
