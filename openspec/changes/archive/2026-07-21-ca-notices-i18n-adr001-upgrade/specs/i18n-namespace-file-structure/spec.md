## MODIFIED Requirements

### Requirement: Namespace-per-domain locale file convention

The system SHALL support translation files organized as `locales/<lang>/<domain>.json` — one file per
language per domain namespace — as a structure distinct from the existing flat `locales/app/<lang>.json`
files. The infra change that introduced this convention did not create any populated
`locales/<lang>/<domain>.json` file; this change (the Notices ADR-001 upgrade) creates the
first two: `notices` and `common`.

#### Scenario: Fs-backend load path targets the namespace convention

- **WHEN** the server i18next instance (from the `i18n-ssr-middleware` capability) is configured
- **THEN** its `backend.loadPath` SHALL resolve to `locales/{{lng}}/{{ns}}.json`, matching this convention

#### Scenario: The notices and common namespace files exist after this change ships

- **WHEN** this change is merged
- **THEN** `locales/en/notices.json`, `locales/fr/notices.json`, `locales/en/common.json`, and
  `locales/fr/common.json` SHALL exist in the repository, each valid JSON matching the nested
  key structure described in this change's design.md
- **AND** these are the first real domain namespace files in the repository — no other
  `locales/<lang>/<domain>.json` file SHALL exist as a result of this change

#### Scenario: Non-Notices domains still have no namespace file after this change ships

- **WHEN** this change is merged
- **THEN** no file matching `locales/*/[a-z-]+.json` other than `notices.json` and `common.json`
  (under `locales/en/` and `locales/fr/`), and other than the existing `locales/app/`,
  `locales/content/`, `locales/api-cache/` directories, SHALL exist in the repository
- **AND** a future domain's own namespace file remains a separate, later change's responsibility

#### Scenario: The permanent E2E fixture namespace no longer exists after this change ships

- **WHEN** this change is merged
- **THEN** `locales/en/__e2e_fixture__.json` and `locales/fr/__e2e_fixture__.json` SHALL NOT exist
  in the repository, `app/routes/$lang+/_public+/e2e-i18n-fixture.tsx` and
  `tests/e2e/i18n/ssr-locale-resolution.spec.ts` SHALL NOT exist, and `i18next.config.ts`'s
  `extract.ignoreNamespaces` SHALL NOT contain `"__e2e_fixture__"`
- **AND** this change's own `notices-i18n-presentation` capability (its client-side-navigation
  Playwright coverage) SHALL be the change that satisfies the infra change's own removal trigger
  for this fixture (design.md Decision 8 of the infra change, and Decision 6 of this change's own
  design.md)

## ADDED Requirements

### Requirement: common.json is a permanent, cross-domain namespace, not a temporary migration artifact

`locales/<lang>/common.json` SHALL be treated as a first-class, permanent namespace file
alongside domain-specific namespace files (matching ADR-001's own File Structure section, which
already lists `common.json` as a sibling of `notices.json`/`hazardous-event.json`), intended for
reuse by future domain upgrades — not a file scoped only to this change's immediate need.

#### Scenario: common.json is documented as reusable, not Notices-private
- **WHEN** a future domain upgrade needs a cross-cutting UI string already present in
  `common.json`
- **THEN** that upgrade SHOULD reuse the existing `common` namespace rather than duplicating the
  string in its own domain namespace
