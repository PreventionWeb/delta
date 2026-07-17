## ADDED Requirements

### Requirement: Non-blocking missing-key report for namespace locale files

`scripts/check-i18n-missing-keys.ts` SHALL compare the key set of each `locales/<lang>/<domain>.json` file
against a designated reference locale's key set for the same domain, and SHALL report (via console output)
any keys present in the reference locale but absent in another locale for the same domain. This check SHALL
be scoped to the new namespace files only — it SHALL NOT evaluate `locales/app/<lang>.json` files.

#### Scenario: Missing key is reported

- **WHEN** `locales/en/notices.json` contains a key `"list.title"` that `locales/fr/notices.json` does not
  contain
- **THEN** the script SHALL report `"list.title"` as missing for locale `"fr"`, domain `"notices"`

#### Scenario: No missing keys produces a clean report

- **WHEN** every locale's namespace file for a given domain contains the same key set as the reference locale
- **THEN** the script SHALL report zero missing keys for that domain

#### Scenario: Script never causes a non-zero exit code

- **WHEN** the script finds one or more missing keys across any locale/domain combination
- **THEN** the script's process exit code SHALL be `0`
- **AND** the CI workflow step running it SHALL be reported as passed

#### Scenario: No namespace files exist yet

- **WHEN** the script runs against a repository state where no `locales/<lang>/<domain>.json` files exist
  (the state immediately after this change ships, before any domain retrofit)
- **THEN** the script SHALL report zero domains checked and exit `0` without error

### Requirement: Check runs on pull requests via a dedicated workflow

A new GitHub Actions workflow SHALL trigger the missing-key check `on: pull_request` targeting `main` and
`dev`, since no existing workflow in this repository runs test/build steps on every pull request today.

#### Scenario: Workflow runs on a PR touching locale files

- **WHEN** a pull request is opened or updated against `main` or `dev`
- **THEN** the `i18n-key-check` workflow SHALL execute `scripts/check-i18n-missing-keys.ts`
- **AND** the workflow's conclusion SHALL be success regardless of the script's findings
