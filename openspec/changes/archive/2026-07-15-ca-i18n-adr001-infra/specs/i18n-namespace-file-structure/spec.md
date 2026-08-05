## ADDED Requirements

### Requirement: Namespace-per-domain locale file convention

The system SHALL support translation files organized as `locales/<lang>/<domain>.json` — one file per
language per domain namespace — as a structure distinct from the existing flat `locales/app/<lang>.json`
files. This change establishes the convention and the loader/config wiring that expects it; it does NOT
create any populated `locales/<lang>/<domain>.json` file.

#### Scenario: Fs-backend load path targets the namespace convention

- **WHEN** the server i18next instance (from the `i18n-ssr-middleware` capability) is configured
- **THEN** its `backend.loadPath` SHALL resolve to `locales/{{lng}}/{{ns}}.json`, matching this convention

#### Scenario: No domain namespace file exists yet after this change ships

- **WHEN** this change is merged
- **THEN** no file matching `locales/*/[a-z-]+.json` (other than the existing `locales/app/`,
  `locales/content/`, `locales/api-cache/` directories) SHALL exist in the repository
- **AND** the first such file (e.g. `locales/en/notices.json`) SHALL be created only by a future, separate
  change
- **EXCEPT** `locales/en|fr/__e2e_fixture__.json` — a permanent, non-domain test fixture backing
  `tests/e2e/i18n/ssr-locale-resolution.spec.ts` (design.md Decision 8). Its double-underscore name does not
  match `[a-z-]+` and it is not a domain namespace.

### Requirement: Old flat locale files remain untouched and continue to serve the old system

`locales/app/<lang>.json` files SHALL continue to exist in their current flat array-of-`{id, translation,
description}` shape and SHALL NOT be restructured, split, or renamed by this change.

#### Scenario: Existing flat files are byte-for-byte unchanged

- **WHEN** this change is merged
- **THEN** every file under `locales/app/` SHALL have identical content to its pre-change state
