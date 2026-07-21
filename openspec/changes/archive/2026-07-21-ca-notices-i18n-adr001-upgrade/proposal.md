## Why

The Notices presentation layer (`NoticeListPage.tsx`, `NoticeDetailPage.tsx`, the two
`notices+` route files) was shipped against the old `useViewContext().t({code, msg})` system,
with the ADR-001 gap explicitly documented as a known, accepted limitation in
`openspec/changes/archive/2026-07-10-ca-notices-route-adapter/design.md`'s Risks section — a
scheduled follow-up, not an oversight. The prerequisite infrastructure
(`react-i18next`/`remix-i18next`, server middleware, client hydration) has since landed as its
own change (archived at `openspec/changes/archive/2026-07-15-ca-i18n-adr001-infra/`), but that
change deliberately created zero real namespace files and zero consumers — Notices is meant to
be its first. This proposal is that scheduled upgrade, done on the current
`feature/ca-notices-route-adapter` branch before its own PR opens, per explicit user direction
to land both pieces of work together.

## What Changes

- Convert all 10 `ctx.t({code, msg})` call sites in `NoticeListPage.tsx` (8) and
  `NoticeDetailPage.tsx` (2) to `useTranslation("notices")`'s `t("key")` syntax, using
  i18next's default nested-JSON key structure (`keySeparator: "."`, no custom separator).
- Add real i18next keys to `NoticeErrorBoundary.tsx` for its two currently-hardcoded English
  strings ("An unexpected error occurred." / the non-Response fallback) — this is a genuine gap
  fix, not a mechanical swap, since the component currently has no translation calls at all.
- Convert the single `ctx.t()` call in each of the two route files
  (`app/routes/$lang+/_authenticated+/notices+/_index.tsx`, `.../$id.tsx`) used for
  `MainContainer`'s title, and add the required `await getInstance(context).loadNamespaces("notices")`
  call to each loader (the shared server i18next instance defaults to `ns: []`; a namespace must
  be explicitly loaded before any `t()` call depending on it will resolve real strings during SSR).
- Create `locales/en/notices.json` and `locales/fr/notices.json` (first real
  `locales/<lang>/<domain>.json` files in the repo) holding the migrated Notices strings.
- Create `locales/en/common.json` and `locales/fr/common.json` as a new, permanent
  cross-domain namespace, seeded with a `view` key migrated from the old system's widely-used
  `common.view` — scoped narrowly to Notices' own "View" action button in this change; the five
  other existing `common.view` consumers (`ActionLinks.tsx`, `action_links.tsx`, `view_form.tsx`,
  and the two settings routes under `assets+`/`geography+`) are explicitly out of scope and keep
  using the old key.
- Update the three unit test files under `tests/unit/domains/notices/presentation/` to stop
  stubbing the old `createTranslationGetter` global and instead wrap components in a real
  `I18nextProvider` (react-i18next's documented test pattern — ADR-001 §Consequences: "New
  domain components are testable without a full router context").
- Update the two integration route test files
  (`tests/integration/domains/notices/routes/{NoticesIndexRoute,NoticeDetailRoute}.test.ts`) to
  construct a context that actually satisfies `getInstance(context)` once the loaders call
  `loadNamespaces` — their current `context: {}` cast will throw at runtime once that call is
  added (see design.md for why, and why the existing `layout-auth.test.ts`
  `new RouterContextProvider()` pattern alone is not sufficient here).
- Add a new Playwright test in `tests/e2e/notices/notices.spec.ts` that actually drives
  list → detail and detail → list client-side (SPA) navigation and asserts translated text
  remains correct, to empirically settle whether the infra change's documented
  client-navigation resource-bundle limitation manifests for Notices (both routes share the
  same "notices" namespace and never change language mid-flow, which may mean it does not — but
  this must be proven, not assumed).
- **Delete the merged infra change's now-redundant `e2e-i18n-fixture` scaffold**, per its own
  design.md's explicit "Removal trigger" (removal is due once a real domain upgrade lands its own
  SSR-pipeline E2E coverage — this change's Playwright test, above, is that coverage) and explicit
  user sign-off obtained for including it in this change's scope:
  `app/routes/$lang+/_public+/e2e-i18n-fixture.tsx`, `locales/en/__e2e_fixture__.json`,
  `locales/fr/__e2e_fixture__.json`, `tests/e2e/i18n/ssr-locale-resolution.spec.ts`, the
  `ignoreNamespaces: ["__e2e_fixture__"]` entry (and its explanatory comment) in
  `i18next.config.ts` that existed only to protect this fixture, and the corresponding assertion
  in `tests/unit/scripts/i18nextCliConfig.test.ts` that checked for that entry. This deletion is
  sequenced after this change's own client-side-navigation E2E test is written and passing, so
  there is no window with zero SSR-pipeline E2E coverage.

**Not changed**: `app/middleware/i18next.server.ts` or any other already-merged i18n
infrastructure file (the one exception being the signed-off `e2e-i18n-fixture` scaffold deletion
above); any other domain's translation calls; `common.view` usage outside `NoticeListPage.tsx`;
any DB schema, use case, or repository code.

## Capabilities

### New Capabilities
- `notices-i18n-presentation`: Notices' list, detail, and error-boundary presentation
  components render translated strings via `react-i18next`'s `useTranslation("notices")` (and
  `useTranslation("common")` for the shared "View" action), with both server-loaded namespaces
  available before render and correct behavior across client-side navigation between the two
  routes.

