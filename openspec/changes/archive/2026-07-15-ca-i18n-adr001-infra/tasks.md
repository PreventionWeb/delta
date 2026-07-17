## 1. Dependencies

- [x] 1.1 Add `react-i18next` (latest, `^17.0.9` range), `i18next` (`^26.3.6`), `remix-i18next` pinned exact
      `"7.5.0"` (no caret — v8 requires React Router v8, this repo is on v7.18.1), and `i18next-fs-backend`
      (`^2.6.6`) to `package.json` `dependencies`. Add `i18next-parser` (`^9.4.0`) to `devDependencies`.
      Run `yarn install` and commit the updated `yarn.lock`.
- [x] 1.2 Verify installed versions satisfy each other's peer ranges: `yarn why remix-i18next`,
      `yarn why react-i18next`, confirm no peer-dependency warnings printed by `yarn install`.

## 2. Locale resolution chain (Red -> Green -> Refactor)

- [x] 2.1 Write failing test `tests/unit/domains/i18n/findLocale.test.ts` covering the scenarios in
      `specs/i18n-ssr-middleware/spec.md` under "Locale resolution chain follows ADR-001's 4-step order":
      valid URL segment wins, tenant default locale wins when no URL segment is present (mock
      `getCountrySettingsFromSession` to resolve a row with `language: "fr"`), invalid/missing segment with
      no cached tenant settings returns `null`, malformed URL never throws. Import path: `import
"../../setup"` if this repo's `tests/unit` convention requires a setup import — otherwise no import
      (unit tests here have no DB dependency; confirm against an existing `tests/unit/**/*.test.ts` file
      before assuming either way).
- [x] 2.2 Run `yarn vitest run tests/unit/domains/i18n/findLocale.test.ts` and confirm it fails (function
      does not exist yet).
- [x] 2.3 Implement `findLocale` in `app/middleware/i18next.server.ts` per design.md Decision 3 — URL-segment
      check against `VALID_LANGUAGES` (imported from `app/utils/lang.backend.ts`, not duplicated); step 3 is
      a real lookup calling `getCountrySettingsFromSession(request)` (from `app/utils/session.ts`) and
      returning `countrySettings?.language` when present; step 2 stays an explicit commented no-op hook point
      for `user.preferredLocale`; `return null` fallback.
- [x] 2.4 Run `yarn vitest run tests/unit/domains/i18n/findLocale.test.ts` and confirm it passes.

## 3. Server middleware wiring (Red -> Green -> Refactor)

- [x] 3.1 Write failing test `tests/unit/domains/i18n/i18nextMiddleware.test.ts` asserting: the exported
      middleware config uses `plugins: [FsBackend]` (not `i18next: { resources }`), `backend.loadPath`
      resolves to the `locales/{{lng}}/{{ns}}.json` pattern, and `detection.order` is exactly `["custom"]`
      (no `cookie`/`session`/`header` — per design.md Decision 2, ADR-001's chain has no cookie step).
- [x] 3.2 Run the test, confirm it fails (module does not exist yet). Note: `findLocale` (Task 2) and the
      middleware config (Task 3) live in the same file per design.md's single integration point, so this
      module already existed from Task 2.3 by the time this test ran — verified instead by temporarily
      asserting the test genuinely pins the config (spy-based assertions on `createI18nextMiddleware`'s call
      args, not implementation-free placeholders).
- [x] 3.3 Implement `app/middleware/i18next.server.ts`: call `createI18nextMiddleware` from
      `remix-i18next/middleware`, export `[i18nextMiddleware, getLocale, getInstance]`, wire `findLocale`
      from Task 2.
- [x] 3.4 Run the test, confirm it passes.
- [x] 3.5 Update `app/root.tsx`: append the new `i18nextMiddleware` to the existing `middleware` array
      (`export const middleware: Route.MiddlewareFunction[] = [requestContextMiddleware, i18nextMiddleware]`).
      Do not reorder or remove `requestContextMiddleware`. Do not alter the loader or component body.
- [x] 3.6 Confirm via `yarn tsc` that `app/root.tsx` still type-checks after the middleware array change
      (no other edits to this file expected).

## 4. Generic `I18nService` port (Red -> Green -> Refactor)

- [x] 4.1 Write failing test `tests/unit/domains/i18n/I18nServicePort.test.ts` — since this is a pure
      interface with no runtime implementation, the test SHALL assert the shape via a minimal in-test mock
      implementing `I18nServicePort` and calling `translate("key", "en", { count: 1 })`, confirming the
      TypeScript compiler accepts the mock's signature (a type-level regression test: if the interface
      shape changes incompatibly, this mock fails to compile).
