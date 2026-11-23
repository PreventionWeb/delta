# design-system-quality-gates Specification

## Purpose

Automated static guards, reusable Playwright WCAG 2.2 AA and layout audit helpers, a Gate 9 CLI checker, OpenSpec workflow enforcement, and lightweight PR CI checks that verify DELTA UI changes against the DELTA Design System (`_docs/design/DESIGN.md` and `tokens.css`).

## ADDED Requirements

### Requirement: Playwright audit helpers verify WCAG 2.2 AA and layout invariants

The helper module `tests/e2e/helpers/designSystemChecks.ts` SHALL export reusable Playwright helpers for WCAG 2.2 AA `axe-core` scanning (defaulting to `<main>` unless `fullPage: true` is set), runtime `pageerror`/`console.error` capture, horizontal overflow checks, WCAG 2.2 target-size (`>= 24x24px`) and icon-button label checks, focus-not-obscured checks, and table row cursor semantics.

#### Scenario: Axe audit defaults to main scope and passes on a compliant page

- **GIVEN** a rendered page containing a `<main>` landmark with accessible controls and a legacy `<header>` outside `<main>`
- **WHEN** `assertWcag22AA(page)` is called without `fullPage: true`
- **THEN** `axe-core` MUST run with tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, and `wcag22aa` scoped to `main`
- **AND** violations exclusively inside the legacy `<header>` MUST NOT cause the default check to fail

#### Scenario: Axe audit fails with actionable summary on WCAG 2.2 AA violations

- **GIVEN** a rendered page whose `<main>` contains an icon-only `<button>` with no accessible name
- **WHEN** `assertWcag22AA(page)` is called
- **THEN** it MUST throw an error containing the violating rule ID, node count, and HTML snippet

#### Scenario: Full-page axe audit scans the entire document when requested

- **GIVEN** a rendered page with an accessibility violation outside `<main>`
- **WHEN** `assertWcag22AA(page, { fullPage: true })` is called
- **THEN** `axe-core` MUST scan the full `document` and fail on that violation

#### Scenario: Horizontal overflow check detects layout overflow

- **GIVEN** a page rendered at mobile width (`375px`) whose content forces `scrollWidth > innerWidth`
- **WHEN** `assertNoHorizontalOverflow(page)` is called
- **THEN** it MUST throw an error reporting both `scrollWidth` and `innerWidth`

#### Scenario: Target size and icon-label audit flags undersized or unlabeled interactive controls

- **GIVEN** a page containing a visible `16x16px` button or a button with no accessible name inside the audited scope
- **WHEN** `assertTargetSizesAndLabels(page)` is called
- **THEN** it MUST throw an error identifying the offending control and reason

### Requirement: Gate 9 CLI audits a route URL across design-system breakpoints and exits non-zero on failure

The CLI script `scripts/check-design-a11y.ts` (`yarn design:check`) SHALL accept `--url`, optional `--scope` (default `main`), `--full-page`, `--screenshots <dir>`, `--executable-path <path>`, `--login-email`, `--login-password`, `--viewports`, and `--help`, run the audit across `mobile` (`375x812`), `tablet` (`768x1024`), and `desktop` (`1280x900`), and exit `0` only when all checks pass.

#### Scenario: CLI prints usage and exits 0 on --help

- **WHEN** `yarn design:check --help` is invoked
- **THEN** it MUST print CLI usage including `--url`, `--scope`, `--full-page`, and `--screenshots` and exit with status `0`

#### Scenario: CLI rejects missing or invalid --url

- **WHEN** `yarn design:check` is invoked without `--url`
- **THEN** it MUST print a clear usage error to stderr and exit with a non-zero status code

#### Scenario: CLI passes on a compliant page and fails on a non-compliant page

- **GIVEN** a compliant HTML page and a non-compliant HTML page (missing accessible label and horizontal overflow)
- **WHEN** `yarn design:check --url <page-url>` runs against each
- **THEN** it MUST exit `0` for the compliant page and exit non-zero for the non-compliant page

### Requirement: Token synchronization contract test validates design-system CSS, JSON, and self-hosted fonts when present

`tests/unit/design-system/tokenSync.test.ts` SHALL verify that whenever `_docs/design/tokens.css` and `_docs/design/tokens.json` exist in the repository:

- `_docs/design/tokens.json` parses as valid JSON and its version matches the header in `_docs/design/tokens.css`,
- `app/styles/all.css` imports `_docs/design/tokens.css` and maps every semantic token into its `@theme` block,
- every self-hosted font file referenced in `app/styles/fonts.css` exists under `public/`.

#### Scenario: Token sync test passes cleanly when \_docs/design/ is not yet present on a branch

- **GIVEN** a branch created from `dev` before `_docs/design/tokens.css` is merged
- **WHEN** `yarn test:design` runs
- **THEN** `tokenSync.test.ts` MUST report the check as gracefully skipped or passing without false failures

#### Scenario: Token sync test detects missing @theme mappings or missing font files when \_docs/design/ exists

- **GIVEN** `_docs/design/tokens.css` is present and a semantic token is missing from `app/styles/all.css` `@theme`
- **WHEN** `validateTokenSync()` is evaluated
- **THEN** it MUST return a non-empty list of missing token names

### Requirement: OpenSpec workflow, skills, agents, and PR CI enforce design-system gates

The OpenSpec configuration, agents, skills, workflow docs, and `.github/workflows/design-system-check.yml` SHALL enforce `yarn test:design` and upgraded Gate 9 (`Design System, Accessibility (WCAG 2.2 AA) & Visual/UX Parity Review`) for changes touching `app/design-system/**`, `app/domains/*/presentation/**`, `app/routes/**`, or `app/styles/**`.

#### Scenario: PR CI workflow runs static design-system checks on relevant pull requests

- **WHEN** a pull request modifies files under `app/design-system/**`, `app/domains/*/presentation/**`, `app/styles/**`, `_docs/design/**`, or `tests/unit/design-system/**`
- **THEN** `.github/workflows/design-system-check.yml` MUST trigger and execute `yarn test:design`
