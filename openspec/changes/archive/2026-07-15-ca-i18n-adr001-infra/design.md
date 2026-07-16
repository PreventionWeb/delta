## Context

DELTA's new domains (Clean Architecture strangler-fig migration) currently have no ADR-001-compliant i18n
foundation. The old system remains: `app/backend.server/translations.ts` (`loadTranslations`,
`createTranslationGetter`) loads flat arrays from `locales/app/<lang>.json`; `app/init.server.tsx` assigns
`globalThis.createTranslationGetter = createTranslationGetter` during NestJS bootstrap; `app/frontend/translations.ts`
(`createTranslationScript`) serializes translations into a `window.DTS_TRANSLATIONS` / `window.DTS_LANG`
inline `<script>` in `app/root.tsx` for the old `ViewContext.t({code, msg})` pattern to read client-side.
None of this is touched by this change.

`app/root.tsx`'s loader resolves the URL-segment language today via `getLanguageAllowDefault(routeArgs)`
(`app/utils/lang.backend.ts`), which reads `params.lang` from the `$lang+` file-route segment against a
`VALID_LANGUAGES` allow-list, defaulting to `"en"`. `app/root.tsx` registers exactly one middleware today —
`requestContextMiddleware` (`app/middleware/requestContext.server.ts`) — which opens an `AsyncLocalStorage`
scope per request and populates `userId`/`tenantId` on it. `react-router.config.ts` already has
`future.v8_middleware: true` (confirmed, no change needed). There is no `app/entry.client.tsx` — React
Router v7's Vite plugin supplies its own default client entry when one is absent. `app/entry.server.tsx`
only calls `initServer()` (NestJS DI bootstrap) and picks bot-vs-browser streaming; `app/init.server.tsx`
bootstraps the NestJS application context and HTTP server and sets the old system's global getter.

**Version constraint discovered during research (not assumed):** `remix-i18next@latest` is 8.0.0 and its
`peerDependencies` require `react-router@^8.0.0` (checked via `npm view`). This repo is on
`react-router@^7.18.1`. The package's own README states: "If you're on React Router v7, use v7 ... v8 is
for React Router v8." The last v7-line release is `7.5.0`, whose peer range is `react-router@^7.0.0`,
`i18next@^24.0.0 || ^25.0.0 || ^26.0.0`, `react-i18next@^13.0.0` through `^17.0.0`. `remix-i18next@7.5.0`'s
own `middleware.d.ts` (inspected directly from the published tarball) exports:

```ts
export declare function createI18nextMiddleware(
	opts: createI18nextMiddleware.Options,
): createI18nextMiddleware.ReturnType;
// ReturnType = [MiddlewareFunction<Response>, getLocale, getInstance]
```

This is the same `Route.MiddlewareFunction` shape `requestContextMiddleware` already uses — confirming the
premise that this is "the exact same middleware pattern" is correct, not assumed.

## Goals / Non-Goals

**Goals:**

- Stand up the SSR + client i18next pipeline (server instance, fs-backend, middleware, hydration entry)
  so a future domain can start writing `t('namespace:key')` calls against real namespace files.
- Implement ADR-001's 4-step locale resolution chain faithfully: step 3 (tenant default locale) is a real,
  working lookup against the existing `instanceSystemSettingsTable.language` column (via the session cache),
  and step 2 (`user.preferredLocale`) is kept as an explicit, documented no-op since that column does not
  exist yet.
- Establish the namespace-per-domain file convention and the second extraction pipeline.
- Provide a generic `I18nService` port shape any domain's application layer can adopt.
- Add a non-blocking CI signal for missing keys in the new namespace files.

**Non-Goals:**

- Migrating any existing `ctx.t()` call site or `locales/app/*.json` file.
- Creating any real `locales/<lang>/<domain>.json` file (e.g. `locales/en/notices.json`) — that is the
  separate Notices-retrofit follow-up.
- Adding `user.preferredLocale` (that column does not exist and this change does not add it). No new DB
  column is introduced by this change at all — the tenant default-locale column
  (`instanceSystemSettingsTable.language`) already exists and is only newly _read_, via existing session
  state, not newly added.
- A concrete `I18nService` implementation for any domain.
- `nestjs-i18n` / external API translated responses.
- Making the missing-key check a merge gate.

## Decisions

### Decision 1: Pin `remix-i18next` to `7.5.0`, not `^7.0.0` or `latest`