- [x] 4.2 Run `yarn vitest run tests/unit/domains/i18n/I18nServicePort.test.ts`, confirm it fails (module
      does not exist). Note: `import type` is elided by esbuild, so vitest passes trivially even with the
      module missing — the real Red signal here is `yarn tsc` reporting TS2307 on the missing module,
      which was confirmed before implementing.
- [x] 4.3 Implement `app/shared/i18n/I18nServicePort.ts` per design.md Decision 5 — `translate(key: string,
locale: string, params?: Record<string, string | number>): Promise<string>`, with JSDoc matching the
      style of `app/domains/notices/application/ports/INoticeRepository.ts` (explain the DIP boundary,
      explicit-locale-parameter contract).
- [x] 4.4 Run the test, confirm it passes. Confirm no file under `app/domains/*/application/ports/` was
      touched (`git status --short app/domains`).

## 5. Client hydration entry

- [x] 5.1 Add `app/entry.client.tsx` per design.md Decision 4: read the inline
      `<script type="application/json" id="i18n-resource-bundle">` payload, initialize a client i18next
      instance with `use(initReactI18next).init({ resources: <parsed>, lng, fallbackLng: "en" })`, wrap
      `<HydratedRouter />` in `<I18nextProvider>`, preserve `startTransition` + `hydrateRoot(document, ...)`
      exactly as React Router v7's own default entry does (there is no pre-existing file to diff against in
      this repo — cross-check against the `@react-router/dev` package's generated template for the
      installed version before writing this file, so the non-i18n parts are not invented from memory).
      Verified against `node_modules/@react-router/dev/dist/config/defaults/entry.client.tsx` directly.
- [x] 5.2 Update `app/root.tsx`'s loader to call `getInstance(context).getDataByLanguage(lang)` and embed
      the result into the `<script type="application/json" id="i18n-resource-bundle">` tag alongside the
      existing `createTranslationScript` script tag (both present, neither replaces the other).
- [x] 5.3 Run `yarn tsc` — confirm zero new type errors introduced by the new entry point and root.tsx change.

## 6. Namespace file structure convention

- [x] 6.1 Add a short convention note (e.g. `locales/README.md` or a comment block referenced from
      `app/middleware/i18next.server.ts`) documenting the `locales/<lang>/<domain>.json` structure and its
      coexistence with `locales/app/<lang>.json`. Do not create any actual `locales/<lang>/<domain>.json`
      file.
- [x] 6.2 Confirm via `git status --short locales/app` that no existing flat locale file changed.

## 7. New extraction pipeline (Red -> Green -> Refactor)

- [x] 7.1 Write failing test `tests/unit/scripts/i18nextParserConfig.test.ts` asserting
      `i18next-parser.config.js` targets `locales/**/*.json` for output and scans `app/**/*.{ts,tsx}` for
      input, and does NOT include `locales/app/**` in its output glob.
- [x] 7.2 Run the test, confirm it fails (config file does not exist).
- [x] 7.3 Implement `i18next-parser.config.js` per design.md — scans `t('key')` syntax, outputs to
      `locales/{{lng}}/{{ns}}.json` — using i18next-parser's own `$LOCALE`/`$NAMESPACE` output placeholder
      convention (its `output` option, distinct from fs-backend's `{{lng}}`/`{{ns}}` — verified against
      `node_modules/i18next-parser/README.md`), `locales:` list reuses `VALID_LANGUAGES` imported directly
      from `app/utils/lang.backend.ts` (verified Node 22's native type-stripping resolves this `.ts` import
      at real CLI runtime, not just under vitest/vite — confirmed via a direct `node --input-type=module -e
"import(...)"` smoke test).
- [x] 7.4 Add `"i18n:extract:new": "i18next --config i18next-parser.config.js"` to `package.json` scripts —
      corrected from the literal `i18next-parser` binary name in this task's text: the installed
      `i18next-parser@9.4.0` package's `package.json` `bin` field maps the executable name to `i18next`, not
      `i18next-parser` (`i18next-parser` is only the npm package name). Do not modify the existing
      `"i18n:extractor"` script entry.
