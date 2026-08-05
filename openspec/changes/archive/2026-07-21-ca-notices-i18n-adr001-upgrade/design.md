## Context

Notices' presentation layer (`NoticeListPage.tsx`, `NoticeDetailPage.tsx`,
`NoticeErrorBoundary.tsx`, and the two `notices+` route files) uses
`useViewContext().t({code, msg})` against flat `locales/app/<lang>.json` files today — verified
directly by reading all five files (10 `ctx.t()` calls total across the two page components, one
each in the route files for `MainContainer`'s title, zero in the error boundary). The
prerequisite `react-i18next`/`remix-i18next` SSR pipeline (`app/middleware/i18next.server.ts`,
`app/entry.server.tsx`, `app/entry.client.tsx`) is already merged to `dev`
(`openspec/changes/archive/2026-07-15-ca-i18n-adr001-infra/`) and this branch has been rebased
onto it. That change's own design.md explicitly named Notices as the intended first real
consumer and left two things as documented, unresolved risks for this upgrade to settle:
(1) whether client-side navigation between translated routes actually breaks for a domain whose
routes share one namespace, and (2) an explicit "Removal trigger" for its own E2E fixture scaffold
once a real domain upgrade lands.

**`useViewContext().lang` is not being removed.** Both page components still need a locale key
(`"en"`, `"fr"`, …) to resolve `titleJson`/`bodyJson` `LocaleMap` fields — that resolution logic
(Decision 7 of the original route-adapter design) is untouched by this proposal. Components will
call both `useViewContext()` (for `.lang`) and `useTranslation("notices")` (for `t()`) side by
side; this dual-system-per-component state is expected and matches ADR-001's stated coexistence
model, not a leftover to clean up.

**Confirmed via direct source inspection (not assumed): why the two integration route tests'
current `context: {}` cast will break.** `getInstance` is one of three values returned by
`createI18nextMiddleware()` in `node_modules/remix-i18next/src/index.ts`:

```ts
let i18nextContext = createContext<i18n>();
// ...
args.context.set(i18nextContext, instance); // only the middleware itself does this
// ...
return [
	i18nextMiddleware,
	(ctx) => ctx.get(localeContext),
	(ctx) => ctx.get(i18nextContext),
];
```

`i18nextContext` is a **module-private** React Router context object, created once when
`app/middleware/i18next.server.ts` is first imported and closed over by that specific
`getInstance` export — there is no public API to `.set()` it from outside that middleware
function. React Router's `RouterContextProvider.get()` throws `"No value found for context"`
(confirmed in `node_modules/react-router/dist/development/index-react-server.js`) when the key
was never `.set()`. Today, `NoticesIndexRoute.test.ts` and `NoticeDetailRoute.test.ts` pass
`context: {}` cast via `as unknown as Parameters<typeof loader>[0]` — this works only because the
current loaders never touch `context` at all. The moment a loader calls
`getInstance(context).loadNamespaces("notices")`, `context.get` isn't even a function on a bare
`{}`, and even the more realistic `new RouterContextProvider()` (the pattern
`tests/integration/routes/layout-auth.test.ts` already uses for a _different_ problem —
satisfying `_authenticated.tsx`'s loader signature, which never reads from context either) would
still throw, because nothing has called `.set(i18nextContext, ...)` on it.

## Goals / Non-Goals

**Goals:**

- Every `ctx.t()` call in the five listed Notices presentation files is replaced with
  `react-i18next`'s `t("key")`, using i18next's default nested-JSON key structure.
- `NoticeErrorBoundary.tsx` gains real, correct i18n keys for its two currently-hardcoded
  strings — closing a pre-existing untranslated gap, not just converting an existing call.
  Non-Response error messages continue to be a fixed, generic string per ADR-003 Rule 4 (never
  interpolating `error.message`), just sourced from a translation key instead of a literal.
- A new, permanent `common` namespace (`locales/<lang>/common.json`) is established, seeded only
  with the `view` key Notices' own action button needs.
- Both notices loaders call `getInstance(context).loadNamespaces("notices")` (and `"common"`,
  since the shared Actions-column View button needs it too) before their components render,
  so SSR never renders a raw key.
- The two integration route tests are updated with a context construction that actually
  satisfies `getInstance(context)`, and the three unit tests switch to a real `I18nextProvider`.
- The client-side-navigation question (list ↔ detail) is answered empirically via a new
  Playwright test, not left as an assumption either way.
- The infra change's now-redundant `e2e-i18n-fixture` scaffold (route, locale fixture files,
  Playwright spec, and the `ignoreNamespaces` config/test wiring that protected it) is deleted,
  per user sign-off and the infra design's own removal trigger — see Decision 6.

**Non-Goals:**

- No change to `app/middleware/i18next.server.ts`, `app/entry.server.tsx`,
  `app/entry.client.tsx`, or any other already-merged infra file — **except** the one signed-off
  exception in Decision 6 (the `e2e-i18n-fixture` scaffold deletion).
- No change to any other domain's translation calls, or to any other `common.view` consumer
  (`ActionLinks.tsx`, `View.tsx`, `action_links.tsx`, `view_form.tsx`,
  `view_main_data_collection.tsx`, or the two settings routes) — confirmed via repo-wide grep,
  five other consumers exist and stay on the old system.
- No removal of `useViewContext()` from Notices components — only its `.t()` usage is retired,
  `.lang` stays.
- No change to the shape of `common.json` beyond the single `view` key seeded by this proposal
  (see Decision 2) — pre-populating keys for future domains is explicitly out of scope.

## Decisions

### Decision 1 — Key structure: nested JSON, i18next's own default `keySeparator: "."`

**Choice**: `locales/en/notices.json` uses nested objects, e.g.:

```json
{
	"list": {
		"empty": "No notices found.",
		"columns": {
			"title": "Title",
			"status": "Status",
			"published_at": "Published",
			"updated_at": "Last updated",
			"actions": "Actions"
		}
	},
	"status": { "published": "Published", "draft": "Draft" },
	"title": "Notices"
}
```

`locales/en/common.json`:

```json
{
	"view": "View",
	"error": {
		"generic": "An unexpected error occurred.",
		"generic_retry": "An unexpected error occurred. Please try again later."
	}
}
```

(See Decision 2's amendment — the error keys started in `notices.json` and moved to `common.json`
after implementation, once it was confirmed neither string is actually Notices-specific.)

**Rationale**: user-settled decision — use i18next's actual library defaults rather than invent
a bespoke flat-vs-nested convention. No `i18next.init({ keySeparator: ... })` override exists in
`app/middleware/i18next.server.ts` today (confirmed by reading the file), so the default `"."`
applies; components call `t("list.columns.title")`, `t("status.published")`, etc.

**Alternative considered**: flat keys matching the old system's dotted-string-as-single-key
convention (`t("notices.status_published")`). Rejected per explicit user direction — this would
require a custom `keySeparator: false` config change to the shared middleware, which is exactly
the kind of infra-file edit this change must not make, and contradicts "just use what the
library already defaults to."

### Decision 2 — `common.json` is a permanent namespace, seeded narrowly

**Choice**: create `locales/en|fr/common.json` with exactly one key (`view`) for this change.
Do not attempt to pre-populate it with keys for future domains' anticipated needs.

**Rationale**: ADR-001's own File Structure section (`_docs/decisions/ADR-001-multilingual-strategy.md`
lines 40-54) already shows `common.json` as a first-class sibling to domain files
(`locales/en/{common,notices,hazardous-event}.json`) — this is not a migration-only artifact,
it's the ADR's designed shape. Confirmed via repo-wide grep that `common.view` has exactly 6
call sites total; only `NoticeListPage.tsx`'s is in scope, the other 5
(`ActionLinks.tsx:58`, `View.tsx:201,213` — two different keys, `view_this_event`/
`view_all_events`, not `view` itself — `action_links.tsx:42`, `view_form.tsx:98`,
`view_main_data_collection.tsx:162,174`, `assets+/_layout.tsx:110`,
`geography+/_index.tsx:260`) stay on the old system. Seeding only `view` (not a speculative
`view_this_event`/`view_all_events` migration) keeps this change's blast radius exactly matching
its stated scope.

