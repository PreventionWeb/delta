# Tasks

## 1. E2E Database Guard Helper (TDD)

- [x] 1.1 Write failing unit tests in `tests/unit/e2e/e2eDbGuard.test.ts` covering missing `PLAYWRIGHT_DATABASE_URL` (even when `DATABASE_URL` is set), rejection of non-test DB names (`unog_training`, `delta`), rejection of SQL-unsafe identifiers, acceptance of `*_test`/`*_e2e`/`*_playwright` DB names, and setup-marker write/check/clear lifecycle; verify failure with `yarn vitest run tests/unit/e2e/e2eDbGuard.test.ts`
- [x] 1.2 Implement `tests/e2e/helpers/e2eDbGuard.ts` (`PlaywrightDbConfig`, `resolvePlaywrightDatabaseConfig`, `writeDbCreatedMarker`, `hasDbCreatedMarker`, `clearDbCreatedMarker`); verify green with `yarn vitest run tests/unit/e2e/e2eDbGuard.test.ts`

## 2. Wire Guard into Playwright Config, Setup, Teardown & `example.env.playwright`

- [x] 2.1 Update `playwright.config.ts` to load `.env.playwright` with `{ override: true }` and pass `PLAYWRIGHT_DATABASE_URL` into `webServer.env.DATABASE_URL`, update `tests/e2e/global.setup.ts` and `tests/e2e/global.teardown.ts` to use `e2eDbGuard` (with parameterized `$1` in `pg_terminate_backend` and marker-gated teardown), add `example.env.playwright`, and add `.env.playwright` to `.gitignore`; verify with `yarn tsc` and `yarn vitest run tests/unit/e2e/e2eDbGuard.test.ts`

## 3. Quality Gates (1–10) & Regression Suite

- [x] 3.1 Quality gate 1 of 10: Run `yarn vitest run tests/unit/e2e/e2eDbGuard.test.ts` and verify all tests pass
- [x] 3.2 Quality gate 2 of 10: Run `yarn tsc` and verify zero TypeScript errors
- [x] 3.3 Quality gate 3 of 10: Run `npx prettier --check` on all modified/created files and verify clean formatting
- [x] 3.4 Quality gate 4 of 10: Anti-pattern review — check `.github/skills/anti-pattern-check/SKILL.md`
- [x] 3.5 Quality gate 5 of 10: SOLID review — invoke `solid-reviewer` agent on changed files
- [x] 3.6 Quality gate 6 of 10: Documentation review — full-diff sweep via fresh subagent confirming comments explain WHY not WHAT
- [x] 3.7 Quality gate 7 of 10: Project conventions review — check `.github/copilot-instructions.md` (including `example.env` comment for new env var)
- [x] 3.8 Quality gate 8 of 10: Code review — run `.github/skills/code-review/SKILL.md` in full via fresh subagent
- [x] 3.9 Quality gate 9 of 10: Skipped — `ui-classification: non-visual` (does not touch `app/domains/*/presentation/`, `app/routes/`, `app/components/`, `app/design-system/`, or styles)
- [x] 3.10 Quality gate 10 of 10: Independent second-opinion review (or explicit skip note if unsupported)
- [x] 3.11 Mandatory regression suite: Run `yarn test:run2` and verify zero new failures

## Workflow follow-up

- Review `proposal.md`, `specs/`, `design.md`, and `tasks.md`, then run `/opsx:apply playwright-e2e-db-safety`.
- Run `/opsx:archive` on the same branch before raising the PR.