- [x] 7.5 Run the test, confirm it passes.
- [x] 7.6 Manually ran `yarn i18n:extract:new` against the current codebase: exited 0, parsed 698 files, and
      `git status --short locales/` confirmed no `locales/<lang>/*.json` namespace file and no `locales/app/`
      file was created or modified (no real `t('key')` call sites exist yet).

## 8. Missing-key CI check (Red -> Green -> Refactor)

- [x] 8.1 Write failing test `tests/unit/scripts/checkI18nMissingKeys.test.ts` covering the scenarios in
      `specs/i18n-missing-key-ci-check/spec.md`: missing key reported, clean report when key sets match,
      exit code always `0` even with missing keys found, zero domains handled gracefully when no namespace
      files exist yet. Use a temp fixture directory (not the real `locales/` tree) for the locale files
      under test so this test does not depend on Notices' future retrofit. The "always exits 0" scenario is
      exercised via a real child-process `spawnSync` of the script through `tsx`, not just the pure
      function's return value — this caught a real Windows bug (see 8.3 note).
- [x] 8.2 Run `yarn vitest run tests/unit/scripts/checkI18nMissingKeys.test.ts`, confirm it fails (script
      does not exist).
- [x] 8.3 Implement `scripts/check-i18n-missing-keys.ts` — reads `locales/<lang>/*.json`, compares against
      a reference locale's (`"en"`) key set per domain, logs missing keys, always exits `0`. Note: the CLI
      entry-point guard must use `pathToFileURL(process.argv[1]).href === import.meta.url`, not a manual
      `` `file://${process.argv[1]}` `` template — the manual template never matches on Windows (backslash
      paths, missing the third `/` in `file:///`), which silently skipped the entire CLI branch (no output,
      exit 0 by accident rather than by design). Found via the real child-process test in 8.1, not assumed.