**Alternative considered**: a Notices-specific namespace-local "view" key instead of a shared
`common` namespace. Rejected — user-settled decision, and duplicating a cross-cutting UI label
per domain namespace is exactly the kind of drift the ADR's shared-namespace convention exists
to prevent.

**Amendment (post-implementation)**: `NoticeErrorBoundary.tsx`'s two error strings
(`error.generic`, `error.generic_retry`) were originally placed in `notices.json` (see Decision 1's
original example). Reviewed and moved to `common.json` instead — both are generic fallback copy,
used identically regardless of domain, not Notices-specific in any way; every future domain's
ErrorBoundary needs the exact same two strings. `notices.json` no longer has an `error` key at all,
since there is currently no actual domain-specific error message reachable through Notices' client
code (the "notice not found" text a user sees comes from the server-side `DomainError.message`,
via `throwNoticeLoaderError.server.ts` — a separate mechanism, not a client `t()` call). Considered
adding an illustrative, intentionally-unused `notices.json` error key (e.g. `"Unable to find the
selected Notice."`) purely to demonstrate the common-vs-domain-specific convention for future
domains — rejected, since it would be dead content with no real call site; documented the
convention in prose in `locales/README.md` instead.

### Decision 3 — Both loaders call `loadNamespaces(["notices", "common"])`, not just `"notices"`