Using a caret range risks a future `yarn install` picking up `8.x`, which requires React Router v8 and would
break the build. Exact-pin `7.5.0` in `package.json` (no `^`). This mirrors how the repo already pins exact
versions for sensitive framework packages (`isbot": "5.1.35"`, `"ol": "10.8.0"`).

### Decision 2: Server i18next instance uses `plugins: [FsBackend]` + `i18next.backend.loadPath`, not `i18next: { resources }`

`remix-i18next`'s own documented quick-start passes fully-bundled `resources` directly into
`createI18nextMiddleware({ i18next: { resources } })` — everything loaded into memory upfront, no backend
module. ADR-001 is explicit that SSR must read from disk via `i18next-fs-backend` to avoid an HTTP
round-trip, which also implies not eagerly loading every domain's every language into memory on cold start.
`i18next`'s `InitOptions.backend?: T` is a generic slot for backend-specific options (confirmed in
`i18next`'s own `typescript/options.d.ts`) — `i18next-fs-backend`'s `FsBackendOptions.loadPath` fits there.
Concretely:

```ts
createI18nextMiddleware({
	i18next: {
		backend: { loadPath: join(process.cwd(), "locales/{{lng}}/{{ns}}.json") },
		supportedLngs: VALID_LANGUAGES,
		fallbackLng: "en",
		ns: [], // populated per-route via getRouteNamespaces once a domain adopts this
	},
	plugins: [FsBackend],
	detection: {
		supportedLanguages: VALID_LANGUAGES,
		fallbackLanguage: "en",
		order: ["custom"],
		findLocale,
	},
});
```

Only `order: ["custom"]` is used — no `cookie`/`session`/`header` steps — because ADR-001's own resolution
chain (URL → user.preferredLocale → tenant.defaultLocale → "en") does not include a cookie step; adding one
would be a second, undocumented resolution mechanism the ADR does not call for. `findLocale` is the single
integration point implementing all 4 ADR steps (see Decision 3).

### Decision 3: `findLocale` implements the full ADR-001 chain in one function; step 3 is a real lookup, step 2 remains a documented no-op