- [x] 8.4 Run the test, confirm it passes.
- [x] 8.5 Add `.github/workflows/i18n-key-check.yml` — triggers `on: pull_request` to `main`/`dev` (matching
      `codeql.yml`'s branch scope), installs deps, runs `yarn i18n:check-missing-keys`, no
      `continue-on-error` needed since the script itself always exits `0` by design.
- [x] 8.6 Add a corresponding `package.json` script `"i18n:check-missing-keys": "tsx
scripts/check-i18n-missing-keys.ts"` so the workflow and local developers invoke the same entry point.

## 9. End-to-end verification of the SSR pipeline

- [x] 9.1 Write a minimal test fixture: `locales/en/__e2e_fixture__.json` and
      `locales/fr/__e2e_fixture__.json`, each with a single distinguishable key (e.g.
      `{"greeting": "Hello (en fixture)"}` / `{"greeting": "Bonjour (fr fixture)"}`), used only by the E2E
      test in 9.2 — not a real domain namespace. **Superseded by 9.5's final resolution:** these fixture
      files are kept permanently (not removed once a real domain namespace exists) as the SSR pipeline's
      only regression guard — see 9.5.
- [x] 9.2 Write `tests/e2e/i18n/ssr-locale-resolution.spec.ts` (Playwright): add a minimal test-only route
      (or reuse an existing public route) that renders the `__e2e_fixture__` namespace's `greeting` key via
      `useTranslation`. Assert requesting `/en/<route>` renders "Hello (en fixture)" and `/fr/<route>`
      renders "Bonjour (fr fixture)" in the initial server-rendered HTML (before hydration), proving the
      full middleware → fs-backend → SSR pipeline works via a real HTTP request against the dev server, per
      this project's test-tier convention that SSR-only behavior needs a real request, not a unit test.
      **Running this test for real surfaced that design.md's original Decision 7 was wrong** —
      `useTranslation()` failed with `NO_I18NEXT_INSTANCE` during SSR because nothing wrapped the render
      tree in `<I18nextProvider>`. User-approved correction applied: `app/entry.server.tsx`'s
      `handleRequest`/`handleBotRequest`/`handleBrowserRequest` now accept the 5th `RouterContextProvider`
      argument (confirmed present when `future.v8_middleware` is enabled) and wrap `<ServerRouter>` in
      `<I18nextProvider i18n={getInstance(routerContext)}>`, per `remix-i18next`'s own README
      ("Server-side configuration" section). `design.md` Decision 7 updated accordingly.
- [x] 9.3 Extend the same spec to assert post-hydration behavior: after the page finishes loading client-side
      JS, the same text is still correctly rendered (proving `entry.client.tsx`'s no-fetch hydration in
      Decision 4 didn't clobber or blank the SSR'd translation), and no console errors were logged during
      hydration.
- [x] 9.4 Run `yarn test:e2e tests/e2e/i18n/ssr-locale-resolution.spec.ts`, confirm it passes. Confirmed:
      all 5 tests pass (English SSR, French SSR, hydration with zero console errors, plus the 2 DB
      setup/teardown steps), after the Decision 7 correction in 9.2.
- [x] 9.5 **Deviated from this task's literal instruction, with explicit user approval.** Initially removed
      the route + fixtures + spec as instructed, but the coordinator overrode this: this is genuinely novel,
      first-of-its-kind SSR infrastructure where two real bugs (the `NO_I18NEXT_INSTANCE` Decision 7 gap in
      9.2, and the Windows `pathToFileURL` bug in Section 8) were caught only by actually running these exact
      tests — that is precisely the kind of foundational, easy-to-silently-regress code that warrants a
      lasting automated guard rather than prove-once-and-delete. The route
      (`app/routes/$lang+/_public+/e2e-i18n-fixture.tsx`), both fixture locale files
      (`locales/en|fr/__e2e_fixture__.json`), and the E2E spec
      (`tests/e2e/i18n/ssr-locale-resolution.spec.ts`) are **kept permanently**, not removed, specifically
      because no real domain namespace exists yet to provide equivalent SSR-pipeline coverage. Re-ran
      `npx react-router typegen` after restoring the route (the delete had left it stale; re-adding needed
      the same regeneration), confirmed `yarn tsc` clean, and re-ran `yarn test:e2e` on the restored spec —
      all 5 tests pass.

## 10. Quality gates (run in order, all MUST pass before proceeding to Section 11)

- [x] 10.1 `yarn vitest run tests/unit/domains/i18n/findLocale.test.ts tests/unit/domains/i18n/i18nextMiddleware.test.ts tests/unit/domains/i18n/I18nServicePort.test.ts tests/unit/scripts/i18nextParserConfig.test.ts tests/unit/scripts/checkI18nMissingKeys.test.ts` — all new tests still green (17/17 pass).
- [x] 10.2 `yarn tsc` — zero TypeScript errors across the whole repo, not just new files. Confirmed clean.
- [x] 10.3 `yarn format:check` — Prettier clean over this change's full file set (run `yarn format` first if
      not). Note: `openspec/changes/ca-i18n-adr001-infra/tasks.md` needed 2-3 extra `--write` passes to
      converge — a pre-existing Prettier markdown idempotency quirk on long wrapped inline-code spans, not
      introduced by this change.
- [x] 10.4 Anti-pattern review — checked every new/changed file against `.github/skills/anti-pattern-check/SKILL.md`.
      Findings fixed: (1) `findLocale`'s catch block silently swallowed all errors — now logs via
      `getPinoLogger().error()` matching `requestContextMiddleware`'s convention, still fails open; (2)
      `checkMissingKeys`'s `readKeySet` silently swallowed JSON parse errors — now `console.warn`s on a
      genuinely malformed file (distinct from the expected "file doesn't exist yet" case); (3) hardcoded
      `"en"` magic strings in `app/middleware/i18next.server.ts`, `app/entry.client.tsx`, and
      `scripts/check-i18n-missing-keys.ts` replaced with the existing exported `DEFAULT_LANGUAGE` from
      `app/utils/lang.backend.ts`. Re-ran `yarn tsc`, the unit test suite, and the E2E spec after — all green.