**Choice**: `await getInstance(context).loadNamespaces(["notices", "common"]);` in both
`_index.tsx` and `$id.tsx` loaders — even though only the list route's Actions column uses the
`common:view` key, not the detail route.

**Rationale**: `NoticeErrorBoundary` is shared between both routes and is rendered by whichever
route's loader threw — if only the list loader loaded `"common"`, a thrown error on the detail
route before `"common"` is loaded would leave a dangling missing-namespace risk if the boundary
or a future change ever needs it. Loading both namespaces on both routes is a two-namespace,
already-on-disk read (fs-backend, no network cost) and removes any accidental
which-route-loaded-what coupling between the two thin route files, which the original
route-adapter design (Decision 5) already treats as independent, symmetrical loaders.

**Alternative considered**: only the list loader loads `"common"`. Rejected as a needless,
easy-to-regress asymmetry between two otherwise-parallel route files for a negligible cost
saving (one small JSON file read).

### Decision 4 — Integration route tests prime the real, module-private i18next context by invoking the actual `i18nextMiddleware`, not a hand-built stand-in

**Choice**: each of `NoticesIndexRoute.test.ts` / `NoticeDetailRoute.test.ts` adds a local helper
that constructs a `new RouterContextProvider()`, then calls the real, imported
`i18nextMiddleware` from `~/middleware/i18next.server` against it (with a throwaway `next`
callback) before invoking the loader:

```ts
import { RouterContextProvider } from "react-router";
import { i18nextMiddleware } from "~/middleware/i18next.server";

async function makeI18nContext(url: string): Promise<RouterContextProvider> {
	const context = new RouterContextProvider();
	await i18nextMiddleware(
		{ request: new Request(url), params: {}, context } as Parameters<
			typeof i18nextMiddleware
		>[0],
		async () => new Response(),
	);
	return context;
}
```

`makeArgs` then uses this primed context instead of `{}`.

**Rationale**: as established in Context above, `i18nextContext` (the React Router context key
`getInstance` reads) is private to `remix-i18next`'s module scope — the _only_ code path that
ever calls `.set()` on it is the middleware function itself. There is no lighter-weight way to
satisfy `getInstance(context)` without either running the real middleware or reimplementing
`createI18nextMiddleware`'s internals in the test (which would silently drift from the real
implementation). Running the real middleware does mean the test's `findLocale` (real
implementation, calling `getCountrySettingsFromSession(request)`) executes for real — confirmed
safe: `getCountrySettingsFromSession` (`app/utils/session.ts:302`) reads the request's `Cookie`
header via `sessionCookie().getSession(...)`, and these test requests carry no cookie, so it
resolves `undefined` and `findLocale` fails open to step 4 (`"en"`) exactly as designed — no new
DB or network call is introduced.

