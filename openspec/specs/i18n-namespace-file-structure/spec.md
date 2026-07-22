## Purpose

Defines the namespace-per-domain locale file convention (`locales/<lang>/<domain>.json`) used by
`react-i18next`/`remix-i18next`, distinct from and coexisting with the existing flat
`locales/app/<lang>.json` files used by the old `ViewContext.t()` system.

## Requirements

### Requirement: Namespace-per-domain locale file convention

The system SHALL support translation files organized as `locales/<lang>/<domain>.json` — one file per
language per domain namespace — as a structure distinct from the existing flat `locales/app/<lang>.json`
files. The infra change that introduced this convention did not create any populated
`locales/<lang>/<domain>.json` file; the Notices ADR-001 upgrade created the first two: `notices` and
`common`.

#### Scenario: Fs-backend load path targets the namespace convention

- **WHEN** the server i18next instance (from the `i18n-ssr-middleware` capability) is configured
- **THEN** its `backend.loadPath` SHALL resolve to `locales/{{lng}}/{{ns}}.json`, matching this convention

#### Scenario: The notices and common namespace files exist

- **WHEN** the Notices ADR-001 upgrade is merged
- **THEN** `locales/en/notices.json`, `locales/fr/notices.json`, `locales/en/common.json`, and
  `locales/fr/common.json` SHALL exist in the repository, each valid JSON matching the nested key
  structure
- **AND** these are the first real domain namespace files in the repository

#### Scenario: Non-Notices domains still have no namespace file

- **WHEN** the Notices ADR-001 upgrade is merged
- **THEN** no file matching `locales/*/[a-z-]+.json` other than `notices.json` and `common.json`
  (under `locales/en/` and `locales/fr/`), and other than the existing `locales/app/`,
  `locales/content/`, `locales/api-cache/` directories, SHALL exist in the repository
- **AND** a future domain's own namespace file remains a separate, later change's responsibility

#### Scenario: The permanent E2E fixture namespace no longer exists

- **WHEN** the Notices ADR-001 upgrade is merged
- **THEN** `locales/en/__e2e_fixture__.json` and `locales/fr/__e2e_fixture__.json` SHALL NOT exist in
  the repository, `app/routes/$lang+/_public+/e2e-i18n-fixture.tsx` and
  `tests/e2e/i18n/ssr-locale-resolution.spec.ts` SHALL NOT exist, and `i18next.config.ts`'s
  `extract.ignoreNamespaces` SHALL NOT contain `"__e2e_fixture__"`

### Requirement: Old flat locale files remain untouched and continue to serve the old system

`locales/app/<lang>.json` files SHALL continue to exist in their current flat array-of-`{id, translation,
description}` shape and SHALL NOT be restructured, split, or renamed by this change.

#### Scenario: Existing flat files are byte-for-byte unchanged

- **WHEN** this change is merged
- **THEN** every file under `locales/app/` SHALL have identical content to its pre-change state
