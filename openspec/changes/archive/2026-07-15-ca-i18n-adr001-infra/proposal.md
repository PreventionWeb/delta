## Why

ADR-001 (`_docs/decisions/ADR-001-multilingual-strategy.md`) decided that new domains built during the
Clean Architecture strangler-fig migration must use `react-i18next` + `remix-i18next` for frontend i18n,
a namespace-per-domain file structure, a second `i18next-parser` extraction pipeline, and a per-domain
`I18nService` port — coexisting with, not replacing, the existing `ViewContext.t({code, msg})` system.

None of this has ever been implemented. Verified directly: `react-i18next`, `remix-i18next`, `i18next`,
`i18next-fs-backend`, and `i18next-parser` are absent from `package.json`; there is no `locales/<lang>/<domain>.json`
file anywhere; no `I18nService` port exists under any `app/domains/*/application/ports/`; no `entry.client.tsx`
exists. The Notices domain (the first domain built under Clean Architecture) still uses the old flat
`locales/app/<lang>.json` + `ViewContext.t()` system exclusively. Every future domain needs this foundation
in place before it can follow ADR-001 — this proposal builds it now, without touching a single existing
translation call site.

## What Changes

- Add `react-i18next`, `i18next`, `remix-i18next@7.5.0` (pinned — v8 requires React Router v8, this repo is
  on React Router v7.18.1), and `i18next-fs-backend` as production dependencies; `i18next-parser` as a dev
  dependency.
- Wire `remix-i18next`'s middleware API (`createI18nextMiddleware` from `remix-i18next/middleware`) as a new
  server-side i18next instance that reads locale files from disk via `i18next-fs-backend` (never the generic
  HTTP backend). Registered in `app/root.tsx`'s `middleware` array **alongside** (after) the existing
  `requestContextMiddleware` — that middleware is untouched.
- Add `app/entry.client.tsx` (does not exist today; React Router v7's Vite plugin provides the default
  client entry in its absence) so the client-side i18next instance can hydrate using the server's already-loaded
  resource bundles — no client-side HTTP fetch, matching ADR-001's stated goal.
- Add the ADR-001 locale-resolution chain (`URL segment → user.preferredLocale → tenant default locale →
"en"`) as a `findLocale` callback. Reuses the existing URL-segment parsing convention (`VALID_LANGUAGES`
  from `app/utils/lang.backend.ts`) rather than inventing a second one. Step 3 (tenant default locale) is a
  real, working lookup: `instanceSystemSettingsTable` already has a tenant-scoped `language` column, and the
  session already caches that row via the existing `getCountrySettingsFromSession(request)` accessor
  (`app/utils/session.ts`) — the same accessor already used by several handlers (e.g.
  `app/backend.server/handlers/asset.ts`, `.../disaster_record.ts`). Step 2 (`user.preferredLocale`) remains
  an explicit, documented no-op hook point — that column does not exist yet (verified against `userTable`) —
  falling through null-safely to `"en"`, exactly as ADR-001 anticipates for the user column.
- Establish the new `locales/<lang>/<domain>.json` namespace-per-domain directory convention, distinct from
  and coexisting with the existing flat `locales/app/<lang>.json` files. **No actual domain translation file
  is created in this change** — infrastructure only.
- Add a new `yarn i18n:extract:new` script running `i18next-parser` (scans `t('key')` syntax) against the
  new namespace files, alongside the existing `yarn i18n:extractor` (scans `t({code,msg})` syntax) — both
  pipelines coexist per ADR-001.
- Add a non-blocking (report-only, never fails the build) CI check that logs missing keys across configured
  locales for the new namespace files. This repo currently has **no PR-triggered test/build workflow at all**
  (`codeql.yml` is push/PR but security-scan only; `prod.deploy.yml`'s quality-gates job only runs on manual
  `workflow_dispatch` for a prod deploy) — a new `pull_request`-triggered workflow file is added rather than
  extending an existing one, since none currently runs per-PR.
