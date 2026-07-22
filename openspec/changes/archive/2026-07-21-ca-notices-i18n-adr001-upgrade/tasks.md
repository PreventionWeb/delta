## 1. Locale namespace files (foundation)

- [x] 1.1 Create `locales/en/notices.json` with the nested key structure from design.md Decision 1
      (`list.empty`, `list.columns.{title,status,published_at,updated_at,actions}`,
      `status.{published,draft}`, `title`, `error.{generic,generic_retry}`), values matching the
      current `msg:` fallback text in `NoticeListPage.tsx`/`NoticeDetailPage.tsx`/the two route
      files byte-for-byte (design.md Migration Plan step 2 — no visible English change).
- [x] 1.2 Create `locales/fr/notices.json` with real French translations for the same key set
      (not English copies — a French speaker's actual translation, or a clearly-marked TODO
      value per existing Weblate-handoff convention if translation isn't available at
      implementation time; do not leave a key silently missing, since that's the "old system"
      gap this change is explicitly not supposed to reproduce).
- [x] 1.3 Create `locales/en/common.json` with exactly one key: `{"view": "View"}`.
- [x] 1.4 Create `locales/fr/common.json` with the French translation of `view`.
- [x] 1.5 Verify: run `yarn tsc` — these are plain JSON files, this step confirms no path or
      import wiring elsewhere in the repo broke from adding them.

## 2. NoticeListPage.tsx upgrade (TDD)

- [x] 2.1 (Red) Rewrite `tests/unit/domains/notices/presentation/NoticeListPage.test.tsx` to
      remove the `vi.stubGlobal("createTranslationGetter", ...)` stub and instead wrap
      `NoticeListPage` in a real `I18nextProvider` backed by a dedicated `i18next.createInstance()`
      initialized with inline `resources` for the `notices`/`common` namespaces (design.md
      Decision 5). Add assertions for: the empty-state message, all five column headers, both
      status labels, and the row action's accessible label — each asserted against the actual
      translated string, not the raw key. Confirm this test fails against the current
      (unconverted) `NoticeListPage.tsx`.
- [x] 2.2 (Green) Convert all 8 `ctx.t({code, msg})` calls in `NoticeListPage.tsx` to
      `useTranslation("notices")`'s `t("...")`, and the `common.view` call to
      `useTranslation("common")`'s `t("view")`, per the key names chosen in Task 1.1/1.3. Keep
      `useViewContext()` for `.lang` only.
- [x] 2.3 Run `yarn vitest run tests/unit/domains/notices/presentation/NoticeListPage.test.tsx` —
      confirm green.
- [x] 2.4 (Refactor) Review the converted file for duplicated `useTranslation` calls or
      unnecessary intermediate variables; simplify without changing behavior.

## 3. NoticeDetailPage.tsx upgrade (TDD)

- [x] 3.1 (Red) Rewrite `tests/unit/domains/notices/presentation/NoticeDetailPage.test.tsx` with
      the same `I18nextProvider` test setup as Task 2.1. Confirm it fails against the current
      (unconverted) `NoticeDetailPage.tsx`.
- [x] 3.2 (Green) Convert both `ctx.t()` calls (`status_published`, `status_draft`) in
      `NoticeDetailPage.tsx` to `useTranslation("notices")`'s `t("status.published")` /
      `t("status.draft")`. Keep `useViewContext()` for `.lang` only.
- [x] 3.3 Run `yarn vitest run tests/unit/domains/notices/presentation/NoticeDetailPage.test.tsx`
      — confirm green.
- [x] 3.4 (Refactor) Confirm the existing locale-fallback-chain tests (current-language present /
      absent / neither present) still exercise the same `resolveLocale` helper, untouched.

## 4. NoticeErrorBoundary.tsx — add first-ever translation calls (genuine gap fix, TDD)

