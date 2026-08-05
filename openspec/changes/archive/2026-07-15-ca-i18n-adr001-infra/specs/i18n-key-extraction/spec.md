## ADDED Requirements

### Requirement: A second, independent key-extraction pipeline scans `t('key')` syntax

A new `yarn i18n:extract:new` script SHALL run `i18next-parser` configured (via `i18next-parser.config.js`)
to scan source files for `t('key')`-style calls and write/update entries under `locales/<lang>/<domain>.json`
namespace files. This pipeline SHALL run independently of, and SHALL NOT replace or modify the behavior of,
the existing `yarn i18n:extractor` script (`scripts/extractor-i18n.ts`), which continues to scan
`t({code, msg})` syntax for the old system.

#### Scenario: New extractor does not touch old-system files

- **WHEN** `yarn i18n:extract:new` is run against a codebase containing both `ctx.t({code, msg})` calls
  (old system) and `t('key')` calls (new system, once a domain adopts it)
- **THEN** only `locales/<lang>/<domain>.json` namespace files SHALL be created or updated
- **AND** no file under `locales/app/` SHALL be modified

#### Scenario: Existing extractor is unaffected

- **WHEN** `yarn i18n:extractor` (the existing script) is run after this change ships
- **THEN** its behavior, output format, and target files SHALL be identical to its pre-change behavior

#### Scenario: Both scripts can run in the same CI or local session without conflict

- **WHEN** both `yarn i18n:extractor` and `yarn i18n:extract:new` are run in sequence
- **THEN** neither script's output SHALL be overwritten or corrupted by the other running first