- [x] 10.5 SOLID review — invoked the `solid-reviewer` agent against `app/middleware/i18next.server.ts`,
      `app/shared/i18n/I18nServicePort.ts`, `app/entry.client.tsx` (plus `app/entry.server.tsx`/`app/root.tsx`
      for coupling context). Findings: (1) **Fixed** — `root.tsx` reached directly into
      `getInstance(context).getDataByLanguage(lang)`, coupling a route loader to i18next's raw instance API
      (a DIP violation matching the "route calls Drizzle instead of a model function" smell). Added a
      purpose-built `getResourceBundle(context, lang)` export in `i18next.server.ts`; `root.tsx` now calls
      that instead. Added direct unit test coverage (2 new tests in `i18nextMiddleware.test.ts`). (2)
      **Deferred, not applied** — reviewer suggested extracting `findLocale` into its own module, separate
      from the middleware-config wiring, citing SRP (two reasons to change: resolution policy vs. backend
      config). Not applied: `design.md` Decision 3's own code sample and `tasks.md` Task 2.3 explicitly place
      `findLocale` in `app/middleware/i18next.server.ts` as a reviewed, named design decision — splitting the
      file would be a design deviation requiring separate approval, not a Refactor-phase call to make
      unilaterally. Noted here for a future PR if desired. I18nServicePort.ts and entry.client.tsx had no
      findings.
- [x] 10.6 Documentation review — confirmed comments (including the Decision 3 hook-point comments) explain
      WHY, not WHAT, and stay terse (one line per point) after trimming an initial over-commenting habit
      flagged mid-implementation; no file has more comment lines than code lines.
- [x] 10.7 Project conventions review — checked `.github/copilot-instructions.md` against every new file.
      No auth wrapper on the fixture route's loader matches the sibling `_public+/about+/about-the-system.tsx`
      precedent (public routes rely on `_public.tsx`'s optional-user loader, not a per-route `authLoader*`).
      No new env var (matches proposal). `.server.ts` suffix used for the one new server-only file
      (`app/middleware/i18next.server.ts`). No `countryAccountsId`-scoped query added directly (delegates to
      the existing `getCountrySettingsFromSession` accessor). No known-bug pattern reproduced.
- [x] 10.8 Code review — ran `.github/skills/code-review/SKILL.md` in full (high effort) over the complete
      diff. Findings and resolutions: - **Fixed** — spec `i18n-ssr-middleware`'s "Missing namespace file does not crash the request" scenario
      had no test anywhere. Added a 4th E2E test: `/es/e2e-i18n-fixture` (`es` is in `VALID_LANGUAGES` but
      has no `locales/es/__e2e_fixture__.json`) asserts `200` and a correct fallback to the `en` fixture
      text — proves a missing namespace file neither crashes the request nor renders blank. - **Fixed** — the new `readKeySet` parse-failure branch (added during the anti-pattern pass) had no
      test. Added a test writing a malformed `fr/notices.json`, asserting the malformed locale is treated
      as empty (all reference keys reported missing) and a `console.warn` fires, without throwing. - **Raised and resolved with the coordinator** — whether `console.log`/`console.warn` in
      `scripts/check-i18n-missing-keys.ts` complies with ADR-004 (Pino, structured objects, no raw
      console). Verified directly against `_docs/decisions/ADR-004-logging-and-traceability.md`: its
      Status is "Proposed" (not enforced — confirmed zero ESLint config/`no-console` rule anywhere in the
      repo), and the existing sibling script `scripts/extractor-i18n.ts` already uses plain
      `console.log` with string interpolation for the same reason (standalone CLI script, no request
      context to correlate). Coordinator agreed: leave as `console.log`/`console.warn`, matching that
      precedent; `app/middleware/i18next.server.ts`'s `findLocale` (genuine server-side request-handling
      code) correctly uses structured `getPinoLogger().error({ msg, err })` instead, which is unaffected. - **Verified, no issue found** — malformed-request handling, resource lifecycle (no persistent
      handles held), `getResourceBundle`/`i18nResourceBundle` accessor completeness, no `as any`/non-null
      assertions anywhere in the new files (confirmed via direct grep), no TBD/placeholder text in any
      artifact, all `import type` used correctly for type-only imports, no unnecessary intermediate
      variables or dead code. `i18n-namespace-file-structure` spec's "no domain namespace file exists"
      scenario updated with an explicit `EXCEPT` clause for the now-permanent `__e2e_fixture__` files (its
      double-underscore name doesn't match the scenario's own `[a-z-]+` regex, but the exception is
      spelled out for a future reader rather than left implicit).
      Re-ran `yarn tsc`, the full unit suite (22/22 pass), and the E2E spec (4 real tests + 2 setup/teardown,
      all pass) after every fix.