- Define a generic, reusable `I18nService` port shape in `app/shared/i18n/` (interface only) that future
  domains implement/extend in their own `application/ports/II18nService.ts`, per ADR-001's "each domain
  exposes an I18nService port" — this change does not add a concrete implementation for any domain.

## Capabilities

### New Capabilities

- `i18n-ssr-middleware`: Server + client i18next wiring — `createI18nextMiddleware` registration, fs-backend
  disk loading, locale-resolution chain (`findLocale`), and `entry.client.tsx` hydration without a client
  HTTP fetch.
- `i18n-namespace-file-structure`: The `locales/<lang>/<domain>.json` directory convention and its coexistence
  rules with the existing `locales/app/<lang>.json` flat files.
- `i18n-key-extraction`: The new `i18next-parser`-based extraction pipeline (`yarn i18n:extract:new`) that
  scans `t('key')` syntax, run independently of the existing custom extractor.
- `i18n-missing-key-ci-check`: A non-blocking CI workflow step that reports (never fails on) missing
  translation keys across configured locales, scoped to the new namespace files.
- `i18n-service-port`: The generic `I18nService` port interface shape in the shared layer, to be
  implemented per-domain in future work.

### Modified Capabilities

None. No existing spec-level behavior changes — the old translation system (`app/backend.server/translations.ts`,
`app/frontend/translations.ts`, `globalThis.createTranslationGetter`, `ViewContext.t()`) is not touched, and
no route or domain migrates to the new system as part of this change.

## Impact

**Files added:**

- `app/entry.client.tsx` — new custom client hydration entry (none exists today)
- `app/middleware/i18next.server.ts` — `createI18nextMiddleware` config, fs-backend wiring, `findLocale` chain
- `app/shared/i18n/I18nServicePort.ts` — generic port interface, no implementation
- `i18next-parser.config.js` — config for the new extraction pipeline (targets `locales/**/*.json` only)
- `scripts/check-i18n-missing-keys.ts` — logic for the non-blocking CI check
- `.github/workflows/i18n-key-check.yml` — new PR-triggered, non-blocking workflow

**Files modified:**

- `package.json` — new dependencies + `i18n:extract:new` script + CI-check script entry
- `app/root.tsx` — append the new middleware to the existing `middleware` array (existing
  `requestContextMiddleware` entry unchanged); no loader/component logic touched
- `app/entry.server.tsx` — hook server-side i18next instance creation into the existing bot/browser
  streaming handlers without altering the NestJS bootstrap or streaming behavior
- `example.env` — none anticipated (fs-backend reads static files; no new required env var), documented
  as a decision in design.md rather than assumed

**No DB migration.** No schema changes — `user.preferredLocale` remains explicitly out of scope (that
column does not exist and this change does not add it); the resolution chain is written to be null-safe
without it. The tenant default-locale column (`instanceSystemSettingsTable.language`) already exists today
and this change only reads it via existing session state — no migration is needed for step 3 either.

**Test approach:** PGlite is not applicable (no DB interaction). Unit tests (Vitest) for the `findLocale`
resolution chain and the missing-key-check script logic. A single Playwright E2E test proves SSR actually
renders locale-specific content for a non-default-locale URL via the real dev server — this is infrastructure
with no existing precedent, so it can only be verified with a genuine HTTP request through the full
`entry.server.tsx` → middleware → `entry.client.tsx` hydration pipeline; a minimal fixture string (not real
domain content, since no domain has adopted `t('key')` syntax yet) is used for the assertion.

**Security / multi-tenancy:** No new attack surface — locale resolution reads only the URL path and (when
those columns exist in future work) user/tenant records already governed by existing auth/session code. The
`findLocale` callback does not bypass `authLoaderWithPerm`/`authActionWithPerm`; it runs inside route
middleware, before which authentication has not yet necessarily resolved, so it must not assume a user is
present (mirrors the null-safe design already required by ADR-001).