**Alternative considered**: mock `~/middleware/i18next.server`'s `getInstance` export entirely
(`vi.mock`) to return a stub `{ loadNamespaces: vi.fn() }`. Rejected — this is lighter, but the
route files' own `import { getInstance } from "~/middleware/i18next.server"` would need to exist
for the mock to intercept it; more importantly it would test nothing about whether the loader's
actual `context` argument is shaped correctly for the real middleware chain that runs in
production (`root.tsx`'s registered `i18nextMiddleware` populates the exact same context object
passed through React Router's real middleware chain) — the PGlite tier's whole point (per the
original route-adapter design's Test Infrastructure section) is exercising the loader as close
to its real call shape as practical without a full HTTP server. A pure mock would pass even if
the loader's `context` usage were subtly wrong in a way only the real middleware's context-key
plumbing would catch.

### Decision 5 — Unit tests wrap components in a real `I18nextProvider` with synchronously-initialized inline resources, not a mocked `useTranslation`

**Choice**: each of the three unit test files creates a dedicated i18next instance per test file:

```ts
import i18n from "i18next";
import { initReactI18next, I18nextProvider } from "react-i18next";

const testI18n = i18n.createInstance();
await testI18n.use(initReactI18next).init({
	lng: "en",
	fallbackLng: "en",
	ns: ["notices", "common"],
	defaultNS: "notices",
	resources: {
		en: {
			notices: {
				/* mirrors locales/en/notices.json */
			},
			common: { view: "View" },
		},
	},
});
```

then renders `<I18nextProvider i18n={testI18n}><NoticeListPage data={...} /></I18nextProvider>`
via the existing `renderToString` pattern (no `@testing-library/react` is installed in this
repo — confirmed via `package.json` — so `renderToString` stays the rendering mechanism, matching
every existing test in this directory).

**Rationale**: ADR-001's own Consequences section states "New domain components are testable
without a full router context (react-i18next provides a test provider)" — `I18nextProvider` with
a directly-`init()`ed instance (resources passed inline, no backend plugin) is exactly that
documented test provider, and resolves synchronously enough to `await` once before
`renderToString` with no network or filesystem dependency. This replaces the old
`vi.stubGlobal("createTranslationGetter", ...)` pattern one-for-one. `useRouteLoaderData` and
`react-router`'s mock for `.lang`/`.user` (via `useViewContext()`) stays untouched in these
files — only the translation half of each test's setup changes.

**Alternative considered**: mock `react-i18next`'s `useTranslation` hook directly (
`vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k) => k }) }))`), returning the
raw key. Rejected — this doesn't exercise real key resolution (a typo'd key or a mismatched
`common:view`-style namespaced key reference would still "pass"), and produces less readable
assertions than the resolved English string tests already assert against
(e.g. `expect(html).toContain("Published")`).

### Decision 6 (sign-off obtained — deletion now in scope) — the infra change's `e2e-i18n-fixture` removal trigger

The already-merged `2026-07-15-ca-i18n-adr001-infra` design.md states, verbatim: "once Notices'
own retrofit onto this stack lands with its own E2E test exercising the same SSR → middleware →
hydration pipeline, this fixture trio (`e2e-i18n-fixture.tsx`, `locales/en|fr/__e2e_fixture__.json`,
`ssr-locale-resolution.spec.ts`) becomes redundant and should be removed as part of that
retrofit's own PR." This change does add exactly that coverage (Decision 7 below, a real
namespace loaded through the real middleware, asserted via Playwright). Per that already-merged
design's own words, removal is now in scope for _some_ PR.

When this proposal was first drafted, that deletion was deliberately **not** included in the
default task list, because:

- it touches files this proposal's own stated scope says not to touch
  ("do not modify … any other already-merged i18n infrastructure file"), and
- `i18n-namespace-file-structure`'s existing spec (`openspec/specs/i18n-namespace-file-structure/spec.md`)
  has a scenario carving out `locales/en|fr/__e2e_fixture__.json` as a permanent exception —
  removing it is a requirement-level change to that spec, not a side effect of this one.

That reasoning is preserved above as the historical record of why the deletion wasn't
auto-applied without asking. **Outcome: the user has since explicitly signed off on including
this deletion in this change's scope**, before implementation starts. The deletion is therefore
now a required part of this change, not an optional, separately-reviewable task — see `tasks.md`
Section 7, and the corresponding spec-delta update in
`specs/i18n-namespace-file-structure/spec.md` (which now removes the permanent-exception scenario
rather than merely flagging it as undecided). The prerequisite ordering still holds: the deletion
must not happen until this change's own Decision 7 E2E coverage (client-side navigation test) is
written and passing, so there is never a window with zero SSR-pipeline E2E coverage.

### Decision 7 — Client-side navigation is verified via Playwright, with an explicit escalation path if the known limitation reproduces