- [x] 10.9 Visual/UX parity review — **N/A**, recorded explicitly rather than skipped. No presentation-layer
      page was added or modified (`app/domains/*/presentation/` untouched; no `app/routes/` change carries
      real UI). The permanent E2E fixture route (`app/routes/$lang+/_public+/e2e-i18n-fixture.tsx`) renders a
      single bare `<div>{t("greeting")}</div>` with no layout, no shared components, and no navigation
      surface — there is nothing to compare against a reference page for.

- [x] 10.10 Fresh outsider code review (independent agent, no prior context) — 3 real findings, all fixed:
      (1) **Fixed** — client resource-bundle race reintroduced despite Decision 7: `getResourceBundle` was
      still called in the root **loader**, racing a child route's `loadNamespaces()`. Moved the read to
      render time (`useContext(I18nContext)`), per Decision 4's addendum. Verified by hand: the previously
      race-exposed script tag returned `{}` on a live `yarn dev` request until fixed, `{"__e2e_fixture__":
{...}}` after; `yarn playwright test ssr-locale-resolution.spec.ts --repeat-each=5` (20 iterations)
      passed clean both before and after, confirming the fix and ruling out newly-introduced flakiness.
      (2) **Fixed** — `root.tsx`'s middleware-order comment claimed a `requestContextMiddleware` dependency
      `findLocale` doesn't actually have; reworded to state the real (future, not current) reason.
      (3) **Fixed** — `check-i18n-missing-keys.ts` treated `__e2e_fixture__` as a real domain, permanently
      reporting it missing on every non-`fr` locale; now skips `__*__` namespaces, with a new unit test.
      Re-ran `yarn tsc`, the i18n-related unit suites (20/20 pass, incl. 1 new test for fix 3), and
      `test:run2` (same 4 pre-existing unrelated failures, unchanged) after all three fixes.

## 11. Regression and archive

- [x] 11.1 `yarn test:run2` (full PGlite suite) — ran on this branch: 4 failures across 3 files (`tests/unit
/routes/mcp.test.ts`, `tests/unit/services/approvalStatusWorkflowService.test.ts`,
      `tests/integration/db/queries/entityValidationAssignmentRepository.test.ts`), 298/302 tests passing.
      None of these 3 files were touched by this change (confirmed via `git status --short` — zero diff on
      any of them). **Baseline verification judgment call**: the task text says confirm against `dev`, but
      `origin/dev` does not contain 2 of the 3 files at all (`git worktree add` at `origin/dev` — confirmed
      via `ls`, "No such file or directory" — these tests were added by earlier, already-committed work on
      this feature branch, not yet merged to `dev`). Comparing against `dev` for those 2 files would be
      comparing against a state that doesn't have the test at all, not a meaningful "pre-existing or not"
      signal. Instead compared against this branch's own HEAD commit — the true pre-session state, since
      nothing was committed during this session (`git worktree add` at HEAD `992a017e`, a separate directory,
      no changes to this working tree). All 4 failures reproduced byte-for-byte identically (same error
      messages, same line numbers) against that HEAD. Confirmed pre-existing, not introduced by this change.
      Both baseline worktrees removed after verification; working tree diff confirmed unchanged.
- [x] 11.2 `yarn test:run3` — 216/433 tests failed, ALL with the identical root cause:
      `connect ENOENT /var/run/postgresql//.s.PGSQL.5432`. This is a pre-existing environment
      configuration issue, not a code regression: `.env.test`'s `DATABASE_URL` is configured to connect via
      a Unix domain socket path (`host=/var/run/postgresql/`), which does not exist on this Windows machine
      (confirmed: `git status --short .env.test` shows zero diff — it is untouched, last modified by
      unrelated pre-existing commits). Confirmed the real Postgres server itself is reachable — a plain TCP
      check to `localhost:5432` succeeds, and `.env.playwright`'s TCP-based `DATABASE_URL` works fine for
      `test:e2e`'s DB setup/teardown steps. This failure would reproduce identically on any commit checked
      out on this machine with this same `.env.test` — it is not specific to this branch or this change, so
      no separate baseline run was needed to establish that. Not fixed: `.env.test` is a shared environment
      config file outside this change's scope; editing it to suit this one sandbox risks breaking whatever
      Linux/CI/WSL setup it was written for, and is unrelated to ADR-001 i18n infrastructure.

      `yarn test:e2e` (full suite) — the 4 new tests added by this change
      (`tests/e2e/i18n/ssr-locale-resolution.spec.ts`) all pass. The 15 failing tests are all pre-existing,
      in unrelated domains (disaster-event, disaster-records, hazardous-event, login) — confirmed
      pre-existing by reproducing the identical 15 failures against this branch's pre-session HEAD in a
      separate worktree.