```ts
// app/middleware/i18next.server.ts
async function findLocale(request: Request): Promise<string | null> {
	// Step 1: URL path segment — reuses the same allow-list the old system already
	// validates against (VALID_LANGUAGES), so both systems agree on what a "valid"
	// language segment looks like.
	const segment = new URL(request.url).pathname.split("/")[1];
	if (VALID_LANGUAGES.includes(segment)) return segment;

	// Step 2: user.preferredLocale — column does not exist yet (ADR-001 §Locale
	// Resolution Chain). Hook point kept explicit so this becomes a one-line change
	// once the column lands; today it always falls through.
	// const preferred = await getPreferredLocaleForUser(userId);
	// if (preferred) return preferred;

	// Step 3: tenant default locale — instanceSystemSettingsTable already has a
	// tenant-scoped `language` column (verified: `language: varchar("language")
	// .notNull().default("en")`, scoped via `countryAccountsId`), and the session
	// already caches that row via getCountrySettingsFromSession (app/utils/session.ts)
	// — the same accessor already used by existing handlers (e.g.
	// app/backend.server/handlers/asset.ts, .../disaster_record.ts) to read
	// `.language` off the cached row. No new column or query is needed, so this
	// step is implemented for real rather than deferred.
	const countrySettings = await getCountrySettingsFromSession(request);
	if (countrySettings?.language) return countrySettings.language;

	return null; // Step 4: fallbackLanguage: "en" applies automatically.
}
```

Returning `null` is safe: `LanguageDetectorOption.findLocale` is typed
`Promise<string | Array<string> | null>` and the detector falls through to `fallbackLanguage` on `null`
(confirmed from `remix-i18next`'s own `language-detector.d.ts`). Step 3 reads
`getCountrySettingsFromSession(request)` directly rather than `getRequestContext()` — `findLocale` already
receives `request`, and the session accessor already encapsulates tenant scoping (the cached row was fetched
and set into the session at login/country-selection time, scoped to that user's `countryAccountsId`), so no
new DB query or column is introduced. If no session exists yet or it has no `countrySettings` key (e.g. an
anonymous or pre-login request), `getCountrySettingsFromSession` resolves to `undefined` and the `?.language`
access falls through null-safely to step 4 — same fail-open behavior as the other hook points. Step 2 remains
a genuine no-op: `userTable` has no `preferredLocale` column and no accessor exists yet, so it stays commented
out for the reason below.

**Alternative considered:** implement step 2 against a speculative `getRequestContext()`-based lookup that
returns `null` unconditionally (i.e., write the "real" lookup now, but have it return null). Rejected — a
lookup function with a permanent `return null` body reads as a bug to a future maintainer; a clearly-commented
not-yet-implemented hook point communicates intent honestly. This reasoning applies only to step 2 now — step
3 has a real, already-existing accessor (`getCountrySettingsFromSession`) and a real backing column
(`instanceSystemSettingsTable.language`), so it is implemented for real rather than deferred as a hook point.

### Decision 4: `entry.client.tsx` hydrates from the server's already-loaded resource bundle — no client-side backend plugin

`remix-i18next`'s own example wiring for client hydration uses `i18next-fetch-backend` against a
`/api/locales/{{lng}}/{{ns}}` route — a legitimate pattern, but it performs an HTTP fetch during hydration,
which conflicts with ADR-001's stated goal ("the client hydrates without a separate HTTP fetch"). Instead:
`app/root.tsx`'s component reads `useContext(I18nContext)!.i18n.getDataByLanguage(lang)` at **render time**
and serializes the result into an inline `<script type="application/json" id="i18n-resource-bundle">` tag (a
distinct id from the old system's `window.DTS_TRANSLATIONS` global — no collision, and avoids adding a second
ad hoc `window.*` global).

**Correction (post-review):** the first implementation called `getResourceBundle(context, lang)` inside the
**root loader**, not at render time. React Router runs every matched route's loader concurrently, so a
child route's `loadNamespaces()` call (itself inside that child's loader) was not guaranteed to finish before
the root loader read the bundle — a real race, confirmed by moving the read to render time (which only
happens once every matched loader has settled) and verifying the previously-flaky hydration-console-errors
E2E test now passes consistently across repeated runs.

`app/entry.client.tsx` reads that script tag's JSON, calls
`i18next.use(initReactI18next).init({ resources: <parsed JSON>, lng, fallbackLng: "en" })`, then wraps
`<HydratedRouter />` in `<I18nextProvider>` before `hydrateRoot`. This mirrors React Router v7's own default
generated `entry.client.tsx` (verified: this repo currently has none, so the Vite plugin's built-in default
is the baseline being extended — the new file must preserve `startTransition` + `hydrateRoot(document, ...)`
against `<HydratedRouter />`, only adding the i18next init before it).

### Decision 5: `I18nService` port lives in `app/shared/i18n/`, not inside any domain

ADR-001 says "each domain exposes an I18nService port in its application layer" — e.g. Notices would define
its own `app/domains/notices/application/ports/II18nService.ts`, matching the existing convention seen in
`app/domains/notices/application/ports/INoticeRepository.ts` (interface prefixed `I`, JSDoc explaining the
DIP boundary and multi-tenancy contract). This change explicitly does not add that per-domain file — Notices'
own port is the separate follow-up. What this change adds is the **generic shape** every domain's port will
follow, at `app/shared/i18n/I18nServicePort.ts`:

```ts
export interface I18nServicePort {
	/**
	 * Translates a server-originated string (validation errors, notifications) for
	 * the given locale. `locale` is an explicit parameter — this port never reads
	 * from HTTP/session context, per ADR-001.
	 */
	translate(
		key: string,
		locale: string,
		params?: Record<string, string | number>,
	): Promise<string>;
}
```

Domain-specific ports (`II18nService.ts` under each domain's `application/ports/`) implement or extend this
shape with domain-specific namespacing; that wiring is out of scope here.

### Decision 6: Missing-key CI check is a new `pull_request`-triggered workflow, not an addition to `prod.deploy.yml`

Verified: `.github/workflows/prod.deploy.yml`'s `quality-gates` job (which runs `tsc`/`test:run2`/`test:run3`/
`test:e2e`) only triggers on `workflow_dispatch` for a manual prod deploy — never on a PR. `codeql.yml` is the
only workflow that runs `on: pull_request`, and it's a security scanner, not the right place to bolt on an
unrelated i18n check. A new `.github/workflows/i18n-key-check.yml`, triggered `on: pull_request` against
`main`/`dev` (matching `codeql.yml`'s branch scope), runs `scripts/check-i18n-missing-keys.ts` and always exits
0 — it prints a warning summary (missing key count per locale/namespace) via `console.warn` /
`core.warning()`-style annotations but never fails the step, satisfying "non-blocking."

**Scope recommendation — new namespace files only, not `locales/app/`:** the old flat files are already
covered by the existing custom extractor's duplicate-key check (P1-36, referenced in ADR-001) and have an
established Weblate workflow; retrofitting the old files into a second, differently-shaped check risks
conflicting signals during the migration window ADR-001 describes ("old and new systems coexist"). Scoping
the new check to `locales/<lang>/<domain>.json` only keeps its blast radius aligned with what this proposal
actually introduces. This is a judgment call, flagged as such — revisit once a domain retrofit is underway
and the old system's own gap (P1-34, language availability mismatch) is addressed.

**Correction (post-review):** the scan also picked up `__e2e_fixture__` (Decision 8's fixture namespace,
intentionally `en`+`fr` only) as a domain, reporting it "missing" on every other locale on every PR forever.
Fixed by skipping `__*__`-named namespaces in the scan.

### Decision 7 (corrected during implementation): `app/entry.server.tsx` DOES need a change — wrap `<ServerRouter>` in `<I18nextProvider>`

**This decision was wrong as originally written and has been corrected based on evidence gathered while
implementing Section 9's E2E test** (`tests/e2e/i18n/ssr-locale-resolution.spec.ts`). The original text below
is struck through for the record; the corrected reasoning follows.

~~The existing `handleBotRequest`/`handleBrowserRequest` functions ... so in practice no code change is
needed in `entry.server.tsx` at all ... `handleRequest` in `entry.server.tsx` does not [receive the
RouterContextProvider].~~

That premise is factually wrong for this repo's installed `react-router` version. Verified directly:
`node_modules/react-router/dist/development/index-react-server-client-3ykjivgQ.d.ts`'s
`HandleDocumentRequestFunction` type is `(request, responseStatusCode, responseHeaders, context: EntryContext,
loadContext: MiddlewareEnabled extends true ? RouterContextProvider : AppLoadContext)` — since this repo has
`future.v8_middleware: true`, `handleRequest`'s 5th argument **is** `RouterContextProvider`. `remix-i18next`'s
own README ("Server-side configuration" section) documents exactly this as the intended pattern: wrap
`<ServerRouter>` in `<I18nextProvider i18n={getInstance(routerContext)}>` inside `entry.server.tsx`, using
that 5th argument.

Without this, `useTranslation()` calls anywhere in the route tree fail during SSR with
`NO_I18NEXT_INSTANCE` and render the raw translation key instead of the translated string — confirmed by
actually running the E2E test before this fix (it failed exactly this way). An earlier interim workaround
(building a second, snapshot-based i18next instance inside `root.tsx`'s own component from loader data) was
tried and rejected: it introduces a real race condition, since `root.tsx`'s loader and a descendant route's
loader run in parallel, so `root.tsx` can snapshot the resource bundle before a sibling loader finishes
loading a namespace onto the shared instance. Wrapping in `entry.server.tsx` instead uses the single
per-request instance the middleware already created for everything — loaders' `t()`/`loadNamespaces()` calls
and the actual render — because `entry.server.tsx` only runs after all matched routes' loaders have settled.

**Follow-up correction (Decision 4 addendum, found in outsider review):** this same reasoning was not carried
through to the client-hydration bundle — `getResourceBundle(context, lang)` was still called inside the root
**loader** (not at render time), leaving the exact race this section describes. Fixed alongside; see Decision 4.

**Corrected change:** `app/entry.server.tsx`'s `handleRequest`, `handleBotRequest`, and `handleBrowserRequest`
each gain a 5th `routerContext: RouterContextProvider` parameter, and both `handleBotRequest`/
`handleBrowserRequest` wrap their `<ServerRouter>` call in `<I18nextProvider i18n={getInstance(routerContext)}>`.
No other behavior changes (bot-vs-browser streaming choice, response headers, `initServer()` bootstrap are
all untouched).

### Decision 8 (added during implementation): the Section 9 E2E fixture (route, locale files, spec) is kept permanently, not deleted after proving the pipeline once

`tasks.md` Task 9.5 originally called for deleting `app/routes/$lang+/_public+/e2e-i18n-fixture.tsx`,
`locales/en|fr/__e2e_fixture__.json`, and `tests/e2e/i18n/ssr-locale-resolution.spec.ts` once the pipeline
was proven to work. User-approved deviation: these are kept indefinitely instead. Rationale — this SSR
pipeline is genuinely novel infrastructure with zero other test coverage, and two real bugs (the
`NO_I18NEXT_INSTANCE` gap corrected in Decision 7, and a Windows `pathToFileURL` bug in the missing-key
script) were caught only by actually executing these exact tests. Deleting them would leave this
easy-to-silently-regress code permanently unguarded until some future domain retrofit happens to cover it.
**Removal trigger (explicit, not left to "revisit later"):** once Notices' own retrofit onto this stack lands
with its own E2E test exercising the same SSR → middleware → hydration pipeline, this fixture trio
(`e2e-i18n-fixture.tsx`, `locales/en|fr/__e2e_fixture__.json`, `ssr-locale-resolution.spec.ts`) becomes
redundant and should be removed as part of that retrofit's own PR — not before, and not automatically assumed
once Notices work merely begins.

## Risks / Trade-offs

- **[Risk]** A custom `entry.client.tsx` takes over full control of hydration from React Router's default →
  **Mitigation:** keep it a minimal wrapper (i18next init + `I18nextProvider` + unchanged `hydrateRoot`/
  `HydratedRouter` call); the E2E test in this change specifically asserts hydration still succeeds (no
  console errors, interactive elements work) on a plain route, not just SSR HTML.
- **[Risk]** `remix-i18next@7.5.0` is on an older major relative to `latest` (8.x) → **Mitigation:** documented
  exact-pin with the reason inline in `package.json`'s comment-adjacent PR description; revisit when this repo
  migrates to React Router v8.
- **[Risk]** Two extraction pipelines (`i18n:extractor` and `i18n:extract:new`) could drift in supported
  locale lists → **Mitigation:** both read from the same `VALID_LANGUAGES` source in
  `app/utils/lang.backend.ts` rather than each hardcoding their own list.
- **[Risk]** Step 2 of the resolution chain is a permanently-null hook point until the `user.preferredLocale`
  column exists — a future reader might assume it's live → **Mitigation:** explicit code comment citing this
  design doc and ADR-001 directly at the hook point (Decision 3). Step 3 is a real, working lookup (not a hook
  point) as of this change, so this risk applies only to step 2.
- **[Trade-off]** No cookie-based locale override in this change (Decision 2) — acceptable because ADR-001's
  chain doesn't call for one; a future ADR update would be needed before adding one.
- **[Risk, found post-implementation, not fixed in this change]** Client-side (SPA) navigation does not
  update the client i18next instance. Verified live: hydrating on `/en/e2e-i18n-fixture` then client-navigating
  to `/fr/e2e-i18n-fixture` (no full page reload) left the rendered text as the stale English string, with no
  console error. `entry.client.tsx` initializes the client instance once, at hydration, from whatever bundle
  the server sent for that first request — nothing pushes new resources into it afterward, whether for a
  language switch or a client-side transition into a route needing a namespace outside the initial bundle.
  Out of scope here (this change adds the pipeline, not a navigable multi-page consumer to shape the fix
  against) → **Required follow-up**: solved as part of the first domain retrofit (Notices) that has real
  client-side navigation between translated pages. Likely shape: piggyback the resource bundle on the
  loaderData React Router already re-fetches on every client-side navigation, and call
  `i18n.addResourceBundle(lng, ns, data)` from a shared effect when it changes — avoids a second,
  ADR-001-violating HTTP round-trip just for i18n.

## Migration Plan

No data migration. Rollout is additive-only:

1. Merge with `yarn.lock` updated for the 5 new/changed dependencies.
2. No existing route or component changes — zero behavioral change for current users until a domain
   actually adopts `t('key')` + a namespace file.
3. Rollback: revert the merge commit; no DB state to unwind.

## Open Questions

- Should the missing-key CI check also post a PR comment summary (vs. just workflow logs)? Left to
  implementer/reviewer judgment during `tasks.md` execution — not a blocking decision for this proposal.
- Exact namespace list (`ns: []` in Decision 2) is intentionally empty until the Notices retrofit defines its
  first namespace — confirmed not to break `createI18nextMiddleware` (empty array is a valid `InitOptions.ns`).