### Modified Capabilities
- `i18n-namespace-file-structure`: the existing requirement stating "no domain namespace file
  exists yet after this change ships" (from the infra change) no longer holds — `notices.json`
  and `common.json` are the first real `locales/<lang>/<domain>.json` files, created by this
  change. Additionally, the permanent-exception scenario carving out `__e2e_fixture__` files is
  removed, since this change deletes those files (see Decision 6 of design.md).

## Impact

**Files changed** (presentation-layer and locale files, plus the one signed-off infra-fixture
deletion, per role boundary):
- `app/domains/notices/presentation/NoticeListPage.tsx` — convert 8 `t()` calls
- `app/domains/notices/presentation/NoticeDetailPage.tsx` — convert 2 `t()` calls
- `app/domains/notices/presentation/NoticeErrorBoundary.tsx` — add first-ever translation calls
- `app/routes/$lang+/_authenticated+/notices+/_index.tsx` — convert title `t()` call, add `loadNamespaces`
- `app/routes/$lang+/_authenticated+/notices+/$id.tsx` — convert title `t()` call, add `loadNamespaces`
- `locales/en/notices.json`, `locales/fr/notices.json` — new
- `locales/en/common.json`, `locales/fr/common.json` — new
- `tests/unit/domains/notices/presentation/{NoticeListPage,NoticeDetailPage,NoticeErrorBoundary}.test.tsx` — updated
- `tests/integration/domains/notices/routes/{NoticesIndexRoute,NoticeDetailRoute}.test.ts` — updated
- `tests/e2e/notices/notices.spec.ts` — new client-side navigation test case(s)
- `app/routes/$lang+/_public+/e2e-i18n-fixture.tsx` — deleted (infra fixture, removal signed off)
- `locales/en/__e2e_fixture__.json`, `locales/fr/__e2e_fixture__.json` — deleted
- `tests/e2e/i18n/ssr-locale-resolution.spec.ts` — deleted
- `i18next.config.ts` — remove the `ignoreNamespaces: ["__e2e_fixture__"]` entry and its comment,
  now dead configuration once the fixture is deleted
- `tests/unit/scripts/i18nextCliConfig.test.ts` — remove the assertion checking for that entry

**No DB migration.** Pure presentation-layer, locale-file, and infra-fixture-cleanup change; no
schema, query, or use-case change.

**Test approach**: `yarn vitest run` for the three unit test files and two PGlite integration
test files (`yarn test:run2` covers the full suite as the final regression gate); `yarn test:e2e`
for the new Playwright client-navigation assertions.

**Security / multi-tenancy**: none. No query, auth wrapper, or tenant-scoping code is touched —
this is a display-string sourcing change only.

**Dependencies**: none new — `react-i18next`, `remix-i18next`, `i18next`, `i18next-fs-backend`
are already installed by the merged infra change.