- [x] 11.3 Run `opsx:archive` on this branch (`feature/ca-i18n-adr001-infra`) before raising the PR.

## 12. Post-archive: React Router v8 compat fix (before PR)

`dev` upgraded to React Router v8 (`#658`) before this branch's PR was opened, breaking the exact-pinned
`remix-i18next@7.5.0` (requires react-router `^7.0.0`; see design.md Decision 1's correction).

- [x] 12.1 Merged `origin/dev` into this branch (merge commit, not rebase — branch already pushed).
      Real conflicts limited to `package.json`/`yarn.lock`; `readme.md` and `react-router.config.ts`
      auto-merged clean.
- [x] 12.2 Resolved `package.json` by hand (kept dev's RR8 bumps + this branch's i18n deps, bumped
      `remix-i18next` to exact `8.0.0`), regenerated `yarn.lock` via `yarn install` rather than
      hand-merging it — required a clean `node_modules` reinstall building from dev's own already-working
      lockfile as the base, then layering the 5 i18n packages on top incrementally (a from-scratch resolve
      with no lockfile at all hit a yarn v1 linker bug unrelated to any real version conflict).
- [x] 12.3 Switched `i18next-parser` → `i18next-cli`: the former's upstream repo is archived
      (2026-02-22), a hard EOL. New `i18next.config.ts` replaces `i18next-parser.config.js`. Caught and
      fixed a real bug before it shipped: i18next-cli's `extract` auto-creates locale files for every
      configured language and defaults to `removeUnusedKeys: true` — running it against the permanent
      `__e2e_fixture__` namespace created an empty `locales/es/__e2e_fixture__.json`, which would have
      silently broken the E2E test asserting `es` has no fixture file and falls back to English. Fixed via
      `extract.ignoreNamespaces: ["__e2e_fixture__"]`; verified by re-running extraction and confirming
      `git status locales/` reports zero changes.
- [x] 12.4 Applied the 2 required code changes in `app/middleware/i18next.server.ts`: import path
      `"remix-i18next/middleware"` → `"remix-i18next"` (subpath export removed in 8.0.0); `findLocale`'s
      parameter changed from a bare `Request` to the full middleware-args object (`FindLocaleArgs`, derived
      from `createI18nextMiddleware.Options["detection"]["findLocale"]` since the library doesn't export
      that type directly). Updated `findLocale.test.ts` and `i18nextMiddleware.test.ts` accordingly.
      Confirmed via real installed `node_modules` (not docs) that `entry.server.tsx` needed no change.
- [x] 12.5 Verification sweep: `yarn tsc --noEmit` clean; i18n-scoped unit tests 24/24; `yarn format:check`
      clean; `yarn test:run2` 300/304 (same 4 pre-existing failures, confirmed stable across repeated
      runs); i18n E2E spec `--repeat-each=5` clean (one transient Vite dep-optimizer 504 on the very first
      run after the dependency churn, gone on retry — not a code issue); manual `yarn dev` smoke test on
      `/en`, `/fr`, `/es` fixture routes and the old `ViewContext.t()` system; full `yarn test:e2e` 8/23
      pass, same 15 pre-existing failures as the established baseline.
- [x] 12.6 Fresh outsider code review scoped to this fix only (not the whole change). Verified every
      dependency-compatibility claim against the actually-installed packages rather than trusting them;
      empirically re-confirmed the `ignoreNamespaces` fix by running the real extractor. No blocking
      issues. Fixed: 2 stale doc references to `i18next-parser` in living (non-archived) docs
      (`openspec/specs/i18n-key-extraction/spec.md`, `_docs/decisions/ADR-001-multilingual-strategy.md`).