**Choice**: add test cases to `tests/e2e/notices/notices.spec.ts` that (a) log in, (b) load
`/en/notices` as a full page load, (c) click the row action link to client-side-navigate to
`/en/notices/:id` (no full reload), and assert the detail page's translated status label
("Published"/"Draft") renders correctly — then (d) navigate back to the list via a client-side
back-link and assert the list's translated column headers still render correctly. Both
directions are tested since the resource-bundle staleness risk (per the infra design's
documented finding) is about which page loaded _first_, not just one direction.

**Rationale**: the infra change's design.md documents a _confirmed_ bug for **cross-locale**
client-side navigation (`/en/e2e-i18n-fixture` → `/fr/e2e-i18n-fixture`, stale English text after
navigating to French). Notices' list and detail routes never change the URL's `$lang` segment
between each other and — critically — share the exact same `"notices"`/`"common"` namespaces, so
the client i18next instance populated at whichever page loaded first already contains every key
either page needs. This reasoning suggests the bug likely does not manifest here, but the infra
design explicitly frames this as unverified for a same-namespace, same-locale case, and the
user's brief requires empirical proof, not reasoning alone. If the Playwright test fails (stale
or missing translated text after client-side navigation), that is a real finding requiring a
call to the user before this proposal's tasks can be marked complete — not a silent workaround
applied by the implementer.

## Risks / Trade-offs

- **[Risk]** `NoticeErrorBoundary`'s non-Response fallback branch must keep never interpolating
  `error.message`/`.stack` (ADR-003 Rule 4) even after gaining a translation key — a careless
  refactor could introduce an interpolated `t("error.generic", { detail: error.message })`.
  → **Mitigation**: `tasks.md`'s test-first task asserts the rendered fallback text is the fixed
  translated string and separately asserts the original secret-leak guard (`NoticeErrorBoundary.test.tsx`'s
  existing "does not crash and still shows error.message" / "never leaks .message/.stack" cases)
  still passes unmodified.
- **[Risk]** Both loaders now do more per-request work (two `loadNamespaces` calls each) →
  **Mitigation**: fs-backend reads are local-disk, not network; namespace files are tiny
  (well under the ADR's own ~500-key split threshold), and i18next caches a loaded namespace
  for the lifetime of that request's instance (created fresh per request per Decision 2 of the
  infra design) — no cross-request caching risk, no meaningfully measurable latency added.
- **[Risk, already known, being resolved not avoided]** Client-side navigation between
  differently-loaded namespaces is a documented open risk in the infra design. This proposal
  does not avoid testing it by scoping around it — Decision 7 tests it directly for the one
  case Notices actually exercises (same namespace, same locale). It explicitly does **not**
  claim to fix the general cross-locale case — that remains the infra design's own open
  follow-up, out of scope here.
- **[Trade-off]** `common.json` starts with exactly one key. A second domain's future upgrade
  adding its own shared string will need to decide whether it belongs in `common` or a new
  domain namespace — this proposal does not attempt to anticipate that, consistent with the
  ADR's own "only split when a real boundary problem appears" guidance.

## Migration Plan

No data migration. Rollout is additive to Notices' own files only:

1. Locale files (`notices.json`, `common.json` for `en`/`fr`) are added; the old
   `locales/app/en.json` entries for `notices.*`/`common.view` remain untouched (dead code for
   Notices specifically, still live for the other 5 `common.view` consumers) — no deletion in
   this change.
2. Route/component changes are backward-compatible in observable output: every rendered English
   string is byte-identical to today's fallback text (verified per-key against the current
   `msg:` fallback literals in the five source files) — a user should see no visible difference
   in English; `fr` gains real translations where the migrated files provide them.
3. Rollback: revert the change's commits; the old `ctx.t()` call sites and their `msg:` fallbacks
   are restored, no DB or infra state to unwind.

## Open Questions

- Whether to also action Decision 6's fixture-removal trigger in this same PR is left to the
  human reviewer — flagged, not resolved, in this proposal.
- If Decision 7's E2E test reveals the client-navigation limitation _does_ reproduce even for a
  same-namespace, same-locale case, the fix approach (e.g. an effect that calls
  `i18n.addResourceBundle` when loader data changes, per the infra design's own suggested shape)
  is not designed here — resolving that is contingent on the test's actual result and requires a
  follow-up conversation with the user, not a default implementation choice by the implementer.
