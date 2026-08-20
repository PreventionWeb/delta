## Why

PrimeReact — DELTA's current component library — has had its GitHub repo archived and its
usage/licensing policy has changed, making it unsuitable to keep building on long-term. The team
has decided to migrate to React Aria Components + Tailwind (Tailwind v4 is already a project
dependency; `react-aria-components` is not yet installed). Before committing the real Hazardous
Event Clean Architecture domain migration to this new stack, we need a disposable proof-of-concept
that proves React Aria + Tailwind can reproduce a real, complex, production DELTA page — both a
data-heavy list view and a large multi-section form — without a production commitment. This POC's
outcome (success or "abandon this approach") is also required input to unblock
`_docs/refactoring-plan/design-system-unification-roadmap.md`, which today assumes PrimeReact
stays and needs to be reworked around whatever this POC concludes.

## What Changes

- Add `react-aria-components` as a new dependency (Tailwind v4 already present).
- Build two new, isolated, unlinked routes that are NOT the production Hazardous Event routes:
  - A React Aria + Tailwind rebuild of the Hazardous Event **list** page, styled to be visually
    indistinguishable from today's list page. Note: the production list page (`hazardeventlist.tsx`)
    is already almost entirely custom `dts-*` CSS classes, not PrimeReact — the only PrimeReact
    import in its render tree is a single `Tooltip` on the approval-status dot. The list page is
    therefore primarily a Tailwind-vs-legacy-CSS parity test, not a PrimeReact-removal test; most
    of this POC's PrimeReact-replacement evidence comes from the create page instead (see
    design.md for the full per-component PrimeReact inventory).
  - A React Aria + Tailwind rebuild of the Hazardous Event **create** page, restructured into a
    multi-step stepper (minimum 3 steps, business-requested), with component styling (buttons,
    inputs, colors, spacing) matching today's look — the stepper _flow_ itself is an intentional
    structural change, not something required to match today's single-page form layout.
- No production route, nav, or `app/domains/*` Clean Architecture work — this is a
  presentation-layer-only, throwaway spike. The existing production Hazardous Event pages are not
  touched or modified in any way.
- Explicitly disposable: if React Aria proves too difficult to match current styling, or too
  disruptive to the existing form/list patterns, "abandon this approach" is an acceptable and
  expected outcome. This change is not expected to be merged into the production Hazardous Event
  domain migration — it exists to produce a recommendation.

## Capabilities

### New Capabilities

- `poc-react-aria-hazardous-event-list`: an isolated, unlinked route that renders the Hazardous
  Event list using React Aria Components + Tailwind, visually matching the current PrimeReact list
  page.
- `poc-react-aria-hazardous-event-create`: an isolated, unlinked route that renders the Hazardous
  Event create form using React Aria Components + Tailwind as a multi-step (3+) stepper, with
  component styling matching the current form.

### Modified Capabilities

(none — no existing spec-level behavior changes; production Hazardous Event routes and their
specs, if any, are untouched)

## Impact

- **New dependency**: `react-aria-components` added to `package.json`. No other dependency
  changes; Tailwind v4 is already installed and configured (`app/styles/all.css`).
- **New files only**, under new route directories (see design.md for exact paths) plus any new
  presentation-only components/CSS needed to support them, plus new static fixture JSON/TS files
  (list rows, hazard classification options, validator list, division geojson — see design.md
  Decision 8) co-located under the POC route tree. No existing file under
  `app/routes/$lang+/_public+/hazardous-event+/`, `app/routes/$lang+/_authenticated+/hazardous-event+/`,
  or `app/routes/$lang+/hazardous-event+/` is modified. This also explicitly includes two shared,
  multi-domain components verified to be used by disaster-event and disaster-record forms as well as
  Hazardous Event: `app/frontend/components/approval-workflow/SaveSubmitDialog.tsx` (rebuilt as a
  new POC-local file instead) and `app/components/ContentRepeater/index.tsx` (reused unchanged,
  not rebuilt) — see design.md Decision 3.
- **No DB migration required.** No Drizzle schema changes. No new tables, no new columns.
- **No live DB reads or writes occur anywhere in the POC's page rendering or submit flow.** The
  one exception is auth/session verification (`requireUser`, `getCountryAccountsIdFromSession`,
  `hasPermission`), which is unchanged and does hit the DB/session store exactly as production
  does — see design.md Decision 2. Everything the pages _display_ (list rows, hazard
  classification options, validator list, division geojson) is static, hand-authored JSON fixture
  data shaped like the real responses, not a live query result. The create page's submit action
  is also fully mocked: no real row is written via `hazardousEventCreate`, and no approval-workflow
  side effect fires — see design.md Decision 6 (updated) and Decision 8 (new).
- **No changes to nav/menu components** (e.g. `app/components/RegularMenuBar.tsx`) — the POC
  routes are intentionally unreachable except by direct URL, per the isolation requirement.
- **Auth/multi-tenancy**: the POC reuses the same `_public+` / `_authenticated+` pathless layout
  groups as the production pages, so the list route stays public and the create route stays
  authenticated — no new auth surface, no weakening of the existing boundary. Note: the production
  create loader (`new.tsx`) does NOT use `authLoaderWithPerm` — it uses a bare loader that manually
  calls `requireUser` → `getCountryAccountsIdFromSession` → `hasPermission(request, "EditData")`,
  because React Router v7 runs all matched loaders (including the `_authenticated+` parent
  layout's) in parallel, so the parent's `requireUser` cannot be relied on to run first. The action
  uses `authActionWithPerm`. The POC must replicate this exact pattern (see design.md) rather than
  assume `authLoaderWithPerm` on the loader — a naive substitution would diverge from the verified
  production auth behavior. Flagged as security-relevant only in the sense that the create route
  must not accidentally end up under `_public+`. This auth sequence is unaffected by the
  data-mocking decision below: `authActionWithPerm` still runs its real permission check before the
  action body executes; only what the action body does _after_ auth passes (assemble-and-simulate
  instead of `hazardousEventCreate`) is mocked — see design.md Decision 6.
- **Test approach**: none required for this spike (see design.md — this is a disposable UI
  evaluation, not production code). Manual visual comparison against the live production pages is
  the acceptance method. No PGlite/real-DB/E2E test suite additions.
- **Downstream**: findings feed into `_docs/refactoring-plan/design-system-unification-roadmap.md`
  (to be updated in a follow-up, out of scope here) and into the future real Hazardous Event Clean
  Architecture migration's technology decision.