- [x] 4.1 (Red) Update `tests/unit/domains/notices/presentation/NoticeErrorBoundary.test.tsx` to
      wrap the component in the same `I18nextProvider` test setup, and change the two existing
      assertions on hardcoded English text ("unexpected error") to assert against the translated
      string from `locales/en/notices.json`'s `error.generic_retry` key. Add a new assertion
      confirming the rendered fallback text is NOT interpolated with `error.message` even when a
      translation call is involved (guards design.md's Risk 1). Confirm this test fails against
      the current (hardcoded-string) `NoticeErrorBoundary.tsx`.
- [x] 4.2 (Green) Add `useTranslation("notices")` to `NoticeErrorBoundary.tsx` and replace both
      hardcoded literals ("An unexpected error occurred." and the non-Response fallback) with
      `t("error.generic")` / `t("error.generic_retry")` respectively. Do not pass any error
      property as an interpolation value.
- [x] 4.3 Run `yarn vitest run tests/unit/domains/notices/presentation/NoticeErrorBoundary.test.tsx`
      — confirm green, including the existing secret-leak-guard assertions still pass unmodified.
- [x] 4.4 (Refactor) Confirm no behavior change to the `isRouteErrorResponse(error)` branch
      (the ADR-003 envelope path), which is unaffected by this task group.

## 5. Route loaders — namespace loading and title conversion (TDD)

- [x] 5.1 (Red) In `tests/integration/domains/notices/routes/NoticesIndexRoute.test.ts`, add the
      `makeI18nContext(url)` helper from design.md Decision 4 (constructs a `RouterContextProvider`
      and runs it through the real, imported `i18nextMiddleware`), and switch `makeArgs` to use it
      instead of `context: {}`. Add a new test asserting the loader completes without throwing
      when `getInstance(context).loadNamespaces(...)` is called (this will fail — either a
      TypeError on the current `{}` cast, or a "No value found for context" throw, per design.md
      Context section — confirm which, to document the actual failure mode observed).
- [x] 5.2 (Red) Repeat Task 5.1's context-priming change in
      `tests/integration/domains/notices/routes/NoticeDetailRoute.test.ts`.
- [x] 5.3 (Green) Add `context` to the destructured loader args and call
      `await getInstance(context).loadNamespaces(["notices", "common"])` in both
      `app/routes/$lang+/_authenticated+/notices+/_index.tsx` and `.../$id.tsx`, before the
      existing try/catch use-case call. Import `getInstance` from `~/middleware/i18next.server`.
- [x] 5.4 (Green) Convert each route file's `ctx.t({ code: "notices", msg: "Notices" })` call
      (used for `MainContainer`'s `title` prop) to `useTranslation("notices")`'s `t("title")`.
      `useViewContext()` may be removed entirely from each route file if `.lang`/`.t` are no
      longer used there — verify before removing the import.
- [x] 5.5 Run `yarn vitest run tests/integration/domains/notices/routes/NoticesIndexRoute.test.ts
tests/integration/domains/notices/routes/NoticeDetailRoute.test.ts` — confirm both green,
      including every pre-existing test case in these files (tenant resolution, pagination,
      error-envelope, non-DomainError rethrow) still passes unmodified.
- [x] 5.6 (Refactor) Confirm both route files remain under the 60-line limit the existing
      `notices-route-adapter` spec requires; if the `loadNamespaces` addition pushes either file
      over, extract a tiny shared helper rather than inlining duplicated logic — but only if
      actually needed.

## 6. Client-side navigation verification (Playwright, empirical — design.md Decision 7)

- [x] 6.1 Add two new test cases to `tests/e2e/notices/notices.spec.ts`: (a) log in, load
      `/en/notices` as a full page load, click the row action link for the seeded notice to
      client-side-navigate to its detail route, and assert the rendered status label is the
      correct translated text (not a raw key, not stale/missing text); (b) from that detail page,
      client-side-navigate back to the list route and assert the column headers render correctly
      translated text.
- [x] 6.2 Run `yarn test:e2e` scoped to `tests/e2e/notices/notices.spec.ts` and observe the
      actual result.
- [x] 6.3 **Decision point, not a default action**: if both new test cases pass, record that
      finding in this change's PR description as empirical confirmation the infra design's
      documented client-navigation limitation does not manifest for same-namespace, same-locale
      navigation. If either test fails (stale or missing translated text), STOP — do not attempt
      a workaround unilaterally. Report the exact failure to the user per design.md's Open
      Questions and design.md Decision 7's explicit escalation requirement; the fix approach is
      out of scope for this task list until that conversation happens.

## 7. Infra fixture removal — signed off, in scope (design.md Decision 6)

User sign-off has been obtained for deleting the merged infra change's `e2e-i18n-fixture`
scaffold as part of this change (design.md Decision 6). This section MUST NOT start until every
task in Section 6 is complete and both new Playwright cases pass (Task 6.2) — deleting the old
fixture before the new coverage is proven green would leave a window with zero SSR-pipeline E2E
coverage.

- [x] 7.1 **Prerequisite gate.** Confirm Task 6.2's two new Playwright cases (list→detail and
      detail→list client-side navigation) are green, and Task 6.3's decision point recorded no
      unresolved finding. Do not proceed to 7.2 otherwise — if the client-navigation limitation
      reproduced, that conversation with the user must resolve first, since it may change whether
      this change's E2E coverage is truly an adequate substitute for the fixture being deleted.
- [x] 7.2 Delete `app/routes/$lang+/_public+/e2e-i18n-fixture.tsx`.
- [x] 7.3 Delete `locales/en/__e2e_fixture__.json` and `locales/fr/__e2e_fixture__.json`.
- [x] 7.4 Delete `tests/e2e/i18n/ssr-locale-resolution.spec.ts`.
- [x] 7.5 In `i18next.config.ts`, remove the `ignoreNamespaces: ["__e2e_fixture__"]` line and its
      preceding explanatory comment ("`__e2e_fixture__` is hand-crafted and intentionally
      partial…") — this entry existed only to protect the now-deleted fixture from the extraction
      pipeline and becomes dead configuration once it's gone. Confirm no other value needs to
      remain in `extract.ignoreNamespaces` (verify by reading the file — if the array becomes
      empty, remove the key entirely rather than leaving `ignoreNamespaces: []`).
- [x] 7.6 In `tests/unit/scripts/i18nextCliConfig.test.ts`, remove the
      `"excludes the permanent E2E fixture namespace from automated extraction"` test case
      (asserts `config.extract.ignoreNamespaces` contains `"__e2e_fixture__"`) — it now asserts
      against configuration that no longer exists.
- [x] 7.7 Run `yarn vitest run tests/unit/scripts/i18nextCliConfig.test.ts` — confirm the
      remaining three test cases in this file still pass unmodified.
- [x] 7.8 Confirm `tests/unit/scripts/checkI18nMissingKeys.test.ts` needs no change: it tests the
      generic `__*__`-namespace skip behavior of `scripts/check-i18n-missing-keys.ts` (the
      `/^__.*__$/` filter) against a synthetic tmpdir fixture it creates itself, not against the
      real `locales/` directory — verify this by reading both files before assuming it's
      unaffected, then run
      `yarn vitest run tests/unit/scripts/checkI18nMissingKeys.test.ts` to confirm it still
      passes with the real fixture files gone.
- [x] 7.9 Run `yarn tsc` — confirm no dangling import or reference to any deleted file remains
      anywhere in the repository (route registration, test helpers, or otherwise).

## 8. Quality gates

- [x] 8.1 `yarn vitest run tests/unit/domains/notices/presentation/NoticeListPage.test.tsx tests/unit/domains/notices/presentation/NoticeDetailPage.test.tsx tests/unit/domains/notices/presentation/NoticeErrorBoundary.test.tsx tests/integration/domains/notices/routes/NoticesIndexRoute.test.ts tests/integration/domains/notices/routes/NoticeDetailRoute.test.ts tests/unit/scripts/i18nextCliConfig.test.ts tests/unit/scripts/checkI18nMissingKeys.test.ts` — all green.
- [x] 8.2 `yarn tsc` — zero TypeScript errors.
- [x] 8.3 `yarn format:check` — Prettier clean (run `yarn format` to fix if not).
- [x] 8.4 Anti-pattern review — check `.github/skills/anti-pattern-check/SKILL.md` against every
      changed file in this task list, including the Section 7 deletions and `i18next.config.ts`.
- [x] 8.5 SOLID review — invoke the `solid-reviewer` agent against the changed presentation and
      route files.
- [x] 8.6 Documentation review — confirm comments explain WHY (e.g. why `loadNamespaces` is
      called with both namespaces on both routes) not WHAT; no restating of obvious code.
- [x] 8.7 Project conventions review — check `.github/copilot-instructions.md`.
- [x] 8.8 Code review — run `.github/skills/code-review/SKILL.md` in full over the diff.
- [x] 8.9 Visual/UX parity review — render `/en/notices` and `/en/notices/:id` via `yarn dev` and
      compare against the pre-change screenshots (or the archived route-adapter design's own
      screenshots, per its Decision 9/10 history) to confirm the `MainContainer` wrapper, column
      layout, and the row action affordance are visually unchanged — this change alters string
      _sourcing_ only, so no layout or affordance regression is expected, but it must be
      confirmed, not assumed, per this project's visual-parity gate.

## 9. Post-implementation refinement: generic error strings moved to `common.json`

- [x] 9.1 Moved `error.generic`/`error.generic_retry` from `notices.json` to `common.json`
      (neither is Notices-specific — the real "not found" text comes from server-side
      `DomainError.message`, not a client `t()` call). `NoticeErrorBoundary.tsx` now uses
      `useTranslation("common")`. No loader change needed (already loads both namespaces).
- [x] 9.2 Updated `NoticeErrorBoundary.test.tsx`'s inline i18n mirror to match — 6/6 pass.
- [x] 9.3 Rejected adding an unused sample domain-specific error key to `notices.json` (dead
      content) — documented the common-vs-domain convention in `locales/README.md` instead.
- [x] 9.4 `yarn tsc` clean; full Notices unit/integration suite 38/38 pass.

## 10. Regression and archive

- [x] 10.1 Run `yarn test:run2` (full PGlite suite) — confirm no new failures. Any pre-existing
      failure must be independently confirmed as pre-existing by running the same suite on the
      branch's pre-change commit before attributing it to something else.
- [x] 10.2 Run `opsx:archive` on this branch before raising the PR.
